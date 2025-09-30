const jsdocComment =
  (await Bun.file('./index.ts').text()).match(
    /(\/\*\*\n[\s\S]+?\*\/)\nexport/,
  )?.[1] || '/* cannot extract JSDoc comment */';
await Bun.write(
  'dist/index.d.ts',
  `import { PluginInfo, TrialType } from 'jspsych';
import { Scene } from '@psytask/core';
${jsdocComment}
export const jsPsychStim: (trial: Partial<TrialType<PluginInfo>>, ctx: Scene<any>) => { node: HTMLDivElement; data: () => Record<string, any>;}`,
);
export default {};
