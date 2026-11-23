import { describe, expect, it } from 'vitest';
import { bestQuorum, checkQuorum, layout, standardQuorum } from './quorum';

/**
 * Independent oracle: real brute force. Enumerate every pair of Q-subsets of n nodes,
 * take the smallest overlap, and ask whether f faulty nodes can fill it (then the two
 * quorums share no honest node). No 2Q − n formula appears here.
 */
const pop = (x: number): number => {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
};
function bruteSafe(n: number, f: number, q: number): boolean {
  const subsets: number[] = [];
  for (let m = 0; m < 1 << n; m++) if (pop(m) === q) subsets.push(m);
  let minOverlap = q;
  for (const a of subsets) for (const b of subsets) minOverlap = Math.min(minOverlap, pop(a & b));
  return minOverlap > f;
}

describe('D2. Quorum intersection', () => {
  it('n = 4, f = 1, Q = 3: intersection 2, safe', () => {
    const r = checkQuorum(4, 1, 3);
    expect(r.intersection).toBe(2);
    expect(r.safe).toBe(true);
  });
  it('n = 7, f = 2, Q = n − f = 5: intersection 3, safe and live', () => {
    const q = standardQuorum(7, 2);
    expect(q).toBe(5);
    const r = checkQuorum(7, 2, q);
    expect(r.intersection).toBe(3);
    expect(r.safe && r.live).toBe(true);
  });
  it('n = 3f + 1 with the standard quorum: Q = 2f + 1 and intersection f + 1, for f = 1 … 10', () => {
    for (let f = 1; f <= 10; f++) {
      const n = 3 * f + 1;
      const r = checkQuorum(n, f, standardQuorum(n, f));
      expect(r.q).toBe(2 * f + 1);
      expect(r.intersection).toBe(f + 1);
      expect(r.safe).toBe(true);
    }
  });
  it('n = 6, f = 2, Q = 4: intersection 2 = f — flagged, no honest node guaranteed', () => {
    const r = checkQuorum(6, 2, 4);
    expect(r.intersection).toBe(2);
    expect(r.safe).toBe(false);
  });
  it('agrees with brute force over every n ≤ 10', () => {
    for (let n = 1; n <= 10; n++) for (let f = 0; f < n; f++) for (let q = 1; q <= n; q++) {
      expect(checkQuorum(n, f, q).safe).toBe(bruteSafe(n, f, q));
    }
  });
  it('a quorum both safe and live exists exactly when n > 3f', () => {
    for (let n = 1; n <= 30; n++) for (let f = 0; f < n; f++) expect(bestQuorum(n, f) !== null).toBe(n > 3 * f);
  });
});

describe('F. Fail-closed', () => {
  it('impossible parameters are refused', () => {
    expect(() => checkQuorum(4, 4, 3)).toThrow(/no honest node/);
    expect(() => checkQuorum(4, 1, 5)).toThrow(/not between/);
    expect(() => checkQuorum(4, 1, 0)).toThrow(/not between/);
    expect(() => checkQuorum(4.5, 1, 3)).toThrow(/whole number/);
    expect(() => checkQuorum(0, 0, 1)).toThrow(/at least 1/);
  });
  it('the worst-case layout puts faulty nodes inside the overlap first', () => {
    const nodes = layout(checkQuorum(6, 2, 4));
    const overlap = nodes.filter((x) => x.inA && x.inB);
    expect(overlap).toHaveLength(2);
    expect(overlap.every((x) => x.faulty)).toBe(true);
    expect(nodes.filter((x) => x.faulty)).toHaveLength(2);
  });
});
