import { expect, test } from "bun:test"

import { CfnextStream, streamIframeSrc } from "../src/media/stream"

test("CfnextStream builds the Stream player iframe", () => {
  const el = CfnextStream({
    src: "ce800be43a9772f4bb02f35b860fb516",
    customerCode: "igynxd2rwhmuoxw8",
  })
  expect(el.type).toBe("iframe")
  expect(el.props.src).toBe(
    "https://customer-igynxd2rwhmuoxw8.cloudflarestream.com/ce800be43a9772f4bb02f35b860fb516/iframe",
  )
  expect(el.props.allowFullScreen).toBe(true)
  expect(el.props.style).toEqual({ border: "none" })
  expect(el.props.width).toBe(1280)
  expect(el.props.height).toBe(720)
})

test("streamIframeSrc strips a customer- prefix and appends player flags", () => {
  expect(
    streamIframeSrc({
      src: "abc",
      customerCode: "customer-igynxd2rwhmuoxw8",
      autoplay: true,
      muted: true,
      loop: true,
      poster: "https://example.com/poster.jpg",
    }),
  ).toBe(
    "https://customer-igynxd2rwhmuoxw8.cloudflarestream.com/abc/iframe?autoplay=true&muted=true&loop=true&poster=https%3A%2F%2Fexample.com%2Fposter.jpg",
  )
})

test("streamIframeSrc passes through an absolute iframe URL", () => {
  expect(
    streamIframeSrc({
      src: "https://customer-abc.cloudflarestream.com/uid/iframe",
      customerCode: "unused",
      muted: true,
    }),
  ).toBe("https://customer-abc.cloudflarestream.com/uid/iframe?muted=true")
})
