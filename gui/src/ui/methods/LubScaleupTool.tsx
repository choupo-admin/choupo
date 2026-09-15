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
  LubScaleupTool -- sizing a bed from a breakthrough curve (the registry's
  "lub-scaleup" entry).

  THE DESIGN METHOD, not the S-curve.  BreakthroughTool teaches what the
  curve IS; this page starts from a curve and answers the plant question --
  how long a bed, at what diameter, for a required service time -- by the
  length-of-unused-bed method.  It FEEDS ITSELF exactly as that tool does:
  the same witness (batch13, 15 % CO2 in He on zeolite 13X), the same
  engine knobs written into the same dict scalars, the same in-browser
  choupoBatch, the same source toggle to the app's current run; and it
  reaches the run through the SAME three functions, imported from
  BreakthroughTool (detectBreakthrough, extractFrontMarkers,
  decideNormalisation) -- one home, never a copy.

  WHAT IS COMPUTED HERE, AND WHY THAT IS ALLOWED.  The arithmetic in
  lubScaleupMath.ts is the METHOD BEING TAUGHT -- a trapezoid area over the
  data, a crossing read by interpolation, LUB = L(1 - t_b/t_st), the
  scale-up -- which is the one labelled exception to "no physics in the
  browser".  The engine is the judge: its own t_stoichiometric_<i> and
  retention_factor_<i> KPIs are printed beside the hand method's numbers,
  and a disagreement is a finding about the curve, never a moved answer.

  THE LAB COLUMN'S PARAMETERS come from surfaces the case or the run
  publishes, and from nowhere else: L, u, eps from the case's flowsheetDict
  operation {} block (the same scalars the engine reads at
  FixedBedAdsorber.cpp:146-149), rho_b from the adsorbent record the case
  vendors (`rho_bulk`, Adsorbent.cpp:42), c_in from the run's own anchor
  (the late plateau over the c_out_over_cin_final_<i> KPI, decided by
  decideNormalisation).  A parameter that is on none of them is NAMED as
  unavailable with the surface it would come from; nothing is defaulted.

  A MEASUREMENT enters through the open case: `constant/experimental/
  breakthrough.csv` (t_s,c_over_c0), drawn as markers beside the engine's
  curve and put through the SAME arithmetic, labelled measured.  No case
  ships one today; the page says so rather than inventing one.

  THE PAGE is a scrolling lesson (lubScaleupLesson.ts is the prose, as
  data), ONE renderer for the no-curve state and the full page, so the
  explanation never disappears exactly when there is nothing to explain.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Box, Group, Loader, SegmentedControl, Stack, Table, Text, Title,
} from "@mantine/core";

