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
  electrolyteModels -- the cases the "Choosing an electrolyte activity model"
  EduTool asks the engine to run, the readers of its answers, and the page's
  own small arithmetic around them.

  THE SPLIT, stated once because the page states it too:

    * the ENGINE (choupoProps) computes every activity coefficient, osmotic
      coefficient and water activity of a MODEL:
        - Pitzer and eNRTL through the route a process unit takes: a
          thermoPhysPropDict declaring `formulation electrolyteGammaPhi;
          aqueous { activityModel { model Pitzer|eNRTL; } }` and the props op
          `electrolyteActivity`, one operation per molality, each writing a
          one-row CSV (m, gamma_pm, phi, a_w);
        - Davies through the speciation solver (`speciate`, `activityModel
          davies`), in two runs: one with the network restricted to water's
          own dissociation (free ions, no ion pair), one with every
          equilibrium the catalogue holds for those ions (its ion pairs).
    * the PAGE (this file) does closed-form arithmetic, printed with its
      constants: the Debye-Hueckel limiting law, the stoichiometric mean of
      the Davies run with ion pairs (from the activities the engine wrote),
      the osmotic coefficient of a Davies run from its water activity, a
      water activity from a measured osmotic coefficient, the osmotic
      pressure, and the deviations from the measured tables.

  THE MEASURED TABLES are not copied here.  They are the curation datasets the
  catalogue's eNRTL records were regressed against
  (data/curation/electrolytes/<cation>-<anion>/constant/experiments/), read
  through import.meta.glob, the same files the engine reads.

  EVERY OPERATION NAME AND EVERY CSV NAME CARRIES A TAG naming the salt and
  the model, so a run that finishes after the student picked another salt
  returns names the new reader does not look up: the page then shows nothing
  rather than one salt's numbers on another's plot.
\*---------------------------------------------------------------------------*/

// ---- the salts -----------------------------------------------------------------

export type SaltId = "NaCl" | "KCl" | "CaCl2" | "Na2SO4" | "MgSO4";

export interface SaltDef {
  id: SaltId;
  label: string;
  cation: string;
  anion: string;
  zc: number;
  /** |z| of the anion. */
  za: number;
  nuC: number;
  nuA: number;
}

const salt = (id: SaltId, label: string, cation: string, anion: string,
  zc: number, za: number, nuC: number, nuA: number): SaltDef =>
  ({ id, label, cation, anion, zc, za, nuC, nuA });

/** The four salts with a measured table in the tree, in the order the page
 *  offers them: two 1-1 salts, a 2-1 and a 1-2. */
export const EM_SALTS: readonly SaltDef[] = [
  salt("NaCl", "NaCl (1-1)", "Na", "Cl", 1, 1, 1, 1),
  salt("KCl", "KCl (1-1)", "K", "Cl", 1, 1, 1, 1),
  salt("CaCl2", "CaCl2 (2-1)", "Ca", "Cl", 2, 1, 1, 2),
  salt("Na2SO4", "Na2SO4 (1-2)", "Na", "SO4", 1, 2, 2, 1),
];

/** The salt of step 6: Pitzer has a pair record for it, eNRTL has none. */
export const EM_REFUSAL_SALT: SaltDef = salt("MgSO4", "MgSO4 (2-2)", "Mg", "SO4", 2, 2, 1, 1);
/** The molalities step 6 asks about, mol/kg. */
export const EM_REFUSAL_MS: readonly number[] = [0.1, 0.5, 1.0];

export const saltById = (id: string): SaltDef =>
  EM_SALTS.find((s) => s.id === id) ?? (id === "MgSO4" ? EM_REFUSAL_SALT : EM_SALTS[0]!);

export const nuOf = (s: SaltDef): number => s.nuC + s.nuA;

/** Ionic strength of a fully dissociated salt at molality m (mol/kg). */
export const ionicStrength = (s: SaltDef, m: number): number =>
  0.5 * m * (s.nuC * s.zc * s.zc + s.nuA * s.za * s.za);

