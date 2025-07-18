// data
export type LooseObject = { [key: string]: any };
export type Primitive = string | number | boolean | null | undefined;
export type Data = { [key: string]: Primitive };

// tools
export type Merge<T, U> = Omit<T, Extract<keyof T, keyof U>> & U;
export type MaybePromise<T> = T | Promise<T>;
export type PartialByKeys<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;
export type EventType<
  T extends EventTarget,
  U = keyof T,
> = U extends `on${infer K}` ? K : never;
