import { getCloudflareContext, type AccessIdentity } from "../ssr/context"

export type { AccessIdentity }

export async function getAccessIdentity(): Promise<AccessIdentity | null> {
  const { ctx } = getCloudflareContext()
  if (!ctx.access) return null
  return ctx.access.getIdentity()
}
