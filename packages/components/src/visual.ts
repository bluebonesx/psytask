import type { PropertiesHyphen as CSSProperties } from 'csstype';
import { clamp, ERR, getter_normalize, modify } from 'shared/utils';
import van from 'vanjs-core';
import { calc, list, reactive } from 'vanjs-ext';
import { useDevicePixelRatio, useScreenPhysicalPix } from './hooks';
import { adapter, css, defaultProps, type MaybeGetter } from './utils';
import { Container } from './base';

const { canvas, div, input, label, h2, h3, pre, span, button, form } = van.tags;

/**
 * Image stimulus for displaying images or custom canvas drawings
 *
 * @example
 *
 * Load image from URL
 *
 * ```ts
 * const bitmap = await window.createImageBitmap(
 *   await (await fetch('https://picsum.photos/200/300')).blob(),
 * );
 * using image = app.scene(ImageStim, {
 *   defaultProps: { image: bitmap },
 * });
 * ```
 *
 * Draw custom graphics
 *
 * ```ts
 * using image = app.scene(ImageStim, {
 *   defaultProps: {
 *     draw(ctx) {
 *       ctx.fillStyle = 'red';
 *       ctx.fillRect(10, 10, 100, 100);
 *       ctx.fillStyle = 'blue';
 *       ctx.beginPath();
 *       ctx.arc(60, 60, 30, 0, 2 * Math.PI);
 *       ctx.fill();
 *     },
 *   },
 * });
 * ```
 */
export const ImageStim = adapter(
  (props: {
    image?: MaybeGetter<ImageBitmap | ImageData>;
    draw?(ctx: CanvasRenderingContext2D): void;
  }) => {
    const el = canvas();
    const ctx = el.getContext('2d');
    if (!ctx) return ERR('Failed to get canvas 2d context');

    van.derive(() => {
      ctx.clearRect(0, 0, el.width, el.height);

      const image = getter_normalize(props.image);
      if (image) {
        [el.width, el.height] = [image.width, image.height];
        image instanceof ImageData
          ? ctx.putImageData(image, 0, 0)
          : ctx.drawImage(image, 0, 0);
      }

      props.draw?.(ctx);
    });

    return el;
  },
);

type RGB255 = [R: number, G: number, B: number];
type Mask = (x: number, y: number) => number;
type Wave = (x: number) => number;

export const GaussianMask =
  /**
   * It based on the formula:
   *
   * ```latex
   * M(x, y) = e^{-\frac{x^2 + y^2}{2\sigma^2}}
   * ```
   *
   * @returns Mask function that convert coordinates [-1, 1] to opacity [0, 1]
   */
  (sigma: number): Mask =>
    (x, y) =>
      Math.exp(-(x ** 2 + y ** 2) / (2 * sigma ** 2));
const waves = {
  sin: Math.sin,
  square: (x) => (Math.sin(x) >= 0 ? 1 : -1),
  triangle: (x) => (2 / Math.PI) * Math.asin(Math.sin(x)),
  sawtooth: (x) => (2 / Math.PI) * ((x % (2 * Math.PI)) - Math.PI),
} satisfies Record<string, Wave>;

/**
 * Grating
 *
 * @example
 *
 * Draw basic gabor
 *
 * ```ts
 * using grating = app.scene(Grating, {
 *   defaultProps: {
 *     type: 'sin',
 *     size: [200, 200],
 *     sf: 0.05,
 *     ori: Math.PI / 4,
 *     phase: 0,
 *     color: [255, 255, 255],
 *     mask: GaussianMask(0.3),
 *   },
 * });
 * ```
 */
export const Grating = adapter(
  (
    props: {
      /**
       * Wave type or wave function that convert radians (-Inf, Inf) to
       * amplitude [-1, 1]
       */
      type: keyof typeof waves | Wave;
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
      /** Convert coordinates [-1, 1] to opacity [0, 1] */
      mask?: Mask;
    },
    ctx,
  ) => {
    const image = () => {
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
          const amplitude =
            typeof p.type === 'string' ? waves[p.type](pos) : p.type(pos); // from rad to [-1, 1]
          const intensity = (amplitude + 1) / 2; // from [-1, 1] to [0, 1]

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

          if (rgba[3] > 0 && p.mask)
            rgba[3] *= p.mask(dx / centerX, dy / centerY);

          let pixelIndex = (y * w + x) * 4;
          for (const value of rgba)
            imageData.data[pixelIndex++] = clamp(Math.round(value), 0, 255);
        }
      }

      return imageData;
    };
    return ImageStim({ image }, ctx);
  },
);
// TODO: Noise

/**
 * Virtual chinrest for acquiring screen physical width and distance.
 *
 * @example
 *
 * Show chinrest and get data
 *
 * ```ts
 * using chinrest = app.scene(VirtualChinrest, {
 *   defaultProps: {
 *     usePreviousData: false,
 *     blindspotDegree: 13.5,
 *   },
 * });
 * const { distance_cm, pix_per_cm, deg2cm, deg2pix, deg2csspix } =
 *   await chinrest.show();
 * ```
 */
