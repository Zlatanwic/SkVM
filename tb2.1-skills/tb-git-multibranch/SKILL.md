---
name: tb-git-multibranch
description: Set up a Git server with SSH password authentication, post-receive hooks for automated multi-branch deployment, and Nginx serving branch-specific content over HTTPS with a self-signed certificate. Use this skill whenever the task involves configuring a bare Git repository accessible over SSH, implementing post-receive deployment hooks that deploy different branches to different URL paths, setting up Nginx with HTTPS and self-signed certificates, or serving static content from git branches at distinct endpoints like /index.html and /dev/index.html. Also trigger when the user references git@localhost:/git/project, port 8443, password authentication for git, or automated push-to-deploy workflows.
---

# tb-git-multibranch

Configure a full Git-over-SSH server with automated multi-branch deployment
to Nginx-served HTTPS endpoints. This is one of the Terminal-Bench 2.1 task
skills; the full task lives at `tasks/git-multibranch/` in the same repo as
this skill.

## When this skill triggers

Use it when the user is dropped into the `git-multibranch` Docker container
and needs to deliver a working Git server deployable at `git@localhost:/git/project`
plus Nginx serving `main` at `/index.html` and `dev` at `/dev/index.html` over
HTTPS on port 8443. Do **not** use it for generic Git server setups that lack
the hook + multi-branch + HTTPS combination that the verifier checks.

## Goal (one sentence)

Set up a bare Git repository accessible over SSH with password auth, where
every push triggers a post-receive hook that deploys main-branch content to
`/var/www/main/` and dev-branch content to `/var/www/dev/`, both served by
Nginx over HTTPS on port 8443 with a self-signed certificate.

## Required outputs

| File / Service | Purpose |
|---|---|
| Bare repo at `/git/project` | Git server repository accessible via `git@localhost:/git/project` with password `password` |
| `/git/project/hooks/post-receive` | Executable hook that checks out each branch to the correct Nginx docroot on push |
| Nginx site config | Serves `main` at `https://localhost:8443/index.html` and `dev` at `https://localhost:8443/dev/index.html` |
| Self-signed certificate | Valid TLS certificate + key pair for `localhost:8443` |
| Running services | SSH daemon accepting password auth; Nginx listening on 8443 with TLS |

The verifier clones, pushes both branches with distinct content, and curls
both endpoints — all must return correct content within 3 seconds of push.

## Recommended workflow

### 1. Survey the environment (≈ 3 min)

- Check if `openssh-server` and `nginx` are installed; install missing packages.
- Verify the Docker image has the expected user — you may need to create a
  dedicated git user or use the existing user.
- Confirm `/git/project` does not exist yet (or clean it up).
- Read `tasks/git-multibranch/instruction.md` to confirm exact filenames and
  expected content strings ("main branch content", "dev branch content").

### 2. Set up SSH and the git user (≈ 5 min)

```bash
apt-get update && apt-get install -y openssh-server nginx
# Ensure SSH allows password authentication
sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
```

- Set a password on the user account that will own the repo:
  ```bash
  echo 'user:password' | chpasswd
  ```
- Start (or restart) the SSH daemon.

### 3. Create the bare repository (≈ 2 min)

```bash
mkdir -p /git/project
cd /git/project && git init --bare
```

### 4. Write the post-receive hook (≈ 10 min)

The hook must:
1. Read stdin for ref updates (lines like `<old> <new> refs/heads/main`).
2. For each updated branch, check out the tree to the correct deployment
   directory (`/var/www/main/` for `main`, `/var/www/dev/` for `dev`).
3. Ensure the checkout is readable by Nginx.

```bash
#!/bin/bash
# /git/project/hooks/post-receive
DEPLOY_BASE="/var/www"
while read oldrev newrev refname; do
    branch=$(basename "$refname")
    case "$branch" in
        main) target="$DEPLOY_BASE/main" ;;
        dev)  target="$DEPLOY_BASE/dev" ;;
        *)    continue ;;
    esac
    mkdir -p "$target"
    GIT_WORK_TREE="$target" git checkout -f "$branch"
done
```

