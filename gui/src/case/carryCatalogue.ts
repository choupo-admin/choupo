/*---------------------------------------------------------------------------*\
    Copyright (C) 2026 Vítor Geraldes
    Licence: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/
/*  THE CASE A STUDENT TAKES AWAY RUNS ALONE (contract K4, docs/design/
 *  measured-facts-materials-and-flow-curves.md 7b).
 *
 *  A case that REFERENCES the catalogue (constant/propertyManifest `pins`,
 *  C413) holds none of the records it reads.  Downloaded as it is, it runs in
 *  the tree and fails on a machine without this tree's data/standards.  So the
 *  download carries the records the manifest names, under
 *  `<case>/data/standards/<rel>` -- where the engine looks first (the cwd's
 *  `data/`, Database::resolveRoot), so the unzipped case runs from its own
 *  folder, and the pins still verify against the carried bytes (`pinned`).
 *
 *  Which records: (a) every `"<rel>" "<hash>";` of `pins {}`; (b) per
 *  `"<dir>/" "relevant:<hash>";` registry line, the pair files that exist in
 *  that directory and are relevant to the case (stem `A-B` splitting at some
 *  '-' into two of the pinned components: src/thermo/PinCheck.cpp).  The page
 *  cannot compute the engine's computational hash, so it does not seal; it
 *  copies the bytes the bundled engine itself reads.
 *
 *  A SEALED case (`sealed true;`) already carries its records: nothing is added.
 */
type Raw = { [rel: string]: string } | undefined;

export interface CatalogueNeeds {
  /** standards-relative files the manifest pins one by one */
  paths: string[];
  /** registry directories pinned as a relevant SET ("parameters/Henry/") */
  dirs: string[];
  /** the components the case pins: the names a pair stem is matched against */
  components: string[];
}

const MANIFEST = "constant/propertyManifest";

const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** What a REFERENCING case needs from the catalogue; null for a case that does
 *  not reference it (no manifest, a sealed one, or one with no pins). */
export function catalogueNeeds(raw: Raw): CatalogueNeeds | null {
  const m = raw?.[MANIFEST];
  if (!m) return null;
  const t = strip(m);
  if (/\bsealed\s+true\s*;/.test(t)) return null;
  const paths: string[] = [];
  const dirs: string[] = [];
  const re = /"([^"]+)"\s+"?(relevant:[0-9a-f]{64}|[0-9a-f]{64}|absent)"?\s*;/g;
  for (let x = re.exec(t); x; x = re.exec(t)) {
    const [, rel, h] = x as unknown as [string, string, string];
    if (h === "absent") continue;
    if (h.startsWith("relevant:")) dirs.push(rel);
    else paths.push(rel);
  }
  if (paths.length === 0 && dirs.length === 0) return null;
  const components = paths
    .map((p) => /^components\/([^/]+)\.dat$/.exec(p)?.[1])
    .filter((c): c is string => !!c);
  return { paths, dirs, components };
}

/** Ask the bundled engine (through the worker) for those records.  Resolves
 *  to {} when the case needs none; rejects with the worker's own message. */
export function readCatalogueFromWasm(needs: CatalogueNeeds, workerUrl: string,
  binary = "choupoSolve"): Promise<{ files: { [rel: string]: string }; missing: string[] }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { type: "module" });
    const done = () => worker.terminate();
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d?.type === "catalogueFiles") { done(); resolve({ files: d.files, missing: d.missing }); }
      else if (d?.type === "error") { done(); reject(new Error(String(d.message))); }
    };
    worker.onerror = (e) => { done(); reject(new Error(e.message || "worker failed")); };
    worker.postMessage({ type: "readCatalogue", binary, ...needs });
  });
}
