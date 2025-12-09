import fs from 'fs/promises';
import { __DEV__ } from '../../scripts/utils';

export const after = async () => {
  if (!__DEV__) return fs.cp('cases', 'dist', { recursive: true, force: true });
  for (const file of await fs.readdir('cases', { withFileTypes: true })) {
    if (await fs.exists('dist/' + file.name)) return;
    await fs.symlink('../cases/' + file.name, 'dist/' + file.name);
  }
};
export const watchItems = ['chart.ts'];
