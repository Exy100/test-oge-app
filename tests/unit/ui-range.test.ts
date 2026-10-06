import { expect, test } from 'vitest';
import { sliderValue } from '../../src/components/ui/range';

test.each([
  { value: 52, min: 0, max: 100, step: 5, expected: 50 },
  { value: 53, min: 0, max: 100, step: 5, expected: 55 },
  { value: -10, min: 0, max: 10, step: 3, expected: 0 },
  { value: 20, min: 0, max: 10, step: 3, expected: 9 },
  { value: 0.3, min: 0, max: 1, step: 0.1, expected: 0.3 },
  { value: 1, min: 0.1, max: 0.3, step: 0.1, expected: 0.3 },
  { value: -3, min: -5, max: 5, step: 2, expected: -3 },
])(
  'range snaps $value to $expected on the native step grid',
  ({ value, min, max, step, expected }) => {
    expect(sliderValue(value, min, max, step)).toBe(expected);
  },
);

test('invalid ranges cannot render misleading accessible values', () => {
  expect(() => sliderValue(0, 0, 100, 0)).toThrow(RangeError);
  expect(() => sliderValue(0, 10, 0, 1)).toThrow(RangeError);
  expect(() => sliderValue(Number.NaN, 0, 100, 1)).toThrow(RangeError);
  expect(() => sliderValue(0, 0, Infinity, 1)).toThrow(RangeError);
});
