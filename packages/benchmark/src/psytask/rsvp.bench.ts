import { createApp } from 'psytask';

using app = await createApp();
using fixation = app.fixation({ duration: 5e2 });
using letter = app.text('', { duration: 1e2 });

await fixation.show();
for (let i = 0; i < 26; i++) {
  performance.mark(i + 'start');
  await letter.show({ text: String.fromCharCode(65 + i) });
  performance.mark(i + 'end');
  performance.measure('duration', i + 'start', i + 'end');
}
window['__benchmark__'](
  performance
    .getEntriesByName('duration')
    .map((e) => ({ value: e.duration, except: letter.options.duration! })),
);
