# Psytask

![NPM Version](https://img.shields.io/npm/v/psytask)
![NPM Downloads](https://img.shields.io/npm/dm/psytask)
![jsDelivr hits (npm)](https://img.shields.io/jsdelivr/npm/hm/psytask)

JavaScript Framework for Psychology tasks. Compatible with the [jsPsych](https://github.com/jspsych/jsPsych) plugin.

Compare to jsPsych, Psytask has:

- Easier and more flexible development experiment.
- Higher time precision, try [Benchmark](https://bluebonesx.github.io/psytask/benchmark) on your browser.
- Smaller bundle size, Faster loading speed.

**🥳 You can play it online now via [Playground & Examples](https://bluebonesx.github.io/psytask/playground) !**

API docs is [here](https://bluebonesx.github.io/psytask).

## Install

via NPM:

```bash
npm create psytask # create a project folder
```

```bash
npm i psytask # just install
```

via CDN:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- load  css -->
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/psytask@1/dist/main.css"
    />
  </head>
  <body>
    <script type="module">
      // load  js
      import { createApp } from 'https://cdn.jsdelivr.net/npm/psytask@1/dist/index.min.js';

      using app = await creaeApp();
      //...
    </script>
  </body>
</html>
```

> [!WARNING]
> Psytask uses the modern JavaScript [`using` keyword](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Statements/using) for automatic resource cleanup.
>
> When using bundlers (like Vite, Bun, etc.), the `using` keyword will be transpiled automatically, so you don't need to worry about browser compatibility.
>
> For CDN usage in older browsers that don't support the `using` keyword, you need to manually call the cleanup method:
>
> ```js
> // Instead of: using app = await createApp();
> const app = await createApp();
> // ... your code ...
> app.emit('cleanup'); // Manually clean up when done
> ```

## Usage

All psychology tasks are combinations of a series of scenes,
writing a psychology task requires only 2 steps:

1. create scene
2. show scene

### Create Scene

```js
import 'psytask/main.css';

import { createApp, effect, h } from 'psytask';

// create app
using app = await createApp();

// create built-in scenes
using fixation = app.text('+', { duration: 500 });
using blank = app.text('');
using guide = app.text('Welcome to our task', { close_on: 'key: ' }); // close on space key
```

Most of the time, you need to write the scene yourself:

```js
// create custom scene
using scene = app.scene(
  // 1st. argument: component (setup function)
  /** @param {{ stimulus: string }} props */
  (props, ctx) => {
    /** @type {{ response_key: string; response_time: number }} */
    let data;

    // Reset data when scene shows
    ctx
      .on('scene:show', () => {
        data = { response_key: '', response_time: 0 };
      })
      // Capture keyboard responses
      .on('key:f', (e) => {
        data.response_key = 'f';
        data.response_time = e.timeStamp;
        ctx.close();
      })
      .on('key:j', (e) => {
        data.response_key = 'j';
        data.response_time = e.timeStamp;
        ctx.close();
      });

    // Create stimulus element
    const el = h('div', { className: 'psytask-center' });
    effect(() => {
      el.textContent = props.stimulus; // update element when `props.stimulus` changed
    });

    // Return the element and data getter
    return { node: el, data: () => data };
  },
  // 2nd. argument: scene options
  {
    defaultProps: { stimulus: '' },
  },
);
```

### Show Scene

Based on the above example:

```js
// show with parameters
const data = await scene.show({ stimulus: 'Press F or J' });
console.log(`Response: ${data.response_key}, RT: ${data.response_time}ms`);

// show with new scene options
const data = await scene.config({ duration: Math.random() * 1000 }).show();
```

Scene will log the first frame time in each show:

```js
const data = await scene.show();
console.log("this scene's start time is", data.start_time);
```

Usually, we need to show a series of scenes:

```js
import { RandomSampling, StairCase } from 'psytask';

// show a fixed sequence
for (const stimulus of ['A', 'B', 'C']) {
  await scene.show({ stimulus });
}

// show a random sequence
for (const stimulus of new RandomSampling({
  candidates: ['A', 'B', 'C'],
  sampleSize: 10,
  replace: true,
})) {
  await scene.show({ stimulus });
}

// adaptive testing with staircase
const staircase = new StairCase({
  start: 10,
  step: 1,
  up: 3,
  down: 1,
  reversal: 6,
  min: 1,
  max: 12,
});
for (const duration of staircase) {
  const data = await scene.config({ duration }).show({ stimulus: 'X' });

  const correct = data.response_key === 'f'; // example response
  staircase.response(correct); // set this trial response
}
```

### Data Collection

```js
// create data collector
using dc = app.collector('data.csv');

// show scenes and collect data
for (const stimulus of ['A', 'B', 'C']) {
  const data = await scene.show({ stimulus });
  // add a row
  dc.add({
    stimulus,
    response: data.response_key,
    rt: data.response_time - data.start_time,
    correct: data.response_key === 'f', // example response
  });
}
```

## Integration

### jsPsych

Psytask is compatible with jsPsych plugins. Here's how to integrate jsPsych with Psytask:

#### Installation with jsPsych

```bash
npm i psytask jspsych @jspsych/plugin-html-button-response
```

#### CDN with jsPsych

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- load jspsych css if needed, it should be above psytask css -->
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/jspsych@8.2.2/css/jspsych.css"
    />

    <!-- load psytask css -->
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/psytask@1/dist/main.css"
    />
  </head>
  <body>
    <!-- main script -->
    <script type="module">
      // load psytask js
      import { createApp } from 'https://cdn.jsdelivr.net/npm/psytask@1/dist/index.min.js';

      using app = await createApp();
      //...
    </script>

    <!-- load jspsych plugin if needed, it should be below psytask js and add `defer` property -->
    <script
      defer
      src="https://cdn.jsdelivr.net/npm/@jspsych/plugin-html-keyboard-response@2.1.0/dist/index.browser.min.js"
    ></script>
  </body>
</html>
```

#### Using jsPsych Plugins

```js
import 'jspsych/css/jspsych.css';
import 'psytask/main.css';

import HtmlButtonResponsePlugin from '@jspsych/plugin-html-button-response';
import { createApp, jsPsychStim } from 'psytask';

// create app
using app = await createApp();

// create jsPsych scene
using jsPsychScene = app.scene(jsPsychStim, {
  defaultProps: {
    type: HtmlButtonResponsePlugin,
    stimulus: 'Hello world',
    choices: ['f', 'j'],
  },
});

// show jsPsych scene
const data = await jsPsychScene.show();
console.log(data);
```

### JATOS

JATOS (Just Another Tool for Online Studies) is a popular platform for running online psychology experiments. Psytask integrates seamlessly with JATOS for data collection and experiment management. See more: https://www.jatos.org/Write-your-own-Study-Basics-and-Beyond.html

#### Setup with JATOS

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- load jatos.js -->
    <script src="jatos.js"></script>
  </head>
  <body>
    <!-- load your task script -->
    <script type="module" src="./index.js"></script>
  </body>
</html>
```

#### Data Upload

Psytask's data collector can automatically send data to JATOS using event listeners:

```js
import { createApp } from 'psytask';

// wait for jatos loading
await new Promise((r) => jatos.onLoad(r));

using app = await createApp();
using dc = app.collector('experiment_data.csv').on('add', (row) => {
  // send data to JATOS server when `dc.add` be called.
  jatos.appendResultData(row);
});
```
