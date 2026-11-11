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
  SlePairTool -- "Pair parameters from the solubility of a solid" (DEV.md 4c
  C316): a binary NRTL pair obtained INDIRECTLY, from how much of a solid a
  solvent dissolves.  Three moments (C305): Understand (the equilibrium
  condition, the ideal solubility, the dCp term sized and neglected, one
  gamma per measurement), Experiment (the fit with every fourth point held
  out, what the measurements cannot see, three predictions written before
  the page answers) and Verify (every number's source, the engine lines the
  page relies on, the assumptions and the references).

  EVERY NUMBER IS COMPUTED ON THIS PAGE (slePairMath.ts, pure and tested)
  from MEASUREMENTS (slePairData.ts, cited).  No engine run: the engine has
  no operation that fits or predicts the solubility of a molecular solid
  (slePairLesson.ts SLE_ENGINE_SOURCES, read back by the test).  Its NRTL is
  transcribed and held to the engine's printed gamma by tests/slePair.test.ts.

  Charts are inline SVG (the EpsilonNtuTool / PinchCompositeTool precedent):
  the plotly bundle cannot load outside a browser, and the render test draws
  this page with react-dom/server.
\*---------------------------------------------------------------------------*/

import { useMemo, useState, type ReactNode } from "react";
import {
  Badge, Box, Button, Group, NumberInput, SegmentedControl, Table, Text, Title,
} from "@mantine/core";

import { useStore } from "../../state/store.js";
import { DEFAULT_PREFS, formatSig } from "../../state/displayUnits.js";
import { SortTh, useSortable } from "../SortableTable.js";
import { LessonReferences, lessonStepper, TexText } from "./lessonStep.js";
import { OriginMark } from "./origin.js";
import {
  SLE_ENGINE_SOURCES, SLE_LIMITS, SLE_PREDICTIONS, SLE_STEPS, type SlePrediction,
} from "./slePairLesson.js";
import {
  ARCHIVE, CP_CRYSTAL, CP_LIQUID, FUSION_WANG, FUSION_YANG, LONG_2010, REVIEW_STATUS,
  SOLVENTS, type SolidFusion, type SolventSeries,
} from "./slePairData.js";
import {
  aard, checkPoints, dCpTerm, deltaCpAt, fitPair, gammaFromSolubility, lnGammaBinary,
  lnIdealSolubility, measuredSaturationTemperature, predictSolubility, saturationTemperature,
  splitHeldOut, type BinaryPair, type Fusion,
} from "./slePairMath.js";

const BORDER = "var(--mantine-color-default-border)";

// ---- The three moments ---------------------------------------------------------

export type SleMomentId = "understand" | "experiment" | "verify";

export const SLE_MOMENTS: readonly { id: SleMomentId; title: string; lead: string }[] = [
  { id: "understand", title: "Understand · a solubility is an activity coefficient",
    lead: "Why a saturated solution measures γ₁, what the solid alone decides (the ideal "
      + "solubility), and the heat-capacity term: sized, then neglected." },
  { id: "experiment", title: "Experiment · fit, hold out, predict",
    lead: "Fit two NRTL parameters to the activity coefficients with every fourth "
      + "measurement held out; see what the measurements cannot pin; and, before each "
      + "answer, write what you expect." },
  { id: "verify", title: "Verify · every number, its source and its assumptions",
    lead: "The measurements with their articles and DOIs, the fusion data and the heat "
      + "capacities, the engine lines this page relies on, what the method assumes, and "
      + "where to read further." },
];

