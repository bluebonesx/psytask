window.__benchmark__ = async (mark, params) => {
  const fixation = new lab.html.Screen({
    el: document.body,
    content: '<div style="line-height:100vh; text-align:center">+</div>',
    timeout: 5e2,
  });

  const loop = new lab.flow.Loop({
    template: (text: string, i: number) => {
      const letter = new lab.html.Screen({
        el: document.body,
        content: `<div style="line-height:100vh; text-align:center">${text}</div>`,
        timeout: 1e2,
      });
      letter.on('run', () => {
        mark(i, 1e2, i === params.count - 1);
      });
      return letter;
    },
    templateParameters: Array.from({ length: params.count }, (_, i) =>
      String.fromCharCode(65 + (i % 26)),
    ),
  });

  const study = new lab.flow.Sequence({
    content: [fixation, loop],
  });

  await study.run();
};
