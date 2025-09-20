import { EventEmitter } from '@psytask/core';
import { h, mount, onPageLeave } from 'shared/utils';
import type { Primitive, Serializable } from '../types';

type MaybeGetter<T> = T | (() => T);

type Stringifier = {
  value: string;
  transform: (data: Serializable) => string;
  final: () => string;
};
type StringifierBuilder = () => Stringifier;

/** Create data stringifier builder */
export const createStringifierBuilder =
  (
    options: MaybeGetter<{
      head: (data: Serializable) => string;
      body: (data: Serializable) => string;
      tail: () => string;
    }>,
  ) =>
  () => {
    const opts = typeof options === 'function' ? options() : options;
    const stringifier: Stringifier = {
      value: '',
      transform(data) {
        const chunk =
          (stringifier.value === '' ? opts.head(data) : '') + opts.body(data);
        stringifier.value += chunk;
        return chunk;
      },
      final() {
        const chunk = stringifier.value === '' ? opts.tail() : '';
        stringifier.value += chunk;
        return chunk;
      },
    };
    return stringifier;
  };

const CSVNormalize = (value: Primitive) =>
  value == null
    ? ''
    : ((value = value + ''),
      /[,"\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
const stringifiers = {
  /** @see {@link https://www.rfc-editor.org/rfc/rfc4180 RFC-4180} */
  csv: createStringifierBuilder({
    head: (data) =>
      Object.keys(data).reduce(
        (acc, key, i) => acc + (i ? ',' : '') + CSVNormalize(key),
        '',
      ),
    body: (data) =>
      Object.values(data).reduce<string>(
        (acc, value, i) => acc + (i ? ',' : '') + CSVNormalize(value),
        '\n',
      ),
    tail: () => '',
  }),
  /** @see {@link https://www.json.org JSON} */
  json: createStringifierBuilder({
    head: () => '[',
    body: (data) => JSON.stringify(data) + ',',
    tail: () => ']',
  }),
};

/** One-time data collector. Collect, stringify and save data. */
export class Collector<T extends Serializable> extends EventEmitter<{
  add: T;
  chunk: string;
  save: () => void;
}> {
  /**
   * Map of stringifiers by file extension
   *
   * You can add your own {@link StringifierBuilder} to this map.
   *
   * @example Add Markdown stringifier
   *
   * ```ts
   * Collector.stringifiers['md'] = createStringifierBuilder({
   *   head: (data) => '', // generate header from the first row
   *   body: (data) => '', // generate body from each row
   *   tail: () => '', // generate footer
   * });
   * using dc = new Collector('data.md'); // now you can save to Markdown file
   * ```
   */
  static readonly stringifiers: typeof stringifiers &
    Record<string, StringifierBuilder> = stringifiers;
  readonly rows: T[] = [];
  #save_count = 0;
  #stringifier: Stringifier;
  /**
   * Built-in supports for CSV and JSON formats. You can extend this by
   * {@link Collector.stringifiers} or provide `stringifier` parameter.
   *
   * @param filename Default is `data-${Date.now()}.csv`
   * @param builder - An {@link StringifierBuilder}. If not provided, a default
   *   stringifier will be created based on the file extension.
   */
  constructor(
    public readonly filename = `data-${Date.now()}.csv`,
    builder?: StringifierBuilder,
  ) {
    super();

    // set stringifier
    const match = filename.match(/\.([^\.]+)$/);
    const defaultExt = 'csv';
    const extname = match
      ? match[1]!
      : (console.warn(`Cannot detect extension from ${filename}.`), defaultExt);
    if (builder) {
      this.#stringifier = builder();
    } else {
      const extnames = Object.keys(stringifiers);
      if (extnames.includes(extname)) {
        this.#stringifier = (
          stringifiers as (typeof Collector)['stringifiers']
        )[extname]!();
      } else {
        console.warn(
          `Expect file extension: ${extnames.join(
            ', ',
          )}, but got "${extname}".\nOr, add custom Stringifier creator to Collector.stringifiers.`,
        );
        this.#stringifier = stringifiers[defaultExt]!();
      }
    }

    // backup when the page is hidden
    this.on(
      'dispose',
      onPageLeave(() => this.download(`-${Date.now()}.backup`)),
    )
      // save data on dispose
      .on('dispose', () => this.save());
  }
  /**
   * Add a data row
   *
   * Only supports
   * {@link https://developer.mozilla.org/en-US/docs/Glossary/Primitive primitive value}
   * .
   *
   * @example
   *
   * ```ts
   * // convert array
   * dc.add({ array: [0, 1, 2] }); // ❌
   * dc.add({ array: [0, 1, 2].join(',') }); // ✅
   *
   * // convert object
   * dc.add({ object: { a: 1, b: 2 } }); // ❌
   * dc.add({ object: JSON.stringify({ a: 1, b: 2 }) }); // ✅
   * ```
   */
  add(row: T) {
    this.rows.push(row);
    this.emit('add', row).emit('chunk', this.#stringifier.transform(row));
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
   * dc.save(); // ✅ the first call is successful
   * dc.save(); // ❌ the subsequent calls will be ignored
   * ```
   */
  save() {
    if (this.#save_count++)
      return console.warn('Repeated save is not allowed.', this.#save_count);
    let prevented = 0;
    this.emit('chunk', this.#stringifier.final()).emit(
      'save',
      () => (prevented = 1),
    );
    if (!prevented) this.download();
  }
  /** Download data to disk */
  download(suffix = '') {
    if (!this.#stringifier.value) return;
    const url = URL.createObjectURL(
      new Blob([this.#stringifier.value], { type: 'text/plain' }),
    );
    const el = mount(h('a', { download: this.filename + suffix, href: url }));
    el.click();
    URL.revokeObjectURL(url);
    el.remove();
  }
}
