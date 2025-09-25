declare global {
  type Benchmark = { except: number; value: number };
  type BenchmarkParams = { count: number } & Record<string, any>;
  interface Window {
    __benchmark__(
      mark: (index: number, except: number, done: boolean) => void,
      params: BenchmarkParams,
    ): Promise<void> | void;
    __benchmark_send(data: Benchmark[]): void;
  }
}

import { detect } from 'detect-browser';
import { useHash } from 'shared/hook';
import { detect_fps } from 'shared/utils';
import van, { type State } from 'vanjs-core';
import {
  getLibConfigs,
  getLibs,
  getTasks,
} from './macro' with { type: 'macro' };
const {
  div,
  fieldset,
  legend,
  li,
  ol,
  p,
  pre,
  select,
  label,
  option,
  button,
  input,
  img,
  a,
} = van.tags;

async function detectEnvironment() {
  const panel = document.body.appendChild(
    div({ style: 'text-align:center; ine-height:100dvh' }),
  );

  const ua = navigator.userAgent;
  const browser = detect(ua);
  if (!browser) {
    throw new Error('Cannot detect browser environment');
  }
  const env = {
    ua,
    os: browser.os,
    browser: browser.name + '/' + browser.version,
    mobile: /Mobi/i.test(ua),
    'in-app': /wv|in-app/i.test(ua), // webview or in-app browser
    screen_wh_pix: [window.screen.width, window.screen.height] as [
      width: number,
      height: number,
    ],
    window_wh_pix: (function () {
      const wh: [width: number, height: number] = [
        window.innerWidth,
        window.innerHeight,
      ];
      window.addEventListener('resize', () => {
        wh[0] = window.innerWidth;
        wh[1] = window.innerHeight;
      });
      return wh;
    })(),
    frame_ms: await detect_fps({ root: panel }),
  } as const;

  panel.remove();
  console.log('env', env);
  return env;
}
const env = await detectEnvironment();
const libs = getLibs();
const tasks = getTasks();
const libConfigs = await getLibConfigs();
console.log(libs, tasks, libConfigs);

window.addEventListener('error', alert);
window.addEventListener('unhandledrejection', (e) => alert(e.reason));

