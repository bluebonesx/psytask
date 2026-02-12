import {
  adapter,
  Grating,
  ImageStim,
  Loader,
  PhysicalWidthDetector,
  useDevicePixelRatio,
  useFetch,
  useWindowPhysicalPix,
  ViewDistanceDetector,
  VirtualChinrest,
} from '@psytask/components';
import {
  createApp,
  generic,
  Scene,
  type Component,
  type MaybeGenericComponent,
} from 'psytask';
import van from 'vanjs-core';
import {
  $,
  DefaultScene,
  expect,
  expect_closeTo,
  mock_changeDPR,
  mock_event,
  mock_httpbin,
  sleep,
  spy_functionCall,
} from './utils';
const { div } = van.tags;

export const Adapter = {
  async 'adapter - shallow reactive'() {
    const { props } = adapter.render(
      (props: { a: number; b: { c: number } }) => '',
      { a: 1, b: { c: 2 } },
    );

    let runCount = 0;
    let a_val, b_c_val;
    van.derive(() => {
      runCount++;
      a_val = props.a;
      b_c_val = props.b.c;
    });

    expect(runCount, 1);
    expect(a_val, 1);
    expect(b_c_val, 2);

    // Update top-level
    props.a = 2;
    await 0;
    expect(runCount, 2);
    expect(a_val, 2);

    // Update nested (should not trigger)
    props.b.c = 3;
    await 0;
    expect(runCount, 2);
    expect(b_c_val, 2); // derive didn't run
    expect(props.b.c, 3); // value updated

    // Update object ref
    props.b = { c: 4 };
    await 0;
    expect(runCount, 3);
    expect(b_c_val, 4);
  },
  async 'adapter - get optional key (no default)'() {
    const { props } = adapter.render((p: { optional?: string }) => '', {});

    let runCount = 0;
    let val;
    van.derive(() => {
      runCount++;
      val = props.optional;
    });

    expect(runCount, 1);
    expect(val, void 0);

    props.optional = 'hello';
    await 0;
    expect(runCount, 2);
    expect(val, 'hello');
  },
  async 'adapter - get optional key (default undefined)'() {
    const { props } = adapter.render((p: { optional?: string }) => '', {
      optional: void 0,
    });

    let runCount = 0;
    let val;
    van.derive(() => {
      runCount++;
      val = props.optional;
    });

    expect(runCount, 1);
    expect(val, void 0);

    props.optional = 'hello';
    await 0;
    expect(runCount, 2);
    expect(val, 'hello');
  },
  async 'adapter - repeat reactive wrap'() {
    let props: { count: number };
    const Comp = (p: typeof props) => {
      props = p;
      return '';
    };

    // define
    {
      expect(
        adapter.render(adapter.wrap(Comp), {
          count: 0,
        }).props,
        props!,
      );
      expect(
        adapter.render(adapter.wrap(adapter.wrap(Comp)), {
          count: 0,
        }).props,
        props!,
      );
      expect(
        adapter.render(adapter.wrap(adapter.wrap(adapter.wrap(Comp))), {
          count: 0,
        }).props,
        props!,
      );
    }

    // render
    {
      const { props } = adapter.render(Comp, { count: 0 });

      const { props: props2 } = adapter.render(Comp, props);
      expect(props, props2);

      const { props: props3 } = adapter.render(Comp, props2);
      expect(props, props3);
    }
  },
  async 'adapter - reactive props after wrap'() {
    using app = await createApp();

    // basic prop
    {
      using s = app.scene(
        adapter.wrap((props: { text: string }) => div(() => props.text)),
        { adapter, defaultProps: { text: 'default' }, duration: 0 },
      );
      expect(s.root.textContent, 'default');
      await s.show({ text: 'new' });
      expect(s.root.textContent, 'new');
      await s.show();
      expect(s.root.textContent, 'default');
    }

    // optional prop
    {
      using s = app.scene(
        adapter.wrap((props: { text?: string }) => div(() => props.text ?? '')),
        { adapter, defaultProps: {}, duration: 0 },
      );
      expect(s.root.textContent, '');
      await s.show({ text: 'new' });
      expect(s.root.textContent, 'new');
      await s.show();
      expect(s.root.textContent, '');
    }

    // default props is undefined
    {
      using s = app.scene(
        adapter.wrap((props: { text?: string }) => div(() => props.text ?? '')),
        { adapter, defaultProps: { text: void 0 }, duration: 0 },
      );
      expect(s.root.textContent, '');
      await s.show({ text: 'new' });
      expect(s.root.textContent, 'new');
      await s.show();
      expect(s.root.textContent, '');
    }
  },
};
export const Hooks = {
  async useDevicePixelRatio() {
    let runCount = 0;
    using ctrl = mock_changeDPR();

    using app = await createApp();
    using s = app.scene(
      (p: {}) => {
        const dpr = useDevicePixelRatio();
        van.derive(() => {
          runCount++;
          expect(dpr.val, devicePixelRatio);
        });
        return '';
      },
      { adapter, defaultProps: {} },
    );
    expect(runCount, 1);

    // change
    ctrl.change(2);
    await 0;
    expect(devicePixelRatio, 2);
    expect(runCount, 2);

    ctrl.change(1.5);
    await 0;
    expect(devicePixelRatio, 1.5);
    expect(runCount, 3);
  },
  async useWindowPhysicalPix() {
    let runCount = 0;
    using ctrl = mock_changeDPR();

    using app = await createApp();
    using s = app.scene(
      (p: {}) => {
        const dpr = useDevicePixelRatio();
        const pix = useWindowPhysicalPix(dpr);
        van.derive(() => {
          runCount++;
          expect(pix.width, innerWidth * devicePixelRatio);
          expect(pix.height, innerHeight * devicePixelRatio);
        });
        return '';
      },
      { adapter, defaultProps: {} },
    );
    expect(runCount, 1);

    // change
    ctrl.change(2);
    await 0;
    expect(runCount, 2);

    ctrl.change(1.5);
    await 0;
    expect(runCount, 3);
  },
  async 'useFetch - basic usage'() {
    using _ = mock_httpbin();
    const store = useFetch('/bytes/10');

    expect(store.status, 'waiting');
    expect(store.loading, true);
    await 0;
    expect(store.status, 'loading');
    expect(store.loading, true);
    await sleep(50);
    expect(store.status, 'success');
    expect(store.loading, false);
    expect(
      (store as Extract<typeof store, { status: 'success' }>).data instanceof
        Blob,
    );
    expect(
      (store as Extract<typeof store, { status: 'success' }>).data.size,
      10,
    );
  },
  async 'useFetch - reactive inputs'() {
    using _ = mock_httpbin();
    const url = van.state('/bytes/20');
    const store = useFetch(() => url.val);

    await sleep(50);
    expect(
      (store as Extract<typeof store, { status: 'success' }>).data.size,
      20,
    );

    // change URL
    url.val = '/bytes/30';
    await 0;
    expect(store.status, 'waiting'); // reset to waiting
    await sleep(50);
    expect(
      (store as Extract<typeof store, { status: 'success' }>).data.size,
      30,
    );
  },
  async 'useFetch - http error'() {
    using _ = mock_httpbin();
    const store = useFetch('/status/404');
    await sleep(50);
    expect(store.status, 'failed');
    expect(store.loading, false);
    expect(
      (store as Extract<typeof store, { status: 'failed' }>).error instanceof
        Error,
    );
    expect(
      (
        store as Extract<typeof store, { status: 'failed' }>
      ).error.message.includes('404'),
    );
  },
};

