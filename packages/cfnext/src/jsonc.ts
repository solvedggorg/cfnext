export function parseJsonc<T>(text: string): T {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1")
  return JSON.parse(stripped) as T
}

export function stringifyJsonc(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
