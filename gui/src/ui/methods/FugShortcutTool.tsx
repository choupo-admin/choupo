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
  FugShortcutTool (EduTools): where the first number a student types into a
  rigorous column simulator comes from.

  THE CONSTRUCTION, in the order the classical method builds it:

    * TOTAL REFLUX gives N_min.  Fenske, and it is a limit, not a design: send
      everything back and the column separates as well as it ever can with that
      many stages.  Drawn as the HORIZONTAL asymptote of the N(R) curve.
    * MINIMUM REFLUX gives R_min.  Underwood, and it is the other limit: take
      the reflux down to R_min and the stage count runs away.  Drawn as the
      VERTICAL asymptote.
    * GILLILAND interpolates BETWEEN the two limits and returns N(R).  Drawn as
      the curve, one point per engine run.

  And BESIDE IT, the answer the rigorous column gives to the same question --
  which is the whole reason the tool exists.  A shortcut number on its own
  teaches a formula; the pair teaches what the formula is FOR.

  ZERO PHYSICS IN TYPESCRIPT.  Every point on both curves is a separate
  in-browser engine run: the Gilliland curve is `choupoSolve` on
  `shortcut01_benzene_toluene` with `refluxFactor` written into its dict, and
  the rigorous ladder is `choupoSolve` on `column02_simultaneous` with
  `nStages` written into its dict.  Fenske, Underwood's theta and the Molokanov
  form of Gilliland are evaluated in
  `src/unitOperations/distillation/ShortcutColumn.cpp` and nowhere else; this
  file draws numbers and never makes one.  The comparability protocol -- what
  had to be tied together so the two columns answer ONE question -- is written
  out in `case/fugShortcut.ts`, and its short form is on screen beside the
  plot.

  THE ENGINE ALREADY CALLS THIS AN APPROXIMATION, and the tool says so in the
  engine's own words rather than its own: every shortcut run emits a
  `declaredApproximation` divergence (ShortcutColumn.cpp, contract in
  docs/design/problem-divergence-contract.md), and the alert above the
  construction renders that record verbatim.  A shortcut column is not refused
  and is not a mistake -- it is what the case asked for -- but a stream table
  cannot show that the column was a shortcut, so the record travels with the
  answer.  Here, so does the drawing.

  THE PAGE IS THE LESSON, not a panel of knobs with a caption.  The argument
  lives as DATA in `fugLesson.ts` (FUG_STEPS, FUG_LIMITS) so a test can assert
  it still runs end to end -- prose is the part of a tool that rots with
  nothing failing.  Steps 1-4 build the construction BEFORE the plot; step 5
  and the limits state the consequences AFTER it; and the lesson is rendered
  from ONE hoisted renderer, so it is on screen whether or not the engine has
  answered.

  THE LIMITS ARE ON SCREEN, not omitted for clarity: constant relative
  volatility (frozen at the feed bubble point, so no azeotrope is
  representable), constant molar overflow, a STAGE COUNT rather than a design,
  an empirical Kirkbride feed split, and a Gilliland correlation that is a FIT
  to plant and simulation data rather than a derivation.

  Theory: \label{ch:fug} in docs/theoryGuide.tex.
\*---------------------------------------------------------------------------*/

import { Suspense, lazy, useMemo, useState, type ComponentProps } from "react";
import { lessonStepper } from "./lessonStep.js";
import {
  Alert, Badge, Box, Group, Loader, LoadingOverlay, SegmentedControl, Stack,
  Switch, Text, Title, Tooltip,
} from "@mantine/core";

import {
  KnobField, KnobNumber, KnobSlider, PanelNote,
  type PanelKnob,
} from "./knobPanel.js";
import { FUG_LIMITS, FUG_STEPS } from "./fugLesson.js";
import { useEngineSeries } from "../../case/engineSeries.js";
import {
  FUG_KNOB_DEFAULTS, FUG_RIGOROUS_WITNESS, FUG_SHORTCUT_WITNESS,
  kirkbrideFraction, ladderCrossing, ladderRungs, readShortcutAnswer,
  rigorousSeries, shortcutDivergences, shortcutSeries, stageWindow,
  type Crossing, type FugKnobValues, type LadderRung, type ShortcutAnswer,
} from "../../case/fugShortcut.js";

