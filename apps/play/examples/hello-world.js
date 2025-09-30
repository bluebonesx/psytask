import { adapter, Container } from '@psytask/components';
import { createApp } from 'psytask';
import van from 'vanjs-core';

const { button, div, input } = van.tags;

using app = await createApp({ alert_on_leave: false });
using dc = app.collector('hello-world.csv');

// create scenes
using simpleText = app.scene(Container, { defaultProps: { content: '' } });
using question = app.scene(
  adapter(
    /** @param {{ placeholder: string }} props */
    (props, ctx) => {
      let response_time = NaN;
      const answer = van.state('');

      ctx.on('scene:show', () => {
        answer.val = ''; // reset answer
      });
      return {
        node: Container(
          {
            content: div(
              { style: 'display:grid;gap:1rem;width:20rem;' },
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
          },
          ctx,
        ),
        data: () => ({
          answer: +answer.val, // convert to number
          response_time,
        }),
      };
    },
  ),
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
