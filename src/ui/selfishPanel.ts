import { batchInterval, DEFAULT_RNG } from '../rng';
import { revenueFormula, simulateSelfish, threshold } from '../selfish/sm';
import { clear, control, evidenceRetired, h, note, numberInput, panelIntro, pct, readNumber, select, selectWrap, threatModel, toneChip, verdict } from './dom';

const SVG = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...kids: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of kids) el.append(c);
  return el;
}

const CURVES: { g: number; dash: string; label: string }[] = [
  { g: 0, dash: '', label: 'γ = 0' },
  { g: 0.5, dash: '7 4', label: 'γ = ½' },
  { g: 1, dash: '1.5 4', label: 'γ = 1' },
];

/** Revenue against α for three γ values, computed from equation (8), in this lab's own design. */
function chart(alpha: number, gamma: number): SVGSVGElement {
  const W = 560, H = 320, L = 52, R = 16, T = 16, B = 44;
  const x = (a: number): number => L + (a / 0.5) * (W - L - R);
  const y = (v: number): number => T + (1 - v) * (H - T - B);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-labelledby': 'sm-chart-title sm-chart-desc' });
  svg.append(
    s('title', { id: 'sm-chart-title' }, 'Selfish pool revenue against its hash power'),
    s('desc', { id: 'sm-chart-desc' }, 'Three curves from equation 8, for γ = 0, ½ and 1, and the honest line revenue = α. Each curve crosses the honest line at its threshold. The table below the chart lists the plotted values.'),
  );
  for (let v = 0; v <= 1.0001; v += 0.25) {
    svg.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }), s('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, pct(v, 0)));
  }
  for (let a = 0; a <= 0.5001; a += 0.1) svg.append(s('text', { x: x(a), y: H - B + 18, 'text-anchor': 'middle', class: 'tick' }, pct(a, 0)));
  svg.append(
    s('text', { x: (L + W - R) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-label' }, 'pool\'s share of hash power, α'),
    s('text', { x: 14, y: (T + H - B) / 2, 'text-anchor': 'middle', class: 'axis-label', transform: `rotate(-90 14 ${(T + H - B) / 2})` }, 'pool\'s share of blocks'),
    s('line', { x1: x(0), y1: y(0), x2: x(0.5), y2: y(0.5), class: 'honest' }),
  );
  for (const c of CURVES) {
    const pts: string[] = [];
    for (let i = 0; i <= 100; i++) {
      const a = (i / 100) * 0.5;
      pts.push(`${x(a).toFixed(1)},${y(Math.max(0, revenueFormula(a, c.g))).toFixed(1)}`);
    }
    svg.append(s('polyline', { points: pts.join(' '), class: c.g === gamma ? 'curve current' : 'curve', 'stroke-dasharray': c.dash }));
    const t = threshold(c.g);
    if (t > 0) svg.append(s('circle', { cx: x(t), cy: y(t), r: 4, class: 'threshold-dot' }));
  }
  const ra = Math.max(0, revenueFormula(alpha, gamma));
  svg.append(s('line', { x1: x(alpha), x2: x(alpha), y1: y(0), y2: y(1), class: 'marker' }), s('circle', { cx: x(alpha), cy: y(ra), r: 5.5, class: 'marker-dot' }));
  return svg;
}

/** Line-pattern legend, so no curve is told apart by colour alone. */
function legend(gamma: number): HTMLElement {
  const swatch = (dash: string, cls: string): SVGSVGElement =>
    s('svg', { viewBox: '0 0 36 10', width: 36, height: 10, class: 'swatch', 'aria-hidden': 'true' }, s('line', { x1: 1, y1: 5, x2: 35, y2: 5, class: cls, 'stroke-dasharray': dash }));
  return h(
    'ul',
    { class: 'legend', 'aria-label': 'Chart legend' },
    h('li', {}, swatch('', 'honest'), 'honest mining: share = α'),
    ...CURVES.map((c) => h('li', {}, swatch(c.dash, c.g === gamma ? 'curve current' : 'curve'), `selfish, ${c.label}${c.g === gamma ? ' (selected)' : ''}`)),
    h('li', {}, h('span', { class: 'legend-dot', 'aria-hidden': 'true' }, '○'), 'threshold: where a curve crosses the honest line'),
  );
}

