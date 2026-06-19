import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The compound catalogue eagerly parses ~380 .dat files at module load;
    // tests that vi.resetModules() (session restore) re-parse it per test, which
    // under heavy parallel load can exceed the 5 s default.  Give honest headroom.
    testTimeout: 20000,
  },
});
