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
  EnvelopeLens — the P-T phase envelope of ONE mixture feed (2026-11-15).

  WHAT IT SHOWS.  Left (folded behind one button on a phone): the feed in
  moles, the vapour's equation of state, the marched pressure range.  Right:
  the bubble and dew branches in the (T, P) plane as the engine kept them;
  a hollow marker at the last kept point of a branch that STOPPED, labelled
  with the pressure at which it stopped; a star at a cricondentherm, ONLY
  where the engine reported one; and, under the figure, how each branch
  ended -- reached the top of the range, stopped, or never started -- with
  the engine's own sentence, the method statement it prints on every run
  (it does not close the nose), and every other announcement of the run.

  WHAT IT COMPUTES.  Nothing physical.  ONE `choupoProps` run of ONE
  `phaseEnvelope` op (case/phaseEnvelopeLens.ts builds it and reads the
  answer).  The two branches are NEVER joined: an open nose is drawn open.
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Anchor, Box, Button, Collapse, Group, Loader, NumberInput, ScrollArea, Select, Stack, Text,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import { resolveAdapter } from "../../adapters/index.js";
import type { Advisory, OperationResult } from "../../adapters/SolverAdapter.js";
import type { ComponentMeta } from "../../case/catalogue.js";
import {
  ENVELOPE_EOS, ENVELOPE_OUTPUT, EXPLORER_GUIDE_ENVELOPE, envelopeModelWhy, envelopePlan,
  envelopeReport, readEnvelopeCsv, type EnvelopeReport,
} from "../../case/phaseEnvelopeLens.js";
import { guideUrl, openGuide } from "../../help/guideLinks.js";
import {
  kToDisplay, paToDisplay, parsePressure, pressureLabel, temperatureLabel,
} from "../../state/displayUnits.js";
import { useStore } from "../../state/store.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "../plotting/plotly.js";
import { EnvelopeReportPanel } from "./EnvelopeReportPanel.js";

