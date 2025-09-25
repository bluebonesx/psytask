import { Scene } from '@psytask/core';
import { expect } from 'chai';
import { createApp, generic } from 'psytask';
import van from 'vanjs-core';

const { button, div } = van.tags;

const app = await createApp({ root: div() });
const frame_ms = Math.random() * 30 + 10;

export const constructor = {
  async 'frame count'() {
    let frame_count = 0;
    using s = new Scene(
      (_, ctx) => {
        ctx.on('scene:frame', () => frame_count++);
        return {
          node: div({ style: 'background: #fff; width: 3rem; height: 3rem;' }),
        };
      },
      { root: app.root, frame_ms, defaultProps: () => ({}) },
    );

    for (let i = 0; i < 10; i++) {
      frame_count = 0;
      const duration = Math.random() * 900 + 100;
      const expect_frame_count = Math.round(duration / frame_ms);

      await s.config({ duration }).show();
      expect(frame_count + 2).to.closeTo(
        expect_frame_count,
        1,
        `duration: ${duration}`,
      );
    }
  },
  async 'generic scene setup'() {
    using s = new Scene(
      generic(<T extends string>(props: { text: T }, ctx: Scene<any>) => {
        ctx.on('scene:show', ({ props: newProps }) =>
          Object.assign(props, newProps),
        );
        return { node: [], data: () => ({ value: props.text }) };
      }),
      {
        root: app.root,
        frame_ms: 1,
        defaultProps: () => ({ text: 'hello' }),
        duration: 1,
      },
    );
    const expect_no_error: 'world' = (await s.show({ text: 'world' })).value;
    expect(expect_no_error).to.equal('world');
  },
};
