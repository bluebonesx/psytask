import { clamp, extend } from 'shared/utils';
import type { LooseObject } from '../types';

const IterableIterator_prototype = {
  [Symbol.iterator]() {
    return this;
  },
};
/** Create iterable builder. it is usually used to generate trials for tasks. */
export const createIterableBuilder =
  <T extends LooseObject, V, D extends unknown[] | void, R>(
    gen: (options: T) => Generator<V, D, R>,
  ) =>
  (options: T) => {
    let _response: R, _data: D;
    const generator = gen(options);
    return extend(
      IterableIterator_prototype as IterableIterator<V, never, void>,
      {
        next() {
          if (_data) throw new Error('Iterator already done');
          const r = generator.next(_response);
          r.done && (_data = r.value);
          return r;
        },
        response(response: R) {
          _response = response;
        },
        get data(): D {
          if (!_data) throw new Error('Iterator not done yet');
          return _data;
        },
      },
    );
  };

/**
 * @example
 *
 * ```ts
 * for (const value of RandomSampling({
 *   candidates: [1, 2, 3],
 *   sample: 5,
 *   replace: true,
 * })) {
 *   console.log(value);
 * }
 * ```
 */
export const RandomSampling = createIterableBuilder(function* <const T>({
  candidates,
  sample = candidates.length,
  replace = true,
}: {
  /** Anything to be sampled */
  candidates: T[];
  /** Size of samples @default candidates.length */
  sample?: number;
  /** With or without replacement @default true */
  replace?: boolean;
}) {
  candidates = [...candidates];

  // input validation
  const len = candidates.length;
  if (!replace && sample > len) {
    sample = len;
    console.warn(`Sample size should be <= ${len} without replacement`);
  }

  // sample
  while (candidates.length && sample--) {
    const idx = Math.floor(Math.random() * candidates.length);
    if (!replace) candidates.splice(idx, 1);
    yield candidates[idx] as T;
  }
});
/**
 * It will use 1-down-1-up before the first reversal.
 *
 * @example
 *
 * ```ts
 * const staircase = StairCase({
 *   start: 0,
 *   step: 1,
 *   down: 3,
 *   up: 1,
 *   reversal: 3,
 *   min: 0,
 *   max: 3,
 * });
 * for (const value of staircase) {
 *   console.log(value);
 *   // set current trial response to calculate next value
 *   staircase.response(true);
 * }
 * // get data after iteration
 * const threshold = staircase.data
 *   .filter((e) => e.reversal)
 *   .reduce((acc, e, arr) => acc + e.value / arr.length, 0);
 * ```
 */
export const StairCase = createIterableBuilder(function* ({
  start,
  step,
  down,
  up,
  reversal,
  max = Infinity,
  min = -Infinity,
}: {
  /** Start value */
  start: number;
  /** Step size */
  step: number;
  /** Number of same trials before going down */
  down: number;
  /** Number of same trials before going up */
  up: number;
  /** Number of reversals */
  reversal: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
}) {
  const data: { value: number; response: boolean; reversal: boolean }[] = [];

  while (true) {
    const trial_num = data.length;
    let value: number;

    // first trial
    if (!trial_num) {
      value = start;
      const response: boolean = yield value;
      data.push({ value, response, reversal: false });
      continue;
    }

    // exit if reach reversal limit
    const current_reversal_num = data.filter((e) => e.reversal).length;
    if (current_reversal_num >= reversal) break;

    // calculate next value based on previous responses
    const prev = data.at(-1)!;
    const prev_value = prev.value;
    value = prev_value;

    // before first reversal
    if (!current_reversal_num) {
      value += prev.response ? -step : step;
    } else {
      if (
        trial_num >= down &&
        data
          .slice(-down)
          .every((e) => e.value === prev_value && e.response === true)
      )
        value -= step;
      if (
        trial_num >= up &&
        data
          .slice(-up)
          .every((e) => e.value === prev_value && e.response === false)
      )
        value += step;
    }

    // clamp value
    value = clamp(value, min, max);

    const response: boolean = yield value;
    data.push({ value, response, reversal: prev.response !== response });
  }

  return data;
});