function MomentsNav(): JSX.Element {
  const go = (id: SleMomentId) => {
    const el = typeof document === "undefined" ? null
      : document.querySelector(`[data-moment="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <Group gap={6} data-moments-nav="">
      {SLE_MOMENTS.map((m, i) => (
        <Button key={m.id} size="compact-sm" variant="light" onClick={() => go(m.id)}>
          {i + 1} · {m.title.split(" · ")[0]}
        </Button>
      ))}
    </Group>
  );
}

function Moment({ id, children }: { id: SleMomentId; children: ReactNode }): JSX.Element {
  const m = SLE_MOMENTS.find((x) => x.id === id)!;
  const n = SLE_MOMENTS.indexOf(m) + 1;
  return (
    <Box data-moment={id} pt="sm" style={{ borderTop: `2px solid ${BORDER}`, scrollMarginTop: 8 }}>
      <Title order={4}>{n} · {m.title}</Title>
      <Text size="sm" c="dimmed" mt={2} mb="sm">{m.lead}</Text>
      <Box style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</Box>
    </Box>
  );
}

// ---- A small SVG plot ------------------------------------------------------------

interface Series {
  name: string;
  pts: readonly [number, number][];
  kind: "line" | "dash" | "dot" | "ring";
  color: string;
}

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12 * span; v += step) out.push(v);
  return out;
}

export function SvgPlot({ series, xLabel, yLabel, sig, band, height = 260 }: {
  series: readonly Series[];
  xLabel: string;
  yLabel: string;
  sig: number;
  /** a shaded x-interval (the measured window) */
  band?: [number, number];
  height?: number;
}): JSX.Element {
  const W = 560, H = height, L = 62, Rm = 12, T = 12, B = 44;
  const all = series.flatMap((s) => s.pts).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (!(x1 > x0)) { x0 -= 1; x1 += 1; }
  if (!(y1 > y0)) { y0 -= 1; y1 += 1; }
  const py = 0.05 * (y1 - y0); y0 -= py; y1 += py;
  const X = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - Rm);
  const Y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  return (
    <Box>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${yLabel} against ${xLabel}`}
        style={{ maxWidth: W, display: "block" }}>
        {band && (
          <rect x={X(Math.max(band[0], x0))} y={T} width={Math.max(0, X(Math.min(band[1], x1)) - X(Math.max(band[0], x0)))}
            height={H - T - B} fill="var(--mantine-color-gray-5)" opacity={0.15} />
        )}
        <line x1={L} y1={H - B} x2={W - Rm} y2={H - B} stroke="currentColor" opacity={0.5} />
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="currentColor" opacity={0.5} />
        {niceTicks(x0, x1).map((v) => (
          <g key={`x${v}`}>
            <line x1={X(v)} y1={H - B} x2={X(v)} y2={H - B + 4} stroke="currentColor" opacity={0.5} />
            <text x={X(v)} y={H - B + 16} fontSize={10} textAnchor="middle" fill="currentColor">{formatSig(v, sig)}</text>
          </g>
        ))}
        {niceTicks(y0, y1).map((v) => (
          <g key={`y${v}`}>
            <line x1={L - 4} y1={Y(v)} x2={L} y2={Y(v)} stroke="currentColor" opacity={0.5} />
            <text x={L - 6} y={Y(v) + 3} fontSize={10} textAnchor="end" fill="currentColor">{formatSig(v, sig)}</text>
          </g>
        ))}
        <text x={(L + W - Rm) / 2} y={H - 8} fontSize={11} textAnchor="middle" fill="currentColor">{xLabel}</text>
        <text x={14} y={(T + H - B) / 2} fontSize={11} textAnchor="middle" fill="currentColor"
          transform={`rotate(-90 14 ${(T + H - B) / 2})`}>{yLabel}</text>
        {series.map((s) => {
          const ok = s.pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
          if (s.kind === "line" || s.kind === "dash") {
            const d = ok.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("");
            return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth={1.8}
              strokeDasharray={s.kind === "dash" ? "5 4" : undefined} />;
          }
          return (
            <g key={s.name}>
              {ok.map(([x, y], i) => (
                <circle key={i} cx={X(x)} cy={Y(y)} r={3.6}
                  fill={s.kind === "dot" ? s.color : "none"} stroke={s.color} strokeWidth={1.5} />
              ))}
            </g>
          );
        })}
      </svg>
      <Group gap={12} mt={2}>
        {series.map((s) => (
          <Group key={s.name} gap={4}>
            <svg width={22} height={10} aria-hidden="true">
              {s.kind === "line" || s.kind === "dash"
                ? <line x1={0} y1={5} x2={22} y2={5} stroke={s.color} strokeWidth={2}
                    strokeDasharray={s.kind === "dash" ? "5 3" : undefined} />
                : <circle cx={11} cy={5} r={3.5} fill={s.kind === "dot" ? s.color : "none"} stroke={s.color} />}
            </svg>
            <Text size="xs">{s.name}</Text>
          </Group>
        ))}
      </Group>
    </Box>
  );
}

const C_MEAS = "var(--mantine-color-blue-6)";
const C_HELD = "var(--mantine-color-orange-6)";
const C_IDEAL = "var(--mantine-color-gray-6)";
const C_FIT = "var(--mantine-color-teal-6)";
const C_ALT = "var(--mantine-color-grape-6)";

// ---- The page's computation, in one place ------------------------------------------

export const ALPHA_FAMILY = [0.1, 0.2, 0.3, 0.47] as const;
export const T_OTHER_END = 320;

export interface SleState {
  solvent: SolventSeries;
  fusion: SolidFusion;
  alpha: number;
}

/** Everything the Experiment moment shows for one choice of solvent, fusion
 *  data and alpha -- pure, so the render test and the page read one result. */
