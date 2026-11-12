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
  databaseToParametersFit -- the curation pipeline's rule for ONE ThermoML
  block, as a case the ENGINE runs in the browser (DEV.md 4c C334).

  NOTHING IS FITTED HERE.  This module writes the case -- a dataset in the
  form `extract-vle` / `extract-px` write, a thermoPhysPropDict with the NRTL
  pair at its starting point, a propsDict with ONE `fitParameters` op -- and
  reads back what the engine published.  The fit, the bubble points, the
  residuals and the minimax stage are choupoProps', exactly as in a curation
  case (data/curation/pairs/<a>-<b>/system/propsDict).

  THE RULE IS THE PIPELINE'S, and each number names where it is written:
    * NRTL with a_ij = a_ji = 0 and alpha 0.30 fixed; b_ij, b_ji fitted from
      0, bounds +/-3000 K (a curation case's propsDict, e.g.
      data/curation/pairs/acetone-methanol/system/propsDict);
    * stage A: least squares over every interior point; a point beyond 3 K
      (bubble T, pairs_c283.py OUTLIER_K) or 20 % (bubble P, pairs_px.py
      OUTLIER_PCT) is discarded BY ROW, and for bubble P a block with more
      than half of its points beyond is discarded whole (pairs_px.py
      outliers_of); stage B: `twoStage` on the kept points;
    * the grade: max |T_model - T| over the kept points, clean / warning /
      severe up to 1 / 2 / 4 K, refused above (pairs_c283.py GRADE_K); for
      bubble P, max |P_model - P|/P at 5 / 10 / 20 % (pairs_px.py GRADE_PCT);
    * the cap (C300 rule 2, pairs_c283.py cap_grade): an in-sample clean
      needs two temperatures AND two laboratories; ONE file is one
      laboratory, so a clean here is always capped at warning, and the page
      says why.
  What it does NOT run, said where the page shows the result: the second
  start, the one-liquid test (arm f of check_regressed_pairs), and the other
  laboratories of the pair.
\*---------------------------------------------------------------------------*/

//  pyRepr is the extractor's own spelling of a held constant (`{rec['P_kPa']}`).
import {
  bubblePDataRows, bubbleTDataRows, pyG, pyRepr, uncertaintyValues,
  type BubblePRecord, type BubbleTRecord,
} from "../../case/thermomlReader.js";

export type FitKind = "T_bubble" | "P_bubble";

/** The pipeline's numbers, each with the line that states it. */
export const FIT_RULE = {
  /** pairs_c283.py:71 */
  outlierK: 3,
  /** pairs_px.py:68 */
  outlierPct: 20,
  /** pairs_c283.py:90 -- upper limits of clean / warning / severe, K */
  gradeK: [1, 2, 4] as const,
  /** pairs_c283.py:87 / pairs_px.py:71 -- the same in per cent of P */
  gradePct: [5, 10, 20] as const,
  /** bin/choupo-curate:109 */
  minInterior: 5,
  /** pairs_c283.py:254, the archive query: at or below 110 kPa */
  pMaxKPa: 110,
  alpha: 0.3,
  bound: 3000,
} as const;

export const CASE_NAME = "database-to-parameters";

export interface PairFitInput {
  /** The block as the reader gives it. */
  rec: BubbleTRecord | BubblePRecord;
  /** Catalogue component names, in the record's `system` order (x is the
   *  first one's mole fraction).  The page asks the student to pick them. */
  names: [string, string];
  /** Indices into rec.points that are fitted (the interior points). */
  keep: number[];
  /** Citation fields of the file, for the dataset's provenance. */
  citation: { file: string; block: number; doi: string; text: string };
  /** `synthetic` for the page's own example file, `measured` otherwise. */
  source: "measured" | "synthetic";
}

export const kindOf = (rec: BubbleTRecord | BubblePRecord): FitKind =>
  rec.kind === "bubbleT" ? "T_bubble" : "P_bubble";

export const DATASET_PATH = "constant/experiments/thermoml-block.dat";

