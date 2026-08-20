export type WorkerFetcher = (
  request: Request,
  env: unknown,
  ctx: unknown,
) => Response | Promise<Response>

export type ExportedHandlerLike = {
  fetch?: WorkerFetcher
  email?: (...args: never[]) => unknown
  queue?: (...args: never[]) => unknown
  scheduled?: (...args: never[]) => unknown
}

export function asExportedHandler(value: unknown): ExportedHandlerLike {
  if (!value || typeof value !== "object" || typeof (value as ExportedHandlerLike).fetch !== "function") {
    throw new Error("worker default export must include fetch")
  }
  return value as ExportedHandlerLike
}

export function composeWorker(base: ExportedHandlerLike, extra: ExportedHandlerLike): ExportedHandlerLike {
  if (extra.fetch) {
    throw new Error("extra fetch is not allowed; the user worker owns fetch")
  }
  return {
    ...base,
    ...(extra.email ? { email: extra.email } : {}),
    ...(extra.queue ? { queue: extra.queue } : {}),
    ...(extra.scheduled ? { scheduled: extra.scheduled } : {}),
  }
}
