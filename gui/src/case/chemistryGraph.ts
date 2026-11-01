/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  chemistryGraph -- the READER for data/standards/routes/ (DEV.md 4c C191 A):
  the tree of chemistry, one directed graph, parsed into typed records.

  ZERO CHEMISTRY IN TYPESCRIPT.  This file PARSES the records the curator
  wrote and the gate bin/curate/check_chemistry_graph.py already validated
  (balance, citation, cycles).  The only arithmetic here is the molar mass of
  a substance, and it is read, never typed:

    * a substance that names a catalogue `component` takes its formula, CAS
      and molar mass FROM THAT RECORD (data/standards/components/<name>.dat,
      through the Explorer's own catalogue reader) -- the graph carries no
      copy, and the gate refuses one;
    * a substance without one takes the molar mass of its own `formula`,
      summed over the engine's atomic-weight table, which is READ FROM
      src/thermo/AtomicWeights.cpp (the one home of the element list) by the
      same raw glob the records use -- not retyped here.

  A record this reader cannot use is NAMED in `refusals`, never dropped: a
  tool that silently lost a route would look complete while a claim had
  vanished.  The tool draws the list; the tests require it empty.

  THE SHAPES FOLLOW THE README beside the records, and nothing here is
  derived from which file a route lives in (the split by chapter is
  editorial).
\*---------------------------------------------------------------------------*/

import { parse, toJson } from "../dict/index.js";
import type { JsonValue } from "../dict/json.js";
import { rawRecordFor } from "./catalogue.js";

// ---- The record shapes ------------------------------------------------------

export type Obj = { [k: string]: JsonValue };

/** A closed interval.  A yield is a BAND, never a point. */
export interface Band { lo: number; hi: number }

export type SubstanceKind = "molecule" | "polymer" | "lumped";
export type Era = "incumbent" | "transition";
export type RouteKind = "reaction" | "separation" | "processYield";
export type BandOrigin = "assumed" | "literature";

export interface Substance {
  name: string;
  label: string;
  /** The catalogue record the formula/CAS/MW were read from, if any. */
  component: string | null;
  kind: SubstanceKind;
  /** null for a lumped node (a cut or a mixture has no molecular formula). */
  formula: string | null;
  cas: string | null;
  /** kg/kmol (= g/mol); null for a lumped node. */
  molarMass: number | null;
  /** Where the molar mass came from: the component record or the formula. */
  massFrom: "component" | "formula" | "none";
}

export interface Root {
  name: string;
  group: "organic" | "inorganic";
  members: string[];
  label: string;
}

export interface GraphSource {
  id: string;
  citation: string;
  url: string;
  doi: string;
  licence: string;
  verification: string;
  verificationNote: string;
}

export interface Volume {
  substances: string[];
  value: number;
  unit: string;
  basis: string;
  source: string;
  locus: string;
}

export interface StoichTerm { component: string; nu: number }

export interface YieldSpec {
  basis: string;
  band: Band;
  origin: BandOrigin;
  reason: string;
  locus: string;
}

export interface SlateEntry {
  component: string;
  massPerKgFeed: Band;
  origin: BandOrigin;
  reason: string;
  locus: string;
}

export interface EnergyEntry {
  route: string;
  band: Band;
  unit: string;
  origin: BandOrigin;
  reason: string;
  locus: string;
}

export interface Route {
  name: string;
  kind: RouteKind;
  target: string;
  family: string;
  era: Era;
  description: string;
  stoichiometry: StoichTerm[];
  feed: string | null;
  slate: SlateEntry[];
  yield: YieldSpec | null;
  energy: EnergyEntry[];
  cycle: string | null;
  cases: string[];
  provenance: { source: string; locus: string }[];
  /** The chapter file it was read from: editorial, displayed, never used. */
  file: string;
}

export interface ChemistryGraph {
  name: string;
  description: string;
  roots: Root[];
  families: { name: string; meaning: string }[];
  sources: GraphSource[];
  volumes: Volume[];
  substances: Substance[];
  routes: Route[];
  /** Every record that could not be used, with the reason.  Rendered. */
  refusals: string[];
  byName: ReadonlyMap<string, Substance>;
  routeByName: ReadonlyMap<string, Route>;
  sourceById: ReadonlyMap<string, GraphSource>;
  /** The engine's atomic weights (kg/kmol), parsed from AtomicWeights.cpp. */
  weights: ReadonlyMap<string, number>;
}

// ---- Small readers over the parsed JSON ------------------------------------

const asString = (v: JsonValue | undefined): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

const asNumber = (v: JsonValue | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const asDictList = (v: JsonValue | undefined): Obj[] =>
  Array.isArray(v)
    ? v.filter((e): e is Obj =>
      typeof e === "object" && e !== null && !Array.isArray(e))
    : [];

const asWordList = (v: JsonValue | undefined): string[] =>
  Array.isArray(v) ? v.map((e) => asString(e as JsonValue)).filter((s) => s !== "")
    : typeof v === "string" && v !== "" ? [v] : [];

function asBand(v: JsonValue | undefined): Band | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const lo = asNumber(v[0]), hi = asNumber(v[1]);
  if (lo === null || hi === null || !(lo > 0) || lo > hi) return null;
  return { lo, hi };
}

const originOf = (v: JsonValue | undefined): BandOrigin | null =>
  v === "assumed" || v === "literature" ? v : null;

// ---- Atomic weights, READ from the engine's table ---------------------------

/** `{ "H", 1.008 }, { "He", 4.002602 }, ...` out of AtomicWeights.cpp. */
export function parseAtomicWeights(cpp: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of cpp.matchAll(/\{\s*"([A-Z][a-z]?)"\s*,\s*([0-9.]+)\s*\}/g))
    out.set(m[1]!, parseFloat(m[2]!));
  return out;
}

