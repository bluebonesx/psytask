import { adapter } from '@psytask/components';
import {
  Collector,
  createApp,
  createIterableBuilder,
  defaultProps,
  detectFPS,
  getCurrentScene,
  on,
  RandomSampling,
  StairCase,
} from 'psytask';
import { doc, ERR, map, mount, rAF } from 'shared/utils';
import van from 'vanjs-core';
import { reactive } from 'vanjs-ext';
import {
  expect,
  expect_closeTo,
  expect_error,
  expect_includes,
  mock_event,
  mock_leaveAndBack,
  nextFrame,
  sleep,
  spy_browserDownload,
  spy_functionCall,
  spy_listeners,
} from './utils';

const { div, iframe } = van.tags;

// App
export const _createApp = {
  async 'more frames count'() {
    const frame_count = 26;
    let frame_calls = 0;
    const counter = () => ++frame_calls < frame_count && rAF(counter);
    rAF(counter);
    using app = await createApp({ frame_count });
    expect(frame_calls, frame_count);
  },
  async 'alert on leave (enabled)'() {
    using alertParams = spy_functionCall(window, 'alert', () => {});
    const appPromise = createApp({ alert_on_leave: true });

    using goParams = spy_functionCall(history, 'go', () => {});
    await mock_leaveAndBack();
    expect(goParams.length, 1);
    expect(goParams[0]![0], void 0);
    expect(alertParams.length, 1);

    using app = await appPromise;
    await mock_leaveAndBack();
    expect(alertParams.length, 2);
    expect(app.data.leave_count, 1);

    await mock_leaveAndBack();
    expect(alertParams.length, 3);
    expect(app.data.leave_count, 2);
  },
  async 'alert on leave (disabled)'() {
    using alertParams = spy_functionCall(window, 'alert', () => {});
    const appPromise = createApp({ alert_on_leave: false });

    using goParams = spy_functionCall(history, 'go', () => {});
    await mock_leaveAndBack();
    expect(goParams.length, 1);
    expect(goParams[0]![0], void 0);
    expect(alertParams.length, 1); // fps alert

    using app = await appPromise;
    await mock_leaveAndBack();
    expect(alertParams.length, 1); // no new alert
    expect(app.data.leave_count, 1); // count still increases

    await mock_leaveAndBack();
    expect(alertParams.length, 1); // no new alert
    expect(app.data.leave_count, 2); // count still increases
  },
  async 'i18n - chinese'() {
    using alertParams = spy_functionCall(window, 'alert', () => {});
    const i18n = {
      leave_alert_on_fps: '请不要在检测屏幕刷新率时离开！',
      leave_alert_on_task: '请不要在任务进行时离开！',
      beforeunload_alert: '离开页面将丢失您的进度，您确定吗？',
    };
    const appPromise = createApp({ alert_on_leave: true, i18n });

    using goParams = spy_functionCall(history, 'go', () => {});
    await mock_leaveAndBack();
    expect(goParams.length, 1);
    expect(goParams[0]![0], void 0);
    expect(alertParams.length, 1);
    expect(alertParams[0]![0], i18n.leave_alert_on_fps);

    using app = await appPromise;
    await mock_leaveAndBack();
    expect(alertParams.length, 2);
    expect(alertParams[1]![0], i18n.leave_alert_on_task);

    await mock_leaveAndBack();
    expect(alertParams.length, 3);
    expect(alertParams[2]![0], i18n.leave_alert_on_task);
  },
};
export const _App = {
  async 'dispose - remove DOM'() {
    const iframeEl = mount(iframe({ hidden: true }));
    const root = mount(div(), iframeEl.contentDocument!.body!);
    {
      using app = await createApp({ root });
      expect(app.root, root);
      expect(root.isConnected);
    }
    expect(root.isConnected, false);
    iframeEl.remove();
  },
  async 'dispose - remove listeners'() {
    using win_listeners = spy_listeners(window);
    using doc_listeners = spy_listeners(doc);
    {
      using app = await createApp({ alert_on_leave: true });
      expect(
        Object.values({ ...win_listeners, ...doc_listeners }).reduce(
          (acc, l) => acc + l.length,
          0,
        ),
        2,
      );
    }
    expect({ ...win_listeners, ...doc_listeners }, {}, 1);
  },
  // collector
  async 'collector - add row'() {
    using app = await createApp();

    let text = '';
    const rows: unknown[] = [];
    using dc = app
      .collector('test_data.csv')
      .on('add', (row) => rows.push(row))
      .on('chunk', (chunk) => (text += chunk));
    expect(dc instanceof Collector);

    dc.add({ a: 1, b: 'hello' });
    expect(text, dc.final());

    dc.add({ a: 2, b: 'world' });
    expect(text, dc.final());

    dc.add({ a: 3, b: '!' });
    expect(text, dc.final());

    expect(rows.length, 3);
    expect(dc.rows, rows, 1);
  },
  async 'collector - add shared data'() {
    using app = await createApp();
    using dc = app.collector('test_data.csv');

    app.data['test_a'] = 123;
    app.data['test_b'] = 'hello';
    app.data['test_c'] = false;
    app.data['test_d'] = [1, 2, 3];
    app.data['test_e'] = { x: 1, y: 2 };
    dc.add({ trial: 1 });

    app.data['test_a'] = 456;
    app.data['test_b'] = 'world';
    app.data['test_c'] = true;
    dc.add({ trial: 2 });

    expect(dc.rows.length, 2);
    expect(
      dc.rows[0]!,
      {
        trial: 1,
        frame_ms: app.data.frame_ms,
        leave_count: 0,
        test_a: 123,
        test_b: 'hello',
        test_c: false,
        test_d: [1, 2, 3],
        test_e: { x: 1, y: 2 },
      },
      1,
    );
    expect(
      dc.rows[1]!,
      {
        trial: 2,
        frame_ms: app.data.frame_ms,
        leave_count: 0,
        test_a: 456,
        test_b: 'world',
        test_c: true,
        test_d: [1, 2, 3],
        test_e: { x: 1, y: 2 },
      },
      1,
    );
  },
};
export const _Scene = {
  async 'full size DOM'() {
    using app = await createApp();
    using s = app.scene((props: { text: string }) => div(() => props.text), {
      adapter,
      defaultProps: { text: '' },
      duration: 500,
    });
    const { root } = s;

    expect(root.isConnected);
    expect(root.textContent, '');
    let rect = root.getBoundingClientRect();
    expect_includes(rect, { width: 0, height: 0 });

    const showPromise = s.show({ text: 'Hello' });
    rect = root.getBoundingClientRect();
    expect_includes(rect, { x: 0, y: 0 });
    expect_closeTo(rect.width, window.innerWidth, 1);
    expect_closeTo(rect.height, window.innerHeight, 1);
    await 0;
    expect(root.textContent, 'Hello');

    await showPromise;
    expect(root.textContent, 'Hello');
    rect = root.getBoundingClientRect();
    expect_includes(rect, { width: 0, height: 0 });
  },
  async 'config - override default options'() {
    using app = await createApp();

    // close on
    {
      using s = app.scene((_: {}) => '', {
        defaultProps: {},
        close_on: 'click',
      });
      using params = spy_listeners(s.root);

      let p = s.show();
      expect(
        map(params, (v) => v.length),
        { click: 1 },
        1,
      );
      mock_event(s.root, 'click');
      await nextFrame();
      await Promise.race([p, Promise.reject(Error('not closed'))]);
      expect(
        map(params, (v) => v.length),
        {},
        1,
      );

      p = s.config({ close_on: ['abort', 'paste'] }).show();
      expect(
        map(params, (v) => v.length),
        { abort: 1, paste: 1 },
        1,
      );
      mock_event(s.root, 'click');
      await nextFrame();
      expect(
        await Promise.race([p, Promise.resolve('not closed')]),
        'not closed',
      );
      mock_event(s.root, 'abort');
      await sleep(0);
      await Promise.race([p, Promise.reject(Error('not closed'))]);
      expect(
        map(params, (v) => v.length),
        {},
        1,
      );

      p = s.show();
      expect(
        map(params, (v) => v.length),
        { click: 1 },
        1,
      );
      mock_event(s.root, 'click');
      await nextFrame();
      await Promise.race([p, Promise.reject(Error('not closed'))]);
      expect(
        map(params, (v) => v.length),
        {},
        1,
      );
    }

    // duration
    {
      let frame_count = 0;
      using s = app.scene(
        (_: {}) => {
          getCurrentScene().on('frame', () => frame_count++);
          return '';
        },
        {
          defaultProps: {},
          duration: app.data.frame_ms * 10,
        },
      );

      await s.show();
      const original_frame_count = frame_count;

      frame_count = 0;
      await s.config({ duration: app.data.frame_ms * 20 }).show();
      expect(frame_count > original_frame_count);

      frame_count = 0;
      await s.show();
      expect_closeTo(frame_count, original_frame_count, 10); //TODO: less threshold
    }
  },
  async 'config - restore undefined'() {
    using app = await createApp();

    // close on
    {
      using s = app.scene((_: {}) => '', {
        defaultProps: {},
      });
      using params = spy_listeners(s.root);

      let p = s.show();
      expect(
        map(params, (v) => v.length),
        {},
        1,
      );
      s.close();
      await nextFrame();
      await Promise.race([p, Promise.reject(Error('not closed'))]);
      expect(
        map(params, (v) => v.length),
        {},
        1,
      );

      p = s.config({ close_on: 'click' }).show();
      expect(
        map(params, (v) => v.length),
        { click: 1 },
        1,
      );
      mock_event(s.root, 'click');
      await nextFrame();
      await Promise.race([p, Promise.reject(Error('not closed'))]);
      expect(
        map(params, (v) => v.length),
        {},
        1,
      );

      p = s.show();
      expect(
        map(params, (v) => v.length),
        {},
        1,
      );
      s.close();
      await nextFrame();
      await Promise.race([p, Promise.reject(Error('not closed'))]);
      expect(
        map(params, (v) => v.length),
        {},
        1,
      );
    }

    // duration
    {
      let frame_count = 0;
      using s = app.scene(
        (_: {}) => {
          getCurrentScene().on('frame', () => frame_count++);
          return '';
        },
        { defaultProps: {} },
      );

      let p = s.show();
      await nextFrame();
      expect(
        await Promise.race([p, Promise.resolve('not closed')]),
        'not closed',
      );
      s.close();
      await p;

      const original_frame_count = frame_count;
      frame_count = 0;
      await s.config({ duration: 1e2 }).show();
      expect(frame_count > original_frame_count);

      p = s.show();
      await sleep(0);
      expect(
        await Promise.race([p, Promise.resolve('not closed')]),
        'not closed',
      );
      s.close();
      await p;
    }
  },
  async 'listener - repeat with close_on'() {
    using app = await createApp();

    // native
    {
      let called = 0;
      using s = app.scene(
        (p: {}) => {
          const ctx = getCurrentScene();
          ctx.on(
            'dispose',
            on(ctx.root, 'pointerdown', () => called++),
          );
          return '';
        },
        {
          adapter,
          defaultProps: {},
          close_on: 'pointerdown',
        },
      );
      const p = s.show();
      mock_event(s.root, 'pointerdown');
      await p;
      expect(called, 1);
    }

    // key shortcut
    {
      let called = 0;
      using s = app.scene(
        (p: {}) => {
          const ctx = getCurrentScene();
          ctx.on(
            'dispose',
            on(ctx.root, 'keydown', (e) => e.key === ' ' && called++),
          );
          return '';
        },
        {
          adapter,
          defaultProps: {},
          close_on: 'key:s',
        },
      );
      const p1 = s.show();
      mock_event(s.root, new KeyboardEvent('keydown', { key: ' ' }));
      mock_event(s.root, new KeyboardEvent('keydown', { key: 's' }));
      await p1;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = app.scene(
        (p: {}) => {
          const ctx = getCurrentScene();
          ctx.on(
            'dispose',
            on(ctx.root, 'keydown', (e) => e.key === 'q' && called++),
          );
          return '';
        },
        {
          adapter,
          defaultProps: {},
          close_on: 'key:q',
        },
      );
      const p = s.show();
      mock_event(s.root, new KeyboardEvent('keydown', { key: 'q' }));
      await p;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = app.scene(
        (p: {}) => {
          const ctx = getCurrentScene();
          ctx.on(
            'dispose',
            on(ctx.root, 'keydown', () => called++),
          );
          return '';
        },
        {
          adapter,
          defaultProps: {},
          close_on: 'key: ',
        },
      );
      const p = s.show();
      mock_event(s.root, new KeyboardEvent('keydown', { key: ' ' }));
      await p;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = app.scene(
        (p: {}) => {
          const ctx = getCurrentScene();
          ctx.on(
            'dispose',
            on(ctx.root, 'keydown', (e) => e.key === ' ' && called++),
          );
          return '';
        },
        {
          adapter,
          defaultProps: {},
          close_on: 'keydown',
        },
      );
      const p = s.show();
      mock_event(s.root, new KeyboardEvent('keydown', { key: ' ' }));
      await p;
      expect(called, 1);
    }

    // mouse shortcut
    {
      let called = 0;
      using s = app.scene(
        (p: {}) => {
          const ctx = getCurrentScene();
          ctx.on(
            'dispose',
            on(ctx.root, 'mousedown', (e) => e.button === 0 && called++),
          );
          return '';
        },
        {
          adapter,
          defaultProps: {},
          close_on: 'mouse:right',
        },
      );
      const p = s.show();
      mock_event(s.root, new MouseEvent('mousedown', { button: 0 }));
      mock_event(s.root, new MouseEvent('mousedown', { button: 2 }));
      await p;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = app.scene(
        (p: {}) => {
          const ctx = getCurrentScene();
          ctx.on(
            'dispose',
            on(ctx.root, 'mousedown', (e) => e.button === 0 && called++),
          );
          return '';
        },
        {
          adapter,
          defaultProps: {},
          close_on: 'mouse:left',
        },
      );
      const p = s.show();
      mock_event(s.root, new MouseEvent('mousedown', { button: 0 }));
      await p;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = app.scene(
        (p: {}) => {
          const ctx = getCurrentScene();
          ctx.on(
            'dispose',
            on(ctx.root, 'mousedown', (e) => e.button === 0 && called++),
          );
          return '';
        },
        {
          adapter,
          defaultProps: {},
          close_on: 'mousedown',
        },
      );
      const p = s.show();
      mock_event(s.root, new MouseEvent('mousedown', { button: 0 }));
      await p;
      expect(called, 1);
    }
    {
      let called = 0;
      using s = app.scene(
        (p: {}) => {
          const ctx = getCurrentScene();
          ctx.on(
            'dispose',
            on(ctx.root, 'mousedown', (e) => called++),
          );
          return '';
        },
        {
          adapter,
          defaultProps: {},
          close_on: 'mouse:left',
        },
      );
      const p = s.show();
      mock_event(s.root, new MouseEvent('mousedown', { button: 0 }));
      await p;
      expect(called, 1);
    }
  },
  async 'props - shallow reactive'() {
    let renderCount = 0;
    let derivedValue = 0;
    let changeNested: ((v: number) => void) | null = null;

    using app = await createApp();
    using s = app.scene(
      (props: { nested: { value: number } }) => {
        changeNested = (newValue: number) => {
          props.nested.value = newValue;
        };
        van.derive(() => {
          renderCount++;
          derivedValue = props.nested.value;
        });
        return '';
      },
      {
        adapter,
        defaultProps: { nested: { value: 1 } },
        duration: 0,
      },
    );
    expect(typeof changeNested, 'function');
    expect(renderCount, 1);
    expect(derivedValue, 1);

    changeNested!(2);
    await 0;
    expect(renderCount, 1);
    expect(derivedValue, 1);

    await s.show({ nested: { value: 3 } });
    expect(renderCount, 2);
    expect(derivedValue, 3);
  },
  async 'props - get non-exist key'() {
    let runCount = 0;
    let derivedValue: string | undefined;

    using app = await createApp();
    using s = app.scene(
      (props: { optional?: string }) => {
        van.derive(() => {
          runCount++;
          derivedValue = props.optional;
        });
        return '';
      },
      { adapter, defaultProps: {}, duration: 0 },
    );
    expect(runCount, 1);
    expect(derivedValue, void 0);

    await s.show({ optional: 'hello' });
    expect(runCount, 2);
    expect(derivedValue, 'hello');

    await s.show();
    expect(runCount, 3);
    expect(derivedValue, void 0);
  },
};

