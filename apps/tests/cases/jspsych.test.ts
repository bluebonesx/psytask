import { jsPsychStim } from '@psytask/jspsych';
import { createApp } from 'psytask';
import { mount } from 'shared/utils';
import van from 'vanjs-core';

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
  async get(obj, name: string) {
    loadJsPsychCss();
    return (obj[name] ??= await loadJsPsychPlugin(name));
  },
});

export const survey_text = {
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
