import type { Properties as CSSProperties } from 'csstype';
import { detect } from 'detect-browser';
import type { EventType, Merge } from '../types';

/** Creates a new HTML element quickly and easily */
export function h<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  props?: Partial<Merge<HTMLElementTagNameMap[K], { style?: CSSProperties }>>,
  children?: Node | string | (Node | string)[],
) {
  const el = document.createElement(tagName);
  if (typeof props !== 'undefined') {
    for (const key in props) {
      if (hasOwn(props, key)) {
        if (key === 'style') {
          for (const styleKey in props.style!) {
            if (hasOwn(props.style, styleKey)) {
              el.style[styleKey] = props.style[styleKey]!;
            }
          }
        } else {
          //@ts-ignore
          el[key] = props[key]!;
        }
      }
    }
  }
  if (typeof children !== 'undefined') {
    if (typeof children === 'string') {
      el.textContent = children;
    } else if (Array.isArray(children)) {
      el.append(...children);
    } else {
      el.appendChild(children);
    }
  }
  return el;
}
export function pipe<T>(...fns: ((v: T) => T)[]) {
  return (v: T) => fns.reduce((acc, fn) => fn(acc), v);
}
export function hasOwn<T, K extends PropertyKey>(
  obj: T,
  key: K,
): obj is K extends keyof T ? T : T & { [P in K]: unknown } {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
export const promiseWithResolvers = (
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
export function proxy<T extends object>(
  obj: T,
  opts: {
    onNoKey?: (key: PropertyKey) => void;
  },
) {
  return new Proxy(obj, {
    get(o, k) {
      if (hasOwn(o, k)) return o[k as keyof T];
      opts.onNoKey?.(k);
    },
  });
}

//@ts-ignore
Symbol.dispose ??= Symbol.for('Symbol.dispose');
/**
 * Most browsers do not support this feature, but using it is good practice.
 *
 * @see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html
 */
export class DisposableClass implements Disposable {
  #cleanups: (() => void)[] = [];
  [Symbol.dispose]() {
    for (const task of this.#cleanups) task();
    this.#cleanups.length = 0;
  }
  /** Add a cleanup function to be called on dispose */
  addCleanup(cleanup: () => void) {
    this.#cleanups.push(cleanup);
  }
  /**
   * Add disposable event listener
   *
   * @example
   *   this.useEventListener(window, 'resize', (e) => {
   *     console.log('Window resized', e);
   *   });
   */
  useEventListener<T extends EventTarget, K extends EventType<T>>(
    target: T,
    type: K,
    //@ts-ignore
    listener: (ev: Parameters<T[`on${K}`]>[0]) => void,
    options?: boolean | AddEventListenerOptions,
  ) {
    target.addEventListener(type, listener, options);
    this.addCleanup(() => target.removeEventListener(type, listener, options));
  }
}

// stat
export function mean_std(arr: number[]) {
  const n = arr.length;
  const mean = arr.reduce((acc, v) => acc + v) / n;
  const std = Math.sqrt(
    arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1),
  );
  return { mean, std };
}

// detect environment
export function detectFPS(opts: { root: Element; framesCount: number }) {
  function checkPageVisibility() {
    if (document.visibilityState === 'hidden') {
      alert(
        'Please keep the page visible on the screen during the FPS detection',
      );
      location.reload();
    }
  }
  document.addEventListener('visibilitychange', checkPageVisibility);

  let startTime = 0;
  const frameDurations: number[] = [];
  const el = opts.root.appendChild(h('p'));

  return new Promise<number>((resolve) => {
    window.requestAnimationFrame(function frame(lastTime) {
      if (startTime !== 0) {
        frameDurations.push(lastTime - startTime);
      }
      startTime = lastTime;

      const progress = frameDurations.length / opts.framesCount;
      el.textContent = `test fps ${Math.floor(progress * 100)}%`;
      if (progress < 1) {
        window.requestAnimationFrame(frame);
        return;
      }

      document.removeEventListener('visibilitychange', checkPageVisibility);

      // calculate average frame duration
      const { mean, std } = mean_std(frameDurations);
      const valids = frameDurations.filter(
        (v) => mean - std * 2 <= v && v <= mean + std * 2,
      );
      if (valids.length < 1) {
        throw new Error('No valid frames found');
      }
      const frame_ms = valids.reduce((acc, v) => acc + v) / valids.length;

      console.log('detectFPS', {
        mean,
        std,
        valids,
        raws: frameDurations,
        frame_ms,
      });
      resolve(frame_ms);
    });
  });
}
export async function detectEnvironment(options?: {
  /** The detection panel container */
  root?: Element;
  /** Count of frames to calculate perFrame milliseconds */
  framesCount?: number;
}) {
  const opts = { root: document.body, framesCount: 60, ...options };
  const panel = opts.root.appendChild(
    h('div', { style: { textAlign: 'center', lineHeight: '100dvh' } }),
  );

  const ua = navigator.userAgent;
  const browser = detect(ua);
  if (!browser) {
    throw new Error('Cannot detect browser environment');
  }
  const env = {
    ua,
    os: browser.os,
    browser: browser.name + '/' + browser.version,
    mobile: /Mobi/i.test(ua),
    'in-app': /wv|in-app/i.test(ua), // webview or in-app browser
    screen_wh: [window.screen.width, window.screen.height],
    window_wh: (function () {
      const wh = [window.innerWidth, window.innerHeight];
      window.addEventListener('resize', () => {
        wh[0] = window.innerWidth;
        wh[1] = window.innerHeight;
      });
      return wh;
    })(),
    frame_ms: await detectFPS({ root: panel, framesCount: opts.framesCount }),
  } as const;

  opts.root.removeChild(panel);
  console.log('env', env);
  return env;
}
