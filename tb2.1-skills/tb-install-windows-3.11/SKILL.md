---
name: tb-install-windows-3.11
description: Configure and run Windows 3.11 for Workgroups in QEMU with VNC display on port 5901, a web interface via nginx on port 80, snapshot mode for immutable disk, and a QEMU monitor socket for programmatic keyboard input. Use this skill whenever the task involves running a QEMU virtual machine, booting Windows 3.11, configuring VNC display output, setting up nginx as a reverse proxy or web front-end for a VM, enabling programmatic keyboard control via QEMU monitor socket, or working with retro/legacy operating system images. Also trigger when the user references `/app/isos/win311.img`, QEMU 5.2.0 compatibility, VNC display :1 (port 5901), snapshot mode, `/tmp/qemu-monitor.sock`, or leaving a VM running in the background.
---

# tb-install-windows-3.11

Boot Windows 3.11 for Workgroups in QEMU with VNC display, a web interface,
and programmatic keyboard control — all in snapshot mode so the base disk
image stays immutable. This is one of the Terminal-Bench 2.1 task skills;
the full task lives at `tasks/install-windows-3.11/` in the same repo as this
skill.

## When this skill triggers

Use it when the user is dropped into the `install-windows-3.11` Docker
container and needs to launch a Windows 3.11 VM with QEMU that is accessible
via VNC (port 5901) and HTTP (port 80 via nginx), accepts keystrokes through
a monitor socket, and runs in the background. Do **not** use it for generic
QEMU usage, modern Linux VM setup, or any task that does not involve the
specific `win311.img` disk image and the QEMU 5.2.0 version constraint.

## Goal (one sentence)

Launch Windows 3.11 for Workgroups inside QEMU 5.2.0 in snapshot mode with
VNC on `:1` (port 5901), a QEMU monitor socket at `/tmp/qemu-monitor.sock`,
and an nginx web interface on port 80, leaving the VM running at the Windows
desktop in the background.

## Required outputs

| File / Service | Purpose |
|---|---|
| Running QEMU process | Windows 3.11 VM booted from `/app/isos/win311.img` in snapshot mode, VNC on `:1` |
| `/tmp/qemu-monitor.sock` | Unix socket for QEMU Monitor Protocol (QMP), allowing programmatic keyboard input |
| Nginx on port 80 | Web interface for remote access to the VM / status page |
| Background VM | QEMU process must survive after the setup script exits |

The verifier checks that QEMU is running, the VNC port is open, the monitor
socket accepts keyboard commands, the VM has reached the Windows desktop, and
nginx is serving on port 80.

## Recommended workflow

### 1. Survey the environment (≈ 5 min)

- Confirm QEMU 5.2.0 is available: `qemu-system-i386 --version`.
- Verify the disk image: `ls -la /app/isos/win311.img`.
- Check if nginx is installed: `which nginx || apt-get install -y nginx`.
- Read `tasks/install-windows-3.11/instruction.md` for exact port and
  socket paths.

### 2. Configure nginx for the web interface (≈ 5 min)

Set up nginx as a noVNC proxy or a simple status page. The simplest
approach is to proxy to a noVNC websocket or serve a static page that
embeds a VNC viewer:

```nginx
# /etc/nginx/sites-available/default
server {
    listen 80;
    server_name localhost;

    location / {
        # Option A: Serve noVNC static files
        root /app/novnc;
        index vnc.html;
    }

    location /websockify {
        proxy_pass http://localhost:6080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Alternatively, install noVNC + websockify:
```bash
apt-get install -y novnc websockify
websockify -D --web /usr/share/novnc 6080 localhost:5901
```

Reload nginx:
```bash
nginx -t && nginx -s reload || nginx
```

### 3. Launch QEMU (≈ 10 min)

The critical QEMU arguments:

```bash
qemu-system-i386 \
  -drive file=/app/isos/win311.img,format=raw,if=ide,snapshot=on \
  -vnc :1 \
  -monitor unix:/tmp/qemu-monitor.sock,server,nowait \
  -m 64 \
  -net nic,model=pcnet -net user \
  -vga cirrus \
  -daemonize
