import { createComponentAdapter } from 'psytask';
import { hasOwn, isObject, modify } from 'shared/utils';
import { noreactive, reactive } from 'vanjs-ext';

const shallowReactiveHandler: ProxyHandler<Record<string | symbol, unknown>> = {
  get: (target, prop) => (
    hasOwn(target, prop) || (target[prop] = void 0), // add prop to be tracked
    target[prop]
  ),
  set: (target, prop, value) =>
    (target[prop] = isObject(value) ? noreactive(value) : value) || 1,
};
/**
 * {@link https://github.com/vanjs-org/van VanJS} reactive system
 *
 * @example
 *
 * ```ts
 * import van from 'vanjs-core';
 *
 * const { div } = van.tags;
 * const Component = adapter.mark((props: { text: string }) =>
 *   // div content will auto update when props.text changing
 *   div(() => props.text),
 * );
 * const { props, nodes, data } = adapter.render(Component);
 * ```
 */
export const adapter = createComponentAdapter((obj) =>
  modify(new Proxy(reactive({}), shallowReactiveHandler), obj),
);
