export type LooseObject = Record<string, unknown>;
export type Merge<T, U> = T extends unknown ? Omit<T, keyof U> & U : never;
