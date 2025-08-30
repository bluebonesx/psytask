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
1. Several objects will appear with numbers (0, 1, 2, ...)
2. You will be told which numbered objects to track
3. All objects will start moving (numbers become hidden)
4. After movement stops, click on the objects you were tracking

Response:
- Click on objects to select them (they will turn light green)
- Click again to deselect
- Try to select all and only the target objects
- Press SPACE when finished

Press SPACE key to begin.`,
  { close_on: 'key: ' },
);

// Collect experimental parameters from the participant
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
// Validate that target number doesn't exceed object number
if (opts.target_num > opts.object_num) {
  console.warn('Number of targets cannot be greater than number of objects');
  opts.target_num = opts.object_num;
}
// Get degree-to-pixel conversion factor from chinrest calibration
const { deg2csspix } = await chinrest.show();
// Show task instructions to participant
await guide.show();

// Main scene for displaying and controlling the moving objects
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

      // Reactive effect to update object size based on visual angle
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

    // Reactive effect to control object appearance based on scene state
    effect(() => {
      for (const { obj, idx } of handles) {
        obj.style.backgroundColor = '#000'; // Reset to black color
        idx.style.visibility = props.indexes ? 'visible' : 'hidden'; // Show/hide numbers
      }
    });

    // Variable to store movement distance per frame
    let frame_pix: number;
    // Calculate movement distance based on speed and frame rate
    effect(() => {
      frame_pix = deg2csspix(props.speed) * ctx.app.data.frame_ms * 1e-3;
    });

    ctx
      // Reset response data when scene starts
      .on('scene:show', () => {
        data.response_indexes.clear();
        data.response_time = 0;
      })
      // Update object positions on each animation frame
      .on('scene:frame', () => {
        for (const handle of handles) {
          const size = deg2csspix(opts.object_size);
          const w = window.innerWidth - size;
          const h = window.innerHeight - size;

          // Boundary collision detection and reflection for horizontal movement
          if (handle.pos[0] > w / 2) {
            handle.pos[0] = w / 2;
            handle.vel[0] *= -1; // Reverse horizontal velocity
          } else if (handle.pos[0] < -w / 2) {
            handle.pos[0] = -w / 2;
            handle.vel[0] *= -1;
          } else {
            handle.pos[0] += handle.vel[0] * frame_pix; // Update position
          }

          // Boundary collision detection and reflection for vertical movement
          if (handle.pos[1] > h / 2) {
            handle.pos[1] = h / 2;
            handle.vel[1] *= -1; // Reverse vertical velocity
          } else if (handle.pos[1] < -h / 2) {
            handle.pos[1] = -h / 2;
            handle.vel[1] *= -1;
          } else {
            handle.pos[1] += handle.vel[1] * frame_pix; // Update position
          }

          // Apply position transformation to DOM element
          handle.obj.style.transform = `translate(${handle.pos[0]}px, ${handle.pos[1]}px)`;
        }
      })
      // Handle mouse clicks for object selection during response phase
      .on('pointerup', (e) => {
        if (!props.click) return; // Only respond if clicking is enabled
        const el = e.target;
        if (!el || !(el instanceof HTMLSpanElement)) return; // Ensure clicked element is an object

        // Toggle selection state
        if (el.dataset.selected === 'true') {
          el.dataset.selected = 'false';
          el.style.backgroundColor = '#000'; // Deselect: back to black
          data.response_indexes.delete(+el.dataset.index!);
        } else {
          el.dataset.selected = 'true';
          el.style.backgroundColor = '#afa'; // Select: turn light green
          data.response_indexes.add(+el.dataset.index!);
        }
      })
      // Handle spacebar press to confirm selection
      .on('key: ', (e) => {
        if (!props.response) return; // Only respond if responses are enabled
        if (props.click && data.response_indexes.size === 0) return; // Require at least one selection
        data.response_time = e.timeStamp;
        ctx.close();
      });

    return {
      // Container element centered on screen with all objects
      node: h(
        'div',
        {
          className: 'psytask-center',
          style: { position: 'relative', transform: 'translate(50%, 50%)' },
        },
        handles.map((e) => e.obj), // Add all object elements to container
      ),
      data: () => data, // Return current response data
    };
  },
  // Default scene properties
  { defaultProps: { speed: 0, indexes: false, response: true, click: false } },
);

// Initialize adaptive staircase for adjusting movement speed based on performance
const staircase = new StairCase({
  start: 6, // Starting speed: 6 degrees/second
  step: -1, // Decrease speed by 1 deg/s when making it easier
  down: 3, // Require 3 correct responses to make it harder (increase speed)
  up: 1, // Make it easier after 1 incorrect response (decrease speed)
  reversal: 3, // Stop after 3 reversals (changes in difficulty direction)
});

// Create array of all possible object indices for target selection
const object_indexes = Array.from({ length: opts.object_num }, (_, i) => i);

/**
 * Utility function to randomly choose k items from an array without replacement
 * Uses Fisher-Yates shuffle algorithm for the first k elements
 *
 * @param arr - Array to choose from
 * @param k - Number of items to choose
 * @returns Array of k randomly selected items
 */
function choose<T>(arr: readonly T[], k: number): T[] {
  const pool = [...arr]; // Create copy to avoid modifying original
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i)); // Random index from remaining items
    [pool[i], pool[j]] = [pool[j]!, pool[i]!]; // Swap to front
  }
  return pool.slice(0, k); // Return first k items
}

// Main experimental loop - run trials with adaptive speed adjustment
for (const speed of staircase) {
  // Randomly select which objects will be targets for this trial
  const target_indexes = choose(object_indexes, opts.target_num).sort();

  // Show target identification phase
  await guide.show({
    children: `Current speed: ${speed} deg/s
You should track these objects:\n${target_indexes.join(', ')}

Press SPACE key to continue.`,
  });

  // Phase 1: Show objects with numbers visible (target identification)
  await objects.show({ indexes: true });

  // Phase 2: Movement phase - objects move for 5 seconds without numbers
  await objects.config({ duration: 5e3 }).show({ speed, response: false });

  // Phase 3: Response phase - participant clicks on tracked objects
  const { response_indexes, response_time, start_time } = await objects.show({
    click: true,
  });

  // Evaluate response accuracy: correct if all and only target objects were selected
  const correct =
    target_indexes.length > 0 && // Ensure there were targets
    target_indexes.length === response_indexes.size && // Same number selected as targets
    target_indexes.every((v) => response_indexes.has(v)); // All targets were selected

  // Provide feedback to staircase algorithm for adaptive adjustment
  staircase.response(correct);

  // Record trial data
  dc.add({
    speed, // Movement speed for this trial
    target_indexes: target_indexes.join(','), // Which objects were targets
    response_indexes: Array.from(response_indexes).join(','), // Which objects were selected
    correct, // Whether response was accurate
    rt: response_time - start_time, // Response time
  });

  // Phase 4: Feedback phase - show objects with numbers again to reveal correct answers
  await objects.show({ indexes: true });
}
