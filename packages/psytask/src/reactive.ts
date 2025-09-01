import type { LooseObject } from '../types';
import { hasOwn } from './util';

type Effect = () => void;
type Reactable = Record<string | symbol, any>;
type EffectMap<T extends Reactable> = { [K in keyof T]?: Set<Effect> };

let currentEffect: Effect | null = null;
const pendingEffects = new Set<Effect>();

/** @ignore Internal Function to clear pending effects for testing */
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
/** @ignore Internal Reactive function for testing purposes */
export const _reactive = <T extends LooseObject>(raw: T) => {
  const map: EffectMap<T> = {};
  const proxy = new Proxy(raw, {
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
 * @example Basic usage
 *
 * ```ts
 * const state = reactive({ count: 0 });
 * effect(() => {
 *   console.log('Count:', state.count);
 * });
 * state.count++;
 * ```
 *
 * @example Only top-level properties are reactive
 *
 * ```ts
 * // array
 * const array = reactive({ items: [1, 2, 3] });
 * array.items.push(4); // ❌ NOT reactive
 * array.items = [...array.items, 4]; // ✔️ Reactive
 *
 * // object
 * const object = reactive({ user: { name: 'John' } });
 * object.user.name = 'Bob'; // ❌ NOT reactive
 * object.user = { name: 'Jane' }; // ✔️ Reactive
 * ```
 *
 * @example Track and trigger
 *
 * ```ts
 * const state = reactive({});
 * // track
 * effect(() => {
 *   state.a; // ✔️ get property
 *   'a' in state; // ✔️ has property
 *   Object.keys(state); // ✔️ iterate properties
 * });
 * // trigger
 * state.a = 0; // ✔️ add or set property
 * delete state.a; // ✔️ delete property
 * ```
 *
 * @example Not support destructuring assignment out of effect scope
 *
 * ```ts
 * const state = reactive({ a: 1, b: 2 });
 * const { a } = state; // ❌
 * effect(() => {
 *   const { b } = state; // ✔️
 * });
 * ```
 *
 * @param raw - The object to make reactive
 * @returns Reactive proxy of the input object
 * @see {@link effect}
 * ```
 */
export const reactive = <T extends LooseObject>(raw: T) => _reactive(raw).proxy;
/**
 * Create and immediately execute an effect function that tracks reactive
 * dependencies
 *
 * When the effect function runs, any reactive properties it accesses will be
 * tracked. If those properties change later, the effect will be re-executed
 * automatically in the next microtask.
 *
 * @remarks
 * Effects are executed asynchronously when triggered to avoid immediate
 * re-execution and to batch multiple changes together.
 * @example Basic reactive effect
 *
 * ```ts
 * const state = reactive({ name: 'John' });
 * effect(() => {
 *   console.log('Hello,', state.name); // Immediately logs: "Hello, John"
 * });
 * state.name = 'Jane'; // Effect will run in next microtask, not immediately
 * ```
 *
 * @example Computed properties
 *
 * ```ts
 * const state = reactive({ count: 0, doubled: 0 });
 * effect(() => {
 *   state.doubled = state.count * 2;
 * });
 * state.count = 5;
 * console.log(state.doubled); // Still 0 - effect hasn't run yet
 * await 0; // Wait for microtask
 * console.log(state.doubled); // Now 10 - effect has run
 * ```
 *
 * @example Batched updates
 *
 * ```ts
 * const state = reactive({ a: 1, b: 2, sum: 0 });
 * effect(() => {
 *   state.sum = state.a + state.b;
 *   console.log('Sum updated:', state.sum);
 * });
 * // Multiple synchronous changes are batched, effect runs only once in next microtask, not twice
 * state.a = 10;
 * state.b = 20;
 * ```
 *
 * @param fn - The effect function to execute. Should contain reactive property
 *   access.
 * @see {@link reactive}
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
