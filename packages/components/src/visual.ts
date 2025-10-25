import { adapter, defaultProps, getCurrentScene, on, Scene } from 'psytask';
import { css as css$ } from 'shared/macro' with { type: 'macro' };
import { css } from 'shared/macro';
import type { LooseObject } from 'shared/types';
import { clamp, ERR, modify, mount } from 'shared/utils';
import van from 'vanjs-core';
import { calc, list, reactive } from 'vanjs-ext';
import { useDevicePixelRatio, useScreenPhysicalPix } from './hooks';

const { canvas, div, input, label, h2, span, button, form } = van.tags;

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
export const ImageStim = adapter.define(
  (props: {
    image?: ImageBitmap | ImageData;
    draw?(ctx: CanvasRenderingContext2D): void;
  }) => {
    const el = canvas();
    const canvasContext = el.getContext('2d');
    if (!canvasContext) return ERR('Failed to get canvas 2d context');

    van.derive(() => {
      canvasContext.clearRect(0, 0, el.width, el.height);

      const image = props.image;
      if (image) {
        [el.width, el.height] = [image.width, image.height];
        image instanceof ImageData
          ? canvasContext.putImageData(image, 0, 0)
          : canvasContext.drawImage(image, 0, 0);
      }

      props.draw?.(canvasContext);
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
export const Grating = adapter.define(
  (props: {
    /**
     * Wave type or wave function that convert radians (-Inf, Inf) to amplitude
     * [-1, 1]
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
  }) => {
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
    return ImageStim({ image: calc(image) });
  },
);
// TODO: Noise

const NumberField = <T extends LooseObject, K extends string & keyof T>(props: {
  label: () => string;
  model: T;
  key: K;
}) =>
  div(
    label({ for: props.key }, props.label),
    input({
      id: props.key,
      type: 'number',
      min: '1',
      step: 'any',
      required: true,
      value: () => props.model[props.key],
      onchange(e) {
        const val = +(e.target as HTMLInputElement).value;
        //@ts-ignore
        if (!Number.isNaN(val)) props.model[props.key] = val;
        else console.warn(`Invalid ${props.key}:`, e);
      },
    }),
  );
const Triangles = (color: string, size = 6) =>
  [1, 0].map((isUp) =>
    div({
      style:
        css$({
          position: 'absolute',
          width: '0',
          height: '0',
          'border-style': 'solid',
        }) +
        css({
          left: `${-(size - 0.5)}px`,
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

export const ScreenWidthDetector = adapter.define(
  (props: {
    line_distance_pix?: number;
    i18n?: Record<
      'title' | 'text' | 'ok' | 'line_distance' | 'screen_width',
      string
    >;
  }) => {
    const p = defaultProps(props, {
      line_distance_pix: Math.floor(innerWidth / 2),
      i18n: {
        title: 'Screen Width Calibration',
        text: `Move the red line so that the line distance equals the width of a credit card (8.56 cm).
Or, you can input the line distance by measuring it yourself.
Or, you can input your screen width directly if you know it.`,
        ok: 'OK',
        line_distance: 'Line Distance',
        screen_width: 'Screen Width',
      },
    });
    const state = reactive({
      line_distance_pix: p.line_distance_pix,
      line_distance_cm: 8.56, // fixed by user
      screen_width_cm: 0, // derived
      pix_per_cm: 0,
    });
    const dpr = useDevicePixelRatio();
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

    const left = 32;
    const height = '10rem';
    const sharedStyle =
      css$({ position: 'absolute', width: '1px' }) + css({ height });

    const fixed = div(
      {
        style:
          sharedStyle +
          css$({ background: '#000' }) +
          css({ left: left + 'px' }),
      },
      ...Triangles('#000'),
    );

    let sx = 0; // start x, no drag if 0
    const ctx = getCurrentScene();
    ctx.on('scene:show', () => {
      const cleanups = [
        on(ctx.root, 'pointerup', (e) => (sx = 0)),
        on(
          ctx.root,
          'pointermove',
          (e) => sx && (state.line_distance_pix = (e.clientX - sx) * dpr.val),
        ),
      ];
      ctx.once('scene:close', () => cleanups.map((fn) => fn()));
    });

    return {
      node: form(
        { class: 'psytask-container', onsubmit: () => ctx.close() },
        h2(() => p.i18n.title),
        span(() => p.i18n.text),
        div(
          div(
            { style: css$({ margin: '2rem' }) + css({ height }) },
            // fixed line
            fixed,
            // movable line
            div(
              {
                style: () =>
                  sharedStyle +
                  css$({ cursor: 'ew-resize', background: 'red' }) +
                  css({
                    left: left + state.line_distance_pix / dpr.val + 'px',
                  }),
                onpointerdown: (e) =>
                  (sx = Math.floor(fixed.getBoundingClientRect().x)),
              },
              ...Triangles('red'),
            ),
          ),
          div(
            () => p.i18n.line_distance + ' (pix): ' + state.line_distance_pix,
          ),
          NumberField({
            label: () => p.i18n.line_distance + ' (cm): ',
            model: state,
            key: 'line_distance_cm',
          }),
          NumberField({
            label: () => p.i18n.screen_width + ' (cm): ',
            model: state,
            key: 'screen_width_cm',
          }),
        ),
        button(
          {
            type: 'submit',
            style: css$({ width: '100%', 'margin-top': '0.5rem' }),
          },
          () => p.i18n.ok,
        ),
      ),
      data: () => state,
    };
  },
);
export const ViewDistanceDetector = adapter.define(
  (props: {
    pix_per_cm: number;
    blindspotDegree?: number;
    i18n?: Record<'title' | 'text' | 'ok' | 'view_distance', string>;
  }) => {
    const p = defaultProps(props, {
      blindspotDegree: 13.5,
      i18n: {
        title: 'View Distance Calibration',
        text: `Close right eye, focus left eye on the black square, keep head still.
Click the black square to move the red circle to the left.
Click again when the red circle disappears.`,
        ok: 'OK',
        view_distance: 'View Distance',
      },
    });
    const state = reactive({
      move_width_pix: 0,
      move_widths: [] as { pix: number; cm: number }[],
      distance_cm: 0,
    });
    const dpr = useDevicePixelRatio();
    van.derive(() => {
      const { move_widths } = state;
      const move_width_cm =
        move_widths.length &&
        move_widths.reduce((a, b) => a + b.cm, 0) / move_widths.length;
      state.distance_cm =
        move_width_cm / 2 / Math.tan((p.blindspotDegree / 2) * (Math.PI / 180));
    });

    const obj_radius = 12;
    const dot_radius = 2;
    const right = 32;

    const isMoving = van.state<0 | 1>(0);
    const ctx = getCurrentScene();
    ctx.on('scene:frame', () => isMoving.val && (state.move_width_pix += 1));

    return {
      node: form(
        {
          class: 'psytask-container',
          onsubmit: () => ctx.close(),
        },
        h2(() => p.i18n.title),
        span(() => p.i18n.text),
        div(
          div(
            {
              style:
                css$({ margin: '2rem' }) +
                css({ height: 2 * obj_radius + 'px' }),
            },
            // fixed obj
            div({
              style:
                css$({ position: 'absolute', cursor: 'pointer' }) +
                css({
                  border: `#000 solid ${obj_radius}px`,
                  right: right + 'px',
                }),
              onpointerup() {
                if ((isMoving.val ^= 1)) return; // toggle
                // reset
                const pix = state.move_width_pix;
                state.move_widths.push({ pix, cm: pix / p.pix_per_cm });
                state.move_width_pix = 0;
              },
            }),
            // movable obj
            div({
              style: () =>
                css$({ position: 'absolute', 'border-radius': '50%' }) +
                css({
                  border: `red solid ${obj_radius}px`,
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
                  css$({ position: 'absolute', 'border-radius': '50%' }) +
                  css({
                    border: `red solid ${dot_radius}px`,
                    right: right + obj_radius * 2 + 'px',
                    transform: `translate(-${info.val.pix / dpr.val}px, calc(${obj_radius}px - 50%))`,
                  }),
                hidden: isMoving,
              }),
            ),
          ),
          NumberField({
            label: () => p.i18n.view_distance + ' (cm): ',
            model: state,
            key: 'distance_cm',
          }),
        ),
        button(
          {
            type: 'submit',
            style: css$({ width: '100%', 'margin-top': '0.5rem' }),
          },
          () => p.i18n.ok,
        ),
      ),
      data: () => state,
    };
  },
);

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
export const VirtualChinrest = modify(
  adapter.define(
    (props: {
      /** Internationalization strings */
      i18n?: Record<
        | 'confirmation'
        | 'yes'
        | 'no'
        | 'ok'
        | 'line_distance'
        | 'screen_width'
        | 'screen_width_title'
        | 'screen_width_text'
        | 'view_distance'
        | 'view_distance_title'
        | 'view_distance_text',
        string
      >;
      /** Blindspot degree @default 13.5 */
      blindspotDegree?: number;
      /**
       * Use previous chinrest data. If not provided, it will show a
       * confirmation scene.
       */
      usePreviousData?: boolean;
    }) => {
      const ctx = getCurrentScene();
      const SubRoot = () => div({ style: css$({ height: '100%' }) });

      const screenWidthDetector = new Scene(ScreenWidthDetector, {
        ...ctx.options,
        root: mount(SubRoot(), ctx.root),
        defaultProps: {},
      });
      const viewDistanceDetector = new Scene(ViewDistanceDetector, {
        ...ctx.options,
        root: mount(SubRoot(), ctx.root),
        defaultProps: {
          pix_per_cm: 0, // overwritten on show
        },
      });

      ctx.on('dispose', () => {
        screenWidthDetector.emit('dispose');
        viewDistanceDetector.emit('dispose');
      });

      let data: { pix_per_cm: number; distance_cm: number };
      van.derive(async () => {
        const { i18n, blindspotDegree, usePreviousData } = props;

        // check previous data
        const storeData = localStorage.getItem(VirtualChinrest.storageKey);
        if (storeData) {
          let confirmed = false;
          if (usePreviousData == null) {
            // ({ confirmed } = await confirmation.show({
            //   title: i18n ? i18n.confirmation : 'Use previous chinrest data?',
            //   content: pre(storeData),
            //   i18n,
            // }));
            confirmed = confirm(`Use previous chinrest data?\n\n${storeData}`);
          }
          if (usePreviousData || confirmed) {
            ctx.close();
            data = JSON.parse(storeData);
            return;
          }
        }
        // run chinrest
        const { pix_per_cm } = await screenWidthDetector.show({
          i18n: i18n && {
            line_distance: i18n.line_distance,
            screen_width: i18n.screen_width,
            text: i18n.screen_width_text,
            title: i18n.screen_width_title,
            ok: i18n.ok,
          },
        });
        const { distance_cm } = await viewDistanceDetector.show({
          pix_per_cm,
          blindspotDegree,
          i18n: i18n && {
            view_distance: i18n.view_distance,
            text: i18n.view_distance_text,
            title: i18n.view_distance_title,
            ok: i18n.ok,
          },
        });
        data = { pix_per_cm, distance_cm };
        localStorage.setItem(
          VirtualChinrest.storageKey,
          JSON.stringify(data, null, 2),
        );
        ctx.close();
      });

      const dpr = useDevicePixelRatio();
      return {
        node: '',
        data() {
          const { pix_per_cm, distance_cm } = data;
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
             * Counteract system zoom and page zoom using
             * {@link window.devicePixelRatio}, which makes sure the visual
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
  ),
  { storageKey: 'psytask:virtual-chinrest' } as const,
);
