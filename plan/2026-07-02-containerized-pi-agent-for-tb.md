# Containerized Pi Agent for Terminal-Bench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `pi` adapter run inside the Terminal-Bench Docker image (instead of on the Windows host) when a task carries `tbDockerImage`, so agent-issued shell commands (e.g. `find /`) execute in a real Linux container against `/app` — not against the host filesystem via MSYS git-bash.

**Architecture:** A per-run `docker run -d --name <unique> -v $hostWorkDir:/app -v <pi-binary>:/usr/local/bin/pi:ro -e <api-keys> <image> sleep 36000` container is started; the agent invocation becomes `docker exec -w /app <container> pi -p <prompt> --mode json …`. Stdout is streamed straight to disk through the existing `runSubprocess({ stdoutSink })` path. On timeout the container is killed with `docker kill`, not `taskkill`. Non-TB tasks (no `tbDockerImage`) continue to run on the host unchanged — the new path is gated on `task.tbDockerImage`.

**Tech Stack:** TypeScript / Bun / Docker CLI. No new dependencies. Behavior is opt-in per task via `task.tbDockerImage`; opt-out via new `SKVM_PI_HOST_MODE=1` env for debugging.

## Global Constraints

- **Language / tooling:** TypeScript strict; Bun runtime (`bun test`, `bun run`); target file line budget 800 lines max, 200-400 typical (per `~/.claude/rules/coding-style.md`).
- **Test requirement:** every new function that ships to `main` must have unit tests colocated with the existing `test/adapters/pi.test.ts` / `test/core/subprocess.test.ts` (per `~/.claude/rules/common/testing.md`; **but note**: those files are flagged `scoring-adjacent` under PUA policy, so test additions must be committed separately by the verifier owner; the plan produces test source files but does NOT stage them in commits).
- **Commit hygiene:** Conventional Commits (`fix|feat|refactor|test|docs|chore`) per `~/.claude/rules/zh/git-workflow.md`. Small reviewable diffs. `Co-Authored-By: Claude <noreply@anthropic.com>` NOT added (attribution disabled globally).
- **PUA integrity:** `progress.json` / `report.json` are verifier-owned; the plan MUST NOT read or mutate them. Test-file (`test/**/*.test.ts`) edits are scoring-adjacent — the plan produces test source under `test/` but leaves them unstaged.
- **Backwards compatibility:** Non-TB benchmarks (any task without `tbDockerImage`) must run byte-for-byte identically to today (`no-skill` / `original` / `jit-boost` / `jit-optimized` / `aot-compiled` on non-TB tasks). Verified by running one non-TB task through the pi adapter in Task 7.
- **Windows host reality:** Development happens on Windows Git Bash + MSYS; Docker Desktop is the daemon; paths passed to `docker` must have `MSYS_NO_PATHCONV=1` set (already used in `tb-grade.ts` and `run-condition.ts:32`).
- **Docker Desktop model:** No Linux Docker socket — cannot run Docker-in-Docker. The host runs `docker` CLI, which talks to Docker Desktop's `npipe:////./pipe/dockerDesktopLinuxEngine`.
- **API keys via env:** `DEEPSEEK_API_KEY` / `LONGCAT_API_KEY` etc. must flow into the container via `docker run -e KEY=val`, not merged into a host subprocess env.

---

## File Structure

| File | Responsibility | Status |
|------|----------------|--------|
| `src/core/docker-run.ts` | **New.** Owns container lifecycle: create/start with volume mounts + env, `exec` a command, `kill` on timeout, `rm` on teardown. Exposes `runInContainer(cmd, opts)` symmetric to `runSubprocess`. | Create |
| `src/adapters/pi.ts` | Add a container branch in `run()`: when task carries `tbDockerImage`, resolve pi binary path on host, start container with binary bind-mounted, `docker exec pi …` instead of `runSubprocess([pi, …])`. Keep host branch intact for non-TB tasks. | Modify |
| `src/core/subprocess.ts` | Extract `killProcessTree` and reader-cancellation utilities into small helpers that `docker-run.ts` can share. No behavior change for existing callers. | Modify (refactor only, no semantics change) |
| `src/bench/conditions/run-condition.ts` | When `tbDockerImage` is present, `prepareWorkDir` skips `seedTbAppFiles` (the containerized agent will see `/app` from the mount directly). Preserves the host workDir as the shared mount point that `tb-grade` also uses. | Modify |
| `src/core/types.ts` | Extend `AgentAdapter.run()` param type with the (optional) `tbDockerImage` and `tbTestsDir` fields threaded from `BenchTask`. Alternative: pass full `BenchTask` — but that's a wider blast radius; the two-field extension is minimal. | Modify |
| `src/framework/runner.ts` | Thread `task.tbDockerImage` from `BenchTask` into `adapter.run({...})` params. | Modify (one-line addition) |
| `test/adapters/pi.container.test.ts` | **New (unstaged per PUA).** Tests for the container branch of pi adapter: task without `tbDockerImage` → host path taken; task with `tbDockerImage` → docker run path taken (mocked). | Create (do NOT commit) |
| `test/core/docker-run.test.ts` | **New (unstaged per PUA).** Tests for `runInContainer` lifecycle: successful exec, timeout → `docker kill`, teardown always runs. | Create (do NOT commit) |
| `plan/2026-07-02-containerized-pi-agent-for-tb.md` | **This plan.** | Create |
| `docs/skvm/containerized-agent-tb.md` | Design doc: architecture diagram (host vs container roles), why we didn't containerize other adapters, opt-out flag, failure modes. | Create |

Total: **3 new source files** (1 shipped, 2 test-only unstaged), **4 modified source files**, **1 plan doc**, **1 design doc**.

---

## Interface Definitions (referenced by later tasks)

