// Useful Field of View
import { SVG } from '@svgdotjs/svg.js';
import { createApp, effect, generic, h, StairCase } from 'psytask';
import { Form, ImageStim, VirtualChinrest } from 'psytask';

// Initialize app
using app = await createApp();
using dc = app.collector();

// Create form scene for parameter input
using form = app.scene(generic(Form), {
  defaultProps: { title: 'Useful Field of View' },
});
// Create virtual chinrest for degree-to-pixel conversion
using chinrest = app.scene(VirtualChinrest, {
  defaultProps: { usePreviousData: process.env.NODE_ENV === 'development' },
});
// Create task instructions to participant
using guide = app.text(
  `This task measures your visual attention and processing speed.

Trial sequence:
1. Fixation cross (+) - Keep your eyes focused here throughout the trial
2. Brief display of images (central + peripheral) - Pay attention to both locations
3. Visual mask - This will briefly cover the stimuli
4. Two response phases:
   - Central identification: Which image appeared in the center?
   - Peripheral localization: Where did the peripheral image appear?

Press SPACE key to begin.`,
  { close_on: 'key: ' },
);

// Collect experimental parameters from participant
const opts = await form.show({
  fields: {
    image_size: {
      type: 'NumberField',
      label: 'Image Size (deg)',
      defaultValue: 1,
    },
    mask_duration: {
      type: 'NumberField',
      label: 'Mask Duration (ms)',
      defaultValue: 1e2,
    },
  },
});
// Get degree-to-pixel conversion factor
const { deg2pix, deg2csspix } = await chinrest.show();

// Load images resources for central targets
const urls = [
  'https://imagecdn.app/v2/image/https%3A%2F%2Fpicsum.photos%2F10?0',
  'https://imagecdn.app/v2/image/https%3A%2F%2Fpicsum.photos%2F10?1',
] as const;
const imageBitmaps = await app.load(urls, (blob) => {
  const physical_size = deg2pix(opts.image_size);
  return window.createImageBitmap(blob, {
    resizeWidth: physical_size,
    resizeHeight: physical_size,
  });
});
// Define possible angles for peripheral targets (8 directions)
const rads = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
// Calculate mask size
const stim_size = deg2pix(opts.image_size * 12);
// Initialize staircase for adaptive duration adjustment
const staircase = new StairCase({
  start: 500,
  step: 20,
  down: 3,
  up: 1,
  reversal: 3,
  min: 16,
});

