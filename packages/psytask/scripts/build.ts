import { buildPkg } from 'shared/scripts';

await buildPkg([
  // minified css for browser
  { entrypoints: ['main.css'] },
]);