/** The molality at which the ionic strength is I. */
export const molalityAtI = (s: SaltDef, I: number): number =>
  I / (0.5 * (s.nuC * s.zc * s.zc + s.nuA * s.za * s.za));

// ---- the constants the page's arithmetic uses (each the engine's own) ----------

/** The osmotic Debye-Hueckel slope of water at 25 C on the molality scale,
 *  src/thermo/electrolyte/PitzerForm.H:88 (aPhiRef25). */
export const A_PHI_25 = 0.3915;
/** Davies' log10 slope at 25 C, src/thermo/electrolyte/AqueousActivity.cpp:131
 *  (0.51), written there as 3 A_phi / ln 10 rounded. */
export const A_DAVIES_25 = 0.51;
/** Molar mass of water, kg/mol: the 18.015 g/mol the Pitzer kernel's water
 *  activity uses (src/thermo/electrolyte/PitzerSingleSalt.H:150) and the
 *  speciation solver's (src/thermo/electrolyte/SpeciationSolver.cpp:660). */
export const M_WATER = 18.015e-3;
/** Molar volume of liquid water at 25 C, m3/mol: the engine's own anchor,
 *  src/thermo/electrolyte/SolventProperties.H:78 (vWater, 1.807e-5 at 25 C). */
export const V_WATER_25 = 1.807e-5;
/** The gas constant, J/(mol K): src/core/Constants.H:47. */
export const R_GAS = 8.314462618;
/** The one temperature of the page. */
export const T_25 = 298.15;

// ---- the measured tables -------------------------------------------------------

export interface MeasuredRow { m: number; gamma: number; phi: number; index: number }

export interface MeasuredTable {
  salt: SaltId;
  /** Path of the file in the repository. */
  file: string;
  source: string;
  doi: string;
  location: string;
  rows: MeasuredRow[];
}

const strip = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** Parse one curation dataset (`columns ( m gamma phi )`, `data ( ... );`).
 *  Throws when the file is not the shape the page reads -- a page drawn on a
 *  silently empty table would be worse than a refusal. */
export function parseMeasuredTable(saltId: SaltId, file: string, raw: string): MeasuredTable {
  const body = strip(raw);
  const cols = /\bcolumns\s*\(([\s\S]*?)\)\s*;/.exec(body)?.[1] ?? "";
  const names = [...cols.matchAll(/name\s+(\w+)\s*;/g)].map((x) => x[1]);
  if (names.join(",") !== "m,gamma,phi")
    throw new Error(`${file}: columns are (${names.join(" ")}), the page reads (m gamma phi)`);
  const T = Number(/\btemperature\s+([-0-9.eE]+)\s*;/.exec(body)?.[1]);
  if (T !== T_25) throw new Error(`${file}: temperature ${T}, the page works at ${T_25} K`);
  const data = /\bdata\s*\(([\s\S]*?)\)\s*;/.exec(body)?.[1];
  if (!data) throw new Error(`${file}: no data ( ... ); block`);
  const nums = data.trim().split(/\s+/).map(Number);
  if (nums.length % 3 !== 0 || nums.some((v) => !Number.isFinite(v)))
    throw new Error(`${file}: the data block is not rows of three numbers`);
  const rows: MeasuredRow[] = [];
  for (let k = 0; k < nums.length; k += 3)
    rows.push({ m: nums[k]!, gamma: nums[k + 1]!, phi: nums[k + 2]!, index: k / 3 });
  const str = (key: string): string =>
    new RegExp(`\\b${key}\\s+"([^"]*)"\\s*;`).exec(raw)?.[1] ?? "";
  return { salt: saltId, file, source: str("source"), doi: str("doi"), location: str("location"), rows };
}

/** The rows the curation case held out of its eNRTL (and Pitzer) fit:
 *  0-based index % 4 == 3, never the first or the last row
 *  (`heldOut { every 4; offset 3; }`, src/propertyOps/ElectrolyteFit.H:70). */
