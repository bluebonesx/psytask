import type { Data, MaybePromise } from '../types';
import { TextStim } from './components';
import { DataCollector } from './data-collector';
import { effect, reactive } from './reactive';
import { Scene, type SceneFunction, type SceneOptions } from './scene';
import { EventEmitter, h, on } from './util';

export class App extends EventEmitter<{}> {
  readonly data = {
    /** Frame duration */
    frame_ms: 16.67,
    /** Number of times the user has left the page */
    leave_count: 0,
    /** Device pixel ratio */
    dpr: window.devicePixelRatio,
    /** Screen physical size */
    screen_wh_pix: [window.screen.width, window.screen.height] as const,
    /** Window physical size */
    window_wh_pix: [window.innerWidth, window.innerHeight] as const,
  };
  constructor(
    /** Root element of the app */
    public root: Element,
  ) {
    super();
    this.data = reactive(this.data);
    effect(() => {
      const dpr = this.data.dpr;
      Object.assign(this.data, {
        screen_wh_pix: [window.screen.width * dpr, window.screen.height * dpr],
        window_wh_pix: [window.innerWidth * dpr, window.innerHeight * dpr],
      });
    });

    // check styles
    if (
      window.getComputedStyle(this.root).getPropertyValue('--psytask') === ''
    ) {
      // TODO: show on screen
      throw new Error('Please import psytask CSS file in your HTML file');
    }

    // warn before unloading the page, not compatible with IOS
    this.on(
      'cleanup',
      on(window, 'beforeunload', (e) => {
        e.preventDefault();
        return (e.returnValue =
          'Leaving the page will discard progress. Are you sure?');
      }),
    )
      // alert when the page is hidden
      .on(
        'cleanup',
        on(document, 'visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            this.data.leave_count++;
            window.setTimeout(() =>
              alert(
                'Please keep the page visible on the screen during the task running',
              ),
            );
          }
        }),
      )
      // update device pixel ratio on resolution change
      .on(
        'cleanup',
        (() => {
          let cleanup: () => void;
          effect(() => {
            cleanup?.();
            cleanup = on(
              window.matchMedia(`(resolution: ${this.data.dpr}dppx)`),
              'change',
              () => (this.data.dpr = window.devicePixelRatio),
            );
          });
          return () => cleanup();
        })(),
      )
      // update window size on resize
      .on(
        'cleanup',
        on(window, 'resize', () => {
          const dpr = this.data.dpr;
          this.data.window_wh_pix = [
            window.innerWidth * dpr,
            window.innerHeight * dpr,
          ];
        }),
      )
      // show last message
      .on('cleanup', () => {
        this.root.appendChild(
          h(
            'div',
            { className: 'psytask-center' },
            'Thanks for participating!',
          ),
        );
      });
  }
  /**
   * Load resources to RAM
   *
   * It will show loading progress for each resource on page
   *
   * @example Load web medias
   *
   * ```ts
   * const [image, audio] = await app.load(['image.png', 'audio.mp3']);
   * ```
   *
   * @example Convert image blob to bitmap
   *
   * ```ts
   * const [image] = await app.load(['image.png'], (blob, url) => {
   *   console.log('Convert image from', url);
   *   return window.createImageBitmap(blob);
   * });
   * ```
   *
   * @param urls - Array of resource URLs to load
   * @param convertor - Optional function to convert blob data
   * @returns Promise that resolves to array of loaded resources
   */
  async load<const T extends readonly string[], D = Blob>(
    urls: T,
    convertor?: (blob: Blob, url: string) => MaybePromise<D>,
  ) {
    const container = this.root.appendChild(TextStim({ children: '' }).node);

    const tasks = urls.map(async (url) => {
      const link = h('a', { href: url, target: '_blank' }, url);
      const el = container.appendChild(
        h('p', { title: url }, ['Fetch ', link, '...']),
      );

      try {
        const res = await fetch(url);
        if (res.body == null) {
          throw new Error('no response body');
        }

        // no progress
        const totalStr = res.headers.get('Content-Length');
        if (totalStr == null) {
          console.warn(`Failed to get content length for ${url}`);
          el.replaceChildren('Loading', link, '...');
          return res.blob();
        }
        const total = +totalStr;

        // show progress
        const reader = res.body.getReader();
        const chunks = [];
        for (let loaded = 0; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value.length;
          el.replaceChildren(
            'Loading',
            link,
            `... ${((loaded / total) * 100).toFixed(2)}%`,
          );
          chunks.push(value);
        }

        const blob = new Blob(chunks);
        return convertor ? convertor(blob, url) : blob;
      } catch (err) {
        el.style.color = '#000';
        el.replaceChildren('Failed to load', link, `: ${err}`);
        // wait forever
        await new Promise(() => {});
      }
    });

    const datas = await Promise.all(tasks);
    this.root.removeChild(container);
    return datas as { [K in keyof T]: D };
  }
  /**
   * Create data collector
   *
   * @example Basic usage
   *
   * ```ts
   * using dc = await app.collector('data.csv');
   * dc.add({ name: 'Alice', age: 25 });
   * dc.add({ name: 'Bob', age: 30 });
   * ```
   *
   * @example Custom hooks
   *
   * ```ts
   * using dc = await app
   *   .collector('data.csv')
   *   .on('add', ({ row, chunk }) => {
   *     console.log('add a row', row, 'its chunk is', chunk);
   *   })
   *   .on('save', ({ chunk, preventDefault }) => {
   *     preventDefault(); // Prevent the default save behavior
   *     console.log('save all rows, the final chunk is', chunk);
   *   });
   * ```
   *
   * @see {@link DataCollector}
   */
  collector<T extends Data>(
    ...e: ConstructorParameters<typeof DataCollector<T>>
  ) {
    return new DataCollector<T>(...e);
  }
  /**
   * Create a scene
   *
   * @example Creating a text scene
   *
   * ```ts
   * const setup = (props: { text: string }, ctx) => {
   *   const el = h('div'); // create element
   *   effect(() => {
   *     el.textContent = props.text; // update element content when props.text changes
   *   });
   *   return { node: el, data: () => ({ text: el.textContent }) }; // return element and data getter
   * };
   *
   * // create scene by setup function
   * using scene = app.scene(setup, {
   *   defaultProps: { text: 'default text' },
   * });
   * // change props.text and show, then get data
   * const data = await scene.show({ text: 'new text' });
   * ```
   *
   * @see {@link Scene}
   */
  scene<T extends SceneFunction>(
    ...e: ConstructorParameters<typeof Scene<T>> extends [infer L, ...infer R]
      ? R
      : never
  ) {
    return new Scene(this, ...e);
  }
  /**
   * Create a text scene
   *
   * @param content - Optional text content to display
   * @param defaultOptions - Optional default scene options
   * @see {@link TextStim}
   */
  text(
    content?: string,
    defaultOptions?: Partial<SceneOptions<typeof TextStim>>,
  ) {
    return this.scene(TextStim, {
      defaultProps: { children: content, ...defaultOptions?.defaultProps },
      ...defaultOptions,
    });
  }
}

