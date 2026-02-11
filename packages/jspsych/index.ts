import { type Component, getCurrentScene } from '@psytask/core';
import autoBind from 'auto-bind';
import type { PluginInfo, TrialType } from 'jspsych';
import type { LooseObject } from 'shared/types';
import {
  $Object,
  array_normalize,
  doc,
  ERR,
  getter_normalize,
  modify,
  mount,
} from 'shared/utils';
import { KeyboardListenerAPI } from 'internal:jspsych:src/modules/plugin-api/KeyboardListenerAPI.ts';
import { TimeoutAPI } from 'internal:jspsych:src/modules/plugin-api/TimeoutAPI.ts';

const div = (
  props: Omit<Partial<HTMLElementTagNameMap['div']>, 'style'> & {
    style?: string;
  },
) => modify(doc.createElement('div'), props);
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
  const root = div({
    className: 'jspsych-display-element',
    style: 'height:100%;width:100%',
  });
  const content = mount(
    div({ id: 'jspsych-content' }),
    mount(div({ className: 'jspsych-content-wrapper' }), root),
  );

  const ctx = getCurrentScene();
  const close = (trial: typeof props, trial_data: LooseObject) => {
    data = { ...trial.data, ...trial_data };
    trial.on_finish?.(data);
    typeof trial.post_trial_gap === 'number'
      ? setTimeout(() => ctx.close(), trial.post_trial_gap)
      : ctx.close();
  };
  /** @see https://github.com/jspsych/jsPsych/blob/main/packages/jspsych/src/timeline/Trial.ts */
  const update = async (trial: typeof props) => {
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

    // add css classes
    content.className = [
      'jspsych-content',
      ...array_normalize(getter_normalize(props.css_classes)),
    ].join(' ');
    content.innerHTML = ''; // clear content

    // execute trial
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
  };
  update({ ...props });

  ctx.on('show', () => {
    $Object.keys(props).some((k) => ctx.options.defaultProps[k] !== props[k]) &&
      update({ ...props });
  });

  return { node: root, data: () => data };
}) satisfies Component;
