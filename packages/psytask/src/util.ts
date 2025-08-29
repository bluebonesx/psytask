import type { PropertiesHyphen as CSSProperties } from 'csstype';
import type { EventType, LooseObject, Merge } from '../types';

/** Creates HTML element */
export const h = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  props?: Partial<
    Merge<
      HTMLElementTagNameMap[K],
      { style?: CSSProperties; dataset?: LooseObject }
    >
  > | null,
  children?: Node | string | (Node | string)[] | null,
) => {
  const el = document.createElement(tagName);
  if (props != null) {
    for (const key of Object.keys(props)) {
      if (key === 'style') {
        for (const k of Object.keys(props.style!)) {
          //@ts-ignore
          el.style.setProperty(k, props.style[k]);
        }
        continue;
      }
      if (key === 'dataset') {
        for (const k of Object.keys(props.dataset!)) {
          //@ts-ignore
          el.dataset[k] = props.dataset[k];
        }
        continue;
      }
      //@ts-ignore
      el[key] = props[key];
    }
  }
  if (children != null) {
    Array.isArray(children) ? el.append(...children) : el.append(children);
  }
  return el;
};
export function hasOwn<T extends LooseObject, K extends PropertyKey>(
  obj: T,
  key: K,
): obj is Extract<T, { [P in K]: unknown }> extends never
  ? T & { [P in K]: unknown }
  : Extract<T, { [P in K]: unknown }> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
export function proxyNonKey<T extends object>(
  obj: T,
  onNoKey: (key: PropertyKey) => void,
) {
  return new Proxy(obj, {
    get(o, k) {
      if (hasOwn(o, k)) return o[k as keyof T];
      return onNoKey(k);
    },
  });
}
export const promiseWithResolvers = (
  process.env.NODE_ENV !== 'test' &&
  hasOwn(Promise, 'withResolvers') &&
  typeof Promise.withResolvers === 'function'
    ? Promise.withResolvers.bind(Promise)
    : function () {
        let resolve, reject;
        const promise = new Promise(
          (res, rej) => ((resolve = res), (reject = rej)),
        );
        return { promise, resolve, reject };
      }
) as <T>() => {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
};
/**
 * Add event listener and return cleanup function
 *
 * @example
 *   const cleanup = on(window, 'resize', (e) => {});
 */
export function on<T extends EventTarget, K extends EventType<T>>(
  target: T,
  type: K,
  //@ts-ignore
  listener: (ev: Parameters<T[`on${K}`]>[0]) => void,
  options?: boolean | AddEventListenerOptions,
) {
  target.addEventListener(type, listener, options);
  return () => target.removeEventListener(type, listener, options);
}

//@ts-ignore
Symbol.dispose ??= Symbol.for('Symbol.dispose');
export class EventEmitter<
  M extends LooseObject & { cleanup?: never },
  EventMap extends { cleanup: null } = M & { cleanup: null },
> implements Disposable
{
  protected listeners: {
    [K in keyof EventMap]?: Set<(e: EventMap[K]) => void>;
  } = {};
  [Symbol.dispose]() {
    this.emit('cleanup', null);
  }
  /** Add event listener */
  on<K extends keyof EventMap>(type: K, listener: (evt: EventMap[K]) => void) {
    (this.listeners[type] ??= new Set<any>()).add(listener);
    return this;
  }
  /** Remove event listener */
  off<K extends keyof EventMap>(type: K, listener: (evt: EventMap[K]) => void) {
    this.listeners[type]?.delete(listener);
    return this;
  }
  /** Add one-time event listener, can not be removed manually */
  once<K extends keyof EventMap>(
    type: K,
    listener: (evt: EventMap[K]) => void,
  ) {
    const wrapper = (evt: EventMap[K]) => {
      try {
        listener(evt);
      } finally {
        this.off(type, wrapper);
      }
    };
    this.on(type, wrapper);
    return this;
  }
  /** Emit event listeners */
  emit<K extends keyof EventMap>(type: K, e: EventMap[K]) {
    const listeners = this.listeners[type];
    if (!listeners) return 0;
    for (const listener of listeners) listener(e);
    return listeners.size;
  }
}