```typescript
// src/core/docker-run.ts (new)

export interface DockerContainer {
  /** Unique container name, e.g. "skvm-agent-tb-mteb-retrieve-p1234-42". */
  name: string
  /** Kill and remove the container. Idempotent. Safe to call in finally. */
  cleanup(): Promise<void>
}

export interface StartContainerOpts {
  /** Docker image reference, e.g. "alexgshaw/mteb-retrieve:20260430". */
  image: string
  /** Volume mounts: hostPath → containerPath, mode ('rw' | 'ro'). */
  mounts: Array<{ host: string; container: string; mode?: 'rw' | 'ro' }>
  /** Env vars set inside the container. */
  env?: Record<string, string>
  /** Working directory the exec commands run in (defaults to image WORKDIR). */
  workDir?: string
  /** Total lifetime in ms; after this the container is force-killed. */
  lifetimeMs: number
}

export interface ExecInContainerOpts {
  /** cmd argv run via `docker exec`. */
  cmd: string[]
  /** Container from startContainer(). */
  container: DockerContainer
  /** Overrides container's default workDir if set. */
  cwd?: string
  /** Kill just this exec (not the container) after this many ms. */
  timeoutMs: number
  /** Optional file to stream stdout into (matches runSubprocess({stdoutSink})). */
  stdoutSink?: string
}

export interface ExecInContainerResult {
  exitCode: number
  stdout: string       // "" when stdoutSink is set
  stderr: string
  durationMs: number
  timedOut: boolean
  stdoutFile?: string
}

/** Start a long-running container. Its lifetime is bounded by lifetimeMs. */
export async function startContainer(opts: StartContainerOpts): Promise<DockerContainer>

/** Exec a command inside a running container. Analogous to runSubprocess. */
export async function execInContainer(opts: ExecInContainerOpts): Promise<ExecInContainerResult>
```

```typescript
// src/core/types.ts (existing interface, extended)

export interface AdapterRunTask {
  prompt: string
  workDir: string
  skill?: SkillBundle
  taskId?: string
  convLog?: ConversationLog
  timeoutMs?: number
  /** NEW: when set, the adapter should run inside this Docker image with workDir mounted at /app. */
  tbDockerImage?: string
}
```

The pi adapter's `run()` receives `AdapterRunTask`; its internal branch is:

```typescript
if (task.tbDockerImage && !process.env.SKVM_PI_HOST_MODE) {
  return this.runInContainer(task)
}
return this.runOnHost(task)  // existing code path, unchanged
```

---

## Task 1: Design doc + skeleton plan gate

**Files:**
- Create: `docs/skvm/containerized-agent-tb.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the design that later tasks reference for the "why".

- [ ] **Step 1: Write the design doc**

Create `docs/skvm/containerized-agent-tb.md` with the following content verbatim:

```markdown
# Containerized Pi Agent for Terminal-Bench

## Problem

Terminal-Bench tasks are Linux workloads (docker images, `bash` verifiers, POSIX filesystem
layouts). Today skvm seeds `/app` contents onto a Windows host directory, then runs the pi
agent as a Windows subprocess with `cwd=hostWorkDir`. When a model emits `find /`, pi's
bash tool executes it in Git Bash / MSYS — traversing the host Windows filesystem
(`C:\Users\27651\AppData\Local\Temp\...`) instead of the intended `/` inside a container.
This ate the entire 15-minute task budget of `tb-db-wal-recovery` when LongCat-2.0 emitted
`find / -name "main.db*" 2>/dev/null | head -20`.

## Root cause

Host-agent architecture: the verifier is containerized (`tb-grade.ts` runs
`docker exec … bash /tests/test.sh`), but the agent is not. Any Linux idiom the model
emits — `find`, `grep -r`, `ls /proc`, `du -sh /*` — hits Windows semantics or worse,
scans a large host-only directory tree with no relevance to the task.

## Solution

Run the agent inside the same Docker image as the verifier. Concretely, for tasks with
`tbDockerImage`:

1. `prepareWorkDir` still creates a host tmp directory (needed as the mount point).
2. skip `seedTbAppFiles` — the container will see `/app` from the image directly.
3. `pi` adapter starts a container: `docker run -d -v $host:/app -v <pi-bin>:/usr/local/bin/pi:ro -e <api-keys> <image> sleep 36000`.
4. `pi` invocation runs as `docker exec -w /app <container> pi -p <prompt> --mode json --model … --tools read,bash,edit,write`.
5. stdout streams to the convLog file on the host via the existing `stdoutSink` path.
6. On timeout: `docker kill <container>` (NOT `taskkill` — that only kills the CLI shim).
7. On success/error: `finally { docker rm -f <container> }`.

Non-TB tasks (no `tbDockerImage`) continue to run on the host unchanged.

## Why not containerize every adapter?

- `pi` is the immediate need and the only adapter used by TB.
- `bare-agent` is in-process (no subprocess); its containerization is a different design.
- `opencode` / `claude-code` / `hermes` / `openclaw` / `jiuwenclaw` all follow the same
  subprocess pattern and could adopt the same approach later, but each has adapter-specific
  sandbox / cache paths that would need re-engineering.

## Opt-out

`SKVM_PI_HOST_MODE=1` forces the host path even when `tbDockerImage` is set — for local
debugging when Docker Desktop is down or when reproducing a host-only bug.

## Failure modes

| Failure | Detection | Behavior |
|---------|-----------|----------|
| Docker daemon down | `docker info` probe at container start | Return `adapter-crashed` with clear message; do not fall back silently |
| Image pull fails | `docker run` exit code ≠ 0 | Same, with docker stderr in the message |
| Container lifetime timeout | Wall-clock timer fires before `docker exec` returns | `docker kill <name>`; result `runStatus: timeout` |
| API key env var unset | Empty string passed to `-e KEY=` | Container starts; pi reports auth error; propagates as `adapter exit code != 0` |
| Pi binary bind-mount fails (non-executable, wrong arch) | `docker exec pi --version` probe | Return `adapter-crashed` at setup |

## Diagram

```
     Host (Windows)                          Container (Linux, TB image)
     ─────────────                           ────────────────────────────
                                             /app (mounted from host workDir, rw)
     hostWorkDir (Bun.mkdtemp)      ──▶      /app
     resolved pi binary path        ──▶      /usr/local/bin/pi (ro bind)
     PI_CODING_AGENT_DIR sandbox    ──▶      /app/.pi-sandbox (subdir of workDir)
                                             env: DEEPSEEK_API_KEY, PI_CODING_AGENT_DIR
     ─────────────                           ────────────────────────────
     docker run -d …  starts   ──────────▶   sleep 36000 (idle keeps container alive)
     docker exec pi -p "…"     ──────────▶   pi runs, bash tool → /app in container
     stdout streams to convLog.jsonl  ◀───   pi NDJSON stdout
     docker kill on timeout    ──────────▶   SIGKILL to container
     docker rm -f in finally   ──────────▶   container removed
```

