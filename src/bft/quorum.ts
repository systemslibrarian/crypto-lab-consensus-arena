/**
 * Quorum arithmetic for n nodes, at most f Byzantine, quorum size Q.
 * Two quorums of size Q overlap in at least 2Q − n nodes. They are guaranteed to
 * share an HONEST node only if 2Q − n > f (safety). A quorum can be gathered
 * without any faulty node's help only if Q ≤ n − f (liveness). Both hold for some
 * Q exactly when n > 3f; for n = 3f + 1 the usual Q = 2f + 1 overlaps in f + 1.
 *
 * This is arithmetic, not a consensus protocol. The split shown when safety fails
 * is the standard scenario for a quorum-certificate protocol in the style of PBFT
 * under partial synchrony: the faulty nodes sit in the overlap and vote for both
 * values, while the network keeps the two honest groups apart.
 */
export interface QuorumReport {
  readonly n: number;
  readonly f: number;
  readonly q: number;
  readonly intersection: number;
  readonly safe: boolean;
  readonly live: boolean;
}

export function checkQuorum(n: number, f: number, q: number): QuorumReport {
  for (const [name, v] of [['n', n], ['f', f], ['Q', q]] as const) {
    if (!Number.isInteger(v) || v < 0) throw new RangeError(`${name} = ${v} must be a whole number`);
  }
  if (n < 1) throw new RangeError('n must be at least 1');
  if (f >= n) throw new RangeError(`f = ${f} faulty nodes out of n = ${n} leaves no honest node`);
  if (q < 1 || q > n) throw new RangeError(`a quorum of ${q} is not between 1 and n = ${n}`);
  const intersection = Math.max(0, 2 * q - n);
  return { n, f, q, intersection, safe: intersection > f, live: q <= n - f };
}

/** The usual choice: Q = n − f (for n = 3f + 1 this is 2f + 1). */
export function standardQuorum(n: number, f: number): number {
  return n - f;
}

/** The smallest safe quorum for n and f, if any Q is both safe and live. */
export function bestQuorum(n: number, f: number): number | null {
  for (let q = 1; q <= n; q++) {
    const r = checkQuorum(n, f, q);
    if (r.safe && r.live) return q;
  }
  return null;
}

/**
 * Two quorums laid out for the worst case: quorum A = nodes 0 … Q−1, quorum B =
 * nodes n−Q … n−1, and the faulty nodes placed INSIDE the overlap first.
 */
export function layout(r: QuorumReport): { node: number; inA: boolean; inB: boolean; faulty: boolean }[] {
  const overlapStart = r.n - r.q;
  const overlapEnd = r.q - 1;
  const faulty = new Set<number>();
  for (let i = overlapStart; i <= overlapEnd && faulty.size < r.f; i++) faulty.add(i);
  for (let i = 0; i < r.n && faulty.size < r.f; i++) faulty.add(i);
  return Array.from({ length: r.n }, (_, i) => ({ node: i, inA: i < r.q, inB: i >= r.n - r.q, faulty: faulty.has(i) }));
}
