/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  EquilibriumLandscapesTool -- what the equilibrium model with an approach
  temperature can reach, surveyed over five reaction systems.

  THE PAGE IS A SCROLLING LESSON, the companion of ApproachToEquilibriumTool
  and built on its shape: steps 1-2 above the interactive earn it, steps 3-5
  read off it, step 6 closes on the contrast panel, the limits close the
  page.  The same knob conventions (a MAGNITUDE slider floored at 0 because
  the engine refuses a negative one), the same data path (a bundled witness
  run in the browser through `useMethodRun`), the same rule: ZERO PHYSICS IN
  TYPESCRIPT.

  THE DATA PATH, and why no generated JSON.  Each system is a `gibbsMap`
  witness under tutorials/props/gibbs/ that DECLARES `temperatureApproach 0;`
  -- methodRun's override channel replaces the number of a declared scalar
  and cannot add a key, so the key sits in the dict at zero.  The page runs
  `choupoProps` on the selected witness twice: once as declared (the true
  equilibrium) and, when the slider is above zero, once with the magnitude
  written into that key.  It reads the op's `map.csv` through the SAME
  parser the Explorer's equilibrium map uses (`parseGibbsMapCsv`) and the
  op's diagnostics through `operationResults`.  A landscape is 93 to 138
  Gibbs solves; measured natively, each witness runs in well under a
  second, so a pre-generated JSON with a staleness gate would have bought
  nothing and added a second home for numbers the engine already publishes.

  WHAT THE TYPESCRIPT DOES, all of it: groups the CSV rows by pressure,
  draws them, and -- the one comparison -- finds for each pressure the
  temperature at which |shifted − equilibrium| is largest, which is where
  the local slope of the curve is steepest (lesson step 4).  Nothing here
  forms a conversion, reads an enthalpy or decides a sign: the sign is in
  the CSV's `deltaT_K` column and in the run's tally diagnostics, both
  written by the engine (GibbsMapOp.cpp:201–203 and 268–292).

  MEASURED before this file was written, natively, on the sealed witnesses
  (the runs are in the record docs/design/what-the-approach-model-can-reach.md):

      landscape01_ammonia_synthesis      108 cells, 0 unconverged
        metric_T25C_P1atm     0.937894955707   (298.15 K, 1 bar)
        metric_T427C_P197atm  0.30011873919    (700 K, 200 bar, ideal gas)
        metric_T427C_P1atm    0.00304484809276 (700 K, 1 bar)
        gibbs10_ammonia_fugacity's own golden at 700 K, 200 bar under SRK:
        y_NH3 = 0.323866847046
      landscape02_water_gas_shift        138 cells, 0 unconverged;
        the three pressure columns identical to every printed digit
      landscape03_steam_reforming        108 cells, 0 unconverged
      landscape04_methane_combustion     117 cells, 0 unconverged
      landscape05_thermal_no              93 cells, 0 unconverged
      with temperatureApproach 50: ammonia 111 exothermic solves,
        shift 139 exothermic, reforming 109 endothermic,
        combustion 123 exothermic + 1 undetermined, NO feed 94 exothermic;
        on the NO witness every shifted cell carries MORE NO than the
        equilibrium at the physical T (the GLOBAL caveat, lesson step 5).
      landscape06_nitrogen_fixation_routes (reactionGibbs, kJ/mol as written):
        heterotrophic  298.15 K  dG -165.284655706  (dH  264.369550401, dS 1441.07 J/mol K)
        phototrophic   298.15 K  dG  678.607668397  (dH  767.3247752,   dS  297.56)
        haberBosch     298.15 K  dG  -32.8135035    (dH  -91.88,        dS -198.11)
        phototrophic   310.15 K  dG  675.070347441
        haberBosch     310.15 K  dG  -30.4256098317
        haberBosch     700 K     dG   54.2847022924  (ln K -9.32706998232)
        and the sugar route at 310.15 K REFUSES: "Component 'glucose':
        h_formation liquid leg needs liquidHeatCapacity" (a copy of the
        witness with heterotrophic added to routes310).

  THE SIXTH WITNESS IS NOT A LANDSCAPE.  It runs `reactionGibbs`, the op
  built for this page (src/propertyOps/ReactionGibbs.cpp), because the
  biological routes carry a solid sugar and liquid water beside gases and
  every reactor's route to dG prices the ideal-gas rung and refuses them
  (the lesson's step 6 quotes the refusal).  The contrast panel draws that
  run's diagnostics as a table -- three routes, the temperatures each can
  be asked at -- beside the ammonia landscape's own anchor cells and
  gibbs10's SRK answer.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Group, Loader, SegmentedControl, Stack, Text,
  Title,
} from "@mantine/core";

