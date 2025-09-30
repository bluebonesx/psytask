import { type SceneSetup } from '@psytask/core';
import autoBind from 'auto-bind';
import type { PluginInfo, TrialType } from 'jspsych';
import { ERR, h, hasOwn, isArray, modify, mount } from 'shared/utils';
import { KeyboardListenerAPI } from './node_modules/jspsych/src/modules/plugin-api/KeyboardListenerAPI';
import { TimeoutAPI } from './node_modules/jspsych/src/modules/plugin-api/TimeoutAPI';
import { ParameterType } from './node_modules/jspsych/src/modules/plugins';

const warnMissingKey = <T extends object>(
  obj: T,
  handleMissingKey: (key: PropertyKey) => string,
) =>
  new Proxy(obj, {
    get: (o, k) =>
      hasOwn(o, k) ? o[k as keyof T] : console.warn(handleMissingKey(k)),
  });
/** For compatibility with CDN builds of jsPsych */
//@ts-ignore
window['jsPsychModule'] ??= { ParameterType };
/**
 * Create a scene with jsPsych Plugin
 *
 * This function provides a compatibility layer for using jsPsych plugins within
 * psytask. It handles the integration between jsPsych plugin API and psytask's
 * scene system.
 *
 * @example
 *
 * Use html-keyboard-response plugin
 *
 * ```ts
 * using scene = app.scene(jsPsychStim, {
 *   defaultProps: {
 *     type: jsPsychHtmlKeyboardResponse,
 *     stimulus: 'default',
 *     choices: ['f', 'j'],
 *   },
 * });
 * await scene.show({ stimulus: 'new' }); // change stimulus
 * ```
 *
 * @see {@link https://www.jspsych.org/latest/plugins/list-of-plugins/ jsPsych Plugin}
 */
export const jsPsychStim = ((trial: Partial<TrialType<PluginInfo>>, ctx) => {
  let data: Record<string, any>;

  // create jsPsych DOM
  const root = h('div', {
    className: 'jspsych-display-element',
    style: 'height:100%; width:100%',
  });
  const content = mount(
    h('div', { id: 'jspsych-content', className: 'jspsych-content' }),
    mount(h('div', { className: 'jspsych-content-wrapper' }), root),
  );

  /** @see https://github.com/jspsych/jsPsych/blob/main/packages/jspsych/src/timeline/Trial.ts */
  ctx.on('scene:show', (props) => {
    const Plugin = props.type as Extract<
      TrialType<PluginInfo>['type'],
      new (...args: any[]) => any
    > & { info: PluginInfo };
    if (
      typeof Plugin !== 'function' ||
      typeof Plugin.prototype === 'undefined' ||
      typeof Plugin.info === 'undefined'
    )
      ERR('jsPsych trial.type only supports jsPsych class plugins');

    // set default parameters
    Object.entries(Plugin.info.parameters).map(
      ([key, info]) => (props[key] ??= info.default),
    );

    // mock jsPsych API
    const mock_jsPsychPluginAPI = [
      new KeyboardListenerAPI(() => ctx.root),
      new TimeoutAPI(),
    ].reduce((api, item) => modify(api, autoBind(item)), {});
    const mock_jsPsych = {
      finishTrial(trial_data: object) {
        data = { ...props.data, ...trial_data };
        props.on_finish?.(data);
        typeof props.post_trial_gap === 'number'
          ? setTimeout(() => ctx.close(), props.post_trial_gap)
          : ctx.close();
      },
      pluginAPI: warnMissingKey(
        mock_jsPsychPluginAPI,
        (key) =>
          `jsPsych.pluginAPI.${key.toString()} is not supported, only supports: ${Object.keys(
            mock_jsPsychPluginAPI,
          ).join(', ')}`,
      ),
    };

    // on start
    props.on_start?.(props);

    // change css classes
    content.className = 'jspsych-content';
    const classes = props.css_classes;
    if (typeof classes === 'string') {
      content.classList.add(classes);
    } else if (isArray(classes)) {
      content.classList.add(...classes);
    }

    // execute trial
    content.innerHTML = ''; // clear content
    const plugin = new Plugin(
      warnMissingKey(
        mock_jsPsych,
        (key) =>
          `jsPsych.${key.toString()} is not supported, only supports: ${Object.keys(mock_jsPsych).join(', ')}`,
      ),
    );
    //@ts-ignore
    plugin.trial(content, props, () => props.on_load?.());
  });

  return { node: root, data: () => data };
}) satisfies SceneSetup;
