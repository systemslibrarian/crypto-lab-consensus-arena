# Consensus Arena

**Proof of work · double-spend probability · selfish mining · BFT quorums**

Browser-based blockchain consensus — real SHA-256 proof of work, the double-spend race from the Bitcoin paper, selfish mining and a 3f+1 Byzantine quorum side by side, with blocks mined live, attacker success probabilities computed from the formulas and checked by simulation, and the thresholds where each design breaks.

## What It Is

Blockchains agree on one history in one of two ways: by making history expensive to rewrite (proof of work), or by counting signed votes from a known set of nodes (Byzantine fault tolerance). Both hold up to a threshold. This lab computes the thresholds:

- **Proof of work (toy).** Find a nonce such that SHA-256(text ‖ nonce) has at least k leading zero bits — that is, the hash read as a 256-bit integer is below 2^(256 − k). Real WebCrypto SHA-256; every result is re-hashed separately before it is called valid.
- **Double-spend race.** P(q, z) = 1 − Σ_{k=0}^{z} Poisson(k; λ)·(1 − (q/p)^(z−k)) with λ = z·q/p, from §11 of the Bitcoin paper, beside a Monte Carlo of the same model run in a Web Worker.
- **Selfish mining.** Eyal and Sirer's state machine, their revenue formula (equation 8) and threshold α > (1 − γ)/(3 − 2γ), with a simulation of the state machine.
- **BFT quorums.** Two quorums of size Q among n nodes overlap in at least 2Q − n; they are guaranteed an honest common node only if 2Q − n > f, and a quorum can form without the faulty nodes only if Q ≤ n − f. Both hold only when n > 3f.
- **Proof of stake**, in one panel: stake-weighted leader election as Ouroboros uses it.

Security model: each exhibit states its own threat model on the page (attacker, access, trusted parts, success event, and what it does not establish). Real: SHA-256, the formulas, the counting. Modelled: every race, in the papers' simplified models. **Not production software — a teaching demo.**

### Exact encodings

