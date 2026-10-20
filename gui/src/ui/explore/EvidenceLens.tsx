/*---------------------------------------------------------------------------*\
  EvidenceLens — measured datasets for a PAIR against every candidate model,
  residuals at the measured conditions (DEV.md 4c C117; docs/design/
  evidence-as-a-first-class-object.md §7).

  WHAT IT SHOWS.  Left (or folded, on a phone): the DATASETS some tier carries
  for this pair (citation, doi, points, review status, where it lives) and the
  CANDIDATE MODELS (every parameter record of any tier, each labelled by tier
  and provenance, plus UNIFAC, COSMO-SAC where installed, ideal), both as
  checkboxes.  Right: the measured points with their own uncertainty bars
  under one curve per candidate; a residual panel per candidate; the AAD
  table; the curation verdict beside a candidate a dossier cites.

  WHAT IT COMPUTES.  Nothing physical.  Each candidate is ONE `choupoProps`
  run (case/evidenceSynth.ts), the candidate's parameters INLINE, asked AT
  the measured x through `vary { points ( ... ) }`; the residual is the
  engine's value minus the measurement, and the AAD is the mean of the
  residuals on screen.  No interpolation, no fit, no γ in TypeScript.  "The
  GUI fits nothing" is the whole contract, and the student decides.

  THE ADDRESS.  `?workspace=properties&components=methanol,water
  &lens=evidence&datasets=<id>,<id>&models=<candidateId>,...` -- read at
  boot, rewritten in place (replaceState) on every change, so the picture a
  professor pastes is the picture a student gets.  Absent lists mean "all".

  DEV ONLY, and tree-shaken out of a production build: `window.
  __choupoEvidencePlans` exposes the synthesised cases and `window.
  __choupoEvidenceRecorded[candidateId].csvFiles` is read in place of the
  engine when set -- the way a native run's outputs are fed to this view on a
  machine with no WASM build (the C105 approach, used for the screenshots).
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Anchor, Badge, Box, Button, Checkbox, Collapse, Group, Loader, ScrollArea, Stack, Table, Text,
  Tooltip,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import { resolveAdapter } from "../../adapters/index.js";
import type { ComponentMeta } from "../../case/catalogue.js";
import { dossiersFor, type DossierProperty } from "../../case/dossier.js";
import { evidenceForPair, type EvidenceDataset, type EvidenceTier } from "../../case/evidence.js";
import {
  evidenceCandidates, evidenceResults, evidenceRunPlan,
  type EvidenceCandidate, type EvidenceResult,
} from "../../case/evidenceSynth.js";
import type { UnifacGroup } from "../../case/unifacGroups.js";
import { kToDisplay, temperatureLabel } from "../../state/displayUnits.js";
import { useStore } from "../../state/store.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "../plotting/plotly.js";
import { VerdictCell } from "./ComponentInspector.js";
import { evidenceLink, evidenceSelectionInSearch } from "./selectionLink.js";

/** Marker symbols for the datasets (a dataset is told by its SHAPE, a
 *  candidate by its COLOUR -- the two grammars never share an axis). */
const DATASET_SYMBOLS = ["circle", "square", "diamond", "triangle-up", "cross", "star"];

declare global {
  interface Window {
    __choupoEvidencePlans?: { [candidateId: string]: unknown };
    __choupoEvidenceRecorded?: { [candidateId: string]: { csvFiles?: { [f: string]: string } } };
  }
}

function tierWord(t: EvidenceTier): string {
  return t === "local" ? "data/local" : t === "case" ? "open case" : "tutorial";
}

/** The dossier entry that CITES a candidate: a record naming `fittedInCase`
 *  is the derivative of that case's fit, and the case's dossier is the
 *  verdict about it.  A predictive model and a literature pair are cited by
 *  no dossier, which is the honest answer and is drawn as none. */