// ---- Knob descriptors -------------------------------------------------------

const RECOVERY_KNOB: PanelKnob = {
  id: "recoveryLK",
  label: "Light-key recovery to the distillate",
  min: 0.9, max: 0.999, step: 0.005,
  why: "The separation both columns are asked for. The heavy-key recovery is "
    + "tied to it (r_HK = 1 - r_LK): on this 50/50 feed that pins the "
    + "distillate rate at 50 kmol/h, which is what the rigorous column "
    + "declares, so the two are solving one problem and the shortcut's "
    + "recovery target IS the rigorous column's distillate purity.",
};

const REFLUX_KNOB: PanelKnob = {
  id: "refluxFactor",
  label: "Operating reflux, R / R_min",
  min: 1.02, max: 8, step: 0.02,
  why: "Where between the two limits the column runs. Take it towards 1 and "
    + "the stage count runs away at Underwood's minimum reflux; take it up "
    + "and the curve flattens onto Fenske's minimum stages at total reflux.",
};

// ---- Lazy plot panes --------------------------------------------------------
// plotly.js touches `self` at module load and dies under node, so both panes
// are deferred: the module top level stays importable by the test runner.

interface FugCurvePoint { R: number; N: number; }

const StagesVsRefluxPlot = lazy(async () => {
  const { Plot, PLOT_CONFIG, PLOT_COLORS, darkLayout } =
    await import("../plotting/plotly.js");
  type PlotData = ComponentProps<typeof Plot>["data"];

  /*  `basis` carries the two ASYMPTOTES, and it is deliberately a different
      prop from `operating`.  N_min, R_min, theta and alpha do not depend on
      the reflux -- every point of the series publishes the same four -- so the
      asymptotes can be drawn from the first answered point.  The operating
      STAR cannot: it is one specific reflux, and while the series is still
      running the nearest answered point is not it.  A star drawn on a
      provisional point is a wrong number under a right caption, so it is
      simply absent until its own run lands.  */
  function CurvePlot({ curve, basis, operating, rigorousN }: {
    curve: FugCurvePoint[];
    basis: ShortcutAnswer;
    operating: ShortcutAnswer | null;
    rigorousN: number | null;
  }) {
    const xs = curve.map((p) => p.R);
    const ys = curve.map((p) => p.N);
    const xMax = Math.max(basis.Rmin, ...(xs.length ? xs : [basis.Rmin])) * 1.05;
    const yMax = Math.max(basis.Nmin, ...(ys.length ? ys : [basis.Nmin]),
      rigorousN ?? 0) * 1.15;

    const traces: object[] = [
      // GILLILAND: one engine run per point.
      {
        type: "scatter" as const, mode: "lines+markers" as const,
        name: "Gilliland  N(R)  — one engine run per point",
        x: xs, y: ys,
        line: { color: PLOT_COLORS.accent, width: 2.5 },
        marker: { color: PLOT_COLORS.accent, size: 6 },
        hovertemplate: "R = %{x:.3f}<br>N = %{y:.2f}<extra>Gilliland</extra>",
      },
      // FENSKE: the horizontal asymptote (total reflux).
      {
        type: "scatter" as const, mode: "lines" as const,
        name: `Fenske  N_min = ${basis.Nmin.toFixed(2)}  (total reflux)`,
        x: [0, xMax], y: [basis.Nmin, basis.Nmin],
        line: { color: PLOT_COLORS.warm, width: 1.5, dash: "dash" as const },
        hovertemplate: "N_min = %{y:.3f}<extra>Fenske</extra>",
      },
      // UNDERWOOD: the vertical asymptote (minimum reflux).
      {
        type: "scatter" as const, mode: "lines" as const,
        name: `Underwood  R_min = ${basis.Rmin.toFixed(3)}  (infinite stages)`,
        x: [basis.Rmin, basis.Rmin], y: [0, yMax],
        line: { color: PLOT_COLORS.warm2, width: 1.5, dash: "dash" as const },
        hovertemplate: "R_min = %{x:.4f}<extra>Underwood</extra>",
      },
    ];

    // The operating point, only once its own run has landed.
    if (operating) {
      traces.push({
        type: "scatter" as const, mode: "markers" as const,
        name: `shortcut answer · N = ${operating.N.toFixed(2)} at R = ${operating.R.toFixed(3)}`,
        x: [operating.R], y: [operating.N],
        marker: { color: PLOT_COLORS.accent, size: 15, symbol: "star" as const },
        hovertemplate: "R = %{x:.4f}<br>N = %{y:.3f}<extra>FUG at the operating reflux</extra>",
      });
    }

    if (rigorousN != null && operating) {
      // The rigorous answer to the SAME question, at the SAME reflux.
      traces.push({
        type: "scatter" as const, mode: "lines" as const,
        x: [operating.R, operating.R], y: [operating.N, rigorousN],
        line: { color: PLOT_COLORS.series[4], width: 2, dash: "dot" as const },
        showlegend: false, hoverinfo: "skip" as const,
      });
      traces.push({
        type: "scatter" as const, mode: "markers" as const,
        name: `rigorous MESH · ${rigorousN} stages for the same products`,
        x: [operating.R], y: [rigorousN],
        marker: {
          color: PLOT_COLORS.series[4], size: 15,
          symbol: "diamond" as const,
        },
        hovertemplate: "R = %{x:.4f}<br>stages = %{y}"
          + "<extra>simultaneous MESH column</extra>",
      });
    }

    return (
      <Plot
        data={traces as PlotData}
        layout={{
          ...darkLayout,
          title: {
            text: "Stages against reflux — the two limits and the interpolation between them",
            font: { ...darkLayout.font, size: 14 },
          },
          xaxis: {
            ...darkLayout.xaxis,
            title: { text: "R  (operating reflux ratio, L/D)" },
            range: [0, xMax],
          },
          yaxis: {
            ...darkLayout.yaxis,
            title: { text: "N  (theoretical stages)" },
            range: [0, yMax],
          },
          legend: {
            ...darkLayout.legend, x: 0.98, y: 0.98, xanchor: "right" as const,
          },
        }}
        config={PLOT_CONFIG}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    );
  }
  return { default: CurvePlot };
});

