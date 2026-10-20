import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

import type { Plugin } from "vite";

export const LOCAL_CATALOGUE_ID = "virtual:local-component-catalogue";
/** `data/local/evidence/*.dat` -- measured datasets a student holds privately
 *  (DEV.md 4c C117, docs/design/evidence-as-a-first-class-object.md section 7).
 *  Each entry is `{ file, body }`: the FILENAME is the dataset's id, so it
 *  travels with the text. */
export const LOCAL_EVIDENCE_ID = "virtual:local-evidence";
/** `data/local/parameters/<MODEL>/<a>-<b>.dat` -- the private tier of the
 *  binary-pair catalogue (the engine reads it, announced `[local] UNVERIFIED`).
 *  Each entry is `{ file, body }` with `file` relative to `parameters/`
 *  (`NRTL/methanol-water.dat`), so the model folder is readable. */
export const LOCAL_PAIRS_ID = "virtual:local-pair-parameters";

interface VirtualDir {
  id: string;
  directory: string;
  /** `bodies`: a plain string[] (the component catalogue's shape, unchanged);
   *  `files`: `{ file, body }[]` with the path relative to the directory. */
  shape: "bodies" | "files";
  recursive: boolean;
}

/** Every `.dat` under `dir` (optionally recursive), sorted by path. */
function datFiles(dir: string, recursive: boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (recursive && statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".dat")) out.push(p);
    }
  };
  walk(dir);
  return out.sort((a, b) => a.localeCompare(b));
}

/** Bundle the PRIVATE working tier (`data/local/`, gitignored) as virtual
 * modules -- the unverified components the CompoundBrowser shows below the
 * curated standards, under the SAME word the engine announces them with
 * (`[local] ... UNVERIFIED`, Database.cpp), and since 2026-10-20 the private
 * EVIDENCE (`data/local/evidence/*.dat`) and PAIR PARAMETERS
 * (`data/local/parameters/**\/*.dat`) the Property Explorer's Evidence view
 * reads.  The tier was called `data/proposed/` until 2026-07-13; the directory
 * moved that day, but the NAMES did not, and a browser badge reading
 * "proposed" went on describing a tier the data architecture had retired.
 * Importing every .dat through import.meta.glob makes Rollup transform one
 * module per file and exhausts the default Node heap once the open catalogue
 * grows beyond a few hundred files; the browser still receives the original
 * raw strings and the GUI parses them with Choupo's dict parser -- only the
 * build graph is compacted.  NO new grammar: each file's own header is what
 * the GUI reads (the dataset grammar `bin/choupo-thermoml extract-vle`
 * writes, the pair-record grammar `fitParameters` promotes).
 *
 * The directories are OPTIONAL: a clean public checkout ships `data/local/`
 * EMPTY (README + .gitkeep only), so an absent/empty dir yields an EMPTY
 * module -- the browser then shows only the public standards and the
 * evidence the bundled tutorials carry, and NO private data is baked into the
 * deployed bundle.  A dev machine with a populated `data/local/` sees its own
 * tier (build the public site from a clean clone to keep it out). */
export function localCataloguePlugin(): Plugin {
  const local = fileURLToPath(new URL("../../data/local", import.meta.url));
  const dirs: VirtualDir[] = [
    { id: LOCAL_CATALOGUE_ID, directory: resolve(local, "components"),
      shape: "bodies", recursive: false },
    { id: LOCAL_EVIDENCE_ID, directory: resolve(local, "evidence"),
      shape: "files", recursive: false },
    { id: LOCAL_PAIRS_ID, directory: resolve(local, "parameters"),
      shape: "files", recursive: true },
  ];
  const resolvedId = (id: string) => `\0${id}`;
  const byResolved = new Map(dirs.map((d) => [resolvedId(d.id), d]));

  return {
    name: "choupo-local-component-catalogue",
    resolveId(id) {
      return dirs.some((d) => d.id === id) ? resolvedId(id) : null;
    },
    // Watch the DIRECTORIES through the dev server's chokidar watcher, never
    // through addWatchFile: a directory registered as a module dependency
    // makes Vite's dev import-analysis try to RESOLVE it as an absolute
    // import and the virtual module 500s -- the Explore chunk then fails to
    // load in the browser (production builds were unaffected; dev only).
    configureServer(server) {
      for (const d of dirs) server.watcher.add(d.directory);
      const invalidate = (path: string) => {
        for (const d of dirs) {
          if (!path.startsWith(d.directory)) continue;
          const mod = server.moduleGraph.getModuleById(resolvedId(d.id));
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
      };
      server.watcher.on("add", invalidate);
      server.watcher.on("unlink", invalidate);
      server.watcher.on("change", invalidate);
    },
    load(id) {
      const d = byResolved.get(id);
      if (!d) return null;
      const files = datFiles(d.directory, d.recursive);
      for (const path of files) this.addWatchFile(path);
      if (d.shape === "bodies") {
        const bodies = files.map((path) => readFileSync(path, "utf8"));
        return `export default ${JSON.stringify(bodies)};`;
      }
      const entries = files.map((path) => ({
        file: relative(d.directory, path).split("\\").join("/"),
        body: readFileSync(path, "utf8"),
      }));
      return `export default ${JSON.stringify(entries)};`;
    },
  };
}
