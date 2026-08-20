import { getCloudflareContext } from "../ssr/context"

export type WorkersAi = {
  run: (model: string, input: unknown, options?: unknown) => Promise<unknown>
}

export type VectorizeIndex = {
  query: (vector: number[], options?: { topK?: number }) => Promise<unknown>
}

export type AiEnv = {
  AI?: WorkersAi
  AI_GATEWAY_ID?: string
  VECTORIZE?: VectorizeIndex
}

function envValue<K extends keyof AiEnv>(key: K, env?: AiEnv): AiEnv[K] {
  if (env && env[key] !== undefined) return env[key]
  return (getCloudflareContext().env as AiEnv)[key]
}

export function getAi(env?: AiEnv): WorkersAi {
  const ai = envValue("AI", env)
  if (!ai?.run) {
    throw new Error("Workers AI binding AI is not configured. Run `cfnext add ai`.")
  }
  return ai
}

export async function runAi(
  model: string,
  input: unknown,
  env?: AiEnv,
  options?: unknown,
): Promise<unknown> {
  return getAi(env).run(model, input, options)
}

export type AiGatewayInfo = {
  id: string
  url?: string
  options: { gateway: { id: string } }
}

export function getAiGateway(
  env?: AiEnv,
  opts?: { accountId?: string; id?: string },
): AiGatewayInfo {
  const id = opts?.id ?? envValue("AI_GATEWAY_ID", env) ?? "default"
  const accountId = opts?.accountId
  return {
    id,
    ...(accountId
      ? { url: `https://gateway.ai.cloudflare.com/v1/${accountId}/${id}` }
      : {}),
    options: { gateway: { id } },
  }
}

export async function queryVectorize(
  vector: number[],
  options?: { topK?: number },
  env?: AiEnv,
): Promise<unknown> {
  const index = envValue("VECTORIZE", env)
  if (!index?.query) {
    throw new Error("Vectorize binding VECTORIZE is not configured. Run `cfnext add vectorize`.")
  }
  return index.query(vector, options)
}
