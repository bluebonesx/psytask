import type { LooseObject } from 'shared/types';

const symbol: typeof Symbol.dispose =
  Symbol.dispose ?? Symbol.for('Symbol.dispose');
type EventMap<T extends LooseObject> = T & { dispose: undefined };

/** {@link Disposable} event emitter, use {@link Set} to manage listeners */
export class EventEmitter<T extends LooseObject & { dispose?: never } = {}>
  implements Disposable
{
  readonly listeners: {
    [K in keyof EventMap<T>]?: Set<(e: EventMap<T>[K]) => void>;
  } = {};
  [symbol]() {
    this.emit('dispose');
  }
  /** Add event listener */
  on<K extends keyof EventMap<T>>(
    type: K,
    listener: (evt: EventMap<T>[K]) => void,
  ) {
    (this.listeners[type] ??= new Set<typeof listener>()).add(listener);
    return this;
  }
  /** Remove event listener */
  off<K extends keyof EventMap<T>>(
    type: K,
    listener: (evt: EventMap<T>[K]) => void,
  ) {
    const listeners = this.listeners[type];
    if (listeners) {
      listeners.delete(listener);
      listeners.size === 0 && delete this.listeners[type];
    }
    return this;
  }
  /** Add one-time event listener, can not be removed manually */
  once<K extends keyof EventMap<T>>(
    type: K,
    listener: (evt: EventMap<T>[K]) => void,
  ) {
    const wrapper: typeof listener = (evt) => {
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
  emit<K extends keyof EventMap<T>>(
    type: K,
    ...[evt]: EventMap<T>[K] extends undefined
      ? [evt?: EventMap<T>[K]]
      : [evt: EventMap<T>[K]]
  ) {
    const listeners = this.listeners[type];
    if (listeners) for (const listener of [...listeners]) listener(evt!);
    return this;
  }
}
