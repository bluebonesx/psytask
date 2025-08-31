type Benchmark = { except: number; value: number };
type BenchmarkParams = { count: number } & Record<string, any>;
interface Window {
  __benchmark__(
    mark: (index: number, except: number, done: boolean) => void,
    params: BenchmarkParams,
  ): Promise<void> | void;
  __benchmark_send(data: Benchmark[]): void;
}

/** @see ../../node_modules/lab.js/src/index.js */
declare module 'lab.js' {
  const _: any;
  export default _;
}
