import type { LooseObject } from '../types';
import type { App } from './app';
import { DisposableClass, h, promiseWithResolvers } from './util';

export type SceneOptions = {
  /** Milliseconds */
  duration?: number;
  close_on?: keyof HTMLElementEventMap | (keyof HTMLElementEventMap)[];
  on_frame?: (lastFrameTime: number) => void;
};
export type SceneSetup<P extends unknown[] = never> = (
  /** This scene */
  self: Scene<never>,
) => (...e: P) => void;

export class Scene<P extends unknown[]> extends DisposableClass {
  /** Root element of the scene */
  root = h('div');
  /** Show generated data */
  data: Readonly<{ start_time: number; frame_times: number[] }> & LooseObject =
    { start_time: 0, frame_times: [] };
  update: (...e: P) => void;
  #isShown = true;
  #showPromiseWithResolvers?: ReturnType<
    typeof promiseWithResolvers<typeof this.data>
  >;
  constructor(
    public app: App,
    /**
     * Setup function to create the scene
     *
     * @returns Update function to update the scene each show
     */
    setup: SceneSetup<P>,
    public options: SceneOptions = {},
  ) {
    super();

    // initialize
    this.close();
    this.update = setup(this);
    this.addCleanup(() => this.app.root.removeChild(this.root));

    // add close event listener
    const closeKeys =
      typeof options.close_on === 'undefined'
        ? []
        : typeof options.close_on === 'string'
          ? [options.close_on]
          : options.close_on;
    const closeFn = this.close.bind(this);
    for (const key of closeKeys) {
      //@ts-ignore
      this.useEventListener(this.root, key, closeFn);
    }
  }
  /** Override config */
  config(options: Partial<SceneOptions>) {
    Object.assign(this.options, options);
    return this;
  }
  close() {
    if (!this.#isShown) {
      console.warn('Scene is already closed');
      return;
    }
    this.#isShown = false;
    this.root.style.transform = 'scale(0)';
    this.#showPromiseWithResolvers?.resolve(this.data);
  }
  /** Show the scene with parameters */
  show(...e: P) {
    if (this.#isShown) {
      console.warn('Scene is already shown');
      return this.data;
    }
    this.#isShown = true;
    this.root.style.transform = 'scale(1)';
    this.#showPromiseWithResolvers = promiseWithResolvers();

    this.update(...e);

    const frame_ms = this.app.data.frame_ms;
    const duration = this.options.duration;

    // check duration
    if (
      process.env.NODE_ENV === 'development' &&
      typeof duration !== 'undefined'
    ) {
      const theoreticalDuration = Math.round(duration / frame_ms) * frame_ms;
      const error = theoreticalDuration - duration;
      if (Math.abs(error) >= 1) {
        console.warn(
          `Scene duration is not a multiple of frame_ms, theoretical duration is ${theoreticalDuration} ms, but got ${duration} ms (error: ${error} ms)`,
        );
      }
    }

    /**
     * Render
     *
     * ## Scene render logic
     *
     * ```text
     * scene_1.show ->
     * call_rAF_cb -> render -> vsync -> scene_1.start_time -> ... ->
     * call_rAF_cb(scene_2.show) -> render -> vsync -> scene_2.start_time -> ... ->
     * call_rAF_cb(scene_3.show) -> render -> vsync -> scene_3.start_time -> ...
     * ```
     *
     * ## Closing condition
     *
     * |    symbol/expression    | description         |
     * | :---------------------: | ------------------- |
     * |            t            | current frame time  |
     * |           t_0           | start frame time    |
     * |            D            | duration            |
     * |         \delta          | next frame duration |
     * |     e = t - t_0 - D     | duration error      |
     * | \|e\| <= \|e + \delta\| | closing condition   |
     *
     * Inference:
     *
     * ```text
     * For |e| <= |e + \delta|, given that \delta > 0
     * if e >= 0 then e <= e + \delta -> true
     * if e < 0 then -e <= |e + \delta|
     *     if e + \delta >= 0 then -e <= e + \delta -> e >= -\delta / 2
     *     if e + \delta < 0 then -e <= -e - \delta -> false
     * ```
     */
    const onFrame = (lastFrameTime: number) => {
      this.data.frame_times.push(lastFrameTime);

      if (typeof this.options.duration !== 'undefined') {
        if (
          lastFrameTime - this.data.start_time >=
          this.options.duration - frame_ms * 1.5
        ) {
          // console.log(
          //     'frame durations',
          //     this.data.frame_times.reduce(
          //         (acc, e, i, arr) => (i > 0 && acc.push(e - arr[i - 1]!), acc),
          //     [] as number[],
          //   ),
          // );
          this.close();
          return;
        }
      }

      this.options.on_frame?.(lastFrameTime);
      window.requestAnimationFrame(onFrame);
    };
    window.requestAnimationFrame((lastFrameTime) => {
      //@ts-ignore
      this.data.start_time = lastFrameTime;
      this.data.frame_times.length = 0;
      onFrame(lastFrameTime);
    });

    return this.#showPromiseWithResolvers.promise;
  }
}