/** A formula in the engine's grammar (ElementComposition.H): element symbols
 *  with counts, parentheses nested to any depth with a multiplier.  Text after
 *  the first blank is a comment on the formula ("C2H3Cl (-[CH2-CHCl]-)") and
 *  is dropped.  Unparseable -> null. */
export function parseFormula(raw: string): { [el: string]: number } | null {
  const whole = raw.trim().split(/\s+/)[0] ?? "";
  if (whole === "") return null;
  const total: { [el: string]: number } = {};
  //  segment := [count] unit+ ; segments joined by ':' or the middle dot (hydrate)
  for (const f of whole.split(/[:·]/)) {
    let i = 0;
    const lead = /^(\d+(?:\.\d+)?)/.exec(f);
    const segMult = lead ? parseFloat(lead[1]!) : 1;
    if (lead) i = lead[0].length;
    const group = (): { [el: string]: number } | null => {
      const acc: { [el: string]: number } = {};
      while (i < f.length && f[i] !== ")") {
        if (f[i] === "(") {
          i++;
          const inner = group();
          if (inner === null || f[i] !== ")") return null;
          i++;
          const num = /^\d+(?:\.\d+)?/.exec(f.slice(i));
          const mult = num ? parseFloat(num[0]) : 1;
          if (num) i += num[0].length;
          for (const [e, n] of Object.entries(inner)) acc[e] = (acc[e] ?? 0) + n * mult;
        } else {
          const m = /^([A-Z][a-z]?)(\d*(?:\.\d+)?)/.exec(f.slice(i));
          if (!m) return null;
          i += m[0].length;
          acc[m[1]!] = (acc[m[1]!] ?? 0) + (m[2] ? parseFloat(m[2]) : 1);
        }
      }
      return acc;
    };
    const atoms = group();
    if (atoms === null || i !== f.length || Object.keys(atoms).length === 0) return null;
    for (const [e, n] of Object.entries(atoms)) total[e] = (total[e] ?? 0) + n * segMult;
  }
  return total;
}

/** Molar mass of a formula over an atomic-weight table, or null. */
export function formulaMass(
  formula: string, weights: ReadonlyMap<string, number>,
): number | null {
  const atoms = parseFormula(formula);
  if (atoms === null) return null;
  let m = 0;
  for (const [el, n] of Object.entries(atoms)) {
    const w = weights.get(el);
    if (w === undefined) return null;
    m += w * n;
  }
  return m;
}

