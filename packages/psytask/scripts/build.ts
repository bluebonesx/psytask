import { $, build, type BuildConfig } from 'bun';
import { clearDirIfExists } from 'shared/script';
import packageConfig from '../package.json';

const outdir = 'dist';
await clearDirIfExists(outdir);

const baseConfig: Omit<BuildConfig, 'entrypoints'> = {
  outdir,
  target: 'browser',
  minify: true,
  banner: `/**
 * ${packageConfig.name[0]?.toUpperCase() + packageConfig.name.slice(1)} v${packageConfig.version}
 * @author ${packageConfig.author}
 * @license ${packageConfig.license}
 */`,
};
await Promise.all([
  // minified css for browser
  build({
    entrypoints: ['main.css'],
    ...baseConfig,
  }),

  // minified js for browser production environment
  build({
    entrypoints: ['index.ts'],
    ...baseConfig,
    naming: 'index.min.js',
    define: { 'process.env.NODE_ENV': '"production"' },
  }),

  // normal js for Node.js development environment
  build({
    entrypoints: ['index.ts'],
    ...baseConfig,
    naming: 'index.js',
    external: Object.keys(packageConfig.dependencies || {}),
    minify: false,
    define: { 'process.env.NODE_ENV': 'process.env.NODE_ENV' },
  }),

  // // TypeScript declarations
  // $`dts-bundle-generator \
  // -o ./dist/index.d.ts \
  // --export-referenced-types false \
  // --no-banner \
  // --no-check \
  // -- index.ts`,
]);
