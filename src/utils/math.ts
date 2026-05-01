export function add(a: number, b: number): number {
  return Math.round((a + b) * 1e10) / 1e10;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
