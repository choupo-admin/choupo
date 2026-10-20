/*---------------------------------------------------------------------------*\
  evidence — the MEASURED DATASETS the GUI can see, read from each file's own
  header (DEV.md 4c C117; docs/design/evidence-as-a-first-class-object.md §7).

  WHAT A DATASET IS.  A file in the grammar `bin/choupo-thermoml extract-vle`
  writes and every curation tutorial carries under `constant/experiments/`:
  `property`, the SUBJECT (`system ( a b )` for a binary, `component x;` for a
  pure property), the held conditions (`pressure 101.32 kPa;` as a scalar, or
  a `Pressure` column when each point has its own), `provenance { source;
  reviewStatus; citation; doi; sha256; }`, `uncertainty { <column> { kind;
  level; unit; values ( ... ); } }`, `columns ( { name; unit; } ... )` and the
  `data ( ... )` grid.  NO NEW GRAMMAR: this module parses what the engine
  parses, with the dict parser the GUI already has, and converts every column
  to canonical SI by its declared unit -- which is the one arithmetic it
  performs.  It computes no residual and fits nothing; the engine does both.

  THREE TIERS, ONE READER.  (1) the private tier `data/local/evidence/*.dat`
  (the dev GUI bundles it through scripts/localCataloguePlugin.ts; a clean
  checkout ships it empty, so the hosted site never carries private data);
  (2) the bundled TUTORIALS' own `constant/experiments/*.dat` -- which is why
  the hosted site, with data/local empty, still shows curate04's two
  methanol-water studies; (3) the OPEN CASE's `constant/experiments/*.dat`.
  The same measurement may sit in two tiers (a student copies a tutorial's
  dataset into data/local to try the Evidence view): it is ONE dataset, told by
  its `sha256`, listed once under the nearest tier with the others named.

  THE SUBJECT IS READ FROM THE FILE.  Never from a folder, never from the
  filename: `system ( methanol water )` says what was measured, and a pair is
  matched ORDER-FREE (methanol + water is water + methanol).

  THE ROLE IS NOT HERE.  Whether a dataset was fitted to or held out is a fact
  about an OPERATION (`evidence ( { dataset; role } )` in the propsDict, and
  the dossier it writes), never about the dataset; `check_evidence_records`
  refuses a `role` key inside a dataset file, and this reader carries none.
\*---------------------------------------------------------------------------*/

import type { JsonDict, JsonValue } from "../dict/index.js";
import { parse, parseScalarString, toJson } from "../dict/index.js";
import { affineToK, lookupUnit } from "../dict/units.js";
import localEvidenceRaw from "virtual:local-evidence";

export type EvidenceTier = "local" | "tutorial" | "case";

export type EvidenceSubject =
  | { kind: "pair"; components: [string, string] }
  | { kind: "component"; component: string };

export interface EvidenceColumn {
  /** the engine's column name, verbatim (`x[methanol]`, `T_bubble`, `Pressure`) */
  name: string;
  /** the DECLARED unit, verbatim (`K`, `kPa`, `-`) */
  unit: string;
}

export interface EvidenceUncertainty {
  /** the column the uncertainty is about */
  column: string;
  kind: string;
  /** confidence level in per cent, or null when undeclared */
  level: number | null;
  unit: string;
  /** per point, in `data` order, converted to the column's SI DIFFERENCE unit
   *  (an uncertainty of 0.2 °C is 0.2 K: a difference is never shifted) */
  values: number[];
}

export interface EvidenceProvenance {
  source: string;
  reviewStatus: string;
  citation: string;
  doi: string;
  sha256: string;
  archiveFile: string;
}

