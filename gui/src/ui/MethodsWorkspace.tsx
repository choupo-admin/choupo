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
  MethodsWorkspace — the body of EDUTOOLS, the classical METHOD CONSTRUCTIONS
  plane (ratified 2026-08-15; renamed and re-chromed 2026-08-16 on Vítor's
  order).  The file name and the `?workspace=methods` URL key are UNCHANGED —
  a deep link already in a student's notes is a contract, and a caption is not
  a reason to break one.

  The criterion that splits this plane from the Property Explorer:
      method-construction → EduTools;  property-surface → Explorer.
  A property surface answers "what does this system's property look like?"
  (T-x-y, γ(x), a Psat scan — the Explorer).  A method construction answers
  "what does the CLASSICAL GRAPHICAL METHOD say about a design question?"
  (operating lines + staircase, process paths on a state chart — here).

  Inherits the Explorer's guard-rails unchanged (gui-credo §3 + §9):
  ephemeral, on-demand (Esc closes via the AppShell), and above all ZERO
  physics in TS — every curve is an engine (WASM choupoProps) run over a
  transient synthesized case, or an engine-written CSV.  The construction
  drawn ON the engine's curve (staircase walking, tie-lines) is pure geometry
  in the shared plotting kit.  The "Author → copy propsDict" hand-off stays:
  dict-on-disk remains the one authoring channel.

  THE TOOL LIST IS NOT IN THIS FILE ANY MORE (2026-08-16, Vítor's order,
  OVERRULING the rail design).  It was a permanent 252px left band, and an
  absolutely-positioned tool panel painted straight over it — the cooling
  tower did, and with the rail covered there was nothing left to select with.
  The overlap is a bug and was fixed on its own; the RAIL is a separate
  judgement, and the ruling is that a chooser does not get to own a permanent
  band.  A classic top-bar DROPDOWN replaces it: zero pixels when shut, which
  is the only width a chooser is entitled to, and nothing can be painted over
  because there is nothing there.

  The registry and the selection live in methods/registry.ts (one home, two
  readers: this body and MenuBar's dropdown); the tool now gets the FULL width
  of the workspace.  The narrow-viewport bottom sheet went with the rail: a
  dropdown is already the touch-native chooser, and a second list below `sm`
  would be a second home for the same registry.

  What stays: the one-line "teaches" caption + the Theory Guide link
  (TeachesLine, above every tool), and the in-file tools' setup-bar fold to a
  slim restore strip (choupo.methods.controlsCollapsed) — on a projector every
  freed pixel goes to the construction.  Alerts fold to a counted pill, never
  silently.  The McCabe R/q controls pane is INSIDE the shared
  plotting/McCabePlot.tsx and is not reachable from this host.
\*---------------------------------------------------------------------------*/

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon, Alert, Badge, Box, Button, Code, Collapse, CopyButton,
  Group, Loader, NumberInput, Select, Stack, Text, Tooltip,
} from "@mantine/core";
import {
  IconBook, IconChevronDown, IconChevronUp, IconExternalLink,
} from "@tabler/icons-react";

import { resolveAdapter } from "../adapters/index.js";
import {
  EXPLORE_OUTPUT, synthesizeExploreCase, type ExploreSpec,
} from "../case/exploreSynth.js";
import {
  caseComponentFiles, mergeCatalogue, metaByName, type ComponentMeta,
} from "../case/catalogue.js";
import {
  binaryVleSpec, orderBinaryByVolatility, psychroSpec, type LocalUnifac,
} from "../case/methodFeeds.js";
import { buildLocalUnifac, hasUnifacGroups } from "../case/unifacGroups.js";
import { hasPair } from "../case/pairsCatalogue.js";
import { fromJson, serialize } from "../dict/index.js";
import { dropCsvColumn } from "./plotting/csvShape.js";
import { McCabePlot } from "./plotting/McCabePlot.js";
import { PsychroPlot } from "./plotting/PsychroPlot.js";
import { popOutExploreMccabe } from "./explore/exploreMccabePopOut.js";
import {
  CONTROLS_COLLAPSED_KEY, setupBarLayout, useCoarsePointer, useCollapsedFlag,
  useFitsOneRow, useNarrowViewport, usePlotRefit,
} from "./methods/methodsChrome.js";
import {
  METHOD_TOOLS, theoryUrl, useActiveMethodTool, type MethodTool,
} from "./methods/registry.js";
import { useStore } from "../state/store.js";
import {
  kToDisplay, paToDisplay, parsePressure, parseTemperature,
  pressureLabel, temperatureLabel,
} from "../state/displayUnits.js";

