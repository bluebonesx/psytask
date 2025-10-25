import {
  EventEmitter,
  on,
  Scene,
  type MaybeGenericSceneSetup,
} from '@psytask/core';
import type { LooseObject } from 'shared/types';
import { doc, ERR, h, modify, mount } from 'shared/utils';
import { Collector } from './collector';
import { onPageLeave } from './utils';

// import styles
mount(h('style'), doc.head).textContent =
  '.psytask-app>.scene{all:unset;position:fixed;inset:0;overflow:hidden;will-change:transform;user-select:none}';

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
  ) {
    const dc = new Collector<T>(...e)
      .on('add', (row) => modify(row, this.data))
      .on(
        'dispose',
        // backup when the page is hidden
        onPageLeave(() => dc.download(`.${Date.now()}.bak`)),
      );
    return dc;
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
  scene<T extends MaybeGenericSceneSetup>(
    ...[setup, options]: ConstructorParameters<typeof Scene<T>> extends [
      infer L,
      infer R,
    ]
      ? [L, Omit<R, 'root' | 'frame_ms'>]
      : never
  ) {
    return new Scene<T>(setup, {
      ...options,
      root: mount(
        h('div', {
          className: 'scene',
          oncontextmenu: (e) => e.preventDefault(),
        }),
        this.root,
      ),
      frame_ms: this.data.frame_ms,
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
  root = h('div'),
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
  root === doc.body && ERR('Cannot use document.body as app root');
  if (!root.isConnected) mount(root);
  root.classList.add('psytask-app');

  const { leave_alert_on_fps, leave_alert_on_task, beforeunload_alert } = i18n;

  // detect fps if not provided
  if (!frame_ms) {
    const { frame_times } = await new Scene(
      (p: { count: number; leave_alert: string }, ctx) => {
        let count = 0;
        ctx
          .on('scene:frame', () => {
            const progress = Math.floor((count++ / p.count) * 100);
            ctx.root.textContent = `Detect FPS ${progress}%`;
            progress === 100 && ctx.emit('dispose', null).close();
          })
          .on(
            'scene:close',
            onPageLeave(() => (alert(p.leave_alert), history.go())),
          );
        return [];
      },
      {
        root: mount(
          h('div', {
            className: 'scene',
            style: 'text-align:center;line-height:100dvh;',
          }),
          root,
        ),
        frame_ms: 16.67,
        defaultProps: {
          count: frames_count,
          leave_alert: leave_alert_on_fps,
        },
        record_frame_times: true,
      },
    ).show();
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
  const data = { frame_ms, leave_count: 0 };
  const cleanups = alert_on_leave
    ? [
        onPageLeave(() => alert(leave_alert_on_task! + ++data.leave_count)),
        on(
          window,
          'beforeunload',
          (e) => (e.preventDefault(), (e.returnValue = beforeunload_alert)),
        ),
      ]
    : [];
  return new App(root, data).on('dispose', () => cleanups.map((fn) => fn()));
};
