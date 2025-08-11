import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from 'bun:test';
import { Window } from 'happy-dom';
import {
  DataCollector,
  DataStringifier,
  CSVStringifier,
  JSONStringifier,
} from '../src/data-collector';
import type { Data } from '../types';

// Setup DOM environment
const window = new Window();
global.document = window.document as any;
global.window = window as any;
global.URL = window.URL as any;
global.Blob = window.Blob as any;

describe('DataStringifier', () => {
  describe('Abstract DataStringifier', () => {
    it('should be an abstract class with expected properties', () => {
      // DataStringifier can be instantiated in JavaScript but is abstract in TypeScript
      const stringifier = new (DataStringifier as any)();
      expect(stringifier.value).toBe('');

      // The abstract methods are not implemented, so they are undefined
      expect(stringifier.transform).toBeUndefined();
      expect(stringifier.final).toBeUndefined();
    });

    it('should initialize with empty value', () => {
      class TestStringifier extends DataStringifier {
        transform(data: Data) {
          return 'test';
        }
        final() {
          return 'final';
        }
      }

      const stringifier = new TestStringifier();
      expect(stringifier.value).toBe('');
    });
  });

  describe('CSVStringifier', () => {
    let stringifier: CSVStringifier;

    beforeEach(() => {
      stringifier = new CSVStringifier();
    });

    it('should initialize with empty value and keys', () => {
      expect(stringifier.value).toBe('');
      expect(stringifier.keys).toEqual([]);
    });

    it('should generate CSV header on first transform', () => {
      const data = { name: 'Alice', age: 25 };
      const chunk = stringifier.transform(data);

      expect(stringifier.keys).toEqual(['name', 'age']);
      expect(chunk).toBe('name,age,\nAlice,25,');
      expect(stringifier.value).toBe('name,age,\nAlice,25,');
    });

    it('should not regenerate header on subsequent transforms', () => {
      const data1 = { name: 'Alice', age: 25 };
      const data2 = { name: 'Bob', age: 30 };

      stringifier.transform(data1);
      const chunk2 = stringifier.transform(data2);

      expect(chunk2).toBe('\nBob,30,');
      expect(stringifier.value).toBe('name,age,\nAlice,25,\nBob,30,');
    });

    it('should handle values with commas by wrapping in quotes', () => {
      const data = { name: 'Smith, John', description: 'A person, aged 25' };
      const chunk = stringifier.transform(data);

      expect(chunk).toContain('"Smith, John"');
      expect(chunk).toContain('"A person, aged 25"');
    });

    it('should handle keys with commas by wrapping in quotes', () => {
      const data = { 'name, full': 'Alice', 'age, years': 25 };
      const chunk = stringifier.transform(data);

      expect(chunk).toContain('"name, full"');
      expect(chunk).toContain('"age, years"');
    });

    it('should handle null and undefined values', () => {
      const data = { name: 'Alice', age: null, city: undefined };
      const chunk = stringifier.transform(data);

      expect(chunk).toContain('Alice,null,undefined,');
    });

    it('should handle boolean values', () => {
      const data = { name: 'Alice', active: true, verified: false };
      const chunk = stringifier.transform(data);

      expect(chunk).toContain('Alice,true,false,');
    });

    it('should return empty string from final()', () => {
      expect(stringifier.final()).toBe('');
    });
  });

  describe('JSONStringifier', () => {
    let stringifier: JSONStringifier;

    beforeEach(() => {
      stringifier = new JSONStringifier();
    });

    it('should initialize with empty value', () => {
      expect(stringifier.value).toBe('');
    });

    it('should start JSON array on first transform', () => {
      const data = { name: 'Alice', age: 25 };
      const chunk = stringifier.transform(data);

      expect(chunk).toBe('[{"name":"Alice","age":25}');
      expect(stringifier.value).toBe('[{"name":"Alice","age":25}');
    });

    it('should add comma before subsequent objects', () => {
      const data1 = { name: 'Alice', age: 25 };
      const data2 = { name: 'Bob', age: 30 };

      stringifier.transform(data1);
      const chunk2 = stringifier.transform(data2);

      expect(chunk2).toBe(',{"name":"Bob","age":30}');
      expect(stringifier.value).toBe(
        '[{"name":"Alice","age":25},{"name":"Bob","age":30}',
      );
    });

    it('should handle complex data types', () => {
      const data = {
        name: 'Alice',
        active: true,
        score: null,
        count: undefined,
      };
      const chunk = stringifier.transform(data);

      expect(chunk).toBe('[{"name":"Alice","active":true,"score":null}');
    });

    it('should close JSON array in final()', () => {
      stringifier.transform({ name: 'Alice' });
      const finalChunk = stringifier.final();

      expect(finalChunk).toBe(']');
      expect(stringifier.value).toBe('[{"name":"Alice"}]');
    });

    it('should handle empty case in final()', () => {
      const finalChunk = stringifier.final();

      expect(finalChunk).toBe(']');
      expect(stringifier.value).toBe(']');
    });
  });
});