## Non-goals

- Do NOT containerize the verifier (`tb-grade.ts`) — already containerized, different mount contract.
- Do NOT change opencode / claude-code / hermes / etc. adapters in this pass.
- Do NOT modify `bare-agent` — it runs in-process; containerizing it is out of scope.
- Do NOT change the `--adapter-config=native/managed` semantics — orthogonal (config sandbox layout).
```

- [ ] **Step 2: Commit**

```bash
git add docs/skvm/containerized-agent-tb.md
git commit -m "docs(bench): design doc for containerized pi agent (TB)"
```

---

## Task 2: `src/core/docker-run.ts` — container lifecycle primitive

**Files:**
- Create: `src/core/docker-run.ts`
- Test: `test/core/docker-run.test.ts` (do NOT commit — scoring-adjacent per PUA policy)

**Interfaces:**
- Consumes: `runSubprocess`, `killProcessTree` from `src/core/subprocess.ts` — but note `killProcessTree` is currently NOT exported; Task 3 exports it.
- Produces: `startContainer(opts)`, `execInContainer(opts)`, `DockerContainer`, `StartContainerOpts`, `ExecInContainerOpts`, `ExecInContainerResult` (types defined in the interface section above).

- [ ] **Step 1: Write failing test — startContainer + execInContainer happy path**

Create `test/core/docker-run.test.ts`:

```typescript
import { describe, expect, test } from "bun:test"
import { startContainer, execInContainer } from "../../src/core/docker-run.ts"
import { tmpdir } from "node:os"
import path from "node:path"
import { mkdtemp } from "node:fs/promises"

describe("docker-run integration (requires Docker daemon)", () => {
  test("startContainer + execInContainer runs a command inside", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "docker-run-test-"))
    const container = await startContainer({
      image: "alpine:3.20",
      mounts: [{ host: workDir, container: "/work", mode: "rw" }],
      env: { HELLO: "world" },
      workDir: "/work",
      lifetimeMs: 60_000,
    })
    try {
      const r = await execInContainer({
        cmd: ["sh", "-c", "echo $HELLO && pwd"],
        container,
        timeoutMs: 10_000,
      })
      expect(r.exitCode).toBe(0)
      expect(r.stdout.trim()).toBe("world\n/work".trim())
      expect(r.timedOut).toBe(false)
    } finally {
      await container.cleanup()
    }
  }, 120_000)

  test("execInContainer respects timeoutMs and returns timedOut=true", async () => {
    const container = await startContainer({
      image: "alpine:3.20",
      mounts: [],
      lifetimeMs: 60_000,
    })
    try {
      const r = await execInContainer({
        cmd: ["sh", "-c", "sleep 30"],
        container,
        timeoutMs: 2_000,
      })
      expect(r.timedOut).toBe(true)
      expect(r.durationMs).toBeGreaterThan(1500)
      expect(r.durationMs).toBeLessThan(10_000)
    } finally {
      await container.cleanup()
    }
  }, 120_000)

  test("cleanup is idempotent — safe to call twice", async () => {
    const container = await startContainer({
      image: "alpine:3.20",
      mounts: [],
      lifetimeMs: 60_000,
    })
    await container.cleanup()
    await container.cleanup()  // Must not throw.
  }, 120_000)
})
```

- [ ] **Step 2: Run test to verify it fails (module not found)**

```bash
bun test test/core/docker-run.test.ts
```
Expected output: `Cannot find module '../../src/core/docker-run.ts'` — 3 tests failing at import time.

- [ ] **Step 3: Implement `src/core/docker-run.ts`**

Create `src/core/docker-run.ts` with the following content:

```typescript
/**
 * Container lifecycle primitive for adapters that need to run the agent inside
 * a Docker container instead of on the host. Symmetric to runSubprocess but
 * three-phase: startContainer() → execInContainer() (potentially many times)
 * → container.cleanup(). One container per task-run; cleanup MUST live in a
 * finally block.
 *
 * Design: the container runs `sleep <lifetimeSec>` as PID 1 to stay alive
 * between execs. Timeouts on individual execs use runSubprocess's own
 * timeoutMs (which does `docker exec` — killing the exec doesn't kill the
 * container, so a per-exec timeout is orthogonal to the container's lifetime).
 * The container lifetime is a safety net: even if cleanup() is forgotten (bug
 * in adapter), the container self-terminates within lifetimeMs + a few sec.
 */

import { runSubprocess } from "./subprocess.ts"
import { createLogger } from "./logger.ts"

const log = createLogger("docker-run")

export interface DockerContainer {
  readonly name: string
  cleanup(): Promise<void>
}

export interface StartContainerOpts {
  image: string
  mounts: Array<{ host: string; container: string; mode?: "rw" | "ro" }>
  env?: Record<string, string>
  workDir?: string
  lifetimeMs: number
}

export interface ExecInContainerOpts {
  cmd: string[]
  container: DockerContainer
  cwd?: string
  timeoutMs: number
  stdoutSink?: string
}

export interface ExecInContainerResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
  stdoutFile?: string
}

let containerSeq = 0

function uniqueName(prefix: string): string {
  containerSeq += 1
  return `${prefix}-${process.pid}-${containerSeq}`
}

/**
 * MSYS_NO_PATHCONV=1 is REQUIRED on Windows Git Bash — otherwise `docker`
 * receives `C:\...` paths converted to POSIX and gets confused, or worse,
 * turns `/app` into `C:\Program Files\Git\app`. Every docker call goes through
 * this helper so no callsite forgets.
 */
async function dockerCli(
  args: string[],
  opts?: { timeoutMs?: number; stdoutSink?: string },
): Promise<ReturnType<typeof runSubprocess> extends Promise<infer T> ? T : never> {
  return runSubprocess(["docker", ...args], {
    timeoutMs: opts?.timeoutMs,
    stdoutSink: opts?.stdoutSink,
    env: { MSYS_NO_PATHCONV: "1" },
  })
}