// components
const expect_Loader_dataSizes = (
  {
    blobs,
    error,
  }: typeof Loader extends Component<infer P, infer D> ? D : never,
  sizes: number[],
) => {
  if (error) throw error;
  expect(error, null);
  expect(blobs.length, sizes.length);
  for (let i = 0; i < sizes.length; i++) {
    expect(blobs[i] instanceof Blob);
    expect(blobs[i]!.size, sizes[i]);
  }
};
export const _Loader = {
  async 'immediately close'() {
    using fetchParams = mock_httpbin();
    using app = await createApp();
    using loader = app
      .scene(generic(Loader), { adapter, defaultProps: { urls: ['/bytes/1'] } })
      .on('show', () => loader.close());
    expect_Loader_dataSizes(await loader.show(), []);
    expect(fetchParams.length, 1); // close is async
  },
  async 'empty urls'() {
    using app = await createApp();

    // default empty
    {
      using loader = app.scene(generic(Loader), {
        adapter,
        defaultProps: { urls: [] },
      });
      expect_Loader_dataSizes(await loader.show(), []);
    }

    // show with empty
    {
      using fetchParams = mock_httpbin();
      using loader = app.scene(generic(Loader), {
        adapter,
        defaultProps: { urls: ['/bytes/1'] },
      });
      expect(fetchParams.length, 0); // only fetch on show
      expect_Loader_dataSizes(await loader.show({ urls: [] }), []);
      expect(fetchParams.length, 0); // modify props is sync
    }
  },
  async 'multi loads'() {
    using _ = mock_httpbin();
    using app = await createApp();
    using loader = app.scene(generic(Loader), {
      adapter,
      defaultProps: { urls: ['/bytes/1'] },
    });
    expect_Loader_dataSizes(await loader.show(), [1]);
    expect_Loader_dataSizes(await loader.show(), [1]);
    expect_Loader_dataSizes(await loader.show(), [1]);
  },
  async 'change urls'() {
    using _ = mock_httpbin();
    using app = await createApp();
    using loader = app.scene(generic(Loader), {
      adapter,
      defaultProps: { urls: [] },
    });
    expect_Loader_dataSizes(await loader.show({ urls: ['/bytes/1'] }), [1]);
    expect_Loader_dataSizes(await loader.show(), []);
    expect_Loader_dataSizes(
      await loader.show({ urls: ['/bytes/2', '/bytes/3'] }),
      [2, 3],
    );
    expect_Loader_dataSizes(await loader.show(), []);
  },
  async 'with progress'() {
    using _ = mock_httpbin();
    using app = await createApp();
    using loader = app.scene(generic(Loader), {
      adapter,
      defaultProps: { urls: ['/bytes/100', '/bytes/50'] },
    });

    let hasProgress = false;
    new MutationObserver((mutations, ob) => {
      for (const m of mutations)
        m.addedNodes.forEach(
          (n) =>
            n.nodeName === '#text' &&
            n.textContent?.includes('%') &&
            ((hasProgress = true), ob.disconnect()),
        );
    }).observe(loader.root, { childList: true, subtree: true });
    expect_Loader_dataSizes(await loader.show(), [100, 50]);
    expect(hasProgress);
  },
  async 'with error'() {
    using _ = mock_httpbin();
    using app = await createApp();
    using loader = app.scene(generic(Loader), {
      adapter,
      defaultProps: {
        urls: ['/status/404', '/bytes/1', '/bytes/2', '/bytes/3'],
      },
    });
    const { blobs, error } = await loader.show();
    expect(blobs, null);
    expect(error instanceof Error);
    expect(error!.message.includes('404'));
  },
};

