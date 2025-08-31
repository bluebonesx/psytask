import { build } from 'bun';
import fs from 'node:fs/promises';
import { clearDirIfExists, fileServe, listenFileChange } from 'shared/script';

const outdir = 'dist';
await clearDirIfExists(outdir);

const _build = async () => {
  await fs.cp('examples', outdir, { recursive: true });
  await build({
    entrypoints: ['index.html'],
    outdir,
    ...(process.argv.includes('--production')
      ? { minify: true, define: { 'process.env.NODE_ENV': '"production"' } }
      : null),
  });
};
_build();

if (process.argv.includes('--watch')) {
  listenFileChange(['src', 'examples'], _build);
  fileServe(outdir);
}
