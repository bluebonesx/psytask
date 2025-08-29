import {
  describe,
  test,
  expect,
  beforeEach,
  spyOn,
  mock,
  beforeAll,
} from 'bun:test';
import {
  h,
  hasOwn,
  proxyNonKey,
  promiseWithResolvers,
  on,
  EventEmitter,
} from '../src/util';

describe('h (createElement helper)', () => {
  test('should create simple element', () => {
    const div = h('div');
    expect(div.tagName).toBe('DIV');
    expect(div.children.length).toBe(0);
  });

  test('should create element with properties', () => {
    const input = h('input', {
      type: 'text',
      placeholder: 'Enter text',
      className: 'form-input',
      id: 'test-input',
    });

    expect(input.type).toBe('text');
    expect(input.placeholder).toBe('Enter text');
    expect(input.className).toBe('form-input');
    expect(input.id).toBe('test-input');
  });

  test('should apply inline styles', () => {
    const div = h('div', {
      style: {
        'background-color': 'red',
        'font-size': '16px',
        width: '100px',
      },
    });

    expect(div.style.backgroundColor).toBe('red');
    expect(div.style.fontSize).toBe('16px');
    expect(div.style.width).toBe('100px');
  });

  test('should set dataset properties', () => {
    const div = h('div', {
      dataset: {
        testId: 'my-component',
        value: '42',
        enabled: 'true',
      },
    });

    expect(div.dataset.testId).toBe('my-component');
    expect(div.dataset.value).toBe('42');
    expect(div.dataset.enabled).toBe('true');
  });

  test('should append single child', () => {
    const child = h('span', null, 'Hello');
    const parent = h('div', null, child);

    expect(parent.children.length).toBe(1);
    expect(parent.children[0]).toBe(child);
  });

  test('should append string content', () => {
    const div = h('div', null, 'Hello World');
    expect(div.textContent).toBe('Hello World');
  });

  test('should append multiple children', () => {
    const span1 = h('span', null, 'First');
    const span2 = h('span', null, 'Second');
    const div = h('div', null, [span1, ' - ', span2]);

    expect(div.children.length).toBe(2);
    expect(div.textContent).toBe('First - Second');
  });

  test('should handle null props and children', () => {
    const div = h('div', null, null);
    expect(div.tagName).toBe('DIV');
    expect(div.children.length).toBe(0);
  });

  test('should combine props, styles, dataset and children', () => {
    const complex = h(
      'button',
      {
        type: 'button',
        className: 'btn',
        style: { color: 'blue' },
        dataset: { action: 'submit' },
      },
      'Click me',
    );

    expect(complex.type).toBe('button');
    expect(complex.className).toBe('btn');
    expect(complex.style.color).toBe('blue');
    expect(complex.dataset.action).toBe('submit');
    expect(complex.textContent).toBe('Click me');
  });
});

describe('hasOwn', () => {
  test('should return true for own properties', () => {
    const obj = { foo: 'bar', baz: 42 };
    expect(hasOwn(obj, 'foo')).toBe(true);
    expect(hasOwn(obj, 'baz')).toBe(true);
  });

  test('should return false for inherited properties', () => {
    const obj = { foo: 'bar' };
    expect(hasOwn(obj, 'toString')).toBe(false);
    expect(hasOwn(obj, 'hasOwnProperty')).toBe(false);
  });

  test('should return false for non-existent properties', () => {
    const obj = { foo: 'bar' };
    expect(hasOwn(obj, 'nonexistent')).toBe(false);
    expect(hasOwn(obj, 'undefined')).toBe(false);
  });

  test('should work with symbol keys', () => {
    const sym = Symbol('test');
    const obj = { [sym]: 'value' };
    expect(hasOwn(obj, sym)).toBe(true);
    expect(hasOwn(obj, Symbol('other'))).toBe(false);
  });

  test('should work with numeric keys', () => {
    const obj = { 0: 'zero', 1: 'one' };
    expect(hasOwn(obj, 0)).toBe(true);
    expect(hasOwn(obj, 1)).toBe(true);
    expect(hasOwn(obj, 2)).toBe(false);
  });

  test('should handle null and undefined values', () => {
    const obj = { nullProp: null, undefinedProp: undefined };
    expect(hasOwn(obj, 'nullProp')).toBe(true);
    expect(hasOwn(obj, 'undefinedProp')).toBe(true);
  });
});

