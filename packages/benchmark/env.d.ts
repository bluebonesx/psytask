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

/** @see ../../node_modules/psychojs/src/index.js */
declare module 'psychojs' {
  export const util: any;
  export const core: any;
  export const data: any;
  export const visual: any;
  export const sound: any;
  export const hardware: any;
}
