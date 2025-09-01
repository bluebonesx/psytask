import type { LooseObject } from '../types';

/** One-time trial iterator is used to generate trials for tasks. */
export abstract class TrialIterator<T> implements IterableIterator<T, void> {
  #isDone = false;
  #isUsed = false;
  constructor(public readonly options: LooseObject) {}

  [Symbol.iterator]() {
    if (this.#isUsed) {
      throw new Error(
        'Please create a new trial iterator, it can only be used once.',
      );
    }
    return this;
  }
  /**
   * Calculate the next value
   *
   * @returns Next value or `undefined` if the iterator is done
   */
  abstract nextValue(): T | void;
  next(): IteratorResult<T, void> {
    if (this.#isDone) {
      throw new Error('Unexpected call to next() after the iterator is done');
    }
    this.#isUsed = true;

    const value = this.nextValue();
    if (typeof value === 'undefined') {
      this.#isDone = true;
      return { value: void 0, done: true };
    }
    return { value, done: false };
  }
}
/**
 * Responsive trial iterator is used to generate trials that depend on previous
 * responses.
 */
export abstract class ResponsiveTrialIterator<T, R> extends TrialIterator<T> {
  /** Set response for current trial */
  abstract response(value: R): void;
}

// built-in classes
/**
 * @example With replace
 *
 * ```ts
 * for (const value of new RandomSampling({
 *   candidates: [1, 2, 3],
 *   sampleSize: 5,
 *   replace: true,
 * })) {
 *   console.log(value);
 * }
 * ```
 *
 * @example Without replace
 *
 * ```ts
 * for (const value of new RandomSampling({
 *   candidates: [1, 2, 3],
 *   sampleSize: 2,
 *   replace: false,
 * })) {
 *   console.log(value);
 * }
 * ```
 */
export class RandomSampling<T> extends TrialIterator<T> {
  #count = 0;
  declare options: { candidates: T[]; sampleSize: number; replace: boolean };
  constructor(options: {
    /** Something to be sampled */
    candidates: T[];
    /** Number of generated samples @default candidates.length */
    sampleSize?: number;
    /** With or without replacement @default true */
    replace?: boolean;
  }) {
    super({
      candidates: [...options.candidates],
      sampleSize: options.sampleSize ?? options.candidates.length,
      replace: options.replace ?? true,
    });

    // input validation
    if (this.options.candidates.length === 0) {
      console.warn(
        'No candidates provided, iterator will not yield any values',
      );
      return;
    }
    if (
      !this.options.replace &&
      this.options.sampleSize > this.options.candidates.length
    ) {
      this.options.sampleSize = this.options.candidates.length;
      console.warn(
        'Sample size should be <= the number of candidates when not replacing',
      );
    }
  }
  nextValue() {
    if (this.options.candidates.length === 0) return;
    if (this.#count >= this.options.sampleSize) return;
    this.#count++;

    // sample
    const idx = Math.floor(Math.random() * this.options.candidates.length);
    const target = this.options.candidates[idx];
    if (!this.options.replace) {
      this.options.candidates.splice(idx, 1);
    }
    return target;
  }
}
/**
 * It will use 1-down-1-up before first reversal.
 *
 * @example
 *
 * ```ts
 * const staircase = new StairCase({
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
 *   staircase.response(true); // set current trial response to calculate next value
 * }
 * ```
 */
export class StairCase extends ResponsiveTrialIterator<number, boolean> {
  data: { value: number; response: boolean; isReversal: boolean }[] = [];
  constructor(
    override options: {
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
    },
  ) {
    super(options);
  }
  nextValue() {
    /** Number of trials */
    const n = this.data.length;

    // first trial
    if (n === 0) {
      const value = this.options.start;
      this.data.push({ value, response: false, isReversal: false });
      return value;
    }

    // reach reversal limit
    const nReversals = this.data.filter((e) => e.isReversal).length;
    if (nReversals >= this.options.reversal) {
      return;
    }

    // calculate next value based on previous responses
    const { step, down, up, max, min } = this.options;
    const prev = this.data.at(-1)!;
    let value = prev.value;

    // if before first reversal
    if (nReversals === 0) {
      value += prev.response ? -step : step;
    } else {
      if (
        n >= down &&
        this.data
          .slice(-down)
          .every((e) => e.value === prev.value && e.response === true)
      ) {
        value -= step;
      }
      if (
        n >= up &&
        this.data
          .slice(-up)
          .every((e) => e.value === prev.value && e.response === false)
      ) {
        value += step;
      }
    }

    // clamp value
    if (typeof min === 'number' && value < min) value = min;
    if (typeof max === 'number' && value > max) value = max;

    this.data.push({ value, response: false, isReversal: false });
    return value;
  }
  response(value: boolean) {
    if (this.data.length === 0) {
      console.warn('Please iterate first to get a value');
      return;
    }
    const curr = this.data.at(-1)!;
    curr.response = value;

    // set reversal
    if (this.data.length > 1) {
      const prev = this.data.at(-2)!;
      if (value !== prev.response) {
        curr.isReversal = true;
      }
    }
  }
  /**
   * Calculate the threshold based on reversals
   *
   * @param reversalCount Number of reversals to consider
   */
  getThreshold(reversalCount = this.options.reversal) {
    const allReversalTrials = this.data.filter((e) => e.isReversal);
    const actualReversalCount = allReversalTrials.length;
    if (actualReversalCount < reversalCount) {
      console.warn(
        `Not enough reversals, only ${actualReversalCount} found, but requested ${reversalCount}`,
      );
    }
    const validReversalTrials = allReversalTrials.slice(-reversalCount);
    const mean =
      validReversalTrials.reduce((acc, e) => acc + e.value, 0) /
      validReversalTrials.length;
    return mean;
  }
}
