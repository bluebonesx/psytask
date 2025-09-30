import {
  adapter,
  Container,
  css,
  ImageStim,
  Loader,
  useDevicePixelRatio,
  VirtualChinrest,
} from '@psytask/components';
import { jsPsychStim } from '@psytask/jspsych';
import { createApp, generic, StairCase } from 'psytask';
import van from 'vanjs-core';
import { noreactive } from 'vanjs-ext';

const { button, div } = van.tags;

using app = await createApp({ alert_on_leave: false });
using dc = app.collector('useful-field-of-view.csv').on('add', console.log);

using jspsych = app.scene(jsPsychStim, { defaultProps: {} });
using simpleText = app.scene(Container, { defaultProps: { content: '' } });
using chinrest = app.scene(VirtualChinrest, { defaultProps: {} });

// load remote resources
const urls = /** @type {const} */ ([
  'https://picsum.photos/10?0',
  'https://picsum.photos/10?1',
]);
using loader = app.scene(generic(Loader), { defaultProps: { urls } });
const { blobs: imageBlobs, error } = await loader.show();
if (error) throw error;

// get task parameters
/** @type {{ image_size: number; mask_duration: number }} */
const opts = (
  await jspsych.show({
    type: await import(
      //@ts-ignore
      `https://cdn.jsdelivr.net/npm/@jspsych/plugin-survey/+esm`
    ).then((mod) => mod.default),
    survey_json: {
      elements: [
        {
          name: 'image_size',
          title: 'Image Size (deg)',
          type: 'text',
          defaultValue: 1,
          isRequired: true,
          inputType: 'number',
          min: 0,
        },
        {
          name: 'mask_duration',
          title: 'Mask Duration (ms)',
          type: 'text',
          defaultValue: 100,
          isRequired: true,
          inputType: 'number',
          min: 0,
        },
      ],
    },
  })
).response;
const { deg2pix, deg2csspix } = await chinrest.show();

// create stimuli scene
const imageBitmaps = /** @type {[ImageBitmap, ImageBitmap]} */ (
  await Promise.all(
    imageBlobs.map((blob) => {
      const physical_pix = deg2pix(opts.image_size);
      return window.createImageBitmap(blob, {
        resizeWidth: physical_pix,
        resizeHeight: physical_pix,
      });
    }),
  )
);
const rads = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
const stim_size = deg2pix(opts.image_size * 12);

using stim = app.scene(
  adapter(
    /**
     * @param {{
     *   image_indexes: [central: 0 | 1, peripheral: 0 | 1];
     *   peripheral_angle_index: number;
     * }} props
     */
    (props, ctx) => {
      /** Change position and size */
      const displace =
        /**
         * @template {ElementCSSInlineStyle} T
         * @param {T} el
         * @param {[number, number]} pos
         */
        (el, pos, deg = opts.image_size) => {
          const { style } = el;
          style.position = 'absolute';
          van.derive(() => {
            const size = deg2csspix(deg);
            style.top = style.left = -size / 2 + 'px';
            style.width = style.height = size + 'px';
            style.transform = `translate(${deg2csspix(pos[0])}px, ${deg2csspix(pos[1])}px)`;
          });
          return el;
        };

      const peripheralImage = displace(
        ImageStim({ image: () => imageBitmaps[props.image_indexes[1]] }, ctx),
        [0, 0],
      );

      const strokeWidth = van.derive(
        () =>
          Math.round((deg2csspix(0.2) / deg2csspix(opts.image_size)) * 1e3) *
          1e-3,
      );
      /**
       * Creates SVG triangle elements for peripheral target locations Triangles
       * serve as visual markers for the 8 possible directions
       */
      const triangle = () => {
        const { svg, polygon } = /**
         * @type {Readonly<{
         *   svg: import('vanjs-core').TagFunc<SVGSVGElement>;
         *   polygon: import('vanjs-core').TagFunc<SVGPolygonElement>;
         * }>}
         */ (van.tags('http://www.w3.org/2000/svg'));

        return svg(
          {
            viewBox: () =>
              [
                (-strokeWidth.val / 2) * 1.732,
                -strokeWidth.val / 2,
                2 + strokeWidth.val * 1.732,
                2 + strokeWidth.val,
              ].join(' '),
            style: () => css({ 'stroke-width': strokeWidth.val + 'px' }),
            fill: 'none',
            stroke: '#000',
          },
          polygon({ points: '1,1.732 2,0 0,0' }),
        );
      };

      /** @type {SVGSVGElement[]} */
      const option_triangle_els = [];
      /** @type {SVGSVGElement[]} */
      const fixed_triangle_els = [];
      for (let i = 1; i <= 3; i++) {
        for (let j = 0; j < i * 8; j++) {
          const radius = i * 2;
          const rad = (j / (i * 8)) * (2 * Math.PI);
          (i === 3 && j % 3 === 0
            ? option_triangle_els
            : fixed_triangle_els
          ).push(
            displace(triangle(), [
              Math.sin(rad) * radius,
              -Math.cos(rad) * radius,
            ]),
          );
        }
      }

      const dpr = useDevicePixelRatio(ctx);
      van.derive(() => {
        dpr.val; // depend on dpr changes
        const i = props.peripheral_angle_index;
        option_triangle_els.forEach((el, j) => {
          if (i !== j) {
            el.style.visibility = 'visible';
            return;
          }
          el.style.visibility = 'hidden';
          peripheralImage.style.transform = el.style.transform;
        });
      });

      return div(
        { style: css({ position: 'relative', inset: '50%' }) },
        displace(
          div({
            style: () =>
              css({
                border: `${deg2csspix(0.1)}px solid #000`,
                'box-sizing': 'border-box',
              }),
          }),
          [0, 0],
          opts.image_size * 1.5,
        ), // centeral fixation box
        displace(
          ImageStim({ image: () => imageBitmaps[props.image_indexes[0]] }, ctx),
          [0, 0],
        ), // centeral image
        peripheralImage, // peripheral image
        ...option_triangle_els,
        ...fixed_triangle_els,
      );
    },
  ),
  { defaultProps: { image_indexes: [0, 1], peripheral_angle_index: -1 } },
);
using mask = app.scene(
  /** @param {{}} props */
  (props, ctx) => {
    const image = () => {
      const imageData = new ImageData(stim_size, stim_size);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const value = Math.floor(Math.random() * 256);
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
      }
      return noreactive(imageData);
    };
    return Container({ content: ImageStim({ image }, ctx) }, ctx);
  },
  { defaultProps: {} },
);
using identification = app.scene(
  adapter(
    /** @param {{ image_indexes: [0 | 1, 0 | 1] }} props */
    (props, ctx) => {
      /** @type {{ response_image_index: number; response_time: number }} */
      let data;
      const Image = /** @param {0 | 1} index */ (index) => {
        const el = ImageStim(
          { image: () => imageBitmaps[props.image_indexes[index]] },
          ctx,
        );
        el.style.cursor = 'pointer';
        el.onclick = (e) => {
          data = {
            response_image_index: props.image_indexes[index],
            response_time: e.timeStamp,
          };
          ctx.close();
        };
        return el;
      };
      return {
        node: Container(
          {
            content: div(
              'Central Identification:\nWhich image was displayed in the center?',
              div(
                {
                  style: css({
                    display: 'flex',
                    'justify-content': 'space-around',
                    'margin-top': '0.5rem',
                  }),
                },
                Image(0),
                Image(1),
              ),
            ),
          },
          ctx,
        ),
        data: () => data,
      };
    },
  ),
  { defaultProps: { image_indexes: [0, 1] } },
);
using localization = app.scene(
  /** @param {{}} props */
  (props, ctx) => {
    /** @type {{ response_angle_index: number; response_time: number }} */
    let data;

    const radius = '3rem';
    const buttons = rads.map((rad, index) =>
      button(
        {
          style: css({
            width: '1.5rem',
            'aspect-ratio': '1',
            position: 'absolute',
            cursor: 'pointer',
            transform: `rotate(${rad}rad) translateY(-${radius}) rotate(-${rad}rad)`,
          }),
          onclick(e) {
            data = { response_angle_index: index, response_time: e.timeStamp };
            ctx.close();
          },
        },
        '' + (index + 1),
      ),
    );

    const container = div(
      {
        style: css({
          position: 'relative',
          transform: `translateY(calc(${radius} + 5px))`,
          'text-align': 'center',
        }),
      },
      buttons,
    );

    return {
      node: Container(
        {
          content: div(
            'Peripheral Localization:\nIn which direction did the peripheral image appear?',
            container,
          ),
        },
        ctx,
      ),
      data: () => data,
    };
  },
  { defaultProps: {} },
);