describe('proxyNonKey', () => {
  test('should return actual property values for existing keys', () => {
    const obj = { foo: 'bar', baz: 42 };
    const onNoKey = mock(() => 'default');
    const proxied = proxyNonKey(obj, onNoKey);

    expect(proxied.foo).toBe('bar');
    expect(proxied.baz).toBe(42);
    expect(onNoKey).not.toHaveBeenCalled();
  });

  test('should call onNoKey for non-existent properties', () => {
    const obj = { foo: 'bar' };
    const onNoKey = mock((key: PropertyKey) => `fallback-${String(key)}`);
    const proxied = proxyNonKey(obj, onNoKey) as any;

    expect(proxied.nonexistent).toBe('fallback-nonexistent');
    expect(onNoKey).toHaveBeenCalledWith('nonexistent');
  });

  test('should work with different return types from onNoKey', () => {
    const obj = { existing: 'value' };
    const onNoKey = mock(() => 42);
    const proxied = proxyNonKey(obj, onNoKey) as any;

    expect(proxied.missing).toBe(42);
    expect(onNoKey).toHaveBeenCalledWith('missing');
  });

  test('should handle symbol keys', () => {
    const sym1 = Symbol('existing');
    const sym2 = Symbol('missing');
    const obj = { [sym1]: 'exists' };
    const onNoKey = mock(() => 'not found');
    const proxied = proxyNonKey(obj, onNoKey);

    expect(proxied[sym1]).toBe('exists');
    expect((proxied as any)[sym2]).toBe('not found');
    expect(onNoKey).toHaveBeenCalledWith(sym2);
  });

  test('should call onNoKey for each access to missing properties', () => {
    const obj = { foo: 'bar' };
    const onNoKey = mock(() => 'default');
    const proxied = proxyNonKey(obj, onNoKey) as any;

    proxied.missing1;
    proxied.missing2;
    proxied.missing1; // access same missing key again

    expect(onNoKey).toHaveBeenCalledTimes(3);
    expect(onNoKey).toHaveBeenNthCalledWith(1, 'missing1');
    expect(onNoKey).toHaveBeenNthCalledWith(2, 'missing2');
    expect(onNoKey).toHaveBeenNthCalledWith(3, 'missing1');
  });
});

describe('promiseWithResolvers', () => {
  test('should return promise with resolve and reject functions', () => {
    const { promise, resolve, reject } = promiseWithResolvers<string>();

    expect(promise).toBeInstanceOf(Promise);
    expect(typeof resolve).toBe('function');
    expect(typeof reject).toBe('function');
  });

  test('should resolve promise with provided value', async () => {
    const { promise, resolve } = promiseWithResolvers<number>();

    setTimeout(() => resolve(42), 0);

    const result = await promise;
    expect(result).toBe(42);
  });

  test('should reject promise with provided reason', async () => {
    const { promise, reject } = promiseWithResolvers<never>();
    const error = new Error('Test error');

    setTimeout(() => reject(error), 0);

    try {
      await promise;
      expect(true).toBe(false); // Should not reach here
    } catch (caught) {
      expect(caught).toBe(error);
    }
  });

  test('should handle async resolution', async () => {
    const { promise, resolve } = promiseWithResolvers<string>();

    // Simulate async operation
    setTimeout(() => {
      resolve('async result');
    }, 10);

    const result = await promise;
    expect(result).toBe('async result');
  });

  test('should handle promise-like values', async () => {
    const { promise, resolve } = promiseWithResolvers<string>();
    const thenable = {
      then: (onFulfilled: (value: string) => void) => {
        setTimeout(() => onFulfilled('thenable result'), 0);
      },
    };

    resolve(thenable as any);

    const result = await promise;
    expect(result).toBe('thenable result');
  });
});