import type { TrajectoryData } from "../../adapters/SolverAdapter.js";
import type { CaseFiles } from "../../case/types.js";
import { methodCase, useMethodRun } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";
import { KnobNumber, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { Plot, PLOT_COLORS, darkLayout } from "../plotting/plotly.js";
import {
  BREAKTHROUGH_KNOBS, BREAKTHROUGH_WITNESS, type BreakthroughKnobValues,
  type KpiMap, decideNormalisation, defaultKnobValues, detectBreakthrough,
  extractFrontMarkers, knobOverrides,
} from "./BreakthroughTool.js";
import { LUB_SCALEUP_LIMITS, LUB_SCALEUP_STEPS } from "./lubScaleupLesson.js";
import {
  type Curve, type LabColumn, type LubResult, type ScaleUpResult,
  type StoichiometricResult, MEASURED_CURVE_HEADER, MEASURED_CURVE_PATH,
  crossingTime, curveSegment, loadingFromCurve, loadingFromRetention,
  lubFromTimes, readBreakthroughCsv, readLabColumn, scaleUp,
  stoichiometricTime,
} from "./lubScaleupMath.js";

// ---- The post-processing knobs ---------------------------------------------
// These three never touch the engine: the criterion is a specification, the
// service time and the design flow are the plant's requirements.  Their
// starting values are a CLASSROOM BRIEF -- a design question to begin from --
// and the page says so; they are not data about any column.

export interface DesignKnobs {
  /** c_out/c_in at which the bed is switched. */
  criterion: number;
  /** Required service time [s]. */
  tReq: number;
  /** Design feed volumetric flow [m3/s]. */
  Q: number;
}

export const DESIGN_KNOB_DEFAULTS: DesignKnobs = {
  criterion: 0.05, tReq: 10000, Q: 0.01,
};

// ---- One curve's full analysis ---------------------------------------------

export interface CurveAnalysis {
  label: "engine" | "measured";
  curve: Curve;
  tB: number | null;
  stoich: StoichiometricResult;
  lub: LubResult | null;
  scale: ScaleUpResult | null;
  /** q* implied by the curve's own balance; null when L, u, eps, rho_b or
   *  c_in is unavailable. */
  qCurve: number | null;
}

/**
 * Run the hand method on one curve.  Everything that needs a lab parameter
 * the case did not publish comes back null; the reasons live on `lab`.
 */
export function analyseCurve(
  label: "engine" | "measured", curve: Curve, knobs: DesignKnobs,
  lab: LabColumn, cIn: number | null,
): CurveAnalysis {
  const tB = crossingTime(curve, knobs.criterion);
  const stoich = stoichiometricTime(curve);
  const lub = tB !== null && lab.L !== null && stoich.tSt > 0
    ? lubFromTimes(tB, stoich.tSt, lab.L) : null;
  const scale = lub !== null && lab.L !== null && lab.u !== null
    ? scaleUp({ lLab: lab.L, tSt: stoich.tSt, lub: lub.lub, u: lab.u,
      tReq: knobs.tReq, Q: knobs.Q, rhoB: lab.rhoB })
    : null;
  const qCurve = cIn !== null && lab.L !== null && lab.u !== null
    && lab.eps !== null && lab.rhoB !== null && stoich.tSt > 0
    ? loadingFromCurve(cIn, lab.u, stoich.tSt, lab.eps, lab.L, lab.rhoB)
    : null;
  return { label, curve, tB, stoich, lub, scale, qCurve };
}

// ---- Display formatting -----------------------------------------------------

function fmt(v: number | null | undefined, digits = 5): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toPrecision(digits) : "—";
}

const PROVENANCE =
  `Runs tutorials/${BREAKTHROUGH_WITNESS} (15% CO2 in He on a zeolite-13X `
  + "fixed bed) with your parameters, in your browser (choupoBatch WASM); "
  + "the sizing arithmetic is the hand method, done here and judged against "
  + "the engine's own t_st and R_f.";

// ---- The tool ---------------------------------------------------------------

