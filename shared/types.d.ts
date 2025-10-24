export type LooseObject = Record<string, any>;
export type Merge<T, U> = T extends any ? Omit<T, keyof U> & U : never;
