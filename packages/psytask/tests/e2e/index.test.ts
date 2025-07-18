import { $, build, file, fileURLToPath, Glob, serve } from 'bun';
import { afterAll, describe, test } from 'bun:test';
import { watch } from 'node:fs/promises';
import path from 'node:path';
import { launch } from 'puppeteer-core';
import { port } from 'shared/script';

const root = path.resolve('./tests/e2e');

// load tests
const files = await Promise.all(
  (
    await Array.fromAsync(new Glob('**/!{.test,.d}.ts').scan({ cwd: root }))
  ).map(async (name) => {
    const filepath = path.resolve(root, name);
    const tests = await import(filepath);
    return [name, filepath, tests] as const;
  }),
);
if (files.length === 0) {
  throw new Error('No e2e tests found');
}

// CSS file
const cssFilepath = path.resolve('./main.css');
let cssCode = await $`bun build --target=browser ${cssFilepath}`.text();
(async () => {
  for await (const event of watch(cssFilepath)) {
    if (event.eventType === 'change') {
      const code = await $`bun build --target=browser ${cssFilepath}`.text();
      if (code !== cssCode) {
        cssCode = code;
        process.stdout.write(`CSS changed: ${cssFilepath}\n`);
      }
    }
  }
})();
const jsPsychCssCode = await file(
  fileURLToPath(import.meta.resolve('jspsych/css/jspsych.css')),
).text();

// load server
const entrypoint = path.resolve('./index.ts');
serve({
  port,
  async fetch(req) {
    // input validation
    const { searchParams } = new URL(req.url);
    const $import = searchParams.get('import');
    const $from = searchParams.get('from');
    const jspsychcss = searchParams.get('jspsychcss') === 'true';
    if (!$import || !$from) {
      return new Response('Missing label or mod parameter', { status: 400 });
    }

    // build browser test
    const result = await build({
      entrypoints: [entrypoint],
      target: 'browser',
      minify: false,
      define: { 'global.$prod': 'true' },
      plugins: [
        {
          name: 'generate browser test',
          setup(build) {
            build.onLoad({ filter: /.*/ }, async (args) => ({
              contents:
                args.path === entrypoint
                  ? `import { ${$import} as fn } from '${$from}';await fn();`
                  : (await file(args.path).text()).replace(
                      /import [^\n]+? from \'bun:test\'/,
                      '',
                    ),
            }));
          },
        },
      ],
    });
    if (!result.success) {
      throw Error('Build failed:' + result.logs);
    }
    if (result.outputs.length !== 1) {
      throw Error(
        'Build should have one output, but got: ' +
          result.outputs.map((v) => v.path).join(', '),
      );
    }
    const jsCode = await result.outputs[0]!.text();
    if (jsCode === '') {
      throw Error('Build output is empty');
    }

    // browser test HTML
    return new Response(
      `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Test: ${$from}.${$import}</title>
    ${jspsychcss ? `<style>${jsPsychCssCode}</style>` : ''}
    <style>${cssCode}</style>
  </head>
  <body></body>
  <script type="module">${jsCode}</script>
</html>`,
      {
        headers: {
          'Content-Type': 'text/html',
          // 'Cache-Control': 'no-cache, no-store',
        },
      },
    );
  },
});
process.stdout.write(
  `Server launched: \x1b[32mhttp://127.0.0.1:${port}/\x1b[0m\n`,
);

// load browser
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await launch({
  executablePath,
  browser: executablePath!.includes('firefox') ? 'firefox' : 'chrome',
  headless: false,
  devtools: false,
});
afterAll(async () => {
  // close browser if all test pages are closed
  if ((await browser.pages()).length <= 1) {
    await browser.close();
  }
});
process.stdout.write(
  `Browser launched: \x1b[34m${await browser.version()}\x1b[0m\n`,
);

// run tests
describe.each(files)('%s', (label, filepath, tests) => {
  test.each(Object.keys(tests))('%s', async (name) => {
    const page = await browser.newPage();

    // throw error if page error occurs
    page.on('pageerror', (error) => {
      throw error;
    });

    // load browser test
    await page.goto(
      `http://127.0.0.1:${port}?from=${filepath}&import=${name}&jspsychcss=${filepath.includes('jspsych')}`,
    );
    await page.waitForSelector('div.psytask-scene');

    // load local test
    await tests[name](page);

    // close page if test is passed
    await page.close();
  });
});
