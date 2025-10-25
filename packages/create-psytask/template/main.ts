import { createApp } from 'psytask';
import { Container } from '@psytask/components';
import van from 'vanjs-core';

const { a, div } = van.tags;

using app = await createApp();
using dc = app.collector('demo.csv');

using simpleText = app.scene(Container, {
  defaultProps: { content: '' },
  close_on: 'pointerup',
});

await simpleText.show({
  content: div(
    'Welcome to PsyTask template!\nsee more ',
    a(
      { href: 'https://bluebonesx.github.io/psytask', target: '_blank' },
      'Information & Examples',
    ),
    '\n\nClick to continue.',
  ),
});
for (let i = 0; i < 3; i++) {
  const { start_time } = await simpleText.show({
    content: `This is trial ${i + 1}. Click to continue.`,
  });

  dc.add({ index: i + 1, start_time });
}

// show data on page and download
document.body.style.whiteSpace = 'pre-wrap';
document.body.textContent = dc.final();
dc.download();
