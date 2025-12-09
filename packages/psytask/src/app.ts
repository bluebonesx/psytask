import {
  createTimer,
  EventEmitter,
  Scene,
  type MaybeGenericComponent,
  type SceneOptions,
} from '@psytask/core';
import type { LooseObject } from 'shared/types';
import { $Object, array_normalize, doc, modify, mount } from 'shared/utils';
import { Collector } from './collector';
import { adapter, css, detectFPS, div, on, onPageLeave, style } from './utils';

// import styles
mount(
  style(
    `.psytask-scene{${css({
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
    })}}`,
  ),
  doc.head,
);

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
const prefix2type: Record<string, keyof HTMLElementEventMap> = {
  key: 'keydown',
  mouse: 'mousedown',
};

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
   * const Component = (props: { text: string }, ctx: Scene<any>) => {
   *   const el = document.createElement('div');
   *   ctx.on('show', (props) => {
   *     el.textContent = props.text; // update element
   *   });
   *   return { node: el, data: () => ({ text: el.textContent }) }; // return element and data getter
   * };
   *
   * // create scene
   * using scene = app.scene(Component, {
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
    const timer_condition: Parameters<typeof createTimer>[0] = (records) =>
      opts.duration != null &&
      records[records.length - 1]! - records[0]! >
        opts.duration! - this.data.frame_ms * 1.5;
    const options = {
      root: mount(
        div({
          class: 'psytask-scene',
          oncontextmenu: (e) => e.preventDefault(),
        }),
        this.root,
      ),
      timer: () => createTimer(timer_condition),
      adapter,
      ...opts,
    };
    const scene = new Scene<T>(component, options);
    const close = () => scene.close();

    return modify(
      scene.on('close', () =>
        $Object.keys(opts).map(
          //@ts-ignore
          (key) => (opts[key] = options[key]),
        ),
      ),
      {
        /** Change options one-time */
        config(patchOptions: Partial<ExtendedSceneOptions>) {
          modify(opts, patchOptions);
          return scene;
        },
      },
    ).on('show', () => {
      // use close_on listeners
      if (opts.close_on == null) return;
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
  root = mount(div()),
  alert_on_leave = true,
  i18n = {
    leave_alert_on_fps: "Please DON'T leave the page during the FPS detection!",
    leave_alert_on_task: "Please DON'T leave the page during the task!",
    beforeunload_alert: 'Your progress will be lost. Are you sure?',
  },
  frames_count = 10,
  frame_calcer = (durations) => {
    const sorted = [...durations].sort((a, b) => a - b);
    const Q1_idx = sorted.length / 4;
    const Q1 = sorted[Math.floor(Q1_idx)]!;
    const Q3 = sorted[Math.floor(Q1_idx * 3)]!;
    const valid_durations = durations.filter((d) => Q1 <= d && d <= Q3);
    const frame_ms =
      valid_durations.reduce((a, b) => a + b) / valid_durations.length;

    console.info('Detect fps', frame_ms, {
      durations,
      Q1,
      Q3,
      valid_durations,
    });
    return frame_ms;
  },
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
  /** @default 10 */
  frames_count: number;
  frame_calcer: (durations: number[]) => number;
}> = {}) => {
  const data = {
    // detect fps
    frame_ms: frame_calcer(
      await detectFPS({
        root,
        leave_alert: i18n.leave_alert_on_fps,
        frames_count,
      }),
    ),
    leave_count: 0,
  };

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
