import { describe, expect, it, spyOn } from 'bun:test';
import {
  RandomSampling,
  StairCase,
  TrialIterator,
  ResponsiveTrialIterator,
} from '../src/trial-iterator';

// Test implementation for abstract TrialIterator that can simulate inconsistent nextValue behavior
class UnreliableTrialIterator extends TrialIterator<string> {
  private callCount = 0;

  constructor() {
    super({});
  }

  nextValue(): string | void {
    this.callCount++;

    // Simulate unreliable behavior: sometimes returns value after returning undefined
    if (this.callCount === 1) return 'first';
    if (this.callCount === 2) return undefined; // This should trigger #isDone = true
    if (this.callCount === 3) return 'should-not-appear'; // This should be ignored due to #isDone
    return undefined;
  }
}

// Test implementation that returns values in a predictable pattern
class PredictableTrialIterator extends TrialIterator<number> {
  private count = 0;

  constructor(private maxCount: number) {
    super({ maxCount });
  }

  nextValue(): number | void {
    if (this.count < this.maxCount) {
      return ++this.count;
    }
    return undefined;
  }
}

describe('TrialIterator (abstract class behavior)', () => {
  describe('#isDone state management', () => {
    it('should throw error when calling next() after iterator is done', () => {
      const iterator = new UnreliableTrialIterator();

      // First call should return a value
      const first = iterator.next();
      expect(first.done).toBe(false);
      expect(first.value).toBe('first');

      // Second call returns undefined, should set #isDone = true
      const second = iterator.next();
      expect(second.done).toBe(true);
      expect(second.value).toBeUndefined();

      // Third call should throw error due to #isDone = true
      expect(() => {
        iterator.next();
      }).toThrow('Unexpected call to next() after the iterator is done');

      // Further calls should also throw
      expect(() => {
        iterator.next();
      }).toThrow('Unexpected call to next() after the iterator is done');
    });

    it('should prevent for...of from continuing after done', () => {
      const iterator = new PredictableTrialIterator(2);

      // Consume all values with for...of
      const values = [];
      for (const value of iterator) {
        values.push(value);
      }

      expect(values).toEqual([1, 2]);

      // Trying to manually call next() after for...of completion should throw
      expect(() => {
        iterator.next();
      }).toThrow('Unexpected call to next() after the iterator is done');
    });

    it('should work correctly with for...of loop despite unreliable nextValue', () => {
      const iterator = new UnreliableTrialIterator();
      const values: string[] = [];

      for (const value of iterator) {
        values.push(value);
      }

      // Should only get the first value, not the "should-not-appear" value
      expect(values).toEqual(['first']);

      // Manual next() call after for...of should throw
      expect(() => {
        iterator.next();
      }).toThrow('Unexpected call to next() after the iterator is done');
    });
  });
});

