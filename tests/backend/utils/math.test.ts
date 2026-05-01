import { describe, it, expect } from 'vitest';
import { add, multiply } from '../../../src/utils/math';

describe('add', () => {
  it('adds two positive integers', () => {
    expect(add(2, 3)).toBe(5);
  });

  it('adds two negative numbers', () => {
    expect(add(-5, -3)).toBe(-8);
  });

  it('adds opposite signs to zero', () => {
    expect(add(-1, 1)).toBe(0);
  });

  it('adds zeros', () => {
    expect(add(0, 0)).toBe(0);
  });

  it('handles IEEE 754 floating-point noise (0.1 + 0.2)', () => {
    expect(add(0.1, 0.2)).toBe(0.3);
  });

  it('adds exact-representable floats', () => {
    expect(add(1.5, 2.25)).toBe(3.75);
  });
});

describe('multiply', () => {
  it('multiplies two positive integers', () => {
    expect(multiply(2, 3)).toBe(6);
  });

  it('multiplies a negative and a positive (negative result)', () => {
    expect(multiply(-2, 3)).toBe(-6);
  });

  it('multiplies two negatives (positive result)', () => {
    expect(multiply(-2, -3)).toBe(6);
  });

  it('multiplies by zero', () => {
    expect(multiply(0, 5)).toBe(0);
  });
});
