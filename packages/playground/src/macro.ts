import fs from 'node:fs/promises';
import path from 'node:path';

export const getExamples = async (): Promise<string[]> =>
  (await fs.readdir('examples'))
    .map((e) => path.basename(e, path.extname(e)))
    .sort();
