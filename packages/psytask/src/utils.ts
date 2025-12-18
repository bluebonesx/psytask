import { createTimer } from '@psytask/core';
import type { PropertiesHyphen } from 'csstype';
import type { Merge } from 'shared/types';
import { $Object, doc, mount, tags } from 'shared/utils';

// just for minimize
export const { div, a, style } = tags;

/**
 * CSS styles builder
 *
 * @example
 *
 * Basic usage
 *
 * ```ts
 * const style = css({ 'background-color': 'red', 'font-size': '16px' });
 * // "background-color:red;font-size:16px;"
 * ```
 */
export const css = (obj: PropertiesHyphen) =>
  $Object.entries(obj).reduce((acc, [key, val]) => acc + `${key}:${val};`, '');

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
      ? //eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required for inferring event handler parameters
        T[P] & {} extends infer F extends (...args: any) => any
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

/**
 * Define default props
 *
 * @example
 *
 * Usage with component
 *
 * ```ts
 * const Component = (props: { a?: number; b?: string }) => {
 *   const p = defaultProps(props, { a: 1, b: 'default' });
 *   // p.a is number, p.b is string
 *   return '';
 * };
 * ```
 */
export const defaultProps = <
  T extends Record<string | symbol, unknown>,
  U extends Partial<T>,
>(
  props: T,
  defaults: U,
) =>
  new Proxy(props as unknown as Merge<T, U>, {
    get: (target, prop) => target[prop] ?? defaults[prop],
  });

/**
 * @example
 *
 * Basic usage
 *
 * ```ts
 * const durations = await detectFPS({
 *   leave_alert: leave_alert_on_fps,
 *   frames_count,
 * });
 * const average_frame_ms =
 *   durations.reduce((a, b) => a + b) / durations.length;
 * ```
 */
export const detectFPS = async (options: {
  root: HTMLElement;
  frames_count: number;
  leave_alert: string;
}) => {
  const el = mount(
    div({ className: 'psytask-scene psytask-center' }),
    options.root,
  );
  const cleanup = onPageLeave(() => (alert(options.leave_alert), history.go()));
  const records = await createTimer((records) => {
    const progress = records.length / (options.frames_count + 1); // +1 to record durations
    el.innerText = `Detecting FPS... ${(progress * 100).toFixed(0)}%`;
    return progress >= 1;
  }).start();
  el.remove();
  cleanup();
  return records.map((t, i, arr) => (i > 0 ? t - arr[i - 1]! : 0)).slice(1); // first is 0
};
