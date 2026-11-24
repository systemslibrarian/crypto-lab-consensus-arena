import { checkQuorum, layout, standardQuorum } from '../bft/quorum';
import { clear, control, h, note, numberInput, panelIntro, readNumber, threatModel, toneChip, verdict } from './dom';

export function renderQuorumPanel(root: HTMLElement): void {
  const nIn = numberInput('q-n', '4', 4);
  const fIn = numberInput('q-f', '1', 4);
  const qIn = numberInput('q-q', '3', 4);
  const std = h('button', { class: 'btn btn-ghost', type: 'button', id: 'q-std' }, 'Use Q = n − f') as HTMLButtonElement;
  const out = h('div', { class: 'output', id: 'q-out', role: 'status', 'aria-live': 'polite' });
  const diagram = h('div', { id: 'q-diagram' });
  const schedule = h('div', { id: 'q-schedule' });

  const compute = (): void => {
    clear(out);
    clear(diagram);
    clear(schedule);
    const n = readNumber(nIn, 1, 31, true);
    const f = readNumber(fIn, 0, 30, true);
    const q = readNumber(qIn, 1, 31, true);
    if (n === null || f === null || q === null) {
      out.append(verdict('fail', 'Enter whole numbers: n from 1 to 31 nodes, f from 0 to 30, Q from 1 to 31.'));
      return;
    }
    let r;
    try {
      r = checkQuorum(n, f, q);
    } catch (e) {
      for (const el of [nIn, fIn, qIn]) el.setAttribute('aria-invalid', 'true');
      out.append(verdict('fail', (e as Error).message));
      return;
    }
    out.append(
      h(
        'div',
        { class: 'readout' },
        h('p', {}, 'Two quorums of ', String(q), ' out of ', String(n), ' share at least max(0, 2Q − n) = ', h('strong', { 'data-claim': 'q-intersection' }, String(r.intersection)), ` node${r.intersection === 1 ? '' : 's'}; up to `, h('strong', {}, String(f)), ' of them may be faulty.'),
        h(
          'p',
          { class: 'chip-row' },
          toneChip(r.safe ? 'optimal' : 'alarm', r.safe ? `safe: ${r.intersection} > ${f}, so any two quorums share an honest node` : `unsafe: ${r.intersection} ≤ ${f}, two quorums can share no honest node`, 'q-safe'),
          ' ',
          toneChip(r.live ? 'optimal' : 'alarm', r.live ? `live: ${q} ≤ n − f = ${n - f}, a quorum forms without the faulty nodes` : `not live: ${q} > n − f = ${n - f}, silent faulty nodes block every quorum`, 'q-live'),
        ),
      ),
    );
    const nodes = layout(r);
    diagram.append(
      h('p', { class: 'help' }, 'The worst case: quorum A is the first Q nodes, quorum B the last Q, with faulty nodes placed in the overlap first.'),
      h(
        'ul',
        { class: 'node-row', 'aria-label': `${n} nodes` },
        ...nodes.map((x) =>
          h(
            'li',
            { class: `node${x.faulty ? ' faulty' : ''}`, 'data-in': x.inA && x.inB ? 'both' : x.inA ? 'A' : x.inB ? 'B' : 'none', 'data-faulty': String(x.faulty) },
            h('span', { class: 'node-id' }, `#${x.node}`),
            h('span', { class: 'node-set' }, x.inA && x.inB ? 'A and B' : x.inA ? 'A' : x.inB ? 'B' : 'neither'),
            h('span', { class: 'node-state' }, x.faulty ? '✕ faulty' : '✓ honest'),
          ),
        ),
      ),
    );
    if (!r.safe) {
      const aHonest = nodes.filter((x) => x.inA && !x.inB && !x.faulty).length;
      const bHonest = nodes.filter((x) => x.inB && !x.inA && !x.faulty).length;
      const aFaulty = nodes.filter((x) => x.inA && x.faulty).length;
      const bFaulty = nodes.filter((x) => x.inB && x.faulty).length;
      if (f === 0 || aHonest === 0 || bHonest === 0) {
        const explanation = f === 0
          ? 'The two quorums are disjoint. The quorum size alone cannot guarantee a shared honest voter. There are no faulty participants in this setting.'
          : 'The illustrated quorums share no honest voter. At least one group contains no honest voter, so this layout does not demonstrate two honest nodes deciding differently.';
        schedule.append(note('caveat', explanation));
        return;
      }
      schedule.append(
        h('h3', {}, 'How it fails: a named protocol and schedule'),
        h(
          'p',
          {},
          'Protocol: a PBFT-style protocol that commits a value once a node holds a quorum certificate — Q matching signed votes. Network: asynchronous; messages can be delayed for as long as the adversary likes (PBFT\'s safety does not depend on timing, so this schedule is allowed). Adversary: the f faulty nodes, including the leader.',
        ),
        h(
          'ol',
          { class: 'plain-list schedule', id: 'q-steps' },
          h('li', {}, 'The faulty leader proposes value X to the honest nodes of A and value Y to the honest nodes of B.'),
          h('li', {}, 'The network holds back every message between the two honest groups.'),
          h('li', {}, 'The faulty nodes vote for X and also for Y — signing both costs them nothing.'),
          h('li', {}, `The honest nodes in A see ${aHonest} honest + ${aFaulty} faulty = ${aHonest + aFaulty} votes for X: a quorum certificate. They commit X.`),
          h('li', {}, `The honest nodes in B see ${bHonest} honest + ${bFaulty} faulty = ${bHonest + bFaulty} votes for Y: a quorum certificate. They commit Y.`),
        ),
        h('div', { 'data-claim': 'q-split' }, verdict('alarm', 'Two honest nodes committed different values. With 2Q − n > f this schedule is impossible: some honest node would sit in both quorums and refuse to vote twice.')),
      );
    }
  };

  for (const el of [nIn, fIn, qIn]) el.addEventListener('input', compute);
  std.addEventListener('click', () => {
    const n = readNumber(nIn, 1, 31, true);
    const f = readNumber(fIn, 0, 30, true);
    if (n === null || f === null) return compute();
    qIn.value = String(standardQuorum(n, f));
    compute();
  });

  root.append(
    panelIntro(
      'BFT quorums',
      'Byzantine fault tolerance works with a known set of n nodes, of which at most f may be faulty — crashed, buggy or lying. A value is decided once a quorum of Q nodes has voted for it. The question is how big Q must be.',
      'Any two quorums of size Q overlap in at least 2Q − n nodes. If that overlap is larger than f, it must contain an honest node, and an honest node never votes for two conflicting values — so two quorums can never decide differently. But Q cannot be larger than n − f, or the faulty nodes can stall the system by staying silent. Both hold only when n > 3f; the usual choice for n = 3f + 1 is Q = 2f + 1.',
    ),
    h(
      'div',
      { class: 'controls' },
      control('q-n', 'Nodes, n', nIn),
      control('q-f', 'Faulty nodes tolerated, f', fIn),
      control('q-q', 'Quorum size, Q', qIn),
    ),
    h('div', { class: 'action-row spaced' }, std),
    out,
    diagram,
    schedule,
    note('caveat', 'Quorum arithmetic is not a consensus protocol. It is the counting argument every quorum-based protocol needs; leaders, view changes, signatures and timing are what a real protocol adds, and none is implemented here.'),
    threatModel({
      attacker: 'Up to f nodes, which may send anything (including two conflicting votes), and the network\'s delivery schedule.',
      access: 'Its own signing keys only; it cannot forge an honest node\'s vote.',
      trusted: 'Signatures, and the bound f on faulty nodes.',
      success: 'Two honest nodes decide different values.',
      notShown: 'A working protocol, liveness under real timing, or how nodes are chosen.',
    }),
  );
  compute();
}
