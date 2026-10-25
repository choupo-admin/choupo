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
                    and renders its plot on the right.  A plot THIS case
                    could produce but didn't (element balance without the
                    reports block, T-x-y, profile) stays dimmed with a
                    tooltip saying how to obtain it; a view belonging to
                    ANOTHER regime or driver (batch/ctrl ledgers,
                    trajectory, campaign Gantt, sweeps) is hidden -- it is
                    not an option of the open case, so a dead row would
                    only be noise.
                    Below them, a UNITS tree (DEV.md 4c C156): every unit
                    the run carries -- under its sector on a sectored plant,
                    directly on a flat one -- with the plots the run
                    published FOR it (its profile, its convergence trace),
                    each opening the plot focused on that unit; a unit with
                    nothing published stays greyed.  The rule is
                    case/unitPlots.ts; this file only draws it.
    centre 1fr      The selected plot, full size.  Plotly components
                    are reused from gui/src/ui/plotting/ unchanged.

  Pre-run: an explanatory empty state, mirroring the Log workspace.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "@mantine/hooks";
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
  IconHelp,
} from "@tabler/icons-react";

import { useStore } from "../state/store.js";
import { popOutCurrentPlot } from "./plotPopOut.js";
import { ConvergencePlot } from "./plotting/ConvergencePlot.js";
import { EnergyBalancePlot } from "./plotting/EnergyBalancePlot.js";
import { FirstLawPlot } from "./plotting/FirstLawPlot.js";
import { MassBalancePlot } from "./plotting/MassBalancePlot.js";
import { CampaignBalancePlot } from "./plotting/CampaignBalancePlot.js";
import { DynamicBalancePlot } from "./plotting/DynamicBalancePlot.js";
import { ElementBalancePlot } from "./plotting/ElementBalancePlot.js";
import { MolarBalancePlot } from "./plotting/MolarBalancePlot.js";
import { ProfilePlot } from "./plotting/ProfilePlot.js";
import { TrajectoryPlot } from "./plotting/TrajectoryPlot.js";
import { TxyPlot } from "./plotting/TxyPlot.js";
import { CsvAutoPlot, dropPointColumn } from "./plotting/CsvAutoPlot.js";
import { GanttPlot } from "./plotting/GanttPlot.js";
import { hasCampaignSequence } from "../case/campaignLedger.js";
import {
  declaredMemberNames, unitPlotTree, unitSelection, UNIT_PLOT_LABEL,
  type UnitNode, type UnitPlotKey,
} from "../case/unitPlots.js";
import { parseUnitBanners } from "../case/unitBanner.js";
import { openGuide } from "../help/guideLinks.js";
import { selectedUnitIn, selectedUnitTypeIn, tabHelp } from "./tabChrome.js";

import { useMeasuredBoxWidth } from "./methods/methodsChrome.js";
import {
  PLOTS_NAV_PANEL, PanelCollapseButton, PanelReopenStrip, PanelResizeHandle,
  panelBoxProps, usePanel, usePanelShortcut,
} from "./panelContract.js";

type PlotKey =
  | "trajectory"
  | "gantt"
  | "campaignBalance"
  | "dynamicBalance"
  | "molarBalance"
  | "elementBalance"
  | "massBalance"
  | "energyBalance"
  | "firstLaw"
  | "txy"
  | "profile"
  | "convergence"
  | "scanCsv";

interface PlotItem {
  key: PlotKey;
  label: string;
  available: boolean;
  hint?: string;
  /** Regime/driver-gated views vanish when absent (they belong to another
   *  binary or an outerDict, not to choices inside this case); case-gated
   *  views stay dimmed with the hint saying how to produce them. */
  hideWhenUnavailable?: boolean;
}

interface PlotGroup {
  label: string;
  items: PlotItem[];
}

