import { describe, expect, it } from 'vitest';
import type { Rng } from '../rng';
import { revenueFormula, simulateSelfish, threshold } from './sm';

/** Replays a fixed list of draws, so each transition of the state machine is pinned exactly. */
const script = (draws: number[]): Rng => {
  let i = 0;
  return () => draws[i++];
};

/**
 * Independent oracle: the stationary distribution of the paper's Markov chain, found
 * by power iteration over states 0′, 0, 1, …, K (K = 400), and the expected revenue per
 * transition from the paper's revenue rules (its equations 6–7). Written here, with
 * none of revenueFormula's algebra.
 */
function chainRevenue(a: number, g: number): number {
  const K = 400;
  // index 0 = state 0′, index i + 1 = lead i
  let pi = new Float64Array(K + 2);
  pi[1] = 1;
  for (let it = 0; it < 4000; it++) {
    const nx = new Float64Array(K + 2);
    nx[1] += pi[0]; // 0′ always returns to 0
    for (let lead = 0; lead <= K; lead++) {
      const m = pi[lead + 1];
      if (!m) continue;
      nx[Math.min(lead + 1, K) + 1] += a * m;
      if (lead === 0) nx[1] += (1 - a) * m;
      else if (lead === 1) nx[0] += (1 - a) * m;
      else if (lead === 2) nx[1] += (1 - a) * m;
      else nx[lead] += (1 - a) * m;
    }
    pi = nx;
  }
  let pool = pi[0] * (a * 2 + g * (1 - a));
  let others = pi[0] * (g * (1 - a) + (1 - g) * (1 - a) * 2) + pi[1] * (1 - a);
  pool += pi[3] * (1 - a) * 2;
  for (let lead = 3; lead <= K; lead++) pool += pi[lead + 1] * (1 - a);
  return pool / (pool + others);
}

describe('B. Selfish-mining threshold (Eyal–Sirer, simplified model)', () => {
  it('γ = 0 → 1/3, γ = 1/2 → 1/4, γ = 1 → 0', () => {
    expect(threshold(0)).toBeCloseTo(1 / 3, 15);
    expect(threshold(0.5)).toBeCloseTo(1 / 4, 15);
    expect(threshold(1)).toBe(0);
  });
  it('at the threshold the pool earns exactly its share: R(t(γ), γ) = t(γ)', () => {
    for (const g of [0, 0.25, 0.5, 0.75]) expect(revenueFormula(threshold(g), g)).toBeCloseTo(threshold(g), 12);
  });
  it('the paper\'s closed form (8) agrees with the Markov chain solved independently', () => {
    for (const a of [0.1, 0.2, 0.3, 0.4, 0.45]) for (const g of [0, 0.5, 1]) {
      expect(revenueFormula(a, g)).toBeCloseTo(chainRevenue(a, g), 8);
    }
  });
  it('profitable exactly above the threshold (R > α ⇔ α > t(γ)) on a grid', () => {
    for (const g of [0, 0.5, 1]) for (let i = 1; i < 50; i++) {
      const a = i / 100;
      if (Math.abs(a - threshold(g)) < 1e-9) continue;
      expect(revenueFormula(a, g) > a).toBe(a > threshold(g));
    }
  });
});

describe('The state machine, one transition at a time (α = 0.4, γ = 0.5: pool < 0.4 ≤ others-on-pool < 0.7 ≤ others)', () => {
  const run = (d: number[]) => simulateSelfish(0.4, 0.5, d.length, script(d));
  it('lead 0, others find a block: others +1', () => expect(run([0.9])).toMatchObject({ pool: 0, others: 1 }));
  it('lead 1, others find a block: the pool PUBLISHES and a tie follows; honest miners on the pool\'s block split 1 + 1', () =>
    expect(run([0.1, 0.9, 0.5])).toMatchObject({ pool: 1, others: 1 }));
  it('tie, pool finds the next block: pool +2', () => expect(run([0.1, 0.9, 0.1])).toMatchObject({ pool: 2, others: 0 }));
  it('tie, others extend their own branch: others +2', () => expect(run([0.1, 0.9, 0.9])).toMatchObject({ pool: 0, others: 2 }));
  it('lead 2, others find a block: the pool publishes both, +2', () => expect(run([0.1, 0.1, 0.9])).toMatchObject({ pool: 2, others: 0 }));
  it('lead 3, others find a block: the pool publishes one, +1, and keeps a lead of 2', () =>
    expect(run([0.1, 0.1, 0.1, 0.9, 0.9])).toMatchObject({ pool: 3, others: 0 }));
});
