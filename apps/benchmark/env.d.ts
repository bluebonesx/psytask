type BenchmarkConfig = {
  case: string;
  duration: number;
  count: number;
};
type BenchmarkResult = BenchmarkConfig & {
  deps: Record<string, number>;
  timings: number[];
};
type BenchmarkResultMap = Record<string, BenchmarkResult>;

type BenchmarkCase = {
  (ctx: {
    root: HTMLElement;
    config: BenchmarkConfig;
    load: (
      name: string,
      url: `${string}.${'js' | 'css'}`,
      create?: (text: string) => HTMLElement,
    ) => Promise<void>;
    onDraw(): void;
  }): Promise<void>;
};

interface Window {
  __BENCHMARK_RUNNER__(config?: BenchmarkConfig): Promise<BenchmarkResult>;
  __BENCHMARK_IMPORT__(text: string): void;
  __BENCHMARK_EXPORT__(): void;
  __BENCHMARK_RECEIVER__(result: BenchmarkResult): void;
}
