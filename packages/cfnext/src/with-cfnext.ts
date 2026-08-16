import { adapterPath } from "./adapter"

export type CfnextWrappedConfig<T extends Record<string, unknown> = Record<string, unknown>> =
  T & {
    adapterPath: string
  }

/** Wrap a `next.config.ts` object so Next.js loads the cfnext adapter. */
export function withCfnext<T extends Record<string, unknown>>(
  config: T = {} as T,
): CfnextWrappedConfig<T> {
  return {
    ...config,
    adapterPath: (config.adapterPath as string | undefined) ?? adapterPath(),
  }
}
