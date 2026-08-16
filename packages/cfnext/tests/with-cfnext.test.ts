import { expect, test } from "bun:test"
import { existsSync } from "node:fs"

import { withCfnext } from "../src/with-cfnext"

test("withCfnext injects a resolvable adapterPath without dropping other config", () => {
  const config = withCfnext({ poweredByHeader: false })
  expect(config.poweredByHeader).toBe(false)
  expect(typeof config.adapterPath).toBe("string")
  expect(existsSync(config.adapterPath)).toBe(true)
  expect(config.adapterPath).toMatch(/adapter\.(ts|js|mjs)$/)
})
