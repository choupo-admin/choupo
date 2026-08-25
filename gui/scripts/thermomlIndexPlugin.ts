import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/*
 * thermomlIndexPlugin -- serve the user's PRIVATE ThermoML citation index
 * to the Literature workspace, dev server only.
 *
 * The mirror lives in data/local/thermoml/ (gitignored; installed by
 * `bin/choupo-import-thermoml`, which downloads the archive from NIST
 * directly and verifies the record's own sha256).  The browser cannot read
 * the user's disk, and the published site HAS no mirror -- so this
 * middleware is the whole bridge, on the exact pattern of
 * localCataloguePlugin: the dev server reads the file, the page fetches it.
 *
 * Absence is a STATUS, not an empty list: a 404 here lets the workspace
 * say "no mirror installed -- run bin/choupo-import-thermoml", which is a
 * different sentence from "nobody measured this".  The index is citations
 * only (authors/title/journal/year/DOI/compounds/properties per article);
 * the numerical data stays in the mirror's XML on the user's disk.
 */
export function thermomlIndexPlugin(): Plugin {
  const index = resolve(__dirname, "../../data/local/thermoml/citations.jsonl");
  return {
    name: "choupo-thermoml-index",
    configureServer(server) {
      server.middlewares.use("/__thermoml/citations.jsonl", (_req, res) => {
        if (!existsSync(index)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end("no local ThermoML mirror -- run bin/choupo-import-thermoml");
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Content-Length", String(statSync(index).size));
        createReadStream(index).pipe(res);
      });
    },
  };
}
