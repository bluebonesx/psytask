import { confirm, isCancel, outro, select, text } from '@clack/prompts';
import fs from 'node:fs/promises';
import path from 'node:path';

const templateDir = path.join(
  import.meta.dirname,
  (process.env.NODE_ENV === 'production' ? '../' : './') + 'template',
);
const unwrap = async <T>(maybeCancelPromise: Promise<T | symbol>) => {
  const result = await maybeCancelPromise;
  if (isCancel(result)) {
    process.exit(0);
  }
  return result;
};
const modify = async (
  filepath: string,
  replacer: (content: string) => string,
) => {
  const content = await fs.readFile(filepath, 'utf-8');
  const modified = replacer(content);
  await fs.writeFile(filepath, modified);
};
(async () => {
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
  const useTypeScript = await unwrap(
    confirm({ message: `Use TypeScript?`, initialValue: false }),
  );
  const bundler = await unwrap(
    select({
      message: 'Select a bundler:',
      options: [{ value: 'vite' }, { value: 'bun' }] as const,
      initialValue: 'vite' as const,
    }),
  );

  // check target dir
  const targetDir = path.join(process.cwd(), projectName);
  await fs.access(targetDir, fs.constants.W_OK).then(
    async () => {
      const shouldOverwrite = await unwrap(
        confirm({
          message: `Directory already exists. Do you want to overwrite it?`,
          initialValue: false,
        }),
      );
      if (!shouldOverwrite) return;
      await fs.rm(targetDir, { recursive: true, force: true });
    },
    () => fs.mkdir(targetDir, { recursive: true }),
  );

  // copy
  await fs.cp(templateDir, targetDir, { recursive: true });
  const pth = path.join.bind(null, targetDir);
  const modifyTasks = [
    // package.json
    modify(pth('package.json'), (content) =>
      JSON.stringify(
        Object.assign(JSON.parse(content), {
          name: projectName,
          scripts:
            bundler === 'bun'
              ? {
                  dev: 'bun index.html',
                  build: 'bun build index.html --outdir=dist --production',
                  'type-check': useTypeScript ? 'tsc --noEmit' : void 0,
                }
              : {
                  dev: 'vite',
                  build: 'vite build',
                  preview: 'vite preview',
                  'type-check': useTypeScript ? 'tsc --noEmit' : void 0,
                },
          devDependencies: {
            typescript: useTypeScript ? '^5' : void 0,
            vite: bundler === 'vite' ? '^7' : void 0,
          },
        }),
        null,
        2,
      ),
    ),
  ];
  // js
  if (!useTypeScript) {
    modifyTasks.push(
      modify(pth('index.html'), (content) =>
        content.replace('main.ts', 'main.js'),
      ),
      fs.rename(pth('main.ts'), pth('main.js')),
      fs.rename(pth('tsconfig.json'), pth('jsconfig.json')),
    );
  }
  await Promise.all(modifyTasks);

  outro(`Project created successfully: ${targetDir}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
