# skvm-pi-runtime — sidecar image that runs the pi coding agent inside a
# Linux container against a bind-mounted workDir. Solves the "find /"
# host-traversal timeout by giving pi a clean Ubuntu / to walk instead of the
# Windows Git-Bash host filesystem.
#
# Build:   docker build -t skvm-pi-runtime:latest -f docker/skvm-pi-runtime.Dockerfile .
# Verify:  docker run --rm skvm-pi-runtime:latest pi --version
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# CN mirror over HTTP to survive local DNS split-tunnel routing (198.18.0.x
# hijacking). Base ubuntu:24.04 has no ca-certificates, so HTTPS handshake
# fails until we install them; use HTTP for the initial apt cycle then
# switch to HTTPS. Aliyun mirror is stable in-region without SSL requirement.
RUN sed -i 's|http://archive.ubuntu.com|http://mirrors.aliyun.com|g; s|http://security.ubuntu.com|http://mirrors.aliyun.com|g; s|https://mirrors.aliyun.com|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/ubuntu.sources 2>/dev/null || true

# Base tooling that pi's bash tool commonly needs (find, grep, sqlite3, python3,
# xxd, curl, git, jq). Kept minimal — TB tasks that need heavier deps are
# expected to run in their own image; this container is the AGENT's runtime,
# not the task's runtime. Verifier still runs in the TB image (unchanged).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg git jq sqlite3 xxd vim-common python3 python3-pip \
    build-essential procps \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20 from NodeSource. Node 22 has known issues with some npm audit
# workflows; 20 LTS is well-tested with the pi npm package chain.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# npm registry mirror to survive CN network. npmmirror is Alibaba's mirror.
RUN npm config set registry https://registry.npmmirror.com

# Pin pi to the exact version currently used on the host (see D:/SkVM
# node_modules/@mariozechner/pi-coding-agent/package.json: 0.67.68). Updating
# host and image in lockstep is a follow-up; for now the version is fixed to
# avoid behavior drift between host bench and container bench during A/B.
RUN npm install -g @mariozechner/pi-coding-agent@0.67.68

# Sanity assertion at build time — fails the build if pi cannot start.
RUN pi --version && node --version

# The agent's working directory. skvm mounts the host workDir here at run time.
WORKDIR /app

# Default entrypoint is a shell so `docker exec` can call `pi …` freely.
CMD ["sleep", "36000"]

