import path from 'path';
import { cyan, __DEV__, green, log, projects, yellow } from './utils';
import { buildProject } from './build';

const pkgs = projects.filter((e) => e.root === 'packages');

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
  try {
    await Bun.$`cd ${pkg.path} && FORCE_COLOR=1 bun publish -p --access public${__DEV__ ? ' --dry-run' : ''}`;
  } catch (e) {
    throw Error(`Failed to publish ${name}: ${e}`);
  }
}
