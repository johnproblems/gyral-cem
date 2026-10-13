import { defineConfig } from 'vitest/config';

// Several suites shell out to `tsc` or run the built CLI end to end, so
// individual tests legitimately take multiple seconds. The 5s default
// flakes on loaded CI runners; give them comfortable headroom.
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