// ---- The component record a substance names ---------------------------------

/** `MW` is null for a record that declares none (gypsum): the substance then
 *  takes the mass of the record's own formula. */
export interface ComponentFacts { formula: string; cas: string; MW: number | null }

/** The facts of a catalogue record, read through the Explorer's reader. */
export function componentFacts(name: string): ComponentFacts | null {
  const raw = rawRecordFor(name);
  if (raw === null) return null;
  let j: Obj;
  try { j = toJson(parse(raw)) as Obj; } catch { return null; }
  const mw = asNumber(j["MW"]);
  return { formula: asString(j["formula"]), cas: asString(j["CAS"]),
    MW: mw !== null && mw > 0 ? mw : null };
}

// ---- Reading the graph ------------------------------------------------------

export interface GraphInput {
  /** [file stem, raw text] for every `.dat` under data/standards/routes/. */
  files: readonly { stem: string; text: string }[];
  /** The text of src/thermo/AtomicWeights.cpp. */
  atomicWeightsCpp: string;
  /** Catalogue lookup; defaults to the Explorer's reader. */
  component?: (name: string) => ComponentFacts | null;
}

function readSubstance(
  e: Obj, weights: ReadonlyMap<string, number>,
  lookup: (n: string) => ComponentFacts | null, refusals: string[],
): Substance | null {
  const name = asString(e["name"]);
  if (name === "") { refusals.push("a substance with no `name`"); return null; }
  const kindWord = asString(e["kind"]) || "molecule";
  if (kindWord !== "molecule" && kindWord !== "polymer" && kindWord !== "lumped") {
    refusals.push(`substance ${name}: kind '${kindWord}' is not molecule | polymer | lumped`);
    return null;
  }
  const label = asString(e["label"]) || name;
  const comp = asString(e["component"]);
  if (comp !== "") {
    const facts = lookup(comp);
    if (facts === null) {
      refusals.push(`substance ${name}: names component '${comp}', which the `
        + "catalogue reader cannot read (no record, or it does not parse)");
      return null;
    }
    //  the record's MW where it declares one; else the mass of ITS formula
    const molarMass = facts.MW
      ?? (facts.formula === "" ? null : formulaMass(facts.formula, weights));
    if (molarMass === null) {
      refusals.push(`substance ${name}: component '${comp}' declares no MW and no `
        + "formula the element table can sum");
      return null;
    }
    return {
      name, label, component: comp, kind: kindWord,
      formula: facts.formula || null, cas: facts.cas || null,
      molarMass, massFrom: facts.MW !== null ? "component" : "formula",
    };
  }
  const cas = asString(e["cas"]) || null;
  if (kindWord === "lumped") {
    return { name, label, component: null, kind: "lumped", formula: null, cas,
      molarMass: null, massFrom: "none" };
  }
  const formula = asString(e["formula"]);
  const mass = formula === "" ? null : formulaMass(formula, weights);
  if (mass === null) {
    refusals.push(`substance ${name}: formula '${formula || "absent"}' has no molar mass `
      + "over the engine's atomic-weight table");
    return null;
  }
  return { name, label, component: null, kind: kindWord, formula, cas,
    molarMass: mass, massFrom: "formula" };
}

function readBandedEntry(
  where: string, e: Obj, bandKey: string, refusals: string[],
): { band: Band; origin: BandOrigin; reason: string; locus: string } | null {
  const band = asBand(e[bandKey]);
  const origin = originOf(e["origin"]);
  if (band === null) { refusals.push(`${where}: \`${bandKey}\` is not a band ( lo hi )`); return null; }
  if (origin === null) { refusals.push(`${where}: \`origin\` must be assumed | literature`); return null; }
  return { band, origin, reason: asString(e["reason"]), locus: asString(e["locus"]) };
}

