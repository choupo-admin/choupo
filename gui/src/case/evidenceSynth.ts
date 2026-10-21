/*---------------------------------------------------------------------------*\
  evidenceSynth — the Evidence view's CANDIDATES, its RUN PLAN and the reading
  of the engine's answer (DEV.md 4c C117; docs/design/evidence-as-a-first-
  class-object.md §7).  Pure: no React, no physics.

  THE SHAPE.  For a PAIR {a, b} and the measured datasets about it:

    candidates  = every parameter record for the pair in ANY tier (standards,
                  data/local, the open case) -- each a DISTINCT candidate
                  labelled by tier and provenance -- plus the predictive
                  models that need no pair: UNIFAC (both components carry
                  groups), COSMO-SAC (only where a sigma profile is INSTALLED),
                  and ideal mixing.
    one plan    = ONE choupoProps case per candidate, the candidate's
                  parameters INLINE in the synthesised thermoPhysPropDict
                  (`binaryParameters { a-b { ... } }`, the corpus grammar), so
                  a private record works on the hosted site with no file path.
                  Its operations: for every (dataset, pressure) group a
                  `propertyScan1D` with `vary { points ( <the measured x> ) }`
                  -- the engine asked AT the measured conditions -- and, under
                  the points, one smooth grid scan per distinct pressure (the
                  curve the eye reads).
    the reading = residual = engine value MINUS measurement at the measured x,
                  joined row to row (the points op keeps the dataset's order);
                  the AAD is the MEAN of those residuals and nothing else.  No
                  interpolation, no fit, no model evaluated in TypeScript.

  WHAT A DATASET MUST CARRY to be planned: an `x[<component>]` column, a
  `T_bubble` column (this slice draws bubble temperatures; a dataset of
  another property is listed with the reason it is not planned), and a
  pressure -- held (`pressure 101.32 kPa;`) or per point (a `Pressure`
  column, grouped into isobars).  A dataset without one is NOT planned at a
  pressure this module would have to invent, and the reason is returned.

  THE x BASIS.  Every dataset of a pair may name either component as its x
  (`x[methanol]` or `x[water]`); the plan picks ONE axis component (the first
  dataset's) and re-expresses the others as 1 - x, so the picture has one
  abscissa.  That is the only arithmetic on a measured value here, and it is
  exact.
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "./types.js";
import type { JsonDict } from "../dict/index.js";
import { parse, toJson } from "../dict/index.js";
import { metaByName, rawRecordFor, type ComponentMeta } from "./catalogue.js";
import { columnIndex, rowPressurePa, xColumn, type EvidenceDataset } from "./evidence.js";
import { pairProvenanceLabel, pairRecordsFor, type PairEntry } from "./pairsCatalogue.js";
import { hasUnifacGroups, type UnifacGroup } from "./unifacGroups.js";

export interface EvidenceCandidate {
  /** `NRTL@standards`, `NRTL@case`, `NRTL@local#my-refit`, `UNIFAC`, `ideal`, `cosmoSAC` */
  id: string;
  /** the engine's activity-model word */
  model: string;
  /** what the list shows: the model, then where it came from */
  label: string;
  /** the record behind a pair candidate; absent for a predictive model */
  record?: PairEntry;
  provenanceLabel: string;
  /** the `activityModel {}` block the synthesised thermoPhysPropDict carries */
  activityModel: JsonDict;
}

/** Does this component carry an INSTALLED COSMO sigma profile?  The public
 *  catalogue ships every VT-2005 set as an external reference (`installed
 *  false;`, docs/design/the-licence-of-a-sigma-profile.md); a set counts
 *  only when it carries a profile and does not say it is not installed. */
export function cosmoInstalled(name: string): boolean {
  const raw = rawRecordFor(name);
  if (!raw) return false;
  let j: JsonDict;
  try { j = toJson(parse(raw)); } catch { return false; }
  const cosmo = j.cosmo;
  if (typeof cosmo !== "object" || cosmo === null || Array.isArray(cosmo)) return false;
  for (const set of Object.values(cosmo as JsonDict)) {
    if (typeof set !== "object" || set === null || Array.isArray(set)) continue;
    const s = set as JsonDict;
    const installed = s.installed;
    const hasProfile = Array.isArray(s.sigmaProfile) && s.sigmaProfile.length > 0;
    if (hasProfile && installed !== "false" && installed !== false) return true;
  }
  return false;
}

