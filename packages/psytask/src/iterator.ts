import { clamp, ERR } from 'shared/utils';

/** Create iterable builder. it is usually used to generate trials for tasks. */
export const createIterableBuilder =
  <
    T extends unknown[],
    G extends Generator<unknown, unknown, never>,
    P extends unknown[] = G extends Generator<infer Val, infer Data, infer Res>
      ? [Val, Data, Res]
      : never,
  >(
    gen: (...e: T) => G,
  ) =>
  (...e: T) => {
    let _response: P[2],
      _data: P[1],
      _done = 0;
    const generator = gen(...e);
    return {
      [Symbol.iterator]: () => ({
        next(): IteratorResult<P[0], P[1]> {
          if (_done) ERR('Iterator already done');
          const r = generator.next(_response as never);
          r.done && ((_data = r.value), (_done = 1));
          return r;
        },
      }),
      response(response: typeof _response) {
        _response = response;
      },
      get data() {
        if (!_done) ERR('Iterator not done yet');
        return _data;
      },
    };
  };

/**
 * @example
 *
 * Basic usage
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
  candidates: readonly T[];
  /** Size of samples @default candidates.length */
  sample?: number;
  /** With or without replacement @default true */
  replace?: boolean;
}) {
  const cands = [...candidates];

  // input validation
  const len = cands.length;
  if (!replace && sample > len)
    ERR(`Sample size should be <= ${len} without replacement`);

  // sample
  while (cands.length && sample--) {
    const idx = Math.floor(Math.random() * cands.length);
    yield cands[idx] as T;
    if (!replace) cands.splice(idx, 1);
  }
});
/**
 * It will use 1-down-1-up before the first reversal.
 *
 * @example
 *
 * Basic usage
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
 *   .reduce((acc, e, i, arr) => acc + e.value / arr.length, 0);
 * ```
 */
export const StairCase = createIterableBuilder(function* ({
  start,
  step,
  down,
  up,
  reversals,
  trials = Infinity,
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
  reversals: number;
  /** Max number of trials */
  trials?: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
}) {
  const data: { value: number; response: boolean; reversal: boolean }[] = [];

  while (true) {
    const trial_num = data.length;

    // exit conditions
    const current_reversal_num = data.filter((e) => e.reversal).length;
    if (current_reversal_num >= reversals || trial_num >= trials) break;

    // determine next value
    let value: number;
    const prev = data[trial_num - 1];

    if (!prev)
      // first trial
      value = start;
    else {
      const prev_value = (value = prev.value);
      if (!current_reversal_num)
        // before first reversal: 1-up-1-down
        value += prev.response ? -step : step;
      else {
        if (
          trial_num >= down &&
          data.slice(-down).every((e) => e.value === prev_value && e.response)
        )
          value -= step;
        if (
          trial_num >= up &&
          data.slice(-up).every((e) => e.value === prev_value && !e.response)
        )
          value += step;
      }
    }

    // clamp value
    value = clamp(value, min, max);

    const response: boolean = yield value;
    typeof response !== 'boolean' &&
      ERR('StairCase iterator requires boolean response');
    data.push({
      value,
      response,
      reversal: (prev?.response ?? response) !== response,
    });
  }

  return data;
});
