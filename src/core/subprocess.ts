/**
 * Single subprocess runner shared by the CLI-wrapping adapters and the
 * headless-agent drivers. Spawns with kill-on-timeout and drains
 * stdout/stderr in parallel with waiting for exit — draining concurrently
 * avoids pipe deadlock when the child's output exceeds the OS pipe buffer
 * (~64 KB on macOS) while the parent blocks on `proc.exited`.
 */

import { existsSync } from "node:fs"

export interface SubprocessResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
}

export interface SubprocessOptions {
  /** Working directory for the child process. */
  cwd?: string
  /** Kill the child after this many milliseconds; `result.timedOut` is set. */
  timeoutMs?: number
  /**
   * Environment overlay merged over `process.env`. A value of `undefined`
   * removes that variable from the child's environment.
   */
  env?: Record<string, string | undefined>
}

/**
 * On Windows under Git Bash / MSYS, `which <name>` returns MSYS drive paths
 * (`/d/...`) that `Bun.spawn` cannot resolve (it expects `D:\\...` or `D:/...`).
 * Adapter `tierGlobal` resolvers feed that path straight back as `cmd[0]`,
 * producing `ENOENT uv_spawn`. Convert MSYS drive paths to Windows paths and,
 * if the bare path doesn't exist, try `.exe` (e.g. `pi` → `pi.exe`, the
 * bun-compiled binary in `node_modules/.bin`). No-op on non-win32 and for bare
 * command names (`bash`, `docker`, ...) that Bun resolves via PATH.
 */
function resolveCmd0ForSpawn(cmd0: string): string {
  if (process.platform !== "win32") return cmd0
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(cmd0)
  if (!m) return cmd0
  const win = `${m[1]!.toUpperCase()}:/${m[2]}`
  if (existsSync(win)) return win
  if (existsSync(win + ".exe")) return win + ".exe"
  return win
}

export async function runSubprocess(
  cmd: string[],
  opts?: SubprocessOptions,
): Promise<SubprocessResult> {
  const env = opts?.env && Object.keys(opts.env).length > 0
    ? mergeEnv(process.env, opts.env)
    : process.env
  const start = Date.now()
  const spawnCmd = cmd.length > 0
    ? [resolveCmd0ForSpawn(cmd[0]!), ...cmd.slice(1)]
    : cmd
  const proc = Bun.spawn(spawnCmd, {
    cwd: opts?.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env,
  })

  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  if (opts?.timeoutMs) {
    timer = setTimeout(() => {
      timedOut = true
      proc.kill()
    }, opts.timeoutMs)
  }

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited.then((code) => { if (timer) clearTimeout(timer); return code }),
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr, durationMs: Date.now() - start, timedOut }
}

function mergeEnv(
  base: NodeJS.ProcessEnv,
  overlay: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) if (typeof v === "string") out[k] = v
  for (const [k, v] of Object.entries(overlay)) {
    if (v === undefined) delete out[k]
    else out[k] = v
  }
  return out
}
