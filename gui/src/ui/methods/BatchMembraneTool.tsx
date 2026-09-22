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
  BatchMembraneTool -- concentrating and washing behind a UF/NF membrane
  (the registry's "batch-membrane" entry).

  THE PAGE is a scrolling lesson (batchMembraneLesson.ts is the prose, as
  data), with ONE renderer for the no-run state and the full page, so the
  explanation never disappears exactly when there is nothing to explain.

  IT FEEDS ITSELF.  Two shipped witnesses run in the browser (choupoBatch
  WASM) with the reader's knobs written into their dicts:

    batch/membrane/diafilter01_nf_desalting     the clean twin
    batch/membrane/diafilter02_fouling_decline  the SAME charge, area,
                                                pressure and horizon, with a
                                                Hermia `cake` block and
                                                nothing else changed

  TWO WITNESSES RATHER THAN ONE KNOB, and the reason is a rule rather than a
  preference: `case/methodRun.ts` deliberately carries no way to ADD or
  re-nest a dict block ("a knob that needs one is a knob the witness case
  should declare"), and fouling is a whole `fouling {}` block with a law, a
  constant and a REQUIRED written reason.  Synthesising one here would make
  this page an editor.  So the fouling switch selects the case the engine
  runs, which is also the honest thing to show: the difference between the
  two answers IS the fouling, because nothing else differs.

  THE MODE KNOB IS A WORD OVERRIDE on the witness's own `mode` key -- one of
  the two words the engine accepts, written into the slot that already holds
  the other (BatchDiafilter.cpp:202-210).  It stays INLINE beside the plot
  rather than folding into a popover, under the credo's one stated exception:
  a control that FORKS THE CURVE stays visible, because seeing the fork is
  the lesson.  Flipping it changes what the horizontal axis MEANS -- N in
  constant volume, VCF in concentration -- which is step 3's whole point.

  WHAT IS COMPUTED HERE, AND WHY THAT IS ALLOWED.  The arithmetic in
  batchMembraneMath.ts is the METHOD BEING TAUGHT -- the exponential washout,
  the power law of a concentration, the composite loss, the wash time, a
  maximum located on a curve, and the governing group ln VCF + N with the
  yield ceiling it implies -- which is the one labelled exception to "no
  physics in the browser".  The engine is the judge: its own
  `washoutIdeal_<s>` is printed beside the hand law that must reproduce it,
  its `R_obs_<s>` trajectory is printed beside the constant the law assumed,
  and a disagreement is a finding about the assumption, never a moved answer.

  NOTHING IS INVENTED.  Every vessel parameter is read from the case's own
  `operation {}` block and every result number from the run's KPIs or
  trajectory; a parameter on neither surface is NAMED as unavailable with the
  surface it would come from, and there is no default area, TMP, k_film, rho
  or rejection anywhere on this page.  The ONE class of number here that
  comes from neither the case nor the run is the worked example of Millipore
  Technical Brief TB032 (Rev. C, 06/03, 03-117) p. 6, whose INPUTS are the
  source's and whose every output is recomputed from the closed form of step
  9 -- printed under a heading that says exactly that.

  WHAT THE PAGE DOES NOT CLAIM TO HAVE DONE.  Step 8's construction reads the
  flux curve in the product's starting buffer AND in the diafiltration
  buffer, and takes the lower of the two maxima.  Choupo sweeps one solution
  and no corpus case declares a second buffer's flux behaviour, so the page
  draws the one curve it has, marks its maximum, and says in the caption that
  the answer is NOT bracketed and which way the missing curve would move it.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Box, Group, Loader, SegmentedControl, Stack, Table, Text, Title,
} from "@mantine/core";

import type { TrajectoryData } from "../../adapters/SolverAdapter.js";
import type { CaseFiles } from "../../case/types.js";
import type { DictOverride } from "../../case/methodRun.js";
import { methodCase, useMethodRun } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";
import { KnobNumber, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { Plot, PLOT_COLORS, darkLayout } from "../plotting/plotly.js";
import {
  BATCH_MEMBRANE_LIMITS, BATCH_MEMBRANE_STEPS,
} from "./batchMembraneLesson.js";
import {
  type ConservativeOptimum, type KpiMap, type OptimumScan, type Sample,
  type SoluteVerdict, type VesselDeclaration,
  LMH_PER_MS, TB032_EXAMPLE, conservativeOptimum, detectDiafilter,
  diafiltrationTime, gapDirection, lossCurve, lossFromGroup, lossGroup,
  productLoss, readSamples, readSolute, readVessel, scanWashOptimum,
  soluteVerdict, tb032Rows, trapezoid,
} from "./batchMembraneMath.js";

// ---- The two witnesses ------------------------------------------------------

export const BATCH_MEMBRANE_WITNESS_CLEAN =
  "batch/membrane/diafilter01_nf_desalting";
export const BATCH_MEMBRANE_WITNESS_FOULING =
  "batch/membrane/diafilter02_fouling_decline";

const FLOWSHEET = "system/flowsheetDict";
const CONTROL = "system/controlDict";

// ---- The engine knobs -------------------------------------------------------
// Every one writes a scalar (or, for the mode, a word) the witness already
// DECLARES, and the engine re-runs.  Nothing here adds a key.

export interface BatchMembraneKnob {
  id: string;
  label: string;
  file: string;
  key: string;
  /** The witness's own authored value -- the classroom default. */
  def: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  /** The unit the dict declares; the override writes the NUMBER only. */
  unit: string;
}

export const BATCH_MEMBRANE_KNOBS: readonly BatchMembraneKnob[] = [
  { id: "P_feed", label: "feed pressure P_feed", file: FLOWSHEET,
    key: "P_feed", def: 10, min: 2, max: 40, step: 1, unit: "bar" },
  { id: "area", label: "membrane area A", file: FLOWSHEET, key: "area",
    def: 5, min: 0.5, max: 25, step: 0.5, decimals: 1, unit: "" },
  //  Turn it DOWN and the polarisation bites: the wall leaves the bulk, the
  //  osmotic pressure at the wall rises and the observed rejection moves.
  { id: "k_film", label: "film coefficient k_film", file: FLOWSHEET,
    key: "k_film", def: 1.0e-4, min: 5.0e-6, max: 1.0e-3, step: 5.0e-6,
    decimals: 6, unit: "m/s" },
  //  controlDict declares `endTime 160;` BARE (raw SI seconds, the "s" in a
  //  comment), so this knob's dict unit is the empty word.
  { id: "endTime", label: "horizon endTime (s)", file: CONTROL,
    key: "endTime", def: 160, min: 20, max: 2000, step: 10, unit: "" },
];

export type BatchMembraneKnobValues = { [id: string]: number };

/** The classroom wash length priced in the composite-loss row: a design
 *  QUESTION to start from, never a measurement.  Post-processing only. */
export const DESIGN_WASH_DIAVOLUMES = 5;

export function defaultKnobValues(): BatchMembraneKnobValues {
  const out: BatchMembraneKnobValues = {};
  for (const k of BATCH_MEMBRANE_KNOBS) out[k.id] = k.def;
  return out;
}

export type BatchMode = "constantVolume" | "concentration";

/**
 * Knob values + the mode word -> methodRun overrides.  The mode is a WORD
 * override on the key the witness already declares; non-finite numbers are
 * dropped so a knob keeps the witness's authored value rather than being
 * written as NaN.
 */
export function knobOverrides(
  values: BatchMembraneKnobValues, mode: BatchMode,
): DictOverride[] {
  const out: DictOverride[] = [
    { file: FLOWSHEET, key: "mode", word: mode },
  ];
  for (const k of BATCH_MEMBRANE_KNOBS) {
    const v = values[k.id];
    if (v !== undefined && Number.isFinite(v))
      out.push({ file: k.file, key: k.key, value: v, unit: k.unit });
  }
  return out;
}

// ---- Display formatting -----------------------------------------------------

function fmt(v: number | null | undefined, digits = 5): string {
  return typeof v === "number" && Number.isFinite(v)
    ? v.toPrecision(digits) : "—";
}

function pct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v)
    ? `${(100 * v).toFixed(2)} %` : "—";
}

