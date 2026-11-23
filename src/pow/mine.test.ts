import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { blockHeader, leadingZeroBits, MAX_BITS, meetsTarget, mine, preimage, verifyBlock } from './mine';

const HEADER = 'crypto-lab consensus arena block 0';
/** Independent oracle: node:crypto over the brief's stated encoding (ASCII header ‖ 8-byte big-endian nonce). */
const nodeHash = (header: string, nonce: number): Buffer => {
  const n = Buffer.alloc(8);
  n.writeBigUInt64BE(BigInt(nonce));
  return createHash('sha256').update(Buffer.concat([Buffer.from(header, 'ascii'), n])).digest();
};
/** Leading zero bits written separately: the hash read as a 256-bit integer, below 2^(256 − bits). */
const below = (hash: Buffer, bits: number): boolean => BigInt(`0x${hash.toString('hex')}`) < 1n << BigInt(256 - bits);

describe('C. Toy proof of work (single SHA-256)', () => {
  it('12 leading zero bits: first valid nonce 11506', async () => {
    const r = await mine(HEADER, 12, { budgetMs: 60_000 });
    expect(r.found && r.nonce).toBe(11506);
    expect(r.found && r.hashHex).toBe('0000930938fce6ffb67d4085ceccc86b3489225fa5fdf0aac4ab0835de0ec531');
    expect(r.found && r.tries).toBe(11507); // nonces 0 … 11506 were each hashed once
    // Independent route: node:crypto, and every earlier nonce really fails.
    expect(nodeHash(HEADER, 11506).toString('hex')).toBe('0000930938fce6ffb67d4085ceccc86b3489225fa5fdf0aac4ab0835de0ec531');
    for (let n = 0; n < 11506; n++) expect(below(nodeHash(HEADER, n), 12)).toBe(false);
  });

  it('20 leading zero bits: first valid nonce 143369', async () => {
    const r = await mine(HEADER, 20, { budgetMs: 120_000 });
    expect(r.found && r.nonce).toBe(143369);
    expect(r.found && r.hashHex).toBe('000002e466f9963c9d2ad5deeb3a6bfc1568df63c12c592b7b6b8f80c62e00f7');
    expect(below(nodeHash(HEADER, 143369), 20)).toBe(true);
  }, 120_000);

  it('the encoding is header bytes then the nonce as 8 bytes big-endian', () => {
    const b = preimage('ab', 0x0102);
    expect(Array.from(b)).toEqual([0x61, 0x62, 0, 0, 0, 0, 0, 0, 0x01, 0x02]);
  });

  it('meetsTarget agrees with the integer comparison hash < 2^(256 − bits) on both sides of the boundary', () => {
    for (const nonce of [0, 1, 11505, 11506, 11507, 143369]) {
      const h = nodeHash(HEADER, nonce);
      for (const bits of [0, 1, 8, 12, 16, 20]) expect(meetsTarget(new Uint8Array(h), bits)).toBe(below(h, bits));
    }
  });

  it('leadingZeroBits counts across byte boundaries', () => {
    expect(leadingZeroBits(new Uint8Array([0, 0, 0x0f, 0xff]))).toBe(20);
    expect(leadingZeroBits(new Uint8Array([0x80]))).toBe(0);
    expect(leadingZeroBits(new Uint8Array([0, 0x01]))).toBe(15);
  });
});

describe('F. Fail-closed', () => {
  it('invariant 1: validity is re-checked by re-hashing, and a changed header fails', async () => {
    expect((await verifyBlock(HEADER, 11506, 12)).ok).toBe(true);
    expect((await verifyBlock(`${HEADER}.`, 11506, 12)).ok).toBe(below(nodeHash(`${HEADER}.`, 11506), 12));
    expect((await verifyBlock(HEADER, 11505, 12)).ok).toBe(false);
  });

  it('difficulty above the budget: "not mined within the budget", never a claim that no nonce exists', async () => {
    // The first 24-bit nonce for this header is 3354206 (checked separately); 50 ms cannot reach it.
    const r = await mine(HEADER, 24, { budgetMs: 50 });
    expect(r.found).toBe(false);
    expect(!r.found && r.reason).toBe('budget');
    expect(r.tries).toBeGreaterThan(0);
  });

  it('a difficulty outside 0 … MAX_BITS is refused', async () => {
    await expect(mine(HEADER, MAX_BITS + 1)).rejects.toThrow(/outside/);
    await expect(mine(HEADER, -1)).rejects.toThrow(/outside/);
    await expect(mine(HEADER, 1.5)).rejects.toThrow(/outside/);
  });

  it('cancel stops the search and says so', async () => {
    const signal = { cancelled: true };
    const r = await mine(HEADER, 24, { signal });
    expect(!r.found && r.reason).toBe('cancelled');
  });

  it('a later block commits to the previous hash', () => {
    expect(blockHeader('x', null)).toBe('x');
    expect(blockHeader('x', 'ab')).toBe('ab|x');
  });
});
