import path from 'path';
import { buildProject } from './build';
import { __DEV__, green, log, projects, yellow } from './utils';

const pkgs = projects.filter((e) => e.root === 'packages');
const cmd = ['bun', 'publish', '-p', '--access', 'public'];
__DEV__ && cmd.push('--dry-run');

for (const pkg of pkgs) {
  // get package name and version
  const { name, version } = await import(path.join(pkg.path, 'package.json'));

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

  // publish
  log(green('Publishing ') + `${name} (${publishedVersion} -> ${version})`);
  await buildProject(pkg); // build
  const code = await Bun.spawn({ cwd: pkg.path, cmd, stdout: 'inherit' })
    .exited;
  if (code != 0) {
    throw Error(`Failed to publish ${name}: ${code}`);
  }
}
