import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/*
 * thermomlIndexPlugin -- serve the user's PRIVATE ThermoML index to the
 * Literature workspace, dev server only.
 *
 * The cache lives in thirdParty/thermoml/ (gitignored), installed by
 * `bin/choupo-thermoml sync`, which downloads the archive from NIST directly
 * and verifies the record's own sha256; `bin/choupo-thermoml index` then
 * writes index.json beside it.  The browser cannot read the user's disk, and
 * the published site HAS no cache -- so this middleware is the whole bridge,
 * on the exact pattern of localCataloguePlugin: the dev server reads the
 * file, the page fetches it.
 *
 * ONE INDEX, NOT TWO (2026-08-25).  This used to serve a parallel
 * `citations.jsonl` built by a second toolchain, over a second copy of the
 * cache, in a second location.  Two indexes over one archive is the arity
 * sin; `choupo-thermoml index` answers the question now that its entries
 * carry authors, journal and year.
 *
 * `$CHOUPO_THERMOML_HOME` overrides the location, exactly as it does for the
 * command line -- a class of thirty shares one copy rather than fetching it
 * thirty times, and the GUI must look where the tools were told to put it.
 *
 * Absence is a STATUS, not an empty list: a 404 here lets the workspace say
 * "no cache installed -- run bin/choupo-thermoml sync", which is a different
 * sentence from "nobody measured this".  The index is CITATIONS ONLY
 * (authors/title/journal/year/DOI/compounds/properties per article); the
 * numerical data stays in the cache's XML on the user's disk and never
 * reaches the browser.
 */
/*
 * THE PROJECTION IS THE POINT, and it is why this is not a static file
 * server.  `index.json` over the full archive is ~70 MB, because it keeps
 * each compound's CAS, InChI and InChIKey so `search` can match any of them.
 * The Literature panel needs none of that -- it shows a citation and the
 * compound NAMES -- and 70 MB is not a page load.
 *
 * So the middleware projects: ~6.8 MB, computed once and held, from the ONE
 * index on disk.  Writing a second, slim file beside it would be the arity
 * sin in the shape this whole slice exists to undo.
 */
interface SlimCitation {
  file: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  doi: string;
  compounds: string[];
  properties: string[];
}

export function thermomlIndexPlugin(): Plugin {
  const home = process.env.CHOUPO_THERMOML_HOME;
  const index = home
    ? resolve(home, "index.json")
    : resolve(__dirname, "../../thirdParty/thermoml/index.json");
  let cached: string | null = null;

  return {
    name: "choupo-thermoml-index",
    configureServer(server) {
      server.middlewares.use("/__thermoml/index.json", (_req, res) => {
        if (!existsSync(index)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end(
            "no local ThermoML cache -- run `bin/choupo-thermoml sync` " +
              "then `bin/choupo-thermoml index`",
          );
          return;
        }
        if (cached === null) {
          try {
            const raw = JSON.parse(readFileSync(index, "utf8")) as {
              entries?: Array<Record<string, unknown>>;
            };
            const slim: SlimCitation[] = (raw.entries ?? []).map((x) => ({
              //  The path RELATIVE to the cache: an absolute path from
              //  whoever ran `index` is not a fact about the reader's disk.
              file: String(x.file ?? "").split("thermoml/").pop() ?? "",
              title: String(x.title ?? ""),
              authors: Array.isArray(x.authors) ? (x.authors as string[]) : [],
              journal: String(x.journal ?? ""),
              year: String(x.year ?? ""),
              doi: String(x.doi ?? ""),
              compounds: Array.isArray(x.compounds)
                ? (x.compounds as Array<Record<string, unknown>>)
                    .map((c) => String(c.name ?? ""))
                    .filter(Boolean)
                : [],
              //  BOTH lists: a reader looking for a paper cares what it
              //  MEASURED, not what this engine happens to parse today.
              properties: [
                ...(Array.isArray(x.propertiesSupported)
                  ? (x.propertiesSupported as string[])
                  : []),
                ...(Array.isArray(x.propertiesUnsupported)
                  ? (x.propertiesUnsupported as string[])
                  : []),
              ].slice(0, 8),
            }));
            cached = JSON.stringify({ entries: slim });
          } catch (err) {
            //  A malformed index is a STATUS, not an empty list -- the same
            //  distinction the 404 draws.  Say which file and why.
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/plain");
            res.end(
              `the ThermoML index at ${index} could not be read (${String(
                err,
              )}).  Rebuild it with \`bin/choupo-thermoml index\`.`,
            );
            return;
          }
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Length", String(Buffer.byteLength(cached)));
        res.end(cached);
      });
    },
  };
}
