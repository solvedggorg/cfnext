import { AsyncLocalStorage } from "node:async_hooks"

export type AccessIdentity = {
  email?: string
  name?: string
  groups?: string[]
  [key: string]: unknown
}

export type CloudflareExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void
  access?: {
    aud?: string
    getIdentity: () => Promise<AccessIdentity | null>
  }
}

export type CloudflareRequestContext<E = CloudflareEnv> = {
  request: Request
  env: E
  ctx: CloudflareExecutionContext
}

declare global {
  interface CloudflareEnv {
    ASSETS?: {
      fetch: (input: Request | URL | string, init?: RequestInit) => Promise<Response>
    }
  }
}

const storage = new AsyncLocalStorage<CloudflareRequestContext>()

export function getCloudflareContext<E = CloudflareEnv>(): CloudflareRequestContext<E> {
  const store = storage.getStore()
  if (!store) {
    if (process.env.CFNEXT_TARGET === "container") {
      throw new Error(
        "getCloudflareContext() is Worker-only; bindings are not available inside the container",
      )
    }
    throw new Error("getCloudflareContext() called outside a request")
  }
  return store as CloudflareRequestContext<E>
}

export function runWithCloudflareContext<T, E = CloudflareEnv>(
  store: CloudflareRequestContext<E>,
  fn: () => T,
): T {
  return storage.run(store as CloudflareRequestContext, fn)
}