export const heldOutByCuration = (t: MeasuredTable, r: MeasuredRow): boolean =>
  r.index % 4 === 3 && r.index !== 0 && r.index !== t.rows.length - 1;

// ---- the molalities the engine is asked about ----------------------------------

/** The page's curve grid (geometric from 0.001 mol/kg to the table's last
 *  molality) merged with every measured molality, so every model is
 *  evaluated AT the measured points and never interpolated there. */
export function emMolalities(table: MeasuredTable, nCurve = 24): number[] {
  const mmax = table.rows[table.rows.length - 1]!.m;
  const lo = 1e-3;
  const set = new Set<number>(table.rows.map((r) => r.m));
  for (let k = 0; k < nCurve; k++)
    set.add(Number((lo * Math.pow(mmax / lo, k / (nCurve - 1))).toPrecision(4)));
  return [...set].sort((a, b) => a - b);
}

// ---- the cases -------------------------------------------------------------------

export const EM_CASE_NAME = "electrolyteModels";
export type PkgModel = "Pitzer" | "eNRTL";
export type EmRun = PkgModel | "Davies" | "DaviesPairs";

/** The tag naming the question: salt and model.  It sits inside every
 *  operation and file name the run produces. */
export const emTag = (s: SaltDef, run: EmRun): string => `${s.id}_${run}`;
export const emOpName = (tag: string, k: number): string => `em_${tag}_${k}`;
export const emFile = (tag: string, k: number): string => `em_${tag}_${k}.csv`;

const num = (v: number): string => {
  const s = v.toPrecision(10).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return s;
};

export function emControlDict(what: string): string {
  return [
    "application   choupoProps;",
    `description   "Choosing an electrolyte model EduTool: ${what}";`,
    //  Level 0: the page reads the structured result and the CSVs.
    "verbosity     0;", "",
  ].join("\n");
}

/** The declaration of a single-salt package: exactly the block a process
 *  unit's case declares to get this model.  The `model` word is case-
 *  sensitive (`Pitzer`, `eNRTL`); the builder refuses any other spelling. */
export function emPackageThermo(s: SaltDef, model: PkgModel): string {
  return [
    "recordType    thermophysicalPropertySystem;",
    "schemaVersion 2;", "",
    `components    ( water ${s.id} );`, "",
    "equilibrium", "{",
    "    formulation electrolyteGammaPhi;",
    `    aqueous { activityModel { model ${model}; } compositionBasis molality; }`,
    "    vapour  { fugacityModel idealGas; }",
    "}", "",
    "caloric", "{",
    "    energyBasis elementsDatum;",
    "    aqueous { enthalpyRoute ionicReferencePlusExcess; }",
    "    vapour  { enthalpyRoute idealGasCp; }",
    "}", "",
  ].join("\n");
}

/** The aqueous surface the speciation solver reads Davies from. */
export const EM_DAVIES_THERMO = [
  "recordType    thermophysicalPropertySystem;",
  "schemaVersion 2;", "",
  "components    ( water );", "",
  "aqueousProperties", "{",
  "    activityCoefficients { model Davies; referenceBasis aqueousMolality; }",
  "}", "",
].join("\n");

/** Pitzer or eNRTL, one `electrolyteActivity` operation per molality. */
export function emPackageCaseFiles(s: SaltDef, model: PkgModel, ms: readonly number[]):
  Record<string, string> {
  const tag = emTag(s, model);
  const ops = ms.map((m, k) =>
    `    { name ${emOpName(tag, k)}; type electrolyteActivity; temperature ${T_25}; `
    + `molality { from ${num(m)}; to ${num(m)}; n 2; } output { file ${emFile(tag, k)}; } }`);
  return {
    [`${EM_CASE_NAME}.cho`]: "",
    "system/controlDict": emControlDict(`${model}, ${s.id}, ${ms.length} molalities at 25 C`),
    "system/propsDict": `operations\n(\n${ops.join("\n")}\n);\n`,
    "constant/thermoPhysPropDict": emPackageThermo(s, model),
  };
}