// The three run-fed tools are lazy: BreakthroughTool reaches the plotly seam
// at module scope (plotly.js-basic-dist-min cannot load under node), and
// deferring all three keeps this module importable by the vitest node
// environment and the initial bundle unchanged until a tool is opened.
const KremserTool = lazy(() =>
  import("./methods/KremserTool.js").then((m) => ({ default: m.KremserTool })));
const EpsilonNtuTool = lazy(() =>
  import("./methods/EpsilonNtuTool.js").then((m) => ({ default: m.EpsilonNtuTool })));
const BreakthroughTool = lazy(() =>
  import("./methods/BreakthroughTool.js").then((m) => ({ default: m.BreakthroughTool })));
const PinchCompositeTool = lazy(() =>
  import("./methods/PinchCompositeTool.js").then((m) => ({ default: m.PinchCompositeTool })));
const PumpSystemTool = lazy(() =>
  import("./methods/PumpSystemTool.js").then((m) => ({ default: m.PumpSystemTool })));
const MerkelTool = lazy(() =>
  import("./methods/MerkelTool.js").then((m) => ({ default: m.MerkelTool })));
const RayleighTool = lazy(() =>
  import("./methods/RayleighTool.js").then((m) => ({ default: m.RayleighTool })));
const LevenspielTool = lazy(() =>
  import("./methods/LevenspielTool.js").then((m) => ({ default: m.LevenspielTool })));
const VanHeerdenTool = lazy(() =>
  import("./methods/VanHeerdenTool.js").then((m) => ({ default: m.VanHeerdenTool })));
const DryingCurveTool = lazy(() =>
  import("./methods/DryingCurveTool.js").then((m) => ({ default: m.DryingCurveTool })));

