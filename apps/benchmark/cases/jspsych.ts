import { loadCss } from 'shared/utils';

await loadCss('https://cdn.jsdelivr.net/npm/jspsych@8.2.2/css/jspsych.css');
const { initJsPsych } = await import('jspsych');
const loadPlugin = (name: string, cache: Record<string, any> = {}) =>
  (cache[name] ??= import(
    `https://cdn.jsdelivr.net/npm/@jspsych/plugin-${name}/+esm`
  ).then((m) => m.default));
