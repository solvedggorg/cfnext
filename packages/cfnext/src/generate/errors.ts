export class GenerateError extends Error {
  readonly exitCode: number

  constructor(message: string, exitCode = 1) {
    super(message)
    this.name = "GenerateError"
    this.exitCode = exitCode
  }
}
