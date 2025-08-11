import { createApp, effect, generic, h, StairCase } from '../index';
import { Form, VirtualChinrest } from '../src/scenes';

// Initialize app
using app = await createApp();
using dc = app.collector();

// Create form scene for parameter input
using form = app.scene(generic(Form), {
  defaultProps: { title: 'Multiple Object Tracking' },
});
// Create virtual chinrest for degree-to-pixel conversion
using chinrest = app.scene(VirtualChinrest, {
  defaultProps: { usePreviousData: process.env.NODE_ENV === 'development' },
});
// Create task instructions to participant
using guide = app.text(
  `In this task, you will track multiple moving objects:

Trial sequence:
1. Several objects will appear with numbers
2. Target objects to track will be highlighted in red
3. All objects will start moving (numbers hidden)
4. After movement stops, click on the objects you were tracking

Response:
- Click on objects to select them (they will turn blue)
- Click again to deselect
- Try to select all and only the target objects
- Press SPACE when finished

Press SPACE key to begin.`,
  { close_on: 'key: ' },
);

const opts = await form.show({
  fields: {
    object_size: {
      type: 'NumberField',
      label: 'Object size (deg)',
      defaultValue: 1,
    },
    object_num: {
      type: 'NumberField',
      label: 'Number of objects',
      defaultValue: 10,
      min: 1,
      step: 1,
    },
    target_num: {
      type: 'NumberField',
      label: 'Number of targets',
      defaultValue: 1,
      min: 1,
      step: 1,
    },
  },
});
if (opts.target_num > opts.object_num) {
  console.warn('Number of targets cannot be greater than number of objects');
  opts.target_num = opts.object_num;
}
// Get degree-to-pixel conversion factor
const { deg2csspix } = await chinrest.show();
// Show task instructions
await guide.show();

using objects = app.scene(
  function (
    props: {
      speed: number;
      indexes: boolean;
      response: boolean;
      click: boolean;
    },
    ctx,
  ) {
    const data = { response_indexes: new Set<number>(), response_time: 0 };

    const handles = Array.from({ length: opts.object_num }, (_, i) => {
      const idx = h('b', null, i + '');
      const obj = h(
        'span',
        {
          dataset: { index: i, selected: false },
          style: {
            position: 'absolute',
            'background-color': '#000',
            'border-radius': '50%',
            'text-align': 'center',
          },
        },
        idx,
      );
      effect(() => {
        const size = deg2csspix(opts.object_size);
        obj.style.width = obj.style.height = obj.style.lineHeight = size + 'px';
        obj.style.left = obj.style.top = -size / 2 + 'px';
      });

      const size = deg2csspix(opts.object_size);
      const rad = Math.floor(Math.random() * 2 * Math.PI);
      return {
        obj,
        idx,
        vel: [Math.cos(rad), Math.sin(rad)] as [number, number],
        pos: [window.innerWidth - size, window.innerHeight - size].map(
          (v) => Math.floor(Math.random() * v) - v / 2,
        ) as [number, number],
      };
    });
    effect(() => {
      for (const { obj, idx } of handles) {
        obj.style.backgroundColor = '#000';
        idx.style.visibility = props.indexes ? 'visible' : 'hidden';
      }
    });

    let frame_pix: number;
    effect(() => {
      frame_pix = deg2csspix(props.speed) * ctx.app.data.frame_ms * 1e-3;
    });

    ctx
      .on('scene:show', () => {
        data.response_indexes.clear();
        data.response_time = 0;
      })
      .on('scene:frame', () => {
        for (const handle of handles) {
          const size = deg2csspix(opts.object_size);
          const w = window.innerWidth - size;
          const h = window.innerHeight - size;
          // boundary reflection
          if (handle.pos[0] > w / 2) {
            handle.pos[0] = w / 2;
            handle.vel[0] *= -1;
          } else if (handle.pos[0] < -w / 2) {
            handle.pos[0] = -w / 2;
            handle.vel[0] *= -1;
          } else {
            handle.pos[0] += handle.vel[0] * frame_pix;
          }
          if (handle.pos[1] > h / 2) {
            handle.pos[1] = h / 2;
            handle.vel[1] *= -1;
          } else if (handle.pos[1] < -h / 2) {
            handle.pos[1] = -h / 2;
            handle.vel[1] *= -1;
          } else {
            handle.pos[1] += handle.vel[1] * frame_pix;
          }
          // update pos
          handle.obj.style.transform = `translate(${handle.pos[0]}px, ${handle.pos[1]}px)`;
        }
      })
      .on('pointerup', (e) => {
        if (!props.click) return;
        const el = e.target;
        if (!el || !(el instanceof HTMLSpanElement)) return;
        if (el.dataset.selected === 'true') {
          el.dataset.selected = 'false';
          el.style.backgroundColor = '#000';
          data.response_indexes.delete(+el.dataset.index!);
        } else {
          el.dataset.selected = 'true';
          el.style.backgroundColor = '#afa';
          data.response_indexes.add(+el.dataset.index!);
        }
      })
      .on('key: ', (e) => {
        if (!props.response) return;
        if (props.click && data.response_indexes.size === 0) return;
        data.response_time = e.timeStamp;
        ctx.close();
      });

    return {
      node: h(
        'div',
        {
          className: 'psytask-center',
          style: { position: 'relative', transform: 'translate(50%, 50%)' },
        },
        handles.map((e) => e.obj),
      ),
      data: () => data,
    };
  },
  { defaultProps: { speed: 0, indexes: false, response: true, click: false } },
);

const staircase = new StairCase({
  start: 6,
  step: -1,
  down: 3,
  up: 1,
  reversal: 3,
});
const object_indexes = Array.from({ length: opts.object_num }, (_, i) => i);
function choose<T>(arr: readonly T[], k: number): T[] {
  const pool = [...arr];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, k);
}
for (const speed of staircase) {
  const target_indexes = choose(object_indexes, opts.target_num).sort();

  await guide.show({
    children: `Current speed: ${speed} deg/s
You should track these objects:\n${target_indexes.join(', ')}

Press SPACE key to continue.`,
  });
  await objects.show({ indexes: true });
  await objects.config({ duration: 5e3 }).show({ speed, response: false });
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

  await objects.show({ indexes: true });
}
