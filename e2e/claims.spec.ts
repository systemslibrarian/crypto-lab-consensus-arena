import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { boot } from './gate';

/**
 * The claims suite (§4.1b): what this lab's interface SAYS, checked against published
 * values (the tables printed in §11 of the Bitcoin paper) or re-derived here by a route
 * the source does not take. The arithmetic below is written separately from src/, so a
 * test cannot agree with a bug by recomputing the same expression the page uses.
 */

const text = async (page: Page, sel: string): Promise<string> => (await page.locator(sel).first().innerText()).trim();

async function openTab(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

/** §11 before the paper's rearrangement: Σ_k Poisson(k; λ)·min(1, (q/p)^(z−k)), far tail included. */
function unrearranged(q: number, z: number): number {
  const p = 1 - q;
  const lambda = (z * q) / p;
  let total = 0;
  let pois = Math.exp(-lambda);
  for (let k = 0; k < 400; k++) {
    if (k > 0) pois *= lambda / k;
    total += pois * (k > z ? 1 : (q / p) ** (z - k));
  }
  return total;
}

/** Bytes as the page says it hashes them: ASCII text, then the nonce as 8 bytes big-endian. */
function sha(header: string, nonce: number): string {
  const n = Buffer.alloc(8);
  n.writeBigUInt64BE(BigInt(nonce));
  return createHash('sha256').update(Buffer.concat([Buffer.from(header, 'ascii'), n])).digest('hex');
}

async function mineOnce(page: Page): Promise<void> {
  await page.locator('#mine-run').click();
  await expect(page.locator('#mine-run')).toBeEnabled({ timeout: 30_000 });
}

test.describe('displayed claims', () => {
  test('mining the brief\'s header at 12 bits prints nonce 11506, and the printed hash re-hashes here', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Mine a block/);
    await expect(page.locator('#mine-header')).toHaveValue('crypto-lab consensus arena block 0');
    await mineOnce(page);
    await expect(page.locator('[data-claim="nonce"]')).toHaveText('11506');
    const printed = await text(page, '[data-claim="hash"]');
    expect(printed).toBe(sha('crypto-lab consensus arena block 0', 11506));
    expect(printed).toBe('0000930938fce6ffb67d4085ceccc86b3489225fa5fdf0aac4ab0835de0ec531');
    expect(BigInt(`0x${printed}`) < 1n << 244n).toBe(true);
    await expect(page.locator('[data-claim="zero-bits"]')).toHaveText('16');
    await expect(page.locator('#mine-out .verdict-pass')).toHaveCount(1);
  });

  test('a difficulty above the budget is "not mined within the budget", with the nonces tried', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Mine a block/);
    await page.locator('#mine-bits').selectOption('24');
    await page.locator('#mine-budget').selectOption('1');
    await mineOnce(page);
    await expect(page.locator('#mine-out .verdict-alarm')).toContainText('Not mined within the budget of 1 s');
    await expect(page.locator('[data-claim="nonce"]')).toHaveCount(0);
    await expect(page.locator('#mine-out')).toContainText('says nothing about whether a valid nonce exists');
  });

  test('editing the block text retires the mined result, and the page says it did', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Mine a block/);
    await mineOnce(page);
    await expect(page.locator('#chain-append')).toBeEnabled();
    await page.locator('#mine-header').fill('crypto-lab consensus arena block 0!');
    await expect(page.locator('[data-claim="nonce"]')).toHaveCount(0);
    await expect(page.locator('#mine-out .evidence-retired')).toContainText('no longer belongs');
    await expect(page.locator('#chain-append')).toBeDisabled();
  });

  test('rewriting block 0 breaks its work and block 1\'s link, recomputed here', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Mine a block/);
    await mineOnce(page);
    await page.locator('#chain-append').click();
    await expect(page.locator('#mine-header')).toHaveValue('crypto-lab consensus arena block 1');
    await mineOnce(page);
    await page.locator('#chain-append').click();
    await expect(page.locator('.block-card')).toHaveCount(2);
    await expect(page.locator('.block-card[data-work="ok"][data-link="ok"]')).toHaveCount(2);
    // Block 1 stored block 0's hash; recompute it here from block 0's printed nonce.
    const stored = await page.locator('.block-card[data-block="1"] .field-value').nth(1).innerText();
    expect(stored).toBe(sha('crypto-lab consensus arena block 0', 11506));
    await page.locator('#chain-tamper').click();
    await expect(page.locator('.block-card[data-block="1"]')).toHaveAttribute('data-link', 'broken');
    const rewritten = sha('crypto-lab consensus arena block 0 — rewritten', 11506);
    expect(rewritten).not.toBe(stored);
    const zeroBits12 = BigInt(`0x${rewritten}`) < 1n << 244n;
    await expect(page.locator('.block-card[data-block="0"]')).toHaveAttribute('data-work', zeroBits12 ? 'ok' : 'broken');
    await expect(page.locator('#chain-note .callout-danger')).toContainText('redo the work for block 0 and for every block after it');
  });

  test('the double-spend table at q = 0.1 is the table printed in §11 of the Bitcoin paper', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Double-spend race/);
    const paper = ['1.0000000', '0.2045873', '0.0509779', '0.0131722', '0.0034552', '0.0009137', '0.0002428', '0.0000647', '0.0000173', '0.0000046', '0.0000012'];
    for (let z = 0; z <= 10; z++) await expect(page.locator(`[data-claim="table-p-${z}"]`)).toHaveText(paper[z]);
    await expect(page.locator('[data-claim="least-z"]')).toHaveText('5'); // the paper: q = 0.10 → z = 5
  });

  test('q = 0.3: least z for P < 0.1% is 24 (the paper), and P printed for z = 6 matches the unrearranged sum', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Double-spend race/);
    await page.locator('#race-q').fill('0.3');
    await expect(page.locator('[data-claim="least-z"]')).toHaveText('24');
    await expect(page.locator('[data-claim="p-exact"]')).toHaveText(unrearranged(0.3, 6).toFixed(7));
    await page.locator('#race-z').fill('5');
    await expect(page.locator('[data-claim="p-exact"]')).toHaveText('0.1773523'); // the paper, q = 0.3, z = 5
  });

  test('q ≥ 0.5: P = 1 and the page explains why', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Double-spend race/);
    await page.locator('#race-q').fill('0.499');
    await expect(page.locator('[data-claim="least-z"]')).toHaveText('not reached within 1000 confirmations');
    await page.locator('#race-q').fill('0.5');
    await expect(page.locator('[data-claim="p-exact"]')).toHaveText('1.0000000');
    await expect(page.locator('#race-exact .verdict-alarm')).toContainText('catches up with certainty');
    await expect(page.locator('[data-claim="least-z"]')).toContainText('none');
    await page.locator('#race-q').fill('1.5');
    await expect(page.locator('#race-q')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#race-exact .verdict-fail')).toHaveCount(1);
  });

  test('the simulation prints N, an estimate and a 95% interval around it, labelled an observation', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Double-spend race/);
    await page.locator('#race-z').fill('2');
    await page.locator('#race-n').selectOption('10000');
    await page.locator('#race-sim').click();
    await expect(page.locator('[data-claim="sim-n"]')).toHaveText('10,000');
    const wins = Number((await text(page, '[data-claim="sim-wins"]')).replace(/,/g, ''));
    expect(Number(await text(page, '[data-claim="sim-est"]'))).toBeCloseTo(wins / 10000, 7);
    const [lo, hi] = (await text(page, '[data-claim="sim-ci"]')).replace(/[[\]]/g, '').split(', ').map(Number);
    expect(lo).toBeLessThanOrEqual(wins / 10000);
    expect(hi).toBeGreaterThanOrEqual(wins / 10000);
    await expect(page.locator('#race-sim-out')).toContainText('observed in this experiment, not a test');
  });

  test('changing q retires the simulation, and the page says it did', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Double-spend race/);
    await page.locator('#race-n').selectOption('10000');
    await page.locator('#race-sim').click();
    await expect(page.locator('[data-claim="sim-n"]')).toHaveCount(1);
    await page.locator('#race-q').fill('0.2');
    await expect(page.locator('[data-claim="sim-n"]')).toHaveCount(0);
    await expect(page.locator('#race-sim-out .evidence-retired')).toContainText('different race');
  });

  test('the negative claim: six confirmations are reversible by a majority, and selfish mining pays before 50%', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Double-spend race/);
    const fixture = page.locator('#majority-fixture');
    // 1. Reached.
    await expect(fixture).toBeVisible();
    // 2. Every check the merchant applies passes, in both columns.
    const rules = await fixture.locator('[data-verdict$="-rule"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tone')));
    expect(rules).toEqual(['optimal', 'optimal']);
    await expect(fixture.locator('[data-verdict="fx-minor-risk"]')).toHaveAttribute('data-tone', 'optimal');
    expect(await text(page, '[data-claim="fx-minor-p"]')).toBe('0.0002428'); // the paper, q = 0.1, z = 6
    expect(await text(page, '[data-claim="fx-major-p"]')).toBe('1.0000000');
    expect(unrearranged(0.1, 6)).toBeCloseTo(0.0002428, 7);
    // The selfish threshold the claim cites, recomputed: (1 − γ)/(3 − 2γ) at γ = 0.
    expect(await text(page, '[data-claim="fixture-threshold"]')).toBe(`${((1 / 3) * 100).toFixed(1)}%`);
    // 3. The limitation is on screen, in that state, tied to the fixture.
    const claim = fixture.locator('[data-negative-claim="majority"]');
    await expect(claim).toBeVisible();
    await expect(claim).toContainText('CONFIRMED — AND REVERSIBLE BY A MAJORITY');
    await expect(claim).toContainText('Six confirmations make a double spend unlikely against a 10% attacker. They do nothing against a majority — and selfish mining pays well before 50%.');
  });

  test('selfish mining: threshold 25.0% at γ = ½, and equation (8) recomputed here', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /Selfish mining/);
    await page.locator('#sm-gamma').selectOption('0.5');
    await expect(page.locator('[data-claim="sm-threshold"]')).toHaveText('25.0%');
    // Equation (8) of Eyal–Sirer, typed here from the paper.
    const eq8 = (a: number, g: number): number => (a * (1 - a) ** 2 * (4 * a + g * (1 - 2 * a)) - a ** 3) / (1 - a * (1 + (2 - a) * a));
    await page.locator('#sm-alpha').fill('0.3');
    await expect(page.locator('[data-claim="sm-revenue"]')).toHaveText(`${(eq8(0.3, 0.5) * 100).toFixed(2)}%`);
    await expect(page.locator('[data-verdict="sm-verdict"]')).toHaveAttribute('data-tone', 'alarm');
    await page.locator('#sm-alpha').fill('0.2');
    await expect(page.locator('[data-claim="sm-revenue"]')).toHaveText(`${(eq8(0.2, 0.5) * 100).toFixed(2)}%`);
    expect(eq8(0.2, 0.5)).toBeLessThan(0.2);
    await expect(page.locator('[data-verdict="sm-verdict"]')).toHaveAttribute('data-tone', 'optimal');
    await page.locator('#sm-alpha').fill('0.7');
    await expect(page.locator('#sm-out .verdict-fail')).toHaveCount(1);
  });

  test('quorums: n = 6, f = 2, Q = 4 is flagged with a named protocol whose vote counts reach Q; n = 7 with Q = n − f is safe', async ({ page }) => {
    await boot(page, 'dark');
    await openTab(page, /BFT quorums/);
    await expect(page.locator('[data-claim="q-intersection"]')).toHaveText('2'); // n = 4, f = 1, Q = 3
    await page.locator('#q-n').fill('6');
    await page.locator('#q-f').fill('2');
    await page.locator('#q-q').fill('4');
    await expect(page.locator('[data-claim="q-intersection"]')).toHaveText(String(2 * 4 - 6));
    await expect(page.locator('[data-verdict="q-safe"]')).toHaveAttribute('data-tone', 'alarm');
    await expect(page.locator('#q-schedule')).toContainText('PBFT-style');
    await expect(page.locator('#q-schedule')).toContainText('asynchronous');
    const steps = await page.locator('#q-steps li').allInnerTexts();
    for (const line of [steps[3], steps[4]]) {
      const [, a, b, sum] = /(\d+) honest \+ (\d+) faulty = (\d+) votes/.exec(line)!;
      expect(Number(a) + Number(b)).toBe(Number(sum));
      expect(Number(sum)).toBe(4);
    }
    // The faulty nodes drawn sit in the overlap.
    await expect(page.locator('.node[data-in="both"][data-faulty="true"]')).toHaveCount(2);
    await page.locator('#q-n').fill('7');
    await page.locator('#q-std').click();
    await expect(page.locator('#q-q')).toHaveValue('5');
    await expect(page.locator('[data-claim="q-intersection"]')).toHaveText('3');
    await expect(page.locator('[data-verdict="q-safe"]')).toHaveAttribute('data-tone', 'optimal');
    await expect(page.locator('#q-schedule')).toBeEmpty();
    await page.locator('#q-f').fill('0');
    await page.locator('#q-q').fill('2');
    await expect(page.locator('#q-schedule')).toContainText('no faulty participants');
    await expect(page.locator('#q-steps')).toHaveCount(0);
  });
});