// ---- What the page draws, as ONE pure assembly ------------------------------

export interface BatchMembraneView {
  unit: string;
  solutes: string[];
  constantVolume: boolean;
  V0: number | null;
  /** The run's own final clock reading: N in constant volume, VCF otherwise. */
  N: number | null;
  vcf: number | null;
  samples: Sample[] | null;
  verdicts: SoluteVerdict[];
  vessel: VesselDeclaration;
  /** The trapezoid of Q_p over the WRITTEN samples, and the integrator's own
   *  accepted permeated volume beside it (BatchDiafilter.H:255-263). */
  VpermTrapezoid: number | null;
  VpermState: number | null;
  /** The J_w c scan and its maximum -- concentration mode only, on the
   *  retained solute (the one with the HIGHEST initial rejection: it is the
   *  one whose inventory fixes how small the vessel can be). */
  retained: string | null;
  scan: OptimumScan | null;
  /** The conservative two-buffer rule of step 8, applied to whatever curves
   *  exist.  Choupo sweeps ONE solution, so `bracketed` is false and the
   *  page says so rather than implying the construction was completed. */
  dfOptimum: ConservativeOptimum | null;
  /** The bulk-concentration series of each solute, for the main plot. */
  series: { [solute: string]: { cb: number[]; R: number[] } };
}

/**
 * Assemble everything the page shows from ONE run and ONE case.  Pure, so the
 * decisions in it are testable under node; the component only draws it.
 */
