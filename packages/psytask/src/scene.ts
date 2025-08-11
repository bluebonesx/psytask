import type { DeepReadonly, LooseObject, Merge } from '../types';
import type { App } from './app';
import { reactive, type Reactive } from './reactive';
import { EventEmitter, h, on, promiseWithResolvers } from './util';

const createShowInfo = () => ({ start_time: 0, frame_times: [] as number[] });
type SceneShowInfo = ReturnType<typeof createShowInfo>;
type ForbiddenSceneData = { [K in keyof SceneShowInfo]?: never };

export type SceneSetup<
  P extends LooseObject = any,
  D extends LooseObject = LooseObject & ForbiddenSceneData,
> = (
  props: Reactive<P>,
  ctx: Scene<never>,
) => { node: string | Node | (string | Node)[]; data?: () => D };
type SceneShow<
  P extends LooseObject = any,
  D extends LooseObject = LooseObject & ForbiddenSceneData,
> = (patchProps?: Partial<P>) => Promise<Merge<D, SceneShowInfo>>;
export type SceneFunction = SceneSetup | SceneShow;

type SceneEventMap = HTMLElementEventMap & {
  'scene:show': null;
  'scene:frame': { lastFrameTime: number };
  'scene:close': null;
} & {
  [K in `mouse:${'left' | 'middle' | 'right' | 'unknown'}`]: MouseEvent;
} & {
  [K in `key:${string}`]: KeyboardEvent;
};
type SceneEventType = keyof SceneEventMap;

export type SceneOptions<T extends SceneFunction> = DeepReadonly<{
  defaultProps: T extends SceneSetup<infer P> ? P : LooseObject;
  /** @unit ms */
  duration?: number;
  /** Scene lifecycle and root element events */
  close_on?: SceneEventType | SceneEventType[];
  /** Whether to log frame times */
  frame_times?: boolean;
}>;

const buttonTypeMap = ['mouse:left', 'mouse:middle', 'mouse:right'] as const;
/** Just for type infer, do nothing in runtime. */
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
  /** Show params */
  readonly props: Reactive<SceneOptions<T>['defaultProps']>;
  data?: T extends SceneSetup<infer P, infer D> ? () => D : () => LooseObject;
  //@ts-ignore
  show: T extends SceneSetup<infer P, infer D> ? SceneShow<P, D> : T =
    this.#show;
  private options: SceneOptions<T>;
  #showPromiseWithResolvers: ReturnType<
    typeof promiseWithResolvers<null>
  > | null = null;
  constructor(
    public readonly app: App,
    setup: T,
    public readonly defaultOptions: SceneOptions<T>,
  ) {
    super();
    this.options = defaultOptions;

    const {
      node: element,
      data,
      props,
    } = this.use(setup as SceneSetup, {
      ...defaultOptions.defaultProps,
    });
    //@ts-ignore
    this.data = data;
    this.props = props;
    Array.isArray(element)
      ? this.root.append(...element)
      : this.root.append(element);

    app.root.appendChild(this.root);
    this.on('cleanup', () => app.root.removeChild(this.root));
  }
  use<T extends SceneSetup>(
    setup: T,
    defaultProps: T extends SceneSetup<infer P> ? P : never,
  ) {
    const props = reactive(defaultProps);
    return { ...(setup(props, this) as ReturnType<T>), props };
  }
  config(patchOptions: Partial<SceneOptions<T>>) {
    this.options = { ...this.defaultOptions, ...patchOptions };
    return this;
  }
  close() {
    if (!this.#showPromiseWithResolvers) {
      throw new Error('Scene is not being shown');
    }
    this.root.style.transform = 'scale(0)';
    this.#showPromiseWithResolvers.resolve(null);
  }
  async #show(patchProps?: Partial<LooseObject>) {
    if (this.#showPromiseWithResolvers) {
      throw new Error('Scene is already being shown');
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
