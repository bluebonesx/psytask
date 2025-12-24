export const mean =
  /** @param {number[]} series */
  (series) => series.reduce((a, b) => a + b) / series.length;
export const dot =
  /**
   * @param {Float64Array} a
   * @param {Float64Array} b
   */
  (a, b) => a.reduce((acc, e, i) => acc + e * /** @type {number} */ (b[i]), 0);

export const IQR_filter =
  /** @param {number[]} series */
  (series, times = 1.5) => {
    const sorted = [...series].sort((a, b) => a - b);
    const Q1_idx = sorted.length / 4,
      Q1 = /** @type {number} */ (sorted[Math.floor(Q1_idx)]),
      Q3 = /** @type {number} */ (sorted[Math.floor(Q1_idx * 3)]),
      IQR = Q3 - Q1,
      lower = Q1 - times * IQR,
      upper = Q3 + times * IQR;
    const valid_series = series.filter((d) => lower <= d && d <= upper);
    // console.info('IQR_filter', { series, Q1, Q3, valid_series });
    return valid_series;
  };

/** Recursive Least Squares */
export const RLS = () => {};
