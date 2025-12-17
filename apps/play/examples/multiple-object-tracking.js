import {
  useDevicePixelRatio,
  useWindowPhysicalPix,
  VirtualChinrest,
} from '@psytask/components';
import { jsPsychStim } from '@psytask/jspsych';
import { createApp, css, getCurrentScene, on, StairCase } from 'psytask';
import van from 'vanjs-core';

const { b, div, span } = van.tags;

using app = await createApp({ alert_on_leave: false });
using dc = app
  .collector('multiple-object-tracking.csv', { backup_on_leave: false })
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
  { defaultProps: { content: '' } },
);

// show load progress
simpleText.show({ content: 'Loading...' });
using survey = app.scene(jsPsychStim, {
  defaultProps: {
    type: await import(
      //@ts-expect-error external module
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
          name: 'deg_per_sec',
          title: 'Deg per second',
          type: 'text',
          defaultValue: 10,
          isRequired: true,
          inputType: 'number',
          min: 1,
          step: 1,
        },
      ],
    },
  },
});
using chinrest = app.scene(VirtualChinrest, { defaultProps: {} });
simpleText.close();

// get task parameters
const { deg2csspix } = await chinrest.show();
const opts =
  /**
   * @type {{
   *   object_size: number;
   *   object_num: number;
   *   deg_per_sec: number;
   * }}
   */
  ((await survey.show()).response);

// create objects scene with deg2csspix available
using objects = app.scene(
  /**
   * @param {{
   *   deg_pre_sec: number;
   *   indexes: boolean;
   *   space: boolean;
   *   object: boolean;
   * }} props
   */
  (props) => {
    const size = van.derive(() => deg2csspix(opts.object_size));
    const dpr = useDevicePixelRatio();
    const win_wh = useWindowPhysicalPix(dpr);
    const boundary_wh = van.derive(
      () =>
        /** @type {const} */ ([
          win_wh.width - size.val,
          win_wh.height - size.val,
        ]),
    );
    const csspix_pre_frame = van.derive(
      () => deg2csspix(props.deg_pre_sec) * app.data.frame_ms * 1e-3,
    );

    const data = {
      response_indexes: /** @type {Set<number>} */ (new Set()),
      response_time: 0,
    };
    const objSharedStyle = css({
      position: 'absolute',
      'border-radius': '50%',
      'text-align': 'center',
      'font-size': '2rem',
    });
    const objects = Array.from({ length: opts.object_num }, (_, i) => {
      const rad = Math.floor(Math.random() * 2 * Math.PI);
      return {
        obj: span(
          {
            'data-index': i,
            'data-selected': false,
            style() {
              const sizePx = size.val + 'px';
              return (
                objSharedStyle +
                css({ width: sizePx, height: sizePx, 'line-height': sizePx })
              );
            },
          },
          b({ hidden: () => !props.indexes }, i),
        ),
        vel: /** @type {[number, number]} */ ([Math.cos(rad), Math.sin(rad)]),
        pos: /** @type {[number, number]} */ (
          boundary_wh.val.map((v) => Math.floor(Math.random() * v))
        ),
      };
    });

    const ctx = getCurrentScene();
    const cleanups = [
      on(window, 'resize', () => {
        win_wh.width = innerWidth * dpr.val;
        win_wh.height = innerHeight * dpr.val;
      }),
      on(ctx.root, 'pointerup', (e) => {
        const el = e.target;
        if (!el || !(el instanceof HTMLSpanElement)) {
          if (props.space) {
            // click space to finish
            data.response_time = e.timeStamp;
            ctx.close();
          }
        } else if (props.object) {
          // click object to select/deselect
          if (el.dataset.selected === 'true') {
            el.dataset.selected = 'false';
            el.style.background = '#000';
            data.response_indexes.delete(
              +(/** @type {string} */ (el.dataset.index)),
            );
          } else {
            el.dataset.selected = 'true';
            el.style.background = '#8f8';
            data.response_indexes.add(
              +(/** @type {string} */ (el.dataset.index)),
            );
          }
        }
      }),
    ];

    ctx
      .on('show', () => {
        data.response_indexes.clear();
        data.response_time = NaN;
        objects.map(({ obj }) => (obj.style.background = '#000'));
      })
      .on('frame', () => {
        for (const handle of objects) {
          if (csspix_pre_frame.val) {
            const [w, h] = boundary_wh.val;

            if (handle.pos[0] > w) {
              handle.pos[0] = w;
              handle.vel[0] *= -1;
            } else if (handle.pos[0] < 0) {
              handle.pos[0] = 0;
              handle.vel[0] *= -1;
            } else {
              handle.pos[0] += handle.vel[0] * csspix_pre_frame.val;
            }

            if (handle.pos[1] > h) {
              handle.pos[1] = h;
              handle.vel[1] *= -1;
            } else if (handle.pos[1] < 0) {
              handle.pos[1] = 0;
              handle.vel[1] *= -1;
            } else {
              handle.pos[1] += handle.vel[1] * csspix_pre_frame.val;
            }
          }
          // update position
          handle.obj.style.transform = `translate(${handle.pos[0]}px, ${handle.pos[1]}px)`;
        }
      })
      .on('dispose', () => cleanups.map((f) => f()));

    return {
      node: div(
        { style: css({ position: 'relative', color: '#fff' }) },
        ...objects.map((e) => e.obj),
      ),
      data: () => data,
    };
  },
  {
    defaultProps: {
      deg_pre_sec: 0,
      indexes: false,
      space: false,
      object: false,
    },
  },
);

// instructions
await simpleText.config({ close_on: 'pointerup' }).show({
  content: `In this task, you will track multiple moving objects:

Trial sequence:
1. You will be told which numbered objects to track, click to continue
2. Several objects will appear with numbers (0, 1, 2, ...), click to start
3. All objects will start moving (numbers become hidden)
4. After movement stops, you can response

Response:
- Click on objects to select them (they will turn light green)
- Click again to deselect
- Try to select all and only the target objects
- Click space when finished

Click to start.`,
});

// trial loop
const staircase = StairCase({
  start: 1,
  step: -1,
  down: 3,
  up: 1,
  reversals: 2,
  trials: 10,
  min: 1,
  max: opts.object_num,
});
const object_indexes = Array.from({ length: opts.object_num }, (_, i) => i);
for (const target_num of staircase) {
  /** Randomly choose target_indexes using Fisher-Yates shuffle algorithm */
  const pool = [...object_indexes];
  for (let i = 0; i < target_num; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = /** @type {[number, number]} */ ([pool[j], pool[i]]);
  }
  const target_indexes = pool.slice(0, target_num).sort();

  await simpleText.config({ close_on: 'pointerup' }).show({
    content: `You should track these objects:\n${target_indexes.join(', ')}

Click to continue.`,
  });
  await objects.show({ indexes: true, space: true });
  await objects.config({ duration: 5e3 }).show({
    deg_pre_sec: opts.deg_per_sec,
  });

  // get responses
  const { response_indexes, response_time, frame_times } = await objects.show({
    space: true,
    object: true,
  });
  const correct =
    target_indexes.length > 0 &&
    target_indexes.length === response_indexes.size &&
    target_indexes.every((v) => response_indexes.has(v));
  staircase.response(correct);
  dc.add({
    ...opts,
    target_indexes: target_indexes.join(','),
    response_indexes: [...response_indexes].join(','),
    correct,
    rt: response_time - /** @type {number} */ (frame_times[0]),
  });
}

document.body.textContent = dc.final();
