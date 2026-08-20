export type CfnextAnalyticsProps = {
  token: string
  spa?: boolean
}

export function CfnextAnalytics({ token, spa = true }: CfnextAnalyticsProps): {
  $$typeof: symbol
  type: "script"
  key: null
  ref: null
  props: {
    defer: true
    type: "module"
    src: string
    "data-cf-beacon": string
  }
} {
  return {
    $$typeof: Symbol.for("react.element"),
    type: "script",
    key: null,
    ref: null,
    props: {
      defer: true,
      type: "module",
      src: "https://static.cloudflareinsights.com/beacon.min.js",
      "data-cf-beacon": JSON.stringify({ token, spa }),
    },
  }
}
