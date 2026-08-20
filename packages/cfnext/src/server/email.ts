import { getCloudflareContext } from "../ssr/context"

export type SendEmailAddress = string | { email: string; name?: string }

export type SendEmailMessage = {
  to: SendEmailAddress | SendEmailAddress[]
  from: SendEmailAddress
  subject: string
  html?: string
  text?: string
  replyTo?: SendEmailAddress
  cc?: SendEmailAddress | SendEmailAddress[]
  bcc?: SendEmailAddress | SendEmailAddress[]
  headers?: Record<string, string>
}

export type SendEmailResult = {
  messageId?: string
}

export type SendEmailBinding = {
  send: (message: SendEmailMessage) => Promise<SendEmailResult | void>
}

export type EmailEnv = {
  EMAIL?: SendEmailBinding
}

function emailBinding(env?: EmailEnv): SendEmailBinding {
  const email = env?.EMAIL ?? (getCloudflareContext().env as EmailEnv).EMAIL
  if (!email?.send) {
    throw new Error("Email binding EMAIL is not configured. Run `cfnext add email`.")
  }
  return email
}

export async function sendEmail(message: SendEmailMessage, env?: EmailEnv): Promise<SendEmailResult> {
  const result = await emailBinding(env).send(message)
  return result ?? {}
}