/** Davies stops being drawn above this ionic strength (mol/kg): four times
 *  the band its authors stated, far enough to see it leave. */
export const DAVIES_I_MAX = 2;

/** The molalities Davies is asked about: the page's set, up to DAVIES_I_MAX. */
export const daviesMolalities = (s: SaltDef, ms: readonly number[]): number[] =>
  ms.filter((m) => ionicStrength(s, m) <= DAVIES_I_MAX + 1e-12);

/** Davies, one `speciate` operation per molality, pH held at 7.  Two runs:
 *  `withPairs` false restricts the network to water's own dissociation (free
 *  ions, no ion pair); true lets the solver use every equilibrium the
 *  catalogue holds for these ions (its ion pairs included).  They are two
 *  runs so they run side by side. */
export function emDaviesCaseFiles(s: SaltDef, ms: readonly number[], withPairs: boolean):
  Record<string, string> {
  const tag = emTag(s, withPairs ? "DaviesPairs" : "Davies");
  const totals = (m: number) =>
    `analyticalTotals { ${s.cation} ${num(s.nuC * m)} mol/kg; ${s.anion} ${num(s.nuA * m)} mol/kg; }`;
  const ops = ms.map((m, k) =>
    `    { name ${emOpName(tag, k)}; type speciate; activityModel davies; temperature ${T_25}; `
    + `${totals(m)} pH 7.0; `
    + (withPairs ? "" : "networkScope restricted; network ( water-dissociation ); "
      + `reason "EduTool: one fully dissociated salt, no ion pair -- Davies on free ions only"; `)
    + `diagMeanIonic ( { cation ${s.cation}; anion ${s.anion}; } ); `
    + `output { file ${emFile(tag, k)}; } }`);
  return {
    [`${EM_CASE_NAME}.cho`]: "",
    "system/controlDict": emControlDict(
      `Davies ${withPairs ? "with the catalogue's ion pairs" : "on free ions"}, ${s.id}, ${ms.length} molalities at 25 C`),
    "system/propsDict": `operations\n(\n${ops.join("\n")}\n);\n`,
    "constant/thermoPhysPropDict": EM_DAVIES_THERMO,
  };
}

/** THE RUNS THE PAGE STARTS ON OPEN, in one home: the page builds each of
 *  them through `emOnOpenCaseFiles` and the native test
 *  (tests/electrolyteModelsRuns.test.ts) runs exactly these, for every salt
 *  the page offers, and requires each to finish.  A run that is meant to be
 *  REFUSED (step 6, eNRTL on MgSO4) is not one of them: it starts on the
 *  student's click, because the site smoke judges every run started on open
 *  by its exit code. */
export const EM_ON_OPEN: readonly EmRun[] = ["Pitzer", "eNRTL", "Davies", "DaviesPairs"];

/** The case files of one on-open run for salt `s` over the page's
 *  molalities `ms` (Davies is asked only up to DAVIES_I_MAX). */
export function emOnOpenCaseFiles(s: SaltDef, ms: readonly number[], run: EmRun):
  Record<string, string> {
  if (run === "Davies" || run === "DaviesPairs")
    return emDaviesCaseFiles(s, daviesMolalities(s, ms), run === "DaviesPairs");
  return emPackageCaseFiles(s, run, ms);
}

// ---- reading the engine's answers --------------------------------------------------

export interface ModelPoint {
  m: number;
  gamma: number;
  phi: number;
  aw: number;
}

export interface OpLike { name: string; diagnostics: { [k: string]: number } }

export interface RunLike {
  operationResults?: readonly OpLike[];
  csvFiles?: { [rel: string]: string };
}

