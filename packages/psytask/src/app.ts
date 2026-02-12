/// <reference types='shared/env' />
import {
  createComponentAdapter,
  createTimer,
  EventEmitter,
  Scene,
  type MaybeGenericComponent,
  type SceneOptions,
} from '@psytask/core';
import type { LooseObject } from 'shared/types';
import { $Object, array_normalize, doc, modify, mount } from 'shared/utils';
import { Collector } from './collector';
import { css, detectFPS, div, on, onPageLeave, style } from './utils';

// import styles
mount(style(), doc.head).innerText = `.psytask-scene{${css({
  all: 'unset',
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
})}}.psytask-center{${css({
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'center',
  'justify-content': 'center',
  'white-space': 'pre-wrap',
  height: '100%',
})}}`;

// extend scene
export type CloseEventMap = HTMLElementEventMap & {
  [K in `mouse:${'left' | 'middle' | 'right' | 'unknown'}`]: MouseEvent;
} & {
  [K in `key:${string}`]: KeyboardEvent;
};
type ExtendedSceneOptions = {
  duration?: number;
  close_on?: keyof CloseEventMap | (keyof CloseEventMap)[];
};
const mouseSuffixs = ['left', 'middle', 'right'] as const;
const prefix2type = {
  key: 'keydown',
  mouse: 'mousedown',
} satisfies Record<string, keyof HTMLElementEventMap>;
const defaultAdapter = createComponentAdapter((e) => e);

export class App<
  T extends { frame_ms: number } = { frame_ms: number },
> extends EventEmitter {
  constructor(
    /** Root element of the app */
    public readonly root: HTMLElement,
    /** Data will be collected automatically */
    public readonly data: T & LooseObject,
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
   * const Component = (props: { text: string }) => {
   *   const el = document.createElement('div');
   *   const ctx = getCurrentScene();
   *   ctx.on('show', () => {
   *     el.textContent = props.text; // update element
   *   });
   *   return {
   *     node: el,
   *     data: () => ({ text: el.textContent }),
   *   };
   * };
   *
   * using scene = app.scene(Component, {
   *   adapter: createComponentAdapter((e) => e),
   *   defaultProps: { text: 'default text' }, // default props is required
   *   close_on: 'click',
   *   duration: 100,
   * });
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
    const root = opts.root ?? div();
    root.classList.add('psytask-scene');
    root.oncontextmenu = (e) => e.preventDefault();

    const timer_condition: Parameters<typeof createTimer>[0] = (
      cur_frame_time,
      records,
    ) =>
      opts.duration != null &&
      cur_frame_time - records[0]! >= opts.duration - this.data.frame_ms / 2;

    const options = {
      adapter: defaultAdapter,
      timer: () => createTimer(timer_condition),
      ...opts,
      root: mount(root, this.root),
    };
    const scene = new Scene<T>(component, options).on('close', () =>
      $Object.keys(opts).map((key) => (opts[key] = options[key])),
    );

    const close = () => scene.close();
    return modify(scene, {
      /**
       * Change options one-time
       *
       * @example
       *
       * Show with new options
       *
       * ```ts
       * await scene.config({ duration: 1e2 }).show();
       * await scene.config({ close_on: 'click' }).show();
       * ```
       */
      config(patchOptions: Partial<ExtendedSceneOptions>) {
        modify(opts, patchOptions);
        return scene;
      },
    }).on('show', () => {
      // use close_on listeners
      if (opts.close_on == null) return;
      const close_ons = array_normalize(opts.close_on);
      const close_on_set = new Set(close_ons);

      let hasKeyType = 0,
        hasMouseType = 0;
      const cleanups = close_ons.map((type: (typeof close_ons)[0]) => {
        type SafeKeys = keyof typeof prefix2type;
        const DOM_type = (prefix2type[type.split(':')[0] as SafeKeys] ??
          type) as
          | (typeof prefix2type)[SafeKeys]
          | Exclude<typeof type, `${SafeKeys}:${string}`>;
        return DOM_type === 'keydown'
          ? !hasKeyType++ &&
              on(options.root, DOM_type, (e) => {
                (close_on_set.has(DOM_type) ||
                  close_on_set.has(`key:${e.key}`)) &&
                  close();
              })
          : DOM_type === 'mousedown'
            ? !hasMouseType++ &&
              on(options.root, DOM_type, (e) => {
                (close_on_set.has(DOM_type) ||
                  close_on_set.has(
                    `mouse:${mouseSuffixs[e.button] ?? 'unknown'}`,
                  )) &&
                  close();
              })
            : on(
                options.root,
                DOM_type as Exclude<
                  keyof HTMLElementEventMap,
                  | 'compositionend'
                  | 'compositionstart'
                  | 'compositionupdate'
                  | 'focusin'
                  | 'focusout'
                >,
                close,
              );
      });
      scene.once('close', () => cleanups.map((fn) => fn && fn()));
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
 *   (props: {}) => {
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
  root = mount(div()),
  alert_on_leave = true,
  i18n = {
    leave_alert_on_fps: "Please DON'T leave the page during the FPS detection!",
    leave_alert_on_task: "Please DON'T leave the page during the task!",
    beforeunload_alert: 'Your progress will be lost. Are you sure?',
  },
  frame_count = 30,
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
  /** @default 30 */
  frame_count: number;
}> = {}) => {
  // detect fps
  const durations = await detectFPS({
    root,
    leave_alert: i18n.leave_alert_on_fps,
    frame_count,
  });
  const sorted = [...durations].sort((a, b) => a - b);
  const Q1_idx = sorted.length / 4,
    Q1 = sorted[Math.floor(Q1_idx)]!,
    Q3 = sorted[Math.floor(Q1_idx * 3)]!,
    IQR = Q3 - Q1,
    lower = Q1 - 1.5 * IQR,
    upper = Q3 + 1.5 * IQR;
  const valid_durations = durations.filter((d) => lower <= d && d <= upper);
  const frame_ms =
    valid_durations.reduce((a, b) => a + b) / valid_durations.length;
  console.info('Detect fps', frame_ms, {
    durations,
    Q1,
    Q3,
    IQR,
    lower,
    upper,
    valid_durations,
  });

  const data = { frame_ms, leave_count: 0 };

  // event listeners
  const cleanups = [
    onPageLeave(
      () => (
        ++data.leave_count,
        alert_on_leave && alert(i18n.leave_alert_on_task)
      ),
    ),
    on(
      window,
      'beforeunload',
      (e) =>
        alert_on_leave &&
        (e.preventDefault(), (e.returnValue = i18n.beforeunload_alert)),
    ),
  ];
  return new App(root, data).on('dispose', () => cleanups.map((f) => f()));
};
