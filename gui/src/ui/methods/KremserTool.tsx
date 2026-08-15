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

  The plotly bundle cannot load outside a browser ("self is not defined"), so
  both plot panes are React.lazy -- the module top level stays importable by
  the node test runner, which pins the closed form and the activation
  predicate (tests/kremserTool.test.ts).
\*---------------------------------------------------------------------------*/

import { Suspense, lazy, useMemo, useState, type ComponentProps } from "react";
import {
  Badge, Box, Group, Loader, SegmentedControl, Stack, Text, Tooltip,
} from "@mantine/core";

import type { RunResult, UnitProfile } from "../../adapters/SolverAdapter.js";
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

// ---- The tool --------------------------------------------------------------

export function KremserTool(): JSX.Element {
  const runResult = useStore((s) => s.runResult);
  const units = useMemo(() => findKremserUnits(runResult?.kpis), [runResult]);
  const [unitName, setUnitName] = useState<string>("");
  const [pane, setPane] = useState<"fan" | "profile">("fan");

  const active = units.find((u) => u.unit === unitName) ?? units[0];

  if (!active) {
    return (
      <Box p="xl">
        <Text c="dimmed" size="sm" maw={560}>
          No absorber run to analyse. The Kremser construction reads a converged
          run of a <strong>stagewise absorber</strong> — its KPIs publish{" "}
          <code>stages</code> plus the per-solute absorption factor{" "}
          <code>A_&lt;component&gt;</code> (A = L/(K·V)). Run such a case — e.g.{" "}
          <code>tutorials/steady/absorption/absorber01_NH3_water</code> — then
          return here. (The stripper publishes <code>S_*</code> = K·V/L instead
          of <code>A_*</code>, so stripper runs do not feed this tool.)
        </Text>
      </Box>
    );
  }

  const profile = runResult?.profiles?.find((p) => p.unit === active.unit);
  const fallback = (
    <Group gap={8} p="md">
      <Loader size="sm" />
      <Text size="sm" c="dimmed">loading the plot…</Text>
    </Group>
  );

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }} p="sm">
      <Group justify="space-between" align="center" wrap="wrap">
        <Group gap={8} align="center" wrap="wrap">
          {units.length > 1 && (
            <SegmentedControl size="xs" value={active.unit}
              onChange={setUnitName}
              data={units.map((u) => ({ label: u.unit, value: u.unit }))} />
          )}
          <Badge variant="light" color="gray" size="lg"
            styles={{ root: { textTransform: "none" } }}>
            {active.unit} · N = {active.stages} stages
          </Badge>
          {/* THE LESSON, as a labelled chip per solute: the engine's recovery
              vs the closed form at the case's own (A_i, N). */}
          {active.components.map((c) => (
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
          {active.nonIsothermal && (
            <Badge variant="light" color="yellow" size="lg"
              styles={{ root: { textTransform: "none" } }}>
              nonIsothermal = 1
              {active.dTrise != null ? ` · ΔT rise ${active.dTrise.toFixed(1)} K` : ""}
            </Badge>
          )}
        </Group>
        <SegmentedControl size="xs" value={pane}
          onChange={(v) => setPane(v as "fan" | "profile")}
          data={[
            { label: "Kremser fan", value: "fan" },
            { label: "Stage profile", value: "profile" },
          ]} />
      </Group>

      <Box style={{ flex: 1, minHeight: 0 }}>
        {pane === "fan" ? (
          <Suspense fallback={fallback}>
            <KremserFanPlot unit={active} />
          </Suspense>
        ) : profile ? (
          <Suspense fallback={fallback}>
            <StageProfilePlot profiles={[stageProfileForDisplay(profile)]} />
          </Suspense>
        ) : (
          <Box p="xl">
            <Text c="dimmed" size="sm">
              This run published no per-stage profile for{" "}
              <strong>{active.unit}</strong> — the absorber emits one
              (stage, T_K, y_i, x_i) on every solve; re-run the case.
            </Text>
          </Box>
        )}
      </Box>

      <Text size="xs" c="dimmed">
        Kremser assumes ONE constant absorption factor A = L/(K·V) — straight
        operating and equilibrium lines. The engine re-computes K stage by
        stage, so the run&apos;s recovery leaves the closed-form curve; each chip
        measures that gap, |recovery_KPI − Kremser(A, N)|, at the case&apos;s own
        A_i (taken at the feed T).
        {active.nonIsothermal &&
          " This run is non-isothermal: the solvent heats as it absorbs (dT_rise), and that temperature rise drives the K variation."}
      </Text>
    </Stack>
  );
}
