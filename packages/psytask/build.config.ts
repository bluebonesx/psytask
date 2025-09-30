Bun.spawn([
  'dts-bundle-generator',
  '--project=../../tsconfig.app.json',
  '--export-referenced-types=false',
  '--out-file=dist/index.d.ts',
  '--no-banner',
  '--silent',
  '--external-imports=@psytask/core',
  '--external-inlines=shared',
  '--disable-symlinks-following',
  './index.ts',
]);
export default {};