export function EnvelopeLens({ components, componentFiles, narrow }: {
  components: string[];
  catalogue: ComponentMeta[];
  componentFiles?: { [relPath: string]: string };
  narrow: boolean;
}) {
  const prefs = useStore((s) => s.displayPrefs);
  const tU = prefs.temperature;
  const pU = prefs.pressure;

  // ---- the student's choices (canonical SI in state) ----------------------
  const [amounts, setAmounts] = useState<{ [c: string]: number }>({});
  const [eos, setEos] = useState<string>("PR");
  const [pFrom, setPFrom] = useState(1.0e5);      // Pa
  const [pTo, setPTo] = useState(80.0e5);         // Pa
  const [n, setN] = useState(80);
  const [listsOpen, setListsOpen] = useState(false);
  const amountOf = (c: string) => amounts[c] ?? 1;

  const plan = useMemo(() => envelopePlan({
    components,
    amounts: Object.fromEntries(components.map((c) => [c, amountOf(c)])),
    eos, Pfrom: pFrom, Pto: pTo, n, componentFiles,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [components, amounts, eos, pFrom, pTo, n, componentFiles]);

  // ---- the run --------------------------------------------------------------
  const [csv, setCsv] = useState<string | null>(null);
  const [report, setReport] = useState<EnvelopeReport | null>(null);
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
    if (!plan.files) { setCsv(null); setReport(null); setError(null); setBusy(false); return; }
    setBusy(true);
    try {
      const resolved = await resolveAdapter("wasm");
      if (seq !== seqRef.current) return;
      if (resolved.kind !== "wasm") {
        setAdapterNote(resolved.fallbackReason ?? "The real (WebAssembly) solver could not be loaded.");
        if (resolved.kind === "unavailable") { setBusy(false); return; }
      } else setAdapterNote(null);
      const r = await resolved.adapter.run(plan.files, () => {}, ctrl.signal, "choupoProps");
      if (seq !== seqRef.current) return;
      const out = r.csvFiles?.[ENVELOPE_OUTPUT] ?? null;
      const op: OperationResult | undefined = r.operationResults?.find((o) => o.type === "phaseEnvelope");
      setCsv(out);
      setReport(op ? envelopeReport(op, r.advisories as (Advisory & { status?: string })[] | undefined, r.log) : null);
      //  The engine's own sentence when it stopped the whole run -- e.g.
      //  "neither branch converged at any pressure in the requested range",
      //  which is a statement about the RANGE, and says so.
      if (!op || !out) {
        const why = r.log.split("\n").map((l) => l.trim()).reverse()
          .find((l) => /(?:error|fatal|refus|cannot|must)/i.test(l));
        setError(why ?? "choupoProps did not finish.");
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

  // ---- the figure -------------------------------------------------------------
  const tUnit = temperatureLabel(tU);
  const pUnit = pressureLabel(pU);
  const figure = useMemo(() => {
    if (!csv) return null;
    const { bubble, dew } = readEnvelopeCsv(csv);
    const tx = (K: number) => kToDisplay(K, tU);
    const px = (Pa: number) => paToDisplay(Pa, pU);
    const traces: Record<string, unknown>[] = [];
    const line = (pts: { P: number; T: number }[], name: string, colour: string) => ({
      type: "scatter", mode: "lines+markers", name,
      x: pts.map((p) => tx(p.T)), y: pts.map((p) => px(p.P)),
      line: { color: colour, width: 2.4 }, marker: { size: 4, color: colour },
      hovertemplate: `T = %{x:.2f} ${tUnit}<br>P = %{y:.4g} ${pUnit}<extra>${name}</extra>`,
    });
    if (bubble.length) traces.push(line(bubble, "bubble curve (V/F → 0)", PLOT_COLORS.accent));
    if (dew.length) traces.push(line(dew, "dew curve (V/F → 1)", PLOT_COLORS.warm));
    //  WHERE A BRANCH STOPPED: its last kept point, hollow, named for what it
    //  is.  Never connected to the other branch.
    for (const b of report?.branches ?? []) {
      if (b.end !== "stopped") continue;
      const pts = b.branch === "bubble" ? bubble : dew;
      const last = pts[pts.length - 1];
      if (!last) continue;
      traces.push({
        type: "scatter", mode: "markers+text", name: `${b.branch} branch stopped`,
        x: [tx(last.T)], y: [px(last.P)], text: [`${b.branch} stopped`], textposition: "middle left",
        marker: { symbol: "circle-open", size: 13, line: { width: 2 },
                  color: b.branch === "bubble" ? PLOT_COLORS.accent : PLOT_COLORS.warm },
        hovertemplate: `${b.branch} branch STOPPED at ${b.stoppedBar?.toFixed(3)} bar<br>last kept point: `
          + `T = %{x:.2f} ${tUnit}, P = %{y:.4g} ${pUnit}<br>a stopping point of the method, not an extremum<extra></extra>`,
      });
    }
    //  A CRICONDENTHERM ONLY WHERE THE ENGINE REPORTED ONE: the kept point at
    //  that temperature on that branch (the engine reports a bracketed point
    //  of the trace, not a refined extremum).  No cricondenbar is marked: a
    //  pressure-marched trace cannot reach it, and the engine never reports one.
    for (const b of report?.branches ?? []) {
      if (b.cricondenthermK === undefined) continue;
      const pts = b.branch === "bubble" ? bubble : dew;
      const at = pts.reduce<{ P: number; T: number } | null>((best, p) =>
        (!best || Math.abs(p.T - b.cricondenthermK!) < Math.abs(best.T - b.cricondenthermK!) ? p : best), null);
      if (!at) continue;
      traces.push({
        type: "scatter", mode: "markers", name: "cricondentherm (bracketed, as reported)",
        x: [tx(b.cricondenthermK)], y: [px(at.P)],
        marker: { symbol: "star", size: 14, color: PLOT_COLORS.text },
        hovertemplate: `cricondentherm on the ${b.branch} branch, as the engine reported it:<br>`
          + `T = %{x:.2f} ${tUnit} near P = %{y:.4g} ${pUnit} (bracketed, not refined)<extra></extra>`,
      });
    }
    return traces;
  }, [csv, report, tU, pU, tUnit, pUnit]);

  // ---- the panel ------------------------------------------------------------
  const sumMoles = components.reduce((s, c) => s + amountOf(c), 0);
  const panel = (
    <Stack gap="sm">
      <Text size="xs" c="dimmed">
        One feed; at every pressure the engine solves its bubble and dew temperatures and says where
        each branch stops.{" "}
        <Anchor size="xs" onClick={() => openGuide(guideUrl("explorerGuide", EXPLORER_GUIDE_ENVELOPE))}>
          How to read this view (Explorer Guide)
        </Anchor>
      </Text>
      <Box>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Feed (mol)</Text>
        <Stack gap={4} mt={4}>
          {components.map((c) => (
            <NumberInput key={c} size="xs" label={`${c} (mol)`} min={0} step={0.1} decimalScale={6}
              value={amountOf(c)} onChange={(v) => setAmounts((a) => ({ ...a, [c]: typeof v === "number" ? v : Number(v) || 0 }))} />
          ))}
          <Text size="xs" c="dimmed">
            Sum {Number(sumMoles.toPrecision(6))} mol.  Sent as typed; the engine normalises the feed and
            says so.  An envelope belongs to this ONE composition.
          </Text>
        </Stack>
      </Box>
      <Box>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Thermophysical system</Text>
        <Stack gap={4} mt={4}>
          <Select size="xs" label="vapour equation of state" data={[...ENVELOPE_EOS]} value={eos}
            onChange={(v) => setEos(v ?? "PR")} allowDeselect={false} />
          <Text size="xs" c="dimmed">
            Liquid: ideal solution on the pure-liquid reference (with its saturation fugacity and
            Poynting factor); vapour: the cubic above, binary kij = 0 unless curated -- the engine says
            which.
          </Text>
          {envelopeModelWhy(eos) && <Text size="xs" c="orange">{envelopeModelWhy(eos)}</Text>}
        </Stack>
      </Box>
      <Box>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">Pressure march</Text>
        <Stack gap={4} mt={4}>
          <Group gap={6} grow>
            <NumberInput size="xs" label={`from P (${pUnit})`} min={0} decimalScale={6}
              value={paToDisplay(pFrom, pU)} onChange={(v) => setPFrom(parsePressure(Number(v) || 0, pU))} />
            <NumberInput size="xs" label={`to P (${pUnit})`} min={0} decimalScale={6}
              value={paToDisplay(pTo, pU)} onChange={(v) => setPTo(parsePressure(Number(v) || 0, pU))} />
          </Group>
          <NumberInput size="xs" label="pressures (–)" min={2} max={201} value={n}
            onChange={(v) => setN(Math.max(2, Math.min(201, Math.round(Number(v) || 2))))} />
        </Stack>
      </Box>
    </Stack>
  );

  // ---- the figure and the report ---------------------------------------------
  const plotConfig = narrow ? { ...PLOT_CONFIG, displayModeBar: false } : PLOT_CONFIG;
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
      {figure && report ? (
        <>
          <Box style={{ flexShrink: 0, height: narrow ? 380 : 420, position: "relative" }}>
            <Plot data={figure as never}
              layout={{
                ...darkLayout, autosize: true, showlegend: true,
                title: { text: narrow ? "P-T envelope" : `P-T phase envelope  ·  ${components.join(" / ")}  ·  vapour ${eos}`,
                         x: 0.01, xanchor: "left", font: { size: narrow ? 11 : 13 } },
                legend: { ...darkLayout.legend, orientation: "h", x: 0, y: -0.2, xanchor: "left", yanchor: "top" },
                xaxis: { ...darkLayout.xaxis, title: { text: `temperature   T   [${tUnit}]` } },
                yaxis: { ...darkLayout.yaxis, title: { text: `pressure   P   [${pUnit}]` } },
                margin: { ...darkLayout.margin, b: 96, t: 52 },
              } as never}
              config={plotConfig} style={{ width: "100%", height: "100%" }} useResizeHandler />
            {busy && (
              <Box style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
                justifyContent: "center", background: "light-dark(rgba(255,255,255,0.45), rgba(0,0,0,0.45))" }}>
                <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">tracing the envelope…</Text></Group>
              </Box>)}
          </Box>
          <EnvelopeReportPanel report={report} />
        </>
      ) : busy ? (
        <Box style={{ flex: 1, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">tracing the envelope…</Text></Group>
        </Box>
      ) : null}
    </Stack>
  );

  return narrow ? (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      <Button size="xs" variant="light" color="gray"
        rightSection={listsOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        onClick={() => setListsOpen((o) => !o)} style={{ alignSelf: "flex-start" }}>
        feed · system · pressures
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
