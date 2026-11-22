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
  UserPointsPanel -- "load your measurements" (DEV.md 4c C289).

  THE USER'S TASK, in one sentence: "I have my own points for this pair (or
  this compound); how far is the fitted record from them, and which of my
  points does it disagree with by more than the record itself claims?"

  The file is read with FileReader in this browser and NEVER sent anywhere.
  Parsing, the hash and the outlier rule are case/userMeasurements.ts; the
  model values are the ENGINE's (one choupoProps run asked AT the points,
  case/userMeasurementsSynth.ts) -- no model is evaluated in TypeScript.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Box, Button, Checkbox, FileButton, Group, Loader, Select, Stack, Table, Text } from "@mantine/core";

import { resolveAdapter } from "../../adapters/index.js";
import type { DossierProperty } from "../../case/dossier.js";
import type { EvidenceDataset } from "../../case/evidence.js";
import {
  ACCEPTED_FORMAT, hashVerdict, outlierRule, parseMeasurementsCsv, sha256Hex,
  type Subject, type UserMeasurements,
} from "../../case/userMeasurements.js";
import { userResults, userRunPlan, type UserResult } from "../../case/userMeasurementsSynth.js";
import { kToDisplay, temperatureLabel } from "../../state/displayUnits.js";
import { useStore } from "../../state/store.js";
import { Plot, PLOT_CONFIG, darkLayout } from "../plotting/plotly.js";
import type { JsonDict } from "../../dict/index.js";
import { VerdictCell } from "./ComponentInspector.js";

export interface PanelCandidate {
  id: string;
  label: string;
  /** pairs: the `activityModel {}` block of this record */
  activityModel?: JsonDict;
  /** the curation dossier that cites this record, or null */
  dossier: DossierProperty | null;
}

