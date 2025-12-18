import { adapter } from '@psytask/components';
import { jsPsychStim } from '@psytask/jspsych';
import { createApp, css, getCurrentScene, on } from 'psytask';
import van from 'vanjs-core';

const { div } = van.tags;

using app = await createApp({ alert_on_leave: false });
using dc = app
  .collector('n-back.csv', { backup_on_leave: false })
  .on('add', console.log);

using simpleText = app.scene(
  /** @param {{ content: string }} props */
  (props) =>
    div(
      {
        class: 'psytask-center',
        style: css({ margin: '0 4rem', 'font-size': '1rem' }),
      },
      () => props.content,
    ),
  { adapter, defaultProps: { content: '' } },
);

// show load progress
simpleText.show({ content: 'Loading...' });
using survey = app.scene(jsPsychStim, {
  adapter,
  defaultProps: {
    type: (
      await import(
        //@ts-expect-error external module
        `https://cdn.jsdelivr.net/npm/@jspsych/plugin-survey/+esm`
      )
    ).default,
    survey_json: {
      elements: [
        {
          name: 'back_num',
          title: 'N-back number',
          type: 'text',
          defaultValue: 2,
          isRequired: true,
          inputType: 'number',
          min: 0,
          step: 1,
        },
        {
          name: 'trial_num',
          title: 'Number of trials',
          type: 'text',
          defaultValue: 10,
          isRequired: true,
          inputType: 'number',
          min: 0,
          step: 1,
        },
      ],
    },
  },
});
using stimulus = app.scene(
  /** @param {{ letter: string }} props */
  (props) => {
    /** @type {{ has_response: boolean; response_time: number }} */
    let data;
    const ctx = getCurrentScene();
    ctx.on('show', () => {
      data = { has_response: false, response_time: NaN };

      const cleanup = on(ctx.root, 'pointerup', (e) => {
        data = { has_response: true, response_time: e.timeStamp };
      });
      ctx.once('close', cleanup);
    });

    return {
      node: div({ class: 'psytask-center' }, () => props.letter),
      data: () => data,
    };
  },
  { adapter, defaultProps: { letter: '' }, duration: 300 },
);
simpleText.close();

// get task parameters
const opts =
  /** @type {{ back_num: number; trial_num: number }} */
  ((await survey.show()).response);
const letters = Array.from({ length: opts.trial_num }, () =>
  String.fromCharCode(65 + Math.floor(Math.random() * 4)),
);

// instructions
await simpleText.config({ close_on: 'pointerup' }).show({
  content: `In this task, you will see a sequence of letters appear one by one.

Trial sequence:
1. Fixation cross (+)
2. Letter presentations (one at a time)

Your task: Click page when the current letter is the same as the letter that appeared ${opts.back_num} positions back.

Response:
- Click page when you detect a match (current letter = letter from ${opts.back_num} positions ago)
- Do not click anything when there is no match

Example:
If sequence is A${Array.from(
    { length: opts.back_num - 1 },
    (_, i) => '-' + String.fromCharCode(65 + i + 1),
  ).join(
    '',
  )}-A, click page when the second A appears (position ${opts.back_num + 1} matches position 1).

Click to start.`,
});
await simpleText.config({ duration: 1e3 }).show({ content: '+' });

// show stimuli and collect responses
for (let i = 0; i < letters.length; i++) {
  const curr = letters[i];
  const { frame_times, has_response, response_time } = await stimulus.show({
    letter: curr,
  });
  const prev = i >= opts.back_num ? letters[i - opts.back_num] : null;
  const is_back = curr === prev;

  dc.add({
    stim: curr,
    is_back,
    has_response,
    correct: is_back ? has_response : !has_response,
    rt: response_time - /** @type {number} */ (frame_times[0]), // if no response, rt = NaN
  });
}

document.body.textContent = dc.final();