export function computeSle({ solvent, fusion, alpha }: SleState) {
  const s: Fusion = { Tfus: fusion.Tfus, dHfus: fusion.dHfus };
  const { train, held } = splitHeldOut(solvent.points);
  const gTrain = gammaFromSolubility(train, s);
  const fit = fitPair(gTrain, alpha);
  const inSample = checkPoints(train, fit.pair, s);
  const heldOut = checkPoints(held, fit.pair, s);
  const Ts = solvent.points.map((p) => p.T);
  const Tmin = Math.min(...Ts), Tmax = Math.max(...Ts);
  const curve: [number, number][] = [], extrap: [number, number][] = [], ideal: [number, number][] = [];
  for (let k = 0; k <= 40; ++k) {
    const T = Tmin + (Tmax - Tmin) * k / 40;
    curve.push([1000 / T, Math.log(predictSolubility(T, fit.pair, s).x1)]);
  }
  for (let k = 0; k <= 30; ++k) {
    const T = Tmax + (s.Tfus - 0.5 - Tmax) * k / 30;
    extrap.push([1000 / T, Math.log(predictSolubility(T, fit.pair, s).x1)]);
  }
  for (const T of [Math.min(Tmin, 270), s.Tfus]) ideal.push([1000 / T, lnIdealSolubility(T, s)]);
  // the other end: equally good fits that disagree where nothing was measured
  const half = solvent.points.slice(0, Math.ceil(solvent.points.length / 2));
  const others: { label: string; pair: BinaryPair; rms: number; fittedOn: string }[] = [];
  for (const a of ALPHA_FAMILY) {
    const f = fitPair(gTrain, a);
    others.push({ label: `α = ${a}`, pair: f.pair, rms: f.rmsLnGamma, fittedOn: "fitted points" });
  }
  const fCold = fitPair(gammaFromSolubility(half, s), alpha);
  others.push({ label: `cold half only, α = ${alpha}`, pair: fCold.pair, rms: fCold.rmsLnGamma,
    fittedOn: `the ${half.length} coldest points` });
  const Tmid = 0.5 * (Tmin + Tmax);
  const Thot = Math.min(370, s.Tfus - 5);
  const otherEnd = others.map((o) => {
    const mid = predictSolubility(Tmid, o.pair, s), hot = predictSolubility(Thot, o.pair, s);
    return {
    ...o,
    xMid: mid.x1,
    xHot: hot.x1,
    /** more than one saturated liquid at either T: the pair predicts a liquid-liquid split */
    split: mid.roots > 1 || hot.roots > 1,
    lnG2inf: lnGammaBinary(1, T_OTHER_END, o.pair)[1],
    aardAll: aard(checkPoints(solvent.points, o.pair, s)),
    };
  });
  return { s, train, held, fit, inSample, heldOut, curve, extrap, ideal, Tmin, Tmax, Tmid, Thot, otherEnd };
}

// ---- Predictions -----------------------------------------------------------------

function PredictionCard({ p, children }: { p: SlePrediction; children: ReactNode }): JSX.Element {
  return (
    <Box px="sm" py="xs" data-prediction={p.id}
      style={{ border: `1px solid ${BORDER}`, borderRadius: 6,
        borderLeft: `3px solid var(--mantine-color-${p.id === "rank" ? "grape" : "accent"}-5)` }}>
      <Group gap={8} mb={4}>
        <Title order={5}>{p.title}</Title>
        {p.id === "rank" && (
          <Badge color="grape" variant="light" styles={{ root: { textTransform: "none" } }}>
            DESIGN QUESTION — measured answers, no grade
          </Badge>
        )}
      </Group>
      <Text size="sm">{p.prompt}</Text>
      <Text size="xs" c="dimmed" mt={4}>{p.check}</Text>
      <Box mt={8}>{children}</Box>
    </Box>
  );
}

