import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export function durableObjectStub(className: string): string {
  return `import { DurableObject } from "cloudflare:workers"

export class ${className} extends DurableObject<CloudflareEnv> {
  override async fetch(request: Request): Promise<Response> {
    return new Response("ok")
  }
}
`
}

export function workflowStub(className: string): string {
  return `import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"

export class ${className} extends WorkflowEntrypoint<CloudflareEnv, { orderId: string }> {
  async run(event: WorkflowEvent<{ orderId: string }>, step: WorkflowStep) {
    await step.do("noop", async () => event.payload.orderId)
  }
}
`
}

export function queueStub(): string {
  return `export async function queue(
  batch: MessageBatch<unknown>,
  env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<void> {
  for (const msg of batch.messages) msg.ack()
}
`
}

export function emailStub(): string {
  return `import type { ForwardableEmailMessage } from "@cloudflare/workers-types"

export async function email(
  message: ForwardableEmailMessage,
  env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<void> {
  await message.setReject("cfnext: implement email() in email.ts")
}
`
}

export function agentStub(className: string): string {
  return `import { Agent } from "agents"

export class ${className} extends Agent<CloudflareEnv> {
  async onRequest(request: Request): Promise<Response> {
    return new Response("ok")
  }
}
`
}

export function scheduledStub(): string {
  return `export async function scheduled(
  controller: ScheduledController,
  env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<void> {
  console.log("cfnext scheduled", controller.cron)
}
`
}

export async function writeStubIfMissing(root: string, rel: string, contents: string): Promise<boolean> {
  const path = join(root, rel)
  if (existsSync(path)) return false
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
  return true
}
