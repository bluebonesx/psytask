## Usage

### Browser development environment

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Demo Task</title>
    <!-- load psytask css -->
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/psytask/dist/main.css"
    />
  </head>
  <body>
    <script type="module">
      // load psytask js
      import {
        createApp,
        h,
      } from 'https://cdn.jsdelivr.net/npm/psytask/dist/index.min.js';

      // create app
      const app = await createApp();

      // create scenes
      const fixation = app.fixation({ duration: 500 });
      const blank = app.blank({ close_on: 'click' });
      const text = app.text('no content', { duration: 1000 });
      const anything = app.scene(
        // first arg is setup function
        function (self) {
          const el = h('p'); // create custom element
          self.appendChild(el); // then mount to scene root element
          // return update function
          return (props) => {
            console.log('current show params is:', props);
            el.textContent = JSON.stringfier(props);
          };
        },
        // second arg is scene options
        {
          on_frame(time) {
            console.log(`last frame time is: ${time}`);
          },
        },
      );

      // show scenes
      for (const content of ['A', 'B', 'C']) {
        await fixation.show();
        await text.show({ text: content });
        await anything.show('any show params');
        await blank.show();
      }

      // clean up
      app[Symbol.dispose]();
      fixation[Symbol.dispose]();
      blank[Symbol.dispose]();
      text[Symbol.dispose]();
      anything[Symbol.dispose]();
    </script>
  </body>
</html>
```

### with TypeScript (Recommand)

```ts
import 'psytask/main.css';
import { createApp, h } from 'psytask';

// NOTE: create app or scene by `using` keyword
using app = await createApp();

using fixation = app.fixation({ duration: 500 });
using blank = app.blank({ close_on: 'click' });
using text = app.text('no content', { duration: 1000 });
using anything = app.scene(
  function (self) {
    const el = h('p');
    self.appendChild(el);
    // add type declarations for best practice
    return (props: string) => {
      console.log('current show params is:', props);
      el.textContent = JSON.stringfier(props);
    };
  },
  {
    on_frame(time) {
      console.log(`last frame time is: ${time}`);
    },
  },
);

for (const content of ['A', 'B', 'C']) {
  await fixation.show();
  await text.show({ text: content });
  await anything.show('any show params');
  await blank.show();
}
```