function SideBySide({ rows }: { rows: { what: string; yours: string; page: string }[] }): JSX.Element {
  return (
    <Table withTableBorder fz="xs" mt={6} data-side-by-side="">
      <Table.Thead>
        <Table.Tr><Table.Th /><Table.Th>your prediction</Table.Th><Table.Th>computed / measured</Table.Th></Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.what}>
            <Table.Td>{r.what}</Table.Td><Table.Td>{r.yours}</Table.Td><Table.Td>{r.page}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

const numOrNull = (v: string | number): number | null =>
  (typeof v === "number" && Number.isFinite(v)) ? v
    : (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** The measured point of a series nearest a temperature. */
export function nearest(series: SolventSeries, T: number) {
  return series.points.reduce((b, p) => (Math.abs(p.T - T) < Math.abs(b.T - T) ? p : b));
}

/** The answers the three predictions reveal -- pure, for the test. */
export function predictionAnswers(fusion: SolidFusion, acetonePair: BinaryPair) {
  const s: Fusion = { Tfus: fusion.Tfus, dHfus: fusion.dHfus };
  const cyc = SOLVENTS.find((v) => v.id === "cyclohexane")!;
  const c298 = nearest(cyc, 298.15);
  const a = {
    xMeas: c298.x1, T: c298.T, xIdeal: Math.exp(lnIdealSolubility(c298.T, s)),
    TsatIdeal: saturationTemperature(0.1, null, s),
    TsatMeasured: measuredSaturationTemperature(cyc.points, 0.1),
  };
  const sHi: Fusion = { ...s, Tfus: s.Tfus + 10 };
  const b = {
    idealBefore: Math.exp(lnIdealSolubility(298.15, s)),
    idealAfter: Math.exp(lnIdealSolubility(298.15, sHi)),
    xBefore: predictSolubility(298.15, acetonePair, s).x1,
    xAfter: predictSolubility(298.15, acetonePair, sHi).x1,
  };
  const c = (["acetone", "acetic-acid", "cyclohexane"] as const).map((id) => {
    const v = SOLVENTS.find((q) => q.id === id)!;
    const p = nearest(v, 298.15);
    const xid = Math.exp(lnIdealSolubility(p.T, s));
    return { id, label: v.label, T: p.T, x1: p.x1, xIdeal: xid, gamma1: xid / p.x1 };
  });
  return { a, b, c };
}

function PositivePrediction({ ans, g }: {
  ans: ReturnType<typeof predictionAnswers>["a"]; g: (v: number) => string;
}): JSX.Element {
  const p = SLE_PREDICTIONS.find((x) => x.id === "positive")!;
  const [dir, setDir] = useState<string>("");
  const [Tg, setTg] = useState<string | number>("");
  const [shown, setShown] = useState(false);
  const TgN = numOrNull(Tg);
  return (
    <PredictionCard p={p}>
      <Group gap={8} align="flex-end" wrap="wrap">
        <SegmentedControl size="xs" value={dir} onChange={setDir}
          data={[{ label: "higher than ideal", value: "higher" }, { label: "lower than ideal", value: "lower" }]} />
        <NumberInput size="xs" w={200} label="saturation T of x₁ = 0.1 (K)" value={Tg} onChange={setTg} />
        <Button size="xs" disabled={dir === ""} onClick={() => setShown(true)}>show the measurements</Button>
      </Group>
      {dir === "" && <Text size="xs" c="dimmed" mt={4}>Choose higher or lower first: the answer waits for your guess.</Text>}
      {shown && (
        <>
          <OriginMark of={["reference", "page"]} note="measured: Long et al. 2010; ideal and interpolation: this page" />
          <SideBySide rows={[
            { what: `solubility in cyclohexane at ${g(ans.T)} K`, yours: dir,
              page: `measured ${g(ans.xMeas)} against ideal ${g(ans.xIdeal)}: lower, by a factor ${g(ans.xIdeal / ans.xMeas)}` },
            { what: "saturation temperature of x₁ = 0.1", yours: TgN === null ? "—" : `${g(TgN)} K`,
              page: `${g(ans.TsatMeasured)} K measured (ideal ${g(ans.TsatIdeal)} K): ${g(ans.TsatMeasured - ans.TsatIdeal)} K higher` },
          ]} />
        </>
      )}
    </PredictionCard>
  );
}

function TfusPrediction({ ans, g }: {
  ans: ReturnType<typeof predictionAnswers>["b"]; g: (v: number) => string;
}): JSX.Element {
  const p = SLE_PREDICTIONS.find((x) => x.id === "tfus")!;
  const [dir, setDir] = useState<string>("");
  const [by, setBy] = useState<string | number>("");
  const [shown, setShown] = useState(false);
  const byN = numOrNull(by);
  return (
    <PredictionCard p={p}>
      <Group gap={8} align="flex-end" wrap="wrap">
        <SegmentedControl size="xs" value={dir} onChange={setDir}
          data={[{ label: "rises", value: "rises" }, { label: "falls", value: "falls" }, { label: "stays", value: "stays" }]} />
        <NumberInput size="xs" w={200} label="by about (%)" value={by} onChange={setBy} />
        <Button size="xs" disabled={dir === ""} onClick={() => setShown(true)}>compute</Button>
      </Group>
      {dir === "" && <Text size="xs" c="dimmed" mt={4}>Choose first: the answer waits for your guess.</Text>}
      {shown && (
        <>
          <OriginMark of={["page", "assumption"]} note="the acetone pair (α = 0.3, fusion data of Wang, Lai &amp; Chen 2010) fitted on this page; T_fus + 10 K is your change" />
          <SideBySide rows={[
            { what: "solubility in acetone at 298.15 K", yours: `${dir}${byN !== null ? ` by about ${g(byN)} %` : ""}`,
              page: `${g(ans.xBefore)} → ${g(ans.xAfter)}: falls by ${g(100 * (1 - ans.xAfter / ans.xBefore))} %` },
            { what: "ideal solubility at 298.15 K", yours: "—",
              page: `${g(ans.idealBefore)} → ${g(ans.idealAfter)}` },
          ]} />
        </>
      )}
    </PredictionCard>
  );
}

function RankPrediction({ ans, g }: {
  ans: ReturnType<typeof predictionAnswers>["c"]; g: (v: number) => string;
}): JSX.Element {
  const p = SLE_PREDICTIONS.find((x) => x.id === "rank")!;
  const [order, setOrder] = useState<string>("");
  const [shown, setShown] = useState(false);
  return (
    <PredictionCard p={p}>
      <Group gap={8} align="flex-end" wrap="wrap">
        <SegmentedControl size="xs" value={order} onChange={setOrder}
          data={[
            { label: "acetone > acetic acid > cyclohexane", value: "acetone > acetic acid > cyclohexane" },
            { label: "acetic acid > acetone > cyclohexane", value: "acetic acid > acetone > cyclohexane" },
            { label: "cyclohexane first", value: "cyclohexane first" },
          ]} />
        <Button size="xs" disabled={order === ""} onClick={() => setShown(true)}>show the measurements</Button>
      </Group>
      {order === "" && <Text size="xs" c="dimmed" mt={4}>Rank first: the answer waits for your guess.</Text>}
      {shown && (
        <>
          <OriginMark of={["reference", "page"]} note="measured: Long et al. 2010 (one article, one method); ideal and γ₁: this page" />
          <Text size="xs" mt={4}>Your ranking: {order}</Text>
          <Table withTableBorder fz="xs" mt={6} data-rank-table="">
            <Table.Thead><Table.Tr>
              <Table.Th>solvent</Table.Th><Table.Th>T (K)</Table.Th><Table.Th>x₁ measured</Table.Th>
              <Table.Th>x₁ ideal</Table.Th><Table.Th>γ₁</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {ans.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{r.label}</Table.Td><Table.Td>{g(r.T)}</Table.Td><Table.Td>{g(r.x1)}</Table.Td>
                  <Table.Td>{g(r.xIdeal)}</Table.Td><Table.Td>{g(r.gamma1)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt={4}>
            The ideal column is the same for every solvent — the solid decides it.  The ranking is
            the ranking of γ₁.  2-propanol, the fourth solvent of the same article, dissolves
            practically as much as acetone at 298 K: a design that has to choose between those two
            chooses on something else (boiling point, safety, price).
          </Text>
        </>
      )}
    </PredictionCard>
  );
}

// ---- The page ------------------------------------------------------------------------

const step = lessonStepper(SLE_STEPS);

export function SlePairTool(): JSX.Element {
  const prefs = useStore((s) => s.displayPrefs) ?? DEFAULT_PREFS;
  const sig = prefs.sigFigs ?? 3;
  const g = (v: number) => formatSig(v, sig);
  const [solventId, setSolventId] = useState<SolventSeries["id"]>("acetone");
  const [fusionId, setFusionId] = useState<"wang" | "yang">("wang");
  const [alphaIn, setAlphaIn] = useState<string | number>(0.3);
  const alpha = Math.min(0.6, Math.max(0.05, numOrNull(alphaIn) ?? 0.3));
  const solvent = SOLVENTS.find((v) => v.id === solventId)!;
  const fusion = fusionId === "wang" ? FUSION_WANG : FUSION_YANG;
  const r = useMemo(() => computeSle({ solvent, fusion, alpha }), [solvent, fusion, alpha]);
  //  The predictions are asked about the DEFAULT solid data and the acetone
  //  pair at alpha 0.3, so their printed prompts stay true whatever the
  //  Experiment controls are set to.
  const answers = useMemo(() => predictionAnswers(FUSION_WANG, computeSle({
    solvent: SOLVENTS.find((v) => v.id === "acetone")!, fusion: FUSION_WANG, alpha: 0.3 }).fit.pair), []);
  const sFus: Fusion = { Tfus: fusion.Tfus, dHfus: fusion.dHfus };

  // Understand: every series, measured, on ln x vs 1000/T, with the ideal line
  const understandSeries: Series[] = [
    { name: "ideal solubility (every solvent)", kind: "line", color: C_IDEAL,
      pts: [270, fusion.Tfus].map((T) => [1000 / T, lnIdealSolubility(T, sFus)] as [number, number]) },
    ...SOLVENTS.map((v, i) => ({
      name: v.label, kind: "dot" as const,
      color: [C_MEAS, C_FIT, C_ALT, C_HELD][i]!,
      pts: v.points.map((p) => [1000 / p.T, Math.log(p.x1)] as [number, number]),
    })),
  ];
  const gammaSeries: Series[] = SOLVENTS.map((v, i) => ({
    name: v.label, kind: "dot" as const, color: [C_MEAS, C_FIT, C_ALT, C_HELD][i]!,
    pts: gammaFromSolubility(v.points, sFus).map((p) => [p.T, Math.log(p.gamma1)] as [number, number]),
  }));

  // the residual table
  type Row = { T: number; x1: number; gMeas: number; gModel: number; xPred: number; dev: number; role: string };
  const rows: Row[] = useMemo(() => {
    const heldSet = new Set(r.held);
    return solvent.points.map((p) => {
      const lnXid = lnIdealSolubility(p.T, r.s);
      const gModel = Math.exp(lnGammaBinary(p.x1, p.T, r.fit.pair)[0]);
      const xPred = predictSolubility(p.T, r.fit.pair, r.s).x1;
      return { T: p.T, x1: p.x1, gMeas: Math.exp(lnXid) / p.x1, gModel, xPred,
        dev: 100 * (xPred - p.x1) / p.x1, role: heldSet.has(p) ? "held out" : "fitted" };
    });
  }, [r, solvent]);
  const sortable = useSortable(rows, {
    T: (x) => x.T, x1: (x) => x.x1, gMeas: (x) => x.gMeas, gModel: (x) => x.gModel,
    xPred: (x) => x.xPred, dev: (x) => x.dev, role: (x) => x.role,
  });

  const dcp = deltaCpAt(fusion.Tfus, CP_CRYSTAL, CP_LIQUID);
  const cpRows = solvent.points.map((p) => ({ T: p.T, term: dCpTerm(p.T, { ...sFus, dCp: dcp.dCp }) }));

  // the other end: gamma1 and gamma2 against x1 at T_OTHER_END for each alternative fit
  const otherSeries: Series[] = r.otherEnd.map((o, i) => ({
    name: `ln γ₂, ${o.label}`, kind: i === r.otherEnd.length - 1 ? "dash" : "line",
    color: [C_FIT, C_MEAS, C_IDEAL, C_HELD, C_ALT][i % 5]!,
    pts: Array.from({ length: 41 }, (_, k) => {
      const x1 = k / 40;
      return [x1, lnGammaBinary(x1, T_OTHER_END, o.pair)[1]] as [number, number];
    }),
  }));
  const xs = solvent.points.map((p) => p.x1);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} p="md" data-tool="sle-pair">
      <Box style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
        <Box>
          <Title order={3}>Pair parameters from the solubility of a solid</Title>
          <Text size="sm" c="dimmed" mt={4}>
            How much benzoic acid a solvent dissolves is a measurement of an activity coefficient.
            This page turns four measured solubility series into γ₁, fits two NRTL parameters to
            them, holds part of the data out to test the fit, and shows what such a pair cannot
            know.  Every number is computed on this page from cited measurements.
          </Text>
          <Box mt={8}><MomentsNav /></Box>
        </Box>

        <Moment id="understand">
          {step(1)}
          {step(2)}
          {step(3)}
          <Box>
            <OriginMark of={["reference", "page"]}
              note={`measured: Long et al. 2010; ideal line: this page, from ${fusion.label} (T_fus ${g(fusion.Tfus)} K, ΔH_fus ${g(fusion.dHfus / 1000)} kJ/mol)`} />
            <SvgPlot sig={sig} xLabel="1000 / T  [1/K]" yLabel="ln x₁" series={understandSeries} />
            <Text size="xs" c="dimmed" mt={2}>
              The straight line is the ideal solubility; it reaches ln x₁ = 0 at the melting point.
              Points above it dissolve more than ideally (γ₁ &lt; 1), points below it less (γ₁ &gt; 1).
            </Text>
          </Box>
          {step(4)}
          {step(5)}
          <Box>
            <OriginMark of={["reference", "page"]} note="γ₁ = x₁ⁱᵈ/x₁ at each measured point" />
            <SvgPlot sig={sig} xLabel="T  [K]" yLabel="ln γ₁" series={gammaSeries} height={220} />
          </Box>
        </Moment>

        <Moment id="experiment">
          {step(6)}
          <Group gap={12} align="flex-end" wrap="wrap" data-fit-controls="">
            <Box>
              <Text size="xs" fw={600}>solvent</Text>
              <SegmentedControl size="xs" value={solventId} onChange={(v) => setSolventId(v as SolventSeries["id"])}
                data={SOLVENTS.map((v) => ({ label: v.label, value: v.id }))} />
            </Box>
            <Box>
              <Text size="xs" fw={600}>fusion data of the solid</Text>
              <SegmentedControl size="xs" value={fusionId} onChange={(v) => setFusionId(v as "wang" | "yang")}
                data={[{ label: FUSION_WANG.label, value: "wang" }, { label: FUSION_YANG.label, value: "yang" }]} />
            </Box>
            <NumberInput size="xs" w={120} label="α (NRTL)" value={alphaIn} onChange={setAlphaIn}
              min={0.05} max={0.6} step={0.05} decimalScale={2} />
          </Group>
          <Box data-fit-result="">
            <OriginMark of={["page", "reference", "assumption"]}
              note={`fitted on this page to ${r.train.length} of ${solvent.points.length} points of Long et al. 2010 (${solvent.label}); α and the fusion data are your choice`} />
            <Table withTableBorder fz="sm" mt={6}>
              <Table.Tbody>
                <Table.Tr><Table.Td>b₁₂ / K</Table.Td><Table.Td>{g(r.fit.pair.b12)}</Table.Td>
                  <Table.Td>b₂₁ / K</Table.Td><Table.Td>{g(r.fit.pair.b21)}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>in-sample rms of ln γ₁ ({r.train.length} points)</Table.Td><Table.Td>{g(r.fit.rmsLnGamma)}</Table.Td>
                  <Table.Td>α</Table.Td><Table.Td>{g(alpha)}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>in-sample mean |Δx₁|/x₁</Table.Td><Table.Td>{g(100 * aard(r.inSample))} %</Table.Td>
                  <Table.Td>held-out mean |Δx₁|/x₁ ({r.held.length} points)</Table.Td><Table.Td>{g(100 * aard(r.heldOut))} %</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
            <Text size="xs" c="dimmed" mt={4}>
              In-sample: the points the fit saw.  Held-out: every fourth point, predicted only.  The
              held-out points lie INSIDE the measured temperature range, so they test interpolation;
              the cold-half fit below tests extrapolation.
            </Text>
          </Box>
          <Box>
            <OriginMark of={["reference", "page"]} note="points: Long et al. 2010; curves: this page" />
            <SvgPlot sig={sig} xLabel="1000 / T  [1/K]" yLabel="ln x₁" series={[
              { name: "ideal", kind: "line", color: C_IDEAL, pts: r.ideal },
              { name: "NRTL fit, measured range", kind: "line", color: C_FIT, pts: r.curve },
              { name: "NRTL fit, extrapolated to T_fus", kind: "dash", color: C_FIT, pts: r.extrap },
              { name: "fitted points", kind: "dot", color: C_MEAS, pts: r.train.map((p) => [1000 / p.T, Math.log(p.x1)]) },
              { name: "held-out points", kind: "ring", color: C_HELD, pts: r.held.map((p) => [1000 / p.T, Math.log(p.x1)]) },
            ]} />
          </Box>
          <Table withTableBorder fz="xs" data-residual-table="">
            <Table.Thead><Table.Tr>
              <SortTh s={sortable} k="T">T (K)</SortTh>
              <SortTh s={sortable} k="x1">x₁ measured</SortTh>
              <SortTh s={sortable} k="gMeas">γ₁ from data</SortTh>
              <SortTh s={sortable} k="gModel">γ₁ NRTL</SortTh>
              <SortTh s={sortable} k="xPred">x₁ predicted</SortTh>
              <SortTh s={sortable} k="dev">Δx₁/x₁ (%)</SortTh>
              <SortTh s={sortable} k="role">role</SortTh>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {sortable.rows.map((x) => (
                <Table.Tr key={x.T}>
                  <Table.Td>{g(x.T)}</Table.Td><Table.Td>{g(x.x1)}</Table.Td><Table.Td>{g(x.gMeas)}</Table.Td>
                  <Table.Td>{g(x.gModel)}</Table.Td><Table.Td>{g(x.xPred)}</Table.Td><Table.Td>{g(x.dev)}</Table.Td>
                  <Table.Td>{x.role}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed">
            Read the sign of the last-but-one column down the table: scatter about zero means the
            model's form can follow the data; a run of one sign means it cannot, whatever the
            parameters (select cyclohexane to see it).
          </Text>

          {step(7)}
          <Box data-other-end="">
            <OriginMark of={["page", "reference"]}
              note={`each row fitted on this page to measurements of Long et al. 2010 (${solvent.label}); ${g(r.Tmid)} K lies inside the data, ${g(r.Thot)} K outside`} />
            <Table withTableBorder fz="xs" mt={6}>
              <Table.Thead><Table.Tr>
                <Table.Th>fit</Table.Th><Table.Th>in-sample rms ln γ₁</Table.Th>
                <Table.Th>mean |Δx₁|/x₁, all points (%)</Table.Th>
                <Table.Th>x₁ at {g(r.Tmid)} K</Table.Th><Table.Th>x₁ at {g(r.Thot)} K</Table.Th>
                <Table.Th>γ₂^∞ at {T_OTHER_END} K</Table.Th><Table.Th>note</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {r.otherEnd.map((o) => (
                  <Table.Tr key={o.label}>
                    <Table.Td>{o.label}</Table.Td><Table.Td>{g(o.rms)}</Table.Td><Table.Td>{g(100 * o.aardAll)}</Table.Td>
                    <Table.Td>{g(o.xMid)}</Table.Td><Table.Td>{g(o.xHot)}</Table.Td><Table.Td>{g(Math.exp(o.lnG2inf))}</Table.Td>
                    <Table.Td>{o.split ? "predicts a liquid–liquid split: more than one saturated liquid; the most dilute is shown" : ""}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <SvgPlot sig={sig} xLabel="x₁ (the solid's mole fraction)" yLabel={`ln γ₂ at ${T_OTHER_END} K`}
              series={otherSeries} band={[Math.min(...xs), Math.max(...xs)]} height={240} />
            <Text size="xs" c="dimmed" mt={2}>
              Shaded: the composition window the measurements cover.  Inside it the fits nearly agree;
              towards x₁ = 1 — the solvent dilute in the molten solid — they part.
            </Text>
            <Text size="sm" mt={6} data-c300-sentence="">
              <TexText text={"What an SLE-only pair cannot do: describe the acid-rich end, or the solvent's "
                + "own coefficient \\(\\gamma_2\\), anywhere the solution was not saturated.  Its residuals "
                + "are IN-SAMPLE for the points it was fitted to and HELD-OUT for the points it only "
                + "predicted (DEV.md 4c C300: a grade is labelled for what it is, and a held-out residual "
                + "is recorded beside the in-sample one, never in place of it) — and both are residuals "
                + "on the solvent-rich side.  Neither says anything about the other end."} />
            </Text>
          </Box>

          <Title order={5}>Predict before the page answers</Title>
          <PositivePrediction ans={answers.a} g={g} />
          <TfusPrediction ans={answers.b} g={g} />
          <RankPrediction ans={answers.c} g={g} />
        </Moment>

        <Moment id="verify">
          <Box>
            <Title order={5}>The measurements</Title>
            <OriginMark of="reference" note={`${ARCHIVE} as finding aid; reviewStatus ${REVIEW_STATUS}`} />
            <Text size="xs" mt={4}>{LONG_2010.text} doi:{LONG_2010.doi} — {LONG_2010.taken}.</Text>
            <Text size="xs" mt={4}>{FUSION_WANG.source.text} doi:{FUSION_WANG.source.doi} — {FUSION_WANG.source.taken}.</Text>
            <Text size="xs" mt={4}>{FUSION_YANG.source.text} doi:{FUSION_YANG.source.doi} — {FUSION_YANG.source.taken}.</Text>
            <Text size="xs" c="dimmed" mt={4}>
              Transcribed from the archive's files, not yet compared against the articles' own tables;
              the DOIs, authors, titles, volumes and pages were checked on Crossref (2026-11-11).
              The solubility uncertainties are the archive's combined expanded values (95 %): about
              2 % of x₁ in acetone, 2-propanol and acetic acid, about 5 % in cyclohexane.
            </Text>
          </Box>
          <Box>
            <Title order={5}>The heat-capacity term at each measured temperature ({solvent.label})</Title>
            <OriginMark of={["reference", "page"]}
              note={`Cp lines through Yang et al. 2012: crystal ${g(dcp.cpS)}, liquid ${g(dcp.cpL)} J/(mol·K) at ${g(fusion.Tfus)} K; ΔCp = ${g(dcp.dCp)} J/(mol·K)`} />
            <Table withTableBorder fz="xs" mt={6} data-dcp-table="">
              <Table.Thead><Table.Tr><Table.Th>T (K)</Table.Th><Table.Th>ΔCp term added to ln x₁ⁱᵈ</Table.Th><Table.Th>factor on x₁ⁱᵈ</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {cpRows.map((c) => (
                  <Table.Tr key={c.T}><Table.Td>{g(c.T)}</Table.Td><Table.Td>{g(c.term)}</Table.Td><Table.Td>{g(Math.exp(c.term))}</Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
          <Box>
            <Title order={5}>What the engine has, and the lines this page relies on</Title>
            <Text size="xs" mt={4}>
              The engine has no operation that fits a pair to the solubility of a solid, or
              predicts that solubility for a molecular solid: its crystallising solid and the
              flash's liquid + solid branch serve ice today.  So this page computes, and its NRTL
              is the engine's loop transcribed — tests/slePair.test.ts holds it to the γ the engine
              printed for the catalogue ethanol–water pair (props case
              nrtl01_ethanol_water_package) to 1e-10.
            </Text>
            <Table withTableBorder fz="xs" mt={6} data-engine-sources="">
              <Table.Thead><Table.Tr><Table.Th>file:line</Table.Th><Table.Th>what it says</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {SLE_ENGINE_SOURCES.map((e) => (
                  <Table.Tr key={`${e.file}:${e.line}`}>
                    <Table.Td ff="monospace">{e.file}:{e.line}</Table.Td><Table.Td>{e.claim}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
          <Box>
            <Title order={5}>Assumptions</Title>
            {SLE_LIMITS.map((l) => (
              <Box key={l.id} mt={6} data-limit={l.id}>
                <Text size="sm" fw={600}>{l.title}</Text>
                <Text size="sm"><TexText text={l.body} /></Text>
              </Box>
            ))}
          </Box>
          <LessonReferences tool="sle-pair" />
        </Moment>
      </Box>
    </Box>
  );
}
