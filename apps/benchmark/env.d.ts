type BenchmarkResult = void;
type BenchmarkCase = () => Promise<BenchmarkResult> | BenchmarkResult;
