import fs from 'node:fs';
import path from 'node:path';

export const getExamples = () =>
  fs
    .readdirSync('examples')
    .map((e) => path.basename(e, path.extname(e)))
    .sort();
