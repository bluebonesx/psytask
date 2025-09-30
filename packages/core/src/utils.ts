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
