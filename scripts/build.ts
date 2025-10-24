import fs from 'fs/promises';
import path from 'path';
import { rollup } from 'rollup';
import { dts } from 'rollup-plugin-dts';
import {
  blue,
  __CONFIG_FILE__,
  cyan,
  __DEV__,
  log,
  projects,
  red,
  __ROOT__,
  type Project,
  yellow,
} from './utils';

type BuildConfig = Partial<{
  configs: Bun.BuildConfig[];
  params: Parameters<typeof getAppOptions>[0];
}>;
type BuildOptions = {
  configs: Bun.BuildConfig[];
  sharedConfig?: Partial<Bun.BuildConfig>;
};

const shared = {
  outdir: 'dist',
  target: 'browser',
  minify: true,
  define: {
    'process.env.NODE_ENV': __DEV__ ? '"development"' : '"production"',
  },
  splitting: true,
  sourcemap: __DEV__ ? 'linked' : 'none',
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
    psytask: '../public/psytask/index.min.js?v=' + Date.now(),
    '@psytask/core': '../public/core/index.min.js?v=' + Date.now(),
    '@psytask/components': '../public/components/index.min.js?v=' + Date.now(),
    '@psytask/jspsych': '../public/jspsych/index.min.js?v=' + Date.now(),
    ...importmap,
  };
  if (await fs.exists('main.css')) styles.push('main.css');
  return {
    sharedConfig: { external: Object.keys(importmap) },
    configs: [
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
const getPkgOptions = async (pkg: Record<string, any>) => {
  const deps = Object.keys(pkg.dependencies ?? {});
  return {
    sharedConfig: {
      banner: `/** ${pkg.name} v${pkg.version} ${pkg.author} ${pkg.license} */`,
    },
    configs: [
      // for Node.js
      {
        entrypoints: ['index.ts'],
        minify: false,
        external: deps,
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

const bundleDts = async (cwd: string) => {
  const bundle = await rollup({
    input: path.join(cwd, 'index.ts'),
    plugins: [
      dts({
        includeExternal: ['shared'],
        tsconfig: path.join(__ROOT__, 'tsconfig.app.json'),
      }),
    ],
  });
  const { output } = await bundle.write({
    file: path.join(cwd, 'dist/index.d.ts'),
    format: 'esm',
  });
  if (__DEV__) return;
  for (const chunkOrAsset of output) {
    log(
      `  ${cyan(chunkOrAsset.fileName)}  ${
        (chunkOrAsset.type === 'asset'
          ? chunkOrAsset.source
          : chunkOrAsset.code
        ).length / 1024
      } KB`,
    );
  }
};
export const buildProject = async (proj: Project) => {
  if (proj.state === 1) return;
  proj.state = 1; // built

  const cwd = process.cwd();
  process.chdir(proj.path);

  log(blue(`Building ${proj.name}`));
  await fs.rm('dist', { recursive: true, force: true });

  const configFilepath = path.join(proj.path, __CONFIG_FILE__);
  const isConfigFileExists = await fs.exists(configFilepath);
  if (!isConfigFileExists) {
    if (proj.pkgJson.scripts?.build) {
      const code = await Bun.spawn({
        cwd: proj.path,
        cmd: ['bun', 'run', 'build'],
        stdout: 'inherit',
      }).exited;
      if (code === 0) return;
      throw Error('Build failed: ' + proj.name);
    }
  }

  const { configs, params }: BuildConfig = isConfigFileExists
    ? await import(configFilepath)
    : {};

  const isPkg = proj.root === 'packages';
  const options: BuildOptions = isPkg
    ? await getPkgOptions(proj.pkgJson)
    : await getAppOptions(params);
  configs && options.configs.push(...configs);

  // build
  await Promise.all(
    options.configs.map(async (config) => {
      const { outputs } = await Bun.build({
        ...shared,
        ...options.sharedConfig,
        ...config,
      });
      if (__DEV__) return;
      for (const output of outputs)
        log(
          `  ${cyan(path.relative(shared.outdir, output.path))}  ${output.size / 1024} KB`,
        );
    }),
  );
  isPkg && (await bundleDts(proj.path));

  process.chdir(cwd);
};
const buildAll = async () => {
  log(
    blue('Building all:') +
      cyan(projects.reduce((acc, e) => acc + ' ' + e.name, '')),
  );

  await fs.rm('dist', { recursive: true, force: true });
  await fs.mkdir('dist/public', { recursive: true });

  for (const proj of projects) {
    await buildProject(proj);
    await fs.cp(
      path.join(proj.path, 'dist'),
      path.join(
        __ROOT__,
        'dist',
        proj.root === 'packages' ? 'public' : '',
        proj.name,
      ),
      { recursive: true },
    );
  }
};

// bun run build.ts [project-name]
if (import.meta.main) {
  const name = process.argv[2];
  if (!name) {
    await buildAll();
    process.exit(0);
  }
  const proj = projects.find((e) => e.name === name);
  proj
    ? await buildProject(proj)
    : log(
        red(`${name} is not project, choose one:`) +
          cyan(projects.reduce((acc, e, i) => acc + ' ' + e.name, '')),
      );
}
