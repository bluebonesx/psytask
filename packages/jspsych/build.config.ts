import { fileURLToPath } from 'node:url';
import { __DEV__ } from '../../scripts/utils';
import path from 'node:path';

export const resolve = (source: string) => {
  if (!source.startsWith('internal:')) return null;

  const [modname, relative_modpath] = source.slice(9).split(':', 2);
  if (!modname || !relative_modpath)
    throw Error(`Internal module error: ${source}`);

  const entry_modpath = fileURLToPath(import.meta.resolve(modname));
  const idx = entry_modpath.lastIndexOf(modname);
  if (idx === -1)
    throw Error(`Failed to get internal module directory path: ${source}`);

  const modpath = path.resolve(
    entry_modpath.slice(0, idx + modname.length),
    relative_modpath,
  );
  return modpath; // && console.log(modpath);
};
