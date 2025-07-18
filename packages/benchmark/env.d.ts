type Benchmark = {
  except: number;
  value: number;
};
interface Window {
  /** Log benchmark result */
  __benchmark__(datas: Benchmark[]): void;
}
