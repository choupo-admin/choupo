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
  Kremser tool (Methods workspace): the classical shortcut for stagewise
  absorption laid OVER a real engine run, so the student sees where the
  shortcut holds and where it breaks.

  The plane's standing rule is ZERO physics in TypeScript; the ONE authorized
  exception here is the Kremser closed form itself -- the textbook METHOD
  geometry this tool exists to teach:

      recovery(A, N) = (A^{N+1} - A) / (A^{N+1} - 1)      (A != 1)
                     = N / (N + 1)                         (A  = 1 limit)

  Every number it is compared AGAINST comes from the engine: the absorber
  publishes KPIs "stages", per-solute "A_"+name (A_i = L/(K_i V) at the feed
  T), "K_"+name, "recovery_"+name, plus "nonIsothermal" / "dT_rise", and a
  per-stage profile (stage, T_K, y_i, x_i).  THE LESSON is the labelled
  deviation chip |recovery_KPI - Kremser(A_i, N)|: the closed form assumes ONE
  constant A (straight operating + equilibrium lines) while the engine
  re-evaluates K stage by stage -- on a non-isothermal column the solvent's
  dT_rise drives that K variation, and the gap is real, not an error.

  Activation is A_* + stages.  Checked against Stripper.cpp before labelling:
  the stripper does NOT mirror these keys -- it publishes "S_"+name
  (S = K V / L), "V_over_L" and "dT_drop" -- so this tool serves ABSORBER runs
  only.  If the stripper ever mirrors A_*, extend findKremserUnits (the
  predicate), not the caption.

  SELF-FEEDING (the Methods-workspace standalone contract, case/methodRun.ts):
  the DEFAULT mode is "Classroom" -- the tool runs the engine ITSELF, in the
  browser, on its own witness `tutorials/steady/absorption/absorber01_NH3_water`
  (the textbook NH3/water absorber, non-isothermal, 6 stages), cloned from the
  bundled corpus with the knob values written into its dicts and solved by the
  WASM choupoSolve.  The knobs edit DECLARED dict scalars only (stages, the
  water/NH3/N2 feed flows, the two feed temperatures -- each key verified
  unique in its file; applyScalarOverride throws otherwise), so zero physics
  in TypeScript survives intact: the student moves a knob, the engine
  re-solves the column, and the deviation chip re-measures the gap.  When the
  app's CURRENT run has servable units a source toggle offers it; the old
  no-absorber empty state survives only under "Current run".

  The plotly bundle cannot load outside a browser ("self is not defined"), so
  both plot panes are React.lazy -- the module top level stays importable by
  the node test runner, which pins the closed form, the activation predicate,
  and the knob->dict-scalar map against the REAL bundled witness text
  (tests/kremserTool.test.ts).
\*---------------------------------------------------------------------------*/

import { Suspense, lazy, useMemo, useState, type ComponentProps } from "react";
import {
  Alert, Badge, Box, Group, Loader, LoadingOverlay, SegmentedControl, Text,
  Tooltip,
} from "@mantine/core";

import type { RunResult, UnitProfile } from "../../adapters/SolverAdapter.js";
import {
  KnobField, KnobNumber, MethodSetupRail, PanelNote,
} from "./knobPanel.js";
import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";

// ---- The Kremser closed form (the authorized method geometry) --------------

/** Fraction of the solute absorbed by N equilibrium stages at constant
 *  absorption factor A = L/(K V).  The A = 1 removable singularity takes its
 *  textbook limit N/(N+1).  NaN for a non-positive A or N < 1 -- the engine
 *  publishes A = 0 as a "no K" placeholder and the caller skips it. */
export function kremserRecovery(A: number, N: number): number {
  if (!(A > 0) || !(N >= 1)) return NaN;
  if (Math.abs(A - 1) < 1e-9) return N / (N + 1);
  const Ap = Math.pow(A, N + 1);
  return (Ap - A) / (Ap - 1);
}