import { useMethodRun, type DictOverride } from "../../case/methodRun.js";
import type { RunResult } from "../../adapters/SolverAdapter.js";
import { parseGibbsMapCsv, type GibbsMapData } from "../plotting/gibbsMapCsv.js";
import { KnobSlider, PanelNote, type PanelKnob } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { LANDSCAPE_LIMITS, LANDSCAPE_STEPS } from "./equilibriumLandscapesLesson.js";
import { setActiveMethodTool } from "./registry.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const SERIES = [
  "var(--mantine-color-blue-6)",
  "var(--mantine-color-teal-6)",
  "var(--mantine-color-grape-6)",
];

/** One landscape: a bundled `gibbsMap` witness and how to read its metric.
 *
 *  `moreIsMoreConverted` is a DECLARATION about the metric, not a computation
 *  (the ApproachToEquilibriumTool convention): the reforming witness plots
 *  the carbon still in methane, so LESS of it is more converted.  `logAxis`
 *  is a DRAWING choice for a metric that spans decades; it changes no
 *  number. */
export interface LandscapeWitness {
  id: string;
  label: string;
  /** Bundled tutorial identifier (no leading `tutorials/`). */
  witness: string;
  /** The op name the case declares -- the key into `operationResults`. */
  op: string;
  reaction: string;
  metricLabel: string;
  moreIsMoreConverted: boolean;
  logAxis: boolean;
  /** The thermicity and mole change the lesson predicts, as WORDS the
   *  readout compares against the engine's own tally. */
  predicted: { thermicity: "exothermic" | "endothermic"; moles: string };
}

const AMMONIA: LandscapeWitness = {
  id: "ammonia", label: "Ammonia synthesis",
  witness: "props/gibbs/landscape01_ammonia_synthesis", op: "ammonia",
  reaction: "N₂ + 3 H₂ ⇌ 2 NH₃",
  metricLabel: "equilibrium NH₃ mole fraction (gas phase)",
  moreIsMoreConverted: true, logAxis: false,
  predicted: { thermicity: "exothermic", moles: "4 → 2: pressure helps" },
};
const WGS: LandscapeWitness = {
  id: "wgs", label: "Water–gas shift",
  witness: "props/gibbs/landscape02_water_gas_shift", op: "wgs",
  reaction: "CO + H₂O ⇌ CO₂ + H₂",
  metricLabel: "carbon leaving as CO₂ — the CO conversion",
  moreIsMoreConverted: true, logAxis: false,
  predicted: { thermicity: "exothermic", moles: "2 → 2: pressure-indifferent" },
};
const REFORMING: LandscapeWitness = {
  id: "reforming", label: "Steam reforming",
  witness: "props/gibbs/landscape03_steam_reforming", op: "reformer",
  reaction: "CH₄ + H₂O ⇌ CO + 3 H₂ (with the shift), steam-to-carbon 3",
  metricLabel: "carbon still in CH₄ — one minus the methane conversion",
  moreIsMoreConverted: false, logAxis: false,
  predicted: { thermicity: "endothermic", moles: "2 → 4: pressure hurts" },
};
const COMBUSTION: LandscapeWitness = {
  id: "combustion", label: "Methane combustion",
  witness: "props/gibbs/landscape04_methane_combustion", op: "burner",
  reaction: "CH₄ + 2 O₂ → CO₂ + 2 H₂O in stoichiometric air",
  metricLabel: "carbon fully oxidised to CO₂",
  moreIsMoreConverted: true, logAxis: false,
  predicted: { thermicity: "exothermic",
    moles: "complete until CO₂ dissociates; the dissociation makes moles" },
};
const THERMAL_NO: LandscapeWitness = {
  id: "no", label: "Thermal NO",
  witness: "props/gibbs/landscape05_thermal_no", op: "burner",
  reaction: "N₂ + O₂ ⇌ 2 NO inside the same flame (NO added to the list)",
  metricLabel: "equilibrium NO mole fraction (log axis)",
  moreIsMoreConverted: true, logAxis: true,
  predicted: { thermicity: "exothermic",
    moles: "the OVERALL feed is combustion; NO formation is 2 → 2" },
};

