import { getCurrentScene } from 'psytask';
import { error_normalize } from 'shared/utils';
import van from 'vanjs-core';
import { list, reactive, replace } from 'vanjs-ext';
import { useFetch } from './hooks';

const { li, ul } = van.tags;

/**
 * Load multiple urls as blobs
 *
 * @example
 *
 * Basic usage
 *
 * ```ts
 * using loader = app.scene(generic(Loader), {
 *   defaultProps: { urls: { a: 'a.png', b: 'b.json' } },
 * });
 * const { blobs, error } = await loader.show();
 * if (error) throw error;
 *
 * const imageUrl = URL.createObjectURL(blobs.a);
 * const jsonData = JSON.parse(await blobs.b.text());
 * ```
 *
 * Auto change resources
 *
 * ```ts
 * using loader = app.scene(generic(Loader), {
 *   defaultProps: { urls: {} },
 * });
 *
 * let result;
 * for (let i = 0; i < 5; i++) {
 *   result = await loader.show({ urls: { pic: `resource-${i}.png` } });
 *   if (!result.error) break;
 * }
 * if (result.error) throw result.error;
 *
 * const imageUrl = URL.createObjectURL(result.blobs.pic);
 * ```
 */
export const Loader = <
  const T extends { readonly [k: string]: string } | readonly string[],
>(props: {
  urls: T;
}) => {
  let result:
    | { blobs: null; error: Error }
    | { blobs: Record<string, Blob>; error: null } = {
    blobs: {},
    error: null,
  };
  const views = reactive<string[]>([]);
  const ctx = getCurrentScene().on('show', async () => {
    const urls = props.urls;
    const keys = Object.keys(urls) as Extract<keyof T, string>[];
    replace(views, []);

    if (keys.length === 0) {
      result = { blobs: {}, error: null };
      ctx.close();
      return;
    }

    const ac = new AbortController();
    const promises = keys.map(
      (key, i) =>
        new Promise<true>((resolve, reject) => {
          const url = urls[key] as string;
          const res = useFetch({ url, signal: ac.signal });
          van.derive(() => {
            const { status, loading } = res;
            if (loading) {
              views[i] =
                `${url} ⏳` +
                (status === 'loading'
                  ? `: ${((res.loaded / res.total) * 1e2).toFixed(2)}%`
                  : '...');
              return;
            }
            if (status === 'success') {
              views[i] = url + ' - ✅';
              result.blobs![key] = res.data;
              resolve(true);
              return;
            }

            ac.abort(); // abort all requests
            const { error } = res;
            views[i] = url + ' - ❌: ' + error;
            error.message += ' (while loading ' + url + ')';
            reject(error);
          });
        }),
    );
    result = await Promise.all(promises).then(
      () => (ac.abort(), result),
      (err) => ({ blobs: null, error: error_normalize(err) }),
    );
    ctx.close();
  });
  return {
    node: list(
      () => ul({ class: 'psytask-center' }),
      views,
      (s) => li(() => s.val),
    ),
    data: () =>
      result as
        | { blobs: null; error: Error }
        | {
            blobs: {
              readonly [K in T extends readonly unknown[]
                ? Extract<keyof T, `${number}`>
                : keyof T]: Blob;
            };
            error: null;
          },
  };
};