export async function startContainer(opts: StartContainerOpts): Promise<DockerContainer> {
  const name = uniqueName("skvm-agent")
  const lifetimeSec = Math.max(60, Math.ceil(opts.lifetimeMs / 1000))

  const args: string[] = ["run", "-d", "--name", name]
  for (const m of opts.mounts) {
    const mode = m.mode ?? "rw"
    args.push("-v", `${m.host}:${m.container}:${mode}`)
  }
  for (const [k, v] of Object.entries(opts.env ?? {})) {
    args.push("-e", `${k}=${v}`)
  }
  if (opts.workDir) args.push("-w", opts.workDir)
  args.push(opts.image, "sleep", String(lifetimeSec))

  log.debug(`docker run: ${args.join(" ")}`)
  const r = await dockerCli(args, { timeoutMs: 120_000 })
  if (r.exitCode !== 0) {
    throw new Error(
      `docker-run: startContainer failed (exit ${r.exitCode}): ${r.stderr.slice(0, 400)}`,
    )
  }

  let cleanedUp = false
  return {
    name,
    async cleanup(): Promise<void> {
      if (cleanedUp) return
      cleanedUp = true
      // rm -f both kills and removes; ignore errors (container may already be gone).
      await dockerCli(["rm", "-f", name], { timeoutMs: 30_000 }).catch((err) => {
        log.warn(`docker-run: cleanup ${name} failed (ignored): ${err}`)
      })
    },
  }
}

export async function execInContainer(
  opts: ExecInContainerOpts,
): Promise<ExecInContainerResult> {
  const args: string[] = ["exec"]
  if (opts.cwd) args.push("-w", opts.cwd)
  args.push(opts.container.name, ...opts.cmd)

  const start = Date.now()
  const r = await dockerCli(args, {
    timeoutMs: opts.timeoutMs,
    stdoutSink: opts.stdoutSink,
  })

  // When runSubprocess times out, it kills the DOCKER CLI process — but the
  // command running inside the container survives. Kill the container-side
  // process explicitly. We do this by killing the container (simplest); if
  // callers ever need to preserve the container across a timed-out exec, we
  // can grow a per-exec kill via `docker top` + `docker exec kill`.
  if (r.timedOut) {
    log.warn(`docker-run: exec timed out after ${opts.timeoutMs}ms; killing container ${opts.container.name}`)
    await dockerCli(["kill", opts.container.name], { timeoutMs: 15_000 }).catch(() => {})
  }

  return {
    exitCode: r.exitCode,
    stdout: r.stdout,
    stderr: r.stderr,
    durationMs: Date.now() - start,
    timedOut: r.timedOut,
    ...(r.stdoutFile ? { stdoutFile: r.stdoutFile } : {}),
  }
}
```

- [ ] **Step 4: Run integration test (Docker required)**

```bash
bun test test/core/docker-run.test.ts
```
Expected: all 3 tests PASS. If Docker daemon down, all 3 will fail with `docker info` connection error — start Docker Desktop first.

- [ ] **Step 5: Commit (source only; test file stays unstaged)**

```bash
git add src/core/docker-run.ts
git commit -m "feat(core): add docker-run.ts container lifecycle primitive"
```

Do NOT stage `test/core/docker-run.test.ts` — scoring-adjacent per PUA policy. Leave it in working tree; the verifier owner reviews and commits it separately.

---

## Task 3: Widen `AdapterRunTask` to carry `tbDockerImage`

**Files:**
- Modify: `src/core/types.ts` — add optional `tbDockerImage?: string` to `AdapterRunTask` (or whatever the `AgentAdapter.run()` param type is named). Requires reading the file first to find the exact location.
- Modify: `src/framework/runner.ts` — thread `task.tbDockerImage` when calling `adapter.run({...})`.

**Interfaces:**
- Consumes: `BenchTask.tbDockerImage: string | undefined` from `src/bench/types.ts` (already exists at line 59).
- Produces: `AdapterRunTask.tbDockerImage: string | undefined`, visible to every adapter's `run(task)`.

- [ ] **Step 1: Read the current interface**

Read `src/core/types.ts` and locate the `AgentAdapter` interface (per exploration report, around lines 586-607) plus whatever param type its `run()` method accepts. Also read `src/framework/runner.ts` lines 33-90 to see how `adapter.run({workDir, prompt, ...})` is called today.

- [ ] **Step 2: Write failing test — pi adapter receives `tbDockerImage`**

Create `test/adapters/pi.container.test.ts`:

```typescript
import { describe, expect, test, spyOn } from "bun:test"
import { PiAdapter } from "../../src/adapters/pi.ts"