export const _ImageStim = {
  async 'render ImageData'() {
    using app = await createApp();
    using s = app.scene(ImageStim, {
      adapter,
      defaultProps: { image: new ImageData(10, 20) },
      duration: 0,
    });
    const el = $(s.root, 'canvas');
    expect(el.width, 10);
    expect(el.height, 20);

    await s.show({ image: new ImageData(30, 40) });
    expect(el.width, 30);
    expect(el.height, 40);
  },
  async 'render ImageBitmap'() {
    using app = await createApp();
    using s = app.scene(ImageStim, {
      adapter,
      defaultProps: { image: await createImageBitmap(new ImageData(15, 25)) },
      duration: 0,
    });
    const el = $(s.root, 'canvas');
    expect(el.width, 15);
    expect(el.height, 25);

    await s.show({ image: await createImageBitmap(new ImageData(35, 45)) });
    expect(el.width, 35);
    expect(el.height, 45);
  },
  async 'custom draw'() {
    using app = await createApp();
    let called = 0;
    using s = app.scene(ImageStim, {
      adapter,
      defaultProps: { draw: () => called++ },
      duration: 0,
    });
    expect(called, 1);

    await s.show({ draw: () => (called += 2) });
    expect(called, 3);
  },
};
export const _Grating = {
  async 'basic render'() {
    using app = await createApp();
    using s = app.scene(Grating, {
      adapter,
      defaultProps: {
        type: Math.sin,
        size: 100,
        sf: 0.02, // 50px per cycle
        ori: 0, // vertical
        color: [255, 255, 255],
      },
      duration: 0,
    });
    const el = $(s.root, 'canvas');
    expect(el.width, 100);
    expect(el.height, 100);
    const ctx = el.getContext('2d')!;

    // half intensity
    for (let x = 0; x < 100; x += 25) {
      for (let y = 0; y < 100; y += 10) {
        const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
        expect(r, 255);
        expect(g, 255);
        expect(b, 255);
        expect_closeTo(a!, 128, 1);
      }
    }

    await s.show({
      ori: Math.PI / 2, // horizontal
      color: [0, 0, 0],
    });
    // half intensity
    for (let x = 0; x < 100; x += 10) {
      for (let y = 0; y < 100; y += 25) {
        const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
        expect(r, 0);
        expect(g, 0);
        expect(b, 0);
        expect_closeTo(a!, 128, 1);
      }
    }
  },
  async 'update props'() {
    using app = await createApp();
    using s = app.scene(Grating, {
      adapter,
      defaultProps: {
        type: Math.sin,
        size: 100,
        sf: 0.05,
        color: [255, 255, 255],
      },
      duration: 0,
    });
    const el = $(s.root, 'canvas');
    await s.show({ size: 200 });
    expect(el.width, 200);
    expect(el.height, 200);
  },
  async 'mask - circle'() {
    using app = await createApp();
    using s = app.scene(Grating, {
      adapter,
      defaultProps: {
        type: (x) => 1, // full intensity
        size: 100,
        sf: 0, // no grating
        color: [255, 255, 255],
        mask: (x, y) => (x * x + y * y < 0.25 ? 1 : 0),
      },
      duration: 0,
    });
    const ctx = $(s.root, 'canvas').getContext('2d')!;

    // center should be visible
    expect(ctx.getImageData(50, 50, 1, 1).data[3], 255);
    // corner should be transparent
    for (let x = 0; x < 100; x += 100)
      for (let y = 0; y < 100; y += 10)
        expect(ctx.getImageData(x, y, 1, 1).data[3], 0);
    for (let x = 0; x < 100; x += 10)
      for (let y = 0; y < 100; y += 100)
        expect(ctx.getImageData(x, y, 1, 1).data[3], 0);
  },
};