/** The recovery-vs-N curve for one A, N = 1..Nmax (integer stages). */
export function kremserCurve(A: number, Nmax = 20): { N: number[]; recovery: number[] } {
  const N: number[] = [];
  const recovery: number[] = [];
  for (let n = 1; n <= Nmax; ++n) {
    N.push(n);
    recovery.push(kremserRecovery(A, n));
  }
  return { N, recovery };
}

// ---- Activation: read the absorber's published KPIs ------------------------

export interface KremserComponent {
  name: string;
  /** absorption factor A = L/(K V), from the "A_"+name KPI (at the feed T). */
  A: number;
  /** reference K from the "K_"+name KPI, when published. */
  K?: number;
  /** the ENGINE's stagewise recovery, from the "recovery_"+name KPI. */
  recovery?: number;
  /** |recovery_KPI - Kremser(A, stages)| -- the lesson chip. */
  deviation?: number;
}

export interface KremserUnit {
  unit: string;
  stages: number;
  nonIsothermal: boolean;
  dTrise?: number;
  components: KremserComponent[];
}

/** The activation predicate: a unit serves this tool when its KPI bag carries
 *  "stages" AND at least one "A_"+component key (the absorber's contract).
 *  A component whose A is not > 0 is skipped -- the engine publishes A = 0
 *  when it had no K for that solute, and a placeholder is not a datum. */
export function findKremserUnits(
  kpis: RunResult["kpis"] | undefined,
): KremserUnit[] {
  if (!kpis) return [];
  const out: KremserUnit[] = [];
  for (const [unit, bag] of Object.entries(kpis)) {
    const stages = bag["stages"];
    if (typeof stages !== "number" || !(stages >= 1)) continue;
    const components: KremserComponent[] = [];
    for (const key of Object.keys(bag).sort()) {
      if (!key.startsWith("A_")) continue;
      const A = bag[key];
      if (typeof A !== "number" || !(A > 0)) continue;
      const name = key.slice(2);
      const comp: KremserComponent = { name, A };
      const K = bag["K_" + name];
      if (typeof K === "number") comp.K = K;
      const recovery = bag["recovery_" + name];
      if (typeof recovery === "number") {
        comp.recovery = recovery;
        comp.deviation = Math.abs(recovery - kremserRecovery(A, stages));
      }
      components.push(comp);
    }
    if (components.length === 0) continue;
    const u: KremserUnit = {
      unit,
      stages,
      nonIsothermal: bag["nonIsothermal"] === 1,
      components,
    };
    const dT = bag["dT_rise"];
    if (typeof dT === "number") u.dTrise = dT;
    out.push(u);
  }
  return out;
}

// ---- Stage profile, mapped to ProfilePlot's conventions --------------------

/** ProfilePlot's axis-split heuristic sends the column named exactly "T" to
 *  the right axis; the absorber publishes "T_K".  Same number, same unit
 *  (kelvin) -- renamed for DISPLAY only, so temperature does not flatten the
 *  mole-fraction traces onto one axis.  Everything else passes through. */
export function stageProfileForDisplay(p: UnitProfile): UnitProfile {
  const columns: { [name: string]: number[] } = {};
  for (const [k, v] of Object.entries(p.columns)) {
    columns[k === "T_K" ? "T" : k] = v;
  }
  return { ...p, columns };
}

// ---- Lazy plot panes -------------------------------------------------------
// plotly.js references `self` at load and dies under node; deferring the
// import to first render keeps this module importable by the test runner.

const N_MAX = 20;
const FAN_A = [0.5, 0.8, 1.0, 1.25, 1.5, 2.0];

