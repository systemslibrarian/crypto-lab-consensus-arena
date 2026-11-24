import { CONFIRMATION_CAP, attackerSuccess, confirmationsMet, leastConfirmations } from '../race/nakamoto';
import { wilson } from '../rng';
import { threshold } from '../selfish/sm';
import { clear, control, evidenceRetired, fmtP, h, numberInput, panelIntro, pct, readNumber, select, selectWrap, threatModel, toneChip, verdict } from './dom';

/** The merchant's rule the fixture applies: wait for six confirmations. */
export const MERCHANT_RULE = 6;

function fixtureCard(id: string, q: number, z: number): HTMLElement {
  const p = attackerSuccess(q, z);
  const met = confirmationsMet(z, MERCHANT_RULE);
  const low = p < 0.001;
  return h(
    'div',
    { class: 'sig-card', id },
    h('h4', {}, `Attacker with ${pct(q, 0)} of the hash power`),
    h(
      'p',
      {},
      toneChip(met ? 'optimal' : 'alarm', met ? `${z} confirmations — the merchant's rule is met` : `${z} confirmations — below the merchant's rule`, `${id}-rule`),
    ),
    h('p', {}, 'Chance the attacker catches up, §11: ', h('strong', { 'data-claim': `${id}-p` }, fmtP(p))),
    h('p', {}, toneChip(low ? 'optimal' : 'alarm', low ? 'unlikely' : p === 1 ? 'certain, in this model' : 'not unlikely', `${id}-risk`)),
  );
}