export const LANDSCAPE_WITNESSES: readonly LandscapeWitness[] =
  [AMMONIA, WGS, REFORMING, COMBUSTION, THERMAL_NO];

/** The sixth witness: three overall routes to fixed nitrogen priced by
 *  `reactionGibbs`.  Each row names the op that publishes it, the reaction
 *  and the temperature, exactly as the diagnostics are keyed
 *  (`<rxn>_T<K>K_<quantity>`, ReactionGibbs.cpp).  The rows that are NOT here
 *  are a refusal, quoted in lesson step 6: the sugar route cannot be priced
 *  off the datum temperature, and liquid water is not asked at 700 K. */
export const FIXATION_WITNESS = "props/gibbs/landscape06_nitrogen_fixation_routes";

export interface RouteRow {
  op: string; rxn: string; T_K: number; label: string; donor: string;
}
export const ROUTE_ROWS: readonly RouteRow[] = [
  { op: "routes298", rxn: "heterotrophic", T_K: 298, label: "C₆H₁₂O₆(s) + 4 N₂ + 6 H₂O(l) → 6 CO₂ + 8 NH₃", donor: "sugar (24 e⁻)" },
  { op: "routes298", rxn: "phototrophic",  T_K: 298, label: "N₂ + 3 H₂O(l) → 2 NH₃ + 3/2 O₂", donor: "water (6 e⁻), light" },
  { op: "routes298", rxn: "haberBosch",    T_K: 298, label: "N₂ + 3 H₂ → 2 NH₃", donor: "H₂ (industrial)" },
  { op: "routes310", rxn: "phototrophic",  T_K: 310, label: "N₂ + 3 H₂O(l) → 2 NH₃ + 3/2 O₂", donor: "water (6 e⁻), light" },
  { op: "routes310", rxn: "haberBosch",    T_K: 310, label: "N₂ + 3 H₂ → 2 NH₃", donor: "H₂ (industrial)" },
  { op: "haber700",  rxn: "haberBosch",    T_K: 700, label: "N₂ + 3 H₂ → 2 NH₃", donor: "H₂ (industrial)" },
];

/** The diagnostic key `reactionGibbs` publishes for one row and quantity. */
export function routeKey(r: RouteRow, q: "dH_kJ_mol" | "dS_J_molK" | "dG_kJ_mol" | "lnK"): string {
  return `${r.rxn}_T${r.T_K}K_${q}`;
}

/** The corpus case whose real-gas answer sits beside the ideal one on the
 *  contrast panel: the same species, feed, T and P as the ammonia witness's
 *  second anchor, under an SRK package. */
export const SRK_CONTRAST = {
  witness: "steady/gibbs/gibbs10_ammonia_fugacity", unit: "ammonia",
  kpi: "y_NH3",
} as const;

/** The two anchor KPIs the contrast reads, exactly as GibbsMapOp names them
 *  (`metric_T<C>C_P<atm>atm`, GibbsMapOp.cpp:249–255): 298.15 K rounds to
 *  25 C and 1e5 Pa to 1 atm; 700 K is 427 C and 2e7 Pa rounds to 197 atm. */
export const CONTRAST_ANCHORS = {
  ambient: { key: "metric_T25C_P1atm", label: "298 K, 1 bar" },
  converter: { key: "metric_T427C_P197atm", label: "700 K, 200 bar" },
  hotAmbientP: { key: "metric_T427C_P1atm", label: "700 K, 1 bar" },
} as const;

/** The ONE dict scalar the slider writes.  Declared bare (no unit) in every
 *  witness; the empty unit is asserted so a witness that ever declared `K`
 *  would refuse instead of silently writing the number under it. */
export function approachOverride(dT: number): DictOverride[] {
  return [{ file: "system/propsDict", key: "temperatureApproach",
            value: dT, unit: "" }];
}

/** The magnitude knob: floor 0 because the engine's is (GibbsMapOp.cpp:
 *  109–118 refuses a negative magnitude by name). */
export const LANDSCAPE_DT_KNOB: PanelKnob = {
  id: "dT", label: "approach |ΔT| — a MAGNITUDE; the engine assigns the sign per cell",
  min: 0, max: 100, step: 5, unit: "K",
  why: "Zero draws the true equilibrium.  Above zero the witness runs a "
    + "second time with this magnitude written into its declared "
    + "`temperatureApproach`, the engine decides the sign at every cell from "
    + "the thermicity of the overall transformation there, and the dashed "
    + "curves are what the model then REPORTS at each physical T.",
};

