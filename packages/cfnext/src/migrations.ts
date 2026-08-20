import type { CfnextJson, CfnextMigration, DurableObjectEntry } from "./schema"

export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MigrationError"
  }
}

export function classNamesInLog(migrations: CfnextMigration[] | undefined): Set<string> {
  const classes = new Set<string>()
  const tags = new Set<string>()
  for (const item of migrations ?? []) {
    if (!item.tag) throw new MigrationError("migrations[].tag must be non-empty")
    if (tags.has(item.tag)) throw new MigrationError(`duplicate migration tag ${item.tag}`)
    tags.add(item.tag)
    for (const name of item.newSqliteClasses ?? []) classes.add(name)
    for (const name of item.newClasses ?? []) classes.add(name)
    for (const rename of item.renamedClasses ?? []) {
      classes.delete(rename.from)
      classes.add(rename.to)
    }
    for (const name of item.deletedClasses ?? []) classes.delete(name)
  }
  return classes
}

function existingTags(migrations: CfnextMigration[] | undefined): Set<string> {
  return new Set((migrations ?? []).map((item) => item.tag))
}

export function uniqueMigrationTag(migrations: CfnextMigration[] | undefined, base: string): string {
  const tags = existingTags(migrations)
  if (!tags.has(base)) return base
  let index = 2
  while (tags.has(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

export function liveDoClasses(json: CfnextJson): Set<string> {
  const live = new Set<string>()
  if (json.target === "container") live.add("NextApp")
  for (const item of json.durableObjects ?? []) live.add(item.className)
  return live
}

export function assertMigrationsMatchLive(json: CfnextJson): void {
  const live = liveDoClasses(json)
  const historical = classNamesInLog(json.migrations)
  for (const name of live) {
    if (!historical.has(name)) {
      throw new MigrationError(
        `Durable Object class ${name} is live but missing from migrations[]. Run \`cfnext add do --class ${name}\`.`,
      )
    }
  }
  for (const name of historical) {
    if (!live.has(name)) {
      throw new MigrationError(
        `Durable Object class ${name} is in migrations[] but not durableObjects[]. Run \`cfnext rm do --class ${name}\`.`,
      )
    }
  }
}

export function assertReservedDo(entry: Pick<DurableObjectEntry, "binding" | "className">): void {
  if (entry.binding === "NEXT_APP" || entry.className === "NextApp") {
    throw new MigrationError("binding NEXT_APP and class NextApp are reserved for target: container")
  }
}

export function appendCreateMigration(json: CfnextJson, className: string, sqlite = true): CfnextJson {
  if (classNamesInLog(json.migrations).has(className)) return json
  const tag = uniqueMigrationTag(json.migrations, `cfnext-do-${className}`)
  const entry: CfnextMigration = sqlite
    ? { tag, newSqliteClasses: [className] }
    : { tag, newClasses: [className] }
  return { ...json, migrations: [...(json.migrations ?? []), entry] }
}

export function appendDeleteMigration(json: CfnextJson, className: string): CfnextJson {
  return {
    ...json,
    durableObjects: (json.durableObjects ?? []).filter((item) => item.className !== className),
    migrations: [
      ...(json.migrations ?? []),
      {
        tag: uniqueMigrationTag(json.migrations, `cfnext-do-${className}-del`),
        deletedClasses: [className],
      },
    ],
  }
}

export function appendRenameMigration(json: CfnextJson, from: string, to: string): CfnextJson {
  return {
    ...json,
    durableObjects: (json.durableObjects ?? []).map((item) =>
      item.className === from ? { ...item, className: to } : item,
    ),
    migrations: [
      ...(json.migrations ?? []),
      {
        tag: uniqueMigrationTag(json.migrations, `cfnext-do-${from}-${to}`),
        renamedClasses: [{ from, to }],
      },
    ],
  }
}

export function emitMigrations(json: CfnextJson, wrangler: { migrations?: Array<Record<string, unknown>> }): void {
  if (!json.migrations?.length) {
    if (json.target !== "container") delete wrangler.migrations
    return
  }
  wrangler.migrations = json.migrations.map((item) => {
    const row: Record<string, unknown> = { tag: item.tag }
    if (item.newSqliteClasses) row.new_sqlite_classes = item.newSqliteClasses
    if (item.newClasses) row.new_classes = item.newClasses
    if (item.deletedClasses) row.deleted_classes = item.deletedClasses
    if (item.renamedClasses) row.renamed_classes = item.renamedClasses
    return row
  })
}

export function importWranglerMigrations(
  rows: Array<Record<string, unknown>> | undefined,
): CfnextMigration[] | undefined {
  if (!rows?.length) return undefined
  return rows.map((row) => {
    const item: CfnextMigration = { tag: String(row.tag) }
    if (Array.isArray(row.new_sqlite_classes)) item.newSqliteClasses = row.new_sqlite_classes.map(String)
    if (Array.isArray(row.new_classes)) item.newClasses = row.new_classes.map(String)
    if (Array.isArray(row.deleted_classes)) item.deletedClasses = row.deleted_classes.map(String)
    if (Array.isArray(row.renamed_classes)) {
      item.renamedClasses = row.renamed_classes.map((entry) => {
        const rec = entry as { from: string; to: string }
        return { from: rec.from, to: rec.to }
      })
    }
    return item
  })
}

export function seedContainerMigration(json: CfnextJson): CfnextJson {
  if (json.target !== "container") return json
  if (classNamesInLog(json.migrations).has("NextApp")) return json
  return {
    ...json,
    migrations: [{ tag: "v1", newSqliteClasses: ["NextApp"] }, ...(json.migrations ?? [])],
  }
}
