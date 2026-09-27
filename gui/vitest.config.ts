import { defineConfig } from "vitest/config";
import { localCataloguePlugin } from "./scripts/localCataloguePlugin.js";

export default defineConfig({
  plugins: [localCataloguePlugin()],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The compound catalogue eagerly parses hundreds of .dat files at module load;
    // tests that vi.resetModules() (session restore) re-parse it per test, which
    // under heavy parallel load can exceed the 5 s default.  Give honest headroom.
    testTimeout: 20000,
    // Four test files read run outputs the engine WRITES (txy.csv,
    // ternary.csv, trajectory.csv, a sweep CSV) -- gitignored, never
    // committed.  This setup GENERATES them from this tree's native build
    // before any test loads, or marks them REFUSED with the remedy.  The
    // contract and the list: tests/witnessOutputs.ts.
    globalSetup: ["tests/witnessSetup.ts"],
  },
});
