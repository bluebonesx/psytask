import type { Data } from '../types';
import { DisposableClass, h } from './util';

// stringifiers
export abstract class DataStringifier {
  value = '';
  /** Transform a data object into a string chunk, and append it to the collector */
  abstract transform(data: Data): string;
  /** Create the final chunk, and append it to the collector */
  abstract final(): string;
}
export class CSVStringifier extends DataStringifier {
  keys: string[] = [];
  transform(data: Data) {
    let chunk = '';
    if (this.keys.length === 0) {
      this.keys = Object.keys(data);
      chunk = this.keys.reduce(
        (acc, key) => acc + (key.includes(',') ? `"${key}"` : key) + ',',
        '',
      );
    }
    chunk += this.keys.reduce((acc, key) => {
      const value = data[key];
      return acc + (('' + value).includes(',') ? `"${value}"` : value) + ',';
    }, '\n');
    this.value += chunk;
    return chunk;
  }
  final() {
    return '';
  }
}
export class JSONStringifier extends DataStringifier {
  transform(data: Data) {
    const chunk = (this.value === '' ? '[' : ',') + JSON.stringify(data);
    this.value += chunk;
    return chunk;
  }
  final() {
    this.value += ']';
    return ']';
  }
}

// collector
/**
 * @example
 *   using dc = await new DataCollector('data.csv');
 *   dc.add({ name: 'Alice', age: 25 });
 *   dc.add({ name: 'Bob', age: 30 });
 *   await dc.save();
 */
export class DataCollector<T extends Data> extends DisposableClass {
  /**
   * A map of stringifier classes by file extension
   *
   * You can add your own stringifier class to this map. The class should extend
   * `DataStringifier` and implement `transform` and `final` methods. The key is
   * the file extension (without the dot), and the value is the class.
   *
   * @example
   *   // add support for Markdown files, whose extension is 'md'
   *   DataCollector.stringifiers['md'] = class extends DataStringifier {
   *     transform(data) {
   *       // write transform logic here
   *       return '';
   *     }
   *     final() {
   *       // write final logic here
   *       return '';
   *     }
   *   };
   */
  static readonly stringifiers: Record<string, new () => DataStringifier> = {
    csv: CSVStringifier,
    json: JSONStringifier,
  };
  rows: T[] = [];
  #saved = false;
  stringifier: DataStringifier;
  fileStream?: FileSystemWritableFileStream;
  /**
   * @param filename Pure filename with extension, not path. Default is
   *   `data-<timestamp>.csv`.
   * @param stringifier Using for data transformation.
   */
  constructor(
    public filename = `data-${Date.now()}.csv`,
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
    this.useEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !this.fileStream) {
        this.backup();
      }
    });
    // TODO: save data on dispose
    // this.addCleanup(() => this.save());
  }
  /**
   * Some browser do not support this feature, such as Safari and Firefox. See
   * [MDN](https://developer.mozilla.org/docs/Web/API/File_System_API) for more
   * information.
   *
   * @example
   *   const dir = await window.showDirectoryPicker?.();
   *   using dc = await new DataCollector().withFileStream(dir);
   *
   * @param handle File system handle to create a `FileSystemWritableFileStream`
   *   for writeting data.
   */
  async withFileStream(
    handle?: FileSystemDirectoryHandle | FileSystemFileHandle,
  ) {
    if (!handle) {
      return this;
    }
    const file =
      handle.kind === 'directory'
        ? await handle.getFileHandle(this.filename, { create: true })
        : handle;
    if (file.name !== this.filename) {
      console.warn(
        `File handle name "${file.name}" does not match the collector filename "${this.filename}".`,
      );
    }
    if (
      (await file.queryPermission({ mode: 'readwrite' })) !== 'granted' &&
      (await file.requestPermission({ mode: 'readwrite' })) !== 'granted'
    ) {
      console.warn('File permission denied, no file stream will be created');
      return this;
    }
    this.fileStream = await file.createWritable();
    return this;
  }
  async add(row: T) {
    this.rows.push(row);
    const chunk = this.stringifier.transform(row);
    await this.fileStream?.write(chunk);
    return chunk;
  }
  /** Download current data to disk */
  backup(suffix = '.backup') {
    const url = URL.createObjectURL(
      new Blob([this.stringifier.value], { type: 'text/plain' }),
    );
    const el = h('a', { download: this.filename + suffix, href: url });
    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
    URL.revokeObjectURL(url);
  }
  /** Write final data to disk */
  async save() {
    if (this.#saved) {
      console.warn('Repeated save is not allowed');
      return;
    }
    const chunk = this.stringifier.final();
    if (this.fileStream) {
      await this.fileStream.write(chunk);
      await this.fileStream.close();
    } else {
      this.backup('');
    }
    this.#saved = true;
  }
}
