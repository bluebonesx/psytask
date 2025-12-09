# PsyTask

![NPM Version](https://img.shields.io/npm/v/psytask)
![NPM Downloads](https://img.shields.io/npm/dm/psytask)
![jsDelivr hits (npm)](https://img.shields.io/jsdelivr/npm/hm/psytask)

JavaScript Framework for Psychology tasks.
Make psychology task development like making PPTs.
Compatible with the [jsPsych](https://github.com/jspsych/jsPsych) plugins.

Compared to jsPsych, PsyTask has:

- Easier and more flexible development experiment.
- Higher time precision.
- Smaller bundle size, Faster loading speed.

**[API Docs](https://bluebonesx.github.io/psytask)** or **[Play it now ! 🥳](https://bluebonesx.github.io/psytask/play)**

## Install

via NPM:

```bash
npm create psytask # create a project
```

```bash
npm i psytask # only install
```

via CDN:

```html
<!-- add required packages  -->
<script type="importmap">
  {
    "imports": {
      "psytask": "https://cdn.jsdelivr.net/npm/psytask@1/dist/index.min.js",
      "@psytask/core": "https://cdn.jsdelivr.net/npm/@psytask/core@1/dist/index.min.js",
      "@psytask/components": "https://cdn.jsdelivr.net/npm/@psytask/components@1/dist/index.min.js",
      "vanjs-core": "https://cdn.jsdelivr.net/npm/vanjs-core@1.6",
      "vanjs-ext": "https://cdn.jsdelivr.net/npm/vanjs-ext@0.6"
    }
  }
</script>
<!-- load packages -->
<script type="module">
  import { createApp } from 'psytask';

  using app = await creaeApp();
</script>
```

> [!WARNING]
> PsyTask uses the modern JavaScript [`using` keyword](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Statements/using) for automatic resource cleanup.
>
> For CDN usage in old browsers that don't support the `using` keyword, you will see `Uncaught SyntaxError: Unexpected identifier 'app'`. You need to change the code:
>
> ```js
> // Instead of: using app = await createApp();
> const app = await createApp();
> // ... your code ...
> app.emit('dispose'); // Manually clean up when done
> ```
>
> Or, you can use the bundlers (like Vite, Bun, etc.) to transpile it.

## Usage

The psychology tasks are just like PPTs, they both have a series of scenes.
So writing a psychology task only requires 2 steps:

1. create scene
2. show scene

### Create Scene

```js
import { Grating } from '@psytask/components';

using simpleText = app.scene(
  // component
  Grating,
  // scene options
  {
    defaultProps: { type: Math.sin, size: 100, sf: 0.02 }, // show params
    duration: 1e3, // show 1000 ms
    close_on: 'key: ', // close on space key
  },
);
```

Most of the time, you need to write the scene yourself, see [Component](#component):

```js
import { on, getCurrentScene } from 'psytask';
import { ImageStim } from '@psytask/components';

using scene = app.scene(
  /** @param {{ text: string }} props */
  (props) => {
    /** @type {{ response_key: string; response_time: number }} */
    let data;
    const ctx = getCurrentScene();
    const node = document.createElement('div');

    // use other Component
    node.appendChild(ImageStim({ image: new ImageData(1) }));

    // add DOM event listener
    const cleanup = on(ctx.root, 'keydown', (e) => {
      if (e.key !== 'f' || e.key !== 'j') return;
      data = { response_key: e.key, response_time: e.timeStamp };
      ctx.close(); // close on 'f' or 'j'
    });

    ctx
      // reset data on show
      .on('show', () => {
        data = { response_key: '', response_time: 0 };
      })
      // remove DOM event listenr on dispose
      .on('dispose', cleanup);

    // Return the element and data getter
    return { node, data: () => data };
  },
  {
    defaultProps: { text: '' },
    duration: 1e3,
    close_on: 'mouse:left',
  },
);
```

> [!TIP]
> use [JSDoc Comment](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) to get type hint in JavaScript.

### Show Scene

Overide default props or options:

```js
const data = await scene.show({ text: 'Press F or J' }); // with new props
const data = await scene.config({ duration: 1e3 }).show(); // with new options
```

a series of trials:

```js
import { RandomSampling, StairCase } from 'psytask';

// fixed sequence
for (const text of ['A', 'B', 'C']) {
  await scene.show({ text });
}

// random sequence
for (const text of RandomSampling({
  candidates: ['A', 'B', 'C'],
  sample: 10,
  replace: true,
})) {
  await scene.show({ text });
}

// staircase
const staircase = StairCase({
  start: 10,
  step: 1,
  up: 3,
  down: 1,
  reversals: 6,
  min: 1,
  max: 12,
  trial: 20,
});
for (const value of staircase) {
  const data = await scene.show({ text: value });
  const correct = data.response_key === 'f';
  staircase.response(correct); // set response
}
```

### Data Collection

```js
using dc = app.collector('data.csv');

for (const text of ['A', 'B', 'C']) {
  const data = await scene.show({ text });

  // `frame_times` will be recorded automatically
  const start_time = /** @type {number} */ (data.frame_times[0]);

  dc.add({
    text,
    response: data.response_key,
    rt: data.response_time - start_time,
    correct: data.response_key === 'f',
  }); // add a row
}

dc.final(); // get final text
dc.download(); // download file
```

## Integration

### [jsPsych](https://www.jspsych.org/plugins/list-of-plugins/)

```bash
npm i @psytask/jspsych @jspsych/plugin-cloze
npm i -d jspsych # optional: for type hint
```

Or using CDN:

```html
<!-- load jspsych css-->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/jspsych@8.2.2/css/jspsych.css"
/>
<!-- add packages -->
<script type="importmap">
  {
    "imports": {
      ...
      "@psytask/jspsych": "https://cdn.jsdelivr.net/npm/@psytask/jspsych@1/dist/index.min.js",
      "@jspsych/plugin-cloze": "https://cdn.jsdelivr.net/npm/@jspsych/plugin-cloze@2.2.0/+esm"
    }
  }
</script>
```

> [!IMPORTANT]
> For CDNer, you should add the `+esm` after the jspsych plugin CDN URL, because jspsych plugins do not release ESM versions. Or you can use [esm.sh](https://esm.sh).

```js
import { jsPsychStim } from '@psytask/jspsych';
import Cloze from '@jspsych/plugin-cloze';

using jspsych = app.scene(jsPsychStim, { defaultProps: {} });
const data = await jspsych.show({
  type: Cloze,
  text: 'aba%%aba',
  check_answers: true,
});
```

### [JATOS](https://www.jatos.org/Submit-and-upload-data-to-the-server.html)

```html
<script src="jatos.js"></script>
```

```js
// wait for jatos loading
await new Promise((r) => jatos.onLoad(r));

using dc = app.collector().on('add', (row) => {
  // send data to JATOS server
  jatos.appendResultData(row);
});
```

## Learn more

Stay tuned...

### Component

To create a scene, we need a component
that inputs **Props** and outputs a object includes **Node** and **Data Getter**:

```js
const Component = (props) => {
  const ctx = getCurrentScene();
  return { node: '', data: () => ({}) };
};
using scene = app.scene(Component);
```

Or, just outputs **Node**:

```js
const Component = (props) => 'text node';
const Component = (props) => document.createElement('div');
const Component = (props) => ['text node', document.createElement('div')];
```

- **Props** means show params that control the display of the scene.
- **Node** is the string or element or array, which be mounted to the scene root element.
- **Data Getter** is used to get generated data.

> [!CAUTION]
> You shouldn't modify props, as it may change the default props.
>
> If you don't know whether you modify the default props, try to recursively [freeze](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze) all its properties.

### Show

```mermaid
graph TD
a[modify props] --> show --> b[display & focus DOM] --> d[wait timer] --> frame --> d --> e[hide root] --> close
```
