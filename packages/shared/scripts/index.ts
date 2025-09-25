import { type MaybePromise } from 'bun';
import fs from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

const port = process.env.PORT || '3000';

const resolvePsytaskPath: Bun.BunPlugin = {
  name: 'resolve psytask path',
  setup(build) {
    build.onResolve({ filter: /^psytask$/ }, () => ({
      path: path.resolve('../psytask/index.ts'),
    }));
  },
};
const generateIndexHtml = (customHTML = ''): Bun.BunPlugin => ({
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
    ${customHTML}
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`,
      loader: 'html',
    }));
  },
});

const createBuilder = <T extends {}>(
  getConfigAndTasks: (options?: T) => MaybePromise<{
    config: Partial<Bun.BuildConfig>;
    tasks: (Bun.BuildConfig | (() => MaybePromise<unknown>))[];
    listenFiles?: string[];
  }>,
) => {
  return async (
    customTasks: (Bun.BuildConfig | (() => MaybePromise<unknown>))[],
    options?: T,
  ) => {
    const DEV = process.argv[2] === '--dev';
    const shared = {
      outdir: 'dist',
      target: 'browser',
      minify: true,
      define: {
        'process.env.NODE_ENV': DEV ? '"development"' : '"production"',
      },
      //@ts-ignore
      splitting: true,
      sourcemap: DEV ? 'linked' : 'none',
    } satisfies Partial<Bun.BuildConfig>;
    const {
      config,
      tasks,
      listenFiles = [],
    } = await getConfigAndTasks(options);
    const build = async () => {
      // remove old files
      if (await fs.exists(shared.outdir))
        await fs.rm(shared.outdir, { recursive: true, force: true });
      // build  tasks
      await Promise.all(
        tasks
          .concat(customTasks)
          .map((e) =>
            typeof e === 'function'
              ? e()
              : Bun.build({ ...shared, ...config, ...e }).then((out) =>
                  out.outputs.map((f) =>
                    process.stdout.write(
                      `  \x1b[36m${path.relative(shared.outdir, f.path)}\x1b[0m  ${f.size / 1024} KB\n`,
                    ),
                  ),
                ),
          ),
      );
    };
    await build();
    if (!DEV)
      return process.stdout.write(
        `\x1b[32mBuild completed on\x1b[0m ${process.cwd()}\n`,
      );

    // local file server
    if (await fs.exists(path.join(shared.outdir, 'index.html'))) {
      // show all interfaces
      process.stdout.write('all interfaces:\n\n');
      const ifaceInfos = networkInterfaces();
      for (const iface in ifaceInfos) {
        const infos = ifaceInfos[iface];
        if (!infos) continue;
        for (const info of infos) {
          if (info.family === 'IPv4') {
            process.stdout.write(
              `  ${iface}\t\x1b[32mhttp://${info.address}:${port}/\x1b[0m\n`,
            );
          }
        }
      }
      process.stdout.write('\n');

      // server
      Bun.serve({
        port,
        hostname: '0.0.0.0',
        async fetch(req) {
          const { pathname } = new URL(req.url);
          process.stdout.write(`[${new Date().toISOString()}] ${pathname}\n`);
          const itempath = path.resolve(
            shared.outdir,
            pathname === '/' ? 'index.html' : pathname.slice(1),
          );
          if (!(await fs.exists(itempath))) {
            return Response.json(
              { error: 'File not found', itempath },
              { status: 404 },
            );
          }
          if (!(await fs.stat(itempath)).isFile()) {
            return Response.json(
              { error: 'Not a file', itempath },
              { status: 400 },
            );
          }
          const f = Bun.file(itempath);
          return new Response(f, {
            headers: {
              'Content-Type': f.type,
              'Content-Length': '' + f.size,
            },
          });
        },
      });
    }

    // listen file changes and rebuild
    for (const itempath of listenFiles) {
      (async () => {
        for await (const event of fs.watch(itempath, { recursive: true })) {
          console.clear();
          process.stdout.write(
            `File changed: ${path.join(itempath, event.filename ?? '')}\n`,
          );
          await build();
        }
      })();
    }
  };
};
export const buildApp = createBuilder(
  async ({
    importmap = {},
    styles = [],
    listenFiles = [],
  }: {
    importmap?: Record<string, string>;
    styles?: string[];
    listenFiles?: string[];
  } = {}) => {
    importmap['vanjs-core'] ??=
      'https://cdn.jsdelivr.net/gh/vanjs-org/van/public/van-1.6.0.min.js';
    styles.push('../shared/main.css');
    if (await fs.exists('./main.css')) styles.push('./main.css');

    const customHTML =
      `<script type="importmap">${JSON.stringify({
        imports: importmap,
      })}</script>` +
      styles.reduce(
        (acc, e) => acc + `<link rel="stylesheet" href="${e}" />`,
        '',
      );
    return {
      config: {
        external: Object.keys(importmap),
        plugins: [resolvePsytaskPath],
      },
      tasks: [
        {
          entrypoints: ['index.html'],
          plugins: [generateIndexHtml(customHTML)],
        },
      ],
      listenFiles,
    };
  },
);
export const buildPkg = createBuilder(async () => {
  const pkg = await import(path.resolve('package.json'));
  const globalName = pkg.name;
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
      // minified global js for browser
      () =>
        setTimeout(async () => {
          const raw = await Bun.file('dist/index.min.js').text();
          const code = raw.replace(/\*\/\n/, '*/\n(()=>{').replace(
            /export\{(.+)\};\n/,
            (str, g1: string) =>
              `globalThis['${globalName}']={${g1
                .split(',')
                .map((e) => e.split(' as ').reverse().join(':'))
                .join(',')}}`,
          );
          Bun.file('dist/index.global.min.js').write(`${code}})();`);
        }, 20),
    ],
  };
});
