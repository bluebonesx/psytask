import { adapter } from '@psytask/components';
import { createApp } from 'psytask';
import van from 'vanjs-core';

const { a, div } = van.tags;

using app = await createApp();
using dc = app.collector('demo.csv');

using simpleText = app.scene(
  /** @param {{ content: import('psytask').NodeLike }} props */
  (props) => div({ class: 'psytask-center' }, () => props.content),
  { defaultProps: { content: '' }, adapter },
);

await simpleText.show({
  content: div(
    'Welcome to PsyTask template!\nsee more ',
    a(
      { href: 'https://bluebonesx.github.io/psytask/play/', target: '_blank' },
      'Information & Examples',
    ),
    '\n\nClick to continue.',
  ),
});
for (let i = 0; i < 3; i++) {
  const { frame_times } = await simpleText.show({
    content: `This is trial ${i + 1}. Click to continue.`,
  });

  dc.add({ index: i + 1, start_time: /** @type {number} */ (frame_times[0]) });
}

// show data on page and download
document.body.style.whiteSpace = 'pre-wrap';
document.body.textContent = dc.final();
dc.download();
