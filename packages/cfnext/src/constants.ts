export const OUT_DIR = ".cloudflare"
export const ASSETS_DIR = ".cloudflare/assets"
export const COMPATIBILITY_DATE = "2026-08-16"
export const ADAPTER_NAME = "cfnext"
export const DEFAULT_CONTAINER_PORT = 8080
export const DEFAULT_CONTAINER_INSTANCE = "standard-1"
export const CFNEXT_VERSION = "0.6.0"
export const CFNEXT_JSON_FILES = ["cfnext.json", "cfnext.jsonc"] as const
export const HOOKS_FILE = "cfnext.hooks.ts"
export const LEGACY_CONFIG_FILES = ["cfnext.config.ts", "cfnext.config.mjs", "cfnext.config.js"] as const
// solved.gg micro registry: serves cfnext, passes everything else to npm.
// Project bunfig.toml points here so Cloudflare Builds can install cfnext.
export const REGISTRY_URL = "https://registry1.solved.gg"
