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
  What-if tab of the unit INTERNALS page -- a KPI INSTRUMENT (forum verdict
  2026-06-20).  One sentence: "Watch [KPI] as I turn [knob]".

    - the KPI HERO: pick one of the unit's own emitted KPIs (result.kpis),
      its live current value shown big -- the objective you are driving;
    - the KNOB: blank on open (no recommended pick); choose ONE dict scalar
      -- a declared `variables{}` entry (offered first) or a raw operation
      scalar -- the lever you turn;
    - the CURVE: the chosen KPI vs the chosen knob over a range, the exact
      one-knob `outerDict { type sweep; ... }` a student would author, run on
      the 1-unit clone (CsvAutoPlot).  A "you are here" readout ties the live
      number to the curve.  Non-converging points are HONEST GAPS, never
      smoothed over (glass-box).
    - <=2 knobs is a visualisation LAW (1 -> a curve, 2 -> a surface, 3 ->
      unviewable).  Slice 1 ships ONE knob; the 2-knob surface is next.

  Showing / copying the synthesised dict is ALLOWED (the screen teaches the
  dict).  There is deliberately NO save / write-back: the what-if is transient
  -- closing the tab is the reset.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Collapse,
  CopyButton,
  Divider,
  Group,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconChartLine,
  IconInfoCircle,
  IconPlayerPlay,
  IconX,
} from "@tabler/icons-react";

import { resolveAdapter } from "../adapters/index.js";
import type { StreamResult } from "../adapters/SolverAdapter.js";
import { withDisplayPrefs } from "../case/applyPrefs.js";
import { operationSchemaFor } from "../case/operationSchemas.js";
import {
  numericOperationKeys,
  sweepCsvName,
  sweepOuterDictText,
  synthesizeSweepOuterDict,
  type SweepSpec,
} from "../case/sweepSynth.js";
import type { CaseFiles } from "../case/types.js";
import { collectVariableKnobs } from "../case/variableKnobs.js";
import type { JsonDict, JsonValue } from "../dict/index.js";
import {
  formatFlow,
  formatSig,
  kToDisplay,
  paToDisplay,
  parseFlow,
  parsePressure,
  parseTemperature,
  pressureLabel,
  temperatureLabel,
  type DisplayPrefs,
} from "../state/displayUnits.js";
import { useStore } from "../state/store.js";
import { CsvAutoPlot, dropPointColumn } from "./plotting/CsvAutoPlot.js";
import { UnitStreamsTable } from "./UnitStreamsTable.js";

// ---------------------------------------------------------------------------
//  Display-unit helpers (schema-declared SI unit <-> the Units menu choice).
// ---------------------------------------------------------------------------

function unitLabelFor(siUnit: string | undefined, prefs: DisplayPrefs): string | undefined {
  if (siUnit === "K") return temperatureLabel(prefs.temperature);
  if (siUnit === "Pa") return pressureLabel(prefs.pressure);
  if (siUnit === "kmol/s") return prefs.flow;
  return siUnit;
}

function siToDisplay(siUnit: string | undefined, si: number, prefs: DisplayPrefs): number {
  if (siUnit === "K") return kToDisplay(si, prefs.temperature);
  if (siUnit === "Pa") return paToDisplay(si, prefs.pressure);
  if (siUnit === "kmol/s") return Number(formatFlow(si, prefs.flow));
  return si;
}

function displayToSi(siUnit: string | undefined, display: number, prefs: DisplayPrefs): number {
  if (siUnit === "K") return parseTemperature(display, prefs.temperature);
  if (siUnit === "Pa") return parsePressure(display, prefs.pressure);
  if (siUnit === "kmol/s") return parseFlow(display, prefs.flow);
  return display;
}

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]).map(String) : v === undefined || v === null ? [] : [String(v)];

/** Count sweep rows whose KPI cell is not a finite number -- the points where
 *  the clone did NOT converge.  They render as gaps; we caption them so the
 *  hole is explained, never silent (glass-box). */
