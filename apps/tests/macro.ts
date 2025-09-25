export const getTestFiles = () => {
  return Array.from(
    new Bun.Glob('*.test.ts').scanSync({ cwd: './cases' }),
    (f) => f.replace('.test.ts', ''),
  );
};
