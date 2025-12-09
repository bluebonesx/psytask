import { getCurrentScene } from 'psytask';
import { error_normalize } from 'shared/utils';
import van from 'vanjs-core';
import { list, reactive } from 'vanjs-ext';
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
 * using loader = app.scene(Loader, { urls: ['a.png', 'b.json'] });
 * const { blobs, error } = await loader.show();
 * if (error) throw error;
 *
 * const imageUrl = URL.createObjectURL(blobs[0]);
 * const jsonData = JSON.parse(await blobs[1].text());
 * ```
 *
 * Auto change resources
 *
 * ```ts
 * using loader = app.scene(Loader, { urls: [] });
 *
 * let result;
 * for (let i = 0; i < 5; i++) {
 *   result = await loader.show({ urls: [`resource-${i}.png`] });
 *   if (!result.error) break;
 * }
 * if (result.error) throw result.error;
 *
 * const imageUrl = URL.createObjectURL(result.blobs[0]);
 * ```
 */
export const Loader = <const T extends string[]>(props: {
  urls: Readonly<T>;
}) => {
  let result: { blobs: null; error: Error } | { blobs: Blob[]; error: null } = {
    blobs: [],
    error: null,
  };
  const views = reactive<string[]>([]);
  const ctx = getCurrentScene();

  ctx.on('show', async () => {
    const urls = props.urls;
    views.splice(0, views.length, ...urls);
    if (urls.length === 0)
      return ((result = { blobs: [], error: null }), ctx.close());

    const ac = new AbortController();
    const promises = urls.map(
      //@ts-ignore
      (url, i) =>
        new Promise<Blob>((resolve, reject) => {
          const res = useFetch({ url, signal: ac.signal });
          van.derive(() => {
            const { status, loading } = res;
            if (loading)
              return (views[i] =
                `${url} ⏳` +
                (status === 'loading'
                  ? `: ${((res.loaded / res.total) * 1e2).toFixed(2)}%`
                  : '...'));
            if (status === 'success')
              return ((views[i] = url + ' - ✅'), resolve(res.data));

            ac.abort(); // abort all requests
            const { error } = res;
            views[i] = url + ' - ❌: ' + error;
            error.message += ' (while loading ' + url + ')';
            reject(error);
          });
        }),
    );
    result = await Promise.all(promises).then(
      (data) => ({ blobs: data, error: null }),
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
        | { blobs: { [K in keyof T]: Blob }; error: null },
  };
};
