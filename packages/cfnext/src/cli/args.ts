export type Args = {
  command: string
  positionals: string[]
  flags: Record<string, string | boolean>
}

const BOOLEAN_FLAGS = new Set([
  "yes",
  "y",
  "help",
  "h",
  "preview",
  "skip-install",
  "existing",
  "provision",
])

export function parseArgs(argv: string[]): Args {
  const raw = argv.slice(2)
  const positionals: string[] = []
  const flags: Record<string, string | boolean> = {}
  let command = "help"
  let i = 0

  if (raw[0] && !raw[0].startsWith("-")) {
    command = raw[0]
    i = 1
  }

  for (; i < raw.length; i++) {
    const tok = raw[i]!
    if (tok === "--") {
      positionals.push(...raw.slice(i + 1))
      break
    }
    if (tok.startsWith("--")) {
      const body = tok.slice(2)
      const eq = body.indexOf("=")
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1)
        continue
      }
      if (BOOLEAN_FLAGS.has(body) || raw[i + 1] === undefined || raw[i + 1]!.startsWith("-")) {
        flags[body] = true
        continue
      }
      flags[body] = raw[i + 1]!
      i += 1
      continue
    }
    if (tok.startsWith("-") && tok.length === 2) {
      flags[tok.slice(1)] = true
      continue
    }
    positionals.push(tok)
  }

  return { command, positionals, flags }
}

export function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key]
  if (typeof value === "string" && value.length > 0) return value
  return undefined
}

export function flagBool(flags: Record<string, string | boolean>, ...keys: string[]): boolean {
  return keys.some((key) => flags[key] === true || flags[key] === "true")
}
