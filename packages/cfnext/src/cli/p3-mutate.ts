import type { CfnextJson, CfnextMedia } from "../schema"

export type EmailAddOpts = {
  binding?: string
  destinationAddress?: string
  allowedDestinations?: string[]
  allowedSenders?: string[]
  remote?: boolean
  inbound?: boolean
  addresses?: string[]
}

export function addEmail(json: CfnextJson, opts: EmailAddOpts = {}): CfnextJson {
  const existing = json.email?.sending ?? {}
  const sending = {
    ...existing,
    binding: opts.binding ?? existing.binding ?? "EMAIL",
    ...(opts.destinationAddress ? { destinationAddress: opts.destinationAddress } : {}),
    ...(opts.allowedDestinations?.length ? { allowedDestinations: opts.allowedDestinations } : {}),
    ...(opts.allowedSenders?.length ? { allowedSenders: opts.allowedSenders } : {}),
    ...(opts.remote ? { remote: true } : {}),
  }
  const routing = opts.inbound
    ? {
        enabled: true,
        addresses: opts.addresses ?? json.email?.routing?.addresses ?? [],
      }
    : json.email?.routing
  return {
    ...json,
    email: {
      ...json.email,
      sending,
      ...(routing ? { routing } : {}),
    },
  }
}

function mergeImages(
  images: NonNullable<CfnextMedia["images"]> | undefined,
  patch: NonNullable<CfnextMedia["images"]>,
): NonNullable<CfnextMedia["images"]> {
  return { ...images, ...patch, loader: patch.loader ?? images?.loader }
}

export function addImages(
  json: CfnextJson,
  entry: { binding: string; remote?: boolean },
): CfnextJson {
  return {
    ...json,
    media: {
      ...json.media,
      images: mergeImages(json.media?.images, {
        binding: entry.binding,
        ...(entry.remote ? { remote: true } : {}),
      }),
    },
  }
}

export type ImageLoaderAddOpts = {
  kind: "cdn-cgi" | "imagedelivery"
  zoneOrigin?: string
  accountHash?: string
  remotePatterns?: Array<Record<string, unknown>>
}

export function addImageLoader(json: CfnextJson, opts: ImageLoaderAddOpts): CfnextJson {
  return {
    ...json,
    images: { ...json.images, unoptimized: false },
    media: {
      ...json.media,
      images: mergeImages(json.media?.images, {
        loader: {
          enabled: true,
          kind: opts.kind,
          ...(opts.zoneOrigin ? { zoneOrigin: opts.zoneOrigin } : {}),
          ...(opts.accountHash ? { accountHash: opts.accountHash } : {}),
          ...(opts.remotePatterns?.length ? { remotePatterns: opts.remotePatterns } : {}),
        },
      }),
    },
  }
}

export function addStream(
  json: CfnextJson,
  entry: { binding: string; remote?: boolean },
): CfnextJson {
  return {
    ...json,
    media: {
      ...json.media,
      stream: {
        binding: entry.binding,
        ...(entry.remote ? { remote: true } : {}),
      },
    },
  }
}

export function addMediaTransforms(
  json: CfnextJson,
  entry: { binding: string; remote?: boolean },
): CfnextJson {
  return {
    ...json,
    media: {
      ...json.media,
      transforms: {
        binding: entry.binding,
        remote: entry.remote ?? true,
      },
    },
  }
}

export function addRealtime(
  json: CfnextJson,
  entry: { enabled?: boolean; appId?: string } = {},
): CfnextJson {
  const appId = entry.appId ?? json.media?.realtime?.appId
  return {
    ...json,
    media: {
      ...json.media,
      realtime: {
        enabled: entry.enabled ?? true,
        ...(appId ? { appId } : {}),
      },
    },
  }
}
