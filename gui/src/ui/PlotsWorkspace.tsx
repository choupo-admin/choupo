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
  PlotsWorkspace -- the Plots top-menu workspace (Fase B).

  Two-column layout, no canvas:

    left   ~240 px  Tree of plot types, grouped by domain.  Each leaf
                    is a clickable row; the active row is highlighted
                    and renders its plot on the right.  Unavailable
                    plots (e.g. no trajectory in a steady case) are
                    dimmed and disabled rather than hidden, so the
                    student knows the option exists and what runs
                    produce it.
    centre 1fr      The selected plot, full size.  Plotly components
                    are reused from gui/src/ui/plotting/ unchanged.

  Pre-run: an explanatory empty state, mirroring the Log workspace.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Box,
  Group,
  ScrollArea,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconExternalLink,
} from "@tabler/icons-react";

import { useStore } from "../state/store.js";
import { popOutCurrentPlot } from "./plotPopOut.js";
import { ConvergencePlot } from "./plotting/ConvergencePlot.js";
import { EnergyBalancePlot } from "./plotting/EnergyBalancePlot.js";
import { MassBalancePlot } from "./plotting/MassBalancePlot.js";
import { unitEnergy } from "../case/balances.js";
import { CampaignBalancePlot } from "./plotting/CampaignBalancePlot.js";
import { DynamicBalancePlot } from "./plotting/DynamicBalancePlot.js";
import { ProfilePlot } from "./plotting/ProfilePlot.js";
import { TrajectoryPlot } from "./plotting/TrajectoryPlot.js";
import { TxyPlot } from "./plotting/TxyPlot.js";
import { CsvAutoPlot, dropPointColumn } from "./plotting/CsvAutoPlot.js";
import { GanttPlot } from "./plotting/GanttPlot.js";

type PlotKey =
  | "trajectory"
  | "gantt"
  | "campaignBalance"
  | "dynamicBalance"
  | "massBalance"
  | "energyBalance"
  | "txy"
  | "profile"
  | "convergence"
  | "scanCsv";

interface PlotItem {
  key: PlotKey;
  label: string;
  available: boolean;
  hint?: string;
}

interface PlotGroup {
  label: string;
  items: PlotItem[];
}