export const _PhysicalWidthDetector = {
  async 'calculation logic'() {
    using app = await createApp();
    using pwd = app.scene(PhysicalWidthDetector, { adapter, defaultProps: {} });
    const state = pwd.data(); // deep reactive

    // set line distance cm, fixed line distance pix
    const orig_line_distance_pix = state.line_distance_pix;
    state.line_distance_cm = 11;
    await 0;
    expect_closeTo(state.line_distance_pix, orig_line_distance_pix, 1e-6);
    expect_closeTo(
      state.pix_per_cm,
      state.line_distance_pix / state.line_distance_cm,
      1e-4,
    );

    // set line distance pix, fixed line distance cm
    const orig_line_distance_cm = state.line_distance_cm;
    state.line_distance_pix = 349;
    await 0;
    expect_closeTo(state.line_distance_cm, orig_line_distance_cm, 1e-6);
    expect_closeTo(
      state.pix_per_cm,
      state.line_distance_pix / state.line_distance_cm,
      1e-4,
    );
  },
  async 'calculation logic - 0 or NaN'() {
    using app = await createApp();
    using pwd = app.scene(PhysicalWidthDetector, { adapter, defaultProps: {} });
    const state = pwd.data(); // deep reactive

    // line_distance_cm
    {
      state.line_distance_cm = 0;
      await 0;
      expect(state.pix_per_cm, Infinity);

      state.line_distance_cm = NaN;
      await 0;
      expect(state.pix_per_cm, NaN);

      state.line_distance_cm = 10;
      await 0;
      expect(
        state.pix_per_cm,
        state.line_distance_pix / state.line_distance_cm,
      );
    }
    // line_distance_pix
    {
      state.line_distance_pix = 0;
      await 0;
      expect(state.pix_per_cm, 0);

      state.line_distance_pix = NaN;
      await 0;
      expect(state.pix_per_cm, NaN);

      state.line_distance_pix = 30;
      await 0;
      expect(
        state.pix_per_cm,
        state.line_distance_pix / state.line_distance_cm,
      );
    }
  },
  async 'interaction - drag'() {
    using app = await createApp();
    using pwd = app.scene(PhysicalWidthDetector, { adapter, defaultProps: {} });
    const showPromise = pwd.show();
    const state = pwd.data();

    const fixedLine = pwd.root.querySelector<HTMLElement>(
      '[data-test=fixed-line]',
    )!;
    const movableLine = pwd.root.querySelector<HTMLElement>(
      '[data-test=movable-line]',
    )!;

    // moving after down
    const sx = fixedLine.getBoundingClientRect().x;
    const clientX = 150;
    mock_event(movableLine, 'pointerdown');
    mock_event(pwd.root, new PointerEvent('pointermove', { clientX }));
    await 0;
    expect(movableLine.getBoundingClientRect().x, clientX);
    expect_closeTo(
      state.line_distance_pix,
      (clientX - sx) * devicePixelRatio,
      1e-6,
    );

    // moving after up (shouldn't work)
    mock_event(pwd.root, new PointerEvent('pointerup'));
    mock_event(
      pwd.root,
      new PointerEvent('pointermove', { clientX: clientX * 2 }),
    );
    await 0;
    expect(movableLine.getBoundingClientRect().x, clientX);
    expect_closeTo(
      state.line_distance_pix,
      (clientX - sx) * devicePixelRatio,
      1e-6,
    );

    // close
    pwd.close();
    await showPromise;
  },
  async 'i18n - chinese'() {
    using app = await createApp();
    const i18n = {
      title: '屏幕宽度校准',
      text: '阿巴阿巴阿巴',
      ok: '确认',
      line_distance: '两线距离',
      pix_per_cm: '每厘米像素数',
    };
    using pwd = app
      .scene(PhysicalWidthDetector, { adapter, defaultProps: { i18n } })
      .on('show', () => pwd.close());
    await pwd.show();

    const html = pwd.root.innerHTML;
    expect(html.includes(i18n.title));
    expect(html.includes(i18n.text));
    expect(html.includes(i18n.ok));
    expect(html.includes(i18n.line_distance));
    expect(html.includes(i18n.pix_per_cm));
  },
};
export const _ViewDistanceDetector = {
  async 'calculation logic'() {
    const pix_per_cm = 40;
    const blindspot_deg = 13.5;
    const width_pix_per_distance_cm =
      pix_per_cm * 2 * Math.tan((blindspot_deg / 2) * (Math.PI / 180));

    using app = await createApp();
    using vdd = app.scene(ViewDistanceDetector, {
      adapter,
      defaultProps: { pix_per_cm, blindspot_deg },
    });
    const state = vdd.data(); // deep reactive

    // initial state
    expect(state.move_widths.length, 0);
    expect(state.distance_cm, 0);

    // moving 400px (10cm)
    state.move_widths.push({ pix: 400, cm: 10 }); // nested reactive
    await 0;
    expect(state.distance_cm, 400 / width_pix_per_distance_cm);

    // moving 200px (5cm)
    state.move_widths.push({ pix: 200, cm: 5 });
    await 0;
    expect(state.distance_cm, 300 / width_pix_per_distance_cm); // average
  },
  async 'interaction - move and click'() {
    const pix_per_cm = 100;

    using app = await createApp();
    using vdd = app.scene(ViewDistanceDetector, {
      adapter,
      defaultProps: { pix_per_cm },
    });
    const showPromise = vdd.show();
    const state = vdd.data();

    const fixedObj = vdd.root.querySelector<HTMLElement>(
      '[data-test=fixed-obj]',
    )!;
    const movableObj = vdd.root.querySelector<HTMLElement>(
      '[data-test=movable-obj]',
    )!;

    // start moving
    mock_event(fixedObj, 'pointerdown');
    await 0;

    // moving
    const sx = movableObj.getBoundingClientRect().x;
    const frame_count = 200;
    for (let x = 0; x < frame_count; x++) vdd.emit('frame', 0);
    expect(state.move_width_pix, frame_count);
    await sleep(0);
    expect_closeTo(
      sx - movableObj.getBoundingClientRect().x,
      frame_count / devicePixelRatio,
      1e-4,
    );

    // stop
    mock_event(fixedObj, 'pointerdown');
    await 0;
    expect(state.move_width_pix, 0); // reset

    expect(state.move_widths.length, 1);
    expect(state.move_widths[0]!.pix, frame_count);
    expect(state.move_widths[0]!.cm, frame_count / pix_per_cm);

    // close
    vdd.close();
    await showPromise;
  },
  async 'i18n - chinese'() {
    using app = await createApp();
    const i18n = {
      title: '视距检测',
      text: '请移动下方的方块，直至看不见中间的圆点',
      ok: '确认',
      view_distance: '视距',
    };
    using s = app
      .scene(ViewDistanceDetector, {
        adapter,
        defaultProps: { pix_per_cm: 40, i18n },
      })
      .on('show', () => s.close());
    await s.show();

    const html = s.root.innerHTML;
    expect(html.includes(i18n.title));
    expect(html.includes(i18n.text));
    expect(html.includes(i18n.ok));
    expect(html.includes(i18n.view_distance));
  },
};

