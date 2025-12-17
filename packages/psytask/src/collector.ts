import { EventEmitter } from '@psytask/core';
import type { LooseObject } from 'shared/types';
import { $Object, ERR, mount } from 'shared/utils';
import { a, onPageLeave } from './utils';

export type Serializer<T extends LooseObject = LooseObject> = {
  header: (row: T, rows: T[]) => string;
  body: (row: T, rows: T[]) => string;
  footer: (rows: T[]) => string;
};

const csv_normalize = (value: unknown) => {
  if (value == null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : value + '';
  return /[,"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const serializers = {
  /** @see {@link https://www.rfc-editor.org/rfc/rfc4180 RFC-4180} */
  csv: {
    header: (row) =>
      $Object
        .keys(row)
        .reduce((acc, key, i) => acc + (i ? ',' : '') + csv_normalize(key), ''),
    body: (row) =>
      $Object
        .values(row)
        .reduce<string>(
          (acc, value, i) => acc + (i ? ',' : '\n') + csv_normalize(value),
          '',
        ),
    footer: () => '',
  },
  /** @see {@link https://www.json.org JSON} */
  json: {
    header: () => '[',
    body: (row, rows) => (rows.length ? ',' : '') + JSON.stringify(row),
    footer: () => ']',
  },
} satisfies Record<string, Serializer>;

export class Collector<T extends LooseObject> extends EventEmitter<{
  add: T;
  chunk: string;
}> {
  /**
   * Map of serializers by file extension
   *
   * You can add your own {@link Serializer} to this map.
   *
   * @example
   *
   * Add Markdown serializer
   *
   * ```ts
   * Collector.serializers['md'] = {
   *   head: (row) => '', // generate header from the first row
   *   body: (row) => '', // generate body from each row
   *   tail: () => '', // generate footer
   * };
   * using dc = new Collector('data.md'); // now you can save to Markdown file
   * ```
   */
  static readonly serializers: typeof serializers & Record<string, Serializer> =
    serializers;
  readonly rows: T[] = [];
  #serializer: Serializer<T>;
  #temp = '';
  /**
   * Collect, serialize and save data.
   *
   * Built-in supports for CSV and JSON formats. You can extend this by
   * {@link Collector.serializers} or provide `serializer` parameter.
   */
  constructor(
    /** @default `data-${Date.now()}.csv` */
    public readonly filename = `data-${Date.now()}.csv`,
    options?: {
      /** @default true */
      backup_on_leave?: boolean;
      /**
       * If not provided, a default {@link Serializer} based on the file
       * extension will be used.
       */
      serializer?: Serializer<T>;
    },
  ) {
    super();

    // set serializer
    const match = filename.match(/\.([^.]+)$/);
    const extname = match
      ? match[1]!
      : ERR(`Can't detect extension from "${filename}".`);
    if (options?.serializer) {
      this.#serializer = options.serializer;
    } else {
      const extnames: string[] = $Object.keys(serializers);
      this.#serializer = extnames.includes(extname)
        ? (serializers as Record<string, Serializer>)[extname]!
        : ERR(
            `Unsupported file extension: "${extname}", please use one of: ${extnames.join(', ')}.
Or add custom Serializer to Collector.serializers.`,
          );
    }

    // use backup on leave
    if (options?.backup_on_leave ?? true) {
      this.on(
        'dispose',
        // backup when the page is hidden
        onPageLeave(() => this.download(`.${Date.now()}.bak`)),
      );
    }
  }
  /**
   * Add a data row. For the default serializer, object fields will be
   * serialized using {@link JSON.stringify}.
   *
   * @returns The total serialized data up to now.
   */
  add(row: T) {
    this.emit('add', row); // modify row
    const { rows } = this;
    const chunk =
      (this.#temp ? '' : this.#serializer.header(row, rows)) +
      this.#serializer.body(row, rows);
    rows.push(row);
    return (this.emit('chunk', chunk).#temp += chunk);
  }
  /**
   * Get the final serialized data.
   *
   * @example
   *
   * Call multiple times
   *
   * ```ts
   * using dc = new Collector('test.csv');
   *
   * dc.add({ a: 1, b: 'hello' });
   * dc.final() === 'a,b\n1,hello'; // true
   *
   * dc.add({ a: 2, b: 'world' });
   * dc.final() === 'a,b\n1,hello\n2,world'; //true
   * ```
   */
  final() {
    const chunk = this.#temp ? this.#serializer.footer(this.rows) : '';
    return this.emit('chunk', chunk).#temp + chunk;
  }
  /** Download final serialized data */
  download(suffix = '') {
    const output = this.final();
    if (!output) return;
    const url = URL.createObjectURL(new Blob([output], { type: 'text/plain' }));
    const el = mount(a({ download: this.filename + suffix, href: url }));
    el.click();
    URL.revokeObjectURL(url);
    el.remove();
  }
}