// ---- the arithmetic, all of it ---------------------------------------------

export interface Curve { P_Pa: number; T: number[]; v: number[]; }

/** Group converged cells by pressure, sorted by T.  Unconverged cells are
 *  DROPPED from the curve (never interpolated) and counted by the caller
 *  from the run's own `n_unconverged`. */
export function curvesOf(data: GibbsMapData | null): Curve[] {
  if (!data) return [];
  return data.Ps.map((P) => {
    const cells = data.cells
      .filter((c) => c.P_Pa === P && c.converged && Number.isFinite(c.metric))
      .sort((a, b) => a.T_K - b.T_K);
    return { P_Pa: P, T: cells.map((c) => c.T_K), v: cells.map((c) => c.metric) };
  });
}

/** For each pressure, the temperature at which the shifted curve is farthest
 *  from the equilibrium one, and by how much -- an argmax over two sets of
 *  engine numbers at matching (T, P).  `null` where the two runs do not share
 *  a pressure or no cell matches. */
export interface LargestShift { P_Pa: number; T: number; delta: number; }

export function largestShift(base: Curve[], shifted: Curve[]): LargestShift[] {
  const out: LargestShift[] = [];
  for (const b of base) {
    const s = shifted.find((x) => x.P_Pa === b.P_Pa);
    if (!s) continue;
    let best: LargestShift | null = null;
    for (let i = 0; i < b.T.length; ++i) {
      const j = s.T.indexOf(b.T[i]!);
      if (j < 0) continue;
      const d = s.v[j]! - b.v[i]!;
      if (best === null || Math.abs(d) > Math.abs(best.delta))
        best = { P_Pa: b.P_Pa, T: b.T[i]!, delta: d };
    }
    if (best) out.push(best);
  }
  return out;
}

/** The engine's tally of which sign it took, read off the run's diagnostics
 *  (GibbsMapOp.cpp:268–292).  `null` when the run declared no approach --
 *  the keys are then absent, which is the engine's way of saying nothing
 *  was assigned. */
export interface DirectionTally { exo: number; endo: number; undetermined: number; }

export function tallyOf(diag: { [k: string]: number } | undefined): DirectionTally | null {
  if (!diag) return null;
  const exo = diag["approachDirection_exothermicSolves"];
  const endo = diag["approachDirection_endothermicSolves"];
  const und = diag["approachDirection_undeterminedSolves"];
  if (exo === undefined || endo === undefined || und === undefined) return null;
  return { exo, endo, undetermined: und };
}

/** One word for a tally: unanimous one way, unanimous the other, or a map
 *  that CROSSES a thermicity boundary (the engine's own phrase). */
export function tallyWord(t: DirectionTally | null):
  "exothermic" | "endothermic" | "mixed" | null {
  if (!t) return null;
  const decided = t.exo + t.endo;
  if (decided === 0) return null;
  if (t.endo === 0) return "exothermic";
  if (t.exo === 0) return "endothermic";
  return "mixed";
}

function fmt(v: number | null | undefined, digits: number): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(digits);
}
function fmtMetric(v: number | null | undefined, log: boolean): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return log ? v.toExponential(3) : v.toFixed(4);
}
const barOf = (P_Pa: number): string => (P_Pa / 1e5).toFixed(0);

// ---- the drawing -------------------------------------------------------------

