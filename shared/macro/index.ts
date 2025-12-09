export const glob = (
  pattern: string,
  options: Bun.GlobScanOptions = {},
): string[] => Array.from(new Bun.Glob(pattern).scanSync(options)).sort();
