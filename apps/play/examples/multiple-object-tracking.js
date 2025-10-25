import { VirtualChinrest } from '@psytask/components';
import { jsPsychStim } from '@psytask/jspsych';
import { createApp, css, getCurrentScene, on, StairCase } from 'psytask';
import van from 'vanjs-core';

const { b, div, span } = van.tags;

using app = await createApp({ alert_on_leave: false });
using dc = app.collector('multiple-object-tracking.csv').on('add', console.log);

using jspsych = app.scene(jsPsychStim, { defaultProps: {} });
using simpleText = app.scene(
  /** @param {{ content: string }} props */
  (props) => div({ class: 'psytask-container' }, () => props.content),
  { defaultProps: { content: '' } },
);
using chinrest = app.scene(VirtualChinrest, { defaultProps: {} });

// get task parameters
/** @type {{ object_size: number; object_num: number; target_num: number }} */
const opts = (
  await jspsych.show({
    type: await import(
      //@ts-ignore
      `https://cdn.jsdelivr.net/npm/@jspsych/plugin-survey/+esm`
    ).then((mod) => mod.default),
    survey_json: {
      elements: [
        {
          name: 'object_size',
          title: 'Object size (deg)',
          type: 'text',
          defaultValue: 1,
          isRequired: true,
          inputType: 'number',
          min: 0,
        },
        {
          name: 'object_num',
          title: 'Number of objects',
          type: 'text',
          defaultValue: 10,
          isRequired: true,
          inputType: 'number',
          min: 1,
          step: 1,
        },
        {
          name: 'target_num',
          title: 'Number of targets',
          type: 'text',
          defaultValue: 1,
          isRequired: true,
          inputType: 'number',
          min: 1,
          step: 1,
          validators: [
            {
              type: 'expression',
              expression: '{target_num} <= {object_num}',
              text: 'Must be <= number of objects',
            },
          ],
        },
      ],
    },
  })
).response;
const { deg2csspix } = await chinrest.show();

// create objects scene with deg2csspix available
using objects = app.scene(
  /**
   * @param {{
   *   speed: number;
   *   indexes: boolean;
   *   response: boolean;
   *   click: boolean;
   * }} props
   */
  (props) => {
    const data = {
      response_indexes: /** @type {Set<number>} */ new Set(),
      response_time: 0,
    };
    const size = van.derive(() => deg2csspix(opts.object_size));
    const boundary_wh = van.derive(
      () =>
        /** @type {const} */ ([
          window.innerWidth - size.val,
          window.innerHeight - size.val,
        ]),
    );
    const frame_pix = van.derive(
      () => deg2csspix(props.speed) * app.data.frame_ms * 1e-3,
    );

    const objSharedStyle = css({
      position: 'absolute',
      'border-radius': '50%',
      'text-align': 'center',
    });
    const Obj = /** @param {number} index */ (index) =>
      span(
        {
          'data-index': index,
          'data-selected': false,
          style() {
            const sizePx = size.val + 'px';
            return (
              objSharedStyle +
              css({ width: sizePx, height: sizePx, 'line-height': sizePx })
            );
          },
        },
        b({ hidden: () => !props.indexes }, index),
      );

    const handles = Array.from({ length: opts.object_num }, (_, i) => {
      const rad = Math.floor(Math.random() * 2 * Math.PI);
      return {
        obj: Obj(i),
        vel: /** @type {[number, number]} */ ([Math.cos(rad), Math.sin(rad)]),
        pos: /** @type {[number, number]} */ (
          boundary_wh.val.map((v) => Math.floor(Math.random() * v))
        ),
      };
    });

    const ctx = getCurrentScene();
    ctx
      .on('scene:show', () => {
        data.response_indexes.clear();
        data.response_time = NaN;
        handles.map(({ obj }) => (obj.style.backgroundColor = '#000'));

        const cleanups = [
          on(ctx.root, 'pointerup', (e) => {
            if (!props.click) return;
            const el = e.target;
            if (!el || !(el instanceof HTMLSpanElement)) return;
            if (el.dataset.selected === 'true') {
              el.dataset.selected = 'false';
              el.style.backgroundColor = '#000';
              data.response_indexes.delete(
                +(/** @type {string} */ (el.dataset.index)),
              );
            } else {
              el.dataset.selected = 'true';
              el.style.backgroundColor = '#afa';
              data.response_indexes.add(
                +(/** @type {string} */ (el.dataset.index)),
              );
            }
          }),
          on(ctx.root, 'keydown', (e) => {
            if (
              !props.response ||
              e.key !== ' ' ||
              (props.click && data.response_indexes.size === 0)
            )
              return;
            data.response_time = e.timeStamp;
            ctx.close();
          }),
        ];
        ctx.once('scene:close', () => cleanups.map((f) => f()));
      })
      .on('scene:frame', () => {
        for (const handle of handles) {
          if (frame_pix.val) {
            const [w, h] = boundary_wh.val;

            if (handle.pos[0] > w) {
              handle.pos[0] = w;
              handle.vel[0] *= -1;
            } else if (handle.pos[0] < 0) {
              handle.pos[0] = 0;
              handle.vel[0] *= -1;
            } else {
              handle.pos[0] += handle.vel[0] * frame_pix.val;
            }

            if (handle.pos[1] > h) {
              handle.pos[1] = h;
              handle.vel[1] *= -1;
            } else if (handle.pos[1] < 0) {
              handle.pos[1] = 0;
              handle.vel[1] *= -1;
            } else {
              handle.pos[1] += handle.vel[1] * frame_pix.val;
            }
          }
          // update position
          handle.obj.style.transform = `translate(${handle.pos[0]}px, ${handle.pos[1]}px)`;
        }
      });

    return {
      node: div(
        { style: css({ position: 'relative', color: '#fff' }) },
        ...handles.map((e) => e.obj),
      ),
      data: () => data,
    };
  },
  {
    defaultProps: {
      speed: 0,
      indexes: false,
      response: true,
      click: false,
    },
  },
);