function readRoute(
  e: Obj, file: string, refusals: string[],
): Route | null {
  const name = asString(e["name"]);
  if (name === "") { refusals.push(`${file}: a route with no \`name\``); return null; }
  const kind = asString(e["kind"]);
  if (kind !== "reaction" && kind !== "separation" && kind !== "processYield") {
    refusals.push(`route ${name}: kind '${kind}' is not reaction | separation | processYield`);
    return null;
  }
  const era = asString(e["era"]);
  if (era !== "incumbent" && era !== "transition") {
    refusals.push(`route ${name}: era '${era}' is not incumbent | transition`);
    return null;
  }
  const target = asString(e["target"]);
  const where = `route ${name}`;

  const stoichiometry: StoichTerm[] = [];
  for (const t of asDictList(e["stoichiometry"])) {
    const nu = asNumber(t["nu"]);
    const component = asString(t["component"]);
    if (nu === null || nu === 0 || component === "") {
      refusals.push(`${where}: a stoichiometry term needs a component and a nonzero nu`);
      return null;
    }
    stoichiometry.push({ component, nu });
  }

  let yieldSpec: YieldSpec | null = null;
  const y = e["yield"];
  if (typeof y === "object" && y !== null && !Array.isArray(y)) {
    const r = readBandedEntry(`${where} yield`, y as Obj, "band", refusals);
    if (r === null) return null;
    yieldSpec = { basis: asString((y as Obj)["basis"]), ...r };
  }

  const slate: SlateEntry[] = [];
  for (const s of asDictList(e["slate"])) {
    const r = readBandedEntry(`${where} slate`, s, "massPerKgFeed", refusals);
    if (r === null) return null;
    slate.push({ component: asString(s["component"]), massPerKgFeed: r.band,
      origin: r.origin, reason: r.reason, locus: r.locus });
  }

  const energy: EnergyEntry[] = [];
  for (const s of asDictList(e["energy"])) {
    const r = readBandedEntry(`${where} energy`, s, "band", refusals);
    if (r === null) return null;
    energy.push({ route: asString(s["route"]), band: r.band, unit: asString(s["unit"]),
      origin: r.origin, reason: r.reason, locus: r.locus });
  }

  if (kind === "reaction" && (stoichiometry.length === 0 || yieldSpec === null)) {
    refusals.push(`${where}: a reaction needs a stoichiometry and a yield`);
    return null;
  }
  if (kind === "separation" && (yieldSpec === null || asString(e["feed"]) === "")) {
    refusals.push(`${where}: a separation needs a feed and a mass yield`);
    return null;
  }
  if (kind === "processYield" && (slate.length === 0 || asString(e["feed"]) === "")) {
    refusals.push(`${where}: a process yield needs a feed and a slate`);
    return null;
  }

  return {
    name, kind, target, family: asString(e["family"]), era,
    description: asString(e["description"]),
    stoichiometry, feed: asString(e["feed"]) || null, slate, yield: yieldSpec, energy,
    cycle: asString(e["cycle"]) || null,
    cases: asWordList(e["cases"]),
    provenance: asDictList(e["provenance"]).map((p) => ({
      source: asString(p["source"]), locus: asString(p["locus"]),
    })),
    file,
  };
}

/** Build the typed graph from the raw record texts.  PURE: the Vite globs
 *  below are one caller, the tests another. */
