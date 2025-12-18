import { createComponentAdapter } from 'psytask';
import { isObject, modify } from 'shared/utils';
import { noreactive, reactive } from 'vanjs-ext';

const ShallowReactiveSymbol = Symbol();
const shallowReactiveHandler: ProxyHandler<Record<string | symbol, unknown>> = {
  get: (target, prop) =>
    prop === ShallowReactiveSymbol ||
    (prop in target || (target[prop] = void 0), target[prop]),
  set: (target, prop, value) =>
    (target[prop] = isObject(value) ? noreactive(value) : value) || 1,
};
/**
 * Use {@link https://github.com/vanjs-org/van VanJS} component
 *
 * @example
 *
 * Wrap a component with reactive props
 *
 * ```ts
 * import van from 'vanjs-core';
 *
 * const { div } = van.tags;
 * const Component = adapter.wrap((props: { text: string }) =>
 *   // node content will auto update when props.text changes
 *   div(() => props.text),
 * );
 * ```
 */
export const adapter = createComponentAdapter((obj) =>
  obj[ShallowReactiveSymbol as keyof typeof obj]
    ? obj
    : modify(new Proxy(reactive({}), shallowReactiveHandler), obj),
);