function mean_std(arr: number[]) {
  const n = arr.length;
  const mean = arr.reduce((acc, v) => acc + v) / n;
  const std = Math.sqrt(
    arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1),
  );
  return { mean, std };
}
/** @ignore */
export function detectFPS(opts: { root: Element; framesCount: number }) {
  function checkPageVisibility() {
    if (document.visibilityState === 'hidden') {
      alert(
        'Please keep the page visible on the screen during the FPS detection',
      );
      location.reload();
    }
  }
  document.addEventListener('visibilitychange', checkPageVisibility);

  let startTime = 0;
  const frameDurations: number[] = [];
  const el = opts.root.appendChild(h('p'));

  return new Promise<number>((resolve) => {
    window.requestAnimationFrame(function frame(lastTime) {
      if (startTime !== 0) {
        frameDurations.push(lastTime - startTime);
      }
      startTime = lastTime;

      const progress = frameDurations.length / opts.framesCount;
      el.textContent = `test fps ${Math.floor(progress * 100)}%`;
      if (progress < 1) {
        window.requestAnimationFrame(frame);
        return;
      }

      document.removeEventListener('visibilitychange', checkPageVisibility);

      // calculate average frame duration
      const { mean, std } = mean_std(frameDurations);
      const valids = frameDurations.filter(
        (v) => mean - std * 2 <= v && v <= mean + std * 2,
      );
      if (valids.length < 1) {
        throw new Error('No valid frames found');
      }
      const frame_ms = valids.reduce((acc, v) => acc + v) / valids.length;

      console.info('detectFPS', {
        mean,
        std,
        valids,
        raws: frameDurations,
        frame_ms,
      });
      resolve(frame_ms);
    });
  });
}
/**
 * Create app
 *
 * @example
 *
 * ```ts
 * using app = await createApp();
 * using dc = app.collector();
 * using fixation = app.text('+', { duration: 500 });
 * using guide = app.text('Welcome to the task!', { close_on: 'key: ' });
 * ```
 *
 * @see {@link App}
 */
export const createApp = async (options?: Parameters<typeof detectFPS>[0]) => {
  const opts = {
    root: document.body,
    framesCount: 60,
    ...options,
  };
  if (!opts.root.isConnected) {
    console.warn(
      'Root element is not connected to the document, it will be mounted to document.body',
    );
    document.body.appendChild(opts.root);
  }

  const app = new App(opts.root);

  const panel = h('div', { className: 'psytask-center' });
  opts.root.appendChild(panel);
  app.data.frame_ms = await detectFPS({ ...opts, root: panel });
  opts.root.removeChild(panel);

  return app;
};
