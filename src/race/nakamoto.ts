import type { Rng } from '../rng';

/**
 * The double-spend calculation of the Bitcoin paper, §11.
 * q: attacker's share of hash power, p = 1 − q, z: confirmations the merchant waits for.
 * The attacker's progress while the honest chain finds z blocks is Poisson with
 * λ = z·q/p; from a deficit of d it catches up with probability (q/p)^d (gambler's ruin).
 *   P(q, z) = 1 − Σ_{k=0}^{z} Poisson(k; λ) · (1 − (q/p)^(z−k))
 * For q ≥ p the catch-up probability is 1, so P = 1.
 */
export function attackerSuccess(q: number, z: number): number {
  if (!(q >= 0 && q <= 1)) throw new RangeError(`q = ${q} is not a probability`);
  if (!Number.isInteger(z) || z < 0) throw new RangeError(`z = ${z} is not a whole number of blocks`);
  const p = 1 - q;
  if (q >= p) return 1;
  const lambda = (z * q) / p;
  let sum = 1;
  let poisson = Math.exp(-lambda);
  for (let k = 0; k <= z; k++) {
    if (k > 0) poisson *= lambda / k;
    sum -= poisson * (1 - Math.pow(q / p, z - k));
  }
  return sum;
}

/** Smallest z with P(q, z) below `target` (the paper's "solving for P less than 0.1%"). */
export function leastConfirmations(q: number, target = 0.001, cap = 1000): number | null {
  for (let z = 0; z <= cap; z++) if (attackerSuccess(q, z) < target) return z;
  return null;
}

function poissonSample(lambda: number, rng: Rng): number {
  // Knuth's method; λ here is at most a few tens.
  const L = Math.exp(-lambda);
  let k = 0;
  let prod = rng();
  while (prod > L) {
    k++;
    prod *= rng();
  }
  return k;
}

/**
 * Monte Carlo of the SAME model §11 computes: draw the attacker's progress k ~
 * Poisson(λ); if k > z it is already ahead; otherwise play the gambler's-ruin walk
 * from deficit z − k (attacker +1 with probability q, −1 otherwise). The walk is
 * capped at a deficit of 200, where the remaining catch-up probability (q/p)^200 is
 * negligible for every q the page allows below 1/2.
 */
export function simulateRace(
  q: number,
  z: number,
  n: number,
  rng: Rng,
  budgetMs = Number.POSITIVE_INFINITY,
): { wins: number; n: number; requested: number } {
  const p = 1 - q;
  if (q >= p) return { wins: n, n, requested: n };
  const lambda = (z * q) / p;
  const t0 = performance.now();
  let wins = 0;
  for (let t = 0; t < n; t++) {
    // Near q = 1/2 with large z one trial can take thousands of steps, so the run is
    // time-boxed: it stops between trials and reports how many it actually did.
    if (t % 1000 === 999 && performance.now() - t0 > budgetMs) return { wins, n: t, requested: n };
    const k = poissonSample(lambda, rng);
    let deficit = z - k;
    if (deficit < 0) {
      wins++;
      continue;
    }
    while (deficit > 0 && deficit < 200) deficit += rng() < q ? -1 : 1;
    if (deficit <= 0) wins++;
  }
  return { wins, n, requested: n };
}

/** The merchant's rule: accept once the payment has at least `required` confirmations. */
export function confirmationsMet(z: number, required: number): boolean {
  return z >= required;
}
