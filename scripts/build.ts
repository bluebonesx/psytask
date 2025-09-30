import fs from 'fs/promises';
import path from 'path';
import { blue, cyan, red } from './utils';
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

const buildables = projects.filter((e) => e.buildable);
!DEV &&
  process.argv[2] &&
  process.chdir(
    buildables.find((e) => e.name === process.argv[2])?.path ?? process.cwd(),
  ); // support build a specific project by name

const cwd = process.cwd();
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
  importmap = {
    'vanjs-core':
      'https://cdn.jsdelivr.net/npm/vanjs-core@1.6.0/src/van.min.js',
    'vanjs-ext':
      'https://cdn.jsdelivr.net/npm/vanjs-ext@0.6.3/src/van-x.min.js',
    psytask: '/public/psytask/index.min.js?v=' + Date.now(),
    '@psytask/core': '/public/core/index.min.js?v=' + Date.now(),
    '@psytask/components': '/public/components/index.min.js?v=' + Date.now(),
    '@psytask/jspsych': '/public/jspsych/index.min.js?v=' + Date.now(),
    ...importmap,
  };
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
    <title>PsyTask - ${path.basename(process.cwd()).toUpperCase()}</title>
    <script type="importmap">${JSON.stringify({ imports: importmap })}</script> 
    ${styles.reduce(
      (acc, e) => acc + `<link rel="stylesheet" href="${e}" />`,
      '',
    )}
    <style>*{margin:0;padding:0;box-sizing:border-box;}</style>
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
  const pkg = await import(path.join(cwd, 'package.json'));
  const external = Object.keys(pkg.dependencies ?? {});
  external.splice(external.indexOf('shared'), 1);
  return {
    config: {
      banner: `/** ${pkg.name} v${pkg.version} ${pkg.author} ${pkg.license} */`,
    },
    tasks: [
      // for Node.js
      {
        entrypoints: ['index.ts'],
        minify: false,
        external,
        define: { 'process.env.NODE_ENV': 'process.env.NODE_ENV' },
      },
      // minified js for browser
      {
        entrypoints: ['index.ts'],
        naming: 'index.min.js',
        external: ['vanjs-core', 'vanjs-ext', '@psytask/core'],
      },
    ],
  } satisfies BuildOptions;
};
const buildCwd = async () => {
  DEV || log(blue(`Building ${cwd}`));
  const proj = buildables.find((e) => e.path === cwd);
  if (!proj) return log(red(`It is not a buildable project: ${cwd}`));

  await Bun.$`mkdir -p dist && rm -rf dist`;

  const { tasks, params }: BuildParams = (
    await import(path.join(proj.path, CONFIG_FILENAME))
  ).default;
  const options: BuildOptions =
    proj.root === 'apps' ? await getAppOptions(params) : await getPkgOptions();
  tasks && options.tasks.push(...tasks);

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
