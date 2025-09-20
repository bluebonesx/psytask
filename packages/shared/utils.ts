// just for less code size
export const rAF = requestAnimationFrame;
export const isArray: ArrayConstructor['isArray'] = (e) => Array.isArray(e);
export const modify = <T extends {}, U>(a: T, b: U) => Object.assign(a, b);
export const extend = <T extends {}, U extends {}>(proto: T, propteries: U) =>
  modify(Object.create(proto) as T, propteries);
export const doc = document;
export const mount = <T extends HTMLElement>(child: T, root = doc.body) =>
  root.appendChild(child);
export const onPageLeave = (fn: () => void) =>
  on(doc, 'visibilitychange', () => doc.visibilityState === 'hidden' && fn());
export const h = <T extends keyof HTMLElementTagNameMap>(
  tag: T,
  props?: Omit<Partial<HTMLElementTagNameMap[T]>, 'style'> & { style?: string },
): HTMLElementTagNameMap[T] => modify(doc.createElement(tag), props);
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

type EventType<T extends EventTarget, U = keyof T> = U extends `on${infer K}`
  ? K
  : never;
/**
 * Add event listener and return cleanup function
 *
 * @example
 *
 * ```ts
 * const cleanup = on(window, 'resize', (e) => {});
 * ```
 */
export const on = <T extends EventTarget, K extends EventType<T>>(
  target: T,
  type: K,
  //@ts-ignore
  listener: (ev: Parameters<T[`on${K}`]>[0]) => void,
  options?: boolean | AddEventListenerOptions,
) => (
  target.addEventListener(type, listener, options),
  () => target.removeEventListener(type, listener, options)
);

export const detect_fps = (
  opts: Partial<{
    root: HTMLElement;
    frames_count: number;
    leave_alert: string;
  }>,
) => {
  const cleanup = onPageLeave(
    () => (
      alert(
        opts.leave_alert ?? "DON'T leave the page during the FPS detection",
      ),
      location.reload()
    ),
  );

  let start_time = 0;
  const raws: number[] = [];
  const el = mount(h('p'), opts.root);

  return new Promise<number>((resolve) => {
    const frame = (last_time: number) => {
      if (start_time !== 0) {
        raws.push(last_time - start_time);
      }
      start_time = last_time;

      const progress = raws.length / (opts.frames_count ?? 60);
      el.textContent = `test fps ${Math.floor(progress * 100)}%`;
      if (progress < 1) return rAF(frame);

      cleanup();
      // extract valid frames within 2 std
      const n = raws.length;
      const M = raws.reduce((acc, v) => acc + v) / n;
      const SD =
        (raws.reduce((acc, v) => acc + (v - M) ** 2, 0) / (n - 1)) ** 0.5;
      const valids = raws.filter((v) => M - SD * 2 <= v && v <= M + SD * 2);
      const m = valids.length;
      if (m === 0) throw new Error('No valid frames found');
      const frame_ms = valids.reduce((acc, v) => acc + v) / m;

      resolve(frame_ms);
      console.info('detect-fps', { raws, M, SD, valids, frame_ms });
    };
    rAF(frame);
  });
};
