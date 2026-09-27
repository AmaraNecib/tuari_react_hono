import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the contracts package.
 *
 * This package runs through `turbo test` like the others, so it needs the same
 * worker cap: without a config it starts `availableParallelism() - 1` workers,
 * which is 11 on a 12-thread machine — enough to starve every other process on
 * a shared developer machine.
 */
export default defineConfig({
  test: {
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
  },
});
