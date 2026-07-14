import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import type { Plugin } from "vite";

export const PROPOSED_CATALOGUE_ID = "virtual:proposed-component-catalogue";
const RESOLVED_ID = `\0${PROPOSED_CATALOGUE_ID}`;

/** Bundle the PRIVATE working tier (`data/local/`, gitignored) as one virtual
 * module -- the unverified/estimated components the CompoundBrowser shows below
 * the curated standards.  (Was `data/proposed/`, retired 2026-07-13; the tier
 * became the private `data/local/`.)  Importing every .dat through
 * import.meta.glob makes Rollup transform one module per file and exhausts the
 * default Node heap once the open catalogue grows beyond a few hundred files;
 * the browser still receives the original raw strings and catalogue.ts parses
 * them with Choupo's dict parser -- only the build graph is compacted.
 *
 * The directory is OPTIONAL: a clean public checkout ships `data/local/` EMPTY
 * (README + .gitkeep only), so an absent/empty dir yields an EMPTY catalogue --
 * the browser then shows only the public standards, and NO private data is baked
 * into the deployed bundle.  A dev machine with a populated `data/local/` sees
 * its own tier (build the public site from a clean clone to keep it out). */
export function proposedCataloguePlugin(): Plugin {
  const directory = fileURLToPath(
    new URL("../../data/local/components", import.meta.url),
  );

  return {
    name: "choupo-proposed-component-catalogue",
    resolveId(id) {
      return id === PROPOSED_CATALOGUE_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      this.addWatchFile(directory);
      const bodies = existsSync(directory)
        ? readdirSync(directory)
            .filter((name) => name.endsWith(".dat"))
            .sort((a, b) => a.localeCompare(b))
            .map((name) => {
              const path = resolve(directory, name);
              this.addWatchFile(path);
              return readFileSync(path, "utf8");
            })
        : [];
      return `export default ${JSON.stringify(bodies)};`;
    },
  };
}
