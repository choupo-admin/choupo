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
  ControlWorkspace -- the Control Room: a live PID-tuning bench for choupoCtrl
  cases.  Chrome-minimal shell (the Explorer language): ONE toolbar, ONE
  collapsible tuning rail, the ClosedLoopPlot primary, ONE collapsible metrics
  footer.

  The re-run loop reuses the WhatIf knob-layer mechanism (resolveAdapter("wasm")
  + AbortController + busy/error/last-good-trace) but runs the WHOLE case --
  controllers KEPT in the loop -- with the PID gains/setpoint mutated via
  applyTuning (the indexed setScalarAtPath grammar).  A run is ~2000 integration
  steps, so it fires on slider RELEASE / a "Run loop" button, never per-pixel;
  the previous trace stays ghosted so the plot never blanks.

  MANDATORY HONESTY (gui-credo §4): tuning re-runs the loop in the browser;
  NOTHING writes back.  To keep a gain, edit system/controlDict on disk.  The
  workspace resets on close (state is component-local).
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon, Alert, Badge, Box, Button, Chip, Code, Collapse, CopyButton, Group,
  Loader, SegmentedControl, Slider, Stack, Text, Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle, IconChevronLeft, IconChevronRight, IconInfoCircle,
  IconPin, IconPlayerPlay, IconRefresh,
} from "@tabler/icons-react";

import { resolveAdapter } from "../adapters/index.js";
import type { RunResult, TrajectoryData } from "../adapters/SolverAdapter.js";
import { withDisplayPrefs } from "../case/applyPrefs.js";
import {
  applySignalType, applyTuning, bodePoint, collectControllerKnobs,
  defaultSignalParam, parallelToInteracting, SIGNAL_PARAMS,
  type BodePoint, type ScheduleKnobs, type SignalKnobs, type SignalType,
} from "../case/controllerKnobs.js";
import {
  applyInitial, collectInitialKnobs, type InitialPatch,
} from "../case/initialKnobs.js";
import {
  controlMetrics, dampingColor, disturbanceWindows, type ControlMetrics,
} from "../case/controlMetrics.js";
import type { CaseFiles } from "../case/types.js";
import { serialize, fromJson, type JsonDict } from "../dict/index.js";
import { useStore } from "../state/store.js";
import { ClosedLoopPlot, type PinnedRun } from "./plotting/ClosedLoopPlot.js";
import { PLOT_COLORS } from "./plotting/plotly.js";

const COLLAPSE_KEY = "choupo.control.railCollapsed";

// Slider ranges (the design's felt-lesson table).
const KP_RANGE: [number, number] = [0, 30];
const KI_RANGE: [number, number] = [0, 0.3];
const KD_RANGE: [number, number] = [0, 50];
const SP_RANGE: [number, number] = [320, 380];
const PIN_COLORS = ["#ffb74d", "#a5d6a7", "#ce93d8", "#ff8a65"];

interface Tuning {
  kp: number;
  ki: number;
  kd: number;
  setpoint: number;
}

// The initial-condition slice the IC rail drives: holdup start temperature and
// the seed mole fraction of the first component (binary => 1-x0 on the second).
interface IcTuning {
  t0: number;
  x0: number;
}

// A cold-start preset (a chilled vessel), so the SegmentedControl can offer a
// one-click "cold" that visibly differs from the as-authored start.
const COLD_T0 = 300;
const T0_RANGE: [number, number] = [290, 380];

// The disturbance picker: the forcing-shape menu + per-param slider ranges.
// Ranges are the felt-lesson spans for an inlet-T (mean ~320 K) disturbance.
const SIGNAL_TYPE_OPTIONS: { label: string; value: SignalType }[] = [
  { label: "Step", value: "step" },
  { label: "Stair", value: "staircase" },
  { label: "Ramp", value: "ramp" },
  { label: "Pulse", value: "pulse" },
  { label: "Sine", value: "sine" },
];
const SIGNAL_RANGE: { [k: string]: { min: number; max: number; step: number; label: string } } = {
  mean:      { min: 280, max: 360, step: 1,    label: "mean [K]" },
  amplitude: { min: 0,   max: 40,  step: 1,    label: "amplitude [K]" },
  step:      { min: -40, max: 40,  step: 1,    label: "step Δ [K]" },
  tStep:     { min: 0,   max: 2000, step: 50,  label: "t_step [s]" },
  tStart:    { min: 0,   max: 2000, step: 50,  label: "t_start [s]" },
  tEnd:      { min: 0,   max: 2000, step: 50,  label: "t_end [s] (0=∞)" },
  slope:     { min: -0.2, max: 0.2, step: 0.005, label: "slope [K/s]" },
  width:     { min: 10,  max: 1000, step: 10,  label: "width [s]" },
  period:    { min: 60,  max: 2000, step: 20,  label: "period [s]" },
  phase:     { min: 0,   max: 6.283, step: 0.05, label: "phase [rad]" },
};

