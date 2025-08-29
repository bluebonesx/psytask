import type { PropertiesHyphen as CSSProperties } from 'csstype';
import type { RGB255 } from '../../types';
import { effect, reactive } from '../reactive';
import { type SceneSetup } from '../scene';
import { h } from '../util';

// mask
type MaskFunction = (x: number, y: number) => number;
export const GaussianMask =
  (sigma: number): MaskFunction =>
  (x, y) =>
    Math.exp(-(x ** 2 + y ** 2) / (2 * sigma ** 2));

// stim
export const TextStim = function (
  props: CSSProperties & { children?: string | Node | (string | Node)[] },
) {
  const el = h('div', {
    className: 'psytask-center',
    style: { 'white-space': 'pre-line', 'line-height': 1.5, padding: '2rem' },
  });

  effect(() => {
    const children = props.children ?? 'Hello Word';
    Array.isArray(children)
      ? el.replaceChildren(...children)
      : el.replaceChildren(children);
  });
  for (const key of Object.keys(props))
    if (key !== 'children')
      //@ts-ignore
      effect(() => (el.style[key] = props[key]));

  return { node: el };
} satisfies SceneSetup;

export const ImageStim = function (props: {
  image?: ImageBitmap | ImageData;
  draw?(ctx: CanvasRenderingContext2D): void;
}) {
  const el = h('canvas');
  const ctx = el.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas 2d context');
  }

  effect(() => {
    ctx.clearRect(0, 0, el.width, el.height);

    const image = props.image;
    if (image) {
      [el.width, el.height] = [image.width, image.height];
      if (image instanceof ImageData) ctx.putImageData(image, 0, 0);
      else ctx.drawImage(image, 0, 0);
    }

    props.draw?.(ctx);
  });

  return { node: el };
} satisfies SceneSetup;

type WaveFunction = (x: number) => number;
const waves = {
  sin: Math.sin,
  square: (x) => (Math.sin(x) >= 0 ? 1 : -1),
  triangle: (x) => (2 / Math.PI) * Math.asin(Math.sin(x)),
  sawtooth: (x) => (2 / Math.PI) * ((x % (2 * Math.PI)) - Math.PI),
} satisfies Record<string, WaveFunction>;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export const Grating = function (props: {
  /** Wave type or wave function that return [-1, 1] */
  type: keyof typeof waves | WaveFunction;
  /** Width or [width, height] @unit pix */
  size: number | [number, number];
  /** Spatial frequency @unit cycle/pix */
  sf: number;
  /** Orientation @unit rad */
  ori?: number;
  /** @unit rad */
  phase?: number;
  /** Color or [color, color] @unit rgb255 */
  color?: RGB255 | [RGB255, RGB255];
  /** Mask function that inputs [-1, 1] and returns [0, 1] */
  mask?: MaskFunction;
}) {
  const imageProps = reactive({ image: null as unknown as ImageData });
  effect(() => {
    const p = { ori: 0, phase: 0, color: [0, 0, 0] as RGB255, ...props };
    const [w, h] = typeof p.size === 'number' ? [p.size, p.size] : p.size;

    const cosOri = Math.cos(p.ori);
    const sinOri = Math.sin(p.ori);

    const centerX = w / 2;
    const centerY = h / 2;

    const imageData = new ImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - centerX;
        const dy = y - centerY;

        const rotatedX = dx * cosOri + dy * sinOri;
        const pos = rotatedX * p.sf * 2 * Math.PI + p.phase;
        const waveValue =
          typeof p.type === 'string' ? waves[p.type](pos) : p.type(pos);
        const intensity = (waveValue + 1) / 2; // [-1, 1] to [0, 1]

        const rgba = (
          p.color.length === 2
            ? [
                ...p.color[1].map(
                  //@ts-ignore
                  (c, i) => c + intensity * (p.color[0][i] - c),
                ),
                255,
              ]
            : [...p.color, 255 * intensity]
        ) as [number, number, number, number];

        if (rgba[3] > 0 && p.mask) {
          rgba[3] *= p.mask(dx / centerX, dy / centerY);
        }

        let pixelIndex = (y * w + x) * 4;
        for (const value of rgba) {
          imageData.data[pixelIndex++] = clamp(Math.round(value), 0, 255);
        }
      }
    }

    imageProps.image = imageData;
  });
  return ImageStim(imageProps);
} satisfies SceneSetup;

