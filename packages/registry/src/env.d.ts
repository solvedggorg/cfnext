import type { RateLimit } from "./rate-limit"

interface RegistryEnv {
  META_LIMIT: RateLimit
  TARBALL_LIMIT: RateLimit
  GLOBAL_LIMIT: RateLimit
}
