---
name: tb-qemu-startup
description: Start an Alpine Linux ISO in QEMU with a serial console accessible via telnet on `127.0.0.1:6665`, showing the login prompt. Use this skill whenever the task involves booting a VM in QEMU with a telnet-accessible serial console, configuring QEMU's `-serial telnet` or `-serial tcp` options, running VMs in the background, or verifying system readiness by blocking until the login prompt appears. Also trigger when the user references `/app/alpine.iso`, telnet on port 6665, or QEMU serial console access.
---

# tb-qemu-startup

Boot the `/app/alpine.iso` image in QEMU so that `telnet 127.0.0.1 6665` shows
the Alpine login prompt. This is one of the Terminal-Bench 2.1 task skills; the
full task lives at `tasks/qemu-startup/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `qemu-startup` Docker container and needs
to start a QEMU VM with telnet-accessible serial console on port 6665. Do **not**
use it for QEMU VMs with SSH, graphical display, or non-Alpine guest OSes — this
is specifically about telnet-based serial console access to the login prompt.

## Goal (one sentence)

Launch Alpine Linux in QEMU with the serial console exposed on
`telnet 127.0.0.1 6665` and block until the login prompt is ready.

## Required outputs

| Artifact | Purpose |
|---|---|
| QEMU process running in background | VM must be alive and serving a serial console on port 6665. |
| Telnet-accessible login prompt | `telnet 127.0.0.1 6665` must display the Alpine login banner. |

The verifier runs `telnet 127.0.0.1 6665` and checks for the login prompt.

## Recommended workflow

### 1. Verify QEMU and ISO (≈ 1 min)

```bash
which qemu-system-x86_64
ls -la /app/alpine.iso
```

If QEMU is missing:
```bash
apt-get update && apt-get install -y qemu-system-x86
```

### 2. Launch QEMU with telnet serial console (≈ 3 min)

The key is the `-serial` option:

```bash
qemu-system-x86_64 \
    -cdrom /app/alpine.iso \
    -m 512 \
    -nographic \
    -serial telnet:127.0.0.1:6665,server,nowait &
```

Important flags:
- `-nographic`: no graphical window; redirects the default serial to stdio.
  When combined with `-serial telnet:...`, the primary serial goes to telnet.
- `-serial telnet:127.0.0.1:6665,server,nowait`: listen for telnet connections
  on port 6665. `server` means QEMU is the server (waits for client). `nowait`
  means QEMU starts without waiting for a client to connect.
- `-m 512`: allocate 512 MB RAM for Alpine (sufficient).
- `&`: run in background.

If `-nographic` and `-serial telnet` conflict or don't produce output on the
telnet port, try this alternative using the `-monitor` and `-serial` split:

```bash
qemu-system-x86_64 \
    -cdrom /app/alpine.iso \
    -m 512 \
    -display none \
    -serial telnet:127.0.0.1:6665,server,nowait \
    -monitor none \
    -daemonize
```

The `-daemonize` flag backgrounds QEMU (no `&` needed). `-display none` avoids
any GUI dependency.

### 3. Wait for the VM to boot (≈ 10-30 sec)

Poll the telnet port until it accepts connections:

```bash
# Wait for port 6665 to be open
for i in $(seq 1 30); do
    if echo "" | timeout 2 telnet 127.0.0.1 6665 2>/dev/null | grep -qi "login"; then
        echo "VM is ready"
        break
    fi
    sleep 1
done
```

Or simply test manually:

```bash
echo "" | timeout 5 telnet 127.0.0.1 6665
```

You should see the Alpine Linux boot messages followed by the login prompt:
```
Welcome to Alpine Linux 3.x
Kernel ...
localhost login:
```

### 4. Verify from the host (≈ 1 min)

```bash
telnet 127.0.0.1 6665
# Should show the login prompt
```

## Verifier checklist (must all pass)

- [ ] QEMU process is running in the background.
- [ ] Port 6665 on localhost accepts TCP connections.
- [ ] `telnet 127.0.0.1 6665` displays the Alpine Linux login prompt.
- [ ] The VM stays running (not a one-shot that exits after boot).

## Common pitfalls

1. **`-serial` vs `-monitor` confusion.** By default, QEMU multiplexes the
   monitor and serial on stdio. When you redirect serial to telnet, make sure
   the monitor is explicitly directed elsewhere (`-monitor none` or
   `-monitor telnet:...`) or the serial output may not reach the telnet port.
2. **`server` flag missing.** Without `server` in the telnet option, QEMU
   tries to connect as a client rather than listen as a server. The correct
   form is `telnet:127.0.0.1:6665,server,nowait`.
3. **Port already in use.** If port 6665 is bound by another process (including
   a previous QEMU instance that didn't die cleanly), QEMU will fail to bind.
   Run `pkill qemu-system-x86_64` and `ss -tlnp | grep 6665` before starting.
4. **VM takes longer than expected to show login prompt.** Alpine on QEMU
   with limited RAM may take 20-30 seconds to boot. If you check too early,
   you'll see nothing. Give it at least 30 seconds and if no output, check
   that the ISO is valid with `file /app/alpine.iso`.
5. **Backgrounding issues.** If you use `&` and the terminal closes, QEMU may
   receive SIGHUP. Use `nohup` or `-daemonize` for persistent backgrounding.

## Reference pointers

- QEMU serial console options:
  https://www.qemu.org/docs/master/system/invocation.html
- The `-serial telnet` syntax is documented in the QEMU man page under
  "Character device options".
- The verifier script at `tests/test_outputs.py` in the task directory is the
  ground truth for what is scored.