export const VirtualChinrest = function (
  props: {
    i18n?: {
      confirm: string;
      yes: string;
      no: string;
      screen_width: string;
      line_spacing: string;
      distance: string;
      SWT_guide: string;
      DT_guide: string;
      DT_start: string;
      DT_stop: string;
    };
    blindspotDegree?: number;
    usePreviousData?: boolean;
  },
  ctx,
) {
  const p = Object.assign(
    {
      i18n: {
        confirm: 'Use previous chinrest data?',
        yes: 'Yes',
        no: 'No',
        screen_width: 'Screen Width',
        line_spacing: 'Line Spacing',
        distance: 'Distance',
        SWT_guide:
          'Move the lower right line and measure the spacing (cm) between the two lines.',
        DT_guide: 'Close right eye, focus left eye on square, keep head still.',
        DT_start: '👆🏻 Click here to start',
        DT_stop: '👆🏻 Click again when red circle disappears',
      },
      blindspotDegree: 13.5,
    } satisfies typeof props,
    props,
  );
  const state = reactive({
    // screen width
    line_spacing_pix: Math.floor(ctx.app.data.window_wh_pix[0] / 2),
    line_spacing_cm: 0,
    pix_per_cm: 0,
    screen_width_cm: 0,
    // visual distance
    move_width_pix: 0,
    move_widths: [] as { pix: number; cm: number }[],
    distance_cm: 0,
  });
  effect(() => {
    state.pix_per_cm = state.line_spacing_pix / state.line_spacing_cm;
  });
  effect(() => {
    state.line_spacing_cm = state.line_spacing_pix / state.pix_per_cm;
  });
  effect(() => {
    state.pix_per_cm = ctx.app.data.screen_wh_pix[0] / state.screen_width_cm;
  });
  effect(() => {
    state.screen_width_cm = ctx.app.data.screen_wh_pix[0] / state.pix_per_cm;
  });
  effect(() => {
    const { move_widths } = state;
    const move_width_cm =
      move_widths.length &&
      move_widths.reduce((a, b) => a + b.cm, 0) / move_widths.length;
    state.distance_cm =
      move_width_cm / 2 / Math.tan((p.blindspotDegree / 2) * (Math.PI / 180));
  });

  // dom
  const inputTemplate = (p: {
    id: string;
    label: string;
    key: Extract<keyof typeof state, `${string}cm`>;
  }) => {
    const inp = h('input', {
      id: p.id,
      type: 'number',
      min: '1',
      step: 'any',
      required: true,
      onchange(e) {
        const val = +(e.target as HTMLInputElement).value;
        if (!Number.isNaN(val)) state[p.key] = val;
        else console.warn(`Invalid ${p.id}:`, e);
      },
    });
    effect(() => {
      inp.value = state[p.key] + '';
    });
    return h('div', null, [h('label', { htmlFor: p.id }, p.label + ' '), inp]);
  };
  const panelTemplate = (
    p: {
      title: string;
      content: HTMLElement;
      onSuccess: () => void;
    } & Parameters<typeof inputTemplate>[0],
  ) => {
    return h(
      'form',
      { style: { margin: '2rem' }, onsubmit: (e: Event) => e.preventDefault() },
      [
        h('h2', null, p.title),
        p.content,
        inputTemplate(p),
        h(
          'button',
          {
            type: 'button',
            style: { width: '100%', 'margin-top': '0.5rem' },
            onclick(e) {
              const form = (e.target as HTMLButtonElement).form!;
              form.checkValidity() ? p.onSuccess() : form.reportValidity();
            },
          },
          'OK',
        ),
      ],
    );
  };
  const triangleTemplate = (color: string, direction: 'up' | 'down') => {
    const size = 6;
    return h('div', {
      style: {
        position: 'absolute',
        left: -(size - 0.5) + 'px',
        width: '0',
        height: '0',
        'border-style': 'solid',
        'border-width':
          direction === 'up'
            ? `0 ${size}px ${size}px ${size}px`
            : `${size}px ${size}px 0 ${size}px`,
        'border-color':
          direction === 'up'
            ? `transparent transparent ${color} transparent`
            : `${color} transparent transparent transparent`,
        [direction === 'up' ? 'bottom' : 'top']: -(size - 0.5) + 'px',
      },
    });
  };
  const crossTemplate = () => {
    const sharedStyle = {
      position: 'absolute',
      'background-color': '#000',
      'pointer-events': 'none',
    } satisfies CSSProperties;
    return [
      h('div', {
        style: { ...sharedStyle, left: '50%', width: '1px', height: '100%' },
      }),
      h('div', {
        style: { ...sharedStyle, top: '50%', width: '100%', height: '1px' },
      }),
    ];
  };
  const screenWidthEL = panelTemplate({
    title: '👀 ' + p.i18n.screen_width,
    id: 'screen-width-input',
    label: p.i18n.screen_width + ' (cm):',
    key: 'screen_width_cm',
    content: (() => {
      const sharedStyle = {
        position: 'absolute',
        width: '1px',
        height: '10rem',
      } satisfies CSSProperties;

      const fixedLine = h(
        'div',
        { style: { background: '#fff', ...sharedStyle, left: 0 } },
        [triangleTemplate('#fff', 'up'), triangleTemplate('#fff', 'down')],
      );

      let isDragging = false;
      const movableLine = h(
        'div',
        {
          style: { background: '#f00', ...sharedStyle, cursor: 'ew-resize' },
          onpointerdown: () => (isDragging = true),
        },
        [triangleTemplate('#f00', 'up'), triangleTemplate('#f00', 'down')],
      );
      effect(() => {
        movableLine.style.left =
          state.line_spacing_pix / ctx.app.data.dpr + 'px';
      });
      ctx
        .on('pointerup', () => (isDragging = false))
        .on('pointermove', (e) => {
          if (!isDragging) return;
          const sx = fixedLine.getBoundingClientRect().x;
          state.line_spacing_pix = (e.clientX - sx) * ctx.app.data.dpr;
        });

      const hint = h('p');
      effect(() => {
        hint.textContent =
          p.i18n.line_spacing + ' (pix): ' + state.line_spacing_pix;
      });
      return h('div', null, [
        p.i18n.SWT_guide,
        h(
          'div',
          {
            style: {
              position: 'relative',
              margin: '2rem',
              height: sharedStyle.height,
            },
          },
          [fixedLine, movableLine],
        ),
        hint,
        inputTemplate({
          id: 'line-spacing-input',
          label: p.i18n.line_spacing + ' (cm):',
          key: 'line_spacing_cm',
        }),
      ]);
    })(),
    onSuccess() {
      console.info('screen width:', state.screen_width_cm);
      text.props.children = distanceEl;
    },
  });
  const distanceEl = panelTemplate({
    title: '👀 ' + p.i18n.distance,
    id: 'distance-input',
    label: p.i18n.distance + ' (cm):',
    key: 'distance_cm',
    content: (() => {
      const size = 24;
      const sharedStyle = {
        position: 'absolute',
        width: size + 'px',
        height: size + 'px',
        'user-select': 'none',
      } satisfies CSSProperties;

      const guide = h(
        'div',
        { style: { position: 'absolute', top: '100%', width: 'max-content' } },
        p.i18n.DT_start,
      );
      const fixedObj = h(
        'div',
        {
          style: {
            ...sharedStyle,
            right: 0,
            'background-color': '#fff',
            cursor: 'pointer',
          },
          onpointerup() {
            if (!isMoving) {
              isMoving = true;
              fixedObj.style.cursor = 'progress';
              guide.textContent = p.i18n.DT_stop;
              return;
            }
            isMoving = false;
            fixedObj.style.cursor = 'pointer';
            guide.textContent = p.i18n.DT_start;

            // reset
            const pix = state.move_width_pix;
            state.move_width_pix = 0;

            state.move_widths = [
              ...state.move_widths,
              { pix, cm: pix / state.pix_per_cm },
            ];
          },
        },
        [...crossTemplate(), guide],
      );

      let isMoving = false;
      const movableObj = h(
        'div',
        {
          style: {
            ...sharedStyle,
            'background-color': '#f00',
            'border-radius': '50%',
          },
        },
        crossTemplate(),
      );
      effect(() => {
        movableObj.style.right =
          size + state.move_width_pix * ctx.app.data.dpr + 'px';
      });
      ctx.on('scene:frame', () => {
        if (isMoving) state.move_width_pix += 1;
      });

      const dots = h('div');
      const dotSize = 4;
      effect(() => {
        dots.replaceChildren(
          ...state.move_widths.map(({ pix, cm }) =>
            h('span', {
              title: cm + ' cm',
              style: {
                position: 'absolute',
                top: (size - dotSize) / 2 + 'px',
                right: size + pix * ctx.app.data.dpr + 'px',
                'background-color': '#fff5',
                width: dotSize + 'px',
                height: dotSize + 'px',
                'border-radius': '50%',
              },
            }),
          ),
        );
      });

      return h('div', null, [
        p.i18n.DT_guide,
        h(
          'div',
          {
            style: {
              position: 'relative',
              margin: '2rem',
              height: size + 'px',
            },
          },
          [dots, fixedObj, movableObj],
        ),
      ]);
    })(),
    onSuccess() {
      const { screen_width_cm, distance_cm } = state;
      localStorage.setItem(
        sKey,
        JSON.stringify({ screen_width_cm, distance_cm }, null, 2),
      );
      ctx.close();
    },
  });

  // logic
  const sKey = 'psytask:VirtualChinrest:store';
  const text = ctx.use(TextStim, { children: '' });
  effect(() => {
    const { usePreviousData } = props;
    const sValue = localStorage.getItem(sKey);

    if (!sValue || usePreviousData === false) {
      text.props.children = screenWidthEL;
      return;
    }
    if (usePreviousData === true) {
      Object.assign(state, JSON.parse(sValue));
      ctx.on('scene:show', () => ctx.close());
      return;
    }
    // show confirmation
    text.props.children = [
      h('h3', null, p.i18n.confirm),
      h('pre', null, sValue),
      h(
        'div',
        {
          style: {
            display: 'grid',
            'grid-template-columns': '1fr 1fr',
            gap: '1rem',
          },
        },
        [
          {
            style: { width: '5rem' },
            textContent: p.i18n.yes,
            onclick() {
              Object.assign(state, JSON.parse(sValue));
              ctx.close();
            },
          },
          {
            textContent: p.i18n.no,
            onclick: () => (text.props.children = screenWidthEL),
          },
        ].map((p) => h('button', p)),
      ),
    ];
  });

  return {
    node: text.node,
    data() {
      console.info('VirtualChinrest', { ...state });
      const { pix_per_cm, distance_cm } = state;
      const deg2cm = (deg: number) =>
        2 * distance_cm * Math.tan((deg / 2) * (Math.PI / 180));
      const deg2pix = (deg: number) => deg2cm(deg) * pix_per_cm;
      return {
        pix_per_cm,
        distance_cm,
        deg2cm,
        deg2pix,
        deg2csspix: (deg: number) => deg2pix(deg) / ctx.app.data.dpr,
      };
    },
  };
} satisfies SceneSetup;
