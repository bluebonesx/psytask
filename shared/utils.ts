// just for less code size
export const ERR = (msg: string) => {
  throw Error(msg);
};
export const rAF = requestAnimationFrame;
export const isArray: ArrayConstructor['isArray'] = (e) => Array.isArray(e);
export const modify = <T extends {}, U>(a: T, b: U) => Object.assign(a, b);
export const freeze = <T extends {}>(obj: T) => Object.freeze(obj);
export const extend = <T extends {}, U extends object>(
  obj: T,
  proto: U,
): T & Omit<U, `_${string}`> =>
  Object.setPrototypeOf(
    obj,
    Object.setPrototypeOf(proto, Object.getPrototypeOf(obj)),
  );

export const doc = document;
export const mount = <T extends HTMLElement>(child: T, root = doc.body) =>
  root.appendChild(child);
export const h = <T extends keyof HTMLElementTagNameMap>(
  tag: T,
  props?: Omit<Partial<HTMLElementTagNameMap[T]>, 'style'> & { style?: string },
): HTMLElementTagNameMap[T] => modify(doc.createElement(tag), props);
export const loadCss = (url: string) =>
  new Promise<void>((resolve, reject) =>
    mount(
      h('link', {
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
  Object.prototype.hasOwnProperty.call(obj, key);
export const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;
export const isObject = (value: unknown) =>
  value != null && typeof value === 'object';

export const map = <T extends object, U>(
  obj: T,
  fn: <K extends keyof T>(value: T[K], key: K) => U,
) =>
  Object.entries(obj).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: fn(value, key as keyof T),
    }),
    {} as { [K in keyof T]: U },
  );
export const mapValues = <T extends object, U>(
  obj: T,
  fn: <K extends keyof T>(value: T[K], key: K) => U,
) => Object.entries(obj).map(([key, value]) => fn(value, key as keyof T));

export const error_normalize = (err: unknown) =>
  err instanceof Error ? err : Error('' + err);
export const array_normalize = <T>(e: T | T[]) => (Array.isArray(e) ? e : [e]);
export const getter_normalize = <T>(e: T | (() => T)) =>
  typeof e === 'function' ? (e as () => T)() : e;