export function UserPointsPanel({ subject, candidates, claimable, componentFiles, narrow }: {
  subject: Subject;
  candidates: PanelCandidate[];
  /** the record's own datasets the user may claim the file to be */
  claimable: EvidenceDataset[];
  componentFiles?: { [relPath: string]: string };
  narrow: boolean;
}) {
  const tUnit = useStore((s) => s.displayPrefs.temperature);
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [sha, setSha] = useState<string>("");
  const [claim, setClaim] = useState<string | null>(null);   // dataset id or null
  const [candId, setCandId] = useState<string>(candidates[0]?.id ?? "");
  const [result, setResult] = useState<UserResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const cand = candidates.find((c) => c.id === candId) ?? candidates[0] ?? null;
  const parsed = useMemo(() => (text === null ? null : parseMeasurementsCsv(text, subject)), [text, subject]);
  const data: UserMeasurements | null = parsed && parsed.ok ? parsed.data : null;
  const rule = useMemo(() => outlierRule(cand?.dossier
    ? { aadHeldOutPct: cand.dossier.aadHeldOutPct, acceptanceMaxAADPct: cand.dossier.acceptanceMaxAADPct }
    : null), [cand]);
  const claimed = claimable.find((d) => d.id === claim) ?? null;
  const verdict = sha ? hashVerdict(sha, claimed?.provenance.sha256 ?? "", claimed !== null) : null;

  const onFile = async (f: File | null) => {
    if (!f) return;
    //  the file is read HERE, in this tab; nothing below touches the network
    const buf = await f.arrayBuffer();
    setFileName(f.name);
    setText(new TextDecoder("utf-8").decode(buf));
    setSha(await sha256Hex(buf));
    setResult(null); setRunError(null);
  };

  const plan = useMemo(() => {
    if (!data) return null;
    const components = subject.kind === "pair" ? [...subject.components] : [subject.component];
    return userRunPlan({ data, components, activityModel: cand?.activityModel, componentFiles });
  }, [data, subject, cand, componentFiles]);

  useEffect(() => {
    if (!plan || !data) return;
    const my = ++seq.current;
    const ctrl = new AbortController();
    setBusy(true); setRunError(null);
    void (async () => {
      try {
        const resolved = await resolveAdapter("wasm");
        if (my !== seq.current) return;
        if (resolved.kind === "unavailable") {
          setRunError(resolved.fallbackReason ?? "The real (WebAssembly) solver could not be loaded.");
          return;
        }
        const r = await resolved.adapter.run(plan.files, () => {}, ctrl.signal, "choupoProps");
        if (my !== seq.current) return;
        if (r.status !== "done") {
          const why = r.log.split("\n").map((l) => l.trim()).reverse()
            .find((l) => /(?:error|fatal|refused|failed)/i.test(l));
          setRunError(`choupoProps did not finish${why ? `: ${why}` : ""}`);
          return;
        }
        const res = userResults(plan, data, rule, r.csvFiles);
        if (res.missing.length > 0) setRunError(`${res.missing.length} operation(s) returned no CSV`);
        setResult(res);
      } catch (e) {
        if (!ctrl.signal.aborted) setRunError(e instanceof Error ? e.message : String(e));
      } finally {
        if (my === seq.current) setBusy(false);
      }
    })();
    return () => ctrl.abort();
  }, [plan, data, rule]);

  const tLabel = temperatureLabel(tUnit);
  const figure = useMemo(() => {
    if (!result || !data) return null;
    const isT = data.kind === "txy";
    const conv = (v: number | null) => (v === null ? null : isT ? kToDisplay(v, tUnit) : v / 1000);
    const traces: Record<string, unknown>[] = [];
    result.curves.forEach((cv, k) => traces.push({
      type: "scatter", mode: "lines", name: `${cand?.id ?? "record"}${result.curves.length > 1 ? ` @ ${data.kind === "txy" ? (cv.cond / 1000).toFixed(1) + " kPa" : data.kind === "pxy" ? cv.cond.toFixed(2) + " K" : ""}` : ""}`,
      x: data.kind === "psat" ? cv.x.map((T) => kToDisplay(T, tUnit)) : cv.x,
      y: cv.v.map(conv), line: { width: 1.6 },
      showlegend: true, legendgroup: `c${k}`,
    }));
    const pts = result.points;
    const xOf = (p: typeof pts[number]) => (data.kind === "psat"
      ? kToDisplay(data.points[p.index]!.T, tUnit) : p.x);
    const ok = pts.filter((p) => !p.outlier), bad = pts.filter((p) => p.outlier);
    const yOf = (p: typeof pts[number]) => (isT ? kToDisplay(p.measured, tUnit) : p.measured / 1000);
    traces.push({ type: "scatter", mode: "markers", name: "your points", x: ok.map(xOf), y: ok.map(yOf),
      marker: { symbol: "circle-open", size: 9, line: { width: 1.8 } } });
    if (bad.length > 0)
      traces.push({ type: "scatter", mode: "markers", name: `outliers (${bad.length})`, x: bad.map(xOf), y: bad.map(yOf),
        marker: { symbol: "x", size: 11, color: "#e53935", line: { width: 2.2, color: "#e53935" } } });
    const xTitle = data.kind === "psat" ? `T (${tLabel})` : `x (${data.xComponent}), liquid mole fraction`;
    const yTitle = isT ? `T_bubble (${tLabel})` : data.kind === "pxy" ? "P_bubble (kPa)" : "Psat (kPa)";
    return { traces, layout: {
      ...darkLayout, autosize: true, showlegend: true,
      xaxis: { ...darkLayout.xaxis, title: { text: xTitle } },
      yaxis: { ...darkLayout.yaxis, title: { text: yTitle }, ...(data.kind === "psat" ? { type: "log" } : {}) },
      legend: { ...darkLayout.legend, orientation: "h", x: 0, y: -0.25, xanchor: "left", yanchor: "top" },
      margin: { ...darkLayout.margin, b: 100 },
    } };
  }, [result, data, cand, tUnit, tLabel]);

  const measuredUnit = data ? (data.kind === "txy" ? "K" : "Pa") : "";

  return (
    <Stack gap="xs" data-testid="user-points-panel">
      <Text size="xs" fw={600} c="dimmed" tt="uppercase">Load your measurements</Text>
      <Text size="xs" c="dimmed">
        The file is read in this browser and never uploaded. The model curve and every model value at your
        points are the engine&apos;s (one choupoProps run); nothing is fitted.
      </Text>
      <Box>
        {ACCEPTED_FORMAT.map((l, i) => <Text key={i} size="xs" c="dimmed" ff="monospace">{l}</Text>)}
      </Box>
      <Group gap="xs" wrap="wrap">
        <FileButton onChange={(f) => { void onFile(f); }} accept=".csv,.txt,text/csv,text/plain">
          {(props) => <Button size="compact-xs" variant="light" {...props}>choose a CSV file</Button>}
        </FileButton>
        {fileName && <Text size="xs" ff="monospace">{fileName}</Text>}
        {candidates.length > 1 && (
          <Select size="xs" data={candidates.map((c) => ({ value: c.id, label: c.label }))} value={candId}
            onChange={(v) => v && setCandId(v)} allowDeselect={false} w={narrow ? "100%" : 280}
            aria-label="record to draw" />)}
      </Group>

      {claimable.length > 0 && text !== null && (
        <Group gap="xs" wrap="wrap" align="center">
          <Checkbox size="xs" checked={claim !== null} label="this file is the record's own dataset:"
            onChange={(e) => setClaim(e.currentTarget.checked ? claimable[0]!.id : null)} />
          {claim !== null && (
            <Select size="xs" data={claimable.map((d) => ({ value: d.id, label: d.id }))} value={claim}
              onChange={(v) => setClaim(v)} allowDeselect={false} w={280} aria-label="claimed dataset" />)}
        </Group>)}
      {verdict && (
        <Alert p="xs" variant="light" color={verdict.state === "match" ? "green" : verdict.state === "mismatch" ? "red" : "gray"}>
          <Text size="xs">{verdict.text}</Text>
          <Text size="xs" c="dimmed" ff="monospace" style={{ wordBreak: "break-all" }}>sha256 {sha}</Text>
        </Alert>)}

      {parsed && !parsed.ok && (
        <Alert color="red" variant="light" p="xs" title="This file is refused">
          <Text size="xs">{parsed.refusal}</Text>
        </Alert>)}

      {cand?.dossier ? (
        <Group gap={6} wrap="wrap" data-testid="fit-note">
          <Text size="xs" fw={600}>Fit note of {cand.id}:</Text>
          <VerdictCell v={cand.dossier.verdict} />
          <Text size="xs" c="dimmed">
            held-out AAD {cand.dossier.aadHeldOutPct?.toFixed(3) ?? "not recorded"} %
            {cand.dossier.acceptanceMaxAADPct !== null ? `, band ${cand.dossier.acceptanceMaxAADPct} % declared before the fit` : ""}
            {" "}(case {cand.dossier.caseName})
          </Text>
        </Group>
      ) : cand ? (
        <Text size="xs" c="dimmed" data-testid="fit-note">
          No curation dossier cites {cand.id}: no held-out AAD or verdict is declared for it.
        </Text>) : null}
      {data && <Text size="xs" c="dimmed" data-testid="outlier-rule">Outliers: {rule.text}</Text>}

      {busy && <Group gap={8}><Loader size="xs" /><Text size="xs" c="dimmed">asking the engine at your points...</Text></Group>}
      {runError && <Alert color="red" variant="light" p="xs" title="The engine refused or did not finish"><Text size="xs">{runError}</Text></Alert>}
      {figure && (
        <Box style={{ height: narrow ? 360 : 380 }}>
          <Plot data={figure.traces as never} layout={figure.layout as never}
            config={narrow ? { ...PLOT_CONFIG, displayModeBar: false } : PLOT_CONFIG}
            style={{ width: "100%", height: "100%" }} useResizeHandler />
        </Box>)}
      {result && data && (
        <>
          <Text size="xs">
            {result.nUsed} of {data.points.length} points answered by the engine; mean |relative residual|{" "}
            {result.aadRelPct === null ? "n/a" : `${result.aadRelPct.toFixed(3)} %`}; {result.nOutliers} outlier(s).
          </Text>
          <Table fz="xs" striped verticalSpacing={2} horizontalSpacing={6}>
            <Table.Thead><Table.Tr>
              <Table.Th>#</Table.Th><Table.Th>x</Table.Th>
              <Table.Th>measured ({measuredUnit})</Table.Th><Table.Th>engine ({measuredUnit})</Table.Th>
              <Table.Th>rel. residual</Table.Th><Table.Th />
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {result.points.map((p) => (
                <Table.Tr key={p.index}>
                  <Table.Td>{p.index + 1}</Table.Td>
                  <Table.Td>{p.x === null ? "" : p.x.toFixed(4)}</Table.Td>
                  <Table.Td>{p.measured.toPrecision(6)}</Table.Td>
                  <Table.Td>{p.engine === null ? "no answer" : p.engine.toPrecision(6)}</Table.Td>
                  <Table.Td>{p.relPct === null ? "" : `${p.relPct.toFixed(3)} %`}</Table.Td>
                  <Table.Td>{p.outlier && <Badge size="xs" color="red" variant="light">outlier</Badge>}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>)}
    </Stack>
  );
}