function countHoles(csv: string): { holes: number; total: number } {
  const lines = csv.trim().split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { holes: 0, total: 0 };
  let holes = 0;
  const rows = lines.slice(1);
  for (const r of rows) {
    const cols = r.split(",");
    const last = cols[cols.length - 1]?.trim() ?? "";
    if (!Number.isFinite(Number(last))) holes++;
  }
  return { holes, total: rows.length };
}

/** The slice of the internals stash the What-if needs.  `files` is the
 *  synthesised 1-unit clone; absent only on stashes written by older builds. */
export interface WhatIfStash {
  name: string;
  type: string;
  unit: Record<string, unknown>;
  /** Pristine operation block ($vars already resolved at pop-out time). */
  operation: Record<string, unknown>;
  /** This unit's KPIs from the parent run -- the watchable objectives. */
  kpis: Record<string, number>;
  files?: CaseFiles;
}

/** One lever the student can turn: a declared variable or an operation scalar. */
interface Knob {
  id: string;
  kind: "var" | "op";
  key: string;
  label: string;
  /** Declared unit (var): the value/range are in THIS unit. */
  unit?: string;
  /** Schema SI unit (op): the value is SI, shown in the Units-menu unit. */
  siUnit?: string;
  /** Current value -- var: in `unit`; op: SI. */
  current: number;
  /** Full sweep target path (var only); op uses units[0].operation.<key>. */
  targetPath?: string;
}