const KremserFanPlot = lazy(async () => {
  const { Plot, PLOT_CONFIG, PLOT_COLORS, darkLayout } =
    await import("../plotting/plotly.js");
  type PlotData = ComponentProps<typeof Plot>["data"];

  function FanPlot({ unit }: { unit: KremserUnit }) {
    // Reference fan: the textbook A values, minus any that would overdraw a
    // component's ACTUAL A_i (the actual curve is the highlighted one).
    const actualA = unit.components.map((c) => c.A);
    const fan = FAN_A.filter((a) => actualA.every((b) => Math.abs(a - b) > 0.05));

    const traces: object[] = fan.map((A) => {
      const c = kremserCurve(A, N_MAX);
      return {
        type: "scatter" as const, mode: "lines" as const,
        name: `A = ${A.toFixed(2)}`,
        x: c.N, y: c.recovery,
        line: { color: PLOT_COLORS.axis, width: 1 },
        hovertemplate: "N=%{x}<br>recovery=%{y:.4f}<extra>A = " + A.toFixed(2) + "</extra>",
      };
    });

    unit.components.forEach((comp, i) => {
      const color = PLOT_COLORS.series[i % PLOT_COLORS.series.length];
      const c = kremserCurve(comp.A, N_MAX);
      traces.push({
        type: "scatter" as const, mode: "lines" as const,
        name: `Kremser · A_${comp.name} = ${comp.A.toFixed(3)}`,
        x: c.N, y: c.recovery,
        line: { color, width: 2.5 },
        hovertemplate: "N=%{x}<br>recovery=%{y:.4f}<extra>" + comp.name + "</extra>",
      });
      if (comp.recovery != null) {
        // The dotted riser at N = stages IS the deviation chip, drawn: from
        // the closed-form prediction down/up to the engine's actual recovery.
        traces.push({
          type: "scatter" as const, mode: "lines" as const,
          x: [unit.stages, unit.stages],
          y: [kremserRecovery(comp.A, unit.stages), comp.recovery],
          line: { color, width: 1.5, dash: "dot" as const },
          showlegend: false, hoverinfo: "skip" as const,
        });
        traces.push({
          type: "scatter" as const, mode: "markers" as const,
          name: `${comp.name} · engine run`,
          x: [unit.stages], y: [comp.recovery],
          marker: { color, size: 12, symbol: "star" as const },
          hovertemplate: "N=%{x}<br>recovery=%{y:.4f}<extra>"
            + comp.name + " (engine)</extra>",
        });
      }
    });

    return (
      <Plot
        data={traces as PlotData}
        layout={{
          ...darkLayout,
          title: {
            text: `Kremser · ${unit.unit}  ·  N = ${unit.stages} stages`,
            font: { ...darkLayout.font, size: 14 },
          },
          xaxis: {
            ...darkLayout.xaxis,
            title: { text: "N (theoretical stages)" }, dtick: 2,
          },
          yaxis: {
            ...darkLayout.yaxis,
            title: { text: "solute recovery (fraction)" }, range: [0, 1.02],
          },
          legend: { ...darkLayout.legend, x: 0.98, y: 0.02, xanchor: "right" as const },
          shapes: [{
            type: "line" as const, yref: "paper" as const,
            x0: unit.stages, x1: unit.stages, y0: 0, y1: 1,
            line: { color: PLOT_COLORS.grid, width: 1, dash: "dash" as const },
          }],
        }}
        config={PLOT_CONFIG}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    );
  }
  return { default: FanPlot };
});

const StageProfilePlot = lazy(() =>
  import("../plotting/ProfilePlot.js").then((m) => ({ default: m.ProfilePlot })));

// ---- The classroom witness + its knob map ----------------------------------

/** The standalone witness this tool re-runs in-browser: the bundled-corpus
 *  identifier (`<category>/<subclass>/<shortName>` for the sub-classed steady
 *  category), exactly what tutorialByName resolves.  The tutorial IS the
 *  textbook Kremser lesson: NH3 scrubbed from air by water, non-isothermal,
 *  so the engine's stagewise recovery visibly leaves the closed-form curve. */
export const KREMSER_WITNESS = "steady/absorption/absorber01_NH3_water";

/** The knob values.  Each writes ONLY the NUMBER of a declared dict scalar;
 *  the unit word (kmol/h, K) stays in the witness file, so the values below
 *  are in the file's own units. */
