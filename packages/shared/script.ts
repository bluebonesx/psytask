import { file, serve } from 'bun';
import fs from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

export const port = process.env.PORT || '3000';
export function showAllInterfaces() {
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
}
export async function clearDirIfExists(dir: string) {
  if (await fs.exists(dir)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
export function fileServe(dir: string) {
  showAllInterfaces();
  return serve({
    port,
    hostname: '0.0.0.0',
    async fetch(req) {
      const { pathname } = new URL(req.url);
      process.stdout.write(`[${new Date().toISOString()}] ${pathname}\n`);
      const itempath = path.resolve(
        dir,
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
      const f = file(itempath);
      return new Response(f, {
        headers: { 'Content-Type': f.type, 'Content-Length': '' + f.size },
      });
    },
  });
}
