/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  ElectrolyteModelsTool -- "I have a solution with salts; which activity model
  should I declare, and what do I lose with the others?"

  The ENGINE computes every model value: four props cases per salt (Pitzer
  and eNRTL through the package a process unit declares, Davies through the
  speciation solver on free ions and with the catalogue's ion pairs), run
  with choupoProps in the browser, plus two cases for step 6 on MgSO4.  The
  PAGE draws them beside the measured tables of the tree and does the small
  closed-form arithmetic gui/src/case/electrolyteModels.ts holds (the limiting
  law, a mean from activities, phi from a_w, Pi from a_w, deviations); every
  panel says which is which.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert, Badge, Box, Code, Group, Loader, SegmentedControl, Select, Stack, Table, Text, Title,
} from "@mantine/core";

import { useCaseFilesRun } from "../../case/methodRun.js";
import { filesToCaseFiles } from "../../cases/tutorials.js";
import {
  A_PHI_25, DAVIES_I_MAX, EM_CASE_NAME, EM_REFUSAL_SALT, EM_SALTS, M_WATER, R_GAS, T_25, V_WATER_25,
  awFromPhi, chooseModel, daviesMolalities, debyeHuckelLimit, deviation, deviationNearI,
  emDaviesCaseFiles, emMolalities, emPackageCaseFiles, emPackageThermo, ionicStrength, nuOf,
  osmoticPressureBar, pairedSpecies, readDaviesRun, readPackageRun, saltById,
  type ChoiceAnswers, type MeasuredTable, type ModelPoint, type SaltDef,
} from "../../case/electrolyteModels.js";
import { inSampleAgainst, measuredTable, pairRecord, pairStem } from "./electrolyteModelsData.js";
import { OriginMark, type OriginKind } from "./origin.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { EM_LIMITS, EM_STEPS } from "./electrolyteModelsLesson.js";

// ---- drawing ------------------------------------------------------------------------

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";

interface SeriesStyle { key: string; label: string; color: string; dash?: string }
const STYLE: Record<string, SeriesStyle> = {
  pitzer: { key: "pitzer", label: "Pitzer", color: "#2a78d6" },
  enrtl: { key: "enrtl", label: "eNRTL", color: "#1baf7a", dash: "10 4" },
  davies: { key: "davies", label: "Davies, free ions", color: "#c0392b" },
  daviesPairs: { key: "daviesPairs", label: "Davies + catalogue ion pairs", color: "#eb6834", dash: "4 3" },
  dh: { key: "dh", label: "Debye-Hückel limit", color: "#8a8f98", dash: "2 3" },
};

/** The limit drawn alone (step 1) is the subject of its plot: solid. */
const DH_ALONE: SeriesStyle = { key: "dhAlone", label: "Debye-Hückel limit", color: "#5c6370" };

