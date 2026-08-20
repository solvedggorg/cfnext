import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { BINDING_KINDS, applyBinding, type BindingKind } from "../../bindings"
import { catalogKind, implementedAddKinds } from "../../catalog"
import { findCfnextJson, inferName, loadConfig } from "../../config"
import { generate, splitGenerated } from "../../generate"
import { parseJsonc, stringifyJsonc } from "../../jsonc"
import { MigrationError } from "../../migrations"
import type { CfnextBindings, CfnextJson } from "../../schema"
import { ensureWrangler, mergeWrangler, wranglerPath } from "../../wrangler"
import { type Args, flagBool, flagString } from "../args"
import { failIfGenerate } from "../fail-generate"
import { findProjectRoot } from "../find-root"
import {
  addCron,
  addDurableObject,
  addRequiredSecret,
  addSecretStore,
  addVar,
  addWorkflow,
  kebabFromClass,
  removeDurableObject,
  renameDurableObject,
  screamingName,
} from "../p1-mutate"
import { ensureDevDependency, WORKERS_TYPES_SPEC } from "../package-json"
import { fail, run } from "../run"
import {
  durableObjectStub,
  queueStub,
  scheduledStub,
  workflowStub,
  writeStubIfMissing,
} from "../stubs"

const D1_INIT_SQL = "-- Apply with: bun x wrangler d1 migrations apply DB --local\n"

async function ensureD1Migrations(root: string): Promise<void> {
  const migrations = join(root, "migrations")
  if (existsSync(migrations)) return
  await mkdir(migrations, { recursive: true })
  await writeFile(join(migrations, "0001_init.sql"), D1_INIT_SQL)
}

function updateOrPush<T extends { binding: string }>(
  list: T[],
  binding: string,
  create: () => T,
  update: (item: T) => T,
): T[] {
  const index = list.findIndex((item) => item.binding === binding)
  if (index === -1) return [...list, create()]
  const current = list[index]
  if (!current) return [...list, create()]
  const next = [...list]
  next[index] = update({ ...current })
  return next
}

function upsertJsonBinding(
  json: CfnextJson,
  kind: BindingKind,
  binding: string,
  resourceName: string,
  extras: { previewId?: string; id?: string; consume?: boolean },
): CfnextJson {
  const next: CfnextJson = {
    ...json,
    bindings: { ...json.bindings },
  }
  const bindings = next.bindings!

  switch (kind) {
    case "d1":
      bindings.d1 = updateOrPush(
        [...(bindings.d1 ?? [])],
        binding,
        () => ({
          binding,
          databaseName: resourceName,
          migrationsDir: "migrations",
          ...(extras.id ? { id: extras.id } : {}),
          ...(extras.previewId ? { previewId: extras.previewId } : {}),
        }),
        (item) => ({
          ...item,
          databaseName: resourceName,
          ...(extras.id ? { id: extras.id } : {}),
          ...(extras.previewId ? { previewId: extras.previewId } : {}),
        }),
      )
      break
    case "r2":
      bindings.r2 = updateOrPush(
        [...(bindings.r2 ?? [])],
        binding,
        () => ({ binding, bucketName: resourceName }),
        (item) => ({ ...item, bucketName: resourceName }),
      )
      break
    case "kv":
      bindings.kv = updateOrPush(
        [...(bindings.kv ?? [])],
        binding,
        () => ({
          binding,
          ...(extras.id ? { id: extras.id } : {}),
          ...(extras.previewId ? { previewId: extras.previewId } : {}),
        }),
        (item) => ({
          ...item,
          ...(extras.id ? { id: extras.id } : {}),
          ...(extras.previewId ? { previewId: extras.previewId } : {}),
        }),
      )
      break
    case "hyperdrive":
      bindings.hyperdrive = updateOrPush(
        [...(bindings.hyperdrive ?? [])],
        binding,
        () => ({ binding, ...(extras.id ? { id: extras.id } : {}) }),
        (item) => ({ ...item, ...(extras.id ? { id: extras.id } : {}) }),
      )
      break
    case "ai":
      next.ai = { ...next.ai, binding }
      break
    case "vectorize":
      bindings.vectorize = updateOrPush(
        [...(bindings.vectorize ?? [])],
        binding,
        () => ({ binding, indexName: resourceName }),
        (item) => ({ ...item, indexName: resourceName }),
      )
      break
    case "queue":
      bindings.queues = updateOrPush(
        [...(bindings.queues ?? [])],
        binding,
        () => ({ binding, queue: resourceName, consume: extras.consume ?? false }),
        (item) => ({ ...item, queue: resourceName, consume: extras.consume ?? item.consume }),
      )
      break
  }
  return next
}

