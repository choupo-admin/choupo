import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { build, type Plugin } from "vite";

export const LAYOUT_VIEWER_ID = "virtual:layout-viewer";
const RESOLVED_ID = `\0${LAYOUT_VIEWER_ID}`;

const ENTRY = fileURLToPath(new URL("../src/export/layoutViewer.ts", import.meta.url));
const GUI_ROOT = fileURLToPath(new URL("..", import.meta.url));
const THREE_DIR = fileURLToPath(new URL("../node_modules/three/", import.meta.url));

export interface LayoutViewerBundleOut {
  script: string;
  threeVersion: string;
  threeLicence: string;
  /** Absolute paths of every module compiled in (for the dev watcher). */
  modules: string[];
}

/** Compile the exported page's viewer (DEV.md 4c C81): src/export/
 * layoutViewer.ts with three.js and Choupo's own drawing, as ONE minified
 * IIFE string -- the script "Export as page" inlines, so the page opens
 * offline.  It is Vite's own build, run with no config file (so none of the
 * app's plugins and no public directory ride into it) and written nowhere;
 * three.js's version and its LICENSE are read from the installed package,
 * because the MIT notice must travel with every copy of the code. */
export async function bundleLayoutViewer(): Promise<LayoutViewerBundleOut> {
  const out = await build({
    configFile: false,
    root: GUI_ROOT,
    logLevel: "silent",
    publicDir: false,
    build: {
      write: false,
      emptyOutDir: false,
      copyPublicDir: false,
      reportCompressedSize: false,
      minify: "esbuild",
      target: "es2020",
      lib: { entry: ENTRY, formats: ["iife"], name: "ChoupoLayoutViewer",
             fileName: () => "layoutViewer.js" },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const results = Array.isArray(out) ? out : [out];
  const chunk = results
    .flatMap((r) => ("output" in r ? r.output : []))
    .find((o) => o.type === "chunk");
  if (!chunk || chunk.type !== "chunk")
    throw new Error("layoutViewerPlugin: the viewer build produced no script");
  const pkg = JSON.parse(readFileSync(`${THREE_DIR}package.json`, "utf8")) as { version: string };
  return {
    script: chunk.code,
    threeVersion: pkg.version,
    threeLicence: readFileSync(`${THREE_DIR}LICENSE`, "utf8"),
    modules: Object.keys(chunk.modules),
  };
}

/** `import("virtual:layout-viewer")` -- the compiled viewer as data, so the
 * app loads it (a lazy chunk) only when somebody exports a layout. */
export function layoutViewerPlugin(): Plugin {
  return {
    name: "choupo-layout-viewer",
    resolveId(id) {
      return id === LAYOUT_VIEWER_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      const b = await bundleLayoutViewer();
      //  In dev, editing the drawing or the mapping rebuilds the string.
      for (const m of b.modules) if (!m.startsWith("\0")) this.addWatchFile(m);
      return `export const script = ${JSON.stringify(b.script)};\n`
        + `export const threeVersion = ${JSON.stringify(b.threeVersion)};\n`
        + `export const threeLicence = ${JSON.stringify(b.threeLicence)};\n`;
    },
  };
}
