import { css, defaultProps, getCurrentScene, on, Scene } from 'psytask';
import type { LooseObject } from 'shared/types';
import { ERR, modify, mount } from 'shared/utils';
import van from 'vanjs-core';
import { calc, list, noreactive, reactive } from 'vanjs-ext';
import { adapter } from './adapter';
import { useDevicePixelRatio } from './hooks';

const { canvas, div, input, label, h2: h2, span, button, form } = van.tags;
const { PI, sin, cos, tan } = Math; // just for minimize

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
export const ImageStim = adapter.wrap(
  (props: {
    image?: ImageBitmap | ImageData;
    draw?(ctx: CanvasRenderingContext2D): void;
  }) => {
    const el = canvas();
    const canvasContext = el.getContext('2d');
    if (!canvasContext) throw ERR('Failed to get canvas 2d context');

    van.derive(() => {
      canvasContext.clearRect(0, 0, el.width, el.height);

      const image = props.image;
      if (image) {
        el.width = image.width;
        el.height = image.height;
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
export const Grating = adapter.wrap(
  (props: {
    /** Convert radians (-Inf, Inf) to amplitude [-1, 1] */
    type: (x: number) => number;
    /** Width or [width, height] (in pixels) */
    size: number | [number, number];
    /** Spatial frequency (cycles per pixel) */
    sf: number;
    /** Orientation (in radians) @default 0 */
    ori?: number;
    /** Phase (in radians) @default 0 */
    phase?: number;
    /** Color or [color, color] (RGB255 values) @default [0,0,0] */
    color?: RGB255 | [RGB255, RGB255];
    /** Convert coordinates [-1, 1] to opacity [0, 1] */
    mask?: (x: number, y: number) => number;
  }) =>
    ImageStim({
      image: calc(() => {
        const p = { ori: 0, phase: 0, color: [0, 0, 0] as const, ...props };
        const [w, h] = typeof p.size === 'number' ? [p.size, p.size] : p.size;

        const ori_cos = cos(p.ori);
        const ori_sin = sin(p.ori);

        const cx = w / 2;
        const cy = h / 2;

        const imageData = new ImageData(w, h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const dx = x - cx;
            const dy = y - cy;

            const offset_from_center = dx * ori_cos + dy * ori_sin;
            const radian = offset_from_center * p.sf * 2 * PI + p.phase;
            const amplitude = p.type(radian); // from rad to [-1, 1]
            const intensity = (amplitude + 1) / 2; // from [-1, 1] to [0, 1]

            const rgba = (
              p.color.length === 2
                ? [
                    ...p.color[1].map(
                      (c, i) =>
                        c +
                        intensity * ((p.color as [RGB255, RGB255])[0][i]! - c),
                    ),
                    255,
                  ]
                : [...p.color, 255 * intensity]
            ) as [number, number, number, number];

            if (rgba[3] > 0 && p.mask) rgba[3] *= p.mask(dx / cx, dy / cy);

            let pixel_idx = (y * w + x) * 4;
            // auto round and clamp 0-255
            for (const value of rgba) imageData.data[pixel_idx++] = value;
          }
        }

        return noreactive(imageData);
      }),
    }),
);
// TODO: Noise

const NumberField = <
  T extends LooseObject,
  K extends {
    [P in keyof T]: P extends string
      ? T[P] extends number
        ? P
        : never
      : never;
  }[keyof T],
>(props: {
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
        if (!Number.isNaN(val)) props.model[props.key] = val as T[K];
        else console.warn(`Invalid ${props.key}:`, e);
      },
    }),
  );
const Triangles = (color: string, size = 6) =>
  [1, 0].map((isUp) =>
    div({
      style: css({
        position: 'absolute',
        width: '0',
        height: '0',
        'border-style': 'solid',
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

export const PhysicalWidthDetector = adapter.wrap(
  (props: {
    line_distance_pix?: number;
    i18n?: Record<
      'title' | 'text' | 'ok' | 'line_distance' | 'pix_per_cm',
      string
    >;
  }) => {
    const p = defaultProps(props, {
      line_distance_pix: innerWidth / 2,
      i18n: {
        title: 'Physical Width Calibration',
        text: `Move the red line so that the line distance equals the width of a credit card (8.56 cm).
Or, input the line distance by measuring it yourself.
Or, input the pixels per centimeter (pix/cm) directly if you know.`,
        ok: 'OK',
        line_distance: 'Line Distance',
        pix_per_cm: 'Pixels per Centimeter',
      },
    });
    const state = reactive({
      line_distance_pix: p.line_distance_pix,
      line_distance_cm: 8.56,
      pix_per_cm: 0,
    });
    const dpr = useDevicePixelRatio();
    van.derive(
      () =>
        (state.pix_per_cm = state.line_distance_pix / state.line_distance_cm),
    );

    const left = 32; // px
    const height = '10rem';
    const sharedStyle = css({ position: 'absolute', width: '1px', height });

    const fixed = div(
      {
        'data-test': 'fixed-line',
        style: sharedStyle + css({ background: '#000', left: left + 'px' }),
      },
      ...Triangles('#000'),
    );

    let sx = 0; // start x, no drag if 0
    const ctx = getCurrentScene();
    ctx.on('show', () => {
      const cleanups = [
        on(ctx.root, 'pointerup', () => (sx = 0)),
        on(
          ctx.root,
          'pointermove',
          (e) => sx && (state.line_distance_pix = (e.clientX - sx) * dpr.val),
        ),
      ];
      ctx.once('close', () => cleanups.map((fn) => fn()));
    });

    return {
      node: form(
        {
          class: 'psytask-center',
          style: css({ margin: 'auto', width: 'fit-content' }),
          onsubmit: (e) => (e.preventDefault(), ctx.close()),
        },
        h2(() => p.i18n.title),
        span(() => p.i18n.text),
        div(
          div(
            { style: css({ margin: '2rem', height }) },
            // fixed line
            fixed,
            // movable line
            div(
              {
                'data-test': 'movable-line',
                style: () =>
                  sharedStyle +
                  css({
                    cursor: 'ew-resize',
                    background: 'red',
                    left: left + state.line_distance_pix / dpr.val + 'px',
                  }),
                onpointerdown: () => (sx = fixed.getBoundingClientRect().x),
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
            label: () => p.i18n.pix_per_cm + ' (pix/cm): ',
            model: state,
            key: 'pix_per_cm',
          }),
        ),
        button(
          {
            type: 'submit',
            style: css({ width: '100%', 'margin-top': '0.5rem' }),
          },
          () => p.i18n.ok,
        ),
      ),
      data: () => state,
    };
  },
);
export const ViewDistanceDetector = adapter.wrap(
  (props: {
    pix_per_cm: number;
    /** @default 13.5 */
    blindspot_deg?: number;
    i18n?: Record<'title' | 'text' | 'ok' | 'view_distance', string>;
  }) => {
    const p = defaultProps(props, {
      blindspot_deg: 13.5,
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
    const width_per_distance = van.derive(
      () => 2 * tan((p.blindspot_deg * PI) / 360),
    );
    van.derive(() => {
      const { move_widths } = state;
      const move_width_cm =
        move_widths.length &&
        move_widths.reduce((a, b) => a + b.cm, 0) / move_widths.length;
      state.distance_cm = move_width_cm / width_per_distance.val;
    });

    const obj_radius = 12;
    const dot_radius = 2;
    const right = 32;

    const isMoving = van.state<0 | 1>(0);
    const ctx = getCurrentScene();
    ctx.on('frame', () => isMoving.val && state.move_width_pix++); //NOTE: speed prop?

    return {
      node: form(
        {
          class: 'psytask-center',
          style: css({ margin: 'auto', width: 'fit-content' }),
          onsubmit: (e) => (e.preventDefault(), ctx.close()),
        },
        h2(() => p.i18n.title),
        span(() => p.i18n.text),
        div(
          div(
            { style: css({ margin: '2rem', height: 2 * obj_radius + 'px' }) },
            // fixed obj
            div({
              'data-test': 'fixed-obj',
              style: css({
                position: 'absolute',
                cursor: 'pointer',
                border: `#000 solid ${obj_radius}px`,
                right: right + 'px',
              }),
              onpointerdown() {
                if ((isMoving.val ^= 1)) return; // toggle
                // reset
                const pix = state.move_width_pix;
                state.move_widths.push({ pix, cm: pix / p.pix_per_cm });
                state.move_width_pix = 0;
              },
            }),
            // movable obj
            div({
              'data-test': 'movable-obj',
              style: () =>
                css({
                  position: 'absolute',
                  'border-radius': '50%',
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
                  css({
                    position: 'absolute',
                    'border-radius': '50%',
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
            style: css({ width: '100%', 'margin-top': '0.5rem' }),
          },
          () => p.i18n.ok,
        ),
      ),
      data: () => state,
    };
  },
);

/**
 * Virtual chinrest for acquiring window physical width and distance.
 *
 * @example
 *
 * Basic usage
 *
 * ```ts
 * using vc = app.scene(VirtualChinrest, {
 *   defaultProps: {
 *     usePreviousData: true,
 *     blindspot_deg: 13.5,
 *   },
 * });
 * const { distance_cm, pix_per_cm, deg2cm, deg2pix, deg2csspix } =
 *   await vc.show();
 * ```
 */
export const VirtualChinrest = modify(
  (props: {
    /** Internationalization strings */
    i18n?: Record<
      | 'confirmation'
      | 'yes'
      | 'no'
      | 'ok'
      | 'line_distance'
      | 'pix_per_cm'
      | 'physical_width_title'
      | 'physical_width_text'
      | 'view_distance'
      | 'view_distance_title'
      | 'view_distance_text',
      string
    >;
    /** Blindspot degree to {@link ViewDistanceDetector} */
    blindspot_deg?: number;
    /** Use previous chinrest data. If not provided, it will show a confirmation. */
    usePreviousData?: boolean;
  }) => {
    const ctx = getCurrentScene();
    const Root = () => div({ style: css({ height: '100%' }) });

    const windowWidthDetector = new Scene(PhysicalWidthDetector, {
      ...ctx.options,
      root: mount(Root(), ctx.root),
      defaultProps: {},
    });
    const viewDistanceDetector = new Scene(ViewDistanceDetector, {
      ...ctx.options,
      root: mount(Root(), ctx.root),
      defaultProps: {
        pix_per_cm: 0, // overwritten on show
      },
    });

    let data: ReturnType<typeof VirtualChinrest.get>;
    ctx
      .on('dispose', () => {
        windowWidthDetector.emit('dispose');
        viewDistanceDetector.emit('dispose');
      })
      .on('show', async () => {
        const { i18n, blindspot_deg, usePreviousData } = props;

        // check previous data
        if (usePreviousData !== false) {
          try {
            data = VirtualChinrest.get();

            if (
              usePreviousData ||
              confirm(
                `Use previous chinrest data?\n\n${JSON.stringify(data, null, 2)}`,
              )
            ) {
              await ctx.close();
              return;
            }
          } catch (error) {
            console.warn(error);
          }
        }

        // run chinrest
        const { pix_per_cm } = await windowWidthDetector.show({
          i18n: i18n && {
            line_distance: i18n.line_distance,
            pix_per_cm: i18n.pix_per_cm,
            text: i18n.physical_width_text,
            title: i18n.physical_width_title,
            ok: i18n.ok,
          },
        });
        const { distance_cm } = await viewDistanceDetector.show({
          pix_per_cm,
          blindspot_deg,
          i18n: i18n && {
            view_distance: i18n.view_distance,
            text: i18n.view_distance_text,
            title: i18n.view_distance_title,
            ok: i18n.ok,
          },
        });

        VirtualChinrest.set((data = { pix_per_cm, distance_cm }));
        ctx.close();
      });

    const dpr = useDevicePixelRatio();
    return {
      node: '',
      data() {
        const { pix_per_cm, distance_cm } = data;
        const deg2cm = (deg: number) => 2 * distance_cm * tan((deg * PI) / 360);
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
  {
    /** {@link localStorage} key */
    key: 'psytask:virtual-chinrest',
    /**
     * Get previous data
     *
     * @throws Error if no valid data found
     */
    get() {
      const rawText = localStorage.getItem(VirtualChinrest.key);
      if (!rawText) return ERR('No previous chinrest data found');

      const assert = (val: unknown): val is number =>
        typeof val === 'number' && !Number.isNaN(val);
      const data = JSON.parse(rawText);
      return assert(data.pix_per_cm) && assert(data.distance_cm)
        ? (data as { pix_per_cm: number; distance_cm: number })
        : ERR('Invalid chinrest data format');
    },
    /** Set previous data */
    set(data: ReturnType<typeof VirtualChinrest.get>) {
      localStorage.setItem(
        VirtualChinrest.key,
        JSON.stringify(data /* , null, 2 */),
      );
    },
  } as const,
);