/** The first data row of a CSV the engine wrote, as a column->number map. */
export function csvRow(text: string | undefined): { [col: string]: number } | null {
  if (!text) return null;
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const head = lines[0]!.split(",").map((h) => h.trim());
  const vals = lines[1]!.split(",").map((v) => Number(v));
  const out: { [col: string]: number } = {};
  head.forEach((h, k) => { out[h] = vals[k]!; });
  return out;
}

function csvByName(run: RunLike, name: string): string | undefined {
  const files = run.csvFiles ?? {};
  if (files[name] !== undefined) return files[name];
  const key = Object.keys(files).find((k) => k === name || k.endsWith(`/${name}`));
  return key ? files[key] : undefined;
}

/** Pitzer or eNRTL: every value read from the engine's CSV.  A molality the
 *  engine did not answer for is left out, never filled. */
export function readPackageRun(run: RunLike | null, s: SaltDef, model: PkgModel,
  ms: readonly number[]): ModelPoint[] {
  if (!run) return [];
  const tag = emTag(s, model);
  const out: ModelPoint[] = [];
  ms.forEach((m, k) => {
    const r = csvRow(csvByName(run, emFile(tag, k)));
    if (!r) return;
    const p = { m, gamma: r["gamma_pm"]!, phi: r["phi"]!, aw: r["a_w"]! };
    if ([p.gamma, p.phi, p.aw].every(Number.isFinite) && Math.abs(r["m"]! - m) <= 1e-9 * Math.max(1, m))
      out.push(p);
  });
  return out;
}

/** Davies.  The free-ion run (`withPairs` false) is read straight from the
 *  engine's diagnostics: gamma_pm of the master pair and a_w.  With ion pairs
 *  the diagnostic gamma_pm is the FREE ions' mean, so the stoichiometric mean
 *  -- what a measured table reports -- is the page's arithmetic on the
 *  activities the engine wrote:
 *    gamma_pm = (a_c^nu_c a_a^nu_a / ((nu_c m)^nu_c (nu_a m)^nu_a))^(1/nu).
 *  Both osmotic coefficients are the page's, from the engine's a_w:
 *    phi = -ln a_w / (M_w nu m).
 *  With no ion pair the two expressions of gamma_pm coincide. */
export function readDaviesRun(run: RunLike | null, s: SaltDef, ms: readonly number[],
  withPairs: boolean): ModelPoint[] {
  const out: ModelPoint[] = [];
  if (!run) return out;
  const tag = emTag(s, withPairs ? "DaviesPairs" : "Davies");
  const byName = new Map((run.operationResults ?? []).map((o) => [o.name, o.diagnostics]));
  const nu = nuOf(s);
  ms.forEach((m, k) => {
    const d = byName.get(emOpName(tag, k));
    const aw = d?.["aw"];
    if (!d || !Number.isFinite(aw)) return;
    const phi = -Math.log(aw!) / (M_WATER * nu * m);
    if (!withPairs) {
      const g = d[`gamma_pm_${s.cation}_${s.anion}`];
      if (Number.isFinite(g)) out.push({ m, gamma: g!, aw: aw!, phi });
      return;
    }
    const act = speciesActivities(csvByName(run, emFile(tag, k)));
    const ac = act[s.cation], aa = act[s.anion];
    if (!Number.isFinite(ac) || !Number.isFinite(aa)) return;
    const g = Math.pow(Math.pow(ac!, s.nuC) * Math.pow(aa!, s.nuA)
      / (Math.pow(s.nuC * m, s.nuC) * Math.pow(s.nuA * m, s.nuA)), 1 / nu);
    out.push({ m, gamma: g, aw: aw!, phi });
  });
  return out;
}

function speciesActivities(text: string | undefined): { [sp: string]: number } {
  const act: { [sp: string]: number } = {};
  if (!text) return act;
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0]!.split(",").map((h) => h.trim());
  const iS = head.indexOf("species"), iA = head.indexOf("activity");
  if (iS < 0 || iA < 0) return act;
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    if (c[iS]) act[c[iS]!.trim()] = Number(c[iA]);
  }
  return act;
}

