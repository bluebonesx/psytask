import { createApp, css, getCurrentScene } from 'psytask';
import van from 'vanjs-core';
import { reactive } from 'vanjs-ext';

const { button, div, input } = van.tags;

using app = await createApp({ alert_on_leave: false });
using dc = app.collector('hello-world.csv', { backup_on_leave: false });

// create scenes
using simpleText = app.scene(
  /** @param {{ content: string }} props */
  (props) => div({ class: 'psytask-center' }, () => props.content),
  { defaultProps: { content: '' } },
);
using question = app.scene(
  /** @param {{ placeholder: string }} props */
  (props) => {
    /** @type {{ answer: number; response_time: number }} */
    const data = reactive({ answer: NaN, response_time: NaN });
    const ctx = getCurrentScene();

    ctx.on('show', () => {
      // reset data
      data.answer = NaN;
      data.response_time = NaN;
    });
    return {
      node: div(
        {
          class: 'psytask-center',
          style: css({ gap: '1rem' }),
        },
        input({
          type: 'number',
          placeholder: () => props.placeholder,
          value: () => data.answer,
          onchange(e) {
            data.answer = +e.target.value;
            data.response_time = e.timeStamp;
          },
        }),
        button({ onclick: () => data.answer !== -1 && ctx.close() }, 'OK'),
      ),
      data: () => data,
    };
  },
  { defaultProps: { placeholder: '' } },
);

// show scenes
await simpleText.config({ close_on: 'pointerup' }).show({
  content: `Let's play a game!\nclick to continue`,
});

const target = Math.floor(Math.random() * 100);
let answer = -1;

while (answer !== target) {
  // create placeholder
  const placeholder =
    answer === -1
      ? 'Guess a number [0-99]'
      : `${answer} is too ${answer < target ? 'low' : 'high'}!`;

  const data = await question.show({ placeholder });
  answer = data.answer; // update answer

  // collect data
  dc.add({
    placeholder,
    answer,
    rt: data.response_time - /** @type {number} */ (data.frame_times[0]),
  });
}

document.body.textContent = dc.final();