export interface EvidenceDataset {
  /** the filename stem -- the dataset's id (§7: "the filename is the id") */
  id: string;
  /** the path as its tier spells it */
  file: string;
  tier: EvidenceTier;
  /** other tiers holding the SAME data block (same sha256) */
  alsoIn: EvidenceTier[];
  /** tutorial / case tiers: the case folder, `tutorials/props/curation/curate04_...` */
  casePath: string;
  caseName: string;
  /** the engine's property key, verbatim (`binaryVLE.T_bubble`) */
  property: string;
  subject: EvidenceSubject;
  /** `pressure <v>;` held across the set, in Pa; null when absent (a
   *  `Pressure` column then carries it per point, or nothing does) */
  heldPressurePa: number | null;
  /** `temperature <v>;` held across the set, in K; null when absent */
  heldTemperatureK: number | null;
  columns: EvidenceColumn[];
  /** row-major, every value in canonical SI */
  rows: number[][];
  uncertainties: EvidenceUncertainty[];
  nPoints: number;
  /** `selection { pureEndpoints ( ... ) }`: points SET ASIDE by the author
   *  (a pure-component bubble point measures the vapour-pressure record, not
   *  the pair); they are not in `rows` and the count says so */
  pureEndpointsSetAside: number;
  provenance: EvidenceProvenance;
}

// ---- small readers over the JSON form of a dict ---------------------------

function str(v: JsonValue | undefined): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}
function dict(v: JsonValue | undefined): JsonDict | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as JsonDict) : null;
}
function numList(v: JsonValue | undefined): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== "number") return null;
    out.push(x);
  }
  return out;
}

/** A held condition (`pressure 101.32 kPa;`, `temperature 298.15 K;`) in SI,
 *  or null when absent.  A bare number is already SI (the engine's reading). */
function heldSI(v: JsonValue | undefined, affineIsTemperature: boolean): number | null {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  const p = parseScalarString(v);
  if (!p) return null;
  if (!p.unit) return p.value;
  const u = lookupUnit(p.unit);
  if (!u) return null;
  if (u.affine) return affineIsTemperature ? affineToK(p.value, p.unit) : null;
  return p.value * u.factor;
}

/** Convert one measured VALUE by its declared unit: dimensionless words stay,
 *  an affine temperature shifts, everything else scales.  Mirrors the `conv`
 *  lambda in choupoProps main's `experimental {}` echo. */
function valueSI(v: number, unit: string): number {
  if (unit === "-" || unit === "frac" || unit === "[-]" || unit === "dimensionless"
      || unit === "none" || unit === "mol/mol") return v;
  const u = lookupUnit(unit);
  if (!u) return v;
  return u.affine ? affineToK(v, unit) : v * u.factor;
}

/** Convert one uncertainty (a DIFFERENCE) by its unit: an affine unit is a
 *  kelvin-sized step, so it scales by 1 and never shifts. */
function differenceSI(v: number, unit: string): number {
  if (unit === "-" || unit === "frac" || unit === "[-]" || unit === "dimensionless"
      || unit === "none" || unit === "mol/mol") return v;
  const u = lookupUnit(unit);
  if (!u) return v;
  return u.affine ? v : v * u.factor;
}

/** Parse one dataset body.  Returns null when the text does not parse, names
 *  no subject, or carries no `columns` + `data` grid: a file that cannot be
 *  drawn is reported as nothing, never as an empty dataset about a subject it
 *  might have named. */
