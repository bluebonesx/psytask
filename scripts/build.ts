import fs from 'fs/promises';
import path from 'path';
import { blue, cyan, red } from 'picocolors';
import { CONFIG_FILENAME, DEV, log, projects, ROOT } from './utils';

declare global {
  type BuildParams = {
    tasks?: Bun.BuildConfig[];
    params?: Parameters<typeof getAppOptions>[0] /* &
      Parameters<typeof getPkgOptions>[0]; */;
  };
}
type BuildOptions = {
  tasks: Bun.BuildConfig[];
  config?: Partial<Bun.BuildConfig>;
};

const cwd = process.cwd();
const buildables = projects.filter((e) => e.buildable);
const shared = {
  outdir: 'dist',
  target: 'browser',
  minify: true,
  define: { 'process.env.NODE_ENV': DEV ? '"development"' : '"production"' },
  //@ts-ignore
  splitting: true,
  sourcemap: DEV ? 'linked' : 'none',
} satisfies Partial<Bun.BuildConfig>;

const getAppOptions = async ({
  importmap = {},
  styles = [],
}: {
  importmap?: Record<string, string>;
  styles?: string[];
} = {}) => {
  importmap['vanjs-core'] ??=
    'https://cdn.jsdelivr.net/gh/vanjs-org/van/public/van-1.6.0.min.js';
  styles.push(
    path.relative(
      cwd,
      Bun.fileURLToPath(import.meta.resolve('shared/main.css')), // shared/main.css absolute path
    ), // only support relative path
  );
  if (await fs.exists('main.css')) styles.push('main.css');
  return {
    config: { external: Object.keys(importmap) },
    tasks: [
      {
        entrypoints: ['index.html'],
        plugins: [
          {
            name: 'generate index html',
            setup(build) {
              build.onResolve({ filter: /^index.html$/ }, () => ({
                path: 'html',
                namespace: 'virtual',
              }));
              build.onLoad({ filter: /^html$/, namespace: 'virtual' }, () => ({
                contents: `<!doctype html>
<html style="font-family:system-ui; color-scheme:dark;">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Psytask - ${path.basename(process.cwd()).toUpperCase()}</title>
    <script type="importmap">${JSON.stringify({ imports: importmap })}</script> 
    ${styles.reduce(
      (acc, e) => acc + `<link rel="stylesheet" href="${e}" />`,
      '',
    )}
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`,
                loader: 'html',
              }));
            },
          },
        ],
      },
    ],
  } satisfies BuildOptions;
};
const getPkgOptions = async () => {
  const pkg = await import(path.resolve('package.json'));
  // minified global js for browser
  setTimeout(async () => {
    const raw = await Bun.file('dist/index.min.js').text();
    const code = raw.replace(/\*\/\n/, '*/\n(()=>{').replace(
      /export\{(.+)\};\n/,
      (str, g1: string) =>
        `globalThis['${pkg.name}']={${g1
          .split(',')
          .map((e) => e.split(' as ').reverse().join(':'))
          .join(',')}}`,
    );
    Bun.file('dist/index.global.min.js').write(`${code}})();`);
  }, 1e2);

  return {
    config: {
      banner: `/** ${pkg.name} v${pkg.version} ${pkg.author} ${pkg.license} */`,
      external: ['vanjs-core', 'vanjs-ext'],
    },
    tasks: [
      // for Node.js
      {
        entrypoints: ['index.ts'],
        external: Object.keys(pkg.dependencies ?? {}),
        minify: false,
        define: { 'process.env.NODE_ENV': 'process.env.NODE_ENV' },
      },
      // minified js for browser
      {
        entrypoints: ['index.ts'],
        naming: 'index.min.js',
      },
    ],
  } satisfies BuildOptions;
};
const buildCwd = async () => {
  DEV || log(blue(`Building ${cwd}`));
  const proj = buildables.find((e) => e.path === cwd);
  if (!proj) return log(red(`It is not a buildable project: ${cwd}`));

  const { tasks, params }: BuildParams = (
    await import(path.join(proj.path, CONFIG_FILENAME))
  ).default;
  const options: BuildOptions =
    proj.root === 'apps' ? await getAppOptions(params) : await getPkgOptions();
  tasks && options.tasks.push(...tasks);

  await Bun.$`mkdir -p dist && rm -rf dist`;
  await Promise.all(
    options.tasks.map((e) =>
      Bun.build({ ...shared, ...options.config, ...e }).then(
        (out) =>
          DEV ||
          out.outputs.map((f) =>
            log(
              `  ${cyan(path.relative(shared.outdir, f.path))}  ${f.size / 1024} KB`,
            ),
          ),
      ),
    ),
  );
};
const buildAll = async () => {
  log(
    blue('Building all:\n') +
      cyan(buildables.reduce((acc, e, i) => acc + e.path + '\n', '')),
  );
  await Bun.$`mkdir -p dist && rm -rf dist && mkdir -p dist/public`;
  for (const proj of buildables) {
    const exitCode = await Bun.spawn({
      cwd: proj.path,
      cmd: ['bun', process.argv[1]!],
      stdout: 'inherit',
      async onExit(subprocess, exitCode, signalCode, error) {
        exitCode === 0 &&
          (await Bun.$`mv ${proj.path}/dist ./dist/${proj.root === 'apps' ? '' : 'public/'}${proj.name}`);
      },
    }).exited;
    if (exitCode !== 0) throw new Error(`Build failed: ${proj.path}`);
    log('');
  }
};

cwd === ROOT ? await buildAll() : await buildCwd();
