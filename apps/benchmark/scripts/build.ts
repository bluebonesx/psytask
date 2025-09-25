import { buildApp } from 'shared/scripts';

buildApp([
  { entrypoints: Array.from(new Bun.Glob('cases/*/*.bench.ts').scanSync()) },
]);
