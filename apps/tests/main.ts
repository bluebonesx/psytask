import { useHash } from 'shared/hook';
import van from 'vanjs-core';
import { getTestFiles } from './macro' with { type: 'macro' };
const { a, div, h3, p, pre, section } = van.tags;

const todos = new Set<() => Promise<void>>();
const runJobs = async () => {
  for (const job of todos) {
    try {
      await job();
    } catch (err) {
      console.error('job error:', err);
    } finally {
      todos.delete(job);
    }
  }
};
const addJob = (job: () => Promise<void>) => {
  todos.size === 0 && window.queueMicrotask(runJobs);
  todos.add(job);
};

const format = (raw: string) => {
  const indent = raw.match(/\n( *)\}$/)?.[1];
  if (indent == null) throw new Error('Cannot determine indent:\n' + raw);
  // console.log(raw);
  return raw
    .slice(raw.indexOf('{') + 1, raw.lastIndexOf('}'))
    .replace(new RegExp(`^${indent}  `, 'gm'), '')
    .trim();
};
function TestCase(fn: Function) {
  const status = van.state('⏸ Pending');
  const color = van.state('#aaa');
  const run = async () => {
    status.val = '⏳ Running...';
    color.val = '#ffb347';
    try {
      await fn();
      status.val = '✅ Passed';
      color.val = '#4ade80';
    } catch (err) {
      status.val = '❌ Failed: ' + err;
      color.val = '#f87171';
      console.error(`test error [${fn.name}]:`, err);
    }
  };
  return div(
    p({ onclick: () => addJob(run) }, fn.name),
    pre(format(fn.toString())),
    pre({ style: () => 'color:' + color.val }, status),
  );
}
function App() {
  const hash = useHash();
  const status = van.derive(() =>
    hash.val ? `Loading case ${hash.val}...` : getTestFiles(),
  );
  const mod = van.state<Record<string, Record<string, Function>>>({});

  van.derive(() => {
    if (!hash.val) {
      mod.val = {};
      return;
    }
    import(`./${hash.val}.test.js?t=${Date.now()}`).then(
      (_mod) => {
        status.val = '';
        mod.val = _mod;
      },
      (err) => {
        status.val = `Failed to load ${hash.val}: ` + err;
      },
    );
  });

  const root = div(
    { id: 'app' },
    () =>
      typeof status.val === 'string'
        ? pre(status.val)
        : div(...status.val.map((f) => a({ href: `#${f}` }, f))),
    h3(
      {
        hidden: () => !hash.val,
        style: 'text-transform: uppercase; padding: 0.75rem;',
        onclick: () => root.querySelectorAll('p').forEach((e) => e.click()),
      },
      hash,
    ),
    () =>
      div(
        ...Object.entries(mod.val).map(([name, casesObj]) => {
          const root = div(
            h3(
              {
                onclick: () =>
                  root.querySelectorAll('p').forEach((e) => e.click()),
              },
              name.replace(/_/g, ' '),
            ),
            section(Object.values(casesObj).map((caseFn) => TestCase(caseFn))),
          );
          return root;
        }),
      ),
  );
  return root;
}

van.add(document.body, App());