/** The candidate id of a pair record: `model@tier`, plus `#stem` when the
 *  tier holds more than one record of that model for the pair (two refits in
 *  data/local), so every candidate has one address. */
function recordId(p: PairEntry, siblings: PairEntry[]): string {
  const same = siblings.filter((q) => q.model === p.model && q.tier === p.tier);
  return same.length > 1 ? `${p.model}@${p.tier}#${p.stem}` : `${p.model}@${p.tier}`;
}

/** Every candidate model for the pair, in list order: the pair records
 *  (standards, then local, then the open case), UNIFAC where both components
 *  carry groups, COSMO-SAC where both carry an installed profile, ideal. */
export function evidenceCandidates(pair: [string, string], catalogue: ComponentMeta[],
                                   rawFiles?: { [relPath: string]: string },
                                   localUnifac: Record<string, UnifacGroup[]> = {}): EvidenceCandidate[] {
  const [a, b] = pair;
  const out: EvidenceCandidate[] = [];
  const records = pairRecordsFor(a, b, rawFiles);
  for (const p of records) {
    const key = `${p.a}-${p.b}`;
    //  The record's own i/j order names the pair key the engine reads; the
    //  parameters block is copied verbatim (i, j, a_ij, ..., alpha, c_ij).
    const prov = pairProvenanceLabel(p);
    out.push({
      id: recordId(p, records),
      model: p.model,
      label: `${p.model} (${prov})`,
      record: p,
      provenanceLabel: prov,
      activityModel: { model: p.model, binaryParameters: { [key]: { ...p.parameters } } },
    });
  }
  const unifacAble = [a, b].every((c) =>
    (metaByName(c, catalogue)?.hasUnifac ?? false) || hasUnifacGroups(c, localUnifac));
  if (unifacAble)
    out.push({ id: "UNIFAC", model: "UNIFAC", label: "UNIFAC (predictive, from the components' groups)",
               provenanceLabel: "predictive · no pair", activityModel: { model: "UNIFAC" } });
  if ([a, b].every(cosmoInstalled))
    out.push({ id: "cosmoSAC", model: "cosmoSAC", label: "COSMO-SAC (predictive, installed sigma profiles)",
               provenanceLabel: "predictive · installed profiles", activityModel: { model: "cosmoSAC" } });
  out.push({ id: "ideal", model: "ideal", label: "ideal mixing (γ = 1)",
             provenanceLabel: "no model", activityModel: { model: "ideal" } });
  return out;
}

// ---- the run plan ----------------------------------------------------------

export interface EvidenceOp {
  name: string;
  kind: "curve" | "points";
  /** points: the dataset the op evaluates at */
  datasetId?: string;
  /** points: the dataset's row indices, in op order */
  rows?: number[];
  /** Pa */
  P: number;
  /** the x values the op asks at, on the plan's axis component */
  xs?: number[];
  file: string;
}

export interface EvidencePlan {
  candidate: EvidenceCandidate;
  /** the component on the abscissa (its liquid mole fraction) */
  xComponent: string;
  partner: string;
  ops: EvidenceOp[];
  files: CaseFiles;
  /** datasets (by id) this plan could not ask about, each with its reason */
  skipped: { datasetId: string; reason: string }[];
}

/** A pressure key that folds round-off (a column of `101.32 kPa` values) into
 *  one isobar without folding two real isobars together. */
function isobarKey(P: number): string {
  return P.toPrecision(8);
}