export interface KremserKnobValues {
  /** theoretical stages -- flowsheetDict `operation { stages ...; }` */
  stages: number;
  /** solvent (water) feed [kmol/h] -- 0/solvent `water` */
  solventFlow: number;
  /** solvent feed temperature [K] -- 0/solvent `T` */
  solventT: number;
  /** gas-feed NH3 flow [kmol/h] -- 0/gasFeed `NH3` */
  nh3Flow: number;
  /** gas-feed N2 (inert carrier) flow [kmol/h] -- 0/gasFeed `N2` */
  n2Flow: number;
  /** gas feed temperature [K] -- 0/gasFeed `T` */
  gasT: number;
}

/** The witness's own authored values (feed gas 10 NH3 / 90 N2 kmol/h,
 *  water 150 kmol/h, both feeds 298.15 K, 6 stages) -- the classroom opens
 *  ON the tutorial, and overriding with these leaves the dicts byte-identical
 *  (pinned by the test). */
export const KREMSER_KNOB_DEFAULTS: KremserKnobValues = {
  stages: 6, solventFlow: 150, solventT: 298.15,
  nh3Flow: 10, n2Flow: 90, gasT: 298.15,
};

/** knob -> dict-scalar map.  Every key was verified UNIQUE in its witness
 *  file (no `occurrence` needed anywhere): `stages` appears once in
 *  flowsheetDict (the header prose mentions "$stages" only mid-comment, which
 *  the line-anchored override regex cannot match), `water`/`T` once in
 *  0/solvent, `NH3`/`N2`/`T` once in 0/gasFeed.  applyScalarOverride THROWS
 *  on a missing or ambiguous key, and the test resolves each entry against
 *  the real bundled raw text so a witness edit that breaks a knob fails CI,
 *  not the classroom. */
export function kremserOverrides(k: KremserKnobValues): ScalarOverride[] {
  return [
    { file: "system/flowsheetDict", key: "stages",
      value: Math.max(1, Math.round(k.stages)) },
    { file: "0/solvent", key: "water", value: k.solventFlow },
    { file: "0/solvent", key: "T", value: k.solventT },
    { file: "0/gasFeed", key: "NH3", value: k.nh3Flow },
    { file: "0/gasFeed", key: "N2", value: k.n2Flow },
    { file: "0/gasFeed", key: "T", value: k.gasT },
  ];
}

const KNOB_FIELDS: {
  id: keyof KremserKnobValues; label: string;
  min: number; max: number; step: number; decimals: number;
}[] = [
  { id: "stages", label: "Stages N", min: 1, max: 30, step: 1, decimals: 0 },
  { id: "solventFlow", label: "Solvent water [kmol/h]", min: 1, max: 2000, step: 10, decimals: 1 },
  { id: "nh3Flow", label: "Gas feed NH3 [kmol/h]", min: 0.1, max: 500, step: 1, decimals: 1 },
  { id: "n2Flow", label: "Gas feed N2 [kmol/h]", min: 1, max: 2000, step: 10, decimals: 1 },
  { id: "gasT", label: "Gas feed T [K]", min: 274, max: 360, step: 1, decimals: 2 },
  { id: "solventT", label: "Solvent T [K]", min: 274, max: 360, step: 1, decimals: 2 },
];

// The knob panel's fold and width are the PANEL's (ui/methods/knobPanel.tsx),
// under the one key the preference registry owns.  This file used to carry its
// own read/write pair around localStorage -- one of four such copies, each with
// its own key.

// ---- The tool --------------------------------------------------------------

type Source = "classroom" | "current";

