import type { MaybePromise } from 'bun';
import fs from 'node:fs/promises';
import path from 'node:path';
import { workspaces } from '../bun.lock';

export const __ROOT__ = path.resolve(import.meta.dir, '..');
export const __DEV__ = process.argv[process.argv.length - 1] === '--dev';

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

type UserConfig = {
  importmap?: Record<string, string>;
  styles?: string[];
  watchItems?: string[];
  before?: () => MaybePromise<void>;
  after?: () => MaybePromise<void>;
  resolve?: (path: string) => string | null;
};
export type Project = {
  root: string;
  name: string;
  path: string;
  lockJson: Bun.BunLockFileWorkspacePackage;
  pkgJson: Record<string, any>;
  userConfig?: UserConfig;
  /** 1: built; 0: not built; 10: not visited; 11: visiting; <0: visited order */
  state: number;
  deps: Project[];
};
export const projects: Project[] = [];
// load projects
for (const item in workspaces) {
  if (!item.includes('/')) continue;

  const [root, name] = item.split('/', 2) as [string, string];
  const projPath = path.join(__ROOT__, item);
  const configPath = path.join(projPath, 'build.config.ts');
  const pkgJson = await import(path.join(projPath, 'package.json'));
  projects.push({
    state: 10,
    deps: [],
    root,
    name,
    path: projPath,
    lockJson: workspaces[item]!,
    pkgJson,
    userConfig: (await fs.exists(configPath))
      ? await import(configPath)
      : void 0,
  });
}
// resolve dependencies
for (const proj of projects) {
  proj.deps = Object.entries({
    ...proj.pkgJson.dependencies,
    ...proj.pkgJson.devDependencies,
  } as Record<string, string>)
    .filter(([, version]) => version.startsWith('workspace:'))
    .map(([pkgName]) => projects.find((e) => e.pkgJson.name === pkgName)!);
}
// topological sort. TODO: maybe not needed
{
  let order = 0;
  const visit = (proj: Project) => {
    if (proj.state < 0) return;
    if (proj.state === 11) throw Error('Cyclic dependency: ' + proj.name);
    proj.state = 11; // visiting
    proj.deps.forEach(visit);
    proj.state = --order; // visited
  };
  for (const proj of projects) visit(proj);
  for (const proj of projects) proj.deps.sort((a, b) => b.state - a.state);
  projects.sort((a, b) => b.state - a.state);
}

// console.log(
//   projects.reduce(
//     (acc, p) => ({ ...acc, [p.name]: p.deps?.map((dep) => dep.name) }),
//     {},
//   ),
// );
// console.log(projects.map((p) => p.path).join('\n'));
