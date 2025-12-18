import { jsPsychStim } from '@psytask/jspsych';
import { createApp } from 'psytask';
import type { LooseObject } from 'shared/types';
import { loadCss } from 'shared/utils';
import {
  $,
  DefaultAdapter,
  expect,
  expect_includes,
  mock_event,
  nextFrame,
  spy_functionCall,
} from './utils';

let hasLoadedJsPsychCss = 0;
const loadJsPsychCss = () =>
  hasLoadedJsPsychCss++ ||
  Promise.all([
    loadCss('https://cdn.jsdelivr.net/npm/jspsych@8.2.2/css/jspsych.css'),
    loadCss(
      'https://cdn.jsdelivr.net/npm/@jspsych/plugin-survey@4.0.0/css/survey.css',
    ),
  ]);
const loadJsPsychPlugin = (name: string) =>
  import(
    /* @vite-ignore */
    `https://cdn.jsdelivr.net/npm/@jspsych/plugin-${name}/+esm`
  ).then((mod) => (plugins[name] = mod.default));

const plugins = new Proxy(
  {} as {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required for test
    [K in string]: Promise<any>;
  },
  {
    async get(obj, name: string) {
      await loadJsPsychCss();
      return (obj[name] ??= await loadJsPsychPlugin(name));
    },
  },
);

const EmptyPlugin = (
  on_new?: //eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required for test
  (mock_jsPsych: Record<string, any>) => void,
) =>
  class {
    static info = { parameters: {} };
    constructor(public mock_jsPsych: LooseObject) {
      on_new?.(mock_jsPsych);
    }
    async trial(dom: HTMLElement, trial: LooseObject, on_load: () => void) {
      on_load();
      return { ...trial };
    }
  };
export const Compatibility = {
  async 'warn on missing api'() {
    using warnParams = spy_functionCall(console, 'warn', () => void 0);
    using app = await createApp();
    using s = app.scene(jsPsychStim, {
      adapter: DefaultAdapter,
      defaultProps: {
        type: EmptyPlugin((mock_jsPsych) => {
          expect(mock_jsPsych.unsupportedFeature, void 0); // missing
          expect(mock_jsPsych.pluginAPI.unsupportedApi, void 0); // missing
          mock_jsPsych.pluginAPI.setTimeout(() => s.close()); // exists
        }),
      },
    });
    expect(warnParams.length, 2);
    await s.show();
    expect(warnParams.length, 2); // no change
  },
  async 'set post_trial_gap'() {
    using app = await createApp();
    using s = app.scene(jsPsychStim, {
      adapter: DefaultAdapter,
      defaultProps: {
        type: EmptyPlugin(),
        post_trial_gap: 500,
      },
    });
    const start = performance.now();
    const p = s.show();
    await nextFrame();
    mock_event(s.root, new KeyboardEvent('keydown', { key: 'a' }));
    await p;
    const elapsed = performance.now() - start;
    expect(elapsed >= 500, true);
  },
  async 'set css_classes'() {
    using app = await createApp();
    using s = app.scene(jsPsychStim, {
      adapter: DefaultAdapter,
      defaultProps: {
        type: EmptyPlugin(),
        css_classes: ['custom-class-1', 'custom-class-2'],
      },
    });
    await nextFrame();
    const el = $(s.root, '#jspsych-content');
    el.classList.remove('jspsych-content');
    expect(el.className, 'custom-class-1 custom-class-2');

    await s.show({ css_classes: 'class-single' });
    el.classList.remove('jspsych-content');
    expect(el.className, 'class-single');

    await s.show({ css_classes: () => ['class-getter-1', 'class-getter-2'] });
    el.classList.remove('jspsych-content');
    expect(el.className, 'class-getter-1 class-getter-2');

    await s.show({ css_classes: () => 'class-getter' });
    el.classList.remove('jspsych-content');
    expect(el.className, 'class-getter');
  },
  async 'lifecycle hooks'() {
    using app = await createApp();
    using s = app.scene(jsPsychStim, {
      adapter: DefaultAdapter,
      defaultProps: {
        type: EmptyPlugin(),
        stimulus: 'Old Stimulus',
        choices: 'NO_KEYS',
        trial_duration: 1e2,
        data: { info: 'original' },
        on_start(trial) {
          trial.stimulus = 'New Stimulus';
        },
        async on_load() {
          await 0;
          const el = $(s.root, '#jspsych-content');
          el.style.backgroundColor = 'red';
        },
        on_finish(data) {
          data.extra_info = 'finished';
        },
      },
    });
    expect_includes(await s.show(), {
      stimulus: 'New Stimulus',
      info: 'original',
      extra_info: 'finished',
    });
    const el = $(s.root, '#jspsych-content');
    expect(el.style.backgroundColor, 'red');

    expect_includes(
      await s.show({
        on_start(trial) {
          trial.stimulus = 'NNew Stimulus';
        },
        on_finish(data) {
          data.new_value = 'nonono';
        },
      }),
      {
        stimulus: 'NNew Stimulus',
        info: 'original',
        new_value: 'nonono',
      },
    );
  },
};
export const Plugins = {
  async survey() {
    using app = await createApp();
    using s = app.scene(jsPsychStim, {
      adapter: DefaultAdapter,
      defaultProps: {
        type: await plugins['survey'],
        survey_json: {
          elements: [
            {
              type: 'text',
              name: 'username',
              title: 'What is your name?',
              isRequired: true,
            },
            {
              type: 'text',
              inputType: 'number',
              name: 'age',
              title: 'How old are you?',
              isRequired: true,
            },
          ],
        },
      },
    });
    const mock_data = { username: 'testuser', age: 25 };
    const p = s.show();
    await nextFrame();
    Object.keys(mock_data).map((key) => {
      const el = $<HTMLInputElement>(s.root, `div[data-name="${key}"] input`);
      el.value = '' + mock_data[key as keyof typeof mock_data];
      mock_event(el, 'input');
    });
    $<HTMLElement>(s.root, 'input.sd-navigation__complete-btn').click();
    const data = await p;
    expect_includes(data.response, mock_data);
  },
  async 'html-keyboard-response'() {
    using app = await createApp();
    using s = app.scene(jsPsychStim, {
      adapter: DefaultAdapter,
      defaultProps: {
        type: await plugins['html-keyboard-response'],
        stimulus: 'Press unknown key to continue.',
        choices: 'ALL_KEYS',
      },
    });
    const p = s.show();
    await nextFrame();
    mock_event(s.root, new KeyboardEvent('keydown', { key: 'b' }));
    const data = await p;
    expect_includes(data, {
      stimulus: s.options.defaultProps.stimulus,
      response: 'b',
    });
  },
  async 'html-button-response'() {
    using app = await createApp();
    using s = app.scene(jsPsychStim, {
      adapter: DefaultAdapter,
      defaultProps: {
        type: await plugins['html-button-response'],
        stimulus: 'Click the button to continue.',
        choices: ['Continue'],
      },
    });
    const p = s.show();
    await nextFrame();
    $(s.root, 'button.jspsych-btn').click();
    const data = await p;
    expect_includes(data, { stimulus: s.options.defaultProps.stimulus });
  },
};
