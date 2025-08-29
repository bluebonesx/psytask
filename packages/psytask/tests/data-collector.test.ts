import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';
import {
  CSVStringifier,
  DataCollector,
  DataStringifier,
  JSONStringifier,
} from '../src/data-collector';
import type { Data } from '../types';

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

    it('should test normalize method directly', () => {
      // Test normalize method with various input types
      expect(stringifier.normalize(null)).toBe('');
      expect(stringifier.normalize(undefined)).toBe('');
      expect(stringifier.normalize('simple')).toBe('simple');
      expect(stringifier.normalize('text,with,commas')).toBe(
        '"text,with,commas"',
      );
      expect(stringifier.normalize('text"with"quotes')).toBe(
        '"text""with""quotes"',
      );
      expect(stringifier.normalize('text\nwith\nnewlines')).toBe(
        '"text\nwith\nnewlines"',
      );
      expect(stringifier.normalize(123)).toBe('123');
      expect(stringifier.normalize(true)).toBe('true');
    });

    it('should generate CSV header on first transform', () => {
      const data = { name: 'Alice', age: 25 };
      const chunk = stringifier.transform(data);

      expect(stringifier.keys).toEqual(['name', 'age']);
      expect(chunk).toBe('name,age\nAlice,25');
      expect(stringifier.value).toBe('name,age\nAlice,25');
    });

    it('should not regenerate header on subsequent transforms', () => {
      const data1 = { name: 'Alice', age: 25 };
      const data2 = { name: 'Bob', age: 30 };

      stringifier.transform(data1);
      const chunk2 = stringifier.transform(data2);

      expect(chunk2).toBe('\nBob,30');
      expect(stringifier.value).toBe('name,age\nAlice,25\nBob,30');
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

    it('should handle values with quotes by escaping them', () => {
      const data = { name: 'Alice "The Great"', description: 'Say "Hello"' };
      const chunk = stringifier.transform(data);

      expect(chunk).toContain('"Alice ""The Great"""');
      expect(chunk).toContain('"Say ""Hello"""');
    });

    it('should handle values with newlines and carriage returns', () => {
      const data = {
        multiline: 'Line 1\nLine 2',
        withCR: 'Text\rWith\r\nReturns',
      };
      const chunk = stringifier.transform(data);

      expect(chunk).toContain('"Line 1\nLine 2"');
      expect(chunk).toContain('"Text\rWith\r\nReturns"');
    });

    it('should handle null and undefined values', () => {
      const data = { name: 'Alice', age: null, city: undefined };
      const chunk = stringifier.transform(data);

      expect(chunk).toContain('Alice,,');
    });

    it('should handle boolean values', () => {
      const data = { name: 'Alice', active: true, verified: false };
      const chunk = stringifier.transform(data);

      expect(chunk).toContain('Alice,true,false');
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

      expect(finalChunk).toBe('[]');
      expect(stringifier.value).toBe('[]');
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

  describe('add', () => {
    it('should add row and transform data', () => {
      const collector = new DataCollector('test.csv');
      const data = { name: 'Alice', age: 25 };

      const chunk = collector.add(data);

      expect(collector.rows).toEqual([data]);
      expect(chunk).toBe('name,age\nAlice,25');
    });

    it('should handle multiple rows', () => {
      const collector = new DataCollector('test.csv');

      collector.add({ name: 'Alice', age: 25 });
      collector.add({ name: 'Bob', age: 30 });

      expect(collector.rows).toHaveLength(2);
      expect(collector.rows[0]).toEqual({ name: 'Alice', age: 25 });
      expect(collector.rows[1]).toEqual({ name: 'Bob', age: 30 });
    });
  });

  describe('download', () => {
    it('should create download link with default suffix', () => {
      const collector = new DataCollector('test.csv');
      collector.add({ test: 'data' }); // Add some data first
      collector.stringifier.value = 'test data';

      collector.download();

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(window.Blob));
    });

    it('should create download link with custom suffix', () => {
      const collector = new DataCollector('test.csv');
      collector.add({ test: 'data' }); // Add some data first
      collector.stringifier.value = 'test data';

      collector.download('.custom');

      expect(document.createElement).toHaveBeenCalledWith('a');
    });

    it('should cleanup URL after download', () => {
      const collector = new DataCollector('test.csv');
      collector.add({ test: 'data' }); // Add some data first
      collector.stringifier.value = 'test data';

      collector.download();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('mock-url');
    });

    it('should not download when no rows exist', () => {
      const collector = new DataCollector('test.csv');
      const createElementSpy = spyOn(document, 'createElement');

      collector.download();

      expect(createElementSpy).not.toHaveBeenCalled();
    });
  });

  describe('save', () => {
    it('should call download when save is called', () => {
      const collector = new DataCollector('test.csv');
      const downloadSpy = spyOn(collector, 'download').mockImplementation(
        () => {},
      );

      collector.save();

      expect(downloadSpy).toHaveBeenCalledWith();
    });

    it('should prevent repeated saves', () => {
      const collector = new DataCollector('test.csv');

      collector.save();
      collector.save();

      expect(console.warn).toHaveBeenCalledWith('Repeated save is not allowed');
    });

    it('should handle JSON stringifier final chunk', () => {
      const collector = new DataCollector('test.json');

      collector.save();

      // The final chunk should be added to the stringifier
      expect(collector.stringifier.value).toContain(']');
    });

    it('should respect preventDefault in save event', () => {
      const collector = new DataCollector('test.csv');
      const downloadSpy = spyOn(collector, 'download').mockImplementation(
        () => {},
      );

      // Add a listener that prevents default
      collector.on('save', ({ preventDefault }) => {
        preventDefault();
      });

      collector.save();

      expect(downloadSpy).not.toHaveBeenCalled();
    });
  });

  describe('visibilitychange event handling', () => {
    it('should call download when page becomes hidden', () => {
      const addEventListenerSpy = spyOn(document, 'addEventListener');
      const collector = new DataCollector('test.csv');
      collector.add({ test: 'data' }); // Add some data to enable download
      const downloadSpy = spyOn(collector, 'download').mockImplementation(
        () => {},
      );

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

      expect(downloadSpy).toHaveBeenCalled();
    });

    it('should not call download when page becomes visible', () => {
      const addEventListenerSpy = spyOn(document, 'addEventListener');
      const collector = new DataCollector('test.csv');
      const downloadSpy = spyOn(collector, 'download').mockImplementation(
        () => {},
      );

      // Get the event listener function
      const visibilityChangeHandler = addEventListenerSpy.mock.calls.find(
        (call: any) => call[0] === 'visibilitychange',
      )?.[1] as Function;

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
      });

      visibilityChangeHandler?.();

      expect(downloadSpy).not.toHaveBeenCalled();
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
    it('should handle empty data objects', () => {
      const collector = new DataCollector('test.csv');
      const chunk = collector.add({});

      expect(chunk).toBe('\n');
      expect(collector.rows).toEqual([{}]);
    });

    it('should handle data with special characters', () => {
      const collector = new DataCollector('test.csv');
      const data = {
        'key with spaces': 'value with spaces',
        key_with_underscores: 'value_with_underscores',
        'key-with-dashes': 'value-with-dashes',
      };

      const chunk = collector.add(data);

      expect(chunk).toContain('value with spaces');
      expect(chunk).toContain('value_with_underscores');
      expect(chunk).toContain('value-with-dashes');
    });

    it('should handle numeric data types', () => {
      const collector = new DataCollector('test.csv');
      const data = {
        integer: 42,
        float: 3.14159,
        zero: 0,
        negative: -100,
      };

      const chunk = collector.add(data);

      expect(chunk).toContain('42');
      expect(chunk).toContain('3.14159');
      expect(chunk).toContain('0');
      expect(chunk).toContain('-100');
    });

    it('should handle file extension without dot in regex match', () => {
      const collector = new DataCollector('test.xml');

      const calls = (console.warn as any).mock.calls;
      const lastCall = calls[calls.length - 1];

      expect(lastCall[0]).toContain(
        'Please specify a valid file extension: csv, json',
      );
      expect(lastCall[0]).toContain('but got "xml"');
      expect(collector.stringifier).toBeInstanceOf(CSVStringifier);
    });

    it('should emit add event with correct data', () => {
      const collector = new DataCollector('test.csv');
      let emittedData: any = null;

      collector.on('add', (data) => {
        emittedData = data;
      });

      const testData = { name: 'Test', value: 123 };
      const chunk = collector.add(testData);

      expect(emittedData).toEqual({
        row: testData,
        chunk: chunk,
      });
    });

    it('should emit save event with correct data', () => {
      const collector = new DataCollector('test.csv');
      let emittedData: any = null;

      collector.on('save', (data) => {
        emittedData = data;
      });

      collector.save();

      expect(emittedData).toHaveProperty('chunk');
      expect(emittedData).toHaveProperty('preventDefault');
      expect(typeof emittedData.preventDefault).toBe('function');
    });

    it('should test EventEmitter inherited methods', () => {
      const collector = new DataCollector('test.csv');
      let callCount = 0;

      const listener = () => {
        callCount++;
      };

      // Test on/off methods
      collector.on('add', listener);
      collector.emit('add', { row: {}, chunk: '' });
      expect(callCount).toBe(1);

      collector.off('add', listener);
      collector.emit('add', { row: {}, chunk: '' });
      expect(callCount).toBe(1); // Should not increase

      // Test once method
      collector.once('add', listener);
      collector.emit('add', { row: {}, chunk: '' });
      collector.emit('add', { row: {}, chunk: '' });
      expect(callCount).toBe(2); // Should only increase by 1
    });
  });

  describe('Integration tests', () => {
    it('should work end-to-end with CSV format', async () => {
      const collector = new DataCollector('experiment.csv');

      collector.add({
        participant: 'P001',
        trial: 1,
        response: 'A',
        rt: 450,
      });
      collector.add({
        participant: 'P001',
        trial: 2,
        response: 'B',
        rt: 320,
      });
      collector.add({
        participant: 'P002',
        trial: 1,
        response: 'A',
        rt: 380,
      });

      expect(collector.rows).toHaveLength(3);
      expect(collector.stringifier.value).toContain(
        'participant,trial,response,rt',
      );
      expect(collector.stringifier.value).toContain('P001,1,A,450');
      expect(collector.stringifier.value).toContain('P002,1,A,380');
    });

    it('should work end-to-end with JSON format', () => {
      const collector = new DataCollector('experiment.json');

      collector.add({ participant: 'P001', trial: 1, response: 'A' });
      collector.add({ participant: 'P001', trial: 2, response: 'B' });

      collector.stringifier.final();

      expect(collector.stringifier.value).toBe(
        '[{"participant":"P001","trial":1,"response":"A"},{"participant":"P001","trial":2,"response":"B"}]',
      );
    });
  });
});
