import { css, defaultProps, getCurrentScene, type NodeLike } from 'psytask';
import { array_normalize, error_normalize } from 'shared/utils';
import van from 'vanjs-core';
import { list, reactive, replace } from 'vanjs-ext';
import { adapter } from './adapter';
import { useFetch } from './hooks';

const { li, ul } = van.tags;

type Resource = {
  key: string;
  url: string;
  response: ReturnType<typeof useFetch>;
};
const LoaderList = (resources: Resource[]) =>
  list(
    () =>
      ul({
        class: 'psytask-center',
        style: css({
          margin: 0,
          'word-break': 'break-all',
          'overflow-y': 'auto',
        }),
      }),
    resources,
    (resource) =>
      li(() => {
        const { url, response: res } = resource.val;
        const { status, loading } = res;
        return (
          url +
          (loading
            ? ` ⏳: ` +
              (status === 'waiting'
                ? status
                : ((res.loaded / res.total) * 1e2).toFixed(2) + '%')
            : status === 'success'
              ? ' ✅'
              : ' ❌: ' + res.error)
        );
      }),
  );
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
 * const imageUrl = URL.createObjectURL(blobs.a);
 * const jsonData = JSON.parse(await blobs.b.text());
 * ```
 *
 * Change resources
 *
 * ```ts
 * using loader = app.scene(generic(Loader), {
 *   defaultProps: { urls: {} },
 * });
 * let result;
 * for (let i = 0; i < 5; i++) {
 *   result = await loader.show({ urls: { pic: `resource-${i}.png` } });
 *   if (!result.error) break;
 * }
 * if (result.error) throw result.error;
 * const imageUrl = URL.createObjectURL(result.blobs.pic);
 * ```
 *
 * Custom children
 *
 * ```ts
 * const { div } = van.tags;
 * using loader = app.scene(generic(Loader), {
 *   defaultProps: {
 *     urls: {},
 *     children: (resources) =>
 *       div(() => JSON.stringfy(resources, null, 2)),
 *   },
 * });
 * ```
 */
export const Loader = adapter.mark(
  <
    const T extends { readonly [k: string]: string } | readonly string[],
  >(props: {
    urls: T;
    children?: (resources: Resource[]) => NodeLike | NodeLike[];
  }) => {
    const p = defaultProps(props, { children: LoaderList });
    let result:
      | { blobs: null; error: Error }
      | { blobs: Record<string, Blob>; error: null } = {
      blobs: {},
      error: null,
    };
    const resources = reactive<Resource[]>([]);
    const ctx = getCurrentScene().on('show', async () => {
      const urls = p.urls;
      const keys = Object.keys(urls) as Extract<keyof T, string>[];
      replace(resources, []);

      if (keys.length === 0) {
        result = { blobs: {}, error: null };
        ctx.close();
        return;
      }

      const ac = new AbortController();
      const promises = keys.map(
        (key) =>
          new Promise<true>((resolve, reject) => {
            const url = urls[key] as string;
            const res = useFetch({ url, signal: ac.signal });
            resources.push({ key, url, response: res });

            van.derive(() => {
              const { status, loading } = res;
              if (loading || ac.signal.aborted) return;
              if (status === 'success') {
                result.blobs![key] = res.data;
                resolve(true);
                return;
              }
              ac.abort(); // abort loading requests
              const { error } = res;
              error.message += `(with ${url})`;
              reject(error);
            });
          }),
      );
      result = await Promise.all(promises).then(
        () => result,
        (err) => ({ blobs: null, error: error_normalize(err) }),
      );
      ctx.close();
    });
    van.derive(() =>
      ctx.root.replaceChildren(...array_normalize(p.children(resources))),
    );
    return {
      node: '',
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
  },
);
