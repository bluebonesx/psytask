import type { Data, Primitive } from '../types';
import { EventEmitter, h, on } from './util';

// stringifiers
/** One-time string transformation */
export abstract class DataStringifier {
  value = '';
  /**
   * Transform a data object into a string chunk, and append it to the collector
   *
   * @param data - The data object to transform
   * @returns String representation of the data
   */
  abstract transform(data: Data): string;
  /**
   * Create the final chunk, and append it to the collector
   *
   * @returns Final string chunk
   */
  abstract final(): string;
}
/** @see {@link https://www.rfc-editor.org/rfc/rfc4180 | RFC-4180} */
export class CSVStringifier extends DataStringifier {
  keys: string[] = [];
  normalize(value: Primitive) {
    if (value == null) return '';
    value = '' + value;
    return /[,"\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  }
  transform(data: Data) {
    let chunk = '';
    let len = this.keys.length;
    if (len === 0) {
      this.keys = Object.keys(data);
      len = this.keys.length;
      chunk = this.keys.reduce(
        (acc, key, i) => acc + this.normalize(key) + (i < len - 1 ? ',' : ''),
        '',
      );
    }
    chunk += this.keys.reduce(
      (acc, key, i) =>
        acc + this.normalize(data[key]) + (i < len - 1 ? ',' : ''),
      '\n',
    );
    this.value += chunk;
    return chunk;
  }
  final() {
    return '';
  }
}
/** @see {@link https://www.json.org | JSON} */
export class JSONStringifier extends DataStringifier {
  transform(data: Data) {
    const chunk = (this.value === '' ? '[' : ',') + JSON.stringify(data);
    this.value += chunk;
    return chunk;
  }
  final() {
    const chunk = this.value === '' ? '[]' : ']';
    this.value += chunk;
    return chunk;
  }
}

/** One-time data collector. Collect, stringify and save data. */
export class DataCollector<T extends Data> extends EventEmitter<{
  add: { row: T; chunk: string };
  save: { chunk: string; preventDefault: () => void };
}> {
  /**
   * Map of stringifier classes by file extension
   *
   * You can add your own stringifier class to this map. The class should extend
   * `DataStringifier` and implement `transform` and `final` methods. The key is
   * the file extension (without the dot), and the value is the class.
   *
   * @example Adding custom stringifier
   *
   * ```ts
   * // add support for Markdown files, whose extension is 'md'
   * DataCollector.stringifiers['md'] = class MarkdownStringifier extends (
   *   DataStringifier
   * ) {
   *   transform(data) {
   *     // write transform logic here
   *     return '';
   *   }
   *   final() {
   *     // write final logic here
   *     return '';
   *   }
   * };
   *
   * using dc = app.collector('data.md'); // now you can save to Markdown file
   * ```
   */
  static readonly stringifiers: Record<string, new () => DataStringifier> = {
    csv: CSVStringifier,
    json: JSONStringifier,
  };
  #saved = false;
  readonly rows: T[] = [];
  readonly stringifier: DataStringifier;
  /**
   * Built-in supports for CSV and JSON formats. You can extend this by
   * {@link DataCollector.stringifiers} or provide `stringifier` parameter.
   *
   * @param filename Default is `data-${Date.now()}.csv`
   * @param stringifier - An instance of {@link DataStringifier}. If not
   *   provided, a default stringifier will be used based on the file
   *   extension.
   */
  constructor(
    public readonly filename = `data-${Date.now()}.csv`,
    stringifier?: DataStringifier,
  ) {
    super();

    // set stringifier
    const match = filename.match(/\.([^\.]+)$/);
    const defaultExt = 'csv';
    const extname = match
      ? match[1]!
      : (console.warn('Please specify the file extension in the filename'),
        defaultExt);
    if (stringifier instanceof DataStringifier) {
      this.stringifier = stringifier;
    } else {
      const extnames = Object.keys(DataCollector.stringifiers);
      if (extnames.includes(extname)) {
        this.stringifier = new DataCollector.stringifiers[extname]!();
      } else {
        console.warn(
          `Please specify a valid file extension: ${extnames.join(
            ', ',
          )}, but got "${extname}".\nOr, add your DataStringifier class to DataCollector.stringifiers.`,
        );
        this.stringifier = new DataCollector.stringifiers[defaultExt]!();
      }
    }

    // backup when the page is hidden
    this.on(
      'cleanup',
      on(document, 'visibilitychange', () => {
        if (document.visibilityState === 'hidden')
          this.download(`-${Date.now()}.backup`);
      }),
    )
      // save data on dispose
      .on('cleanup', () => this.save());
  }
  /**
   * Add a data row
   *
   * You need to provide
   * {@link https://developer.mozilla.org/en-US/docs/Glossary/Primitive | primitive value}
   * only.
   *
   * @example
   *
   * ```ts
   * // convert array
   * dc.add({ array: [0, 1, 2] }); // ❌
   * dc.add({ array: [0, 1, 2].join(',') }); // ✔️
   *
   * // convert object
   * dc.add({ object: { a: 1, b: 2 } }); // ❌
   * dc.add({ object: JSON.stringify({ a: 1, b: 2 }) }); // ✔️
   * ```
   */
  add(row: T) {
    console.info('data', row);
    this.rows.push(row);
    const chunk = this.stringifier.transform(row);
    this.emit('add', { row, chunk });
    return chunk;
  }
  /**
   * Write data to disk
   *
   * In most cases, you don't need to call this method manually. It will be
   * called automatically when the collector is disposed.
   *
   * It is one-time, so multiple calls will be ignored.
   *
   * @example
   *
   * ```ts
   * dc.save(); // ✔️ the first call is successful
   * dc.save(); // ❌ the subsequent calls will be ignored
   * ```
   */
  save() {
    if (this.#saved) {
      console.warn('Repeated save is not allowed');
      return;
    }
    this.#saved = true;
    const chunk = this.stringifier.final();

    let hasPrevented = false;
    this.emit('save', {
      chunk,
      preventDefault: () => (hasPrevented = true),
    });
    if (!hasPrevented) this.download();
  }
  /** Download data to disk */
  download(suffix = '') {
    if (this.rows.length === 0) return;

    const url = URL.createObjectURL(
      new Blob([this.stringifier.value], { type: 'text/plain' }),
    );
    const el = h('a', { download: this.filename + suffix, href: url });
    document.body.appendChild(el);
    el.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(el);
  }
}
