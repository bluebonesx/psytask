import { createComponentAdapter } from '@psytask/core';
import type { LooseObject, Merge } from 'shared/types';
import { doc, hasOwn, isObject } from 'shared/utils';
import { noreactive } from 'vanjs-ext';

export { css } from 'shared/macro';

type EventType<T extends EventTarget, U = keyof T> = U extends `on${infer K}`
  ? K
  : never;
/**
 * Add event listener and return cleanup function
 *
 * @example
 *
 * Listen to window resize event
 *
 * ```ts
 * const cleanup = on(window, 'resize', (e) => {});
 * ```
 */
export const on = <T extends EventTarget, K extends EventType<T>>(
  target: T,
  type: K,
  listener: (
    ev: `on${K}` extends infer P extends Extract<keyof T, string>
      ? T[P] & {} extends infer F extends (...args: any) => any
        ? Parameters<F>[0]
        : never
      : never,
  ) => void,
  options?: boolean | AddEventListenerOptions,
) => (
  target.addEventListener(type, listener as EventListener, options),
  () => target.removeEventListener(type, listener as EventListener, options)
);
export const onPageLeave = (fn: () => void) =>
  on(doc, 'visibilitychange', () => doc.hidden && fn());

const shallowReactiveHandler: ProxyHandler<any> = {
  get: (target, prop, receiver) => (
    hasOwn(target, prop) ||
      //@ts-ignore
      (target[prop] = void 0), // Auto add property to track deps
    Reflect.get(target, prop, receiver)
  ),
  set: (target, prop, value, receiver) =>
    Reflect.set(
      target,
      prop,
      isObject(value) ? noreactive(value) : value, // Keep shallow reactive
      receiver,
    ),
};
/**
 * Adapter to use {@link https://github.com/vanjs-org/van VanJS} to create scene
 *
 * @example
 *
 * ```ts
 * import { adapter } from '@psytask/components';
 * import van from 'vanjs-core';
 *
 * const { div } = van.tags;
 * const vanjsStim = adapter((props: { text: string }) =>
 *   // node content will auto update when props.text changes
 *   div(() => props.text),
 * );
 * ```
 */
export const adapter = createComponentAdapter(
  (obj) => new Proxy(obj, shallowReactiveHandler),
);

/**
 * Define default props in setup
 *
 * @example
 *
 * ```ts
 * const setup = (props: { a?: number; b?: string }) => {
 *   const p = defaultProps(props, { a: 1, b: 'default' });
 *   // p.a is number, p.b is string
 *   return '';
 * };
 * ```
 */
export const defaultProps = <T extends LooseObject, U extends Partial<T>>(
  props: T,
  defaults: U,
) =>
  new Proxy(props as unknown as Merge<T, U>, {
    get: (target, prop, receiver) =>
      Reflect.get(target, prop, receiver) ?? Reflect.get(defaults, prop),
  });
