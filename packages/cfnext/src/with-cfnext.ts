import { adapterPath } from "./adapter"

export type CfnextWrappedConfig<T extends object = Record<string, unknown>> = T & {
  adapterPath: string
}

/** Wrap a `next.config.ts` object so Next.js loads the cfnext adapter.

Accepts any config object shape (NextConfig has no index signature, so the
constraint must be `object`, not `Record<string, unknown>`). */
export function withCfnext<T extends object>(config: T = {} as T): CfnextWrappedConfig<T> {
  return {
    ...config,
    adapterPath:
      (config as { adapterPath?: string }).adapterPath ?? adapterPath(),
  }
}