export function buildView(
  trajectory: TrajectoryData | undefined, kpis: KpiMap | undefined,
  files: CaseFiles | null,
): BatchMembraneView | null {
  const det = detectDiafilter(
    trajectory ? Object.keys(trajectory.vars) : [], kpis);
  if (!det.active || det.unit === null) return null;
  const block = kpis?.[det.unit];
  const V0 = typeof block?.["V_initial_m3"] === "number"
    ? block["V_initial_m3"] : null;
  const N = typeof block?.["diavolumes"] === "number"
    ? block["diavolumes"] : null;
  const vcf = typeof block?.["concentrationFactor"] === "number"
    ? block["concentrationFactor"] : null;

  const samples = readSamples(trajectory, det.unit, V0 ?? NaN);
  const verdicts = det.solutes.map(
    (s) => soluteVerdict(block, s, N, vcf));

  const series: BatchMembraneView["series"] = {};
  for (const s of det.solutes) {
    const ser = readSolute(trajectory, det.unit, s);
    if (ser !== null) series[s] = { cb: ser.cb, R: ser.R };
  }

  //  The RETAINED species: the highest initial rejection the run reports.
  //  Chosen from the run, never from a name -- a page that looked for "the
  //  divalent salt" would work on one witness and nowhere else.
  let retained: string | null = null;
  let bestR0 = -Infinity;
  for (const v of verdicts)
    if (v.R0 !== null && v.R0 > bestR0) { bestR0 = v.R0; retained = v.solute; }

  const cb = retained !== null ? series[retained]?.cb : undefined;
  const scan = !det.constantVolume && samples !== null && cb !== undefined
    ? scanWashOptimum(samples, cb) : null;

  //  ONE CURVE, and the decision carries that fact.  Step 8's construction
  //  wants the flux measured with the product in the starting buffer AND in
  //  the diafiltration buffer; nothing in the corpus declares the second, so
  //  exactly one candidate is offered and `bracketed` comes back false.
  const bestPoint = scan === null ? undefined : scan.points[scan.iMax];
  const dfOptimum = scan !== null && scan.interior && bestPoint !== undefined
    ? conservativeOptimum([
      { buffer: "the solution this case declares", c: bestPoint.c }])
    : null;

  return {
    unit: det.unit, solutes: det.solutes, constantVolume: det.constantVolume,
    V0, N, vcf, samples, verdicts, vessel: readVessel(files, det.unit),
    VpermTrapezoid: samples === null ? null
      : trapezoid(samples.map((s) => s.t), samples.map((s) => s.Qp)),
    VpermState: samples === null ? null
      : (samples[samples.length - 1]?.Vperm ?? null),
    retained, scan, dfOptimum, series,
  };
}

const PROVENANCE = (witness: string): string =>
  `Runs tutorials/${witness} (10 L of a two-salt brine behind 5 m² of NF270) `
  + "with your parameters, in your browser (choupoBatch WASM); the classical "
  + "arithmetic is the hand method, done here and judged against the "
  + "engine's own rejection trajectory and washout KPIs.";

// ---- The tool ---------------------------------------------------------------