// Iterator
export const _IterableBuilder = {
  async 'repeat call'() {
    const it = createIterableBuilder(function* () {
      yield 0;
      yield 1;
      yield 2;
    })();
    await expect_error(() => {
      for (const v of it);
      for (const v of it);
    });
  },
  'use response'() {
    const it = createIterableBuilder(function* () {
      const r: number = yield yield yield 0;
      return r;
    })();
    for (const v of it) it.response(v + 1);
    expect(it.data, 3);
  },
  'no response'() {
    const it = createIterableBuilder(function* () {
      yield 0;
      yield 1;
      yield 2;
    })();
    //@ts-expect-error response should be never
    for (const v of it) it.response(v + 1);
  },
  async 'get data on iterate'() {
    const it = createIterableBuilder(function* () {
      yield 0;
      yield 1;
      yield 2;
      return 'done';
    })();
    await expect_error(() => {
      for (const v of it) it.data;
    });
  },
  'basic usage'() {
    const it = createIterableBuilder(function* () {
      yield 0;
      yield 1;
      yield 2;
      return 'done';
    })();
    expect([...it], [0, 1, 2], 1);
    expect(it.data, 'done');
  },
};
export const _RandomSampling = {
  async 'repeat call'() {
    const rs = RandomSampling({ candidates: [1, 2, 3] });
    await expect_error(() => {
      for (const v of rs);
      for (const v of rs);
    });
  },
  'use response'() {
    const rs = RandomSampling({ candidates: [1, 2, 3] });
    //@ts-expect-error response should be never
    for (const v of rs) rs.response(true);
  },
  'default options'() {
    const candidates = Array.from({ length: 20 }, (_, i) => i);
    const rs = [...RandomSampling({ candidates })];
    expect(rs.length, candidates.length);
    expect(new Set(rs).size <= rs.length);
    expect(
      rs.every((e) => candidates.includes(e)),
      true,
    );
  },
  "don't mutate input"() {
    const candidates = Array.from({ length: 20 }, (_, i) => i);
    const candidates_copy = [...candidates];
    [...RandomSampling({ candidates, sample: 10, replace: false })];
    expect(candidates, candidates_copy, 1);
  },
  'empty candidates'() {
    const rs = [...RandomSampling({ candidates: [], sample: 10 })];
    expect(rs.length, 0);
  },
  'repeat candidates'() {
    const candidates = [1, 1, 1, 2, 2, 3];
    const rs = [...RandomSampling({ candidates, replace: false })];
    expect(rs.length, candidates.length);
    expect([...new Set(rs)].sort(), [1, 2, 3], 1);
  },
  'hybrid candidates'() {
    const candidates = [1, 'two', { three: 3 }, [4]] as const;
    const rs = [...RandomSampling({ candidates, sample: 10, replace: true })];
    expect(rs.length, 10);
    expect(
      rs.every((e) => candidates.includes(e)),
      true,
    );
    const __typecheck__: (typeof candidates)[number] = rs[0]!;
  },
  'no sample'() {
    const candidates = Array.from({ length: 20 }, (_, i) => i);
    const rs = [...RandomSampling({ candidates, sample: 0, replace: true })];
    expect(rs.length, 0);
  },
  'without replacement'() {
    const candidates = Array.from({ length: 20 }, (_, i) => i);
    const rs = [...RandomSampling({ candidates, replace: false })];
    expect(rs.length, candidates.length);
    expect(new Set(rs).size, rs.length);
    expect(
      rs.every((e) => candidates.includes(e)),
      true,
    );
  },
  'without replacement - sample < candidates.length'() {
    const candidates = Array.from({ length: 20 }, (_, i) => i);
    const rs = [...RandomSampling({ candidates, sample: 10, replace: false })];
    expect(rs.length, 10);
    expect(new Set(rs).size, rs.length);
    expect(
      rs.every((e) => candidates.includes(e)),
      true,
    );
  },
  async 'without replacement - sample > candidates.length'() {
    const candidates = Array.from({ length: 5 }, (_, i) => i);
    await expect_error(() => {
      [...RandomSampling({ candidates, sample: 10, replace: false })];
    });
  },
};

