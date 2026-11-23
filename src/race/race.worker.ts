/// <reference lib="webworker" />
import { DEFAULT_RNG } from '../rng';
import { simulateRace } from './nakamoto';

/**
 * The double-spend Monte Carlo off the main thread: a million trials take seconds,
 * and near q = 1/2 a single trial can take thousands of steps. The page can terminate
 * this worker at any time (Cancel, or an edit that retires the run).
 */
self.onmessage = (e: MessageEvent<{ q: number; z: number; n: number; budgetMs: number }>) => {
  const { q, z, n, budgetMs } = e.data;
  postMessage(simulateRace(q, z, n, DEFAULT_RNG, budgetMs));
};
