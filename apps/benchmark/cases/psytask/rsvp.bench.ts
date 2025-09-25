import type { SceneSetup } from 'psytask';

const TextStim = ((props: { content: string }, ctx) => {
  const node = document.createElement('p');
  node.textContent = props.content;
  ctx.on('scene:show', (props) => {
    node.textContent = props.content;
  });
  return { node };
}) satisfies SceneSetup;

window.__benchmark__ = async (mark, params) => {
  const { createApp } = psytask;
  using app = await createApp();

  using fixation = app.scene(TextStim, {
    defaultProps: () => ({ content: '+' }),
    duration: 5e2,
  });
  using letter = app.scene(TextStim, {
    defaultProps: () => ({ content: '' }),
    duration: 1e2,
  });

  await fixation.show();
  for (let i = 0; i < params.count; i++) {
    mark(i, 1e2, i === params.count - 1);
    await letter.show({ content: String.fromCharCode(65 + (i % 26)) });
  }
};