const fmt = (v: number, d = 3): string => {
  if (!Number.isFinite(v)) return "—";
  const s = v.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
const pct = (v: number, d = 2): string => (Number.isFinite(v) ? `${v > 0 ? "+" : ""}${fmt(v, d)} %` : "—");

interface Line { style: SeriesStyle; pts: [number, number][] }
interface Dots { label: string; pts: [number, number][]; open?: [number, number][] }

/** A plain SVG plot: lines (models) and dots (measurements), an optional
 *  log10 x axis, clipped to the frame.  Lines that leave the frame are
 *  clipped, never rescaled to fit -- the frame is set by the measurements. */
function Plot({ lines, dots, xLabel, yLabel, logX, x0, x1, y0, y1, aria }: {
  lines: Line[]; dots: Dots; xLabel: string; yLabel: string; logX: boolean;
  x0: number; x1: number; y0: number; y1: number; aria: string;
}): JSX.Element {
  const W = 620, H = 360, L = 64, R = 16, T = 14, B = 52;
  const fx = (x: number) => logX ? Math.log10(x) : x;
  const X = (x: number) => L + (W - L - R) * (fx(x) - fx(x0)) / (fx(x1) - fx(x0));
  const Y = (y: number) => T + (H - T - B) * (1 - (y - y0) / (y1 - y0));
  const xt: number[] = [];
  if (logX) for (let e = Math.ceil(Math.log10(x0) - 1e-9); e <= Math.log10(x1) + 1e-9; e++) xt.push(10 ** e);
  else { const st = niceStep((x1 - x0) / 6); for (let v = Math.ceil(x0 / st) * st; v <= x1 + 1e-9; v += st) xt.push(v); }
  const yst = niceStep((y1 - y0) / 6);
  const yt: number[] = [];
  for (let v = Math.ceil(y0 / yst) * yst; v <= y1 + 1e-9; v += yst) yt.push(Number(v.toFixed(10)));
  const path = (pts: [number, number][]) => pts.filter(([x]) => x >= x0 && x <= x1)
    .map(([x, y], k) => `${k ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  const clip = `clip-${aria.replace(/\W/g, "")}`;
  return (
    <Box style={{ width: "100%", maxWidth: 680, margin: "0 auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={aria} style={{ display: "block" }}>
        <defs><clipPath id={clip}><rect x={L} y={T} width={W - L - R} height={H - T - B} /></clipPath></defs>
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="none" stroke={GRID} />
        {xt.map((v) => (
          <g key={`x${v}`}>
            <line x1={X(v)} x2={X(v)} y1={T} y2={H - B} stroke={GRID} strokeWidth={0.6} />
            <text x={X(v)} y={H - B + 18} fontSize={13} textAnchor="middle" fill={INK}>{tick(v)}</text>
          </g>
        ))}
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={GRID} strokeWidth={0.6} />
            <text x={L - 6} y={Y(v) + 4} fontSize={13} textAnchor="end" fill={INK}>{tick(v)}</text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 8} fontSize={14} textAnchor="middle" fill={TEXT}>{xLabel}</text>
        <text x={16} y={(T + H - B) / 2} fontSize={14} textAnchor="middle" fill={TEXT}
          transform={`rotate(-90 16 ${(T + H - B) / 2})`}>{yLabel}</text>
        <g clipPath={`url(#${clip})`}>
          {lines.map((l) => (
            <path key={l.style.key} d={path(l.pts)} fill="none" stroke={l.style.color} strokeWidth={2.2}
              strokeDasharray={l.style.dash} />
          ))}
          {dots.pts.map(([x, y], k) => (
            <circle key={`d${k}`} cx={X(x)} cy={Y(y)} r={4} fill={TEXT} />
          ))}
          {(dots.open ?? []).map(([x, y], k) => (
            <circle key={`o${k}`} cx={X(x)} cy={Y(y)} r={5} fill="var(--mantine-color-body)" stroke={TEXT} strokeWidth={1.6} />
          ))}
        </g>
      </svg>
    </Box>
  );
}

function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function tick(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) >= 1000 || Math.abs(v) < 0.01) return v.toExponential(0);
  return String(Number(v.toPrecision(3)));
}

function Legend({ items, dotLabel, openLabel }: {
  items: SeriesStyle[]; dotLabel: string; openLabel?: string;
}): JSX.Element {
  return (
    <Group gap={14} wrap="wrap">
      <Text size="xs"><Text span fw={700}>●</Text> {dotLabel}</Text>
      {openLabel && <Text size="xs"><Text span fw={700}>○</Text> {openLabel}</Text>}
      {items.map((s) => (
        <Text key={s.key} size="xs"><Text span c={s.color} fw={700}>{s.dash ? "╌╌" : "——"}</Text> {s.label}</Text>
      ))}
    </Group>
  );
}

// ---- panels ----------------------------------------------------------------------------

function Panel({ title, origin, originNote, children }: {
  title: string; origin: OriginKind | readonly OriginKind[];
  originNote?: string; children: ReactNode;
}): JSX.Element {
  return (
    <Box px="sm" py="sm" style={{ border: `1px solid ${GRID}`, borderRadius: 6, minWidth: 0 }}>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>{title}</Text>
      <Box mb={8}><OriginMark of={origin} note={originNote} /></Box>
      <Stack gap={10}>{children}</Stack>
    </Box>
  );
}

/** Tables scroll inside their own box, never the page. */
function Wide({ children }: { children: ReactNode }): JSX.Element {
  return <Box style={{ overflowX: "auto", maxWidth: "100%" }}>{children}</Box>;
}

function Status({ busy, err, what }: { busy: boolean; err: string | null; what: string }): JSX.Element | null {
  if (err)
    return (
      <Alert color="red" variant="light" title="the engine run did not finish">
        <Text size="sm" style={{ overflowWrap: "anywhere" }}>{err}</Text>
      </Alert>
    );
  if (busy)
    return (
      <Group gap={8} wrap="nowrap">
        <Loader size="xs" />
        <Text size="sm" c="dimmed">{what}</Text>
      </Group>
    );
  return null;
}

