import type { Scene, SceneSetup } from '@psytask/core';
import type { PropertiesHyphen } from 'csstype';
import type { LooseObject, Merge } from 'shared/types';
import { hasOwn, isObject, modify } from 'shared/utils';
import { noreactive, reactive } from 'vanjs-ext';

export type MaybeGetter<T> = T | (() => T);

const shallowReactiveHandler: ProxyHandler<LooseObject> = {
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
 * Write custom vanjs scene setup
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
export const adapter =
  <P extends LooseObject, R extends ReturnType<SceneSetup<P>>>(
    setup: (props: P, ctx: Scene<any>) => R,
  ): ((props: P, ctx: Scene<any>) => R) =>
  (defaultProps, ctx) => {
    const rprops = new Proxy(reactive({}), shallowReactiveHandler);
    ctx.on('scene:show', (newProps) => modify(rprops, newProps));
    return setup(modify(rprops, defaultProps), ctx);
  };

/** CSS styles builder */
export const css = (obj: PropertiesHyphen) =>
  Object.entries(obj).reduce((acc, [key, val]) => acc + `${key}:${val};`, '');

export const defaultProps = <T extends LooseObject, U extends Partial<T>>(
  props: T,
  defaults: U,
) =>
  new Proxy(props as unknown as Merge<T, U>, {
    get: (target, prop, receiver) =>
      Reflect.get(target, prop, receiver) ??
      Reflect.get(defaults, prop, receiver),
  });
