import { createApp, css, getCurrentScene } from 'psytask';
import van from 'vanjs-core';

const { button, div, input } = van.tags;

using app = await createApp({ alert_on_leave: false });
using dc = app.collector('hello-world.csv', { backup_on_leave: false });

// create scenes
using simpleText = app.scene(
  /** @param {{ content: string }} props */
  (props) => div({ class: 'psytask-container' }, () => props.content),
  { defaultProps: { content: '' } },
);
using question = app.scene(
  /** @param {{ placeholder: string }} props */
  (props) => {
    let response_time = NaN;
    const answer = van.state('');
    const ctx = getCurrentScene();

    ctx.on('scene:show', () => {
      answer.val = ''; // reset answer
    });
    return {
      node: div(
        {
          class: 'psytask-container',
          style: css({ gap: '1rem', width: '20rem' }),
        },
        input({
          type: 'number',
          value: answer,
          placeholder: () => props.placeholder,
          onchange(e) {
            response_time = e.timeStamp;
            answer.val = e.target.value;
          },
        }),
        button(
          {
            onclick() {
              if (answer.val !== '') {
                ctx.close();
              }
            },
          },
          'OK',
        ),
      ),
      data: () => ({
        answer: +answer.val, // convert to number
        response_time,
      }),
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
  dc.add({ placeholder, answer, rt: data.response_time - data.start_time });
}

document.body.textContent = dc.final();
