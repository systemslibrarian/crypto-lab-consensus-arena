import { h, note, panelIntro } from './dom';

export function renderIntroPanel(root: HTMLElement): void {
  root.append(
    panelIntro(
      'Why consensus',
      'A digital coin is just data, and data can be copied. If Alice pays Bob and then, a moment later, pays Carol with the same coin, somebody has to decide which payment came first. A bank does that by keeping the one ledger. A blockchain has no bank: thousands of computers each keep a copy, and they need a rule that makes them all end up with the same history.',
      'There are two families of rule. Proof of work makes rewriting history expensive: every block carries a costly puzzle answer, and everyone follows the chain with the most work in it. Byzantine fault tolerance (BFT) counts signed votes from a known set of nodes instead. Both work — up to a threshold. This lab measures where each threshold is.',
    ),
    h('h3', {}, 'What each exhibit shows'),
    h(
      'ol',
      { class: 'plain-list' },
      h('li', {}, h('strong', {}, 'Mine a block'), ' — find a nonce whose SHA-256 hash starts with enough zero bits, with real SHA-256 in your browser, and see why changing an old block means redoing its work and all the work after it.'),
      h('li', {}, h('strong', {}, 'Double-spend race'), ' — the probability an attacker with a share q of the hash power rewrites a payment after z confirmations, from the formula in §11 of the Bitcoin paper, beside a simulation of the same model.'),
      h('li', {}, h('strong', {}, 'Selfish mining'), ' — a miner who hides blocks can earn more than its fair share with well under half the hash power (Eyal and Sirer).'),
      h('li', {}, h('strong', {}, 'BFT quorums'), ' — why n nodes tolerate fewer than n/3 faulty ones: two quorums must share an honest node.'),
      h('li', {}, h('strong', {}, 'Proof of stake'), ' — one panel on Ouroboros, which replaces the hashing race with a lottery weighted by stake.'),
    ),
    note(
      'caveat',
      'Not production software — a teaching demo. The proof of work is a toy (one SHA-256 over a short text header), the races are the papers\' simplified models, and there is no network: every number is computed in your browser from the formula or the simulation named beside it.',
    ),
  );
}
