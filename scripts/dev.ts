import fs, { type FileChangeInfo } from 'fs/promises';
import { networkInterfaces } from 'os';
import path from 'path';
import { buildProject } from './build';
import { cyan, green, log, projects, yellow, type Project } from './utils';

const listened = new Set<string>();
const build = async (proj: Project, clear?: boolean) => {
  try {
    for (const dep of proj.deps ?? []) await buildProject(dep); // wait for dependencies build
    await buildProject(proj, clear);
  } catch (error) {
    console.error(`Build failed for ${proj.name}:`, error);
  }
};
const onChanged = (() => {
  let timer: NodeJS.Timeout | null = null;
  return async (
    e: FileChangeInfo<string>,
    itempath: string,
    proj: (typeof projects)[number],
  ) => {
    timer && clearTimeout(timer);
    return new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => {
        log(yellow(`File changed: ${itempath} ${e.filename}`));
        proj.state = 0; // not built
        build(proj).then(resolve, reject); // rebuild
      }, 1e3);
    });
  };
})();
const listen = async (proj: (typeof projects)[number]) => {
  log(green(`Listening ${proj.name}`));
  await build(proj, true); // init build

  const watchedItems = new Set(proj.userConfig?.watchItems);
  if (proj.root === 'packages') {
    watchedItems.add('index.ts');
    watchedItems.add('src');
  } else {
    watchedItems.add('main.ts');
    watchedItems.add('main.css');
  }

  for (const item of watchedItems)
    (async () => {
      const itempath = path.join(proj.path, item);
      if (!(await fs.exists(itempath))) return;
      for await (const e of fs.watch(itempath)) {
        if (e.filename && !/^\d+$|~$/.test(e.filename)) {
          onChanged(e, itempath, proj);
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
const prefix = '/psytask';
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
              ? `${prefix}/${proj.name}/`
              : `${prefix}/public/${proj.name}/index.js`
          }">${proj.root + '/' + proj.name}</a></div>`,
      )
      .join('')}
  </body>
</html>`,
        { headers: { 'Content-Type': 'text/html' } },
      ),
    [`${prefix}/:item/`]: (req) =>
      appHandler({ item: req.params.item, file: 'index.html' }),
    [`${prefix}/:item/:file`]: (req) => appHandler(req.params),
    [`${prefix}/public/:item/:file`]: (req) => pkgHandler(req.params),
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