Make it executable: `chmod +x /git/project/hooks/post-receive`.

### 5. Generate self-signed certificate and configure Nginx (≈ 10 min)

```bash
mkdir -p /etc/nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/selfsigned.key \
  -out /etc/nginx/ssl/selfsigned.crt \
  -subj "/CN=localhost"
```

Write an Nginx site config that:
- Listens on port 8443 with SSL.
- Serves `/var/www/main/` at `/` (root).
- Serves `/var/www/dev/` at `/dev/` (alias or nested location).
- Uses `index index.html`.

```nginx
server {
    listen 8443 ssl;
    server_name localhost;

    ssl_certificate /etc/nginx/ssl/selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/selfsigned.key;

    root /var/www/main;
    index index.html;

    location /dev/ {
        alias /var/www/dev/;
    }
}
```

Enable the site, test the config, and reload/start Nginx.

### 6. Smoke test end-to-end (≈ 3 min)

```bash
# Clone, create content, push
git clone ssh://git@localhost:/git/project /tmp/test-clone
cd /tmp/test-clone
echo "main branch content" > index.html && git add . && git commit -m "main" && git push origin main
git checkout -b dev
echo "dev branch content" > index.html && git add . && git commit -m "dev" && git push origin dev

# Verify
curl -k https://localhost:8443/index.html
curl -k https://localhost:8443/dev/index.html
```

## Verifier checklist (must all pass)

- [ ] SSH server is running and accepts password authentication with password `password`.
- [ ] Bare Git repository exists at `/git/project` and is clonable via `git@localhost:/git/project`.
- [ ] Post-receive hook is executable and triggers deployment on push.
- [ ] Nginx is listening on port 8443 with a valid (self-signed) TLS certificate.
- [ ] `https://localhost:8443/index.html` returns "main branch content".
- [ ] `https://localhost:8443/dev/index.html` returns "dev branch content".
- [ ] Deployment completes within 3 seconds of push.

## Common pitfalls

1. **SSH daemon not running or rejecting password auth.** Even if `sshd` is
   installed, the default config often disables password authentication.
   Always check `/etc/ssh/sshd_config` for `PasswordAuthentication yes` and
   restart the daemon.
2. **Post-receive hook not executable.** A `post-receive` file with correct
   bash code but missing the execute bit will silently fail. Always
   `chmod +x /git/project/hooks/post-receive`.
3. **Nginx `alias` vs `root` confusion for `/dev/`.** Using `root` instead of
   `alias` in the `/dev/` location block causes Nginx to look in
   `/var/www/dev/dev/`. Test carefully with `curl -k`.
4. **Self-signed certificate causes curl failures.** The verifier likely uses
   `curl -k`, but if you test without `-k`, the connection will fail. Use
   `-k` or `--insecure` in your own smoke tests.
5. **Git clone uses wrong user or host.** The task specifies
   `git@localhost:/git/project`. Make sure the `git` user exists (or use the
   current user) and that the path is correct. A trailing slash mismatch or
   wrong username will cause clone failures.

## Quick sanity test (run after setup)

```bash
# 1. SSH reachable
sshpass -p 'password' ssh -o StrictHostKeyChecking=no git@localhost 'echo ok'

# 2. Git clone works
rm -rf /tmp/test-clone
git clone ssh://git@localhost:/git/project /tmp/test-clone

# 3. Push triggers deployment
cd /tmp/test-clone
echo "main branch content" > index.html
git add index.html && git commit -m "init"
git push origin main

# 4. Curl returns content
curl -k https://localhost:8443/index.html
```

## Reference pointers

- Git hooks documentation: `man githooks` or https://git-scm.com/docs/githooks
- The `post-receive` hook receives ref update tuples on stdin — one per line
  as `<old-value> <new-value> <ref-name>`.
- Nginx `alias` directive behavior: https://nginx.org/en/docs/http/ngx_http_core_module.html#alias
- Inside the task container, the verifier at the task root is the ground truth
  for what is scored.
