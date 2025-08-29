import type { LooseObject } from '../types';
import { hasOwn } from './util';

type Effect = () => void;
type Reactable = Record<string | symbol, any>;
type EffectMap<T extends Reactable> = { [K in keyof T]?: Set<Effect> };

let currentEffect: Effect | null = null;
const pendingEffects = new Set<Effect>();

/** Internal function to clear pending effects for testing */
export const _clearPendingEffects = () => {
  pendingEffects.clear();
  currentEffect = null;
};

const track = <T extends Reactable>(
  map: EffectMap<T>,
  key: keyof T | symbol,
) => {
  if (currentEffect) (map[key] ??= new Set()).add(currentEffect);
};
const trigger = <T extends Reactable>(
  map: EffectMap<T>,
  key: keyof T | symbol,
) => {
  const effects = map[key];
  if (!effects || effects.size === 0) return;
  for (const effect of effects)
    if (currentEffect !== effect) {
      // Avoid repeated calls to the same effect
      if (pendingEffects.size === 0)
        globalThis.queueMicrotask(() => {
          for (const effect of pendingEffects) {
            try {
              effect();
            } catch (error) {
              // Log error but don't stop other effects
              console.error('Error in reactive effect:', error);
            }
          }
          pendingEffects.clear();
        });
      pendingEffects.add(effect);
    }
};

const ITER_KEY = Symbol('Object.iterator');
const ReactiveSymbol = Symbol('Reactive');
export type Reactive<T extends {}> = T extends any
  ? T & { [ReactiveSymbol]: never }
  : never;

/** Use for test */
export const _reactive = <T extends LooseObject>(raw: T) => {
  const map: EffectMap<T> = {};
  const proxy = new Proxy(raw as Reactive<T>, {
    //@ts-ignore
    _effectMap: map,

    // track
    get(o, k, receiver) {
      track(map, k);
      return Reflect.get(o, k, receiver);
    },
    has(o, k) {
      track(map, k);
      return Reflect.has(o, k);
    },
    ownKeys(o) {
      track(map, ITER_KEY);
      return Reflect.ownKeys(o);
    },

    // trigger
    set(o, k, v, receiver) {
      if (Object.is(o[k as string], v)) return true;
      const r = Reflect.set(o, k, v, receiver);
      trigger(map, k);
      trigger(map, ITER_KEY);
      return r;
    },
    deleteProperty(o, k) {
      const hasKey = hasOwn(o, k);
      const r = Reflect.deleteProperty(o, k);
      if (r && hasKey) {
        trigger(map, k);
        trigger(map, ITER_KEY);
      }
      return r;
    },
  });
  return { proxy, map };
};
/**
 * Creates a reactive proxy for an object that tracks property access and
 * modifications
 *
 * @example
 *   const state = reactive({ count: 0, name: 'Counter' });
 *   // Access properties normally
 *   console.log(state.count); // 0
 *   state.count = 1;
 *   console.log(state.count); // 1
 *
 * @example
 *   const state = reactive({ user: { name: 'John' } });
 *   // Only top-level properties are reactive
 *   state.user.name = 'Bob'; // ❌ NOT reactive
 *   state.user = { name: 'Jane' }; // ✅ Reactive
 *
 * @example
 *   const state = reactive({ items: [1, 2, 3] });
 *   state.items.push(4); // ❌ NOT reactive (array mutation)
 *   state.items = [...state.items, 4]; // ✅ Reactive (property assignment)
 */
export const reactive = <T extends LooseObject>(raw: T) => _reactive(raw).proxy;
/**
 * Creates and immediately executes an effect function that tracks reactive
 * dependencies
 *
 * When the effect function runs, any reactive properties it accesses will be
 * tracked. If those properties change later, the effect will be re-executed
 * automatically in the next microtask.
 *
 * @example
 *   const state = reactive({ name: 'John' });
 *   effect(() => {
 *     console.log('Hello,', state.name); // Immediately logs: "Hello, John"
 *   });
 *   state.name = 'Jane'; // Effect will run in next microtask, not immediately
 *
 * @example
 *   const state = reactive({ count: 0, doubled: 0 });
 *   effect(() => {
 *     state.doubled = state.count * 2;
 *   });
 *   state.count = 5;
 *   console.log(state.doubled); // Still 0 - effect hasn't run yet
 *   await 0; // Wait for microtask
 *   console.log(state.doubled); // Now 10 - effect has run
 *
 * @example
 *   const state = reactive({ a: 1, b: 2, sum: 0 });
 *   effect(() => {
 *     state.sum = state.a + state.b;
 *     console.log('Sum updated:', state.sum);
 *   });
 *   // Multiple synchronous changes are batched, effect runs only once in next microtask, not twice
 *   state.a = 10;
 *   state.b = 20;
 *
 * @param fn - The effect function to execute. Should contain reactive property
 *   access.
 * @note Effects are executed asynchronously when triggered to avoid immediate re-execution
 * and to batch multiple changes together.
 */
export const effect = (fn: Effect) => {
  if (process.env.NODE_ENV === 'development' && currentEffect) {
    throw new Error('Nested effects are not supported.');
  }
  currentEffect = fn;
  try {
    currentEffect();
  } finally {
    currentEffect = null;
  }
};
