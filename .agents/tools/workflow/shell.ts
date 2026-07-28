/**
 * Shell execution helpers.
 * Cross-platform: uses Bun.spawnSync with array args, no shell string splitting.
 */

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * Run a command with arguments as array (cross-platform safe).
 * No shell interpretation — paths with spaces work on all OS.
 */
export function exec(cmd: string, args: string[], opts?: { cwd?: string; quiet?: boolean }): ExecResult {
  if (!opts?.quiet) console.log(`  $ ${cmd} ${args.join(" ")}`)
  const result = Bun.spawnSync([cmd, ...args], {
    cwd: opts?.cwd ?? process.cwd(),
    stdio: ["inherit", "pipe", "pipe"],
  })
  const stdout = result.stdout?.toString()?.trim() ?? ""
  const stderr = result.stderr?.toString()?.trim() ?? ""
  if (!opts?.quiet && stdout) console.log(stdout)
  if (!opts?.quiet && stderr) console.error(stderr)
  return { exitCode: result.exitCode, stdout, stderr }
}

/**
 * Run a pnpm command cross-platform.
 * pnpm is the project's package manager.
 */
export function pnpm(args: string[], opts?: { cwd?: string; quiet?: boolean }): ExecResult {
  return exec("pnpm", args, opts)
}

/**
 * Run a git command cross-platform.
 */
export function git(args: string[], opts?: { cwd?: string; quiet?: boolean }): ExecResult {
  return exec("git", args, { ...opts, cwd: opts?.cwd ?? process.cwd() })
}

/**
 * Run a GitHub CLI command.
 */
export function gh(args: string[], opts?: { cwd?: string; quiet?: boolean }): ExecResult {
  return exec("gh", args, opts)
}
