import fs from 'fs/promises';
import ignore from 'ignore';
import { networkInterfaces } from 'os';
import path from 'path';
import { buildProject } from './build';
import { cyan, green, log, projects, yellow, type Project } from './utils';

const ig = ignore().add((await Bun.file('.gitignore').text()).split('\n')); // use .gitignore
const listened = new Set<string>();
const build = async (proj: Project) => {
  for (const dep of proj.deps ?? []) await buildProject(dep); // wait for dependencies build
  await buildProject(proj);
};
const listen = async (proj: (typeof projects)[number]) => {
  log(green(`Listening ${proj.name}`));
  await build(proj); // init build

  const subdirpaths = (await fs.readdir(proj.path, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !ig.ignores(e.name))
    .map((e) => path.join(proj.path, e.name));
  for (const dirpath of [...subdirpaths, proj.path])
    (async () => {
      for await (const { eventType, filename } of fs.watch(dirpath)) {
        if (filename && !ig.ignores(filename)) {
          log(yellow(`File changed: ${path.join(proj.name, filename ?? '')}`));
          proj.state = 0; // not built
          build(proj); // rebuild
        }
      }
    })();
};
const createRouteHandler = async (root: string) => {
  const projs = projects.filter((e) => e.root === root);
  return async ({ item, file }: { item: string; file: string }) => {
    const proj = projs.find((e) => e.name === item);
    if (!proj)
      return new Response(`Items: ${projs.map((e) => e.name).join(', ')}`, {
        status: 404,
      });
    if (!listened.has(proj.name)) {
      listened.add(proj.name);
      await listen(proj);
    }

    const distPath = path.join(proj.path, 'dist');
    const filepath = path.join(distPath, file);
    if (await fs.exists(filepath)) return new Response(Bun.file(filepath));
    return new Response(`Files: ${(await fs.readdir(distPath)).join(', ')}`, {
      status: 404,
    });
  };
};

// start server
const appHandler = await createRouteHandler('apps');
const pkgHandler = await createRouteHandler('packages');
const basename = '/psytask';
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
  <body style="text-align:center;font-size:2rem;">
    ${projects
      .map(
        (proj) =>
          `<div><a href="${
            proj.root === 'apps'
              ? `${basename}/${proj.name}/`
              : `${basename}/public/${proj.name}/index.js`
          }">${proj.root + '/' + proj.name}</a></div>`,
      )
      .join('')}
  </body>
</html>`,
        { headers: { 'Content-Type': 'text/html' } },
      ),
    [`${basename}/:item/`]: (req) =>
      appHandler({ item: req.params.item, file: 'index.html' }),
    [`${basename}/:item/:file`]: (req) => appHandler(req.params),
    [`${basename}/public/:item/:file`]: (req) => pkgHandler(req.params),
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