const q = (s: string): string => s.replace(/"/g, "'");

/** The dataset, in the grammar extract-vle / extract-px write: the same
 *  columns, the same rows (gui/tests/thermomlReader.test.ts holds the rows
 *  to the extractor), the same uncertainty block. */
export function datasetText(inp: PairFitInput): string {
  const [c1, c2] = inp.names;
  const L: string[] = [
    "/*  Written by the EduTool \"From a database to binary parameters\" from a",
    "    ThermoML block, in the form bin/choupo-thermoml writes.  */",
    "",
  ];
  const prov = [
    "provenance", "{",
    `    source       ${inp.source};`,
    ...(inp.source === "measured"
      ? ["    reviewStatus transcribedNotCheckedAgainstArticle;"] : []),
    `    citation     "${q(inp.citation.text)}";`,
    `    archiveFile  "${q(inp.citation.file)}";`,
    `    block        ${inp.citation.block};`,
    `    doi          "${q(inp.citation.doi || "none-declared")}";`,
    "}", "",
  ];
  if (inp.rec.kind === "bubbleT") {
    const r = inp.rec;
    L.push("property     binaryVLE.T_bubble;", `system       ( ${c1} ${c2} );`);
    if (r.PkPa !== undefined) L.push(`pressure     ${pyRepr(r.PkPa)} kPa;`);
    L.push("", ...prov);
    const u = uncertaintyValues(r.uT, inp.keep);
    if (u !== null)
      L.push("uncertainty", "{", "    T_bubble", "    {",
        "        kind    expandedCombined;",
        `        level   ${r.uTLevel || "undeclared"};`, "        unit    K;",
        `        values  ( ${u} );`, "    }", "}", "");
    L.push("columns", "(", `    { name x[${c1}];  unit -;  }`);
    if (r.PkPaPerPoint) L.push("    { name Pressure;  unit kPa; }");
    L.push("    { name T_bubble;  unit K;  }", ");", "", "data", "(",
      ...bubbleTDataRows(r, inp.keep), ");", "");
  } else {
    const r = inp.rec;
    L.push("property     binaryVLE.P_bubble;", `system       ( ${c1} ${c2} );`);
    if (r.TK !== undefined) L.push(`temperature  ${pyRepr(r.TK)} K;`);
    L.push("", ...prov);
    const u = uncertaintyValues(r.uP, inp.keep);
    if (u !== null)
      L.push("uncertainty", "{", "    P_bubble", "    {",
        "        kind    expandedCombined;",
        `        level   ${r.uPLevel || "undeclared"};`, "        unit    kPa;",
        `        values  ( ${u} );`, "    }", "}", "");
    L.push("columns", "(", `    { name x[${c1}];  unit -;  }`);
    if (r.isotherms) L.push("    { name T;  unit K; }");
    L.push("    { name Pressure;  unit kPa;  }", ");", "", "data", "(",
      ...bubblePDataRows(r, inp.keep), ");", "");
  }
  return L.join("\n");
}

/** Whether the per-point uncertainty allows `weighting uncertainty` -- the
 *  pipeline's rule for a bubble-T study (pairs_c283.py:351-354). */
export const hasFullUncertainty = (inp: PairFitInput): boolean =>
  inp.rec.kind === "bubbleT"
    ? uncertaintyValues(inp.rec.uT, inp.keep) !== null
    : uncertaintyValues(inp.rec.uP, inp.keep) !== null;

/** Every file of the case, for `filesToCaseFiles`.  `stage` picks the
 *  objective; `discard` lists 1-based data rows set aside by name. */
export function pairFitCaseFiles(
  inp: PairFitInput, stage: "leastSquares" | "twoStage", discard: readonly number[],
): Record<string, string> {
  const [c1, c2] = inp.names;
  const kind = kindOf(inp.rec);
  const pair = `${c1}-${c2}`;
  const path = `equilibrium.liquid.activityModel.binaryParameters.${pair}`;
  const weighting = kind === "T_bubble" && hasFullUncertainty(inp)
    ? "            weighting   uncertainty;\n" : "";
  const scale = kind === "T_bubble" ? "T_bubble absolute" : "P_bubble relative";
  const discardLine = discard.length
    ? `                discard  ( ${discard.join(" ")} );   // stage A's outliers, by row\n` : "";
  const controlDict = [
    "application   choupoProps;",
    `description   "NRTL ${pair} fitted to one ThermoML block (EduTool C334)";`,
    "verbosity     2;", "",
  ].join("\n");
  const thermo = [
    "recordType    thermophysicalPropertySystem;",
    "schemaVersion 2;", "",
    `components       ( ${c1}  ${c2} );`, "",
    "equilibrium", "{", "    formulation gammaPhi;", "",
    "    liquid", "    {", "        activityModel", "        {",
    "            model NRTL;",
    "            binaryParameters   // the fit's starting point",
    "            {", `                ${pair}`, "                {",
    `                    i ${c1};`, `                    j ${c2};`,
    "                    a_ij 0;", "                    b_ij 0;",
    "                    a_ji 0;", "                    b_ji 0;",
    `                    alpha ${FIT_RULE.alpha.toFixed(2)};`,
    "                }", "            }", "        }",
    "        standardState pureLiquid;", "    }", "",
    "    vapour", "    {", "        fugacityModel idealGas;", "    }", "}", "",
  ].join("\n");
  const props = `operations
(
    {
        name        fit_nrtl;
        type        fitParameters;

        parameters
        (
            { path  ${path}.b_ij;  initial 0;  min -${FIT_RULE.bound};  max ${FIT_RULE.bound}; }
            { path  ${path}.b_ji;  initial 0;  min -${FIT_RULE.bound};  max ${FIT_RULE.bound}; }
        );

        evidence
        (
            {
                dataset  "${DATASET_PATH}";
                role     fit;
${discardLine}            }
        );

        objective { method ${stage};  scale { ${scale}; } }
        residual
        {
            kind        ${kind};
            components  ( ${c1} ${c2} );
${weighting}        }

        options
        {
            maxIter      80;
            tolerance    1.0e-6;
            fdStep       1.0e-4;
            lambda0      1.0e-3;
        }

        output
        {
            parity     parity.csv;
        }
    }
);
`;
  return {
    [`${CASE_NAME}.cho`]: "",
    "system/controlDict": controlDict,
    "system/propsDict": props,
    "constant/thermoPhysPropDict": thermo,
    [DATASET_PATH]: datasetText(inp),
  };
}

/** One row of the engine's parity table: x, the measured value, the
 *  model's, and the residual the fit used (K for bubble T, relative for
 *  bubble P). */
export interface ParityRow { x: number; measured: number; model: number; residual: number }

/** Read parity.csv: the header names the columns, never their position. */
export function readParity(csv: string, kind: FitKind): ParityRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0]!.split(",").map((s) => s.trim());
  const col = (n: string): number => {
    const k = head.indexOf(n);
    if (k < 0) throw new Error(`parity.csv has no column '${n}' (it has ${head.join(", ")})`);
    return k;
  };
  const xi = head.findIndex((h) => /^x_?1$|^x\[/.test(h));
  if (xi < 0) throw new Error(`parity.csv has no composition column (it has ${head.join(", ")})`);
  const [mi, oi] = kind === "T_bubble"
    ? [col("T_exp"), col("T_model")] : [col("P_exp_Pa"), col("P_model_Pa")];
  //  FitParameters.cpp:3219-3220 writes `residual` (K) for a bubble-T fit
  //  and `residual_rel` for a bubble-P fit.
  const ri = col(kind === "T_bubble" ? "residual" : "residual_rel");
  return lines.slice(1).map((l) => {
    const v = l.split(",").map(Number);
    return { x: v[xi]!, measured: v[mi]!, model: v[oi]!, residual: v[ri]! };
  });
}

