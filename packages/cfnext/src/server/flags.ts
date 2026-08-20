import { createRequire } from "node:module"

import { getCloudflareContext } from "../ssr/context"

export type FlagshipEvaluationContext = Record<string, unknown>

export type FlagshipBinding = {
  getBooleanValue: (
    key: string,
    defaultValue: boolean,
    context?: FlagshipEvaluationContext,
  ) => Promise<boolean>
  get?: (key: string, defaultValue?: unknown, context?: FlagshipEvaluationContext) => Promise<unknown>
}

const require = createRequire(import.meta.url)

function flagsBinding(env?: { FLAGS?: FlagshipBinding }): FlagshipBinding {
  const flags = env?.FLAGS ?? (getCloudflareContext().env as { FLAGS?: FlagshipBinding }).FLAGS
  if (!flags?.getBooleanValue) {
    throw new Error("Flagship binding FLAGS is not configured. Run `cfnext add flagship`.")
  }
  return flags
}

export async function getBooleanValue(
  key: string,
  defaultValue: boolean,
  context?: FlagshipEvaluationContext,
  env?: { FLAGS?: FlagshipBinding },
): Promise<boolean> {
  return flagsBinding(env).getBooleanValue(key, defaultValue, context)
}

export function resolveOpenFeature(): string | null {
  try {
    return require.resolve("@cloudflare/flagship")
  } catch {
    return null
  }
}

export async function openFeatureClient(binding?: FlagshipBinding): Promise<unknown | null> {
  if (!resolveOpenFeature()) return null
  try {
    require.resolve("@openfeature/server-sdk")
  } catch {
    return null
  }
  const { FlagshipServerProvider } = require("@cloudflare/flagship/server") as {
    FlagshipServerProvider: new (opts: { binding: unknown }) => unknown
  }
  const { OpenFeature } = require("@openfeature/server-sdk") as {
    OpenFeature: {
      setProviderAndWait: (provider: unknown) => Promise<void>
      getClient: () => unknown
    }
  }
  const flags = binding ?? flagsBinding()
  await OpenFeature.setProviderAndWait(new FlagshipServerProvider({ binding: flags }))
  return OpenFeature.getClient()
}