type TestOptions = {
  lib: string;
  task: string;
  saved: boolean;
  params: BenchmarkParams;
};
async function runTest({ lib, task, saved, params }: TestOptions) {
  document.title = `Benchmark-${lib}.${task}`;
  await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  document.documentElement.style = '';
  document.body.innerHTML = '';

  // load env
  function injectResource(tag: string, props: {}) {
    return new Promise((resolve, reject) => {
      const el = document.createElement(tag);
      Object.assign(el, props);
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Failed to load resource: ${tag}`));
      document.head.appendChild(el);
    });
  }
  const config = libConfigs[lib]!;
  await Promise.all(
    config.css.map((href) =>
      injectResource('link', { rel: 'stylesheet', href }),
    ),
  );
  for (const src of config.js) await injectResource('script', { src });
  await injectResource('script', {
    src: `${lib}/${task}.bench.js?t=${Date.now()}`,
  });

  if (typeof window.__benchmark__ !== 'function') {
    throw new Error(`Load environment failed on: ${lib} ${task}`);
  }

  // test
  let prev: number;
  const datas: Benchmark[] = [];
  let resolve: () => void;

  await Promise.all([
    new Promise<void>((r) => (resolve = r)),
    window.__benchmark__((curr, except, done) => {
      // calc duration
      performance.mark('mark-' + curr);
      if (prev == null) {
        prev = curr;
        return;
      }
      datas.push({
        value: performance.measure('duration', 'mark-' + prev, 'mark-' + curr)
          .duration,
        except,
      });
      prev = curr;

      if (done) resolve();
    }, params),
  ]);

  // save data
  if (saved) {
    const el = a({
      download: `benchmark_${lib}.${task}_${Date.now()}.json`,
      href: URL.createObjectURL(
        new Blob(
          [JSON.stringify(datas.map((e) => ({ ...env, lib, task, ...e })))],
          { type: 'application/json' },
        ),
      ),
    });
    document.body.appendChild(el);
    el.click();
    URL.revokeObjectURL(el.href);
    document.body.removeChild(el);
  }

  // send data
  window.__benchmark_send?.(datas);
  window.close();
}
function Runner(hash: State<string>) {
  const options = van.derive(() => {
    const raw = Object.fromEntries(new URLSearchParams(hash.val));
    return {
      lib: raw.lib ?? libs[0]!,
      task: raw.task ?? tasks[0]!,
      saved: raw.saved === 'true',
      params: raw.params ? JSON.parse(raw.params) : null,
    };
  });
  document.addEventListener('pointerup', () => runTest(options.val), {
    once: true,
  });
  return div(
    { id: 'app', tabIndex: 0 },
    div(
      p('Click anywhere to RUN'),
      pre(() => JSON.stringify(options.val, null, 2)),
    ),
  );
}

type ChartDatas = Record<string, number[]>;
function Plot(data: State<ChartDatas>) {
  function histogram(data: ChartDatas) {
    const seriesLabels = Object.keys(data).sort();
    const allValues = seriesLabels.flatMap((k) => data[k] || []);
    if (!allValues.length) {
      return {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: { title: { display: true, text: 'no data' } },
      };
    }

    let min = Math.min(...allValues);
    let max = Math.max(...allValues);
    if (min === max) {
      min -= 0.5;
      max += 0.5;
    }

    const binCount = 50; // hard coded
    const binWidth = (max - min) / binCount;
    const binStarts = Array.from(
      { length: binCount },
      (_, i) => min + i * binWidth,
    );
    const binEnds = binStarts.map((s, i) =>
      i === binCount - 1 ? max : s + binWidth,
    );
    const mids = binStarts.map((s, i) => (s + binEnds[i]!) / 2);

    const histogramCounts = (values: number[]): number[] => {
      const counts = Array(binCount).fill(0);
      for (const v of values) {
        if (Number.isNaN(v)) continue;
        let idx = Math.floor((v - min) / binWidth);
        if (idx < 0) idx = 0;
        if (idx >= binCount) idx = binCount - 1;
        counts[idx]++;
      }
      return counts;
    };
    return {
      type: 'line',
      data: {
        datasets: seriesLabels.map((label, i) => {
          const counts = histogramCounts(data[label]!);
          return {
            label,
            data: counts.map((c, idx) => ({
              x: +mids[idx]!.toFixed(6),
              y: c,
            })),
          };
        }),
      },
      options: {
        scales: {
          xAxes: [
            {
              type: 'linear',
              scaleLabel: { display: true, labelString: 'Error (ms)' },
            },
          ],
          yAxes: [
            {
              scaleLabel: { display: true, labelString: 'Frequency' },
              ticks: { precision: 0 },
            },
          ],
        },
        annotation: {
          annotations: [
            {
              type: 'line',
              scaleID: 'x-axis-0',
              value: 0,
              borderColor: 'white',
              borderDash: [6, 4],
            },
          ],
        },
      },
    };
  }

  const status = van.state('');
  const url = van.derive(() => {
    if (Object.keys(data.val).length === 0) {
      status.val = 'no data';
      return '';
    }
    status.val = 'drawing...';
    return (
      'https://quickchart.io/chart?c=' +
      encodeURIComponent(JSON.stringify(histogram(data.val)))
    );
  });
  return div(
    p(status),
    img({
      onload: () => (status.val = ''),
      onerror: () => url.val && (status.val = 'load error'),
      src: () => url.val,
    }),
  );
}
function Launcher() {
  const options: State<TestOptions> = van.state({
    lib: libs[0]!,
    task: tasks[0]!,
    saved: false,
    params: { count: 100 },
  });
  const charDatas: State<ChartDatas> = van.state({});

  async function launch({ lib, task, params, saved }: TestOptions) {
    const win = window.open(
      '#' +
        new URLSearchParams({
          lib,
          task,
          saved: saved + '',
          params: JSON.stringify(params),
        }),
    );
    if (!win) {
      throw new Error('Open new window failed');
    }

    // receive data
    const datas = await new Promise<Benchmark[]>(
      (r) => (win.__benchmark_send = r),
    );

    // draw
    charDatas.val = {
      ...charDatas.val,
      [lib]: datas.map((e) => e.value - e.except),
    };
  }

  const tips: string[] = [
    'It is better to CLOSE ALL extensions, other tabs and applications.',
    'Do not close this page during the task RUNNING.',
    'Do not leave task page until the task is DONE.',
  ];
  if (env.browser.includes('firefox') && !env.mobile) {
    tips.unshift(
      'Please goto "about:config" and set "privacy.reduceTimerPrecision" to "false", then restart Firefox, if you haven\'t done this.',
    );
  }
  const panels = [
    {
      label: 'tips',
      children: ol(...tips.map((e) => li(e))),
    },
    {
      label: 'options',
      children: div(
        label({ for: 'task' }, 'Task:'),
        select(
          {
            id: 'task',
            value: () => options.val.task,
            onchange: (e: Event) => {
              options.val = {
                ...options.val,
                task: (e.target as HTMLSelectElement).value,
              };
            },
          },
          ...tasks.map((e) => option({ value: e }, e)),
        ),
        label({ for: 'lib' }, 'Library:'),
        select(
          {
            id: 'lib',
            value: () => options.val.lib,
            onchange: (e: Event) => {
              options.val = {
                ...options.val,
                lib: (e.target as HTMLSelectElement).value,
              };
            },
          },
          ...libs.map((e) => option({ value: e }, e)),
        ),
        label({ for: 'count' }, 'Count:'),
        input({
          id: 'count',
          type: 'number',
          value: () => options.val.params.count + '',
          onchange: (e: Event) => {
            options.val = {
              ...options.val,
              params: {
                ...options.val.params,
                count: Number((e.target as HTMLInputElement).value),
              },
            };
          },
        }),
        label({ for: 'save-data' }, 'Save data?'),
        input({
          id: 'save-data',
          type: 'checkbox',
          checked: () => options.val.saved,
          onchange: (e: Event) => {
            options.val = {
              ...options.val,
              saved: (e.target as HTMLInputElement).checked,
            };
          },
        }),
        button({ onclick: () => launch(options.val) }, 'RUN'),
      ),
    },
    {
      label: 'result',
      children: Plot(charDatas),
    },
    {
      label: 'about',
      children: div(
        pre(JSON.stringify(env, null, 2)),
        pre(() => JSON.stringify(options.val, null, 2)),
      ),
    },
  ];
  return div(
    { id: 'app' },
    ...panels.map((p) =>
      fieldset({ id: p.label }, legend(p.label), p.children),
    ),
  );
}

const hash = useHash();
van.add(document.body, () => (hash.val ? Runner(hash) : Launcher()));
