---
name: tb-qemu-alpine-ssh
description: Start an Alpine Linux ISO in QEMU and configure an SSH server so that `ssh -p 2222 root@localhost` with password `password123` drops into a shell. Use this skill whenever the task involves booting a VM in QEMU, setting up SSH inside a guest OS, port forwarding with QEMU's `hostfwd`, configuring Alpine Linux networking, or setting a root password. Also trigger when the user references `/app/alpine.iso`, port 2222, or `root@localhost` SSH access.
---

# tb-qemu-alpine-ssh

Boot the `/app/alpine.iso` image in QEMU, configure networking, set the root
password, install and start an SSH server, and ensure host-forwarding so that
`ssh -p 2222 root@localhost` works from the host. This is one of the
Terminal-Bench 2.1 task skills; the full task lives at
`tasks/qemu-alpine-ssh/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `qemu-alpine-ssh` Docker container and
needs to boot an Alpine VM with SSH accessible from the host. Do **not** use it
for generic QEMU troubleshooting, other guest OSes, or tasks that do not involve
port 2222 SSH to an Alpine guest.

## Goal (one sentence)

Launch Alpine Linux in QEMU with host port forwarding on 2222, configure SSH
with root password `password123`, and leave the VM running in the background.

## Required outputs

| Artifact | Purpose |
|---|---|
| QEMU process running in background | VM must be alive and serving SSH on host port 2222. |
| SSH server inside the VM | OpenSSH (`sshd`) listening on port 22 inside the guest. |
| Root password set to `password123` | Enables `ssh -p 2222 root@localhost`. |

The verifier runs `ssh -p 2222 root@localhost` and expects a shell prompt.

## Recommended workflow

### 1. Verify QEMU and the ISO (≈ 1 min)

```bash
which qemu-system-x86_64
ls -la /app/alpine.iso
```

If QEMU is not installed:
```bash
apt-get update && apt-get install -y qemu-system-x86 qemu-utils
```

### 2. Boot the ISO with networking and port forwarding (≈ 3 min)

The critical QEMU flags:
- `-netdev user,id=net0,hostfwd=tcp::2222-:22` — forwards host port 2222 to guest port 22.
- `-device e1000,netdev=net0` — attaches a virtio or e1000 NIC.
- `-cdrom /app/alpine.iso` — boots from the ISO.
- `-m 512` or `-m 1024` — sufficient RAM.
- `-nographic` or `-display none` — headless, serial console.
- `-daemonize` — run in background (or use `&`).

Example command:
```bash
qemu-system-x86_64 \
    -cdrom /app/alpine.iso \
    -m 1024 \
    -netdev user,id=net0,hostfwd=tcp::2222-:22 \
    -device e1000,netdev=net0 \
    -nographic \
    -serial mon:stdio &
```

### 3. Configure Alpine inside the VM (≈ 10 min)

Connect to the VM's serial console (or use `-serial mon:stdio` with `-nographic`
to interact directly). Once you see the login prompt, log in as `root` (no password
by default on the ISO).

**Set the root password:**
```sh
echo 'root:password123' | chpasswd
# or interactively: passwd
```

**Enable SSH:**
```sh
# Install OpenSSH
apk update
apk add openssh

# Configure SSH to permit root login with password
echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config
echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config

# Generate host keys if missing
ssh-keygen -A

# Start SSH daemon
/usr/sbin/sshd
```

**Ensure networking works:**
```sh
# Configure eth0 if not auto-configured
ifconfig eth0 up
udhcpc -i eth0

# Verify SSH is listening
netstat -tlnp | grep 22
```

### 4. Verify SSH from the host (≈ 2 min)

```bash
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -p 2222 root@localhost
# Should prompt for password; type 'password123'
# Should drop into a shell.
```

## Verifier checklist (must all pass)

- [ ] QEMU process is running in the background.
- [ ] Port 2222 on the host accepts TCP connections.
- [ ] SSH server inside the guest is listening on port 22.
- [ ] `ssh -p 2222 root@localhost` succeeds with password `password123`.
- [ ] A shell prompt is returned after authentication.

## Common pitfalls

1. **Port forwarding not configured correctly.** The `hostfwd=tcp::2222-:22`
   option must be on the same `-netdev user` line. If you use two separate
   `-netdev` entries, the forwarding goes to the wrong NIC. Use one `-netdev`
   with `hostfwd` attached to a single `-device`.
2. **SSH not installed or not started inside the guest.** Alpine's ISO is
   minimal — `openssh` is not installed by default. You must run `apk add
   openssh` inside the guest before `sshd` is available. If the ISO is
   read-only, you may need to use `setup-alpine` to create a writable overlay
   or persistent storage.
3. **Root login disabled by default.** OpenSSH often ships with
   `PermitRootLogin prohibit-password` or `no`. You must explicitly add
   `PermitRootLogin yes` to `/etc/ssh/sshd_config` and restart sshd.
4. **Guest networking not up.** After boot, the guest may not have an IP.
   Run `ifconfig eth0 up` and `udhcpc -i eth0` to obtain one via DHCP from
   QEMU's user-mode network stack (10.0.2.0/24 range).
5. **Host already has port 2222 in use.** If another process occupies port
   2222, QEMU will fail silently or bind to a different port. Check with
   `ss -tlnp | grep 2222` before starting QEMU, and kill any stale QEMU
   processes first: `pkill qemu-system-x86_64`.

## Reference pointers

- QEMU user-mode networking documentation:
  https://www.qemu.org/docs/master/system/networking.html
- Alpine Linux wiki — setting up SSH:
  https://wiki.alpinelinux.org/wiki/Setting_up_a_SSH_server
- The verifier script at `tests/test_outputs.py` in the task directory is the
  ground truth for what is scored.
