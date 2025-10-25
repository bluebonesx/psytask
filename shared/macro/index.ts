import type { PropertiesHyphen } from 'csstype';

export const glob = (
  pattern: string,
  options: Bun.GlobScanOptions = {},
): string[] => Array.from(new Bun.Glob(pattern).scanSync(options)).sort();

/**
 * CSS styles builder
 *
 * @example
 *
 * ```ts
 * const style = css({ 'background-color': 'red', 'font-size': '16px' });
 * // style is "background-color:red;font-size:16px;"
 * ```
 */
export const css = (obj: PropertiesHyphen) =>
  Object.entries(obj).reduce((acc, [key, val]) => acc + `${key}:${val};`, '');
