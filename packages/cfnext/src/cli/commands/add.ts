import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import {
  applyBinding,
  BINDING_KINDS,
  provisionCommand,
  type BindingKind,
} from "../../bindings"
import { catalogKind, implementedAddKinds } from "../../catalog"
import { findCfnextJson, inferName, loadConfig } from "../../config"
import { GenerateError, generate } from "../../generate"
import { parseJsonc, stringifyJsonc } from "../../jsonc"
import type { CfnextJson } from "../../schema"
import { ensureWrangler, mergeWrangler, wranglerPath } from "../../wrangler"
import { type Args, flagBool, flagString } from "../args"
import { fail, run } from "../run"
import { findProjectRoot } from "../find-root"

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
    case "d1": {
      const list = [...(bindings.d1 ?? [])]
      const existing = list.find((item) => item.binding === binding)
      if (existing) {
        if (extras.previewId) existing.previewId = extras.previewId
        if (extras.id) existing.id = extras.id
      } else {
        list.push({
          binding,
          databaseName: resourceName,
          migrationsDir: "migrations",
          ...(extras.id ? { id: extras.id } : {}),
          ...(extras.previewId ? { previewId: extras.previewId } : {}),
        })
      }
      bindings.d1 = list
      break
    }
    case "r2": {
      const list = [...(bindings.r2 ?? [])]
      if (!list.some((item) => item.binding === binding)) {
        list.push({ binding, bucketName: resourceName })
      }
      bindings.r2 = list
      break
    }
    case "kv": {
      const list = [...(bindings.kv ?? [])]
      const existing = list.find((item) => item.binding === binding)
      if (existing) {
        if (extras.previewId) existing.previewId = extras.previewId
        if (extras.id) existing.id = extras.id
      } else {
        list.push({
          binding,
          ...(extras.id ? { id: extras.id } : {}),
          ...(extras.previewId ? { previewId: extras.previewId } : {}),
        })
      }
      bindings.kv = list
      break
    }
    case "hyperdrive": {
      const list = [...(bindings.hyperdrive ?? [])]
      if (!list.some((item) => item.binding === binding)) {
        list.push({ binding, ...(extras.id ? { id: extras.id } : {}) })
      }
      bindings.hyperdrive = list
      break
    }
    case "ai": {
      next.ai = { ...next.ai, binding }
      break
    }
    case "vectorize": {
      const list = [...(bindings.vectorize ?? [])]
      if (!list.some((item) => item.binding === binding)) {
        list.push({ binding, indexName: resourceName })
      }
      bindings.vectorize = list
      break
    }
    case "queue": {
      const list = [...(bindings.queues ?? [])]
      if (!list.some((item) => item.binding === binding)) {
        list.push({ binding, queue: resourceName, consume: extras.consume ?? false })
      }
      bindings.queues = list
      break
    }
  }
  return next
}

function writeBackId(json: CfnextJson, kind: BindingKind, binding: string, id: string): CfnextJson {
  if (kind === "d1") {
    const item = json.bindings?.d1?.find((row) => row.binding === binding)
    if (item) item.id = id
  }
  if (kind === "kv") {
    const item = json.bindings?.kv?.find((row) => row.binding === binding)
    if (item) item.id = id
  }
  if (kind === "hyperdrive") {
    const item = json.bindings?.hyperdrive?.find((row) => row.binding === binding)
    if (item) item.id = id
  }
  return json
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

export async function addCommand(args: Args): Promise<void> {
  const kind = args.positionals[0]
  const catalog = kind ? catalogKind(kind) : undefined
  if (!kind || !catalog) {
    fail(`Usage: cfnext add ${implementedAddKinds().join("|")}`)
  }
  if (!catalog.emitImplemented || !BINDING_KINDS.includes(kind as BindingKind)) {
    fail(
      catalog.emitImplemented
        ? `Unknown binding ${kind}`
        : `${kind} is not implemented in this version (${catalog.phase}).`,
    )
  }

  const root = findProjectRoot()
  const bindingKind = kind as BindingKind
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

  if (bindingKind === "hyperdrive" && !explicitId && !flagBool(args.flags, "provision")) {
    fail("hyperdrive requires --id or --provision (wrangler id is required).")
  }
  if (consume && bindingKind === "queue") {
    fail("queue --consume is not implemented in this version (P1).")
  }

  const jsonPath = findCfnextJson(root)
  const wranglerFile = wranglerPath(root)
  const wranglerText = existsSync(wranglerFile) ? await readFile(wranglerFile, "utf8") : ""
  const wranglerGenerated = wranglerText.includes("@generated by cfnext")

  if (!jsonPath && !wranglerGenerated) {
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
    if (bindingKind === "d1") {
      const migrations = join(root, "migrations")
      if (!existsSync(migrations)) {
        await mkdir(migrations, { recursive: true })
        await writeFile(join(migrations, "0001_init.sql"), "-- Apply with: bun x wrangler d1 migrations apply DB --local\n")
      }
    }
    const provision = provisionCommand(bindingKind, applied.resourceName)
    console.log(`added ${kind} binding ${applied.binding} (${applied.resourceName})`)
    if (flagBool(args.flags, "provision") && provision) {
      await run(provision.split(" "), root)
      return
    }
    if (provision) console.log(`Provision with:\n  ${provision}`)
    return
  }

  if (!jsonPath && wranglerGenerated) {
    fail("cfnext.json is required. A @generated wrangler.jsonc cannot be the source of truth.")
  }

  const dest = jsonPath ?? join(root, "cfnext.json")
  const raw = existsSync(dest) ? await readFile(dest, "utf8") : "{}\n"
  let json = existsSync(dest) ? parseJsonc<CfnextJson>(raw) : { $schema: "./node_modules/cfnext/schema/cfnext.schema.json" }
  json.$schema ??= "./node_modules/cfnext/schema/cfnext.schema.json"
  json.name ??= inferName(root)

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

  if (bindingKind === "d1") {
    const migrations = join(root, "migrations")
    if (!existsSync(migrations)) {
      await mkdir(migrations, { recursive: true })
      await writeFile(join(migrations, "0001_init.sql"), "-- Apply with: bun x wrangler d1 migrations apply DB --local\n")
    }
  }

  const hasComments = /\/\//.test(raw) || /\/\*/.test(raw)
  await writeFile(dest, stringifyJsonc(json))
  console.log(`added ${kind} binding ${binding} (${resourceName}) → ${dest}`)

  const provision = catalog.provision?.(undefined, json.name ?? inferName(root))
  if (flagBool(args.flags, "provision") && provision) {
    const proc = Bun.spawn(provision, { cwd: root, stdout: "pipe", stderr: "inherit" })
    const stdout = await new Response(proc.stdout).text()
    process.stdout.write(stdout)
    const code = await proc.exited
    if (code !== 0) fail(`Provision failed (${code}): ${provision.join(" ")}`)
    const id = parseCreatedId(bindingKind, stdout)
    if (id && !hasComments) {
      json = writeBackId(json, bindingKind, binding, id)
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
    if (error instanceof GenerateError) fail(error.message)
    throw error
  }
}
