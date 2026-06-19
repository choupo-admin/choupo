import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
    sourcemap: true,
    target: "es2022",
  },
});
