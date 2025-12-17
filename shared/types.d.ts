export type LooseObject = Record<string, unknown>;
export type Merge<T, U> = T extends unknown ? Omit<T, keyof U> & U : never;
type Split<T extends string, S extends string> = T extends unknown
  ? T extends `${infer L}${S}${infer R}`
    ? [L, ...Split<R, S>]
    : [T]
  : never;

declare global {
  interface ObjectConstructor {
    keys<T>(o: T): (keyof T & string)[];
  }
  interface String {
    split<T extends string, S extends string>(
      this: T,
      separator: S,
    ): Split<T, S>;
  }
  interface Array<T> {
    map<R>(fn: <E extends T>(e: E, i: number, arr: this) => R): R[];
  }
  interface Performance {
    getEntriesByType(type: 'resource'): PerformanceResourceTiming[];
  }
}
