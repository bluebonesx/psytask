import type { LooseObject, Merge } from 'shared/types';
import { array_normalize, ERR, rAF } from 'shared/utils';
import { EventEmitter } from './event-emitter';

// timer system
type TimerRecords = number[]; //TODO: use `Float64Array` to optimize memory
export type Timer = {
  start(onFrame: (time: number) => void): Promise<TimerRecords>;
  stop(): void;
};
/**
 * ## Render logic
 *
 * ```text
 * rAF(scene_1.show) -> render -> vsync -> rAF[scene_1.start_time] -> ... ->
 * rAF(scene_2.show) -> ...
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
export const createTimer = (
  shouldStop: (records: TimerRecords) => boolean,
): Timer => {
  let stop = () => {};
  return {
    start: (cb) =>
      new Promise((resolve) => {
        stop = () => (cancelAnimationFrame(handle), resolve(records));
        const records: TimerRecords = [];
        const frame = (time: number) => {
          records.push(time);
          cb(time);
          shouldStop(records) ? stop() : (handle = rAF(frame));
        };
        let handle = rAF(frame);
      }),
    stop,
  };
};

// component system
export type NodeLike = string | Node;
type BuiltinData = {
  start_time: number;
  frame_times: TimerRecords;
};
type ForbiddenData = { [K in keyof BuiltinData]?: never };

/**
 * Component, only called once when the scene is created.
 *
 * @param props - The reactive props to control the scene display
 * @param ctx - The scene instance, can be used to manage lifecycle
 * @see {@link Scene}
 */
export type Component<
  P extends LooseObject = any,
  D extends LooseObject = LooseObject & ForbiddenData,
> = (props: P) =>
  | NodeLike
  | NodeLike[]
  | {
      /** The node(s) appended to the root element of scene */
      node: NodeLike | NodeLike[];
      /** Data getter to get data from elements */
      data: () => D;
    };
type SceneShow<
  P extends LooseObject = any,
  D extends LooseObject = LooseObject & ForbiddenData,
> = (patchProps?: Partial<P>) => Promise<Merge<D, BuiltinData>>;
type GenericComponent<
  P extends LooseObject = any,
  D extends LooseObject = LooseObject & ForbiddenData,
> = SceneShow<P, D>;

/**
 * Provide type infer for generic setup function, do nothing in runtime.
 *
 * @example
 *
 * Support generic scene setup function
 *
 * ```ts
 * using scene = new Scene(
 *   generic(<T>(props: T) => ({ node: [], data: () => props })),
 *   //...
 * );
 * const data = await scene.show({ text: 'hello' });
 * data; // expect: { text: string }
 * ```
 */
export const generic: {
  <P extends LooseObject, D extends LooseObject & ForbiddenData = {}>(
    f: Component<P, D>,
  ): GenericComponent<P, D>;
} = (f) => f as any;
/** @ignore */
export type MaybeGenericComponent = Component | GenericComponent;
export type ComponentAdaptor = {
  /** Define a component with reactive props */
  define: <T extends MaybeGenericComponent>(component: T) => T;
  /** Render a component with default props */
  render: <T extends MaybeGenericComponent>(
    component: T,
    defaultProps: Parameters<T>[0],
  ) => {
    props: Parameters<T>[0];
    nodes: NodeLike[];
    data?: () => LooseObject;
  };
};
export const createComponentAdapter = (
  reactive: <T extends LooseObject>(obj: T) => T,
): ComponentAdaptor => ({
  define:
    (component) =>
    //@ts-ignore
    (props) =>
      component(reactive(props)),
  render: (component, defaultProps) => {
    const props = reactive({ ...defaultProps });
    const instanceOrNode = (component as Component)(props);

    let data: (() => LooseObject) | undefined;
    const nodes = array_normalize(
      typeof instanceOrNode !== 'string' && 'node' in instanceOrNode
        ? ((data = instanceOrNode.data), instanceOrNode.node)
        : instanceOrNode,
    );
    return { props, nodes, data };
  },
});

// event system
/**
 * Lifecycle hooks.
 *
 * | name        | trigger timing                        |
 * | ----------- | ------------------------------------- |
 * | scene:show  | the scene is shown                    |
 * | scene:frame | on each frame when the scene is shown |
 * | scene:close | the scene is closed                   |
 */
export interface SceneEventMap {
  'scene:show': void;
  'scene:frame': number;
  'scene:close': void;
}

let currentScene: Scene<any> | null = null;
export const getCurrentScene = () =>
  currentScene != null ? currentScene : ERR('No active scene');

/** Scene options */
export type SceneOptions<T extends MaybeGenericComponent> = {
  /** Root element */
  root: HTMLDivElement;
  /** Default props */
  defaultProps: Parameters<T>[0];
  /** Control show timing */
  timer: Timer;
  /** Component adaptor */
  adapter: ComponentAdaptor;
};
export class Scene<
  T extends MaybeGenericComponent,
> extends EventEmitter<SceneEventMap> {
  readonly root: HTMLDivElement;
  #props: Parameters<T>[0];
  #data?: () => LooseObject;
  /**
   * Show DOM and update props one-time
   *
   * @example
   *
   * Basic usage
   *
   * ```ts
   * using scene = new Scene(
   *   (props: { text: string }, ctx) => {
   *     const node = document.createElement('div');
   *     ctx.on('scene:show', (newProps) => {
   *       node.textContent = newProps.text;
   *     });
   *     return node;
   *   },
   *   {
   *     //...
   *     defaultProps: { text: 'default' },
   *   },
   * );
   * await scene.show({ text: 'new' }); // show `new`
   * await scene.show(); // show `default`
   * ```
   *
   * @function
   */
  //@ts-ignore
  show: T extends Component<infer P, infer D> ? SceneShow<P, D> : T =
    this.#show;

  /**
   * @param component - The {@link Component scene setup function}
   * @param options - Default {@link SceneOptions scene options}
   */
  constructor(
    component: T,
    public readonly options: SceneOptions<T>,
  ) {
    super();
    const { root, adapter: adaptor, defaultProps } = options;
    (this.root = root).tabIndex = -1; // support keyboard events
    root.style.transform = 'scale(0)';

    currentScene = this.on('dispose', () => root.remove());
    const { props, nodes, data } = adaptor.render(component, defaultProps);
    currentScene = null;

    this.#props = props;
    this.#data = data;
    root.append(...nodes);
  }
  /** Add a microtask to close the scene. It is useful when close in 'scene:show' */
  async close() {
    await 0;
    this.options.timer.stop();
  }
  async #show(patchProps?: Partial<LooseObject>) {
    const { root, timer, defaultProps } = this.options;

    Object.assign(this.#props, defaultProps, patchProps); // WARN: may modify defaultProps
    this.emit('scene:show');
    root.style.transform = 'scale(1)';
    root.focus();

    const records = await timer.start((time) => this.emit('scene:frame', time));

    root.style.transform = 'scale(0)';
    return {
      ...this.emit('scene:close').#data?.(),
      start_time: records[0]!,
      frame_times: records,
    } satisfies BuiltinData;
  }
}
