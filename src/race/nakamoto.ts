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
  if (z === 0) return 1;
  if (q === 0) return 0;
  const lambda = (z * q) / p;
  // Use relative Poisson weights centred on the mode. Starting at exp(-λ)
  // underflows for large λ; subtracting near-unit mass loses small results.
  const mode = Math.floor(lambda);
  const odds = q / p;
  let mass = 1;
  let total = mass;
  let success = odds ** (z - mode);
  for (let k = mode; k > 0; k--) {
    mass *= k / lambda;
    total += mass;
    success += mass * odds ** (z - k + 1);
  }
  mass = 1;
  for (let k = mode + 1; ; k++) {
    mass *= lambda / k;
    total += mass;
    success += mass * odds ** Math.max(0, z - k);
    if (k >= z && mass <= Number.EPSILON * success) break;
  }
  return success / total;
}

export const CONFIRMATION_CAP = 1000;

/** Smallest z with P(q, z) below `target` (the paper's "solving for P less than 0.1%"). */
export function leastConfirmations(q: number, target = 0.001, cap = CONFIRMATION_CAP): number | null {
  // The catch-up probability is non-increasing with confirmation depth.
  if (attackerSuccess(q, cap) >= target) return null;
  let low = 0;
  let high = cap;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (attackerSuccess(q, mid) < target) high = mid;
    else low = mid + 1;
  }
  return low;
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
 * played to a deficit of 200. At or beyond that boundary, sample eventual catch-up
 * with its exact conditional probability; this still matters near q = 1/2.
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
    if (deficit <= 0 || rng() < (q / p) ** deficit) wins++;
  }
  return { wins, n, requested: n };
}

/** The merchant's rule: accept once the payment has at least `required` confirmations. */
export function confirmationsMet(z: number, required: number): boolean {
  return z >= required;
}
