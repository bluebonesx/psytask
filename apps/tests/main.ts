import { error_normalize, isObject, mount } from 'shared/utils';
import van from 'vanjs-core';
import { calc, noreactive, reactive } from 'vanjs-ext';
import { sleep } from './cases/utils';
const { button, details, div, pre, section, summary } = van.tags;

type CaseView = {
  render(): HTMLElement;
  state: 'pending' | 'passed' | 'failed' | 'running';
  duration: string;
  job(e?: PointerEvent): void;
  raw: () => void | Promise<void>;
  error?: unknown;
};
type CaseSetView = {
  render(): HTMLElement;
  state: 'pending' | 'passed' | 'failed' | 'running';
  job(e?: PointerEvent): void;
  tree: ViewTree;
  size: number;
};
type ViewRaw = { [key: string]: CaseView['raw'] | ViewRaw };
type ViewTree = { [key: string]: CaseView | CaseSetView };

const mods = {
  core: await import('./cases/core.test'),
  psytask: await import('./cases/psytask.test'),
  components: await import('./cases/components.test'),
  jspsych: await import('./cases/jspsych.test'),
} satisfies ViewRaw;
const raw2tree = (raw: ViewRaw): ViewTree =>
  Object.entries(raw).reduce((acc, [name, val]) => {
    // build leaf
    if (typeof val === 'function') {
      const view: CaseView = reactive({
        render: () =>
          div(
            { 'data-test': () => view.state },
            section(
              button({ onclick: view.job }, '▶'),
              () => `${name} | ${view.duration ?? ''}`,
            ),
            () => {
              const { error } = view;
              if (!error) return '';
              const err = error_normalize(error);
              const base = `${err.name}: ${err.message}`;
              return pre(
                { style: 'color:red;overflow:auto', contentEditable: true },
                err.stack
                  ? err.stack.startsWith(base)
                    ? err.stack
                    : `${base}\n${err.stack}`
                  : base,
              );
            },
          ),
        state: 'pending',
        job(e) {
          e?.preventDefault();
          runJob(async () => {
            try {
              view.state = 'running';
              const st = performance.now();
              await val();
              view.duration = (performance.now() - st).toFixed(2);
              view.state = 'passed';
              view.error = null;
            } catch (err) {
              console.error(name, err);
              view.state = 'failed';
              view.error = isObject(err) ? noreactive(err) : err;
              throw err;
            }
          });
        },
        raw: val,
        error: null,
        duration: '',
      });
      return { ...acc, [name]: view };
    }
    // build tree
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
          if (s === 'failed' || s == 'running') return s;
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
          await sleep(1); // after render pipeline and other setTimeout callbacks
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
    ...Object.values(raw2tree({ ALL: mods })).map((v) => v.render()),
  ),
);