describe('RandomSampling', () => {
  describe('constructor', () => {
    it('should create an instance with default values', () => {
      const candidates = [1, 2, 3, 4, 5];
      const sampler = new RandomSampling({ candidates });
      expect(sampler).toBeInstanceOf(RandomSampling);
    });

    it('should handle sample size of 0', () => {
      const sampler = new RandomSampling({
        candidates: [1, 2, 3],
        sampleSize: 0,
        replace: false,
      });
      const results = Array.from(sampler);
      expect(results.length).toBe(0);
    });

    it('should handle negative sample size', () => {
      const sampler = new RandomSampling({
        candidates: [1, 2, 3],
        sampleSize: -1,
        replace: false,
      });
      const results = Array.from(sampler);
      expect(results.length).toBe(0);
    });

    it('should adjust sample size when greater than candidates length without replacement', () => {
      const consoleSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const sampler = new RandomSampling({
        candidates: [1, 2, 3],
        sampleSize: 5,
        replace: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Sample size should be <= the number of candidates when not replacing',
      );

      const results = Array.from(sampler);
      expect(results.length).toBe(3); // Adjusted to candidates length

      consoleSpy.mockRestore();
    });

    it('should allow sample size > candidates length with replacement', () => {
      expect(() => {
        new RandomSampling({
          candidates: [1, 2, 3],
          sampleSize: 5,
          replace: true,
        });
      }).not.toThrow();
    });

    it('should set default sampleSize to candidates length', () => {
      const candidates = [1, 2, 3, 4, 5];
      const sampler = new RandomSampling({ candidates });
      const results = Array.from(sampler);
      expect(results.length).toBe(candidates.length);
    });

    it('should set default replace to true', () => {
      const candidates = [1, 2, 3];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 10,
      });
      const results = Array.from(sampler);
      expect(results.length).toBe(10);
    });
  });

  describe('iteration with replacement', () => {
    it('should return correct number of samples', () => {
      const candidates = [1, 2, 3, 4, 5];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 3,
        replace: true,
      });
      const results = Array.from(sampler);
      expect(results.length).toBe(3);
    });

    it('should return values from candidates only', () => {
      const candidates = [10, 20, 30];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 5,
        replace: true,
      });
      const results = Array.from(sampler);
      results.forEach((result) => {
        expect(candidates).toContain(result);
      });
    });

    it('should allow more samples than candidates', () => {
      const candidates = [1, 2];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 10,
        replace: true,
      });
      const results = Array.from(sampler);
      expect(results.length).toBe(10);
    });
  });

  describe('iteration without replacement', () => {
    it('should return unique values when possible', () => {
      const candidates = [1, 2, 3, 4, 5];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 3,
        replace: false,
      });
      const results = Array.from(sampler);
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(3);
    });

    it('should exhaust all candidates when sampleSize equals candidates length', () => {
      const candidates = [1, 2, 3];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 3,
        replace: false,
      });
      const results = Array.from(sampler);
      expect(results.sort()).toEqual([1, 2, 3]);
    });

    it('should not modify original candidates array', () => {
      const candidates = [1, 2, 3, 4, 5];
      const originalCandidates = [...candidates];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 3,
        replace: false,
      });
      Array.from(sampler);
      expect(candidates).toEqual(originalCandidates);
    });
  });

  describe('edge cases', () => {
    it('should handle empty candidates array', () => {
      const sampler = new RandomSampling({
        candidates: [],
        sampleSize: 0,
        replace: false,
      });
      const results = Array.from(sampler);
      expect(results.length).toBe(0);
    });

    it('should handle single candidate', () => {
      const candidates = [42];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 1,
        replace: false,
      });
      const results = Array.from(sampler);
      expect(results).toEqual(candidates);
    });

    it('should be a one-time iterator (prevents accidental reuse)', () => {
      const candidates = [1, 2, 3];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 2,
        replace: false,
      });

      const results1 = Array.from(sampler);
      expect(results1.length).toBe(2); // First iteration works

      // Second iteration should throw an error
      expect(() => {
        Array.from(sampler);
      }).toThrow(
        'Please create a new trial iterator, it can only be used once.',
      );
    });

    it('should work with different data types', () => {
      const candidates = ['a', 'b', 'c'];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 2,
        replace: true,
      });
      const results = Array.from(sampler);
      expect(results.length).toBe(2);
      results.forEach((result) => {
        expect(candidates).toContain(result);
      });
    });
  });

  describe('iterator behavior', () => {
    it('should support manual iteration with next()', () => {
      const candidates = [1, 2, 3];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 2,
        replace: true,
      });

      const result1 = sampler.next();
      const result2 = sampler.next();
      const result3 = sampler.next();

      expect(result1.done).toBe(false);
      expect(result1.value).toBeDefined();
      expect(candidates).toContain(result1.value);

      expect(result2.done).toBe(false);
      expect(result2.value).toBeDefined();
      expect(candidates).toContain(result2.value);

      expect(result3.done).toBe(true);
      expect(result3.value).toBeUndefined();
    });

    it('should support for...of iteration', () => {
      const candidates = [1, 2, 3];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 2,
        replace: true,
      });

      const results: number[] = [];
      for (const value of sampler) {
        results.push(value);
      }

      expect(results.length).toBe(2);
      results.forEach((result) => {
        expect(candidates).toContain(result);
      });
    });

    it('should maintain internal state correctly', () => {
      const candidates = [1, 2, 3];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 2,
        replace: false,
      });

      // Manual iteration
      const first = sampler.next();
      expect(first.done).toBe(false);
      expect(candidates).toContain(first.value);

      // Continue manually
      const second = sampler.next();
      expect(second.done).toBe(false);
      expect(candidates).toContain(second.value);

      // Should be exhausted now
      const final = sampler.next();
      expect(final.done).toBe(true);
    });

    it('should handle zero sample size correctly', () => {
      const sampler = new RandomSampling({
        candidates: [1, 2, 3],
        sampleSize: 0,
        replace: true,
      });
      const results = Array.from(sampler);
      expect(results.length).toBe(0);
    });

    it('should prevent mixing of for...of and Array.from', () => {
      const candidates = [1, 2, 3];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 2,
        replace: true,
      });

      // Use for...of first
      const results1: number[] = [];
      for (const value of sampler) {
        results1.push(value);
      }
      expect(results1.length).toBe(2);

      // Trying to use Array.from should throw
      expect(() => {
        Array.from(sampler);
      }).toThrow(
        'Please create a new trial iterator, it can only be used once.',
      );
    });

    it('should prevent reuse after manual iteration', () => {
      const candidates = [1, 2, 3];
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 1,
        replace: true,
      });

      // Complete the iteration manually
      const first = sampler.next();
      expect(first.done).toBe(false);
      const second = sampler.next();
      expect(second.done).toBe(true);

      // Trying to get a new iterator should throw
      expect(() => {
        sampler[Symbol.iterator]();
      }).toThrow(
        'Please create a new trial iterator, it can only be used once.',
      );
    });
  });

  describe('randomness and distribution', () => {
    it('should eventually sample all candidates with replacement over many iterations', () => {
      const candidates = [1, 2, 3, 4, 5];
      const seenValues = new Set<number>();

      // Run multiple samplers to increase chance of seeing all values
      for (let i = 0; i < 20; i++) {
        const sampler = new RandomSampling({
          candidates,
          sampleSize: 3,
          replace: true,
        });

        for (const value of sampler) {
          seenValues.add(value);
        }
      }

      // We should see most (if not all) candidates eventually
      expect(seenValues.size).toBeGreaterThan(2);
    });

    it('should respect replacement setting in distribution', () => {
      const candidates = [1, 1, 1, 2]; // Biased towards 1
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 3,
        replace: false,
      });

      const results = Array.from(sampler);
      expect(results.length).toBe(3);

      // With no replacement, we should get at most 3 ones and 1 two
      const ones = results.filter((x) => x === 1).length;
      const twos = results.filter((x) => x === 2).length;

      expect(ones).toBeLessThanOrEqual(3);
      expect(twos).toBeLessThanOrEqual(1);
      expect(ones + twos).toBe(3);
    });
  });

  describe('performance and memory', () => {
    it('should handle large candidate arrays efficiently', () => {
      const candidates = Array.from({ length: 1000 }, (_, i) => i);
      const sampler = new RandomSampling({
        candidates,
        sampleSize: 100,
        replace: true,
      });

      const start = performance.now();
      const results = Array.from(sampler);
      const end = performance.now();

      expect(results.length).toBe(100);
      expect(end - start).toBeLessThan(100); // Should complete within 100ms
    });

    it('should not leak memory with original candidates array protection', () => {
      const originalCandidates = [1, 2, 3, 4, 5];
      const sampler = new RandomSampling({
        candidates: originalCandidates,
        sampleSize: 3,
        replace: false,
      });

      Array.from(sampler);

      // Original array should be unchanged
      expect(originalCandidates).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

describe('StairCase', () => {
  describe('constructor', () => {
    it('should create an instance with all required options', () => {
      const options = {
        start: 5,
        step: 1.5,
        down: 2,
        up: 1,
        reversal: 6,
        min: 0,
        max: 10,
      };

      const staircase = new StairCase(options);

      expect(staircase).toBeInstanceOf(StairCase);
      expect(staircase.data).toEqual([]);
      expect(staircase.options).toEqual(options);
    });

    it('should create an instance with minimum required options', () => {
      const options = {
        start: 10,
        step: 2,
        down: 3,
        up: 1,
        reversal: 4,
      };

      const staircase = new StairCase(options);

      expect(staircase).toBeInstanceOf(StairCase);
      expect(staircase.data).toEqual([]);
      expect(staircase.options.min).toBeUndefined();
      expect(staircase.options.max).toBeUndefined();
    });

    it('should handle negative start value', () => {
      const staircase = new StairCase({
        start: -10,
        step: 2,
        down: 1,
        up: 1,
        reversal: 2,
      });

      expect(staircase.options.start).toBe(-10);
    });

    it('should handle fractional step size', () => {
      const staircase = new StairCase({
        start: 10,
        step: 0.5,
        down: 2,
        up: 1,
        reversal: 4,
      });

      expect(staircase.options.step).toBe(0.5);
    });
  });

  describe('nextValue', () => {
    it('should return start value on first call', () => {
      const staircase = new StairCase({
        start: 10,
        step: 2,
        down: 3,
        up: 1,
        reversal: 4,
      });

      const value = staircase.nextValue();
      expect(value).toBe(10);
      expect(staircase.data.length).toBe(1);
      expect(staircase.data[0]).toEqual({
        value: 10,
        response: false,
        isReversal: false,
      });
    });

    it('should return undefined when required reversals are reached', () => {
      const staircase = new StairCase({
        start: 10,
        step: 1,
        down: 1,
        up: 1,
        reversal: 2,
      });

      // Create alternating pattern to reach reversals quickly
      staircase.nextValue(); // 10
      staircase.response(true); // correct -> next should be 9

      staircase.nextValue(); // 9
      staircase.response(false); // incorrect -> creates reversal, next should be 10

      staircase.nextValue(); // 10
      staircase.response(true); // correct -> creates reversal, next should be 9

      // Should have reached 2 reversals, so next call should return undefined
      const finalValue = staircase.nextValue();
      expect(finalValue).toBeUndefined();

      const reversals = staircase.data.filter((d) => d.isReversal);
      expect(reversals.length).toBe(2);
    });

    describe('before first reversal behavior', () => {
      it('should decrease value after correct response', () => {
        const staircase = new StairCase({
          start: 10,
          step: 2,
          down: 3,
          up: 1,
          reversal: 4,
        });

        staircase.nextValue(); // 10
        staircase.response(true); // correct response

        const nextValue = staircase.nextValue();
        expect(nextValue).toBe(8); // 10 - 2
      });

      it('should increase value after incorrect response', () => {
        const staircase = new StairCase({
          start: 10,
          step: 2,
          down: 3,
          up: 1,
          reversal: 4,
        });

        staircase.nextValue(); // 10
        staircase.response(false); // incorrect response

        const nextValue = staircase.nextValue();
        expect(nextValue).toBe(12); // 10 + 2
      });

      it('should work with negative values', () => {
        const staircase = new StairCase({
          start: -5,
          step: 1,
          down: 1,
          up: 1,
          reversal: 4,
        });

        staircase.nextValue(); // -5
        staircase.response(true); // correct response

        const nextValue = staircase.nextValue();
        expect(nextValue).toBe(-6); // -5 - 1

        staircase.response(false); // incorrect response
        const thirdValue = staircase.nextValue();
        expect(thirdValue).toBe(-5); // -6 + 1
      });
    });

    describe('after first reversal behavior', () => {
      it('should require consecutive correct responses on same value for down step', () => {
        const staircase = new StairCase({
          start: 10,
          step: 1,
          down: 3,
          up: 1,
          reversal: 10,
        });

        // Create first reversal
        staircase.nextValue(); // 10
        staircase.response(true); // correct -> next will be 9

        staircase.nextValue(); // 9
        staircase.response(false); // incorrect -> creates reversal, next will be 10

        staircase.nextValue(); // 10 (back to same value)
        staircase.response(true); // correct #1 on value 10

        staircase.nextValue(); // should stay 10 (need 3 consecutive correct)
        expect(staircase.data[staircase.data.length - 1]?.value).toBe(10);
        staircase.response(true); // correct #2 on value 10

        staircase.nextValue(); // should stay 10 (need 3 consecutive correct)
        expect(staircase.data[staircase.data.length - 1]?.value).toBe(10);
        staircase.response(true); // correct #3 on value 10

        const nextValue = staircase.nextValue(); // now should decrease
        expect(nextValue).toBe(9); // 10 - 1
      });

      it('should require consecutive incorrect responses on same value for up step', () => {
        const staircase = new StairCase({
          start: 10,
          step: 1,
          down: 1,
          up: 2,
          reversal: 10,
        });

        // Create first reversal
        staircase.nextValue(); // 10
        staircase.response(false); // incorrect -> next will be 11

        staircase.nextValue(); // 11
        staircase.response(true); // correct -> creates reversal, next will be 10

        staircase.nextValue(); // 10 (back to same value)
        staircase.response(false); // incorrect #1 on value 10

        staircase.nextValue(); // should stay 10 (need 2 consecutive incorrect)
        expect(staircase.data[staircase.data.length - 1]?.value).toBe(10);
        staircase.response(false); // incorrect #2 on value 10

        const nextValue = staircase.nextValue(); // now should increase
        expect(nextValue).toBe(11); // 10 + 1
      });

      it('should reset consecutive count when response changes', () => {
        const staircase = new StairCase({
          start: 10,
          step: 1,
          down: 3,
          up: 1,
          reversal: 10,
        });

        // Create first reversal
        staircase.nextValue(); // 10
        staircase.response(true);
        staircase.nextValue(); // 9
        staircase.response(false);

        staircase.nextValue(); // 10
        staircase.response(true); // correct #1

        staircase.nextValue(); // 10
        staircase.response(true); // correct #2

        staircase.nextValue(); // 10
        staircase.response(false); // incorrect - breaks consecutive sequence

        staircase.nextValue(); // 11 (increased due to incorrect)
        staircase.response(true); // correct #1 (restarting count)

        staircase.nextValue(); // should stay 11 (need 3 consecutive)
        expect(staircase.data[staircase.data.length - 1]?.value).toBe(11);
      });

      it('should work with negative values after reversals', () => {
        const staircase = new StairCase({
          start: -2,
          step: 1,
          down: 2,
          up: 1,
          reversal: 10,
        });

        // Create first reversal
        staircase.nextValue(); // -2
        staircase.response(true); // correct -> next will be -3

        staircase.nextValue(); // -3
        staircase.response(false); // incorrect -> creates reversal, next will be -2

        staircase.nextValue(); // -2
        staircase.response(true); // correct #1 on value -2

        staircase.nextValue(); // should stay -2 (need 2 consecutive)
        expect(staircase.data[staircase.data.length - 1]?.value).toBe(-2);
        staircase.response(true); // correct #2 on value -2

        const nextValue = staircase.nextValue(); // now should decrease
        expect(nextValue).toBe(-3); // -2 - 1
      });
    });

    describe('value clamping', () => {
      it('should clamp values to minimum', () => {
        const staircase = new StairCase({
          start: 1,
          step: 5,
          down: 1,
          up: 1,
          reversal: 10,
          min: 0,
        });

        staircase.nextValue(); // 1
        staircase.response(true); // correct -> would be -4, clamped to 0

        const nextValue = staircase.nextValue();
        expect(nextValue).toBe(0);
      });

      it('should clamp values to maximum', () => {
        const staircase = new StairCase({
          start: 18,
          step: 5,
          down: 1,
          up: 1,
          reversal: 10,
          max: 20,
        });

        staircase.nextValue(); // 18
        staircase.response(false); // incorrect -> would be 23, clamped to 20

        const nextValue = staircase.nextValue();
        expect(nextValue).toBe(20);
      });

      it('should handle negative min/max boundaries', () => {
        const staircase = new StairCase({
          start: -2,
          step: 1,
          down: 2, // Need 2 consecutive correct responses
          up: 2, // Need 2 consecutive incorrect responses
          reversal: 10,
          min: -5,
          max: -1,
        });

        // Test max boundary (incorrect response increases value)
        staircase.nextValue(); // -2
        staircase.response(false); // incorrect -> -2 + 1 = -1 (at max boundary)

        const nextValue = staircase.nextValue();
        expect(nextValue).toBe(-1); // Should hit max boundary

        staircase.response(false); // incorrect -> -1 + 1 = 0, but clamped to max -1
        const clampedMaxValue = staircase.nextValue();
        expect(clampedMaxValue).toBe(-1); // Should be clamped to max (-1)

        // Create a reversal with correct response, but break consecutive pattern
        staircase.response(true); // creates reversal
        const afterReversalValue1 = staircase.nextValue();
        expect(afterReversalValue1).toBe(-1); // stays -1 (no consecutive pattern yet)

        // Now create consecutive correct responses to trigger decrease
        staircase.response(false); // incorrect, breaks any consecutive correct pattern
        const afterReversalValue2 = staircase.nextValue();
        expect(afterReversalValue2).toBe(-1); // stays -1

        staircase.response(true); // correct #1 on value -1
        const afterReversalValue3 = staircase.nextValue();
        expect(afterReversalValue3).toBe(-1); // stays -1 (need 2 consecutive)

        staircase.response(true); // correct #2 on value -1
        const decreaseValue1 = staircase.nextValue();
        expect(decreaseValue1).toBe(-2); // now decrease: -1 - 1 = -2

        staircase.response(true); // correct #1 on value -2
        const decreaseValue2 = staircase.nextValue();
        expect(decreaseValue2).toBe(-2); // stays -2 (need 2 consecutive)

        staircase.response(true); // correct #2 on value -2
        const decreaseValue3 = staircase.nextValue();
        expect(decreaseValue3).toBe(-3); // decrease: -2 - 1 = -3

        staircase.response(true); // correct #1 on value -3
        const decreaseValue4 = staircase.nextValue();
        expect(decreaseValue4).toBe(-3); // stays -3

        staircase.response(true); // correct #2 on value -3
        const decreaseValue5 = staircase.nextValue();
        expect(decreaseValue5).toBe(-4); // decrease: -3 - 1 = -4

        staircase.response(true); // correct #1 on value -4
        const decreaseValue6 = staircase.nextValue();
        expect(decreaseValue6).toBe(-4); // stays -4

        staircase.response(true); // correct #2 on value -4
        const minBoundaryValue = staircase.nextValue();
        expect(minBoundaryValue).toBe(-5); // decrease: -4 - 1 = -5 (at min boundary)

        staircase.response(true); // correct #1 on value -5
        const clampedMinValue1 = staircase.nextValue();
        expect(clampedMinValue1).toBe(-5); // stays -5

        staircase.response(true); // correct #2 on value -5
        const clampedMinValue2 = staircase.nextValue();
        expect(clampedMinValue2).toBe(-5); // -5 - 1 = -6, but clamped to min -5
      });
    });
  });

  describe('response', () => {
    it('should update the last trial response', () => {
      const staircase = new StairCase({
        start: 10,
        step: 1,
        down: 1,
        up: 1,
        reversal: 2,
      });

      staircase.nextValue();
      staircase.response(true);

      expect(staircase.data[0]?.response).toBe(true);
    });

    it('should warn when no data exists', () => {
      const staircase = new StairCase({
        start: 10,
        step: 1,
        down: 1,
        up: 1,
        reversal: 2,
      });

      const consoleSpy = spyOn(console, 'warn').mockImplementation(() => {});

      staircase.response(true);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Please iterate first to get a value',
      );
      consoleSpy.mockRestore();
    });

    it('should detect reversals correctly', () => {
      const staircase = new StairCase({
        start: 10,
        step: 1,
        down: 1,
        up: 1,
        reversal: 4,
      });

      staircase.nextValue();
      staircase.response(true);

      staircase.nextValue();
      staircase.response(false); // This should create a reversal

      expect(staircase.data[1]?.isReversal).toBe(true);
    });

    it('should not mark first trial as reversal', () => {
      const staircase = new StairCase({
        start: 10,
        step: 1,
        down: 1,
        up: 1,
        reversal: 4,
      });

      staircase.nextValue();
      staircase.response(true);

      expect(staircase.data[0]?.isReversal).toBe(false);
    });
  });

  describe('getThreshold', () => {
    it('should calculate threshold from reversal trials', () => {
      const staircase = new StairCase({
        start: 10,
        step: 1,
        down: 1,
        up: 1,
        reversal: 4,
      });

      // Manually create test data
      staircase.data = [
        { value: 10, response: true, isReversal: false },
        { value: 8, response: false, isReversal: true },
        { value: 10, response: true, isReversal: true },
        { value: 8, response: false, isReversal: true },
        { value: 10, response: true, isReversal: true },
      ];

      const threshold = staircase.getThreshold(4);
      expect(threshold).toBe((8 + 10 + 8 + 10) / 4);
    });

    it('should warn when not enough reversals', () => {
      const staircase = new StairCase({
        start: 10,
        step: 1,
        down: 1,
        up: 1,
        reversal: 4,
      });

      const consoleSpy = spyOn(console, 'warn').mockImplementation(() => {});

      staircase.data = [
        { value: 10, response: true, isReversal: false },
        { value: 8, response: false, isReversal: true },
      ];

      staircase.getThreshold(4);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Not enough reversals, only 1 found, but requested 4',
      );

      consoleSpy.mockRestore();
    });

    it('should use default reversal count when not specified', () => {
      const staircase = new StairCase({
        start: 10,
        step: 1,
        down: 1,
        up: 1,
        reversal: 4,
      });

      staircase.data = [
        { value: 10, response: true, isReversal: false },
        { value: 8, response: false, isReversal: true },
        { value: 10, response: true, isReversal: true },
        { value: 8, response: false, isReversal: true },
        { value: 10, response: true, isReversal: true },
      ];

      const threshold = staircase.getThreshold();
      expect(threshold).toBe((8 + 10 + 8 + 10) / 4);
    });

    it('should return NaN when no reversals exist', () => {
      const staircase = new StairCase({
        start: 10,
        step: 1,
        down: 1,
        up: 1,
        reversal: 4,
      });

      const threshold = staircase.getThreshold();
      expect(threshold).toBeNaN();
    });
  });

  describe('integration tests', () => {
    it('should complete a full staircase procedure', () => {
      const staircase = new StairCase({
        start: 10,
        step: 1,
        down: 2,
        up: 1,
        reversal: 4,
      });

      const values: number[] = [];

      let value = staircase.nextValue();
      while (value !== undefined) {
        values.push(value);
        // Simulate responses to create a realistic staircase pattern
        const shouldRespond = Math.random() > 0.5;
        staircase.response(shouldRespond);
        value = staircase.nextValue();
      }

      expect(values.length).toBeGreaterThan(4);
      expect(staircase.data.filter((d) => d.isReversal).length).toBe(4);
    });

    it('should maintain data integrity throughout procedure', () => {
      const staircase = new StairCase({
        start: 10,
        step: 1,
        down: 2,
        up: 1,
        reversal: 6,
      });

      let value = staircase.nextValue();
      let trialCount = 1;

      while (value !== undefined && trialCount < 20) {
        staircase.response(trialCount % 3 === 0);
        value = staircase.nextValue();
        if (value !== undefined) {
          trialCount++;
        }

        expect(staircase.data.length).toBe(trialCount);
        expect(staircase.data[trialCount - 1]?.value).toBeDefined();
      }
    });
  });
});
