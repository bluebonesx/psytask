import type { Scene } from '@psytask/core';
import van from 'vanjs-core';
import { list, reactive } from 'vanjs-ext';
import { useFetch } from './hooks';
import { isArray } from 'shared/utils';
import { adapter } from '.';

const { div, li, ul } = van.tags;

export const FlexCenter = adapter((props: { content: string | Node }) => ({
  node: div(
    {
      style:
        'display:flex;align-items:center;justify-content:center;width:100%;height:100%;',
    },
    () => props.content,
  ),
}));
export const Loader = adapter(
  <const T extends string[]>(props: { urls: T }, ctx: Scene<any>) => {
    let result: Blob[] | Error = [];
    const views = reactive<{ text: string }[]>([]);

    van.derive(() => {
      const { urls } = props;

      views.splice(0, views.length, ...urls.map((url) => ({ text: url })));

      const ac = new AbortController();
      const promises = urls.map(
        (url, i) =>
          new Promise<Blob>((resolve, reject) => {
            const req = useFetch(url, { signal: ac.signal });
            van.derive(() => {
              const { status, loading } = req.val;
              if (loading) {
                views[i] = {
                  text:
                    `${url} ⏳` +
                    (status === 'loading'
                      ? `: ${((req.val.loaded / req.val.total) * 1e2).toFixed(2)}%`
                      : '...'),
                };
                return;
              }
              if (status === 'success') {
                views[i] = { text: url + ' - ✅' };
                resolve(req.val.data);
                return;
              }
              ac.abort();
              const { error } = req.val;
              views[i] = { text: url + ' - ❌: ' + error };
              error.message += ' (while loading ' + url + ')';
              reject(error);
            });
          }),
      );
      Promise.all(promises)
        .then(
          (data) => (result = data),
          (err) => (result = err),
        )
        .finally(() => ctx.close());
    });

    return {
      node: list(ul, views, (s) => li(() => s.val.text)),
      data() {
        if (isArray(result))
          return { blobs: result as { [K in keyof T]: Blob } };
        throw result;
      },
    };
  },
);