export function KremserTool(): JSX.Element {
  const runResult = useStore((s) => s.runResult);
  const currentUnits = useMemo(
    () => findKremserUnits(runResult?.kpis), [runResult]);

  const [source, setSource] = useState<Source>("classroom");
  const [knobs, setKnobs] = useState<KremserKnobValues>(KREMSER_KNOB_DEFAULTS);
  const [unitName, setUnitName] = useState<string>("");
  const [pane, setPane] = useState<"fan" | "profile">("fan");

  // The knob values ARE the override spec; the stable JSON is the change
  // signal useMethodRun debounces on.  Passing null in "Current run" mode
  // aborts/idles the standalone engine run.
  const overridesKey = JSON.stringify(knobs);
  const overrides = useMemo(() => kremserOverrides(knobs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overridesKey]);
  const classroom = useMethodRun(
    source === "classroom" ? KREMSER_WITNESS : null,
    overrides, overridesKey, "choupoSolve");

  const result = source === "current" ? runResult : classroom.result;
  const units = useMemo(() => findKremserUnits(result?.kpis), [result]);
  const active = units.find((u) => u.unit === unitName) ?? units[0];
  const profile = result?.profiles?.find((p) => p.unit === active?.unit);

  // The toggle appears when the app's current run has servable units -- and
  // stays while the user IS on "Current run", so a cleared run cannot strand
  // them there with no way back to the classroom.
  const showSourceToggle = currentUnits.length > 0 || source === "current";
  const busy = source === "classroom" && classroom.busy;

  const fallback = (
    <Group gap={8} p="md">
      <Loader size="sm" />
      <Text size="sm" c="dimmed">loading the plot…</Text>
    </Group>
  );

  /* The setup panel's content: source, unit, plot pane, the column knobs and
     the classroom provenance.  The result chips stay beside the plot. */
  const setup = (
    <>
      {showSourceToggle && (
        <SegmentedControl size="xs" value={source} fullWidth
          onChange={(v) => setSource(v as Source)}
          data={[
            { label: "Classroom", value: "classroom" },
            { label: "Current run", value: "current" },
          ]} />
      )}
      {active && units.length > 1 && (
        <KnobField label="absorber">
          <SegmentedControl size="xs" value={active.unit} fullWidth
            onChange={setUnitName}
            data={units.map((u) => ({ label: u.unit, value: u.unit }))} />
        </KnobField>
      )}
      <KnobField label="plot">
        <SegmentedControl size="xs" value={pane} fullWidth
          onChange={(v) => setPane(v as "fan" | "profile")}
          data={[
            { label: "Kremser fan", value: "fan" },
            { label: "Stage profile", value: "profile" },
          ]} />
      </KnobField>
      {source === "classroom" && (
        <>
          {KNOB_FIELDS.map((f) => (
            <KnobNumber key={f.id} label={f.label} value={knobs[f.id]}
              min={f.min} max={f.max} step={f.step} decimals={f.decimals}
              onChange={(v) => setKnobs({ ...knobs, [f.id]: v })} />
          ))}
          <PanelNote>
            Classroom mode: the engine runs in-browser on this tool&apos;s own
            witness, <code>tutorials/{KREMSER_WITNESS}</code>, cloned with the
            knob values above and solved by choupoSolve (WASM) — move a knob
            and the column is re-solved.
          </PanelNote>
        </>
      )}
    </>
  );

  // The pre-standalone empty state, kept verbatim -- but ONLY under
  // "Current run": the classroom never waits for a flowsheet.
  if (source === "current" && !active) {
    return (
      <MethodSetupRail title="column knobs" setup={setup}>
        <Box p="xl">
          <Text c="dimmed" size="sm" maw={560}>
            No absorber run to analyse. The Kremser construction reads a converged
            run of a <strong>stagewise absorber</strong> — its KPIs publish{" "}
            <code>stages</code> plus the per-solute absorption factor{" "}
            <code>A_&lt;component&gt;</code> (A = L/(K·V)). Run such a case — e.g.{" "}
            <code>tutorials/steady/absorption/absorber01_NH3_water</code> — then
            return here. (The stripper publishes <code>S_*</code> = K·V/L instead
            of <code>A_*</code>, so stripper runs do not feed this tool.) Or
            switch back to <strong>Classroom</strong>: the tool runs that very
            case itself, in the browser.
          </Text>
        </Box>
      </MethodSetupRail>
    );
  }

  return (
    <MethodSetupRail title="column knobs" setup={setup}>
      <Group gap={8} align="center" wrap="wrap" p="sm" pb={0}
        style={{ flexShrink: 0 }}>
        {active && (
          <Badge variant="light" color="gray" size="lg"
            styles={{ root: { textTransform: "none" } }}>
            {active.unit} · N = {active.stages} stages
          </Badge>
        )}
        {/* THE LESSON, as a labelled chip per solute: the engine's recovery
            vs the closed form at the case's own (A_i, N). */}
        {active?.components.map((c) => (
          <Tooltip key={c.name} withArrow multiline w={300}
            label={`|recovery_KPI − Kremser(A, N)| for ${c.name}: the closed form assumes ONE constant A = L/(K·V); the engine re-evaluates K on every stage, so the run leaves the curve.`}>
            <Badge variant="light" size="lg"
              color={c.deviation != null && c.deviation > 0.02 ? "orange" : "teal"}
              styles={{ root: { textTransform: "none", cursor: "help" } }}>
              {c.recovery != null && c.deviation != null
                ? `${c.name} · Δ = ${c.deviation.toFixed(4)}  (run ${c.recovery.toFixed(4)} vs Kremser ${kremserRecovery(c.A, active.stages).toFixed(4)})`
                : `${c.name} · A = ${c.A.toFixed(3)} (no recovery KPI)`}
            </Badge>
          </Tooltip>
        ))}
        {active?.nonIsothermal && (
          <Badge variant="light" color="yellow" size="lg"
            styles={{ root: { textTransform: "none" } }}>
            nonIsothermal = 1
            {active.dTrise != null ? ` · ΔT rise ${active.dTrise.toFixed(1)} K` : ""}
          </Badge>
        )}
      </Group>

      {source === "classroom" && classroom.err && (
        /* The engine's refusal/error, VERBATIM -- a refusal is a teaching
           surface, never to be paraphrased away. */
        <Alert color="red" variant="light" m="sm" mb={0} title="choupoSolve (WASM)">
          <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
            {classroom.err}
          </Text>
        </Alert>
      )}

      <Box pos="relative" style={{ flex: 1, minHeight: 0 }}>
        <LoadingOverlay visible={busy} zIndex={5}
          overlayProps={{ blur: 1 }}
          loaderProps={{ children: fallback }} />
        {active && pane === "fan" ? (
          <Suspense fallback={fallback}>
            <KremserFanPlot unit={active} />
          </Suspense>
        ) : active && profile ? (
          <Suspense fallback={fallback}>
            <StageProfilePlot profiles={[stageProfileForDisplay(profile)]} />
          </Suspense>
        ) : active ? (
          <Box p="xl">
            <Text c="dimmed" size="sm">
              This run published no per-stage profile for{" "}
              <strong>{active.unit}</strong> — the absorber emits one
              (stage, T_K, y_i, x_i) on every solve; re-run the case.
            </Text>
          </Box>
        ) : !classroom.err && !busy ? (
          <Box p="xl">
            <Text c="dimmed" size="sm" maw={560}>
              The classroom run finished without a servable absorber — the
              witness should always publish <code>stages</code> + <code>A_*</code>;
              check the engine log via the Run workspace.
            </Text>
          </Box>
        ) : null}
      </Box>

      {active && (
        <Text size="xs" c="dimmed" p="sm" pt={0} style={{ flexShrink: 0 }}>
          Kremser assumes ONE constant absorption factor A = L/(K·V) — straight
          operating and equilibrium lines. The engine re-computes K stage by
          stage, so the run&apos;s recovery leaves the closed-form curve; each chip
          measures that gap, |recovery_KPI − Kremser(A, N)|, at the case&apos;s own
          A_i (taken at the feed T).
          {active.nonIsothermal &&
            " This run is non-isothermal: the solvent heats as it absorbs (dT_rise), and that temperature rise drives the K variation."}
        </Text>
      )}
    </MethodSetupRail>
  );
}
