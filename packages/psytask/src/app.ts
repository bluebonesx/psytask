import {
  EventEmitter,
  Scene,
  on,
  type MaybeGenericSceneSetup,
} from '@psytask/core';
import { detect_fps, h, modify, mount, onPageLeave } from 'shared/utils';
import type { Serializable } from '../types';
import { Collector } from './collector';

const createDefaultI18n = () => ({
  leave_alert: "DON'T leave the page.\nLeave count: ",
  unload_alert: 'Leaving the page will discard progress.\nAre you sure?',
});
class App extends EventEmitter<{}> {
  data = { frame_ms: 16.67, leave_count: 0 };
  constructor(
    /** Root element of the app */
    public readonly root: HTMLElement,
    i18n: ReturnType<typeof createDefaultI18n>,
  ) {
    super();

    // check styles
    root.classList.add('psytask-app');
    if (getComputedStyle(root).getPropertyValue('--psytask') === '')
      alert('Please import psytask CSS file');

    // alert on leave
    this.on(
      'dispose',
      onPageLeave(() => alert(i18n.leave_alert + ++this.data.leave_count)),
    )
      // warn before unloading the page, not compatible with IOS
      .on(
        'dispose',
        on(
          window,
          'beforeunload',
          (e) => (e.preventDefault(), (e.returnValue = i18n.unload_alert)),
        ),
      )
      // remove self
      .on('dispose', () => root.remove());
  }
  /**
   * Create data collector
   *
   * @example Basic usage
   *
   * ```ts
   * using dc = await app.collector('data.csv');
   * dc.add({ name: 'Alice', age: 25 });
   * dc.add({ name: 'Bob', age: 30 });
   * ```
   *
   * @example Add listeners
   *
   * ```ts
   * using dc = await app
   *   .collector('data.csv')
   *   .on('add', (row) => {
   *     console.log('add a row', row);
   *   })
   *   .on('chunk', (chunk) => {
   *     console.log('a chunk of raw is ready', chunk);
   *   })
   *   .on('save', (prevent) => {
   *     prevent(); // don't download
   *     // your custom save logic here
   *   });
   * ```
   *
   * @see {@link Collector}
   */
  collector<T extends Serializable>(
    ...e: ConstructorParameters<typeof Collector<T>>
  ) {
    return new Collector<T>(...e).on('add', (row) => modify(row, this.data));
  }
  /**
   * Create a scene
   *
   * @example Creating a text scene
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
   *   defaultProps: () => ({ text: 'default text' }), // default props is required
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
    const scene = new Scene<T>(setup, {
      ...options,
      root: h('div', { oncontextmenu: (e) => e.preventDefault() }),
      frame_ms: this.data.frame_ms,
    });
    mount(scene.root, this.root).dataset.scene = setup.name;
    return scene;
  }
}

/**
 * Create app
 *
 * @example
 *
 * ```ts
 * using app = await createApp();
 * using dc = app.collector();
 * using fixation = app.scene(
 *   (props: {}, ctx) => {
 *     const node = document.createElement('div');
 *     node.textContent = '+';
 *     return { node };
 *   },
 *   {
 *     defaultProps: () => ({}),
 *     duration: 500,
 *   },
 * );
 * ```
 *
 * @see {@link App} {@link App.scene}
 */
export const createApp = async (
  options?: Partial<
    Parameters<typeof detect_fps>[0] & {
      i18n: ReturnType<typeof createDefaultI18n> & {
        leave_alert_on_fps: string;
      };
    }
  >,
) => {
  const root = options?.root ?? h('div');
  if (!root.isConnected) mount(root);

  const i18n = options?.i18n ?? createDefaultI18n();
  const app = new App(root, i18n);

  const panel = mount(h('div'), root);
  app.data.frame_ms = await detect_fps({
    root: panel,
    frames_count: options?.frames_count ?? 60,
    //@ts-ignore
    leave_alert: i18n.leave_alert_on_fps,
  });
  root.innerHTML = '';

  return app;
};
