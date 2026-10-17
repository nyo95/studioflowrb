import { normalize } from 'node:path';

// Exact files only: a typo/empty selector must never silently run zero tests.
export function selectTests(available, requested) {
  const known = new Set(available.map((file) => normalize(file)));
  const selected = requested.length ? [...new Set(requested.map((file) => normalize(file)))] : [...known];
  for (const file of selected) {
    if (!known.has(file)) throw new Error(`Unknown test file: ${file}`);
  }
  if (!selected.length) throw new Error('No tests discovered');
  return selected;
}
