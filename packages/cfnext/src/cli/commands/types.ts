import { generate } from "../../generate"
import { generateCloudflareEnv } from "../../generate/env-types"
import { failIfGenerate } from "../fail-generate"
import { findProjectRoot } from "../find-root"

export async function typesCommand(): Promise<void> {
  const root = findProjectRoot()
  try {
    await generate(root, { implicit: true })
    const dest = await generateCloudflareEnv(root)
    console.log(`wrote ${dest}`)
  } catch (error) {
    failIfGenerate(error)
  }
}
