import type { Rng } from '../rng';

/**
 * Selfish mining, Eyal & Sirer ("Majority is not Enough", FC 2014), in the paper's
 * simplified model. α: the selfish pool's share of hash power. γ: the share of honest
 * miners that mine on the pool's block when two branches of length one compete.
 */

/** Relative revenue of the pool, the paper's equation (8). */
export function revenueFormula(alpha: number, gamma: number): number {
  const a = alpha;
  return (a * (1 - a) ** 2 * (4 * a + gamma * (1 - 2 * a)) - a ** 3) / (1 - a * (1 + (2 - a) * a));
}

/** Selfish mining beats honest mining when α > (1 − γ)/(3 − 2γ). */
export function threshold(gamma: number): number {
  return (1 - gamma) / (3 - 2 * gamma);
}

export interface SelfishRun {
  readonly pool: number;
  readonly others: number;
  readonly share: number;
  readonly events: number;
}

/**
 * The paper's state machine, block by block. `lead` is the pool's private lead;
 * `tie` is the state 0′ (two public branches of length one).
 *  - pool finds a block: lead + 1 (revenue decided later), or, in a tie, publish: pool +2.
 *  - others find a block:
 *      lead 0  → others +1
 *      lead 1  → pool publishes its block → tie
 *      tie     → γ(1−α): others build on the pool's block: pool +1, others +1
 *                (1−γ)(1−α): on their own: others +2
 *      lead 2  → pool publishes both: pool +2, lead 0
 *      lead >2 → pool publishes one: pool +1, lead − 1
 */
export function simulateSelfish(alpha: number, gamma: number, events: number, rng: Rng): SelfishRun {
  let lead = 0;
  let tie = false;
  let pool = 0;
  let others = 0;
  for (let i = 0; i < events; i++) {
    const u = rng();
    if (tie) {
      if (u < alpha) pool += 2;
      else if (u < alpha + gamma * (1 - alpha)) {
        pool += 1;
        others += 1;
      } else others += 2;
      tie = false;
      lead = 0;
      continue;
    }
    if (u < alpha) {
      lead++;
      continue;
    }
    if (lead === 0) others += 1;
    else if (lead === 1) {
      lead = 0;
      tie = true;
    } else if (lead === 2) {
      pool += 2;
      lead = 0;
    } else {
      pool += 1;
      lead -= 1;
    }
  }
  return { pool, others, share: pool / Math.max(1, pool + others), events };
}
