import {
  createTimer,
  EventEmitter,
  getCurrentScene,
  Scene,
  type MaybeGenericComponent,
  type SceneOptions,
} from '@psytask/core';
import { css } from 'shared/macro' with { type: 'macro' };
import type { LooseObject } from 'shared/types';
import { array_normalize, doc, modify, mount } from 'shared/utils';
import van from 'vanjs-core';
import { Collector } from './collector';
import { adapter, on, onPageLeave } from './utils';

const { div, style } = van.tags;

// import styles
mount(style(), doc.head).textContent = `.psytask-scene{${css({
  all: 'unset',
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
})}}`;

// extend scene
type ExtendedSceneEventMap = HTMLElementEventMap & {
  [K in `mouse:${'left' | 'middle' | 'right' | 'unknown'}`]: MouseEvent;
} & {
  [K in `key:${string}`]: KeyboardEvent;
};
type ExtendedSceneOptions = {
  duration?: number;
  close_on?: keyof ExtendedSceneEventMap | (keyof ExtendedSceneEventMap)[];
};
const mouseSuffixs = ['left', 'middle', 'right'] as const;
const prefix2type: Record<string, keyof HTMLElementEventMap> = {
  key: 'keydown',
  mouse: 'mousedown',
};

export class App<
  T extends { frame_ms: number } = { frame_ms: number },
> extends EventEmitter<{}> {
  constructor(
    /** Root element of the app */
    public readonly root: HTMLElement,
    /** Data will be collected automatically */
    public data: T & LooseObject,
  ) {
    super();
    this.on('dispose', () => root.remove());
  }
  /**
   * Create data collector
   *
   * @example
   *
   * Basic usage
   *
   * ```ts
   * using dc = await app.collector('data.csv');
   * dc.add({ name: 'Alice', age: 25 });
   * dc.add({ name: 'Bob', age: 30 });
   * dc.final(); // get final text
   * dc.download(); // download data.csv
   * ```
   *
   * Add listeners
   *
   * ```ts
   * using dc = await app
   *   .collector('data.csv')
   *   .on('add', (row) => {
   *     console.log('add a row', row);
   *   })
   *   .on('chunk', (chunk) => {
   *     console.log('a chunk of raw is ready', chunk);
   *   });
   * ```
   *
   * @see {@link Collector}
   */
  collector<T extends LooseObject>(
    ...e: ConstructorParameters<typeof Collector<T>>
  ): Collector<T> {
    return new Collector<T>(...e).on('add', (row) => modify(row, this.data));
  }
  /**
   * Create a scene
   *
   * @example
   *
   * Create text scene
   *
   * ```ts
   * const setup = (props: { text: string }, ctx: Scene<any>) => {
   *   const el = document.createElement('div');
   *   ctx.on('scene:show', (props) => {
   *     el.textContent = props.text; // update element
   *   });
   *   return { node: el, data: () => ({ text: el.textContent }) }; // return element and data getter
   * };
   *
   * // create scene by setup function
   * using scene = app.scene(setup, {
   *   defaultProps: { text: 'default text' }, // default props is required
   *   close_on: 'key: ', // close when space is pressed
   *   duration: 100, // auto close after 100ms
   * });
   * // change props.text and show, then get data
   * const data = await scene.show({ text: 'new text' });
   * ```
   *
   * @see {@link Scene}
   */
  scene<T extends MaybeGenericComponent>(
    ...[component, opts]: ConstructorParameters<typeof Scene<T>> extends [
      infer L,
      infer R extends SceneOptions<T>,
    ]
      ? [
          L,
          Pick<R, 'defaultProps'> &
            Partial<Omit<R, 'defaultProps'>> &
            ExtendedSceneOptions,
        ]
      : never
  ) {
    const options = {
      root: mount(
        div({
          class: 'psytask-scene',
          oncontextmenu: (e) => e.preventDefault(),
        }),
        this.root,
      ),
      timer: createTimer(
        opts.duration == null
          ? () => false
          : (records) =>
              records[records.length - 1]! - records[0]! >
              opts.duration! - this.data.frame_ms * 1.5,
      ),
      adapter,
      ...opts,
    };
    const scene = new Scene<T>(component, options);
    const close = () => scene.close();

    return modify(scene, {
      /** Change options one-time */
      config(patchOptions: Partial<ExtendedSceneOptions>) {
        modify(opts, patchOptions);
        return scene.on('scene:close', () => modify(opts, options));
      },
    }).on('scene:show', () => {
      if (typeof opts.close_on === 'undefined') return;
      const close_ons = array_normalize(opts.close_on);
      const close_on_set = new Set(close_ons);

      let hasKeyType = 0,
        hasMouseType = 0;
      const cleanups = close_ons.map((type) => {
        const DOM_type =
          prefix2type[type.split(':', 1)[0]!] ??
          (type as keyof HTMLElementEventMap);
        return DOM_type === 'keydown'
          ? !hasKeyType++ &&
              on(options.root, DOM_type, (e: KeyboardEvent) => {
                (close_on_set.has(DOM_type) ||
                  close_on_set.has(`key:${e.key}`)) &&
                  close();
              })
          : DOM_type === 'mousedown'
            ? !hasMouseType++ &&
              on(options.root, DOM_type, (e: MouseEvent) => {
                (close_on_set.has(DOM_type) ||
                  close_on_set.has(
                    `mouse:${mouseSuffixs[e.button] ?? 'unknown'}`,
                  )) &&
                  close();
              })
            : on(
                options.root,
                //@ts-ignore
                DOM_type,
                close,
              );
      });
      scene.once('scene:close', () => cleanups.map((fn) => fn && fn()));
    });
  }
}

