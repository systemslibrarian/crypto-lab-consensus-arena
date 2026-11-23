import { describe, expect, it } from 'vitest';
import { seeded } from '../testing/seeded';
import { attackerSuccess, confirmationsMet, leastConfirmations, simulateRace } from './nakamoto';

/**
 * Independent oracle: the §11 sum BEFORE the paper's rearrangement — Poisson density
 * times the catch-up probability, summed over k up to a far tail — written here
 * separately from the source's 1 − Σ form.
 */
function unrearranged(q: number, z: number): number {
  const p = 1 - q;
  const lambda = (z * q) / p;
  let total = 0;
  let logFact = 0;
  for (let k = 0; k < 400; k++) {
    if (k > 0) logFact += Math.log(k);
    const pois = Math.exp(k * Math.log(lambda || 1e-300) - lambda - logFact);
    const density = lambda === 0 ? (k === 0 ? 1 : 0) : pois;
    total += density * (k > z ? 1 : (q / p) ** (z - k));
  }
  return total;
}

// Published vectors: the tables printed in §11 of the Bitcoin paper (checked against the library copy).
const PAPER_Q01 = [1.0, 0.2045873, 0.0509779, 0.0131722, 0.0034552, 0.0009137, 0.0002428, 0.0000647, 0.0000173, 0.0000046, 0.0000012];
const PAPER_Q03: [number, number][] = [[0, 1.0], [5, 0.1773523], [10, 0.0416605], [15, 0.0101008], [20, 0.0024804], [25, 0.0006132], [30, 0.0001522], [35, 0.0000379], [40, 0.0000095], [45, 0.0000024], [50, 0.0000006]];
const PAPER_LEAST: [number, number][] = [[0.1, 5], [0.15, 8], [0.2, 11], [0.25, 15], [0.3, 24], [0.35, 41], [0.4, 89], [0.45, 340]];

describe('A. Nakamoto §11 double-spend probability', () => {
  it('q = 0.1, z = 0 … 10 matches the paper to 7 decimals', () => {
    PAPER_Q01.forEach((v, z) => expect(attackerSuccess(0.1, z).toFixed(7)).toBe(v.toFixed(7)));
  });
  it('q = 0.3 at z = 0, 5, … 50 matches the paper to 7 decimals', () => {
    for (const [z, v] of PAPER_Q03) expect(attackerSuccess(0.3, z).toFixed(7)).toBe(v.toFixed(7));
  });
  it('least z with P < 0.001: the paper\'s table, including q = 0.3 → 24', () => {
    for (const [q, z] of PAPER_LEAST) expect(leastConfirmations(q)).toBe(z);
  });
  it('agrees with the unrearranged sum written independently', () => {
    for (const q of [0.05, 0.1, 0.25, 0.4, 0.49]) for (const z of [0, 1, 3, 6, 12, 30]) {
      expect(attackerSuccess(q, z)).toBeCloseTo(unrearranged(q, z), 10);
    }
  });
  it('is non-increasing in z for q < 1/2 (the paper: drops exponentially)', () => {
    for (const q of [0.1, 0.3, 0.45]) for (let z = 0; z < 60; z++) expect(attackerSuccess(q, z + 1)).toBeLessThanOrEqual(attackerSuccess(q, z) + 1e-15);
  });
});

describe('F. Fail-closed edges', () => {
  it('q ≥ 0.5: the attacker catches up with certainty, P = 1', () => {
    for (const q of [0.5, 0.51, 0.9, 1]) for (const z of [0, 6, 100]) expect(attackerSuccess(q, z)).toBe(1);
    expect(leastConfirmations(0.5)).toBeNull();
  });
  it('a q outside [0, 1] or a fractional z is refused', () => {
    expect(() => attackerSuccess(-0.1, 1)).toThrow(RangeError);
    expect(() => attackerSuccess(1.2, 1)).toThrow(RangeError);
    expect(() => attackerSuccess(Number.NaN, 1)).toThrow(RangeError);
    expect(() => attackerSuccess(0.1, 1.5)).toThrow(RangeError);
    expect(() => attackerSuccess(0.1, -1)).toThrow(RangeError);
  });
  it('the merchant\'s rule counts exactly the required confirmations as met', () => {
    expect(confirmationsMet(6, 6)).toBe(true);
    expect(confirmationsMet(5, 6)).toBe(false);
    expect(confirmationsMet(7, 6)).toBe(true);
  });
});

describe('D. The Monte Carlo implements the §11 model (deterministic properties only; agreement is displayed, not gated)', () => {
  it('q = 0: an attacker with no hash power never catches up from z ≥ 1', () => {
    expect(simulateRace(0, 3, 500, seeded(1)).wins).toBe(0);
  });
  it('z = 0: the attacker starts level, so every trial is a win', () => {
    expect(simulateRace(0.1, 0, 500, seeded(2)).wins).toBe(500);
  });
  it('q ≥ 0.5: every trial is a win, as in the formula', () => {
    expect(simulateRace(0.5, 6, 300, seeded(3)).wins).toBe(300);
  });
  it('a time budget stops the run between trials and reports the count actually done', () => {
    const r = simulateRace(0.49, 200, 1_000_000, seeded(5), 30);
    expect(r.requested).toBe(1_000_000);
    expect(r.n).toBeLessThan(1_000_000);
    expect(r.wins).toBeLessThanOrEqual(r.n);
  });
  it('a seeded run is reproducible and reports its N', () => {
    const a = simulateRace(0.1, 2, 2000, seeded(7));
    const b = simulateRace(0.1, 2, 2000, seeded(7));
    expect(a).toEqual(b);
    expect(a.n).toBe(2000);
  });
});
