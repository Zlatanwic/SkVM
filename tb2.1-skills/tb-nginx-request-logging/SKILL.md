---
name: tb-nginx-request-logging
description: Set up an Nginx web server with custom access logging, rate limiting, and a branded 404 error page. Use this skill whenever the task mentions installing Nginx, configuring `benchmark-site.conf`, setting up `benchmark-access.log` with a custom log format, enabling `limit_req_zone` / `limit_req` rate limiting (10 req/s per IP), serving static files from `/var/www/html`, creating `/404.html` as a custom error page, or running the server on port 8080. Also trigger when the user references the `nginx-request-logging` Docker container or asks to disable the default Nginx site.
---

# tb-nginx-request-logging

Install and configure an Nginx web server with detailed request logging, per-IP
rate limiting, and a custom 404 error page. This is a Terminal-Bench 2.1
system-administration task; the full task spec lives at
`tasks/nginx-request-logging/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `nginx-request-logging` Docker
container and needs to deliver a running Nginx server on port 8080 that logs
timestamps, request methods, status codes, and user agents to
`/var/log/nginx/benchmark-access.log`. Do **not** use it for generic Nginx
reverse-proxy, load-balancing, or TLS-termination tasks — this is specifically
about access logging, rate limiting, and custom error pages.

## Goal (one sentence)

A running Nginx server on localhost:8080 serving `index.html` from
`/var/www/html`, logging every request with a custom format to
`/var/log/nginx/benchmark-access.log`, rate-limiting clients to 10 req/s with a
10-request burst, and returning a custom `/404.html` page on 404 errors.

## Required outputs

| File | Purpose |
|---|---|
| `/etc/nginx/conf.d/benchmark-site.conf` | Server block: listen 8080, document root, custom log format reference, rate limiting (`limit_req`), custom 404 page. |
| `/var/www/html/index.html` | Static landing page containing `"Welcome to the benchmark webserver"`. |
| `/var/www/html/404.html` | Custom error page containing `"Page not found - Please check your URL"`. |
| `/var/log/nginx/benchmark-access.log` | Access log populated with `$time_local $request_method $status $http_user_agent`. |
| `/var/log/nginx/benchmark-error.log` | Error log for server diagnostics. |

The verifier checks that Nginx is running on port 8080, that the access log
format matches the specification, that rate limiting is configured, and that
the default site is disabled.

## Recommended workflow

### 1. Survey the environment (≈ 2 min)

- Check whether Nginx is installed: `nginx -v` or `which nginx`. If missing,
  install with `apt-get update && apt-get install -y nginx`.
- Note the OS: Ubuntu 24.04 base image. Nginx configuration layout differs
  from CentOS/RHEL — `conf.d/` is the right include directory and
  `sites-enabled/` is where the default site symlink lives.
- Inspect `/etc/nginx/nginx.conf` to understand the existing `http` block
  structure and where `include` directives pull from.

### 2. Define the custom log format (≈ 2 min)

Add a `log_format` directive inside the `http` block of `/etc/nginx/nginx.conf`
if one does not already capture the required fields:

```
log_format benchmark '$time_local $request_method $status "$http_user_agent"';
```

The spec requires `$http_user_agent` to be double-quoted in the log output.
Place quotes literally around the variable in the format string.

### 3. Write the server block (≈ 5 min)

Create `/etc/nginx/conf.d/benchmark-site.conf`:

- `listen 8080;`
- `root /var/www/html;`
- `server_name localhost;` (or `_` as catch-all)
- Reference the custom log format: `access_log /var/log/nginx/benchmark-access.log benchmark;`
- Error log: `error_log /var/log/nginx/benchmark-error.log;`
- Apply rate limiting: `limit_req zone=one burst=10;` (see step 4)
- Custom 404: `error_page 404 /404.html;`

### 4. Configure rate limiting (≈ 2 min)

In `/etc/nginx/nginx.conf`, inside the `http` block (above any `server`
blocks), add:

```
limit_req_zone $binary_remote_addr zone=one:10m rate=10r/s;
```

Then reference `limit_req zone=one burst=10;` inside the `server` block of
`benchmark-site.conf`. The zone name must match.

### 5. Create static content (≈ 2 min)

```bash
mkdir -p /var/www/html
echo "Welcome to the benchmark webserver" > /var/www/html/index.html
echo "Page not found - Please check your URL" > /var/www/html/404.html
```

### 6. Disable the default site and test (≈ 2 min)

```bash
rm -f /etc/nginx/sites-enabled/default
nginx -t           # test syntax
nginx -s reload || nginx   # start or reload
curl -s localhost:8080     # should return index.html content
curl -s localhost:8080/nonexistent  # should return 404.html
cat /var/log/nginx/benchmark-access.log  # verify log format
```

## Verifier checklist

- [ ] Nginx is installed and running on port 8080.
- [ ] `/var/www/html/index.html` exists with the correct content.
- [ ] `/var/www/html/404.html` exists with the correct content.
- [ ] Custom log format is defined in `/etc/nginx/nginx.conf`.
- [ ] Server block in `/etc/nginx/conf.d/benchmark-site.conf` listening on port 8080.
- [ ] Access log at `/var/log/nginx/benchmark-access.log` uses the custom format.
- [ ] Error log at `/var/log/nginx/benchmark-error.log` is configured.
- [ ] Rate limiting zone (`limit_req_zone`) is defined with 10MB zone and 10r/s.
- [ ] Rate limiting (`limit_req`) is applied in the server block with burst=10.
- [ ] Default Nginx site is disabled (symlink removed from `sites-enabled`).
- [ ] `nginx -t` reports syntax is OK.

## Common pitfalls

1. **Double-quoting the user-agent in the log format.** The spec says
   `$http_user_agent` should appear double-quoted in the output. Use
   `"$http_user_agent"` inside the `log_format` string — Nginx will emit
   the literal quotes. Forgetting them causes the verifier to reject the log
   format.
2. **Placing `limit_req_zone` in the wrong context.** The zone definition
   must go in the `http` block (not inside a `server` or `location` block),
   while `limit_req` goes in the `server` or `location` block. Swapping these
   causes `nginx -t` to fail.
3. **Not removing the default site.** The default symlink `/etc/nginx/sites-enabled/default`
   (pointing to `/etc/nginx/sites-available/default`) may listen on port 80 and
   cause port conflicts or confusion. The verifier expects it gone.
4. **Server not binding to 0.0.0.0.** Inside Docker, listening on `localhost`
   only binds to the loopback; use `listen 8080;` (defaults to `0.0.0.0:8080`)
   or set `server_name _;` to catch all requests.
5. **Forgetting to reload after config changes.** `nginx -s reload` is needed
   after changing configuration files. A simple `nginx -t` only validates
   syntax — it does not apply the changes.

## Reference pointers

- Nginx `ngx_http_log_module` documentation for `log_format` syntax.
- Nginx `ngx_http_limit_req_module` for `limit_req_zone` and `limit_req` details.
- Inside the task container, the verifier lives at `tests/test_outputs.py` and
  is the ground truth for what is scored.
- Task spec: `tasks/nginx-request-logging/instruction.md`.