export function renderSelfishPanel(root: HTMLElement): void {
  const aIn = numberInput('sm-alpha', '0.3');
  const gSel = select('sm-gamma', [['0', 'γ = 0 — the pool loses every tie'], ['0.5', 'γ = ½ — wins half the ties'], ['1', 'γ = 1 — wins every tie']], '0');
  const out = h('div', { class: 'output', id: 'sm-out', role: 'status', 'aria-live': 'polite' });
  const chartBox = h('div', { class: 'chart-box', id: 'sm-chart' });
  const simBtn = h('button', { class: 'btn btn-primary', type: 'button', id: 'sm-sim' }, 'Simulate 2 000 000 blocks') as HTMLButtonElement;
  const simOut = h('div', { class: 'output', id: 'sm-sim-out' });
  let simShown = false;

  const values = h(
    'details',
    { class: 'disclosure' },
    h('summary', {}, 'The plotted values as a table'),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'kat-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'α'), h('th', { scope: 'col' }, 'honest'), ...CURVES.map((c) => h('th', { scope: 'col' }, c.label)))),
        h('tbody', {}, ...[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45].map((a) => h('tr', {}, h('td', {}, pct(a, 0)), h('td', {}, pct(a)), ...CURVES.map((c) => h('td', {}, pct(revenueFormula(a, c.g))))))),
      ),
    ),
  );

  const compute = (): { a: number; g: number } | null => {
    clear(out);
    clear(chartBox);
    const a = readNumber(aIn, 0, 0.5);
    const g = Number(gSel.value);
    if (a === null) {
      out.append(verdict('fail', 'Enter α as a decimal from 0 to 0.5. The paper\'s model is for a pool with at most half the hash power; above that, the pool simply wins every race.'));
      simBtn.disabled = true;
      return null;
    }
    simBtn.disabled = false;
    const R = revenueFormula(a, g);
    const t = threshold(g);
    const profitable = R > a;
    out.append(
      h(
        'div',
        { class: 'readout' },
        h('p', {}, 'Threshold (1 − γ)/(3 − 2γ): ', h('strong', { 'data-claim': 'sm-threshold' }, pct(t))),
        h('p', {}, 'Pool\'s share of blocks, equation (8): ', h('strong', { 'data-claim': 'sm-revenue' }, pct(R, 2)), ' — honest mining would give it ', h('strong', { 'data-claim': 'sm-honest' }, pct(a, 2))),
        h('p', {}, toneChip(profitable ? 'alarm' : 'optimal', profitable ? 'selfish mining pays: above the threshold' : 'selfish mining does not pay: at or below the threshold', 'sm-verdict')),
      ),
    );
    chartBox.append(chart(a, g), legend(g));
    return { a, g };
  };

  const retire = (): void => {
    if (!simShown) return;
    simShown = false;
    clear(simOut);
    simOut.append(evidenceRetired('α or γ changed, so the simulation shown earlier was for a different pool. Run it again.'));
  };
  aIn.addEventListener('input', () => {
    retire();
    compute();
  });
  gSel.addEventListener('change', () => {
    retire();
    compute();
  });

  simBtn.addEventListener('click', () => {
    const v = compute();
    if (!v) return;
    const batches = 20;
    const per = 100_000;
    const means: number[] = [];
    let pool = 0;
    let others = 0;
    for (let i = 0; i < batches; i++) {
      const r = simulateSelfish(v.a, v.g, per, DEFAULT_RNG);
      means.push(r.share);
      pool += r.pool;
      others += r.others;
    }
    const ci = batchInterval(means);
    const R = revenueFormula(v.a, v.g);
    clear(simOut);
    simOut.append(
      h(
        'div',
        { class: 'readout' },
        h('p', {}, 'Mining events ', h('strong', { 'data-claim': 'sm-events' }, (batches * per).toLocaleString('en-US')), ` in ${batches} independent batches · blocks that ended up in the chain: pool ${pool.toLocaleString('en-US')}, others ${others.toLocaleString('en-US')}`),
        h('p', {}, 'Pool\'s share ', h('strong', { 'data-claim': 'sm-sim-share' }, pct(ci.mean, 2)), ' · 95% interval from the batch means ', h('strong', { 'data-claim': 'sm-sim-ci' }, `[${pct(ci.lo, 2)}, ${pct(ci.hi, 2)}]`)),
        h('p', {}, `Equation (8) gives ${pct(R, 2)}, ${R >= ci.lo && R <= ci.hi ? 'inside' : 'outside'} this interval — observed in this experiment, not a test.`),
      ),
    );
    simShown = true;
  });

  root.append(
    panelIntro(
      'Selfish mining',
      'Bitcoin\'s rule is to publish a block the moment you find it. Eyal and Sirer showed that a pool which breaks the rule can earn more than its share. The pool keeps its blocks secret and mines ahead. When the honest network catches up to within one block, the pool publishes and the honest miners\' work is wasted. Because the honest network wastes work, the pool\'s share of the blocks that end up in the chain grows.',
      'γ is the pool\'s luck in a tie: when two blocks of the same height race, the share of honest miners who happen to build on the pool\'s block. With γ = 0 the pool loses every tie and still profits above one third of the hash power.',
    ),
    h(
      'div',
      { class: 'controls' },
      control('sm-alpha', 'Pool\'s share of hash power, α', aIn, 'A decimal from 0 to 0.5.'),
      control('sm-gamma', 'Tie-breaking, γ', selectWrap(gSel)),
    ),
    out,
    chartBox,
    values,
    h('h3', {}, 'The state machine, simulated'),
    h(
      'p',
      { class: 'help' },
      'Block by block: the pool finds the next block with probability α. Its private lead goes up; when others find a block the pool publishes to stay ahead, as in the paper\'s state machine. The simulation counts which blocks end up in the chain. Randomness: crypto.getRandomValues.',
    ),
    h('div', { class: 'action-row spaced' }, simBtn),
    simOut,
    note(
      'info',
      'Not the best a pool can do. Sapirshtein, Sompolinsky and Zohar found strategies that earn more than this one and profit from a smaller share: the threshold is strictly lower than Eyal and Sirer\'s. In a model with block-propagation delay, they find the threshold disappears.',
    ),
    threatModel({
      attacker: 'A pool with a share α of the hash power that withholds blocks and publishes them selectively.',
      access: 'The paper\'s simplified model: blocks arrive one at a time, γ fixes who wins a tie, no propagation delay.',
      trusted: 'Every other miner follows the protocol.',
      success: 'The pool\'s share of the blocks in the final chain exceeds α.',
      notShown: 'Optimal strategies, difficulty adjustment (which changes the rewards over time), the countermeasure the paper proposes, or what any real pool does.',
    }),
  );
  compute();
}