/** The species of the run with ion pairs that are neither a master ion, H+,
 *  OH- nor water, at the highest molality asked: the complexes the
 *  catalogue's network formed, as the engine listed them. */
export function pairedSpecies(run: RunLike | null, s: SaltDef, ms: readonly number[]): string[] {
  if (!run || ms.length === 0) return [];
  const text = csvByName(run, emFile(emTag(s, "DaviesPairs"), ms.length - 1));
  if (!text) return [];
  const skip = new Set([s.cation, s.anion, "H", "OH", "water", "H2O"]);
  return text.trim().split(/\r?\n/).slice(1)
    .map((l) => l.split(",")[0]!.trim())
    .filter((sp) => sp && !skip.has(sp));
}

// ---- the page's arithmetic -------------------------------------------------------------

/** The Debye-Hueckel limiting law on the molality scale, with the engine's
 *  osmotic slope A_phi:  ln gamma_pm = -3 A_phi |z_c z_a| sqrt(I),
 *  phi = 1 - A_phi |z_c z_a| sqrt(I).  (3 A_phi / ln 10 = 0.5101 is the
 *  familiar log10 slope 0.51.) */
export function debyeHuckelLimit(s: SaltDef, m: number): { gamma: number; phi: number } {
  const sI = Math.sqrt(ionicStrength(s, m));
  const zz = s.zc * s.za;
  return { gamma: Math.exp(-3 * A_PHI_25 * zz * sI), phi: 1 - A_PHI_25 * zz * sI };
}

/** A water activity from an osmotic coefficient: ln a_w = -phi nu m M_w. */
export const awFromPhi = (s: SaltDef, m: number, phi: number): number =>
  Math.exp(-phi * nuOf(s) * m * M_WATER);

/** Osmotic pressure, bar: Pi = -(R T / V_w) ln a_w. */
export const osmoticPressureBar = (aw: number, T = T_25, Vw = V_WATER_25): number =>
  (-R_GAS * T / Vw) * Math.log(aw) / 1e5;

/** Relative deviation of a model value from a measured one, percent. */
export const devPct = (model: number, measured: number): number =>
  100 * (model - measured) / measured;

export interface Deviation {
  n: number;
  aadPct: number;
  maxPct: number;
  /** Signed deviation at the worst point. */
  worstSigned: number;
  worstM: number;
}

/** AAD and the largest deviation of a model over the measured rows it was
 *  evaluated at (the model's points carry the measured molalities exactly).
 *  `which` picks gamma or phi; `keep` filters the measured rows. */
export function deviation(points: readonly ModelPoint[], table: MeasuredTable,
  which: "gamma" | "phi", keep: (r: MeasuredRow) => boolean = () => true): Deviation | null {
  const at = new Map(points.map((p) => [p.m, p]));
  let n = 0, sum = 0, max = -1, worstSigned = NaN, worstM = NaN;
  for (const r of table.rows) {
    if (!keep(r)) continue;
    const p = at.get(r.m);
    if (!p) continue;
    const d = devPct(p[which], r[which]);
    n++; sum += Math.abs(d);
    if (Math.abs(d) > max) { max = Math.abs(d); worstSigned = d; worstM = r.m; }
  }
  return n ? { n, aadPct: sum / n, maxPct: max, worstSigned, worstM } : null;
}

/** The signed deviation at the measured row nearest a given ionic strength
 *  (used to quote Davies at I = 0.1 and 0.5 for the salt on screen). */
export function deviationNearI(points: readonly ModelPoint[], table: MeasuredTable, s: SaltDef,
  I: number): { m: number; I: number; pct: number } | null {
  const at = new Map(points.map((p) => [p.m, p]));
  let best: { m: number; I: number; pct: number } | null = null;
  for (const r of table.rows) {
    const p = at.get(r.m);
    if (!p) continue;
    const Ir = ionicStrength(s, r.m);
    if (!best || Math.abs(Math.log(Ir / I)) < Math.abs(Math.log(best.I / I)))
      best = { m: r.m, I: Ir, pct: devPct(p.gamma, r.gamma) };
  }
  return best;
}

