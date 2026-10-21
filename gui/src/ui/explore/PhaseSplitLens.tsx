/*---------------------------------------------------------------------------*\
  PhaseSplitLens — the phase split of ONE feed along T or P (DEV.md 4c C118,
  stage 2; the engine op is stage 1, src/propertyOps/PhaseSplitScan.{H,cpp}).

  WHAT IT SHOWS.  Left (folded behind one button on a phone): the
  thermophysical system the scan runs under -- SYNTHESISED from the set (an
  activity model, and a crystal for each component whose record declares one)
  or the OPEN CASE's own `constant/` tree, which is how a speciating package
  (pH, precipitates) reaches the lens -- the feed in moles, the swept
  variable, the held value, the range and the phase set.  Right: the amount
  of every phase (mol per mol of feed) as stacked bars at the grid points;
  each appearance / disappearance drawn as the INTERVAL between the two grid
  values the engine says it lies between; pH in its own panel where the
  engine published one; the composition of a chosen phase; the refused
  points, the engine's announcements and what the scan does not model, all
  in the engine's own words.

  WHAT IT COMPUTES.  Nothing physical.  ONE `choupoProps` run of ONE
  `phaseSplitScan` op (case/phaseSplitScan.ts builds it); every number drawn
  is a number of the `phaseSplitScans` result block.  The stacked bars are
  the published amounts placed on top of each other -- the engine's amounts
  sum to 1 at every solved point (gate check_phase_split_scan arm (g)), so
  nothing is normalised here.  A refused point is a GAP with the engine's
  reason, never a bar.

  DEV ONLY, and tree-shaken out of a production build:
  `window.__choupoPhaseSplitPlan` exposes the synthesised case, and
  `window.__choupoPhaseSplitRecorded = { log }` (a native run's stdout,
  result markers included) is read in place of the engine when set -- the
  C105 approach, for a machine with no WASM build.
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Anchor, Box, Button, Checkbox, Collapse, Group, Loader, NumberInput, ScrollArea,
  SegmentedControl, Select, Stack, Text, useComputedColorScheme,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import { resolveAdapter } from "../../adapters/index.js";
import { extractStructured } from "../../adapters/WasmAdapter.js";
import type { ComponentMeta } from "../../case/catalogue.js";
import { metaByName } from "../../case/catalogue.js";
import { hasPair } from "../../case/pairsCatalogue.js";
import {
  EXPLORER_GUIDE_PHASE_SPLIT, PHASE_SETS, PHASE_SPLIT_ACTIVITY, announcements, caseRouteApplies,
  crystalDataOf, eventSentence, phaseAmountSeries, phaseCompositionSeries, phaseDisplayName,
  phaseSplitPlan, phasesEverPresent, phSeries, refusedPoints, scanConsoleNotes,
  type PhaseSetWord, type PhaseSplitScanBlock,
} from "../../case/phaseSplitScan.js";
import { hasUnifacGroups, type UnifacGroup } from "../../case/unifacGroups.js";
import { guideUrl, openGuide } from "../../help/guideLinks.js";
import {
  kToDisplay, paToDisplay, parsePressure, parseTemperature, pressureLabel, temperatureLabel,
} from "../../state/displayUnits.js";
import { useStore } from "../../state/store.js";
import { Plot, PLOT_CONFIG, darkLayout } from "../plotting/plotly.js";

/** The phase colours, in FIXED order by the phase's place in the engine's
 *  `phaseNames` (V, L1, L2, then the solids as met) -- colour follows the
 *  phase, never its amount.  The categorical order of the dataviz reference
 *  palette, stepped once for each plot background. */
const PHASE_COLOURS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#6250d6", "#eda100", "#e87ba4", "#008300", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#9085e9", "#c98500", "#d55181", "#008300", "#e66767"],
} as const;
const SURFACE = { light: "#ffffff", dark: "#1f1f1f" } as const;
const BAND = { light: "rgba(52,58,64,0.10)", dark: "rgba(201,201,201,0.12)" } as const;
const REFUSED = { light: "#c92a2a", dark: "#ff8787" } as const;

