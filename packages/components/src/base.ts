import { Scene, type SceneSetup } from '@psytask/core';
import { error_normalize, getter_normalize } from 'shared/utils';
import van from 'vanjs-core';
import { list, reactive } from 'vanjs-ext';
import { useFetch } from './hooks';
import { adapter, css, type MaybeGetter } from './utils';

const { li, ul, div } = van.tags;

/**
 * Centered container
 *
 * @example
 *
 * As setup
 *
 * ```ts
 * using container = app.scene(Container, {
 *   defaultProps: { content: '' },
 * });
 *
 * await container.show({ content: 'This is centered' });
 * ```
 *
 * @example
 *
 * As component
 *
 * ```ts
 * using adder = app.scene(
 *   adapter((props: { a: number; b: number }, ctx) =>
 *     Container({ content: () => props.a + props.b }, ctx),
 *   ),
 *   { defaultProps: { a: 0, b: 0 } },
 * );
 *
 * await adder.show({ a: 1, b: 2 }); // shows 3
 * ```
 */
export const Container = adapter(
  (props: { content: MaybeGetter<string | Node>; style?: string }) =>
    div(
      {
        style:
          css({
            // center content
            display: 'flex',
            'flex-direction': 'column',
            'justify-content': 'center',
            'align-items': 'center',
            // support multiline
            'white-space': 'pre-wrap',
            // layout
            height: '100%',
            margin: '0 10dvw',
          }) + (props.style ?? ''),
      },
      () => getter_normalize(props.content),
    ),
);
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
export const Loader = (<const T extends string[]>(
  _: { urls: Readonly<T> },
  ctx: Scene<any>,
) => {
  let result: { blobs: null; error: Error } | { blobs: Blob[]; error: null } = {
    blobs: [],
    error: null,
  };

  const views = reactive<string[]>([]);
  const load = async (urls: string[]) => {
    views.splice(0, views.length, ...urls);
    if (urls.length === 0)
      return ((result = { blobs: [], error: null }), ctx.close());

    const ac = new AbortController();
    const promises = urls.map(
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
            ac.abort();
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
  };

  ctx.on('scene:show', ({ urls }) => load(urls));
  return {
    node: Container({ content: list(ul, views, (s) => li(() => s.val)) }, ctx),
    data: () =>
      result as
        | { blobs: null; error: Error }
        | { blobs: { [K in keyof T]: Blob }; error: null },
  };
}) satisfies SceneSetup;
