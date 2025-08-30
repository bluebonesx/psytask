import { createApp } from 'psytask';
import 'psytask/main.css';

using app = await createApp();
using dc = app.collector('demo.csv');

using text = app.text('', { close_on: 'pointerup' });

await text.show({
  children: 'Welcome to the experiment! Click to continue.',
});
for (let i = 0; i < 3; i++) {
  const { start_time } = await text.show({
    children: `This is trial ${i + 1}. Click to continue.`,
  });

  dc.add({ index: i + 1, start_time });
}