describe('DataCollector', () => {
  let mockCreateWritable: any;
  let mockFileHandle: any;
  let mockDirectoryHandle: any;
  let mockWritableStream: any;

  beforeEach(() => {
    // Reset static stringifiers
    DataCollector.stringifiers.csv = CSVStringifier;
    DataCollector.stringifiers.json = JSONStringifier;

    // Mock file system API
    mockWritableStream = {
      write: mock(() => Promise.resolve()),
      close: mock(() => Promise.resolve()),
    };

    mockFileHandle = {
      kind: 'file',
      name: 'test.csv',
      queryPermission: mock(() => Promise.resolve('granted')),
      requestPermission: mock(() => Promise.resolve('granted')),
      createWritable: mock(() => Promise.resolve(mockWritableStream)),
    };

    mockDirectoryHandle = {
      kind: 'directory',
      getFileHandle: mock(() => Promise.resolve(mockFileHandle)),
    };

    // Mock DOM APIs
    const mockAnchor = {
      click: mock(),
      style: {},
    };

    spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') return mockAnchor as any;
      return {} as any;
    });

    spyOn(document.body, 'appendChild').mockImplementation((node: any) => node);
    spyOn(document.body, 'removeChild').mockImplementation((node: any) => node);
    spyOn(URL, 'createObjectURL').mockImplementation(() => 'mock-url');
    spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // Mock console methods
    spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Reset all mocks
    mock.restore();
  });

  describe('Constructor', () => {
    it('should create with default filename and CSV stringifier', () => {
      const collector = new DataCollector();

      expect(collector.filename).toMatch(/^data-\d+\.csv$/);
      expect(collector.stringifier).toBeInstanceOf(CSVStringifier);
      expect(collector.rows).toEqual([]);
    });

    it('should create with custom filename', () => {
      const collector = new DataCollector('my-data.json');

      expect(collector.filename).toBe('my-data.json');
      expect(collector.stringifier).toBeInstanceOf(JSONStringifier);
    });

    it('should create with custom stringifier', () => {
      const customStringifier = new JSONStringifier();
      const collector = new DataCollector('test.csv', customStringifier);

      expect(collector.stringifier).toBe(customStringifier);
    });

    it('should warn and use CSV for unknown extension', () => {
      const collector = new DataCollector('test.unknown');

      expect(console.warn).toHaveBeenCalledWith(
        'Please specify a valid file extension: csv, json, but got "unknown".\nOr, add your DataStringifier class to DataCollector.stringifiers.',
      );
      expect(collector.stringifier).toBeInstanceOf(CSVStringifier);
    });

    it('should warn and use CSV for filename without extension', () => {
      const collector = new DataCollector('test');

      expect(console.warn).toHaveBeenCalledWith(
        'Please specify the file extension in the filename',
      );
      expect(collector.stringifier).toBeInstanceOf(CSVStringifier);
    });

    it('should set up visibilitychange event listener', () => {
      const addEventListenerSpy = spyOn(document, 'addEventListener');
      new DataCollector();

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
        undefined,
      );
    });
  });

  describe('Static stringifiers', () => {
    it('should have CSV and JSON stringifiers by default', () => {
      expect(DataCollector.stringifiers.csv).toBe(CSVStringifier);
      expect(DataCollector.stringifiers.json).toBe(JSONStringifier);
    });

    it('should allow adding custom stringifiers', () => {
      class CustomStringifier extends DataStringifier {
        transform(data: Data) {
          return '';
        }
        final() {
          return '';
        }
      }

      DataCollector.stringifiers.custom = CustomStringifier;
      const collector = new DataCollector('test.custom');

      expect(collector.stringifier).toBeInstanceOf(CustomStringifier);
    });
  });

  describe('withFileStream', () => {
    it('should return this when no handle provided', async () => {
      const collector = new DataCollector();
      const result = await collector.withFileStream();

      expect(result).toBe(collector);
      expect(collector.fileStream).toBeUndefined();
    });

    it('should setup file stream with directory handle', async () => {
      const collector = new DataCollector('test.csv');
      const result = await collector.withFileStream(mockDirectoryHandle);

      expect(result).toBe(collector);
      expect(collector.fileStream).toBe(mockWritableStream);
      expect(mockDirectoryHandle.getFileHandle).toHaveBeenCalledWith(
        'test.csv',
        { create: true },
      );
    });

    it('should setup file stream with file handle', async () => {
      const collector = new DataCollector('test.csv');
      const result = await collector.withFileStream(mockFileHandle);

      expect(result).toBe(collector);
      expect(collector.fileStream).toBe(mockWritableStream);
      expect(mockFileHandle.createWritable).toHaveBeenCalled();
    });

    it('should warn when file handle name does not match collector filename', async () => {
      mockFileHandle.name = 'different.csv';
      const collector = new DataCollector('test.csv');
      await collector.withFileStream(mockFileHandle);

      expect(console.warn).toHaveBeenCalledWith(
        'File handle name "different.csv" does not match the collector filename "test.csv".',
      );
    });

    it('should handle permission denied case', async () => {
      mockFileHandle.queryPermission.mockResolvedValue('prompt');
      mockFileHandle.requestPermission.mockResolvedValue('denied');

      const collector = new DataCollector('test.csv');
      const result = await collector.withFileStream(mockFileHandle);

      expect(console.warn).toHaveBeenCalledWith(
        'File permission denied, no file stream will be created',
      );
      expect(result).toBe(collector);
      expect(collector.fileStream).toBeUndefined();
    });
  });

  describe('add', () => {
    it('should add row and transform data', async () => {
      const collector = new DataCollector('test.csv');
      const data = { name: 'Alice', age: 25 };

      const chunk = await collector.add(data);

      expect(collector.rows).toEqual([data]);
      expect(chunk).toBe('name,age,\nAlice,25,');
    });

    it('should write to file stream if available', async () => {
      const collector = new DataCollector('test.csv');
      await collector.withFileStream(mockFileHandle);

      const data = { name: 'Alice', age: 25 };
      await collector.add(data);

      expect(mockWritableStream.write).toHaveBeenCalledWith(
        'name,age,\nAlice,25,',
      );
    });

    it('should handle multiple rows', async () => {
      const collector = new DataCollector('test.csv');

      await collector.add({ name: 'Alice', age: 25 });
      await collector.add({ name: 'Bob', age: 30 });

      expect(collector.rows).toHaveLength(2);
      expect(collector.rows[0]).toEqual({ name: 'Alice', age: 25 });
      expect(collector.rows[1]).toEqual({ name: 'Bob', age: 30 });
    });
  });

  describe('backup', () => {
    it('should create download link with default suffix', () => {
      const collector = new DataCollector('test.csv');
      collector.stringifier.value = 'test data';

      collector.download();

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(window.Blob));
    });

    it('should create download link with custom suffix', () => {
      const collector = new DataCollector('test.csv');
      collector.stringifier.value = 'test data';

      collector.download('.custom');

      expect(document.createElement).toHaveBeenCalledWith('a');
    });

    it('should cleanup URL after download', () => {
      const collector = new DataCollector('test.csv');
      collector.stringifier.value = 'test data';

      collector.download();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('mock-url');
    });
  });

  describe('save', () => {
    it('should write final chunk to file stream and close', async () => {
      const collector = new DataCollector('test.json');
      await collector.withFileStream(mockFileHandle);
      await collector.add({ name: 'Alice' });

      await collector.save();

      expect(mockWritableStream.write).toHaveBeenCalledWith(']');
      expect(mockWritableStream.close).toHaveBeenCalled();
    });

    it('should call backup when no file stream', async () => {
      const collector = new DataCollector('test.csv');
      const backupSpy = spyOn(collector, 'backup').mockImplementation(() => {});

      await collector.save();

      expect(backupSpy).toHaveBeenCalledWith('');
    });

    it('should prevent repeated saves', async () => {
      const collector = new DataCollector('test.csv');

      await collector.save();
      await collector.save();

      expect(console.warn).toHaveBeenCalledWith('Repeated save is not allowed');
    });

    it('should handle JSON stringifier final chunk', async () => {
      const collector = new DataCollector('test.json');
      await collector.withFileStream(mockFileHandle);

      await collector.save();

      expect(mockWritableStream.write).toHaveBeenCalledWith(']');
    });
  });

  describe('visibilitychange event handling', () => {
    it('should call backup when page becomes hidden without file stream', () => {
      const addEventListenerSpy = spyOn(document, 'addEventListener');
      const collector = new DataCollector('test.csv');
      const backupSpy = spyOn(collector, 'backup').mockImplementation(() => {});

      // Get the event listener function
      const visibilityChangeHandler = addEventListenerSpy.mock.calls.find(
        (call: any) => call[0] === 'visibilitychange',
      )?.[1] as Function;

      // Simulate visibilitychange event
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
      });

      visibilityChangeHandler?.();

      expect(backupSpy).toHaveBeenCalled();
    });

    it('should not call backup when page becomes hidden with file stream', async () => {
      const addEventListenerSpy = spyOn(document, 'addEventListener');
      const collector = new DataCollector('test.csv');
      await collector.withFileStream(mockFileHandle);
      const backupSpy = spyOn(collector, 'backup').mockImplementation(() => {});

      // Get the event listener function
      const visibilityChangeHandler = addEventListenerSpy.mock.calls.find(
        (call: any) => call[0] === 'visibilitychange',
      )?.[1] as Function;

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
      });

      visibilityChangeHandler?.();

      expect(backupSpy).not.toHaveBeenCalled();
    });

    it('should not call backup when page becomes visible', () => {
      const addEventListenerSpy = spyOn(document, 'addEventListener');
      const collector = new DataCollector('test.csv');
      const backupSpy = spyOn(collector, 'backup').mockImplementation(() => {});

      // Get the event listener function
      const visibilityChangeHandler = addEventListenerSpy.mock.calls.find(
        (call: any) => call[0] === 'visibilitychange',
      )?.[1] as Function;

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
      });

      visibilityChangeHandler?.();

      expect(backupSpy).not.toHaveBeenCalled();
    });
  });

  describe('_Disposable integration', () => {
    it('should cleanup event listeners on dispose', () => {
      const removeEventListenerSpy = spyOn(document, 'removeEventListener');
      const collector = new DataCollector();

      collector[Symbol.dispose]();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
        undefined,
      );
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty data objects', async () => {
      const collector = new DataCollector('test.csv');
      const chunk = await collector.add({});

      expect(chunk).toBe('\n');
      expect(collector.rows).toEqual([{}]);
    });

    it('should handle data with special characters', async () => {
      const collector = new DataCollector('test.csv');
      const data = {
        'key with spaces': 'value with spaces',
        key_with_underscores: 'value_with_underscores',
        'key-with-dashes': 'value-with-dashes',
      };

      const chunk = await collector.add(data);

      expect(chunk).toContain('value with spaces');
      expect(chunk).toContain('value_with_underscores');
      expect(chunk).toContain('value-with-dashes');
    });

    it('should handle numeric data types', async () => {
      const collector = new DataCollector('test.csv');
      const data = {
        integer: 42,
        float: 3.14159,
        zero: 0,
        negative: -100,
      };

      const chunk = await collector.add(data);

      expect(chunk).toContain('42');
      expect(chunk).toContain('3.14159');
      expect(chunk).toContain('0');
      expect(chunk).toContain('-100');
    });

    it('should handle file extension without dot in regex match', () => {
      // This test creates a new DataCollector which will trigger console.warn
      // We don't need to reset the mock since beforeEach handles it
      const collector = new DataCollector('test.xml');

      // The actual call will have happened during construction
      // Let's check what the actual warning message contains
      const calls = (console.warn as any).mock.calls;
      const lastCall = calls[calls.length - 1];

      expect(lastCall[0]).toContain(
        'Please specify a valid file extension: csv, json',
      );
      expect(lastCall[0]).toContain('but got "xml"');
      expect(collector.stringifier).toBeInstanceOf(CSVStringifier);
    });

    it('should handle permission already granted case', async () => {
      mockFileHandle.queryPermission.mockResolvedValue('granted');

      const collector = new DataCollector('test.csv');
      const result = await collector.withFileStream(mockFileHandle);

      expect(result).toBe(collector);
      expect(collector.fileStream).toBe(mockWritableStream);
      expect(mockFileHandle.requestPermission).not.toHaveBeenCalled();
    });

    it('should handle queryPermission denied without requestPermission', async () => {
      mockFileHandle.queryPermission.mockResolvedValue('denied');
      mockFileHandle.requestPermission.mockResolvedValue('denied');

      const collector = new DataCollector('test.csv');
      const result = await collector.withFileStream(mockFileHandle);

      expect(console.warn).toHaveBeenCalledWith(
        'File permission denied, no file stream will be created',
      );
      expect(result).toBe(collector);
      expect(collector.fileStream).toBeUndefined();
    });

    it('should handle file stream write errors gracefully', async () => {
      mockWritableStream.write.mockRejectedValue(new Error('Write failed'));

      const collector = new DataCollector('test.csv');
      await collector.withFileStream(mockFileHandle);

      // The error should be thrown but we can test it doesn't break the collector
      try {
        await collector.add({ test: 'data' });
      } catch (error: any) {
        expect(error.message).toBe('Write failed');
      }
      expect(collector.rows).toHaveLength(1);
    });

    it('should handle file stream close errors gracefully', async () => {
      mockWritableStream.close.mockRejectedValue(new Error('Close failed'));

      const collector = new DataCollector('test.csv');
      await collector.withFileStream(mockFileHandle);

      // The error should be thrown but we can test the behavior
      try {
        await collector.save();
      } catch (error: any) {
        expect(error.message).toBe('Close failed');
      }
    });
  });

  describe('Integration tests', () => {
    it('should work end-to-end with CSV format', async () => {
      const collector = new DataCollector('experiment.csv');

      await collector.add({
        participant: 'P001',
        trial: 1,
        response: 'A',
        rt: 450,
      });
      await collector.add({
        participant: 'P001',
        trial: 2,
        response: 'B',
        rt: 320,
      });
      await collector.add({
        participant: 'P002',
        trial: 1,
        response: 'A',
        rt: 380,
      });

      expect(collector.rows).toHaveLength(3);
      expect(collector.stringifier.value).toContain(
        'participant,trial,response,rt,',
      );
      expect(collector.stringifier.value).toContain('P001,1,A,450,');
      expect(collector.stringifier.value).toContain('P002,1,A,380,');
    });

    it('should work end-to-end with JSON format', async () => {
      const collector = new DataCollector('experiment.json');

      await collector.add({ participant: 'P001', trial: 1, response: 'A' });
      await collector.add({ participant: 'P001', trial: 2, response: 'B' });

      collector.stringifier.final();

      expect(collector.stringifier.value).toBe(
        '[{"participant":"P001","trial":1,"response":"A"},{"participant":"P001","trial":2,"response":"B"}]',
      );
    });

    it('should work with file system API', async () => {
      const collector = new DataCollector('test.csv');
      await collector.withFileStream(mockDirectoryHandle);

      await collector.add({ name: 'Alice', age: 25 });
      await collector.add({ name: 'Bob', age: 30 });
      await collector.save();

      expect(mockWritableStream.write).toHaveBeenCalledTimes(3); // 2 data writes + 1 final
      expect(mockWritableStream.close).toHaveBeenCalled();
    });
  });
});
