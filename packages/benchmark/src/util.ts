import { detect } from 'detect-browser';
import { html, render, type TemplateResult } from 'lit-html';
import { h } from 'psytask';
import { detectFPS } from '../../psytask/src/app';

export async function detectEnvironment(options?: {
  /** The detection panel container */
  root?: Element;
  /** Count of frames to calculate perFrame milliseconds */
  framesCount?: number;
}) {
  const opts = { root: document.body, framesCount: 60, ...options };
  const panel = opts.root.appendChild(
    h('div', { style: { 'text-align': 'center', 'line-height': '100dvh' } }),
  );

  const ua = navigator.userAgent;
  const browser = detect(ua);
  if (!browser) {
    throw new Error('Cannot detect browser environment');
  }
  const env = {
    ua,
    os: browser.os,
    browser: browser.name + '/' + browser.version,
    mobile: /Mobi/i.test(ua),
    'in-app': /wv|in-app/i.test(ua), // webview or in-app browser
    screen_wh_pix: [window.screen.width, window.screen.height] as [
      width: number,
      height: number,
    ],
    window_wh_pix: (function () {
      const wh: [width: number, height: number] = [
        window.innerWidth,
        window.innerHeight,
      ];
      window.addEventListener('resize', () => {
        wh[0] = window.innerWidth;
        wh[1] = window.innerHeight;
      });
      return wh;
    })(),
    frame_ms: await detectFPS({ root: panel, framesCount: opts.framesCount }),
  } as const;

  opts.root.removeChild(panel);
  console.log('env', env);
  return env;
}
export function injectResource(tag: string, props: {}) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    Object.assign(el, props);
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to load resource: ${tag}`));
    document.head.appendChild(el);
  });
}
export class Overlay {
  overlay = { text: '' as string | TemplateResult<1>, show: false };
  constructor(public root: HTMLElement) {}
  showOverlay(text: string) {
    this.overlay.text = text;
    this.overlay.show = true;
    this.render();
  }
  closeOverlay() {
    this.overlay.show = false;
    this.render();
  }
  html() {
    return html`<div
      style="position: absolute; inset: 0; display: ${this.overlay.show
        ? 'flex'
        : 'none'}; align-items: center; justify-content: center; background: #fffb; color: #333; text-align: center; padding: 0.5rem;"
    >
      ${this.overlay.text}
    </div>`;
  }
  render() {
    render(this.html(), this.root);
  }
}

type ChartDatas = Record<string, number[]>;
export class Plot extends Overlay {
  static chartOptions = {
    raw(data: ChartDatas) {
      const labels = Object.keys(data).sort();
      return {
        type: 'bar',
        data: {
          labels: Array.from(
            { length: labels.length && data[labels[0]!]!.length },
            (_, i) => i + 1,
          ),
          datasets: labels.map((label) => ({ label, data: data[label] })),
        },
        options: {
          scales: {
            xAxes: [{ scaleLabel: { display: true, labelString: 'Sample' } }],
            yAxes: [
              { scaleLabel: { display: true, labelString: 'Error (ms)' } },
            ],
          },
        },
      };
    },
    histogram(data: ChartDatas) {
      const seriesLabels = Object.keys(data).sort();
      const allValues = seriesLabels.flatMap((k) => data[k] || []);
      if (!allValues.length) {
        return {
          type: 'line',
          data: { labels: [], datasets: [] },
          options: { title: { display: true, text: '无数据' } },
        };
      }

      let min = Math.min(...allValues);
      let max = Math.max(...allValues);
      if (min === max) {
        min -= 0.5;
        max += 0.5;
      }

      const binCount = 50; // hard coded
      const binWidth = (max - min) / binCount;
      const binStarts = Array.from(
        { length: binCount },
        (_, i) => min + i * binWidth,
      );
      const binEnds = binStarts.map((s, i) =>
        i === binCount - 1 ? max : s + binWidth,
      );
      const mids = binStarts.map((s, i) => (s + binEnds[i]!) / 2);

      const histogramCounts = (values: number[]): number[] => {
        const counts = Array(binCount).fill(0);
        for (const v of values) {
          if (Number.isNaN(v)) continue;
          let idx = Math.floor((v - min) / binWidth);
          if (idx < 0) idx = 0;
          if (idx >= binCount) idx = binCount - 1;
          counts[idx]++;
        }
        return counts;
      };
      return {
        type: 'line',
        data: {
          datasets: seriesLabels.map((label, i) => {
            const counts = histogramCounts(data[label]!);
            return {
              label,
              data: counts.map((c, idx) => ({
                x: +mids[idx]!.toFixed(6),
                y: c,
              })),
            };
          }),
        },
        options: {
          scales: {
            xAxes: [
              {
                type: 'linear',
                scaleLabel: { display: true, labelString: 'Error (ms)' },
              },
            ],
            yAxes: [
              {
                scaleLabel: { display: true, labelString: 'Frequency' },
                ticks: { precision: 0 },
              },
            ],
          },
          annotation: {
            annotations: [
              {
                type: 'line',
                scaleID: 'x-axis-0',
                value: 0,
                borderColor: 'black',
                borderDash: [6, 4],
              },
            ],
          },
        },
      };
    },
  } as Record<string, (data: ChartDatas) => any>;

  data: ChartDatas = {};
  chartType: keyof typeof Plot.chartOptions = 'histogram';
  add(label: string, data: number[]) {
    this.data[label] = data;
    this.render();
  }
  reset() {
    this.data = {};
    this.render();
  }
  setType(type: typeof this.chartType) {
    if (this.chartType !== type) {
      this.chartType = type;
      this.render();
    }
  }
  override html() {
    const options = Plot.chartOptions[this.chartType]!(this.data);
    const url = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(options))}`;

    this.overlay.text = html`Loading chart from
      <a href="${url}" target="_blank">quickchart</a>`;
    return html`<div
      style="position: relative; display: flex; justify-content: center;"
    >
      ${super.html()}
      <img
        style="display: block; max-width: 100%;"
        .src=${url}
        .onload=${() => this.closeOverlay()}
        .onerror=${() => this.showOverlay('Failed to load chart')}
      />
    </div>`;
  }
}
