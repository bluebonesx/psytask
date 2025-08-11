import { createApp, generic, StairCase } from '../index';
import { Form, TextStim } from '../src/scenes';

// Initialize app
using app = await createApp();
using dc = app.collector();

// Create form scene for parameter input
using form = app.scene(generic(Form), {
  defaultProps: { title: 'Rapid Serial Visual Presentation' },
});
// Create instruction display
using guide = app.text('', { close_on: 'key: ' });
// Fixation cross displayed before each trial
using fixation = app.text('+', { duration: 500 });
// Brief stimulus presentation (100ms each)
using stim = app.text('', { duration: 1e2 });
// Scene for collecting participant's response to identify the second number
using reaction = app.scene(
  (_, ctx) => {
    let data: { response_key: string; response_time: number };

    // Reset response data when scene shows
    ctx.on('scene:show', () => {
      data = { response_key: '', response_time: 0 };
    });
    // Only accept numeric key responses (0-9)
    for (let i = 0; i <= 9; i++)
      ctx.on(`key:${i}`, (e) => {
        data.response_key = e.key;
        data.response_time = e.timeStamp;
        ctx.close();
      });

    // Display response prompt
    const text = ctx.use(TextStim, {
      children: 'Please press the key corresponding to the second number.',
    });
    return { node: text.node, data: () => data };
  },
  { defaultProps: {} },
);
// Brief feedback display
using feedback = app.text('', { duration: 500 });

// Function to generate RSVP sequence with two numbers separated by a lag
const generateSeries = (lag: number) => {
  const length = opts.trial_num;
  // Randomly place the first number (but ensure space for second number)
  const firstIndex = Math.floor(Math.random() * (length - lag - 1));

  // Generate target number (0-9) - this will be the second number
  const target = '' + Math.floor(Math.random() * 10);
  // Create sequence: letters for distractors, numbers at specific positions
  const series = Array.from(
    { length },
    (_, i) =>
      i === firstIndex
        ? '' + Math.floor(Math.random() * 10) // First number (distractor)
        : i === firstIndex + lag + 1
          ? target // Second number (target)
          : String.fromCharCode(65 + Math.floor(Math.random() * 26)), // Random letter
  );

  return [series, target] as const;
};
// Collect experimental parameters from participant
const opts = await form.show({
  fields: {
    trial_num: {
      type: 'NumberField',
      label: 'Number of trials',
      defaultValue: 20,
    },
  },
});

// Initialize staircase procedure for adaptive lag adjustment
const staircase = new StairCase({
  start: opts.trial_num - 2, // Start with high lag (easier)
  step: 1, // Increase lag by 1 when performance is good
  down: 3, // Require 3 correct responses to increase lag
  up: 1, // Decrease lag after 1 incorrect response
  reversal: 3, // Stop after 3 reversals
});
// Main experimental loop
for (const lag of staircase) {
  // Generate stimulus sequence with current lag
  const [series, target] = generateSeries(lag);

  // Display instructions (different for first trial vs. subsequent)
  await guide.show({
    children:
      staircase.data.length > 1
        ? `Let's continue with the next series.

Press space key to continue.`
        : `In this task, you will see a rapid sequence of symbols presented one by one.

Trial sequence:
1. Fixation cross (+)
2. Rapid presentation of letters and numbers
3. Response prompt
4. Your response

Your task: Identify and remember the SECOND NUMBER that appears in the sequence.

Response method:
- After the sequence ends, you will see a prompt
- Press the number key (0-9) corresponding to the second number you saw
- Ignore all letters and the first number

Example:
If sequence shows: A-3-B-C-7-D, the second number is 7, so press key "7".

Press SPACE key to begin.`,
  });
  // Show fixation cross
  await fixation.show();
  // Present rapid sequence of stimuli
  for (const symbol of series) {
    await stim.show({ children: symbol });
  }
  // Collect participant response
  const { start_time, response_key, response_time } = await reaction.show();
  // Check if response matches target
  const correct = target === response_key;
  // Provide feedback
  await feedback.show({ children: correct ? 'Correct!' : 'Incorrect.' });

  // Update staircase based on accuracy
  staircase.response(correct);
  // Record trial data
  dc.add({
    series: series.join(','), // Full stimulus sequence
    target, // Correct answer (second number)
    response: response_key, // Participant's response
    correct, // Response accuracy
    rt: response_time - start_time, // Reaction time
  });
}