// ---- The engine runner ------------------------------------------------------
// The SAME feeding machinery the Explorer uses (resolveAdapter("wasm") over a
// synthesized transient choupoProps case), reduced to the single-run shape the
// method tools need.  Debounced; a newer spec aborts the in-flight run.
function useEngineCsv(spec: ExploreSpec | null): {
  csv: string | null; err: string | null; busy: boolean; advisories: string[];
} {
  const [csv, setCsv] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advisories, setAdvisories] = useState<string[]>([]);
  const runSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!spec) {
      abortRef.current?.abort();
      setCsv(null); setErr(null); setAdvisories([]); setBusy(false);
      return;
    }
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const seq = ++runSeq.current;
      setBusy(true); setErr(null);
      void (async () => {
        try {
          const resolved = await resolveAdapter("wasm");
          if (seq !== runSeq.current) return;
          if (resolved.kind === "unavailable") {
            setErr(resolved.fallbackReason
              ?? "The real solver could not be loaded (build the WASM).");
            setBusy(false);
            return;
          }
          const result = await resolved.adapter.run(
            synthesizeExploreCase(spec), () => {}, ctrl.signal, "choupoProps");
          if (seq !== runSeq.current) return;
          const out = result.csvFiles?.[EXPLORE_OUTPUT];
          // Honesty: the tools show no log tab — lift the engine's advisory
          // lines off the run log so they are SEEN, never swallowed.
          setAdvisories(
            (result.log.match(/^\s*\[advisory\].*$/gm) ?? []).map((s) => s.trim()));
          if (out) { setCsv(out); setErr(null); }
          else {
            const detail = result.log.split("\n").map((l) => l.trim()).reverse()
              .find((l) => /(?:error|fatal|refused|failed)/i.test(l));
            setErr(result.status !== "done"
              ? `choupoProps did not finish${detail ? `: ${detail}` : "."}`
              : "No data — the engine returned an empty result for this construction.");
          }
        } catch (e) {
          if (seq === runSeq.current && !ctrl.signal.aborted)
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
          if (seq === runSeq.current) setBusy(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [spec]);
  return { csv, err, busy, advisories };
}

// ---- Workspace shell --------------------------------------------------------

export function MethodsWorkspace() {
  // The active tool lives in methods/registry.ts, not here: the chooser is now
  // the top bar's EduTools dropdown (MenuBar), which is a SIBLING of this
  // component, not a child.  One selection, two readers.
  const tool = useActiveMethodTool();

  // Case-local components reach the runs exactly as in the Explorer: merged
  // into the name-lookup catalogue, and their .dat bodies shipped to MEMFS.
  const caseRaw = useStore((s) => s.caseFiles.rawFiles);
  const catalogue = useMemo(() => mergeCatalogue(caseRaw), [caseRaw]);
  const localUnifac = useMemo(() => buildLocalUnifac(caseRaw), [caseRaw]);
  const componentFiles = useMemo(() => caseComponentFiles(caseRaw), [caseRaw]);

  const active = METHOD_TOOLS.find((m) => m.id === tool) ?? METHOD_TOOLS[0]!;

  return (
    // The active tool gets the WHOLE workspace: with the chooser in the menu
    // bar there is nothing beside it to reserve width for.  One column, no
    // rail, no reopen strip.
    <Box style={{ position: "absolute", inset: 0, display: "flex",
      flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      {tool === "mccabe" ? (
        <McCabeTool tool={active} catalogue={catalogue}
          localUnifac={localUnifac} componentFiles={componentFiles} />
      ) : tool === "psychro" ? (
        <PsychroTool tool={active} catalogue={catalogue}
          componentFiles={componentFiles} />
      ) : (
        // The run-fed tools take no props, so the pedagogy line (teaches +
        // the Theory Guide link) is rendered HERE, once for all of them —
        // every tool states its theory destination or it is not finished.
        <>
          <TeachesLine tool={active} />
          {/* A bounded full-height flex column for the run-fed tools: they
              manage their own internal panels, and this container keeps them
              inside the workspace whatever the viewport does — never reached
              into, only sized. */}
          <Box style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex",
            flexDirection: "column", overflow: "hidden" }}>
            <Suspense fallback={
              <Group justify="center" mt="xl"><Loader size="sm" /></Group>
            }>
              {tool === "kremser" ? <KremserTool />
                : tool === "entu" ? <EpsilonNtuTool />
                : tool === "pinch-composite" ? <PinchCompositeTool />
                : tool === "pump-system" ? <PumpSystemTool />
                : tool === "merkel" ? <MerkelTool />
                : tool === "rayleigh" ? <RayleighTool />
                : tool === "levenspiel" ? <LevenspielTool />
                : tool === "vanheerden" ? <VanHeerdenTool />
                : tool === "drying" ? <DryingCurveTool />
                : <BreakthroughTool />}
            </Suspense>
          </Box>
        </>
      )}
    </Box>
  );
}

// ---- Shared panel chrome ----------------------------------------------------

function ToolField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap={4} wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
      <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{label}</Text>
      {children}
    </Group>
  );
}

/** The toolbar's fold affordance — rightmost slot of the setup bar.  One
 *  Mantine size step up under a coarse pointer (touch target). */
function SetupCollapseButton({ onCollapse }: { onCollapse: () => void }) {
  const coarse = useCoarsePointer();
  return (
    <Tooltip label="Hide the setup bar — the diagram takes the freed rows" withArrow>
      <ActionIcon variant="subtle" size={coarse ? "lg" : "md"} color="gray"
        aria-label="hide setup controls" onClick={onCollapse}>
        <IconChevronUp size={coarse ? 18 : 16} />
      </ActionIcon>
    </Tooltip>
  );
}

/** The slim strip a folded setup bar leaves behind (lecture mode): the
 *  committed setup stays SEEN (the Explorer's value-stays-visible rule), and
 *  alerts fold to a counted `⚠ N` pill rather than vanishing — the honesty
 *  credo allows folded, never silent.  The WHOLE strip is the click target
 *  (Fitts edge strip); keyboard: tabbable, Enter / Space restore. */