declare global {
  interface Window {
    __choupoPhaseSplitPlan?: unknown;
    __choupoPhaseSplitRecorded?: { log?: string };
  }
}

/** The default activity model: NRTL where a curated pair covers every pair
 *  of the set, else UNIFAC where every component carries groups, else ideal
 *  -- a starting point the panel names, never a silent choice. */
function defaultActivity(sel: string[], catalogue: ComponentMeta[],
                         localUnifac: Record<string, UnifacGroup[]>): string {
  const pairs: [string, string][] = [];
  for (let i = 0; i < sel.length; ++i) for (let j = i + 1; j < sel.length; ++j) pairs.push([sel[i]!, sel[j]!]);
  if (pairs.length > 0 && pairs.every(([a, b]) => hasPair("NRTL", a, b))) return "NRTL";
  if (sel.every((c) => (metaByName(c, catalogue)?.hasUnifac ?? false) || hasUnifacGroups(c, localUnifac)))
    return "UNIFAC";
  return "ideal";
}

export function PhaseSplitLens({ components, catalogue, caseRaw, localUnifac, componentFiles, narrow }: {
  components: string[];
  catalogue: ComponentMeta[];
  caseRaw?: { [relPath: string]: string };
  localUnifac: Record<string, UnifacGroup[]>;
  componentFiles?: { [relPath: string]: string };
  narrow: boolean;
}) {
  const prefs = useStore((s) => s.displayPrefs);
  const scheme = useComputedColorScheme("light");
  const tU = prefs.temperature;
  const pU = prefs.pressure;

  // ---- the student's choices (canonical SI in state) ----------------------
  const caseOffered = useMemo(() => caseRouteApplies(components, caseRaw), [components, caseRaw]);
  const [source, setSource] = useState<"synth" | "case">(caseOffered ? "case" : "synth");
  useEffect(() => { if (!caseOffered && source === "case") setSource("synth"); }, [caseOffered, source]);
  const [activity, setActivity] = useState(() => defaultActivity(components, catalogue, localUnifac));
  const [solids, setSolids] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<{ [c: string]: number }>({});
  const [variable, setVariable] = useState<"T" | "P">("T");
  const [heldP, setHeldP] = useState(101325);     // Pa, when T is swept
  const [heldT, setHeldT] = useState(298.15);     // K,  when P is swept
  const [tFrom, setTFrom] = useState(273.15);     // K
  const [tTo, setTTo] = useState(253.15);
  const [pFrom, setPFrom] = useState(101325);     // Pa
  const [pTo, setPTo] = useState(1000);
  const [n, setN] = useState(21);
  const [phaseSet, setPhaseSet] = useState<PhaseSetWord>("VL");
  const [listsOpen, setListsOpen] = useState(false);
  const [compPhase, setCompPhase] = useState<string | null>(null);

  const amountOf = (c: string) => amounts[c] ?? 1;
  const crystals = useMemo(
    () => Object.fromEntries(components.map((c) => [c, crystalDataOf(c, componentFiles)])),
    [components, componentFiles]);
  const chosenSolids = solids.filter((s) => components.includes(s) && crystals[s]?.missing.length === 0);

  const plan = useMemo(() => phaseSplitPlan({
    components,
    amounts: Object.fromEntries(components.map((c) => [c, amountOf(c)])),
    variable,
    held: variable === "T" ? heldP : heldT,
    from: variable === "T" ? tFrom : pFrom,
    to: variable === "T" ? tTo : pTo,
    n, phaseSet,
    thermo: source === "case" ? { source: "case" } : { source: "synth", activityModel: activity, solids: chosenSolids },
    componentFiles, caseRaw,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [components, amounts, variable, heldP, heldT, tFrom, tTo, pFrom, pTo, n, phaseSet, source, activity,
       chosenSolids.join(","), componentFiles, caseRaw]);

  // ---- the run --------------------------------------------------------------
  const [block, setBlock] = useState<PhaseSplitScanBlock | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adapterNote, setAdapterNote] = useState<string | null>(null);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const seq = ++seqRef.current;
    if (!plan.files) { setBlock(null); setNotes([]); setError(null); setBusy(false); return; }
    if (import.meta.env.DEV && typeof window !== "undefined") window.__choupoPhaseSplitPlan = plan.files;
    setBusy(true);
    try {
      const recorded = import.meta.env.DEV && typeof window !== "undefined"
        ? window.__choupoPhaseSplitRecorded : undefined;
      let log = "";
      let blocks: PhaseSplitScanBlock[] | undefined;
      let status: "done" | "error" = "done";
      if (recorded?.log) {
        const s = extractStructured(recorded.log, plan.files);
        log = s.displayLog; blocks = s.phaseSplitScans;
      } else {
        const resolved = await resolveAdapter("wasm");
        if (seq !== seqRef.current) return;
        if (resolved.kind !== "wasm") {
          setAdapterNote(resolved.fallbackReason ?? "The real (WebAssembly) solver could not be loaded.");
          if (resolved.kind === "unavailable") { setBusy(false); return; }
        } else setAdapterNote(null);
        const r = await resolved.adapter.run(plan.files, () => {}, ctrl.signal, "choupoProps");
        if (seq !== seqRef.current) return;
        log = r.log; blocks = r.phaseSplitScans; status = r.status;
      }
      const b = blocks?.[0] ?? null;
      setBlock(b);
      setNotes(scanConsoleNotes(log));
      //  The engine's own sentence when it stopped the whole run (a grammar
      //  refusal, a thermophysical system it cannot build) -- or, when every
      //  point was refused, the block says why at each point and no extra
      //  sentence is invented here.
      if (!b) {
        const why = log.split("\n").map((l) => l.trim()).reverse()
          .find((l) => /(?:error|fatal|refus|cannot|must)/i.test(l));
        setError(status === "done" && !why ? "The engine returned no phase-split block." : (why ?? "choupoProps did not finish."));
      } else setError(null);
    } catch (e) {
      if (!ctrl.signal.aborted && seq === seqRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === seqRef.current) setBusy(false);
    }
  }, [plan]);

  useEffect(() => {
    const t = setTimeout(() => { void run(); }, 400);
    return () => clearTimeout(t);
  }, [run]);

  // ---- what is drawn --------------------------------------------------------
  const xDisp = useCallback((v: number) => (block?.variable === "P" ? paToDisplay(v, pU) : kToDisplay(v, tU)),
    [block?.variable, pU, tU]);
  const xLabel = block?.variable === "P" ? `P (${pressureLabel(pU)})` : `T (${temperatureLabel(tU)})`;
  const fmtX = useCallback((v: number) => `${Number(xDisp(v).toPrecision(5))} ${block?.variable === "P" ? pressureLabel(pU) : temperatureLabel(tU)}`,
    [xDisp, block?.variable, pU, tU]);
  const colourOf = useCallback((name: string) => {
    const i = block ? Math.max(0, block.phaseNames.indexOf(name)) : 0;
    return PHASE_COLOURS[scheme][i % PHASE_COLOURS[scheme].length]!;
  }, [block, scheme]);

  const amountFigure = useMemo(() => {
    if (!block) return null;
    const { x, series } = phaseAmountSeries(block);
    const xs = x.map(xDisp);
    //  bar width: 80 % of the smallest grid step, so neighbouring states stay
    //  visibly separate -- a scan is a set of states, not a continuum.
    let step = Infinity;
    for (let i = 1; i < xs.length; ++i) step = Math.min(step, Math.abs(xs[i]! - xs[i - 1]!));
    const width = Number.isFinite(step) && step > 0 ? 0.8 * step : undefined;
    const traces: Record<string, unknown>[] = series.map((s) => ({
      type: "bar", name: phaseDisplayName(block, s.name), x: xs, y: s.y,
      ...(width ? { width } : {}),
      marker: { color: colourOf(s.name), line: { color: SURFACE[scheme], width: 1 } },
      hovertemplate: `${phaseDisplayName(block, s.name)}<br>${xLabel} = %{x:.4g}<br>%{y:.4f} mol per mol feed<extra></extra>`,
    }));
    const refused = refusedPoints(block);
    if (refused.length > 0)
      traces.push({
        type: "scatter", mode: "markers", name: "refused point", x: refused.map((r) => xDisp(r.at)),
        y: refused.map(() => 0.5), customdata: refused.map((r) => r.reason.split("\n")[0]),
        marker: { symbol: "x-thin-open", size: 12, color: REFUSED[scheme], line: { width: 2, color: REFUSED[scheme] } },
        hovertemplate: `REFUSED at ${xLabel} = %{x:.4g}<br>%{customdata}<extra></extra>`,
      });
    const shapes = block.events.map((e) => ({
      type: "rect", xref: "x", yref: "paper", x0: xDisp(e.from), x1: xDisp(e.to), y0: 0, y1: 1,
      fillcolor: BAND[scheme], line: { width: 0 }, layer: "below",
    }));
    const annotations = block.events.map((e, k) => ({
      x: (xDisp(e.from) + xDisp(e.to)) / 2, y: 1, yref: "paper", yanchor: "bottom",
      text: e.kind === "phaseSet" ? `→ ${e.phase}` : `${e.phase} ${e.kind}`, showarrow: false,
      font: { size: 10 }, yshift: 2 + (k % 2) * 12,
    }));
    return { traces, shapes, annotations };
  }, [block, xDisp, xLabel, colourOf, scheme]);

  const ph = useMemo(() => (block ? phSeries(block) : null), [block]);
  const present = useMemo(() => (block ? phasesEverPresent(block) : []), [block]);
  const shownPhase = compPhase && present.includes(compPhase) ? compPhase : present[0] ?? null;
  const comp = useMemo(() => (block && shownPhase ? phaseCompositionSeries(block, shownPhase) : null),
    [block, shownPhase]);

  // ---- the panel --------------------------------------------------------------
  const sumMoles = components.reduce((s, c) => s + amountOf(c), 0);
  const noCrystalAnywhere = components.every((c) => (crystals[c]?.missing.length ?? 1) > 0);
  const pairNote = (() => {
    if (source !== "synth" || activity === "ideal" || activity === "UNIFAC" || components.length < 2) return null;
    const parts: string[] = [];
    for (let i = 0; i < components.length; ++i)
      for (let j = i + 1; j < components.length; ++j) {
        const a = components[i]!, b = components[j]!;
        parts.push(`${a}–${b}: ${hasPair(activity, a, b) ? `${activity} pair ✓` : "no curated pair"}`);
      }
    return parts.join(" · ");
  })();

  const panel = (
    <Stack gap="sm">
      <Text size="xs" c="dimmed">
        One feed, swept along T or P; at every point the engine solves the whole phase split.{" "}
        <Anchor size="xs" onClick={() => openGuide(guideUrl("explorerGuide", EXPLORER_GUIDE_PHASE_SPLIT))}>
          How to read this view (Explorer Guide)
        </Anchor>
      </Text>

      <Box>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Thermophysical system</Text>
        {caseOffered && (
          <SegmentedControl size="xs" mt={4} fullWidth value={source}
            onChange={(v) => setSource(v === "case" ? "case" : "synth")}
            data={[{ value: "synth", label: "built here" }, { value: "case", label: "the open case's" }]} />)}
        {source === "case" ? (
          <Text size="xs" c="dimmed" mt={4}>
            The open case&apos;s <code>constant/thermoPhysPropDict</code> and everything under its
            <code> constant/</code> -- its models, its chemistry, the solids it declares -- exactly as
            written.  pH and precipitates appear where that system speciates.
          </Text>
        ) : (
          <Stack gap={6} mt={4}>
            <Select size="xs" label="γ model (liquid)" data={[...PHASE_SPLIT_ACTIVITY]} value={activity}
              onChange={(v) => setActivity(v ?? "ideal")} allowDeselect={false} />
            {pairNote && <Text size="xs" c="dimmed">{pairNote}</Text>}
            <Text size="xs" fw={500}>May crystallise (pure solid of the component)</Text>
            {components.map((c) => {
              const cd = crystals[c]!;
              const able = cd.missing.length === 0;
              return (
                <Checkbox key={c} size="xs" disabled={!able} checked={able && solids.includes(c)}
                  onChange={(e) => setSolids((s) => e.currentTarget.checked ? [...s, c] : s.filter((x) => x !== c))}
                  label={able ? `${c}  (Hfus ${cd.Hfus} J/mol, T_fus ${cd.tripleT} K, from its record)`
                    : `${c}: its record declares no ${cd.missing.join(" and no ")}`} />
              );
            })}
            {noCrystalAnywhere && (
              <Text size="xs" c="orange">
                No component of this set has a record that declares a crystal, so no solid can form in
                this scan.  A substance solidifies here only where its record declares the solid.
              </Text>)}
            {chosenSolids.length > 0 && (
              <Text size="xs" c="dimmed">
                With a crystal declared the engine solves liquid + solid, with no vapour: a solid beside
                a vapour is not solved yet.  The phase set below does not apply.
              </Text>)}
            <Text size="xs" c="dimmed">
              pH is published only by a package that speciates an aqueous solution; this route builds a
              molecular one.  For pH, open a case that declares the chemistry and use its system.
            </Text>
          </Stack>
        )}
      </Box>

      <Box>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Feed (mol)</Text>
        <Stack gap={4} mt={4}>
          {components.map((c) => (
            <NumberInput key={c} size="xs" label={`${c} (mol)`} min={0} step={0.1} decimalScale={6}
              value={amountOf(c)} onChange={(v) => setAmounts((a) => ({ ...a, [c]: typeof v === "number" ? v : Number(v) || 0 }))} />
          ))}
          <Text size="xs" c="dimmed">
            Sum {Number(sumMoles.toPrecision(6))} mol.  Sent as typed; the engine normalises the feed to one
            mole and says so (below, in its own words).
          </Text>
        </Stack>
      </Box>

      <Box>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Sweep</Text>
        <SegmentedControl size="xs" mt={4} fullWidth value={variable} onChange={(v) => setVariable(v === "P" ? "P" : "T")}
          data={[{ value: "T", label: "T at fixed P" }, { value: "P", label: "P at fixed T" }]} />
        <Stack gap={4} mt={4}>
          {variable === "T" ? (
            <>
              <NumberInput size="xs" label={`held P (${pressureLabel(pU)})`} min={0} decimalScale={6}
                value={paToDisplay(heldP, pU)} onChange={(v) => setHeldP(parsePressure(Number(v) || 0, pU))} />
              <Group gap={6} grow>
                <NumberInput size="xs" label={`from T (${temperatureLabel(tU)})`} decimalScale={4}
                  value={kToDisplay(tFrom, tU)} onChange={(v) => setTFrom(parseTemperature(Number(v) || 0, tU))} />
                <NumberInput size="xs" label={`to T (${temperatureLabel(tU)})`} decimalScale={4}
                  value={kToDisplay(tTo, tU)} onChange={(v) => setTTo(parseTemperature(Number(v) || 0, tU))} />
              </Group>
            </>
          ) : (
            <>
              <NumberInput size="xs" label={`held T (${temperatureLabel(tU)})`} decimalScale={4}
                value={kToDisplay(heldT, tU)} onChange={(v) => setHeldT(parseTemperature(Number(v) || 0, tU))} />
              <Group gap={6} grow>
                <NumberInput size="xs" label={`from P (${pressureLabel(pU)})`} min={0} decimalScale={6}
                  value={paToDisplay(pFrom, pU)} onChange={(v) => setPFrom(parsePressure(Number(v) || 0, pU))} />
                <NumberInput size="xs" label={`to P (${pressureLabel(pU)})`} min={0} decimalScale={6}
                  value={paToDisplay(pTo, pU)} onChange={(v) => setPTo(parsePressure(Number(v) || 0, pU))} />
              </Group>
            </>
          )}
          <NumberInput size="xs" label="points (–)" min={2} max={201} value={n}
            onChange={(v) => setN(Math.max(2, Math.min(201, Math.round(Number(v) || 2))))} />
          {!(source === "synth" && chosenSolids.length > 0) && (
            <Select size="xs" label="phase set (the flash unit's own word)" data={[...PHASE_SETS]} value={phaseSet}
              onChange={(v) => setPhaseSet((v as PhaseSetWord) ?? "VL")} allowDeselect={false} />)}
        </Stack>
      </Box>
    </Stack>
  );

  // ---- the figures --------------------------------------------------------------
  const plotConfig = narrow ? { ...PLOT_CONFIG, displayModeBar: false } : PLOT_CONFIG;
  const margin = { ...darkLayout.margin, l: narrow ? 44 : darkLayout.margin.l, r: narrow ? 8 : darkLayout.margin.r };

  const figures = (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      {adapterNote && (
        <Alert color="orange" variant="light" p="xs">
          <Text size="xs">{adapterNote}  This view draws nothing it did not get from the engine.</Text>
        </Alert>)}
      {plan.nothingToAsk && <Text size="sm" c="dimmed">{plan.nothingToAsk}</Text>}
      {error && (
        <Alert color="red" variant="light" p="xs" title="The engine refused or did not finish">
          <Text size="xs" style={{ whiteSpace: "pre-wrap" }}>{error}</Text>
        </Alert>)}
      {block && amountFigure ? (
        <>
          <Box style={{ flexShrink: 0, height: narrow ? 380 : 340, position: "relative" }}>
            <Plot data={amountFigure.traces as never}
              layout={{
                ...darkLayout, autosize: true, showlegend: true, barmode: "stack", bargap: 0,
                title: { text: narrow ? "phase amounts" : `Phase amounts along ${block.variable} at ${block.held.name} = ${
                  block.held.name === "P" ? `${Number(paToDisplay(block.held.value, pU).toPrecision(5))} ${pressureLabel(pU)}`
                                          : `${Number(kToDisplay(block.held.value, tU).toPrecision(5))} ${temperatureLabel(tU)}`}`,
                         x: 0.01, xanchor: "left", font: { size: narrow ? 11 : 13 } },
                legend: { ...darkLayout.legend, orientation: "h", x: 0, y: -0.22, xanchor: "left", yanchor: "top" },
                xaxis: { ...darkLayout.xaxis, title: { text: xLabel } },
                yaxis: { ...darkLayout.yaxis, title: { text: "amount (mol per mol feed)" }, range: [0, 1.0001] },
                shapes: amountFigure.shapes, annotations: amountFigure.annotations,
                margin: { ...margin, b: 96, t: 52 },
              } as never}
              config={plotConfig} style={{ width: "100%", height: "100%" }} useResizeHandler />
            {busy && (
              <Box style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                justifyContent: "center", background: "light-dark(rgba(255,255,255,0.45), rgba(0,0,0,0.45))" }}>
                <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">solving the phase split at every point…</Text></Group>
              </Box>)}
          </Box>

          {ph && ph.has ? (
            <Box style={{ flexShrink: 0, height: 200 }}>
              <Plot data={[{
                type: "scatter", mode: "lines+markers", name: "pH", x: ph.x.map(xDisp), y: ph.y, connectgaps: false,
                line: { color: PHASE_COLOURS[scheme][0], width: 2 }, marker: { size: 8, color: PHASE_COLOURS[scheme][0] },
                hovertemplate: `${xLabel} = %{x:.4g}<br>pH %{y:.4f}<extra></extra>`,
              }] as never}
                layout={{
                  ...darkLayout, autosize: true, showlegend: false,
                  title: { text: "pH of the aqueous liquid (as the engine published it)", x: 0.01, xanchor: "left", font: { size: 12 } },
                  xaxis: { ...darkLayout.xaxis, title: { text: xLabel } },
                  yaxis: { ...darkLayout.yaxis, title: { text: "pH (–)" } },
                  shapes: amountFigure.shapes, margin: { ...margin, b: 44, t: 36 },
                } as never}
                config={plotConfig} style={{ width: "100%", height: "100%" }} useResizeHandler />
            </Box>
          ) : (
            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              No pH: the engine published none for this system (pH comes only from a package that
              speciates an aqueous solution).
            </Text>
          )}

          {comp && shownPhase && (
            <Box style={{ flexShrink: 0 }}>
              <Group gap={8} align="flex-end">
                <Select size="xs" label="composition of" w={220} allowDeselect={false} value={shownPhase}
                  data={present.map((p) => ({ value: p, label: phaseDisplayName(block, p) }))}
                  onChange={(v) => setCompPhase(v)} />
                <Text size="xs" c="dimmed">mole fraction where the phase is present; a gap where it is not.</Text>
              </Group>
              <Box style={{ height: 240 }}>
                <Plot data={comp.series.map((s, k) => ({
                  type: "scatter", mode: "lines+markers", name: s.component, x: comp.x.map(xDisp), y: s.y,
                  connectgaps: false, line: { width: 2, color: PHASE_COLOURS[scheme][(k + 4) % 8] },
                  marker: { size: 8, color: PHASE_COLOURS[scheme][(k + 4) % 8] },
                  hovertemplate: `${s.component} in ${shownPhase}<br>${xLabel} = %{x:.4g}<br>x = %{y:.4f}<extra></extra>`,
                })) as never}
                  layout={{
                    ...darkLayout, autosize: true, showlegend: true,
                    legend: { ...darkLayout.legend, orientation: "h", x: 0, y: -0.3, xanchor: "left", yanchor: "top" },
                    xaxis: { ...darkLayout.xaxis, title: { text: xLabel } },
                    yaxis: { ...darkLayout.yaxis, title: { text: `mole fraction in ${shownPhase} (–)` }, range: [0, 1.0001] },
                    shapes: amountFigure.shapes, margin: { ...margin, b: 80, t: 16 },
                  } as never}
                  config={plotConfig} style={{ width: "100%", height: "100%" }} useResizeHandler />
              </Box>
            </Box>)}

          <Stack gap={4} style={{ flexShrink: 0 }}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">What the engine said</Text>
            {block.events.length === 0
              ? <Text size="xs" c="dimmed">No phase appeared or disappeared between the grid points.</Text>
              : block.events.map((e, k) => <Text key={k} size="xs">{eventSentence(block, e, fmtX)}</Text>)}
            {refusedPoints(block).map((r, k) => (
              <Text key={`r${k}`} size="xs" c="red" style={{ whiteSpace: "pre-wrap" }}>
                REFUSED at {fmtX(r.at)}: {r.reason}
              </Text>))}
            {notes.map((l, k) => <Text key={`n${k}`} size="xs" c="dimmed">{l}</Text>)}
            {announcements(block).map((a, k) => (
              <Text key={`a${k}`} size="xs" c="orange" style={{ whiteSpace: "pre-wrap" }}>
                first raised at {fmtX(a.at)} ({a.category}{a.locus ? `, ${a.locus}` : ""}): {a.message}
              </Text>))}
            {block.notModelled.length > 0 && (
              <Text size="xs" c="dimmed">Not modelled by this scan: {block.notModelled.join("; ")}.</Text>)}
            <Text size="xs" c="dimmed">
              Every number above is the engine&apos;s; the bars are its amounts stacked, a shaded band is the
              interval between the two grid points a change lies between, and a refused point is a gap.
            </Text>
          </Stack>
        </>
      ) : busy ? (
        <Box style={{ flex: 1, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">solving the phase split at every point…</Text></Group>
        </Box>
      ) : null}
    </Stack>
  );

  return narrow ? (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      <Button size="xs" variant="light" color="gray"
        rightSection={listsOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        onClick={() => setListsOpen((o) => !o)} style={{ alignSelf: "flex-start" }}>
        feed · sweep · system
      </Button>
      <Collapse in={listsOpen}>
        <ScrollArea.Autosize mah="50vh" type="auto">{panel}</ScrollArea.Autosize>
      </Collapse>
      <Box style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>{figures}</Box>
    </Stack>
  ) : (
    <Group gap="md" align="stretch" wrap="nowrap" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      <ScrollArea style={{ width: 300, flexShrink: 0 }} type="auto">{panel}</ScrollArea>
      <Box style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>{figures}</Box>
    </Group>
  );
}
