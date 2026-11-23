import { DEFAULT_RNG } from '../rng';
import { clear, h, note, panelIntro } from './dom';

const STAKE: [string, number][] = [['Ada', 40], ['Ben', 30], ['Cleo', 20], ['Dev', 10]];

/** Pick a slot leader with probability proportional to stake. */
function leader(u: number): number {
  const total = STAKE.reduce((s, [, v]) => s + v, 0);
  let acc = 0;
  for (let i = 0; i < STAKE.length; i++) {
    acc += STAKE[i][1] / total;
    if (u < acc) return i;
  }
  return STAKE.length - 1;
}

export function renderStakePanel(root: HTMLElement): void {
  const draw = h('button', { class: 'btn btn-primary', type: 'button', id: 'pos-draw' }, 'Draw an epoch of 20 slots') as HTMLButtonElement;
  const out = h('div', { class: 'output', id: 'pos-out' });
  draw.addEventListener('click', () => {
    const slots = Array.from({ length: 20 }, () => leader(DEFAULT_RNG()));
    const counts = STAKE.map((_, i) => slots.filter((x) => x === i).length);
    clear(out);
    out.append(
      h('ol', { class: 'slot-row', 'aria-label': 'Slot leaders, slot 1 first' }, ...slots.map((i, k) => h('li', { class: 'slot' }, h('span', { class: 'slot-n' }, `slot ${k + 1}`), h('span', {}, STAKE[i][0])))),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'kat-table' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Stakeholder'), h('th', { scope: 'col' }, 'Stake'), h('th', { scope: 'col' }, 'Slots led'), h('th', { scope: 'col' }, 'Expected'))),
          h('tbody', {}, ...STAKE.map(([name, st], i) => h('tr', {}, h('td', {}, name), h('td', {}, `${st}%`), h('td', { 'data-claim': `pos-${name}` }, String(counts[i])), h('td', {}, (st / 5).toFixed(0))))),
        ),
      ),
      h('p', { class: 'help' }, 'One draw of 20 slots, so the counts wander around the expectation. Randomness here: crypto.getRandomValues. In Ouroboros it comes from the coin-flipping protocol described above.'),
    );
  });

  root.append(
    panelIntro(
      'Proof of stake, in one panel',
      'Proof of work is, underneath, a lottery: whoever finds a valid nonce first gets to add the next block, with odds proportional to hash power. Proof of stake keeps the lottery and drops the hashing. Each time slot has one leader, picked at random with probability proportional to the coins — the stake — each participant holds on the ledger.',
      'Ouroboros (Kiayias, Russell, David and Oliynykov, CRYPTO 2017) was the first proof-of-stake protocol with a security proof comparable to the one for Bitcoin\'s backbone. Time is split into epochs. In each epoch a committee of stakeholders runs a multiparty coin-flipping protocol, using the blockchain itself to broadcast, and its output decides the leaders of the next epoch — randomness no single party can steer. The paper proves persistence and liveness under assumptions it states: a synchronous network, enough honest stakeholders from an honest majority available in each epoch, participants not offline for long, and corruptions that take effect only after a delay.',
    ),
    h('div', { class: 'action-row spaced' }, draw),
    out,
    note('caveat', 'A picture of stake-weighted leader election, not Ouroboros: no coin-flipping, no signatures, no forks, no rewards. The paper also proposes a reward mechanism under which honest behaviour is an approximate Nash equilibrium, which it reports neutralises attacks such as selfish mining — not modelled here.'),
    h('h2', {}, 'What this lab does not do'),
    h(
      'ul',
      { class: 'plain-list' },
      h('li', {}, 'No real network: every race is a model with no message delay unless stated.'),
      h('li', {}, 'No wallet operations, transactions or scripts — see Bitcoin Wallet and Bitcoin Script in Related Demos.'),
      h('li', {}, 'No economics beyond what the cited papers model: no prices, fees, costs of attack or hash-rate figures.'),
      h('li', {}, 'Difficulty adjustment: not built here.'),
    ),
    h('h2', {}, 'Sources'),
    h(
      'ul',
      { class: 'plain-list sources' },
      h('li', {}, 'S. Nakamoto, "Bitcoin: A Peer-to-Peer Electronic Cash System", 2008 — §4 proof of work, §11 calculations. ', h('a', { href: 'https://bitcoin.org/bitcoin.pdf', target: '_blank', rel: 'noopener noreferrer' }, 'bitcoin.org'), '.'),
      h('li', {}, 'I. Eyal and E. G. Sirer, "Majority is not Enough: Bitcoin Mining is Vulnerable", Financial Cryptography 2014 — the state machine, equation (8) and the threshold. ', h('a', { href: 'https://doi.org/10.1007/978-3-662-45472-5_28', target: '_blank', rel: 'noopener noreferrer' }, 'doi:10.1007/978-3-662-45472-5_28'), '.'),
      h('li', {}, 'A. Sapirshtein, Y. Sompolinsky and A. Zohar, "Optimal Selfish Mining Strategies in Bitcoin", 2015. ', h('a', { href: 'https://doi.org/10.48550/arXiv.1507.06183', target: '_blank', rel: 'noopener noreferrer' }, 'doi:10.48550/arXiv.1507.06183'), '.'),
      h('li', {}, 'J. Garay, A. Kiayias and N. Leonardos, "The Bitcoin Backbone Protocol: Analysis and Applications", Journal of the ACM — common prefix and chain quality. ', h('a', { href: 'https://doi.org/10.1145/3653445', target: '_blank', rel: 'noopener noreferrer' }, 'doi:10.1145/3653445'), '.'),
      h('li', {}, 'A. Kiayias, A. Russell, B. David and R. Oliynykov, "Ouroboros: A Provably Secure Proof-of-Stake Blockchain Protocol", CRYPTO 2017. ', h('a', { href: 'https://doi.org/10.1007/978-3-319-63688-7_12', target: '_blank', rel: 'noopener noreferrer' }, 'doi:10.1007/978-3-319-63688-7_12'), '.'),
      h('li', {}, 'M. Castro and B. Liskov, "Practical Byzantine Fault Tolerance", OSDI 1999 — the 3f + 1 setting the quorum panel\'s schedule is styled on. ', h('a', { href: 'https://www.usenix.org/conference/osdi-99/practical-byzantine-fault-tolerance', target: '_blank', rel: 'noopener noreferrer' }, 'usenix.org'), '.'),
    ),
  );
}