export function evidenceRunPlan(pair: [string, string], datasets: EvidenceDataset[],
                                candidate: EvidenceCandidate,
                                opts: { curveN?: number; componentFiles?: { [relPath: string]: string } } = {},
): EvidencePlan {
  const curveN = Math.max(2, Math.round(opts.curveN ?? 51));
  //  The axis: the first dataset's x component, else the pair's first.
  const firstX = datasets.map(xColumn).find((x) => x !== null) ?? null;
  const xComponent = firstX && (firstX.component === pair[0] || firstX.component === pair[1])
    ? firstX.component : pair[0];
  const partner = xComponent === pair[0] ? pair[1] : pair[0];

  const ops: EvidenceOp[] = [];
  const skipped: EvidencePlan["skipped"] = [];
  const isobars = new Map<string, number>();
  let di = 0;
  for (const d of datasets) {
    const xc = xColumn(d);
    const tc = columnIndex(d, "T_bubble");
    if (!xc || (xc.component !== pair[0] && xc.component !== pair[1])) {
      skipped.push({ datasetId: d.id, reason: "no x[<component of the pair>] column" }); continue;
    }
    if (tc < 0) {
      skipped.push({ datasetId: d.id, reason: `property ${d.property || "(undeclared)"}: no T_bubble column -- this view draws bubble temperatures` }); continue;
    }
    const flip = xc.component !== xComponent;
    //  group the rows by isobar, keeping the dataset's own order inside each
    const groups = new Map<string, { P: number; rows: number[] }>();
    let noP = 0;
    d.rows.forEach((_row, r) => {
      const P = rowPressurePa(d, r);
      if (P === null || !Number.isFinite(P)) { ++noP; return; }
      const k = isobarKey(P);
      const g = groups.get(k) ?? { P, rows: [] };
      g.rows.push(r);
      groups.set(k, g);
      if (!isobars.has(k)) isobars.set(k, P);
    });
    if (noP > 0)
      skipped.push({ datasetId: d.id, reason: `${noP} point(s) declare no pressure (no \`pressure\` scalar and no Pressure column) -- not evaluated at a pressure this view would have to invent` });
    let gi = 0;
    for (const g of groups.values()) {
      const xs = g.rows.map((r) => {
        const x = d.rows[r]![xc.index]!;
        return flip ? 1 - x : x;
      });
      ops.push({ name: `pts_${di}_${gi}`, kind: "points", datasetId: d.id, rows: g.rows,
                 P: g.P, xs, file: `pts_${di}_${gi}.csv` });
      ++gi;
    }
    ++di;
  }
  //  one smooth curve per distinct isobar, ordered by pressure
  const curveOps: EvidenceOp[] = [...isobars.values()].sort((p, q) => p - q)
    .map((P, k) => ({ name: `curve_${k}`, kind: "curve" as const, P, file: `curve_${k}.csv` }));

  const properties = ["T_bubble", `y_eq_${xComponent}`];
  const state = (P: number): JsonDict => ({ P, composition: { [xComponent]: 0.5, [partner]: 0.5 } });
  const operations: JsonDict[] = [
    ...ops.map((op) => ({
      name: op.name, type: "propertyScan1D",
      vary: { variable: `x[${xComponent}]`, points: [...op.xs!] },
      state: state(op.P), properties, output: { file: op.file },
    })),
    ...curveOps.map((op) => ({
      name: op.name, type: "propertyScan1D",
      vary: { variable: `x[${xComponent}]`, from: 0, to: 1, n: curveN },
      state: state(op.P), properties, output: { file: op.file },
    })),
  ];
  const files: CaseFiles = {
    propsDict: { operations },
    thermoPackage: {
      recordType: "thermophysicalPropertySystem",
      schemaVersion: 2,
      components: [xComponent, partner],
      equilibrium: {
        formulation: "gammaPhi",
        liquid: { activityModel: { ...candidate.activityModel }, standardState: "pureLiquid" },
        vapour: { fugacityModel: "idealGas" },
      },
    },
    controlDict: {
      application: "choupoProps",
      description: `Property Explorer -- evidence for ${pair[0]} + ${pair[1]}, candidate ${candidate.id} (ephemeral)`,
      verbosity: 2,
    },
  };
  if (opts.componentFiles && Object.keys(opts.componentFiles).length > 0)
    files.extraFiles = { ...opts.componentFiles };
  return { candidate, xComponent, partner, ops: [...ops, ...curveOps], files, skipped };
}

// ---- reading the engine's answer ------------------------------------------

export interface EvidenceCurve { P: number; x: number[]; T: (number | null)[]; y: (number | null)[]; }

export interface EvidenceResidualPoint {
  /** on the plan's axis component */
  x: number;
  P: number;
  measuredK: number;
  /** null where the engine wrote nan (the point is listed, not counted) */
  engineK: number | null;
  /** engine minus measurement, K; null where the engine has no value */
  residualK: number | null;
  /** the dataset's own expanded uncertainty of this point, K, when declared */
  uncertaintyK: number | null;
  /** the measured vapour fraction, when the dataset carries one */
  measuredY: number | null;
  engineY: number | null;
}

export interface EvidenceDatasetResult {
  datasetId: string;
  points: EvidenceResidualPoint[];
  nMeasured: number;
  nUsed: number;
  /** mean |residual| over the points the engine answered, K */
  aadK: number | null;
  /** mean |residual| / T_measured, per cent */
  aadRelPct: number | null;
  /** mean signed residual, K (a bias the eye may not see on the plot) */
  biasK: number | null;
}