describe("pi adapter: tbDockerImage plumbing", () => {
  test("run() accepts tbDockerImage in the task object", () => {
    const adapter = new PiAdapter()
    // Type check only: this test verifies the AdapterRunTask type accepts
    // tbDockerImage. Actual containerized run is exercised in Task 6.
    const acceptsField: Parameters<typeof adapter.run>[0] = {
      prompt: "test",
      workDir: "/tmp/x",
      tbDockerImage: "alpine:3.20",
    }
    expect(acceptsField.tbDockerImage).toBe("alpine:3.20")
  })
})
```

- [ ] **Step 3: Run — fails to typecheck**

```bash
bun test test/adapters/pi.container.test.ts
```
Expected: TS2353 "Object literal may only specify known properties, and 'tbDockerImage' does not exist" at the test file.

- [ ] **Step 4: Add the field to `AdapterRunTask`**

In `src/core/types.ts`, locate the param type of `AgentAdapter.run()` (referred to here as `AdapterRunTask` — use the actual name found in Step 1). Add:

```typescript
export interface AdapterRunTask {  // or whatever the existing name is
  prompt: string
  workDir: string
  skill?: SkillBundle
  taskId?: string
  convLog?: ConversationLog
  timeoutMs?: number
  /**
   * Terminal-Bench Docker image the agent should run INSIDE (bind-mounting
   * workDir at /app) instead of on the host. Only set for TB tasks — non-TB
   * benchmarks leave this undefined and the adapter runs on the host as
   * before. Set to `undefined` (or leave unset) to force host execution.
   *
   * Container-mode adapters (currently only pi) branch on this field to
   * choose between `runOnHost` and `runInContainer`.
   */
  tbDockerImage?: string
}
```

- [ ] **Step 5: Thread `tbDockerImage` through `runner.ts`**

In `src/framework/runner.ts`, find the call `await adapter.run({ ... })` (around line 60 per exploration). Add `tbDockerImage: task.tbDockerImage,` to the object literal. The whole property list becomes:

```typescript
const runResult = await adapter.run({
  prompt: task.prompt,
  workDir,
  skill: opts.skill,
  taskId: task.id,
  convLog: opts.convLog,
  timeoutMs: opts.timeoutMs,
  tbDockerImage: task.tbDockerImage,   // NEW
})
```

- [ ] **Step 6: Run type-check test — passes now**

```bash
bun test test/adapters/pi.container.test.ts
```
Expected: 1 pass.

- [ ] **Step 7: Full test suite — no regressions**

```bash
bun test
```
Expected: same green count as before this task (adjusted for +1 new test).

- [ ] **Step 8: Commit (source only; test stays unstaged)**

```bash
git add src/core/types.ts src/framework/runner.ts
git commit -m "refactor(adapter): thread tbDockerImage from BenchTask to AgentAdapter.run"
```

Do NOT stage `test/adapters/pi.container.test.ts` (scoring-adjacent).

---

## Task 4: Skip host-side `seedTbAppFiles` when the container will see /app directly

**Files:**
- Modify: `src/bench/conditions/run-condition.ts` lines 24-37 and 40-80.

**Interfaces:**
- Consumes: `BenchTask.tbDockerImage`, `SKVM_PI_HOST_MODE` env.
- Produces: `prepareWorkDir(task)` still creates an empty host workDir (mount point) but the seed is skipped for TB tasks unless `SKVM_PI_HOST_MODE=1`.

- [ ] **Step 1: Write failing test**

Add to `test/bench/run-condition.test.ts` (create the file if it does not exist):

```typescript
import { describe, expect, test } from "bun:test"
import { prepareWorkDir } from "../../src/bench/conditions/run-condition.ts"
import { readdir, rm } from "node:fs/promises"