const RigorousLadderPlot = lazy(async () => {
  const { Plot, PLOT_CONFIG, PLOT_COLORS, darkLayout } =
    await import("../plotting/plotly.js");
  type PlotData = ComponentProps<typeof Plot>["data"];

  function LadderPlot({ rungs, target, shortcutStages, crossing }: {
    rungs: LadderRung[];
    target: number;
    shortcutStages: number;
    crossing: Crossing;
  }) {
    const xs = rungs.map((r) => r.nStages);
    const xLo = Math.min(shortcutStages, ...(xs.length ? xs : [shortcutStages]));
    const xHi = Math.max(shortcutStages, ...(xs.length ? xs : [shortcutStages]));

    const traces: object[] = [
      {
        type: "scatter" as const, mode: "lines+markers" as const,
        name: "rigorous MESH · x_D (benzene) — one engine run per stage count",
        x: xs, y: rungs.map((r) => r.xD_LK),
        line: { color: PLOT_COLORS.series[4], width: 2.5 },
        marker: { color: PLOT_COLORS.series[4], size: 7 },
        hovertemplate: "N = %{x}<br>x_D = %{y:.5f}<extra>distillate</extra>",
      },
      {
        type: "scatter" as const, mode: "lines+markers" as const,
        name: "rigorous MESH · x_B (toluene)",
        x: xs, y: rungs.map((r) => r.xB_HK),
        line: { color: PLOT_COLORS.accent2, width: 1.5, dash: "dot" as const },
        marker: { color: PLOT_COLORS.accent2, size: 5 },
        hovertemplate: "N = %{x}<br>x_B = %{y:.5f}<extra>bottoms</extra>",
      },
      {
        type: "scatter" as const, mode: "lines" as const,
        name: `the separation asked for · ${target.toFixed(4)}`,
        x: [xLo - 1, xHi + 1], y: [target, target],
        line: { color: PLOT_COLORS.warm, width: 1.5, dash: "dash" as const },
        hovertemplate: "target = %{y:.5f}<extra></extra>",
      },
    ];

    const shapes: object[] = [{
      type: "line" as const, yref: "paper" as const,
      x0: shortcutStages, x1: shortcutStages, y0: 0, y1: 1,
      line: { color: PLOT_COLORS.accent, width: 2, dash: "dash" as const },
    }];
    const annotations: object[] = [{
      x: shortcutStages, yref: "paper" as const, y: 1.02,
      text: `shortcut says ${shortcutStages}`, showarrow: false,
      font: { ...darkLayout.font, color: PLOT_COLORS.accent, size: 11 },
    }];
    if (crossing.nStages != null) {
      shapes.push({
        type: "line" as const, yref: "paper" as const,
        x0: crossing.nStages, x1: crossing.nStages, y0: 0, y1: 1,
        line: { color: PLOT_COLORS.series[4], width: 2 },
      });
      annotations.push({
        x: crossing.nStages, yref: "paper" as const, y: 1.08,
        text: `rigorous reaches it at ${crossing.nStages}`, showarrow: false,
        font: { ...darkLayout.font, color: PLOT_COLORS.series[4], size: 11 },
      });
    }

    return (
      <Plot
        data={traces as PlotData}
        layout={{
          ...darkLayout,
          margin: { ...darkLayout.margin, t: 60 },
          title: {
            text: "The rigorous ladder — what the MESH column actually delivers, stage count by stage count",
            font: { ...darkLayout.font, size: 14 },
          },
          xaxis: {
            ...darkLayout.xaxis,
            title: { text: "nStages  (rigorous column)" }, dtick: 2,
          },
          yaxis: {
            ...darkLayout.yaxis,
            title: { text: "product mole fraction of the key" },
          },
          legend: {
            ...darkLayout.legend, x: 0.98, y: 0.02,
            xanchor: "right" as const, yanchor: "bottom" as const,
          },
          shapes, annotations,
        }}
        config={PLOT_CONFIG}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    );
  }
  return { default: LadderPlot };
});