export function LubScaleupTool(): JSX.Element {
  const appResult = useStore((s) => s.runResult);
  const appFiles = useStore((s) => s.caseFiles);

  // ---- Source: the classroom witness run vs the app's current run ----------
  const hasAppTrajectory = appResult?.trajectory !== undefined;
  const [source, setSource] = useState<"classroom" | "current">("classroom");
  const src: "classroom" | "current" =
    hasAppTrajectory && source === "current" ? "current" : "classroom";

  // ---- Engine knobs (re-run) and design knobs (re-draw) --------------------
  const [knobs, setKnobs] = useState<BreakthroughKnobValues>(defaultKnobValues);
  const [design, setDesign] = useState<DesignKnobs>(DESIGN_KNOB_DEFAULTS);
  const knobsKey = JSON.stringify(knobs);
  const { result: classroom, err, busy } = useMethodRun(
    src === "classroom" ? BREAKTHROUGH_WITNESS : null,
    knobOverrides(knobs), knobsKey, "choupoBatch");

  const result = src === "current" ? appResult : classroom;
  const trajectory: TrajectoryData | undefined = result?.trajectory;
  const kpis: KpiMap | undefined = result?.kpis;

  // The case the run came from: the witness clone with the knobs written in
  // (the same clone the engine ran), or the app's open case.
  const files: CaseFiles | null = useMemo(() => {
    if (src === "current") return appFiles ?? null;
    try { return methodCase(BREAKTHROUGH_WITNESS, knobOverrides(knobs)); }
    catch { return null; }
    // knobsKey is the change signal for `knobs`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, appFiles, knobsKey]);

  const detection = useMemo(
    () => detectBreakthrough(trajectory ? Object.keys(trajectory.vars) : [], kpis),
    [trajectory, kpis]);

  // ---- Everything the page draws, computed once per run + design knobs -----
  const view = useMemo(() => {
    if (!trajectory || !detection.active || detection.unit === null) return null;
    const unitKpis = kpis?.[detection.unit];
    // One front: the first component (the witness has one).  A second
    // adsorbate would need a sizing decision this page does not make (limits).
    const comp = detection.components[0];
    const col = detection.outletColumns[0];
    if (comp === undefined || col === undefined) return null;
    const ys = trajectory.vars[col];
    if (ys === undefined || ys.length === 0) return null;

    // c_in from the run's own anchor -- the ONE normalisation decision.
    const last = ys[ys.length - 1];
    const norm = detection.concentrationBasis
      ? decideNormalisation(unitKpis, [comp], { [comp]: last ?? NaN })
      : { cIn: null, caption: "y_out mole-fraction basis: c_in cannot be "
          + "anchored (the anchor KPI is a concentration ratio), so the "
          + "curve cannot be normalised and the method cannot be run." };
    const cIn = norm.cIn?.[comp] ?? null;
    if (cIn === null) return { unit: detection.unit, comp, norm, cIn, blocked: true as const };

    const engineCurve: Curve = { t: trajectory.t, f: ys.map((v) => v / cIn) };
    const lab = readLabColumn(files, detection.unit);
    const markers = extractFrontMarkers(unitKpis, comp);
    const rF = unitKpis?.[`retention_factor_${comp}`];
    const qIso = typeof rF === "number" && Number.isFinite(rF)
      && lab.eps !== null && lab.rhoB !== null
      ? loadingFromRetention(rF, lab.eps, cIn, lab.rhoB) : null;
    const qBar = unitKpis?.[`qbar_${comp}_final`];

    const engine = analyseCurve("engine", engineCurve, design, lab, cIn);

    // The measured curve, when the case ships one.
    const csv = files?.extraFiles?.[MEASURED_CURVE_PATH];
    let measured: CurveAnalysis | null = null;
    let measuredErr: string | null = null;
    if (csv !== undefined) {
      try { measured = analyseCurve("measured", readBreakthroughCsv(csv), design, lab, cIn); }
      catch (e) { measuredErr = e instanceof Error ? e.message : String(e); }
    }

    return {
      blocked: false as const, unit: detection.unit, comp, norm, cIn, lab,
      markers, rF: typeof rF === "number" ? rF : null, qIso,
      qBar: typeof qBar === "number" ? qBar : null,
      engine, measured, measuredErr,
    };
  }, [trajectory, kpis, detection, files, design]);

  // ---- The setup panel: source, engine knobs, design knobs, provenance ----
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
      <Text size="xs" fw={600} c="dimmed" tt="uppercase">design brief (re-draw only)</Text>
      <KnobNumber label="breakthrough criterion c_out/c_in"
        value={design.criterion} min={0.02} max={0.20} step={0.01} decimals={2}
        onChange={(v) => setDesign((d) => ({ ...d, criterion: v }))} />
      <KnobNumber label="required service time t_req [s]"
        value={design.tReq} min={100} max={200000} step={500}
        onChange={(v) => setDesign((d) => ({ ...d, tReq: v }))} />
      <KnobNumber label="design feed flow Q [m³/s]"
        value={design.Q} min={0.0001} max={10} step={0.005} decimals={4}
        onChange={(v) => setDesign((d) => ({ ...d, Q: v }))} />
      <Text size="xs" c="dimmed">
        The three above are a classroom brief to start from, not data about
        any column; they change the sizing and never the curve.
      </Text>
      {src === "classroom" && (
        <>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt={6}>
            laboratory column (re-runs the engine)
          </Text>
          {busy && (
            <Group gap={6} wrap="nowrap" align="center">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">re-integrating — seconds, not instant</Text>
            </Group>
          )}
          {BREAKTHROUGH_KNOBS.map((k) => (
            <KnobNumber key={k.id}
              label={k.unit ? `${k.label} [${k.unit}]` : k.label}
              value={knobs[k.id] ?? k.def} min={k.min} max={k.max} step={k.step}
              onChange={(v) => setKnobs((st) => ({ ...st, [k.id]: v }))} />
          ))}
          <PanelNote>{PROVENANCE}</PanelNote>
        </>
      )}
    </>
  );

  const lessonStep = lessonStepper(LUB_SCALEUP_STEPS);

  const lessonHead = (
    <Box>
      <Title order={3}>Sizing a bed from a breakthrough curve</Title>
      <Text size="sm" c="dimmed" mt={4}>
        The length-of-unused-bed method: a laboratory curve, two times read
        off it, one length carried to the plant — and the engine&apos;s own
        numbers beside every step of the hand arithmetic.
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

  const limits = <LessonLimits limits={LUB_SCALEUP_LIMITS} title="What this does not model" />;

  // ---- No drawable view: the lesson still runs, then the honest state ------
  if (view === null || view.blocked) {
    return (
      <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
        <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
          {lessonHead}
          {refusal}
          {[1, 2, 3, 4, 5, 6].map(lessonStep)}
          <Stack gap={8} style={{ maxWidth: 280 }}>{controls}</Stack>
          <Box style={{ display: "flex", alignItems: "center",
            justifyContent: "center", padding: 12 }}>
            {view !== null && view.blocked ? (
              <Text size="sm" c="dimmed" ta="center" maw={520}>{view.norm.caption}</Text>
            ) : src === "classroom" && err === null ? (
              busy || classroom === null ? (
                <Group gap="sm" wrap="nowrap" align="center">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    the engine is integrating the laboratory column — seconds, not instant
                  </Text>
                </Group>
              ) : (
                <Text size="sm" c="dimmed" ta="center" maw={460}>
                  The classroom run finished but did not publish the
                  breakthrough surfaces (c_out_/y_out_ columns +
                  t_stoichiometric_* KPIs) — nothing honest to size from.
                </Text>
              )
            ) : src === "current" ? (
              <Text size="sm" c="dimmed" ta="center" maw={460}>
                Sizing needs a fixed-bed choupoBatch run with OUTLET tracking:
                a trajectory carrying c_out_/y_out_ columns and the
                engine&apos;s front KPIs (t_stoichiometric_*).  A holdup-only
                adsorber run has no breakthrough curve to size from.
              </Text>
            ) : null}
          </Box>
          {limits}
        </Stack>
      </Box>
    );
  }

  // ---- The figure ------------------------------------------------------------
  const { engine, measured, lab } = view;
  const tPlotEnd = engine.curve.t[engine.curve.t.length - 1] ?? 0;
  const traces: object[] = [];
  const shade = (a: CurveAnalysis, color: string, tag: string) => {
    if (a.tB === null) return;
    const used = curveSegment(a.curve, a.curve.t[0]!, a.tB);
    traces.push(
      { type: "scatter", mode: "lines", x: used.t, y: used.f, line: { width: 0 },
        hoverinfo: "skip", showlegend: false },
      { type: "scatter", mode: "lines", x: used.t, y: used.t.map(() => 1),
        line: { width: 0 }, fill: "tonexty", fillcolor: color.replace("A)", "0.22)"),
        name: `used capacity${tag}`, hoverinfo: "skip" },
    );
    if (a.stoich.tSt > a.tB) {
      const unused = curveSegment(a.curve, a.tB, Math.min(a.stoich.tSt, tPlotEnd));
      traces.push(
        { type: "scatter", mode: "lines", x: unused.t, y: unused.f, line: { width: 0 },
          hoverinfo: "skip", showlegend: false },
        { type: "scatter", mode: "lines", x: unused.t, y: unused.t.map(() => 1),
          line: { width: 0 }, fill: "tonexty", fillcolor: color.replace("A)", "0.45)"),
          name: `unused (LUB)${tag}`, hoverinfo: "skip" },
      );
    }
  };
  shade(engine, "rgba(38,198,218,A)", "");
  traces.push({
    type: "scatter", mode: "lines", name: `engine c_out/c_in (${view.comp})`,
    x: engine.curve.t, y: engine.curve.f, line: { color: PLOT_COLORS.accent, width: 2 },
  });
  if (measured !== null) {
    shade(measured, "rgba(255,183,77,A)", " — measured");
    traces.push({
      type: "scatter", mode: "markers", name: "measured c_out/c_in",
      x: measured.curve.t, y: measured.curve.f,
      marker: { color: PLOT_COLORS.warm, size: 6, symbol: "circle-open" },
    });
  }
  const vline = (x: number, color: string, dash: "solid" | "dash" | "dot") => ({
    type: "line" as const, yref: "paper" as const, x0: x, x1: x, y0: 0, y1: 1,
    line: { color, width: 1, dash },
  });
  const shapes: object[] = [];
  const annotations: object[] = [];
  const mark = (x: number | null, label: string, color: string,
    dash: "solid" | "dash" | "dot", yPaper: number) => {
    if (x === null) return;
    shapes.push(vline(x, color, dash));
    annotations.push({ x, y: yPaper, yref: "paper", text: label, showarrow: false,
      xanchor: "left", xshift: 4, font: { size: 11, color } });
  };
  mark(engine.tB, "t_b (curve)", PLOT_COLORS.accent, "solid", 0.10);
  mark(engine.stoich.tSt, "t_st (trapezoid)", PLOT_COLORS.accent, "dash", 0.20);
  mark(view.markers.tStoich, "t_st (engine KPI)", PLOT_COLORS.warm2, "dot", 0.30);
  if (measured !== null) {
    mark(measured.tB, "t_b (measured)", PLOT_COLORS.warm, "solid", 0.50);
    mark(measured.stoich.tSt, "t_st (measured)", PLOT_COLORS.warm, "dash", 0.60);
  }
  // The criterion itself, as a horizontal guide: t_b is where the curve
  // meets it.
  shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: design.criterion,
    y1: design.criterion, line: { color: PLOT_COLORS.grid, width: 1, dash: "dot" } });

  // The measured-curve state, said plainly.
  const measuredState = view.measuredErr !== null
    ? `${MEASURED_CURVE_PATH} is present but could not be read: ${view.measuredErr}`
    : measured === null
      ? `No measured curve: this case ships no ${MEASURED_CURVE_PATH}. Add one `
        + `(header ${MEASURED_CURVE_HEADER}, # comments allowed, one row per `
        + "sample) and it is drawn as markers and sized beside the engine's "
        + "curve, labelled measured."
      : `Measured curve read from ${MEASURED_CURVE_PATH}: `
        + `${measured.curve.t.length} samples, labelled measured below.`;

  const cols: CurveAnalysis[] = measured !== null ? [engine, measured] : [engine];
  const row = (label: string, cell: (a: CurveAnalysis) => string) => (
    <Table.Tr key={label}>
      <Table.Td>{label}</Table.Td>
      {cols.map((a) => <Table.Td key={a.label}>{cell(a)}</Table.Td>)}
    </Table.Tr>
  );
  const head = (
    <Table.Thead>
      <Table.Tr>
        <Table.Th>quantity</Table.Th>
        {cols.map((a) => <Table.Th key={a.label}>{a.label}</Table.Th>)}
      </Table.Tr>
    </Table.Thead>
  );
  const incomplete = cols.filter((a) => !a.stoich.complete);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>

        {lessonHead}
        {lessonStep(1)}
        {lessonStep(2)}

        <Box>
          <Title order={5}>Now read the two times off the curve</Title>
          <Text size="sm" mt={4}>
            The curve is the engine&apos;s integration of the laboratory
            column; the shaded area above it up to t_b is the capacity used,
            the darker band between t_b and t_st the capacity switched away.
            Two t_st lines are drawn on purpose: the trapezoid over the
            samples and the engine&apos;s own analytic claim — when they sit
            apart, the gap is the mesh and the dropped tail.  Turn the
            criterion and watch t_b move while t_st stays put; lengthen the
            bed and watch both move while the band between them does not.
          </Text>
        </Box>

        {refusal}

        <Box style={{ display: "grid", gap: 14,
          gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
          <Stack gap={8}>{controls}</Stack>
          <Box style={{ minWidth: 0, height: 420 }}>
            <Plot
              data={traces}
              layout={{
                ...darkLayout,
                title: { text: `Breakthrough curve — ${view.unit}`,
                  font: { ...darkLayout.font, size: 14 } },
                xaxis: { ...darkLayout.xaxis, title: { text: "t [s]" } },
                yaxis: { ...darkLayout.yaxis, title: { text: "c_out / c_in [-]" },
                  range: [-0.02, 1.08] },
                legend: { ...darkLayout.legend, x: 0.02, y: 0.98, xanchor: "left" },
                shapes, annotations,
              }}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
            />
          </Box>
        </Box>

        <Stack gap={2}>
          <Text size="xs" c="dimmed">{view.norm.caption}</Text>
          <Text size="xs" c="dimmed">{measuredState}</Text>
          {incomplete.length > 0 && (
            <Text size="xs" c="orange">
              INCOMPLETE DATA: {incomplete.map((a) => `${a.label} curve ends at `
                + `c_out/c_in = ${fmt(a.stoich.fEnd, 4)} (t = ${fmt(a.stoich.tEnd)} s)`)
                .join("; ")} — below 0.95, so its t_st is a LOWER BOUND and
              every length sized from it is too.  Extend the horizon (or the
              experiment) until the outlet is at the feed value.
            </Text>
          )}
        </Stack>

        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders style={{ fontSize: 12 }} verticalSpacing={2}>
            {head}
            <Table.Tbody>
              {row(`t_b at c_out/c_in = ${design.criterion} [s]`,
                (a) => a.tB === null ? "not reached" : fmt(a.tB))}
              {row("t_st, trapezoid over the samples [s]", (a) => fmt(a.stoich.tSt))}
              {row("t_st, engine KPI t_stoichiometric (analytic) [s]",
                (a) => a.label === "engine" ? fmt(view.markers.tStoich) : "—")}
              {row("integrated from / to [s], c_out/c_in at the end",
                (a) => `${fmt(a.stoich.t0, 4)} / ${fmt(a.stoich.tEnd)}, ${fmt(a.stoich.fEnd, 6)}`)}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt={4}>
            The engine&apos;s t_st is its pre-run claim (L/u)·R_f; the trapezoid
            is what the data say.  The engine also integrates its own outlet
            (integral_anchor_{view.comp} ={" "}
            {fmt(kpis?.[view.unit]?.[`integral_anchor_${view.comp}`])} s) — the
            same rule this page runs, on every internal step rather than on
            the written samples.
          </Text>
        </Box>

        {lessonStep(3)}

        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders style={{ fontSize: 12 }} verticalSpacing={2}>
            {head}
            <Table.Tbody>
              {row("q*_curve from the balance [mol/kg]", (a) => fmt(a.qCurve))}
              {row("q*_isotherm from the engine's R_f [mol/kg]", () => fmt(view.qIso))}
              {row("R_f, engine KPI retention_factor", () => fmt(view.rF))}
              {row("qbar_final, bed-average loading at t_end [mol/kg]", () => fmt(view.qBar))}
              {row("c_in anchored by the run [mol/m³]", () => fmt(view.cIn))}
            </Table.Tbody>
          </Table>
          <LabColumnNote lab={lab} />
        </Box>

        {lessonStep(4)}

        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders style={{ fontSize: 12 }} verticalSpacing={2}>
            {head}
            <Table.Tbody>
              {row("f_used = t_b / t_st", (a) => fmt(a.lub?.fUsed))}
              {row("LUB = L_lab (1 − t_b/t_st) [m]", (a) => fmt(a.lub?.lub))}
              {row("L_MTZ ≈ 2 LUB, symmetric front [m]", (a) => fmt(a.lub?.lMtz))}
              {row("L_lab, declared [m]", () => fmt(lab.L))}
            </Table.Tbody>
          </Table>
        </Box>

        {lessonStep(5)}

        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders style={{ fontSize: 12 }} verticalSpacing={2}>
            {head}
            <Table.Tbody>
              {row(`L_es = L_lab · t_req / t_st, t_req = ${design.tReq} s [m]`,
                (a) => fmt(a.scale?.lEs))}
              {row("L_full = L_es + LUB [m]", (a) => fmt(a.scale?.lFull))}
              {row("η_bed = L_es / L_full", (a) => fmt(a.scale?.utilisation))}
              {row(`D = √(4Q/(πu)), Q = ${design.Q} m³/s, u = ${fmt(lab.u, 4)} m/s [m]`,
                (a) => fmt(a.scale?.D))}
              {row("m_ads = ρ_b (πD²/4) L_full [kg]", (a) => fmt(a.scale?.mAds))}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt={4}>
            A dash means an input the case does not publish; the note under
            the capacity table names it and where it would come from.
          </Text>
        </Box>

        {lessonStep(6)}
        {limits}
      </Stack>
    </Box>
  );
}

/** Where each lab-column number came from, and which are unavailable. */
function LabColumnNote({ lab }: { lab: LabColumn }): JSX.Element {
  return (
    <Text size="xs" c="dimmed" mt={4}>
      Laboratory column, read from the case:{" "}
      L = {fmt(lab.L, 4)} m, u = {fmt(lab.u, 4)} m/s, ε = {fmt(lab.eps, 4)}
      {" "}(system/flowsheetDict, operation {"{}"} of the unit);{" "}
      ρ_b = {fmt(lab.rhoB, 4)} kg/m³
      {lab.rhoBSource ? ` (rho_bulk in ${lab.rhoBSource}` : ""}
      {lab.adsorbent && lab.rhoBSource ? `, adsorbent ${lab.adsorbent})` : lab.rhoBSource ? ")" : ""}.
      {lab.missing.length > 0 && (
        <>
          {" "}UNAVAILABLE, never defaulted:{" "}
          {lab.missing.map((m) => m).join("; ")}.
        </>
      )}
    </Text>
  );
}
