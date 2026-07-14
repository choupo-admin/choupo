import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { proposedCataloguePlugin } from "./scripts/proposedCataloguePlugin.js";

export default defineConfig({
  plugins: [proposedCataloguePlugin(), react()],
  server: {
    port: 5173,
    // strictPort: a stale vite left on 5173 used to make the new one drift to
    // 5174 silently -- the browser stayed on the OLD server (old JS, e.g. layout
    // auto-save missing).  Fail loudly instead so a restart always reclaims 5173.
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      // The `.cho` layout marker is GUI view-state the app writes ITSELF on
      // every stream drag (auto-save to the case folder).  Vite must NOT treat
      // it as a source change, or HMR reloads the case mid-drag -- a loop.
      ignored: ["**/*.cho"],
    },
    fs: {
      // The tutorial library lives one level up at Choupo/tutorials/;
      // bundling it via import.meta.glob requires Vite to be allowed to read
      // outside its project root.
      allow: [".."],
    },
  },
  build: {
    outDir: "dist",
    // Production embeds the complete offline tutorial corpus.  Emitting a
    // source map for that generated 35+ MB string table more than doubles the
    // artefact and drives Rollup beyond Node's 4 GB heap.  Vite development
    // retains normal source mapping; the static release does not ship it.
    sourcemap: false,
    target: "es2022",
  },
});