- Proof-of-work input: the block text as ASCII bytes, then the nonce as an unsigned 64-bit integer, 8 bytes big-endian. Block i > 0 hashes `<previous block's hash, 64 lowercase hex digits>|<text>` in place of the text.
- Hashes are printed as 64 lowercase hex digits in byte order (not Bitcoin's byte-reversed display).
- Simulations draw 32-bit words from `crypto.getRandomValues` and divide by 2³²; tests inject a seeded generator instead.

## Exhibits

1. **Why consensus** — the double-spending problem in plain words.
2. **Mine a block** — difficulty 8 to 24 bits, a time budget, Cancel; build a chain and rewrite block 0 to watch its work and the next link break.
3. **Double-spend race** — P(q, z), the least z for P < 0.1%, a z = 0…10 table, the Monte Carlo with N and a 95% Wilson interval, and the six-confirmation fixture.
4. **Selfish mining** — threshold and revenue for α and γ, a chart of revenue against α for γ = 0, ½ and 1 (with its values as a table), and a 2 000 000-event simulation with a batch-means interval.
5. **BFT quorums** — n, f and Q; the worst-case placement of faulty nodes; for an unsafe choice, a named protocol and the message schedule that splits it.
6. **Proof of stake & sources** — one panel on Ouroboros, the non-goals and the sources.

## When to Use It

- To see where "wait for six confirmations" comes from, and what it assumes.
- To find the hash-power share at which withholding blocks starts to pay, in Eyal and Sirer's model.
- To check a quorum size against n and f before reading a BFT protocol.
- **Do NOT** use these numbers to judge a real network's security: the races assume no network delay, a fixed attacker share and the papers' simplified models.
- **Do NOT** treat the proof of work as Bitcoin's: it is a single SHA-256 over a text header.

## Live Demo

https://systemslibrarian.github.io/crypto-lab-consensus-arena/

Mine a block, rewrite it, run the double-spend race against a 10% and a 51% attacker, find the selfish-mining threshold, and split an undersized BFT quorum.

## What Can Go Wrong

An attacker with enough hash power wins the race, a selfish miner profits before 50%, and a BFT system tolerates fewer than a third faulty nodes. Past each threshold the guarantee does not degrade — it is gone.

## Real-World Usage

- Bitcoin (Nakamoto, 2008) uses proof of work to order transactions and computes the double-spend probability in §11; this lab reproduces that section's tables.
- Eyal and Sirer (2013; FC 2014) showed that Bitcoin's mining protocol is not incentive-compatible: a pool above the threshold earns more than its share.
- Castro and Liskov's PBFT (OSDI 1999) tolerates f Byzantine replicas out of 3f + 1.
- Ouroboros (CRYPTO 2017) is a proof-of-stake protocol with a security proof under stated assumptions.

## How to Run Locally

```bash
npm ci
npm run dev          # http://localhost:5173/crypto-lab-consensus-arena/
npm test             # unit tests and KATs (Vitest)
npm run test:e2e:all # accessibility gate + claims suite (Playwright, builds first)
npm run test:mutations
```

## Related Demos

- [Bitcoin Script](https://systemslibrarian.github.io/crypto-lab-bitcoin-script/) — what a transaction's spending conditions look like.
- [Bitcoin Wallet](https://systemslibrarian.github.io/crypto-lab-bitcoin-wallet/) — keys and addresses.
- [Pulse Chain](https://systemslibrarian.github.io/crypto-lab-pulse-chain/) — threshold randomness beacons.
- [VDF](https://systemslibrarian.github.io/crypto-lab-vdf/) — verifiable delay functions.
- [DKG Gate](https://systemslibrarian.github.io/crypto-lab-dkg-gate/) — distributed key generation.

## Build & Verify

- **Unit tests (Vitest): 46 tests**, including:
  - Source KATs: the §11 tables of the Bitcoin paper (q = 0.1, z = 0…10; q = 0.3, z = 0…50 in steps of 5) to 7 decimals, and its "P < 0.1%" table (q = 0.10 → 5 … 0.30 → 24 … 0.45 → 340).
  - An independent route for §11: the sum before the paper's rearrangement, written separately.
  - Proof of work: nonce 11506 at 12 bits (hash `0000930938fc…ec531`) and 143369 at 20 bits, re-derived with node:crypto, with every earlier nonce checked to fail.
  - Selfish mining: thresholds 1/3, 1/4, 0; equation (8) against the paper's Markov chain solved by power iteration; each state-machine transition pinned with scripted draws.
  - Quorums: the brief's three cases, the n = 3f + 1 family, brute force over every pair of quorums for n ≤ 10, and "safe and live exists iff n > 3f" to n = 30.
  - Fail-closed edges: q ≥ 0.5, invalid q and z, difficulty out of range, the time budget, cancel, impossible quorum parameters; and the default RNG pinned to crypto.getRandomValues.
- **Claims suite (Playwright): 12 tests** — what the page prints, checked against the paper's tables or re-derived in the test (SHA-256 by node:crypto, §11 unrearranged, equation 8 typed from the paper, the schedule's vote counts), plus two retirement tests and the negative claim in its fixture (§4.1d).
- **Maintenance controls: 12 tests** on the workflow, pinning and provenance, run before every build.
- **Mutation ledger: 16 of 16 killed** — the four the brief names (λ = z·p/q; hash above the target accepted; no publish on a tie; Q = 2f), the two §4.1d bites, two retirement mutations, six more in the mathematics and encodings, one on the shipped RNG and one proving the accessibility gate bites. Run by `scripts/mutate.mjs`, which counts a kill only if the owning test passed unmutated, the patch applied, the bundle hash moved and the build succeeded; its record is `mutations/observed.json`.
- **Accessibility gate:** axe-core WCAG 2.1 A/AA plus arithmetic contrast, non-text contrast, reflow at 380px, scroll-region and focus oracles over every driven state at desktop and phone width. Zero violations. Copied from crypto-lab-schnorr-forge and rewritten for this lab.

## Claim-to-evidence table

The full table, one row per claim, is in [claims.md](claims.md): claim, execution mode (computed, simulated model or text only), the test that pins it, the source section, and how far it can be read. Tests are split as the batch requires: deterministic correctness, source KATs and property tests gate CI; statistical demonstrations (both simulations) are displayed with N and a 95% interval and never gate.

## Negative claim

> Six confirmations make a double spend unlikely against a 10% attacker. They do nothing against a majority — and selfish mining pays well before 50%.

Evidence fixture: the Double-spend race tab shows the same merchant's rule — six confirmations — met against a 10% attacker (P ≈ 0.0002428, from §11) and against a 51% attacker (P = 1), under the banner **CONFIRMED — AND REVERSIBLE BY A MAJORITY**, with the selfish-mining threshold at γ = 0 (33.3%) computed beside it.

## Performance

Measured in Node 22: 2 000 000 selfish-mining events take about 40 ms, so that simulation runs on the main thread. The double-spend Monte Carlo takes about 2 s for a million trials at q = 0.1, and near q = ½ with large z a single trial can take thousands of steps, so it runs in a Web Worker with Cancel and a 15-second budget; a run cut short says how many trials it completed. Mining runs in batches of 512 asynchronous WebCrypto digests, yielding between batches, with Cancel and a time budget.

## Non-goals

No real network, no wallet operations (see Bitcoin Wallet), no economics beyond what the cited papers model — no prices, fees or hash-rate figures. Difficulty adjustment is marked as an extension point and not built.

## Sources

- S. Nakamoto, "Bitcoin: A Peer-to-Peer Electronic Cash System", 2008 — §4 and §11 — https://bitcoin.org/bitcoin.pdf (also catalogued as https://doi.org/10.2139/ssrn.3440802)
- I. Eyal, E. G. Sirer, "Majority is not Enough: Bitcoin Mining is Vulnerable", Financial Cryptography 2014 — https://doi.org/10.1007/978-3-662-45472-5_28
- A. Sapirshtein, Y. Sompolinsky, A. Zohar, "Optimal Selfish Mining Strategies in Bitcoin", 2015 — https://doi.org/10.48550/arXiv.1507.06183
- J. Garay, A. Kiayias, N. Leonardos, "The Bitcoin Backbone Protocol: Analysis and Applications", *Journal of the ACM* — https://doi.org/10.1145/3653445
- A. Kiayias, A. Russell, B. David, R. Oliynykov, "Ouroboros: A Provably Secure Proof-of-Stake Blockchain Protocol", CRYPTO 2017 — https://doi.org/10.1007/978-3-319-63688-7_12
- M. Castro, B. Liskov, "Practical Byzantine Fault Tolerance", OSDI 1999 — https://www.usenix.org/conference/osdi-99/practical-byzantine-fault-tolerance

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