describe('on (event listener helper)', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  test('should add event listener and return cleanup function', () => {
    const handler = mock(() => {});
    const cleanup = on(element, 'click', handler);

    expect(typeof cleanup).toBe('function');

    // Trigger event
    element.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('should remove event listener when cleanup is called', () => {
    const handler = mock(() => {});
    const cleanup = on(element, 'click', handler);

    // First click should trigger handler
    element.click();
    expect(handler).toHaveBeenCalledTimes(1);

    // Remove listener
    cleanup();

    // Second click should not trigger handler
    element.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('should work with different event types', () => {
    const clickHandler = mock(() => {});
    const mouseoverHandler = mock(() => {});

    const cleanupClick = on(element, 'click', clickHandler);
    const cleanupMouseover = on(element, 'mouseover', mouseoverHandler);

    // Test click event
    element.click();
    expect(clickHandler).toHaveBeenCalledTimes(1);
    expect(mouseoverHandler).toHaveBeenCalledTimes(0);

    // Test mouseover event
    element.dispatchEvent(new MouseEvent('mouseover'));
    expect(clickHandler).toHaveBeenCalledTimes(1);
    expect(mouseoverHandler).toHaveBeenCalledTimes(1);

    cleanupClick();
    cleanupMouseover();
  });

  test('should pass event object to handler', () => {
    const handler = mock((event: MouseEvent) => {
      expect(event).toBeInstanceOf(MouseEvent);
      expect(event.target).toBe(element);
      expect(event.type).toBe('click');
    });

    const cleanup = on(element, 'click', handler);
    element.click();

    expect(handler).toHaveBeenCalledTimes(1);
    cleanup();
  });

  test('should work with options parameter', () => {
    const handler = mock(() => {});
    const cleanup = on(element, 'click', handler, { once: true });

    // First click should trigger handler
    element.click();
    expect(handler).toHaveBeenCalledTimes(1);

    // Second click should not trigger handler (once: true)
    element.click();
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
  });

  test('should work with capture option', () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);

    const parentHandler = mock(() => {});
    const childHandler = mock(() => {});

    // Add capturing listener to parent
    const cleanup1 = on(parent, 'click', parentHandler, true);
    // Add bubbling listener to child
    const cleanup2 = on(child, 'click', childHandler);

    // Click on child should trigger both handlers
    child.click();
    expect(parentHandler).toHaveBeenCalledTimes(1);
    expect(childHandler).toHaveBeenCalledTimes(1);

    cleanup1();
    cleanup2();
  });

  test('should work with window and document', () => {
    const windowHandler = mock(() => {});
    const documentHandler = mock(() => {});

    const cleanup1 = on(window, 'resize', windowHandler);
    const cleanup2 = on(document, 'click', documentHandler);

    // Test window event
    window.dispatchEvent(new Event('resize'));
    expect(windowHandler).toHaveBeenCalledTimes(1);

    // Test document event
    document.dispatchEvent(new MouseEvent('click'));
    expect(documentHandler).toHaveBeenCalledTimes(1);

    cleanup1();
    cleanup2();
  });
});

describe('EventEmitter', () => {
  let emitter: EventEmitter<{ test: string; data: number }>;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe('on method', () => {
    test('should add event listener', () => {
      const handler = mock(() => {});
      const result = emitter.on('test', handler);

      expect(result).toBe(emitter); // Should return this for chaining
      expect(emitter.emit('test', 'value')).toBe(1);
      expect(handler).toHaveBeenCalledWith('value');
    });

    test('should add multiple listeners for same event', () => {
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      emitter.on('test', handler1);
      emitter.on('test', handler2);

      expect(emitter.emit('test', 'value')).toBe(2);
      expect(handler1).toHaveBeenCalledWith('value');
      expect(handler2).toHaveBeenCalledWith('value');
    });

    test('should handle different event types', () => {
      const testHandler = mock(() => {});
      const dataHandler = mock(() => {});

      emitter.on('test', testHandler);
      emitter.on('data', dataHandler);

      emitter.emit('test', 'test-value');
      emitter.emit('data', 42);

      expect(testHandler).toHaveBeenCalledWith('test-value');
      expect(dataHandler).toHaveBeenCalledWith(42);
    });
  });

  describe('off method', () => {
    test('should remove specific event listener', () => {
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      emitter.on('test', handler1);
      emitter.on('test', handler2);

      expect(emitter.emit('test', 'value')).toBe(2);

      emitter.off('test', handler1);
      expect(emitter.emit('test', 'value')).toBe(1);
      expect(handler2).toHaveBeenCalledTimes(2);
    });

    test('should return this for chaining', () => {
      const handler = mock(() => {});
      emitter.on('test', handler);

      const result = emitter.off('test', handler);
      expect(result).toBe(emitter);
    });

    test('should handle removing non-existent listener', () => {
      const handler = mock(() => {});

      // Should not throw when removing non-existent listener
      expect(() => emitter.off('test', handler)).not.toThrow();
    });

    test('should handle removing from non-existent event type', () => {
      const handler = mock(() => {});

      // Should not throw when removing from non-existent event type
      expect(() => emitter.off('nonexistent' as any, handler)).not.toThrow();
    });
  });

  describe('once method', () => {
    test('should add one-time event listener', () => {
      let callCount = 0;
      let lastValue = '';
      const handler = mock((value: string) => {
        callCount++;
        lastValue = value;
      });

      emitter.once('test', handler);

      // emit returns 0 because once listener removes itself during execution
      expect(emitter.emit('test', 'first')).toBe(0);
      expect(callCount).toBe(1);
      expect(lastValue).toBe('first');

      expect(emitter.emit('test', 'second')).toBe(0);
      expect(callCount).toBe(1); // Should still be 1
    });

    test('should return this for chaining', () => {
      const handler = mock(() => {});
      const result = emitter.once('test', handler);
      expect(result).toBe(emitter);
    });

    test('should work alongside regular listeners', () => {
      let onceCallCount = 0;
      let regularCallCount = 0;

      const onceHandler = mock(() => {
        onceCallCount++;
      });
      const regularHandler = mock(() => {
        regularCallCount++;
      });

      emitter.once('test', onceHandler);
      emitter.on('test', regularHandler);

      // emit returns 1 because regular listener remains after once listener removes itself
      expect(emitter.emit('test', 'first')).toBe(1);
      expect(onceCallCount).toBe(1);
      expect(regularCallCount).toBe(1);

      expect(emitter.emit('test', 'second')).toBe(1);
      expect(onceCallCount).toBe(1); // Should still be 1
      expect(regularCallCount).toBe(2);
    });

    test('should handle errors in once listener without breaking removal', () => {
      let errorCallCount = 0;
      let normalCallCount = 0;

      const errorHandler = mock(() => {
        errorCallCount++;
        throw new Error('Test error');
      });
      const normalHandler = mock(() => {
        normalCallCount++;
      });

      emitter.once('test', errorHandler);
      emitter.on('test', normalHandler);

      expect(() => emitter.emit('test', 'value')).toThrow('Test error');
      expect(errorCallCount).toBe(1);
      // normalHandler is not called because error in once listener stops execution
      expect(normalCallCount).toBe(0);

      // The once listener should still be removed despite the error
      expect(emitter.emit('test', 'second')).toBe(1);
      expect(errorCallCount).toBe(1); // Should still be 1
      expect(normalCallCount).toBe(1); // Now called on second emit
    });
  });

  describe('emit method', () => {
    test('should return number of listeners called', () => {
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      expect(emitter.emit('test', 'value')).toBe(0);

      emitter.on('test', handler1);
      expect(emitter.emit('test', 'value')).toBe(1);

      emitter.on('test', handler2);
      expect(emitter.emit('test', 'value')).toBe(2);
    });

    test('should pass event data to all listeners', () => {
      const handler1 = mock(() => {});
      const handler2 = mock(() => {});

      emitter.on('test', handler1);
      emitter.on('test', handler2);

      emitter.emit('test', 'test-data');

      expect(handler1).toHaveBeenCalledWith('test-data');
      expect(handler2).toHaveBeenCalledWith('test-data');
    });

    test('should return 0 for non-existent event type', () => {
      expect(emitter.emit('nonexistent' as any, 'value')).toBe(0);
    });

    test('should handle listeners that throw errors', () => {
      let errorCallCount = 0;
      let normalCallCount = 0;

      const errorHandler = mock(() => {
        errorCallCount++;
        throw new Error('Handler error');
      });
      const normalHandler = mock(() => {
        normalCallCount++;
      });

      emitter.on('test', errorHandler);
      emitter.on('test', normalHandler);

      expect(() => emitter.emit('test', 'value')).toThrow('Handler error');
      // The error handler was called first and threw, stopping execution before normal handler
      expect(errorCallCount).toBe(1);
      expect(normalCallCount).toBe(0);
    });
  });

  describe('Symbol.dispose', () => {
    test('should emit cleanup event when disposed', () => {
      const cleanupHandler = mock(() => {});
      emitter.on('cleanup', cleanupHandler);

      emitter[Symbol.dispose]();

      expect(cleanupHandler).toHaveBeenCalledWith(null);
    });

    test('should work with using declaration', () => {
      const cleanupHandler = mock(() => {});

      {
        using disposableEmitter = new EventEmitter<{ test: string }>();
        disposableEmitter.on('cleanup', cleanupHandler);
        // Emitter should be automatically disposed at end of scope
      }

      expect(cleanupHandler).toHaveBeenCalledWith(null);
    });

    test('should be callable multiple times', () => {
      const cleanupHandler = mock(() => {});
      emitter.on('cleanup', cleanupHandler);

      emitter[Symbol.dispose]();
      emitter[Symbol.dispose]();

      expect(cleanupHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('integration tests', () => {
    test('should support method chaining', () => {
      let handler1CallCount = 0;
      let handler2CallCount = 0;
      let handler3CallCount = 0;

      const handler1 = mock(() => {
        handler1CallCount++;
      });
      const handler2 = mock(() => {
        handler2CallCount++;
      });
      const handler3 = mock(() => {
        handler3CallCount++;
      });

      const result = emitter
        .on('test', handler1)
        .on('data', handler2)
        .once('test', handler3)
        .off('data', handler2);

      expect(result).toBe(emitter);

      // emit returns 1 because handler1 remains after handler3 (once) removes itself
      expect(emitter.emit('test', 'value')).toBe(1);
      expect(emitter.emit('data', 42)).toBe(0); // handler2 was removed
      expect(handler1CallCount).toBe(1);
      expect(handler3CallCount).toBe(1);
      expect(handler2CallCount).toBe(0);
    });

    test('should handle complex event flow', () => {
      let testCallCount = 0;
      let onceCallCount = 0;
      let cleanupCallCount = 0;

      const testHandler = mock(() => {
        testCallCount++;
      });
      const onceHandler = mock(() => {
        onceCallCount++;
      });
      const cleanupHandler = mock(() => {
        cleanupCallCount++;
      });

      emitter
        .on('test', testHandler)
        .once('test', onceHandler)
        .on('cleanup', cleanupHandler);

      // First emit returns 1 because testHandler remains after onceHandler removes itself
      expect(emitter.emit('test', 'first')).toBe(1);
      expect(testCallCount).toBe(1);
      expect(onceCallCount).toBe(1);

      // Second emit (once handler should be gone)
      expect(emitter.emit('test', 'second')).toBe(1);
      expect(testCallCount).toBe(2);
      expect(onceCallCount).toBe(1); // Should still be 1

      // Dispose
      emitter[Symbol.dispose]();
      expect(cleanupCallCount).toBe(1);
    });
  });
});