function writeBackId(
  json: CfnextJson,
  kind: BindingKind,
  binding: string,
  id: string,
  environment?: string,
): { json: CfnextJson; written: boolean } {
  if (kind !== "d1" && kind !== "kv" && kind !== "hyperdrive") {
    return { json, written: false }
  }
  const bindings: CfnextBindings | undefined =
    environment && environment !== "preview" ? json.env?.[environment]?.bindings : json.bindings
  const list =
    kind === "d1" ? bindings?.d1 : kind === "kv" ? bindings?.kv : bindings?.hyperdrive
  const item = list?.find((row) => row.binding === binding)
  if (!item) return { json, written: false }
  item.id = id
  return { json, written: true }
}

function parseCreatedId(kind: BindingKind, stdout: string): string | null {
  if (kind === "d1" || kind === "hyperdrive") {
    return stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null
  }
  if (kind === "kv") {
    return stdout.match(/\b[0-9a-f]{32}\b/i)?.[0] ?? null
  }
  return null
}

function provisionEntry(kind: BindingKind, resourceName: string) {
  switch (kind) {
    case "d1":
      return { databaseName: resourceName, resource: resourceName }
    case "r2":
      return { bucketName: resourceName, resource: resourceName }
    case "vectorize":
      return { indexName: resourceName, resource: resourceName }
    case "queue":
      return { queue: resourceName, resource: resourceName }
    default:
      return { resource: resourceName }
  }
}

const P1_KINDS = new Set(["do", "workflow", "cron", "secret", "secret-store", "var"])

function mutateP1(json: CfnextJson, kind: string, args: Args): CfnextJson {
  const className = flagString(args.flags, "class")
  const rename = flagString(args.flags, "rename")
  if (kind === "do") {
    if (rename) {
      const [from, to] = rename.split(":")
      if (!from || !to) fail("Usage: cfnext add do --rename Old:New")
      return renameDurableObject(json, from, to)
    }
    if (flagBool(args.flags, "delete")) {
      if (!className) fail("Usage: cfnext add do --delete --class Name")
      return removeDurableObject(json, className)
    }
    if (!className) fail("Usage: cfnext add do --binding NAME --class ClassName")
    const binding = flagString(args.flags, "binding") ?? className
    return addDurableObject(json, {
      binding,
      className,
      ...(flagBool(args.flags, "no-sqlite") ? { sqlite: false } : {}),
    })
  }
  if (kind === "workflow") {
    if (!className) fail("Usage: cfnext add workflow --name name --binding NAME --class ClassName")
    const name = flagString(args.flags, "name") ?? kebabFromClass(className)
    const binding = flagString(args.flags, "binding") ?? screamingName(name)
    const expr = flagString(args.flags, "expr") ?? flagString(args.flags, "schedules")
    return addWorkflow(json, {
      name,
      binding,
      className,
      ...(expr ? { schedules: [expr] } : {}),
    })
  }
  if (kind === "cron") {
    const expr = flagString(args.flags, "expr")
    if (!expr) fail("Usage: cfnext add cron --expr \"0 * * * *\"")
    return addCron(json, expr)
  }
  if (kind === "secret-store") {
    const binding = flagString(args.flags, "binding")
    const storeId = flagString(args.flags, "store-id")
    const secretName = flagString(args.flags, "secret-name")
    if (!binding || !storeId || !secretName) {
      fail("Usage: cfnext add secret-store --binding NAME --store-id id --secret-name name")
    }
    return addSecretStore(json, { binding, storeId, secretName })
  }
  if (kind === "secret") {
    const name = flagString(args.flags, "name") ?? flagString(args.flags, "binding") ?? args.positionals[1]
    if (!name) fail("Usage: cfnext add secret --name SECRET_NAME")
    return addRequiredSecret(json, name)
  }
  if (kind === "var") {
    const name = flagString(args.flags, "name") ?? args.positionals[1]
    const value = flagString(args.flags, "value")
    if (!name || value === undefined) fail("Usage: cfnext add var --name NAME --value value")
    return addVar(json, name, value)
  }
  return json
}