const mock_VCtest = async (ctx: Scene<MaybeGenericComponent>) => {
  const forms = ctx.root.querySelectorAll<HTMLFormElement>('form');
  const pwd = forms[0]!,
    vdd = forms[1]!;

  let inputEL = pwd.querySelector<HTMLInputElement>('input[type=number]')!;
  inputEL.value = '10';
  mock_event(inputEL, 'change');
  await 0;
  let button = pwd.querySelector<HTMLButtonElement>('button[type=submit]')!;
  button.click();
  await await 0; // wait pwd close

  inputEL = vdd.querySelector<HTMLInputElement>('input[type=number]')!;
  inputEL.value = '50';
  mock_event(inputEL, 'change');
  await 0;
  button = vdd.querySelector<HTMLButtonElement>('button[type=submit]')!;
  button.click();
  await await 0; // wait vdd close
  await await 0; // wait ctx close
};
export const _VirtualChinrest = {
  async 'data - deg2csspix'() {
    const pix_per_cm = 40;
    const distance_cm = 57;

    using ctrl = mock_changeDPR();
    let runCount = 0;

    using app = await createApp();
    using vc = app.scene(VirtualChinrest, {
      adapter,
      defaultProps: { usePreviousData: true },
    });
    VirtualChinrest.set({ pix_per_cm, distance_cm });
    const data = await vc.show();

    // initial calc
    const deg = 1;
    const cm = 2 * distance_cm * Math.tan((deg * Math.PI) / 360);
    expect(data.deg2cm(deg), cm);
    expect(data.deg2pix(deg), cm * pix_per_cm);

    van.derive(() => {
      runCount++;
      // reactive to DPR
      expect(data.deg2csspix(deg), (cm * pix_per_cm) / devicePixelRatio);
    });
    expect(runCount, 1);

    // change
    ctrl.change(2);
    await 0;
    expect(devicePixelRatio, 2);
    expect(runCount, 2);

    ctrl.change(1.5);
    await 0;
    expect(devicePixelRatio, 1.5);
    expect(runCount, 3);
  },
  async 'correct prev data'() {
    using app = await createApp();
    using vc = app.scene(VirtualChinrest, { adapter, defaultProps: {} });
    await sleep(0);

    let p: Promise<unknown>;
    using confirmParams = spy_functionCall(window, 'confirm', () => false);
    const detectorEl = $(vc.root, 'form');

    // value is true
    {
      VirtualChinrest.set({ pix_per_cm: 40, distance_cm: 57 });
      p = vc.show({ usePreviousData: true });
      expect(confirmParams.length, 0);
      expect(detectorEl.getBoundingClientRect().width == 0);
      await await 0; // wait close
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }
    // value is false
    {
      VirtualChinrest.set({ pix_per_cm: 4, distance_cm: 5 });
      p = vc.show({ usePreviousData: false });
      expect(confirmParams.length, 0);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }
    // value is undefined - okay
    {
      VirtualChinrest.set({ pix_per_cm: 6, distance_cm: 100 });
      using confirmParams = spy_functionCall(window, 'confirm', () => true);
      p = vc.show();
      expect(confirmParams.length, 1);
      expect(detectorEl.getBoundingClientRect().width == 0);
      await await 0;
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }
    // value is undefined - cancel
    {
      VirtualChinrest.set({ pix_per_cm: 59, distance_cm: 11 });
      using confirmParams = spy_functionCall(window, 'confirm', () => false);
      p = vc.show();
      expect(confirmParams.length, 1);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }

    localStorage.removeItem(VirtualChinrest.key); // clean up
  },
  async 'incorrect prev data - lack key'() {
    using app = await createApp();
    using vc = app.scene(VirtualChinrest, { adapter, defaultProps: {} });

    let p: Promise<unknown>;
    using confirmParams = spy_functionCall(window, 'confirm', () => false);
    using warnParams = spy_functionCall(console, 'warn', () => void 0);
    const detectorEl = $(vc.root, 'form');

    // value is true
    {
      VirtualChinrest.set(
        //@ts-expect-error lack key
        { distance_cm: 57 },
      );
      p = vc.show({ usePreviousData: true });
      expect(confirmParams.length, 0);
      expect(warnParams.length, 1);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }
    // value is false
    {
      VirtualChinrest.set(
        //@ts-expect-error lack key
        {},
      );
      p = vc.show({ usePreviousData: false });
      expect(confirmParams.length, 0);
      expect(warnParams.length, 1);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }
    // value is undefined
    {
      VirtualChinrest.set(
        //@ts-expect-error lack key
        { pix_per_cm: 7 },
      );
      p = vc.show();
      expect(confirmParams.length, 0);
      expect(warnParams.length, 2);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }

    localStorage.removeItem(VirtualChinrest.key); // clean up
  },
  async 'incorrect prev data - error value'() {
    using app = await createApp();
    using vc = app.scene(VirtualChinrest, { adapter, defaultProps: {} });

    let p: Promise<unknown>;
    using confirmParams = spy_functionCall(window, 'confirm', () => false);
    using warnParams = spy_functionCall(console, 'warn', () => void 0);
    const detectorEl = $(vc.root, 'form');

    // value is true
    {
      VirtualChinrest.set({
        //@ts-expect-error error value type
        pix_per_cm: false,
        //@ts-expect-error error value type
        distance_cm: '',
      });
      p = vc.show({ usePreviousData: true });
      expect(confirmParams.length, 0);
      expect(warnParams.length, 1);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }
    // value is false
    {
      VirtualChinrest.set({
        pix_per_cm: 1,
        //@ts-expect-error error value type
        distance_cm: '',
      });
      p = vc.show({ usePreviousData: false });
      expect(confirmParams.length, 0);
      expect(warnParams.length, 1);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }
    // value is undefined
    {
      VirtualChinrest.set({
        //@ts-expect-error error value type
        pix_per_cm: false,
        distance_cm: 8,
      });
      p = vc.show();
      expect(confirmParams.length, 0);
      expect(warnParams.length, 2);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }

    localStorage.removeItem(VirtualChinrest.key); // clean up
  },
  async 'incorrect prev data - NaN value'() {
    using app = await createApp();
    using vc = app.scene(VirtualChinrest, { adapter, defaultProps: {} });

    let p: Promise<unknown>;
    using confirmParams = spy_functionCall(window, 'confirm', () => false);
    using warnParams = spy_functionCall(console, 'warn', () => void 0);
    const detectorEl = $(vc.root, 'form');

    // value is true
    {
      VirtualChinrest.set({ pix_per_cm: 40, distance_cm: NaN });
      p = vc.show({ usePreviousData: true });
      expect(confirmParams.length, 0);
      expect(warnParams.length, 1);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }
    // value is false
    {
      VirtualChinrest.set({ pix_per_cm: NaN, distance_cm: 45 });
      p = vc.show({ usePreviousData: false });
      expect(confirmParams.length, 0);
      expect(warnParams.length, 1);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }
    // value is undefined
    {
      VirtualChinrest.set({ pix_per_cm: NaN, distance_cm: NaN });
      p = vc.show();
      expect(confirmParams.length, 0);
      expect(warnParams.length, 2);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }

    localStorage.removeItem(VirtualChinrest.key); // clean up
  },
  async 'no prev data'() {
    using app = await createApp();
    using vc = app.scene(VirtualChinrest, { adapter, defaultProps: {} });

    let p: Promise<unknown>;
    using confirmParams = spy_functionCall(window, 'confirm', () => false);
    using warnParams = spy_functionCall(console, 'warn', () => void 0);
    const detectorEl = $(vc.root, 'form');

    // value is true
    {
      localStorage.removeItem(VirtualChinrest.key);
      p = vc.show({ usePreviousData: true });
      expect(confirmParams.length, 0);
      expect(warnParams.length, 1);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }
    // value is false
    {
      localStorage.removeItem(VirtualChinrest.key);
      p = vc.show({ usePreviousData: false });
      expect(confirmParams.length, 0);
      expect(warnParams.length, 1);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }
    // value is undefined
    {
      localStorage.removeItem(VirtualChinrest.key);
      p = vc.show();
      expect(confirmParams.length, 0);
      expect(warnParams.length, 2);
      expect(detectorEl.getBoundingClientRect().width >= 0);
      await mock_VCtest(vc);
      await Promise.race([p, Promise.reject(Error('timeout'))]);
    }

    localStorage.removeItem(VirtualChinrest.key); // clean up
  },
};

const __typecheck__ = {
  async Loader() {
    using app = await createApp();
    using scene = app.scene(generic(Loader), { defaultProps: { urls: [] } });
    const { blobs } = await scene.show({ urls: ['', ''] });
    const __should_be_blob_tuple__: [Blob, Blob] =
      [] as unknown as typeof blobs & {};
  },
};
