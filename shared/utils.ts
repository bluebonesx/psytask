// just for less code size
export const ERR = (msg: string) => {
  throw Error(msg);
};
export const rAF = requestAnimationFrame;
export const isArray: ArrayConstructor['isArray'] = (e) => Array.isArray(e);
export const $Object = Object;
export const modify = <T extends {}, U>(a: T, b: U) => $Object.assign(a, b);
export const freeze = <T extends {}>(obj: T) => $Object.freeze(obj);
export const extend = <T extends {}, U extends object>(
  obj: T,
  proto: U,
): T & Omit<U, `_${string}`> =>
  $Object.setPrototypeOf(
    obj,
    $Object.setPrototypeOf(proto, $Object.getPrototypeOf(obj)),
  );

export const doc = document;
export const mount = <T extends HTMLElement>(child: T, root = doc.body) =>
  root.appendChild(child);
export const tags = new Proxy(
  {} as {
    [T in keyof HTMLElementTagNameMap]: (
      props?: Omit<Partial<HTMLElementTagNameMap[T]>, 'style'> & {
        style?: string;
      },
    ) => HTMLElementTagNameMap[T];
  },
  //@ts-ignore
  { get: (_, tag) => (props) => modify(doc.createElement(tag), props) },
);
export const loadCss = (url: string) =>
  new Promise<void>((resolve, reject) =>
    mount(
      tags.link({
        rel: 'stylesheet',
        href: url,
        onload: () => resolve(),
        onerror: () => reject(new Error(`Failed to load CSS: ${url}`)),
      }),
      doc.head,
    ),
  );

export const hasOwn = <T extends {}, K extends PropertyKey>(
  obj: T,
  key: K,
): obj is Extract<T, { [P in K]: unknown }> extends never
  ? T & { [P in K]: unknown }
  : Extract<T, { [P in K]: unknown }> =>
  $Object.prototype.hasOwnProperty.call(obj, key);
export const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;
export const isObject = (value: unknown) =>
  value != null && typeof value === 'object';

export const map = <T extends object, U>(
  obj: T,
  fn: <K extends keyof T>(value: T[K], key: K) => U,
) =>
  $Object.entries(obj).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: fn(value, key as keyof T),
    }),
    {} as { [K in keyof T]: U },
  );
export const mapValues = <T extends object, U>(
  obj: T,
  fn: <K extends keyof T>(value: T[K], key: K) => U,
) => $Object.entries(obj).map(([key, value]) => fn(value, key as keyof T));

export const error_normalize = (err: unknown): Error =>
  err instanceof Error ? err : Error('' + err);
export const array_normalize = <T>(e: T | T[]) => (Array.isArray(e) ? e : [e]);
export const getter_normalize = <T>(e: T | (() => T)) =>
  typeof e === 'function' ? (e as () => T)() : e;

export const IQR = (arr: number[]) => {
  arr = [...arr].sort((a, b) => a - b);
  const Q1_idx = arr.length / 4;
  const Q1 = arr[Math.floor(Q1_idx)]!,
    Q3 = arr[Math.ceil(Q1_idx * 3)]!;
  return {
    min: arr[0]!,
    max: arr[arr.length - 1]!,
    Q1,
    Q3,
    IQR: Q3 - Q1,
  } as const;
};
export const mean = (arr: number[]) =>
  arr.reduce((acc, val) => acc + val) / arr.length;
