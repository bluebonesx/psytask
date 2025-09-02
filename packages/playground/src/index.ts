import sdk, { type Project } from '@stackblitz/sdk';
import { h } from 'psytask';
import { getExamples } from './macro' with { type: 'macro' };

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
const run = async (example: string) => {
  const res = await fetch(`./${example}.ts`);
  const code = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${code}`);

  sdk.openProject(proj({ title: example, code }), { openFile: 'index.ts' });
};
const main = async () => {
  const hash = location.hash.slice(1);
  if (hash) {
    root.replaceChildren(`Loading ${hash}...`);

    try {
      await run(hash);
    } catch (error) {
      console.error(error);
      root.replaceChildren(`Failed to load ${hash}: ` + error);
      return;
    }
    location.hash = '';
    window.close();
    return;
  }

  const examples = await getExamples();
  root.replaceChildren(
    h('h2', null, 'Choose an example by clicking:'),
    h(
      'div',
      { style: { display: 'flex', gap: '1rem', margin: '1rem' } },
      examples.map((e) => h('a', { href: '#' + e }, e)),
    ),
    h('i', null, [
      'goto',
      h(
        'a',
        {
          href: 'https://github.com/bluebonesx/psytask/tree/main/packages/playground/examples',
          target: '_blank',
        },
        ' here ',
      ),
      'for source code.',
    ]),
  );
};

document.documentElement.style.filter = 'invert(1)';
const root = document.body;
root.style.background = '#fff';
main();
window.addEventListener('hashchange', main);