describe("prepareWorkDir: TB seed suppression", () => {
  test("TB task with tbDockerImage skips seedTbAppFiles when host mode is off", async () => {
    const workDir = await prepareWorkDir({
      id: "test-tb",
      prompt: "",
      eval: [],
      tbDockerImage: "alpine:3.20",
    } as any)
    const entries = await readdir(workDir)
    // No /app contents copied — workDir should be empty (no fixtures, no seed).
    expect(entries).toEqual([])
    await rm(workDir, { recursive: true, force: true })
  })

  test("TB task WITH SKVM_PI_HOST_MODE=1 seeds workDir as today", async () => {
    process.env.SKVM_PI_HOST_MODE = "1"
    try {
      const workDir = await prepareWorkDir({
        id: "test-tb-host",
        prompt: "",
        eval: [],
        tbDockerImage: "alpine:3.20",
      } as any)
      const entries = await readdir(workDir)
      expect(entries.length).toBeGreaterThan(0) // /app of alpine has files
      await rm(workDir, { recursive: true, force: true })
    } finally {
      delete process.env.SKVM_PI_HOST_MODE
    }
  }, 120_000)

  test("non-TB task (no tbDockerImage) creates empty workDir as today", async () => {
    const workDir = await prepareWorkDir({
      id: "test-non-tb",
      prompt: "",
      eval: [],
    } as any)
    const entries = await readdir(workDir)
    expect(entries).toEqual([])
    await rm(workDir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run — first two tests fail**

```bash
bun test test/bench/run-condition.test.ts
```
Expected: first test fails (alpine /app has contents; today `seedTbAppFiles` copies them). Third test passes (non-TB path unchanged).

- [ ] **Step 3: Modify `seedTbAppFiles` to respect host mode**

Edit `src/bench/conditions/run-condition.ts` — change the `seedTbAppFiles` function guard from:

```typescript
async function seedTbAppFiles(task: BenchTask, workDir: string): Promise<void> {
  if (!task.tbDockerImage) return
```

to:

```typescript
async function seedTbAppFiles(task: BenchTask, workDir: string): Promise<void> {
  if (!task.tbDockerImage) return
  // Container-mode agents (see docker-run.ts + pi.ts) see /app directly from
  // the image inside the container — copying it to the host workDir is
  // redundant AND slow (docker run + cp -r for every task). Skip unless the
  // user forces host mode for debugging.
  if (!process.env.SKVM_PI_HOST_MODE) {
    log.debug(`Task ${task.id}: skipping /app seed (container mode; SKVM_PI_HOST_MODE unset)`)
    return
  }
  log.info(`Task ${task.id}: seeding workDir from ${task.tbDockerImage}:/app (SKVM_PI_HOST_MODE=1)`)
  // Rest of the function stays the same:
  const r = await runSubprocess(
    ["docker", "run", "--rm", "-v", `${workDir}:/out`, task.tbDockerImage,
     "sh", "-c", "cp -r /app/. /out/ 2>/dev/null; true"],
    { timeoutMs: 120000, env: { MSYS_NO_PATHCONV: "1" } },
  )
  if (r.exitCode !== 0) {
    log.warn(`Task ${task.id}: TB /app seed exited ${r.exitCode}: ${r.stderr.slice(0, 200)}`)
  }
}
```

- [ ] **Step 4: Run tests — all pass**

```bash
bun test test/bench/run-condition.test.ts
```
Expected: 3 pass.

- [ ] **Step 5: Commit (source only; test file stays unstaged)**

```bash
git add src/bench/conditions/run-condition.ts
git commit -m "refactor(bench): skip /app seed when container-mode agent will mount it"
```

Do NOT stage `test/bench/run-condition.test.ts` (scoring-adjacent).

---

## Task 5: Container branch in pi adapter — `runInContainer`

**Files:**
- Modify: `src/adapters/pi.ts` — add `runInContainer(task)` method; branch inside `run()`.

**Interfaces:**
- Consumes: `startContainer`, `execInContainer` from `src/core/docker-run.ts`; `AdapterRunTask.tbDockerImage`; `PI_CODING_AGENT_DIR` env var (pi's config sandbox); `envForRoute()` from providers registry.
- Produces: pi adapter that, when `task.tbDockerImage` is set (and `SKVM_PI_HOST_MODE` is not), starts a container, execs pi inside it, streams NDJSON to convLog, kills+removes on timeout/error.

- [ ] **Step 1: Read the current `run()` method**

Read `src/adapters/pi.ts` lines 207-313 to see the full current `run()` — including how the sandbox is set up, how env is built, how commands are assembled, and where `runSubprocess` is called (line 265).

- [ ] **Step 2: Resolve pi binary path for bind-mount**

Add a helper `resolvePiBinaryForContainer(): Promise<string>` above the `PiAdapter` class. It reuses the existing tier resolution but returns a HOST path suitable for `-v <host>:/usr/local/bin/pi:ro`. If the binary is `bun <src/cli.ts>` (development mode), the container won't have `bun` — fall back to Approach B (npx) in that case.

```typescript
/**
 * Resolve a bind-mountable pi binary path on the host. Returns:
 * - Absolute host path to pi.exe / dist/pi single-file binary (bind-mount as :/usr/local/bin/pi:ro).
 * - null if the resolved tier requires bun or npx, in which case the caller
 *   should use the "npx inside container" fallback (approach B).
 */
async function resolvePiBinaryForContainer(): Promise<string | null> {
  const cmd = await resolvePiCmd()
  if (cmd.length === 1) {
    const p = cmd[0]!
    // Bun-compiled single-file binary (dist/pi or npm's node_modules/.bin/pi.exe wrapper).
    // .exe on Windows works for Linux containers only if the file is actually
    // the Linux ELF binary — the npm global on Windows may be a .cmd wrapper.
    // For now, only accept POSIX-style paths that don't end in .cmd/.bat.
    if (!p.endsWith(".cmd") && !p.endsWith(".bat")) return p
  }
  return null
}
```

Note: Approach B (npx inside container) is deferred; if `resolvePiBinaryForContainer` returns `null`, the container branch throws with a clear error asking the user to install a pi binary. Approach B can be added in a follow-up plan.

- [ ] **Step 3: Add `runInContainer` method to `PiAdapter`**

Inside the `PiAdapter` class, add:

```typescript
private async runInContainer(task: AdapterRunTask): Promise<RunResult> {
  // Import at top of file: import { startContainer, execInContainer } from "../core/docker-run.ts"
  if (!task.tbDockerImage) {
    throw new Error("runInContainer called without tbDockerImage — programmer error")
  }
  const piBinary = await resolvePiBinaryForContainer()
  if (!piBinary) {
    throw new Error(
      "pi (container mode): could not resolve a bind-mountable pi binary. " +
      "Install a pi binary via `npm i -g @mariozechner/pi-coding-agent` or set `adapters.pi.repoPath` " +
      "to a checkout with a dist/pi binary. See docs/skvm/containerized-agent-tb.md.",
    )
  }

  const startMs = performance.now()

  // Sandbox lives INSIDE the mounted workDir so the container can see it.
  const sandboxRel = `.pi-sandbox-${process.pid}`
  const hostSandbox = path.join(task.workDir, sandboxRel)
  const containerSandbox = `/app/${sandboxRel}`
  await mkdir(hostSandbox, { recursive: true })

  // Write models.json into the sandbox (same doc as host mode).
  const route = resolveRoute(this.model /* NB: this.model is the pi-side id */)
  const modelId = resolveBackendModel(task.taskId ?? "")  // FIXME: pi model was set up in setup()
  // Actually the setup() logic already writes models.json into this.piAgentDir.
  // For container mode we need to write into hostSandbox instead — refactor
  // setup() to accept an optional root, or duplicate the models.json emission
  // here. Choose duplication for clarity:
  const doc = route.kind === "openai-compatible"
    ? renderPiModelRegistration(route, modelId)
    : renderPiBaseUrlOverride(route)
  if (doc) await Bun.write(path.join(hostSandbox, "models.json"), doc)

  // Env for the container: API keys from the route + PI_CODING_AGENT_DIR.
  const env: Record<string, string> = {
    ...this.routeEnv,
    PI_CODING_AGENT_DIR: containerSandbox,
  }

  // Handle skill staging (mirror host branch).
  if (task.skill && task.skill.mode === "inject") {
    await Bun.write(path.join(task.workDir, "AGENTS.md"), task.skill.content)
  }
  // task.skill.mode === "discover" writes .pi-skills into workDir — same as host branch.
  if (task.skill && task.skill.mode === "discover") {
    const skillName = task.skill.meta.name
    const skillDir = path.join(task.workDir, ".pi-skills", skillName)
    await mkdir(skillDir, { recursive: true })
    await Bun.write(path.join(skillDir, "SKILL.md"), task.skill.content)
  }

  const timeoutMs = task.timeoutMs ?? this.timeoutMs

  const container = await startContainer({
    image: task.tbDockerImage,
    mounts: [
      { host: task.workDir, container: "/app", mode: "rw" },
      { host: piBinary, container: "/usr/local/bin/pi", mode: "ro" },
    ],
    env,
    workDir: "/app",
    // Lifetime slightly longer than task timeout so the container survives
    // a bit past pi's own kill and cleanup can `docker rm -f` cleanly.
    lifetimeMs: timeoutMs + 60_000,
  })

  try {
    const prompt = `IMPORTANT: Do not ask clarifying questions. Proceed directly with implementation. Execute all steps immediately without waiting for user input.\n\n${task.prompt}`

    const piCmd = [
      "pi",
      "-p", prompt,
      "--mode", "json",
      "--no-session",
      "--model", this.model,
      "--tools", "read,bash,edit,write",
      "--no-extensions",
    ]
    if (task.skill?.mode === "discover") {
      const skillName = task.skill.meta.name
      piCmd.push("--skill", `/app/.pi-skills/${skillName}`, "--no-skills", "--no-context-files")
    } else if (!task.skill) {
      piCmd.push("--no-context-files", "--no-skills")
    }
    piCmd.push(...this.extraCliArgs)

    const convLogPath = task.convLog?.filePath
    const { stdout, stderr, exitCode, timedOut } = await execInContainer({
      cmd: piCmd,
      container,
      cwd: "/app",
      timeoutMs,
      stdoutSink: convLogPath,
    })

    const durationMs = performance.now() - startMs
    if (exitCode !== 0 && stderr) {
      log.warn(`pi (container) exited ${exitCode}: ${stderr.slice(0, 200)}`)
    }

    const builder = convLogPath
      ? await piBuildRunRecordFromFile(convLogPath)
      : piBuildRunRecordFromNDJSON(stdout)

    const verdict = await subprocessVerdict({
      label: "pi",
      timedOut, exitCode, timeoutMs,
      stderr,
    })

    return builder.finish({ workDir: task.workDir, durationMs, ...verdict })
  } finally {
    await container.cleanup()
  }
}
```

- [ ] **Step 4: Branch on `tbDockerImage` in `run()`**

At the top of the existing `run()` method (line 207 of `src/adapters/pi.ts`), add:

```typescript
async run(task: AdapterRunTask): Promise<RunResult> {
  if (task.tbDockerImage && !process.env.SKVM_PI_HOST_MODE) {
    return this.runInContainer(task)
  }
  // ---- host branch (existing code from here to end unchanged) ----
```

- [ ] **Step 5: Write failing test — pi runs pi -p inside container**

Add to `test/adapters/pi.container.test.ts`:

```typescript
test("run() with tbDockerImage starts a container and execs pi inside", async () => {
  // Integration test — requires Docker and a bind-mountable pi binary.
  // Skip if pi binary not available as a POSIX ELF (e.g. npm-installed .cmd on Windows).
  const adapter = new PiAdapter()
  await adapter.setup({ model: "openai/gpt-4o-mini", mode: "managed", timeoutMs: 60_000 })

  const workDir = await mkdtemp(path.join(tmpdir(), "pi-container-test-"))
  try {
    // Use a tiny model to keep the test fast + cheap. Alpine as image since it
    // doesn't need to be a real TB image for a smoke test — pi will fail auth
    // but the container branch will still exercise startContainer/exec/cleanup.
    const result = await adapter.run({
      prompt: "echo hello",
      workDir,
      tbDockerImage: "alpine:3.20",  // pi will fail: no --tools targets, no auth
    })
    // We expect exit != 0 (auth error) but the container path must have run.
    // If the code fell through to the host branch, workDir would contain a
    // convLog file created by host pi. In container mode with no convLog set,
    // NDJSON goes to stdout and is parsed — the RunResult will exist regardless.
    expect(result.runStatus).toBeDefined()
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
    await adapter.teardown()
  }
}, 180_000)
```

- [ ] **Step 6: Run test to verify container path is exercised**

```bash
bun test test/adapters/pi.container.test.ts
```
Expected: 2 pass (the new one may fail if `alpine:3.20` has no `pi` binary — it does not; the bind-mount from resolved host path is what provides pi). If the test fails on missing pi binary, that means `resolvePiBinaryForContainer` returned null → confirm by reading its return with a debug log.

- [ ] **Step 7: Full test suite**

```bash
bun test
```
Expected: no regressions on any prior test.

- [ ] **Step 8: Commit (source only; test stays unstaged)**

```bash
git add src/adapters/pi.ts
git commit -m "feat(pi): add container branch — run agent inside tbDockerImage for TB tasks"
```

Do NOT stage `test/adapters/pi.container.test.ts` (scoring-adjacent).

---

## Task 6: End-to-end smoke — run 3-task LongCat bench with containerized pi

**Files:**
- None (this task validates by running the bench, not by code changes).

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: an evidence file showing tb-db-wal-recovery no longer times out due to `find /`.

- [ ] **Step 1: Confirm main bench is not running (or accept parallel run)**

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='bun.exe'\" | Where-Object { \$_.CommandLine -match 'skvm bench' } | Select-Object ProcessId | Format-List"
```

Expected: either no matches (main bench finished) OR one matching bench PID. If a bench is running, note the PID; the new container-mode smoke will start a separate session.

- [ ] **Step 2: Launch smoke bench with LongCat via the containerized path**

Same three-task set as the pre-change smoke (Task 4 of feature-dev outer):

```bash
nohup bash -c '
  set -a
  source /d/SkVM/.env
  source /d/SkVM/temp/harbor.env
  set +a
  cd /d/SkVM
  bun run skvm bench \
    --source=terminalbench \
    --adapter=pi \
    --model=longcat/LongCat-2.0 \
    --conditions=no-skill \
    --judge-model=deepseek/deepseek-v4-flash \
    --tasks=tb-git-leak-recovery,tb-db-wal-recovery,tb-cancel-async-tasks \
    2>&1
' > D:/skvm-cache/log/bench/tmp/longcat-container-smoke-$(date +%Y%m%d-%H%M%S).tee.log 2>&1 &
```

Expected: session id like `<ts>-bench-LongCat-2.0-no-skill` under `D:/skvm-cache/log/bench/`. Bun starts at ~50 MB RSS.

- [ ] **Step 3: Wait for completion (~45 min) and Read the report**

Use the `Read` tool to inspect `D:/skvm-cache/log/bench/<new-session>/report.md`. **Do NOT `grep` or `require()` progress.json or report.json** — those are verifier-owned.

- [ ] **Step 4: Validate — the key regression signal**

Check the report:
- **tb-db-wal-recovery** must NO LONGER be `timeout`. If the model still emits `find /`, the container will run it against the real container root — fast, bounded output, no host filesystem traversal.
- Container path evidence in `<session>/tb-db-wal-recovery/no-skill.jsonl`: the `find /` command (if issued) should complete in seconds with real container /-tree output (`/bin`, `/etc`, `/app`, `/proc`), NOT with `AppData\Local\Temp\` paths.

- [ ] **Step 5: Save the evidence artifact and commit design doc addendum**

Copy the new session's report to `docs/skvm/containerized-agent-tb-smoke.md` as the "validation" section, appending the exec time / pass rate delta vs the pre-change smoke (Pass rate 50% → target: better; timeout on tb-db-wal-recovery → target: no).

```bash
cp D:/skvm-cache/log/bench/<new-session>/report.md docs/skvm/containerized-agent-tb-smoke.md
git add docs/skvm/containerized-agent-tb-smoke.md
git commit -m "docs(bench): validation artifact for containerized pi smoke (LongCat 3 tasks)"
```

---

## Task 7: Regression sanity — non-TB task still runs on host

**Files:**
- None (validation task).

- [ ] **Step 1: Pick a non-TB task**

Run `ls skvm-data/tasks/ | head -20`. Any task without a `tb-` prefix (or with `tbDockerImage` unset in its `task.json`) is non-TB. Pick one that is fast, e.g. `task_00_sanity` or the smallest task-id in the list.

- [ ] **Step 2: Run a 1-task bench on the non-TB task**

```bash
bun run skvm bench --adapter=pi --model=deepseek/deepseek-v4-flash --tasks=<non-tb-task-id> --conditions=no-skill
```

- [ ] **Step 3: Confirm host path was taken**

The log should NOT contain `docker run … sleep 36000` — the container-mode branch only activates for `tbDockerImage`-carrying tasks. If a container starts for a non-TB task, that's a regression: the branch check is wrong. Fix by revisiting Task 5 Step 4.

Expected: bench passes/fails per task expectations, but no docker container is created for the agent.

---

## Task 8: Documentation update — README + memory

**Files:**
- Modify: `README.md` (append a short section under "Benchmarks" mentioning container-mode agents for TB).
- Modify: `docs/skvm/containerized-agent-tb.md` (add validation results section).

- [ ] **Step 1: Read README.md and locate the Benchmarks section**

- [ ] **Step 2: Add a subsection**

```markdown
### Containerized agent for Terminal-Bench

For TB 2.1 tasks (identified by `tbDockerImage`), the `pi` adapter runs
inside the task's Docker image with the host workDir bind-mounted at `/app`.
This ensures agent-issued shell commands (`find /`, `grep -r`, etc.) execute
in a Linux container against `/app` instead of hitting the Windows host
filesystem via MSYS.

Opt-out for debugging: `SKVM_PI_HOST_MODE=1 bun run skvm bench …`.

See `docs/skvm/containerized-agent-tb.md` for the full design.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): document containerized pi agent for TB"
```

---

## Task 9: Update memory (append-only per PUA policy)

**Files:**
- Modify (APPEND ONLY): `C:\Users\27651\.claude\projects\D--SkVM\memory\skvm-longcat-setup.md`
- Add entry to: `C:\Users\27651\.claude\projects\D--SkVM\memory\MEMORY.md`

- [ ] **Step 1: Append a dated section to `skvm-longcat-setup.md`**

Append (do NOT edit existing content) at the bottom of the file:

```markdown

---

## 2026-07-XX (post containerization)

Rerun smoke after `feat(pi): add container branch`:

- tb-db-wal-recovery: TIMEOUT → PASS/FAIL (specific outcome from Task 6 report)
- Root cause of pre-change timeout was `find /` running against Windows host via git-bash — fixed by running pi inside `alexgshaw/db-wal-recovery:20251031` container.
- Opt-out: `SKVM_PI_HOST_MODE=1` restores host mode.
```

- [ ] **Step 2: Add a new entry to MEMORY.md index**

Add one line at the end of the SkVM Project Memory Index:

```markdown
- [SkVM 容器化 pi agent for TB](skvm-containerized-agent-tb.md) — pi 在 TB image 内跑；根因="find /" 触碰 Windows 宿主；已修（YYYY-MM-DD）
```

- [ ] **Step 3: Commit memory files (outside repo)**

Memory lives outside the git repo — no git commit. Just save the files.

---

## Self-Review

**Spec coverage:**
- ✅ Fix root cause of LongCat tb-db-wal-recovery timeout — Task 5 (containerize pi) + Task 6 (verify)
- ✅ Non-TB tasks unaffected — Task 7
- ✅ Docker daemon down path — `docker-run.ts` throws with clear message; propagates via existing subprocess-verdict → runStatus=adapter-crashed
- ✅ Opt-out for debugging — `SKVM_PI_HOST_MODE` guard in Tasks 4 + 5
- ✅ Design doc + validation artifact — Tasks 1 + 6

**Placeholder scan:**
- The pi model id / route lookup inside `runInContainer` (Task 5 Step 3) has a FIXME comment about `resolveBackendModel(task.taskId ?? "")` — the model id is stored in `this.model` after `setup()`, not derived from `task.taskId`. **Fix inline before executing:** replace with `const modelId = resolveBackendModel(this.model)` — or use `this.model` directly since setup() already computed it. This is a real bug in the plan — mark the step to double-check the actual setup() code path.

- `Approach B (npx inside container) is deferred` in Task 5 — this is a deliberate scope limit, documented with a clear error message. Not a placeholder.

**Type consistency:**
- `AdapterRunTask.tbDockerImage?: string` used in Task 3, 5, and 7 — consistent.
- `DockerContainer.name` / `DockerContainer.cleanup()` used in Task 2 + 5 — consistent.
- `execInContainer(opts).timedOut` / `.exitCode` / `.stdout` — matches shape of `runSubprocess`'s `SubprocessResult`, consistent with `subprocessVerdict` consumer.

**Gaps found and fixed:**
- Added the `resolveBackendModel` FIXME to Step 5 above as a self-audit item.
- Task 5 Step 3 originally omitted the skill.discover branch for `--skill` argument — added.

---

## Execution Notes

- **Total estimated time:** 5-8 hours of active work, spread across tasks.
- **Estimated cost:** the Task 6 smoke bench costs ~$0.5 in API calls (3 LongCat tasks).
- **Prerequisites:** Docker Desktop running; a bind-mountable pi binary (Bun-compiled `dist/pi` OR the npm-installed pi.exe if it turns out to be a real Linux binary and not a .cmd wrapper).
- **Risk:** Task 5's `resolvePiBinaryForContainer` on Windows may need to detect the pi.exe format. If it's a Windows .cmd wrapper, containerization won't work without switching to Approach B (npx inside container) — deferred but easy to add.
- **PUA integrity:** three test files (`test/core/docker-run.test.ts`, `test/adapters/pi.container.test.ts`, `test/bench/run-condition.test.ts`) are produced by this plan but MUST NOT be staged in commits. The verifier owner reviews and commits them separately.

---

**End of plan.**