// ---- step 5: the choice as questions ---------------------------------------------------

export interface ChoiceAnswers {
  /** Highest ionic strength the solution reaches, mol/kg. */
  ionicStrength: "below0.1" | "0.1to0.5" | "above0.5";
  severalSalts: boolean;
  otherSolvent: boolean;
  acidGases: boolean;
}

export type ChoiceModel = "davies" | "pitzer" | "pitzerHMW" | "eNRTL" | "edwardsPitzer";

export interface ChoiceVerdict {
  model: ChoiceModel;
  /** The word a case declares, and where. */
  declare: string;
  because: string[];
  /** EduTool that teaches the model's use further, when one exists. */
  seeTool?: string;
}

/** The decision, in the order the page asks: what the solution carries first
 *  (acid gases, a second solvent, a second salt), its ionic strength last.
 *  Each branch names its reason; none of them is a ranking. */
export function chooseModel(a: ChoiceAnswers): ChoiceVerdict {
  if (a.acidGases)
    return {
      model: "edwardsPitzer",
      declare: "activityModel edwardsPitzer; (speciate) or model EdwardsPitzer; (aqueousProperties)",
      because: [
        "NH3, CO2 and H2S dissolve partly as neutral molecules, and a neutral solute is salted "
          + "out by the ions around it.  Davies gives a neutral species a coefficient of exactly 1 "
          + "at every ionic strength, so it cannot express that.",
        "The Edwards-Maurer-Newman-Prausnitz truncation of Pitzer's expansion carries "
          + "molecule-ion terms and was built for these volatile weak electrolytes.",
      ],
      seeTool: "sour-water",
    };
  if (a.otherSolvent)
    return {
      model: "eNRTL",
      declare: "a mixed-solvent eNRTL declaration (Theory Guide, eNRTL with a second solvent)",
      because: [
        "eNRTL is a local-composition model: the solvent is a species with its own interaction "
          + "parameters, so a second solvent is a second set of pairs, not a new model.",
        "Pitzer's virial coefficients are fitted in water; nothing in them says what an "
          + "ethanol-water solvent does.",
        "The mixed-solvent route is not compared with measurements on this page.",
      ],
    };
  if (a.severalSalts)
    return {
      model: "pitzerHMW",
      declare: "activityModel pitzerHMW; (speciate)",
      because: [
        "With two salts the ions of one meet the ions of the other: Pitzer's mixing parameters "
          + "theta and psi carry that, and the Harvie-Moller-Weare assembly sums them with the "
          + "single-salt binaries.",
        "Its binaries are the same records as single-salt Pitzer: on one salt the two agree to "
          + "round-off.",
      ],
      seeTool: "salt-mixing",
    };
  if (a.ionicStrength === "below0.1")
    return {
      model: "davies",
      declare: "activityModel davies; (speciate) or model Davies; (aqueousProperties)",
      because: [
        "Below about I = 0.1 mol/kg the charge of an ion decides almost all of its "
          + "non-ideality, and Davies needs no parameter beyond the charge.",
        "Pitzer is equally right there; choose it instead when its pair record exists and the "
          + "solution may concentrate.",
      ],
    };
  return {
    model: "pitzer",
    declare: "aqueous { activityModel { model Pitzer; } } (formulation electrolyteGammaPhi)",
    because: [
      "Above I = 0.1 mol/kg the specific short-range interactions of each ion pair matter, and "
        + "Davies does not carry them; Pitzer's binary coefficients do.",
      "Its coefficients are fitted to each salt's own measurements; the catalogue holds one "
        + "record per cation-anion pair (step 6 shows how to see whether yours exists).",
      "eNRTL is the alternative where a Pitzer pair is missing and an eNRTL pair exists.",
    ],
  };
}
