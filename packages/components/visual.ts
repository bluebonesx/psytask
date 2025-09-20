import type { PropertiesHyphen as CSSProperties } from 'csstype';
import van from 'vanjs-core';
import { calc, reactive } from 'vanjs-ext';
import { adapter, FlexCenter } from '.';
import { useDevicePixelRatio, useScreenPhysicalSize } from './hooks';
import { clamp } from 'shared/utils';

const { canvas, div, input, label, h2, h3, p, pre, span, button, form, b } =
  van.tags;

/**
 * Image stimulus for displaying images or custom canvas drawings
 *
 * @example
 *
 * ```ts
 * using image = app.scene(ImageStim, {
 *   defaultProps: () => ({
 *     image: await window.createImageBitmap(
 *       await(await fetch('image.png')).blob(),
 *     ),
 *     draw(ctx) {
 *       ctx.fillStyle = 'red';
 *       ctx.fillRect(10, 10, 100, 100);
 *       ctx.fillStyle = 'blue';
 *       ctx.beginPath();
 *       ctx.arc(60, 60, 30, 0, 2 * Math.PI);
 *       ctx.fill();
 *     },
 *   }),
 * });
 * ```
 */
export const ImageStim = adapter(
  (props: {
    image?: ImageBitmap | ImageData;
    draw?(ctx: CanvasRenderingContext2D): void;
  }) => {
    const el = canvas();
    const ctx = el.getContext('2d');
    if (!ctx)
      return FlexCenter({
        content: b({ style: 'color:red' }, 'Failed to get canvas 2d context'),
      });

    van.derive(() => {
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
  },
);

type RGB255 = [number, number, number];
type MaskFunction = (x: number, y: number) => number;
type WaveFunction = (x: number) => number;

/**
 * Creates a Gaussian mask function
 *
 * @param sigma - Standard deviation of the Gaussian function (controls spread)
 * @returns A mask function that takes normalized coordinates and returns
 *   opacity
 */
export const GaussianMask =
  (sigma: number): MaskFunction =>
  (x, y) =>
    Math.exp(-(x ** 2 + y ** 2) / (2 * sigma ** 2));
const waves = {
  sin: Math.sin,
  square: (x) => (Math.sin(x) >= 0 ? 1 : -1),
  triangle: (x) => (2 / Math.PI) * Math.asin(Math.sin(x)),
  sawtooth: (x) => (2 / Math.PI) * ((x % (2 * Math.PI)) - Math.PI),
} satisfies Record<string, WaveFunction>;

/**
 * Grating stimulus
 *
 * @example
 *
 * ```ts
 * using grating = app.scene(Grating, {
 *   defaultProps: () => ({
 *     type: 'sin',
 *     size: [200, 200],
 *     sf: 0.05,
 *     ori: Math.PI / 4,
 *     phase: 0,
 *     color: [255, 255, 255],
 *     mask: GaussianMask(0.3),
 *   }),
 * });
 * ```
 */
export const Grating = adapter(
  (props: {
    /** Wave type or wave function that return [-1, 1] */
    type: keyof typeof waves | WaveFunction;
    /** Width or [width, height] (in pixels) */
    size: number | [number, number];
    /** Spatial frequency (cycles per pixel) */
    sf: number;
    /** Orientation (in radians) */
    ori?: number;
    /** Phase (in radians) */
    phase?: number;
    /** Color or [color, color] (RGB255 values) */
    color?: RGB255 | [RGB255, RGB255];
    /** Mask function that inputs [-1, 1] and returns [0, 1] */
    mask?: MaskFunction;
  }) => {
    const image = calc(() => {
      const p = { ori: 0, phase: 0, color: [0, 0, 0] as const, ...props };
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

      return imageData;
    });
    return ImageStim(reactive({ image }));
  },
);

/**
 * Virtual chinrest for acquiring screen physical width and distance.
 *
 * @example
 *
 * ```ts
 * using chinrest = app.scene(VirtualChinrest, {
 *   defaultProps: () => ({
 *     usePreviousData: false,
 *     blindspotDegree: 13.5,
 *   }),
 * });
 * const { distance_cm, pix_per_cm, deg2cm, deg2pix, deg2csspix } =
 *   await chinrest.show();
 * ```
 */
export const VirtualChinrest = adapter(
  (
    props: {
      /** Internationalization strings */
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
      /** Blindspot degree (in degrees) @default 13.5 */
      blindspotDegree?: number;
      /**
       * Use previous chinrest data. If not provided, it will show a
       * confirmation scene.
       */
      usePreviousData?: boolean;
    },
    ctx,
  ) => {
    const ps = Object.assign(
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
          DT_guide:
            'Close right eye, focus left eye on square, keep head still.',
          DT_start: '👆🏻 Click here to start',
          DT_stop: '👆🏻 Click again when red circle disappears',
        },
        blindspotDegree: 13.5,
      } satisfies typeof props,
      props,
    );

    const dpr = useDevicePixelRatio(ctx);
    const screen_size = useScreenPhysicalSize(dpr);
    const state = reactive({
      // screen width
      line_spacing_pix: Math.floor(innerWidth / 2),
      line_spacing_cm: 0,
      pix_per_cm: 0,
      screen_width_cm: 0,
      // visual distance
      move_width_pix: 0,
      move_widths: [] as { pix: number; cm: number }[],
      distance_cm: 0,
    });
    van.derive(() => {
      state.pix_per_cm = state.line_spacing_pix / state.line_spacing_cm;
    });
    van.derive(() => {
      state.line_spacing_cm = state.line_spacing_pix / state.pix_per_cm;
    });
    van.derive(() => {
      state.pix_per_cm = screen_size.width / state.screen_width_cm;
    });
    van.derive(() => {
      state.screen_width_cm = screen_size.width / state.pix_per_cm;
    });
    van.derive(() => {
      const { move_widths } = state;
      const move_width_cm =
        move_widths.length &&
        move_widths.reduce((a, b) => a + b.cm, 0) / move_widths.length;
      state.distance_cm =
        move_width_cm /
        2 /
        Math.tan((ps.blindspotDegree / 2) * (Math.PI / 180));
    });

    // dom
    const inputTemplate = (p: {
      id: string;
      label: string;
      key: Extract<keyof typeof state, `${string}cm`>;
    }) => {
      const inp = input({
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
      van.derive(() => {
        inp.value = state[p.key] + '';
      });
      return div(label({ for: p.id }, p.label + ' '), inp);
    };
    const panelTemplate = (
      p: {
        title: string;
        content: HTMLElement;
        onSuccess: () => void;
      } & Parameters<typeof inputTemplate>[0],
    ) => {
      return form(
        { style: 'margin: 2rem', onsubmit: (e: Event) => e.preventDefault() },
        [
          h2(p.title),
          p.content,
          inputTemplate(p),
          button(
            {
              type: 'button',
              style: 'width: 100%; margin-top: 0.5rem',
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
      return div({
        style: `position: absolute; left: ${-(size - 0.5)}px; width: 0; height: 0; border-style: solid; border-width: ${
          direction === 'up'
            ? `0 ${size}px ${size}px ${size}px`
            : `${size}px ${size}px 0 ${size}px`
        }; border-color: ${
          direction === 'up'
            ? `transparent transparent ${color} transparent`
            : `${color} transparent transparent transparent`
        }; ${direction === 'up' ? 'bottom' : 'top'}: ${-(size - 0.5)}px`,
      });
    };
    const crossTemplate = () => {
      const sharedStyle = {
        position: 'absolute',
        'background-color': '#000',
        'pointer-events': 'none',
      } satisfies CSSProperties;
      return [
        div({
          style: `${Object.entries(sharedStyle)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ')}; left: 50%; width: 1px; height: 100%`,
        }),
        div({
          style: `${Object.entries(sharedStyle)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ')}; top: 50%; width: 100%; height: 1px`,
        }),
      ];
    };
    const screenWidthEL = panelTemplate({
      title: '👀 ' + ps.i18n.screen_width,
      id: 'screen-width-input',
      label: ps.i18n.screen_width + ' (cm):',
      key: 'screen_width_cm',
      content: (() => {
        const sharedStyle = {
          position: 'absolute',
          width: '1px',
          height: '10rem',
        } satisfies CSSProperties;

        const fixedLine = div(
          {
            style: `background: #fff; ${Object.entries(sharedStyle)
              .map(([k, v]) => `${k}: ${v}`)
              .join('; ')}; left: 0`,
          },
          [triangleTemplate('#fff', 'up'), triangleTemplate('#fff', 'down')],
        );

        let isDragging = false;
        const movableLine = div(
          {
            style: `background: #f00; ${Object.entries(sharedStyle)
              .map(([k, v]) => `${k}: ${v}`)
              .join('; ')}; cursor: ew-resize`,
            onpointerdown: () => (isDragging = true),
          },
          [triangleTemplate('#f00', 'up'), triangleTemplate('#f00', 'down')],
        );
        van.derive(() => {
          movableLine.style.left = state.line_spacing_pix / dpr.val + 'px';
        });
        ctx
          .on('pointerup', () => (isDragging = false))
          .on('pointermove', (e) => {
            if (!isDragging) return;
            const sx = fixedLine.getBoundingClientRect().x;
            state.line_spacing_pix = (e.clientX - sx) * dpr.val;
          });

        const hint = p();
        van.derive(() => {
          hint.textContent =
            ps.i18n.line_spacing + ' (pix): ' + state.line_spacing_pix;
        });
        return div([
          ps.i18n.SWT_guide,
          div(
            {
              style: `position: relative; margin: 2rem; height: ${sharedStyle.height}`,
            },
            [fixedLine, movableLine],
          ),
          hint,
          inputTemplate({
            id: 'line-spacing-input',
            label: ps.i18n.line_spacing + ' (cm):',
            key: 'line_spacing_cm',
          }),
        ]);
      })(),
      onSuccess() {
        console.info('screen width:', state.screen_width_cm);
        node.val = distanceEl;
      },
    });
    const distanceEl = panelTemplate({
      title: '👀 ' + ps.i18n.distance,
      id: 'distance-input',
      label: ps.i18n.distance + ' (cm):',
      key: 'distance_cm',
      content: (() => {
        const size = 24;
        const sharedStyle = {
          position: 'absolute',
          width: size + 'px',
          height: size + 'px',
          'user-select': 'none',
        } satisfies CSSProperties;

        const guide = div(
          { style: 'position: absolute; top: 100%; width: max-content' },
          ps.i18n.DT_start,
        );
        const fixedObj = div(
          {
            style: `${Object.entries(sharedStyle)
              .map(([k, v]) => `${k}: ${v}`)
              .join('; ')}; right: 0; background-color: #fff; cursor: pointer`,
            onpointerup() {
              if (!isMoving) {
                isMoving = true;
                fixedObj.style.cursor = 'progress';
                guide.textContent = ps.i18n.DT_stop;
                return;
              }
              isMoving = false;
              fixedObj.style.cursor = 'pointer';
              guide.textContent = ps.i18n.DT_start;

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
        const movableObj = div(
          {
            style: `${Object.entries(sharedStyle)
              .map(([k, v]) => `${k}: ${v}`)
              .join('; ')}; background-color: #f00; border-radius: 50%`,
          },
          crossTemplate(),
        );
        van.derive(() => {
          movableObj.style.right = size + state.move_width_pix * dpr.val + 'px';
        });
        ctx.on('scene:frame', () => {
          if (isMoving) state.move_width_pix += 1;
        });

        const dots = div();
        const dotSize = 4;
        van.derive(() => {
          dots.replaceChildren(
            ...state.move_widths.map(({ pix, cm }) =>
              span({
                title: cm + ' cm',
                style: `position: absolute; top: ${(size - dotSize) / 2}px; right: ${size + pix * dpr.val}px; background-color: #fff5; width: ${dotSize}px; height: ${dotSize}px; border-radius: 50%`,
              }),
            ),
          );
        });

        return div([
          ps.i18n.DT_guide,
          div(
            { style: `position:relative; margin:2rem; height:${size}px` },
            dots,
            fixedObj,
            movableObj,
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
    const sKey = 'psytask:virtual-chinrest:data';
    // const text = ctx.use(TextStim, { children: '' });
    const node = van.derive(() => {
      const { usePreviousData } = props;
      const sValue = localStorage.getItem(sKey);

      if (!sValue || usePreviousData === false) {
        return screenWidthEL;
      }
      if (usePreviousData === true) {
        Object.assign(state, JSON.parse(sValue));
        ctx.on('scene:show', () => ctx.close());
        return;
      }
      // show confirmation
      return div(
        h3(ps.i18n.confirm),
        pre(sValue),
        div(
          { style: 'display:grid; grid-template-columns:1fr 1fr; gap:1rem' },
          [
            button({
              style: 'width: 5rem',
              textContent: ps.i18n.yes,
              onclick() {
                Object.assign(state, JSON.parse(sValue));
                ctx.close();
              },
            }),
            button({
              textContent: ps.i18n.no,
              onclick: () => (node.val = screenWidthEL),
            }),
          ],
        ),
      );
    });

    return {
      node: div(() => node.val),
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
          /**
           * Convert degree to physical pixel. You shouldn't use it to set
           * element size.
           */
          deg2pix,
          /**
           * Convert degree to CSS pixel.
           *
           * Counteract system zoom and page zoom, which makes sure the visual
           * representation has the same physical size across different
           * devices.
           *
           * @example Counteract for dynamic changes in system zoom and page
           * zoom.
           *
           * ```ts
           * van.derive(() => {
           *   el.style.width = deg2csspix(1) + 'px';
           * });
           * ```
           */
          deg2csspix: (deg: number) => deg2pix(deg) / dpr.val,
        };
      },
    };
  },
);
