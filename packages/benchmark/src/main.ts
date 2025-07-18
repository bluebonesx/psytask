import { detectEnvironment, h, mean_std } from '../../psytask/src/util';
import { getLibs, getTasks } from './macro' with { type: 'macro' };

const TASKS_LINK = `https://github.com/bluebones-team/psytask/tree/main/packages/benchmark/src/`;

document.documentElement.style.filter = 'invert(1)';
Object.assign(document.body.style, {
  backgroundColor: 'white',
  margin: '2rem',
  textAlign: 'center',
  lineHeight: 1.5,
  fontSize: '1.5rem',
  fontFamily: 'Arial, sans-serif',
});
const env = await detectEnvironment();
const libs = await getLibs();
const tasks = await getTasks();
console.log(libs, tasks);
if (env['in-app']) {
  alert('Please run benchmark in browser, not in apps or webview.');
  throw new Error('Benchmark should be run in browser.');
}

// create DOM
const taskEls = libs.map((lib) =>
  h('div', { ariaCurrent: lib, style: { cursor: 'pointer' } }),
);
const shouldSaveDataEl = h('input', {
  id: 'should-save-data',
  type: 'checkbox',
  checked: false,
  style: { width: '1.2rem', height: '1.2rem', marginLeft: '0.8rem' },
});
document.body.innerHTML = '';
const tips: string[] = [
  'It is better to CLOSE ALL extensions, other tabs and applications.',
  'Do not close this page during the task RUNNING.',
  'Do not leave task page until the task is DONE.',
];
if (env.browser === 'firefox' && !env.mobile) {
  tips.unshift(
    'Please goto "about:config" and set "privacy.reduceTimerPrecision" to "false", then restart Firefox, if you haven\'t done this.',
  );
}
document.body.append(
  h(
    'ol',
    {
      style: {
        textAlign: 'left',
        color: 'red',
        fontSize: 'smaller',
        whiteSpace: 'pre-wrap',
      },
    },
    tips.map((e) => h('li', void 0, e)),
  ),
  h('hr'),
  h(
    'div',
    {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '2rem',
      },
    },
    taskEls,
  ),
  h('hr'),
  h('div', {}, [
    h('label', { htmlFor: 'should-save-data' }, 'Save benchmark data?'),
    shouldSaveDataEl,
  ]),
  h(
    'button',
    {
      style: {
        fontSize: 'x-small',
        color: 'gray',
        border: 'none',
        background: 'transparent',
      },
      onclick(ev) {
        ev.preventDefault();
        alert(JSON.stringify(env, null, 2));
      },
    },
    'show environment',
  ),
);

// run tasks
function runTask(
  taskEl: HTMLDivElement,
  lib: string,
  task: string,
  cssText: string,
  jsText: string,
) {
  const win = window.open();
  if (!win) {
    throw new Error('Failed to open new window');
  }
  win['__benchmark__'] = (datas) => {
    console.log(datas);
    win.close();
    // show stats
    const errors = datas.map((e) => e.value - e.except);
    const { mean, std } = mean_std(errors);
    const { mean: M, std: SD } = mean_std(
      errors.filter((v) => mean - std * 3 <= v && v <= mean + std * 3),
    );
    taskEl.innerHTML = `${lib}.${task} is DONE.<br/><small>click to retry</small><br/>M: ${M.toFixed(
      2,
    )}, SD: ${SD.toFixed(2)}`;
    // save data
    if (!shouldSaveDataEl.checked) return;
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
  };
  // inject html
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Benchmark-${lib}.${task}</title>
    <style>${cssText}</style>
  </head>
  <body></body>
  <script>(async function(){${jsText}})()</script>
</html>`;
  win.setTimeout(() => {
    win.document.writeln(html);
  }, 100);
  // trigger load event manually
  const _addEventListener = win.addEventListener;
  win.addEventListener = function (
    ...[type, listener, options]: Parameters<Window['addEventListener']>
  ) {
    if (type === 'load' && typeof listener === 'function') {
      listener.call(this, new Event(type));
      return;
    }
    _addEventListener.call(this, type, listener, options);
  };
}
async function loadResource(url: string, contentType: string) {
  const res = await fetch(url);
  if (res.status !== 200) {
    throw new Error(`Failed to load ${url}: ${res.statusText}`);
  }
  if (!res.headers.get('Content-Type')?.includes(contentType)) {
    throw new Error(
      `Invalid content type for ${url}: ${res.headers.get('Content-Type')}`,
    );
  }
  return res.text();
}
async function loadTasks() {
  const task = location.hash.slice(1);
  taskEls.forEach((el) => {
    el.innerHTML = '';
    el.onclick = null;
  });
  // no task
  if (task === '') {
    const el = h('div', void 0, 'Loading tasks from GitHub...');
    taskEls[0]!.append(
      `Please select a TASK by adding #task to the URL, or click the following links:`,
      el,
    );
    el.innerHTML = tasks.map((e) => `<a href="#${e}">${e}</a>`).join(', ');
    return;
  }
  // load tasks
  taskEls.map(async (el, i) => {
    const lib = el.ariaCurrent!;
    el.innerHTML = `${lib}.${task} is LOADING...`;
    try {
      const cssText = await loadResource(`${lib}/main.css`, 'css');
      const jsText = await loadResource(
        `${lib}/${task}.bench.js`,
        'javascript',
      );
      el.innerHTML = `${lib}.${task} is READY.<br/>Click me to start.`;
      el.onclick = () => runTask(el, lib, task, cssText, jsText);
    } catch (error) {
      el.innerHTML = `${lib}.${task} loadding FAILED,<br/>
goto <a href="${TASKS_LINK + lib}" target="_blank">GitHub</a>
to find available tasks.<br/>${error}`;
    }
  });
}
window.addEventListener('hashchange', loadTasks);
loadTasks();
