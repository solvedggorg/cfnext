import { expect, test } from "bun:test"

import { sendEmail } from "../src/server/email"
import { runWithCloudflareContext } from "../src/ssr/context"

test("sendEmail wraps env.EMAIL.send", async () => {
  const calls: unknown[] = []
  const EMAIL = {
    send: async (message: unknown) => {
      calls.push(message)
      return { messageId: "msg_1" }
    },
  }
  const result = await runWithCloudflareContext(
    { request: new Request("https://example.com"), env: { EMAIL }, ctx: { waitUntil() {} } },
    () =>
      sendEmail({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Welcome",
        text: "hi",
      }),
  )
  expect(result).toEqual({ messageId: "msg_1" })
  expect(calls).toEqual([
    {
      to: "user@example.com",
      from: "noreply@example.com",
      subject: "Welcome",
      text: "hi",
    },
  ])
})

test("sendEmail throws when EMAIL is missing", async () => {
  await runWithCloudflareContext(
    { request: new Request("https://example.com"), env: {}, ctx: { waitUntil() {} } },
    async () => {
      await expect(
        sendEmail({ to: "a@b.c", from: "c@d.e", subject: "x" }),
      ).rejects.toThrow(/EMAIL/)
    },
  )
})
