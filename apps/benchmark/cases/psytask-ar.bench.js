import { dot, IQR_filter } from './utils.js';

const p = 3,
  lambda = 0.99;

const RLS_update_and_AR_predict = (() => {
  const params = {
    P: Array.from(
      { length: p },
      (_, i) =>
        new Float64Array(
          Array.from({ length: p }, (_, j) => (i === j ? 0.5 : 0)),
        ),
    ),
    k: new Float64Array(p),
    w: new Float64Array(Array(p).fill(0)),
    x_hat: 0,
  };
  /** @param {number[]} series */
  return (series) => {
    const len = series.length;
    const x_last = /** @type {number} */ (series[len - 1]);
    if (len <= p) return x_last - /** @type {number} */ (series[len - 2]);

    const x_k = new Float64Array(series.slice(-p - 1, -1));
    const x_error = x_last - params.x_hat;

    /**
     * #mathbf("k") _k & =(#mathbf("P") _(k-1) #mathbf("x")
     * _k)/(lambda+#mathbf("x") _k^T #mathbf("P") _(k-1) #mathbf("x") _k)
     */
    const Px = new Float64Array(p);
    for (let i = 0; i < p; i++) {
      Px[i] = dot(/** @type {Float64Array} */ (params.P[i]), x_k);
    }
    const k_denom = lambda + dot(Px, x_k);
    for (let i = 0; i < p; i++) {
      /**
       * #mathbf("w") _k & =#mathbf("w") _(k-1) + #mathbf("k") _k
       * (x_k-#mathbf("x") _k^T #mathbf("w") _(k-1))
       */
      /** @type {number} */ (params.w[i]) +=
        x_error * (params.k[i] = /** @type {number} */ (Px[i]) / k_denom);
    }

    // run on idle
    setTimeout(() => {
      /**
       * #mathbf("P") _k & =1/lambda (#mathbf("P") _(k-1) -#mathbf("k") _k
       * #mathbf("x") _k^T #mathbf("P") _(k-1)) \
       */
      for (let i = 0; i < p; i++) {
        const Pi = /** @type {Float64Array} */ (params.P[i]);
        const ki = /** @type {number} */ (params.k[i]);
        for (let j = 0; j < p; j++) {
          Pi[j] =
            (void 0,
            /** @type {number} */ (Pi[j]) -
              ki * /** @type {number} */ (Px[j])) / lambda;
        }
      }
      console.log(x_k.join(' '), x_last, x_error, params.x_hat);
    });

    return (params.x_hat = dot(params.w, x_k));
  };
})();

// test
let t = 0,
  /** @type {number[]} */
  durations = [];
requestAnimationFrame(function frame(time) {
  if (t === 0) {
    t = time;
    requestAnimationFrame(frame);
    return;
  }
  durations.push(time - t) < 60 && requestAnimationFrame(frame);
  RLS_update_and_AR_predict(IQR_filter(durations));
  t = time;
});

/** @type {BenchmarkCase} */
export default async (ctx) => {
  ctx.root.innerHTML = 'Loading js...';
  const { createApp, createTimer, getCurrentScene, createComponentAdapter } =
    await import('psytask');
  ctx.root.innerHTML = '';

  const app = await createApp({ root: ctx.root });
  const scene = app
    .scene(
      /** @param {{ text: string }} props */
      (props) => {
        const ctx = getCurrentScene();
        const el = document.createElement('div');
        el.className = 'psytask-center';
        ctx.on('show', () => {
          el.textContent = props.text;
        });
        return el;
      },
      {
        adapter: createComponentAdapter((e) => e),
        defaultProps: { text: '' },
        duration: ctx.config.duration,
        timer: () =>
          createTimer((cur_frame_time, records) => {
            durations.push(cur_frame_time - t);
            t = cur_frame_time;
            const diff =
              /** @type {number} */ (records[0]) +
              ctx.config.duration -
              cur_frame_time;
            const frame_ms =
              diff >= 3 * app.data.frame_ms
                ? app.data.frame_ms
                : RLS_update_and_AR_predict(IQR_filter(durations));
            return 2 * diff <= frame_ms;
          }),
      },
    )
    .on('show', ctx.onDraw);

  for (let i = 0; i <= ctx.config.count; i++) {
    await scene.show({
      text: ((i / ctx.config.count) * 100).toFixed(2) + '%',
    });
  }

  app.emit('dispose');
  scene.emit('dispose');
};
