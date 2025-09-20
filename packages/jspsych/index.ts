import { type SceneSetup } from '@psytask/core';
import autoBind from 'auto-bind';
import type { PluginInfo, TrialType } from 'jspsych';
import { KeyboardListenerAPI } from '../../node_modules/jspsych/src/modules/plugin-api/KeyboardListenerAPI';
import { TimeoutAPI } from '../../node_modules/jspsych/src/modules/plugin-api/TimeoutAPI';
import { ParameterType } from '../../node_modules/jspsych/src/modules/plugins';
import { h, isArray, mount } from 'shared/utils';

/** @ignore */
const hasOwn = <T extends object, K extends PropertyKey>(
  obj: T,
  key: K,
): obj is Extract<T, { [P in K]: unknown }> extends never
  ? T & { [P in K]: unknown }
  : Extract<T, { [P in K]: unknown }> =>
  Object.prototype.hasOwnProperty.call(obj, key);
/** @ignore */
const proxyNonKey = <T extends object>(
  obj: T,
  onNoKey: (key: PropertyKey) => void,
) =>
  new Proxy(obj, {
    get(o, k) {
      if (hasOwn(o, k)) return o[k as keyof T];
      return onNoKey(k);
    },
  });
/**
 * Create a scene with jsPsych Plugin
 *
 * This function provides a compatibility layer for using jsPsych plugins within
 * psytask. It handles the integration between jsPsych plugin API and psytask's
 * scene system.
 *
 * @example
 *
 * ```ts
 * using scene = app.scene(jsPsychStim, {
 *   defaultProps: () => ({
 *     type: jsPsychHtmlKeyboardResponse,
 *     stimulus: 'default',
 *     choices: ['f', 'j'],
 *   }),
 * });
 * await scene.show({ stimulus: 'new' }); // change stimulus
 * ```
 *
 * @see {@link https://www.jspsych.org/latest/plugins/ jsPsych Plugin}
 */
export const jsPsychStim = ((trial: TrialType<PluginInfo>, ctx) => {
  /**
   * Add jsPsychModule in CDN browser build. This is required for compatibility
   * with CDN builds of jsPsych
   *
   * @see https://cdn.jsdelivr.net/npm/jspsych/dist/index.browser.js
   */
  if (process.env.NODE_ENV === 'production')
    //@ts-ignore
    window['jsPsychModule'] ??= { ParameterType };

  let data: object;

  // create jsPsych DOM
  const root = h('div', {
    className: 'jspsych-display-element',
    style: 'height:100%; width:100%',
  });

  const content = mount(
    h('div', { id: 'jspsych-content', className: 'jspsych-content' }),
    mount(h('div', { className: 'jspsych-content-wrapper' }), root),
  );

  ctx.on('scene:show', (trial) => {
    const Plugin = trial.type as Extract<
      TrialType<PluginInfo>['type'],
      new (...args: any[]) => any
    > & { info: PluginInfo };
    if (
      typeof Plugin !== 'function' ||
      typeof Plugin.prototype === 'undefined' ||
      typeof Plugin.info === 'undefined'
    ) {
      throw new Error(
        `jsPsych trial.type only supports jsPsych class plugins, but got ${Plugin}`,
      );
    }

    // unsupported parameters
    if (process.env.NODE_ENV === 'development') {
      const unsupportedParams = new Set([
        'extensions',
        'record_data',
        'save_timeline_variables',
        'save_trial_parameters',
        'simulation_options',
      ]);
      for (const key in trial) {
        if (hasOwn(trial, key) && unsupportedParams.has(key)) {
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
      new KeyboardListenerAPI(() => ctx.root),
      new TimeoutAPI(),
    ].reduce((api, item) => Object.assign(api, autoBind(item)), {});
    const mock_jsPsych = {
      finishTrial(_data: object) {
        data = Object.assign({}, trial.data, _data);
        trial.on_finish?.(data);
        if (typeof trial.post_trial_gap === 'number') {
          setTimeout(() => ctx.close(), trial.post_trial_gap);
        } else {
          ctx.close();
        }
      },
      pluginAPI:
        process.env.NODE_ENV === 'production'
          ? mock_jsPsychPluginAPI
          : proxyNonKey(mock_jsPsychPluginAPI, (key) => {
              console.warn(
                `jsPsych.pluginAPI.${key.toString()} is not supported, only supports: ${Object.keys(
                  mock_jsPsychPluginAPI,
                ).join(', ')}`,
              );
            }),
    };

    // on start
    trial.on_start?.(trial);

    // change css classes
    content.className = 'jspsych-content';
    const classes = trial.css_classes;
    if (typeof classes === 'string') {
      content.classList.add(classes);
    } else if (isArray(classes)) {
      content.classList.add(...classes);
    }

    // execute trial
    content.innerHTML = ''; // clear content
    const plugin = new Plugin(
      process.env.NODE_ENV === 'production'
        ? mock_jsPsych
        : proxyNonKey(mock_jsPsych, (key) => {
            console.warn(
              `jsPsych.${key.toString()} is not supported, only supports: ${Object.keys(mock_jsPsych).join(', ')}`,
            );
          }),
    );
    //@ts-ignore
    plugin.trial(content, trial, () => trial.on_load?.());
  });

  return { node: root, data: () => data };
}) satisfies SceneSetup;