/** Stage A's outliers: 1-based rows beyond the limit (a NaN model -- no
 *  bubble point -- is one too, as in the pipeline).  For bubble P a block
 *  with MORE THAN HALF of its points beyond is discarded whole. */
export function outliersOf(rows: readonly ParityRow[], kind: FitKind): { rows: number[]; whole: boolean } {
  const bad = rows.map((r, k) => {
    const beyond = kind === "T_bubble"
      ? !(Math.abs(r.residual) <= FIT_RULE.outlierK)
      : !(Math.abs(r.residual) * 100 <= FIT_RULE.outlierPct);
    return beyond ? k + 1 : 0;
  }).filter((k) => k > 0);
  if (kind === "P_bubble" && bad.length > 0.5 * rows.length)
    return { rows: rows.map((_, k) => k + 1), whole: true };
  return { rows: bad, whole: false };
}

export type Grade = "clean" | "warning" | "severe" | "refused";

/** The graded acceptance on the largest error over the kept points. */
export function gradeOf(maxErr: number, kind: FitKind): Grade {
  if (!Number.isFinite(maxErr)) return "refused";
  const lims = kind === "T_bubble" ? FIT_RULE.gradeK : FIT_RULE.gradePct;
  const g: Grade[] = ["clean", "warning", "severe"];
  for (let k = 0; k < 3; k++) if (maxErr <= lims[k]!) return g[k]!;
  return "refused";
}

