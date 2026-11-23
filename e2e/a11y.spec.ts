import { expect, test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches: the intro; mining block 0 at
 * 12 bits, a two-block chain, block 0 rewritten with its broken chips, a
 * search stopped by the time budget and a result retired by an edit; the
 * double-spend table and the majority fixture, a simulation with its interval,
 * q ≥ 0.5 and an invalid q; the selfish-mining chart, its value table, a
 * simulation and an out-of-range α; quorums safe, unsafe with the failure
 * schedule, not live, refused and 31 nodes wide; the proof-of-stake epoch;
 * three hover states and two focus rings. Every state is scanned at desktop
 * and phone width. See `gate.ts` for why nothing is injected, nothing is
 * revealed from script, and `violations` is not the whole oracle.
 */

for (const theme of ['dark'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    test.setTimeout(1_800_000);
    const errors = watchPageErrors(page);
    await boot(page, theme);
    await driveAllStates(page, theme);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    test.setTimeout(1_800_000);
    const errors = watchPageErrors(page);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });
}
