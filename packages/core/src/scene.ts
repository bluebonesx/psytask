import { isArray, on, rAF } from 'shared/utils';
import type { LooseObject } from '../types';
import { EventEmitter } from './event-emitter';

type Merge<T, U> = Omit<T, Extract<keyof T, keyof U>> & U;

const createShowInfo = () => ({ start_time: 0, frame_times: [] as number[] });
type SceneShowInfo = ReturnType<typeof createShowInfo>;
type ForbiddenSceneData = { [K in keyof SceneShowInfo]?: never };

export type SceneTimerCreator = (options: {
  frame_ms: number;
  duration?: number;
  onStart?: (time: number) => void;
  onFrame?: (time: number) => void;
}) => { promise: Promise<void>; close: () => void };
/**
 * ## Render logic
 *
 * ```text
 * rAF(scene_1.show) -> render -> vsync -> rAF[scene_1.start_time] -> ... ->
 * rAF(scene_2.show) -> render -> vsync -> rAF[scene_2.start_time] -> ...
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
const createRAFTimer: SceneTimerCreator = (opts) => {
  let start_time: number, close: () => void;

  const frame = (last_time: number) => (
    opts.onFrame?.(last_time),
    typeof opts.duration === 'number' &&
    last_time - start_time >= opts.duration - opts.frame_ms * 1.5
      ? close()
      : (handle = rAF(frame))
  );
  let handle = rAF(
    (last_time) => (opts.onStart?.(last_time), frame((start_time = last_time))),
  );

  return {
    promise: new Promise<void>(
      (resolve) => (close = () => (cancelAnimationFrame(handle), resolve())),
    ),
    //@ts-ignore
    close,
  };
};

/**
 * Scene setup function, only called once when the scene is created.
 *
 * @param props - The reactive props to control the scene display
 * @param ctx - The scene instance, can be used to manage lifecycle
 * @see {@link Scene}
 */
export type SceneSetup<
  P extends LooseObject = any,
  D extends LooseObject = LooseObject & ForbiddenSceneData,
> = (
  props: P,
  ctx: Scene<any>,
) => {
  /** The node(s) appended to the root element of scene */
  node: string | Node | (string | Node)[];
  /** Data getter to get data from elements */
  data?: () => D;
};
type SceneShow<
  P extends LooseObject = any,
  D extends LooseObject = LooseObject & ForbiddenSceneData,
> = (patchProps?: Partial<P>) => Promise<Merge<D, SceneShowInfo>>;
type GenericSceneSetup<
  P extends LooseObject = any,
  D extends LooseObject = LooseObject & ForbiddenSceneData,
> = SceneShow<P, D>;

/**
 * Provide type infer for generic setup function, do nothing in runtime.
 *
 * @example
 *
 * ```ts
 * using scene = new Scene(
 *   generic(<T>(props: T) => ({
 *     node: [],
 *     data: () => props,
 *   })),
 *   //...
 * );
 * const data = await scene.show({ text: 'hello' });
 * data.text; // type: string
 * ```
 */