// instructions
await simpleText.config({ close_on: 'pointerup' }).show({
  content: `This task measures your visual attention and processing speed.

Trial sequence:
1. Fixation cross (+)
2. Brief display of images (central + peripheral)
3. Noise mask
4. Two response phases:
   - Central identification: Which image appeared in the center?
   - Peripheral localization: Where did the peripheral image appear?

Click to start.`,
});

// main loop
const staircase = StairCase({
  start: 500,
  step: 20,
  down: 3,
  up: 1,
  reversals: 2,
  min: 16,
  trials: 10,
});
for (const stim_duration of staircase) {
  const central_image_index = Math.random() < 0.5 ? 0 : 1;
  const peripheral_image_index = /** @type {0 | 1} */ (1 - central_image_index);
  const peripheral_angle_index = Math.floor(Math.random() * rads.length);

  await simpleText.config({ duration: 500 }).show();
  const stim_data = await stim.config({ duration: stim_duration }).show({
    image_indexes: [central_image_index, peripheral_image_index],
    peripheral_angle_index,
  });
  const mask_data = await mask.config({ duration: opts.mask_duration }).show();

  const identification_data = await identification.show({
    image_indexes:
      Math.random() < 0.5
        ? [central_image_index, peripheral_image_index]
        : [peripheral_image_index, central_image_index],
  });
  const identification_correct =
    identification_data.response_image_index === central_image_index;
  const localization_data = await localization.show();
  const localization_correct =
    localization_data.response_angle_index === peripheral_angle_index;

  const correct = identification_correct && localization_correct;
  staircase.response(correct);
  await simpleText.config({ close_on: 'pointerup' }).show({
    content:
      (correct
        ? '✓ Correct!'
        : !identification_correct && !localization_correct
          ? '✗ Both responses incorrect'
          : !identification_correct
            ? '✗ Central identification incorrect'
            : '✗ Peripheral localization incorrect') + '\nClick to continue.',
  });

  dc.add({
    stim_duration,
    stim_real_duration: mask_data.start_time - stim_data.start_time,
    central_image_index,
    peripheral_image_index,
    peripheral_angle_index,
    identification: {
      response_image_index: identification_data.response_image_index,
      correct: identification_correct,
      rt: identification_data.response_time - identification_data.start_time,
    },
    localization: {
      response_angle_index: localization_data.response_angle_index,
      correct: localization_correct,
      rt: localization_data.response_time - localization_data.start_time,
    },
    correct,
  });
}

document.body.textContent = dc.final();
