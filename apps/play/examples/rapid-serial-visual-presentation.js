import { jsPsychStim } from '@psytask/jspsych';
import { createApp, getCurrentScene, on, StairCase } from 'psytask';
import van from 'vanjs-core';

const { div } = van.tags;

using app = await createApp({ alert_on_leave: false });
using dc = app
  .collector('rapid-serial-visual-presentation.csv')
  .on('add', console.log);

using simpleText = app.scene(
  /** @param {{ content: string }} props */
  (props) => div({ class: 'psytask-center' }, () => props.content),
  { defaultProps: { content: '' } },
);

// show load progress
simpleText.show({ content: 'Loading...' });
using survey = app.scene(jsPsychStim, {
  defaultProps: {
    type: await import(
      //@ts-ignore
      `https://cdn.jsdelivr.net/npm/@jspsych/plugin-survey/+esm`
    ).then((mod) => mod.default),
    survey_json: {
      elements: [
        {
          name: 'series_length',
          title: 'Length of rapid series',
          type: 'text',
          defaultValue: 20,
          isRequired: true,
          inputType: 'number',
          min: 0,
          step: 1,
        },
      ],
    },
  },
});
using reaction = app.scene(
  /** @param {{}} props */
  (props) => {
    /** @type {{ response_key: string; response_time: number }} */
    let data;
    const ctx = getCurrentScene();
    ctx.on('show', () => {
      data = { response_key: '', response_time: 0 };

      const cleanup = on(ctx.root, 'keydown', (e) => {
        // only accept number keys 0-9
        if (!/^\d$/.test(e.key)) return;
        data = { response_key: e.key, response_time: e.timeStamp };
        ctx.close();
      });
      ctx.once('close', cleanup);
    });
    return {
      node: div(
        { class: 'psytask-center' },
        'Please press the key corresponding to the second number.',
      ),
      data: () => data,
    };
  },
  { defaultProps: {} },
);
simpleText.close();

// get task parameters
/** @type {{ series_length: number }} */
const opts = (await survey.show()).response;

// instructions
await simpleText.config({ close_on: 'pointerup' }).show({
  content: `In this task, you will see a rapid sequence of symbols presented one by one.

Trial sequence:
1. Fixation cross (+)
2. Rapid presentation of letters and numbers
3. Response prompt

Your task: Identify and remember the SECOND NUMBER that appears in the sequence.

Response method:
- After the sequence ends, you will see a prompt
- Press the number key (0-9) corresponding to the second number you saw
- Ignore all letters and the first number

Example:
If sequence shows: A-3-B-C-7-D, the second number is 7, so press key "7".

Click to start.`,
});

// show stimuli and collect responses
const staircase = StairCase({
  start: opts.series_length - 2,
  step: 1,
  down: 3,
  up: 1,
  reversals: 2,
  max: opts.series_length - 2,
  trials: 10,
});
for (const lag of staircase) {
  // create rapid series
  const length = opts.series_length;
  const firstIndex = Math.floor(Math.random() * (length - lag - 1));

  const target = '' + Math.floor(Math.random() * 10);
  const series = Array.from({ length }, (_, i) =>
    i === firstIndex
      ? '' + Math.floor(Math.random() * 10)
      : i === firstIndex + lag + 1
        ? target
        : String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  );

  // show rapid series
  await simpleText.config({ duration: 500 }).show({ content: '+' });
  for (const symbol of series) {
    await simpleText.config({ duration: 1e2 }).show({ content: symbol });
  }
  const { frame_times, response_key, response_time } = await reaction.show();
  const correct = target === response_key;
  await simpleText
    .config({ duration: 500 })
    .show({ content: correct ? 'Correct!' : 'Incorrect.' });

  staircase.response(correct);
  dc.add({
    series: series.join(','),
    target,
    response: response_key,
    correct,
    rt: response_time - /** @type {number} */ (frame_times[0]),
  });
}

document.body.textContent = dc.final();
