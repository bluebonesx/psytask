import fs from 'fs/promises';
import path from 'path';
import { blue } from 'picocolors';

export const CONFIG_FILENAME = 'build.config.ts';
export const ROOT = path.resolve(import.meta.dir, '..');
export const DEV = process.argv[2] === '--dev';

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
