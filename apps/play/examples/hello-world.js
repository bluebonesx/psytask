import { adapter } from '@psytask/components';
import { createApp, css, getCurrentScene, on } from 'psytask';
import van from 'vanjs-core';

const { div } = van.tags;

using app = await createApp({ alert_on_leave: false });
using dc = app.collector('hello-world.csv', { backup_on_leave: false });

// create scenes
using mousePos = app.scene(
  /** @param {{ content: string }} props */
  (props) => {
    let /** @type {PointerEvent} */ cur_event,
      exit = false;
    const ctx = getCurrentScene();
    ctx
      .on(
        'dispose',
        on(ctx.root, 'pointerdown', (e) => (cur_event = e)),
      )
      .on(
        'dispose',
        on(ctx.root, 'contextmenu', () => (exit = true)),
      );
    return {
      node: div(
        {
          class: 'psytask-center',
          style: css({ margin: '0 4rem', 'font-size': '1rem' }),
        },
        () => props.content,
      ),
      data: () => ({
        pos: /** @type {const} */ ([cur_event.clientX, cur_event.clientY]),
        exit,
      }),
    };
  },
  { adapter, defaultProps: { content: '' }, close_on: 'pointerdown' },
);

// show scenes
let content = `Click anywhere to show mouse position\nClick right mouse to exit`;
while (true) {
  const { pos, exit } = await mousePos.show({ content });
  if (exit) break;
  dc.add({ content, pos });
  content = `Current position:\n` + pos;
}

document.body.textContent = dc.final();
