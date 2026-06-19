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
  What-if tab of the unit INTERNALS page (gui-credo §4 "The what-if lives in
  the unit's INTERNALS page" -- Vítor's ruling 2026-06-12).  Manipulate where
  you plot; one page per unit:

    - the honesty banner (inlets FROZEN from the parent run);
    - the unit's operation numeric scalars as editable inputs -- LOCAL
      component state over the synthesised 1-unit clone, never the store;
    - Run: the WASM adapter solves the clone directly (the way the Explorer
      does its standalone runs) and the outlet streams land right here;
    - override chips ("T: 370 K → 375 K") with per-key reset to pristine;
    - a one-knob SENSITIVITY SWEEP: synthesise the exact `outerDict { type
      sweep; ... }` (sweepSynth, grammar: flash06_sweep_T), run it on the
      clone, render the harvested CSV right here (CsvAutoPlot).

  Showing / copying the synthesised dicts is ALLOWED (glass-box: the screen
  teaches the dict).  There is deliberately NO save / download / write-back
  affordance of ANY kind: the what-if is transient by definition -- closing
  the tab is the reset.
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
  operationOverrides,
  overrideDictText,
  sweepCsvName,
  sweepOuterDictText,
  sweepResponses,
  synthesizeSweepOuterDict,
  type OperationOverride,
} from "../case/sweepSynth.js";
import type { CaseFiles } from "../case/types.js";
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
//  Display-unit helpers (schema-declared SI unit -> the Units menu choice).
//  The same three convertible quantities as the selection card; everything
//  else is raw SI in and out.
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

function fmtScalar(siUnit: string | undefined, v: JsonValue, prefs: DisplayPrefs): string {
  if (typeof v === "number") {
    const d = siToDisplay(siUnit, v, prefs);
    const label = unitLabelFor(siUnit, prefs);
    return `${formatSig(d)}${label ? ` ${label}` : ""}`;
  }
  return String(v);
}

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]).map(String) : v === undefined || v === null ? [] : [String(v)];

/** The slice of the internals stash the What-if needs.  `files` is the
 *  synthesised 1-unit clone; absent only on stashes written by older builds. */
export interface WhatIfStash {
  name: string;
  type: string;
  unit: Record<string, unknown>;
  /** Pristine operation block ($vars already resolved at pop-out time). */
  operation: Record<string, unknown>;
  /** This unit's KPIs from the parent run (sweep responses pre-seed). */
  kpis: Record<string, number>;
  files?: CaseFiles;
}

