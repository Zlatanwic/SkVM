---
name: tb-configure-git-webserver
description: Configure a bare Git server with a post-receive hook that auto-deploys pushed HTML files to an nginx web server on port 8080. Use this skill whenever the task mentions setting up a Git server, post-receive hooks, auto-deployment to nginx, or pushing to a remote Git repo that serves content via HTTP on port 8080. Also trigger when the user references `/git/server`, `curl http://server:8080/`, or needs to wire version-control push events to a web server. The skill covers: initializing a bare Git repository, writing post-receive hooks, configuring nginx to serve a document root, setting correct file permissions, and verifying the end-to-end push-to-deploy pipeline.
---

# tb-configure-git-webserver

Configure a bare Git server whose post-receive hook automatically deploys
pushed content to an nginx web server on port 8080, so that `git push`
instantly updates `curl http://server:8080/<file>`. This is a Terminal-Bench 2.1
task; the full task spec lives at `tasks/configure-git-webserver/`.

## When this skill triggers

Use it when the user is dropped into the `configure-git-webserver` Docker
container and needs to deliver a working `git clone user@server:/git/server`
pipeline whose pushes land on port 8080 via nginx. Do **not** use it for
generic web server setup, reverse-proxy configuration, or Git hosting
platforms like GitLab/Gitea — this is specifically a bare-repo plus
post-receive hook plus nginx integration task.

## Goal (one sentence)

Wire a bare Git repository's post-receive hook to check out pushed files into
nginx's document root so that `curl http://server:8080/hello.html` returns the
pushed content.

## Required outputs

| File | Purpose |
|---|---|
| `/git/server` (or configured path) | Bare Git repository with a working post-receive hook. |
| nginx document root (e.g., `/var/www/html/`) | Directory where pushed files land after `git push`. |
| nginx config serving port 8080 | Web server config that serves the document root on port 8080. |

The verifier clones the repo via SSH, pushes `hello.html`, and curls port 8080
— see "Verifier checklist" below.

## Recommended workflow

### 1. Survey the environment (≈ 2 min)

- Check what is pre-installed: `which git nginx` or `dpkg -l | grep -E "git|nginx"`.
- If nginx is missing, install with `apt-get update && apt-get install -y nginx`.
- Check the current nginx config: `nginx -T` or look at `/etc/nginx/`.
- Verify SSH is running and that `user@server` login works (the instruction says
  "I'll setup login with the server to work, you don't have to worry about that").
- Test basic nginx: start it, curl localhost:8080.

### 2. Create the bare Git repository (≈ 3 min)

```bash
mkdir -p /git/server
cd /git/server
git init --bare
```

### 3. Write the post-receive hook (≈ 5 min)

The hook must:
- Read each pushed ref from stdin (`while read oldrev newrev ref`).
- Check out the latest tree to nginx's document root.
- Use `git --work-tree=<nginx-root> checkout -f <branch>`.

```bash
cat > /git/server/hooks/post-receive << 'EOF'
#!/bin/bash
while read oldrev newrev ref; do
    if [ "$ref" = "refs/heads/master" ] || [ "$ref" = "refs/heads/main" ]; then
        git --work-tree=/var/www/html --git-dir=/git/server checkout -f
    fi
done
EOF
chmod +x /git/server/hooks/post-receive
```

Key details:
- Make the hook executable (`chmod +x`). A non-executable hook is silently skipped.
- Handle both `master` and `main` branch names.
- Use `--work-tree` pointing to nginx's document root.
- The user pushes to `master` per the instruction, but be defensive.

### 4. Configure nginx (≈ 5 min)

- Set or create a server block listening on port 8080.
- Root must be the same directory the post-receive hook writes to.
- Ensure nginx runs as a user that can read the document root.

```bash
cat > /etc/nginx/sites-available/git-deploy << 'EOF'
server {
    listen 8080;
    root /var/www/html;
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
EOF
ln -sf /etc/nginx/sites-available/git-deploy /etc/nginx/sites-enabled/
# Remove default config if it conflicts
rm -f /etc/nginx/sites-enabled/default
nginx -t && nginx -s reload || service nginx restart
```

### 5. Set permissions (≈ 2 min)

```bash
chown -R www-data:www-data /var/www/html  # or appropriate user
chmod -R 755 /var/www/html
```

### 6. End-to-end test (≈ 3 min)

```bash
cd /tmp
git clone user@server:/git/server test-clone
cd test-clone
echo "hello world" > hello.html
git add hello.html
git commit -m "add hello.html"
git push origin master
curl http://server:8080/hello.html
# Should output: hello world
```

## Verifier checklist (must all pass)

- [ ] Bare Git repository exists and is clonable via `git clone user@server:/git/server`.
- [ ] Post-receive hook is present, executable, and runs on push.
- [ ] nginx is configured to listen on port 8080.
- [ ] Pushing `hello.html` results in `curl http://server:8080/hello.html` returning "hello world".
- [ ] The pipeline handles multiple pushes (idempotent deployment).

## Common pitfalls

1. **Hook not executable.** `git init --bare` creates sample hooks without the
   execute bit. Always `chmod +x hooks/post-receive`.
2. **Wrong branch name.** The instruction says `git push origin master`, but
   newer Git defaults to `main`. Handle both in the hook, or explicitly set
   the default branch name when initializing the repo.
3. **Permission mismatch between Git and nginx.** If the post-receive hook
   runs as one user but nginx reads as another (e.g., `www-data`), files
   created by `git checkout -f` may be unreadable. Set a `umask 002` at the
   top of the post-receive hook, or `chown` the work-tree after checkout.
4. **nginx not reloaded after config change.** Running `nginx -t` passes but
   nginx may still be serving the old config. Always reload or restart.
5. **Firewall or port conflict.** Another service may already be on port 8080.
   Check with `ss -tlnp | grep 8080` and kill or reconfigure as needed.

## Quick sanity test (run after setup)

```bash
# Test cloning
git clone user@server:/git/server /tmp/test-git-clone

# Test push + deploy
cd /tmp/test-git-clone
echo "hello world" > hello.html
git add hello.html && git commit -m "test" && git push origin master

# Test web server
curl -s http://server:8080/hello.html
# Expected: "hello world"
```

## Reference pointers

- Git hooks documentation: `man githooks` or https://git-scm.com/docs/githooks
- nginx beginner's guide: https://nginx.org/en/docs/beginners_guide.html
- Inside the task container, the verifier checks the full push-to-curl pipeline.
