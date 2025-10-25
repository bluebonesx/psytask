import { useFetch } from '@psytask/components';
import van from 'vanjs-core';
import { reactive } from 'vanjs-ext';
import { useHash } from 'shared/hook';
import { ERR, map, mount } from 'shared/utils'; //@ts-ignore
import { glob } from 'shared/macros' with { type: 'macro' };

const { a, button, div, h1, iframe, option, select } = van.tags;

// check support
if (typeof Symbol.dispose === 'undefined')
  mount(
    div(
      h1('Sorry, not supported'),
      `Please use the latest version of Chrome, Firefox, Edge.
See `,
      a(
        { href: 'https://caniuse.com/mdn-javascript_statements_using' },
        'which browsers are supported',
      ),
    ),
  ) && ERR('not support');

// static data
const examples = glob('*.js', { cwd: 'examples' }).map((f) =>
  f.replace('.js', ''),
);
const importMap = map(
  JSON.parse(
    document.querySelector('script[type="importmap"]')?.textContent ?? '{',
  ).imports as Record<string, string>,
  (value) => {
    const data = { import: value, types: value.replace('.min.js', '.d.ts') };
    if (value.startsWith('../')) {
      data.import = new URL(data.import, location.href).href;
      data.types = new URL(data.types, location.href).href;
    }
    return data;
  },
);
const files = {
  JavaScript: { uri: 'main.js', value: '/* Write your code here */\n' },
  CSS: {
    uri: 'main.css',
    value: `@import "https://cdn.jsdelivr.net/npm/jspsych@8.2.2/css/jspsych.css";
@import "https://cdn.jsdelivr.net/npm/@jspsych/plugin-survey/css/survey.css";`,
  },
  ImportMap: {
    uri: 'importmap.json',
    value: JSON.stringify(importMap, null, 2),
  },
};
const fileIndexes = Object.keys(files) as (keyof typeof files)[];

// states
const hash = useHash(examples[0]);
const exampleRes = useFetch(() =>
  hash.val ? `./${hash.val}.js` : 'about:blank',
);
const store = reactive({
  indication: 'Loading resources...',
  editor: {
    files: map(files, (file) => file.value),
    activeTab: 'JavaScript' as keyof typeof files,
    save() {
      editor.trigger('editor', 'editor.action.formatDocument', null);
      fileIndexes.map(
        (key) => (store.editor.files[key] = models[key].getValue()),
      );
      // force trigger preview update
      window.frames[0]!.location.reload();
    },
    render: () =>
      div(
        div(
          ...fileIndexes.map((name) =>
            button(
              {
                'data-selected': () => store.editor.activeTab === name,
                onclick: (e) => (store.editor.activeTab = name),
                disabled: () => !!store.indication,
              },
              name,
            ),
          ),
          select(
            {
              onchange: (e) =>
                (location.hash = (e.target as HTMLSelectElement).value),
              disabled: () => !!store.indication,
            },
            ...examples.map((example) =>
              option(
                { value: example, selected: () => example === hash.val },
                example.replace(/-/g, ' '),
              ),
            ),
          ),
          button(
            {
              title: 'Ctrl + S to run',
              onclick: (e) => (e.stopPropagation(), store.editor.save()),
              disabled: () => !!store.indication,
            },
            'RUN',
          ),
        ),
        root,
      ),
  },
  preview: {
    url: '',
    render: () =>
      iframe({
        src: () => {
          URL.revokeObjectURL(store.preview.url);
          const { files } = store.editor;
          const blob = new Blob(
            [
              `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script type="importmap">${JSON.stringify({
      imports: map(JSON.parse(files.ImportMap), (v) => v.import),
    })}</script>
    <style>${files.CSS}</style>
  </head>
  <body style="white-space:pre-wrap;font-family:monospace;">
    <script>
const root = document.body.appendChild(document.createElement('p'));
root.style = 'color:red';
window.onerror = (error) => root.textContent += \`===\n\${error.stack ?? error}\n\n\`;
window.onunhandledrejection = ({ reason }) => root.textContent += \`===\n\${reason.stack ?? reason}\n\n\`;
    </script>
    <script type="module">${files.JavaScript}</script>
  </body>
</html>`,
            ],
            { type: 'text/html' },
          );
          return (store.preview.url = URL.createObjectURL(blob));
        },
      }),
  },
});