/**
 * Create app
 *
 * @example
 *
 * Basic usage
 *
 * ```ts
 * using app = await createApp();
 * using dc = app.collector();
 * using fixation = app.scene(
 *   (props: {}, ctx) => {
 *     const node = document.createElement('div');
 *     node.textContent = '+';
 *     return node;
 *   },
 *   {
 *     defaultProps: {},
 *     duration: 500,
 *   },
 * );
 * ```
 *
 * @see {@link App} {@link App.scene}
 */
export const createApp = async ({
  root = div(),
  alert_on_leave = true,
  i18n = {
    leave_alert_on_fps: "Please DON'T leave the page during the FPS detection!",
    leave_alert_on_task:
      "Please DON'T leave the page during the task! Attempts: ",
    beforeunload_alert: 'Your progress will be lost. Are you sure?',
  },
  frame_ms,
  frames_count = 60,
}: Partial<{
  /** @default document.createElement('div') */
  root: HTMLElement;
  /** @default true */
  alert_on_leave: boolean;
  i18n: {
    /** Alert after leaving the page during the FPS detection */
    leave_alert_on_fps: string;
    /** Alert after leaving the page during the task */
    leave_alert_on_task: string;
    /** Alert before close or reload the page, not compatible with IOS */
    beforeunload_alert: string;
  };
  /** Frame duration in milliseconds */
  frame_ms: number;
  /** @default 60 */
  frames_count: number;
}> = {}) => {
  if (!root.isConnected) mount(root);
  root.classList.add('psytask-app');

  const { leave_alert_on_fps, leave_alert_on_task, beforeunload_alert } = i18n;
  const app = new App(root, { frame_ms: 16.67, leave_count: 0 });

  // detect fps if not provided
  if (!frame_ms) {
    const { frame_times } = await app
      .scene(
        (p: {}) => {
          let count = 0;
          const ctx = getCurrentScene();
          ctx
            .on('scene:frame', () => {
              const progress = Math.floor((count++ / frames_count) * 100);
              ctx.root.textContent = `Detect FPS ${progress}%`;
              progress === 100 && ctx.emit('dispose').close();
            })
            .on(
              'scene:close',
              onPageLeave(() => (alert(leave_alert_on_fps), history.go())),
            );
          return [];
        },
        { defaultProps: {} },
      )
      .show();
    const frame_ms_arr = frame_times
      .map((t, i, arr) => (i > 0 ? t - arr[i - 1]! : 0))
      .slice(1); // first is 0
    console.info(
      'detected fps',
      // frame_ms_arr,
      (frame_ms = frame_ms_arr.reduce((a, b) => a + b) / frame_ms_arr.length),
    );
  }

  // setup app data
  const cleanups = alert_on_leave
    ? [
        onPageLeave(() => alert(leave_alert_on_task! + ++app.data.leave_count)),
        on(
          window,
          'beforeunload',
          (e) => (e.preventDefault(), (e.returnValue = beforeunload_alert)),
        ),
      ]
    : [];
  return app.on('dispose', () => cleanups.map((fn) => fn()));
};