export function readEvidence(raw: string, where: {
  file: string; tier: EvidenceTier; casePath?: string;
}): EvidenceDataset | null {
  let j: JsonDict;
  try { j = toJson(parse(raw)); } catch { return null; }

  let subject: EvidenceSubject | null = null;
  const sys = j.system;
  if (Array.isArray(sys) && sys.length === 2
      && typeof sys[0] === "string" && typeof sys[1] === "string")
    subject = { kind: "pair", components: [sys[0], sys[1]] };
  else if (typeof j.component === "string" && j.component)
    subject = { kind: "component", component: j.component };
  if (!subject) return null;

  const colsRaw = Array.isArray(j.columns) ? j.columns : null;
  const grid = numList(j.data);
  if (!colsRaw || !grid) return null;
  const columns: EvidenceColumn[] = [];
  for (const c of colsRaw) {
    const cd = dict(c);
    if (!cd) return null;
    const name = str(cd.name), unit = str(cd.unit);
    if (!name) return null;
    columns.push({ name, unit });
  }
  const nc = columns.length;
  if (nc < 2 || grid.length === 0 || grid.length % nc !== 0) return null;
  const nRows = grid.length / nc;
  const rows: number[][] = [];
  for (let r = 0; r < nRows; ++r) {
    const row: number[] = [];
    for (let c = 0; c < nc; ++c) row.push(valueSI(grid[r * nc + c]!, columns[c]!.unit));
    rows.push(row);
  }

  const uncertainties: EvidenceUncertainty[] = [];
  const unc = dict(j.uncertainty);
  if (unc) {
    for (const [column, v] of Object.entries(unc)) {
      const ud = dict(v);
      if (!ud) continue;
      const vals = numList(ud.values);
      if (!vals) continue;
      const unit = str(ud.unit);
      uncertainties.push({
        column, kind: str(ud.kind),
        level: typeof ud.level === "number" ? ud.level : null,
        unit,
        values: vals.map((x) => differenceSI(x, unit)),
      });
    }
  }

  const pv = dict(j.provenance);
  const provenance: EvidenceProvenance = {
    source: pv ? str(pv.source) : "",
    reviewStatus: pv ? str(pv.reviewStatus) : "",
    citation: pv ? str(pv.citation) : "",
    doi: pv ? str(pv.doi) : "",
    sha256: pv ? str(pv.sha256) : "",
    archiveFile: pv ? str(pv.archiveFile) : "",
  };

  const sel = dict(j.selection);
  const endpoints = sel && Array.isArray(sel.pureEndpoints) ? sel.pureEndpoints.length : 0;

  const stem = where.file.split("/").pop()!.replace(/\.dat$/, "");
  const casePath = where.casePath ?? "";
  return {
    id: stem,
    file: where.file,
    tier: where.tier,
    alsoIn: [],
    casePath,
    caseName: casePath ? (casePath.split("/").filter(Boolean).pop() ?? casePath) : "",
    property: str(j.property),
    subject,
    heldPressurePa: heldSI(j.pressure, false),
    heldTemperatureK: heldSI(j.temperature, true),
    columns,
    rows,
    uncertainties,
    nPoints: nRows,
    pureEndpointsSetAside: endpoints,
    provenance,
  };
}

// ---- the three tiers -------------------------------------------------------

