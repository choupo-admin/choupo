/*---------------------------------------------------------------------------*\
  Standard-component catalogue — a build-time manifest for the Property Explorer
  compound browser.

  Vite's import.meta.glob inlines every data/standards/components/*.dat as a raw
  string (the IDENTICAL mechanism cases/tutorials.ts uses to reach the tutorials
  at the ../../../ depth).  Each is run through the dict parse->toJson port purely
  to harvest display metadata (name, formula) and the role flags the plot-type
  gating needs -- NO physics, NO new dependency.  The engine still resolves the
  FROZEN catalogue on disk / in MEMFS; this manifest is for the browser UI only.

  Role from the data (vetting: VLE-able vs not, not a fragment/pseudo zoo):
    vleAble = has a vaporPressure block AND Tc, and not `nonvolatile true`.
  A non-VLE-able component (a nonvolatile solute, or a fragment/ion .dat with no
  Tc / no vaporPressure) cannot appear in a T-x-y plot -- the gating disables
  those templates WITH a true reason.
\*---------------------------------------------------------------------------*/

import type { JsonDict } from "../dict/index.js";
import { parse, toJson } from "../dict/index.js";
import proposedRaw from "virtual:proposed-component-catalogue";

export type ComponentKind = "volatile" | "nonvolatile" | "fragment";

export interface ComponentMeta {
  name: string;
  formula: string;
  kind: ComponentKind;
  /** Where this entry came from: the frozen standard catalogue, the UNVERIFIED
   *  data/proposed/ tier (student-review-pending), a case-local
   *  constant/components/<name>.dat, or a case-local file shadowing a same-named
   *  standard component. Drives the provenance chip in the compound browser. */
  origin?: "standard" | "proposed" | "local" | "local-shadow";
  /** Can appear in a VLE plot (T-x-y, gamma, ...): vaporPressure + Tc, not nonvolatile. */
  vleAble: boolean;
  /** Carries dissolved-ion thermodynamics (an `electrolyte{}` block, or a
   *  declared dissociation > 1 on a non-solid) — gates the RO scaling view. */
  isElectrolyte: boolean;
  /** A permanent / non-condensable carrier gas (declared `noncondensable true;`
   *  — air/N2/O2/CO2) — gates the psychrometric view (carrier + condensable). */
  isPermanentGas: boolean;
  /** Carries a UNIFAC group decomposition in its .dat (`groups { unifac (…) }`)
   *  — the engine reads it directly, so the component is UNIFAC-able (gates the
   *  γ=UNIFAC views without a hardcoded map). */
  hasUnifac: boolean;
  /** Critical temperature [K], critical pressure [bar], normal boiling point [K]
   *  — harvested for the pure-compound P-T phase diagram (mark Tc/Pc/Tb).
   *  Undefined when the .dat omits them. */
  tc?: number;
  pc?: number;
  tb?: number;
}

const RAW = import.meta.glob("../../../data/standards/components/*.dat", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function metaFromDat(body: string, origin: ComponentMeta["origin"] = "standard"): ComponentMeta | null {
  let j: JsonDict;
  try { j = toJson(parse(body)); } catch { return null; }
  const name = typeof j.name === "string" ? j.name : "";
  if (!name) return null;
  const formula = typeof j.formula === "string" ? j.formula : "";
  const nonvol = j.nonvolatile === "true" || j.nonvolatile === true;
  const hasTc = typeof j.Tc === "number" && j.Tc > 0;
  const hasVp = j.vaporPressure !== undefined && j.vaporPressure !== null;
  const vleAble = hasVp && hasTc && !nonvol;
  const kind: ComponentKind = nonvol ? "nonvolatile" : vleAble ? "volatile" : "fragment";
  // electrolyte: a declared electrolyte{} block, OR dissociation > 1 on a
  // non-solid (excludes solid sugars etc. that may carry a stoichiometry).
  const isSolid = typeof j.gibbsFormation === "object" && j.gibbsFormation !== null
    && (j.gibbsFormation as JsonDict).phase === "solid";
  const dissoc = typeof j.dissociation === "number" ? j.dissociation : 1;
  const isElectrolyte = (j.electrolyte !== undefined && j.electrolyte !== null)
    || (dissoc > 1 && !isSolid);
  const isPermanentGas = j.noncondensable === "true" || j.noncondensable === true;
  const grp = j.groups as Record<string, unknown> | undefined;
  const hasUnifac = !!grp && grp.unifac !== undefined && grp.unifac !== null;
  const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : undefined);
  return { name, formula, kind, vleAble, isElectrolyte, isPermanentGas, hasUnifac,
    origin, tc: num(j.Tc), pc: num(j.Pc), tb: num(j.Tb) };
}

/** Every standard component, sorted by name. Computed once at module load. */
export const CATALOGUE: ComponentMeta[] = Object.values(RAW)
  .map((body) => metaFromDat(body))
  .filter((m): m is ComponentMeta => m !== null)
  .sort((a, b) => a.name.localeCompare(b.name));

// The UNVERIFIED data/proposed/ tier -- bulk-ingested / estimated components a
// student must review + promote. The build plugin aggregates the raw .dat
// strings into ONE virtual module so a broad catalogue does not create hundreds
// of Rollup modules. Parsing and classification remain here, on the same path as
// standards and case-local components.