export function BatchMembraneTool(): JSX.Element {
  const appResult = useStore((s) => s.runResult);
  const appFiles = useStore((s) => s.caseFiles);

  const hasAppTrajectory = appResult?.trajectory !== undefined;
  const [source, setSource] = useState<"classroom" | "current">("classroom");
  const src: "classroom" | "current" =
    hasAppTrajectory && source === "current" ? "current" : "classroom";

  const [mode, setMode] = useState<BatchMode>("constantVolume");
  const [fouled, setFouled] = useState(false);
  const [knobs, setKnobs] = useState<BatchMembraneKnobValues>(defaultKnobValues);
  //  A DESIGN BRIEF, not data about any rig: how long a wash to price in the
  //  composite loss of step 4.  It is post-processing -- it re-draws and
  //  never re-runs the engine -- and the page says so where it is used, on
  //  the LUB page's precedent.  It exists because the alternative was a
  //  literal in a result cell with no source.
  const [washN, setWashN] = useState(DESIGN_WASH_DIAVOLUMES);

  const witness = fouled
    ? BATCH_MEMBRANE_WITNESS_FOULING : BATCH_MEMBRANE_WITNESS_CLEAN;
  const overrides = knobOverrides(knobs, mode);
  const runKey = JSON.stringify([witness, mode, knobs]);
  const { result: classroom, err, busy } = useMethodRun(
    src === "classroom" ? witness : null, overrides, runKey, "choupoBatch");

  const result = src === "current" ? appResult : classroom;
  const trajectory: TrajectoryData | undefined = result?.trajectory;
  const kpis: KpiMap | undefined = result?.kpis;

  const files: CaseFiles | null = useMemo(() => {
    if (src === "current") return appFiles ?? null;
    try { return methodCase(witness, overrides); }
    catch { return null; }
    // runKey is the change signal for the overrides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, appFiles, runKey]);

  const view = useMemo(
    () => buildView(trajectory, kpis, files), [trajectory, kpis, files]);

  // ---- The setup column ----------------------------------------------------
  const controls = (
    <>
      {hasAppTrajectory && (
        <SegmentedControl size="xs" value={src} fullWidth
          onChange={(v) => setSource(v === "current" ? "current" : "classroom")}
          data={[
            { label: "Classroom", value: "classroom" },
            { label: "Current run", value: "current" },
          ]} />
      )}
      {src === "classroom" && (
        <>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            mode — the one line that differs
          </Text>
          <SegmentedControl size="xs" value={mode} fullWidth
            onChange={(v) => setMode(
              v === "concentration" ? "concentration" : "constantVolume")}
            data={[
              { label: "Wash (Q_d = Q_p)", value: "constantVolume" },
              { label: "Concentrate (Q_d = 0)", value: "concentration" },
            ]} />
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt={6}>
            membrane — the twin that differs only by fouling
          </Text>
          <SegmentedControl size="xs" value={fouled ? "fouled" : "clean"}
            fullWidth
            onChange={(v) => setFouled(v === "fouled")}
            data={[
              { label: "Clean", value: "clean" },
              { label: "Hermia cake", value: "fouled" },
            ]} />
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt={6}>
            design brief (re-draws only)
          </Text>
          <KnobNumber label="wash length N [diavolumes]"
            value={washN} min={0} max={30} step={0.5} decimals={1}
            onChange={setWashN} />
          <Text size="xs" c="dimmed">
            A design question to start from, not data about any rig: it prices
            the composite loss of step 4 and never changes the run.
          </Text>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt={6}>
            the rig (re-runs the engine)
          </Text>
          {busy && (
            <Group gap={6} wrap="nowrap" align="center">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">
                re-integrating — seconds, not instant
              </Text>
            </Group>
          )}
          {BATCH_MEMBRANE_KNOBS.map((k) => (
            <KnobNumber key={k.id}
              label={k.unit ? `${k.label} [${k.unit}]` : k.label}
              value={knobs[k.id] ?? k.def} min={k.min} max={k.max}
              step={k.step} decimals={k.decimals}
              onChange={(v) => setKnobs((st) => ({ ...st, [k.id]: v }))} />
          ))}
          <PanelNote>{PROVENANCE(witness)}</PanelNote>
        </>
      )}
    </>
  );

  const lessonStep = lessonStepper(BATCH_MEMBRANE_STEPS);

  const lessonHead = (
    <Box>
      <Title order={3}>Batch membrane filtration — concentrating and washing</Title>
      <Text size="sm" c="dimmed" mt={4}>
        The two pure batch operations a UF or NF rig runs, the closed forms a
        student integrates by hand for each of them, and the engine&apos;s own
        rejection trajectory showing what those closed forms assumed.
      </Text>
    </Box>
  );

  const refusal = src === "classroom" && err !== null ? (
    <Alert color="red" variant="light"
      title="The engine refused or failed — its message, verbatim">
      <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
        {err}
      </Text>
    </Alert>
  ) : null;

  const limits = (
    <LessonLimits limits={BATCH_MEMBRANE_LIMITS}
      title="What this does not model" />
  );

  // ---- Nothing drawable: the lesson still runs -----------------------------
  if (view === null) {
    return (
      <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
        <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
          {lessonHead}
          {refusal}
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lessonStep)}
          <Stack gap={8} style={{ maxWidth: 280 }}>{controls}</Stack>
          <Box style={{ display: "flex", alignItems: "center",
            justifyContent: "center", padding: 12 }}>
            {src === "classroom" && err === null ? (
              busy || classroom === null ? (
                <Group gap="sm" wrap="nowrap" align="center">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    the engine is integrating the vessel — seconds, not instant
                  </Text>
                </Group>
              ) : (
                <Text size="sm" c="dimmed" ta="center" maw={520}>
                  The classroom run finished but did not publish the batch
                  membrane surfaces (a V_permeated_m3 / diavolumes KPI block
                  and a V_m3 trajectory column) — nothing honest to construct
                  from.
                </Text>
              )
            ) : (
              <Text size="sm" c="dimmed" ta="center" maw={520}>
                This construction needs a choupoBatch run containing a
                batchDiafilter vessel: its KPI block publishes V_permeated_m3
                and diavolumes, and its trajectory carries V_m3, J_w_LMH and
                one c_b_/c_p_/R_obs_ triple per solute. The open case has
                none.
              </Text>
            )}
          </Box>
          {limits}
        </Stack>
      </Box>
    );
  }

  const { samples, vessel } = view;
  const clockLabel = view.constantVolume
    ? "N  [diavolumes]" : "VCF = V_0/V  [-]";
  const clockOf = (s: Sample): number => view.constantVolume ? s.N : s.vcf;

  // ---- The main figure: each solute's retained fraction on its own clock ---
  const traces: object[] = [];
  if (samples !== null) {
    const x = samples.map(clockOf);
    view.solutes.forEach((s, i) => {
      const ser = view.series[s];
      const c0 = ser?.cb[0];
      if (!ser || c0 === undefined || !(c0 > 0)) return;
      //  n/n_0 from the run: c_b V / (c_b0 V_0).  In constant volume the
      //  volume ratio is one and this is the concentration ratio; in
      //  concentration mode it is not, which is why the volume is carried.
      const y = ser.cb.map((c, k) => {
        const smp = samples[k];
        return smp === undefined || view.V0 === null || !(view.V0 > 0)
          ? NaN : (c * smp.V) / (c0 * view.V0);
      });
      traces.push({
        type: "scatter", mode: "lines", name: `${s} — run`,
        x, y,
        line: { color: PLOT_COLORS.series[i % PLOT_COLORS.series.length],
          width: 2 },
      });
      //  The hand law on the SAME clock, from the run's own R_0.
      const R0 = view.verdicts.find((v) => v.solute === s)?.R0;
      if (typeof R0 === "number" && Number.isFinite(R0)) {
        const ideal = x.map((cl) => view.constantVolume
          ? Math.exp(-(1 - R0) * cl)
          : Math.pow(cl, -(1 - R0)));
        traces.push({
          type: "scatter", mode: "lines", name: `${s} — constant-R law`,
          x, y: ideal,
          line: { color: PLOT_COLORS.series[i % PLOT_COLORS.series.length],
            width: 1, dash: "dash" },
        });
      }
    });
  }

  //  ---- Step 8's construction, on the axis an engineer reads --------------
  //  The abscissa is the PRODUCT CONCENTRATION, log-scaled, which is the
  //  axis the bench method plots on (and which makes the flux decay close to
  //  straight).  It used to be the VCF, which is the engine's clock and not
  //  a quantity anybody measures in a sample; the VCF is still on the point,
  //  in the hover, because it is what the run is steered by.
  //
  //  TWO CURVES ON TWO AXES, deliberately: the flux against concentration is
  //  the measurement (the source's figure 12) and C J_f against the same
  //  concentration is what is maximised (its figure 13).  Drawing them apart
  //  would hide that the second is built from the first.
  const optimumTraces: object[] = [];
  if (view.scan !== null) {
    const pts = view.scan.points;
    const cs = pts.map((p) => p.c);
    const vcfs = pts.map((p) => p.vcf);
    optimumTraces.push({
      type: "scatter", mode: "lines",
      name: `C · J_f  (${view.retained ?? ""})`,
      x: cs, y: pts.map((p) => p.Jc),
      customdata: vcfs,
      hovertemplate:
        "C = %{x:.4g} kmol/m³<br>C·J_f = %{y:.4g} mol/(m²·h)"
        + "<br>VCF = %{customdata:.4g}<extra></extra>",
      line: { color: PLOT_COLORS.accent, width: 2 },
    });
    optimumTraces.push({
      type: "scatter", mode: "lines", yaxis: "y2",
      name: "filtrate flux J_f (right axis)",
      x: cs, y: pts.map((p) => p.J_LMH),
      customdata: vcfs,
      hovertemplate:
        "C = %{x:.4g} kmol/m³<br>J_f = %{y:.4g} L/(m²·h)"
        + "<br>VCF = %{customdata:.4g}<extra></extra>",
      line: { color: PLOT_COLORS.warm2, width: 1.5, dash: "dot" },
    });
    const best = pts[view.scan.iMax];
    if (best !== undefined)
      optimumTraces.push({
        type: "scatter", mode: "markers",
        name: view.scan.interior
          ? "maximum (interior)" : "largest point (at an end)",
        x: [best.c], y: [best.Jc],
        customdata: [best.vcf],
        hovertemplate:
          "C = %{x:.4g} kmol/m³<br>C·J_f = %{y:.4g} mol/(m²·h)"
          + "<br>VCF = %{customdata:.4g}<extra></extra>",
        marker: { color: PLOT_COLORS.warm, size: 11, symbol: "diamond" },
      });
  }

  //  ---- Step 9's figure: the loss against the governing group -------------
  //  The family is drawn at the retentions TB032's own figure uses, and
  //  every value is recomputed here from the closed form -- nothing is read
  //  off the source's picture.  Beside it, the run's own retention and the
  //  run's own group, which come from the engine.
  const GROUPS: number[] = [];
  for (let g = 0; g <= 16.0001; g += 0.25) GROUPS.push(g);
  const retainedVerdict = view.retained === null ? undefined
    : view.verdicts.find((v) => v.solute === view.retained);
  const runR0 = retainedVerdict?.R0 ?? null;
  const runGroup = view.vcf !== null && view.vcf > 0 && view.N !== null
    ? lossGroup(view.vcf, view.N) : null;
  const lossTraces: object[] = TB032_EXAMPLE.family.map((R, i) => ({
    type: "scatter", mode: "lines", name: `R = ${R}`,
    x: GROUPS, y: lossCurve(R, GROUPS).map((f) => 100 * f),
    line: { color: PLOT_COLORS.series[i % PLOT_COLORS.series.length],
      width: 1.5, dash: "dot" },
  }));
  if (runR0 !== null && Number.isFinite(runR0))
    lossTraces.push({
      type: "scatter", mode: "lines",
      name: `R = ${runR0.toPrecision(4)} — this run's ${view.retained ?? ""}`,
      x: GROUPS, y: lossCurve(runR0, GROUPS).map((f) => 100 * f),
      line: { color: PLOT_COLORS.accent, width: 2.5 },
    });
  if (runR0 !== null && Number.isFinite(runR0)
    && runGroup !== null && Number.isFinite(runGroup))
    lossTraces.push({
      type: "scatter", mode: "markers", name: "where this run sits",
      x: [runGroup], y: [100 * lossFromGroup(runR0, runGroup)],
      marker: { color: PLOT_COLORS.warm, size: 11, symbol: "diamond" },
    });

  // ---- Tables ---------------------------------------------------------------
  const head = (
    <Table.Thead>
      <Table.Tr>
        <Table.Th>quantity</Table.Th>
        {view.solutes.map((s) => <Table.Th key={s}>{s}</Table.Th>)}
      </Table.Tr>
    </Table.Thead>
  );
  const row = (label: string, cell: (v: SoluteVerdict) => string) => (
    <Table.Tr key={label}>
      <Table.Td>{label}</Table.Td>
      {view.verdicts.map((v) => <Table.Td key={v.solute}>{cell(v)}</Table.Td>)}
    </Table.Tr>
  );

  const best = view.scan?.points[view.scan.iMax];
  //  The wash time at the run's own end state and at the optimum, both on
  //  the DECLARED area -- so a case that declares none prints a dash.
  const washTime = (V: number | null, J_LMH: number | null): number | null =>
    V !== null && J_LMH !== null && vessel.area !== null
      && Number.isFinite(V) && Number.isFinite(J_LMH) && J_LMH > 0
      ? diafiltrationTime(1, V, vessel.area, J_LMH / LMH_PER_MS) : null;
  const lastSample = samples?.[samples.length - 1] ?? null;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>

        {lessonHead}
        {lessonStep(1)}
        {lessonStep(2)}
        {lessonStep(3)}
        {lessonStep(4)}

        <Box>
          <Title order={5}>Now put the two side by side</Title>
          <Text size="sm" mt={4}>
            The solid curves are the run: each solute&apos;s retained fraction
            n/n_0 against the clock of the mode you selected. The dashed
            curves are the constant-R law of step 4, evaluated at THIS
            run&apos;s own initial rejection — nothing about them was
            declared. Flip the mode and the horizontal axis changes meaning,
            which is the point of step 3; turn the film coefficient down and
            watch the two part sooner.
          </Text>
        </Box>

        {refusal}

        <Box style={{ display: "grid", gap: 14,
          gridTemplateColumns: "minmax(200px, 250px) 1fr" }}>
          <Stack gap={8}>{controls}</Stack>
          <Box style={{ minWidth: 0, height: 400 }}>
            <Plot
              data={traces}
              layout={{
                ...darkLayout,
                title: { text: `Retained fraction — ${view.unit}`,
                  font: { ...darkLayout.font, size: 14 } },
                xaxis: { ...darkLayout.xaxis, title: { text: clockLabel },
                  type: view.constantVolume ? "linear" : "log" },
                yaxis: { ...darkLayout.yaxis,
                  title: { text: "n / n_0  [-]" }, type: "log" },
                legend: { ...darkLayout.legend, x: 0.02, y: 0.02,
                  xanchor: "left" },
              }}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
            />
          </Box>
        </Box>

        {lessonStep(5)}

        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders style={{ fontSize: 12 }}
            verticalSpacing={2}>
            {head}
            <Table.Tbody>
              {row("R_obs at t = 0, engine (R_initial)", (v) => fmt(v.R0, 6))}
              {row("R_obs at the end, engine (R_final)", (v) => fmt(v.R1, 6))}
              {row("n/n_0 the vessel reached, engine (recovery)",
                (v) => pct(v.recovery))}
              {row("engine's washoutIdeal (constant volume only)",
                (v) => pct(v.washoutIdeal))}
              {row("the same law, recomputed on this page",
                (v) => pct(v.handIdeal))}
              {row("constant-R power law on VCF (this page's, concentration)",
                (v) => pct(v.handRetainedConc))}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt={4}>
            {view.constantVolume
              ? "The engine published the ideal and this page recomputed it "
                + "from the same R_0 and N: the two rows must agree, and where "
                + "they do the page and the engine are quoting one law rather "
                + "than two."
              : "In concentration mode the engine publishes NO idealisation "
                + "(BatchDiafilter.cpp:597-601) — the washout law is not the "
                + "law of this mode. The power-law row is therefore this "
                + "page's own, from the engine's R_0 and VCF, and is labelled "
                + "so."}
          </Text>
          {view.verdicts.map((v) => {
            const dir = gapDirection(v);
            return dir === null ? null : (
              <Text key={v.solute} size="xs" c="dimmed" mt={2}>
                <Text span fw={600}>{v.solute}:</Text> {dir}.
              </Text>
            );
          })}
        </Box>

        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders style={{ fontSize: 12 }}
            verticalSpacing={2}>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>V_0 / V at the end [m³]</Table.Td>
                <Table.Td>
                  {fmt(view.V0)} / {fmt(lastSample?.V ?? null)}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>the run&apos;s clock: N, VCF</Table.Td>
                <Table.Td>{fmt(view.N)}, {fmt(view.vcf)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  permeated volume [m³]: integrator state, then the trapezoid
                  over the written samples
                </Table.Td>
                <Table.Td>
                  {fmt(view.VpermState, 8)} vs {fmt(view.VpermTrapezoid, 8)}
                  {view.VpermState !== null && view.VpermTrapezoid !== null
                    && view.VpermState > 0
                    ? `  (${((view.VpermTrapezoid / view.VpermState - 1) * 100)
                      .toFixed(4)} %)` : ""}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>water flux, first and last sample [L/(m²·h)]</Table.Td>
                <Table.Td>
                  {fmt(samples?.[0]?.J_LMH ?? null)} →{" "}
                  {fmt(lastSample?.J_LMH ?? null)}
                </Table.Td>
              </Table.Tr>
              {lastSample?.permeanceRatio !== null
                && lastSample?.permeanceRatio !== undefined && (
                <Table.Tr>
                  <Table.Td>A_eff / A_w at the end (fouling declared)</Table.Td>
                  <Table.Td>{pct(lastSample.permeanceRatio)}</Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt={4}>
            The permeated volume is an integrated STATE, and the trapezoid
            beside it is the same quantity re-quadratured over the written
            samples alone. The gap is the write mesh —
            BatchDiafilter.H:255-263 records why the state is the authority.
          </Text>
          <VesselNote vessel={vessel} />
        </Box>

        {lessonStep(6)}

        <Box>
          <Text size="sm">
            {vessel.fouling === null
              ? "This run declares NO fouling block, so the permeance is the "
                + "membrane record's clean value throughout and the flux "
                + "moves only through the physics — osmotic pressure and "
                + "polarisation. Switch the membrane toggle to run the twin "
                + "that declares one."
              : `This run declares Hermia's \`${vessel.fouling.law}\` law with `
                + `k = ${fmt(vessel.fouling.k)}. The case's own required `
                + `reason, verbatim: "${vessel.fouling.reason
                  ?? "(none declared — the engine refuses such a block)"}"`}
          </Text>
        </Box>

        {lessonStep(7)}
        {lessonStep(8)}

        <Box style={{ overflowX: "auto" }}>
          {view.scan === null ? (
            <Text size="sm" c="dimmed">
              The flux–concentration trade needs a run that SWEEPS the
              concentration, and a constant-volume wash does not: it holds the
              volume, so the retained species barely moves. Set the mode knob
              to <Text span ff="monospace">Concentrate</Text> and the engine
              walks up the concentration axis itself; the product J_w·c is
              then read off that trajectory and its maximum marked.
            </Text>
          ) : (
            <>
              <Box style={{ minWidth: 0, height: 340 }}>
                <Plot
                  data={optimumTraces}
                  layout={{
                    ...darkLayout,
                    margin: { ...darkLayout.margin, r: 56 },
                    title: { text: "The construction: C · J_f against product "
                      + "concentration, with the flux it is built from",
                      font: { ...darkLayout.font, size: 13 } },
                    xaxis: { ...darkLayout.xaxis,
                      title: { text:
                        `product concentration C (${view.retained ?? "—"})`
                        + "  [kmol/m³]" },
                      type: "log" },
                    yaxis: { ...darkLayout.yaxis,
                      title: { text: "C · J_f  [mol/(m²·h)]" } },
                    yaxis2: { ...darkLayout.yaxis,
                      title: { text: "J_f  [L/(m²·h)]" },
                      overlaying: "y", side: "right", showgrid: false,
                      automargin: true },
                    legend: { ...darkLayout.legend, x: 0.02, y: 0.02,
                      xanchor: "left" },
                  }}
                  useResizeHandler
                  style={{ width: "100%", height: "100%" }}
                />
              </Box>
              <Text size="xs" c="dimmed" mt={4}>
                The abscissa is the product concentration the run publishes,
                which is step 8&apos;s axis; the VCF that produced each point
                is on the hover, because that is what the rig is steered by.
                Retained species chosen from the run, as the solute with the
                highest initial rejection: {view.retained ?? "—"}.{" "}
                {view.scan.interior
                  ? `The maximum is INSIDE the window this run swept: `
                    + `C = ${fmt(best?.c, 4)} kmol/m³ `
                    + `(VCF = ${fmt(best?.vcf, 4)}), `
                    + `J_f = ${fmt(best?.J_LMH, 4)} L/(m²·h). `
                    + "Pre-concentrate to there, then wash."
                  : "The largest point in this run sits at an END of the "
                    + "window, so the run did NOT bracket an optimum — an "
                    + "endpoint is not a maximum. Lengthen the horizon (or "
                    + "shorten it) until the product turns over."}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                <Text span fw={600}>ONE BUFFER, NOT TWO.</Text>{" "}
                {view.dfOptimum === null || view.dfOptimum.bracketed
                  ? "Step 8's construction reads two flux curves and takes "
                    + "the lower of their two maxima."
                  : `Step 8's construction reads TWO flux curves — the `
                    + `product in its starting buffer and in the wash buffer `
                    + `— and takes the lower of their two maxima. This page `
                    + `has ${view.dfOptimum.candidates.length}: `
                    + `${view.dfOptimum.candidates[0]?.buffer ?? "—"}. The `
                    + `mark above is that one curve's answer, NOT the `
                    + `two-buffer construction: it is not bracketed, the `
                    + `second curve would give a second maximum with the `
                    + `true optimum between them, and the conservative rule `
                    + `would then send you to the lower of the two. No case `
                    + `in the corpus declares a second buffer's flux `
                    + `behaviour, so the curve is not drawn rather than `
                    + `guessed.`}{" "}
                The bench method plots g/L against L/(m²·h); Choupo&apos;s
                batch run publishes molar concentration (kmol/m³) and no
                molar mass, so the axis is the run&apos;s own unit and nothing
                is converted.
              </Text>
              <Table withTableBorder withColumnBorders mt={8}
                style={{ fontSize: 12 }} verticalSpacing={2}>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>one diavolume at the run&apos;s END state [s]</Table.Td>
                    <Table.Td>
                      {fmt(washTime(lastSample?.V ?? null,
                        lastSample?.J_LMH ?? null))}
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>one diavolume at the marked maximum [s]</Table.Td>
                    <Table.Td>
                      {fmt(washTime(
                        view.V0 !== null && best !== undefined && best.vcf > 0
                          ? view.V0 / best.vcf : null,
                        best?.J_LMH ?? null))}
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>
                      product lost by concentrating to the marked VCF and then
                      washing {washN} diavolumes, at constant R
                    </Table.Td>
                    <Table.Td>
                      {view.retained !== null && best !== undefined
                        ? pct(productLoss(
                          view.verdicts.find(
                            (v) => v.solute === view.retained)?.R0 ?? NaN,
                          best.vcf, washN))
                        : "—"}
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt={4}>
                A dash means an input the case does not publish; the vessel
                note above names it and where it would come from. The loss row
                is the composite closed form of step 4 and carries its
                constant-R assumption with it — the run beside it is what
                actually happens.
              </Text>
            </>
          )}
        </Box>

        {lessonStep(9)}

        <Box style={{ overflowX: "auto" }}>
          <Box style={{ minWidth: 0, height: 320 }}>
            <Plot
              data={lossTraces}
              layout={{
                ...darkLayout,
                title: { text: "Product lost against the governing group "
                  + "G = ln VCF + N",
                  font: { ...darkLayout.font, size: 13 } },
                xaxis: { ...darkLayout.xaxis,
                  title: { text: "G = ln VCF + N  [-]" }, range: [0, 16] },
                yaxis: { ...darkLayout.yaxis,
                  title: { text: "product lost to the filtrate  [%]" },
                  range: [0, 50] },
                legend: { ...darkLayout.legend, x: 0.62, y: 0.05,
                  xanchor: "left" },
              }}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
            />
          </Box>
          <Text size="xs" c="dimmed" mt={4}>
            The dotted family is drawn at the four retentions TB032&apos;s own
            figure uses, every value recomputed here from
            loss = 1 − exp((R − 1)G) — nothing is read off the source&apos;s
            picture. The solid curve is THIS run&apos;s own initial rejection
            for {view.retained ?? "—"}, and the diamond is where this run
            sits: G = ln({fmt(view.vcf, 4)}) + {fmt(view.N, 4)} ={" "}
            {fmt(runGroup, 4)}. Read the spacing of the curves rather than
            any one of them: between R = 0.99 and R = 0.999 the loss falls
            roughly tenfold at every group, which is why the membrane is the
            first decision.
          </Text>
          <Text size="sm" fw={600} mt={10}>
            The source&apos;s worked example, recomputed here
          </Text>
          <Table withTableBorder withColumnBorders mt={6}
            style={{ fontSize: 12 }} verticalSpacing={2}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>the process</Table.Th>
                <Table.Th>R</Table.Th>
                <Table.Th>G = ln VCF + N</Table.Th>
                <Table.Th>product lost</Table.Th>
                <Table.Th>old buffer left, exp(−N)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tb032Rows().map((r) => (
                <Table.Tr key={r.what}>
                  <Table.Td>{r.what}</Table.Td>
                  <Table.Td>{r.R}</Table.Td>
                  <Table.Td>{r.G.toFixed(4)}</Table.Td>
                  <Table.Td>{(100 * r.loss).toFixed(2)} %</Table.Td>
                  <Table.Td>{(100 * Math.exp(-r.N)).toFixed(3)} %</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt={4}>
            Inputs are the source&apos;s (VCF = {TB032_EXAMPLE.vcf},
            N = {TB032_EXAMPLE.N}, the shortened wash N ={" "}
            {TB032_EXAMPLE.Ncut}, a goal of losing less than{" "}
            {(100 * TB032_EXAMPLE.goal).toFixed(0)} %, retentions{" "}
            {TB032_EXAMPLE.R} and {TB032_EXAMPLE.Rbetter}); every other number
            in the table is computed on this page from the closed form of step
            9. The source rounds ln 20 to 3 and this page does not, so its
            printed figures and these differ in the third decimal. The last
            column is step 4&apos;s washout law at R = 0, which is what makes
            the second row&apos;s cost visible: it is the buffer exchange the
            wash existed to achieve. Millipore Technical Brief TB032
            (Rev. C, 06/03, 03-117), &ldquo;Protein Concentration and
            Diafiltration by Tangential Flow Filtration&rdquo;, p. 6.
          </Text>
        </Box>

        {limits}
      </Stack>
    </Box>
  );
}

/** Where each vessel number came from, and which are unavailable. */
function VesselNote({ vessel }: { vessel: VesselDeclaration }): JSX.Element {
  return (
    <Text size="xs" c="dimmed" mt={4}>
      Vessel, read from the case: mode = {vessel.mode ?? "—"}, membrane ={" "}
      {vessel.membrane ?? "—"}, transport = {vessel.transport ?? "—"},
      A = {fmt(vessel.area, 4)} m², TMP = {fmt(
        vessel.tmp === null ? null : vessel.tmp / 1e5, 4)} bar,
      k_film = {fmt(vessel.kFilm, 4)} m/s, ρ = {fmt(vessel.rho, 5)} kg/m³
      {" "}(system/flowsheetDict, operation {"{}"} of the unit).
      {vessel.missing.length > 0 && (
        <>
          {" "}UNAVAILABLE, never defaulted: {vessel.missing.join("; ")}.
        </>
      )}
    </Text>
  );
}