//  The bundled tutorials' own datasets.  The SAME raw modules the tutorial
//  bundle (cases/tutorials.ts) inlines -- Vite resolves `?raw` imports by id,
//  so a file reached by two globs is one module, not two copies.  `props/old`
//  is excluded as the tutorial bundle excludes it.
const TUTORIAL_RAW = import.meta.glob(
  ["../../../tutorials/**/constant/experiments/*.dat",
   "!../../../tutorials/props/old/**"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const TUTORIAL_PATH_RE = /^.*?tutorials\//;
const EXPERIMENTS_RE = /\/constant\/experiments\/[^/]+$/;

let TUTORIAL_INDEX: EvidenceDataset[] | null = null;
/** Every dataset the bundled tutorials carry.  Computed once. */
export function tutorialEvidence(): EvidenceDataset[] {
  if (TUTORIAL_INDEX) return TUTORIAL_INDEX;
  const out: EvidenceDataset[] = [];
  for (const [path, raw] of Object.entries(TUTORIAL_RAW)) {
    const file = path.replace(TUTORIAL_PATH_RE, "tutorials/");
    const casePath = file.replace(EXPERIMENTS_RE, "");
    const d = readEvidence(raw, { file, tier: "tutorial", casePath });
    if (d) out.push(d);
  }
  out.sort((a, b) => a.caseName.localeCompare(b.caseName) || a.id.localeCompare(b.id));
  TUTORIAL_INDEX = out;
  return out;
}

let LOCAL_INDEX: EvidenceDataset[] | null = null;
/** Every dataset in the private tier `data/local/evidence/` -- EMPTY on a
 *  clean checkout and on the hosted site, by construction. */
export function localEvidence(): EvidenceDataset[] {
  if (LOCAL_INDEX) return LOCAL_INDEX;
  const out: EvidenceDataset[] = [];
  for (const e of localEvidenceRaw) {
    const d = readEvidence(e.body, { file: `data/local/evidence/${e.file}`, tier: "local" });
    if (d) out.push(d);
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  LOCAL_INDEX = out;
  return out;
}

const CASE_EXPERIMENTS_RE = /(?:^|\/)constant\/experiments\/[^/]+\.dat$/;
/** The OPEN case's datasets (`constant/experiments/*.dat` anywhere in its
 *  tree).  `[]` with no case open, which is a looked-at answer. */
export function caseEvidence(rawFiles?: { [relPath: string]: string }): EvidenceDataset[] {
  if (!rawFiles) return [];
  const out: EvidenceDataset[] = [];
  for (const [path, body] of Object.entries(rawFiles)) {
    if (!CASE_EXPERIMENTS_RE.test(path)) continue;
    const d = readEvidence(body, { file: path, tier: "case", casePath: "(open case)" });
    if (d) out.push(d);
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** The three tiers merged: case first, then local, then the tutorials; a
 *  dataset whose `sha256` was already listed by a nearer tier is folded into
 *  that entry's `alsoIn` rather than listed twice.  A dataset declaring no
 *  sha256 cannot be told from another and is listed as its own entry. */
export function allEvidence(rawFiles?: { [relPath: string]: string }): EvidenceDataset[] {
  const out: EvidenceDataset[] = [];
  const bySha = new Map<string, EvidenceDataset>();
  for (const list of [caseEvidence(rawFiles), localEvidence(), tutorialEvidence()]) {
    for (const d of list) {
      const sha = d.provenance.sha256;
      const prev = sha ? bySha.get(sha) : undefined;
      if (prev) {
        if (!prev.alsoIn.includes(d.tier)) prev.alsoIn = [...prev.alsoIn, d.tier];
        continue;
      }
      const copy = { ...d, alsoIn: [] as EvidenceTier[] };
      out.push(copy);
      if (sha) bySha.set(sha, copy);
    }
  }
  return out;
}

/** Order-free pair match. */
export function isAboutPair(d: EvidenceDataset, a: string, b: string): boolean {
  if (d.subject.kind !== "pair") return false;
  const [p, q] = d.subject.components;
  return (p === a && q === b) || (p === b && q === a);
}

/** Every dataset whose subject is the pair {a, b}, in any tier. */
export function evidenceForPair(a: string, b: string,
                                rawFiles?: { [relPath: string]: string }): EvidenceDataset[] {
  return allEvidence(rawFiles).filter((d) => isAboutPair(d, a, b));
}

/** Every dataset whose subject is this one component (a pure property). */
export function evidenceForComponent(name: string,
                                     rawFiles?: { [relPath: string]: string }): EvidenceDataset[] {
  return allEvidence(rawFiles)
    .filter((d) => d.subject.kind === "component" && d.subject.component === name);
}

/** How many datasets the bundle carries at all -- so a panel can tell "no
 *  evidence for this pair" from "the reader found nothing anywhere". */
export function evidenceCorpusSize(): number {
  return tutorialEvidence().length + localEvidence().length;
}

/** The column index of the liquid mole fraction and WHICH component it is
 *  (`x[methanol]` -> "methanol"), or null when the set carries no such column. */
export function xColumn(d: EvidenceDataset): { index: number; component: string } | null {
  for (let i = 0; i < d.columns.length; ++i) {
    const m = /^x\[(.+)\]$/.exec(d.columns[i]!.name);
    if (m) return { index: i, component: m[1]! };
  }
  return null;
}

/** The column index of a named column, or -1. */
export function columnIndex(d: EvidenceDataset, name: string): number {
  return d.columns.findIndex((c) => c.name === name);
}

/** The pressure of row `r` in Pa: the per-point `Pressure` column where the
 *  set carries one, else the held scalar, else null (an undeclared pressure
 *  is not a number this module may invent). */
export function rowPressurePa(d: EvidenceDataset, r: number): number | null {
  const pc = columnIndex(d, "Pressure");
  if (pc >= 0) return d.rows[r]?.[pc] ?? null;
  return d.heldPressurePa;
}
