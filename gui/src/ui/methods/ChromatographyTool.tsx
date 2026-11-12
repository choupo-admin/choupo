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
  ChromatographyTool -- the chromatography EduTool (registry id
  "chromatography"): separate two solutes on a column -- when does each come
  out, how wide are the peaks, are they resolved, and what changes when you
  load more?

  WHO COMPUTES WHAT, panel by panel (the origin marks say the same):

    * the linear pulse is the ENGINE's: the page writes a choupoBatch case
      (one fixedBedAdsorber, a two-solute injection switched back to carrier
      by a recipe, a synthetic linear sorbent whose Henry constants are the
      knobs) and runs it in the browser.  The outlet histories and the KPIs
      are read off the run; an answer whose own t_st, Pe and end time do not
      match the knobs is not drawn.
    * the moments, the plate model, the van Deemter curve, the resolution and
      the cuts are the PAGE's closed forms, and the overloaded column is the
      PAGE's own integration of the same bed equations, spread over frames so
      the page never holds the browser: gui/src/case/chromatography.ts.

  Record: docs/design/chromatography-peaks-and-resolution.md.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert, Badge, Box, Button, Group, Loader, SegmentedControl, Slider, Stack, Switch,
  Table, Text, Title,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";

import { useCaseFilesRun } from "../../case/methodRun.js";
import { filesToCaseFiles } from "../../cases/tutorials.js";
import {
  CHROM_CASE_NAME, CHROM_CELLS, CHROM_SOLUTES, CHROM_Y_INJ, R_GAS, chromCaseFiles,
  cutsForPurity, daxFrom, engineEndTime, engineMatches, gaussian, gaussianCut, henryKc,
  linearPulseMoments, plateHeight, platePeak, readEnginePeaks, resolution,
  resolutionFundamental, retention, sampledCut, sampledMoments, startColumn, vanDeemter,
  type Column, type DispersionInputs, type EngineSpec, type SolveOptions, type SolveResult,
} from "../../case/chromatography.js";
import { KnobNumber, PanelNote } from "./knobPanel.js";
import { OriginMark, type OriginKind } from "./origin.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { CHROM_LIMITS, CHROM_STEPS } from "./chromatographyLesson.js";

// ---- the fixed parts of the example -------------------------------------------

/** The example column the knobs start from: the breakthrough page's bed
 *  geometry (0.5 m, eps 0.4, 0.01 m2, 298 K, 1 bar) on a synthetic linear
 *  sorbent of bulk density 500 kg/m3.  Every number is the page's own
 *  choice, labelled as such. */
const BASE: Omit<Column, "L" | "u"> = { eps: 0.4, rhoB: 500, area: 0.01, T: 298.15, P_bar: 1 };
/** The two fixed dispersion factors (step 3). */
const GAMMA = 0.7, LAMBDA = 0.5;
/** The page's own integration: cells, and the finer grid of the check. */
const PAGE_CELLS = 100;
/** Loads swept in step 6, as b2 * c_inj. */
const SWEEP_LOADS = [0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.6] as const;

const C1 = "#2a78d6", C2 = "#eb6834", INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)", TEXT = "var(--mantine-color-text)";

