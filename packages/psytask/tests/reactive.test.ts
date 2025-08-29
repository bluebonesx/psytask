import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import {
  reactive,
  effect,
  _reactive,
  _clearPendingEffects,
} from '../src/reactive';

describe('Reactive System', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    _clearPendingEffects();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    _clearPendingEffects();
  });

  describe('Basic Reactive Functionality', () => {
    test('should create reactive object', () => {
      const state = reactive({ count: 0 });
      expect(state.count).toBe(0);
    });

    test('should track property access and trigger effects', async () => {
      const state = reactive({ count: 0 });
      let effectCount = 0;
      let lastValue = 0;

      effect(() => {
        effectCount++;
        lastValue = state.count;
      });

      expect(effectCount).toBe(1);
      expect(lastValue).toBe(0);

      state.count = 42;
      await 0;

      expect(effectCount).toBe(2);
      expect(lastValue).toBe(42);
    });

    test('should support multiple reactive properties', async () => {
      const state = reactive({ a: 1, b: 2 });
      let aEffectCount = 0;
      let bEffectCount = 0;

      effect(() => {
        aEffectCount++;
        state.a;
      });

      effect(() => {
        bEffectCount++;
        state.b;
      });

      state.a = 10;
      await 0;

      expect(aEffectCount).toBe(2);
      expect(bEffectCount).toBe(1); // b effect not triggered

      state.b = 20;
      await 0;

      expect(aEffectCount).toBe(2); // a effect not triggered again
      expect(bEffectCount).toBe(2);
    });
  });

  describe('Proxy Handlers', () => {
    test('should track get operations', async () => {
      const state = reactive({ value: 'test' });
      let effectCalls = 0;

      effect(() => {
        effectCalls++;
        state.value; // get operation
      });

      state.value = 'changed';
      await 0;

      expect(effectCalls).toBe(2);
    });

    test('should track has operations', async () => {
      const state = reactive({ prop: 'exists' });
      let effectCalls = 0;

      effect(() => {
        effectCalls++;
        'prop' in state; // has operation
      });

      state.prop = 'modified';
      await 0;

      expect(effectCalls).toBe(2);
    });

    test('should track ownKeys operations', async () => {
      const state = reactive({ a: 1 });
      let effectCalls = 0;

      effect(() => {
        effectCalls++;
        Object.keys(state); // ownKeys operation
      });

      // Adding new property should trigger ownKeys tracking
      (state as any).b = 2;
      await 0;

      expect(effectCalls).toBe(2);
    });

    test('should handle deleteProperty correctly', async () => {
      const state = reactive({ a: 1, b: 2 }) as any;
      let effectCalls = 0;

      effect(() => {
        effectCalls++;
        'a' in state;
      });

      delete state.a;
      await 0;

      expect(effectCalls).toBe(2);
    });
  });

  describe('Object.is Comparison', () => {
    test('should not trigger for same values', async () => {
      const state = reactive({ value: 42 });
      let effectCalls = 0;

      effect(() => {
        effectCalls++;
        state.value;
      });

      state.value = 42; // Same value
      await 0;

      expect(effectCalls).toBe(1); // No additional trigger
    });

    test('should handle NaN correctly', async () => {
      const state = reactive({ value: NaN });
      let effectCalls = 0;

      effect(() => {
        effectCalls++;
        state.value;
      });

      state.value = NaN; // Object.is(NaN, NaN) is true
      await 0;
      expect(effectCalls).toBe(1);

      state.value = 42; // Different value
      await 0;
      expect(effectCalls).toBe(2);
    });

    test('should handle +0 and -0 correctly', async () => {
      const state = reactive({ value: -0 });
      let effectCalls = 0;

      effect(() => {
        effectCalls++;
        state.value;
      });

      state.value = +0; // Object.is(-0, +0) is false
      await 0;

      expect(effectCalls).toBe(2);
    });
  });

  describe('Effect Batching and Microtasks', () => {
    test('should batch multiple synchronous changes', async () => {
      const state = reactive({ count: 0 });
      let effectCalls = 0;

      effect(() => {
        effectCalls++;
        state.count;
      });

      // Multiple synchronous changes
      state.count = 1;
      state.count = 2;
      state.count = 3;

      await 0;

      expect(effectCalls).toBe(2); // Initial + one batched update
    });

    test('should handle concurrent modifications', async () => {
      const state = reactive({ count: 0 });
      let effectResults: number[] = [];

      effect(() => {
        effectResults.push(state.count);
      });

      state.count = 1;
      await 0;
      state.count = 2;
      await 0;
      state.count = 3;
      await 0;

      expect(effectResults[0]).toBe(0); // Initial value
      expect(effectResults[effectResults.length - 1]).toBe(3); // Final value
    });

    test('should deduplicate pending effects', async () => {
      const state = reactive({ value: 0 });
      let effectCalls = 0;

      const effectFn = () => {
        effectCalls++;
        state.value;
      };

      // Register the same effect multiple times
      effect(effectFn);

      // Multiple changes should only trigger once
      state.value = 1;
      state.value = 2;

      await 0;

      expect(effectCalls).toBe(2); // Initial + one batched update
    });
  });

  describe('Error Handling', () => {
    test('should handle errors in effects gracefully', async () => {
      const state = reactive({ count: 0 });
      let normalEffectCalls = 0;

      effect(() => {
        if (state.count > 0) {
          throw new Error('Test error');
        }
      });

      effect(() => {
        normalEffectCalls++;
        state.count;
      });

      state.count = 1;
      await 0;

      expect(normalEffectCalls).toBe(2); // Initial + after change
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test('should prevent nested effects', () => {
      // This test only applies in development mode
      if (process.env.NODE_ENV !== 'development') {
        return;
      }

      const state = reactive({ count: 0 });

      effect(() => {
        expect(() => {
          effect(() => {
            state.count;
          });
        }).toThrow('Nested effects are not supported.');
      });
    });

    test('should prevent infinite loops', async () => {
      const state = reactive({ count: 0 });
      let effectCalls = 0;

      effect(() => {
        effectCalls++;
        if (effectCalls < 5) {
          // This should not cause infinite loop due to currentEffect check
          state.count = effectCalls;
        }
      });

      await 0;

      expect(effectCalls).toBe(1); // Only initial execution
    });
  });

  describe('Memory Management', () => {
    test('should track effects in effect map', () => {
      const { proxy, map } = _reactive({ count: 0 });

      effect(() => {
        proxy.count;
      });

      expect(map.count).toBeDefined();
      expect(map.count!.size).toBe(1);
    });

    test('should accumulate effects without cleanup', () => {
      const { proxy, map } = _reactive({ count: 0 });

      // Create multiple effects
      for (let i = 0; i < 3; i++) {
        effect(() => {
          proxy.count;
        });
      }

      expect(map.count!.size).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    test('should handle array property changes', async () => {
      const state = reactive({ items: [1, 2, 3] });
      let effectCalls = 0;

      effect(() => {
        effectCalls++;
        state.items.length;
      });

      // Array mutation doesn't trigger reactivity
      state.items.push(4);
      await 0;
      expect(effectCalls).toBe(1);

      // Property assignment triggers reactivity
      state.items = [1, 2, 3, 4, 5];
      await 0;
      expect(effectCalls).toBe(2);
    });

    test('should handle non-existent properties', async () => {
      const state = reactive({ existing: 'value' }) as any;
      let effectCalls = 0;

      effect(() => {
        effectCalls++;
        state.nonExistent; // undefined
      });

      state.nonExistent = 'now exists';
      await 0;

      expect(effectCalls).toBe(2);
    });

    test('should handle type coercion in proxy', () => {
      const { proxy } = _reactive({ count: 0 });

      expect(typeof proxy.count).toBe('number');
      expect((proxy as any).nonExistent).toBeUndefined();

      (proxy as any).newProp = 'test';
      expect((proxy as any).newProp).toBe('test');
    });
  });
});
