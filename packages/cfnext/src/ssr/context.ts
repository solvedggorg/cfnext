import { AsyncLocalStorage } from "node:async_hooks"

export type CloudflareRequestContext = {
  request: Request
  env: unknown
  ctx: { waitUntil: (promise: Promise<unknown>) => void }
}

const storage = new AsyncLocalStorage<CloudflareRequestContext>()

export function getCloudflareContext(): CloudflareRequestContext {
  const store = storage.getStore()
  if (!store) {
    throw new Error("getCloudflareContext() called outside a request")
  }
  return store
}

export function runWithCloudflareContext<T>(
  store: CloudflareRequestContext,
  fn: () => T,
): T {
  return storage.run(store, fn)
}
