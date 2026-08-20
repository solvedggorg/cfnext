import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { findCfnextJson, loadProject, type LoadedProject } from "../config"
import { CFNEXT_VERSION } from "../constants"
import { stringifyJsonc } from "../jsonc"
import { seedContainerMigration } from "../migrations"
import { ensureWrangler, wranglerPath } from "../wrangler"
import { GenerateError } from "./errors"
import { isDirtyGenerated, splitGenerated, stampGenerated } from "./hash"
import { writeRuntimeConfig } from "./runtime-config"
import { writePlanFiles } from "./plans"
import { writeGeneratedWorker } from "./worker"
import { compileWrangler } from "./wrangler"

export type GenerateOptions = {
  implicit?: boolean
  force?: boolean
  check?: boolean
  dryRun?: boolean
}

export type GenerateResult = {
  skipped: boolean
  reason?: string
  wranglerText?: string
}

function generatedHeaderMissing(text: string): boolean {
  return !splitGenerated(text).generated
}

export async function generate(projectDir: string, opts: GenerateOptions = {}): Promise<GenerateResult> {
  const jsonPath = findCfnextJson(projectDir)
  const wranglerFile = wranglerPath(projectDir)
  const wranglerExists = existsSync(wranglerFile)
  const wranglerText = wranglerExists ? await readFile(wranglerFile, "utf8") : null
  const wranglerGenerated = wranglerText ? splitGenerated(wranglerText).generated : false

  if (!jsonPath) {
    if (wranglerGenerated) {
      throw new GenerateError("cfnext.json is required to regenerate a @generated wrangler.jsonc")
    }
    if (opts.implicit) {
      const project = await loadProject(projectDir)
      await ensureWrangler(projectDir, project.config)
      return { skipped: true, reason: "no cfnext.json; ensureWrangler only" }
    }
    throw new GenerateError("No cfnext.json / cfnext.jsonc. Run `cfnext migrate wrangler` to import an existing wrangler.jsonc.")
  }

  if (wranglerExists && !wranglerGenerated && !opts.force) {
    throw new GenerateError(
      "wrangler.jsonc is not @generated. Run `cfnext migrate wrangler` to import it.",
    )
  }

  if (wranglerExists && wranglerGenerated && isDirtyGenerated(wranglerText!) && !opts.force) {
    throw new GenerateError("wrangler.jsonc has been edited. Revert it or pass --force to overwrite.")
  }

  const project = await loadProject(projectDir)
  if (!project.json) throw new GenerateError("cfnext.json could not be parsed")

  let json = seedContainerMigration({
    ...project.json,
    target: project.json.target ?? project.config.target,
  })
  if (project.jsonPath && JSON.stringify(json) !== JSON.stringify(project.json)) {
    await writeFile(project.jsonPath, stringifyJsonc(json))
  }

  const wrangler = compileWrangler(project.config, json)
  const body = stringifyJsonc(wrangler)
  const nextText = stampGenerated(body, CFNEXT_VERSION, project.jsonPath ? project.jsonPath.split(/[\\/]/).pop() : "cfnext.json")

  if (opts.check) {
    if (wranglerText !== nextText) {
      throw new GenerateError("wrangler.jsonc is out of date. Run `cfnext generate`.")
    }
    await writeGeneratedWorker(projectDir, json, { check: true })
    return { skipped: false, wranglerText: nextText }
  }

  if (opts.dryRun) {
    await writeGeneratedWorker(projectDir, json, { dryRun: true })
    return { skipped: false, wranglerText: nextText }
  }

  await mkdir(join(projectDir, ".cloudflare/assets"), { recursive: true })
  await writeGeneratedWorker(projectDir, json)
  await writeFile(wranglerFile, nextText)
  await writeRuntimeConfig(
    projectDir,
    project.config,
    project.hooksHasClerkShells ? { shells: "clerkShells" } : null,
  )
  await writePlanFiles(projectDir, json)
  return { skipped: false, wranglerText: nextText }
}

export async function generateOrEnsure(projectDir: string): Promise<LoadedProject> {
  await generate(projectDir, { implicit: true })
  return loadProject(projectDir)
}

export { GenerateError } from "./errors"
export { compileWrangler } from "./wrangler"
export { stampGenerated, splitGenerated, isDirtyGenerated } from "./hash"
export { renderRuntimeConfig, RUNTIME_CONFIG_FILE } from "./runtime-config"
export { generateCloudflareEnv, CLOUDFLARE_ENV_FILE } from "./env-types"
