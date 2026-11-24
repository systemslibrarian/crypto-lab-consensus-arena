#!/usr/bin/env node
/*
 * Mutation runner (§4.1c). Every mutation is a CONCRETE PATCH — file, an anchor
 * that must occur exactly once, its replacement — never a sentence. A KILL is
 * defined by four rules, all enforced here:
 *   1. the owning test PASSED unmutated, in this same run;
 *   2. the patch actually CHANGED the file (anchor found exactly once);
 *   3. the run served the MUTATED code — the built bundle's hash moved;
 *   4. a patch that does not compile is DOES NOT BUILD, never a kill.
 * A red run whose output is a build error, a server that never started or a
 * refused connection is classified, not counted. Playwright runs with CI=1 so
 * `reuseExistingServer` is off and no stale server can answer.
 *
 * The records in mutations/observed.json are written by this script from what
 * it ran. Nothing in that file is typed by hand.
 *
 * Usage: node scripts/mutate.mjs            all mutations
 *        node scripts/mutate.mjs M03 M07    selected ids
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Both runners treat the name as a REGULAR EXPRESSION. An unescaped "[00]" in a
// test name once matched nothing, ran zero tests and passed — the §4.1e hazard —
// so names are escaped here AND every owner run must report a nonzero count.
const re = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const UNIT = (name) => `npx vitest run -t ${JSON.stringify(re(name))}`;
// --retries=0: a retry that passes on a lucky draw would read as a survivor.
const CLAIM = (name) => `npx playwright test --project=claims --retries=0 -g ${JSON.stringify(re(name))}`;
const A11Y = `npx playwright test --project=a11y --retries=0 -g "dark theme$"`;

export const MUTATIONS = [
  {
    id: 'M01', what: 'Nakamoto λ = z·p/q instead of z·q/p (brief E1)',
    file: 'src/race/nakamoto.ts',
    anchor: 'const lambda = (z * q) / p;\n  // Use relative Poisson weights',
    replace: 'const lambda = (z * p) / q;\n  // Use relative Poisson weights',
    owner: UNIT('q = 0.1, z = 0 … 10 matches the paper'),
  },
  {
    id: 'M02', what: 'PoW accepts a hash ABOVE the target (brief E2)',
    file: 'src/pow/mine.ts',
    anchor: 'return leadingZeroBits(hash) >= bits;',
    replace: 'return leadingZeroBits(hash) < bits;',
    owner: UNIT('12 leading zero bits: first valid nonce 11506'),
  },
  {
    id: 'M03', what: 'selfish pool never publishes at lead 1, so no tie ever happens (brief E3)',
    file: 'src/selfish/sm.ts',
    anchor: '      lead = 0;\n      tie = true;',
    replace: '      lead = 0;\n      others += 1;',
    owner: UNIT('lead 1, others find a block'),
  },
  {
    id: 'M04', what: 'standard quorum Q = 2f, used for n = 3f + 1 (brief E4)',
    file: 'src/bft/quorum.ts',
    anchor: 'return n - f;',
    replace: 'return 2 * f + 0 * n;', // n stays referenced so the patch compiles
    owner: UNIT('n = 7, f = 2, Q = n − f = 5'),
  },
  {
    id: 'M05', what: 'negative-claim sentence deleted from the majority fixture (§4.1d bite, assertion 3)',
    file: 'src/ui/racePanel.ts',
    anchor: "h('p', {}, 'Six confirmations make a double spend unlikely against a 10% attacker. They do nothing against a majority — and selfish mining pays well before 50%.'),",
    replace: '',
    owner: CLAIM('the negative claim: six confirmations are reversible by a majority'),
  },
  {
    id: 'M06', what: "a check inside the fixture broken: the merchant's rule needs MORE than six (§4.1d bite, assertion 2)",
    file: 'src/race/nakamoto.ts',
    anchor: 'return z >= required;',
    replace: 'return z > required;',
    owner: CLAIM('the negative claim: six confirmations are reversible by a majority'),
  },
  {
    id: 'M07', what: 'editing the block text no longer retires the mined result',
    file: 'src/ui/minePanel.ts',
    anchor: "  text.addEventListener('input', retire);\n",
    replace: '',
    owner: CLAIM('editing the block text retires the mined result'),
  },
  {
    id: 'M08', what: 'changing q no longer retires the simulation',
    file: 'src/ui/racePanel.ts',
    anchor: '    retireSim();\n    compute();',
    replace: '    compute();',
    owner: CLAIM('changing q retires the simulation'),
  },
  {
    id: 'M09', what: 'Poisson recurrence off by one: λ/(k + 1) instead of λ/k',
    file: 'src/race/nakamoto.ts',
    anchor: 'mass *= lambda / k;',
    replace: 'mass *= lambda / (k + 1);',
    owner: UNIT('q = 0.1, z = 0 … 10 matches the paper'),
  },
  {
    id: 'M10', what: 'selfish threshold denominator 3 − γ instead of 3 − 2γ',
    file: 'src/selfish/sm.ts',
    anchor: 'return (1 - gamma) / (3 - 2 * gamma);',
    replace: 'return (1 - gamma) / (3 - gamma);',
    owner: UNIT('γ = 0 → 1/3, γ = 1/2 → 1/4, γ = 1 → 0'),
  },
  {
    id: 'M11', what: 'quorum called safe when the overlap merely EQUALS f',
    file: 'src/bft/quorum.ts',
    anchor: 'safe: intersection > f',
    replace: 'safe: intersection >= f',
    owner: UNIT('n = 6, f = 2, Q = 4: intersection 2 = f'),
  },
  {
    id: 'M12', what: 'race simulation steps the wrong way (attacker gains on 1 − q)',
    file: 'src/race/nakamoto.ts',
    anchor: 'deficit += rng() < q ? -1 : 1;',
    replace: 'deficit += rng() < q ? 1 : -1;',
    owner: UNIT('q = 0: an attacker with no hash power never catches up'),
  },
  {
    id: 'M13', what: 'shipped default RNG swapped for Math.random',
    file: 'src/rng.ts',
    anchor: 'export const DEFAULT_RNG: Rng = cryptoRng;',
    replace: 'export const DEFAULT_RNG: Rng = Math.random;',
    owner: UNIT('the shipped default RNG is crypto.getRandomValues'),
  },
  {
    id: 'M14', what: 'nonce encoded little-endian instead of big-endian',
    file: 'src/pow/mine.ts',
    anchor: 'setBigUint64(h.length, BigInt(nonce), false);',
    replace: 'setBigUint64(h.length, BigInt(nonce), true);',
    owner: UNIT('12 leading zero bits: first valid nonce 11506'),
  },
  {
    id: 'M15', what: 'worst-case layout no longer puts faulty nodes in the overlap',
    file: 'src/bft/quorum.ts',
    anchor: 'i <= overlapEnd && faulty.size < r.f; i++) faulty.add(i);',
    replace: 'i <= overlapEnd && faulty.size < 0; i++) faulty.add(i);',
    owner: UNIT('the worst-case layout puts faulty nodes inside the overlap first'),
  },
  {
    id: 'M16', what: 'gate bite: muted text token darkened below 4.5:1',
    file: 'src/style.css',
    anchor: '--text-dim: #b3bdc8;',
    replace: '--text-dim: #4a525c;',
    owner: A11Y,
  },
];

const sh = (cmd) => {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CI: '1' }, maxBuffer: 64 << 20 }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};
const bundleHash = () => {
  const dir = join('dist', 'assets');
  const h = createHash('md5');
  for (const f of readdirSync(dir).sort()) h.update(f).update(readFileSync(join(dir, f)));
  return h.digest('hex');
};
/** Tests actually executed, from the runner's own summary line; 0 means the run proved nothing. */
const testsRan = (out) => {
  const v = /Tests\s+(?:\d+ failed \| )?(\d+) passed/.exec(out) ?? /Tests\s+(\d+) failed/.exec(out);
  const p = /(\d+) passed \(/.exec(out) ?? /(\d+) failed/.exec(out);
  return Number((v ?? p)?.[1] ?? 0);
};
const INFRA = /webServer|ECONNREFUSED|was not able to start|Error: Cannot find module|error TS\d+/;

const wanted = process.argv.slice(2);
const list = wanted.length ? MUTATIONS.filter((m) => wanted.includes(m.id)) : MUTATIONS;

const build0 = sh('npm run build');
if (!build0.ok) throw new Error('baseline build fails; refusing to mutate');
const baseHash = bundleHash();
const ownerBaseline = new Map();
for (const owner of new Set(list.map((m) => m.owner))) {
  const r = sh(owner);
  const n = testsRan(r.out);
  ownerBaseline.set(owner, r.ok && n > 0);
  console.log(`baseline ${r.ok ? 'PASS' : 'FAIL'} (${n} test${n === 1 ? '' : 's'})  ${owner}`);
}

const records = [];
for (const m of list) {
  const src = readFileSync(m.file, 'utf8');
  const count = src.split(m.anchor).length - 1;
  const rec = { id: m.id, what: m.what, file: m.file, owner: m.owner, ownerPassedUnmutated: ownerBaseline.get(m.owner) };
  if (count !== 1) {
    records.push({ ...rec, result: `ANCHOR FOUND ${count} TIMES` });
    console.log(`${m.id} ANCHOR FOUND ${count} TIMES`);
    continue;
  }
  const mutated = src.replace(m.anchor, m.replace);
  writeFileSync(m.file, mutated);
  try {
    const b = sh('npm run build');
    if (!b.ok) {
      records.push({ ...rec, result: 'DOES NOT BUILD' });
      console.log(`${m.id} DOES NOT BUILD`);
      continue;
    }
    const h = bundleHash();
    const t = sh(m.owner);
    const infra = !t.ok && INFRA.test(t.out);
    const killed = rec.ownerPassedUnmutated && h !== baseHash && !t.ok && !infra;
    const result = killed ? 'KILLED' : infra ? 'INCONCLUSIVE (infrastructure failure)' : h === baseHash ? 'INCONCLUSIVE (bundle unchanged)' : 'SURVIVED';
    const failLine = t.out.split('\n').find((l) => /✘|FAIL|AssertionError|Expected|expect\(/.test(l)) ?? '';
    records.push({ ...rec, bundleHashChanged: h !== baseHash, ownerFailedMutated: !t.ok, result, evidence: failLine.trim().slice(0, 240) });
    console.log(`${m.id} ${result}  ${m.what}`);
  } finally {
    writeFileSync(m.file, src);
  }
}
const restored = sh('npm run build');
const restoredHash = restored.ok ? bundleHash() : 'BUILD FAILED';
const summary = {
  ranAt: new Date().toISOString(),
  baselineBundle: baseHash,
  restoredBundleMatches: restoredHash === baseHash,
  killed: records.filter((r) => r.result === 'KILLED').length,
  total: records.length,
  records,
};
mkdirSync('mutations', { recursive: true });
if (!wanted.length) writeFileSync('mutations/observed.json', JSON.stringify(summary, null, 2) + '\n');
console.log(`\n${summary.killed}/${summary.total} killed; restored bundle matches baseline: ${summary.restoredBundleMatches}`);
if (summary.killed !== summary.total || !summary.restoredBundleMatches) process.exit(1);