// instructions
await simpleText.config({ close_on: 'pointerup' }).show({
  content: `In this task, you will track multiple moving objects:

Trial sequence:
1. You will be told which numbered objects to track, click to continue
2. Several objects will appear with numbers (0, 1, 2, ...), press space to start
3. All objects will start moving (numbers become hidden)
4. After movement stops, click on the objects you were tracking

Response:
- Click on objects to select them (they will turn light green)
- Click again to deselect
- Try to select all and only the target objects
- Press space when finished

Click to start.`,
});

// trial loop
const staircase = StairCase({
  start: 6,
  step: -1,
  down: 3,
  up: 1,
  reversals: 2,
  trials: 10,
});
const object_indexes = Array.from({ length: opts.object_num }, (_, i) => i);
for (const speed of staircase) {
  /** Randomly choose target_indexes using Fisher-Yates shuffle algorithm */
  const pool = [...object_indexes];
  for (let i = 0; i < opts.target_num; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = /** @type {[number, number]} */ ([pool[j], pool[i]]);
  }
  const target_indexes = pool.slice(0, opts.target_num).sort();

  await simpleText.config({ close_on: 'pointerup' }).show({
    content: `Current speed: ${speed} deg/s
You should track these objects:\n${target_indexes.join(', ')}

Click to continue.`,
  });
  await objects.show({ indexes: true });
  await objects.config({ duration: 5e3 }).show({ speed, response: false });

  // get responses
  const { response_indexes, response_time, start_time } = await objects.show({
    click: true,
  });
  const correct =
    target_indexes.length > 0 &&
    target_indexes.length === response_indexes.size &&
    target_indexes.every((v) => response_indexes.has(v));
  staircase.response(correct);
  dc.add({
    speed,
    target_indexes: target_indexes.join(','),
    response_indexes: Array.from(response_indexes).join(','),
    correct,
    rt: response_time - start_time,
  });

  // feedback
  await objects.show({ indexes: true });
}

document.body.textContent = dc.final();