export function WhatIfTab({ stash }: { stash: WhatIfStash }) {
  const prefs = useStore((s) => s.displayPrefs);

  const schema = operationSchemaFor(stash.type);
  const fieldUnit = (key: string) => schema?.fields.find((f) => f.key === key)?.unit;
  const fieldTitle = (key: string) => schema?.fields.find((f) => f.key === key)?.title;

  const pristineOp = useMemo(() => (stash.operation ?? {}) as JsonDict, [stash.operation]);
  const numericKeys = useMemo(() => numericOperationKeys(pristineOp), [pristineOp]);
  const flowsheetJson = stash.files?.flowsheet as JsonDict | undefined;
  const variableKnobs = useMemo(() => collectVariableKnobs(flowsheetJson), [flowsheetJson]);

  // The levers: declared variables FIRST (the author's blessed knobs), then
  // raw operation scalars.  Works on shipped cases with no variables{}.
  const knobs = useMemo<Knob[]>(
    () => [
      ...variableKnobs.map((v) => ({
        id: `var:${v.name}`,
        kind: "var" as const,
        key: v.name,
        label: `${v.name}${v.unit ? ` [${v.unit}]` : ""}  (variable)`,
        unit: v.unit,
        current: v.value,
        targetPath: `variables.${v.name}`,
      })),
      ...numericKeys.map((k) => ({
        id: `op:${k}`,
        kind: "op" as const,
        key: k,
        label: fieldTitle(k) ? `${fieldTitle(k)} (${k})` : k,
        siUnit: fieldUnit(k),
        current: pristineOp[k] as number,
      })),
    ],
    // fieldTitle/fieldUnit read the stable schema; deps are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variableKnobs, numericKeys, pristineOp],
  );

  const [knobId, setKnobId] = useState<string | null>(null);
  const knob = useMemo(() => knobs.find((k) => k.id === knobId) ?? null, [knobs, knobId]);

  const knobDisplay = (k: Knob): number =>
    k.kind === "op" ? siToDisplay(k.siUnit, k.current, prefs) : k.current;
  const knobUnitLabel = (k: Knob): string | undefined =>
    k.kind === "op" ? unitLabelFor(k.siUnit, prefs) : k.unit;

  // The single turned value (display terms; "" = sit at current) + the range.
  const [knobValue, setKnobValue] = useState<number | "">("");
  const [range, setRange] = useState<{ from: number | ""; to: number | "" }>({ from: "", to: "" });
  const [nPoints, setNPoints] = useState<number | "">(21);

  const pickKnob = (id: string | null) => {
    setKnobId(id);
    setKnobValue("");
    const k = knobs.find((x) => x.id === id);
    if (!k) { setRange({ from: "", to: "" }); return; }
    const cur = knobDisplay(k);
    setRange({ from: Number(formatSig(0.8 * cur)), to: Number(formatSig(1.2 * cur)) });
  };

  // The clone with the ONE knob edit applied (op -> operation[key]; var ->
  // variables[name]).  No edit -> pristine (the current point).
  const effectiveOp = useMemo<JsonDict>(() => {
    if (knob?.kind === "op" && knobValue !== "" && Number.isFinite(Number(knobValue))) {
      const si = displayToSi(knob.siUnit, Number(knobValue), prefs);
      if (Number.isFinite(si)) return { ...pristineOp, [knob.key]: si };
    }
    return pristineOp;
  }, [knob, knobValue, pristineOp, prefs]);

  const effectiveVars = useMemo<JsonValue | undefined>(() => {
    const base = flowsheetJson?.["variables"];
    if (base === undefined) return undefined;
    if (knob?.kind === "var" && knobValue !== "" && Number.isFinite(Number(knobValue))) {
      const out: JsonDict = { ...(base as JsonDict) };
      out[knob.key] = knob.unit ? `${Number(knobValue)} ${knob.unit}` : Number(knobValue);
      return out;
    }
    return base;
  }, [flowsheetJson, knob, knobValue]);

  const knobEdited = knobValue !== "" && knob !== null
    && Math.abs(Number(knobValue) - knobDisplay(knob)) > 1e-9 * Math.max(1, Math.abs(knobDisplay(knob)));

  // --- KPI hero ------------------------------------------------------------
  const [lastKpis, setLastKpis] = useState<{ [k: string]: number } | null>(null);
  const kpiMap = useMemo(() => lastKpis ?? stash.kpis ?? {}, [lastKpis, stash.kpis]);
  const kpiOptions = useMemo(
    () =>
      Object.entries(kpiMap)
        .filter(([k, v]) => typeof v === "number" && Number.isFinite(v) && k !== knob?.key)
        .map(([k]) => ({ value: k, label: k })),
    [kpiMap, knob],
  );
  const [kpiKey, setKpiKey] = useState<string | null>(null);
  // Drop the watched KPI if the knob choice makes it invalid (e.g. KPI == knob).
  useEffect(() => {
    if (kpiKey && !kpiOptions.some((o) => o.value === kpiKey)) setKpiKey(null);
  }, [kpiOptions, kpiKey]);
  const kpiCurrent = kpiKey ? kpiMap[kpiKey] : undefined;

  // --- Run plumbing (own adapter calls, the Explorer pattern) --------------
  const [busy, setBusy] = useState<null | "run" | "sweep">(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [mockWarning, setMockWarning] = useState<string | null>(null);
  const [outStreams, setOutStreams] = useState<StreamResult[] | null>(null);
  const [dictOpen, setDictOpen] = useState(false);
  const [sweep, setSweep] = useState<{ key: string; csv: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const outNames = useMemo(() => asList(stash.unit["outputs"]), [stash.unit]);

  const buildFiles = (outerDict?: JsonDict): CaseFiles | null => {
    const files = stash.files;
    if (!files) return null;
    const fs = files.flowsheet as Record<string, unknown> | undefined;
    const units = (fs?.["units"] as Array<Record<string, unknown>> | undefined) ?? [];
    if (!fs || units.length === 0) return null;
    const unit0 = { ...units[0]!, operation: effectiveOp };
    const out: CaseFiles = {
      ...files,
      flowsheet: {
        ...fs,
        ...(effectiveVars !== undefined ? { variables: effectiveVars } : {}),
        units: [unit0],
      } as unknown as CaseFiles["flowsheet"],
    };
    if (outerDict) out.outerDict = outerDict;
    return out;
  };

  const solveClone = async (kind: "run" | "sweep", outerDict?: JsonDict) => {
    const files = buildFiles(outerDict);
    if (!files || busy) return null;
    setBusy(kind);
    setRunError(null);
    try {
      const resolved = await resolveAdapter("wasm");
      if (resolved.kind === "unavailable") {
        setRunError(resolved.fallbackReason
          ?? "The real (WebAssembly) solver could not be loaded — nothing was run.");
        return null;
      }
      setMockWarning(resolved.kind === "mock"
        ? (resolved.fallbackReason ?? "Using the MOCK solver — numbers are NOT real.")
        : null);
      const ctl = new AbortController();
      abortRef.current = ctl;
      const result = await resolved.adapter.run(
        withDisplayPrefs(files, prefs), () => {}, ctl.signal);
      if (result.status !== "done") {
        const tail = (result.log ?? "").trim().split("\n").slice(-8).join("\n");
        setRunError(tail || "The solver reported an error (empty log).");
        return null;
      }
      return result;
    } catch (e) {
      setRunError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const runOnce = async () => {
    const result = await solveClone("run");
    if (!result) return;
    let outs = result.streams.filter((s) => outNames.includes(s.name));
    if (outs.length === 0) outs = result.streams.filter((s) => s.role === "product");
    setOutStreams(outs);
    setLastKpis(result.kpis?.[stash.name] ?? null);
  };

  // --- The synthesised one-knob sweep (null while the form is incomplete) ---
  const spec = useMemo<SweepSpec | null>(() => {
    if (!knob || !kpiKey || range.from === "" || range.to === "" || nPoints === "") return null;
    const n = Math.max(2, Math.round(Number(nPoints)));
    let from: number, to: number, unit: string | undefined, targetPath: string | undefined;
    if (knob.kind === "op") {
      from = displayToSi(knob.siUnit, Number(range.from), prefs);
      to = displayToSi(knob.siUnit, Number(range.to), prefs);
    } else {
      from = Number(range.from);
      to = Number(range.to);
      unit = knob.unit;
      targetPath = knob.targetPath;
    }
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return null;
    return {
      key: knob.key,
      from,
      to,
      nPoints: n,
      unit,
      targetPath,
      responses: [`${stash.name}.${kpiKey}`],
    };
  }, [knob, kpiKey, range, nPoints, prefs, stash.name]);

  const dictText = spec ? sweepOuterDictText(spec) : "";

  const runSweep = async () => {
    if (!spec) return;
    const result = await solveClone("sweep", synthesizeSweepOuterDict(spec));
    if (!result) return;
    const wanted = sweepCsvName(spec.key);
    const csv = result.csvFiles?.[wanted] ?? Object.values(result.csvFiles ?? {})[0];
    if (csv) setSweep({ key: spec.key, csv });
    else setRunError("The sweep finished but wrote no CSV — see the outer driver's grammar.");
  };

  const holes = sweep ? countHoles(sweep.csv) : { holes: 0, total: 0 };

  // Legacy stash (pre What-if): no clone to run.  Honest refusal.
  if (!stash.files) {
    return (
      <Box p="md" maw={640}>
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={14} />}>
          <Text size="sm">
            This internals stash predates the What-if tab and carries no
            runnable clone.  Reopen this page from the parent case
            (double-click the unit on the flowsheet).
          </Text>
        </Alert>
      </Box>
    );
  }

  const hasKnobs = knobs.length > 0;
  const knobLabel = knob ? knobUnitLabel(knob) : undefined;

  return (
    <ScrollArea h="100%" type="auto">
      <Stack gap={12} m="md" maw={860}>
        {/* Honesty banner -- mandatory (gui-credo §4). */}
        <Alert color="cyan" variant="light" icon={<IconInfoCircle size={14} />} p="xs">
          <Text size="xs">
            Inlets frozen from the parent run — plant-level feedback (recycles,
            controllers, heat-links) is NOT in the loop.
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Transient by definition: nothing here writes back — closing this tab
            is the reset.  To keep a change, edit{" "}
            <code>system/flowsheetDict</code> on disk.
          </Text>
        </Alert>

        {mockWarning && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={14} />} p="xs">
            <Text size="xs">{mockWarning}</Text>
          </Alert>
        )}

        {!hasKnobs ? (
          <Text size="sm" c="dimmed">
            This unit exposes no scalar to turn.  Declare a knob —{" "}
            <Code>{"variables { press 1.0 bar; }"}</Code> at the top of{" "}
            <code>flowsheetDict</code>, referenced with <Code>$press</Code> — to
            watch a KPI against it here.
          </Text>
        ) : (
          <Stack gap={10}>
            {/* THE INSTRUMENT: watch a KPI as you turn a knob. */}
            <Group gap="sm" align="flex-end" wrap="wrap">
              <Select
                size="sm"
                w={260}
                label="Watch"
                placeholder="pick a KPI to drive"
                data={kpiOptions}
                value={kpiKey}
                onChange={setKpiKey}
                searchable
                nothingFoundMessage="no numeric KPIs on this unit"
              />
              {kpiKey && (
                <Text size="xl" fw={700} ff="JetBrains Mono, monospace" c="accent">
                  {kpiCurrent !== undefined ? formatSig(kpiCurrent) : "—"}
                </Text>
              )}
            </Group>

            <Group gap="sm" align="flex-end" wrap="wrap">
              <Select
                size="sm"
                w={260}
                label="as I turn"
                placeholder="+ add knob"
                data={knobs.map((k) => ({ value: k.id, label: k.label }))}
                value={knobId}
                onChange={pickKnob}
                searchable
              />
              {knob && (
                <NumberInput
                  size="sm"
                  w={150}
                  label={`current${knobLabel ? ` [${knobLabel}]` : ""}`}
                  value={knobValue === "" ? knobDisplay(knob) : knobValue}
                  onChange={(v) => setKnobValue(v === "" ? "" : Number(v))}
                  hideControls
                  styles={{
                    input: {
                      fontFamily: "JetBrains Mono, monospace",
                      ...(knobEdited ? { borderColor: "var(--mantine-color-cyan-5)" } : {}),
                    },
                  }}
                />
              )}
              <Tooltip
                label="≤2 knobs so the response stays a curve or a surface — the 2-knob surface is coming next"
                withArrow multiline w={240}
              >
                <Button size="sm" variant="default" disabled>
                  + add knob
                </Button>
              </Tooltip>
            </Group>

            {/* The override chip + the substitution line (glass-box). */}
            {knob && knobEdited && (
              <Group gap={6} wrap="wrap" align="center">
                <Badge
                  variant="light" color="orange" size="sm" radius="sm"
                  styles={{ root: { textTransform: "none" } }}
                  rightSection={
                    <ActionIcon size={12} variant="transparent" color="orange"
                      onClick={() => setKnobValue("")} aria-label="reset knob">
                      <IconX size={10} />
                    </ActionIcon>
                  }
                >
                  {knob.key}: {formatSig(knobDisplay(knob))} → {formatSig(Number(knobValue))}
                  {knobLabel ? ` ${knobLabel}` : ""}
                </Badge>
                <Text size="xs" c="dimmed" ff="JetBrains Mono, monospace">
                  {knob.targetPath ?? `units[0].operation.${knob.key}`} ={" "}
                  {formatSig(knobDisplay(knob))} → {formatSig(Number(knobValue))}
                </Text>
              </Group>
            )}

            <Group gap="xs">
              <Button
                size="xs"
                color="accent"
                leftSection={<IconPlayerPlay size={13} />}
                loading={busy === "run"}
                disabled={busy !== null}
                onClick={() => void runOnce()}
              >
                Run this point
              </Button>
              <Text size="xs" c="dimmed">
                Solves the 1-unit clone (WASM) — the parent case is untouched.
              </Text>
            </Group>

            {runError && (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={14} />} p="xs">
                <Code block style={{ fontSize: 10.5, whiteSpace: "pre-wrap" }}>{runError}</Code>
              </Alert>
            )}

            {outStreams && (
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Outlet streams (this point)
                </Text>
                {outStreams.length === 0 ? (
                  <Text size="sm" c="dimmed">The run produced no outlet streams.</Text>
                ) : (
                  <UnitStreamsTable groups={[{ dir: "out", streams: outStreams }]} />
                )}
              </Stack>
            )}

            {/* THE CURVE: KPI vs knob over a range -- the response shape. */}
            <Divider my={2} />
            <Stack gap={6}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                Response — {kpiKey ?? "pick a KPI"} vs {knob ? knob.key : "pick a knob"}
              </Text>
              {!kpiKey || !knob ? (
                <Text size="sm" c="dimmed">
                  Pick a KPI to watch and a knob to turn — the curve draws here.
                </Text>
              ) : (
                <>
                  <Group gap="xs" maw={520} grow>
                    <NumberInput
                      size="xs"
                      label={`From${knobLabel ? ` [${knobLabel}]` : ""}`}
                      value={range.from}
                      onChange={(v) => setRange((r) => ({ ...r, from: v === "" ? "" : Number(v) }))}
                      hideControls
                      styles={{ input: { fontFamily: "JetBrains Mono, monospace" } }}
                    />
                    <NumberInput
                      size="xs"
                      label={`To${knobLabel ? ` [${knobLabel}]` : ""}`}
                      value={range.to}
                      onChange={(v) => setRange((r) => ({ ...r, to: v === "" ? "" : Number(v) }))}
                      hideControls
                      styles={{ input: { fontFamily: "JetBrains Mono, monospace" } }}
                    />
                    <NumberInput
                      size="xs"
                      label="Points"
                      value={nPoints}
                      onChange={(v) => setNPoints(v === "" ? "" : Number(v))}
                      min={2}
                      hideControls
                      styles={{ input: { fontFamily: "JetBrains Mono, monospace" } }}
                    />
                  </Group>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      color="accent"
                      leftSection={<IconChartLine size={13} />}
                      loading={busy === "sweep"}
                      disabled={!spec || busy !== null}
                      onClick={() => void runSweep()}
                    >
                      Draw the curve
                    </Button>
                    <CopyButton value={dictText}>
                      {({ copied, copy }) => (
                        <Button size="xs" variant="light" color="accent"
                          disabled={!spec} onClick={copy}>
                          {copied ? "Copied ✓" : "Copy outerDict"}
                        </Button>
                      )}
                    </CopyButton>
                    <Button size="compact-xs" variant="subtle"
                      disabled={!spec} onClick={() => setDictOpen((o) => !o)}>
                      {dictOpen ? "Hide dict" : "Show dict"}
                    </Button>
                  </Group>
                  <Collapse in={dictOpen && !!spec}>
                    <Code block style={{ fontSize: 10.5 }}>{dictText}</Code>
                  </Collapse>
                  {kpiCurrent !== undefined && (
                    <Text size="xs" c="dimmed">
                      You are here: <b>{knob.key}</b> = {formatSig(knobDisplay(knob))}
                      {knobLabel ? ` ${knobLabel}` : ""} →{" "}
                      <b>{kpiKey}</b> = {formatSig(kpiCurrent)}
                    </Text>
                  )}
                  {sweep && holes.holes > 0 && (
                    <Text size="xs" c="orange.6">
                      {holes.holes} of {holes.total} points did not converge — shown as gaps,
                      not interpolated (a gap is an honest "no steady state here").
                    </Text>
                  )}
                  {sweep && (
                    <Box h={380}>
                      <CsvAutoPlot
                        csv={dropPointColumn(sweep.csv)}
                        filename={sweepCsvName(sweep.key)}
                      />
                    </Box>
                  )}
                </>
              )}
            </Stack>
          </Stack>
        )}
      </Stack>
    </ScrollArea>
  );
}