/** The largest error over the kept points: K for bubble T, per cent for
 *  bubble P -- the number the grade is taken on. */
export function maxErrorOf(rows: readonly ParityRow[], kind: FitKind): number {
  let m = 0;
  for (const r of rows) {
    const e = kind === "T_bubble" ? Math.abs(r.residual) : 100 * Math.abs(r.residual);
    if (!Number.isFinite(e)) return NaN;
    m = Math.max(m, e);
  }
  return m;
}

/** C300 rule 2 (pairs_c283.py cap_grade): only an in-sample clean is
 *  capped; one file is one laboratory. */
export function capOf(grade: Grade, nTemperatures: number, nLaboratories: number): { grade: Grade; caps: string[] } {
  if (grade !== "clean") return { grade, caps: [] };
  const caps: string[] = [];
  if (nTemperatures < 2) caps.push("singleTemperature");
  if (nLaboratories < 2) caps.push("singleLaboratory");
  return { grade: caps.length ? "warning" : grade, caps };
}

/** The distinct stated temperatures of the kept points, the C300 count:
 *  the isotherms of a P-x block, the distinct bubble temperatures of a T-x
 *  isobar (docs/design/binary-pairs-from-open-measurements.md section 13). */
export function temperaturesOf(rec: BubbleTRecord | BubblePRecord, keep: readonly number[]): number {
  const T = keep.map((k) => rec.points[k]![1]!);
  return new Set(T.map((t) => pyG(t, 12))).size;
}

/** Why the PIPELINE would set this block aside, in its own terms
 *  (pairs_c283.py:344-357, the P-x mirror in pairs_px.py): no stated
 *  uncertainty on every point, fewer than five interior points, a pressure
 *  above 110 kPa.  Empty: the pipeline would fit it.  The page still lets a
 *  student fit a set-aside block, and says it would not be curated. */
export function pipelineIssues(rec: BubbleTRecord | BubblePRecord): string[] {
  const out: string[] = [];
  const keep = rec.points.map((p, k) => (0 < p[0]! && p[0]! < 1 ? k : -1)).filter((k) => k >= 0);
  const u = rec.kind === "bubbleT" ? rec.uT : rec.uP;
  if (uncertaintyValues(u, keep) === null) out.push("no stated uncertainty on every point");
  if (keep.length < FIT_RULE.minInterior)
    out.push(`only ${keep.length} interior point(s) (fewer than ${FIT_RULE.minInterior})`);
  const pmax = rec.kind === "bubbleT"
    ? Math.max(...(rec.PkPaPerPoint ?? [rec.PkPa ?? NaN]))
    : Math.max(...rec.points.map((p) => p[2]));
  if (pmax > FIT_RULE.pMaxKPa) out.push(`a pressure above ${FIT_RULE.pMaxKPa} kPa (${pyG(pmax, 6)} kPa)`);
  return out;
}
