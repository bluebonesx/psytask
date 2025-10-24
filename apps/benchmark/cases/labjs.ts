import { loadCss } from 'shared/utils';
await loadCss('https://cdn.jsdelivr.net/npm/lab.js@20.2.4/dist/lab.css');

const lab = await import(
  //@ts-ignore
  'https://cdn.jsdelivr.net/npm/lab.js@20.2.4/+esm'
);
