import type { DeepReadonly, LooseObject, Merge } from '../types';
import type { App } from './app';
import { reactive } from './reactive';
import { EventEmitter, h, on, promiseWithResolvers } from './util';

const createShowInfo = () => ({ start_time: 0, frame_times: [] as number[] });
type SceneShowInfo = ReturnType<typeof createShowInfo>;
type ForbiddenSceneData = { [K in keyof SceneShowInfo]?: never };

/**
 * @param props - The reactive props to control the scene display
 * @param ctx - The scene instance, can be used to manage lifecycle and use
 *   other setups
 * @see {@link Scene}
 */
type SceneSetup<
  P extends LooseObject = any,
  D extends LooseObject = LooseObject & ForbiddenSceneData,
> = (
  props: P,
  ctx: Scene<never>,
) => {
  /** The node(s) appended to the root element of scene */
  node: string | Node | (string | Node)[];
  /** Data getter to get data from elements */
  data?: () => D;
};
export type { SceneSetup as Component };
type SceneShow<
  P extends LooseObject = any,
  D extends LooseObject = LooseObject & ForbiddenSceneData,
> = (patchProps?: Partial<P>) => Promise<Merge<D, SceneShowInfo>>;
/** @ignore */
export type SceneFunction = SceneSetup | SceneShow;

/**
 * Scene lifecycle and root element event name-value pairs.
 *
 * | name                  | trigger timing                                                                                           |
 * | --------------------- | -------------------------------------------------------------------------------------------------------- |
 * | scene:show            | the scene is shown                                                                                       |
 * | scene:frame           | on each frame when the scene is shown                                                                    |
 * | scene:close           | the scene is closed                                                                                      |
 * | mouse:left            | the left mouse button is pressed                                                                         |
 * | mouse:middle          | the middle mouse button is pressed                                                                       |
 * | mouse:right           | the right mouse button is pressed                                                                        |
 * | mouse:unknown         | an unknown mouse button is pressed                                                                       |
 * | key:\<key\>           | a {@link https://developer.mozilla.org/docs/Web/API/UI_Events/Keyboard_event_key_values key} is pressed  |
 * | \<HTMLElement-event\> | an {@link https://developer.mozilla.org/docs/Web/API/HTMLElement#events html element event} is triggered |
 */
export type SceneEventMap = HTMLElementEventMap & {
  'scene:show': null;
  'scene:frame': { lastFrameTime: number };
  'scene:close': null;
} & {
  [K in `mouse:${'left' | 'middle' | 'right' | 'unknown'}`]: MouseEvent;
} & {
  [K in `key:${string}`]: KeyboardEvent;
};
type SceneEventType = keyof SceneEventMap;

/** Scene options (readonly) */
export type SceneOptions<T extends SceneFunction> = {
  /** Default props used to call setup */
  readonly defaultProps: DeepReadonly<
    T extends SceneSetup<infer P> ? P : LooseObject
  >;
  /** Scene duration in milliseconds */
  readonly duration?: number;
  /** Close the scene on specific {@link SceneEventMap | events} */
  readonly close_on?: SceneEventType | DeepReadonly<SceneEventType[]>;
  /** Whether to log frame times */
  readonly frame_times?: boolean;
};

const buttonTypeMap = ['mouse:left', 'mouse:middle', 'mouse:right'] as const;
/**
 * Provide type infer for generic setup function, do nothing in runtime.
 *
 * @example
 *
 * ```ts
 * const genericSetup = <T>(props: T) => ({
 *   node: h('div'),
 *   data: () => props,
 * });
 * using scene = app.scene(generic(genericSetup), { defaultProps: {} });
 * const data = await scene.show({ text: '' });
 * data.text; // is string
 * ```
 */
const setup2show: {
  <P extends LooseObject, D extends LooseObject & ForbiddenSceneData = {}>(
    f: SceneSetup<P, D>,
  ): SceneShow<P, D>;
} = (f) => f as any;
export { setup2show as generic };

export class Scene<
  T extends SceneFunction,
