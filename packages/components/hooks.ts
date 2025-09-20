import { type EventEmitter } from '@psytask/core';
import { on } from 'shared/utils';
import van, { type State } from 'vanjs-core';
import { calc, reactive } from 'vanjs-ext';

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
export const useScreenPhysicalSize = (dpr: State<number>) =>
  reactive({
    width: calc(() => screen.width * dpr.val),
    height: calc(() => screen.height * dpr.val),
  });
export const useWindowPhysicalSize = (
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
export const useFetch = (...[url, init]: Parameters<typeof fetch>) => {
  const store = van.state<
    | { status: 'waiting'; loading: true }
    | { status: 'loading'; loading: true; total: number; loaded: number }
    | { status: 'success'; loading: false; data: Blob }
    | { status: 'failed'; loading: false; error: Error }
  >({ status: 'waiting', loading: true });

  (async () => {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
      if (res.body == null) throw new Error(`no response body for ${url}`);

      // no progress
      const cl = res.headers.get('Content-Length');
      if (cl == null) {
        console.warn(`Failed to get content length for ${url}`);
        store.val = {
          status: 'success',
          loading: false,
          data: await res.blob(),
        };
        return;
      }
      const total = +cl;

      // show progress
      const reader = res.body.getReader();
      const chunks = [];
      for (let loaded = 0; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.length;
        store.val = { status: 'loading', loading: true, total, loaded };
        chunks.push(value);
      }
      store.val = { status: 'success', loading: false, data: new Blob(chunks) };
    } catch (error) {
      store.val = {
        status: 'failed',
        loading: false,
        error: error instanceof Error ? error : new Error(error + ''),
      };
    }
  })();

  return store;
};
