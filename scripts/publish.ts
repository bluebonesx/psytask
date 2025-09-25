import path from 'path';
import { cyan, green, yellow } from 'picocolors';
import { DEV, log, projects } from './utils';

const pkgs = projects.filter(
  (e) => e.root === 'packages' && e.name !== 'shared',
);
const formatRGX = /["\r\n]/g;

if (DEV) log(cyan('Checking publish status (dev mode)...'));
for (const pkg of pkgs) {
  // get package name and version
  const name = (
    await Bun.spawn({
      cwd: pkg.path,
      cmd: ['bun', 'pm', 'pkg', 'get', 'name'],
    }).stdout.text()
  ).replace(formatRGX, '');
  const version = (
    await Bun.spawn({
      cwd: pkg.path,
      cmd: ['bun', 'pm', 'pkg', 'get', 'version'],
    }).stdout.text()
  ).replace(formatRGX, '');

  // fetch published version
  const view = (await (
    await fetch(`https://registry.npmjs.org/${name}`, {
      headers: { Accept: 'application/vnd.npm.install-v1+json' },
    })
  ).json()) as Record<string, any>;
  const publishedVersion =
    view.error === 'Not found' ? 'none' : view['dist-tags'].latest;

  // skip logic
  if (!publishedVersion)
    throw new Error(`Failed to fetch published version for ${name}`);
  if (publishedVersion === version) {
    log(yellow('Skipping ') + `${name} (${publishedVersion} == ${version})`);
    continue;
  }
  if (DEV) {
    log(
      green('Would publish ') + `${name} (${publishedVersion} -> ${version})`,
    );
    continue;
  }

  // publish
  (await Bun.spawn({
    cwd: pkg.path,
    cmd: ['bun', path.join(import.meta.dir, 'build.ts')], // build
    stdout: 'inherit',
  }).exited) ||
    (await Bun.spawn({
      cwd: pkg.path,
      cmd: ['bun', 'pm', 'publish', '-p', '--access', 'public'], // publish
      stdout: 'inherit',
    }).exited) ||
    log(green('Published ') + `${name} (${publishedVersion} -> ${version})\n`);
}
