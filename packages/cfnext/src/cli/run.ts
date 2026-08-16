export function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

export async function run(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<void> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: { ...process.env, ...env },
  })
  const code = await proc.exited
  if (code !== 0) fail(`Command failed (${code}): ${cmd.join(" ")}`)
}

export function requireBun(): void {
  if (typeof Bun === "undefined") {
    fail("cfnext runs on Bun only. Install bun.sh and retry.")
  }
}
