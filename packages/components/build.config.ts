Bun.spawn([
  'dts-bundle-generator',
  '--project=../../tsconfig.app.json',
  '--export-referenced-types=false',
  '--out-file=dist/index.d.ts',
  '--no-banner',
  '--silent',
  '--external-imports=@psytask/core',
  'vanjs-core',
  'vanjs-ext',
  'csstype',
  '--external-inlines=shared',
  '--disable-symlinks-following',
  './index.ts',
]);
export default {};
