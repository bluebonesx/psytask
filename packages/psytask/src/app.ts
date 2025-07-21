import { type PluginInfo, type TrialType } from 'jspsych';
import { createSceneByJsPsychPlugin } from './jspsych';
import { Scene, type SceneOptions } from './scene';
import { detectEnvironment, DisposableClass, h } from './util';

export class App extends DisposableClass {
  constructor(
    /** Root element of the app */
    public root: Element,
    /** Detected environment data */
    public data: Awaited<ReturnType<typeof detectEnvironment>>,
  ) {
    super();

    // check styles
    if (
      window
        .getComputedStyle(document.documentElement)
        .getPropertyValue('--psytask') === ''
    ) {
      // TODO: auto import psytask CSS file
      throw new Error('Please import psytask CSS file in your HTML file');
    }

    // add event listeners
    this.useEventListener(window, 'beforeunload', (e) => {
      // warn before unloading the page, not compatible with IOS
      e.preventDefault();
      return (e.returnValue =
        'Leaving the page will discard progress. Are you sure?');
    });
    this.useEventListener(document, 'visibilitychange', () => {
      // alert when the page is hidden
      if (document.visibilityState === 'hidden') {
        alert(
          'Please keep the page visible on the screen during the task running',
        );
      }
    });
  }
  /** Create a scene */
  scene<P extends unknown[]>(
    ...e: ConstructorParameters<typeof Scene<P>> extends [infer L, ...infer R]
      ? R
      : never
  ) {
    const scene = new Scene(this, ...e);
    scene.root.classList.add('psytask-scene');
    this.root.appendChild(scene.root);
    return scene;
  }
  /** Shortcut to create a text scene */
  text(text: string, options?: SceneOptions) {
    return this.scene(function (self) {
      const el = h('p', { textContent: text });
      self.root.appendChild(
        h('div', { style: { textAlign: 'center', lineHeight: '100dvh' } }, el),
      );
      return (
        props?: Partial<{ text: string; size: string; color: string }>,
      ) => {
        const p = { ...props };
        if (p.text) {
          el.textContent = p.text;
        }
        if (p.size) {
          el.style.fontSize = p.size;
        }
        if (p.color) {
          el.style.color = p.color;
        }
      };
    }, options);
  }
  /** Shortcut to create a fixation scene */
  fixation(options?: SceneOptions) {
    return this.text('+', options);
  }
  /** Shortcut to create a blank scene */
  blank(options?: SceneOptions) {
    return this.text('', options);
  }
  /**
   * Create a scene with jsPsych Plugin
   *
   * @example
   *   const scene = app.jsPsych({
   *     type: jsPsychHtmlKeyboardResponse,
   *     stimulus: 'Hello world',
   *     choices: ['f', 'j'],
   *   });
   *
   * @see https://www.jspsych.org/latest/plugins/
   */
  jsPsych<I extends PluginInfo>(trial: TrialType<I>) {
    return createSceneByJsPsychPlugin(this, trial);
  }
}
/**
 * Create app and detect environment
 *
 * @example
 *   using app = await createApp();
 *   using fixation = app.fixation({ duration: 500 });
 *   using blank = app.blank({ duration: 1000 });
 *   using guide = app.text('This is a guide', { close_on: 'click' });
 */
export async function createApp(
  options?: Parameters<typeof detectEnvironment>[0],
) {
  const opts = {
    root: document.body,
    framesCount: 60,
    ...options,
  };
  if (!opts.root.isConnected) {
    console.warn(
      'Root element is not connected to the document, it will be mounted to document.body',
    );
    document.body.appendChild(opts.root);
  }
  return new App(opts.root, await detectEnvironment(opts));
}