const expect_StairCase_data = (
  iterable: ReturnType<typeof StairCase>,
  expected: [value: number, response: boolean][],
) => {
  const iter = iterable[Symbol.iterator]();
  let prev_response: boolean | undefined;
  const reversal_values: number[] = [];

  for (const [expectedValue, response] of expected) {
    // step
    const { value, done } = iter.next();
    if (done) throw ERR('Iterator ended too soon');
    expect_closeTo(value, expectedValue, 1e-6);
    iterable.response(response);
    // log reversals
    if (typeof prev_response !== 'undefined' && response !== prev_response)
      reversal_values.push(value);
    prev_response = response;
  }

  // finalize
  const { value, done } = iter.next();
  if (!done) throw ERR('Iterator did not end as expected');

  // assert threshold
  const expectedThreshold =
    reversal_values.reduce((a, b) => a + b) / reversal_values.length;
  const threshold = iterable.data
    .filter((e) => e.reversal)
    .reduce((acc, v, i, arr) => acc + v.value / arr.length, 0);
  expect_closeTo(threshold, expectedThreshold, 1e-6);
};
export const _StairCase = {
  async 'repeat call'() {
    const sc = StairCase({
      start: 5,
      step: 1,
      up: 1,
      down: 2,
      reversals: 2,
      trials: 3,
    });
    await expect_error(() => {
      for (const v of sc) sc.response(true);
      for (const v of sc) sc.response(true);
    });
  },
  async 'no response'() {
    const sc = StairCase({
      start: 5,
      step: 1,
      up: 1,
      down: 2,
      reversals: 2,
      trials: 3,
    });
    await expect_error(() => {
      for (const v of sc);
    });
  },
  async 'get data on iterate'() {
    const sc = StairCase({
      start: 5,
      step: 1,
      up: 1,
      down: 2,
      reversals: 2,
      trials: 3,
    });
    await expect_error(() => {
      for (const v of sc) {
        sc.response(true);
        sc.data;
      }
    });
  },
  '1-up-1-down before first reversal'() {
    expect_StairCase_data(
      StairCase({ start: 5.1, step: 1.3, up: 2, down: 2, reversals: 3 }),
      [
        [5.1, true],
        [3.8, true],
        [2.5, true],
        [1.2, true],
        [-0.1, true],
        [-1.4, true],
        [-2.7, false],
        [-2.7, false],
        [-1.4, false],
        [-1.4, false],
        [-0.1, false],
        [-0.1, false],
        [1.2, false],
        [1.2, false],
        [2.5, true],
        [2.5, true],
        [1.2, true],
        [1.2, true],
        [-0.1, true],
        [-0.1, true],
        [-1.4, false],
      ],
    );
  },
  'negative start'() {
    expect_StairCase_data(
      StairCase({ start: -3.5, step: 2.5, up: 2, down: 2, reversals: 3 }),
      [
        [-3.5, true],
        [-6.0, true],
        [-8.5, true],
        [-11.0, true],
        [-13.5, true],
        [-16.0, false],
        [-16.0, false],
        [-13.5, false],
        [-13.5, false],
        [-11.0, false],
        [-11.0, false],
        [-8.5, true],
        [-8.5, true],
        [-11.0, true],
        [-11.0, true],
        [-13.5, true],
        [-13.5, true],
        [-16.0, false],
      ],
    );
  },
  'negative step'() {
    expect_StairCase_data(
      StairCase({ start: 4.2, step: -2.7, up: 2, down: 2, reversals: 3 }),
      [
        [4.2, true],
        [6.9, true],
        [9.6, true],
        [12.3, true],
        [15.0, true],
        [17.7, true],
        [20.4, false],
        [20.4, false],
        [17.7, false],
        [17.7, false],
        [15.0, false],
        [15.0, false],
        [12.3, true],
        [12.3, true],
        [15.0, true],
        [15.0, true],
        [17.7, true],
        [17.7, true],
        [20.4, false],
      ],
    );
  },
  'unequal up/down'() {
    expect_StairCase_data(
      StairCase({ start: 9.6, step: 1.3, up: 3, down: 1, reversals: 4 }),
      [
        [9.6, true],
        [8.3, true],
        [7.0, true],
        [5.7, true],
        [4.4, true],
        [3.1, false],
        [3.1, false],
        [3.1, false],
        [4.4, false],
        [4.4, false],
        [4.4, true],
        [3.1, true],
        [1.8, true],
        [0.5, true],
        [-0.8, false],
        [-0.8, false],
        [-0.8, false],
        [0.5, false],
        [0.5, false],
        [0.5, false],
        [1.8, true],
      ],
    );
    expect_StairCase_data(
      StairCase({ start: 6.4, step: 2.5, up: 1, down: 3, reversals: 5 }),
      [
        [6.4, true],
        [3.9, true],
        [1.4, false],
        [3.9, false],
        [6.4, false],
        [8.9, true],
        [8.9, true],
        [8.9, true],
        [6.4, true],
        [6.4, false],
        [8.9, false],
        [11.4, false],
        [13.9, true],
        [13.9, true],
        [13.9, true],
        [11.4, true],
        [11.4, true],
        [11.4, true],
        [8.9, true],
        [8.9, false],
      ],
    );
    expect_StairCase_data(
      StairCase({ start: 5.3, step: 3.1, up: 4, down: 2, reversals: 6 }),
      [
        [5.3, true],
        [2.2, true],
        [-0.9, true],
        [-4.0, true],
        [-7.1, false],
        [-7.1, false],
        [-7.1, false],
        [-7.1, false],
        [-4.0, false],
        [-4.0, false],
        [-4.0, false],
        [-4.0, true],
        [-4.0, true],
        [-7.1, true],
        [-7.1, true],
        [-10.2, true],
        [-10.2, false],
        [-10.2, false],
        [-10.2, false],
        [-10.2, false],
        [-7.1, false],
        [-7.1, true],
        [-7.1, true],
        [-10.2, true],
        [-10.2, false],
        [-10.2, false],
        [-10.2, true],
      ],
    );
    expect_StairCase_data(
      StairCase({ start: 2.1, step: 4.9, up: 2, down: 4, reversals: 7 }),
      [
        [2.1, true],
        [-2.8, true],
        [-7.7, false],
        [-7.7, false],
        [-2.8, false],
        [-2.8, false],
        [2.1, false],
        [2.1, true],
        [2.1, false],
        [2.1, false],
        [7.0, false],
        [7.0, true],
        [7.0, true],
        [7.0, true],
        [7.0, true],
        [2.1, true],
        [2.1, false],
        [2.1, false],
        [7.0, true],
        [7.0, true],
        [7.0, false],
      ],
    );
  },
  'min/max'() {
    expect_StairCase_data(
      StairCase({
        start: -1.3,
        step: 0.7,
        up: 1,
        down: 1,
        reversals: 5,
        min: -2.6,
        max: 2.5,
      }),
      [
        [-1.3, true],
        [-2.0, true],
        [-2.6, true],
        [-2.6, true],
        [-2.6, false],
        [-1.9, false],
        [-1.2, false],
        [-0.5, false],
        [0.2, false],
        [0.9, true],
        [0.2, false],
        [0.9, false],
        [1.6, false],
        [2.3, false],
        [2.5, false],
        [2.5, true],
        [1.8, true],
        [1.1, true],
        [0.4, false],
      ],
    );
    expect_StairCase_data(
      StairCase({
        start: 5.8,
        step: 1.6,
        up: 1,
        down: 1,
        reversals: 3,
        min: 7.3,
        max: 12.2,
      }),
      [
        [7.3, true],
        [7.3, true],
        [7.3, false],
        [8.9, false],
        [10.5, false],
        [12.1, false],
        [12.2, true],
        [10.6, true],
        [9.0, true],
        [7.4, false],
      ],
    );
    expect_StairCase_data(
      StairCase({
        start: 0.6,
        step: 0.9,
        up: 1,
        down: 1,
        reversals: 3,
        min: -5.3,
        max: -2.2,
      }),
      [
        [-2.2, true],
        [-3.1, true],
        [-4.0, true],
        [-4.9, true],
        [-5.3, true],
        [-5.3, false],
        [-4.4, false],
        [-3.5, false],
        [-2.6, false],
        [-2.2, true],
        [-3.1, true],
        [-4.0, false],
      ],
    );
  },
  'max trials'() {
    expect_StairCase_data(
      StairCase({
        start: 9.1,
        step: 1.2,
        up: 2,
        down: 2,
        reversals: 10,
        trials: 10,
      }),
      [
        [9.1, true],
        [7.9, true],
        [6.7, false],
        [6.7, false],
        [7.9, false],
        [7.9, true],
        [7.9, true],
        [6.7, false],
        [6.7, false],
        [7.9, false],
      ],
    );
  },
  'reversal before change'() {
    expect_StairCase_data(
      StairCase({
        start: 3.3,
        step: 0.8,
        up: 3,
        down: 4,
        reversals: 5,
      }),
      [
        [3.3, true],
        [2.5, true],
        [1.7, true],
        [0.9, false],
        [0.9, false],
        [0.9, false],
        [1.7, false],
        [1.7, true],
        [1.7, true],
        [1.7, true],
        [1.7, false],
        [1.7, false],
        [1.7, true],
        [1.7, true],
        [1.7, true],
        [1.7, true],
        [0.9, true],
        [0.9, false],
      ],
    );
  },
  'first false response'() {
    expect_StairCase_data(
      StairCase({
        start: 4.4,
        step: 1.1,
        up: 2,
        down: 2,
        reversals: 4,
      }),
      [
        [4.4, false],
        [5.5, false],
        [6.6, false],
        [7.7, true],
        [7.7, true],
        [6.6, true],
        [6.6, true],
        [5.5, true],
        [5.5, false],
        [5.5, false],
        [6.6, false],
        [6.6, true],
        [6.6, false],
      ],
    );
  },
};

