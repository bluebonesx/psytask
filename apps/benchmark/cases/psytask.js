/** @type {BenchmarkCase} */
export default async (ctx) => {
  ctx.root.innerHTML = 'Loading js...';
  const { default: van } = await import('vanjs-core');
  const { createApp } = await import('psytask');
  ctx.root.innerHTML = '';

  const app = await createApp({ root: ctx.root });
  const scene = app
    .scene(
      /** @param {{ text: string }} props */
      (props) => van.tags.div({ class: 'psytask-center' }, () => props.text),
      { defaultProps: { text: '' }, duration: ctx.config.duration },
    )
    .on('show', ctx.onDraw);
  for (let i = 0; i < ctx.config.count; i++) {
    await scene.show({
      text: ((i / ctx.config.count) * 100).toFixed(2) + '%',
    });
  }

  app.emit('dispose');
  scene.emit('dispose');
};
