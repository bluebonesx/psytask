import fs from 'fs/promises';
import path from 'path';

export const CONFIG_FILENAME = 'build.config.ts';
export const ROOT = path.resolve(import.meta.dir, '..');
export const DEV = process.argv[2] === '--dev';

export const red = (msg: string) => `\x1b[31m${msg}\x1b[0m`;
export const green = (msg: string) => `\x1b[32m${msg}\x1b[0m`;
export const yellow = (msg: string) => `\x1b[33m${msg}\x1b[0m`;
export const blue = (msg: string) => `\x1b[34m${msg}\x1b[0m`;
export const cyan = (msg: string) => `\x1b[36m${msg}\x1b[0m`;

export const log = (msg: string) => process.stdout.write(msg + '\n');

export const projects = (
  await Promise.all(
    (['apps', 'packages'] as const).flatMap((root) =>
      Array.from(
        new Bun.Glob('*/package.json').scanSync({
          onlyFiles: false,
          cwd: path.join(ROOT, root),
        }),
      ).map(async (e) => {
        const name = e.split('/')[0]!;
        const projPath = path.join(ROOT, root, name);
        return {
          path: projPath,
          name,
          root,
          buildable: await fs.exists(path.join(projPath, CONFIG_FILENAME)),
        };
      }),
    ),
  )
).flat();