export const generic: {
  <P extends LooseObject, D extends LooseObject & ForbiddenSceneData = {}>(
    f: SceneSetup<P, D>,
  ): GenericSceneSetup<P, D>;
} = (f) => f as any;
/** @ignore */
export type MaybeGenericSceneSetup = SceneSetup | GenericSceneSetup;

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
 * | \<HTMLElement-Event\> | an {@link https://developer.mozilla.org/docs/Web/API/HTMLElement#events html element event} is triggered |
 */
export type SceneEventMap = HTMLElementEventMap & {
  'scene:show': LooseObject;
  'scene:frame': number;
  'scene:close': null;
} & {
  [K in `mouse:${'left' | 'middle' | 'right' | 'unknown'}`]: MouseEvent;
} & {
  [K in `key:${string}`]: KeyboardEvent;
};
type SceneEventType = keyof SceneEventMap;

/** Scene options (readonly) */
export type SceneOptions<T extends MaybeGenericSceneSetup> = {
  /** The root element to append the scene element, default to document.body */
  readonly root: HTMLDivElement;
  /** Frame duration in milliseconds, default to detect device refresh rate */
  readonly frame_ms: number;
  /** Default props getter */
  readonly defaultProps: () => Required<Parameters<T>[0]>;
  /** Scene duration in milliseconds */
  readonly duration?: number;
  /** Close the scene on specific {@link SceneEventMap | events} */
  readonly close_on?: SceneEventType | SceneEventType[];
  /** Whether to record frame times */
  readonly record_frame_times?: boolean;
  /** Control scene display timing */
  readonly createTimer?: SceneTimerCreator;
};

const buttonTypeMap = ['mouse:left', 'mouse:middle', 'mouse:right'] as const;

export class Scene<
  T extends MaybeGenericSceneSetup,
> extends EventEmitter<SceneEventMap> {
  /** Root element */
  readonly root: HTMLDivElement;
  #data?: () => LooseObject;
  /**
   * Show the scene and change props one-time
   *
   * @example
   *
   * ```ts
   * using scene = new Scene(
   *   (props: { text: string }, ctx) => {
   *     const node = document.createElement('div');
   *     ctx.on('scene:show', ({ newProps }) => {
   *       node.textContent = newProps.text;
   *     });
   *     return { node };
   *   },
   *   {
   *     //...
   *     defaultProps: () => ({ text: 'default' }),
   *   },
   * );
   * await scene.show({ text: 'new' }); // show `new`
   * await scene.show(); // show `default`
   * ```
   *
   * @function
   */
  //@ts-ignore
  show: T extends SceneSetup<infer P, infer D> ? SceneShow<P, D> : T =
    this.#show;
  //@ts-ignore
  #options: SceneOptions<T>;
  #defaultOptions: SceneOptions<T>;
  #timer?: ReturnType<SceneTimerCreator>;
  /**
   * @param setup - The {@link SceneSetup scene setup function}
   * @param defaultOptions - Default {@link SceneOptions scene options}
   */
  constructor(setup: T, defaultOptions: SceneOptions<T>) {
    super();
    const { root, defaultProps } = (this.#defaultOptions = defaultOptions);
    (this.root = root).tabIndex = -1; // support keyboard events

    const reset = () => {
      root.style.transform = 'scale(0)';
      this.#options = defaultOptions;
      this.#timer = void 0;
    };
    reset();
    this.on('scene:close', reset).on('dispose', () => root.remove());

    const { node, data } = (setup as SceneSetup)(defaultProps(), this);
    root.append(...(isArray(node) ? node : [node]));
    this.#data = data;
  }
  /**
   * Override default options one-time
   *
   * @example
   *
   * ```ts
   * using scene = new Scene(() => ({ node: [] }), {
   *   root: document.body,
   *   frame_ms: 16.67,
   *   defaultProps: () => ({}),
   *   duration: 100,
   * });
   * await scene.config({ duration: 200 }).show(); // show 200ms
   * await scene.show(); // show 100ms
   * ```
   */
  config(patchOptions: {
    [K in {
      [K in keyof SceneOptions<T>]-?: undefined extends SceneOptions<T>[K]
        ? K
        : never;
    }[keyof SceneOptions<T>]]?: SceneOptions<T>[K];
  }) {
    this.#options = { ...this.#defaultOptions, ...patchOptions };
    return this;
  }
  close() {
    this.#timer?.close();
  }
  async #show(patchProps?: Partial<LooseObject>) {
    if (this.#timer) throw new Error('Scene is showing');
    const {
      root,
      frame_ms,
      createTimer = createRAFTimer,
      defaultProps,
      duration,
      close_on,
      record_frame_times,
    } = this.#options;

    this.emit('scene:show', { ...defaultProps(), ...patchProps });
    root.style.transform = 'scale(1)';
    root.focus();

    // use event listener
    if (typeof close_on !== 'undefined') {
      const close = () => this.close();
      (isArray(close_on) ? close_on : [close_on]).map((type) =>
        this.on(type, close).once('scene:close', () => this.off(type, close)),
      );
    }
    let hasMouseType = 0,
      hasKeyType = 0;
    const cleanups = (Object.keys(this.listeners) as SceneEventType[]).map(
      (type) => {
        const prefix = type.split(':', 1)[0];
        if (!hasKeyType++ && prefix === 'key')
          return on(root, 'keydown', (e) => this.emit(`key:${e.key}`, e));
        if (!hasMouseType++ && prefix === 'mouse')
          return on(root, 'mousedown', (e) =>
            this.emit(buttonTypeMap[e.button] ?? 'mouse:unknown', e),
          );
        if (prefix !== 'scene')
          //@ts-ignore
          return on(root, type, (e) => this.emit(type, e));
      },
    );
    this.once('scene:close', () => cleanups.map((f) => f?.()));

    // check duration
    if (
      process.env.NODE_ENV === 'development' &&
      typeof duration === 'number'
    ) {
      const theoretical_duration = Math.round(duration / frame_ms) * frame_ms;
      const error = theoretical_duration - duration;
      if (Math.abs(error) >= 1) {
        console.warn(
          `Scene duration is not a multiple of frame_ms.
Theoretical duration is ${theoretical_duration} ms, but got ${duration} ms (error: ${error} ms)`,
        );
      }
    }

    // use timer
    const showInfo = createShowInfo();
    await (this.#timer = createTimer({
      frame_ms,
      duration,
      onStart: (time) => (showInfo.start_time = time),
      onFrame: (time) => {
        record_frame_times && showInfo.frame_times.push(time);
        this.emit('scene:frame', time);
      },
    })).promise;

    return { ...this.emit('scene:close', null).#data?.(), ...showInfo };
  }
}
