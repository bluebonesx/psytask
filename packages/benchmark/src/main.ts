import { html } from 'lit-html';
import { h, promiseWithResolvers } from '../../psytask/src/util';
import { getLibs, getTasks } from './macro' with { type: 'macro' };
import { Overlay, Plot, detectEnvironment, injectResource } from './util';

const env = await detectEnvironment();
const libs = await getLibs();
const tasks = await getTasks();

class Runner extends Overlay {
  constructor(public hash: string) {
    super(document.body);
  }
  async run(
    lib: string,
    task: string,
    saved: boolean,
    params: BenchmarkParams,
  ) {
    document.title = `Benchmark-${lib}.${task}`;
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    document.body.innerHTML = '';

    // load env
    await Promise.all([
      injectResource('link', { rel: 'stylesheet', href: `${lib}/main.css` }),
      injectResource('script', {
        type: 'module',
        src: `${lib}/${task}.bench.js`,
      }),
    ]);

    if (typeof window.__benchmark__ !== 'function') {
      throw new Error(`Load environment failed on: ${lib} ${task}`);
    }

    // test
    let prev: number;
    const datas: Benchmark[] = [];
    const waitForDone = promiseWithResolvers();

    await Promise.all([
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

        if (done) waitForDone.resolve(null);
      }, params),
      waitForDone.promise,
    ]);

    // save data
    if (saved) {
      const el = h('a', {
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
  override html() {
    try {
      const options = Object.fromEntries(new URLSearchParams(this.hash));
      if (options.params) options.params = JSON.parse(options.params);

      const { lib, task, saved, params } = options;
      if (!lib || !task) {
        throw new Error(`Missing required parameters: lib and task`);
      }

      const run = () =>
        this.run(
          lib,
          task,
          saved === 'true',
          params as unknown as BenchmarkParams,
        ).catch((err) => this.showOverlay(err));
      return html`<div
        style="height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center;"
        tabindex="0"
        @click=${run}
      >
        <p style="font-size: 1.2rem;">Click anywhere to RUN</p>
        <pre>${JSON.stringify(options, null, 2)}</pre>
        ${super.html()}
      </div>`;
    } catch (err) {
      this.showOverlay(err + '');
      return super.html();
    }
  }
}
class Launcher extends Overlay {
  options = {
    lib: libs[0]!,
    task: tasks[0]!,
    count: 100,
    saved: false,
  };
  plot?: Plot;
  constructor() {
    super(document.body);

    document.documentElement.style.filter = 'invert(1)';
    Object.assign(document.body.style, {
      backgroundColor: 'white',
      margin: '2rem',
      textAlign: 'center',
      lineHeight: 1.5,
      fontFamily: 'Arial, sans-serif',
      fontSize: '1.2rem',
    });
  }
  async run() {
    const { lib, task, count, saved } = this.options;
    const win = window.open(
      `#lib=${lib}&task=${task}&saved=${saved}&params={"count":${count}}`,
    );
    if (!win) {
      this.showOverlay('Can not open test page');
      return;
    }

    // receive data
    const { promise, resolve } = promiseWithResolvers<Benchmark[]>();
    win.__benchmark_send = resolve;
    const datas = await promise;

    // draw
    this.plot ??= new Plot(document.querySelector('fieldset#result')!);
    this.plot.add(
      lib,
      datas.map((e) => e.value - e.except),
    );
  }
  override html() {
    const options = this.options;

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
        children: html`<ol style="text-align: left; color: red;">
            ${tips.map((e) => html`<li>${e}</li>`)}
          </ol>
          <details style="color: gray;">
            <summary>debug</summary>
            <textarea readonly>${JSON.stringify(env, null, 2)}</textarea>
            <textarea
              readonly
              @click=${(e: Event) => {
                (e.target as HTMLTextAreaElement).textContent = JSON.stringify(
                  options,
                  null,
                  2,
                );
              }}
            >
${JSON.stringify(options, null, 2)}</textarea
            >
          </details>`,
      },
      {
        label: 'options',
        children: html`<div>
            <label for="task">Task:</label>
            <select
              id="task"
              @change=${(e: Event) => {
                options.task = (e.target as HTMLSelectElement).value;
              }}
            >
              ${tasks.map((e) => html`<option value=${e}>${e}</option>`)}
            </select>
            <label for="lib">Library:</label>
            <select
              id="lib"
              @change=${(e: Event) => {
                options.lib = (e.target as HTMLSelectElement).value;
              }}
            >
              ${libs.map((e) => html`<option value=${e}>${e}</option>`)}
            </select>
            <label for="count">Count:</label>
            <input
              id="count"
              type="number"
              .value=${options.count + ''}
              @input=${(e: Event) => {
                options.count = Number((e.target as HTMLInputElement).value);
              }}
            />
            <label for="save-data">Save data?</label>
            <input
              id="save-data"
              type="checkbox"
              .checked=${options.saved}
              @change=${(e: Event) => {
                options.saved = (e.target as HTMLInputElement).checked;
              }}
            />
          </div>
          <button @click=${() => this.run()}>RUN</button> `,
      },
      {
        label: 'result',
        children: html``,
      },
    ];
    return html`${panels.map(
      (panel) =>
        html`<fieldset id="${panel.label}" style="border-bottom: none;">
          <legend>${panel.label}</legend>
          ${panel.children}
        </fieldset>`,
    )}`;
  }
}

async function main() {
  const hash = location.hash.slice(1);
  if (hash) {
    new Runner(hash).render();
    return;
  }
  new Launcher().render();
}
main();
