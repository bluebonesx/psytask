import fs from 'node:fs/promises';
import { fileServe } from 'shared/script';
import { build, outdir } from './build';
import { listenFileChange } from 'shared/script';

fileServe(outdir);
listenFileChange(['src', '../psytask/src'], build);
await build();