// ---- The tool ---------------------------------------------------------------

type Pane = "curve" | "ladder";

export function FugShortcutTool(): JSX.Element {
  const [knobs, setKnobs] = useState<FugKnobValues>(FUG_KNOB_DEFAULTS);
  const [pane, setPane] = useState<Pane>("curve");
  const [compare, setCompare] = useState(true);

  // ---- The shortcut series: one FUG solve per reflux factor ----------------
  const shortcutKey = JSON.stringify(
    { r: knobs.recoveryLK, f: knobs.refluxFactor });
  const shortcutPoints = useMemo(() => shortcutSeries(knobs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shortcutKey]);
  const shortcut = useEngineSeries(
    FUG_SHORTCUT_WITNESS, shortcutPoints, shortcutKey, "choupoSolve");

  // Every answered point, and the one AT the operating reflux (which the
  // series always contains — shortcutSeries inserts it).
  const answers = useMemo(
    () => shortcut.results.map(readShortcutAnswer)
      .filter((a): a is ShortcutAnswer => a != null),
    [shortcut.results]);
  const curve = useMemo<FugCurvePoint[]>(
    () => answers.map((a) => ({ R: a.R, N: a.N })).sort((p, q) => p.R - q.R),
    [answers]);
  // THE BASIS: the four quantities that do NOT depend on the reflux — N_min,
  // R_min, theta and alpha — which every point of the series publishes
  // identically.  They can be shown from the first answer that lands.
  const basis = answers[0] ?? null;

  // THE OPERATING POINT: the one run AT the reader's reflux, and it is either
  // present or it is not.  An earlier version took the nearest answered point
  // while the series was still running, and checkGui's screenshot caught the
  // consequence: a chip reading "Gilliland · N = 26.96 at R = 1.424" under a
  // knob set to 1.30 — a real engine number under the wrong caption, which is
  // worse than an empty chip.  The match is exact because shortcutSeries always
  // poses this exact factor; the tolerance is float slack, not a search.
  const operating = useMemo<ShortcutAnswer | null>(() => {
    if (answers.length === 0) return null;
    const wanted = knobs.refluxFactor * answers[0]!.Rmin;
    return answers.find(
      (a) => Math.abs(a.R - wanted) <= 1e-6 * Math.max(1, Math.abs(wanted)))
      ?? null;
  }, [answers, knobs.refluxFactor]);

  const divergences = useMemo(
    () => shortcutDivergences(shortcut.results.find((r) => r != null) ?? null),
    [shortcut.results]);

  // ---- The rigorous ladder: one MESH solve per stage count ------------------
  // NOT named `window`: a local of that name shadows the global one for the
  // whole component, and this file's plot panes are lazy modules that do reach
  // it.  The stage counts are `stageCounts`.
  const stageCounts = useMemo(
    () => (operating
      ? stageWindow(operating.N, knobs.ladderBelow, knobs.ladderAbove)
      : []),
    [operating, knobs.ladderBelow, knobs.ladderAbove]);
  // THE LADDER WAITS FOR THE SHORTCUT TO FINISH, deliberately.  Its whole spec
  // -- which stage counts, at which reflux, with the feed where -- comes from
  // the operating shortcut answer, and while the shortcut series is still
  // running `operating` is whichever answered point is currently nearest.  A
  // ladder started on a provisional answer would be aborted and restarted on
  // every incoming shortcut point, so it would never finish a rung; serialising
  // the two also keeps one engine stream in flight rather than two.
  const ladderReady = compare && operating != null && !shortcut.busy;
  const ladderKey = JSON.stringify({
    on: ladderReady, w: stageCounts,
    f: operating ? kirkbrideFraction(operating) : 0,
    R: operating?.R ?? 0,
  });
  const ladderPoints = useMemo(
    () => (ladderReady && operating
      ? rigorousSeries(stageCounts, kirkbrideFraction(operating), operating.R)
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ladderKey]);
  const ladder = useEngineSeries(
    ladderReady ? FUG_RIGOROUS_WITNESS : null,
    ladderPoints, ladderKey, "choupoSolve");

  const rungs = useMemo(() => ladderRungs(ladder.results), [ladder.results]);
  // THE TARGET IS THE ENGINE'S NUMBER, not the knob's.  Under the recovery tie
  // the two are the same to the last digit, and taking the shortcut's own
  // published x_D removes even that arithmetic from the comparison: the ladder
  // is asked to reach the distillate the shortcut says it designed for.
  const target = operating?.xD_LK ?? 0;
  const crossing = useMemo(
    () => ladderCrossing(rungs, target), [rungs, target]);

  const shortcutStages = operating ? Math.ceil(operating.N) : 0;
  const busy = shortcut.busy || ladder.busy;

  const fallback = (
    <Group gap={8} p="md">
      <Loader size="sm" />
      <Text size="sm" c="dimmed">loading the plot…</Text>
    </Group>
  );

  // ---- The knobs ------------------------------------------------------------
  const setup = (
    <>
      <KnobField label="pane">
        <SegmentedControl size="xs" value={pane} fullWidth
          onChange={(v) => setPane(v as Pane)}
          data={[
            { label: "Stages vs reflux", value: "curve" },
            { label: "Rigorous ladder", value: "ladder" },
          ]} />
      </KnobField>
      <KnobSlider knob={RECOVERY_KNOB} value={knobs.recoveryLK} showWhy
        onChange={(v) => setKnobs({ ...knobs, recoveryLK: v })} />
      <KnobSlider knob={REFLUX_KNOB} value={knobs.refluxFactor} showWhy
        onChange={(v) => setKnobs({ ...knobs, refluxFactor: v })} />
      <KnobField
        label="compare against the rigorous MESH column"
        hint="Off, the page draws the shortcut alone and runs a dozen fewer solves.">
        <Switch size="sm" checked={compare} onChange={(e) => setCompare(e.currentTarget.checked)}
          label={compare ? "on" : "off"} />
      </KnobField>
      {compare && (
        <>
          <KnobNumber label="ladder: stage counts below the shortcut's answer"
            value={knobs.ladderBelow} min={0} max={20} step={1} decimals={0}
            onChange={(v) => setKnobs({ ...knobs, ladderBelow: v })} />
          <KnobNumber label="ladder: stage counts above it"
            value={knobs.ladderAbove} min={0} max={20} step={1} decimals={0}
            onChange={(v) => setKnobs({ ...knobs, ladderAbove: v })} />
        </>
      )}
    </>
  );

  // ---- Where every number on this page came from ----------------------------
  const provenance = (
    <>
      <PanelNote>
        Both curves are engine runs, in this browser. The shortcut points are{" "}
        <code>choupoSolve</code> on{" "}
        <code>tutorials/{FUG_SHORTCUT_WITNESS}</code> with{" "}
        <code>refluxFactor</code> written into its dict; the ladder is{" "}
        <code>choupoSolve</code> on{" "}
        <code>tutorials/{FUG_RIGOROUS_WITNESS}</code> with{" "}
        <code>nStages</code> written into its dict. Nothing on either axis is
        computed here.
      </PanelNote>
      <PanelNote>
        <strong>How the two are made comparable.</strong> Same feed (100 kmol/h,
        50/50 benzene/toluene, 1 atm, saturated liquid) and the same declared
        thermophysical system (ideal γ, ideal-gas vapour) in both witnesses.
        The heavy-key recovery is tied to the light-key one, which pins the
        distillate at 50 kmol/h — the rate the rigorous column declares — and
        makes the shortcut&apos;s recovery target the same number as the
        rigorous column&apos;s distillate purity. The rigorous column then runs
        at the reflux the shortcut returned, with its feed placed by the
        shortcut&apos;s own Kirkbride fraction. The feed composition is not a
        knob because 50/50 is what makes that tie hold.
      </PanelNote>
    </>
  );

  /*  ONE renderer for the lesson, hoisted above everything that can be empty:
   *  the steps, the heading and the limits are rendered from the SAME place
   *  whether the engine has answered or not.  A page that hides its
   *  explanation exactly when there is nothing to explain is backwards, and
   *  a second copy of the prose in the empty branch would be a second home
   *  for it. */
  const lessonStep = lessonStepper(FUG_STEPS);

  const lessonHead = (
    <Box>
      <Title order={3}>
        The shortcut: two limits with derivations, and a fit between them
      </Title>
      <Text size="sm" c="dimmed" mt={4}>
        Where the first number you type into a rigorous column comes from — and
        which parts of it are consequences of an assumption, and which part is
        a curve somebody drew through data.
      </Text>
    </Box>
  );

  const lessonLimits = (
    <Box>
      <Title order={5}>What this does not model</Title>
      <Box mt={4} style={{ display: "grid", columnGap: 16, rowGap: 6,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {FUG_LIMITS.map((l) => (
          <Text key={l.id} size="xs" c="dimmed">
            <b>{l.title}</b> {l.body}
          </Text>
        ))}
      </Box>
    </Box>
  );

  // ---- The live numbers, as chips ------------------------------------------
  const chips = (
    <Group gap={8} align="center" wrap="wrap">
      {/* THE TWO LIMITS: reflux-independent, so they are shown from the
          first answered point of the series. */}
      {basis && (
        <>
          <Badge variant="light" color="orange" size="lg"
            styles={{ root: { textTransform: "none" } }}>
            Fenske · N_min = {basis.Nmin.toFixed(2)} at total reflux
          </Badge>
          <Badge variant="light" color="orange" size="lg"
            styles={{ root: { textTransform: "none" } }}>
            Underwood · R_min = {basis.Rmin.toFixed(3)} (θ = {basis.theta.toFixed(4)})
          </Badge>
          <Badge variant="light" color="gray" size="lg"
            styles={{ root: { textTransform: "none" } }}>
            α_LK,HK = {basis.alpha.toFixed(3)} · frozen at the feed bubble point
          </Badge>
        </>
      )}
      {/* THE INTERPOLATION AT THIS REFLUX: only once its own run has landed. */}
      {operating && (
        <Badge variant="light" color="cyan" size="lg"
          styles={{ root: { textTransform: "none" } }}>
          Gilliland · N = {operating.N.toFixed(2)} at R = {operating.R.toFixed(3)}
        </Badge>
      )}
      {/* THE JUXTAPOSITION.  This is the chip the tool exists for. */}
      {operating && compare && crossing.nStages != null ? (
        <Tooltip withArrow multiline w={340}
          label="Both columns: same feed, same thermo, same reflux, same distillate rate, same product specification. The shortcut answers with a stage count in closed form; the rigorous MESH column is solved once per stage count until it reaches the same products.">
          <Badge variant="filled" color="teal" size="lg"
            styles={{ root: { textTransform: "none", cursor: "help" } }}>
            shortcut prediction: {operating.N.toFixed(1)} stages
            {" → "}{shortcutStages} whole stages
            {"  ·  "}rigorous MESH: {crossing.nStages} stages
          </Badge>
        </Tooltip>
      ) : compare && ladder.busy ? (
        <Badge variant="light" color="gray" size="lg"
          styles={{ root: { textTransform: "none" } }}>
          rigorous ladder · solving {ladder.done}/{ladderPoints.length}
        </Badge>
      ) : null}
      {shortcut.busy && (
        <Badge variant="light" color="gray" size="lg"
          styles={{ root: { textTransform: "none" } }}>
          shortcut curve · solving {shortcut.done}/{shortcutPoints.length}
        </Badge>
      )}
    </Group>
  );

  // ---- What the engine itself says about these runs ------------------------
  const alerts = (
    <>
      {/* THE ENGINE'S OWN VERDICT, verbatim.  Not a caption this file wrote. */}
      {divergences.map((d, i) => (
        <Alert key={i} color="yellow" variant="light"
          title="The engine records this run as a declared approximation">
          <Text size="xs">
            <strong>{d.locus}</strong> — requested: {d.requested}; solved:{" "}
            {d.solved}. Reason: {d.reason}.
          </Text>
          <Text size="xs" mt={4} c="dimmed">
            A declared approximation is what the case asked for, so the engine
            runs it and records it; it is never refused. What it cannot do is
            show up in a stream table, which is why the record travels with the
            answer — and why this page draws the rigorous column beside it.
          </Text>
        </Alert>
      ))}

      {shortcut.failures.length > 0 && (
        <Alert color="red" variant="light"
          title="choupoSolve (WASM) — shortcut points that refused">
          {shortcut.failures.map((f) => (
            <Text key={f.label} size="xs" ff="monospace"
              style={{ whiteSpace: "pre-wrap" }}>
              {f.label}: {f.message}
            </Text>
          ))}
        </Alert>
      )}
      {ladder.failures.length > 0 && (
        <Alert color="red" variant="light"
          title="choupoSolve (WASM) — rigorous ladder rungs that refused">
          {ladder.failures.map((f) => (
            <Text key={f.label} size="xs" ff="monospace"
              style={{ whiteSpace: "pre-wrap" }}>
              {f.label}: {f.message}
            </Text>
          ))}
        </Alert>
      )}
      {compare && !ladder.busy && crossing.aboveWindow && rungs.length > 0 && (
        <Alert color="orange" variant="light"
          title="The ladder did not reach the separation">
          <Text size="xs">
            No stage count between {rungs[0]!.nStages} and{" "}
            {rungs[rungs.length - 1]!.nStages} reached x_D ={" "}
            {target.toFixed(4)}. The crossing is above the window —
            raise &quot;stage counts above&quot;. Nothing is extrapolated here:
            a window that misses the answer says so.
          </Text>
        </Alert>
      )}
      {compare && !ladder.busy && crossing.belowWindow && (
        <Alert color="orange" variant="light"
          title="The ladder's lowest rung already met the separation">
          <Text size="xs">
            {crossing.nStages} stages is the SMALLEST count that was tried, so
            the true crossing may be lower. Raise &quot;stage counts
            below&quot; to find it.
          </Text>
        </Alert>
      )}
    </>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>

        {lessonHead}
        {lessonStep(1)}
        {lessonStep(2)}
        {lessonStep(3)}
        {lessonStep(4)}

        <Box>
          <Title order={5}>Now read the two limits off a solved column</Title>
          <Text size="sm" mt={4}>
            Everything below is an engine answer, not an illustration. The
            first pane draws N against R: the horizontal dashed line is
            Fenske&apos;s N_min, the vertical dashed line is Underwood&apos;s
            R_min, and the curve between them is Gilliland — one solve of the
            shortcut column per point. The second pane runs the RIGOROUS MESH
            column on the same separation, one solve per stage count, and asks
            the only question that settles the comparison: how many stages does
            it actually take to reach the products the shortcut designed for?
          </Text>
        </Box>

        {chips}
        {alerts}

        <Box style={{ display: "grid", gap: 14,
          gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
          <Stack gap={8}>{setup}</Stack>
          <Box pos="relative" style={{ minWidth: 0, height: 460 }}>
            <LoadingOverlay visible={busy && !basis} zIndex={5}
              overlayProps={{ blur: 1 }}
              loaderProps={{ children: fallback }} />
            {basis && pane === "curve" ? (
              <Suspense fallback={fallback}>
                <StagesVsRefluxPlot curve={curve} basis={basis} operating={operating}
                  rigorousN={compare ? crossing.nStages : null} />
              </Suspense>
            ) : basis && rungs.length > 0 ? (
              <Suspense fallback={fallback}>
                <RigorousLadderPlot rungs={rungs} target={target}
                  shortcutStages={shortcutStages} crossing={crossing} />
              </Suspense>
            ) : basis && !compare ? (
              <Box p="xl">
                <Text c="dimmed" size="sm" maw={560}>
                  The rigorous comparison is switched off, so there is no ladder
                  to draw. Turn it back on in the knobs and the MESH column is
                  solved once per stage count around the shortcut&apos;s answer.
                </Text>
              </Box>
            ) : basis ? (
              <Box p="xl">
                <Text c="dimmed" size="sm" maw={560}>
                  The rigorous ladder has no rungs yet
                  {ladderPoints.length > 0
                    ? ` (${ladder.done} of ${ladderPoints.length} stage counts solved)`
                    : ""}. Each rung is a full MESH solve of{" "}
                  <code>tutorials/{FUG_RIGOROUS_WITNESS}</code> in this browser,
                  and they run one after another so the reflux they all share is
                  the one the shortcut returned.
                </Text>
              </Box>
            ) : !busy && shortcut.failures.length === 0 ? (
              <Box p="xl">
                <Text c="dimmed" size="sm" maw={560}>
                  No shortcut answer yet. The construction reads a{" "}
                  <code>shortcutColumn</code> run — its KPIs publish{" "}
                  <code>N_min</code>, <code>R_min</code>, <code>theta</code> and{" "}
                  <code>N_theoretical</code>.
                </Text>
              </Box>
            ) : null}
          </Box>
        </Box>

        {provenance}

        {lessonStep(5)}

        {/* THE LIMITS AGAINST THIS RUN'S OWN NUMBERS, not a footnote nobody
            opens: the same four assumptions, priced where they can be. */}
        <Text size="xs" c="dimmed">
          <strong>What FUG assumed to get the numbers above.</strong> The
          relative volatility is <strong>constant</strong> — one value, frozen
          at the feed bubble point{basis
            ? ` (α = ${basis.alpha.toFixed(3)} here)`
            : ""} — so no azeotrope is representable at all, and the α that
          actually varies down a real column is not in any of these numbers.
          Underwood&apos;s derivation also assumes <strong>constant molar
          overflow</strong>: equal molar latent heats, so the internal vapour
          and liquid flows do not change from stage to stage. What comes out is
          a <strong>stage count, not a design</strong> — no tray spacing, no
          diameter, no hydraulics, no real trays at a Murphree efficiency.
          And the Gilliland step is a <strong>correlation fitted to data</strong>,
          not a derivation: it interpolates between two limits that ARE derived
          (Fenske at total reflux, Underwood at minimum reflux) and carries the
          scatter of the plants and simulations it was fitted to.
          {compare && crossing.nStages != null && operating
            ? ` Here the shortcut says ${operating.N.toFixed(2)} stages and the`
              + ` rigorous MESH column reaches the same products at`
              + ` ${crossing.nStages}; the gap is what the assumptions above`
              + ` cost on this separation, and it is not a constant — take the`
              + ` reflux towards total reflux, where Gilliland stops being`
              + ` involved, and the two counts meet.`
            : ""}
        </Text>

        {lessonLimits}
      </Stack>
    </Box>
  );
}