export function PlotsWorkspace() {
  const result = useStore((s) => s.runResult);
  const prefs = useStore((s) => s.displayPrefs);
  const [view, setView] = useState<PlotKey>("profile");
  const [scanFile, setScanFile] = useState<string | null>(null);

  // Engine-written scan/sweep CSVs (outerDict sweeps, choupoProps scans...)
  // harvested from the run.  The reports/ CSVs have dedicated surfaces
  // (Streams, the .ods) and trajectory.csv its own plot -- exclude both.
  const scanCsvs = useMemo(() => {
    const all = result?.csvFiles ?? {};
    return Object.keys(all)
      .filter((n) => !n.startsWith("reports/") && n !== "trajectory.csv"
        && n !== "balanceTrajectory.csv" && n !== "balanceTrajectory.meta")
      .sort();
  }, [result]);

  // Build the navigator from what the current run produced.  Items
  // whose data is absent stay in the tree but are dimmed/disabled.
  const groups = useMemo<PlotGroup[]>(() => {
    const hasStreams = (result?.streams.length ?? 0) > 0;
    const hasTxy = Boolean(result?.txy);
    const hasProfile = (result?.profiles?.length ?? 0) > 0;
    const hasConvergence = (result?.convergence.length ?? 0) > 0;
    const hasTrajectory = Boolean(result?.trajectory);
    const hasTimeline = (result?.timeline?.length ?? 0) > 0;
    const hasCampaign = Boolean(result?.kpis?.["campaign"]);
    const hasDynBalance = Boolean(result?.csvFiles?.["balanceTrajectory.csv"]);
    return [
      {
        label: "Balance",
        items: [
          { key: "campaignBalance", label: "Campaign balance", available: hasCampaign,
            hint: "The batch campaign's global mass / element / energy balances, drawn from the engine's own ledger KPIs.  UNAVAILABLE states are shown honestly, never as zeros." },
          { key: "dynamicBalance", label: "Dynamic balance", available: hasDynBalance,
            hint: "The choupoCtrl balance ledger over time (mass inventory + conservation residuals per element), integrated on accepted steps in the engine.  Withheld claims render as named states." },
          { key: "massBalance",   label: "Mass balance",   available: hasStreams,
            hint: "Plant-boundary INPUTS vs OUTPUTS in mass basis (kg/h), stacked by component.  Title shows the closure error." },
          { key: "energyBalance", label: "Energy balance", available: hasStreams,
            hint: "Plant-boundary INPUTS vs OUTPUTS in enthalpy flow (kW), stacked per stream.  Closure delta = net heat from utilities + heat of reaction." },
          { key: "txy",           label: "T-x-y diagram",  available: hasTxy,
            hint: "Vapour-liquid envelope; emitted by VLE-related cases." },
        ],
      },
      {
        label: "Solver",
        items: [
          { key: "convergence", label: "Convergence", available: hasConvergence,
            hint: "Semilog of |residual| per unit's Newton/Wegstein iterations." },
        ],
      },
      {
        label: "Internal",
        items: [
          { key: "profile",    label: "Profile",    available: hasProfile,
            hint: "1-D internal state of a unit (PFR axial sweep, column stages, PSD)." },
          { key: "trajectory", label: "Trajectory", available: hasTrajectory,
            hint: "Time-series state; emitted only by choupoBatch / choupoCtrl runs." },
          { key: "gantt", label: "Campaign sequence", available: hasTimeline,
            hint: "The batch recipe as a Gantt: one lane per vessel, every FIRED action at its instant (transfers as arrows), unit status events flagged.  Hover a mark for the engine's detail line and the trigger that fired it." },
        ],
      },
      {
        label: "Outer driver",
        items: [
          { key: "scanCsv", label: "Sweep / scan", available: scanCsvs.length > 0,
            hint: "CSV written by the run itself -- an outerDict sweep (KPIs vs the swept parameter) or a props scan.  The same file runCase leaves in the case folder." },
        ],
      },
    ];
  }, [result, scanCsvs]);

  // After a run lands, jump to the most informative GENUINE plot available.
  // Balances now live in the Streams-workspace summary band, so they are no
  // longer the default landing view -- prefer an internal profile / VLE
  // envelope / convergence trace, and fall back to the balance bars only if
  // nothing more informative exists.
  useEffect(() => {
    if (!result) return;
    setScanFile(scanCsvs[0] ?? null);
    // One-shot hint from the focus-tab playground: a sweep run must land on
    // "Sweep / scan" even when the (last-pass) result also carries a profile
    // or a T-x-y envelope.  Consumed here; never set by parent-case surfaces.
    const hint = useStore.getState().plotsViewHint;
    if (hint === "scanCsv" && scanCsvs.length > 0) {
      useStore.getState().setPlotsViewHint(null);
      setView("scanCsv");
      return;
    }
    if (result.trajectory) setView("trajectory");
    else if ((result.profiles?.length ?? 0) > 0) setView("profile");
    else if (result.txy) setView("txy");
    else if (scanCsvs.length > 0) setView("scanCsv");
    else if (result.convergence.length > 0) setView("convergence");
    else setView("massBalance");
  }, [result, scanCsvs]);

  // Per-group collapse state.  All expanded by default; chevrons
  // are for focus, not for hiding options the student should know exist.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleGroup = (g: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });

  if (!result) {
    return (
      <Stack align="center" justify="center" h="100%" p="xl" gap="sm">
        <Text c="dimmed" size="xl" fw={600}>
          No run yet
        </Text>
        <Text c="dimmed" size="sm" ta="center" maw={440}>
          Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to execute the case.  Plots
          appear here once the solver produces compositions, convergence
          curves or a trajectory.
        </Text>
      </Stack>
    );
  }

  const activePlot = (() => {
    switch (view) {
      case "trajectory":  return result.trajectory  ? <TrajectoryPlot data={result.trajectory} /> : null;
      case "gantt":       return result.timeline
        ? <GanttPlot timeline={result.timeline} {...(result.kpis ? { kpis: result.kpis } : {})} /> : null;
      case "campaignBalance": {
        const c = result.kpis?.["campaign"];
        return c ? <CampaignBalancePlot campaign={c} /> : null;
      }
      case "dynamicBalance": {
        const traj = result.csvFiles?.["balanceTrajectory.csv"];
        const meta = result.csvFiles?.["balanceTrajectory.meta"];
        return traj !== undefined || meta !== undefined
          ? <DynamicBalancePlot {...(traj !== undefined ? { trajectoryCsv: traj } : {})}
              {...(meta !== undefined ? { metaCsv: meta } : {})} />
          : null;
      }
      case "massBalance": return (
        <MassBalancePlot
          streams={result.streams}
          componentMolarMass={result.componentMolarMass}
          flowUnit={prefs.flow}
        />
      );
      case "energyBalance": return <EnergyBalancePlot streams={result.streams}
        added={unitEnergy(result.utilityAllocation, result.kpis)} />;
      case "txy":         return result.txy         ? <TxyPlot txy={result.txy} /> : null;
      case "profile":     return result.profiles    ? <ProfilePlot profiles={result.profiles} /> : null;
      case "convergence": return <ConvergencePlot curves={result.convergence} />;
      case "scanCsv": {
        const file = scanFile && scanCsvs.includes(scanFile) ? scanFile : scanCsvs[0];
        const body = file ? result.csvFiles?.[file] : undefined;
        if (!file || !body) return null;
        return (
          <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
            {scanCsvs.length > 1 && (
              <Select
                size="xs"
                maw={360}
                data={scanCsvs}
                value={file}
                onChange={setScanFile}
                allowDeselect={false}
              />
            )}
            <Box style={{ flex: 1, minHeight: 0 }}>
              <CsvAutoPlot csv={dropPointColumn(body)} filename={file} />
            </Box>
          </Stack>
        );
      }
    }
  })();

  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        gridTemplateRows: "1fr",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Navigator */}
      <Box
        style={{
          borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
          overflow: "hidden",
          minHeight: 0,
          height: "100%",
        }}
      >
        <ScrollArea
          type="always"
          scrollbarSize={10}
          h="100%"
          styles={{ thumb: { background: "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))" } }}
        >
          <Stack gap={0} p="xs">
            <Text size="xs" c="dimmed" tt="uppercase" mb={6}
              style={{ letterSpacing: 0.5, fontWeight: 600 }}>
              Plot types
            </Text>
            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.label);
              return (
                <Stack key={g.label} gap={0} mb={2}>
                  <Group
                    gap={4}
                    wrap="nowrap"
                    style={{ cursor: "pointer", padding: "4px 4px 2px" }}
                    onClick={() => toggleGroup(g.label)}
                  >
                    <ActionIcon
                      variant="transparent"
                      size="xs"
                      c="dimmed"
                      onClick={(e) => { e.stopPropagation(); toggleGroup(g.label); }}
                    >
                      {isCollapsed
                        ? <IconChevronRight size={12} />
                        : <IconChevronDown size={12} />}
                    </ActionIcon>
                    <Text size="xs" fw={600} c="accent" tt="uppercase"
                      style={{ letterSpacing: 0.4 }}>
                      {g.label}
                    </Text>
                  </Group>
                  {!isCollapsed && g.items.map((it) => {
                    const isSelected = view === it.key && it.available;
                    return (
                      <Tooltip
                        key={it.key}
                        label={it.available ? (it.hint ?? "") : "Not produced by this run."}
                        openDelay={400}
                        position="right"
                        withArrow
                        multiline
                        w={260}
                        disabled={!it.hint && it.available}
                      >
                        <Group
                          gap={4}
                          wrap="nowrap"
                          style={{
                            cursor: it.available ? "pointer" : "not-allowed",
                            padding: "3px 6px 3px 22px",
                            opacity: it.available ? 1 : 0.4,
                            background: isSelected
                              ? "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))"
                            : undefined,
                            borderLeft: isSelected
                              ? "2px solid var(--mantine-color-accent-3)"
                            : "2px solid transparent",
                          }}
                          onClick={() => { if (it.available) setView(it.key); }}
                        >
                          <Text size="xs" c="var(--mantine-color-text)">
                            {it.label}
                          </Text>
                        </Group>
                      </Tooltip>
                    );
                  })}
                </Stack>
              );
            })}
          </Stack>
        </ScrollArea>
      </Box>

      {/* Plot area */}
      <Box
        style={{
          background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))",
          overflow: "hidden",
          minHeight: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header band with a pop-out button so the student can
            export the current plot as a PNG. */}
        <Group
          justify="space-between"
          wrap="nowrap"
          px="md"
          py={6}
          style={{
            flex: "0 0 auto",
            borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          }}
        >
          <Text size="sm" c="dimmed" tt="uppercase" fw={600}
            style={{ letterSpacing: 0.5 }}>
            {groups.flatMap((g) => g.items).find((it) => it.key === view)?.label ?? view}
          </Text>
          <Tooltip
            label="Open this plot as a high-resolution PNG in a separate browser tab"
            withArrow position="left" multiline w={280}
          >
            <ActionIcon size="sm" variant="subtle" color="cyan"
              onClick={() => { void popOutCurrentPlot(`${view}`); }}>
              <IconExternalLink size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Box style={{ flex: 1, minHeight: 0, padding: "8px 14px" }}>
          {activePlot}
        </Box>
      </Box>
    </Box>
  );
}
