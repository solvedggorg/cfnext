import { GenerateError } from "../generate"
import { fail } from "./run"

export function failIfGenerate(error: unknown): never {
  if (error instanceof GenerateError) fail(error.message)
  throw error
}