export function ControlWorkspace() {
  const caseFiles = useStore((s) => s.caseFiles);
  const prefs = useStore((s) => s.displayPrefs);
  const seededResult = useStore((s) => s.runResult);

  const flowsheetJson = caseFiles.flowsheet;
  const layer = useMemo(() => collectControllerKnobs(flowsheetJson), [flowsheetJson]);
  const pid = layer.pid;
  const sigKnobs: SignalKnobs | null = layer.signal;
  // The dynamic unit's initial-condition knobs (T0, V0, seed composition) --
  // null when the case has no dynamic-holdup unit with an initial{} block.
  const icKnobs = useMemo(() => collectInitialKnobs(flowsheetJson), [flowsheetJson]);
  // The ordered component list of the seed composition (for the x0 slider).
  const icComps = useMemo(() => Object.keys(icKnobs?.composition ?? {}), [icKnobs]);

  // --- collapsible rail ----------------------------------------------------
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return window.localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // --- tuning state (reset-on-close = component-local) ----------------------
  const baseline = useMemo<Tuning>(
    () => (pid
      ? { kp: pid.kp, ki: pid.ki, kd: pid.kd, setpoint: pid.setpoint }
      : { kp: 0, ki: 0, kd: 0, setpoint: 0 }),
    [pid],
  );
  const [tuning, setTuning] = useState<Tuning>(baseline);
  // Re-seed when the case (and thus the baseline) changes.
  useEffect(() => { setTuning(baseline); }, [baseline]);

  // The committed tuning that produced the CURRENT trace (vs the live slider
  // preview).  Re-run on release sets this; the SP reference line previews the
  // live value before the run.
  const [committed, setCommitted] = useState<Tuning>(baseline);
  useEffect(() => { setCommitted(baseline); }, [baseline]);

  // --- initial-condition state (reset-on-close = component-local) -----------
  // x0 = the seed mole fraction of the FIRST component (binary => the rest is
  // 1-x0 on the second).  start = the preset selector (cold / as-authored).
  const icBaseline = useMemo<IcTuning>(
    () => (icKnobs
      ? { t0: icKnobs.t0, x0: icComps.length > 0 ? (icKnobs.composition[icComps[0]!] ?? 1) : 1 }
      : { t0: 0, x0: 1 }),
    [icKnobs, icComps],
  );
  const [ic, setIc] = useState<IcTuning>(icBaseline);
  useEffect(() => { setIc(icBaseline); }, [icBaseline]);
  const [committedIc, setCommittedIc] = useState<IcTuning>(icBaseline);
  useEffect(() => { setCommittedIc(icBaseline); }, [icBaseline]);
  const [icPreset, setIcPreset] = useState<"cold" | "authored">("authored");

  // --- disturbance-picker state (reset-on-close = component-local) ----------
  // The forcing shape + the FULL param bag for whatever type is chosen.  Seeded
  // from the authored signal; switching type fills missing params from defaults
  // (keyed on the authored `mean` so an inlet-T disturbance stays near 320 K).
  const sigType0 = sigKnobs?.type ?? "step";
  const sigMean0 = sigKnobs?.params["mean"] ?? 320;
  const sigParams0 = useMemo<{ [k: string]: number }>(() => {
    const bag: { [k: string]: number } = {};
    for (const t of SIGNAL_TYPE_OPTIONS) {
      for (const key of SIGNAL_PARAMS[t.value]) {
        if (bag[key] === undefined) {
          bag[key] = sigKnobs?.params[key] ?? defaultSignalParam(t.value, key, sigMean0);
        }
      }
    }
    return bag;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigKnobs, sigMean0]);
  const [sigType, setSigType] = useState<SignalType>(sigType0);
  const [sigParams, setSigParams] = useState<{ [k: string]: number }>(sigParams0);
  // Has the disturbance been edited?  Until then we never rewrite the authored
  // block (ctrl02's Schedule + ctrl06's sine stay byte-identical on disk).
  const [sigDirty, setSigDirty] = useState(false);
  useEffect(() => {
    setSigType(sigType0);
    setSigParams(sigParams0);
    setSigDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigParams0, sigType0]);
  const [committedSigType, setCommittedSigType] = useState<SignalType>(sigType0);
  useEffect(() => { setCommittedSigType(sigType0); }, [sigType0]);

  // --- run plumbing (the WhatIf mechanism, whole case) ---------------------
  const [trace, setTrace] = useState<TrajectoryData | null>(
    seededResult?.trajectory ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [mockWarning, setMockWarning] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ t: number[]; pv: number[]; iae?: number } | null>(null);
  const [pins, setPins] = useState<PinnedRun[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // --- view controls -------------------------------------------------------
  const [bandPct, setBandPct] = useState<2 | 5>(2);
  const [lens, setLens] = useState<"track" | "reject">("reject");
  const [dictOpen, setDictOpen] = useState(false);
  // Opt-in outlet-composition overlay (the control objective): off by default,
  // honouring the one-primary-surface chrome credo (the story is T(t)).
  const [showComp, setShowComp] = useState(false);

  // Turn an IcTuning (T0 + the first component's mole fraction) into the
  // InitialPatch applyInitial wants: T0 + the FULL seed composition.  Binary
  // systems split the remainder onto the second component (1-x0); N>2 keeps the
  // other authored fractions, renormalised so the set sums to 1 (honest).
  const icToPatch = useCallback((it: IcTuning): InitialPatch | null => {
    if (!icKnobs) return null;
    const patch: InitialPatch = { t0: it.t0 };
    if (icComps.length >= 2) {
      const first = icComps[0]!;
      const x0 = Math.min(Math.max(it.x0, 0), 1);
      const rest = icComps.slice(1);
      const restSum = rest.reduce((a, c) => a + (icKnobs.composition[c] ?? 0), 0);
      const comp: { [k: string]: number } = { [first]: x0 };
      for (const c of rest) {
        comp[c] = restSum > 0 ? (1 - x0) * ((icKnobs.composition[c] ?? 0) / restSum)
                              : (1 - x0) / rest.length;
      }
      patch.composition = comp;
    }
    return patch;
  }, [icKnobs, icComps]);

  // The disturbance override layered into a run: the chosen forcing type + param
  // bag.  Undefined / not-dirty => leave the authored signal block untouched.
  interface SigOverride { type: SignalType; params: { [k: string]: number }; dirty: boolean }

  const buildFiles = useCallback(
    (t: Tuning, it?: IcTuning, sg?: SigOverride): CaseFiles | null => {
    if (!flowsheetJson || !pid) return null;
    // Layer the IC patch UNDER the tuning patch so a gain change and a start
    // change compose in one run (applyInitial(applyTuning(...))).  Both are
    // pure clone-and-mutate; nothing writes to disk.
    let next = applyTuning(flowsheetJson, pid, t) as JsonDict;
    const icPatch = it && icKnobs ? icToPatch(it) : null;
    if (icPatch && icKnobs) next = applyInitial(next, icKnobs, icPatch) as JsonDict;
    // The disturbance: only rewrite the signal block once the picker is touched
    // (keeps the authored Schedule/Signal byte-identical until the student acts).
    if (sg && sg.dirty && sigKnobs) {
      next = applySignalType(next, sigKnobs, sg.type, sg.params) as JsonDict;
    }
    return { ...caseFiles, flowsheet: next };
  }, [flowsheetJson, pid, caseFiles, icKnobs, icToPatch, sigKnobs]);

  // The PV column key (for the ghost/metrics) -- resolve once per trace.
  const pvKey = useMemo(() => {
    if (!trace || !pid) return undefined;
    const keys = Object.keys(trace.vars);
    return [`${pid.name}.PV`, pid.measure ? `${pid.measure.unit}.${pid.measure.cv}` : undefined]
      .filter((k): k is string => !!k)
      .find((k) => keys.includes(k)) ?? keys.find((k) => k.endsWith(".PV"));
  }, [trace, pid]);

  const runLoop = useCallback(async (t: Tuning, it?: IcTuning, sg?: SigOverride) => {
    const itEff = it ?? ic;
    const sgEff: SigOverride = sg ?? { type: sigType, params: sigParams, dirty: sigDirty };
    const files = buildFiles(t, itEff, sgEff);
    if (!files || busy) return;
    // Snapshot the current trace as the ghost BEFORE the new run (so the
    // before/after is a visible pair, never a blank).
    if (trace && pvKey) {
      const pv = trace.vars[pvKey];
      if (pv) {
        const m = pid
          ? controlMetrics(trace.t, pv, { reference: committed.setpoint, bandHalf: (bandPct / 100) * committed.setpoint })
          : null;
        setGhost({ t: trace.t, pv, iae: m?.iae });
      }
    }
    setBusy(true);
    setRunError(null);
    try {
      const resolved = await resolveAdapter("wasm");
      if (resolved.kind === "unavailable") {
        setRunError(resolved.fallbackReason
          ?? "The real (WebAssembly) solver could not be loaded — nothing was run.");
        return;
      }
      setMockWarning(resolved.kind === "mock"
        ? (resolved.fallbackReason ?? "Using the MOCK solver — numbers are NOT real.")
        : null);
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      const result: RunResult = await resolved.adapter.run(
        withDisplayPrefs(files, prefs), () => {}, ctl.signal);
      if (ctl.signal.aborted) return;
      if (result.status !== "done" || !result.trajectory) {
        const tail = (result.log ?? "").trim().split("\n").slice(-8).join("\n");
        // Keep the last good trace; an unstable gain is a teachable outcome.
        setRunError(
          (tail || "The solver reported an error (empty log).")
          + "\n\n(This gain destabilised the loop — the last stable trace is kept.)");
        return;
      }
      setTrace(result.trajectory);
      setCommitted(t);
      setCommittedIc(itEff);
      setCommittedSigType(sgEff.type);
    } catch (e) {
      if (!abortRef.current?.signal.aborted) setRunError((e as Error).message);
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildFiles, busy, trace, pvKey, prefs, pid, committed, bandPct, ic, sigType, sigParams, sigDirty]);

  // Pin the current trace as a labelled snapshot (Kp=4 vs 12 vs 20 overlay).
  const pinCurrent = useCallback(() => {
    if (!trace || !pvKey || !pid) return;
    const pv = trace.vars[pvKey];
    if (!pv) return;
    const m = controlMetrics(trace.t, pv, {
      reference: committed.setpoint, bandHalf: (bandPct / 100) * committed.setpoint,
    });
    // Enrich the label with the START when it differs from as-authored, so a
    // three-pin overlay reads "cold vs as-authored, same gains" = the
    // IC-sensitivity picture.
    let label = `Kp=${committed.kp} Ki=${committed.ki}`;
    if (icKnobs && Math.abs(committedIc.t0 - icBaseline.t0) > 0.5) {
      label += `  ·  T0=${committedIc.t0.toFixed(0)}${committedIc.t0 <= COLD_T0 ? " cold" : ""}`;
    }
    setPins((p) => [
      ...p.slice(-3),
      { label, t: trace.t, pv, iae: m.iae, color: PIN_COLORS[p.length % PIN_COLORS.length], opacity: 0.5 },
    ]);
  }, [trace, pvKey, pid, committed, committedIc, icKnobs, icBaseline, bandPct]);

  // --- metrics + windows ---------------------------------------------------
  const schedules: ScheduleKnobs[] = layer.schedules;
  const tEnd = trace ? (trace.t[trace.t.length - 1] ?? 0) : 0;

  // The Track window = the startup step [0, first disturbance]; the Reject
  // window = the first disturbance kick [t_dist, next] from the schedule.
  const windows = useMemo(() => {
    const allSteps = schedules.flatMap((s) => s.schedule);
    const w = disturbanceWindows(allSteps, tEnd);
    const track: [number, number] = [0, w[1]?.t0 ?? tEnd];
    // first NON-zero-time disturbance window
    const dist = w.find((x) => x.t0 > 0);
    const reject: [number, number] = dist ? [dist.t0, dist.t1] : [0, tEnd];
    return { track, reject };
  }, [schedules, tEnd]);

  const activeWindow = lens === "track" ? windows.track : windows.reject;

  const metrics = useMemo<ControlMetrics | null>(() => {
    if (!trace || !pvKey) return null;
    const pv = trace.vars[pvKey];
    if (!pv) return null;
    // For the Reject lens the "before" reference is the pre-disturbance PV at
    // the window start (the steady value the loop must hold), not the setpoint.
    const idx = trace.t.findIndex((ti) => ti >= activeWindow[0] - 1e-9);
    const preValue = lens === "reject" && idx >= 0 ? pv[idx] : undefined;
    return controlMetrics(trace.t, pv, {
      reference: committed.setpoint,
      bandHalf: (bandPct / 100) * committed.setpoint,
      window: activeWindow,
      preValue,
    });
  }, [trace, pvKey, committed.setpoint, bandPct, activeWindow, lens]);

  // ghost metrics for the ▲/▼ delta (previous run's IAE over the same window).
  const ghostMetrics = useMemo<ControlMetrics | null>(() => {
    if (!ghost) return null;
    return controlMetrics(ghost.t, ghost.pv, {
      reference: committed.setpoint,
      bandHalf: (bandPct / 100) * committed.setpoint,
      window: activeWindow,
    });
  }, [ghost, committed.setpoint, bandPct, activeWindow]);

  // --- the forced-response (Bode) readout (sine forcing only) --------------
  // A_out = half the steady peak-to-peak of the PV over the last forcing period;
  // ratio dB = 20·log10(A_out/A_in); phase lag from the input/output peak offset.
  const bode = useMemo<BodePoint | null>(() => {
    if (!trace || !pvKey || committedSigType !== "sine") return null;
    const pv = trace.vars[pvKey];
    if (!pv) return null;
    const aIn = sigParams["amplitude"] ?? 0;
    const period = sigParams["period"] ?? 0;
    const tStart = sigParams["tStart"] ?? 0;
    const phase = sigParams["phase"] ?? 0;
    return bodePoint(trace.t, pv, aIn, period, tStart, phase);
  }, [trace, pvKey, committedSigType, sigParams]);

  // --- the mutated controllers(...) [+ units initial{}] block text (Show dict)
  const dictText = useMemo(() => {
    if (!flowsheetJson || !pid) return "";
    let patched = applyTuning(flowsheetJson, pid, committed) as JsonDict;
    // Mirror the live disturbance into the dict text when the picker is dirty.
    if (sigDirty && sigKnobs) {
      patched = applySignalType(patched, sigKnobs, committedSigType, sigParams) as JsonDict;
    }
    const controllers = patched["controllers"];
    // When an IC override is live, also render the mutated `units` block so the
    // student can copy BOTH the gains and the start back to disk.
    const icActive = icKnobs && (
      Math.abs(committedIc.t0 - icBaseline.t0) > 1e-6
      || Math.abs(committedIc.x0 - icBaseline.x0) > 1e-9);
    const icPatch = icActive && icKnobs ? icToPatch(committedIc) : null;
    const withIc = icPatch && icKnobs
      ? applyInitial(patched, icKnobs, icPatch) as JsonDict : patched;
    const block: JsonDict = icActive
      ? { units: withIc["units"] ?? [], controllers: controllers ?? [] }
      : { controllers: controllers ?? [] };
    try {
      return serialize(fromJson(block, "flowsheetDict"));
    } catch {
      return "(could not serialise the controllers block)";
    }
  }, [flowsheetJson, pid, committed, committedIc, icKnobs, icBaseline, icToPatch,
      sigDirty, sigKnobs, committedSigType, sigParams]);

  // --- the interacting-form twin (textbook lens) ---------------------------
  const twin = useMemo(() => parallelToInteracting(tuning.kp, tuning.ki, tuning.kd), [tuning]);

  // --- gate ----------------------------------------------------------------
  const application = typeof caseFiles.controlDict?.["application"] === "string"
    ? (caseFiles.controlDict["application"] as string) : undefined;
  if (application !== "choupoCtrl" || !pid) {
    return (
      <Box p="lg" maw={620}>
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={14} />}>
          <Text size="sm" fw={600}>The Control Room needs a closed-loop dynamic case.</Text>
          <Text size="xs" c="dimmed" mt={4}>
            {application !== "choupoCtrl"
              ? "This is not a choupoCtrl case (its controlDict.application is "
                + `${application ?? "unset"}).  Open a control tutorial — e.g. `
                + "ctrl02_disturbance_rejection."
              : "This choupoCtrl case declares no PID controller.  The tuning rail "
                + "drives a PID's gains/setpoint, so there is nothing to tune here."}
          </Text>
        </Alert>
      </Box>
    );
  }

  const ghostsForPlot: PinnedRun[] = [
    ...(ghost ? [{ label: "PV (prev)", t: ghost.t, pv: ghost.pv, iae: ghostMetrics?.iae, color: PLOT_COLORS.axis, opacity: 0.35 }] : []),
    ...pins,
  ];

  // The forcing controller emits a `<name>.MV` column when it runs as a Signal:
  // the authored `type Signal`, or a dirtied conversion to a non-staircase shape.
  // Drawing that column under the PV shows the input wave the loop is rejecting.
  const signalIsForcing = !!sigKnobs
    && (sigKnobs.kind === "Signal" || (sigDirty && committedSigType !== "staircase"));
  const signalName = signalIsForcing ? sigKnobs!.name : undefined;
  const signalMv = signalIsForcing ? sigKnobs!.actuate?.mv : undefined;

  const railW = collapsed ? 0 : 260;

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* ---- ONE toolbar row (nowrap) ---- */}
      <Group
        gap="sm" px="sm" py={6} wrap="nowrap"
        style={{ borderBottom: "1px solid var(--mantine-color-dark-5)", flex: "0 0 auto", overflowX: "auto" }}
      >
        <ChipMono label="Kp" value={tuning.kp} />
        <ChipMono label="Ki" value={tuning.ki} />
        <ChipMono label="Kd" value={tuning.kd} />
        <ChipMono label="SP" value={tuning.setpoint} unit="K" />
        <Button
          size="compact-xs" color="accent" leftSection={<IconPlayerPlay size={13} />}
          loading={busy} onClick={() => void runLoop(tuning)}
        >
          Run loop
        </Button>
        <Button
          size="compact-xs" variant="light" leftSection={<IconPin size={13} />}
          disabled={!trace} onClick={pinCurrent}
        >
          Pin
        </Button>
        {pins.length > 0 && (
          <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setPins([])}>
            clear pins
          </Button>
        )}
        <Box style={{ flex: 1 }} />
        <SegmentedControl
          size="xs"
          value={lens}
          onChange={(v) => setLens(v as "track" | "reject")}
          data={[{ label: "Track", value: "track" }, { label: "Reject", value: "reject" }]}
        />
        <SegmentedControl
          size="xs"
          value={String(bandPct)}
          onChange={(v) => setBandPct(Number(v) as 2 | 5)}
          data={[{ label: "±2%", value: "2" }, { label: "±5%", value: "5" }]}
        />
        <Tooltip label="Overlay the reactor outlet composition (the control objective) on the moles axis." withArrow multiline w={240}>
          <Chip size="xs" radius="sm" color="grape" checked={showComp} onChange={setShowComp}>
            composition
          </Chip>
        </Tooltip>
        {busy && <Loader size="xs" color="accent" />}
      </Group>

      {/* ---- rail + plot ---- */}
      <Box style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
        {collapsed ? (
          <Box
            onClick={toggleCollapsed}
            title="Show tuning rail ( [ )"
            style={{
              width: 28, flex: "0 0 28px", cursor: "pointer",
              borderRight: "1px solid var(--mantine-color-dark-5)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <IconChevronRight size={16} />
          </Box>
        ) : (
          <Box
            style={{
              width: railW, flex: `0 0 ${railW}px`, minWidth: 0, overflowY: "auto",
              borderRight: "1px solid var(--mantine-color-dark-5)",
            }}
          >
            <Stack gap={14} p="sm">
              <Group justify="space-between" align="center">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">Tuning</Text>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={toggleCollapsed} title="Hide rail ( [ )">
                  <IconChevronLeft size={15} />
                </ActionIcon>
              </Group>

              <KnobSlider
                label="Kp (proportional)" path={pid.targetPaths.kp}
                value={tuning.kp} min={KP_RANGE[0]} max={KP_RANGE[1]} step={0.1}
                onPreview={(v) => setTuning((t) => ({ ...t, kp: v }))}
                onCommit={(v) => void runLoop({ ...tuning, kp: v })}
              />
              <KnobSlider
                label="Ki (integral)" path={pid.targetPaths.ki}
                value={tuning.ki} min={KI_RANGE[0]} max={KI_RANGE[1]} step={0.005}
                onPreview={(v) => setTuning((t) => ({ ...t, ki: v }))}
                onCommit={(v) => void runLoop({ ...tuning, ki: v })}
              />
              <KnobSlider
                label="Kd (derivative)" path={pid.targetPaths.kd}
                value={tuning.kd} min={KD_RANGE[0]} max={KD_RANGE[1]} step={0.5}
                onPreview={(v) => setTuning((t) => ({ ...t, kd: v }))}
                onCommit={(v) => void runLoop({ ...tuning, kd: v })}
              />
              <KnobSlider
                label="setpoint [K]" path={pid.targetPaths.setpoint}
                value={tuning.setpoint} min={SP_RANGE[0]} max={SP_RANGE[1]} step={0.5}
                onPreview={(v) => setTuning((t) => ({ ...t, setpoint: v }))}
                onCommit={(v) => void runLoop({ ...tuning, setpoint: v })}
              />

              {/* the interacting-form twin (textbook lens) */}
              <Box style={{ borderTop: "1px dashed var(--mantine-color-dark-4)", paddingTop: 8 }}>
                <Text size="10px" c="dimmed" tt="uppercase" fw={600}>interacting-form equivalent</Text>
                <Text size="xs" ff="JetBrains Mono, monospace" mt={2}>
                  Kc {twin.kc.toFixed(2)} · τI {Number.isFinite(twin.tauI) ? `${twin.tauI.toFixed(0)} s` : "∞"} · τD {twin.tauD.toFixed(1)} s
                </Text>
                <Text size="9px" c="dimmed" mt={2}>τI = Kp/Ki · τD = Kd/Kp</Text>
              </Box>

              {/* ---- Initial conditions rail group ---- */}
              {icKnobs && (
                <Box style={{ borderTop: "1px dashed var(--mantine-color-dark-4)", paddingTop: 10 }}>
                  <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={6}>Initial state</Text>
                  <SegmentedControl
                    fullWidth size="xs" mb={8}
                    value={icPreset}
                    onChange={(v) => {
                      const p = v as "cold" | "authored";
                      setIcPreset(p);
                      const t0 = p === "cold" ? COLD_T0 : icBaseline.t0;
                      const next = { ...ic, t0 };
                      setIc(next);
                      void runLoop(tuning, next);
                    }}
                    data={[{ label: "cold", value: "cold" }, { label: "as-authored", value: "authored" }]}
                  />
                  <KnobSlider
                    label="T₀ [K]" path={icKnobs.targetPaths.t0}
                    value={ic.t0} min={T0_RANGE[0]} max={T0_RANGE[1]} step={0.5}
                    onPreview={(v) => setIc((s) => ({ ...s, t0: v }))}
                    onCommit={(v) => void runLoop(tuning, { ...ic, t0: v })}
                  />
                  {icComps.length >= 2 && (
                    <KnobSlider
                      label={`x₀(${icComps[0]})`} path={icKnobs.targetPaths.composition}
                      value={ic.x0} min={0} max={1} step={0.01}
                      onPreview={(v) => setIc((s) => ({ ...s, x0: v }))}
                      onCommit={(v) => void runLoop(tuning, { ...ic, x0: v })}
                    />
                  )}
                  <Text size="9px" c="dimmed" mt={2}>
                    same attractor, different transient — overlays the start’s effect
                  </Text>
                </Box>
              )}

              {/* ---- Disturbance picker rail group ---- */}
              {sigKnobs && (
                <Box style={{ borderTop: "1px dashed var(--mantine-color-dark-4)", paddingTop: 10 }}>
                  <Group justify="space-between" align="center" mb={6}>
                    <Text size="xs" tt="uppercase" fw={700} c="dimmed">Disturbance</Text>
                    <Text size="9px" c="dimmed" ff="JetBrains Mono, monospace">
                      {sigKnobs.actuate?.mv ?? "input"}
                    </Text>
                  </Group>
                  <SegmentedControl
                    fullWidth size="xs" mb={8}
                    value={sigType}
                    onChange={(v) => {
                      const nt = v as SignalType;
                      setSigType(nt);
                      setSigDirty(true);
                      void runLoop(tuning, ic, { type: nt, params: sigParams, dirty: true });
                    }}
                    data={SIGNAL_TYPE_OPTIONS}
                  />
                  {sigKnobs.kind === "Schedule" && sigType !== "staircase" && (
                    <Text size="9px" c="yellow.5" mb={6}>
                      converts the Schedule to a <code>type Signal</code> forcing.
                    </Text>
                  )}
                  {sigType === "staircase" ? (
                    <Text size="9px" c="dimmed" mb={4}>
                      step train (edit the times/values in <code>system/flowsheetDict</code>);
                      the markers above mirror it.
                    </Text>
                  ) : (
                    SIGNAL_PARAMS[sigType].map((key) => {
                      const r = SIGNAL_RANGE[key]!;
                      return (
                        <KnobSlider
                          key={key}
                          label={r.label}
                          path={`controllers[${sigKnobs.index}].signal.${key}`}
                          value={sigParams[key] ?? defaultSignalParam(sigType, key, sigMean0)}
                          min={r.min} max={r.max} step={r.step}
                          onPreview={(val) => setSigParams((p) => ({ ...p, [key]: val }))}
                          onCommit={(val) => {
                            const np = { ...sigParams, [key]: val };
                            setSigParams(np);
                            setSigDirty(true);
                            void runLoop(tuning, ic, { type: sigType, params: np, dirty: true });
                          }}
                        />
                      );
                    })
                  )}
                  <Text size="9px" c="dimmed" mt={2}>
                    {sigType === "sine"
                      ? "inject a sinusoid → read A_out/A_in (dB) + phase lag below = one Bode point."
                      : "the forcing wave is drawn under the PV on the plot."}
                  </Text>
                </Box>
              )}

              <Button
                size="compact-xs" variant="subtle"
                onClick={() => setDictOpen((o) => !o)}
              >
                {dictOpen ? "Hide dict" : "Show dict"}
              </Button>
              <Collapse in={dictOpen}>
                <Group justify="flex-end" mb={4}>
                  <CopyButton value={dictText}>
                    {({ copied, copy }) => (
                      <Button size="compact-xs" variant="light" color="accent" onClick={copy}>
                        {copied ? "Copied ✓" : "Copy"}
                      </Button>
                    )}
                  </CopyButton>
                </Group>
                <Code block style={{ fontSize: 10 }}>{dictText}</Code>
              </Collapse>

              {/* the mandatory honesty banner */}
              <Alert color="cyan" variant="light" icon={<IconInfoCircle size={13} />} p="xs">
                <Text size="10px">
                  Tuning re-runs the loop in the browser; nothing writes back — to
                  keep a gain, edit <code>system/controlDict</code>.
                </Text>
              </Alert>
            </Stack>
          </Box>
        )}

        {/* ---- the primary plot ---- */}
        <Box style={{ flex: 1, minWidth: 0, position: "relative" }}>
          {mockWarning && (
            <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={13} />} p="xs" m="xs">
              <Text size="xs">{mockWarning}</Text>
            </Alert>
          )}
          {runError && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={13} />} p="xs" m="xs"
              withCloseButton onClose={() => setRunError(null)}>
              <Code block style={{ fontSize: 10, whiteSpace: "pre-wrap", background: "transparent" }}>{runError}</Code>
            </Alert>
          )}
          {trace ? (
            <Box style={{ height: "100%", width: "100%" }}>
              <ClosedLoopPlot
                trajectory={trace}
                pid={pid}
                schedules={schedules}
                setpoint={tuning.setpoint}
                bandFraction={bandPct / 100}
                ghosts={ghostsForPlot}
                xRange={activeWindow}
                showComposition={showComp}
                signalName={signalName}
                signalMv={signalMv}
              />
            </Box>
          ) : (
            <Stack align="center" justify="center" h="100%" gap="sm">
              <IconRefresh size={28} opacity={0.4} />
              <Text size="sm" c="dimmed">
                Press <b>Run loop</b> (or move a slider) to integrate the closed loop.
              </Text>
            </Stack>
          )}
        </Box>
      </Box>

      {/* ---- ONE collapsible metrics footer ---- */}
      {metrics && (
        <Group
          gap="md" px="sm" py={6} wrap="wrap"
          style={{ borderTop: "1px solid var(--mantine-color-dark-5)", flex: "0 0 auto" }}
        >
          <MetricCard
            label="IAE" headline value={fmtExp(metrics.iae)}
            delta={ghostMetrics ? pctDelta(metrics.iae, ghostMetrics.iae) : null}
            betterDown
            formula="∫|SP − PV| dt over the window (trapezoid) — the score: lower is a tighter loop."
          />
          <MetricCard
            label="overshoot"
            value={metrics.overshootPct === null ? "—" : `${metrics.overshootPct.toFixed(1)}%`}
            delta={ghostMetrics && metrics.overshootPct !== null && ghostMetrics.overshootPct !== null
              ? pctDelta(metrics.overshootPct, ghostMetrics.overshootPct) : null}
            betterDown
            formula="(PV_peak − SP)/(SP − PV_before)·100 — how far it shoots past the target."
          />
          <MetricCard
            label="settling"
            value={metrics.settlingTime === null ? "— not settled" : `${metrics.settlingTime.toFixed(0)} s`}
            formula="Last exit of the ±band (the shaded ribbon) — null when it never settles inside it."
          />
          <MetricCard
            label="offset" value={metrics.steadyStateOffset.toFixed(2)}
            formula="SP − PV(end) — persists when Ki=0 (no integral action)."
          />
          <MetricCard
            label="ISE" value={fmtExp(metrics.ise)}
            formula="∫(SP − PV)² dt — penalises big early errors harder than IAE."
          />
          <Tooltip label="From the overshoot-peak envelope (decay ratio of successive peaks)." withArrow multiline w={240}>
            <Badge size="lg" variant="light" color={dampingColor(metrics.dampingVerdict)} radius="sm"
              styles={{ root: { textTransform: "none" } }}>
              {metrics.dampingVerdict}
              {metrics.decayRatio !== null ? `  (decay ${metrics.decayRatio.toFixed(2)})` : ""}
            </Badge>
          </Tooltip>
          <Text size="10px" c="dimmed">
            window: {lens} [{activeWindow[0].toFixed(0)}–{activeWindow[1].toFixed(0)} s]
          </Text>
        </Group>
      )}

      {/* ---- forcing readout strip (the Bode point for a sine) ---- */}
      {signalIsForcing && committedSigType === "sine" && (
        <Group
          gap="md" px="sm" py={6} wrap="wrap"
          style={{ borderTop: "1px solid var(--mantine-color-dark-5)", flex: "0 0 auto" }}
        >
          <Text size="10px" tt="uppercase" fw={700} c="grape.4">forcing — Bode point</Text>
          {bode ? (
            <>
              <MetricCard label="A_in" value={`${bode.aIn.toFixed(1)} K`}
                formula="The forcing sine's amplitude (the input swing)." />
              <MetricCard label="A_out" value={`${bode.aOut.toFixed(2)} K`}
                formula="Half the steady peak-to-peak of the PV over the last forcing period." />
              <MetricCard label="A_out/A_in"
                value={Number.isFinite(bode.ratioDb) ? `${bode.ratioDb.toFixed(1)} dB` : "—"}
                formula="Amplitude ratio in decibels: 20·log10(A_out/A_in) — one Bode magnitude point." />
              <MetricCard label="phase lag"
                value={Number.isFinite(bode.phaseLagDeg) ? `${bode.phaseLagDeg.toFixed(0)}°` : "—"}
                formula="Time offset between the input peak and the PV peak, in degrees of the forcing cycle." />
              <MetricCard label="ω" value={`${bode.omega.toFixed(4)} rad/s`}
                formula="Forcing angular frequency ω = 2π/period — the x of the Bode plot." />
              <Text size="9px" c="dimmed" maw={220}>
                sweep <code>period</code>, re-run, and you trace the closed loop’s
                frequency response by hand.
              </Text>
            </>
          ) : (
            <Text size="10px" c="dimmed">
              run a few periods of the sine to read the steady-cycle amplitude ratio.
            </Text>
          )}
        </Group>
      )}
    </Box>
  );
}