/** Every PROPOSED (unverified) component, sorted by name. */
export const PROPOSED_CATALOGUE: ComponentMeta[] = proposedRaw
  .map((body) => metaFromDat(body, "proposed"))
  .filter((m): m is ComponentMeta => m !== null)
  .sort((a, b) => a.name.localeCompare(b.name));

// A case-local component .dat ANYWHERE in the open case's tree (root OR nested
// sectors), captured WITH its filename stem — the canonical key the engine
// resolves (`components ( <stem> )` looks for `<stem>.dat`).  An un-promoted
// `<name>.estimate-DATE.dat` PROPOSAL is skipped: its stem is not a usable
// component name (the engine would never resolve it), so it must not appear as
// pickable — only the promoted `<name>.dat` does.
const TREE_COMPONENT_RE = /(?:^|\/)constant\/components\/([^/]+)\.dat$/;
function caseDatStem(path: string): string | null {
  const m = path.match(TREE_COMPONENT_RE);
  if (!m) return null;
  const stem = m[1]!;
  return stem.includes(".estimate-") ? null : stem;   // skip proposals
}

/** The open case's case-local components, as a SEPARATE list (the browser shows
 *  them apart from the frozen standard catalogue).  Walks the whole case tree;
 *  keyed by FILENAME STEM (the engine's canonical key); on a stem declared at
 *  several levels the SHALLOWEST path wins (the most shared, plant-level — the
 *  engine inherits it down to the sectors).  Tagged 'local' (new) or
 *  'local-shadow' (overrides a standard of the same name). */
export function caseComponents(rawFiles?: { [relPath: string]: string }): ComponentMeta[] {
  if (!rawFiles) return [];
  const stdNames = new Set(CATALOGUE.map((m) => m.name));
  const byStem = new Map<string, { meta: ComponentMeta; depth: number }>();
  for (const [path, body] of Object.entries(rawFiles)) {
    const stem = caseDatStem(path);
    if (!stem) continue;
    const base = metaFromDat(body, stdNames.has(stem) ? "local-shadow" : "local");
    if (!base) continue;
    const meta = { ...base, name: stem };   // canonical key = filename stem, not the in-file name
    const depth = path.split("/").length;
    const prev = byStem.get(stem);
    if (!prev || depth < prev.depth) byStem.set(stem, { meta, depth });
  }
  return [...byStem.values()].map((v) => v.meta).sort((a, b) => a.name.localeCompare(b.name));
}

/** Case-local component bodies FLATTENED to the case root, keyed
 *  `constant/components/<stem>.dat` — so the synthesized FLAT explore case
 *  resolves a sector-nested component (the run has a single root cwd, not the
 *  sector tree).  Skips proposals; shallowest-path wins on a stem collision. */
export function caseComponentFiles(rawFiles?: { [relPath: string]: string }): { [relPath: string]: string } {
  if (!rawFiles) return {};
  const byStem = new Map<string, { body: string; depth: number }>();
  for (const [path, body] of Object.entries(rawFiles)) {
    const stem = caseDatStem(path);
    if (!stem) continue;
    const depth = path.split("/").length;
    const prev = byStem.get(stem);
    if (!prev || depth < prev.depth) byStem.set(stem, { body, depth });
  }
  const out: { [relPath: string]: string } = {};
  for (const [stem, v] of byStem) out[`constant/components/${stem}.dat`] = v.body;
  return out;
}

/** The standard catalogue MERGED with the case-local components — used ONLY for
 *  NAME LOOKUP/gating (resolve any selected name, standard or case).  The browser
 *  shows the two apart; this is the flat resolution pool.  Returns the SAME
 *  CATALOGUE reference when there is nothing case-local. */
export function mergeCatalogue(rawFiles?: { [relPath: string]: string }): ComponentMeta[] {
  const local = caseComponents(rawFiles);
  if (local.length === 0) return CATALOGUE;
  const byName = new Map<string, ComponentMeta>();
  for (const m of CATALOGUE) byName.set(m.name, m);
  for (const m of local) byName.set(m.name, m);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Substring search over name + formula (case-insensitive). Empty -> all.
 *  `pool` defaults to the standard catalogue; pass a merged pool for an open case. */
export function searchCatalogue(query: string, pool: ComponentMeta[] = CATALOGUE): ComponentMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return pool;
  return pool.filter(
    (m) => m.name.toLowerCase().includes(q) || m.formula.toLowerCase().includes(q),
  );
}

export function metaByName(name: string, pool: ComponentMeta[] = CATALOGUE): ComponentMeta | undefined {
  return pool.find((m) => m.name === name);
}

/** The formula, but ONLY when it adds information beyond the name — so an
 *  element whose name IS its formula ("He"/"He", "N2") shows a single label
 *  instead of "He He".  Case-insensitive, whitespace-stripped comparison. */
export function formulaIfDistinct(m: ComponentMeta): string | null {
  if (!m.formula) return null;
  const norm = (s: string) => s.toLowerCase().replace(/\s/g, "");
  return norm(m.formula) !== norm(m.name) ? m.formula : null;
}