export function buildChemistryGraph(input: GraphInput): ChemistryGraph {
  const refusals: string[] = [];
  const weights = parseAtomicWeights(input.atomicWeightsCpp);
  const lookup = input.component ?? componentFacts;

  let header: Obj | null = null;
  const routeFiles: { stem: string; j: Obj }[] = [];
  for (const f of input.files) {
    let j: Obj;
    try { j = toJson(parse(f.text)) as Obj; }
    catch (err) { refusals.push(`${f.stem}: does not parse (${(err as Error).message})`); continue; }
    const rt = asString(j["recordType"]);
    if (rt === "routeGraph") {
      if (header !== null) refusals.push(`${f.stem}: a second routeGraph header`);
      else header = j;
    } else if (rt === "productionRoutes") routeFiles.push({ stem: f.stem, j });
    else refusals.push(`${f.stem}: recordType '${rt}' is neither routeGraph nor productionRoutes`);
  }
  if (header === null) {
    refusals.push("no `recordType routeGraph` header among the records");
    header = {};
  }

  const substances: Substance[] = [];
  const seen = new Set<string>();
  for (const e of asDictList(header["substances"])) {
    const s = readSubstance(e, weights, lookup, refusals);
    if (s === null) continue;
    if (seen.has(s.name)) { refusals.push(`substance ${s.name} declared twice`); continue; }
    seen.add(s.name);
    substances.push(s);
  }

  const roots: Root[] = asDictList(header["roots"]).map((r) => ({
    name: asString(r["name"]),
    group: asString(r["group"]) === "inorganic" ? "inorganic" : "organic",
    members: asWordList(r["members"]),
    label: asString(r["label"]) || asString(r["name"]),
  }));

  const sources: GraphSource[] = asDictList(header["sources"]).map((s) => ({
    id: asString(s["name"]), citation: asString(s["citation"]),
    url: asString(s["url"]), doi: asString(s["doi"]),
    licence: asString(s["licence"]), verification: asString(s["verification"]),
    verificationNote: asString(s["verificationNote"]),
  }));

  const volumes: Volume[] = asDictList(header["productionVolumes"]).map((v) => ({
    substances: asWordList(v["substances"]), value: asNumber(v["value"]) ?? NaN,
    unit: asString(v["unit"]), basis: asString(v["basis"]),
    source: asString(v["source"]), locus: asString(v["locus"]),
  }));

  const routes: Route[] = [];
  const routeSeen = new Set<string>();
  for (const rf of routeFiles) {
    if (asString(rf.j["graph"]) !== asString(header["name"]))
      refusals.push(`${rf.stem}: names graph '${asString(rf.j["graph"])}', not the header's`);
    for (const e of asDictList(rf.j["routes"])) {
      const r = readRoute(e, rf.stem, refusals);
      if (r === null) continue;
      if (routeSeen.has(r.name)) { refusals.push(`route ${r.name} declared twice`); continue; }
      routeSeen.add(r.name);
      routes.push(r);
    }
  }

  const byName = new Map(substances.map((s) => [s.name, s]));
  //  A route may only name substances the header declares.
  for (const r of routes) {
    const names = [r.target, ...(r.feed ? [r.feed] : []),
      ...r.stoichiometry.map((t) => t.component), ...r.slate.map((s) => s.component)];
    for (const n of names)
      if (!byName.has(n)) refusals.push(`route ${r.name}: names '${n}', which is no substance`);
  }

  return {
    name: asString(header["name"]), description: asString(header["description"]),
    roots, families: asDictList(header["processFamilies"]).map((f) => ({
      name: asString(f["name"]), meaning: asString(f["meaning"]) })),
    sources, volumes, substances, routes, refusals,
    byName, routeByName: new Map(routes.map((r) => [r.name, r])),
    sourceById: new Map(sources.map((s) => [s.id, s])),
    weights,
  };
}

// ---- The shipped graph: Vite raw globs, the columnControlRecords mechanism --

const RAW = import.meta.glob("../../../data/standards/routes/*.dat", {
  query: "?raw", import: "default", eager: true,
}) as { [path: string]: string };

const ATOMIC_WEIGHTS = import.meta.glob("../../../src/thermo/AtomicWeights.cpp", {
  query: "?raw", import: "default", eager: true,
}) as { [path: string]: string };

const stem = (path: string): string =>
  path.split("/").pop()!.replace(/\.dat$/, "");

export const CHEMISTRY_GRAPH: ChemistryGraph = buildChemistryGraph({
  files: Object.entries(RAW)
    .map(([p, text]) => ({ stem: stem(p), text }))
    .sort((a, b) => a.stem.localeCompare(b.stem)),
  atomicWeightsCpp: Object.values(ATOMIC_WEIGHTS)[0] ?? "",
});
