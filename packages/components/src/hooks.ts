import { type EventEmitter, on } from '@psytask/core';
import { ERR, error_normalize, modify } from 'shared/utils';
import van, { type State } from 'vanjs-core';
import { calc, noreactive, reactive } from 'vanjs-ext';
import type { MaybeGetter } from './utils';

export const useDevicePixelRatio = (ee: EventEmitter<{}>) => {
  const dpr = van.state(devicePixelRatio);
  let cleanup: () => void;
  van.derive(() => {
    cleanup?.();
    cleanup = on(
      matchMedia(`(resolution: ${dpr.val}dppx)`),
      'change',
      () => (dpr.val = devicePixelRatio),
    );
  });
  ee.on('dispose', () => cleanup());
  return dpr;
};
export const useScreenPhysicalPix = (dpr: State<number>) =>
  reactive({
    width: calc(() => screen.width * dpr.val),
    height: calc(() => screen.height * dpr.val),
  });
export const useWindowPhysicalPix = (
  dpr: State<number>,
  ee: EventEmitter<{}>,
) => {
  const size = reactive({
    width: calc(() => innerWidth * dpr.val),
    height: calc(() => innerHeight * dpr.val),
  });
  ee.on(
    'dispose',
    on(window, 'resize', () => {
      size.width = innerWidth * dpr.val;
      size.height = innerHeight * dpr.val;
    }),
  );
  return size;
};
export const useFetch = (
  e: MaybeGetter<string | (Parameters<typeof fetch>[1] & { url: string })>,
) => {
  const options = van.derive(() => {
    const r = typeof e === 'function' ? e() : e;
    return typeof r === 'string' ? { url: r } : r;
  });
  const store = reactive<
    | { status: 'waiting'; loading: true }
    | { status: 'loading'; loading: true; total: number; loaded: number }
    | { status: 'success'; loading: false; data: Blob }
    | { status: 'failed'; loading: false; error: Error }
  >({ status: 'waiting', loading: true });

  van.derive(async () => {
    const opts = options.val;
    modify(store, { status: 'waiting', loading: true });

    try {
      const res = await fetch(opts.url, opts);
      if (!res.ok) ERR(`Failed to fetch ${opts.url}: ${res.status}`);
      if (res.body == null) ERR(`no response body for ${opts.url}`);

      // no progress
      const cl = res.headers.get('Content-Length');
      if (!cl)
        return modify(store, {
          status: 'success',
          loading: false,
          data: noreactive(await res.blob()),
        });
      const total = +cl;

      // show progress
      const reader = res.body!.getReader();
      const chunks = [];
      modify(store, { status: 'loading', loading: true, total, loaded: 0 });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        //@ts-ignore
        store.loaded += value.length;
      }
      modify(store, {
        status: 'success',
        loading: false,
        data: noreactive(new Blob(chunks)),
      });
    } catch (error) {
      modify(store, {
        status: 'failed',
        loading: false,
        error: noreactive(error_normalize(error)),
      });
    }
  });

  return store;
};
