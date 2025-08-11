import type { LooseObject, ReactiveSymbol } from '../types';

type Effect = () => void;
type Agent<T extends LooseObject> = {
  [K in keyof T]?: { value: T[K]; effects: Set<Effect> };
};

let currentEffect: Effect | null = null;
const pendingEffects = new Set<Effect>();
const track = <T extends LooseObject>(agent: Agent<T>, raw: T, key: keyof T) =>
  currentEffect &&
  (agent[key] ??= {
    get value() {
      return raw[key];
    },
    effects: new Set(),
  }).effects.add(currentEffect);
const trigger = <T extends LooseObject>(agent: Agent<T>, key: keyof T) => {
  for (const effect of agent[key]?.effects ?? [])
    if (currentEffect !== effect) {
      // Avoid repeated calls to the same effect
      if (pendingEffects.size === 0)
        window.queueMicrotask(() => {
          for (const effect of pendingEffects) effect();
          pendingEffects.clear();
        });
      pendingEffects.add(effect);
    }
};

export type Reactive<T extends {}> = T extends any
  ? T & { [K in typeof ReactiveSymbol]: 'Symbol:Reactive' }
  : never;
export const reactive = <T extends LooseObject>(raw: T) => {
  const agent: Agent<T> = {};
  return new Proxy(agent as unknown as Reactive<T>, {
    get(_, key: string) {
      track(agent, raw, key);
      return Reflect.get(raw, key);
    },
    set(_, key: string, value) {
      if (Reflect.get(raw, key) !== value) {
        const r = Reflect.set(raw, key, value);
        trigger(agent, key);
        return r;
      }
      return true;
    },
    deleteProperty(_, key: string) {
      const r = Reflect.deleteProperty(raw, key);
      r && trigger(agent, key);
      return r;
    },
    ownKeys(_) {
      return Reflect.ownKeys(raw);
    },
    getOwnPropertyDescriptor(_, key) {
      return Reflect.getOwnPropertyDescriptor(raw, key);
    },
  });
};
export const effect = (fn: Effect) => {
  currentEffect = fn;
  try {
    fn();
  } finally {
    currentEffect = null;
  }
};