export interface EvidenceResult {
  candidateId: string;
  curves: EvidenceCurve[];
  byDataset: EvidenceDatasetResult[];
  /** ops whose CSV the run did not return */
  missing: string[];
}

/** The engine's scan CSV: a header, then one row per point; `nan` is a point
 *  the engine could not answer (PropertyScan1D writes it so). */
function parseScanCsv(csv: string): { header: string[]; rows: (number | null)[][] } | null {
  const lines = csv.trim().split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const header = lines[0]!.split(",").map((s) => s.trim());
  const rows: (number | null)[][] = [];
  for (let i = 1; i < lines.length; ++i) {
    rows.push(lines[i]!.split(",").map((c) => {
      const v = Number(c.trim());
      return Number.isFinite(v) ? v : null;
    }));
  }
  return { header, rows };
}

export function evidenceResults(plan: EvidencePlan, datasets: EvidenceDataset[],
                                csvFiles: { [relPath: string]: string } | undefined): EvidenceResult {
  const byId = new Map(datasets.map((d) => [d.id, d]));
  const curves: EvidenceCurve[] = [];
  const perDataset = new Map<string, EvidenceResidualPoint[]>();
  const missing: string[] = [];
  const yName = `y_eq_${plan.xComponent}`;
  for (const op of plan.ops) {
    const text = csvFiles?.[op.file];
    const parsed = text ? parseScanCsv(text) : null;
    if (!parsed) { missing.push(op.name); continue; }
    const tI = parsed.header.indexOf("T_bubble");
    const yI = parsed.header.indexOf(yName);
    if (op.kind === "curve") {
      curves.push({
        P: op.P,
        x: parsed.rows.map((r) => r[0] ?? NaN),
        T: parsed.rows.map((r) => (tI >= 0 ? r[tI] ?? null : null)),
        y: parsed.rows.map((r) => (yI >= 0 ? r[yI] ?? null : null)),
      });
      continue;
    }
    const d = byId.get(op.datasetId!);
    if (!d) { missing.push(op.name); continue; }
    const xc = xColumn(d)!;
    const tc = columnIndex(d, "T_bubble");
    const yc = d.columns.findIndex((c) => /^y_eq_/.test(c.name));
    const flip = xc.component !== plan.xComponent;
    const unc = d.uncertainties.find((u) => u.column === "T_bubble");
    const pts = perDataset.get(d.id) ?? [];
    op.rows!.forEach((r, k) => {
      const row = d.rows[r]!;
      const engine = parsed.rows[k];
      const engineK = engine && tI >= 0 ? engine[tI] ?? null : null;
      const measuredK = row[tc]!;
      let measuredY: number | null = yc >= 0 ? row[yc]! : null;
      let engineY = engine && yI >= 0 ? engine[yI] ?? null : null;
      //  a flipped axis flips the vapour fraction too: y_other = 1 - y
      if (flip && measuredY !== null) measuredY = 1 - measuredY;
      if (flip && engineY !== null) engineY = 1 - engineY;
      pts.push({
        x: op.xs![k]!, P: op.P, measuredK, engineK,
        residualK: engineK === null ? null : engineK - measuredK,
        uncertaintyK: unc ? unc.values[r] ?? null : null,
        measuredY, engineY,
      });
    });
    perDataset.set(d.id, pts);
  }
  const byDataset: EvidenceDatasetResult[] = [];
  for (const d of datasets) {
    const pts = perDataset.get(d.id);
    if (!pts) continue;
    const used = pts.filter((p) => p.residualK !== null);
    const n = used.length;
    //  THE ONLY ARITHMETIC: means of residuals the engine produced.
    const aadK = n ? used.reduce((s, p) => s + Math.abs(p.residualK!), 0) / n : null;
    const aadRelPct = n ? (used.reduce((s, p) => s + Math.abs(p.residualK!) / p.measuredK, 0) / n) * 100 : null;
    const biasK = n ? used.reduce((s, p) => s + p.residualK!, 0) / n : null;
    byDataset.push({ datasetId: d.id, points: pts, nMeasured: pts.length, nUsed: n, aadK, aadRelPct, biasK });
  }
  curves.sort((p, q) => p.P - q.P);
  return { candidateId: plan.candidate.id, curves, byDataset, missing };
}
