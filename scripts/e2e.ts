/// <reference lib="DOM" />

import path from 'node:path';
import {
  chromium,
  firefox,
  webkit,
  type BrowserContext,
  type BrowserType,
  type ConsoleMessage,
  type Download,
  type LaunchOptions,
  type Page,
} from 'playwright';
import { __DEV__, __ROOT__, red, yellow } from './utils';

const prefix = `http://127.0.0.1:3000` + (__DEV__ ? '/psytask' : '');
const logLevelColors: {
  [K in ReturnType<ConsoleMessage['type']>]?: (msg: string) => string;
} = { error: red, warning: yellow /* info: green, log: cyan, debug: blue  */ };

const browsers: { type: BrowserType; options?: LaunchOptions }[] = __DEV__
  ? [
      {
        type: chromium,
        options: { channel: 'chrome', headless: false },
      },
      // {
      //   type: firefox,
      //   options: { executablePath: '/usr/bin/firefox', headless: false },
      // },
    ]
  : [{ type: chromium }, { type: firefox }, { type: webkit }];
const scripts: Record<
  string,
  (id: string, page: Page, context: BrowserContext) => Promise<void>
> = {
  async tests(id, page) {
    await page.locator('button').first().click();
    await page.evaluate((id: string) => {
      const target = document.querySelector('[data-test]');
      if (!target) throw Error('Cannot find target element');

      return new Promise((resolve, reject) => {
        setTimeout(() => reject(Error('timeout: 1 min')), 60 * 1e3);
        new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type !== 'attributes') return;
            const value = target.getAttribute(m.attributeName!);
            if (value === 'failed')
              return reject(
                Error(`${id}: attr ${m.attributeName} is ${value}`),
              );
            if (value === 'passed') return resolve(0);
          }
        }).observe(target, {
          attributes: true,
          attributeFilter: ['data-test'],
        });
      });
    }, id);
  },
  benchmark: (() => {
    const durations = __DEV__ ? [17] : [17 /* , 4e2, 7e2, 1e3 */];
    const injectedVar = {
      cases: [] as string[],
      count: __DEV__ ? 1e3 : 1e3,
      duration: durations[0]!,
    };
    const downloadPath = path.join(__ROOT__, 'dist/download');
    // console.log(
    //   'Total time',
    //   (durations.reduce((a, b) => a + b) *
    //     injectedVar.count *
    //     injectedVar.cases.length *
    //     browsers.length) /
    //     1e3 /
    //     60,
    // );

    return async (id, page, context) => {
      context.on('page', (page) => page.locator('pre').click());
      for (const duration of durations) {
        injectedVar.duration = duration;
        if (injectedVar.cases.length === 0) {
          injectedVar.cases = await page.locator('option').allTextContents();
        }
        await page.evaluate(async ({ cases, duration, count }) => {
          //@ts-expect-error
          const fn = window['__BENCHMARK_RUNNER__'];
          if (!fn) throw Error(`${id}: Cannot find __BENCHMARK_RUNNER__`);
          for (const name of cases) await fn({ case: name, count, duration });
        }, injectedVar);

        const [download]: [Download, any] = await Promise.all([
          page.waitForEvent('download'),
          page.evaluate(() => {
            //@ts-expect-error
            const fn = window['__BENCHMARK_EXPORT__'];
            if (!fn) throw Error(`${id}: Cannot find __BENCHMARK_EXPORT__`);
            return fn();
          }),
        ]);
        await download.saveAs(
          `${downloadPath}/${download.suggestedFilename()}`,
        );
      }
    };
  })(),
};

// main
const scriptName = process.argv[2]?.trim();
const script = scriptName && scripts[scriptName];
if (!script) throw Error(`Usage: this ${Object.keys(scripts).join('|')}`);
await Promise.all(
  browsers.map(async ({ type, options }) => {
    const browser = await type.launch(options);
    const id = `${type.name()}/${browser.version()}-${scriptName}`;
    console.log(` ============= ${id} ============= `);

    const context = await browser.newContext();
    const page = (await context.newPage()).on('console', async (msg) => {
      const type = msg.type();
      const typeText = logLevelColors[type]?.(`[${type.toUpperCase()}]`);
      typeText &&
        console.log(
          id,
          typeText,
          msg.text(),
          ...(await Promise.all(
            msg.args().map((h) => h.jsonValue().catch((err) => '' + err)),
          )),
        );
    });

    await page.goto(`${prefix}/${scriptName}/`, { waitUntil: 'networkidle' });
    await script(id, page, context);
    await page.close();
    await browser.close();
  }),
);
