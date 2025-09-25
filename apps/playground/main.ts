import sdk, { type Project } from '@stackblitz/sdk';
import van from 'vanjs-core';
import { getExamples } from './macro' with { type: 'macro' };
import { useHash, usePromise } from 'shared/hook';
const { a, div } = van.tags;

const proj = (p: { title: string; code: string }): Project => {
  const description = p.code.match(/^\/\/ (.+)\n/)?.[1] ?? '';
  const dependencies = Array.from(
    p.code.matchAll(/from '([^']+)'/g),
    (m) => m[1]!,
  );
  return {
    title: p.title,
    description,
    template: 'node',
    files: {
      'package.json': JSON.stringify(
        {
          name: p.title,
          description,
          version: '1.0.0',
          private: true,
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'vite build',
            preview: 'vite preview',
          },
          dependencies: dependencies.reduce(
            (acc, e) => ({ ...acc, [e]: 'latest' }),
            {},
          ),
          devDependencies: { vite: '^7' },
        },
        null,
        2,
      ),
      'index.html': `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${p.title}</title>
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`,
      'main.ts':
        "import 'psytask/main.css';\nimport './main.css';\n\n" + p.code,
      'main.css': '/* type your custom style here */',
    },
  };
};
const load = async (example: string) => {
  const res = await fetch(`./${example}.ts`);
  const code = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${code}`);
  sdk.openProject(proj({ title: example, code }), { openFile: 'index.ts' });
};

const examples = getExamples();
function App() {
  const hash = useHash();
  const loading = usePromise(() =>
    hash.val ? load(hash.val) : Promise.resolve(),
  );

  return div({ id: 'app' }, () =>
    hash.val
      ? loading.val.status === 'pending'
        ? `Loading ${hash.val}...`
        : loading.val.status === 'fulfilled'
          ? (history.back(), `Loaded ${hash.val}, closing...`)
          : `Failed to load ${hash.val}: ${loading.val.reason}`
      : div(...examples.map((e) => a({ href: '#' + e }, e))),
  );
}

van.add(document.body, App());
