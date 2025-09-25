window.__benchmark__ = async (mark, params) => {
  const app = initJsPsych();
  await app.run([
    {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: '+',
      trial_duration: 5e2,
    },
    {
      timeline: [
        {
          on_start() {
            const i = app.evaluateTimelineVariable('i');
            mark(i, 1e2, i === params.count - 1);
          },
          type: jsPsychHtmlKeyboardResponse,
          stimulus: app.timelineVariable('letter'),
          trial_duration: 1e2,
        },
      ],
      timeline_variables: Array.from({ length: params.count }, (_, i) => ({
        i,
        letter: String.fromCharCode(65 + (i % 26)),
      })),
    },
  ]);
};
