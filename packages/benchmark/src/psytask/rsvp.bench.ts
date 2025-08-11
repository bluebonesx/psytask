import { createApp } from 'psytask';

window.__benchmark__ = async (mark, params) => {
  using app = await createApp();
  using fixation = app.text('+', { duration: 5e2 });
  using letter = app.text('', { duration: 1e2 });

  await fixation.show();
  for (let i = 0; i < params.count; i++) {
    mark(i, 1e2, i === params.count - 1);
    await letter.show({ children: String.fromCharCode(65 + (i % 26)) });
  }
};