/* --------------------------- small components ----------------------------- */

function ChipMono({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <Text size="xs" ff="JetBrains Mono, monospace" style={{ whiteSpace: "nowrap" }}>
      <Text span c="dimmed">{label}</Text> {fmtNum(value)}{unit ? `${unit}` : ""}
    </Text>
  );
}

function KnobSlider({
  label, path, value, min, max, step, onPreview, onCommit,
}: {
  label: string; path: string; value: number; min: number; max: number; step: number;
  onPreview: (v: number) => void; onCommit: (v: number) => void;
}) {
  return (
    <Box>
      <Group justify="space-between" align="baseline" mb={2}>
        <Text size="xs" fw={500}>{label}</Text>
        <Text size="xs" ff="JetBrains Mono, monospace" c="accent">{fmtNum(value)}</Text>
      </Group>
      <Slider
        value={value} min={min} max={max} step={step}
        onChange={onPreview}
        onChangeEnd={onCommit}
        label={(v) => fmtNum(v)}
        size="sm" color="accent"
      />
      <Text size="9px" c="dimmed" ff="JetBrains Mono, monospace" mt={2}>{path}</Text>
    </Box>
  );
}

function MetricCard({
  label, value, delta, betterDown, headline, formula,
}: {
  label: string; value: string; delta?: number | null; betterDown?: boolean;
  headline?: boolean; formula: string;
}) {
  const arrow = delta == null || !Number.isFinite(delta) ? null
    : delta < 0 ? "▼" : delta > 0 ? "▲" : "=";
  const good = delta == null ? undefined
    : betterDown ? delta < 0 : delta > 0;
  return (
    <Tooltip label={formula} withArrow multiline w={260} openDelay={200}>
      <Box style={{ minWidth: 78 }}>
        <Text size="10px" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
        <Group gap={4} align="baseline">
          <Text size={headline ? "lg" : "sm"} fw={headline ? 700 : 500}
            ff="JetBrains Mono, monospace" c={headline ? "accent" : undefined}>
            {value}
          </Text>
          {arrow && (
            <Text size="10px" c={good ? "teal.5" : "red.5"} ff="JetBrains Mono, monospace">
              {arrow} {Math.abs(delta!).toFixed(0)}%
            </Text>
          )}
        </Group>
      </Box>
    </Tooltip>
  );
}

/* ------------------------------- helpers ---------------------------------- */

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(3);
}
function fmtExp(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toExponential(2);
}
function pctDelta(now: number, prev: number | undefined): number | null {
  if (prev === undefined || !Number.isFinite(prev) || prev === 0) return null;
  return ((now - prev) / Math.abs(prev)) * 100;
}