// Collector
export const _Collector = {
  async 'dispose - remove listeners'() {
    using doc_listeners = spy_listeners(doc);
    {
      using dc = new Collector('test.csv');
      const eventTypes = Object.keys(doc_listeners);
      expect(eventTypes, ['visibilitychange'], 1);
      expect(doc_listeners['visibilitychange']!.length, 1);
    }
    expect(doc_listeners, {}, 1);
  },
  async 'backup on leave'() {
    using _ = spy_functionCall(window, 'alert', () => {}); // disable alert
    const expect_no_download = () =>
      spy_browserDownload(mock_leaveAndBack).then((info) => expect(info, null));

    // on
    {
      using dc = new Collector('test.csv', { backup_on_leave: true });
      await expect_no_download();

      dc.add({ x: 1, y: 'hello' });
      const info1 = (await spy_browserDownload(mock_leaveAndBack))!;
      expect(/^test\.csv[\w-.]+\.bak$/.test(info1[0]));
      expect(info1[1], `x,y\n1,hello`);

      dc.add({ x: 2, y: 'world' });
      const info2 = (await spy_browserDownload(mock_leaveAndBack))!;
      expect(/^test\.csv[\w-.]+\.bak$/.test(info2[0]));
      expect(info2[1], `x,y\n1,hello\n2,world`);
    }

    // off
    {
      using dc = new Collector('test.csv', { backup_on_leave: false });
      await expect_no_download();

      dc.add({ x: 1, y: 'hello' });
      await expect_no_download();

      dc.add({ x: 2, y: 'world' });
      await expect_no_download();
    }
  },
  // data collection
  'add data'() {
    const rows = [
      { a: 1, b: 'hello' },
      { a: 2, b: 'world' },
      { a: 3, b: '!' },
    ];
    using dc = new Collector('test.csv');
    for (const row of rows) dc.add(row);
    expect(dc.rows, rows, 1);
  },
  async 'download - multi call'() {
    using dc = new Collector('test.csv');

    dc.add({ a: 1, b: 'hello' });
    dc.add({ a: 2, b: 'world' });
    const info1 = (await spy_browserDownload(() => dc.download()))!;
    expect(info1, ['test.csv', 'a,b\n1,hello\n2,world'], 1);

    dc.add({ a: 3, b: '!' });
    const info2 = (await spy_browserDownload(() => dc.download()))!;
    expect(info2, ['test.csv', 'a,b\n1,hello\n2,world\n3,!'], 1);
  },
  async 'download - empty data'() {
    using dc = new Collector('test.csv');
    expect(await spy_browserDownload(() => dc.download()), null);
  },
  'event emitters'() {
    const events = { add: 0, chunk: 0 };
    using dc = new Collector('test.csv')
      .on('add', () => events.add++)
      .on('chunk', () => events.chunk++);
    dc.add({ a: 1 });
    dc.add({ a: 2 });
    dc.final();
    expect(events, { add: 2, chunk: 3 }, 1);
  },
  'modify row after add'() {
    using dc = new Collector<{ a: number; b: number }>('test.csv').on(
      'add',
      (row) => {
        //@ts-expect-error c not in row
        row.c = `${row.a}+${row.b}`;
      },
    );
    dc.add({ a: 1, b: 2 });
    dc.add({ a: 3, b: 4 });
    expect(
      dc.rows,
      [
        { a: 1, b: 2, c: '1+2' },
        { a: 3, b: 4, c: '3+4' },
      ],
      1,
    );
    expect(dc.final(), 'a,b,c\n1,2,1+2\n3,4,3+4');
  },
  // csv
  'csv - empty data'() {
    {
      using dc = new Collector('test.csv');
      expect(dc.final(), '');
    }
    {
      using dc = new Collector('test.csv');
      dc.add({});
      dc.add({});
      expect(dc.final(), '');
    }
  },
  'csv - special chars'() {
    using dc = new Collector('test.csv');
    const output = dc.add({
      normal: 'text',
      comma: 'hello, world',
      quotes: 'she said "hello" and \'world\'',
      newline: 'line1\nline2\rline3',
      nullValue: null,
      undefinedValue: void 0,
    });
    expect(
      output,
      `normal,comma,quotes,newline,nullValue,undefinedValue
text,"hello, world","she said ""hello"" and 'world'","line1\nline2\rline3",,`,
    );
  },
  'csv - stringify objects/arrays'() {
    using dc = new Collector('test.csv');
    dc.add({ a: { x: 1, y: 'hello' }, b: ['world', 2, 3] });
    expect(dc.final(), `a,b\n"{""x"":1,""y"":""hello""}","[""world"",2,3]"`);
  },
  'csv - multi final'() {
    using dc = new Collector('test.csv');

    dc.add({ a: 1, b: 'hello' });
    expect(dc.final(), 'a,b\n1,hello');

    dc.add({ a: 2, b: 'world' });
    expect(dc.final(), 'a,b\n1,hello\n2,world');
  },
  // json
  'json - empty data'() {
    {
      using dc = new Collector('test.json');
      expect(dc.final(), '');
    }
    {
      using dc = new Collector('test.json');
      dc.add({});
      dc.add({});
      expect(dc.final(), '[{},{}]');
    }
  },
  'json - multiple rows'() {
    using dc = new Collector('test.json');
    dc.add({ a: 1, b: 'hello' });
    dc.add({ a: 2, b: 'world' });
    expect(dc.final(), '[{"a":1,"b":"hello"},{"a":2,"b":"world"}]');
  },
  'json - nested objects'() {
    using dc = new Collector('test.json');
    dc.add({ a: { x: 1, y: 'hello', z: ['world', 2, 3] } });
    expect(dc.final(), `[{"a":{"x":1,"y":"hello","z":["world",2,3]}}]`);
  },
  'json - multi final'() {
    using dc = new Collector('test.json');

    dc.add({ a: 1, b: 'hello' });
    expect(dc.final(), '[{"a":1,"b":"hello"}]');

    dc.add({ a: 2, b: 'world' });
    expect(dc.final(), '[{"a":1,"b":"hello"},{"a":2,"b":"world"}]');
  },
  // custom
  async 'no extension'() {
    await expect_error(() => {
      new Collector('test');
    });
  },
  async 'unknown extension'() {
    await expect_error(() => {
      new Collector('test.unknown');
    });
    await expect_error(() => {
      new Collector('test.invalid');
    });
  },
  'custom serializer'() {
    using dc = new Collector('test.xml', {
      serializer: {
        header: () => '<data>',
        body: (row) => `<row>${JSON.stringify(row)}</row>`,
        footer: () => '</data>',
      },
    });

    expect(
      dc.add({ a: 1, b: 'hello' }),
      '<data><row>{"a":1,"b":"hello"}</row>',
    );
    expect(
      dc.add({ a: 2, b: 'world' }),
      '<data><row>{"a":1,"b":"hello"}</row><row>{"a":2,"b":"world"}</row>',
    );
    expect(
      dc.final(),
      '<data><row>{"a":1,"b":"hello"}</row><row>{"a":2,"b":"world"}</row></data>',
    );

    expect(
      dc.add({ a: 3, b: '!' }),
      '<data><row>{"a":1,"b":"hello"}</row><row>{"a":2,"b":"world"}</row><row>{"a":3,"b":"!"}</row>',
    );
    expect(
      dc.final(),
      '<data><row>{"a":1,"b":"hello"}</row><row>{"a":2,"b":"world"}</row><row>{"a":3,"b":"!"}</row></data>',
    );
  },
  'register custom serializer'() {
    Collector.serializers['xml'] = {
      header: () => '<data>',
      body: (row) => `<row>${JSON.stringify(row)}</row>`,
      footer: () => '</data>',
    };
    using dc = new Collector('test.xml');

    expect(
      dc.add({ a: 1, b: 'hello' }),
      '<data><row>{"a":1,"b":"hello"}</row>',
    );
    expect(
      dc.add({ a: 2, b: 'world' }),
      '<data><row>{"a":1,"b":"hello"}</row><row>{"a":2,"b":"world"}</row>',
    );
    expect(
      dc.final(),
      '<data><row>{"a":1,"b":"hello"}</row><row>{"a":2,"b":"world"}</row></data>',
    );

    expect(
      dc.add({ a: 3, b: '!' }),
      '<data><row>{"a":1,"b":"hello"}</row><row>{"a":2,"b":"world"}</row><row>{"a":3,"b":"!"}</row>',
    );
    expect(
      dc.final(),
      '<data><row>{"a":1,"b":"hello"}</row><row>{"a":2,"b":"world"}</row><row>{"a":3,"b":"!"}</row></data>',
    );
    delete Collector.serializers['xml'];
  },
};

