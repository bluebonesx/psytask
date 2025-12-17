import { glob } from 'shared/macro' with { type: 'macro' };
import { doc, ERR, error_normalize, mount, tags } from 'shared/utils';

const Dashboard = async () => {
  const { detectFPS, on } = await import('psytask');
  const { default: van } = await import('vanjs-core');
  const { calc, noreactive, reactive } = await import('vanjs-ext');
  const { detect } = await import(
    //@ts-expect-error external module
    'https://cdn.jsdelivr.net/npm/detect-browser@5.3.0/es/index.min.js'
  );
  const { div, button, select, option, input, label, pre, form, h2 } = van.tags;

  const cases = glob('**/*.js', { cwd: 'cases' })
    .map((f) => f.replace('.js', ''))
    .sort((a, b) => (a > b ? -1 : 1));
  const env = await (async () => {
    const ua = navigator.userAgent;
    const browser = detect(ua);
    if (!browser) return ERR('Cannot detect browser environment');

    const dpr = (() => {
      const dpr = van.state(devicePixelRatio);
      let cleanup: () => void;
      van.derive(() => {
        cleanup?.();
        cleanup = on(
          matchMedia(`(resolution: ${dpr.val}dppx)`),
          'change',
          () => (dpr.val = devicePixelRatio),
        );
      });
      return dpr;
    })();
    return reactive({
      ua,
      os: browser.os,
      browser: browser.name + '/' + browser.version,
      mobile: /Mobi/i.test(ua),
      'in-app': /wv|in-app/i.test(ua), // webview or in-app browser
      screen: noreactive({
        width: screen.width,
        height: screen.height,
      }),
      dpr: calc(() => dpr.val),
      window: (() => {
        const store = reactive({
          width: calc(() => innerWidth * dpr.val),
          height: calc(() => innerHeight * dpr.val),
        });
        on(window, 'resize', () => {
          store.width = innerWidth * dpr.val;
          store.height = innerHeight * dpr.val;
        });
        return store;
      })(),
      frame_times: noreactive(
        await detectFPS({
          root: doc.body,
          frames_count: 20,
          leave_alert: 'Please DO NOT leave this tab during FPS detection.',
        }),
      ),
    });
  })();

  const config = reactive<BenchmarkConfig>({
    case: cases[0]!,
    count: 1e3,
    duration: 1e2,
  });
  const results = (window[
    //@ts-expect-error for debug
    'R'
  ] = reactive<BenchmarkResultMap>({}));
  window.__BENCHMARK_RUNNER__ = (cfg = config) =>
    new Promise((resolve, reject) => {
      const url = '#' + encodeURIComponent(JSON.stringify(cfg));
      const win = open(url, '_blank');
      if (!win) return reject(Error('Can not open new window.'));
      win.addEventListener('load', () => {
        win.document.addEventListener('visibilitychange', () => {
          if (win.document.hidden) {
            win.close();
            reject(Error("Please don't leave that page"));
          }
        });
      });
      win.__BENCHMARK_RECEIVER__ = (res) =>
        resolve((results[cfg.case] = noreactive(res)));
    });
  window.__BENCHMARK_IMPORT__ = (text) =>
    Object.assign(results, JSON.parse(text).results);
  window.__BENCHMARK_EXPORT__ = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ env, results })], {
        type: 'application/json',
      }),
    );
    const el = mount(
      tags.a({ download: `benchmark-${Date.now()}.json`, href: url }),
    );
    el.click();
    el.remove();
    URL.revokeObjectURL(url);
  };

  return div(
    { id: 'app' },
    div(
      { open: true },
      h2(
        'Config',
        button(
          {
            onclick() {
              const form = document.querySelector('form')!;
              form.checkValidity()
                ? window.__BENCHMARK_RUNNER__().catch((err) => {
                    console.error('Failed to run benchmark', err);
                    alert(err);
                  })
                : form.reportValidity();
            },
          },
          'Run Benchmark',
        ),
      ),
      form(
        label(
          'case: ',
          select(
            {
              required: true,
              onchange: (e) =>
                (config.case = (e.target as HTMLSelectElement).value),
            },
            cases.map((l) =>
              option({ value: l, selected: () => config.case === l }, l),
            ),
          ),
        ),
        label(
          'count: ',
          input({
            type: 'number',
            required: true,
            min: 1,
            step: 1,
            value: () => config.count,
            onchange(e) {
              const val = +(e.target as HTMLInputElement).value;
              config.count = Number.isNaN(val) ? 1 : val;
            },
          }),
        ),
        label(
          'duration: ',
          input({
            type: 'number',
            required: true,
            min: 1,
            step: 0.01,
            value: () => config.duration,
            onchange(e) {
              const val = +(e.target as HTMLInputElement).value;
              config.duration = Number.isNaN(val) ? 1 : val;
            },
          }),
        ),
      ),
    ),
    div(
      { open: true },
      h2(
        'Results',
        button(
          { onclick: () => Object.keys(results).map((k) => delete results[k]) },
          'Clear',
        ),
        button(
          {
            onclick() {
              document
                .querySelector<HTMLInputElement>('input[type=file]')!
                .click();
            },
          },
          'Import',
          input({
            hidden: true,
            type: 'file',
            accept: '.json',
            async onchange(e) {
              const file: File = e.target.files[0];
              if (file) window.__BENCHMARK_IMPORT__(await file.text());
            },
          }),
        ),
        button({ onclick: window.__BENCHMARK_EXPORT__ }, 'Export'),
      ),
      div(
        { style: 'justify-content:center;' },
        // pre(() => JSON.stringify(results, null, 2)),
        ...(await import('./chart')).Charts(results),
      ),
    ),
    div(
      h2('Environment'),
      pre(() => JSON.stringify(env, null, 2)),
    ),
  );
};
const Runner = async (hash: string) => {
  const root = tags.div({ id: 'root' });
  const urlPrefix = location.origin + location.pathname;

  const config: BenchmarkConfig = JSON.parse(decodeURIComponent(hash));
  const filepath = `./${config.case}.js`;
  const module = await import(filepath);
  const job: BenchmarkCase = module.default;
  if (typeof job !== 'function')
    ERR(`Invalid module (no default exported): ${filepath}`);

  // run benchmark
  const extraDeps = ['https://cdn.jsdelivr.net/npm/nosleep.js@0.12.0/+esm'];
  const nosleep = new (await import(extraDeps[0]!)).default();

  (async () => {
    await new Promise((resolve) => {
      mount(
        tags.pre({
          onclick() {
            nosleep.enable();
            root.innerHTML = '';
            doc.title = `Running ${config.case}...`;
            setTimeout(resolve, 1e3);
          },
          textContent: `Config:\n${JSON.stringify(config, null, 2)}\n\nClick to start.`,
        }),
        root,
      );
    });

    const result: BenchmarkResult = { ...config, deps: {}, timings: [] };
    const loadDeps = new Set<string>();
    await job({
      root,
      config,
      async load(name, url, create) {
        const res = await fetch(url);
        const blob = await res.blob();

        loadDeps.add(url);
        if (name) result.deps[name] = blob.size;
        const text = await blob.text();
        mount(
          (create?.(text) ?? url.endsWith('.css'))
            ? tags.style({ textContent: text })
            : tags.script({ textContent: text }),
        );
      },
      onDraw() {
        const { timings } = result;
        requestAnimationFrame((time) => {
          timings.length
            ? timings.push(time - timings.pop()!, time)
            : timings.push(time);
        });
      },
    });
    result.timings.pop(); // remove last frame time
    performance.getEntriesByType('resource').map((r) => {
      // job dep sizes
      if (
        r.name.startsWith(urlPrefix) ||
        r.name.includes('favicon') ||
        loadDeps.has(r.name) ||
        extraDeps.includes(r.name)
      )
        return;
      result.deps[r.name] = r.decodedBodySize;
    });

    if (window.__BENCHMARK_RECEIVER__) {
      window.__BENCHMARK_RECEIVER__(result);
      close();
    } else {
      ERR(`Done! Result:\n${JSON.stringify(result, null, 2)}`);
    }
  })().catch((err) => {
    console.error('Failed to run benchmark', err);
    alert(err);
  });

  return root;
};

const hash = location.hash.slice(1);
mount(
  await (hash ? Runner(hash) : Dashboard()).catch((error) => {
    console.error(error);
    const err = error_normalize(error);
    const prefix = err.name + ': ' + err.message;
    return tags.pre({
      textContent: err.stack
        ? err.stack.includes(prefix)
          ? err.stack
          : prefix + '\n' + err.stack
        : prefix,
    });
  }),
);
