const loadPlugin =
  /**
   * @param {string} name
   * @param {Record<string, Promise<any>>} [cache]
   */
  (name, cache = {}) =>
    (cache[name] ??= import(
      `https://cdn.jsdelivr.net/npm/@jspsych/plugin-${name}/+esm`
    ).then((m) => m.default));

/** @type {BenchmarkCase} */
export default async (ctx) => {
  ctx.root.innerHTML = 'Loading css...';
  await ctx.load(
    'jspsych@8.2.0/css',
    'https://cdn.jsdelivr.net/npm/jspsych@8.2.0/css/jspsych.css',
  );
  ctx.root.innerHTML = 'Loading js...';
  const { initJsPsych } = await import(
    //@ts-expect-error external module
    'https://cdn.jsdelivr.net/npm/jspsych@8.2.0/+esm'
  );
  ctx.root.innerHTML = '';

  const app = initJsPsych({ display_element: ctx.root.id });
  await app.run([
    {
      timeline_variables: Array.from({ length: ctx.config.count }, (_, i) => ({
        text: ((i / ctx.config.count) * 100).toFixed(2) + '%',
      })),
      timeline: [
        {
          type: await loadPlugin('html-keyboard-response'),
          stimulus: app.timelineVariable('text'),
          choices: 'NO_KEYS',
          trial_duration: ctx.config.duration,
          on_start: ctx.onDraw,
        },
      ],
    },
  ]);
};
