import { createApp, effect, generic, h, StairCase } from '../index';
import { Form, VirtualChinrest } from '../src/scenes';

// Initialize app
using app = await createApp();
using dc = app.collector();

// Create form scene for parameter input
using form = app.scene(generic(Form), {
  defaultProps: { title: 'Visual Short-term Memory' },
});
// Create virtual chinrest for degree-to-pixel conversion
using chinrest = app.scene(VirtualChinrest, {
  defaultProps: { usePreviousData: process.env.NODE_ENV === 'development' },
});
// Create task instructions to participant
using guide = app.text(
  `In this task, you will see colored boxes appear on the screen twice.

Trial sequence:
1. Fixation cross (+)
2. First presentation of colored boxes
3. Blank interval
4. Second presentation with a white border highlighting one box
5. Your response

Your task: Judge whether the highlighted box changed color between the two presentations.

Response keys:
- Press F if the box changed color
- Press J if the box did not change color

Press SPACE key to begin.`,
  { close_on: 'key: ' },
);
// Fixation cross displayed before each trial
using fixation = app.text('+', { duration: 500 });
// Blank screen for interstimulus interval
using blank = app.text('');

// Define parameters for each colored box
type BoxParams = { pos: [number, number]; color: string; size: number };
// Main scene for displaying colored boxes with optional target cue
using boxes = app.scene(
  (props: { params: BoxParams[]; target_index?: number }, ctx) => {
    let data: { response: boolean; response_time: number };
    // Handle 'F' key press (changed color response)
    ctx
      .on('key:f', (e) => {
        if (props.target_index == null) return;
        data = { response: true, response_time: e.timeStamp };
        ctx.close();
      })
      // Handle 'J' key press (no change response)
      .on('key:j', (e) => {
        if (props.target_index == null) return;
        data = { response: false, response_time: e.timeStamp };
        ctx.close();
      });

    // Create white border cue element
    const cue = h('div', {
      id: 'cue',
      style: { position: 'absolute', border: '3px solid white' },
    });
    // Container for all visual elements
    const container = h(
      'div',
      { className: 'psytask-center', style: { position: 'relative' } },
      [cue],
    );

    // Reactively update box positions and colors
    effect(() => {
      container.replaceChildren(
        cue,
        ...props.params.map((p) =>
          h('div', {
            style: {
              position: 'absolute',
              width: `${p.size}px`,
              height: `${p.size}px`,
              'background-color': p.color,
              transform: `translate(${p.pos[0]}px, ${p.pos[1]}px)`,
            },
          }),
        ),
      );
    });
    // Show/hide and position the target cue
    effect(() => {
      cue.style.visibility = 'hidden';
      if (props.target_index == null) return;
      const p = props.params[props.target_index];
      if (!p) return;

      cue.style.visibility = '';
      cue.style.width = `${p.size * 1.5}px`;
      cue.style.height = `${p.size * 1.5}px`;
      cue.style.transform = `translate(${p.pos[0]}px, ${p.pos[1]}px)`;
    });

    return { node: container, data: () => data };
  },
  { defaultProps: { params: [], target_index: void 0 } },
);

// Collect experimental parameters from participant
const opts = await form.show({
  fields: {
    size_deg: {
      type: 'NumberField',
      label: 'Box size (deg)',
      defaultValue: 1,
    },
    interval_ms: {
      type: 'NumberField',
      label: 'Interval (ms)',
      defaultValue: 5e2,
    },
  },
});
// Get degree-to-pixel conversion factor
const { deg2csspix } = await chinrest.show();
// Show task instructions
await guide.show();

// Initialize staircase procedure for adaptive difficulty
const staircase = new StairCase({
  start: 1, // Start with 1 box
  step: -1, // Decrease by 1 box when performance is good
  down: 3, // Require 3 correct responses to step down
  up: 1, // Step up after 1 incorrect response
  min: 1, // Minimum number of boxes
  reversal: 3, // Stop after 3 reversals
});
// Main experimental loop
for (const box_num of staircase) {
  const size = deg2csspix(opts.size_deg);
  // Randomly select which box will be the target
  const target_index = Math.floor(Math.random() * box_num);
  // Randomly decide if target should change color (50% probability)
  const should_change_color = Math.random() < 0.5;

  // Generate first array of colored boxes with random positions and colors
  const params_1 = Array.from(
    { length: box_num },
    (): BoxParams => ({
      pos: [
        // Random X position within screen bounds
        Math.random() * (window.innerWidth - size) -
          (window.innerWidth - size) / 2,
        // Random Y position within screen bounds
        Math.random() * (window.innerHeight - size) -
          (window.innerHeight - size) / 2,
      ],
      // Random hue with full saturation and lightness
      color: `hsl(${Math.random() * 360}, 100%, 50%)`,
      size,
    }),
  );
  // Create second array (copy of first)
  const params_2 = [...params_1];
  // Change target color if condition requires it
  if (should_change_color) {
    params_2[target_index] = {
      ...params_2[target_index]!,
      color: `hsl(${Math.random() * 360}, 100%, 50%)`,
    };
  }

  // Trial sequence execution
  await fixation.show(); // Show fixation cross
  await boxes.config({ duration: 5e2 }).show({ params: params_1 }); // First array (500ms)
  await blank.config({ duration: opts.interval_ms }).show(); // Blank interval
  const { start_time, response, response_time } = await boxes.show({
    // Second array with cue
    params: params_2,
    target_index,
  });

  // Evaluate response accuracy
  const correct = response === should_change_color;
  // Update staircase based on accuracy
  staircase.response(correct);
  // Record trial data
  dc.add({
    box_num,
    params_1: JSON.stringify(params_1),
    params_2: JSON.stringify(params_2),
    target_index,
    should_change_color,
    response,
    correct,
    rt: response_time - start_time, // Calculate reaction time
  });
}