function LandscapeChart({ base, shifted, w, dT }: {
  base: Curve[]; shifted: Curve[]; w: LandscapeWitness; dT: number;
}): JSX.Element | null {
  if (base.length === 0) return null;
  const W = 520, H = 260, L = 64, Rr = 16, Tp = 14, B = 40;
  const allT = base.flatMap((c) => c.T);
  const allV = [...base, ...shifted].flatMap((c) => c.v)
    .filter((v) => !w.logAxis || v > 0);
  if (allT.length === 0 || allV.length === 0) return null;
  const tLo = Math.min(...allT), tHi = Math.max(...allT);
  const f = (v: number) => (w.logAxis ? Math.log10(v) : v);
  const vLo = Math.min(...allV.map(f)), vHi = Math.max(...allV.map(f));
  const vSpan = vHi - vLo || 1;
  const px = (t: number) => L + ((t - tLo) / ((tHi - tLo) || 1)) * (W - L - Rr);
  const py = (v: number) => H - B - ((f(v) - vLo) / vSpan) * (H - Tp - B);
  const path = (c: Curve) => c.T.map((t, i) =>
    `${i === 0 ? "M" : "L"}${px(t).toFixed(1)},${py(c.v[i]!).toFixed(1)}`).join(" ");
  const yTicks = w.logAxis
    ? Array.from({ length: Math.floor(vHi) - Math.ceil(vLo) + 1 },
        (_, i) => Math.pow(10, Math.ceil(vLo) + i))
    : [vLo, (vLo + vHi) / 2, vHi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet"
      role="img" aria-label={`${w.label}: the computed equilibrium landscape`}>
      <line x1={L} y1={H - B} x2={W - Rr} y2={H - B} stroke={GRID} strokeWidth={1} />
      <line x1={L} y1={Tp} x2={L} y2={H - B} stroke={GRID} strokeWidth={1} />
      {[tLo, (tLo + tHi) / 2, tHi].map((t) => (
        <text key={t} x={px(t)} y={H - B + 14} fontSize={10} fill={INK}
          textAnchor="middle">{t.toFixed(0)}</text>
      ))}
      {yTicks.map((v) => (
        <text key={v} x={L - 6} y={py(v) + 3} fontSize={10} fill={INK}
          textAnchor="end">{w.logAxis ? v.toExponential(0) : v.toFixed(2)}</text>
      ))}
      <text x={(W + L) / 2} y={H - 4} fontSize={11} fill={INK}
        textAnchor="middle">physical temperature T [K]</text>
      <text x={8} y={Tp - 2} fontSize={10} fill={INK}>{w.metricLabel}</text>
      {base.map((c, i) => (
        <g key={`b${c.P_Pa}`}>
          <path d={path(c)} fill="none" stroke={SERIES[i % SERIES.length]}
            strokeWidth={1.6} />
          {c.T.map((t, k) => (
            <circle key={k} cx={px(t)} cy={py(c.v[k]!)} r={1.8}
              fill={SERIES[i % SERIES.length]} />
          ))}
        </g>
      ))}
      {dT > 0 && shifted.map((c, i) => (
        <path key={`s${c.P_Pa}`} d={path(c)} fill="none"
          stroke={SERIES[i % SERIES.length]} strokeWidth={1.6}
          strokeDasharray="5 3" />
      ))}
      {base.map((c, i) => (
        <text key={`l${c.P_Pa}`} x={W - Rr - 4} y={Tp + 12 + 13 * i} fontSize={10}
          fill={SERIES[i % SERIES.length]} textAnchor="end">
          {barOf(c.P_Pa)} bar{dT > 0 ? " (solid: equilibrium · dashed: T ± |ΔT|)" : ""}
        </text>
      ))}
    </svg>
  );
}

// ---- the page ----------------------------------------------------------------

