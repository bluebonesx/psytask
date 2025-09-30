import {
  EventEmitter,
  Scene,
  generic,
  on,
  type MaybeGenericSceneSetup,
  type SceneEventMap,
  type SceneOptions,
} from '@psytask/core';
import { createApp } from 'psytask';
import type { LooseObject } from 'shared/types';
import { map, mount, rAF } from 'shared/utils';
import van from 'vanjs-core';
import {
  expect,
  expect_closeTo,
  expect_dutationCloseTo,
  expect_error,
  expect_includes,
  mock_event,
  spy_listeners,
} from './utils';

const { div } = van.tags;

let frame_ms: number;
{
  using app = await createApp();
  frame_ms = app.data.frame_ms;
}
const DefaultScene = <T extends MaybeGenericSceneSetup>(
  ...[setup, options]: ConstructorParameters<typeof Scene<T>> extends [
    infer L,
    infer R extends SceneOptions<T>,
  ]
    ? [L, options?: Partial<R>]
    : never
) =>
  new Scene(setup, {
    root: mount(div({ class: 'psytask-scene' })),
    frame_ms,
    defaultProps: {},
    duration: frame_ms * 1.3,
    ...options,
  });
export const _Scene = {
  async 'dispose - remove DOM'() {
    const node = div();
    {
      using _ = DefaultScene((props: {}) => node);
      expect(node.isConnected);
    }
    expect(!node.isConnected);
  },
  // async 'modify defaultProps'() {
  //   // array
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene((p: typeof dp) => ((p.arr[1] = 5), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene((p: typeof dp) => ((p.arr[4] = 5), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene((p: typeof dp) => (p.arr.splice(0, 1, 5), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene((p: typeof dp) => (p.arr.pop(), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene((p: typeof dp) => (p.arr.push(4), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene((p: typeof dp) => (p.arr.shift(), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene((p: typeof dp) => (p.arr.unshift(0), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   // object
  //   await expect_error(async () => {
  //     const dp = { obj: { a: 1, b: 2 } };
  //     using _ = DefaultScene((p: typeof dp) => ((p.obj.a = 5), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   await expect_error(async () => {
  //     const dp = { obj: { a: 1, b: 2 } };
  //     //@ts-ignore
  //     using _ = DefaultScene((p: typeof dp) => ((p.obj.c = 5), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   await expect_error(async () => {
  //     const dp = { obj: { a: 1, b: 2 } };
  //     //@ts-ignore
  //     using _ = DefaultScene((p: typeof dp) => (delete p.obj.a, ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   // nested
  //   await expect_error(async () => {
  //     const dp = { nested: { a: [1, 2, 3] } };
  //     using _ = DefaultScene((p: typeof dp) => ((p.nested.a[1] = 5), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   await expect_error(async () => {
  //     const dp = { nested: { a: { b: 1 } } };
  //     using _ = DefaultScene((p: typeof dp) => ((p.nested.a.b = 5), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  // },
  // async 'modify newProps'() {
  //   // array
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => ((p.arr[1] = 5), (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => ((p.arr[4] = 5), (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => (p.arr.splice(0, 1, 5), (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => (p.arr.pop(), (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => (p.arr.push(4), (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => (p.arr.shift(), (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  //   await expect_error(async () => {
  //     const dp = { arr: [1, 2, 3] };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => (p.arr.unshift(0), (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  //   // object
  //   await expect_error(async () => {
  //     const dp = { obj: { a: 1, b: 2 } };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => ((p.obj.a = 5), (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  //   await expect_error(async () => {
  //     const dp = { obj: { a: 1, b: 2 } };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => ((p.obj.c = 5), (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  //   await expect_error(async () => {
  //     const dp = { obj: { a: 1, b: 2 } };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => (delete p.obj.a, (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  //   // nested
  //   await expect_error(async () => {
  //     const dp = { nested: { a: [1, 2, 3] } };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => ((p.nested.a[1] = 5), (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  //   await expect_error(async () => {
  //     const dp = { nested: { a: { b: 1 } } };
  //     using _ = DefaultScene(
  //       (p: typeof dp, ctx) => (
  //         ctx.on('scene:show', (p) => ((p.nested.a.b = 5), (p._ = 1))),
  //         ''
  //       ),
  //       { defaultProps: dp },
  //     ); //@ts-ignore
  //     await _.show({ _: 0 });
  //   });
  // },
  async 'listener - remove on close'() {
    const events: Record<string, number> = {};
    const log_event = (e: Event) =>
      (events[e.type] = (events[e.type] ?? 0) + 1);
    using s = DefaultScene(
      (p: {}, ctx) => (
        ctx
          .on('pointerup', log_event)
          .on('key:f', log_event)
          .on('key: ', log_event)
          .on('key:Enter', log_event)
          .on('mouse:left', log_event)
          .on('mouse:middle', log_event)
          .on('mouse:right', log_event),
        ''
      ),
      { duration: Infinity, close_on: ['abort', 'mouse:unknown'] },
    );
    using params = spy_listeners(s.root);
    expect(events, {}, 1);

    const p = s.show();
    expect(
      map(params, (v) => v.length),
      { pointerup: 1, keydown: 1, mousedown: 1, abort: 1 },
      1,
    );

    [
      new PointerEvent('pointerup'),
      new KeyboardEvent('keydown', { key: 'f' }),
      new KeyboardEvent('keydown', { key: ' ' }),
      new KeyboardEvent('keydown', { key: 'Enter' }),
      new MouseEvent('mousedown', { button: 0 }),
      new MouseEvent('mousedown', { button: 1 }),
      new MouseEvent('mousedown', { button: 2 }),
      new MouseEvent('mousedown', { button: 4 }),
    ].map((e) => mock_event(s.root, e));

    await p;
    expect(events, { pointerup: 1, keydown: 3, mousedown: 3 }, 1);
    expect(params, {}, 1);
  },
  async 'listener - scene hooks'() {
    const counts = { show: 0, close: 0, frame: 0 };
    using s = DefaultScene(
      (p: {}, ctx) => (
        ctx
          .on('scene:show', () => counts.show++)
          .on('scene:close', () => counts.close++)
          .on('scene:frame', () => counts.frame++),
        ''
      ),
    );
    expect(counts, { show: 0, close: 0, frame: 0 }, 1);

    await s.show();
    expect(counts.show, 1);
    expect(counts.close, 1);
    expect(counts.frame > 0);

    counts.frame = 0;
    await s.config({ duration: 50 }).show();
    expect(counts.show, 2);
    expect(counts.close, 2);
    expect(counts.frame > 0);
  },
  async 'listener - repeat with close_on'() {
    // native
    {
      let called = 0;
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('pointerdown', () => called++), ''),
        { close_on: ['pointerdown'] },
      );
      const p = s.show();
      mock_event(s.root, 'pointerdown');
      await p;
      expect(called, 1);
    }
    // key shortcut
    {
      let called = 0;
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('key: ', () => called++), ''),
        { close_on: ['key:s'] },
      );
      const p = s.show();
      mock_event(s.root, new KeyboardEvent('keydown', { key: ' ' }));
      mock_event(s.root, new KeyboardEvent('keydown', { key: 's' }));
      await p;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('key:q', () => called++), ''),
        { close_on: ['key:q'] },
      );
      const p = s.show();
      mock_event(s.root, new KeyboardEvent('keydown', { key: 'q' }));
      await p;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('keydown', () => called++), ''),
        { close_on: ['key: '] },
      );
      const p = s.show();
      mock_event(s.root, new KeyboardEvent('keydown', { key: ' ' }));
      await p;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('key: ', () => called++), ''),
        { close_on: ['keydown'] },
      );
      const p = s.show();
      mock_event(s.root, new KeyboardEvent('keydown', { key: ' ' }));
      await p;
      expect(called, 1);
    }
    // mouse shortcut
    {
      let called = 0;
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('mouse:left', () => called++), ''),
        { close_on: ['mouse:right'] },
      );
      const p = s.show();
      mock_event(s.root, new MouseEvent('mousedown', { button: 0 }));
      mock_event(s.root, new MouseEvent('mousedown', { button: 2 }));
      await p;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('mouse:left', () => called++), ''),
        { close_on: ['mouse:left'] },
      );
      const p = s.show();
      mock_event(s.root, new MouseEvent('mousedown', { button: 0 }));
      await p;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('mouse:left', () => called++), ''),
        { close_on: ['mousedown'] },
      );
      const p = s.show();
      mock_event(s.root, new MouseEvent('mousedown', { button: 0 }));
      await p;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('mousedown', () => called++), ''),
        { close_on: ['mouse:left'] },
      );
      const p = s.show();
      mock_event(s.root, new MouseEvent('mousedown', { button: 0 }));
      await p;
      expect(called, 1);
    }
  },
  async 'listener - shortcut priority'() {
    const test = async (shortcut: keyof SceneEventMap, event: Event) => {
      using s = DefaultScene((p: {}, ctx) => {
        let times: { shortcut: number; native: number };
        ctx
          .on('scene:show', () => (times = { shortcut: 0, native: 0 }))
          .on(shortcut, () => (times.shortcut = times.native + 1)) //@ts-ignore
          .on(event.type, () => (times.native = times.shortcut + 1));
        return { node: [], data: () => times };
      });

      for (let i = 0; i < 20; i++) {
        const p = s.show();
        mock_event(s.root, event);
        const { shortcut, native } = await p;
        expect(shortcut, 1);
        expect(native, 2);
      }
    };

    await test('key:1', new KeyboardEvent('keydown', { key: '1' }));
    await test('key:q', new KeyboardEvent('keydown', { key: 'q' }));
    await test('key: ', new KeyboardEvent('keydown', { key: ' ' }));
    await test('key:Enter', new KeyboardEvent('keydown', { key: 'Enter' }));
    await test('mouse:left', new MouseEvent('mousedown', { button: 0 }));
    await test('mouse:middle', new MouseEvent('mousedown', { button: 1 }));
    await test('mouse:right', new MouseEvent('mousedown', { button: 2 }));
  },
  async 'show - display DOM'() {
    const node = div('world');
    using s = DefaultScene((p: {}) => node);
    expect(node.isConnected);
    expect(node.textContent, 'world');
    expect(node.getBoundingClientRect().width, 0);

    const p = s.show();
    expect(node.isConnected);
    expect(node.textContent, 'world');
    expect(node.getBoundingClientRect().width > 0);

    await p;
    expect(node.isConnected);
    expect(node.textContent, 'world');
    expect(node.getBoundingClientRect().width, 0);
  },
  async 'show - return data'() {
    {
      using s = DefaultScene((p: {}) => '');
      const data = await s.show();
      expect(typeof data.start_time, 'number');
      expect(!Number.isNaN(data.start_time));
      expect(data.frame_times, [], 1);
    }
    {
      using s = DefaultScene((p: {}) => '', { record_frame_times: true });
      const data = await s.show();
      expect(typeof data.start_time, 'number');
      expect(!Number.isNaN(data.start_time));
      expect(Array.isArray(data.frame_times));
      expect(data.frame_times.length > 0);
    }
  },
  async 'show - repeat call'() {
    await expect_error(async () => {
      using s = DefaultScene((p: {}) => '');
      await Promise.all([s.show(), s.show()]);
    });
  },
  async 'show - multi call'() {
    const frame_times: number[] = [];
    using s = DefaultScene(
      (p: {}, ctx) => (
        ctx.on('scene:frame', (time) => frame_times.push(time)),
        ''
      ),
    );
    expect(frame_times.length, 0);
    await s.show();
    await s.show();
    await s.show();
    expect(frame_times.length, new Set(frame_times).size); // no duplicate frames
  },
  async 'config - override default options'() {
    // close on
    {
      using s = DefaultScene((p: {}) => '', { close_on: 'click' });
      using params = spy_listeners(s.root);

      const p1 = s.show();
      expect(
        map(params, (v) => v.length),
        { click: 1 },
        1,
      );
      await p1;
      expect(
        map(params, (v) => v.length),
        {},
        1,
      );

      const p2 = s.config({ close_on: ['abort', 'paste'] }).show();
      expect(
        map(params, (v) => v.length),
        { abort: 1, paste: 1 },
        1,
      );
      await p2;
      expect(
        map(params, (v) => v.length),
        {},
        1,
      );

      const p3 = s.show();
      expect(
        map(params, (v) => v.length),
        { click: 1 },
        1,
      );
      await p3;
      expect(
        map(params, (v) => v.length),
        {},
        1,
      );
    }
    // duration
    {
      let frame_count = 0;
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('scene:frame', () => frame_count++), ''),
        { duration: 50 },
      );

      await s.show();
      const original_frame_count = frame_count;

      frame_count = 0;
      await s.config({ duration: 100 }).show();
      expect_closeTo(frame_count, original_frame_count * 2, 1);

      frame_count = 0;
      await s.show();
      expect(frame_count, original_frame_count);
    }
    // timer
    {
      let frame_count = 0;
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('scene:frame', () => frame_count++), ''),
      );

      await s.show();
      expect(frame_count > 0);

      frame_count = 0;
      await s
        .config({
          createTimer({ frame_ms, duration, onStart, onFrame }) {
            let close: () => void;
            const handle = setTimeout(() => close(), duration);
            rAF(onStart);
            return {
              promise: new Promise<void>(
                (resolve) => (close = () => (clearTimeout(handle), resolve())),
              ),
              //@ts-ignore
              close,
            };
          },
        })
        .show();
      expect(frame_count, 0);

      frame_count = 0;
      await s.show();
      expect(frame_count > 0);
    }
    // record frame times
    {
      using s = DefaultScene((p: {}, ctx) => '');

      const d1 = await s.show();
      expect(d1.frame_times, [], 1);

      const d2 = await s.config({ record_frame_times: true }).show();
      expect(d2.frame_times.length > 0);

      const d3 = await s.config({ record_frame_times: false }).show();
      expect(d3.frame_times, [], 1);

      const d4 = await s.show();
      expect(d4.frame_times, [], 1);
    }
  },
  async 'close - immediately'() {
    {
      using s = DefaultScene((p: {}) => '');
      const p = s.show();
      s.close();
      const data = await p;
      expect(Number.isNaN(data.start_time));
    }
    {
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('scene:show', () => ctx.close()), ''),
      );
      const data = await s.show();
      expect(Number.isNaN(data.start_time));
    }
  },
  async 'close - with DOM listeners'() {
    {
      using s = DefaultScene((p: {}) => '', { close_on: 'key: ' });
      const p = s.show();
      mock_event(s.root, new KeyboardEvent('keydown', { key: ' ' }));
      const data = await p;
    }
    {
      using s = DefaultScene(
        (p: {}, ctx) => (ctx.on('mouse:middle', () => ctx.close()), ''),
      );
      const p = s.show();
      mock_event(s.root, new MouseEvent('mousedown', { button: 1 }));
      await p;
    }
  },
  async 'timer - duration error [for desktop]'() {
    const node = div({ style: 'width:100px;height:100px' });
    using s = DefaultScene(
      (p: {}, ctx) => (
        ctx.on(
          'scene:show',
          () => (node.style.background = node.style.background ? '' : '#fff'),
        ),
        node
      ),
      { duration: 10 * frame_ms },
    );
    await s.show(); // mobile browser has unstable rAF timing

    await expect_dutationCloseTo(() => s.show(), 10 * frame_ms, 1);
    await expect_dutationCloseTo(
      () => s.config({ duration: 20 * frame_ms }).show(),
      20 * frame_ms,
      1,
    );
    await expect_dutationCloseTo(
      () => s.config({ duration: 100 * frame_ms }).show(),
      100 * frame_ms,
      1,
    );
    await expect_dutationCloseTo(() => s.show(), 10 * frame_ms, 1);
  },
};

const expect_EE_listenerCount = (
  ee: EventEmitter,
  expected: Record<string, number>,
) =>
  expect(
    map(ee.listeners, (v) => v!.size),
    expected,
    1,
  );
export const _EventEmitter = {
  async 'basic usage'() {
    let count = 0;
    const listener = (e: number) => (count += e);
    const ee = new EventEmitter<{ test: number }>()
      .on('test', listener)
      .emit('test', 5);
    expect(count, 5);
    expect_EE_listenerCount(ee, { test: 1 });

    ee.off('test', listener).emit('test', 10);
    expect(count, 5);
    expect_EE_listenerCount(ee, {});
  },
  async 'dispose - emit event'() {
    let disposed = 0;
    const listener = () => disposed++;
    {
      using ee = new EventEmitter().on('dispose', listener);
      expect(disposed, 0);
      expect_EE_listenerCount(ee, { dispose: 1 });
      ee.emit('dispose', null);
      expect(disposed, 1);
      expect_EE_listenerCount(ee, { dispose: 1 });
    }
    expect(disposed, 2);
  },
  async 'add - once listener'() {
    let count = 0;
    const ee = new EventEmitter<{ test: string }>().once('test', (e) => {
      expect(e, 'hello');
      expect_EE_listenerCount(ee, { test: 1 });
      count++;
    });
    expect_EE_listenerCount(ee, { test: 1 });
    ee.emit('test', 'hello');
    expect_EE_listenerCount(ee, {});
    ee.emit('test', 'hello');
    expect(count, 1);
    expect_EE_listenerCount(ee, {});
  },
  async 'add - multi listeners'() {
    let count = 0;
    const listener1 = () => count++;
    const listener2 = () => count++;
    const ee = new EventEmitter<{ test: null }>()
      .on('test', listener1)
      .on('test', listener2)
      .emit('test', null);
    expect(count, 2);
    expect_EE_listenerCount(ee, { test: 2 });

    count = 0;
    ee.off('test', listener1).emit('test', null);
    expect(count, 1);
    expect_EE_listenerCount(ee, { test: 1 });
  },
  async 'add - repeat listener'() {
    let count = 0;
    const listener = () => count++;
    const ee = new EventEmitter<{ test: null }>()
      .on('test', listener)
      .on('test', listener) // add again
      .emit('test', null);
    expect(count, 1);
    expect_EE_listenerCount(ee, { test: 1 });
  },
  async 'add - inside listener'() {
    let count = 0;
    const ee = new EventEmitter<{ test: null }>().on('test', () => {
      count++;
      ee.on('test', () => count++);
    });
    expect_EE_listenerCount(ee, { test: 1 });

    ee.emit('test', null);
    expect(count, 1);
    expect_EE_listenerCount(ee, { test: 2 });

    ee.emit('test', null);
    expect(count, 3);
    expect_EE_listenerCount(ee, { test: 3 });

    ee.emit('test', null);
    expect(count, 6);
    expect_EE_listenerCount(ee, { test: 4 });

    ee.emit('test', null);
    expect(count, 10);
    expect_EE_listenerCount(ee, { test: 5 });
  },
  async 'remove - non-existing listener'() {
    const ee = new EventEmitter<{ test: null }>().off('test', () => {}); // should not throw
    expect_EE_listenerCount(ee, {});
  },
  async 'remove - inside listener'() {
    let count = 0;
    const ee = new EventEmitter<{ test: null }>();
    const listener = () => {
      count++;
      ee.off('test', listener);
    };
    ee.on('test', listener).emit('test', null);
    expect_EE_listenerCount(ee, {});
    ee.emit('test', null);
    expect(count, 1);
  },
  async 'emit - non-existing listeners'() {
    const ee = new EventEmitter<{ test: null }>().emit('test', null); // should not throw
    expect_EE_listenerCount(ee, {});
  },
  async 'emit - inside listener'() {
    let count = 0;
    const ee = new EventEmitter<{ test: null }>().on('test', () => {
      count++;
      if (count < 3) ee.emit('test', null);
    });
    ee.emit('test', null);
    expect(count, 3);
    expect_EE_listenerCount(ee, { test: 1 });
  },
  async 'emit - multi times'() {
    let count = 0;
    const ee = new EventEmitter<{ test: number }>()
      .on('test', (e) => (count += e))
      .emit('test', 1)
      .emit('test', 2)
      .emit('test', 3);
    expect(count, 6);
    expect_EE_listenerCount(ee, { test: 1 });
  },
};
export const __typecheck__ = {
  async generic() {
    using scene = DefaultScene(
      generic(<T extends LooseObject>(defaultProps: T, ctx: Scene<any>) => {
        let props: LooseObject = defaultProps;
        ctx.on('scene:show', (newProps) => (props = newProps));
        return { node: [], data: () => props as T };
      }),
      { defaultProps: {}, duration: 1 },
    );
    const props = {
      num: 1,
      hello: 'world',
      bool: false,
      arr: [1, '', true],
      obj: { a: 1, b: '2', c: false },
    } as const;
    const data: typeof props = await scene.show(props);
    expect_includes(data, props);
  },
  on() {
    type PropertyEventMap<T, K = keyof T> = {
      //@ts-ignore
      [P in K extends `on${infer R}` ? R : never]: Parameters<T[`on${P}`]>[0];
    };
    type Equal<T, U> =
      (<G>() => G extends T ? 1 : 2) extends <G>() => G extends U ? 1 : 2
        ? true
        : false;
    type Diff<T, U> = {
      [P in keyof T]: P extends string
        ? U extends { [K in P]: infer R }
          ? Equal<T[P], R> extends true
            ? never
            : `${P} diff event`
          : `${P} not found`
        : //@ts-ignore
          `${P} is not string`;
    }[keyof T];

    type WindowDiff = Diff<PropertyEventMap<Window>, WindowEventMap>;
    type DocumentDiff = Diff<PropertyEventMap<Document>, DocumentEventMap>;
    type HTMLElementDiff = Diff<
      PropertyEventMap<HTMLElement>,
      HTMLElementEventMap
    >;
    type HTMLMediaElementDiff = Diff<
      PropertyEventMap<HTMLMediaElement>,
      HTMLMediaElementEventMap
    >;
    type HTMLBodyElementDiff = Diff<
      PropertyEventMap<HTMLBodyElement>,
      HTMLBodyElementEventMap
    >;
    type MathMLElementDiff = Diff<
      PropertyEventMap<MathMLElement>,
      MathMLElementEventMap
    >;
    type SVGElementDiff = Diff<
      PropertyEventMap<SVGElement>,
      SVGElementEventMap
    >;

    const __typecheck__: Equal<
      | WindowDiff
      | DocumentDiff
      | HTMLElementDiff
      | HTMLMediaElementDiff
      | HTMLBodyElementDiff
      | MathMLElementDiff
      | SVGElementDiff,
      'error diff event'
    > = true;

    //@ts-expect-error
    on(window, 'unknown', (e) => {});
  },
};