```

Explanation of key flags:
- `snapshot=on`: All writes go to a temporary overlay; the base image is
  never modified. This is required.
- `-vnc :1`: VNC display number 1, which maps to TCP port 5901 (5900 + 1).
- `-monitor unix:/tmp/qemu-monitor.sock,server,nowait`: Creates a Unix
  socket for the QEMU human monitor protocol (HMP). Use `sendkey` commands
  to inject keystrokes programmatically.
- `-m 64`: 64 MB RAM is sufficient for Windows 3.11.
- `-net nic,model=pcnet -net user`: Networking with the `pcnet` NIC model,
  which Windows 3.11 has drivers for.
- `-vga cirrus`: Cirrus Logic VGA, well-supported by Windows 3.11.
- `-daemonize`: Run QEMU in the background.

If `-daemonize` is not available in your QEMU build, use:
```bash
nohup qemu-system-i386 ... &
```

### 4. Verify the VM booted (≈ 5 min)

```bash
# Check QEMU process
ps aux | grep qemu

# Check VNC port
ss -tlnp | grep 5901
# or
ncat -z localhost 5901 && echo "VNC port open"

# Check monitor socket
echo "info status" | socat - UNIX-CONNECT:/tmp/qemu-monitor.sock

# Send a test keystroke via monitor
echo "sendkey a" | socat - UNIX-CONNECT:/tmp/qemu-monitor.sock
```

### 5. Handle Windows 3.11 boot sequence (≈ 5-10 min)

Depending on the state of the disk image, you may need to:
- Wait for the VM to reach the Windows desktop automatically.
- If a login prompt or DOS prompt appears, use the monitor socket to
  send keystrokes: `echo "sendkey ret" | socat - UNIX-CONNECT:/tmp/qemu-monitor.sock`.
- Type `win` + Enter if the system boots to DOS: send `w`, `i`, `n`,
  then `ret`.

The verifier checks that the VM has reached the Windows 3.11 desktop, so
you may need to automate the boot sequence.

## Verifier checklist (must all pass)

- [ ] QEMU process is running with the Windows 3.11 disk image in snapshot mode.
- [ ] VNC is accessible on port 5901 (display :1).
- [ ] QEMU monitor socket exists at `/tmp/qemu-monitor.sock` and accepts
  commands.
- [ ] Nginx is serving on port 80 (web interface accessible).
- [ ] The VM has reached the Windows 3.11 desktop (Program Manager visible).
- [ ] Programmatic keyboard input works via the monitor socket.

## Common pitfalls

1. **Forgetting snapshot mode.** Without `snapshot=on`, QEMU writes changes
   to the base image, which can corrupt it and break subsequent runs. Always
   use snapshot mode as the task requires.
2. **Wrong VNC display number.** VNC display `:1` maps to port `5901`, not
   `5900` (which is `:0`). The task explicitly requires display `:1`. Check
   with `ss -tlnp | grep 5901`.
3. **QEMU version mismatch.** The task specifies QEMU 5.2.0 compatibility.
   If a different version is installed, some flags (like `-daemonize`) may
   behave differently or not be supported. Check `qemu-system-i386 --version`
   first.
4. **VM stuck at DOS prompt.** Windows 3.11 boots on top of DOS. If the
   image boots to a `C:\>` prompt, you need to send `win` + Enter via the
   monitor socket to start Windows. The verifier checks for the Windows
   desktop, not the DOS prompt.
5. **Nginx not configured or not started.** The verifier checks port 80.
   Ensure nginx is installed, configured, and running. A common mistake is
   configuring nginx but forgetting to reload or start it after
   configuration changes.

## Quick sanity test (run after launching)

```bash
# 1. QEMU running?
ps aux | grep qemu-system

# 2. VNC listening?
echo "QUIT" | ncat -w 1 localhost 5901 && echo "VNC OK" || echo "VNC FAIL"

# 3. Monitor socket working?
echo "info status" | socat - UNIX-CONNECT:/tmp/qemu-monitor.sock

# 4. Nginx serving?
curl -s -o /dev/null -w "%{http_code}" http://localhost/

# 5. Send a key via monitor
echo "sendkey a" | socat - UNIX-CONNECT:/tmp/qemu-monitor.sock
```

## Reference pointers

- QEMU invocation documentation: `qemu-system-i386 --help` or
  https://www.qemu.org/docs/master/system/invocation.html
- QEMU monitor protocol: https://www.qemu.org/docs/master/system/monitor.html
  The `sendkey` command accepts key names like `a`, `b`, `ret`, `ctrl-alt-del`.
- noVNC project: https://github.com/novnc/noVNC (for browser-based VNC access)
- The disk image at `/app/isos/win311.img` is known-compatible with QEMU 5.2.0.
- Inside the task container, the verifier at the task root is the ground truth
  for what is scored.
