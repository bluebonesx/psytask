import type { PluginInfo, TrialType } from 'jspsych';
import type { LooseObject } from '../types';
import { detectEnvironment, DisposableClass, h, hasOwn, proxy } from './util';
import { Scene, type SceneOptions } from './scene';

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
    /** @see https://github.com/jspsych/jsPsych/blob/main/packages/jspsych/src/timeline/Trial.ts#L63 */
    const Plugin = trial.type as Extract<
      TrialType<PluginInfo>['type'],
      new (...args: any[]) => any
    > & { info: I };
    if (
      typeof Plugin !== 'function' ||
      typeof Plugin.prototype === 'undefined' ||
      typeof Plugin.info === 'undefined'
    ) {
      const msg = 'jsPsych trial.type only supports jsPsych class plugins';
      console.warn(msg + ', but got', Plugin);
      const scene = this.text(msg);
      return scene as Scene<[]>;
    }

    // unused parameters
    if (process.env.NODE_ENV === 'development') {
      const unsupporteds = new Set([
        'extensions',
        'record_data',
        'save_timeline_variables',
        'save_trial_parameters',
        'simulation_options',
      ]);
      for (const key in trial) {
        if (hasOwn(trial, key) && unsupporteds.has(key)) {
          console.warn(`jsPsych trial "${key}" parameter is not supported`);
        }
      }
    }

    // set default parameters
    for (const key in Plugin.info.parameters) {
      if (!hasOwn(trial, key)) {
        //@ts-ignore
        trial[key] = Plugin.info.parameters[key]!.default;
      }
    }

    // mock jsPsych API
    const jsPsychPluginAPI = {
      setTimeout: window.setTimeout,
    };
    const jsPsych = {
      finishTrial(data: LooseObject) {
        trial.on_finish?.(Object.assign(scene.data, trial.data, data));
        if (typeof trial.post_trial_gap === 'number') {
          window.setTimeout(() => scene.close(), trial.post_trial_gap);
        } else {
          scene.close();
        }
      },
      pluginAPI:
        process.env.NODE_ENV === 'production'
          ? jsPsychPluginAPI
          : proxy(jsPsychPluginAPI, {
              onNoKey(key) {
                console.warn(
                  `jsPsych.pluginAPI.${key.toString()} is not supported`,
                );
              },
            }),
    };
    const plugin = new Plugin(
      process.env.NODE_ENV === 'production'
        ? jsPsych
        : proxy(jsPsych, {
            onNoKey(key) {
              console.warn(`jsPsych.${key.toString()} is not supported`);
            },
          }),
    );

    // create scene
    const scene = this.scene(function (self) {
      // create jsPsych DOM
      const content = h('div', {
        id: 'jspsych-content',
        className: 'jspsych-content',
      });
      self.root.appendChild(
        h(
          'div',
          {
            className: 'jspsych-display-element',
            style: { height: '100%', width: '100%' },
          },
          h('div', { className: 'jspsych-content-wrapper' }, content),
        ),
      );

      // on start
      trial.on_start?.(trial);

      // add css classes
      const classes = trial.css_classes;
      if (typeof classes === 'string') {
        content.classList.add(classes);
      } else if (Array.isArray(classes)) {
        content.classList.add(...classes);
      }

      // execute trial
      plugin.trial(content, trial, () => {
        trial.on_load?.();
      });
      return () => {};
    });
    return scene;
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