// effects
van.derive(
  () =>
    // change tab
    !store.indication && editor.setModel(models[store.editor.activeTab]),
);
van.derive(async () => {
  // load example
  if (store.indication || !hash.val) return;
  exampleRes.loading
    ? (store.editor.files.JavaScript = `/* Loading ${hash.val} */`)
    : exampleRes.status === 'failed'
      ? (store.editor.files.JavaScript = `/* Failed to load ${hash.val} */`)
      : (store.editor.files.JavaScript = await exampleRes.data.text());
  fileIndexes.map((key) => models[key].setValue(store.editor.files[key]));
});

// dom
const root = div(() => store.indication);
mount(div({ id: 'app' }, store.editor.render(), store.preview.render()));

// load monaco-related
const [{ loadMonaco }, { shikiToMonaco }, { createHighlighter }] =
  await Promise.all(
    [
      'https://cdn.jsdelivr.net/npm/monaco-editor-esm-cdn@0.1.1/load-monaco.min.js',
      'https://esm.sh/@shikijs/monaco@3.13.0?exports=shikiToMonaco',
      'https://esm.sh/shiki@3.13.0?exports=createHighlighter',
    ].map((url) => import(url)),
  ).catch((e: unknown) => {
    store.indication = 'Resource load failed: ' + e;
    throw e;
  });
const monaco = await loadMonaco().catch((e: unknown) => {
  store.indication = 'Monaco load failed: ' + e;
  throw e;
});
// init monaco
{
  const ts = monaco.languages.typescript;
  const defs = ts.javascriptDefaults;
  defs.setEagerModelSync(true);
  defs.setCompilerOptions({
    lib: ['esnext', 'dom'],
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    strict: true,
    strictNullChecks: true,
    allowJs: true,
    checkJs: true,
    allowNonTsExtensions: true,
  });
  defs.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  // load types
  map(
    importMap,
    async ({ types }, mod) =>
      types &&
      defs.addExtraLib(
        `declare module '${mod}' {\n${await (await fetch(types)).text()}\n};`,
        `file:///node_modules/@types/${mod}/index.d.ts`,
      ),
  );
  // module suggestions
  monaco.languages.registerCompletionItemProvider('javascript', {
    triggerCharacters: ['"', "'"],
    provideCompletionItems(...[model, position]: any) {
      const textUntilPosition = model
        .getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        })
        .trim();
      if (/import(\s+.*from)?\s+['"]$/.test(textUntilPosition)) {
        return {
          suggestions: Object.keys(importMap).map((key) => ({
            label: key,
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: key,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
          })),
        };
      }
      return { suggestions: [] };
    },
  });
  // use shiki highlighter
  const highlighter = await createHighlighter({
    themes: ['dark-plus'],
    langs: ['javascript', 'typescript', 'css', 'json'],
  });
  shikiToMonaco(highlighter, monaco);
}

// init editor
const editor = monaco.editor.create(root, {
  fontSize: 12,
  tabSize: 2,
  theme: 'dark-plus',
  automaticLayout: true,
  minimap: { enabled: true },
});
const models = map(files, (file) =>
  monaco.editor.createModel(file.value, void 0, monaco.Uri.file(file.uri)),
);
{
  // format on blur
  editor.onDidBlurEditorText(() =>
    editor.trigger('editor', 'editor.action.formatDocument', null),
  );
  // save on ctrl+s
  editor.onKeyDown((e: any) => {
    if (e.ctrlKey && e.browserEvent.key === 's') {
      e.preventDefault();
      store.editor.save();
    }
  });
  // relayout on resize
  window.onresize = () => editor.layout({ width: 0, height: 0 });
}

store.indication = '';

//@ts-ignore
window.monaco = monaco;
//@ts-ignore
window.store = store;
