import type { LooseObject } from '../types';

const symbol: typeof Symbol.dispose =
  Symbol.dispose ?? Symbol.for('Symbol.dispose');

export class EventEmitter<
  M extends LooseObject & { dispose?: never },
  EventMap extends { dispose: null } = M & { dispose: null },
> implements Disposable
{
  protected listeners: {
    [K in keyof EventMap]?: Set<(e: EventMap[K]) => void>;
  } = {};
  [symbol]() {
    this.emit('dispose', null);
  }
  /** Add event listener */
  on<K extends keyof EventMap>(type: K, listener: (evt: EventMap[K]) => void) {
    (this.listeners[type] ??= new Set<any>()).add(listener);
    return this;
  }
  /** Remove event listener */
  off<K extends keyof EventMap>(type: K, listener: (evt: EventMap[K]) => void) {
    this.listeners[type]?.delete(listener);
    return this;
  }
  /** Add one-time event listener, can not be removed manually */
  once<K extends keyof EventMap>(
    type: K,
    listener: (evt: EventMap[K]) => void,
  ) {
    const wrapper = (evt: EventMap[K]) => {
      try {
        listener(evt);
      } finally {
        this.off(type, wrapper);
      }
    };
    this.on(type, wrapper);
    return this;
  }
  /** Emit event listeners */
  emit<K extends keyof EventMap>(type: K, e: EventMap[K]) {
    const listeners = this.listeners[type];
    if (listeners) for (const listener of listeners) listener(e);
    return this;
  }
}
