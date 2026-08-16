import { Readable, Writable } from "node:stream"

export type NodeIncomingMessage = Readable & {
  url?: string
  method?: string
  headers: Record<string, string | string[] | undefined>
  httpVersion: string
}

export type NodeServerResponse = Writable & {
  statusCode: number
  setHeader: (name: string, value: string | number | readonly string[]) => NodeServerResponse
  getHeader: (name: string) => string | number | string[] | undefined
  removeHeader: (name: string) => void
  writeHead: (
    status: number,
    headers?: Record<string, string | number | string[]>,
  ) => NodeServerResponse
}

export type NodeHandler = (
  req: NodeIncomingMessage,
  res: NodeServerResponse,
  ctx?: {
    waitUntil?: (promise: Promise<void>) => void
    requestMeta?: Record<string, unknown>
  },
) => Promise<void | null> | void | null

class IncomingMessage extends Readable implements NodeIncomingMessage {
  url: string
  method: string
  headers: Record<string, string | string[] | undefined>
  httpVersion = "1.1"
  private body: Uint8Array
  private sent = false

  constructor(request: Request, body: Uint8Array) {
    super()
    const url = new URL(request.url)
    this.url = `${url.pathname}${url.search}`
    this.method = request.method
    this.headers = headersToNode(request.headers)
    if (!this.headers.host) this.headers.host = url.host
    this.body = body
  }

  override _read(): void {
    if (this.sent) return
    this.sent = true
    if (this.body.byteLength > 0) this.push(this.body)
    this.push(null)
  }
}

class ServerResponse extends Writable implements NodeServerResponse {
  statusCode = 200
  private headerMap = new Map<string, string[]>()
  private chunks: Uint8Array[] = []
  readonly done: Promise<Response>
  private resolve!: (response: Response) => void

  constructor() {
    super()
    this.done = new Promise((resolve) => {
      this.resolve = resolve
    })
  }

  setHeader(name: string, value: string | number | readonly string[]): this {
    const values = Array.isArray(value) ? value.map(String) : [String(value)]
    this.headerMap.set(name.toLowerCase(), values)
    return this
  }

  getHeader(name: string): string | number | string[] | undefined {
    const values = this.headerMap.get(name.toLowerCase())
    if (!values || values.length === 0) return undefined
    return values.length === 1 ? values[0] : values
  }

  removeHeader(name: string): void {
    this.headerMap.delete(name.toLowerCase())
  }

  writeHead(status: number, headers?: Record<string, string | number | string[]>): this {
    this.statusCode = status
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        this.setHeader(key, value)
      }
    }
    return this
  }

  override _write(
    chunk: Buffer | Uint8Array | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk))
    callback()
  }

  override end(chunk?: unknown, encodingOrCb?: unknown, cb?: unknown): this {
    if (typeof chunk === "function") {
      super.end(chunk as () => void)
      return this
    }
    if (chunk !== undefined && chunk !== null) {
      this.write(chunk as never)
    }
    if (typeof encodingOrCb === "function") {
      super.end(encodingOrCb as () => void)
      return this
    }
    super.end(typeof cb === "function" ? (cb as () => void) : undefined)
    return this
  }

  override _final(callback: (error?: Error | null) => void): void {
    const headers = new Headers()
    for (const [key, values] of this.headerMap) {
      if (key === "set-cookie") {
        for (const value of values) headers.append(key, value)
      } else {
        headers.set(key, values.join(", "))
      }
    }
    const body = concat(this.chunks)
    this.resolve(new Response(Buffer.from(body), { status: this.statusCode, headers }))
    callback()
  }
}

export async function invokeNodeHandler(
  request: Request,
  handler: NodeHandler,
  ctx?: {
    waitUntil?: (promise: Promise<void>) => void
    requestMeta?: Record<string, unknown>
  },
): Promise<Response> {
  const body = request.body ? new Uint8Array(await request.arrayBuffer()) : new Uint8Array()
  const req = new IncomingMessage(request, body)
  const res = new ServerResponse()
  await handler(req, res, ctx)
  if (!res.writableEnded) res.end()
  return await res.done
}

function headersToNode(headers: Headers): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {}
  headers.forEach((value, key) => {
    const name = key.toLowerCase()
    if (name === "set-cookie") {
      const prev = out[name]
      out[name] = prev ? (Array.isArray(prev) ? [...prev, value] : [prev, value]) : [value]
      return
    }
    out[name] = value
  })
  return out
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}
