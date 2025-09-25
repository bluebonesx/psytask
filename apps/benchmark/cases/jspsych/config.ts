declare global {
  const jsPsychModule: typeof import('jspsych');
  const initJsPsych: typeof jsPsychModule.initJsPsych;
  const jsPsychHtmlKeyboardResponse: typeof import('@jspsych/plugin-html-keyboard-response').default;
}

export default {
  css: ['https://cdn.jsdelivr.net/npm/jspsych@8.2.2/css/jspsych.css'],
  js: [
    'https://cdn.jsdelivr.net/npm/jspsych@8.2.2/dist/index.browser.min.js',
    'https://cdn.jsdelivr.net/npm/@jspsych/plugin-html-keyboard-response@2.1.0/dist/index.browser.min.js',
  ],
};
