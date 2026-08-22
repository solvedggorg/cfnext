export function asExportedHandler(value: unknown): { fetch: Function } {
  if (!value || typeof value !== "object" || typeof (value as { fetch?: unknown }).fetch !== "function") {
    throw new Error("worker default export must include fetch");
  }
  return value as { fetch: Function };
}

type FetchLike = (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;

export type ComposedWorker = {
  fetch: FetchLike
  email?: unknown
  queue?: unknown
  scheduled?: unknown
}

/**
 * Combines the user's worker (assets / SSR) with generated named handlers
 * (email, queue, scheduled) and, when the build produced Next edge-route
 * bundles, an `edgeFetch` dispatcher that runs BEFORE the asset fallback so
 * dynamic API routes execute instead of hitting the static-assets layer.
 */
export function composeWorker(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): ComposedWorker {
  if (extra.fetch) {
    throw new Error("extra fetch is not allowed; the user worker owns fetch");
  }
  const named: Record<string, unknown> = {};
  if (extra.email) named.email = extra.email;
  if (extra.queue) named.queue = extra.queue;
  if (extra.scheduled) named.scheduled = extra.scheduled;

  const edgeFetch = extra.edgeFetch as
    | ((request: Request, ctx?: unknown) => Promise<Response | null> | Response | null)
    | undefined;
  if (!edgeFetch) {
    return { ...base, ...named } as ComposedWorker;
  }

  const baseFetch = base.fetch as FetchLike;
  return {
    ...base,
    ...named,
    async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
      const handled = await edgeFetch(request, ctx);
      if (handled instanceof Response) return handled;
      return baseFetch.call(base, request, env, ctx);
    },
  };
}
