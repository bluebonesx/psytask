import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import esbuild from 'esbuild';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as rollup from 'rollup';
import { dts } from 'rollup-plugin-dts';
import {
  __DEV__,
  __ROOT__,
  blue,
  cyan,
  log,
  projects,
  red,
  withCwd,
  type Project,
} from './utils';

declare module 'estree' {
  interface BaseNode {
    start: number;
    end: number;
  }
}

type BuildConfig = {
  input: string;
  output?: string;
  external?: string[];
  define?: Record<string, string>;
  minify?: boolean;
  sourcemap?: boolean;
  banner?: string;
  resolve?(path: string): string | null;
  /** Only for app */
  html?: Parameters<typeof generateHtml>[0];
};
type Builder = (configs: BuildConfig[]) => Promise<any>;

// build helpers
const generateHtml = ({
  title,
  importmap = {},
  styles = [],
  entryScript = './main.ts',
}: {
  title: string;
  importmap?: Record<string, string>;
  styles?: string[];
  entryScript?: string;
}) => `<!doctype html>
<html style="font-family:system-ui;color-scheme:dark;">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no" />
    <title>${title}</title>
    <script type="importmap">${JSON.stringify({ imports: importmap })}</script> 
    ${styles.reduce(
      (acc, e) => acc + `<link rel="stylesheet" href="${e}" />`,
      '',
    )}
    <style>*{margin:0;padding:0;box-sizing:border-box;}</style>
  </head>
  <body>
    <script type="module" src="${entryScript}"></script>
  </body>
</html>
`;
const resolveProjectConfig = async (proj: Project): Promise<BuildConfig[]> => {
  const isPkg = proj.root === 'packages';
  const sharedImportmap = {
    'vanjs-core':
      'https://cdn.jsdelivr.net/npm/vanjs-core@1.6.0/src/van.min.js',
    'vanjs-ext':
      'https://cdn.jsdelivr.net/npm/vanjs-ext@0.6.3/src/van-x.min.js',
    psytask: '../public/psytask/index.min.js?v=' + Date.now(),
    '@psytask/core': '../public/core/index.min.js?v=' + Date.now(),
    '@psytask/components': '../public/components/index.min.js?v=' + Date.now(),
    '@psytask/jspsych': '../public/jspsych/index.min.js?v=' + Date.now(),
  };
  if (isPkg) {
    const pkg = proj.pkgJson;
    const deps = Object.keys(pkg.dependencies ?? {});
    const banner = `/** ${pkg.name} v${pkg.version} ${pkg.author} ${pkg.license} */`;

    return [
      // Node.js
      {
        input: 'index.ts',
        output: 'index.js',
        minify: false,
        external: deps,
        banner,
        resolve: proj.userConfig?.resolve,
      },
      // Browser (Minified)
      {
        input: 'index.ts',
        output: 'index.min.js',
        minify: true,
        external: Object.keys(sharedImportmap),
        banner,
        sourcemap: __DEV__,
        resolve: proj.userConfig?.resolve,
      },
    ];
  } else {
    const importmap = {
      ...sharedImportmap,
      ...proj.userConfig?.importmap,
    };
    const styles = proj.userConfig?.styles ?? [];
    if (await fs.exists(path.join(proj.path, 'main.css')))
      styles.push('main.css');
    const title = path.basename(proj.path);
    const appTitle = `PsyTask | ${title[0]!.toUpperCase() + title.slice(1)}`;

    return [
      {
        input: 'index.html',
        minify: true,
        sourcemap: __DEV__,
        external: Object.keys(importmap),
        html: { title: appTitle, importmap, styles },
        resolve: proj.userConfig?.resolve,
      },
    ];
  }
};
const bundleDts = async (cwd: string) => {
  const bundle = await rollup.rollup({
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

// builders
const BunBuilder: Builder = (configs) =>
  Promise.all(
    configs.map(async (cfg) => {
      const { outputs } = await Bun.build({
        entrypoints: [cfg.input],
        outdir: 'dist',
        target: 'browser',
        minify: cfg.minify,
        external: cfg.external,
        define: cfg.define,
        sourcemap: cfg.sourcemap && 'linked',
        banner: cfg.banner,
        naming: cfg.output,
        splitting: true,
        plugins: (
          [
            cfg.resolve && {
              name: 'custom resolve',
              setup(build) {
                build.onResolve({ filter: /[\s\S]+/ }, (e) => ({
                  ...e,
                  path: cfg.resolve!(e.path) ?? e.path,
                }));
              },
            },
            cfg.html && {
              name: 'generate index html',
              setup(build) {
                build.onResolve({ filter: /^index.html$/ }, () => ({
                  path: 'html',
                  namespace: 'virtual',
                }));
                build.onLoad(
                  { filter: /^html$/, namespace: 'virtual' },
                  () => ({
                    contents: generateHtml(cfg.html!),
                    loader: 'html',
                  }),
                );
              },
            },
          ] as (false | Bun.BunPlugin)[]
        ).filter((e) => !!e),
      });
      if (__DEV__) return;
      for (const output of outputs)
        log(
          `  ${cyan(path.relative('dist', output.path))}  ${
            output.size / 1024
          } KB`,
        );
    }),
  );
const RollupBuilder: Builder = (() => {
  const sharedPlugins: rollup.InputPluginOption = [
    resolve({ extensions: ['.ts', '.js'] }),
    commonjs(),
  ];
  const macroPlugin: rollup.Plugin = {
    name: 'custom-macro',
    transform(code, id) {
      if (!id.endsWith('.ts') && !id.endsWith('.js')) return null;
      const ast = this.parse(code);
      const s = new MagicString(code);
      walk(ast, {
        enter(node) {
          if (
            node.type === 'CallExpression' &&
            node.callee.type === 'Identifier' &&
            node.callee.name === 'css'
          ) {
            const arg = node.arguments[0];
            if (arg && arg.type === 'ObjectExpression') {
              const parts: string[] = [];
              let valid = true;
              for (const prop of arg.properties) {
                if (prop.type !== 'Property') {
                  valid = false;
                  break;
                }
                if (!prop.computed && prop.key.type === 'Identifier') {
                  parts.push(prop.key.name);
                } else if (!prop.computed && prop.key.type === 'Literal') {
                  parts.push(
                    ('' + prop.key.value)
                      .replace(/\\/g, '\\\\')
                      .replace(/`/g, '\\`')
                      .replace(/\$\{/g, '\\${'),
                  );
                } else {
                  parts.push(
                    '${' + s.slice(prop.key.start, prop.key.end) + '}',
                  );
                }
                parts.push(':');
                if (prop.value.type === 'Literal') {
                  parts.push(
                    ('' + prop.value.value)
                      .replace(/\\/g, '\\\\')
                      .replace(/`/g, '\\`')
                      .replace(/\$\{/g, '\\${'),
                  );
                } else {
                  parts.push(
                    '${' + s.slice(prop.value.start, prop.value.end) + '}',
                  );
                }
                parts.push(';');
              }
              if (valid) {
                s.overwrite(node.start, node.end, '`' + parts.join('') + '`');
              } else {
                console.warn(
                  `Cannot transform css() call at ${id}:${s.slice(
                    node.start,
                    node.end,
                  )}`,
                );
              }
            }
          }
        },
      });
      if (s.hasChanged()) {
        return {
          code: s.toString(),
          map: s.generateMap({ source: id, includeContent: true }),
        };
      }
    },
  };
  return (configs) =>
    Promise.all(
      configs.map(async (cfg) => {
        const plugins: rollup.InputPluginOption = [
          cfg.resolve && { name: 'custom resolve', resolveId: cfg.resolve },
          ...sharedPlugins,
          {
            name: 'esbuild',
            async transform(code, id) {
              if (!id.endsWith('.ts')) return null;
              const result = await esbuild.transform(code, {
                loader: 'ts',
                sourcemap: cfg.sourcemap,
              });
              return {
                code: result.code,
                map: result.map || null,
              };
            },
          },
          !__DEV__ && macroPlugin,
          cfg.minify && {
            name: 'minify',
            async renderChunk(code) {
              const result = await esbuild.transform(code, {
                loader: 'js',
                minify: true,
                sourcemap: cfg.sourcemap,
              });
              return {
                code: result.code,
                map: result.map || null,
              };
            },
          },
        ];

        const bundle = await rollup.rollup({
          input: cfg.input,
          external: cfg.external,
          plugins,
        });
        const { output } = await bundle.write({
          file: `dist/${cfg.output ?? 'bundle.js'}`,
          format: 'esm',
          sourcemap: cfg.sourcemap,
          banner: cfg.banner,
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
      }),
    );
})();

// build function
export const buildProject = async (proj: Project, clear = !__DEV__) => {
  if (proj.state === 1) return;
  proj.state = 1; // built
  using _ = withCwd(proj.path);

  log(blue(`Building ${proj.name}`));
  clear && (await fs.rm('dist', { recursive: true, force: true }));

  // fallback to package.json build script
  if (!proj.userConfig) {
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

  // built-in build
  await proj.userConfig?.before?.();
  const configs = await resolveProjectConfig(proj);
  if (proj.root === 'packages') {
    await RollupBuilder(configs);
    await bundleDts(proj.path);
  } else {
    await BunBuilder(configs);
  }
  await proj.userConfig?.after?.();
};
const buildAll = async () => {
  log(
    blue('Building all:') +
      cyan(projects.reduce((acc, e) => acc + ' ' + e.name, '')),
  );

  // await fs.rm('dist', { recursive: true, force: true });
  await Bun.$`bun docs`;
  await fs.mkdir('dist/public', { recursive: true });

  for (const proj of projects) {
    await buildProject(proj);
    await fs.cp(
      path.join(proj.path, 'dist'),
      path.join('dist', proj.root === 'packages' ? 'public' : '', proj.name),
      { recursive: true },
    );
  }
};

// CLI Usage: bun run build.ts [project-name]
if (import.meta.main) {
  const name = process.argv[2];
  if (!name) {
    if (__ROOT__ !== process.cwd()) throw Error('Run from root directory');
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
