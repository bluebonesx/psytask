export type LooseObject = Record<string, unknown>;
export type Merge<T, U> = T extends unknown ? Omit<T, keyof U> & U : never;
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