async function writeP1Stubs(root: string, kind: string, args: Args): Promise<void> {
  const className = flagString(args.flags, "class")
  const rename = flagString(args.flags, "rename")
  if (kind === "do" && rename) {
    const to = rename.split(":")[1]
    if (to) await writeStubIfMissing(root, `durable-objects/${to}.ts`, durableObjectStub(to))
    await ensureDevDependency(root, "@cloudflare/workers-types", WORKERS_TYPES_SPEC)
    return
  }
  if (kind === "do" && className && !flagBool(args.flags, "delete")) {
    await writeStubIfMissing(root, `durable-objects/${className}.ts`, durableObjectStub(className))
    await ensureDevDependency(root, "@cloudflare/workers-types", WORKERS_TYPES_SPEC)
  }
  if (kind === "workflow" && className) {
    await writeStubIfMissing(root, `workflows/${className}.ts`, workflowStub(className))
    await ensureDevDependency(root, "@cloudflare/workers-types", WORKERS_TYPES_SPEC)
  }
  if (kind === "cron") {
    await writeStubIfMissing(root, "scheduled.ts", scheduledStub())
  }
  if (kind === "queue" && flagBool(args.flags, "consume")) {
    await writeStubIfMissing(root, "queue.ts", queueStub())
  }
}

