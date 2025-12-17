import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
  type ChartData,
} from 'chart.js';
import { IQR } from 'shared/utils';
import van from 'vanjs-core';
const { canvas, h3 } = van.tags;

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const color = (i: number) => `hsl(${(i * 47) % 360},60%,50%)`;
const CHART_CONFIGS: Record<
  string,
  {
    config: Omit<ChartConfiguration, 'data'>;
    data(results: BenchmarkResultMap): ChartData;
  }
> = {
  ['Timing Distribution']: {
    config: {
      type: 'line',
      options: {
        scales: {
          x: {
            title: { display: true, text: 'Duration (ms)' },
            beginAtZero: false,
          },
          y: { title: { display: true, text: 'Count' } },
        },
      },
    },
    data(results) {
      const cases = Object.keys(results);
      if (cases.length === 0) return { labels: [], datasets: [] };

      const globalTimings: number[] = [];
      const caseTimings: Record<string, number[]> = {};
      for (const name of cases) {
        const res = results[name]!;
        const timings = (caseTimings[name] ??= res.timings);
        globalTimings.push(...timings);
      }
      const globalN = globalTimings.length;
      if (globalN === 0) return { labels: [], datasets: [] };
      const globalStat = IQR(globalTimings);

      const bound = {
        lower: globalStat.Q1 - 5 * globalStat.IQR,
        upper: globalStat.Q3 + 5 * globalStat.IQR,
      };
      const vaildStat = {
        min: globalTimings.reduce(
          (min, t) => (t < bound.lower ? min : Math.min(min, t)),
          Infinity,
        ),
        max: globalTimings.reduce(
          (max, t) => (t > bound.upper ? max : Math.max(max, t)),
          -Infinity,
        ),
      };

      const binWidth = 2 * globalStat.IQR * globalN ** (-1 / 3); // Freedman-Diaconis rule
      const binCount =
        Math.floor((vaildStat.max - vaildStat.min) / binWidth) || 1;

      console.log('timing data', {
        globalTimings,
        binWidth,
        binCount,
        globalStat,
        vaildStat,
      });
      const labels = [
        '<' + bound.lower.toFixed(2),
        ...Array.from({ length: binCount }, (_, i) =>
          (vaildStat.min + (i + 0.5) * binWidth).toFixed(2),
        ),
        '>' + bound.upper.toFixed(2),
      ];
      return {
        labels,
        datasets: cases.map((caseName, i) => {
          const timings = caseTimings[caseName]!;
          const counts = Array.from({ length: labels.length }, () => 0);
          for (const t of timings) {
            if (t < bound.lower) counts[0]!++;
            else if (t > bound.upper) counts[binCount - 1]!++;
            else
              counts[
                Math.floor(
                  ((t - vaildStat.min) / (vaildStat.max - vaildStat.min)) *
                    binCount,
                )
              ]!++;
          }
          return {
            label: caseName,
            data: counts,
            borderColor: color(i),
            borderWidth: 2,
          };
        }),
      };
    },
  },
  ['Bundle Size']: {
    config: {
      type: 'bar',
      options: {
        scales: {
          x: { stacked: true },
          y: { stacked: true, title: { display: true, text: 'Size (KB)' } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) =>
                `${item.dataset.label}\n${(item.parsed.y || 0).toFixed(2)}KB`,
            },
          },
        },
      },
      plugins: [
        {
          id: 'total-label',
          afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            const meta = chart.getDatasetMeta(chart.data.datasets.length - 1);
            if (!meta?.data?.length) return;

            // Draw total labels on top of bars
            ctx.font = '12px Arial';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            meta.data.map((bar, index) => {
              const total = chart.data.datasets.reduce(
                (acc, dataset) => acc + (dataset.data[index] as number),
                0,
              );
              ctx.fillText(`${total.toFixed(2)} KB`, bar.x, bar.y - 5);
            });
          },
        },
      ],
    },
    data(results) {
      const cases = Object.keys(results);
      if (cases.length === 0) return { labels: [], datasets: [] };

      const globalDeps = new Set<string>();
      const caseDeps: Record<string, Record<string, number>> = {};
      for (const caseName of cases) {
        caseDeps[caseName] = {};
        for (const [depName, size] of Object.entries(results[caseName]!.deps)) {
          globalDeps.add(depName);
          caseDeps[caseName][depName] ??= size / 1e3;
        }
      }

      return {
        labels: cases,
        datasets: [...globalDeps].map((depName, i) => ({
          label: depName,
          data: cases.map((name) => caseDeps[name]![depName]! ?? 0),
          backgroundColor: color(i),
        })),
      };
    },
  },
};
export const Charts = (results: BenchmarkResultMap) =>
  Object.keys(CHART_CONFIGS).map((title) => {
    const container = canvas({ style: 'width:100%' });
    const { config, data } = CHART_CONFIGS[title]!;
    let chart: Chart | null = null;

    van.derive(() => {
      if (!chart) {
        // initial render
        const cfg = { ...config, data: data(results) };
        cfg.options!.aspectRatio = innerWidth / (innerHeight / 2);
        if (cfg.options!.scales) {
          Object.keys(cfg.options!.scales).forEach((scaleKey) => {
            const scale = cfg.options!.scales![scaleKey];
            if (scale) {
              (scale.grid ??= {}).color = '#333';
              (scale.ticks ??= {}).color = '#fff';
            }
          });
        }
        chart = new Chart(container, cfg);
      } else {
        // update existing
        chart.data = data(results);
        chart.update();
      }
    });

    return [h3(title), container];
  });
