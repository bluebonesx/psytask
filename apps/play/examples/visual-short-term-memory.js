import { adapter, VirtualChinrest } from '@psytask/components';
import { jsPsychStim } from '@psytask/jspsych';
import { createApp, css, getCurrentScene, on, StairCase } from 'psytask';
import van from 'vanjs-core';
import { list, reactive, replace } from 'vanjs-ext';

const { div } = van.tags;

using app = await createApp({ alert_on_leave: false });
using dc = app
  .collector('visual-short-term-memory.csv', { backup_on_leave: false })
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
    type: await import(
      //@ts-expect-error external module
      `https://cdn.jsdelivr.net/npm/@jspsych/plugin-survey/+esm`
    ).then((mod) => mod.default),
    survey_json: {
      elements: [
        {
          name: 'size_deg',
          title: 'Box size (deg)',
          type: 'text',
          defaultValue: 1,
          isRequired: true,
          inputType: 'number',
          min: 0,
        },
        {
          name: 'interval_ms',
          title: 'Interval (ms)',
          type: 'text',
          defaultValue: 500,
          isRequired: true,
          inputType: 'number',
          min: 0,
        },
      ],
    },
  },
});
using chinrest = app.scene(VirtualChinrest, { defaultProps: {} });
/** @typedef {{ pos: [number, number]; color: string; size: number }} BoxParams */
using boxes = app.scene(
  /** @param {{ params: BoxParams[]; target_index?: number }} props */
  (props) => {
    /** @type {{ response: boolean; response_time: number }} */
    let data;
    const ctx = getCurrentScene();
    ctx.on(
      'dispose',
      on(ctx.root, 'keydown', (e) => {
        if (props.target_index == null) return;
        if (e.key === 'f') {
          data = { response: true, response_time: e.timeStamp };
          ctx.close();
          return;
        }
        if (e.key === 'j') {
          data = { response: false, response_time: e.timeStamp };
          ctx.close();
          return;
        }
      }),
    );

    /** @type {BoxParams[]} */
    const boxParams = reactive([]);
    van.derive(() => replace(boxParams, props.params));

    const targetParams = van.derive(
      () => props.target_index != null && props.params[props.target_index],
    );
    return {
      node: div(
        // cue frame
        div({
          hidden: () => !targetParams.val,
          style: () => {
            const borderSize = 3;
            const sharedStyle = css({
              position: 'absolute',
              border: borderSize + 'px solid #000',
            });
            const p = targetParams.val;
            if (!p) return sharedStyle;
            const diff = 0.5 * p.size;
            return (
              sharedStyle +
              css({
                'box-sizing': 'border-box',
                width: diff + p.size + 'px',
                height: diff + p.size + 'px',
                transform: `translate(${p.pos[0] - diff / 2}px, ${p.pos[1] - diff / 2}px)`,
              })
            );
          },
        }),
        // boxes
        list(div, boxParams, (p) =>
          div({
            style: () =>
              css({
                position: 'absolute',
                width: `${p.val.size}px`,
                height: `${p.val.size}px`,
                'background-color': p.val.color,
                transform: `translate(${p.val.pos[0]}px, ${p.val.pos[1]}px)`,
              }),
          }),
        ),
      ),
      data: () => data,
    };
  },
  { adapter, defaultProps: { params: [] } },
);
simpleText.close();

// get task parameters
const { deg2csspix } = await chinrest.show();
const opts = /** @type {{ size_deg: number; interval_ms: number }} */ (
  (await survey.show()).response
);

// instruction
await simpleText.config({ close_on: 'pointerup' }).show({
  content: `In this task, you will see colored boxes appear on the screen twice.

Trial sequence:
1. Fixation cross (+)
2. First presentation of colored boxes
3. Blank interval
4. Second presentation with a white border highlighting one box

Your task: Judge whether the highlighted box changed color between the two presentations.

Response keys:
- Press F if the box changed color
- Press J if the box did not change color

Click to start.`,
});

// main loop
const staircase = StairCase({
  start: 1,
  step: -1,
  down: 3,
  up: 1,
  min: 1,
  reversals: 2,
  trials: 10,
});
for (const box_num of staircase) {
  const size = deg2csspix(opts.size_deg);
  const target_index = Math.floor(Math.random() * box_num);
  const should_change_color = Math.random() < 0.5;

  const params_1 = Array.from(
    { length: box_num },
    () =>
      /** @satisfies {BoxParams} */ ({
        // anchor at top-left corner
        pos: [
          Math.random() * (innerWidth - size),
          Math.random() * (innerHeight - size),
        ],
        color: `hsl(${Math.random() * 360}, 100%, 50%)`,
        size,
      }),
  );
  const params_2 = [...params_1]; // shallow copy
  if (should_change_color) {
    params_2[target_index] = {
      .../** @type {BoxParams} */ (params_2[target_index]),
      color: `hsl(${Math.random() * 360}, 100%, 50%)`,
    };
  }

  await simpleText.config({ duration: 1e3 }).show();
  await boxes.config({ duration: 5e2 }).show({ params: params_1 });
  await simpleText.config({ duration: opts.interval_ms }).show();
  const { frame_times, response, response_time } = await boxes.show({
    params: params_2,
    target_index,
  });

  const correct = response === should_change_color;
  staircase.response(correct);
  dc.add({
    box_num,
    target_index,
    should_change_color,
    response,
    correct,
    rt: response_time - /** @type {number} */ (frame_times[0]),
  });
}

document.body.textContent = dc.final();
