import HtmlKeyboardResponsePlugin from '@jspsych/plugin-html-keyboard-response';
import { initJsPsych } from 'jspsych';

const app = initJsPsych();
await app.run([
  {
    type: HtmlKeyboardResponsePlugin,
    stimulus: '+',
    trial_duration: 5e2,
  },
  {
    timeline: [
      {
        on_start() {
          performance.mark(app.evaluateTimelineVariable('i') + 'start');
        },
        on_finish() {
          const i = app.evaluateTimelineVariable('i');
          performance.mark(i + 'end');
          performance.measure('duration', i + 'start', i + 'end');
        },
        type: HtmlKeyboardResponsePlugin,
        stimulus: app.timelineVariable('letter'),
        trial_duration: 1e2,
      },
    ],
    timeline_variables: Array.from({ length: 26 }, (_, i) => ({
      i,
      letter: String.fromCharCode(65 + i),
    })),
  },
]);
window['__benchmark__'](
  performance
    .getEntriesByName('duration')
    .map((e) => ({ value: e.duration, except: 1e2 })),
);
