import {
  createComponentAdapter,
  createTimer,
  type MaybeGenericComponent,
  Scene,
  type SceneOptions,
} from '@psytask/core';
import { doc, ERR, isObject, modify, mount, rAF } from 'shared/utils';
import van from 'vanjs-core';

type Action = () => unknown;

const { div } = van.tags;
const symbol: typeof Symbol.dispose =
  Symbol.dispose ?? Symbol.for('Symbol.dispose');

// helpers;
export const $ = ((root: HTMLElement, selector: string) =>
  root.querySelector(selector) ?? ERR(`Cannot find element: ${selector}`)) as {
  <K extends keyof HTMLElementTagNameMap>(
    root: HTMLElement,
    selector: K,
  ): HTMLElementTagNameMap[K];
  <T extends HTMLElement>(root: HTMLElement, selector: string): T;
};
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => rAF(r));
export const DefaultScene = <T extends MaybeGenericComponent>(
  ...[comp, options]: ConstructorParameters<typeof Scene<T>> extends [
    infer L,
    infer R extends SceneOptions<T>,
  ]
    ? [comp: L, options?: Partial<R>]
    : never
) => {
  const container = mount(div());
  const root = mount(div({ class: 'psytask-scene' }), container);
  return new Scene(comp, {
    root,
    defaultProps: {},
    adapter: createComponentAdapter((e) => e),
    timer: () => createTimer(() => true),
    ...options,
  }).on('dispose', () => container.remove());
};
export const DefaultAdapter = createComponentAdapter((e) => e);

// assertions
export const expect = <D extends 0 | 1 = 0>(
  ...e: [
    raw: D extends 1 ? unknown[] | Record<string, unknown> : unknown,
    expected?: unknown,
    deep?: D,
  ]
) => {
  const [raw, expected, deep = 0] = e.length === 1 ? [e[0], true, 0] : e;
  (deep && isObject(raw)
    ? JSON.stringify(raw) === JSON.stringify(expected)
    : Object.is(raw, expected)) ||
    (console.error('Expect', raw, 'to be', expected),
    ERR(`Expect ${raw} to be ${expected}`));
};

export const expect_error = async (action: Action) => {
  const msg = 'Should throw an error';
  try {
    await action();
    throw msg;
  } catch (err) {
    if (err === msg) ERR(msg);
    expect(err instanceof Error);
  }
};
export const expect_closeTo = (
  raw: number,
  expected: number,
  delta: number,
) => {
  const diff = raw - expected;
  try {
    return expect(Math.abs(diff) <= delta);
  } catch (error) {
    ERR(`Expect ${raw} to be close to ${expected} ± ${delta}, but got ${diff}`);
  }
};
export const expect_includes = <T>(raw: T, expected: Partial<T>) => {
  for (const key of Object.keys(expected)) expect(raw[key], expected[key]);
};
export const expect_dutationCloseTo = async (
  action: Action,
  expected: number,
  delta: number,
) => {
  const start = performance.now();
  await action();
  const duration = performance.now() - start;
  expect_closeTo(duration, expected, delta);
};

// spy
export const spy_listeners = (target: EventTarget) => {
  const listeners: Record<string, EventListener[]> & Disposable = {
    [symbol]: () => (
      (target.addEventListener = on),
      (target.removeEventListener = off)
    ),
  };

  const on = target.addEventListener;
  const off = target.removeEventListener;
  target.addEventListener = function (
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ) {
    (listeners[type] ??= []).push(listener);
    on.call(this, type, listener, options);
  };
  target.removeEventListener = function (
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions,
  ) {
    if (listeners[type]) {
      const index = listeners[type].indexOf(listener);
      if (index !== -1) listeners[type].splice(index, 1);
      if (listeners[type].length === 0) delete listeners[type];
    }
    off.call(this, type, listener, options);
  };
  return listeners;
};
export const spy_functionCall = <
  T,
  K extends {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required for infer Function keys
    [K in keyof T]: T[K] extends (...e: any) => any ? K : never;
  }[keyof T],
  //@ts-expect-error Cannot infer K in T
  P extends [unknown[], unknown] = [Parameters<T[K]>, ReturnType<T[K]>],
>(
  obj: T,
  key: K,
  mock?: (this: T, ...e: P[0]) => P[1],
) => {
  const original = obj[key];
  const paramsArray = modify([] as P[0][], {
    [symbol]: () => (obj[key] = original),
  });
  //@ts-expect-error Cannot infer K in T
  obj[key] = function (...e: P[0]) {
    paramsArray.push(e);
    //@ts-expect-error Cannot infer T[K] is Function
    return (mock ?? original).call(this, ...e);
  };
  return paramsArray;
};
export const spy_browserDownload = async (action: Action) => {
  using createParams = spy_functionCall(
    URL,
    'createObjectURL',
    () => 'javascript:console.log("mock blob url")',
  );
  using mountParams = spy_functionCall(doc.body, 'appendChild', (e) => e);
  await action();

  if (createParams.length + mountParams.length === 0) return null;

  expect(createParams.length, 1);
  const blob = createParams[0]![0] as Blob;
  expect(blob instanceof Blob);

  expect(mountParams.length, 1);
  const target = mountParams[0]![0] as HTMLAnchorElement;
  expect(target instanceof HTMLAnchorElement, true);

  return [target.download, await blob.text()] as [
    filename: string,
    content: string,
  ];
};

// mock browser behavior
export const mock_event = <
  T extends EventTarget,
  K extends { [P in keyof T]: P extends `on${infer K}` ? K : never }[keyof T],
>(
  target: T,
  type: K | Event,
) => target.dispatchEvent(typeof type === 'string' ? new Event(type) : type);
export const mock_leaveAndBack = async (delay = 1e2) => {
  Object.defineProperty(doc, 'hidden', { configurable: true, get: () => true });
  mock_event(doc, 'visibilitychange');

  //@ts-expect-error remove hidden property from document
  delete doc.hidden;
  await sleep(delay);
};
export const mock_changeDPR = () => {
  let listener: EventListener | null = null;
  const _matchMedia = matchMedia;
  const matchMediaParams = spy_functionCall(window, 'matchMedia', (query) =>
    modify(_matchMedia(query), {
      addEventListener: (type: string, fn: EventListener) => {
        if (type === 'change') listener = fn;
      },
      removeEventListener: (type: string, fn: EventListener) => {
        if (type === 'change' && listener === fn) listener = null;
      },
    }),
  );
  const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')!;
  return {
    change(zoom: number) {
      Object.defineProperty(window, 'devicePixelRatio', {
        value: zoom,
        configurable: true,
      });
      listener!(new MediaQueryListEvent('change'));
    },
    [symbol]() {
      matchMediaParams[symbol]();
      Object.defineProperty(window, 'devicePixelRatio', original);
      listener?.(new MediaQueryListEvent('change'));
    },
  };
};
export const mock_httpbin = () =>
  spy_functionCall(window, 'fetch', async (input, init) => {
    const url = '' + input;
    if (url.startsWith('/bytes/'))
      return new Response(new Blob(['x'.repeat(+url.slice(7))]), {
        headers: { 'Content-Length': url.slice(7) },
      });
    if (url.startsWith('/status/'))
      return new Response('', { status: +url.slice(8) });
    return new Response(JSON.stringify({ input, init }), { status: 400 });
  });