// Fixation cross
using fixation = app.text('+', { duration: 5e2 });
// Main UFOV stimulus scene using Canvas + SVG
using ufovStim = app.scene(
  (
    props: {
      image_indexes: [central: 0 | 1, peripheral: 0 | 1];
      peripheral_angle_index: number;
    },
    ctx,
  ) => {
    const modify = <T extends ElementCSSInlineStyle>(
      el: T,
      pos: [number, number],
      size = opts.image_size,
    ) => {
      el.style.position = 'absolute';
      effect(() => {
        el.style.transform = `translate(${deg2csspix(pos[0])}px, ${deg2csspix(pos[1])}px)`;
      });
      // Reactive size updates
      effect(() => {
        const _size = deg2csspix(size);
        el.style.top = el.style.left = -_size / 2 + 'px';
        el.style.width = el.style.height = _size + 'px';
      });
      return el;
    };

    // Central image stimulus - always at fixation point (0,0)
    const centralImage = ctx.use(ImageStim, {
      image: imageBitmaps[props.image_indexes[0]],
    });
    modify(centralImage.node, [0, 0]);
    // Reactive image updates based on trial parameters
    effect(
      () => (centralImage.props.image = imageBitmaps[props.image_indexes[0]]),
    );

    // Peripheral image stimulus - position determined by angle
    const peripheralImage = ctx.use(ImageStim, {
      image: imageBitmaps[props.image_indexes[1]],
    });
    modify(peripheralImage.node, [0, 0]); // Position will be updated by triangle effect
    // Reactive image updates
    effect(
      () =>
        (peripheralImage.props.image = imageBitmaps[props.image_indexes[1]]),
    );

    // White rectangle border around fixation area (visual reference)
    const rect = h('div');
    modify(rect, [0, 0], opts.image_size * 1.5);
    effect(() => (rect.style.border = deg2csspix(0.1) + 'px solid #fff'));

    /**
     * Creates SVG triangle elements for peripheral target locations Triangles
     * serve as visual markers for the 8 possible directions
     */
    const triangle = () => {
      const svg = SVG().stroke({ color: '#fff' }).fill('none');
      svg.polygon('1,1.732 2,0 0,0'); // Equilateral triangle points
      // Reactive stroke width scaling based on visual angle
      effect(() => {
        const strokeWidth =
          Math.round((deg2csspix(0.2) / deg2csspix(opts.image_size)) * 1e3) *
          1e-3;
        svg
          .stroke({ width: strokeWidth })
          .viewbox(
            (-strokeWidth / 2) * 1.732,
            -strokeWidth / 2,
            2 + strokeWidth * 1.732,
            2 + strokeWidth,
          );
      });
      return svg.node;
    };

    // Create triangle markers at 8 possible peripheral locations
    const option_triangle_els: SVGSVGElement[] = []; // Possible target locations
    const fixed_triangle_els: SVGSVGElement[] = []; // Distractor triangles

    // Generate concentric rings of triangles at different eccentricities
    for (let i = 1; i <= 3; i++) {
      // 3 concentric rings
      for (let j = 0; j < i * 8; j++) {
        // More triangles in outer rings
        const radius = i * 2; // Ring radius in visual degrees
        const rad = (j / (i * 8)) * (2 * Math.PI); // Angle for this triangle

        // Outermost ring (i=3) every 3rd triangle (j%3===0) are potential targets
        (i === 3 && j % 3 === 0
          ? option_triangle_els
          : fixed_triangle_els
        ).push(
          modify(triangle(), [Math.sin(rad) * radius, -Math.cos(rad) * radius]),
        );
      }
    }

    effect(() => {
      const i = props.peripheral_angle_index;
      option_triangle_els.forEach((el, j) => {
        if (i !== j) {
          el.style.visibility = 'visible';
          return;
        }
        el.style.visibility = 'hidden';
        peripheralImage.node.style.transform = el.style.transform;
      });
      ctx.app.data.dpr;
    });

    return {
      node: h(
        'div',
        {
          className: 'psytask-center',
          style: { position: 'relative', transform: 'translate(50%, 50%)' },
        },
        [
          centralImage.node, // Central target image
          peripheralImage.node, // Peripheral target image
          rect, // Fixation area border
          ...option_triangle_els, // Possible peripheral locations
          ...fixed_triangle_els, // Distractor triangles
        ],
      ),
    };
  },
  { defaultProps: { image_indexes: [0, 1], peripheral_angle_index: -1 } },
);

// Mask scene using ImageStim
using mask = app.scene(
  (_, ctx) => {
    const image = ctx.use(ImageStim, {});
    const createNoise = () => {
      const imageData = new ImageData(stim_size, stim_size);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const value = Math.floor(Math.random() * 256);
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
      }
      image.props.image = imageData;
    };

    ctx.on('scene:show', createNoise);
    createNoise();
    return { node: h('div', { className: 'psytask-center' }, image.node) };
  },
  { defaultProps: {} },
);

