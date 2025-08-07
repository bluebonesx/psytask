#!/usr/bin/env node

import { confirm, isCancel, outro, text } from '@clack/prompts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateDir = path.join(__dirname, 'template');

async function unwrap<T>(maybeCancelPromise: Promise<T | symbol>) {
  const result = await maybeCancelPromise;
  if (isCancel(result)) {
    process.exit(0);
  }
  return result;
}
const isObject = (val: unknown) => val !== null && typeof val === 'object';
function deepMerge(target: Record<string, any>, source: Record<string, any>) {
  for (const key of Object.keys(source)) {
    const oldVal = target[key];
    const newVal = source[key];

    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      target[key] = Array.from(new Set([...oldVal, ...newVal]));
    } else if (isObject(oldVal) && isObject(newVal)) {
      target[key] = deepMerge(oldVal, newVal);
    } else {
      target[key] = newVal;
    }
  }
  return target;
}
async function main() {
  // input
  const projectName = (
    await unwrap(
      text({
        message: 'Project name:',
        placeholder: 'psytask-project',
        defaultValue: 'psytask-project',
      }),
    )
  ).trim();
  const targetDir = path.join(process.cwd(), projectName);
  if (
    await fs.access(targetDir).then(
      () => true,
      () => false,
    )
  ) {
    const shouldOverwrite = await unwrap(
      confirm({
        message: `Directory already exists. Do you want to overwrite it?`,
        initialValue: false,
      }),
    );
    if (!shouldOverwrite) return;
    await fs.rm(targetDir, { recursive: true, force: true });
  }

  const engine = process.argv0;
  const useTypeScript = await unwrap(
    confirm({ message: `Use TypeScript?`, initialValue: false }),
  );

  // copy
  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(path.join(templateDir, 'shared'), targetDir, { recursive: true });
  await fs.cp(
    path.join(templateDir, 'app', useTypeScript ? 'ts' : 'js'),
    targetDir,
    { recursive: true },
  );

  // package.json
  const targetPkgFilepath = path.join(targetDir, 'package.json');
  const pkgJson = deepMerge(
    {
      name: projectName,
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: {
        psytask: '^1',
      },
      devDependencies: {
        typescript: engine === 'node' && useTypeScript ? '^5' : void 0,
      },
    },
    JSON.parse(
      await fs.readFile(
        path.join(templateDir, 'engine', engine, 'package.json'),
        'utf-8',
      ),
    ),
  );
  await fs.writeFile(targetPkgFilepath, JSON.stringify(pkgJson, null, 2));

  outro(`Project created successfully: ${targetDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
