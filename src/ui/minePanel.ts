import { blockHeader, leadingZeroBits, mine, verifyBlock, type MineResult } from '../pow/mine';
import { clear, control, evidenceRetired, field, h, note, panelIntro, select, selectWrap, threatModel, toneChip, verdict } from './dom';

interface Block {
  text: string;
  readonly prevHex: string | null;
  readonly nonce: number;
  readonly bits: number;
}

const DEFAULT_TEXT = (i: number): string => `crypto-lab consensus arena block ${i}`;

export function renderMinePanel(root: HTMLElement): void {
  const chain: Block[] = [];
  let current: { text: string; bits: number; nonce: number; prevHex: string | null } | null = null;
  let running: { cancelled: boolean } | null = null;

  const text = h('input', { id: 'mine-header', class: 'mono-input wide', type: 'text', value: DEFAULT_TEXT(0), autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const bits = select('mine-bits', [['8', '8 bits (about 256 tries)'], ['12', '12 bits (about 4 096)'], ['16', '16 bits (about 65 000)'], ['20', '20 bits (about a million)'], ['24', '24 bits (about 17 million)']], '12');
  const budget = select('mine-budget', [['1', '1 second'], ['5', '5 seconds'], ['15', '15 seconds']], '15');
  const run = h('button', { class: 'btn btn-primary', type: 'button', id: 'mine-run' }, 'Mine') as HTMLButtonElement;
  const cancel = h('button', { class: 'btn btn-ghost', type: 'button', id: 'mine-cancel', disabled: true }, 'Cancel') as HTMLButtonElement;
  const progress = h('p', { class: 'help', id: 'mine-progress', role: 'status', 'aria-live': 'polite' });
  const out = h('div', { class: 'output', id: 'mine-out' });
  const hashed = h('p', { class: 'help', id: 'mine-hashed' });

  const append = h('button', { class: 'btn btn-primary', type: 'button', id: 'chain-append', disabled: true }, 'Add this block to the chain') as HTMLButtonElement;
  const tamper = h('button', { class: 'btn btn-ghost', type: 'button', id: 'chain-tamper', disabled: true }, 'Rewrite block 0') as HTMLButtonElement;
  const reset = h('button', { class: 'btn btn-ghost', type: 'button', id: 'chain-reset', disabled: true }, 'Start a new chain') as HTMLButtonElement;
  const chainList = h('ol', { class: 'chain', id: 'chain', 'aria-label': 'The chain, oldest block first' });
  const chainNote = h('div', { id: 'chain-note' });

  const prevHash = async (): Promise<string | null> => {
    if (!chain.length) return null;
    const last = chain[chain.length - 1];
    return (await verifyBlock(blockHeader(last.text, last.prevHex), last.nonce, last.bits)).hashHex;
  };

  const showHashed = async (): Promise<void> => {
    const prev = await prevHash();
    hashed.textContent = `Bytes hashed: the ASCII text ${prev ? 'after the previous block\'s hash and a "|"' : 'exactly as typed'}, then the nonce as 8 bytes, big-endian.`;
  };

  const retire = (): void => {
    if (!current) return;
    current = null;
    append.disabled = true;
    clear(out);
    out.append(evidenceRetired('The header or difficulty changed, so the nonce found earlier no longer belongs to what is on screen. Mine again.'));
  };
  text.addEventListener('input', retire);
  bits.addEventListener('change', retire);

  const showResult = async (r: MineResult, header: string, b: number): Promise<void> => {
    clear(out);
    if (!r.found) {
      out.append(
        r.reason === 'budget'
          ? verdict('alarm', `Not mined within the budget of ${budget.value} s.`)
          : verdict('alarm', 'Cancelled before a valid nonce was found.'),
        field('Nonces tried', r.tries.toLocaleString('en-US'), { mono: false }),
        note('info', `This says nothing about whether a valid nonce exists — only that nonces 0 to ${(r.tries - 1).toLocaleString('en-US')} were tried and none had ${b} leading zero bits. Each extra bit doubles the expected work.`),
      );
      return;
    }
    // Invariant 1: validity is re-checked by hashing again, separately from the search.
    const check = await verifyBlock(header, r.nonce, b);
    const zeros = leadingZeroBits(Uint8Array.from(check.hashHex.match(/../g)!.map((x) => parseInt(x, 16))));
    out.append(
      check.ok && check.hashHex === r.hashHex
        ? verdict('pass', `Found a valid nonce. Hashed again separately: ${zeros} leading zero bits, at least the ${b} required.`)
        : verdict('fail', 'The search reported a nonce, but hashing it again does not meet the target.'),
      h(
        'div',
        { class: 'readout' },
        h('p', {}, 'Nonce ', h('strong', { 'data-claim': 'nonce' }, String(r.nonce))),
        field('SHA-256 hash', check.hashHex, { sub: '(hex)' }),
        h('p', {}, 'Leading zero bits ', h('strong', { 'data-claim': 'zero-bits' }, String(zeros)), ` · nonces tried ${r.tries.toLocaleString('en-US')} · ${(r.ms / 1000).toFixed(2)} s`),
      ),
    );
    out.querySelector('.field-value')?.setAttribute('data-claim', 'hash');
  };

  run.addEventListener('click', async () => {
    const b = Number(bits.value);
    const prev = await prevHash();
    const t = text.value;
    const header = blockHeader(t, prev);
    running = { cancelled: false };
    run.disabled = true;
    cancel.disabled = false;
    append.disabled = true;
    current = null;
    clear(out);
    progress.textContent = 'Mining…';
    const r = await mine(header, b, {
      budgetMs: Number(budget.value) * 1000,
      signal: running,
      onProgress: (n) => (progress.textContent = `Mining… ${n.toLocaleString('en-US')} nonces tried`),
    });
    running = null;
    run.disabled = false;
    cancel.disabled = true;
    progress.textContent = r.found ? 'Done.' : 'Stopped.';
    await showResult(r, header, b);
    if (r.found) {
      current = { text: t, bits: b, nonce: r.nonce, prevHex: prev };
      append.disabled = false;
    }
  });
  cancel.addEventListener('click', () => {
    if (running) running.cancelled = true;
  });

  const renderChain = async (): Promise<void> => {
    clear(chainList);
    clear(chainNote);
    const now: string[] = [];
    let broken = 0;
    for (let i = 0; i < chain.length; i++) {
      const blk = chain[i];
      const v = await verifyBlock(blockHeader(blk.text, blk.prevHex), blk.nonce, blk.bits);
      now.push(v.hashHex);
      const linkOk = i === 0 ? blk.prevHex === null : blk.prevHex === now[i - 1];
      if (!v.ok || !linkOk) broken++;
      chainList.append(
        h(
          'li',
          { class: 'block-card', 'data-block': String(i), 'data-work': v.ok ? 'ok' : 'broken', 'data-link': linkOk ? 'ok' : 'broken' },
          h('h4', {}, `Block ${i}`),
          field('Text', blk.text, { mono: false }),
          field('Previous block\'s hash, as stored', blk.prevHex ?? '(none — first block)'),
          field('Nonce', String(blk.nonce)),
          field('Hash now', v.hashHex),
          h(
            'p',
            { class: 'chip-row' },
            toneChip(v.ok ? 'optimal' : 'alarm', v.ok ? `work valid (${blk.bits} bits)` : 'work no longer valid', `block-${i}-work`),
            ' ',
            toneChip(linkOk ? 'optimal' : 'alarm', linkOk ? (i === 0 ? 'first block' : 'links to block ' + (i - 1)) : `link to block ${i - 1} broken`, `block-${i}-link`),
          ),
        ),
      );
    }
    tamper.disabled = chain.length < 2 || chain[0].text.endsWith(' — rewritten');
    reset.disabled = chain.length === 0;
    if (broken) {
      chainNote.append(
        note('danger', `Rewriting block 0 changed its hash, so block 1 no longer points at it. The work badge shows whether the old nonce happened to meet the target for the new header. To make the rewrite stick, an attacker must redo the work for block 0 and for every block after it — and then out-pace everyone else who is still extending the honest chain. That race is the next exhibit.`),
      );
    }
  };

  append.addEventListener('click', async () => {
    if (!current) return;
    chain.push({ text: current.text, prevHex: current.prevHex, nonce: current.nonce, bits: current.bits });
    current = null;
    append.disabled = true;
    clear(out);
    text.value = DEFAULT_TEXT(chain.length);
    await renderChain();
    await showHashed();
  });
  tamper.addEventListener('click', async () => {
    chain[0].text = `${chain[0].text} — rewritten`;
    tamper.disabled = true;
    await renderChain();
  });
  reset.addEventListener('click', async () => {
    chain.length = 0;
    current = null;
    clear(out);
    text.value = DEFAULT_TEXT(0);
    await renderChain();
    await showHashed();
  });

  root.append(
    panelIntro(
      'Mine a block',
      'Proof of work is a search. Take the block\'s contents, add a number called the nonce, and hash them. If the hash starts with enough zero bits, the block is valid; if not, try the next nonce. Finding one takes, on average, 2 to the power of the number of zero bits tries. Checking one takes a single hash.',
      'That asymmetry is the whole idea: the work is expensive to do and cheap for everyone else to verify, so a chain of such blocks is a record of effort that cannot be faked after the fact.',
    ),
    h(
      'div',
      { class: 'controls' },
      control('mine-header', 'Block text', text, 'ASCII text. Changing it changes every hash.'),
      control('mine-bits', 'Difficulty: leading zero bits required', selectWrap(bits)),
      control('mine-budget', 'Time budget', selectWrap(budget), 'The search stops here and reports what it tried.'),
    ),
    hashed,
    h('div', { class: 'action-row spaced' }, run, ' ', cancel),
    progress,
    out,
    h('h3', {}, 'The chain'),
    h('p', { class: 'help' }, 'Each block after the first hashes the previous block\'s hash in front of its own text, so every block commits to all the blocks before it.'),
    h('div', { class: 'action-row spaced' }, append, ' ', tamper, ' ', reset),
    chainList,
    chainNote,
    threatModel({
      attacker: 'The text of a block already in the chain (the "Rewrite block 0" button).',
      access: 'The same SHA-256 everyone uses; no shortcut to a valid nonce other than trying them.',
      trusted: 'SHA-256 behaving like a random function — no one can aim at a hash with many leading zeros.',
      success: 'A rewritten block whose work and links all verify again.',
      notShown: 'How fast real miners hash, a real network, or Bitcoin\'s block format.',
    }),
    note(
      'caveat',
      'A toy. Bitcoin hashes a serialized 80-byte header with double SHA-256, encodes its target compactly and prints hashes byte-reversed; none of that is implemented. Difficulty adjustment — retargeting the difficulty from how long recent blocks took — is not built here.',
    ),
  );
  void showHashed();
}