const fmt = (v: number, d = 2): string => {
  if (!Number.isFinite(v)) return "—";
  const s = v.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
const sig = (v: number, n = 3): string => (Number.isFinite(v) ? Number(v.toPrecision(n)).toString() : "—");
const pct = (v: number, d = 2): string => `${fmt(100 * v, d)} %`;

// ---- a small line plot, drawn at its container's own width -------------------

interface Series { x: readonly number[]; y: readonly number[]; color: string; dash?: string; width?: number; label: string }
interface VLine { x: number; color: string; label?: string; dash?: string }
interface Pt { x: number; y: number; color: string; label: string; square?: boolean }

function LinePlot({ series, xLabel, yLabel, vlines = [], points = [], xMax, yMax, height = 260, aria }: {
  series: readonly Series[]; xLabel: string; yLabel: string; vlines?: readonly VLine[];
  points?: readonly Pt[]; xMax?: number; yMax?: number; height?: number; aria: string;
}): JSX.Element {
  const { ref, width } = useElementSize();
  const W = Math.max(280, Math.round(width || 600)), H = height;
  const ml = 52, mr = 12, mt = 10, mb = 38;
  let xm = xMax ?? 0, ym = yMax ?? 0;
  if (xMax === undefined) for (const s of series) for (const x of s.x) xm = Math.max(xm, x);
  if (yMax === undefined) {
    for (const s of series) for (const y of s.y) if (Number.isFinite(y)) ym = Math.max(ym, y);
    for (const p of points) ym = Math.max(ym, p.y);
    ym *= 1.08;
  }
  if (!(xm > 0)) xm = 1;
  if (!(ym > 0)) ym = 1;
  const X = (x: number): number => ml + (W - ml - mr) * x / xm;
  const Y = (y: number): number => mt + (H - mt - mb) * (1 - y / ym);
  const ticks = (m: number): number[] => {
    const raw = m / 5, p = 10 ** Math.floor(Math.log10(raw));
    const st = [1, 2, 2.5, 5, 10].map((f) => f * p).find((f) => f >= raw) ?? raw;
    const out: number[] = [];
    for (let v = 0; v <= m * 1.0001; v += st) out.push(v);
    return out;
  };
  const path = (s: Series): string => {
    let d = "", pen = false;
    for (let i = 0; i < s.x.length; i++) {
      const x = s.x[i]!, y = s.y[i]!;
      if (!Number.isFinite(y) || x > xm || y > ym) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  return (
    <Box ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img" aria-label={aria} style={{ display: "block" }}>
        {ticks(xm).map((t) => (
          <g key={`x${t}`}>
            <line x1={X(t)} x2={X(t)} y1={mt} y2={H - mb} stroke={GRID} strokeWidth={0.5} />
            <text x={X(t)} y={H - mb + 14} fontSize={10} textAnchor="middle" fill={INK}>{sig(t, 4)}</text>
          </g>
        ))}
        {ticks(ym).map((t) => (
          <g key={`y${t}`}>
            <line x1={ml} x2={W - mr} y1={Y(t)} y2={Y(t)} stroke={GRID} strokeWidth={0.5} />
            <text x={ml - 4} y={Y(t) + 3} fontSize={10} textAnchor="end" fill={INK}>{sig(t, 3)}</text>
          </g>
        ))}
        <line x1={ml} x2={W - mr} y1={H - mb} y2={H - mb} stroke={TEXT} strokeWidth={0.8} />
        <line x1={ml} x2={ml} y1={mt} y2={H - mb} stroke={TEXT} strokeWidth={0.8} />
        <text x={(ml + W - mr) / 2} y={H - 6} fontSize={11} textAnchor="middle" fill={TEXT}>{xLabel}</text>
        <text x={12} y={(mt + H - mb) / 2} fontSize={11} textAnchor="middle" fill={TEXT}
          transform={`rotate(-90 12 ${(mt + H - mb) / 2})`}>{yLabel}</text>
        {vlines.filter((v) => v.x >= 0 && v.x <= xm).map((v, i) => (
          <g key={`v${i}`}>
            <line x1={X(v.x)} x2={X(v.x)} y1={mt} y2={H - mb} stroke={v.color} strokeWidth={1}
              strokeDasharray={v.dash ?? "3 3"} />
            {v.label && <text x={X(v.x) + 3} y={mt + 10 + 11 * (i % 3)} fontSize={10} fill={v.color}>{v.label}</text>}
          </g>
        ))}
        {series.map((s, i) => (
          <path key={i} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.width ?? 1.8}
            strokeDasharray={s.dash} />
        ))}
        {points.map((p, i) => (p.square
          ? <rect key={`p${i}`} x={X(p.x) - 4} y={Y(p.y) - 4} width={8} height={8} fill={p.color} stroke={TEXT} strokeWidth={0.8} />
          : <circle key={`p${i}`} cx={X(p.x)} cy={Y(p.y)} r={4.5} fill={p.color} stroke={TEXT} strokeWidth={0.8} />))}
      </svg>
      <Group gap={12} mt={2} wrap="wrap">
        {series.map((s, i) => (
          <Group key={i} gap={4} wrap="nowrap">
            <svg width={22} height={8}><line x1={0} x2={22} y1={4} y2={4} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} /></svg>
            <Text size="xs" c="dimmed">{s.label}</Text>
          </Group>
        ))}
        {points.map((p, i) => (
          <Group key={`l${i}`} gap={4} wrap="nowrap">
            <svg width={10} height={10}>{p.square
              ? <rect x={1} y={1} width={8} height={8} fill={p.color} />
              : <circle cx={5} cy={5} r={4} fill={p.color} />}</svg>
            <Text size="xs" c="dimmed">{p.label}</Text>
          </Group>
        ))}
      </Group>
    </Box>
  );
}

// ---- page chrome --------------------------------------------------------------------

function Panel({ title, origin, originNote, children }: {
  title: string; origin: OriginKind | readonly OriginKind[]; originNote?: string; children: ReactNode;
}): JSX.Element {
  return (
    <Box px="sm" py="sm" style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
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

function Knobs({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Box style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
      {children}
    </Box>
  );
}

// ---- the page's own integration, spread over frames ---------------------------

interface AsyncSolves { results: (SolveResult | null)[]; busy: boolean; ms: number; done: number; total: number }

/** Run a list of column integrations one after the other, a slice of about
 *  12 ms at a time, so the page keeps answering while they run.  A new key
 *  abandons what was running. */
function useColumnSolves(key: string, make: () => SolveOptions[]): AsyncSolves {
  const [state, setState] = useState<AsyncSolves>({ results: [], busy: false, ms: 0, done: 0, total: 0 });
  const makeRef = useRef(make);
  makeRef.current = make;
  useEffect(() => {
    let cancelled = false;
    const opts = makeRef.current();
    const results: (SolveResult | null)[] = opts.map(() => null);
    let i = 0, run = opts.length ? startColumn(opts[0]!) : null;
    let busyMs = 0;
    setState({ results: results.slice(), busy: opts.length > 0, ms: 0, done: 0, total: opts.length });
    let timer: ReturnType<typeof setTimeout>;
    //  The page re-renders only when a run finishes (a re-render of this page
    //  costs more than a slice), so the slices stay short and the main thread
    //  is handed back between them.
    const slice = (): void => {
      if (cancelled || !run) return;
      const t0 = performance.now();
      let finished = false;
      while (performance.now() - t0 < 16) {
        if (run.advance(200)) {
          results[i] = run.result();
          i += 1;
          finished = true;
          run = i < opts.length ? startColumn(opts[i]!) : null;
          break;
        }
      }
      busyMs += performance.now() - t0;
      if (finished)
        setState({ results: results.slice(), busy: run !== null, ms: busyMs, done: i, total: opts.length });
      if (run) timer = setTimeout(slice, 0);
    };
    timer = setTimeout(slice, 30);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key]);
  return state;
}

// ---- the page ------------------------------------------------------------------------

const step = lessonStepper(CHROM_STEPS);

export function ChromatographyTool(): JSX.Element {
  // the column knobs (assumptions the student sets)
  const [L, setL] = useState(0.5);
  const [u, setU] = useState(0.05);
  const [H1, setH1] = useState(0.4);
  const [alpha, setAlpha] = useState(1.5);
  const [kLDF, setK] = useState(5);
  const [dpMm, setDp] = useState(2);
  const [Dm, setDm] = useState(6e-5);
  const [tInj, setTInj] = useState(2);
  // step 2, 4, 5, 6 controls
  const [Nplot, setNplot] = useState("20");
  const [tCutUser, setTCut] = useState<number | null>(null);
  const [load, setLoad] = useState(0.4);
  const [qs, setQs] = useState(2);
  const [tInj5, setTInj5] = useState(10);
  const [competitive, setCompetitive] = useState(true);
  const [target, setTarget] = useState("0.99");
  const [fineCheck, setFineCheck] = useState(false);

  const col: Column = useMemo(() => ({ ...BASE, L, u }), [L, u]);
  const H: [number, number] = [H1, H1 * alpha];
  const Kc = H.map((h) => henryKc(h, col.T)) as [number, number];
  const disp: DispersionInputs = { dp: dpMm / 1000, Dm, gamma: GAMMA, lambda: LAMBDA };
  const r1 = retention(col, Kc[0]), r2 = retention(col, Kc[1]);
  const v = r1.v;
  const Dax = daxFrom(col.eps, disp, v);
  const dzEngine = col.L / CHROM_CELLS;
  const mom = [0, 1].map((i) => linearPulseMoments(col, Kc[i]!, kLDF, Dax, tInj));
  const momGrid = [0, 1].map((i) => linearPulseMoments(col, Kc[i]!, kLDF, Dax, tInj, dzEngine));
  const cIn = CHROM_Y_INJ * col.P_bar * 1e5 / (R_GAS * col.T);

  // ---- the engine's linear pulse
  const spec: EngineSpec = {
    col, H, kLDF, Dax, tInj, tEnd: engineEndTime(col, H, kLDF, Dax, tInj),
  };
  const specKey = JSON.stringify(spec);
  const engine = useCaseFilesRun(() => filesToCaseFiles(CHROM_CASE_NAME, chromCaseFiles(spec)), specKey, "choupoBatch");
  const peaks = useMemo(() => readEnginePeaks(engine.result?.trajectory, engine.result?.kpis),
    [engine.result]);
  const current = peaks !== null && engineMatches(peaks, spec);
  const engMom = current ? peaks.c.map((c) => sampledMoments(peaks.t, c)) : null;

  // ---- the page's own linear integration at the same settings (a check)
  const linKey = `lin|${specKey}`;
  const lin = useColumnSolves(linKey, () => [{
    col, Kc, k: [kLDF, kLDF], Dax, isotherm: { kind: "linear" }, cInj: [cIn, cIn], tInj,
    tEnd: spec.tEnd, N: PAGE_CELLS,
  }]);
  const linRes = lin.results[0] ?? null;
  const linMom = linRes ? linRes.c.map((c) => sampledMoments(linRes.t, c)) : null;

  // ---- step 2: the plate model at the earlier peak's retention time
  const Ncol = (mom[0]!.mu1 - tInj / 2) ** 2 / (mom[0]!.variance - mom[0]!.varInjection);
  const Nshow = Nplot === "col" ? Ncol : Number(Nplot);
  const plate = useMemo(() => {
    const tR = r1.tR, sigma = tR / Math.sqrt(Nshow);
    const tMax = tR + 6 * sigma + (Nshow < 30 ? 2 * tR / Math.sqrt(Nshow) : 0);
    const xs: number[] = [], yp: number[] = [], yg: number[] = [];
    let maxDiff = 0, peak = 0, aP = 0, aG = 0;
    const n = 600;
    for (let i = 0; i <= n; i++) {
      const t = tMax * i / n;
      const p = platePeak(t, tR, Nshow), g = gaussian(t, tR, sigma);
      xs.push(t); yp.push(p); yg.push(g);
      maxDiff = Math.max(maxDiff, Math.abs(p - g)); peak = Math.max(peak, g);
      if (i > 0) { aP += (p + yp[i - 1]!) / 2 * tMax / n; aG += (g + yg[i - 1]!) / 2 * tMax / n; }
    }
    return { xs, yp, yg, tR, sigma, rel: maxDiff / peak, aP, aG, peak };
  }, [r1.tR, Nshow]);

  // ---- step 3: van Deemter for the later (harder) peak
  const vd1 = vanDeemter(disp, kLDF, r1.kprime), vd2 = vanDeemter(disp, kLDF, r2.kprime);
  const vdCurve = useMemo(() => {
    const vMax = Math.max(4 * vd2.vOpt, 1.6 * v);
    const xs: number[] = [], y2: number[] = [], yA: number[] = [], yB: number[] = [], yC: number[] = [];
    for (let i = 1; i <= 200; i++) {
      const vv = vMax * i / 200;
      xs.push(vv); y2.push(1000 * plateHeight(vd2, vv));
      yA.push(1000 * vd2.A); yB.push(1000 * vd2.B / vv); yC.push(1000 * vd2.C * vv);
    }
    return { xs, y2, yA, yB, yC, vMax };
  }, [vd2.A, vd2.B, vd2.C, vd2.vOpt, v]);
  const Hengine = engMom ? [0, 1].map((i) => {
    const m = engMom[i]!;
    const tRi = m.mu1 - tInj / 2;
    return col.L * (m.variance - tInj * tInj / 12) / (tRi * tRi);
  }) : null;

  // ---- step 4: two Gaussians from the closed forms, physical widths
  const s1 = Math.sqrt(mom[0]!.variance), s2 = Math.sqrt(mom[1]!.variance);
  const t1 = mom[0]!.mu1, t2 = mom[1]!.mu1;
  const Rs = resolution(t1, s1, t2, s2);
  const N2 = (t2 - tInj / 2) ** 2 / (mom[1]!.variance - mom[1]!.varInjection);
  const RsFund = resolutionFundamental(N2, r2.kprime / r1.kprime, r2.kprime);
  const RsEngine = engMom
    ? resolution(engMom[0]!.mu1, Math.sqrt(engMom[0]!.variance), engMom[1]!.mu1, Math.sqrt(engMom[1]!.variance))
    : null;
  const RsGrid = resolution(momGrid[0]!.mu1, Math.sqrt(momGrid[0]!.variance), momGrid[1]!.mu1, Math.sqrt(momGrid[1]!.variance));
  const tCutDefault = (t1 * s2 + t2 * s1) / (s1 + s2);
  const tCut = tCutUser !== null && tCutUser > t1 - 3 * s1 && tCutUser < t2 + 3 * s2 ? tCutUser : tCutDefault;
  const area = cIn * tInj;   // mol s / m3: the peak area of each solute
  const cut = gaussianCut(tCut, { tR: t1, sigma: s1, area }, { tR: t2, sigma: s2, area });
  const chrom = useMemo(() => {
    const tMax = t2 + 5 * s2;
    const xs: number[] = [], a: number[] = [], b: number[] = [];
    for (let i = 0; i <= 500; i++) {
      const t = tMax * i / 500;
      xs.push(t); a.push(area * gaussian(t, t1, s1)); b.push(area * gaussian(t, t2, s2));
    }
    return { xs, a, b, tMax };
  }, [t1, t2, s1, s2, area]);

  // ---- step 5: the overloaded column (the page's integration)
  const b2 = Kc[1] / qs;
  const cInj5 = load / b2;
  const tEnd5 = Math.ceil(mom[1]!.mu1 + tInj5 / 2 + 6 * Math.sqrt(mom[1]!.variance + tInj5 * tInj5 / 12));
  const base5: Omit<SolveOptions, "isotherm" | "cInj" | "N"> = {
    col, Kc, k: [kLDF, kLDF], Dax, tInj: tInj5, tEnd: tEnd5,
  };
  const overKey = JSON.stringify({ base5, load, qs, competitive, fineCheck });
  const over = useColumnSolves(overKey, () => {
    const list: SolveOptions[] = [
      { ...base5, isotherm: { kind: "langmuir", qs, competitive }, cInj: [cInj5, cInj5], N: PAGE_CELLS },
      { ...base5, isotherm: { kind: "linear" }, cInj: [cInj5, cInj5], N: PAGE_CELLS },
    ];
    if (fineCheck)
      list.push({ ...base5, isotherm: { kind: "langmuir", qs, competitive }, cInj: [cInj5, cInj5], N: 2 * PAGE_CELLS });
    return list;
  });
  const ov = over.results[0] ?? null, ovLin = over.results[1] ?? null, ovFine = over.results[2] ?? null;
  const ovStats = ov ? (() => {
    const m = ov.c.map((c) => sampledMoments(ov.t, c));
    const peakAt = ov.c.map((c) => { let k = 0; for (let i = 1; i < c.length; i++) if (c[i]! > c[k]!) k = i; return { t: ov.t[k]!, c: c[k]! }; });
    const cutOv = cutsForPurity(ov.t, ov.c[0]!, ov.c[1]!, Number(target));
    const midCut = sampledCut(ov.t, ov.c[0]!, ov.c[1]!, tCut);
    return { m, peakAt, cutOv, midCut };
  })() : null;
  const linStats5 = ovLin ? ovLin.c.map((c) => sampledMoments(ovLin.t, c)) : null;
  const fineStats = ov && ovFine ? (() => {
    const pk = (r: SolveResult, i: number): number => Math.max(...r.c[i]!);
    const m = ovFine.c.map((c) => sampledMoments(ovFine.t, c));
    const cc = cutsForPurity(ovFine.t, ovFine.c[0]!, ovFine.c[1]!, Number(target));
    return {
      dPeak: [0, 1].map((i) => pk(ovFine, i) / pk(ov, i) - 1),
      dMu: [0, 1].map((i) => m[i]!.mu1 - ovStats!.m[i]!.mu1),
      dRec: [cc.recovery1 - ovStats!.cutOv.recovery1, cc.recovery2 - ovStats!.cutOv.recovery2],
    };
  })() : null;

  // ---- step 6: the sweep
  const sweepKey = JSON.stringify({ base5, qs, competitive });
  const sweep = useColumnSolves(sweepKey, () => SWEEP_LOADS.map((ld) => ({
    ...base5, isotherm: { kind: "langmuir", qs, competitive } as const,
    cInj: [ld / b2, ld / b2], N: PAGE_CELLS, nOut: 1200,
  })));
  const sweepRows = SWEEP_LOADS.map((ld, i) => {
    const r = sweep.results[i];
    if (!r) return { ld, ready: false as const };
    const cc = cutsForPurity(r.t, r.c[0]!, r.c[1]!, Number(target));
    const fed = r.fed;
    return {
      ld, ready: true as const, fed0: fed[0]!, cc,
      got1: cc.recovery1 * fed[0]!, got2: cc.recovery2 * fed[1]!,
      closure: Math.max(Math.abs(r.closure[0]!), Math.abs(r.closure[1]!)),
    };
  });

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Chromatography: peaks, plates and resolution</Title>
          <Text size="sm" c="dimmed" mt={4}>
            You want to separate two solutes on a column: when does each come out, how wide are
            the peaks, are they resolved, and what changes when you load more? A packed bed fed a
            short pulse answers all four. The engine runs the linear pulse in your browser; the
            page carries the closed forms beside it, and integrates the overloaded column itself.
          </Text>
        </Box>

        {step(1)}
        <Panel title="the column and the two solutes" origin="assumption"
          originNote="every number here is the page's example, yours to change">
          <Knobs>
            <KnobNumber label="bed length L, m" value={L} min={0.1} max={3} step={0.1} decimals={2} onChange={setL} />
            <KnobNumber label="superficial velocity u, m/s" value={u} min={0.005} max={0.3} step={0.005} decimals={3} onChange={setU} />
            <KnobNumber label="Henry constant of the first solute, mol/(kg bar)" value={H1} min={0.05} max={2} step={0.05} decimals={3} onChange={setH1} />
            <KnobNumber label="selectivity α (second over first)" value={alpha} min={1.02} max={3} step={0.05} decimals={2} onChange={setAlpha} />
            <KnobNumber label="uptake rate k, 1/s" value={kLDF} min={0.5} max={20} step={0.5} decimals={2} onChange={setK} />
            <KnobNumber label="particle diameter d_p, mm" value={dpMm} min={0.1} max={6} step={0.1} decimals={2} onChange={setDp} />
            <KnobNumber label="molecular diffusivity D_m, m²/s" value={Dm} min={1e-6} max={2e-4} step={1e-5} decimals={7} onChange={setDm} />
            <KnobNumber label="injection length t_inj, s" value={tInj} min={0.5} max={20} step={0.5} decimals={2} onChange={setTInj} />
          </Knobs>
          <PanelNote>
            Fixed: ε = {BASE.eps}, ρ_b = {BASE.rhoB} kg/m³, cross-section {BASE.area} m², {BASE.T} K,
            {" "}{BASE.P_bar} bar; the injection carries {CHROM_Y_INJ * 100} % of each solute (methane
            first, carbon dioxide second, by name only: their Henry constants are the knobs, on a
            synthetic linear sorbent) in helium, {fmt(cIn, 4)} mol/m³ each.
          </PanelNote>
          <Wide>
            <Table fz="xs" striped withTableBorder style={{ minWidth: 520 }}>
              <Table.Thead><Table.Tr>
                <Table.Th>solute</Table.Th><Table.Th>K_c, m³/kg</Table.Th><Table.Th>k'</Table.Th>
                <Table.Th>t_0, s</Table.Th><Table.Th>t_R = t_0(1+k'), s</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {[r1, r2].map((r, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{i === 0 ? "first" : "second"} ({CHROM_SOLUTES[i]})</Table.Td>
                    <Table.Td>{sig(Kc[i]!, 4)}</Table.Td><Table.Td>{fmt(r.kprime, 3)}</Table.Td>
                    <Table.Td>{fmt(r.t0, 3)}</Table.Td><Table.Td>{fmt(r.tR, 3)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Wide>
          <PanelNote>
            Page arithmetic: v = u/ε = {fmt(v, 4)} m/s; D_ax = ε(γ D_m + λ d_p v) = {sig(Dax, 4)} m²/s
            (step 3), Péclet number u L/D_ax = {fmt(col.u * col.L / Dax, 1)}.
          </PanelNote>
        </Panel>

        <Panel title="the engine's pulse" origin={["engine", "page"]}
          originNote="choupoBatch, fixedBedAdsorber, a case this page writes, run in your browser; the moments and the theory columns are the page's">
          <EngineStatus busy={engine.busy} err={engine.err} stale={peaks !== null && !current} />
          {current && peaks && (
            <LinePlot aria="engine outlet concentrations"
              series={[
                { x: peaks.t, y: peaks.c[0], color: C1, label: `${CHROM_SOLUTES[0]} at the outlet (engine)` },
                { x: peaks.t, y: peaks.c[1], color: C2, label: `${CHROM_SOLUTES[1]} at the outlet (engine)` },
              ]}
              vlines={[
                { x: momGrid[0]!.mu1, color: C1, label: "t_R + t_inj/2 (page)" },
                { x: momGrid[1]!.mu1, color: C2 },
              ]}
              xLabel="time, s" yLabel="c_out, mol/m³" />
          )}
          <Wide>
            <Table fz="xs" striped withTableBorder style={{ minWidth: 700 }}>
              <Table.Thead><Table.Tr>
                <Table.Th>solute</Table.Th><Table.Th>first moment, s: theory</Table.Th>
                <Table.Th>engine</Table.Th><Table.Th>page integration</Table.Th>
                <Table.Th>σ, s: theory (physical)</Table.Th><Table.Th>theory + engine grid</Table.Th>
                <Table.Th>engine</Table.Th><Table.Th>page integration</Table.Th>
                <Table.Th>engine mass closure</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {[0, 1].map((i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{CHROM_SOLUTES[i]}</Table.Td>
                    <Table.Td>{fmt(mom[i]!.mu1, 3)}</Table.Td>
                    <Table.Td>{engMom ? fmt(engMom[i]!.mu1, 3) : "—"}</Table.Td>
                    <Table.Td>{linMom ? fmt(linMom[i]!.mu1, 3) : "…"}</Table.Td>
                    <Table.Td>{fmt(Math.sqrt(mom[i]!.variance), 3)}</Table.Td>
                    <Table.Td>{fmt(Math.sqrt(momGrid[i]!.variance), 3)}</Table.Td>
                    <Table.Td>{engMom ? fmt(Math.sqrt(engMom[i]!.variance), 3) : "—"}</Table.Td>
                    <Table.Td>{linMom ? fmt(Math.sqrt(linMom[i]!.variance), 3) : "…"}</Table.Td>
                    <Table.Td>{current && peaks!.massClosure[i] !== null ? sig(peaks!.massClosure[i]!, 2) : "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Wide>
          {engMom && (
            <Text size="sm">
              The engine's peaks leave at the first moments the mass balance predicts (differences
              {" "}{sig(Math.abs(engMom[0]!.mu1 - mom[0]!.mu1), 2)} s and{" "}
              {sig(Math.abs(engMom[1]!.mu1 - mom[1]!.mu1), 2)} s), and their widths agree with
              theory once the engine's own grid is counted: variance off by{" "}
              {pct(engMom[0]!.variance / momGrid[0]!.variance - 1)} and{" "}
              {pct(engMom[1]!.variance / momGrid[1]!.variance - 1)}. Without the grid's share the
              theory would be {pct(1 - mom[1]!.variance / momGrid[1]!.variance, 0)} narrower in
              variance for the second solute: that is what {CHROM_CELLS} first-order cells add.
            </Text>
          )}
          <PanelNote>
            Theory (page): first moment L(1+k')/v + t_inj/2; variance from dispersion with closed
            (Danckwerts) ends, from the uptake rate, and t_inj²/12 from the injection (design
            record, section 2). The engine grid's share is the dispersion v Δz/2 a first-order
            upwind grid adds, Δz = L/{CHROM_CELLS}. Moments of the engine's peaks are the page's
            trapezoidal integrals over its {sig(0.5, 1)} s samples. The page integration is its own
            second-order solver on {PAGE_CELLS} cells, the one step 5 uses
            {linRes ? `; its mass closure is ${sig(Math.max(...linRes.closure.map(Math.abs)), 2)}` : ""}.
          </PanelNote>
        </Panel>

        {step(2)}
        <Panel title="the plate model beside the Gaussian" origin="page"
          originNote="closed forms of step 2, at the first solute's retention time">
          <Group gap="sm" wrap="wrap" align="flex-end">
            <Box>
              <Text size="sm" fw={500} mb={4}>plates N</Text>
              <SegmentedControl size="xs" value={Nplot} onChange={setNplot}
                data={[{ value: "3", label: "3" }, { value: "10", label: "10" }, { value: "20", label: "20" },
                  { value: "100", label: "100" }, { value: "col", label: `this column (${fmt(Ncol, 0)})` }]} />
            </Box>
          </Group>
          <LinePlot aria="plate model and Gaussian"
            series={[
              { x: plate.xs, y: plate.yp, color: C1, label: `plate model, N = ${fmt(Nshow, 0)}` },
              { x: plate.xs, y: plate.yg, color: INK, dash: "5 4", label: "Gaussian, same mean and variance" },
            ]}
            vlines={[{ x: plate.tR, color: INK, label: "t_R" }]}
            xLabel="time, s" yLabel="c/m, 1/s" />
          <Text size="sm">
            At N = {fmt(Nshow, 0)}: σ_t = t_R/√N = {fmt(plate.sigma, 2)} s, H = L/N = {sig(1000 * col.L / Nshow, 3)} mm,
            the Gaussian's height {sig(plate.peak, 3)} 1/s per unit area. The largest gap between the
            two curves is <b>{pct(plate.rel, 1)}</b> of that height. Areas on t ≥ 0 (numerical
            integrals; what was injected is 1): plate model {fmt(plate.aP, 4)}, Gaussian{" "}
            {fmt(plate.aG, 4)}{plate.aG < 0.999 ? " — the Gaussian puts part of the peak before the injection, one more sign it is the wrong shape here" : ""}.
            {plate.rel < 0.02 ? " At this N the Gaussian is a good description." : " At this N the peak is visibly skewed: early, with a tail."}
          </Text>
        </Panel>

        {step(3)}
        <Panel title="the van Deemter curve of this column" origin={["page", "engine"]}
          originNote="the curve is the page's closed form for the second solute; the square is the engine's second peak (from the pulse above), its grid share removed">
          <LinePlot aria="van Deemter curve"
            series={[
              { x: vdCurve.xs, y: vdCurve.y2, color: C2, width: 2.2, label: "H = A + B/v + C v (second solute)" },
              { x: vdCurve.xs, y: vdCurve.yA, color: INK, dash: "2 3", label: "A" },
              { x: vdCurve.xs, y: vdCurve.yB, color: INK, dash: "6 3", label: "B/v" },
              { x: vdCurve.xs, y: vdCurve.yC, color: INK, dash: "1 2", label: "C v" },
            ]}
            vlines={[{ x: vd2.vOpt, color: C2, label: "v_opt" }, { x: v, color: TEXT, label: "this run" }]}
            points={Hengine ? [
              { x: v, y: 1000 * (Hengine[1]! - dzEngine), color: C2, square: true, label: "engine peak, grid share removed" },
            ] : []}
            yMax={Math.min(...vdCurve.y2) * 4}
            xLabel="interstitial velocity v, m/s" yLabel="plate height H, mm" />
          <Wide>
            <Table fz="xs" striped withTableBorder style={{ minWidth: 640 }}>
              <Table.Thead><Table.Tr>
                <Table.Th>solute</Table.Th><Table.Th>A, mm</Table.Th><Table.Th>B, m²/s</Table.Th>
                <Table.Th>C, s</Table.Th><Table.Th>v_opt, m/s</Table.Th><Table.Th>H_min, mm</Table.Th>
                <Table.Th>H at this v, mm</Table.Th><Table.Th>N = L/H</Table.Th><Table.Th>engine H − Δz, mm</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {[vd1, vd2].map((vd, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{CHROM_SOLUTES[i]}</Table.Td>
                    <Table.Td>{sig(1000 * vd.A, 3)}</Table.Td><Table.Td>{sig(vd.B, 3)}</Table.Td>
                    <Table.Td>{sig(vd.C, 3)}</Table.Td><Table.Td>{sig(vd.vOpt, 3)}</Table.Td>
                    <Table.Td>{sig(1000 * vd.Hmin, 3)}</Table.Td>
                    <Table.Td>{sig(1000 * plateHeight(vd, v), 3)}</Table.Td>
                    <Table.Td>{fmt(col.L / plateHeight(vd, v), 0)}</Table.Td>
                    <Table.Td>{Hengine ? sig(1000 * (Hengine[i]! - dzEngine), 3) : "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Wide>
          <PanelNote>
            A = 2λd_p, B = 2γD_m, C = 2k'/(k(1+k')²), with λ = {LAMBDA} and γ = {GAMMA} (the page's
            assumptions). The engine's H is L σ²/t_R² of its peak after the injection's t_inj²/12 is
            taken out; its grid adds one cell, Δz = {sig(1000 * dzEngine, 3)} mm, which is subtracted
            here. The plate height at this v differs from the long-column formula by the
            closed-end correction (1/Pe), which is why the two are not identical.
            {v > 2 * vd2.vOpt ? " This run is well above the optimum velocity: the C term dominates." :
              v < 0.6 * vd2.vOpt ? " This run is below the optimum velocity: axial diffusion dominates." : ""}
          </PanelNote>
        </Panel>

        {step(4)}
        <Panel title="two peaks, their resolution, and a cut" origin={["page", "engine"]}
          originNote="the solid curves are Gaussians from the page's moments (physical widths); the dotted ones are the engine's peaks for the same knobs, widened by its own grid">
          <Knobs>
            <KnobNumber label="bed length L, m" value={L} min={0.1} max={3} step={0.1} decimals={2} onChange={setL} />
            <KnobNumber label="superficial velocity u, m/s" value={u} min={0.005} max={0.3} step={0.005} decimals={3} onChange={setU} />
            <KnobNumber label="selectivity α" value={alpha} min={1.02} max={3} step={0.05} decimals={2} onChange={setAlpha} />
          </Knobs>
          <LinePlot aria="two-peak chromatogram"
            series={[
              { x: chrom.xs, y: chrom.a, color: C1, label: `${CHROM_SOLUTES[0]}, Gaussian (page)` },
              { x: chrom.xs, y: chrom.b, color: C2, label: `${CHROM_SOLUTES[1]}, Gaussian (page)` },
              ...(current && peaks ? [
                { x: peaks.t, y: peaks.c[0], color: C1, dash: "2 3", width: 1.4, label: `${CHROM_SOLUTES[0]}, engine (grid included)` },
                { x: peaks.t, y: peaks.c[1], color: C2, dash: "2 3", width: 1.4, label: `${CHROM_SOLUTES[1]}, engine (grid included)` },
              ] : []),
            ]}
            vlines={[{ x: tCut, color: TEXT, dash: "6 3", label: "cut" }]}
            xMax={chrom.tMax} xLabel="time, s" yLabel="c_out, mol/m³" />
          <Box>
            <Text size="sm" fw={500}>cut time: {fmt(tCut, 2)} s</Text>
            <Slider min={Math.max(0, t1 - 2 * s1)} max={t2 + 2 * s2} step={0.05} value={tCut}
              onChange={setTCut} label={(x) => `${fmt(x, 1)} s`} aria-label="cut time" />
          </Box>
          <Group gap="sm" wrap="wrap">
            <Text size="sm">R_s = <b>{fmt(Rs, 3)}</b></Text>
            <Badge size="sm" variant="light" color={Rs >= 1.5 ? "green" : Rs >= 1 ? "yellow" : "red"}>
              {Rs >= 1.5 ? "baseline resolved (R_s ≥ 1.5)" : Rs >= 1 ? "bases touch, not baseline" : "overlapping"}
            </Badge>
          </Group>
          <Wide>
            <Table fz="xs" striped withTableBorder>
              <Table.Tbody>
                <Table.Tr><Table.Td>exact, (t_R2 − t_R1)/(2(σ1+σ2))</Table.Td><Table.Td>{fmt(Rs, 3)}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>fundamental, (√N/4)((α−1)/α)(k'2/(1+k'2)), N = {fmt(N2, 0)} of the second peak</Table.Td><Table.Td>{fmt(RsFund, 3)}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>with the engine's {CHROM_CELLS}-cell grid counted (page, one plate per cell added)</Table.Td><Table.Td>{fmt(RsGrid, 3)}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>from the engine's peaks (their moments)</Table.Td><Table.Td>{RsEngine !== null ? fmt(RsEngine, 3) : "—"}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>length for R_s = 1.5 at this velocity (R_s grows as √L)</Table.Td><Table.Td>{fmt(col.L * (1.5 / Rs) ** 2, 2)} m</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
          </Wide>
          <Wide>
            <Table fz="xs" striped withTableBorder>
              <Table.Thead><Table.Tr>
                <Table.Th>fraction</Table.Th><Table.Th>purity</Table.Th><Table.Th>recovery</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                <Table.Tr><Table.Td>before the cut ({CHROM_SOLUTES[0]})</Table.Td><Table.Td>{pct(cut.first.purity, 3)}</Table.Td><Table.Td>{pct(cut.first.recovery, 3)}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>after the cut ({CHROM_SOLUTES[1]})</Table.Td><Table.Td>{pct(cut.second.purity, 3)}</Table.Td><Table.Td>{pct(cut.second.recovery, 3)}</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
          </Wide>
          <PanelNote>
            Equal amounts of the two solutes are injected. Purity and recovery are the page's
            integrals of the two Gaussians either side of the cut (error functions); the cut starts
            where the two peaks are equally many standard deviations away. The fundamental form
            differs from the exact one because it uses one plate count for both peaks and the
            later peak's width for both. The engine's peaks are wider than the page's Gaussians by
            its grid, one plate per cell of L/{CHROM_CELLS} = {sig(1000 * dzEngine, 3)} mm: on a long bed
            that is a large share, and the engine's resolution is the page's with that share added.
          </PanelNote>
        </Panel>

        {step(5)}
        <Panel title="the overloaded column" origin={["page", "assumption"]}
          originNote="the page's own integration of the bed equations with a competitive Langmuir isotherm; the column, k and D_ax are the knobs above">
          <Knobs>
            <KnobNumber label="load b₂ c_inj (dimensionless)" value={load} min={0.005} max={3} step={0.05} decimals={3} onChange={setLoad} />
            <KnobNumber label="saturation capacity q_s, mol/kg" value={qs} min={0.1} max={10} step={0.1} decimals={2} onChange={setQs} />
            <KnobNumber label="injection length, s" value={tInj5} min={1} max={60} step={1} decimals={1} onChange={setTInj5} />
          </Knobs>
          <Switch checked={competitive} onChange={(e) => setCompetitive(e.currentTarget.checked)}
            label="the two solutes compete for the same sites (off: each sees its own Langmuir isotherm)" />
          {over.busy && (
            <Group gap={8}><Loader size="xs" /><Text size="sm" c="dimmed">integrating… {over.done}/{over.total}</Text></Group>
          )}
          {ov && ovLin && ovStats && (
            <>
              <LinePlot aria="overloaded chromatogram"
                series={[
                  { x: ov.t, y: ov.c[0]!.map((x) => x / cInj5), color: C1, label: `${CHROM_SOLUTES[0]}, Langmuir` },
                  { x: ov.t, y: ov.c[1]!.map((x) => x / cInj5), color: C2, label: `${CHROM_SOLUTES[1]}, Langmuir` },
                  { x: ovLin.t, y: ovLin.c[0]!.map((x) => x / cInj5), color: C1, dash: "4 3", width: 1.3, label: `${CHROM_SOLUTES[0]}, same injection on the straight isotherm` },
                  { x: ovLin.t, y: ovLin.c[1]!.map((x) => x / cInj5), color: C2, dash: "4 3", width: 1.3, label: `${CHROM_SOLUTES[1]}, same injection on the straight isotherm` },
                ]}
                xLabel="time, s" yLabel="c_out / c_inj" />
              <Wide>
                <Table fz="xs" striped withTableBorder style={{ minWidth: 620 }}>
                  <Table.Thead><Table.Tr>
                    <Table.Th>solute</Table.Th><Table.Th>peak at, s</Table.Th><Table.Th>peak c/c_inj</Table.Th>
                    <Table.Th>first moment, s</Table.Th><Table.Th>straight isotherm, s</Table.Th>
                    <Table.Th>mass closure</Table.Th>
                  </Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {[0, 1].map((i) => (
                      <Table.Tr key={i}>
                        <Table.Td>{CHROM_SOLUTES[i]}</Table.Td>
                        <Table.Td>{fmt(ovStats.peakAt[i]!.t, 2)}</Table.Td>
                        <Table.Td>{fmt(ovStats.peakAt[i]!.c / cInj5, 4)}</Table.Td>
                        <Table.Td>{fmt(ovStats.m[i]!.mu1, 2)}</Table.Td>
                        <Table.Td>{linStats5 ? fmt(linStats5[i]!.mu1, 2) : "—"}</Table.Td>
                        <Table.Td>{sig(ov.closure[i]!, 2)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Wide>
              <Text size="sm">
                c_inj = {sig(cInj5, 3)} mol/m³ of each solute for {fmt(tInj5, 1)} s
                ({sig(ov.fed[0]!, 3)} mol of each). Every peak comes out earlier than on the straight
                isotherm, by {fmt(linStats5![0]!.mu1 - ovStats.m[0]!.mu1, 2)} s and{" "}
                {fmt(linStats5![1]!.mu1 - ovStats.m[1]!.mu1, 2)} s in its first moment. With a cut at the
                step-4 time ({fmt(tCut, 1)} s): first fraction {pct(ovStats.midCut.first.purity, 2)} pure,
                second {pct(ovStats.midCut.second.purity, 2)} pure.
              </Text>
              <Group gap="sm" wrap="wrap">
                <Button size="xs" variant="light" onClick={() => setFineCheck((f) => !f)}>
                  {fineCheck ? "drop the grid check" : `check this run on ${2 * PAGE_CELLS} cells`}
                </Button>
                {fineCheck && !ovFine && <Text size="xs" c="dimmed">integrating the finer grid…</Text>}
                {fineStats && (
                  <Text size="xs">
                    On {2 * PAGE_CELLS} cells the peak heights change by {pct(fineStats.dPeak[0]!, 2)} and{" "}
                    {pct(fineStats.dPeak[1]!, 2)}, the first moments by {sig(fineStats.dMu[0]!, 2)} s and{" "}
                    {sig(fineStats.dMu[1]!, 2)} s, and the recoveries at the target purity by{" "}
                    {pct(fineStats.dRec[0]!, 2)} and {pct(fineStats.dRec[1]!, 2)}: an estimate of the error the{" "}
                    {PAGE_CELLS}-cell grid leaves (largest at the sharp fronts, where the limiter falls to
                    first order).
                  </Text>
                )}
              </Group>
              <PanelNote>
                {PAGE_CELLS} cells, second-order MUSCL faces (van Leer limiter), explicit Heun steps of
                {" "}{sig(ov.dt * 1000, 3)} ms ({ov.steps} steps); computed in this browser in{" "}
                {fmt(over.ms / 1000, 2)} s, a slice at a time. The mass closure is (fed − out − held)/fed
                for each solute, integrated with the same stages as the solution.
              </PanelNote>
            </>
          )}
        </Panel>

        {step(6)}
        <Panel title="how much, at what purity" origin="page"
          originNote="the page's integration at each load, and the cuts it allows at the target purity">
          <Box>
            <Text size="sm" fw={500} mb={4}>purity target for each product</Text>
            <SegmentedControl size="xs" value={target} onChange={setTarget}
              data={[{ value: "0.95", label: "95 %" }, { value: "0.99", label: "99 %" }, { value: "0.999", label: "99.9 %" }]} />
          </Box>
          {sweep.busy && (
            <Group gap={8}><Loader size="xs" /><Text size="sm" c="dimmed">sweeping the load… {sweep.done}/{sweep.total}</Text></Group>
          )}
          <Wide>
            <Table fz="xs" striped withTableBorder style={{ minWidth: 700 }}>
              <Table.Thead><Table.Tr>
                <Table.Th>load b₂c_inj</Table.Th><Table.Th>injected, mol each</Table.Th>
                <Table.Th>first cut, s</Table.Th><Table.Th>recovery 1</Table.Th><Table.Th>recovered 1, mol</Table.Th>
                <Table.Th>second cut, s</Table.Th><Table.Th>recovery 2</Table.Th><Table.Th>recovered 2, mol</Table.Th>
                <Table.Th>mass closure</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {sweepRows.map((row) => (
                  <Table.Tr key={row.ld}>
                    <Table.Td>{row.ld}</Table.Td>
                    {row.ready ? (
                      <>
                        <Table.Td>{sig(row.fed0, 3)}</Table.Td>
                        <Table.Td>{row.cc.t1 !== null ? fmt(row.cc.t1, 1) : "none"}</Table.Td>
                        <Table.Td>{pct(row.cc.recovery1, 1)}</Table.Td>
                        <Table.Td>{sig(row.got1, 3)}</Table.Td>
                        <Table.Td>{row.cc.t2 !== null ? fmt(row.cc.t2, 1) : "none"}</Table.Td>
                        <Table.Td>{pct(row.cc.recovery2, 1)}</Table.Td>
                        <Table.Td>{sig(row.got2, 3)}</Table.Td>
                        <Table.Td>{sig(row.closure, 2)}</Table.Td>
                      </>
                    ) : <Table.Td colSpan={8}><Text size="xs" c="dimmed">…</Text></Table.Td>}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Wide>
          <PanelNote>
            Injection length {fmt(tInj5, 1)} s and the column of the knobs above; the first product is
            collected from the start to the first cut, the second from the second cut to the end, and
            the middle is neither. &quot;none&quot; means no cut reaches the target. On {PAGE_CELLS} cells
            the recoveries of the default column sit within about two percentage points of the
            converged values (measured against 800 cells); the grid check of step 5 repeats the
            comparison for your own knobs. Computed in{" "}
            {fmt(sweep.ms / 1000, 2)} s in this browser, a slice at a time.
          </PanelNote>
        </Panel>

        <LessonLimits limits={CHROM_LIMITS} />
        <LessonReferences tool="chromatography" />
      </Stack>
    </Box>
  );
}

function EngineStatus({ busy, err, stale }: { busy: boolean; err: string | null; stale: boolean }): JSX.Element | null {
  if (err)
    return (
      <Alert color="red" variant="light" title="the engine run did not finish">
        <Text size="sm">{err}</Text>
      </Alert>
    );
  if (busy || stale)
    return (
      <Group gap={8}>
        <Loader size="xs" />
        <Text size="sm" c="dimmed">running the pulse with choupoBatch in your browser…</Text>
      </Group>
    );
  return null;
}
