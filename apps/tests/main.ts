import { isObject, mount } from 'shared/utils';
import van from 'vanjs-core';
import { calc, noreactive, reactive } from 'vanjs-ext';
import { spy_functionCall } from './cases/utils';
const { button, details, div, section, span, summary } = van.tags;

type ViewRaw = { [key: string]: Function | ViewRaw };
type CaseView = {
  render(): HTMLElement;
  state: 'pending' | 'passed' | 'error';
  job(e?: PointerEvent): void;
  raw: Function;
  error?: any;
};
type CaseSetView = {
  render(): HTMLElement;
  state: 'pending' | 'passed' | 'error';
  job(e?: PointerEvent): void;
  tree: ViewTree;
  size: number;
};
type ViewTree = { [key: string]: CaseView | CaseSetView };

const mods = {
  psytask: await import('./cases/psytask.test'),
  core: await import('./cases/core.test'),
  components: await import('./cases/components.test'),
  jspsych: await import('./cases/jspsych.test'),
} satisfies ViewRaw;
const raw2tree = (raw: ViewRaw): ViewTree =>
  Object.entries(raw).reduce((acc, [name, val]) => {
    if (typeof val === 'function') {
      const view: CaseView = reactive({
        render: () =>
          div(
            { 'data-test': () => view.state },
            section(button({ onclick: view.job }, '▶'), name),
            () =>
              view.error
                ? span(
                    { style: 'color:red' },
                    ' ' + (view.error.stack ?? view.error),
                  )
                : '',
          ),
        state: 'pending',
        job(e) {
          e?.preventDefault();
          runJob(async () => {
            try {
              view.state = 'pending';
              await val();
              view.state = 'passed';
              view.error = null;
            } catch (err) {
              view.state = 'error';
              view.error = isObject(err) ? noreactive(err) : err;
              throw err;
            }
          });
        },
        raw: val,
        error: null,
      });
      return { ...acc, [name]: view };
    }
    const tree = raw2tree(val);
    const cases = Object.values(tree);
    const view: CaseSetView = reactive({
      render: () =>
        details(
          {
            'data-test': () => view.state,
            open: true, // for debugger
          },
          summary(
            button({ onclick: view.job }, '▶'),
            name.replace(/_/g, ' ') + ` - ${view.size}`,
          ),
          div(...cases.map((c) => c.render())),
        ),
      state: calc(() => {
        const states = cases.map((e) => e.state);
        let hasPassed = !!states.length;
        for (const s of states) {
          if (s === 'error') return s;
          if (s === 'pending') hasPassed = false;
        }
        return hasPassed ? 'passed' : 'pending';
      }),
      job: () => cases.map((c) => c.job()),
      tree,
      size: cases.reduce((acc, c) => acc + ('size' in c ? c.size : 1), 0),
    });
    return { ...acc, [name]: view };
  }, {});

// Job queue to run tests sequentially
const todos = new Set<() => Promise<void>>();
const runJob = (job: () => Promise<void>) => {
  todos.size === 0 &&
    window.queueMicrotask(async () => {
      for (const job of todos) {
        try {
          await job();
          todos.delete(job);
        } catch (err) {
          todos.clear();
          throw err; // stop on error
        }
      }
    });
  todos.add(job);
};

mount(
  div(
    { id: 'app', style: 'height:100dvh;overflow:auto' },
    ...Object.values(
      //@ts-ignore
      (window['store'] = raw2tree({ ALL: mods })),
    ).map((v) => v.render()),
  ),
);

// override fetch to use test server
const _fetch = fetch;
spy_functionCall(globalThis, 'fetch', (input, init) =>
  _fetch(
    input instanceof Request
      ? input
      : new URL(
          input,
          'https://httpcan.org' /** @link httpbin.org mockhttp.org */,
        ),
    init,
  ),
);
