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
  RunSummaryStrip -- THE FLOWSHEET'S RUN, SAID WHERE THE READER LOOKS (DEV.md
  4c C168, slice 1).

  Replaces the post-run toast ("Run complete -- see Streams", gone in four
  seconds).  A persistent strip above the canvas, one line, every value the
  ENGINE's (case/runSummary.ts picks them; nothing is computed here but the
  display-unit conversion the stream table also applies):

    before a run   "Not run yet" -- and that the canvas shows the case's
                   DECLARED inputs and the SEEDS of 0/, not results
    running        "Running…"
    after a run    converged · recycle loops · mass closure · energy residual ·
                   advisories (and model boundaries) · the products' F, T, P,
                   with doors to Streams, Reports and the Log
    failed         that the drawn result is from an earlier run

  It is a STATUS REGION (role=status, aria-live=polite): the sentence that
  changes when a run ends is announced to a screen reader once, without
  stealing focus (WCAG 4.1.3).
\*---------------------------------------------------------------------------*/

import type { ReactNode } from "react";
import { Anchor, Badge, Box, Group, Text, Tooltip } from "@mantine/core";

import { runSummary, runSummarySentence, type RunSummary } from "../case/runSummary.js";
import type { RunResult } from "../adapters/SolverAdapter.js";
import { useStore, type WorkspaceKey } from "../state/store.js";
import {
  flowBasis, formatFlow, formatPressure, formatSig, formatTemperature, pressureLabel, temperatureLabel,
} from "../state/displayUnits.js";

function Item({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <Group gap={4} wrap="nowrap" title={title} style={{ flex: "0 0 auto" }}>
      <Text size="11px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.4 }}>{label}</Text>
      <Text size="xs" ff="monospace">{children}</Text>
    </Group>
  );
}

const NOT_PUBLISHED = <Text span size="xs" c="dimmed" fs="italic">not published</Text>;

function Door({ to, children }: { to: WorkspaceKey; children: ReactNode }) {
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  return (
    <Anchor component="button" type="button" size="xs" onClick={() => setActiveWorkspace(to)}>
      {children}
    </Anchor>
  );
}

function Products({ s }: { s: RunSummary }) {
  const prefs = useStore((st) => st.displayPrefs);
  if (s.products.length === 0) return <Item label="products">none</Item>;
  const mass = flowBasis(prefs.flow) === "mass";
  return (
    <Group gap={10} wrap="wrap" style={{ minWidth: 0 }}>
      <Text size="11px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.4 }}>products</Text>
      {s.products.map((p) => {
        //  The engine's own fields: F (kmol/s, overall) or F_mass (kg/s),
        //  converted to the display unit like every stream table.
        const F = mass ? p.F_mass : p.F;
        return (
          <Text key={p.name} size="xs" ff="monospace" data-run-product={p.name} style={{ whiteSpace: "nowrap" }}>
            <b>{p.name}</b>{" "}
            {F === undefined ? "—" : `${formatFlow(F, prefs.flow)} ${prefs.flow}`}
            {" · "}{formatTemperature(p.T, prefs.temperature)} {temperatureLabel(prefs.temperature)}
            {" · "}{formatPressure(p.P, prefs.pressure)} {pressureLabel(prefs.pressure)}
          </Text>
        );
      })}
    </Group>
  );
}

export function RunSummaryStrip() {
  const runResult: RunResult | null | undefined = useStore((s) => s.runResult);
  const runStatus = useStore((s) => s.runStatus);
  const s = runResult && runResult.status === "done" ? runSummary(runResult) : null;
  const phase = runStatus === "running" ? "running" : runStatus === "error" ? "error" : s ? "done" : "idle";
  const sentence = runSummarySentence(s, phase);

  return (
    <Box data-run-summary={phase} style={{
      flex: "0 0 auto", padding: "4px 16px",
      borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
      background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", minWidth: 0,
    }}>
      {/* The status region: the ONE sentence that changes when a run ends. */}
      <Text size="xs" fw={700} role="status" aria-live="polite" data-run-status=""
        style={{ flex: "0 0 auto" }}>
        {sentence}
      </Text>
      {phase === "idle" && (
        <Text size="xs" c="dimmed">
          The canvas shows the case's declared inputs and, on produced streams, the seeds of
          its <code>0/</code> files -- starting values, not results.  A phase is drawn only where
          the <code>0/</code> file declares one; "?" means the run resolves it.
        </Text>
      )}
      {phase === "error" && (
        <Text size="xs" c="dimmed">Anything drawn is from an earlier run. <Door to="log">Log</Door></Text>
      )}
      {s && phase === "done" && (
        <>
          <Item label="converged" title="The engine's own verdict (converged in the result).">
            {s.converged === null ? NOT_PUBLISHED
              : s.converged ? "yes"
              : <Badge size="xs" color="red" variant="filled">no</Badge>}
            {s.recycleLoops > 0 ? ` · ${s.recycleLoops} recycle loop${s.recycleLoops === 1 ? "" : "s"}` : ""}
          </Item>
          <Item label="mass" title={s.mass?.scope === "process"
            ? "The PROCESS closure the engine published: the declared utility circuits are set aside (the total closure is in Reports)."
            : "The plant-boundary mass closure the engine published."}>
            {s.mass === null ? NOT_PUBLISHED
              : s.mass.pct === null ? <Text span size="xs" c="dimmed" fs="italic">unavailable</Text>
              : `${formatSig(s.mass.pct, 6)} %${s.mass.scope === "process" ? " (process)" : ""}`}
          </Item>
          <Item label="energy" title="The plant-boundary first law the engine published: its residual, and its percentage of the energy exchanged where the engine has that scale.">
            {s.energy === null ? NOT_PUBLISHED
              : <>residual {formatSig(s.energy.residualKW, 4)} kW
                  {s.energy.pct === null ? " (no scale for a %)" : ` (${formatSig(s.energy.pct, 3)} %)`}</>}
          </Item>
          <Item label="advisories" title="What the engine raised that qualifies the answer -- grouped in the Log and on the Streams tab.">
            {s.advisories}
            {s.modelBoundaries.total > 0 ? ` · ${s.modelBoundaries.total} model boundar${s.modelBoundaries.total === 1 ? "y" : "ies"}`
              + (s.modelBoundaries.refused > 0 ? ` (${s.modelBoundaries.refused} refused)` : "") : ""}
          </Item>
          <Products s={s} />
          <Group gap={8} wrap="nowrap" style={{ flex: "0 0 auto" }}>
            <Tooltip label="The stream table, the balances and the advisories" withArrow>
              <span><Door to="streams">Streams</Door></span>
            </Tooltip>
            <Door to="reports">Reports</Door>
            <Door to="log">Log</Door>
          </Group>
        </>
      )}
    </Box>
  );
}
