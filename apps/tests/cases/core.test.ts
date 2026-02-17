import {
  type MaybeGenericComponent,
  type Timer,
  EventEmitter,
  Scene,
  createComponentAdapter,
  createTimer,
  generic,
  getCurrentScene,
} from '@psytask/core';
import { on } from 'psytask';
import type { LooseObject } from 'shared/types';
import { map, rAF } from 'shared/utils';
import van from 'vanjs-core';
import { reactive } from 'vanjs-ext';
import {
  $,
  DefaultScene,
  expect,
  expect_error,
  mock_event,
  nextFrame,
  sleep,
} from './utils';

const { button, div } = van.tags;

export const _Scene = {
  async 'get current scene'() {
    let ctx: Scene<MaybeGenericComponent>;

    // basic usage
    {
      using s = DefaultScene((p: {}) => {
        ctx = getCurrentScene();
        return '';
      });
      expect(ctx!, s);
    }

    // nested usage
    {
      using s = DefaultScene((p: {}) =>
        button({
          onclick() {
            expect_error(getCurrentScene);
          },
        }),
      );
      $(s.root, 'button').click();
    }

    // outside usage
    {
      expect_error(getCurrentScene);
    }
  },
  async 'dispose - remove DOM'() {
    const node = div();
    {
      using _ = DefaultScene((p: {}) => node);
      expect(node.isConnected);
    }
    expect(!node.isConnected);
  },
  async 'reset optional props'() {
    let currentProps: LooseObject = {};
    using s = DefaultScene(
      (p: { a: number; b?: number }) => {
        getCurrentScene().on('show', () => (currentProps = { ...p }));
        return '';
      },
      { defaultProps: { a: 1 } },
    );

    await s.show({ b: 2 });
    expect(currentProps.a, 1);
    expect(currentProps.b, 2);

    await s.show();
    expect(currentProps.a, 1);
    expect(currentProps.b, undefined);

    await s.show({ a: 0, b: 3 });
    expect(currentProps.a, 0);
    expect(currentProps.b, 3);

    await s.show();
    expect(currentProps.a, 1);
    expect(currentProps.b, undefined);
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
  //     //@ts-expect-error
  //     using _ = DefaultScene((p: typeof dp) => ((p.obj.c = 5), ''), {
  //       defaultProps: dp,
  //     });
  //   });
  //   await expect_error(async () => {
  //     const dp = { obj: { a: 1, b: 2 } };
  //     //@ts-expect-error
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
  async 'listener - scene hooks'() {
    const counts = { show: 0, close: 0, frame: 0 };
    using s = DefaultScene(
      (_: {}) => (
        getCurrentScene()
          .on('show', () => counts.show++)
          .on('close', () => counts.close++)
          .on('frame', () => counts.frame++),
        ''
      ),
      {
        timer: () => createTimer((_, records) => records.length == 2),
      },
    );
    expect(counts, { show: 0, close: 0, frame: 0 }, 1);

    await s.show();
    expect(counts.show, 1);
    expect(counts.close, 1);
    expect(counts.frame, 2);

    counts.frame = 0;
    await s.show();
    expect(counts.show, 2);
    expect(counts.close, 2);
    expect(counts.frame, 2);
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
  async 'show - multi call'() {
    const frame_times: number[] = [];
    using s = DefaultScene(
      (p: {}) => (
        getCurrentScene().on('frame', (time) => frame_times.push(time)),
        ''
      ),
    );
    expect(frame_times.length, 0);
    await s.show();
    await s.show();
    await s.show();
    expect(frame_times.length, new Set(frame_times).size); // no duplicate frames
  },
  async 'close - immediately'() {
    {
      await nextFrame();
      using s = DefaultScene((_: {}) => '');
      const p = s.show();
      s.close();
      const data = await p;
      expect(data.frame_times.length, 0);
    }
    {
      await sleep(1e2);
      using s = DefaultScene((_: {}) => '');
      const p = s.show();
      s.close();
      const data = await p;
      expect(data.frame_times.length, 0);
    }

    {
      await nextFrame();
      using s = DefaultScene((_: {}) => {
        const ctx = getCurrentScene();
        ctx.on('show', () => ctx.close());
        return '';
      });
      const data = await s.show();
      expect(data.frame_times.length, 0);
    }
    {
      await sleep(1e2);
      using s = DefaultScene((_: {}) => {
        const ctx = getCurrentScene();
        ctx.on('show', () => ctx.close());
        return '';
      });
      const data = await s.show();
      expect(data.frame_times.length, 0);
    }
  },
  async 'close - with DOM listeners'() {
    using s = DefaultScene(
      (p: {}) => {
        const ctx = getCurrentScene();
        ctx.on(
          'dispose',
          on(ctx.root, 'keydown', () => ctx.close()),
        );
        return '';
      },
      { timer: () => createTimer(() => false) },
    );
    const p = s.show();
    mock_event(s.root, 'mousedown');
    await sleep(10);
    expect(await Promise.race([p, Promise.resolve('timeout')]), 'timeout');

    mock_event(s.root, 'keydown');
    await sleep(10);
    await Promise.race([p, Promise.reject('timeout')]);
  },
  async 'data - frame times'() {
    // no frames
    {
      let frameCount = 0;
      using s = DefaultScene((p: {}) => '', {
        timer: () => createTimer(() => true),
      }).on('frame', () => frameCount++);

      const data1 = await s.show();
      expect(frameCount, 0);
      expect(data1.frame_times.length, 0);

      const data2 = await s.show(); // one frame
      expect(frameCount, 1);
      expect(data2.frame_times.length, 1);
    }

    // has frames
    {
      let frameCount = 0;
      using s = DefaultScene((p: {}) => '', {
        timer: () => createTimer((_, records) => records.length > 2),
      }).on('frame', () => frameCount++);

      const data1 = await s.show();
      expect(frameCount, 3);
      expect(data1.frame_times.length, 3);
      expect(typeof data1.frame_times[0], 'number');

      const data2 = await s.show();
      expect(frameCount, 6);
      expect(data2.frame_times.length, 3);
      expect(typeof data2.frame_times[0], 'number');
      expect(data1.frame_times[0] !== data2.frame_times[0]);
    }
  },
  async 'data - start time'() {
    using s = DefaultScene((p: {}) => '', {
      timer: () => createTimer((_, records) => records.length > 2),
    }).on('frame', (time) => performance.mark('f-' + time));

    // sole show
    {
      let startTime = NaN;
      rAF((time) => (startTime = time) && performance.mark('s-' + time));
      const { frame_times } = await s.show();
      expect(frame_times[0], startTime);
    }

    // delay show
    {
      const data1 = await s.show();
      await sleep(0);
      const data2 = await s.show();
      expect(
        data1.frame_times[data1.frame_times.length - 1]! <
          data2.frame_times[0]!,
      );
    }

    // multi show
    {
      const data1 = await s.show();
      const data2 = await s.show();
      expect(
        data1.frame_times[data1.frame_times.length - 1]! <
          data2.frame_times[0]!,
      );
    }

    // rAF callback
    {
      let startTime = NaN,
        records: number[] = [];
      rAF((time) => {
        startTime = time;
        s.show().then(({ frame_times }) => (records = frame_times));
      });

      await nextFrame();
      await sleep(1e2);
      expect(records[0], startTime);
    }
  },
  async 'data - duration'() {
    {
      using s = DefaultScene((_: {}) => '', {
        timer: () => createTimer((_, records) => records.length > 2),
      });

      const data1 = await s.show();
      const data2 = await s.show();
      expect(data2.frame_times[0]! - data1.frame_times[0]!, data1.duration);
    }

    {
      using s = DefaultScene((_: {}) => '', {
        timer: () => createTimer(() => false),
      });

      setTimeout(() => s.close(), 1e2);
      const data1 = await s.show();
      setTimeout(() => s.close(), 1e2);
      const data2 = await s.show();
      expect(data2.frame_times[0]! - data1.frame_times[0]!, data1.duration);
    }
  },
};
export const _Adapter = {
  async 'render - default props'() {
    const adapter = createComponentAdapter((e) => e);
    const { props } = adapter.render((p: { a: number }) => '', { a: 1 });
    expect(props, { a: 1 }, 1);
  },
  async 'render - reactive props'() {
    let count = 0;
    const adapter = createComponentAdapter((e) => {
      count++;
      return e;
    });
    adapter.render((p: {}) => '', {});
    expect(count, 1);
  },
  async 'render - normalize node'() {
    const adapter = createComponentAdapter((e) => e);

    // string
    {
      const { nodes } = adapter.render((p: {}) => 'text', {});
      expect(nodes, ['text'], 1);
    }
    {
      const { nodes } = adapter.render((p: {}) => ['text'], {});
      expect(nodes, ['text'], 1);
    }

    // element
    {
      const node = div();
      const { nodes } = adapter.render((p: {}) => node, {});
      expect(nodes.length, 1);
      expect(nodes[0], node);
    }
    {
      const node1 = div();
      const node2 = div();
      const { nodes } = adapter.render((p: {}) => [node1, node2], {});
      expect(nodes.length, 2);
      expect(nodes[0], node1);
      expect(nodes[1], node2);
    }

    // hybrid
    {
      const node = div();
      const { nodes } = adapter.render(
        (p: {}) => ({ node: [node, 'text'], data: () => ({}) }),
        {},
      );
      expect(nodes.length, 2);
      expect(nodes[0], node);
      expect(nodes[1], 'text');
    }
  },
  // integrate with reactivity libs
  async 'with vanjs-ext'() {
    const node = div();
    const { props } = createComponentAdapter(reactive).render(
      (p: { text: string }) => {
        van.derive(() => {
          node.textContent = p.text;
        });
        return node;
      },
      { text: 'hello' },
    );
    expect(node.textContent, 'hello');

    props.text = 'world';
    await 0;
    expect(node.textContent, 'world');
  },
  async 'with @vue/reactivity'() {
    const { shallowReactive, effect } = await import(
      //@ts-expect-error external module
      'https://esm.sh/@vue/reactivity@3.5.25?exports=shallowReactive,effect'
    );
    const node = div();
    const { props } = createComponentAdapter(shallowReactive).render(
      (p: { text: string }) => {
        effect(() => {
          node.textContent = p.text;
        });
        return node;
      },
      { text: 'hello' },
    );
    expect(node.textContent, 'hello');

    props.text = 'world';
    await 0;
    expect(node.textContent, 'world');
  },
  async 'with @solidjs/signals'() {
    const { createStore, createEffect } = await import(
      //@ts-expect-error external module
      'https://esm.sh/@solidjs/signals@0.8.2?exports=createStore,createEffect'
    );
    const node = div();
    const { props } = createComponentAdapter((obj) => {
      const [state, setState] = createStore(obj);
      return new Proxy(state, {
        set: (target, prop, value) => (
          setState(() => ({ [prop]: value })),
          true
        ),
      });
    }).render(
      (p: { text: string }) => {
        createEffect(
          () => p.text,
          (val: string) => {
            node.textContent = val;
          },
        );
        return node;
      },
      { text: 'hello' },
    );
    await 0;
    expect(node.textContent, 'hello');

    props.text = 'world';
    await 0;
    expect(node.textContent, 'world');
  },
  async 'with @preact/signals-core'() {
    const { signal, effect } = await import(
      //@ts-expect-error external module
      'https://esm.sh/@preact/signals-core@1.12.1?exports=signal,effect'
    );
    const node = div();
    const { props } = createComponentAdapter(
      (obj) =>
        new Proxy(
          map(obj, (value) => signal(value)),
          {
            get: (target, prop) => target[prop as string].value,
            set: (target, prop, value) => {
              target[prop as string].value = value;
              return true;
            },
          },
        ),
    ).render(
      (p: { text: string }) => {
        effect(() => {
          node.textContent = p.text;
        });
        return node;
      },
      { text: 'hello' },
    );
    expect(node.textContent, 'hello');

    props.text = 'world';
    await 0;
    expect(node.textContent, 'world');
  },
  async 'with mobx'() {
    const { observable, autorun } = await import(
      //@ts-expect-error external module
      'https://esm.sh/mobx@6.15.0?exports=observable,autorun'
    );
    const node = div();
    const { props } = createComponentAdapter(observable).render(
      (p: { text: string }) => {
        autorun(() => {
          node.textContent = p.text;
        });
        return node;
      },
      { text: 'hello' },
    );
    expect(node.textContent, 'hello');

    props.text = 'world';
    await 0;
    expect(node.textContent, 'world');
  },
  async 'with valtio/vanilla'() {
    const { proxy, subscribe } = await import(
      //@ts-expect-error external module
      'https://esm.sh/valtio@2.2.0/vanilla?exports=proxy,subscribe'
    );
    const node = div();
    const { props } = createComponentAdapter(proxy).render(
      (p: { text: string }) => {
        const update = () => (node.textContent = p.text);
        subscribe(p, update);
        update();
        return node;
      },
      { text: 'hello' },
    );
    expect(node.textContent, 'hello');

    props.text = 'world';
    await 0;
    expect(node.textContent, 'world');
  },
  async 'with nanostores'() {
    const { map } = await import(
      //@ts-expect-error external module
      'https://esm.sh/nanostores@0.9.5?exports=map'
    );
    const node = div();
    const { props } = createComponentAdapter(
      (obj) =>
        new Proxy(map(obj), {
          get: (target, prop) =>
            prop === 'subscribe'
              ? target.subscribe.bind(target)
              : target.get()[prop],
          set: (target, prop, value) => {
            target.setKey(prop, value);
            return true;
          },
        }),
    ).render(
      //eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required for test
      (p: any) => {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required for test
        p.subscribe((v: any) => (node.textContent = v.text));
        return node;
      },
      { text: 'hello' },
    );
    expect(node.textContent, 'hello');

    props.text = 'world';
    await 0;
    expect(node.textContent, 'world');
  },
};
export const _Timer = {
  async 'factory pattern'() {
    let created = 0;
    const timer_factory = () => {
      created++;
      return createTimer(() => true);
    };

    using s1 = DefaultScene((p: {}) => '', { timer: timer_factory });
    expect(created, 1);

    using s2 = DefaultScene((p: {}) => '', { timer: timer_factory });
    expect(created, 2);
  },
  async 'on frame'() {
    const frame_count = {
      hook: 0,
      timer: 0,
    };
    using s = DefaultScene(
      (p: {}) => (getCurrentScene().on('frame', () => frame_count.hook++), ''),
      {
        defaultProps: {},
        timer: () =>
          createTimer((time, records) => {
            frame_count.timer++;
            return time - records[0]! > 100; // timeout after 100ms
          }),
      },
    );
    await s.show();
    expect(frame_count.hook > 0);
    expect(frame_count.timer, frame_count.hook + 1);
  },
  async 'off frame'() {
    let frame_count = 0;
    using s = DefaultScene(
      (p: {}) => (getCurrentScene().on('frame', () => frame_count++), ''),
      {
        defaultProps: {},
        timer() {
          const timer: Timer = {
            start: (cb) =>
              new Promise((resolve) => {
                const handle = setTimeout(() => timer.stop(), 100);
                timer.stop = () => (clearTimeout(handle), resolve([]));
              }),
            stop() {},
          };
          return timer;
        },
      },
    );
    await s.show();
    expect(frame_count, 0);
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
      ee.emit('dispose');
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

const __typecheck__ = {
  async generic() {
    const comp = <T extends {}>(props: T) => ({ node: '', data: () => props });
    using scene = DefaultScene(generic(comp), { defaultProps: {} });
    const props = {
      num: 1,
      hello: 'world',
      bool: false,
      arr: [1, '', true],
      obj: { a: 1, b: '2', c: false },
    } as const;
    const __should_be_same_type__: typeof props = await scene.show(props);
  },
};