// Utils
export const Utils = {
  async 'default porps - merge'() {
    // plain object
    {
      const props: { a?: number; b: string; c: boolean } = {
        b: 'world',
        c: true,
      };

      const merged = defaultProps(props, { a: 1, b: 'hello' });
      expect(merged.a, 1);
      expect(merged.b, 'world');
      expect(merged.c, true);
    }

    // reactive object
    {
      const props = reactive<{ a?: number; b: string; c: boolean }>({
        b: 'world',
        c: true,
      });

      const merged = defaultProps(props, { a: 1, b: 'hello' });
      expect(merged.a, 1);
      expect(merged.b, 'world');
      expect(merged.c, true);
    }
  },
  async 'default porps - keep reactive'() {
    const props = reactive<{ a?: number; b: string; c: boolean }>({
      b: 'world',
      c: true,
    });

    const merged = defaultProps(props, { a: 1, b: 'hello' });
    const _merged: typeof props = { b: '', c: true };
    van.derive(() => {
      _merged.a = merged.a;
      _merged.b = merged.b;
      _merged.c = merged.c;
      //@ts-expect-error d not in merged
      _merged.d = merged.d;
    });

    merged.a = 5;
    merged.b = 'changed';
    merged.c = false;
    //@ts-expect-error d not in merged
    merged.d = 'new prop';
    await 0;
    expect(_merged.a, 5);
    expect(_merged.b, 'changed');
    expect(_merged.c, false);
    //@ts-expect-error d not in merged
    expect(_merged.d, 'new prop');

    //@ts-expect-error error value type
    merged.a = true;
    //@ts-expect-error error value type
    merged.b = 1;
    //@ts-expect-error error value type
    merged.c = 'hello';
    //@ts-expect-error d not in merged
    delete merged.d;
    await 0;
    expect(_merged.a, true);
    expect(_merged.b, 1);
    expect(_merged.c, 'hello');
    //@ts-expect-error d not in merged
    expect(_merged.d, void 0);
  },
  async 'detect fps - alert on leave'() {
    using alertParams = spy_functionCall(window, 'alert', () => {});
    using goParams = spy_functionCall(history, 'go', () => {});

    const leave_alert = 'This text will show when you leave the page.';
    const p = detectFPS({
      root: doc.body,
      frame_count: 19,
      leave_alert,
    });

    await mock_leaveAndBack();
    expect(goParams.length, 1); // history.go()
    expect(goParams[0]![0], void 0);
    expect(alertParams.length, 1); // alert(leave_alert)
    expect(alertParams[0]![0], leave_alert);
  },
  async 'detect fps - return durations'() {
    const durations = await detectFPS({
      root: doc.body,
      frame_count: 19,
      leave_alert: 'Please stay on the page.',
    });
    expect(durations.length, 19);
    expect(
      durations.every((e) => typeof e === 'number' && e > 0),
      true,
    );
  },
};

