// N-back
import { createApp, effect, generic } from 'psytask';
import { Form, TextStim } from 'psytask';

// Initialize app
using app = await createApp();
using dc = app.collector();

// Create form scene for parameter input
using form = app.scene(generic(Form), { defaultProps: { title: 'N-back' } });
// Create instruction display
using guide = app.text('', { close_on: 'key: ' });
// Fixation cross displayed before each trial
using fixation = app.text('+', { duration: 500 });
// Scene for displaying stimulus letters and capturing responses
using stim = app.scene(
  (props: { content: string }, ctx) => {
    let data: { has_response: boolean; response_time: number };
    // Reset response data when scene shows
    ctx
      .on('scene:show', () => {
        data = { has_response: false, response_time: 0 };
      })
      // Capture spacebar responses for n-back matches
      .on('key: ', (e) => {
        data = { has_response: true, response_time: e.timeStamp };
      });

    // Create reactive text element for stimulus display
    const text = ctx.use(TextStim, {});
    effect(() => (text.props.children = props.content));
    return { node: text.node, data: () => data };
  },
  { defaultProps: { content: '' }, duration: 300 },
);

// Collect experimental parameters from participant
const opts = await form.show({
  fields: {
    back_num: {
      type: 'NumberField',
      label: 'N-back number',
      defaultValue: 2,
    },
    trial_num: {
      type: 'NumberField',
      label: 'Number of trials',
      defaultValue: 20,
    },
  },
});
// Generate random sequence of letters (A, B, C, D)
const letters = Array.from({ length: opts.trial_num }, () =>
  String.fromCharCode(65 + Math.floor(Math.random() * 4)),
);

// Display task instructions
await guide.show({
  content: `In this task, you will see a sequence of letters appear one by one.

Trial sequence:
1. Fixation cross (+)
2. Letter presentations (one at a time)
3. Your continuous monitoring

Your task: Press SPACE when the current letter is the same as the letter that appeared ${opts.back_num} positions back.

Response key:
- Press SPACE when you detect a match (current letter = letter from ${opts.back_num} positions ago)
- Do not press anything when there is no match

Example:
If sequence is A${Array.from({ length: opts.back_num - 1 }, (_, i) => '-' + String.fromCharCode(65 + i + 1)).join('')}-A, press SPACE when the second A appears (position ${opts.back_num + 1} matches position 1).

Press SPACE key to begin.`,
});
// Show initial fixation cross
await fixation.show();
// Main experimental loop - present each letter and collect responses
for (let i = 0; i < letters.length; i++) {
  const curr = letters[i]!;
  // Display current letter and capture response
  const { start_time, has_response, response_time } = await stim.show({
    content: curr,
  });
  // Check if current letter matches the letter n positions back
  const prev = i >= opts.back_num ? letters[i - opts.back_num] : null;
  const is_back = curr === prev;

  // Record trial data
  dc.add({
    stim: curr, // Current stimulus
    is_back, // Whether it's an n-back match
    correct: is_back ? !!has_response : !has_response, // Response accuracy
    rt: response_time === 0 ? 0 : response_time - start_time, // Reaction time
  });
}
