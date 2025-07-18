import { hasOwn, pipe } from './util';

export const noop = (v: any) => v;
export class Value<T, U extends string> {
  static readonly units: Record<string, number> = {};
  static readonly converters: ((v: any) => any)[][] = [];
  static define<T, const U extends string[]>(
    unitTypes: U,
    converters: ((v: T) => T)[][],
    /** Just for type inference */
    value: T,
  ) {
    return class extends this<T, U[number]> {
      static readonly units = unitTypes.reduce(
        (acc, e, i) => ({ ...acc, [e]: i }),
        {},
      ) as Record<U[number], number>;
      static readonly converters = converters;
    };
  }
  static from<T extends typeof Value<any, string>>(
    this: T,
    ...e: ConstructorParameters<T>
  ) {
    //@ts-ignore
    return new this(...e) as InstanceType<T>;
  }
  #cls = this.constructor as typeof Value<T, U>;
  constructor(
    public value: T,
    public unit: U,
    public index = this.#checkUnit(unit),
  ) {}
  #checkUnit(unit: U) {
    if (!hasOwn(this.#cls.units, unit)) {
      throw new Error(`Unknown ${this.#cls.name} unit: ${unit}`);
    }
    return this.#cls.units[unit];
  }
  to(unit: U) {
    const index = this.#checkUnit(unit);
    const value = this.#cls.converters[this.index]?.[index]?.call(
      this,
      this.value,
    );
    if (typeof value === 'undefined') {
      throw new Error(
        `Cannot convert ${this.#cls.name} from ${this.unit} to ${unit}`,
      );
    }
    return new this.#cls(value, unit, index) as this;
  }
}

/**
 * @example
 *   Length.from(1, 'deg').to('px');
 */
export class Length extends Value.define(
  ['px', 'deg', 'cm'],
  [
    [noop, (v) => v, (v) => v],
    [(v) => v, noop, (v) => v],
    [(v) => v, (v) => v, noop],
  ],
  0,
) {}
function setup(p: {
  distance: number;
  'px/cm': number;
}): typeof Length.converters {
  const px2cm = (v: number) => v / p['px/cm'];
  const cm2deg = (v: number) => 2 * Math.atan(v / 2 / p.distance);
  const deg2cm = (v: number) => Math.tan(v / 2) * p.distance * 2;
  const cm2px = (v: number) => v * p['px/cm'];
  return [
    [noop, pipe(px2cm, cm2deg), px2cm],
    [pipe(deg2cm, cm2px), noop, deg2cm],
    [cm2px, cm2deg, noop],
  ];
}
export class Color extends Value.define(
  ['hex', 'rgb', 'rgb255', 'srgb'],
  [
    [noop, (v) => v, (v) => v, (v) => v],
    [(v) => v, noop, (v) => v, (v) => v],
    [(v) => v, (v) => v, noop, (v) => v],
    [(v) => v, (v) => v, (v) => v, noop],
  ],
  '#000000',
) {}
Length.from(1, 'deg').to('px');
