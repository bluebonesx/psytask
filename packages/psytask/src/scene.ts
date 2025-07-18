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
  data: Readonly<{ start_time: number }> & LooseObject = { start_time: 0 };
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

    // render
    if (
      typeof this.options.duration !== 'undefined' &&
      this.options.duration < this.app.data.frame_ms
    ) {
      console.warn(
        'Scene duration is shorter than frame_ms, it will show 1 frame',
      );
    }
    const onFrame = (lastFrameTime: number) => {
      const elapsedTime = lastFrameTime - this.data.start_time;
      if (
        typeof this.options.duration !== 'undefined' &&
        //TODO: explain this magic number
        elapsedTime >= this.options.duration - this.app.data.frame_ms * 1.4
      ) {
        this.close();
        return;
      }
      this.options.on_frame?.(lastFrameTime);
      window.requestAnimationFrame(onFrame);
    };
    // it will be called after first frame and before second frame
    window.requestAnimationFrame((lastFrameTime) => {
      //@ts-ignore
      this.data.start_time = lastFrameTime;
      onFrame(lastFrameTime);
    });
    return this.#showPromiseWithResolvers.promise;
  }
}
