import { glob } from 'fs/promises';
import path from 'path';
import { workspaces } from '../package.json';

export const __CONFIG_FILE__ = 'build.config.ts';
export const __ROOT__ = path.resolve(import.meta.dir, '..');
export const __DEV__ = process.argv[2] === '--dev';

export const red = (msg: string) => `\x1b[31m${msg}\x1b[0m`;
export const green = (msg: string) => `\x1b[32m${msg}\x1b[0m`;
export const yellow = (msg: string) => `\x1b[33m${msg}\x1b[0m`;
export const blue = (msg: string) => `\x1b[34m${msg}\x1b[0m`;
export const cyan = (msg: string) => `\x1b[36m${msg}\x1b[0m`;

export const log = (msg: string) => process.stdout.write(msg + '\n');
export const withCwd = <T>(cwd: string) => {
  const oldCwd = process.cwd();
  process.chdir(cwd);
  return {
    [Symbol.dispose]() {
      process.chdir(oldCwd);
    },
  };
};

export type Project = {
  root: string;
  name: string;
  path: string;
  pkgJson: Record<string, any>;
  /** 1: built; 0: not built; 10: not visited; 11: visiting; <0: visited order */
  state: number;
  deps?: Project[];
};
export const projects: Project[] = [];
// load projects
for await (const item of glob(workspaces.packages)) {
  if (item === 'shared') continue;
  const [root, name] = item.split('/') as [string, string];
  const pkgJson = await import(path.join(__ROOT__, item, 'package.json'));
  projects.push({
    state: 10,
    root,
    name,
    path: path.join(__ROOT__, item),
    pkgJson,
  });
}
// resolve dependencies
for (const proj of projects) {
  const deps = Object.entries({
    ...proj.pkgJson.dependencies,
    ...proj.pkgJson.devDependencies,
  } as Record<string, string>)
    .filter(([, version]) => version.startsWith('workspace:'))
    .map(([pkgName]) => projects.find((e) => e.pkgJson.name === pkgName)!);
  deps.length && (proj.deps = deps);
}
// topological sort
{
  let order = 0;
  const visit = (proj: Project) => {
    if (proj.state < 0) return;
    if (proj.state === 11) throw Error('Cyclic dependency: ' + proj.name);
    proj.state = 11; // visiting
    proj.deps?.forEach(visit);
    proj.state = --order; // visited
  };
  for (const proj of projects) visit(proj);
  for (const proj of projects) proj.deps?.sort((a, b) => b.state - a.state);
  projects.sort((a, b) => b.state - a.state);
}
// console.log(
//   projects.reduce(
//     (acc, p) => ({ ...acc, [p.name]: p.deps?.map((dep) => dep.name) }),
//     {},
//   ),
// );
