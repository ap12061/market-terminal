declare const brand: unique symbol

/**
 * A nominal type: structurally a `T`, but only obtainable through a parse
 * function, so unvalidated values can't flow into the domain by accident.
 */
export type Brand<T, Name extends string> = T & { readonly [brand]: Name }

export class InvalidValueError extends Error {
  override name = 'InvalidValueError'

  constructor(kind: string, value: unknown) {
    super(`Invalid ${kind}: ${JSON.stringify(value)}`)
  }
}