const step = lessonStepper(EM_STEPS);
const SALT_SHORT: Record<string, string> = { NaCl: "NaCl", KCl: "KCl", CaCl2: "CaCl₂", Na2SO4: "Na₂SO₄" };
const REFUSAL_MS = [0.1, 0.5, 1.0] as const;

interface ModelRow {
  key: string; label: string; style: SeriesStyle; pts: ModelPoint[];
  inSample: string; heldOut: boolean;
}

// ---- the page ------------------------------------------------------------------------------

export function ElectrolyteModelsTool(): JSX.Element {
  const [saltId, setSaltId] = useState<string>(EM_SALTS[0]!.id);
  const s: SaltDef = saltById(saltId);
  const table: MeasuredTable = useMemo(() => measuredTable(s), [s]);
  const ms = useMemo(() => emMolalities(table), [table]);
  const dms = useMemo(() => daviesMolalities(s, ms), [s, ms]);

  const runP = useCaseFilesRun(
    () => filesToCaseFiles(EM_CASE_NAME, emPackageCaseFiles(s, "Pitzer", ms)), `P|${s.id}`, "choupoProps");
  const runE = useCaseFilesRun(
    () => filesToCaseFiles(EM_CASE_NAME, emPackageCaseFiles(s, "eNRTL", ms)), `E|${s.id}`, "choupoProps");
  const runD = useCaseFilesRun(
    () => filesToCaseFiles(EM_CASE_NAME, emDaviesCaseFiles(s, dms, false)), `D|${s.id}`, "choupoProps");
  const runDP = useCaseFilesRun(
    () => filesToCaseFiles(EM_CASE_NAME, emDaviesCaseFiles(s, dms, true)), `DP|${s.id}`, "choupoProps");

  const pitzer = useMemo(() => readPackageRun(runP.result, s, "Pitzer", ms), [runP.result, s, ms]);
  const enrtl = useMemo(() => readPackageRun(runE.result, s, "eNRTL", ms), [runE.result, s, ms]);
  const davies = useMemo(() => readDaviesRun(runD.result, s, dms, false), [runD.result, s, dms]);
  const daviesPairs = useMemo(() => readDaviesRun(runDP.result, s, dms, true), [runDP.result, s, dms]);
  const pairs = useMemo(() => pairedSpecies(runDP.result, s, dms), [runDP.result, s, dms]);

  const recP = pairRecord(s, "Pitzer"), recE = pairRecord(s, "eNRTL");
  const vP = inSampleAgainst(recP, table), vE = inSampleAgainst(recE, table);
  const models: ModelRow[] = [
    { key: "pitzer", label: "Pitzer", style: STYLE.pitzer!, pts: pitzer,
      inSample: vP.inSample ? `yes: ${vP.why}` : `no: ${vP.why}`, heldOut: vP.heldOutRows },
    { key: "enrtl", label: "eNRTL", style: STYLE.enrtl!, pts: enrtl,
      inSample: vE.inSample ? `yes: ${vE.why}` : `no: ${vE.why}`, heldOut: vE.heldOutRows },
    { key: "davies", label: "Davies, free ions", style: STYLE.davies!, pts: davies,
      inSample: "no: Davies has no fitted parameter", heldOut: false },
    { key: "daviesPairs", label: "Davies + ion pairs", style: STYLE.daviesPairs!, pts: daviesPairs,
      inSample: "no: the ion pairs' constants are the catalogue's", heldOut: false },
  ];
  //  The two Davies curves differ only where the catalogue forms an ion pair
  //  that matters; they are drawn as one when they agree to 0.5 % everywhere.
  const pairsMatter = useMemo(() => daviesPairs.some((p) => {
    const f = davies.find((q) => q.m === p.m);
    return f !== undefined && Math.abs(p.gamma / f.gamma - 1) > 0.005;
  }), [davies, daviesPairs]);

  const mMax = table.rows[table.rows.length - 1]!.m;
  const Imax = ionicStrength(s, mMax);
  const heldOutRow = (r: { index: number }) => r.index % 4 === 3 && r.index !== 0 && r.index !== table.rows.length - 1;
  const anyHeld = models.some((m) => m.heldOut);

  // ---- step 1 plot: ln gamma vs sqrt(I), the limit alone ----------------------------
  const dhLine: [number, number][] = useMemo(() => {
    const out: [number, number][] = [];
    for (let k = 0; k <= 60; k++) {
      const sI = Math.sqrt(Imax) * k / 60;
      out.push([sI, -3 * A_PHI_25 * s.zc * s.za * sI]);
    }
    return out;
  }, [s, Imax]);
  const lnMeas: [number, number][] = table.rows.map((r) => [Math.sqrt(ionicStrength(s, r.m)), Math.log(r.gamma)]);
  const lnMin = Math.min(...lnMeas.map((p) => p[1]));
  const lnMax = Math.max(...lnMeas.map((p) => p[1]), 0);
  const first = table.rows[0]!;
  const dhFirst = debyeHuckelLimit(s, first.m);

  // ---- step 3 plots ---------------------------------------------------------------------
  const drawn = models.filter((m) => m.key !== "daviesPairs" || pairsMatter);
  const asLine = (m: ModelRow, w: "gamma" | "phi"): Line => ({ style: m.style, pts: m.pts.map((p) => [p.m, p[w]]) });
  const dhGamma: Line = { style: STYLE.dh!, pts: ms.map((m) => [m, debyeHuckelLimit(s, m).gamma]) };
  const gMeas = table.rows.map((r) => r.gamma), pMeas = table.rows.map((r) => r.phi);
  const gLo = Math.max(0, Math.min(...gMeas) * 0.7), gHi = Math.max(1.05, Math.max(...gMeas) * 1.25);
  const pLo = Math.min(0.5, Math.min(...pMeas) - 0.1), pHi = Math.max(1.1, Math.max(...pMeas) + 0.1);
  const split = (w: "gamma" | "phi") => {
    const closed: [number, number][] = [], open: [number, number][] = [];
    for (const r of table.rows) (anyHeld && heldOutRow(r) ? open : closed).push([r.m, r[w]]);
    return { closed, open };
  };
  const sg = split("gamma"), sp = split("phi");
  const leftFrame = models.filter((m) => m.pts.some((p) => p.gamma > gHi || p.gamma < gLo)).map((m) => m.label);

  // ---- step 4 ---------------------------------------------------------------------------
  const mOptions = table.rows.map((r) => String(r.m));
  const [mPick, setMPick] = useState<string>("0.5");
  const mSel = mOptions.includes(mPick) ? Number(mPick) : table.rows[Math.min(4, table.rows.length - 1)]!.m;
  const rowSel = table.rows.find((r) => r.m === mSel)!;
  const awMeas = awFromPhi(s, mSel, rowSel.phi);
  const piMeas = osmoticPressureBar(awMeas);

  // ---- step 5 ---------------------------------------------------------------------------
  const [ans, setAns] = useState<ChoiceAnswers>({
    ionicStrength: "0.1to0.5", severalSalts: false, otherSolvent: false, acidGases: false,
  });
  const verdict = chooseModel(ans);
  const dav01 = deviationNearI(davies, table, s, 0.1), dav05 = deviationNearI(davies, table, s, 0.5);
  const pit05 = deviationNearI(pitzer, table, s, 0.5);

  // ---- step 6 ---------------------------------------------------------------------------
  const mg = EM_REFUSAL_SALT;
  const runRP = useCaseFilesRun(
    () => filesToCaseFiles(EM_CASE_NAME, emPackageCaseFiles(mg, "Pitzer", REFUSAL_MS)), "R|Pitzer|MgSO4", "choupoProps");
  const runRE = useCaseFilesRun(
    () => filesToCaseFiles(EM_CASE_NAME, emPackageCaseFiles(mg, "eNRTL", REFUSAL_MS)), "R|eNRTL|MgSO4", "choupoProps");
  const mgPitzer = readPackageRun(runRP.result, mg, "Pitzer", REFUSAL_MS);
  const refusalLine = (runRE.log ?? "").split("\n").map((l) => l.trim())
    .find((l) => /fatal error|no parameters/i.test(l)) ?? null;

  const busyAny = runP.busy || runE.busy || runD.busy || runDP.busy;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Choosing an electrolyte activity model</Title>
          <Text size="sm" c="dimmed" mt={4}>
            You have a solution with salts and must declare an activity model for it. This page puts
            Davies, Pitzer and eNRTL side by side on one salt against its measured activity and osmotic
            coefficients at 25 °C, turns the difference into the osmotic pressure a membrane must
            overcome, and ends with the choice as four questions. The models are run by the engine in
            your browser; the page draws them and does only the arithmetic it prints.
          </Text>
        </Box>

        <Panel title="your salt" origin="assumption"
          originNote="the salt is your choice; every panel below follows it">
          <SegmentedControl fullWidth data={EM_SALTS.map((x) => ({ value: x.id, label: SALT_SHORT[x.id] ?? x.id }))}
            value={saltId} onChange={setSaltId} />
          <Text size="sm">
            {s.label}: {s.nuC} {s.cation}<sup>{s.zc > 1 ? `${s.zc}+` : "+"}</sup> and {s.nuA} {s.anion}
            <sup>{s.za > 1 ? `${s.za}−` : "−"}</sup> per formula unit, so I = {fmt(ionicStrength(s, 1), 0)} × m.
            Measured table: {table.rows.length} rows from {fmt(table.rows[0]!.m, 2)} to {fmt(mMax, 2)} mol/kg
            (I up to {fmt(Imax, 2)} mol/kg).
          </Text>
        </Panel>

        {step(1)}
        <Panel title="the Debye-Hückel limit alone, against the measured table" origin={["page", "reference"]}
          originNote="the line is this page's arithmetic with the engine's A_phi = 0.3915; the dots are the evaluated table">
          <Plot aria="limiting law plot" logX={false} x0={0} x1={Math.sqrt(Imax) * 1.02}
            y0={Math.min(lnMin, -3 * A_PHI_25 * s.zc * s.za * Math.sqrt(Imax)) * 1.05 - 0.05}
            y1={Math.max(0.1, lnMax + 0.1)}
            xLabel="√I, (mol/kg)^½" yLabel="ln γ±"
            lines={[{ style: DH_ALONE, pts: dhLine }]} dots={{ label: "measured", pts: lnMeas }} />
          <Legend items={[DH_ALONE]} dotLabel={`measured: ${tableCite(table)}`} />
          <Text size="xs" c="dimmed">
            The line is ln γ± = −3 × {A_PHI_25} × |{s.zc} × {s.za}| × √I. At the table's first row,
            m = {fmt(first.m, 2)} mol/kg (I = {fmt(ionicStrength(s, first.m), 2)}), it gives
            γ± = {fmt(dhFirst.gamma, 4)} against the measured {fmt(first.gamma, 4)}
            ({pct(100 * (dhFirst.gamma - first.gamma) / first.gamma, 1)}), and φ = {fmt(dhFirst.phi, 4)} against{" "}
            {fmt(first.phi, 4)}. A straight line in √I is all the limit knows.
          </Text>
        </Panel>

        {step(2)}
        {step(3)}
        <Panel title="the four model runs, against the measured table" origin={["engine", "page", "reference"]}
          originNote="each model's γ± and φ computed by choupoProps in this browser; Davies' φ, the mean with ion pairs and every deviation are this page's arithmetic; the dots are the evaluated table">
          <Stack gap={4}>
            <Status busy={runP.busy} err={runP.err} what="Pitzer: running choupoProps in your browser…" />
            <Status busy={runE.busy} err={runE.err} what="eNRTL: running choupoProps in your browser…" />
            <Status busy={runD.busy} err={runD.err} what="Davies, free ions: running the speciation solver…" />
            <Status busy={runDP.busy} err={runDP.err} what="Davies with the catalogue's ion pairs: running…" />
          </Stack>
          <Plot aria="mean activity coefficient plot" logX x0={1e-3} x1={mMax * 1.05} y0={gLo} y1={gHi}
            xLabel="m, mol/kg (log scale)" yLabel="γ±"
            lines={[dhGamma, ...[...drawn].reverse().map((m) => asLine(m, "gamma"))]}
            dots={{ label: "measured", pts: sg.closed, open: sg.open }} />
          <Plot aria="osmotic coefficient plot" logX x0={1e-3} x1={mMax * 1.05} y0={pLo} y1={pHi}
            xLabel="m, mol/kg (log scale)" yLabel="φ"
            lines={[...drawn].reverse().map((m) => asLine(m, "phi"))}
            dots={{ label: "measured", pts: sp.closed, open: sp.open }} />
          <Legend items={[...drawn.map((m) => m.style), STYLE.dh!]} dotLabel={`measured: ${tableCite(table)}`}
            openLabel={anyHeld ? "a row the eNRTL regression held out" : undefined} />
          {!busyAny && leftFrame.length > 0 && (
            <Text size="xs" c="dimmed">
              {leftFrame.join(" and ")} leave{leftFrame.length === 1 ? "s" : ""} the frame of the γ± plot, which is
              set by the measurements; the table below has the numbers. Davies is run only up to
              I = {DAVIES_I_MAX} mol/kg.
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {pairsMatter
              ? `With the catalogue's equilibria the speciation solver forms ${pairs.join(", ")}: the dashed orange curve is the stoichiometric mean γ± computed by this page from the free-ion activities the engine wrote, ((a₊^ν₊ a₋^ν₋)/((ν₊m)^ν₊ (ν₋m)^ν₋))^(1/ν).`
              : pairs.length
                ? `With the catalogue's equilibria the speciation solver forms ${pairs.join(", ")} only in traces: Davies with and without them agrees to 0.5 % at every molality, and only one Davies curve is drawn.`
                : "The catalogue holds no ion pair for these ions: one Davies curve is drawn."}
            {" "}Davies' φ is −ln a_w /(M_w ν m) with M_w = {M_WATER} kg/mol, from the engine's a_w.
          </Text>
          <Wide>
            <Table fz="xs" striped withTableBorder style={{ minWidth: 720 }}>
              <Table.Thead><Table.Tr>
                <Table.Th>model</Table.Th><Table.Th>γ±: mean |δ|</Table.Th><Table.Th>γ±: worst δ (at m)</Table.Th>
                <Table.Th>φ: mean |δ|</Table.Th><Table.Th>φ: worst δ</Table.Th>
                <Table.Th>held-out rows: mean |δ γ±|</Table.Th><Table.Th>fitted to this table?</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {models.filter((m) => m.key !== "daviesPairs" || pairsMatter).map((m) => {
                  const g = deviation(m.pts, table, "gamma"), p = deviation(m.pts, table, "phi");
                  const h = m.heldOut ? deviation(m.pts, table, "gamma", heldOutRow) : null;
                  const rec = m.key === "pitzer" ? recP : m.key === "enrtl" ? recE : null;
                  return (
                    <Table.Tr key={m.key}>
                      <Table.Td><Text span size="xs" c={m.style.color} fw={700}>{m.label}</Text></Table.Td>
                      <Table.Td>{g ? `${fmt(g.aadPct, 2)} % (${g.n} rows)` : "—"}</Table.Td>
                      <Table.Td>{g ? `${pct(g.worstSigned)} (${fmt(g.worstM, 2)})` : "—"}</Table.Td>
                      <Table.Td>{p ? `${fmt(p.aadPct, 2)} %` : "—"}</Table.Td>
                      <Table.Td>{p ? `${pct(p.worstSigned)} (${fmt(p.worstM, 2)})` : "—"}</Table.Td>
                      <Table.Td>{h ? `${fmt(h.aadPct, 2)} % (${h.n} rows)` : "—"}</Table.Td>
                      <Table.Td>
                        <Badge size="xs" variant="light" color={m.inSample.startsWith("yes") ? "yellow" : "gray"}>
                          {m.inSample.startsWith("yes") ? "in-sample" : "not regressed in this tree"}
                        </Badge>{" "}
                        <Text span size="xs">{m.inSample.replace(/^(yes|no): /, "")}</Text>
                        {rec && <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>{rec.file}: source "{rec.source}"</Text>}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Wide>
          <Text size="xs" c="dimmed">
            δ = 100 (model − measured)/measured, at each row of the table (every model was run at
            exactly those molalities). Davies is compared only on the rows with I ≤ {DAVIES_I_MAX} mol/kg.
            A model marked in-sample was regressed to this very table: its δ shows that the fit worked,
            not that the model predicts.
            {anyHeld ? " The held-out rows were left out of that regression (every fourth row), but they are interleaved points of the same source and cannot contradict it." : ""}
          </Text>
          <details>
            <summary style={{ cursor: "pointer" }}><Text span size="xs">What the page declared to the engine for Pitzer and eNRTL</Text></summary>
            <Code block fz="xs" style={{ overflowX: "auto" }}>{emPackageThermo(s, "Pitzer")}</Code>
            <Text size="xs" mt={4}>eNRTL: the same file with <Text span ff="monospace" size="xs">model eNRTL;</Text>.
              Davies: a <Text span ff="monospace" size="xs">speciate</Text> operation with{" "}
              <Text span ff="monospace" size="xs">activityModel davies;</Text> on an aqueous surface declaring{" "}
              <Text span ff="monospace" size="xs">model Davies;</Text>.</Text>
          </details>
        </Panel>

        {step(4)}
        <Panel title="the osmotic pressure at one molality" origin={["engine", "page", "assumption"]}
          originNote="a_w from each engine run; Π from a_w is this page's arithmetic; the molality is your choice">
          <Select label="molality, mol/kg (a row of the measured table)" data={mOptions} value={String(mSel)}
            onChange={(v) => { if (v) setMPick(v); }} allowDeselect={false} style={{ maxWidth: 320 }} />
          <Wide>
            <Table fz="xs" striped withTableBorder style={{ minWidth: 340 }}>
              <Table.Thead><Table.Tr>
                <Table.Th>from</Table.Th><Table.Th>a_w</Table.Th><Table.Th>Π, bar</Table.Th><Table.Th>vs measured</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>measured, φ = {fmt(rowSel.phi, 4)}</Table.Td>
                  <Table.Td>{fmt(awMeas, 6)}</Table.Td><Table.Td>{fmt(piMeas, 2)}</Table.Td><Table.Td>—</Table.Td>
                </Table.Tr>
                {(() => {
                  const aw = awFromPhi(s, mSel, 1), pi = osmoticPressureBar(aw);
                  return (
                    <Table.Tr>
                      <Table.Td>ideal, φ = 1</Table.Td>
                      <Table.Td>{fmt(aw, 6)}</Table.Td><Table.Td>{fmt(pi, 2)}</Table.Td>
                      <Table.Td>{pct(100 * (pi - piMeas) / piMeas, 1)}</Table.Td>
                    </Table.Tr>
                  );
                })()}
                {models.filter((m) => m.key !== "daviesPairs" || pairsMatter).map((m) => {
                  const p = m.pts.find((x) => x.m === mSel);
                  const pi = p ? osmoticPressureBar(p.aw) : NaN;
                  return (
                    <Table.Tr key={m.key}>
                      <Table.Td><Text span size="xs" c={m.style.color} fw={700}>{m.label}</Text></Table.Td>
                      <Table.Td>{p ? fmt(p.aw, 6) : (m.key.startsWith("davies") && ionicStrength(s, mSel) > DAVIES_I_MAX ? `not run above I = ${DAVIES_I_MAX}` : "—")}</Table.Td>
                      <Table.Td>{p ? fmt(pi, 2) : "—"}</Table.Td>
                      <Table.Td>{p ? pct(100 * (pi - piMeas) / piMeas, 1) : "—"}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Wide>
          <Text size="xs" c="dimmed">
            The models' a_w are the engine's; the measured row's a_w is this page's, from the table's φ by
            ln a_w = −ν m M_w φ with ν = {nuOf(s)} and M_w = {M_WATER} kg/mol; the ideal row is φ = 1, van 't
            Hoff's law in its molality form (pure-water molar volume, not the solution's molarity). Π = −(R T / V̄_w) ln a_w with R = {R_GAS} J/(mol K), T = {T_25} K and
            V̄_w = {(V_WATER_25 * 1e5).toFixed(3)} × 10⁻⁵ m³/mol, the engine's molar volume of water at 25 °C;
            1 bar = 10⁵ Pa.
          </Text>
        </Panel>

        {step(5)}
        <Panel title="the choice" origin={["engine", "page", "assumption"]}
          originNote="your answers are inputs; the deviations quoted are this page's arithmetic on the engine's runs above">
          <Stack gap={8}>
            <Box>
              <Text size="sm" fw={500} mb={4}>Does the solution carry dissolved NH3, CO2 or H2S?</Text>
              <SegmentedControl size="xs" data={["no", "yes"]} value={ans.acidGases ? "yes" : "no"}
                onChange={(v) => setAns({ ...ans, acidGases: v === "yes" })} />
            </Box>
            <Box>
              <Text size="sm" fw={500} mb={4}>Is there a solvent besides water (an alcohol, a glycol)?</Text>
              <SegmentedControl size="xs" data={["no", "yes"]} value={ans.otherSolvent ? "yes" : "no"}
                onChange={(v) => setAns({ ...ans, otherSolvent: v === "yes" })} />
            </Box>
            <Box>
              <Text size="sm" fw={500} mb={4}>More than one salt?</Text>
              <SegmentedControl size="xs" data={["no", "yes"]} value={ans.severalSalts ? "yes" : "no"}
                onChange={(v) => setAns({ ...ans, severalSalts: v === "yes" })} />
            </Box>
            <Box>
              <Text size="sm" fw={500} mb={4}>Highest ionic strength, mol/kg</Text>
              <SegmentedControl size="xs"
                data={[{ value: "below0.1", label: "below 0.1" }, { value: "0.1to0.5", label: "0.1 to 0.5" },
                  { value: "above0.5", label: "above 0.5" }]}
                value={ans.ionicStrength}
                onChange={(v) => setAns({ ...ans, ionicStrength: v as ChoiceAnswers["ionicStrength"] })} />
            </Box>
          </Stack>
          <Box px="sm" py="xs" style={{ borderLeft: "3px solid var(--mantine-color-accent-6, #2a78d6)" }}>
            <Text size="sm" fw={700}>Declare {verdict.model === "pitzer" ? "Pitzer" : verdict.model === "davies" ? "Davies"
              : verdict.model === "pitzerHMW" ? "pitzerHMW" : verdict.model === "eNRTL" ? "eNRTL" : "edwardsPitzer"}</Text>
            <Text size="xs" ff="monospace" style={{ overflowWrap: "anywhere" }}>{verdict.declare}</Text>
            <Stack gap={2} mt={4}>{verdict.because.map((b) => <Text key={b} size="sm">{b}</Text>)}</Stack>
            {verdict.seeTool && <Text size="xs" c="dimmed" mt={4}>The EduTool <Text span ff="monospace" size="xs">{verdict.seeTool}</Text> works with this model.</Text>}
          </Box>
          <Text size="sm">
            Measured on {s.label} above: Davies on free ions is{" "}
            {dav01 ? `${pct(dav01.pct, 1)} off the table at I = ${fmt(dav01.I, 2)}` : "not yet run"}
            {dav05 ? ` and ${pct(dav05.pct, 1)} at I = ${fmt(dav05.I, 2)} mol/kg` : ""}; Pitzer is{" "}
            {pit05 ? `${pct(pit05.pct, 2)} at I = ${fmt(pit05.I, 2)}` : "not yet run"}.
            {s.id === "Na2SO4" && pairsMatter ? " On this salt Davies comes within a few per cent at low ionic strength only with the NaSO4− ion pair (the dashed orange curve of step 3), which is chemistry the catalogue declares, not something Davies knows." : ""}
          </Text>
        </Panel>

        {step(6)}
        <Panel title="MgSO4 under both models" origin={["engine", "reference"]}
          originNote="two runs of choupoProps in this browser; the record list is the catalogue's files as bundled">
          <Status busy={runRP.busy} err={null} what="running Pitzer on MgSO4…" />
          <Status busy={runRE.busy} err={null} what="running eNRTL on MgSO4…" />
          <Box>
            <Text size="sm" fw={700}>Pitzer</Text>
            <Text size="sm">{mgPitzer.length
              ? mgPitzer.map((p) => `γ± = ${fmt(p.gamma, 4)} at ${p.m} mol/kg`).join("; ")
              : runRP.err ?? "—"}</Text>
          </Box>
          <Box>
            <Text size="sm" fw={700}>eNRTL</Text>
            {runRE.err || refusalLine
              ? <Text size="xs" ff="monospace" c="red" style={{ overflowWrap: "anywhere" }}>{refusalLine ?? runRE.err}</Text>
              : <Text size="sm">{runRE.result ? "an answer -- the catalogue now holds an eNRTL record for Mg-SO4" : "—"}</Text>}
          </Box>
          <Text size="xs" c="dimmed">
            No MgSO4 table is in the tree, so the Pitzer numbers here are compared with nothing; the
            point is that one model answers and the other refuses, naming the file it looked for.
          </Text>
          <Wide>
            <Table fz="xs" striped withTableBorder style={{ minWidth: 300 }}>
              <Table.Thead><Table.Tr>
                <Table.Th>salt</Table.Th><Table.Th>Pitzer record</Table.Th><Table.Th>eNRTL record</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {[...EM_SALTS, EM_REFUSAL_SALT].map((x) => {
                  const a = pairRecord(x, "Pitzer"), b = pairRecord(x, "eNRTL");
                  return (
                    <Table.Tr key={x.id}>
                      <Table.Td>{x.id}</Table.Td>
                      <Table.Td>{a ? `${pairStem(x)}.dat` : "none"}</Table.Td>
                      <Table.Td>{b ? `${pairStem(x)}.dat` : <Text span size="xs" c="red">none</Text>}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Wide>
        </Panel>

        <LessonLimits limits={EM_LIMITS} />
        <LessonReferences tool="electrolyte-models" />
      </Stack>
    </Box>
  );
}

/** "Hamer and Wu (1972), Table 16" from the table's own source line. */
export function tableCite(t: MeasuredTable): string {
  const who = (/^(.*?),\s*(?:Osmotic|Evaluated)/.exec(t.source)?.[1] ?? t.source)
    .replace(/\b[A-Z]\.\s*(?:-?[A-Z]\.\s*)*/g, "").replace(/\s+/g, " ").trim();
  const year = /\((\d{4})\)/.exec(t.source)?.[1] ?? "";
  return `${who} (${year}), ${t.location.split(",")[0]}`;
}
