import autoBind from 'auto-bind';
import type { PluginInfo, TrialType } from 'jspsych';
import { KeyboardListenerAPI } from '../../../node_modules/jspsych/src/modules/plugin-api/KeyboardListenerAPI';
import { TimeoutAPI } from '../../../node_modules/jspsych/src/modules/plugin-api/TimeoutAPI';
import { ParameterType } from '../../../node_modules/jspsych/src/modules/plugins';
import type { LooseObject } from '../types';
import type { App } from './app';
import { Scene } from './scene';
import { h, hasOwn, proxy } from './util';

declare global {
  interface Window {
    /** Compatible with jspsych cdn */
    jsPsychModule: any;
  }
}
/**
 * Add jsPsychModule in CDN browser build
 *
 * @see https://cdn.jsdelivr.net/npm/jspsych/dist/index.browser.js
 */
if (process.env.NODE_ENV === 'production') {
  window['jsPsychModule'] ??= { ParameterType };
}

export function createSceneByJsPsychPlugin<I extends PluginInfo>(
  app: App,
  trial: TrialType<I>,
) {
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
    const scene = app.text(msg);
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
  const mock_jsPsychPluginAPI = [
    new KeyboardListenerAPI(() => document.body),
    new TimeoutAPI(),
  ].reduce((api, item) => Object.assign(api, autoBind(item)), {});
  const mock_jsPsych = {
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
        ? mock_jsPsychPluginAPI
        : proxy(mock_jsPsychPluginAPI, {
            onNoKey(key) {
              console.warn(
                `jsPsych.pluginAPI.${key.toString()} is not supported, only supports: ${Object.keys(
                  mock_jsPsychPluginAPI,
                ).join(', ')}`,
              );
            },
          }),
  };
  const plugin = new Plugin(
    process.env.NODE_ENV === 'production'
      ? mock_jsPsych
      : proxy(mock_jsPsych, {
          onNoKey(key) {
            console.warn(
              `jsPsych.${key.toString()} is not supported, only supports: ${Object.keys(mock_jsPsych).join(', ')}`,
            );
          },
        }),
  );

  // create scene
  const scene = app.scene(function (self) {
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
