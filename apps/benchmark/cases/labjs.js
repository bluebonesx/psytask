/** @type {BenchmarkCase} */
export default async (ctx) => {
  ctx.root.innerHTML = 'Loading css...';
  await ctx.load(
    'lab.js@20.2.4/css',
    'https://cdn.jsdelivr.net/npm/lab.js@20.2.4/dist/lab.css',
  );
  ctx.root.innerHTML = 'Loading js...';
  const app = await import(
    //@ts-ignore
    'https://cdn.jsdelivr.net/npm/lab.js@20.2.4/+esm'
  );
  ctx.root.innerHTML = '';
  ctx.root.style.textAlign = 'center';
  ctx.root.style.lineHeight = '100dvh';
  const flow = new app.flow.Loop({
    el: ctx.root,
    templateParameters: Array.from({ length: ctx.config.count }, (_, i) => ({
      text: ((i / ctx.config.count) * 100).toFixed(2) + '%',
    })),
    /** @param {{ text: string }} param */
    template(param) {
      return new app.html.Screen({
        content: param.text,
        timeout: ctx.config.duration,
      }).once('run', ctx.onDraw);
    },
  });
  flow.run();
  await flow.waitFor('end');
};
