import { handleRegistry } from "./handler"
import type { Limiters } from "./rate-limit"

export default {
  async fetch(request: Request, env: Limiters): Promise<Response> {
    return handleRegistry(request, env)
  },
}