export function PlotsWorkspace() {
  /* The plot navigator is a PANEL CONTRACT rail (ui/panelContract.tsx): it was
   * a fixed 240 px grid column with no way to resize it and no way to fold it
   * away — the "algumas não têm" the owner reported. */
  const railHost = useMeasuredBoxWidth<HTMLDivElement>();
  const rail = usePanel(PLOTS_NAV_PANEL, { availablePx: railHost.width });
  usePanelShortcut(rail);
  const reduceMotion = useReducedMotion();
  const railBox = panelBoxProps(rail, !!reduceMotion);
  const result = useStore((s) => s.runResult);
  const flowsheet = useStore((s) => s.caseFiles.flowsheet);
  const prefs = useStore((s) => s.displayPrefs);
  const [view, setView] = useState<PlotKey>("profile");
  /** The unit a row of the UNITS tree selected, if any.  Kept beside `view` rather
   *  than folded into it: the plot KIND and the unit it is about are two
   *  facts, and a compound key would have to be split to use either. */
  const [viewUnit, setViewUnit] = useState<string | undefined>(undefined);
  const [scanFile, setScanFile] = useState<string | null>(null);

  // Engine-written scan/sweep CSVs (outerDict sweeps, choupoProps scans...)
  // harvested from the run.  The reports/ CSVs have dedicated surfaces
  // (Streams, the .ods) and trajectory.csv its own plot -- exclude both.
  const scanCsvs = useMemo(() => {
    const all = result?.csvFiles ?? {};
    return Object.keys(all)
      .filter((n) => !n.startsWith("reports/")
        && !n.startsWith("postProcessing/")   // flagship reports, not sweeps
        && n !== "trajectory.csv"
        && n !== "balanceTrajectory.csv" && n !== "balanceTrajectory.meta")
      .sort();
  }, [result]);

  //  THE PLANT'S OWN SHAPE: every unit the run carries, and what the run
  //  published for each (DEV.md 4c C156).
  //
  //  THE HIERARCHY IS READ, NEVER RECONSTRUCTED.  `unitSectors` is stamped by
  //  the engine at the flatten seam, where the parent chain is actually in
  //  hand.  Splitting `CONCENTRATION.Evap1` on its last dot would give the
  //  same answer for every case in the corpus today and be silently wrong for
  //  the first unit whose name carries a dot for another reason -- the name
  //  identity the F2 contract bans.
  //
  //  A UNIT THE ENGINE DID NOT STAMP IS LISTED DIRECTLY, under no sector:
  //  every unit of a flat case, and a sectored plant's own plant-level units.
  //  An invented "root" section would be a claim about a structure that does
  //  not exist.  case/unitPlots.ts holds the rule (which units, in which
  //  order, and why `kpis` is the test of "the result carries it").
  const unitTree = useMemo(() => unitPlotTree({
    ...(result?.unitSectors !== undefined ? { unitSectors: result.unitSectors } : {}),
    ...(result?.kpis !== undefined ? { kpis: result.kpis } : {}),
    ...(result?.profiles !== undefined ? { profiles: result.profiles } : {}),
    convergence: result?.convergence ?? [],
    declaredMembers: declaredMemberNames(flowsheet),
  }), [result, flowsheet]);

  //  A unit's TYPE, for its theory: the type the run's own banner printed for
  //  it (`>>> Unit [k]: <name> (type = <T>)`, read by case/unitBanner.ts, the
  //  one reader), else the flowsheet's own lookup -- the one the canvas's F1
  //  makes for a selected unit.
  const bannerTypes = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of parseUnitBanners(result?.log ?? ""))
      if (!m.has(b.qualifiedName)) m.set(b.qualifiedName, b.type);
    return m;
  }, [result]);
  const unitTypeOf = (unit: string): string | null =>
    bannerTypes.get(unit) ?? selectedUnitTypeIn(`unit:${unit}`, flowsheet);
  //  F1 / "?" on a unit opens its theory EXACTLY as the flowsheet does: the
  //  same destination function (tabChrome.tabHelp, context help resolved from
  //  the unit's type), never a second table.
  const openUnitTheory = (unit: string) => {
    openGuide(tabHelp({
      kind: "case", selectedUnitType: unitTypeOf(unit),
      selectedUnit: selectedUnitIn(`unit:${unit}`, flowsheet), activeWorkspace: null,
    }).url);
  };

  // Build the navigator from what the current run produced.  Items
  // whose data is absent stay in the tree but are dimmed/disabled.
  const groups = useMemo<PlotGroup[]>(() => {
    const hasStreams = (result?.streams.length ?? 0) > 0;
    const hasTxy = Boolean(result?.txy);
    const hasProfile = (result?.profiles?.length ?? 0) > 0;
    const hasConvergence = (result?.convergence.length ?? 0) > 0;
    const hasTrajectory = Boolean(result?.trajectory);
    //  THE CAMPAIGN VIEW IS AVAILABLE ON EITHER LEDGER, not only on a
    //  timeline (widened 2026-09-20).  The rule and the measurement behind
    //  it live in `campaignLedger.hasCampaignSequence` -- a pure function
    //  precisely because nothing here asserts a `useMemo`: written inline,
    //  narrowing it back to `hasTimeline` left the whole suite green.
    const campaignAvailable = hasCampaignSequence(result);
    const hasCampaign = Boolean(result?.kpis?.["campaign"]);
    // PRESENCE of either artefact, never truthiness of the body: an
    // init-time refusal can leave an empty CSV while the .meta is exactly
    // the artefact carrying the reason the view exists to show.
    const hasDynBalance =
      result?.csvFiles?.["balanceTrajectory.csv"] !== undefined
      || result?.csvFiles?.["balanceTrajectory.meta"] !== undefined;
    const hasElemBalance = Object.keys(result?.csvFiles ?? {}).some(
      (k) => k.endsWith("elementBalance.csv") || k.endsWith("elementBalance.meta"));
    //  PRESENCE of the engine's own ledger, never of streams: the first-law
    //  view draws that block and nothing else, so a run without it has no
    //  figure to offer -- and the row stays DIMMED with the hint rather than
    //  vanishing, because "the report did not run" is a fact about this run.
    const hasEnergyLedger = result?.globalEnergyBoundary !== undefined;
    return [
      {
        label: "Balance",
        items: [
          { key: "campaignBalance", label: "Global balances", available: hasCampaign,
            hideWhenUnavailable: true,
            hint: "The batch campaign's GLOBAL mass / element / energy balances, drawn from the engine's own ledger KPIs.  Molar totals are informative (moles are not conserved through reactions); UNAVAILABLE states are shown honestly, never as zeros." },
          { key: "dynamicBalance", label: "Global balances", available: hasDynBalance,
            hideWhenUnavailable: true,
            hint: "The choupoCtrl / choupoSemiContinuous GLOBAL balance ledger over time (mass inventory + conservation residuals per element), integrated on accepted steps in the engine.  Withheld claims render as named states." },
          { key: "elementBalance", label: "Element balance", available: hasElemBalance,
            hint: "Atom conservation at the plant boundary (kmol-atom/h): total atoms in vs out, sealed only when every element closes.  By-element detail inside.  A default diagnostic of every converged steady run (opt out with elementBalance { enabled false; } in controlDict.reports)." },
          { key: "massBalance",   label: "Mass balance",   available: hasStreams,
            hint: "Plant-boundary INPUTS vs OUTPUTS in mass basis (kg/h), stacked by component.  Title shows the closure error." },
          { key: "energyBalance", label: "Energy balance", available: hasStreams,
            hint: "Plant-boundary INPUTS vs OUTPUTS in enthalpy flow (kW), stacked per stream: what each stream CARRIES.  For whether the first law holds, and by how much it fails, see First law." },
          //  A SECOND VIEW, not a replacement (2026-09-12).  The row above is
          //  the boundary's stream INVENTORY; this one is the BALANCE -- the
          //  equation dH = Q - W drawn so the identity, and its violation, are
          //  read off the picture.  Different questions, both kept.
          { key: "firstLaw", label: "First law", available: hasEnergyLedger,
            hint: "The first law as the equation a student writes: dH = Q - W.  Left column the enthalpy the streams gained, right column the heat and shaft work that crossed the boundary; the two levels must coincide and the gap between them IS the engine's published residual." },
        ],
      },
      {
        label: "Phase equilibrium",
        items: [
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
          { key: "molarBalance", label: "Species molar flows", available: hasStreams,
            hint: "Diagnostic: total species kmol/h in vs out.  Species moles change legally through reactions -- see Element balance for the conserved quantity." },
          { key: "profile",    label: "Profile",    available: hasProfile,
            hint: "1-D internal state of a unit (PFR axial sweep, column stages, PSD)." },
          { key: "trajectory", label: "Trajectory", available: hasTrajectory,
            hideWhenUnavailable: true,
            hint: "Time-series state; emitted only by choupoBatch / choupoCtrl / choupoSemiContinuous runs." },
          { key: "gantt", label: "Campaign sequence", available: campaignAvailable,
            hideWhenUnavailable: true,
            hint: "The batch campaign as a Gantt: one lane per vessel, every FIRED action at its instant (transfers as arrows), unit status events flagged, and beneath each vessel that has one an ENERGY band -- the engine's energy ledger, coloured by kind, height against a scale the legend prints, up = heat added.  An UNPRICEABLE record is hatched at full height: unknown is not zero.  Hover for what moved, what it carried and the basis; the ledger tables pop out in full." },
        ],
      },
      {
        label: "Outer driver",
        items: [
          { key: "scanCsv", label: "Sweep / scan", available: scanCsvs.length > 0,
            hideWhenUnavailable: true,
            hint: "CSV written by the run itself -- an outerDict sweep (KPIs vs the swept parameter) or a props scan.  The same file runCase leaves in the case folder." },
        ],
      },
      //  Everything above is a PLANT-WIDE view.  The plant's own shape --
      //  its units, and under a sectored plant its sectors -- is the UNITS
      //  tree drawn below these groups (`unitTree`).
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
    //  A NEW RUN CLEARS THE UNIT FOCUS.  The previous run's unit may not
    //  exist in this one (the case can have changed between runs), and a
    //  heading naming a unit the result does not carry is worse than none.
    setViewUnit(undefined);
    if (hint === "scanCsv" && scanCsvs.length > 0) {
      useStore.getState().setPlotsViewHint(null);
      setView("scanCsv");
      return;
    }
    // GLOBAL balances are the landing surface for a batch / ctrl run --
    // the trajectory stays one click away (Vitor 2026-07-19: the balances
    // were real but hidden behind the trajectory).
    if (result.kpis?.["campaign"]) setView("campaignBalance");
    else if (result.csvFiles?.["balanceTrajectory.csv"] !== undefined
             || result.csvFiles?.["balanceTrajectory.meta"] !== undefined)
      setView("dynamicBalance");
    else if (result.trajectory) setView("trajectory");
    else if (Object.keys(result.csvFiles ?? {}).some(
               (k) => k.endsWith("elementBalance.csv")
                   || k.endsWith("elementBalance.meta")))
      setView("elementBalance");
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

  const hasUnitTree = unitTree.length > 0;
  const selectUnit = (node: UnitNode, key?: UnitPlotKey) => {
    const sel = unitSelection(node, key);
    if (!sel) return;
    setView(sel.view);
    setViewUnit(sel.unit);
  };
  const rowSelected = {
    background: "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))",
    borderLeft: "2px solid var(--mantine-color-accent-3)",
  };
  //  ONE unit of the tree: its row (chevron, name, theory "?") and, beneath,
  //  the plots the run published for it.  A render function rather than a
  //  component, so a re-render does not remount the rows.
  const renderUnit = (node: UnitNode, depth: number) => {
    const k = `unit:${node.unit}`;
    const empty = node.plots.length === 0;
    const isCollapsed = collapsed.has(k);
    const focused = viewUnit === node.unit;
    const type = unitTypeOf(node.unit);
    const pad = 4 + depth * 14;
    return (
      <Stack key={k} gap={0}>
        <Tooltip
          label={empty
            ? `The run published no profile and no convergence trace for ${node.unit}.  A profile comes from a unit with an internal coordinate (a pfr along its length, a column across its stages); a convergence trace from a unit that iterates its own solve.  Its KPIs are on the flowsheet's selection card.`
            : `${node.unit}${type ? ` (${type})` : ""}: the plots the run published for this unit.  Press F1 or "?" for its theory.`}
          openDelay={400} position="right" withArrow multiline w={260}
        >
          <Group
            gap={4}
            wrap="nowrap"
            tabIndex={0}
            data-unit-row={node.unit}
            data-unit-empty={empty ? "" : undefined}
            style={{
              cursor: empty ? "default" : "pointer",
              padding: `3px 4px 3px ${pad}px`,
              borderLeft: "2px solid transparent",
              ...(focused && empty === false ? { borderLeft: rowSelected.borderLeft } : {}),
            }}
            onClick={() => {
              if (empty) return;
              if (isCollapsed) toggleGroup(k);
              selectUnit(node);
            }}
            onKeyDown={(e) => {
              //  F1 here is the unit's theory, and the shell's own F1 (the
              //  workspace's help) must not ALSO fire: one key, one answer.
              if (e.key === "F1") {
                e.preventDefault();
                e.stopPropagation();
                openUnitTheory(node.unit);
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectUnit(node);
              }
            }}
          >
            {empty
              ? <Box w={18} style={{ flex: "0 0 auto" }} />
              : (
                <ActionIcon variant="transparent" size="xs" c="dimmed"
                  aria-label={isCollapsed ? `Expand ${node.label}` : `Collapse ${node.label}`}
                  onClick={(e) => { e.stopPropagation(); toggleGroup(k); }}>
                  {isCollapsed
                    ? <IconChevronRight size={12} />
                    : <IconChevronDown size={12} />}
                </ActionIcon>
              )}
            {/* WRAPS rather than truncates: "nothing published" is the fact
                the greyed row exists to state, and a narrow rail cut it. */}
            <Text size="xs" fw={500}
              c={empty ? "dimmed" : "var(--mantine-color-text)"}
              style={{ flex: 1, minWidth: 0, opacity: empty ? 0.7 : 1, overflowWrap: "anywhere" }}>
              {node.label}
              {empty && (
                <Text span size="xs" c="dimmed" fs="italic"> · nothing published</Text>
              )}
            </Text>
            <Tooltip label={`Theory of ${node.unit}${type ? ` (${type})` : ""}  ·  F1`}
              openDelay={300} withArrow position="right">
              <ActionIcon variant="subtle" size="xs" c="dimmed"
                aria-label={`Theory of ${node.unit}`}
                data-unit-theory={node.unit}
                onClick={(e) => { e.stopPropagation(); openUnitTheory(node.unit); }}>
                <IconHelp size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Tooltip>
        {!empty && !isCollapsed && node.plots.map((leaf) => {
          const isSelected = focused && view === leaf.key;
          return (
            <Group
              key={leaf.key}
              gap={4}
              wrap="nowrap"
              data-unit-plot={`${node.unit}:${leaf.key}`}
              style={{
                cursor: "pointer",
                padding: `3px 6px 3px ${pad + 22}px`,
                background: isSelected ? rowSelected.background : undefined,
                borderLeft: isSelected ? rowSelected.borderLeft : "2px solid transparent",
              }}
              onClick={() => selectUnit(node, leaf.key)}
            >
              <Text size="xs" c="var(--mantine-color-text)">{leaf.label}</Text>
            </Group>
          );
        })}
      </Stack>
    );
  };

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
      //  DRAWN FROM WHATEVER THE RUN PUBLISHED.  A case with an energy
      //  ledger and no recipe has no timeline, and its lanes come from the
      //  KPI units -- so the timeline argument degrades to [] rather than
      //  gating the whole view.
      case "gantt":       return (result.timeline || result.transfers
                                  || result.energyLedger)
        ? <GanttPlot timeline={result.timeline ?? []}
            {...(result.kpis ? { kpis: result.kpis } : {})}
            {...(result.transfers ? { transfers: result.transfers } : {})}
            {...(result.energyLedger
                  ? { energyLedger: result.energyLedger } : {})} /> : null;
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
      case "molarBalance": return (
        <MolarBalancePlot
          streams={result.streams}
          {...(result.componentMolarMass !== undefined
            ? { componentMolarMass: result.componentMolarMass } : {})}
          flowUnit={prefs.flow}
        />
      );
      case "elementBalance": {
        const files = result.csvFiles ?? {};
        const csvKey = Object.keys(files).find(
          (k) => k.endsWith("elementBalance.csv"));
        const metaKey = Object.keys(files).find(
          (k) => k.endsWith("elementBalance.meta"));
        return (
          <ElementBalancePlot
            {...(csvKey !== undefined ? { csv: files[csvKey] } : {})}
            {...(metaKey !== undefined ? { meta: files[metaKey] } : {})}
          />
        );
      }
      case "massBalance": return (
        <MassBalancePlot
          streams={result.streams}
          componentMolarMass={result.componentMolarMass}
          flowUnit={prefs.flow}
        />
      );
      //  The boundary heat+work bar is the ENGINE's Q_boundary (its energy
      //  report's ledger), never a sum of utility-allocated duties -- that sum
      //  missed every cooling duty no utility served (2026-09-05).
      //  Draws the engine's ledger and computes nothing of its own; when the
      //  block is absent the plot SAYS the report did not run.
      case "firstLaw": return <FirstLawPlot boundary={result.globalEnergyBoundary} />;
      case "energyBalance": return <EnergyBalancePlot streams={result.streams}
        added={result.globalEnergyBoundary
          ? { qBoundaryKw: result.globalEnergyBoundary.Q_boundary_kW }
          : undefined} />;
      case "txy":         return result.txy         ? <TxyPlot txy={result.txy} /> : null;
      case "profile":     return result.profiles
        ? <ProfilePlot profiles={result.profiles}
            {...(viewUnit !== undefined ? { unit: viewUnit } : {})} />
        : null;
      case "convergence": return <ConvergencePlot curves={result.convergence}
        {...(viewUnit !== undefined ? { unit: viewUnit } : {})} />;
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
      ref={railHost.ref}
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
      }}
    >
      {rail.collapsed && <PanelReopenStrip panel={rail} scent="PLOTS" />}
      {/* Navigator */}
      <Box
        data-panel={railBox["data-panel"]}
        style={{
          ...railBox.style,
          borderRight: rail.collapsed
            ? "none"
            : "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
        }}
      >
        <ScrollArea
          type="always"
          scrollbarSize={10}
          h="100%"
          styles={{ thumb: { background: "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))" } }}
        >
          <Stack gap={0} p="xs">
            <Group justify="space-between" align="center" wrap="nowrap" gap={4} mb={6}>
              <Text size="xs" c="dimmed" tt="uppercase"
                style={{ letterSpacing: 0.5, fontWeight: 600 }}>
                Plot types
              </Text>
              <PanelCollapseButton panel={rail} />
            </Group>
            {groups
              .map((g) => ({ ...g, items: g.items.filter(
                (it) => it.available || !it.hideWhenUnavailable) }))
              .filter((g) => g.items.length > 0)
              .map((g) => {
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
                    const isSelected = view === it.key && it.available
                      && viewUnit === undefined;
                    return (
                      <Tooltip
                        key={it.key}
                        label={it.available
                          ? (it.hint ?? "")
                          : `Not produced by this run.  ${it.hint ?? ""}`}
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
                          onClick={() => {
                            if (!it.available) return;
                            setView(it.key);
                            //  A plant-wide row CLEARS the unit focus; a
                            //  row of the units tree sets it.  Leaving a stale
                            //  unit behind would draw the last unit's curve
                            //  under a plant-wide heading.
                            setViewUnit(undefined);
                          }}
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
            {hasUnitTree && (
              <Stack gap={0} mt={10} data-units-tree="">
                <Text size="xs" c="dimmed" tt="uppercase" mb={6}
                  style={{ letterSpacing: 0.5, fontWeight: 600, padding: "0 4px" }}>
                  Units
                </Text>
                {unitTree.map((entry) => {
                  if (entry.kind === "unit") return renderUnit(entry.node, 0);
                  const g = entry.group;
                  const k = `sector:${g.sector}`;
                  const isCollapsed = collapsed.has(k);
                  return (
                    <Stack key={k} gap={0} mb={2}>
                      <Group gap={4} wrap="nowrap"
                        style={{ cursor: "pointer", padding: "4px 4px 2px" }}
                        onClick={() => toggleGroup(k)}>
                        <ActionIcon variant="transparent" size="xs" c="dimmed"
                          aria-label={isCollapsed ? `Expand ${g.sector}` : `Collapse ${g.sector}`}
                          onClick={(e) => { e.stopPropagation(); toggleGroup(k); }}>
                          {isCollapsed
                            ? <IconChevronRight size={12} />
                            : <IconChevronDown size={12} />}
                        </ActionIcon>
                        <Text size="xs" fw={600} c="accent" tt="uppercase"
                          style={{ letterSpacing: 0.4 }}>
                          {g.sector}
                        </Text>
                      </Group>
                      {!isCollapsed && g.units.map((n) => renderUnit(n, 1))}
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </ScrollArea>
      </Box>

      <PanelResizeHandle panel={rail} />

      {/* Plot area */}
      <Box
        style={{
          flex: 1,
          minWidth: 0,
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
            {viewUnit !== undefined
              ? `${viewUnit} · ${(UNIT_PLOT_LABEL as Record<string, string>)[view] ?? view}`
              : (groups.flatMap((g) => g.items)
                  .find((it) => it.key === view)?.label
                  ?? view)}
          </Text>
          <Tooltip
            label="Open this plot as a high-resolution PNG in a separate browser tab"
            withArrow position="left" multiline w={280}
          >
            <ActionIcon size="sm" variant="subtle" color="cyan"
              onClick={() => {
                void popOutCurrentPlot(
                  viewUnit ? `${view}-${viewUnit}` : `${view}`);
              }}>
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
