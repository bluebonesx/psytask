import fs from 'node:fs/promises';
import { buildApp } from 'shared/scripts';

buildApp([() => fs.cp('./examples', './dist', { recursive: true })], {
  importmap: {
    '@stackblitz/sdk':
      'https://cdn.jsdelivr.net/npm/@stackblitz/sdk@1/bundles/sdk.m.js',
  },
});
