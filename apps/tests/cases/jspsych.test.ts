import { jsPsychStim } from '@psytask/jspsych';
import { createApp } from 'psytask';
import van from 'vanjs-core';
import { mount } from 'shared/utils';

const { link } = van.tags;

const loadJsPsychCss = () => {
  const id = 'jspsych-css';
  if (document.querySelector(`link[data-id="${id}"]`)) return;
  mount(
    link({
      'data-id': id,
      rel: 'stylesheet',
      href: 'https://cdn.jsdelivr.net/npm/jspsych@8.2.2/css/jspsych.css',
    }),
    link({
      'data-id': id,
      rel: 'stylesheet',
      href: 'https://cdn.jsdelivr.net/npm/@jspsych/plugin-survey/css/survey.css',
    }),
  );
};
const loadJsPsychPlugin = (name: string) =>
  import(`https://cdn.jsdelivr.net/npm/@jspsych/plugin-${name}/+esm`).then(
    (mod) => (plugins[name] = mod.default),
  );
const plugins = new Proxy({} as { [K in string]: Promise<any> }, {
  get: async (obj, name: string) => (
    loadJsPsychCss(),
    (obj[name] ??= await loadJsPsychPlugin(name))
  ),
});

const survey_text = {
  async 'basic usage'() {
    using app = await createApp();
    using scene = app.scene(jsPsychStim, {
      defaultProps: {
        type: await plugins['survey-text'],
      },
    });
    await scene.show();
  },
};
