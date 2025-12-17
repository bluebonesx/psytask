import { getCurrentScene, on } from 'psytask';
import { ERR, error_normalize, modify } from 'shared/utils';
import van, { type State } from 'vanjs-core';
import { calc, noreactive, reactive } from 'vanjs-ext';

/** {@link devicePixelRatio} */
export const useDevicePixelRatio = () => {
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
  getCurrentScene().on('dispose', () => cleanup());
  return dpr;
};
/** {@link window.innerWidth} */
export const useWindowPhysicalPix = (dpr: State<number>) => {
  const store = reactive({
    width: calc(() => innerWidth * dpr.val),
    height: calc(() => innerHeight * dpr.val),
  });
  getCurrentScene().on(
    'dispose',
    on(window, 'resize', () => {
      store.width = innerWidth * dpr.val;
      store.height = innerHeight * dpr.val;
    }),
  );
  return store;
};

type MaybeGetter<T> = T | (() => T);
/** {@link window.fetch} */
export const useFetch = (
  getterOrUrlOrInit: MaybeGetter<
    string | (Parameters<typeof fetch>[1] & { url: string })
  >,
) => {
  const options = van.derive(() => {
    const urlOrInit =
      typeof getterOrUrlOrInit === 'function'
        ? getterOrUrlOrInit()
        : getterOrUrlOrInit;
    return typeof urlOrInit === 'string' ? { url: urlOrInit } : urlOrInit;
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
        //@ts-expect-error store type has been narrowing
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
