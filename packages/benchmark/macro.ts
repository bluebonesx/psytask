export const getLibs = () =>
  Array.from(
    new Bun.Glob('*').scanSync({ cwd: 'cases', onlyFiles: false }),
  ).sort();
export const getTasks = () =>
  Array.from(
    new Bun.Glob('*.bench.ts').scanSync({ cwd: 'cases/psytask' }),
    (f) => f.replace('.bench.ts', ''),
  ).sort();
export const getLibConfigs = async () => {
  const libConfigs: Record<string, { css: string[]; js: string[] }> = {};
  for (const lib of getLibs()) {
    libConfigs[lib] = (await import(`./cases/${lib}/config.ts`)).default;
  }
  return libConfigs;
};