export function renderRacePanel(root: HTMLElement): void {
  const qIn = numberInput('race-q', '0.1');
  const zIn = numberInput('race-z', '6', 5);
  const nSel = select('race-n', [['10000', '10 000 trials'], ['100000', '100 000 trials'], ['1000000', '1 000 000 trials']], '100000');
  const sim = h('button', { class: 'btn btn-primary', type: 'button', id: 'race-sim' }, 'Run the simulation') as HTMLButtonElement;
  const cancel = h('button', { class: 'btn btn-ghost', type: 'button', id: 'race-cancel', disabled: true }, 'Cancel') as HTMLButtonElement;
  const simStatus = h('p', { class: 'help', id: 'race-sim-status', role: 'status', 'aria-live': 'polite' });
  let worker: Worker | null = null;
  const stopWorker = (): void => {
    worker?.terminate();
    worker = null;
    cancel.disabled = true;
  };
  const exact = h('div', { class: 'output', id: 'race-exact', role: 'status', 'aria-live': 'polite' });
  const simOut = h('div', { class: 'output', id: 'race-sim-out' });
  let simShown = false;

  const compute = (): { q: number; z: number } | null => {
    clear(exact);
    const q = readNumber(qIn, 0, 1);
    const z = readNumber(zIn, 0, 200, true);
    if (q === null || z === null) {
      exact.append(verdict('fail', 'Enter q as a decimal from 0 to 1 (for example 0.1 for 10%) and z as a whole number of blocks from 0 to 200.'));
      sim.disabled = true;
      return null;
    }
    sim.disabled = worker !== null;
    const P = attackerSuccess(q, z);
    const least = leastConfirmations(q);
    let thresholdText = String(least);
    if (least === null) {
      thresholdText = q >= 0.5 ? 'none — P stays 1' : `not reached within ${CONFIRMATION_CAP} confirmations`;
    }
    const rows = Array.from({ length: 11 }, (_, k) =>
      h('tr', { 'data-z': String(k) }, h('td', {}, String(k)), h('td', { 'data-claim': `table-p-${k}` }, fmtP(attackerSuccess(q, k)))),
    );
    exact.append(
      q >= 0.5
        ? verdict('alarm', `P = 1. An attacker with at least half the hash power catches up with certainty in this model, however many confirmations the merchant waits for.`)
        : verdict(P < 0.001 ? 'pass' : 'alarm', `After ${z} confirmations, the attacker eventually catches up with probability ${fmtP(P)}.`),
      h(
        'div',
        { class: 'readout' },
        h('p', {}, 'P(q, z) from the formula: ', h('strong', { 'data-claim': 'p-exact' }, fmtP(P))),
        h(
          'p',
          {},
          'Fewest confirmations that bring P below 0.1%: ',
          h('strong', { 'data-claim': 'least-z' }, thresholdText),
        ),
      ),
      h('div', { class: 'table-wrap' }, h('table', { class: 'kat-table', id: 'race-table' }, h('caption', { class: 'sr-caption' }, `P for z = 0 to 10 at q = ${q}`), h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'z'), h('th', { scope: 'col' }, 'P(q, z)'))), h('tbody', {}, ...rows))),
    );
    return { q, z };
  };

  const retireSim = (): void => {
    if (worker) {
      stopWorker();
      simStatus.textContent = 'Stopped: the experiment settings changed while the simulation was running.';
    }
    if (!simShown) return;
    simShown = false;
    clear(simOut);
    simOut.append(evidenceRetired('The settings changed, so the simulation shown earlier was for a different race or trial count. Run it again.'));
  };
  for (const el of [qIn, zIn]) el.addEventListener('input', () => {
    retireSim();
    compute();
  });
  nSel.addEventListener('change', () => {
    retireSim();
    compute();
  });

  sim.addEventListener('click', () => {
    const v = compute();
    if (!v) return;
    const n = Number(nSel.value);
    stopWorker();
    clear(simOut);
    simShown = false;
    sim.disabled = true;
    cancel.disabled = false;
    simStatus.textContent = `Running ${n.toLocaleString('en-US')} trials…`;
    const w = new Worker(new URL('../race/race.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    w.onmessage = (e: MessageEvent<{ wins: number; n: number; requested: number }>) => {
      if (worker !== w) return;
      stopWorker();
      sim.disabled = false;
      simStatus.textContent = 'Done.';
      showSim(v.q, v.z, e.data);
    };
    w.postMessage({ q: v.q, z: v.z, n, budgetMs: 15_000 });
  });
  cancel.addEventListener('click', () => {
    stopWorker();
    sim.disabled = false;
    simStatus.textContent = 'Cancelled. No result: a partial run is not reported.';
  });

  const showSim = (q: number, z: number, r: { wins: number; n: number; requested: number }): void => {
    const ci = wilson(r.wins, r.n);
    const P = attackerSuccess(q, z);
    const inside = P >= ci.lo && P <= ci.hi;
    clear(simOut);
    if (r.n < r.requested) {
      simOut.append(verdict('alarm', `Not completed within the 15 s budget: ${r.n.toLocaleString('en-US')} of ${r.requested.toLocaleString('en-US')} trials done. The figures below are for the trials done.`));
    }
    simOut.append(
      h(
        'div',
        { class: 'readout' },
        h('p', {}, 'Trials ', h('strong', { 'data-claim': 'sim-n' }, r.n.toLocaleString('en-US')), ' · attacker caught up in ', h('strong', { 'data-claim': 'sim-wins' }, r.wins.toLocaleString('en-US'))),
        h('p', {}, 'Estimate ', h('strong', { 'data-claim': 'sim-est' }, fmtP(r.wins / r.n)), ' · 95% interval ', h('strong', { 'data-claim': 'sim-ci' }, `[${fmtP(ci.lo)}, ${fmtP(ci.hi)}]`)),
        h('p', {}, `The formula's ${fmtP(P)} is ${inside ? 'inside' : 'outside'} this interval — observed in this experiment, not a test. The interval describes sampling uncertainty for the stated model.`),
      ),
    );
    simShown = true;
  };

  const fixture = h(
    'div',
    { class: 'fixture-card', id: 'majority-fixture' },
    h('h3', {}, 'Six confirmations, two attackers'),
    h('p', { class: 'help' }, 'The same merchant, the same rule — wait for six blocks — against two different attackers.'),
    h('div', { class: 'sig-pair' }, fixtureCard('fx-minor', 0.1, 6), fixtureCard('fx-major', 0.51, 6)),
    h(
      'div',
      { class: 'callout callout-danger negative-claim', 'data-negative-claim': 'majority' },
      h('p', { class: 'negative-claim-title' }, h('span', { 'aria-hidden': 'true' }, '⚠ '), 'CONFIRMED — AND REVERSIBLE BY A MAJORITY'),
      h('p', {}, 'Six confirmations make a double spend unlikely against a 10% attacker. They do nothing against a majority — and selfish mining pays well before 50%.'),
      h(
        'p',
        {},
        'Both payments passed the merchant\'s check. Against 51% the formula gives 1: the attacker always catches up. And in Eyal and Sirer\'s model a miner who withholds blocks out-earns honest mining above the threshold of ',
        h('strong', { 'data-claim': 'fixture-threshold' }, pct(threshold(0))),
        ' of the hash power even when it wins no ties (see the Selfish mining tab).',
      ),
    ),
  );

  root.append(
    panelIntro(
      'Double-spend race',
      'A merchant ships the goods once a payment is z blocks deep. Meanwhile the attacker who paid is secretly mining a different chain in which the money went back to themselves. This model counts success as soon as the secret chain draws level. A tie alone does not determine which chain the network will ultimately accept.',
      'Section 11 of the Bitcoin paper computes the attacker\'s chance. Approximating the time for z honest blocks by its mean, the attacker\'s progress is Poisson-distributed with mean λ = z·q/p (q is the attacker\'s share of hash power, p = 1 − q). From a deficit of d blocks the attacker ever catches up with probability (q/p)^d — the gambler\'s-ruin result. Summing over the attacker\'s possible progress gives P(q, z).',
    ),
    h(
      'div',
      { class: 'controls' },
      control('race-q', 'Attacker\'s share of hash power, q', qIn, 'A decimal from 0 to 1. 0.1 means 10%.'),
      control('race-z', 'Confirmations the merchant waits for, z', zIn, 'A whole number of blocks.'),
    ),
    exact,
    h('h3', {}, 'The same race, simulated'),
    h(
      'p',
      { class: 'help' },
      'Each trial draws the attacker\'s progress from the Poisson distribution, then plays the catch-up walk block by block: +1 for the attacker with probability q, −1 otherwise. At a deficit of 200 or more it samples the remaining catch-up chance directly. That is the model §11 computes, so the two should agree up to sampling error. Randomness: crypto.getRandomValues.',
    ),
    h('div', { class: 'controls' }, control('race-n', 'Trials', selectWrap(nSel))),
    h('div', { class: 'action-row spaced' }, sim, ' ', cancel),
    simStatus,
    simOut,
    fixture,
    threatModel({
      attacker: 'A share q of the total hash power, used to mine a secret chain from the block before the payment.',
      access: 'No more than its own hashing; it cannot slow the honest network.',
      trusted: 'Constant hash shares and independent block discoveries. The calculation substitutes the expected time for z honest blocks.',
      success: 'The secret chain catches up to or passes the public chain.',
      notShown: 'Network delay, selfish strategies, the cost of the attack, or anything about real-world hash-power shares.',
    }),
  );
  compute();
}