export const VirtualChinrest = adapter(
  (
    _props: {
      /** Internationalization strings */
      i18n?: {
        confirmation: string;
        yes: string;
        no: string;
        screen_width: string;
        line_distance: string;
        view_distance: string;
        screen_width_guide: string;
        view_distance_guide: string;
      };
      /** Blindspot degree @default 13.5 */
      blindspotDegree?: number;
      /**
       * Use previous chinrest data. If not provided, it will show a
       * confirmation scene.
       */
      usePreviousData?: boolean;
    },
    ctx,
  ) => {
    const state = reactive({
      // screen width
      line_distance_pix: Math.floor(innerWidth / 2),
      line_distance_cm: 8.56, // fixed by user
      screen_width_cm: 0, // derived
      pix_per_cm: 0,
      // view distance
      move_width_pix: 0,
      move_widths: [] as { pix: number; cm: number }[],
      distance_cm: 0,
    });
    const props = defaultProps(_props, {
      i18n: {
        confirmation: 'Use previous chinrest data?',
        yes: 'Yes',
        no: 'No',
        screen_width: 'Screen Width',
        line_distance: 'Line Distance',
        view_distance: 'View Distance',
        screen_width_guide: `Move the red line so that the line distance equals the width of a credit card (${state.line_distance_cm} cm).
Or, you can input the line distance by measuring it yourself.
Or, you can input your screen width directly if you know it.`,
        view_distance_guide: `Close right eye, focus left eye on the black square, keep head still.
Click the black square to move the red circle toward right.
Click again when the red circle disappears.`,
      },
      blindspotDegree: 13.5,
    });

    const dpr = useDevicePixelRatio(ctx);
    const screen_pix = useScreenPhysicalPix(dpr);
    van.derive(
      () =>
        (state.pix_per_cm = state.line_distance_pix / state.line_distance_cm),
    );
    // van.derive(
    //   () => (state.line_distance_cm = state.line_distance_pix / state.pix_per_cm),
    // );
    van.derive(
      () => (state.pix_per_cm = screen_pix.width / state.screen_width_cm),
    );
    van.derive(
      () => (state.screen_width_cm = screen_pix.width / state.pix_per_cm),
    );
    van.derive(() => {
      const { move_widths } = state;
      const move_width_cm =
        move_widths.length &&
        move_widths.reduce((a, b) => a + b.cm, 0) / move_widths.length;
      state.distance_cm =
        move_width_cm /
        2 /
        Math.tan((props.blindspotDegree / 2) * (Math.PI / 180));
    });

    const sKey = 'psytask:virtual-chinrest:data';
    const sValue = van.state('');
    const display = van.derive<
      'confirmation' | 'screen_width' | 'view_distance' | ''
    >(() =>
      sValue
        ? props.usePreviousData
          ? '' // close immediately
          : props.usePreviousData == null
            ? 'confirmation'
            : 'screen_width'
        : 'screen_width',
    );
    van.derive(() => display.val || ctx.close());
    ctx.on('scene:show', () => {
      sValue.val = localStorage.getItem(sKey) ?? '';
      display.val || ctx.close();
    });

    // dom
    const Input = (p: {
      label: () => string;
      key: Extract<keyof typeof state, `${string}_cm`>;
    }) =>
      div(
        label({ for: p.key }, p.label),
        input({
          id: p.key,
          type: 'number',
          min: '1',
          step: 'any',
          required: true,
          value: () => state[p.key],
          onchange(e) {
            const val = +(e.target as HTMLInputElement).value;
            if (!Number.isNaN(val)) state[p.key] = val;
            else console.warn(`Invalid ${p.key}:`, e);
          },
        }),
      );
    const Panel = (p: {
      type: 'screen_width' | 'view_distance';
      content: HTMLElement;
      onSuccess: () => void;
    }) =>
      form(
        {
          hidden: () => display.val !== p.type,
          onsubmit: (e: Event) => e.preventDefault(),
        },
        h2(() => '👀 ' + props.i18n[p.type]),
        span(() => props.i18n[`${p.type}_guide`]),
        p.content,
        button(
          {
            type: 'button',
            style: css({ width: '100%', 'margin-top': '0.5rem' }),
            onclick(e) {
              const form = (e.target as HTMLButtonElement).form!;
              form.checkValidity() ? p.onSuccess() : form.reportValidity();
            },
          },
          'OK',
        ),
      );
    const Triangles = (color: string, size = 6) =>
      [1, 0].map((isUp) =>
        div({
          style: css({
            position: 'absolute',
            left: `${-(size - 0.5)}px`,
            width: '0',
            height: '0',
            'border-style': 'solid',
            'border-width': isUp
              ? `0 ${size}px ${size}px ${size}px`
              : `${size}px ${size}px 0 ${size}px`,
            'border-color': isUp
              ? `transparent transparent ${color} transparent`
              : `${color} transparent transparent transparent`,
            [isUp ? 'bottom' : 'top']: `${-(size - 0.5)}px`,
          }),
        }),
      );
    const screen_width_el = Panel({
      type: 'screen_width',
      content: (() => {
        const left = 32;
        const height = '10rem';
        const sharedStyle = css({ position: 'absolute', width: '1px', height });

        const fixed = div(
          {
            style: sharedStyle + css({ background: '#000', left: left + 'px' }),
          },
          ...Triangles('#000'),
        );

        let sx = 0; // start x, no drag if 0
        ctx
          .on('pointerup', (e) => (sx = 0))
          .on(
            'pointermove',
            (e) => sx && (state.line_distance_pix = (e.clientX - sx) * dpr.val),
          );
        return div(
          div(
            { style: css({ margin: '2rem', height }) },
            // fixed line
            fixed,
            // movable line
            div(
              {
                style: () =>
                  sharedStyle +
                  css({
                    cursor: 'ew-resize',
                    background: 'red',
                    left: left + state.line_distance_pix / dpr.val + 'px',
                  }),
                onpointerdown: (e) =>
                  (sx = Math.floor(fixed.getBoundingClientRect().x)),
              },
              ...Triangles('red'),
            ),
          ),
          div(
            () =>
              props.i18n.line_distance + ' (pix): ' + state.line_distance_pix,
          ),
          Input({
            label: () => props.i18n.line_distance + ' (cm): ',
            key: 'line_distance_cm',
          }),
          Input({
            label: () => props.i18n.screen_width + ' (cm): ',
            key: 'screen_width_cm',
          }),
        );
      })(),
      onSuccess() {
        display.val = 'view_distance';
      },
    });
    const view_distance_el = Panel({
      type: 'view_distance',
      content: (() => {
        const obj_radius = 12;
        const dot_radius = 2;
        const right = 32;

        const isMoving = van.state<0 | 1>(0);

        ctx.on(
          'scene:frame',
          () => isMoving.val && (state.move_width_pix += 1),
        );
        return div(
          div(
            { style: css({ margin: '2rem', height: 2 * obj_radius + 'px' }) },
            // fixed obj
            div({
              style: css({
                position: 'absolute',
                border: `#000 solid ${obj_radius}px`,
                right: right + 'px',
                cursor: 'pointer',
              }),
              onpointerup() {
                if ((isMoving.val ^= 1)) return; // toggle
                // reset
                const pix = state.move_width_pix;
                state.move_widths.push({ pix, cm: pix / state.pix_per_cm });
                state.move_width_pix = 0;
              },
            }),
            // movable obj
            div({
              style: () =>
                css({
                  position: 'absolute',
                  border: `red solid ${obj_radius}px`,
                  'border-radius': '50%',
                  right:
                    right +
                    obj_radius * 2 +
                    state.move_width_pix / dpr.val +
                    'px',
                }),
            }),
            // dots
            list(div, state.move_widths, (info) =>
              span({
                title: () => info.val.cm + ' cm',
                style: () =>
                  css({
                    position: 'absolute',
                    border: `red solid ${dot_radius}px`,
                    'border-radius': '50%',
                    right: right + obj_radius * 2 + 'px',
                    transform: `translate(-${info.val.pix / dpr.val}px, calc(${obj_radius}px - 50%))`,
                  }),
                hidden: isMoving,
              }),
            ),
          ),
          Input({
            label: () => props.i18n.view_distance + ' (cm): ',
            key: 'distance_cm',
          }),
        );
      })(),
      onSuccess() {
        const { screen_width_cm, distance_cm } = state;
        localStorage.setItem(
          sKey,
          JSON.stringify({ screen_width_cm, distance_cm }, null, 2),
        );
        display.val = '';
      },
    });
    const confirmation = div(
      { hidden: () => display.val !== 'confirmation' },
      h3(() => props.i18n.confirmation),
      pre(sValue),
      div(
        {
          style: css({
            display: 'grid',
            'grid-template-columns': '1fr 1fr',
            gap: '1rem',
          }),
        },
        button(
          {
            onclick() {
              modify(state, JSON.parse(sValue.val));
              display.val = '';
            },
          },
          () => props.i18n.yes,
        ),
        button(
          { onclick: () => (display.val = 'screen_width') },
          () => props.i18n.no,
        ),
      ),
    );

    return {
      node: Container(
        { content: div(confirmation, screen_width_el, view_distance_el) },
        ctx,
      ),
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
           * element style.
           */
          deg2pix,
          /**
           * Convert degree to CSS pixel.
           *
           * Counteract system zoom and page zoom, which makes sure the visual
           * representation has the same physical size across different
           * devices.
           *
           * @example
           *
           * Counteract for dynamic changes in system zoom and page zoom.
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
