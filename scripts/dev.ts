import fs from 'fs/promises';
import { networkInterfaces } from 'os';
import path from 'path';
import { cyan, green, log, projects, yellow } from './utils';
import ignore from 'ignore';

const ig = ignore().add((await Bun.file('.gitignore').text()).split('\n')); // use .gitignore
const listened = new Set<string>();
const build = (cwd: string) =>
  Bun.spawn({
    cwd,
    cmd: ['bun', path.join(import.meta.dir, 'build.ts'), '--dev'],
  }).exited;
const listen = async (cwd: string) => {
  log(green(`Listening ${cwd}`));
  listened.add(cwd);
  await build(cwd); // init build

  const subdirpaths = (await fs.readdir(cwd, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !ig.ignores(e.name))
    .map((e) => path.join(cwd, e.name));
  for (const dirpath of [...subdirpaths, cwd])
    (async () => {
      for await (const { eventType, filename } of fs.watch(dirpath)) {
        if (filename && !ig.ignores(filename)) {
          log(yellow(`File changed: ${path.join(cwd, filename ?? '')}`));
          await build(cwd);
        }
      }
    })();
};
const createRouteHandler = async (root: (typeof projects)[number]['root']) => {
  const projs = projects.filter((e) => e.root === root);
  return async ({ item, file }: { item: string; file: string }) => {
    const proj = projs.find((e) => e.name === item);
    if (!proj)
      return new Response(
        `expect items: ${projs.map((e) => e.name).join(', ')}`,
        { status: 404 },
      );
    if (!listened.has(proj.path)) await listen(proj.path);

    const distPath = path.join(proj.path, 'dist');
    const filepath = path.join(distPath, file);
    if (await fs.exists(filepath)) return new Response(Bun.file(filepath));
    return new Response(
      `expect files: ${(await fs.readdir(distPath)).join(', ')}`,
      { status: 404 },
    );
  };
};

// start server
const appHandler = await createRouteHandler('apps');
const pkgHandler = await createRouteHandler('packages');
const server = Bun.serve({
  port: 3000,
  hostname: '0.0.0.0',
  routes: {
    '/': (req) =>
      new Response(
        `<!doctype html>
<html style="font-family:system-ui; color-scheme:dark;">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <ul>${projects.map((proj) => `<li><a href="/${proj.root === 'apps' ? `${proj.name}/` : `public/${proj.name}/index.js`}">${proj.root + '/' + proj.name}</a></li>`).join('')}</ul>
  </body>
</html>`,
        { headers: { 'Content-Type': 'text/html' } },
      ),
    '/:item/': (req) =>
      appHandler({ item: req.params.item, file: 'index.html' }),
    '/:item/:file': (req) => appHandler(req.params),
    '/public/:item/:file': (req) => pkgHandler(req.params),
  },
  fetch: (req) => new Response('Not Found', { status: 404 }),
});

// show all interfaces
const ifaceInfos = networkInterfaces();
for (const iface in ifaceInfos)
  for (const info of ifaceInfos[iface]!)
    if (info.family === 'IPv4')
      log(iface + cyan(`\thttp://${info.address}:${server.port}`));
log('');