// Identification response scene
using identification = app.scene(
  (props: { image_indexes: (0 | 1)[] }, ctx) => {
    let data: { response_image_index: number; response_time: number };

    const images = props.image_indexes.map((i) => {
      const img = ctx.use(ImageStim, { image: imageBitmaps[i] });
      img.node.style.cursor = 'pointer';
      img.node.onclick = (e) => {
        data = { response_image_index: i, response_time: e.timeStamp };
        ctx.close();
      };
      return img;
    });
    effect(() => {
      for (const i of props.image_indexes) {
        images[i]!.props.image = imageBitmaps[i];
      }
    });
    return {
      node: h('div', { className: 'psytask-center' }, [
        'Central Identification:\nWhich image was displayed in the center?',
        h(
          'div',
          { style: { display: 'flex', gap: '1rem', 'margin-top': '0.5rem' } },
          images.map((e) => e.node),
        ),
      ]),
      data: () => data,
    };
  },
  { defaultProps: { image_indexes: [0, 1] } },
);

// Localization response scene - select from 8 directions
using localization = app.scene(
  (_, ctx) => {
    let data: { response_angle_index: number; response_time: number };

    const radius = '2rem';
    const buttons = rads.map((rad, index) =>
      h(
        'button',
        {
          style: {
            width: '1rem',
            position: 'absolute',
            cursor: 'pointer',
            transform: `rotate(${rad}rad) translateY(-${radius}) rotate(-${rad}rad)`,
          },
          onclick(e) {
            data = { response_angle_index: index, response_time: e.timeStamp };
            ctx.close();
          },
        },
        '' + (index + 1), // Button label (1-8)
      ),
    );

    // Container for the circular button arrangement
    const container = h(
      'div',
      {
        style: {
          position: 'relative',
          transform: `translateY(calc(${radius} + 5px))`,
        },
      },
      buttons,
    );

    return {
      node: h('div', { className: 'psytask-center' }, [
        'Peripheral Localization:\nIn which direction did the peripheral image appear?',
        container,
      ]),
      data: () => data,
    };
  },
  { defaultProps: {} },
);

// Feedback scene
using feedback = app.text('', { close_on: 'key: ' });

// Show task instructions
await guide.show();
// Main experimental loop
for (const stim_duration of staircase) {
  // Generate trial parameters
  const central_image_index = Math.random() < 0.5 ? 0 : 1;
  const peripheral_image_index = (1 - central_image_index) as 0 | 1;
  const peripheral_angle_index = Math.floor(Math.random() * rads.length);

  // Show fixation
  await fixation.show();
  // Show UFOV stimulus
  const ufovStim_data = await ufovStim
    .config({ duration: stim_duration })
    .show({
      image_indexes: [central_image_index, peripheral_image_index],
      peripheral_angle_index,
    }); // Show mask
  const mask_data = await mask.config({ duration: opts.mask_duration }).show();
  const stim_real_duration = mask_data.start_time - ufovStim_data.start_time;

  // Collect identification response
  const identification_data = await identification.show({
    image_indexes:
      Math.random() < 0.5
        ? [central_image_index, peripheral_image_index]
        : [peripheral_image_index, central_image_index],
  });
  const identification_correct =
    identification_data.response_image_index === central_image_index;
  // Collect localization response
  const localization_data = await localization.show();
  const localization_correct =
    localization_data.response_angle_index === peripheral_angle_index;

  // Update staircase
  const correct = identification_correct && localization_correct;
  staircase.response(correct);
  // Show feedback
  await feedback.show({
    content:
      (correct
        ? '✓ Correct!'
        : !identification_correct && !localization_correct
          ? '✗ Both responses incorrect'
          : !identification_correct
            ? '✗ Central identification incorrect'
            : '✗ Peripheral localization incorrect') +
      '\nPress SPACE key to continue.',
  });

  // Record trial data
  dc.add({
    image_urls: urls.join(','),
    stim_duration,
    stim_real_duration,
    central_image_index,
    peripheral_image_index,
    peripheral_angle_index,
    'identification.response_image_index':
      identification_data.response_image_index,
    'identification.rt':
      identification_data.response_time - identification_data.start_time,
    'identification.correct': identification_correct,
    'localization.response_angle_rad': localization_data.response_angle_index,
    'localization.rt':
      localization_data.response_time - localization_data.start_time,
    'localization.correct': localization_correct,
    correct,
  });
}