function SetupCollapsedStrip({ summary, busy, alertCount, onExpand }: {
  summary: string; busy: boolean; alertCount: number; onExpand: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Tooltip label="Show the setup bar" withArrow position="bottom">
      <Box
        onClick={onExpand}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        role="button" tabIndex={0} aria-label="show setup controls"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onExpand(); }
        }}
        style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
          padding: "3px 12px", cursor: "pointer",
          borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
          background: hover
            ? "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))"
            : "transparent",
          transition: "background 120ms",
        }}>
        <IconChevronDown size={14} color="var(--mantine-color-dimmed)" />
        <Text size="xs" c="dimmed"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {summary}
        </Text>
        {busy && <Loader size="xs" />}
        {alertCount > 0 && (
          <Badge size="xs" color="orange" variant="light" style={{ flexShrink: 0 }}>
            ⚠ {alertCount}
          </Badge>
        )}
      </Box>
    </Tooltip>
  );
}

/** The one-line "what this construction teaches" caption + the tool's Theory
 *  Guide link — rendered directly under the toolbar so the pedagogy is stated
 *  before the plot. */
function TeachesLine({ tool }: { tool: MethodTool }) {
  // Narrow viewports wrap to two clamped lines instead of an ellipsis that
  // would eat most of the sentence on a phone-width screen.
  const narrow = useNarrowViewport();
  return (
    <Group gap={6} wrap="nowrap" align={narrow ? "flex-start" : "center"} px={12} py={4}
      style={{ flexShrink: 0 }}>
      <Text size="xs" c="dimmed"
        {...(narrow
          ? { lineClamp: 2 as const }
          : { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } })}>
        {tool.teaches}
      </Text>
      {tool.theory && (
        <Tooltip label="Open the matching section of the Theory Guide" withArrow>
          <ActionIcon component="a" href={theoryUrl(tool.theory)} target="_blank"
            rel="noopener noreferrer" variant="subtle" size="sm" color="gray"
            aria-label="open the Theory Guide">
            <IconBook size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

/** The authoring hand-off (unchanged from the Explorer — guard-rail 2): the
 *  tool EMITS the propsDict for the student / agent to author on disk.
 *  Dict-on-disk stays the source of truth; the workspace never writes it. */
function HandOffFooter({ spec, alerts }: { spec: ExploreSpec | null; alerts: React.ReactNode[] }) {
  const [open, setOpen] = useState(false);
  const snippet = useMemo(() => {
    if (!spec) return "(no run yet)";
    try { return serialize(fromJson(synthesizeExploreCase(spec).propsDict!)); }
    catch { return "(invalid spec)"; }
  }, [spec]);
  return (
    <Box style={{ flexShrink: 0, padding: "4px 12px 8px",
      borderTop: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
      {alerts.length > 0 && <Stack gap={6} mb={6}>{alerts}</Stack>}
      <Group gap="xs" wrap="nowrap" align="center">
        <Button variant="subtle" size="compact-xs" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide propsDict" : "Author → copy propsDict"}
        </Button>
      </Group>
      <Collapse in={open}>
        <Stack gap={4} mt={6}>
          <Text size="xs" c="dimmed">
            Create or open a case, then put this block in <code>system/propsDict</code> under
            <code> operations ( … )</code>; keep <code>constant/propertyDict</code> in sync with
            the components/models above, and <code>runCase</code>.
          </Text>
          <Group gap="xs">
            <CopyButton value={snippet}>
              {({ copied, copy }) => (
                <Button size="xs" variant={copied ? "filled" : "light"} color="accent" onClick={copy}>
                  {copied ? "Copied ✓" : "Copy propsDict"}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Code block style={{ fontSize: 11, maxHeight: 200, overflow: "auto" }}>{snippet}</Code>
        </Stack>
      </Collapse>
    </Box>
  );
}

// ---- McCabe-Thiele ----------------------------------------------------------
// The SAME engine feed the Explorer's T-x-y uses (binaryVleSpec, kind mccabe):
// the equilibrium curve y*(x) arrives ALREADY COMPUTED by the engine; the R/q
// staircase in McCabePlot is pure geometry over it, zero re-solve.

function McCabeTool({ tool, catalogue, localUnifac, componentFiles }: {
  tool: MethodTool;
  catalogue: ComponentMeta[];
  localUnifac: LocalUnifac;
  componentFiles: Record<string, string>;
}) {
  const prefs = useStore((s) => s.displayPrefs);
  const Pu = prefs.pressure;
  const [compA, setCompA] = useState("benzene");
  const [compB, setCompB] = useState("toluene");
  const [activity, setActivity] = useState("NRTL");
  const [eos, setEos] = useState("idealGas");
  const [P, setP] = useState(101325);   // Pa, canonical SI
  const [nPts, setNPts] = useState(60);

  const vleNames = useMemo(
    () => catalogue.filter((m) => m.vleAble).map((m) => m.name).sort(),
    [catalogue]);

  // Honest DEFAULT model (same rule as the Explorer): a fitted-pair model with
  // NO curated pair silently collapses to ideal — when the pair has UNIFAC
  // groups instead, default to predictive UNIFAC.  Fires only on a component
  // change, so a manual model pick for the same pair is respected.
  useEffect(() => {
    const unifacAble = (c: string) =>
      (metaByName(c, catalogue)?.hasUnifac ?? false) || hasUnifacGroups(c, localUnifac);
    if (!unifacAble(compA) || !unifacAble(compB)) return;
    setActivity((prev) =>
      (prev === "NRTL" || prev === "Wilson") && !hasPair(prev, compA, compB) ? "UNIFAC" : prev);
  }, [compA, compB, catalogue, localUnifac]);

  const pairOk = compA !== compB && !!metaByName(compA, catalogue)?.vleAble
    && !!metaByName(compB, catalogue)?.vleAble;
  const spec = useMemo<ExploreSpec | null>(() => pairOk
    ? binaryVleSpec({
        pair: [compA, compB], catalogue, kind: "mccabe",
        activity, eos, P, n: nPts, localUnifac,
        componentFiles: Object.keys(componentFiles).length > 0 ? componentFiles : undefined,
      })
    : null,
  [pairOk, compA, compB, catalogue, activity, eos, P, nPts, localUnifac, componentFiles]);

  const { csv, err, busy, advisories } = useEngineCsv(spec);
  // Lecture fold: the setup bar + teaches line + hand-off footer give their
  // rows to the diagram.  ONE global key shared by the in-file tools, so
  // switching tools keeps the presentation posture; the fold is instant (no
  // width animation), so the refit rides a rAF instead of transitionend.
  const setup = useCollapsedFlag(CONTROLS_COLLAPSED_KEY);
  usePlotRefit(setup.collapsed);
  // The setup bar reflows below `sm` instead of running off the side.
  const bar = setupBarLayout(useNarrowViewport());
  // The plot reads y_eq_<more volatile>: pass the pair in the SAME order the
  // spec ran it, so the curve lookup can never miss.
  const [vA, vB] = orderBinaryByVolatility([compA, compB], catalogue);
  const mccabeCsv = csv ? dropCsvColumn(csv, "liquid_stable") : null;

  // The Explorer's no-lie rule rides along: a fitted-pair model with no
  // curated pair is announced, never silently drawn as ideal.
  const idealLie = (activity === "NRTL" || activity === "Wilson") && pairOk
    && !hasPair(activity, compA, compB)
    ? `No curated ${activity} pair covers ${compA}–${compB}, so this diagram assumes IDEAL mixing — `
      + `it cannot show an azeotrope. Switch γ to UNIFAC (predictive, from the components' groups), `
      + `or curate a ${activity} pair for this system.`
    : null;

  const alerts: React.ReactNode[] = [];
  if (err) alerts.push(<Alert key="err" color="red" variant="light">{err}</Alert>);
  if (!pairOk) alerts.push(
    <Alert key="pair" color="yellow" variant="light" title="Pick a binary">
      McCabe-Thiele needs two DIFFERENT VLE-able compounds.
    </Alert>);
  if (idealLie) alerts.push(
    <Alert key="ideal" color="orange" variant="light"
      title="Assuming ideal mixing — not your real system">
      <Text size="xs">{idealLie}</Text>
    </Alert>);
  if (advisories.length > 0) alerts.push(
    <Alert key="adv" color="yellow" variant="light" title="Solver advisory">
      {advisories.map((a) => <Text key={a} size="xs">{a}</Text>)}
    </Alert>);

  // ONE plot pane, whichever way the setup bar is folded — the fold moves
  // chrome around the diagram, never a second copy of it.
  const plotPane = (
    <Box style={{ flex: 1, minWidth: 0, overflow: "hidden", padding: 12, position: "relative" }}>
      {mccabeCsv ? (
        <McCabePlot csv={mccabeCsv} compA={vA} compB={vB} P={P} allowWide />
      ) : (
        <Box style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {busy
            ? <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">computing the equilibrium curve…</Text></Group>
            : <Text size="sm" c="dimmed" ta="center" maw={460}>
                The engine computes the real equilibrium curve y*(x) for the pair at P;
                the staircase then re-walks in pure geometry as you turn R and q.
              </Text>}
        </Box>
      )}
    </Box>
  );

  if (setup.collapsed) {
    return (
      <>
        <SetupCollapsedStrip
          summary={`${compA} / ${compB} · γ ${activity} · P ${paToDisplay(P, Pu)} ${pressureLabel(Pu)}`}
          busy={busy} alertCount={alerts.length} onExpand={setup.toggle} />
        {plotPane}
      </>
    );
  }

  return (
    <>
      <Box style={{
        flexShrink: 0, minHeight: 44, padding: "6px 12px", overflowX: "auto", overflowY: "hidden",
        borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
      }}>
        <Group gap="sm" wrap={bar.wrap} align="center" style={{ minWidth: bar.minWidth }}>
          <ToolField label="light">
            <Select size="xs" searchable data={vleNames} value={compA}
              onChange={(v) => setCompA(v ?? compA)} w={140} allowDeselect={false} />
          </ToolField>
          <ToolField label="heavy">
            <Select size="xs" searchable data={vleNames} value={compB}
              onChange={(v) => setCompB(v ?? compB)} w={140} allowDeselect={false} />
          </ToolField>
          <ToolField label="γ">
            <Select size="xs" data={["ideal", "NRTL", "Wilson", "UNIFAC"]} value={activity}
              onChange={(v) => setActivity(v ?? "NRTL")} w={100} allowDeselect={false} />
          </ToolField>
          <ToolField label="EoS">
            <Select size="xs" data={["idealGas", "SRK", "PR"]} value={eos}
              onChange={(v) => setEos(v ?? "idealGas")} w={100} allowDeselect={false} />
          </ToolField>
          <ToolField label={`P (${pressureLabel(Pu)})`}>
            <NumberInput size="xs" value={paToDisplay(P, Pu)} w={90}
              onChange={(v) => {
                const n = typeof v === "number" ? v : parseFloat(v);
                if (Number.isFinite(n)) setP(parsePressure(n, Pu));
              }} />
          </ToolField>
          <ToolField label="points">
            <NumberInput size="xs" value={nPts} min={2} w={72}
              onChange={(v) => {
                const n = typeof v === "number" ? v : parseFloat(v);
                if (Number.isFinite(n)) setNPts(n);
              }} />
          </ToolField>
          {busy && (
            <Group gap={6} wrap="nowrap">
              <Loader size="xs" /><Text size="xs" c="dimmed">computing…</Text>
            </Group>
          )}
          {bar.showSpacer && <Box style={{ flex: 1, minWidth: 8 }} />}
          {mccabeCsv && (
            <Tooltip label="Open the McCabe-Thiele analyzer full-window in a new tab" withArrow>
              <ActionIcon variant="subtle" size="md" color="accent"
                aria-label="pop out McCabe analyzer"
                onClick={() => popOutExploreMccabe({
                  csv: mccabeCsv, compA: vA, compB: vB, P, model: activity,
                })}>
                <IconExternalLink size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <SetupCollapseButton onCollapse={setup.toggle} />
        </Group>
      </Box>
      <TeachesLine tool={tool} />
      {plotPane}
      <HandOffFooter spec={spec} alerts={alerts} />
    </>
  );
}

// ---- Psychrometric chart ----------------------------------------------------
// The SAME engine feed the Explorer used (psychroSpec → the psychrometricChart
// engine op): carrier = lower-Tb of the pair, condensable = higher-Tb; the
// chart CSV arrives fully computed (saturation, RH, adiabatic-saturation and
// true wet-bulb via the Lewis number) and PsychroPlot only draws it.

/** The width the psychrometric setup bar needs to stay on one row: its
 *  measured extent (1495 px at 390x844 on 2026-08-17) plus the padding around
 *  it.  Declared beside the tool that owns the bar, not in the shared helper —
 *  the helper answers "does it fit", the tool says what it needs. */
const PSYCHRO_BAR_ONE_ROW_PX = 1520;

function PsychroTool({ tool, catalogue, componentFiles }: {
  tool: MethodTool;
  catalogue: ComponentMeta[];
  componentFiles: Record<string, string>;
}) {
  const prefs = useStore((s) => s.displayPrefs);
  const Tu = prefs.temperature, Pu = prefs.pressure;
  const [carrier, setCarrier] = useState("N2");
  const [condensable, setCondensable] = useState("water");
  const [tFrom, setTFrom] = useState(290);    // K
  const [tTo, setTTo] = useState(380);        // K
  const [P, setP] = useState(101325);         // Pa
  const [rhFrom, setRhFrom] = useState(10);
  const [rhTo, setRhTo] = useState(90);
  const [rhStep, setRhStep] = useState(20);
  const [wbStep, setWbStep] = useState(10);   // °C between saturation anchor lines
  const [yMax, setYMax] = useState(0);        // kg/kg cap; 0 = auto

  const carrierNames = useMemo(
    () => catalogue.filter((m) => m.isPermanentGas).map((m) => m.name).sort(),
    [catalogue]);
  const condensableNames = useMemo(
    () => catalogue.filter((m) => m.vleAble && !m.isPermanentGas).map((m) => m.name).sort(),
    [catalogue]);

  const pairOk = carrier !== condensable
    && !!metaByName(carrier, catalogue) && !!metaByName(condensable, catalogue);
  const spec = useMemo<ExploreSpec | null>(() => pairOk
    ? psychroSpec({
        pair: [carrier, condensable], catalogue, P,
        TminK: tFrom, TmaxK: tTo, gridN: 60,
        rhFrom, rhTo, rhStep, wbStepC: wbStep,
        componentFiles: Object.keys(componentFiles).length > 0 ? componentFiles : undefined,
      })
    : null,
  [pairOk, carrier, condensable, catalogue, P, tFrom, tTo, rhFrom, rhTo, rhStep, wbStep, componentFiles]);

  const { csv, err, busy, advisories } = useEngineCsv(spec);
  // Lecture fold — same shared key and posture as the McCabe tool.
  const setup = useCollapsedFlag(CONTROLS_COLLAPSED_KEY);
  usePlotRefit(setup.collapsed);
  /* Widest setup bar in the corpus.  Measured 2026-08-17: it laid its controls
   * out to x=1495, which overruns the phone AND the 1400x900 desk viewport —
   * `hide setup controls` sat at x=1461 with nothing able to scroll to it.  So
   * the wrap here is decided by whether the bar FITS, not by a phone
   * breakpoint; 1520 is that measured 1495 plus the padding around it.
   *
   * Both hooks are called UNCONDITIONALLY and combined afterwards: `narrow ||
   * !fits` would short-circuit past the second hook on a phone and change the
   * hook order between renders. */
  const psychroNarrow = useNarrowViewport();
  const psychroFitsOneRow = useFitsOneRow(PSYCHRO_BAR_ONE_ROW_PX);
  const bar = setupBarLayout(psychroNarrow || !psychroFitsOneRow);

  const alerts: React.ReactNode[] = [];
  if (err) alerts.push(<Alert key="err" color="red" variant="light">{err}</Alert>);
  if (!pairOk) alerts.push(
    <Alert key="pair" color="yellow" variant="light" title="Pick a humid-gas pair">
      The chart needs a carrier gas plus a DIFFERENT condensable with a vapour-pressure model.
    </Alert>);
  if (advisories.length > 0) alerts.push(
    <Alert key="adv" color="yellow" variant="light" title="Solver advisory">
      {advisories.map((a) => <Text key={a} size="xs">{a}</Text>)}
    </Alert>);

  const num = (v: number | string, fallback: number) => {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };

  // ONE plot pane, whichever way the setup bar is folded (same rule as the
  // McCabe tool: the fold moves chrome, never duplicates the diagram).
  const plotPane = (
    <Box style={{ flex: 1, minWidth: 0, overflow: "hidden", padding: 12, position: "relative" }}>
      {csv ? (
        <PsychroPlot csv={csv} yMax={yMax} />
      ) : (
        <Box style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {busy
            ? <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">computing the chart…</Text></Group>
            : <Text size="sm" c="dimmed" ta="center" maw={460}>
                Psychrometric chart at P — humidity ratio Y vs dry-bulb T for
                the carrier + condensable pair, fully computed by the engine.
              </Text>}
        </Box>
      )}
    </Box>
  );

  if (setup.collapsed) {
    return (
      <>
        <SetupCollapsedStrip
          summary={`${carrier} + ${condensable} · ${Number(kToDisplay(tFrom, Tu).toFixed(1))}–${Number(kToDisplay(tTo, Tu).toFixed(1))} ${temperatureLabel(Tu)} · P ${paToDisplay(P, Pu)} ${pressureLabel(Pu)}`}
          busy={busy} alertCount={alerts.length} onExpand={setup.toggle} />
        {plotPane}
      </>
    );
  }

  return (
    <>
      <Box style={{
        flexShrink: 0, minHeight: 44, padding: "6px 12px", overflowX: "auto", overflowY: "hidden",
        borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
      }}>
        <Group gap="sm" wrap={bar.wrap} align="center" style={{ minWidth: bar.minWidth }}>
          <ToolField label="carrier">
            <Select size="xs" searchable data={carrierNames} value={carrier}
              onChange={(v) => setCarrier(v ?? carrier)} w={110} allowDeselect={false} />
          </ToolField>
          <ToolField label="condensable">
            <Select size="xs" searchable data={condensableNames} value={condensable}
              onChange={(v) => setCondensable(v ?? condensable)} w={130} allowDeselect={false} />
          </ToolField>
          <ToolField label={`T from (${temperatureLabel(Tu)})`}>
            <NumberInput size="xs" value={Number(kToDisplay(tFrom, Tu).toFixed(1))} w={84} step={5}
              onChange={(v) => setTFrom(parseTemperature(num(v, kToDisplay(tFrom, Tu)), Tu))} />
          </ToolField>
          <ToolField label={`to (${temperatureLabel(Tu)})`}>
            <NumberInput size="xs" value={Number(kToDisplay(tTo, Tu).toFixed(1))} w={84} step={5}
              onChange={(v) => setTTo(parseTemperature(num(v, kToDisplay(tTo, Tu)), Tu))} />
          </ToolField>
          <ToolField label={`P (${pressureLabel(Pu)})`}>
            <NumberInput size="xs" value={paToDisplay(P, Pu)} w={90}
              onChange={(v) => setP(parsePressure(num(v, paToDisplay(P, Pu)), Pu))} />
          </ToolField>
          <ToolField label="RH % from/to/step">
            <Group gap={4} wrap="nowrap">
              <NumberInput size="xs" value={rhFrom} min={0} max={99} w={62}
                onChange={(v) => setRhFrom(num(v, rhFrom))} />
              <NumberInput size="xs" value={rhTo} min={1} max={99} w={62}
                onChange={(v) => setRhTo(num(v, rhTo))} />
              <NumberInput size="xs" value={rhStep} min={1} max={50} w={62}
                onChange={(v) => setRhStep(num(v, rhStep))} />
            </Group>
          </ToolField>
          <ToolField label="ΔT sat (°C)">
            <NumberInput size="xs" value={wbStep} min={5} max={50} step={5} w={68}
              onChange={(v) => setWbStep(num(v, wbStep))} />
          </ToolField>
          <ToolField label="Y max (0=auto)">
            <NumberInput size="xs" value={yMax} min={0} step={0.05} decimalScale={3} w={80}
              onChange={(v) => setYMax(num(v, yMax))} />
          </ToolField>
          {busy && (
            <Group gap={6} wrap="nowrap">
              <Loader size="xs" /><Text size="xs" c="dimmed">computing…</Text>
            </Group>
          )}
          {/* Spacer + the fold affordance pinned to the toolbar's right end —
              the same rightmost slot the McCabe toolbar gives it.  The spacer
              goes when the bar wraps (see setupBarLayout). */}
          {bar.showSpacer && <Box style={{ flex: 1, minWidth: 8 }} />}
          <SetupCollapseButton onCollapse={setup.toggle} />
        </Group>
      </Box>
      <TeachesLine tool={tool} />
      {plotPane}
      <HandOffFooter spec={spec} alerts={alerts} />
    </>
  );
}
