export type CfnextStreamProps = {
  src: string
  customerCode: string
  title?: string
  poster?: string
  autoplay?: boolean
  muted?: boolean
  loop?: boolean
  controls?: boolean
  width?: number | string
  height?: number | string
}

export type CfnextStreamElement = {
  $$typeof: symbol
  type: "iframe"
  key: null
  ref: null
  props: {
    src: string
    title: string
    allow: string
    allowFullScreen: true
    width: number | string
    height: number | string
    style: { border: "none" }
  }
}

function customerCode(code: string): string {
  return code.replace(/^customer-/i, "")
}

function queryString(props: CfnextStreamProps): string {
  const params = new URLSearchParams()
  if (props.autoplay) params.set("autoplay", "true")
  if (props.muted) params.set("muted", "true")
  if (props.loop) params.set("loop", "true")
  if (props.controls === false) params.set("controls", "false")
  if (props.poster) params.set("poster", props.poster)
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ""
}

export function streamIframeSrc({ src, customerCode: code, ...rest }: CfnextStreamProps): string {
  const query = queryString({ src, customerCode: code, ...rest })
  if (src.startsWith("http://") || src.startsWith("https://")) {
    const url = new URL(src)
    const extra = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query)
    extra.forEach((value, key) => {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value)
    })
    return url.toString()
  }
  const id = src.replace(/^\/+/, "")
  return `https://customer-${customerCode(code)}.cloudflarestream.com/${id}/iframe${query}`
}

export function CfnextStream(props: CfnextStreamProps): CfnextStreamElement {
  return {
    $$typeof: Symbol.for("react.element"),
    type: "iframe",
    key: null,
    ref: null,
    props: {
      src: streamIframeSrc(props),
      title: props.title ?? "Cloudflare Stream",
      allow: "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;",
      allowFullScreen: true,
      width: props.width ?? 1280,
      height: props.height ?? 720,
      style: { border: "none" },
    },
  }
}