export function EquilibriumLandscapesTool(): JSX.Element {
  const [witnessId, setWitnessId] = useState(AMMONIA.id);
  const w = LANDSCAPE_WITNESSES.find((x) => x.id === witnessId) ?? AMMONIA;
  const [dT, setDT] = useState(0);

  //  The equilibrium run is the case AS DECLARED (temperatureApproach 0).
  const baseRun = useMethodRun(w.witness, [], JSON.stringify([w.id, "base"]), "choupoProps");
  //  The shifted run exists only when the slider is above zero; a null
  //  witness makes the hook idle rather than running the same question twice.
  const shiftOv = useMemo(() => approachOverride(dT), [dT]);
  const shiftRun = useMethodRun(dT > 0 ? w.witness : null, shiftOv,
    JSON.stringify([w.id, dT]), "choupoProps");

  const mapOf = (r: RunResult | null): GibbsMapData | null => {
    const csv = r?.csvFiles?.["map.csv"];
    return csv ? parseGibbsMapCsv(csv) : null;
  };
  const diagOf = (r: RunResult | null) =>
    r?.operationResults?.find((o) => o.name === w.op && o.type === "gibbsMap")?.diagnostics;

  const baseData = useMemo(() => mapOf(baseRun.result), [baseRun.result]);
  const shiftData = useMemo(() => mapOf(shiftRun.result), [shiftRun.result]);
  const base = useMemo(() => curvesOf(baseData), [baseData]);
  const shifted = useMemo(() => curvesOf(shiftData), [shiftData]);
  const baseDiag = diagOf(baseRun.result);
  const shiftDiag = diagOf(shiftRun.result);
  const tally = tallyOf(shiftDiag);
  const word = tallyWord(tally);
  const shifts = useMemo(() => largestShift(base, shifted), [base, shifted]);
  const nUnconv = baseDiag?.["n_unconverged"];

  //  The contrast panel (step 6): the ammonia witness as declared, and the
  //  corpus's SRK case at the same point.  Two runs, both engine numbers.
  const contrastRun = useMethodRun(AMMONIA.witness, [], "contrast", "choupoProps");
  const srkRun = useMethodRun(SRK_CONTRAST.witness, [], "srk", "choupoSolve");
  const fixRun = useMethodRun(FIXATION_WITNESS, [], "fixation", "choupoProps");
  const routeDiag = (op: string) =>
    fixRun.result?.operationResults?.find((o) => o.name === op && o.type === "reactionGibbs")?.diagnostics;
  const cDiag = contrastRun.result?.operationResults
    ?.find((o) => o.name === AMMONIA.op && o.type === "gibbsMap")?.diagnostics;
  const ySRK = srkRun.result?.kpis?.[SRK_CONTRAST.unit]?.[SRK_CONTRAST.kpi];

  const busy = baseRun.busy || shiftRun.busy;
  const err = baseRun.err ?? shiftRun.err;
  const step = lessonStepper(LANDSCAPE_STEPS);

  const onWitness = (id: string) => {
    if (LANDSCAPE_WITNESSES.some((x) => x.id === id)) setWitnessId(id);
  };

  const controls = (
    <>
      <KnobSlider knob={LANDSCAPE_DT_KNOB} value={dT} onChange={setDT} showWhy />
      <PanelNote>
        Runs <code>tutorials/{w.witness}</code> in your browser on the WASM
        build of <code>choupoProps</code>: the <code>gibbsMap</code> op at
        every cell of its declared T × P grid, once as declared and — above
        zero — once more with |ΔT| written into its declared{" "}
        <code>temperatureApproach</code>.  Every point is a Gibbs solve;
        the segments only join neighbours, and an unconverged cell is left
        out rather than drawn.
      </PanelNote>
    </>
  );

  const readout = (
    <Box>
      <Group gap="xs" wrap="wrap" mb={8}>
        <Badge variant="light" color="blue">
          {w.reaction}
        </Badge>
        <Badge variant="light" color="gray">
          lesson predicts: {w.predicted.thermicity} · {w.predicted.moles}
        </Badge>
        {typeof nUnconv === "number" && (
          <Badge variant="light" color={nUnconv === 0 ? "green" : "yellow"}>
            {baseDiag?.["n_cells"] ?? "—"} cells · {nUnconv} unconverged
          </Badge>
        )}
      </Group>
      <Text size="sm">
        {dT === 0
          ? "|ΔT| = 0: the curves are the true equilibrium at each physical "
            + "temperature and pressure, and the engine assigned no direction "
            + "— nothing was declared."
          : tally === null
            ? "Waiting for the shifted run."
            : (
              <>
                The engine assigned the direction at each of{" "}
                <b>{tally.exo + tally.endo + tally.undetermined}</b> solves:{" "}
                <b>{tally.exo}</b> exothermic (T + |ΔT|), <b>{tally.endo}</b>{" "}
                endothermic (T − |ΔT|), <b>{tally.undetermined}</b> undetermined
                (T + |ΔT| by announced default).
                {word === "mixed"
                  ? <> The map CROSSES a thermicity boundary, so no single signed
                      value describes it; the CSV carries each cell&apos;s own.</>
                  : word
                    ? <> The run is unanimously <b>{word}</b>
                        {word === w.predicted.thermicity
                          ? ", as step 2 predicts for this feed."
                          : " — which is NOT what the lesson predicted; read "
                            + "the engine, not the page."}</>
                    : null}
              </>
            )}
      </Text>
      {dT > 0 && shifts.length > 0 && (
        <Text size="sm" mt={6}>
          Where the approach moves this landscape most — the temperature at
          which the shifted curve is farthest from the equilibrium one, per
          pressure:{" "}
          {shifts.map((s, i) => (
            <span key={s.P_Pa}>
              {i > 0 ? "; " : ""}
              <b>{barOf(s.P_Pa)} bar</b> at T = {s.T.toFixed(0)} K
              ({s.delta > 0 ? "+" : ""}{fmtMetric(s.delta, w.logAxis)}
              {" "}in the metric
              {w.moreIsMoreConverted
                ? (s.delta < 0 ? ", short of equilibrium" : ", BEYOND the equilibrium at T")
                : (s.delta > 0 ? ", short of equilibrium" : ", BEYOND the equilibrium at T")})
            </span>
          ))}
          .
        </Text>
      )}
      {dT > 0 && w.id === THERMAL_NO.id && shifts.some((s) => s.delta > 0) && (
        <Alert color="yellow" variant="light" mt={8}
          title="A minor product moved the wrong way: the GLOBAL caveat">
          The engine read the overall transformation of this feed —
          combustion, exothermic — and took T + |ΔT| at every cell.  NO
          formation is endothermic, so at T + |ΔT| the model reports MORE NO
          than the true equilibrium at the physical temperature.  One number
          per feed cannot resolve a product whose thermicity opposes the
          feed&apos;s; the engine says so on every run (GibbsReactor.cpp:364–368).
        </Alert>
      )}
    </Box>
  );

  const routeTable = (
    <Box mt={8} p="sm" style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Text size="sm" fw={600}>
        Three overall routes to fixed nitrogen, priced by <code>reactionGibbs</code> — read from the run, never typed
      </Text>
      {fixRun.busy && (
        <Group gap="sm" wrap="nowrap" align="center" mt={4}>
          <Loader size="xs" />
          <Text size="xs" c="dimmed">the fixation witness is running</Text>
        </Group>
      )}
      <Box mt={6} style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
          <thead>
            <tr>
              {["route (as written)", "electron donor", "T [K]", "ΔH° [kJ/mol]", "ΔS° [J/(mol·K)]", "ΔG° [kJ/mol]", "ln K", "verdict"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "2px 6px",
                  borderBottom: `1px solid ${GRID}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROUTE_ROWS.map((r) => {
              const d = routeDiag(r.op);
              const dG = d?.[routeKey(r, "dG_kJ_mol")];
              return (
                <tr key={`${r.op}-${r.rxn}-${r.T_K}`}>
                  <td style={{ padding: "2px 6px" }}>{r.label}</td>
                  <td style={{ padding: "2px 6px" }}>{r.donor}</td>
                  <td style={{ padding: "2px 6px" }}>{r.T_K === 298 ? "298.15" : r.T_K === 310 ? "310.15" : r.T_K}</td>
                  <td style={{ padding: "2px 6px", fontFamily: "monospace" }}>{fmt(d?.[routeKey(r, "dH_kJ_mol")], 1)}</td>
                  <td style={{ padding: "2px 6px", fontFamily: "monospace" }}>{fmt(d?.[routeKey(r, "dS_J_molK")], 1)}</td>
                  <td style={{ padding: "2px 6px", fontFamily: "monospace" }}>{fmt(dG, 1)}</td>
                  <td style={{ padding: "2px 6px", fontFamily: "monospace" }}>{fmt(d?.[routeKey(r, "lnK")], 1)}</td>
                  <td style={{ padding: "2px 6px" }}>
                    {typeof dG !== "number" ? "—" : dG < 0 ? "exergonic" : "endergonic"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Box>
      <Text size="xs" c="dimmed" mt={6}>
        Diagnostics of <code>tutorials/{FIXATION_WITNESS}</code>: every species
        on its DECLARED standard state (the sugar on its solid rung, water as a
        pure liquid by the vaporisation crossing, the gases on theirs), the
        datum the elements/formation convention at 298.15 K.  A row that is
        not in this table is a refusal the lesson quotes: the sugar route
        cannot be priced off the datum temperature because glucose.dat carries
        no heat capacity, and liquid water is not asked at 700 K.  Exergonic
        means the equilibrium permits it — nothing here is a rate.
      </Text>
      {fixRun.err && (
        <Alert color="red" variant="light" mt={6} title="The fixation witness did not finish">
          <Text size="sm">{fixRun.err}</Text>
        </Alert>
      )}
    </Box>
  );

  const contrast = (
    <Box mt={8} p="sm" style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Text size="sm" fw={600}>
        The industrial route on the landscape: the same Gibbs minimisation, three times — read from the runs, never typed
      </Text>
      {(contrastRun.busy || srkRun.busy) && (
        <Group gap="sm" wrap="nowrap" align="center" mt={4}>
          <Loader size="xs" />
          <Text size="xs" c="dimmed">the ammonia witness and gibbs10 are running</Text>
        </Group>
      )}
      <Group gap="xs" wrap="wrap" mt={6}>
        <Badge variant="light" color="green" size="lg">
          {CONTRAST_ANCHORS.ambient.label} · y_NH3 ={" "}
          {fmt(cDiag?.[CONTRAST_ANCHORS.ambient.key], 4)}
        </Badge>
        <Badge variant="light" color="orange" size="lg">
          {CONTRAST_ANCHORS.hotAmbientP.label} · y_NH3 ={" "}
          {fmt(cDiag?.[CONTRAST_ANCHORS.hotAmbientP.key], 4)}
        </Badge>
        <Badge variant="light" color="blue" size="lg">
          {CONTRAST_ANCHORS.converter.label}, ideal gas · y_NH3 ={" "}
          {fmt(cDiag?.[CONTRAST_ANCHORS.converter.key], 4)}
        </Badge>
        <Badge variant="light" color="grape" size="lg">
          {CONTRAST_ANCHORS.converter.label}, SRK (gibbs10) · y_NH3 ={" "}
          {fmt(typeof ySRK === "number" ? ySRK : null, 4)}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed" mt={6}>
        The first three are anchor KPIs of{" "}
        <code>tutorials/{AMMONIA.witness}</code> (the map kernel, ideal gas,
        stoichiometric N₂ + 3 H₂); the fourth is the <code>y_NH3</code> KPI of{" "}
        <code>tutorials/{SRK_CONTRAST.witness}</code>, the Gibbs reactor on the
        same feed under SRK.  Ambient: the industrial reaction is favourable
        there too, and no rate law in this tree reaches that pressure.
        Converter temperature at ambient pressure: the equilibrium the heat
        spent (the route table above prices the same loss as a sign change of
        ΔG° between 298.15 K and 700 K).  Converter pressure: what the
        compressor buys back — and the ideal-to-SRK gap is the fugacity
        correction an approach would otherwise absorb.
      </Text>
      {(contrastRun.err || srkRun.err) && (
        <Alert color="red" variant="light" mt={6} title="A contrast run did not finish">
          <Text size="sm">{contrastRun.err ?? srkRun.err}</Text>
        </Alert>
      )}
    </Box>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={4}>
            Equilibrium landscapes, and what an approach temperature can reach
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            The same Gibbs kernel over five reaction systems the corpus already
            solves: the whole conversion-versus-temperature curve at three
            pressures, and what one declared approach magnitude does to each —
            where it moves the answer, where it cannot, and the one case where
            it moves a product the wrong way.  It closes on nitrogen fixation:
            the three overall routes — a sugar as the electron donor, water as
            the donor, hydrogen as the donor — priced on one formation surface,
            and what does and does not transfer from a converter to an enzyme.
          </Text>
        </Box>

        {step(1)}
        {step(2)}

        <Box>
          <Title order={5}>Now survey it</Title>
          <Text size="sm" mt={4}>
            Pick a system.  The solid curves are the true equilibrium at 1, 10
            and 100 bar; move |ΔT| and the dashed curves are what the model
            with that approach REPORTS at each physical temperature, the sign
            decided by the engine at every cell.
          </Text>
          <SegmentedControl mt={8} fullWidth value={witnessId} onChange={onWitness}
            data={LANDSCAPE_WITNESSES.map((x) => ({ value: x.id, label: x.label }))} />
          <Text size="xs" c="dimmed" mt={6}>{w.metricLabel}</Text>

          {err && (
            <Alert color="red" variant="light" mt={8} title="The engine did not finish">
              <Text size="sm">{err}</Text>
            </Alert>
          )}

          <Box mt={10} style={{
            display: "grid", gap: 14,
            gridTemplateColumns: "minmax(200px, 250px) 1fr",
          }}>
            <Stack gap={8}>{controls}</Stack>
            <Box style={{ minWidth: 0 }}>
              {busy && (
                <Group gap="sm" wrap="nowrap" align="center" mb={6}>
                  <Loader size="xs" />
                  <Text size="xs" c="dimmed">
                    one Gibbs minimisation per cell — seconds, not instant
                  </Text>
                </Group>
              )}
              <LandscapeChart base={base} shifted={shifted} w={w} dT={dT} />
              {readout}
            </Box>
          </Box>
        </Box>

        {step(3)}
        {step(4)}
        {step(5)}
        {step(6)}
        {routeTable}
        {contrast}

        <LessonLimits limits={LANDSCAPE_LIMITS} />

        <Text size="sm">
          The level above this one — where you declare the REACTIONS a
          catalyst runs, leave the kinetically frozen ones off the list, and
          give each declared reaction its own approach — is the page{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("declared-pathways")}>
            Declared pathways
          </Anchor>.
        </Text>
      </Stack>
    </Box>
  );
}
