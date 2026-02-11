import path from 'node:path';
import { buildProject } from './build';
import { __DEV__, green, log, projects, yellow } from './utils';

const pkgs = projects.filter((e) => e.root === 'packages');
const should_skip = async (pkg: (typeof pkgs)[0]) => {
  // get package name and version
  const { name, version } = pkg.lockJson;

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
    throw new Error(`Failed to fetch published versio实n for ${name}`);
  if (publishedVersion === version) {
    log(yellow('Skipping ') + `${name} (${publishedVersion} == ${version})`);
    return true;
  }
  log(green('Publishing ') + `${name} (${publishedVersion} -> ${version})`);
};

for (const pkg of pkgs) {
  if (await should_skip(pkg)) continue;
  await buildProject(pkg, true);

  if (__DEV__) {
    // pack
    const packpath = (
      await Bun.$`bun pm pack --cwd=${pkg.path} --destination=dist --quiet`.text()
    ).trim();
    const unpackpath = path.dirname(packpath);
    await Bun.$`mkdir -p ${unpackpath}`;
    await Bun.$`tar -xzf ${packpath} -C ${unpackpath}`;
  } else {
    // publish
    await Bun.$`FORCE_COLOR=1 bun publish --cwd=${pkg.path} --access public`;
  }
}
