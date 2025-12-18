import type { LooseObject, Merge } from 'shared/types';
import { array_normalize, ERR, rAF } from 'shared/utils';
import { EventEmitter } from './event-emitter';

// timer system
export type TimerRecords = number[]; //TODO: use `Float64Array` to optimize memory
export type Timer = {
  start(onFrame?: (records: TimerRecords) => void): Promise<TimerRecords>;
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
export const createTimer = (shouldStop: (records: TimerRecords) => boolean) => {
  const timer: Timer = {
    start: (cb) =>
      new Promise((resolve) => {
        timer.stop = () => (cancelAnimationFrame(handle), resolve(records));
        const records: number[] = [];
        const frame = (time: number) => {
          records.push(time);
          cb?.(records);
          shouldStop(records) ? timer.stop() : (handle = rAF(frame));
        };
        let handle = rAF(frame);
      }),
    stop() {},
  };
  return timer;
};

// component system
export type NodeLike = string | Node;
type BuiltinData = { frame_times: TimerRecords };
type ForbiddenData = { [K in keyof BuiltinData]?: never };

/**
 * Only called once when the scene is created.
 *
 * @param props - The reactive props to control the scene display
 * @see {@link Scene}
 */
export type Component<
  //eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required for disable contravariance
  P extends LooseObject = any,
  D extends LooseObject = LooseObject & ForbiddenData,
> = {
  (props: P):
    | NodeLike
    | NodeLike[]
    | {
        /** The node(s) appended to the root element of scene */
        node: NodeLike | NodeLike[];
        /** Data getter to get data from elements */
        data: () => D;
      };
};

type SceneShow<
  P extends LooseObject = LooseObject,
  D extends LooseObject = LooseObject & ForbiddenData,
> = (patchProps?: Partial<P>) => Promise<Merge<D, BuiltinData>>;
/** Same with {@link SceneShow} */
type GenericComponent<
  P extends LooseObject = LooseObject,
  D extends LooseObject = LooseObject & ForbiddenData,
> = SceneShow<P, D>;
/**
 * Provide type infer for generic component, do nothing in runtime.
 *
 * @example
 *
 * Support generic component
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
} = (f) =>
  //@ts-expect-error impl generic component
  f;
/** @ignore */
export type MaybeGenericComponent<
  //eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required for disable contravariance
  P extends LooseObject = any,
  D extends LooseObject & ForbiddenData = {},
> = Component<P, D> | GenericComponent<P, D>;

export type ComponentAdapter = {
  /** Wrap a component with reactive props */
  wrap: <T extends Component>(component: T) => T;
  /** Render a component with default props and provided scene */
  render: <T extends Component>(
    component: T,
    defaultProps: Parameters<T>[0],
    /** If not provided, it will use current scene */
    ctx?: Scene<Component>,
  ) => {
    props: Parameters<T>[0];
  } & (ReturnType<T> extends infer R
    ? R extends { node: infer N; data: infer D }
      ? { nodes: N extends NodeLike ? [N] : N; data: D }
      : { nodes: R extends NodeLike ? [R] : R; data: undefined }
    : never);
};
export const createComponentAdapter = (
  reactive: <T extends LooseObject>(obj: T) => T,
): ComponentAdapter => ({
  wrap: (component) =>
    ((props) => component(reactive(props))) as typeof component,
  render: (component, defaultProps, ctx) => {
    const props = reactive(defaultProps);

    ctx && sceneStack.push(ctx);
    const instanceOrNode = (component as Component)(props);
    ctx && sceneStack.pop();

    let data: (() => LooseObject) | undefined;
    const nodes = array_normalize(
      typeof instanceOrNode !== 'string' && 'node' in instanceOrNode
        ? ((data = instanceOrNode.data), instanceOrNode.node)
        : instanceOrNode,
    );
    return { props, nodes, data } as ReturnType<ComponentAdapter['render']>;
  },
});

// event system
/**
 * Lifecycle hooks.
 *
 * | name  | trigger timing                        |
 * | ----- | ------------------------------------- |
 * | show  | the scene is shown                    |
 * | frame | on each frame when the scene is shown |
 * | close | the scene is closed                   |
 */
export type SceneEventMap = {
  show: undefined;
  frame: number;
  close: undefined;
};

const sceneStack: Scene<MaybeGenericComponent>[] = [];
/**
 * @example
 *
 * Must be called on the top scope of component
 *
 * ```ts
 * const Component = (props: {}) => {
 *   const ctx = getCurrentScene();
 *   return '';
 * };
 * ```
 *
 * DO NOT call on other place
 *
 * ```ts
 * const Component = (props: {}) => {
 *   const fn = () => {
 *     const ctx = getCurrentScene(); // WRONG!
 *   };
 *   return '';
 * };
 * ```
 */
export const getCurrentScene = () =>
  sceneStack[sceneStack.length - 1] ?? ERR('Not found current scene');

/** Scene options */
export type SceneOptions<T extends MaybeGenericComponent> = {
  /** Root element */
  root: HTMLDivElement;
  /** Default props */
  defaultProps: Parameters<T>[0];
  /** Control show timing */
  timer: () => Timer;
  /** Component adapter */
  adapter: ComponentAdapter;
};
export class Scene<
  T extends MaybeGenericComponent,
> extends EventEmitter<SceneEventMap> {
  readonly root: HTMLDivElement;
  readonly #timer: Timer;
  readonly #props: LooseObject;
  readonly data: T extends MaybeGenericComponent<infer P, infer D>
    ? () => D
    : undefined;
  /**
   * Show DOM and update props one-time
   *
   * @example
   *
   * Integrate with `@vue/reactivity`
   *
   * ```ts
   * import { reactive, effect } from '@vue/reactivity';
   *
   * using scene = new Scene(
   *   (props: { text: string }) => {
   *     const node = document.createElement('div');
   *     effect(() => {
   *       node.textContent = props.text; // auto update when props.text changes
   *     });
   *     return node;
   *   },
   *   {
   *     root: document.createElement('div'),
   *     defaultProps: { text: 'default' },
   *     adapter: createComponentAdapter(reactive),
   *     timer: () => createTimer((records) => records.length > 100), // show 100 frames
   *   },
   * );
   * document.body.appendChild(scene.root);
   *
   * await scene.show({ text: 'new' }); // show `new`
   * await scene.show(); // show `default`
   * ```
   *
   * @function
   */
  //@ts-expect-error impl generic component
  show: T extends Component<infer P, infer D> ? SceneShow<P, D> : T =
    this.#show;

  /**
   * @param component - {@link Component}
   * @param options - {@link SceneOptions}
   */
  constructor(
    component: T,
    public readonly options: SceneOptions<T>,
  ) {
    super();
    const { root, adapter, defaultProps, timer } = options;
    (this.root = root).tabIndex = -1; // support keyboard events
    root.style.scale = '0';

    const { props, nodes, data } = adapter.render(
      component as Component,
      { ...defaultProps },
      this.on('dispose', () => root.remove()),
    );
    this.#timer = timer(); // create timer instance

    //@ts-expect-error impl generic component
    ((this.#props = props), (this.data = data));
    root.append(...nodes);
  }
  /** Add a microtask to close the scene. It is useful when close in 'show' */
  async close() {
    await 0;
    this.#timer.stop();
  }
  async #show(patchProps?: Partial<LooseObject>) {
    const { root, defaultProps } = this.options;

    // modify props
    const newProps = { ...defaultProps, ...patchProps };
    for (const key of Object.keys({ ...this.#props, ...newProps }))
      this.#props[key] = newProps[key];

    // show
    this.emit('show');
    root.style.scale = '1';
    root.focus();

    // wait timer
    const records = await this.#timer.start((records) =>
      this.emit('frame', records[records.length - 1]!),
    );

    // close
    root.style.scale = '0';
    return {
      ...this.emit('close').data?.(),
      frame_times: records,
    } satisfies BuiltinData;
  }
}
