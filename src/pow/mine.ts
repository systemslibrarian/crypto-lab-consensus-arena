/**
 * Toy proof of work: find a nonce such that SHA-256(header ‖ nonce) starts with
 * `bits` zero bits. Real WebCrypto SHA-256.
 *
 * TOY, and said so on the page: Bitcoin hashes a serialized 80-byte header with
 * DOUBLE SHA-256, encodes its target compactly, and displays hashes byte-reversed.
 * None of that is implemented here; one SHA-256 over a text header is enough to
 * show what the work is.
 */
export const MAX_BITS = 24;

// [extension] point — difficulty adjustment. Bitcoin retargets the difficulty from the
// time recent blocks took (the paper, §4: "a moving average targeting an average number
// of blocks per hour"). Here the difficulty is a fixed number of leading zero bits the
// reader picks; nothing retargets it. Not built here.

const enc = new TextEncoder();

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Header bytes followed by the nonce as 8 bytes, big-endian. */
export function preimage(header: string, nonce: number): Uint8Array<ArrayBuffer> {
  const h = enc.encode(header);
  const out = new Uint8Array(new ArrayBuffer(h.length + 8));
  out.set(h);
  new DataView(out.buffer).setBigUint64(h.length, BigInt(nonce), false);
  return out;
}

export async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export function leadingZeroBits(hash: Uint8Array): number {
  let n = 0;
  for (const byte of hash) {
    if (byte === 0) {
      n += 8;
      continue;
    }
    n += Math.clz32(byte) - 24;
    break;
  }
  return n;
}

/** Valid iff the hash has at least `bits` leading zero bits — i.e. it is below the target 2^(256 − bits). */
export function meetsTarget(hash: Uint8Array, bits: number): boolean {
  return leadingZeroBits(hash) >= bits;
}

export async function verifyBlock(header: string, nonce: number, bits: number): Promise<{ ok: boolean; hashHex: string }> {
  const hash = await sha256(preimage(header, nonce));
  return { ok: meetsTarget(hash, bits), hashHex: toHex(hash) };
}

export type MineResult =
  | { found: true; nonce: number; hashHex: string; tries: number; ms: number }
  | { found: false; tries: number; ms: number; reason: 'budget' | 'cancelled' };

/**
 * Search nonces 0, 1, 2, … in batches, yielding between batches so the page stays
 * responsive. Stops at the first valid nonce, at the time budget ("not mined within
 * the budget" — never a claim that no nonce exists), or on cancel.
 */
export async function mine(
  header: string,
  bits: number,
  opts: { budgetMs?: number; signal?: { cancelled: boolean }; onProgress?: (tries: number) => void; start?: number } = {},
): Promise<MineResult> {
  if (!Number.isInteger(bits) || bits < 0 || bits > MAX_BITS) throw new RangeError(`difficulty ${bits} bits is outside 0 … ${MAX_BITS}`);
  const budget = opts.budgetMs ?? 15_000;
  const t0 = performance.now();
  const batch = 512;
  let nonce = opts.start ?? 0;
  let tries = 0;
  for (;;) {
    const ids = Array.from({ length: batch }, (_, i) => nonce + i);
    const hashes = await Promise.all(ids.map((n) => sha256(preimage(header, n))));
    for (let i = 0; i < batch; i++) {
      tries++;
      if (meetsTarget(hashes[i], bits)) {
        return { found: true, nonce: ids[i], hashHex: toHex(hashes[i]), tries, ms: performance.now() - t0 };
      }
    }
    nonce += batch;
    opts.onProgress?.(tries);
    if (opts.signal?.cancelled) return { found: false, tries, ms: performance.now() - t0, reason: 'cancelled' };
    if (performance.now() - t0 > budget) return { found: false, tries, ms: performance.now() - t0, reason: 'budget' };
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** Header of block i: block 0 is the text alone; later blocks commit to the previous hash. */
export function blockHeader(text: string, prevHashHex: string | null): string {
  return prevHashHex === null ? text : `${prevHashHex}|${text}`;
}
