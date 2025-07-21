# Psytask

![NPM Version](https://img.shields.io/npm/v/psytask)
![NPM Downloads](https://img.shields.io/npm/dm/psytask)
![jsDelivr hits (npm)](https://img.shields.io/jsdelivr/npm/hm/psytask)

JavaScript Framework for Psychology task. Compatible with the [jsPsych](https://github.com/jspsych/jsPsych) plugin.

Compare to jsPsych, Psytask has:

- Easier and more flexible development experiment.
- Higher time precision, try [online test](https://bluebones-team.github.io/psytask) on your browser.
- Smaller bundle size, Faster loading speed.

## Install

If you're an old hand at Web development, we recommend installing via NPM:

```bash
npm i psytask
```

Otherwise, via CDN:

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
      href="https://cdn.jsdelivr.net/npm/psytask@1.0.0-rc1/dist/main.css"
    />
  </head>
  <body>
    <!-- main script -->
    <script type="module">
      // load psytask js
      import { createApp } from 'https://cdn.jsdelivr.net/npm/psytask@1.0.0-rc1/dist/index.min.js';

      const app = await creaeApp();
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

## Usage

> [!NOTE]
> Considering that most psychology researchers do not have a background in Web development, the following examples will be used based on a cdn installation.

All psychological tasks are combinations of a series of scenes,
writing a psychology task requires only 2 steps:

1. create scene
2. show scene

### Create Scene

```js
import { createApp, h } from '<your-cdn-url>';

// create app
const app = await createApp();

// create built-in scenes
const fixation = app.fixation({ duration: 1000 });
const blank = app.blank();
const guide = app.text('Welcome to our task', { close_on: 'click' });

// create jsPsych scene
const jsPsychScene = app.jsPsych({
  type: jsPsychHtmlKeyboardResponse, // please import jspsych.css via CDN yourself
  stimulus: 'Hello world',
  choices: ['f', 'j'],
});

// create custom scene
const scene = app.scene(
  // 1st. argument: setup function
  function (self) {
    // 1. create custom element to show custom stimulus
    const el = h('p');
    // 2. mount it to scene root element
    self.root.appendChild(el);
    // 3. return update function, which will be run on each time it is shown
    return (props) => {
      // 4. apply custom show paramenters
      el.textContent = `current show params is: ${JSON.stringify(props)}`;
    };
  },
  // 2nd. argument: scene options
  {
    duration: 200,
    close_on: 'keydown',
    on_frame(time) {
      console.log(`last frame time is: ${time}`);
    },
  },
);
```

### Show Scene

Based on the above example:

```js
// show with paramenters
const data = await scene.show('custom show params');

// show with new scene options
const data = await scene.config({ duration: Math.random() * 1000 }).show();
```

Scene will log the first frame time in each show:

```js
const { start_time } = await scene.show();
```

Usually, we need to show a series of scenes:

```js
import { RandomSampling, StairCase } from '<your-cdn-url>';

// show a fixed sequence
for (const char of ['A', 'B', 'C']) {
  await scene.show(char);
}

// show a random sequence
for (const char of new RandomSampling({
  candidates: ['A', 'B', 'C'],
  sampleSize: 10,
  replace: true,
})) {
  await scene.show(char);
}

// show a staircase
const staircase = new StairCase({
  start: 10,
  step: 1,
  up: 3,
  down: 1,
  reversal: 6,
  min: 1,
  max: 12,
});
for (const value of staircase) {
  await scene.show(value);
  staircase.response(Math.random() > 0.5); // mock user response
}
```

### Data Collection

We use `DataCollector` to save data as a file:

```js
import { DataCollector } from '<your-cdn-url>';

// create data collector
const dc = new DataCollector('demo.csv');

// show scenes
for (const char of ['A', 'B', 'C']) {
  const data = await scene.show(char);
  // add a row
  await dc.add({
    stimulus: char,
    // first frame time
    start_time: data.start_time,
  });
}

// save as file
await dc.save();
```

Usually, scene will just collect the first frame time into the `start_time` data field.
If we want to log subject response, we can add data field to scene:

```js
const scene = app.scene(function (self) {
  const el = h('p');
  self.root.appendChild(el);
  // 1. add event listener
  self.useEventListener(el, 'keydown', (event) => {
    self.close(); // press any key to close
    // 2. set data field
    self.data['key'] = event.key;
    self.data['rt'] = event.timeStamp - self.data.start_time;
  });
  return (props) => {
    el.textContent = `current show params is: ${JSON.stringify(props)}`;
  };
});

// the data has 3 fields now: start_time, key, rt
const data = await scene.show();
```

### Clean up

After a scene is shown, we need to clean up the resources manually.
This is done to free up invalid memory and avoid memory leaks:

```js
// we create the app and a scene before, so we need to clean up them
app[Symbol.dispose]();
scene[Symbol.dispose]();
```

But if we develop it with TypeScript 5.2+ and create them via `using` keyword, they will be cleaned up automatically:

```ts
using app = await createApp();
using scene = app.text('custom text');
```
