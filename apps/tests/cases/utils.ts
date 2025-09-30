import { ERR, isObject, modify } from 'shared/utils';

type Action = () => unknown;

const symbol: typeof Symbol.dispose =
  Symbol.dispose ?? Symbol.for('Symbol.dispose');

// assertions
export const expect = <D extends 0 | 1 = 0>(
  ...e: [
    raw: D extends 1
      ? string | number | boolean | unknown[] | Record<string, unknown>
      : unknown,
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
export const expect_closeTo = (raw: number, expected: number, delta: number) =>
  expect(Math.abs(raw - expected) <= delta);
export const expect_includes = <T extends object>(
  raw: T,
  expected: Partial<T>,
) => {
  //@ts-ignore
  for (const key of Object.keys(expected)) expect(raw[key], expected[key], 1);
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
  K extends { [K in keyof T]: T[K] extends Function ? K : never }[keyof T],
  //@ts-ignore
  P extends [unknown[], unknown] = [Parameters<T[K]>, ReturnType<T[K]>],
>(
  obj: T,
  key: K,
  mock?: (this: T, ...e: P[0]) => P[1],
) => {
  const paramsArray = modify([] as P[0][], {
    [symbol]: () => (obj[key] = original),
  });
  const original = obj[key];
  //@ts-ignore
  obj[key] = function (...e: P[0]) {
    paramsArray.push(e);
    //@ts-ignore
    return (mock ?? original).call(this, ...e);
  };
  return paramsArray;
};
export const spy_browserDownload = async (action: Action) => {
  using createParams = spy_functionCall(
    URL,
    'createObjectURL',
    () => 'javascript:console.log("mock download url")',
  );
  using mountParams = spy_functionCall(document.body, 'appendChild', (e) => e);
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
export const mock_leaveAndBack = async (delay = 1e3) => {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => true,
  });

  mock_event(document, 'visibilitychange');
  //  mock_event(window,'blur');

  //@ts-ignore
  delete document.hidden;
  await new Promise((r) => setTimeout(r, delay));
};
