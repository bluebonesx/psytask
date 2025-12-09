const detectFPS =
  /**
   * @param {number[]} [times]
   * @returns {Promise<number>}
   */
  async (count = 20, times = []) =>
    new Promise((resolve) => {
      const frame = () =>
        requestAnimationFrame((time) => {
          if (times.length > count) {
            const durations = times.map((t, i, arr) =>
              //@ts-ignore
              i > 0 ? t - arr[i - 1] : 0,
            );
            return resolve(
              durations.reduce((a, b) => a + b) / durations.length,
            );
          }
          times.push(time);
          frame();
        });
      frame();
    });

/** @type {BenchmarkCase} */
export default async (ctx) => {
  ctx.root.innerHTML = 'Loading css...';
  await ctx.load(
    'psychojs@2025.2.1/css',
    'https://run.pavlovia.org/demos/go_nogo/lib/psychojs-2025.2.1.css',
  );
  ctx.root.innerHTML = 'Loading deps...';
  await ctx.load(
    'preloadjs@1.0.1',
    'https://cdn.jsdelivr.net/npm/preloadjs@1.0.1/lib/preloadjs.min.js',
  );
  ctx.root.innerHTML = 'Loading js...';
  await ctx.load(
    'psychojs@2025.2.1',
    'https://run.pavlovia.org/demos/go_nogo/lib/psychojs-2025.2.1.iife.js',
  );
  ctx.root.innerHTML = '';

  //@ts-ignore
  const { core, visual, util } = window['PsychoJS'];
  const app = new core.PsychoJS();
  app._saveResults = false;
  app.openWindow({
    fullscr: false,
    color: new util.Color('black'),
    waitBlanking: true,
  });

  const style = getComputedStyle(ctx.root);
  const stim = new visual.TextStim({
    win: app.window,
    text: 'Loading...',
    color: new util.Color('white'),
    units: 'pix',
    height: +style.fontSize.slice(0, -2),
    font: style.fontFamily,
  });

  const frame_ms = await detectFPS();
  const clock = new util.Clock();
  let st = 0;

  return new Promise((resolve) => {
    const { count, duration } = ctx.config;
    for (let i = 0; i < count; i++) {
      const text = ((i / count) * 100).toFixed(2) + '%';
      app.schedule(() => {
        st = clock.getTime();
        stim.setText(text);
        stim.draw();
        ctx.onDraw();
        return util.Scheduler.Event.NEXT;
      });
      app.schedule(() =>
        1e3 * (clock.getTime() - st) < duration - frame_ms / 2
          ? util.Scheduler.Event.FLIP_REPEAT
          : util.Scheduler.Event.NEXT,
      );
    }

    app.schedule(() => {
      app.window.close();
      app.quit({ isCompleted: true });
      resolve();
      return util.Scheduler.Event.QUIT;
    });
    app.start();
  });
};