> extends EventEmitter<SceneEventMap> {
  /** Root element */
  readonly root = h('div', {
    className: 'psytask-scene',
    tabIndex: -1, // support keyboard events
    oncontextmenu: (e) => e.preventDefault(), // prevent context menu
    style: { transform: 'scale(0)' },
  });
  /** Reactive props @see {@link reactive} */
  readonly props: SceneOptions<T>['defaultProps'];
  /** Data getter */
  data?: T extends SceneSetup<infer P, infer D> ? () => D : () => LooseObject;
  /**
   * Show the scene and change props temporarily
   *
   * @example
   *
   * ```ts
   * using scene = app.text('', { defaultProps: { children: 'default' } });
   * await scene.show({ children: 'new' }); // will show `new`
   * await scene.show(); // will show `default`
   * ```
   *
   * @function
   */
  //@ts-ignore
  show: T extends SceneSetup<infer P, infer D> ? SceneShow<P, D> : T =
    this.#show;
  /** Current scene options */
  options: SceneOptions<T>;
  #showPromiseWithResolvers: ReturnType<
    typeof promiseWithResolvers<null>
  > | null = null;
  /**
   * @param app - The {@link App} instance
   * @param setup - The {@link SceneSetup | scene setup function}
   * @param defaultOptions - Default {@link SceneOptions | scene options}
   */
  constructor(
    public readonly app: App,
    setup: T,
    public readonly defaultOptions: SceneOptions<T>,
  ) {
    super();
    this.options = defaultOptions;

    const { node, data, props } = this.use(setup as SceneSetup, {
      ...defaultOptions.defaultProps,
    });
    //@ts-ignore
    this.data = data;
    this.props = props;
    Array.isArray(node) ? this.root.append(...node) : this.root.append(node);

    app.root.appendChild(this.root);
    this.on('cleanup', () => app.root.removeChild(this.root));
  }
  /**
   * Use component
   *
   * @example
   *
   * ```ts
   * using scene = app.scene(
   *   (props: { text: string }, ctx) => {
   *     const stim = ctx.use(TextStim); // use other component
   *     effect(() => {
   *       stim.props.children = 'Current text is: ' + props.text;
   *     });
   *     return {
   *       node: h('div', null, stim.node),
   *       data: () => ({
   *         ...stim.data(),
   *         length: props.text.length,
   *       }),
   *     };
   *   },
   *   { defaultProps: { text: 'default text' } },
   * );
   * ```
   *
   * @param setup Scene setup function
   * @param defaultProps Default props for the scene
   */
  use<T extends SceneSetup>(
    setup: T,
    defaultProps: T extends SceneSetup<infer P> ? P : never,
  ) {
    const props = reactive(defaultProps);
    return { ...(setup(props, this) as ReturnType<T>), props };
  }
  /**
   * Override default options temporarily
   *
   * @example
   *
   * ```ts
   * using scene = app.text('', { duration: 100 });
   * await scene.config({ duration: 200 }).show(); // will show 200ms
   * await scene.show(); // will show 100ms
   * ```
   */
  config(patchOptions: Partial<SceneOptions<T>>) {
    this.options = { ...this.defaultOptions, ...patchOptions };
    return this;
  }
  close() {
    if (!this.#showPromiseWithResolvers) {
      throw new Error("Scene hasn't been shown");
    }
    this.root.style.transform = 'scale(0)';
    this.#showPromiseWithResolvers.resolve(null);
  }
  async #show(patchProps?: Partial<LooseObject>) {
    if (this.#showPromiseWithResolvers) {
      throw new Error('Scene has been shown');
    }
    this.root.focus();
    this.root.style.transform = 'scale(1)';
    this.#showPromiseWithResolvers = promiseWithResolvers();

    const { defaultProps, duration, close_on, frame_times } = this.options;
    Object.assign(this.props, defaultProps, patchProps);
    if (process.env.NODE_ENV === 'development') {
      //@ts-ignore
      window['s'] = this;
    }
    this.emit('scene:show', null);

    // add event listener
    if (typeof close_on !== 'undefined') {
      const close_ons = Array.isArray(close_on) ? close_on : [close_on];
      const close = () => this.close();
      for (const close_on of close_ons) {
        this.on(close_on, close);
        this.once('scene:close', () => this.off(close_on, close));
      }
    }
    const eventTypes = Object.keys(this.listeners) as SceneEventType[];
    const hasSpecialType: [mouse: boolean, key: boolean] = [false, false];
    for (const type of eventTypes) {
      if (!hasSpecialType[0] && type.startsWith('mouse:')) {
        hasSpecialType[0] = true;
        this.once(
          'scene:close',
          on(this.root, 'mousedown', (e) =>
            this.emit(buttonTypeMap[e.button] ?? 'mouse:unknown', e),
          ),
        );
        continue;
      }
      if (!hasSpecialType[1] && type.startsWith('key:')) {
        hasSpecialType[1] = true;
        this.once(
          'scene:close',
          on(this.root, 'keydown', (e) => this.emit(`key:${e.key}`, e)),
        );
        continue;
      }
      if (!type.startsWith('scene:')) {
        this.once(
          'scene:close',
          //@ts-ignore
          on(this.root, type, (e) => this.emit(type, e)),
        );
      }
    }

    // check duration
    const frame_ms = this.app.data.frame_ms;
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

    // render
    /**
     * ## Render logic
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
    let rAFid: number;
    const showInfo = createShowInfo();
    const onFrame = (lastFrameTime: number) => {
      frame_times && showInfo.frame_times.push(lastFrameTime);

      if (
        typeof duration !== 'undefined' &&
        lastFrameTime - showInfo.start_time >= duration - frame_ms * 1.5
      ) {
        this.close();
        return;
      }

      this.emit('scene:frame', { lastFrameTime });
      rAFid = window.requestAnimationFrame(onFrame);
    };
    rAFid = window.requestAnimationFrame((lastFrameTime) => {
      showInfo.start_time = lastFrameTime;
      onFrame(lastFrameTime);
    });

    await this.#showPromiseWithResolvers.promise;

    this.emit('scene:close', null);
    window.cancelAnimationFrame(rAFid);
    this.options = this.defaultOptions;
    this.#showPromiseWithResolvers = null;
    return Object.assign(this.data?.() ?? {}, showInfo);
  }
}