const __typecheck__ = {
  defaultProps() {
    const props: { a?: number; b: string; c: boolean } = {
      b: 'world',
      c: true,
    };
    defaultProps(props, {
      //@ts-expect-error invaild value type
      a: '',
      //@ts-expect-error invaild value type
      b: false,
      //@ts-expect-error invaild value type
      c: 3,
    });
  },
  on() {
    type PropertyEventMap<T, K = keyof T> = {
      [P in K extends `on${infer R}` ? R : never]: Parameters<
        //@ts-expect-error `on${P}` maybe not in T
        T[`on${P}`]
      >[0];
    };
    type Diff<T, U> = {
      [P in keyof T]: P extends string
        ? U extends { [K in P]: unknown }
          ? never
          : P
        : never;
    }[keyof T];

    on<
      Window,
      //@ts-expect-error unsupported event literal types
      Diff<WindowEventMap, PropertyEventMap<Window>>
    >;
    on<
      Document,
      //@ts-expect-error unsupported event literal types
      Diff<DocumentEventMap, PropertyEventMap<Document>>
    >;
    on<
      HTMLElement,
      //@ts-expect-error unsupported event literal types
      Diff<HTMLElementEventMap, PropertyEventMap<HTMLElement>>
    >;
    on<
      HTMLMediaElement,
      //@ts-expect-error unsupported event literal types
      Diff<HTMLMediaElementEventMap, PropertyEventMap<HTMLMediaElement>>
    >;
    on<
      HTMLBodyElement,
      Diff<PropertyEventMap<HTMLBodyElement>, HTMLBodyElementEventMap>
    >;
    on<
      MathMLElement,
      Diff<PropertyEventMap<MathMLElement>, MathMLElementEventMap>
    >;
    on<SVGElement, Diff<PropertyEventMap<SVGElement>, SVGElementEventMap>>;
  },
};
