import { $, build as _build, Glob, type BuildConfig } from 'bun';
import { clearDirIfExists } from 'shared/script';

export const outdir = 'dist';
await clearDirIfExists(outdir);

export async function build(config: Omit<BuildConfig, 'entrypoints'> = {}) {
  Object.assign(config, { outdir, minify: true, target: 'browser' });
  return Promise.all([
    _build({
      entrypoints: ['index.html'],
      ...config,
    }),
    _build({
      entrypoints: await Array.fromAsync(new Glob('src/*/main.css').scan()),
      ...config,
    }),
    // $`tsc -b`,
    _build({
      entrypoints: await Array.fromAsync(new Glob('src/*/*.bench.ts').scan()),
      ...config,
    }),
  ]);
}
if (process.argv[1] === import.meta.filename) {
  // If this script is run directly, build the project
  await build({ define: { 'process.env.NODE_ENV': '"production"' } });
}
