import fs from 'node:fs/promises';
import { fileServe } from 'shared/script';
import { build, outdir } from './build';

fileServe(outdir);
(async () => {
  for await (const event of fs.watch('src', { recursive: true })) {
    process.stdout.write(`File changed: ${event.filename}\n`);
    await build();
  }
})();
await build();