export function WhatIfTab({ stash }: { stash: WhatIfStash }) {
  const prefs = useStore((s) => s.displayPrefs);

  const schema = operationSchemaFor(stash.type);
  const fieldUnit = (key: string) => schema?.fields.find((f) => f.key === key)?.unit;
  const fieldTitle = (key: string) => schema?.fields.find((f) => f.key === key)?.title;

  // --- The clone + the LOCAL edits over it (never the store) ---------------
  const pristineOp = useMemo(() => (stash.operation ?? {}) as JsonDict, [stash.operation]);
  const numericKeys = useMemo(() => numericOperationKeys(pristineOp), [pristineOp]);
  // SI values, keyed by operation key; only keys that differ from pristine.
  const [edits, setEdits] = useState<{ [k: string]: number }>({});
  const effectiveOp: JsonDict = useMemo(
    () => ({ ...pristineOp, ...edits }),
    [pristineOp, edits],
  );
  const overrides = useMemo(
    () => operationOverrides(effectiveOp, pristineOp),
    [effectiveOp, pristineOp],
  );

  const commitEdit = (key: string, displayV: number | "") => {
    setEdits((e) => {
      if (displayV === "" || !Number.isFinite(Number(displayV))) return e;
      const si = displayToSi(fieldUnit(key), Number(displayV), prefs);
      const p = pristineOp[key];
      // Display-unit round-trips are lossy in the last ulp; snap back to
      // pristine instead of minting a phantom override chip.
      if (typeof p === "number" && Math.abs(si - p) <= 1e-9 * Math.max(1, Math.abs(p))) {
        const { [key]: _gone, ...rest } = e;
        return rest;
      }
      return { ...e, [key]: si };
    });
  };
  const resetOne = (o: OperationOverride) => {
    setEdits((e) => {
      const { [o.key]: _gone, ...rest } = e;
      return rest;
    });
  };

  // --- Run plumbing (own adapter calls, the Explorer pattern) --------------
  const [busy, setBusy] = useState<null | "run" | "sweep">(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [mockWarning, setMockWarning] = useState<string | null>(null);
  const [outStreams, setOutStreams] = useState<StreamResult[] | null>(null);
  const [lastKpis, setLastKpis] = useState<{ [k: string]: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const outNames = useMemo(() => asList(stash.unit["outputs"]), [stash.unit]);

  /** The clone with this tab's edits applied to units[0].operation (and an
   *  optional one-shot outerDict for the sweep). */
  const buildFiles = (outerDict?: JsonDict): CaseFiles | null => {
    const files = stash.files;
    if (!files) return null;
    const fs = files.flowsheet as Record<string, unknown> | undefined;
    const units = (fs?.["units"] as Array<Record<string, unknown>> | undefined) ?? [];
    if (!fs || units.length === 0) return null;
    const unit0 = { ...units[0]!, operation: effectiveOp };
    const out: CaseFiles = {
      ...files,
      flowsheet: { ...fs, units: [unit0] } as unknown as CaseFiles["flowsheet"],
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

  // --- Sweep controls --------------------------------------------------------
  const [sweepKey, setSweepKey] = useState<string | null>(numericKeys[0] ?? null);
  // Range state in DISPLAY units (what the inputs show); converted to SI at
  // synthesis time, so the dict always carries raw SI.
  const seedRange = (key: string | null): { from: number | ""; to: number | "" } => {
    if (!key) return { from: "", to: "" };
    const si = effectiveOp[key];
    if (typeof si !== "number") return { from: "", to: "" };
    const u = fieldUnit(key);
    // Default current ±20 % -- taken in SI (the physical scale).
    return {
      from: Number(formatSig(siToDisplay(u, 0.8 * si, prefs))),
      to: Number(formatSig(siToDisplay(u, 1.2 * si, prefs))),
    };
  };
  const [range, setRange] = useState<{ from: number | ""; to: number | "" }>(
    () => seedRange(numericKeys[0] ?? null),
  );
  const [nPoints, setNPoints] = useState<number | "">(21);
  const [dictOpen, setDictOpen] = useState(false);
  const [sweep, setSweep] = useState<{ key: string; csv: string } | null>(null);

  const pickKey = (key: string | null) => {
    setSweepKey(key);
    setRange(seedRange(key));
  };

  // The synthesised spec (null while the form is incomplete).
  const spec = useMemo(() => {
    if (!sweepKey || range.from === "" || range.to === "" || nPoints === "") return null;
    const u = fieldUnit(sweepKey);
    const fromSi = displayToSi(u, Number(range.from), prefs);
    const toSi = displayToSi(u, Number(range.to), prefs);
    const n = Math.max(2, Math.round(Number(nPoints)));
    if (!Number.isFinite(fromSi) || !Number.isFinite(toSi) || fromSi === toSi) return null;
    return {
      key: sweepKey,
      from: fromSi,
      to: toSi,
      nPoints: n,
      responses: sweepResponses(stash.name, lastKpis ?? stash.kpis, outNames),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepKey, range, nPoints, prefs, lastKpis, stash.kpis, stash.name, outNames]);

  const dictText = spec ? sweepOuterDictText(spec) : "";

  const runSweep = async () => {
    if (!spec) return;
    const result = await solveClone("sweep", synthesizeSweepOuterDict(spec));
    if (!result) return;
    const wanted = sweepCsvName(spec.key);
    const csv = result.csvFiles?.[wanted]
      ?? Object.values(result.csvFiles ?? {})[0];
    if (csv) {
      setSweep({ key: spec.key, csv });
    } else {
      setRunError("The sweep finished but wrote no CSV — see the outer driver's grammar.");
    }
  };

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

  return (
    <ScrollArea h="100%" type="auto">
      <Stack gap={10} m="md" maw={860}>
        {/* Honesty banner -- mandatory (gui-credo §4). */}
        <Alert color="cyan" variant="light" icon={<IconInfoCircle size={14} />} p="xs">
          <Text size="xs">
            Inlets frozen from the parent run — plant-level feedback (recycles,
            controllers, heat-links) is NOT in the loop.
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Transient by definition: nothing here writes back to the case —
            closing this tab is the reset.  To keep a change, edit{" "}
            <code>system/flowsheetDict</code> on disk (copy the override below).
          </Text>
        </Alert>

        {mockWarning && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={14} />} p="xs">
            <Text size="xs">{mockWarning}</Text>
          </Alert>
        )}

        {/* Operation scalars -- editable, LOCAL to this tab. */}
        {numericKeys.length === 0 ? (
          <Text size="sm" c="dimmed">
            This unit's operation block has no numeric scalars to vary.
          </Text>
        ) : (
          <Stack gap={6}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Operation (this tab only)
            </Text>
            <Group gap="xs" align="flex-end" wrap="wrap">
              {numericKeys.map((k) => {
                const u = fieldUnit(k);
                const label = unitLabelFor(u, prefs);
                return (
                  <NumberInput
                    key={k}
                    size="xs"
                    w={150}
                    label={`${fieldTitle(k) ?? k}${label ? ` [${label}]` : ""}`}
                    description={k}
                    value={siToDisplay(u, (effectiveOp[k] as number), prefs)}
                    onChange={(v) => commitEdit(k, v === "" ? "" : Number(v))}
                    hideControls
                    styles={{ input: { fontFamily: "JetBrains Mono, monospace" } }}
                  />
                );
              })}
            </Group>
          </Stack>
        )}

        {/* Active overrides as chips, per-key reset to pristine. */}
        {overrides.length > 0 && (
          <Stack gap={4}>
            <Group gap={4} wrap="wrap">
              {overrides.map((o) => (
                <Badge
                  key={o.key}
                  variant="light"
                  color="orange"
                  size="sm"
                  radius="sm"
                  styles={{ root: { textTransform: "none" } }}
                  rightSection={
                    <Tooltip label="Reset to the parent-run value" withArrow>
                      <ActionIcon
                        size={12}
                        variant="transparent"
                        color="orange"
                        onClick={() => resetOne(o)}
                      >
                        <IconX size={10} />
                      </ActionIcon>
                    </Tooltip>
                  }
                >
                  {fieldTitle(o.key) ?? o.key}:{" "}
                  {fmtScalar(fieldUnit(o.key), o.from, prefs)} →{" "}
                  {fmtScalar(fieldUnit(o.key), o.to, prefs)}
                </Badge>
              ))}
            </Group>
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                Run solves the clone with these values.
              </Text>
              <CopyButton value={overrideDictText(overrides)}>
                {({ copied, copy }) => (
                  <Button size="compact-xs" variant="subtle" color="accent" onClick={copy}>
                    {copied ? "Copied ✓" : "Copy override"}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Stack>
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
            Run
          </Button>
          <Text size="xs" c="dimmed">
            Solves the 1-unit clone in this tab (WASM) — the parent case is untouched.
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
              Outlet streams (this what-if run)
            </Text>
            {outStreams.length === 0 ? (
              <Text size="sm" c="dimmed">The run produced no outlet streams.</Text>
            ) : (
              <UnitStreamsTable groups={[{ dir: "out", streams: outStreams }]} />
            )}
          </Stack>
        )}

        {/* Sensitivity sweep -- one knob, the exact outerDict a student would
            author; the harvested CSV plots RIGHT HERE. */}
        {numericKeys.length > 0 && (
          <>
            <Divider my={2} />
            <Stack gap={6}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Sensitivity sweep</Text>
              <Select
                size="xs"
                maw={320}
                label="Sweep one operation scalar"
                data={numericKeys.map((k) => ({
                  value: k,
                  label: fieldTitle(k) ? `${fieldTitle(k)} (${k})` : k,
                }))}
                value={sweepKey}
                onChange={pickKey}
                allowDeselect={false}
              />
              <Group gap="xs" maw={480} grow>
                <NumberInput
                  size="xs"
                  label={`From${unitLabelFor(fieldUnit(sweepKey ?? ""), prefs) ? ` [${unitLabelFor(fieldUnit(sweepKey ?? ""), prefs)}]` : ""}`}
                  value={range.from}
                  onChange={(v) => setRange((r) => ({ ...r, from: v === "" ? "" : Number(v) }))}
                  hideControls
                  styles={{ input: { fontFamily: "JetBrains Mono, monospace" } }}
                />
                <NumberInput
                  size="xs"
                  label={`To${unitLabelFor(fieldUnit(sweepKey ?? ""), prefs) ? ` [${unitLabelFor(fieldUnit(sweepKey ?? ""), prefs)}]` : ""}`}
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
                  Run sweep
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
                  disabled={!spec}
                  onClick={() => setDictOpen((o) => !o)}>
                  {dictOpen ? "Hide dict" : "Show dict"}
                </Button>
              </Group>
              <Text size="10px" c="dimmed">
                One-shot: the synthesised <code>outerDict</code> drives that run
                only.  To keep it, copy the dict into{" "}
                <code>system/outerDict</code> of a case on disk.
              </Text>
              <Collapse in={dictOpen && !!spec}>
                <Code block style={{ fontSize: 10.5 }}>{dictText}</Code>
              </Collapse>
              {sweep && (
                <Box h={380}>
                  <CsvAutoPlot
                    csv={dropPointColumn(sweep.csv)}
                    filename={sweepCsvName(sweep.key)}
                  />
                </Box>
              )}
            </Stack>
          </>
        )}
      </Stack>
    </ScrollArea>
  );
}
