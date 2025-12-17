import { type Component, getCurrentScene } from '@psytask/core';
import autoBind from 'auto-bind';
import type { PluginInfo, TrialType } from 'jspsych';
import type { LooseObject } from 'shared/types';
import { $Object, array_normalize, ERR, modify } from 'shared/utils';
import van from 'vanjs-core';
import { KeyboardListenerAPI } from '../../node_modules/jspsych/src/modules/plugin-api/KeyboardListenerAPI';
import { TimeoutAPI } from '../../node_modules/jspsych/src/modules/plugin-api/TimeoutAPI';

const { div } = van.tags;
const warnMissingKey = <T extends object>(
  obj: T,
  handleMissingKey: (key: PropertyKey) => string,
) =>
  new Proxy(obj, {
    get: (o, k) => o[k as keyof T] ?? console.warn(handleMissingKey(k)),
  });

/**
 * Create a scene with
 * {@link https://www.jspsych.org/latest/plugins/list-of-plugins/ jsPsych Plugins}
 *
 * @example
 *
 * Basic usage
 *
 * ```ts
 * using scene = app.scene(jsPsychStim, {
 *   defaultProps: {
 *     type: (
 *       await import('https://cdn.jsdelivr.net/npm/@jspsych/plugin-survey/+esm')
 *     ).default,
 *     stimulus: 'default',
 *     choices: ['f', 'j'],
 *   },
 * });
 * await scene.show({ stimulus: 'new' }); // change stimulus
 * ```
 */
export const jsPsychStim = ((props: TrialType<PluginInfo>) => {
  let data: LooseObject;

  // create jsPsych DOM
  const content = div({
    id: 'jspsych-content',
    class: () =>
      ['jspsych-content', ...array_normalize(props.css_classes)].join(' '),
  });
  const ctx = getCurrentScene();
  const close = (trial: typeof props, trial_data: LooseObject) => {
    data = { ...trial.data, ...trial_data };
    trial.on_finish?.(data);
    typeof trial.post_trial_gap === 'number'
      ? setTimeout(() => ctx.close(), trial.post_trial_gap)
      : ctx.close();
  };

  /** @see https://github.com/jspsych/jsPsych/blob/main/packages/jspsych/src/timeline/Trial.ts */
  van.derive(async () => {
    const trial = { ...props }; // non-reactive copy
    const Plugin = trial.type as Extract<
      TrialType<PluginInfo>['type'],
      new (...args: unknown[]) => unknown
    > & { info: PluginInfo };
    if (
      typeof Plugin !== 'function' ||
      typeof Plugin.prototype === 'undefined' ||
      typeof Plugin.info === 'undefined'
    )
      ERR('jsPsych trial.type only supports jsPsych class plugins');

    // set default parameters
    $Object
      .entries(Plugin.info.parameters)
      .map(([key, info]) => (trial[key] ??= info.default));

    // mock jsPsych API
    const mock_jsPsychPluginAPI = [
      new KeyboardListenerAPI(() => ctx.root),
      new TimeoutAPI(),
    ].reduce((api, item) => modify(api, autoBind(item)), {});
    const mock_jsPsych = {
      finishTrial(trial_data: LooseObject) {
        close(trial, trial_data);
      },
      pluginAPI: warnMissingKey(
        mock_jsPsychPluginAPI,
        (key) =>
          `jsPsych.pluginAPI.${key.toString()} is not supported, only supports: ${$Object
            .keys(mock_jsPsychPluginAPI)
            .join(', ')}`,
      ),
    };

    // on start
    trial.on_start?.(trial);

    // execute trial
    content.innerHTML = ''; // clear content
    const plugin = new Plugin(
      warnMissingKey(
        mock_jsPsych,
        (key) =>
          `jsPsych.${key.toString()} is not supported, only supports: ${$Object.keys(mock_jsPsych).join(', ')}`,
      ),
    );
    const trial_data = await plugin.trial(content, trial, () =>
      trial.on_load?.(),
    );
    trial_data && close(trial, trial_data);
  });

  return {
    node: div(
      { class: 'jspsych-display-element', style: 'height:100%;width:100%' },
      div({ class: 'jspsych-content-wrapper' }, content),
    ),
    data: () => data,
  };
}) satisfies Component;