export async function addCommand(args: Args): Promise<void> {
  const kind = args.positionals[0]
  const catalog = kind ? catalogKind(kind) : undefined
  if (!kind || !catalog) {
    fail(`Usage: cfnext add ${implementedAddKinds().join("|")}`)
  }
  if (!catalog.emitImplemented) {
    fail(`${kind} is not implemented in this version (${catalog.phase}).`)
  }

  const root = findProjectRoot()
  const isLegacyBinding = BINDING_KINDS.includes(catalog.kind as BindingKind)
  const bindingKind = catalog.kind as BindingKind
  const appName = inferName(root)
  const existingJsonPath = findCfnextJson(root)
  const existingName = existingJsonPath
    ? parseJsonc<CfnextJson>(await readFile(existingJsonPath, "utf8")).name
    : undefined
  const slug = existingName ?? appName
  const binding = flagString(args.flags, "binding") ?? catalog.defaults(slug).binding
  const resourceName = flagString(args.flags, "name") ?? catalog.defaults(slug).resource ?? binding
  const environment = flagString(args.flags, "environment")
  const previewId = flagString(args.flags, "preview-id")
  const explicitId = flagString(args.flags, "id")
  const consume = flagBool(args.flags, "consume")

  if (isLegacyBinding && bindingKind === "hyperdrive" && !explicitId && !flagBool(args.flags, "provision")) {
    fail("hyperdrive requires --id or --provision (wrangler id is required).")
  }

  const jsonPath = findCfnextJson(root)
  const wranglerFile = wranglerPath(root)
  const wranglerText = existsSync(wranglerFile) ? await readFile(wranglerFile, "utf8") : ""
  const wranglerGenerated = wranglerText ? splitGenerated(wranglerText).generated : false

  if (wranglerText && !wranglerGenerated && (jsonPath || !isLegacyBinding)) {
    fail("wrangler.jsonc is not @generated. Run `cfnext migrate wrangler` first.")
  }

  if (!jsonPath && !wranglerGenerated && isLegacyBinding) {
    console.warn("cfnext add: no cfnext.json; writing wrangler.jsonc directly (deprecated). Run `cfnext migrate wrangler`.")
    const config = await loadConfig(root)
    await ensureWrangler(root, config)
    let applied = { binding: "", resourceName: "" }
    await mergeWrangler(root, (current) => {
      const next = applyBinding(current, {
        kind: bindingKind,
        binding,
        resourceName,
      })
      applied = { binding: next.binding, resourceName: next.resourceName }
      return next.wrangler
    })
    if (bindingKind === "d1") await ensureD1Migrations(root)
    const provision = catalog.provision?.(provisionEntry(bindingKind, applied.resourceName), slug)
    console.log(`added ${kind} binding ${applied.binding} (${applied.resourceName})`)
    if (flagBool(args.flags, "provision") && provision) {
      await run(provision, root)
      return
    }
    if (provision) console.log(`Provision with:\n  ${provision.join(" ")}`)
    return
  }

  if (!jsonPath && wranglerGenerated) {
    fail("cfnext.json is required. A @generated wrangler.jsonc cannot be the source of truth.")
  }

  const dest = jsonPath ?? join(root, "cfnext.json")
  const raw = existsSync(dest) ? await readFile(dest, "utf8") : "{}\n"
  let json = existsSync(dest)
    ? parseJsonc<CfnextJson>(raw)
    : { $schema: "./node_modules/cfnext/schema/cfnext.schema.json" }
  json.$schema ??= "./node_modules/cfnext/schema/cfnext.schema.json"
  json.name ??= inferName(root)

  if (P1_KINDS.has(catalog.kind)) {
    const before = JSON.stringify(json)
    try {
      json = mutateP1(json, catalog.kind, args)
    } catch (error) {
      if (error instanceof MigrationError || error instanceof Error) fail(error.message)
      throw error
    }
    const unchanged = JSON.stringify(json) === before
    await writeP1Stubs(root, catalog.kind, args)
    await writeFile(dest, stringifyJsonc(json))
    console.log(unchanged ? `${kind} already present → ${dest}` : `added ${kind} → ${dest}`)
    try {
      await generate(root)
    } catch (error) {
      failIfGenerate(error)
    }
    return
  }

  const extras = {
    previewId: environment === "preview" || previewId ? previewId : undefined,
    id: explicitId,
    consume,
  }

  if (environment && environment !== "preview") {
    if (environment === "production") fail("Use the top-level bindings for production. env.production is illegal.")
    json.env = { ...json.env }
    const overlay = { ...json.env[environment], bindings: { ...json.env[environment]?.bindings } }
    const patched = upsertJsonBinding({ bindings: overlay.bindings }, bindingKind, binding, resourceName, extras)
    overlay.bindings = patched.bindings ?? {}
    if (bindingKind === "ai" && patched.ai) overlay.ai = patched.ai
    json.env[environment] = overlay
  } else {
    json = upsertJsonBinding(json, bindingKind, binding, resourceName, extras)
  }

  if (bindingKind === "d1") await ensureD1Migrations(root)
  if (catalog.kind === "queue" && consume) await writeP1Stubs(root, "queue", args)

  const hasComments = /\/\//.test(raw) || /\/\*/.test(raw)
  await writeFile(dest, stringifyJsonc(json))
  console.log(`added ${kind} binding ${binding} (${resourceName}) → ${dest}`)

  const provision = catalog.provision?.(provisionEntry(bindingKind, resourceName), json.name ?? slug)
  if (flagBool(args.flags, "provision") && provision) {
    const proc = Bun.spawn(provision, {
      cwd: root,
      stdin: "inherit",
      stdout: "pipe",
      stderr: "inherit",
    })
    const stdout = await new Response(proc.stdout).text()
    process.stdout.write(stdout)
    const code = await proc.exited
    if (code !== 0) fail(`Provision failed (${code}): ${provision.join(" ")}`)
    const id = parseCreatedId(bindingKind, stdout)
    if (id && !hasComments) {
      const written = writeBackId(json, bindingKind, binding, id, environment)
      json = written.json
      if (!written.written) fail(`provisioned ${kind} id ${id} but could not find binding ${binding} to write back`)
      await writeFile(dest, stringifyJsonc(json))
      console.log(`wrote ${kind} id ${id} into cfnext.json`)
    } else if (id) {
      console.log(`Paste id ${id} into cfnext.json (comments present; P0 write-back would drop them).`)
    }
  } else if (provision) {
    console.log(`Provision with:\n  ${provision.join(" ")}`)
  }

  try {
    await generate(root)
  } catch (error) {
    failIfGenerate(error)
  }
}