function dossierFor(c: EvidenceCandidate, pair: [string, string]): DossierProperty | null {
  const casePath = c.record?.provenance.fittedInCase;
  if (!casePath) return null;
  const all = [...dossiersFor(pair[0]), ...dossiersFor(pair[1])];
  return all.find((d) => d.casePath === casePath && d.property === "binaryVLE.T_bubble") ?? null;
}

export function EvidenceLens({ pair, catalogue, caseRaw, localUnifac, componentFiles, narrow }: {
  pair: [string, string];
  catalogue: ComponentMeta[];
  caseRaw?: { [relPath: string]: string };
  localUnifac: Record<string, UnifacGroup[]>;
  componentFiles?: { [relPath: string]: string };
  narrow: boolean;
}) {
  const prefs = useStore((s) => s.displayPrefs);
  const tUnit = prefs.temperature;
  const datasets = useMemo(() => evidenceForPair(pair[0], pair[1], caseRaw), [pair, caseRaw]);
  const candidates = useMemo(
    () => evidenceCandidates(pair, catalogue, caseRaw, localUnifac), [pair, catalogue, caseRaw, localUnifac]);

  //  THE SELECTION, booted from the address; an absent key means "all".
  const boot = useMemo(() => (typeof window === "undefined"
    ? { datasets: null, models: null } : evidenceSelectionInSearch(window.location.search)), []);
  const [selData, setSelData] = useState<Set<string>>(
    () => new Set(boot.datasets ?? datasets.map((d) => d.id)));
  const [selModels, setSelModels] = useState<Set<string>>(
    () => new Set(boot.models ?? candidates.map((c) => c.id)));
  const [listsOpen, setListsOpen] = useState(false);

  //  The address follows the selection (replaceState: a change of lens or
  //  checkbox is not a navigation).
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") return;
    try {
      const link = evidenceLink(pair, datasets.filter((d) => selData.has(d.id)).map((d) => d.id),
                                candidates.filter((c) => selModels.has(c.id)).map((c) => c.id));
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${link}${window.location.hash}`);
    } catch { /* an address that cannot be written is not a reason to stop drawing */ }
  }, [pair, datasets, candidates, selData, selModels]);

  const chosenData = useMemo(() => datasets.filter((d) => selData.has(d.id)), [datasets, selData]);
  const chosenModels = useMemo(() => candidates.filter((c) => selModels.has(c.id)), [candidates, selModels]);

  //  ONE run per candidate, in parallel, the previous batch aborted.
  const [results, setResults] = useState<{ [id: string]: EvidenceResult }>({});
  const [errors, setErrors] = useState<{ [id: string]: string }>({});
  const [skipped, setSkipped] = useState<{ datasetId: string; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [adapterNote, setAdapterNote] = useState<string | null>(null);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const seq = ++seqRef.current;
    const plans = chosenModels.map((c) => evidenceRunPlan(pair, chosenData, c, { componentFiles }));
    setSkipped(plans[0]?.skipped ?? []);
    if (import.meta.env.DEV && typeof window !== "undefined")
      window.__choupoEvidencePlans = Object.fromEntries(plans.map((p) => [p.candidate.id, p.files]));
    if (plans.length === 0 || chosenData.length === 0) {
      setResults({}); setErrors({}); setBusy(false); return;
    }
    setBusy(true);
    try {
      const recorded = import.meta.env.DEV && typeof window !== "undefined"
        ? window.__choupoEvidenceRecorded : undefined;
      const resolved = recorded ? null : await resolveAdapter("wasm");
      if (seq !== seqRef.current) return;
      if (resolved && resolved.kind !== "wasm") {
        setAdapterNote(resolved.fallbackReason ?? "The real (WebAssembly) solver could not be loaded.");
        if (resolved.kind === "unavailable") { setBusy(false); return; }
      } else setAdapterNote(null);
      const nextResults: { [id: string]: EvidenceResult } = {};
      const nextErrors: { [id: string]: string } = {};
      await Promise.all(plans.map(async (plan) => {
        const id = plan.candidate.id;
        try {
          let csvFiles: { [f: string]: string } | undefined;
          let log = "";
          if (recorded) {
            csvFiles = recorded[id]?.csvFiles;
            if (!csvFiles) nextErrors[id] = "no recorded run for this candidate";
          } else {
            const r = await resolved!.adapter.run(plan.files, () => {}, ctrl.signal, "choupoProps");
            csvFiles = r.csvFiles;
            log = r.log;
            if (r.status !== "done") {
              const why = log.split("\n").map((l) => l.trim()).reverse()
                .find((l) => /(?:error|fatal|refused|failed)/i.test(l));
              nextErrors[id] = `choupoProps did not finish${why ? `: ${why}` : ""}`;
            }
          }
          const res = evidenceResults(plan, chosenData, csvFiles);
          if (res.missing.length > 0 && !nextErrors[id])
            nextErrors[id] = `${res.missing.length} of ${plan.ops.length} operation(s) returned no CSV`;
          nextResults[id] = res;
        } catch (e) {
          if (!ctrl.signal.aborted) nextErrors[id] = e instanceof Error ? e.message : String(e);
        }
      }));
      if (seq !== seqRef.current) return;
      setResults(nextResults); setErrors(nextErrors);
    } finally {
      if (seq === seqRef.current) setBusy(false);
    }
  }, [pair, chosenData, chosenModels, componentFiles]);

  useEffect(() => {
    const t = setTimeout(() => { void run(); }, 300);
    return () => clearTimeout(t);
  }, [run]);

  const xComponent = chosenData.length
    ? (evidenceRunPlan(pair, chosenData, candidates[candidates.length - 1]!).xComponent) : pair[0];
  const colourOf = (c: EvidenceCandidate) =>
    PLOT_COLORS.series[candidates.indexOf(c) % PLOT_COLORS.series.length]!;
  const symbolOf = (d: EvidenceDataset) => DATASET_SYMBOLS[datasets.indexOf(d) % DATASET_SYMBOLS.length]!;
  const tLabel = temperatureLabel(tUnit);

  // ---- the main figure: points with error bars, one curve per candidate ---
  const mainTraces = useMemo(() => {
    const out: Record<string, unknown>[] = [];
    for (const c of chosenModels) {
      const r = results[c.id];
      if (!r) continue;
      r.curves.forEach((cv, k) => out.push({
        type: "scattergl", mode: "lines", name: c.id, legendgroup: c.id, showlegend: k === 0,
        x: cv.x, y: cv.T.map((T) => (T === null ? null : kToDisplay(T, tUnit))),
        line: { color: colourOf(c), width: 1.6, dash: k % 2 === 0 ? "solid" : "dot" },
        hovertemplate: `${c.id} at ${(cv.P / 1000).toFixed(2)} kPa<br>x = %{x:.3f}<br>T = %{y:.2f} ${tLabel}<extra></extra>`,
      }));
    }
    //  the measured points once, read off any answered candidate (their x,
    //  T and uncertainty are the dataset's, identical across candidates)
    const src = chosenModels.map((c) => results[c.id]).find((r) => r && r.byDataset.length > 0);
    for (const d of chosenData) {
      const dr = src?.byDataset.find((b) => b.datasetId === d.id);
      if (!dr) continue;
      const hasU = dr.points.some((p) => p.uncertaintyK !== null);
      out.push({
        type: "scattergl", mode: "markers", name: `measured: ${d.id}`,
        x: dr.points.map((p) => p.x), y: dr.points.map((p) => kToDisplay(p.measuredK, tUnit)),
        marker: { symbol: symbolOf(d), size: 7, color: "rgba(0,0,0,0)",
                  line: { color: PLOT_COLORS.text, width: 1.4 } },
        ...(hasU ? { error_y: { type: "data", array: dr.points.map((p) => p.uncertaintyK ?? 0),
                                visible: true, color: PLOT_COLORS.axis, thickness: 1, width: 3 } } : {}),
        hovertemplate: `${d.id}<br>x = %{x:.3f}<br>T = %{y:.2f} ${tLabel} at %{customdata:.2f} kPa<extra></extra>`,
        customdata: dr.points.map((p) => p.P / 1000),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, chosenModels, chosenData, tUnit]);

  // ---- the residual panels: one row per candidate -------------------------
  const residual = useMemo(() => {
    const rows = chosenModels.filter((c) => results[c.id]);
    const traces: Record<string, unknown>[] = [];
    const layout: Record<string, unknown> = {};
    rows.forEach((c, i) => {
      const ax = i === 0 ? "" : String(i + 1);
      const r = results[c.id]!;
      for (const d of chosenData) {
        const dr = r.byDataset.find((b) => b.datasetId === d.id);
        if (!dr) continue;
        traces.push({
          type: "scattergl", mode: "markers", name: `${c.id} − ${d.id}`, showlegend: false,
          xaxis: `x${ax}`, yaxis: `y${ax}`,
          x: dr.points.map((p) => p.x), y: dr.points.map((p) => p.residualK),
          marker: { symbol: symbolOf(d), size: 6, color: colourOf(c) },
          error_y: { type: "data", array: dr.points.map((p) => p.uncertaintyK ?? 0), visible: true,
                     color: PLOT_COLORS.axis, thickness: 1, width: 2 },
          hovertemplate: `${c.id} − ${d.id}<br>x = %{x:.3f}<br>residual = %{y:.3f} K<extra></extra>`,
        });
      }
      layout[`yaxis${ax}`] = { ...darkLayout.yaxis, title: { text: `${c.id}  (K)`, font: { size: 11 } },
                               zeroline: true, zerolinewidth: 1.5, zerolinecolor: colourOf(c) };
      layout[`xaxis${ax}`] = { ...darkLayout.xaxis, ...(i === rows.length - 1
        ? { title: { text: `x (${xComponent}), liquid mole fraction` } } : { showticklabels: false }) };
    });
    return { traces, layout, n: rows.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, chosenModels, chosenData, xComponent]);

  const lists = (
    <Stack gap="sm">
      <Box>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Measured datasets ({datasets.length})</Text>
        <Stack gap={6} mt={4}>
          {datasets.map((d) => (
            <Checkbox key={d.id} size="xs" checked={selData.has(d.id)}
              onChange={(e) => {
                const next = new Set(selData);
                if (e.currentTarget.checked) next.add(d.id); else next.delete(d.id);
                setSelData(next);
              }}
              label={(
                <Stack gap={0}>
                  <Group gap={6} wrap="nowrap">
                    <Text size="xs" fw={500} style={{ fontFamily: "monospace" }}>{d.id}</Text>
                    <Badge size="xs" variant="outline" color="gray" tt="none">{tierWord(d.tier)}</Badge>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={2}>{d.provenance.citation || "(no citation)"}</Text>
                  <Group gap={6} wrap="wrap">
                    {d.provenance.doi && (
                      <Anchor size="xs" href={`https://doi.org/${d.provenance.doi}`} target="_blank" rel="noopener">
                        doi:{d.provenance.doi}
                      </Anchor>)}
                    <Text size="xs" c="dimmed">
                      {d.nPoints} pts{d.pureEndpointsSetAside ? ` (+${d.pureEndpointsSetAside} pure endpoints set aside)` : ""}
                      {d.heldPressurePa !== null ? ` · ${(d.heldPressurePa / 1000).toFixed(2)} kPa` : " · P per point"}
                      {d.provenance.reviewStatus ? ` · ${d.provenance.reviewStatus}` : ""}
                      {d.caseName && d.tier !== "case" ? ` · ${d.caseName}` : ""}
                      {d.alsoIn.length ? ` · also in ${d.alsoIn.map(tierWord).join(", ")}` : ""}
                    </Text>
                  </Group>
                </Stack>
              )} />
          ))}
        </Stack>
        {skipped.length > 0 && (
          <Text size="xs" c="orange" mt={4}>
            Not evaluated: {skipped.map((s) => `${s.datasetId} — ${s.reason}`).join("; ")}
          </Text>)}
      </Box>
      <Box>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Candidate models ({candidates.length})</Text>
        <Stack gap={6} mt={4}>
          {candidates.map((c) => {
            const doss = dossierFor(c, pair);
            return (
              <Checkbox key={c.id} size="xs" checked={selModels.has(c.id)}
                onChange={(e) => {
                  const next = new Set(selModels);
                  if (e.currentTarget.checked) next.add(c.id); else next.delete(c.id);
                  setSelModels(next);
                }}
                label={(
                  <Stack gap={0}>
                    <Group gap={6} wrap="nowrap">
                      <Box style={{ width: 10, height: 10, borderRadius: 2, background: colourOf(c), flexShrink: 0 }} />
                      <Text size="xs" fw={500}>{c.id}</Text>
                      {doss && <VerdictCell v={doss.verdict} />}
                    </Group>
                    <Text size="xs" c="dimmed">{c.provenanceLabel}{c.record ? ` · ${c.record.file}` : ""}</Text>
                    {doss && (
                      <Text size="xs" c="dimmed">
                        dossier {doss.caseName}: held-out AAD {doss.aadHeldOutPct?.toFixed(3) ?? "—"} %
                        {doss.acceptanceMaxAADPct !== null ? ` against a band of ${doss.acceptanceMaxAADPct} % declared before the fit` : ""}
                      </Text>)}
                  </Stack>
                )} />
            );
          })}
        </Stack>
      </Box>
    </Stack>
  );

  const aadTable = (() => {
    const rows = chosenModels.filter((c) => results[c.id]);
    if (rows.length === 0) return null;
    return (
      <Table fz="xs" withTableBorder={false} striped highlightOnHover verticalSpacing={2} horizontalSpacing={6}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>candidate</Table.Th>
            {chosenData.map((d) => <Table.Th key={d.id}>{d.id}: AAD (K) · rel % · bias (K) · n</Table.Th>)}
            <Table.Th>dossier</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((c) => {
            const r = results[c.id]!;
            const doss = dossierFor(c, pair);
            return (
              <Table.Tr key={c.id}>
                <Table.Td><Text size="xs" style={{ color: colourOf(c) }} fw={600}>{c.id}</Text></Table.Td>
                {chosenData.map((d) => {
                  const b = r.byDataset.find((q) => q.datasetId === d.id);
                  return (
                    <Table.Td key={d.id}>
                      {b && b.aadK !== null
                        ? `${b.aadK.toFixed(3)} · ${b.aadRelPct!.toFixed(3)} % · ${b.biasK! >= 0 ? "+" : ""}${b.biasK!.toFixed(3)} · ${b.nUsed}/${b.nMeasured}`
                        : "—"}
                    </Table.Td>
                  );
                })}
                <Table.Td>{doss ? <VerdictCell v={doss.verdict} /> : <Text size="xs" c="dimmed">none cites it</Text>}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    );
  })();

  const errorLines = Object.entries(errors);
  const haveAny = chosenModels.some((c) => results[c.id] && results[c.id]!.byDataset.length > 0);

  const figures = (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      {adapterNote && (
        <Alert color="orange" variant="light" p="xs">
          <Text size="xs">{adapterNote}  The Evidence view draws nothing it did not get from the engine.</Text>
        </Alert>)}
      {errorLines.length > 0 && (
        <Alert color="red" variant="light" p="xs" title="The engine refused or did not finish">
          {errorLines.map(([id, m]) => <Text key={id} size="xs"><b>{id}</b>: {m}</Text>)}
        </Alert>)}
      {haveAny ? (
        <>
          <Box style={{ flex: 3, minHeight: 240, position: "relative" }}>
            <Plot data={mainTraces as never}
              layout={{
                ...darkLayout, autosize: true, showlegend: true,
                title: { text: `${pair[0]} + ${pair[1]}: bubble temperature, measured vs candidates`, font: { size: 13 } },
                legend: { ...darkLayout.legend, x: 1, y: 1, xanchor: "right", yanchor: "top" },
                xaxis: { ...darkLayout.xaxis, title: { text: `x (${xComponent}), liquid mole fraction` }, range: [0, 1] },
                yaxis: { ...darkLayout.yaxis, title: { text: `T_bubble (${tLabel})` } },
                margin: { ...darkLayout.margin, b: 48 },
              } as never}
              config={PLOT_CONFIG} style={{ width: "100%", height: "100%" }} useResizeHandler />
            {busy && (
              <Box style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                justifyContent: "center", background: "light-dark(rgba(255,255,255,0.45), rgba(0,0,0,0.45))" }}>
                <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">asking the engine at the measured points…</Text></Group>
              </Box>)}
          </Box>
          {residual.n > 0 && (
            <Box style={{ flex: 2, minHeight: 60 * residual.n + 60 }}>
              <Plot data={residual.traces as never}
                layout={{
                  ...darkLayout, autosize: true, showlegend: false,
                  grid: { rows: residual.n, columns: 1, pattern: "independent", roworder: "top to bottom" },
                  title: { text: "residual = engine − measurement at the measured x (error bars: the dataset's own uncertainty)", font: { size: 12 } },
                  margin: { ...darkLayout.margin, b: 44, t: 32 },
                  ...residual.layout,
                } as never}
                config={PLOT_CONFIG} style={{ width: "100%", height: "100%" }} useResizeHandler />
            </Box>)}
          <ScrollArea.Autosize mah={160} type="auto">{aadTable}</ScrollArea.Autosize>
          <Text size="xs" c="dimmed">
            AAD = mean |engine − measurement| over the points the engine answered; rel % = mean |residual| / T_measured.
            Every value is the engine's at the measured x and P; the GUI subtracts and averages, and fits nothing.
          </Text>
        </>
      ) : busy ? (
        <Box style={{ flex: 1, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">asking the engine at the measured points…</Text></Group>
        </Box>
      ) : (
        <Box style={{ flex: 1, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Text size="sm" c="dimmed" ta="center" maw={460}>
            {chosenData.length === 0 ? "Tick at least one measured dataset."
              : chosenModels.length === 0 ? "Tick at least one candidate model."
              : "Nothing came back from the engine for this selection."}
          </Text>
        </Box>
      )}
    </Stack>
  );

  if (datasets.length === 0)
    return (
      <Box style={{ flex: 1, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Text size="sm" c="dimmed" ta="center" maw={460}>
          No measured dataset for {pair[0]} + {pair[1]} in the bundled tutorials, data/local/evidence or the open case.
        </Text>
      </Box>
    );

  return narrow ? (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      <Button size="xs" variant="light" color="gray"
        rightSection={listsOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        onClick={() => setListsOpen((o) => !o)} style={{ alignSelf: "flex-start" }}>
        datasets {selData.size}/{datasets.length} · models {selModels.size}/{candidates.length}
      </Button>
      <Collapse in={listsOpen}>
        <ScrollArea.Autosize mah="40vh" type="auto">{lists}</ScrollArea.Autosize>
      </Collapse>
      <Box style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>{figures}</Box>
    </Stack>
  ) : (
    <Group gap="md" align="stretch" wrap="nowrap" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      <ScrollArea style={{ width: 300, flexShrink: 0 }} type="auto">
        <Tooltip label="A dataset is drawn by its marker shape, a candidate by its colour." withArrow>
          <Box>{lists}</Box>
        </Tooltip>
      </ScrollArea>
      <Box style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>{figures}</Box>
    </Group>
  );
}
