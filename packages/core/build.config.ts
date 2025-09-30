Bun.spawn([
  'dts-bundle-generator',
  '--project=../../tsconfig.app.json',
  '--export-referenced-types=false',
  '--out-file=dist/index.d.ts',
  '--no-banner',
  '--silent',
  '--external-inlines=shared',
  '--',
  './index.ts',
]);
export default {};
