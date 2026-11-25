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
  OptimizersTool -- "Three ways to optimise a flowsheet".

  The task it serves, in one sentence: I have a flowsheet and a target; which
  optimiser can I trust, and how do I read what it tells me?

  SIX CARDS AND A QUIZ.  The landscape (two toy functions, smooth and
  stepped, drawn as cost bands with the limit); Nelder-Mead, SQP and MADS
  each stepped on them; a real run (optim06's table, the engine's own); and
  the decision.  Every fact is in optimizersLesson.ts and every number a
  method produces is computed by optimizersMath.ts when the page draws; this
  file only draws.  The landscapes and the three methods are the page's
  arithmetic (origin: page); the table of card 5 is the engine's run
  (origin: engine); the engine's MADS is cited on card 4 and differs from the page's in the ways listed there.

  ACCESSIBILITY.  A poll point is a MARK and a WORD in the table, never a
  colour alone; the limit is a dashed line AND a hatched side AND a sentence.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import { Anchor, Box, Button, Group, SegmentedControl, Slider, Stack, Table, Text, Title } from "@mantine/core";

import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";
import {
  CITATIONS, DECISION_ROWS, OPT_STEPS, RUN_ROWS, SHADOW_CHECK,
} from "./optimizersLesson.js";
import { OPT_LIMITS_ALL, OPT_QUIZ_ALL, OPT_STEPS_ALL } from "./bayesOpt/optimizersWithBayes.js";
import { BayesOptCard } from "./bayesOpt/BayesOptCard.js";
import {
  BOX, MADS_SIMPLIFICATIONS, NM_PENALTY, SPEC, START, cost, enumerateStages, landscapeGrid, limit,
  purity, refluxRequired, runMads, runMcKinnon, runNelderMead, runSqp, scorecard, smoothOptimum,
  type LandscapeId, type MadsResult, type Pt,
} from "./optimizersMath.js";

const step = lessonStepper(OPT_STEPS);
const BORDER = "1px solid var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const ACCENT = "var(--mantine-color-teal-6)";
const WARN = "var(--mantine-color-orange-6)";

// ---- the plot ---------------------------------------------------------------

const W = 540, H = 340, ML = 46, MR = 12, MT = 10, MB = 38;
const PW = W - ML - MR, PH = H - MT - MB;
const sx = (s: number): number => ML + ((s - BOX.sLo) / (BOX.sHi - BOX.sLo)) * PW;
const ry = (r: number): number => MT + (1 - (r - BOX.rLo) / (BOX.rHi - BOX.rLo)) * PH;
const fromPx = (px: number, py: number): Pt => [
  BOX.sLo + ((px - ML) / PW) * (BOX.sHi - BOX.sLo),
  BOX.rLo + (1 - (py - MT) / PH) * (BOX.rHi - BOX.rLo),
];

const N_S = 72, N_R = 46, N_BAND = 9;

interface Bands { runs: { x: number; y: number; w: number; band: number; infeasible: boolean }[] }

function bandsOf(land: LandscapeId): Bands {
  const { f, g } = landscapeGrid(land, N_S, N_R);
  let lo = Infinity, hi = -Infinity;
  for (const row of f) for (const v of row) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const runs: Bands["runs"] = [];
  const cw = PW / N_S, ch = PH / N_R;
  for (let i = 0; i < N_R; ++i) {
    let j = 0;
    while (j < N_S) {
      const b = Math.min(N_BAND - 1, Math.floor(((f[i]![j]! - lo) / (hi - lo)) * N_BAND));
      const inf = g[i]![j]! > 0;
      let k = j + 1;
      while (k < N_S
        && Math.min(N_BAND - 1, Math.floor(((f[i]![k]! - lo) / (hi - lo)) * N_BAND)) === b
        && (g[i]![k]! > 0) === inf) ++k;
      // row i = 0 is the LOWEST r
      runs.push({ x: ML + j * cw, y: MT + PH - (i + 1) * ch, w: (k - j) * cw + 0.4, band: b, infeasible: inf });
      j = k;
    }
  }
  return { runs };
}

/** The limit g = 0 as a polyline in plot pixels, a staircase when stepped. */
function limitPath(land: LandscapeId): string {
  const pts: string[] = [];
  const emit = (s: number, r: number | null): void => {
    if (r === null || r < BOX.rLo - 1e-9 || r > BOX.rHi + 1e-9) return;
    pts.push(`${pts.length === 0 ? "M" : "L"}${sx(s).toFixed(1)},${ry(r).toFixed(1)}`);
  };
  if (land === "smooth") {
    for (let i = 0; i <= 120; ++i) { const s = BOX.sLo + ((BOX.sHi - BOX.sLo) * i) / 120; emit(s, refluxRequired(s)); }
  } else {
    for (let n = BOX.sLo; n <= BOX.sHi; ++n) {
      const r = refluxRequired(n);
      const a = Math.max(BOX.sLo, n - 0.5), b = Math.min(BOX.sHi, n + 0.5);
      if (r !== null && r >= BOX.rLo && r <= BOX.rHi) {
        if (pts.length > 0) pts.push(`M${sx(a).toFixed(1)},${ry(r).toFixed(1)}`); else emit(a, r);
        pts.push(`L${sx(b).toFixed(1)},${ry(r).toFixed(1)}`);
      }
    }
  }
  return pts.join(" ");
}

function Plot({ land, onProbe, children, label }: {
  land: LandscapeId; onProbe?: (p: Pt) => void; children?: React.ReactNode; label: string;
}): JSX.Element {
  const bands = useMemo(() => bandsOf(land), [land]);
  const lp = useMemo(() => limitPath(land), [land]);
  const id = `hatch-${land}-${label}`.replace(/[^A-Za-z0-9-]/g, "-");
  return (
    <Box data-pan-x="" style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block" }}
        role="img" aria-label={label}
        onClick={onProbe ? (e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
          if (px >= ML && px <= W - MR && py >= MT && py <= MT + PH) onProbe(fromPx(px, py));
        } : undefined}>
        <defs>
          <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={INK} strokeWidth="1" opacity="0.55" />
          </pattern>
        </defs>
        {bands.runs.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={PH / N_R + 0.4}
              fill="var(--mantine-color-blue-6)" fillOpacity={0.06 + 0.075 * b.band} />
            {b.infeasible && <rect x={b.x} y={b.y} width={b.w} height={PH / N_R + 0.4} fill={`url(#${id})`} />}
          </g>
        ))}
        <path d={lp} fill="none" stroke="var(--mantine-color-text)" strokeWidth="2" strokeDasharray="6 4" />
        <rect x={ML} y={MT} width={PW} height={PH} fill="none" stroke={INK} />
        {[8, 9, 10, 11, 12, 13, 14].map((s) => (
          <g key={s}>
            <line x1={sx(s)} x2={sx(s)} y1={MT + PH} y2={MT + PH + 4} stroke={INK} />
            <text x={sx(s)} y={MT + PH + 16} fontSize="10" textAnchor="middle" fill={INK}>{s}</text>
          </g>
        ))}
        {[2, 3, 4, 5, 6].map((r) => (
          <g key={r}>
            <line x1={ML - 4} x2={ML} y1={ry(r)} y2={ry(r)} stroke={INK} />
            <text x={ML - 7} y={ry(r) + 3} fontSize="10" textAnchor="end" fill={INK}>{r}</text>
          </g>
        ))}
        <text x={ML + PW / 2} y={H - 4} fontSize="11" textAnchor="middle" fill={INK}>stages s</text>
        <text x={12} y={MT + PH / 2} fontSize="11" textAnchor="middle" fill={INK}
          transform={`rotate(-90 12 ${MT + PH / 2})`}>reflux ratio r</text>
        {children}
      </svg>
    </Box>
  );
}

const fmt = (x: number | null | undefined, d = 3): string =>
  x === null || x === undefined || !Number.isFinite(x) ? "n/a" : x.toFixed(d);

function Mark({ at, kind, big }: { at: Pt; kind: "circle" | "square" | "triangle" | "diamond" | "cross" | "hollowSquare" | "dot"; big?: boolean }): JSX.Element {
  const x = sx(at[0]), y = ry(at[1]), a = big ? 6 : 4.5;
  const st = { stroke: "var(--mantine-color-text)", strokeWidth: 1.2 };
  switch (kind) {
    case "circle": return <circle cx={x} cy={y} r={a} fill="var(--mantine-color-body)" {...st} />;
    case "dot": return <circle cx={x} cy={y} r={2} fill={INK} />;
    case "square": return <rect x={x - a} y={y - a} width={2 * a} height={2 * a} fill={ACCENT} {...st} />;
    case "hollowSquare": return <rect x={x - a} y={y - a} width={2 * a} height={2 * a} fill="var(--mantine-color-body)" {...st} />;
    case "triangle": return <polygon points={`${x},${y - a - 1} ${x - a - 1},${y + a} ${x + a + 1},${y + a}`} fill={ACCENT} {...st} />;
    case "diamond": return <polygon points={`${x},${y - a - 1} ${x + a + 1},${y} ${x},${y + a + 1} ${x - a - 1},${y}`} fill={WARN} {...st} />;
    case "cross": return <path d={`M${x - a},${y - a}L${x + a},${y + a}M${x - a},${y + a}L${x + a},${y - a}`} stroke={INK} strokeWidth="1.6" />;
  }
}

function Cites({ ids }: { ids: readonly string[] }): JSX.Element {
  return (
    <Box data-opt-cites="" px="sm" py={6} style={{ border: BORDER, borderRadius: 4 }}>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">in the engine</Text>
      <OriginMark of="engine" note="each line was read in this tree; the lesson test reads every one back" />
      {ids.map((id) => {
        const c = CITATIONS.find((x) => x.id === id);
        return c ? (
          <Text size="xs" key={id} data-opt-cite={id}>
            <b>{c.file}:{c.line}</b> {"\u2014"} {c.says}
          </Text>
        ) : null;
      })}
    </Box>
  );
}

function Stepper({ n, i, setI, label }: { n: number; i: number; setI: (v: number) => void; label: string }): JSX.Element {
  return (
    <Group gap="xs" data-opt-stepper="">
      <Button size="compact-xs" variant="light" disabled={i <= 0} onClick={() => setI(i - 1)}>previous</Button>
      <Button size="compact-xs" variant="light" disabled={i >= n - 1} onClick={() => setI(i + 1)}>next</Button>
      <Button size="compact-xs" variant="subtle" onClick={() => setI(n - 1)}>last</Button>
      <Text size="xs">{label} <b>{i}</b> of {n - 1}</Text>
    </Group>
  );
}

const LandPick = ({ value, onChange }: { value: LandscapeId; onChange: (v: LandscapeId) => void }): JSX.Element => (
  <SegmentedControl size="xs" value={value} onChange={(v) => onChange(v as LandscapeId)}
    data={[{ value: "smooth", label: "smooth landscape" }, { value: "stepped", label: "stepped landscape" }]} />
);

const clipI = (i: number, n: number): number => Math.max(0, Math.min(n - 1, i));

// ---- card 1: the landscape ---------------------------------------------------

function LandscapeCard(): JSX.Element {
  const [land, setLand] = useState<LandscapeId>("smooth");
  const [probe, setProbe] = useState<Pt | null>(null);
  const so = useMemo(() => smoothOptimum(), []);
  const en = useMemo(() => enumerateStages(), []);
  const best = en.filter((e) => e.feasible).sort((a, b) => a.f! - b.f!)[0];
  return (
    <Box data-opt-card="landscape" px="sm" py={8} style={{ border: BORDER, borderRadius: 4 }}>
      <OriginMark of={["page", "assumption"]} note="two toy functions declared on the page; nothing here is run by the engine" />
      <LandPick value={land} onChange={setLand} />
      <Plot land={land} label={`the ${land} landscape`} onProbe={setProbe}>
        <Mark at={START} kind="circle" big />
        <text x={sx(START[0]) + 8} y={ry(START[1]) + 4} fontSize="10" fill="var(--mantine-color-text)">start</text>
        {land === "smooth"
          ? <Mark at={[so.s, so.r]} kind="square" big />
          : en.filter((e) => e.feasible).map((e) => <Mark key={e.s} at={[e.s, e.r!]} kind="square" big />)}
        {probe && <Mark at={probe} kind="cross" />}
      </Plot>
      <Text size="xs" c="dimmed" data-opt-legend="">
        Circle: the start every method gets (13.2 stages, reflux 3). Filled squares: the exact constrained optimum
        {land === "smooth" ? " (a 1-D search along the limit)" : " at each whole stage count that can reach the purity"}. Dashed line: g = 0; hatched
        side: the limit is violated. Click to probe.
      </Text>
      {probe && (
        <Text size="sm" data-opt-probe="">
          At s = {fmt(probe[0], 2)}, r = {fmt(probe[1], 2)}: cost f = <b>{fmt(cost(land, probe[0], probe[1]))}</b>, purity P = <b>{fmt(purity(land, probe[0], probe[1]), 4)}</b>,
          g = <b>{fmt(limit(land, probe[0], probe[1]), 4)}</b> ({limit(land, probe[0], probe[1]) <= 0 ? "limit met" : "limit violated"}).
        </Text>
      )}
      <Text size="sm" data-opt-optimum="">
        {land === "smooth"
          ? <>Exact optimum: s = <b>{fmt(so.s)}</b>, r = <b>{fmt(so.r)}</b>, f = <b>{fmt(so.f)}</b>, with the limit active.</>
          : <>Best whole stage count: s = <b>{best!.s}</b> with r = <b>{fmt(best!.r)}</b> and f = <b>{fmt(best!.f)}</b>;
            {" "}{en.filter((e) => e.feasible).map((e) => `${e.s} stages: f ${fmt(e.f)}`).join("; ")}.
            Below 13 stages no reflux in the box reaches the purity.</>}
      </Text>
      <Cites ids={["integer", "enumeration"]} />
    </Box>
  );
}

// ---- card 2: Nelder-Mead -----------------------------------------------------

const MOVE_WORD: Record<string, string> = {
  init: "the starting simplex", reflect: "reflect: the reflected point replaced the worst",
  expand: "expand: the reflection beat the best, so go twice as far",
  contract: "contract: the reflection did not help, pull the worst point toward the centre",
  shrink: "shrink: nothing helped, every point moves toward the best",
};

function NelderMeadCard(): JSX.Element {
  const [land, setLand] = useState<LandscapeId>("smooth");
  const [i0, setI] = useState(5);
  const res = useMemo(() => runNelderMead(land), [land]);
  const i = clipI(i0, res.steps.length);
  const st = res.steps[i]!;
  const poly = st.verts.map((v) => `${sx(v[0]).toFixed(1)},${ry(v[1]).toFixed(1)}`).join(" ");
  const trail = res.steps.slice(0, i + 1).map((s) => `${sx(s.verts[0]![0]).toFixed(1)},${ry(s.verts[0]![1]).toFixed(1)}`).join(" ");
  const lab = ["b", "m", "w"];
  return (
    <Box data-opt-card="nelder-mead" px="sm" py={8} style={{ border: BORDER, borderRadius: 4 }}>
      <OriginMark of="page" note="the engine's rules and defaults written again; the objective is cost plus a penalty" />
      <LandPick value={land} onChange={(v) => { setLand(v); setI(5); }} />
      <Plot land={land} label={`Nelder-Mead on the ${land} landscape`}>
        <polyline points={trail} fill="none" stroke={INK} strokeWidth="1.2" />
        <polygon points={poly} fill="var(--mantine-color-teal-6)" fillOpacity="0.18" stroke={ACCENT} strokeWidth="1.6" />
        {st.verts.map((v, k) => (
          <g key={k}>
            <Mark at={v} kind={k === 0 ? "square" : "circle"} />
            <text x={sx(v[0]) + 7} y={ry(v[1]) - 5} fontSize="10" fill="var(--mantine-color-text)">{lab[k]}</text>
          </g>
        ))}
      </Plot>
      <Stepper n={res.steps.length} i={i} setI={setI} label="iteration" />
      <Text size="sm" data-opt-nm-move={st.move}>
        <b>{MOVE_WORD[st.move]}</b>. Best vertex b: s = {fmt(st.verts[0]![0], 3)}, r = {fmt(st.verts[0]![1], 3)}, penalised cost {fmt(st.f[0], 4)};
        worst w: {fmt(st.f[2], 4)}. Evaluations so far: {st.evaluations}.
      </Text>
      <Text size="sm" data-opt-nm-final="">
        The run ends after <b>{res.steps.length - 1}</b> iterations and <b>{res.steps[res.steps.length - 1]!.evaluations}</b> evaluations
        with "{res.reason}" at s = <b>{fmt(res.best[0], 3)}</b>, r = <b>{fmt(res.best[1], 3)}</b>, cost + penalty {fmt(res.fBest, 4)}
        (the limit is violated by {fmt(Math.max(0, limit(land, res.best[0], res.best[1])), 5)}; the penalty weight is {NM_PENALTY}, a guess).
        {land === "stepped" ? " On the staircase the simplex can lie on a flat step, where the values agree and the stop test fires." : ""}
      </Text>
      <Cites ids={["parse", "unconstrained", "unconstrainedMsg", "nmReflect", "nmExpand", "nmContract", "nmShrink", "nmClip", "nmTolX", "nmTolF", "nmDefaults"]} />
    </Box>
  );
}

// ---- card 3: SQP --------------------------------------------------------------

function SqpCard(): JSX.Element {
  const [land, setLand] = useState<LandscapeId>("smooth");
  const [i0, setI] = useState(0);
  const [spec, setSpec] = useState(SPEC);
  const res = useMemo(() => runSqp(land), [land]);
  const i = clipI(i0, res.steps.length);
  const st = res.steps[i]!;
  const trail = res.steps.slice(0, i + 1).map((s) => `${sx(s.x[0]).toFixed(1)},${ry(s.x[1]).toFixed(1)}`).join(" ");
  // the tangent line of the limit at the current point: g + gradG . (x' - x) = 0
  const tangent = useMemo(() => {
    const [gs, gr] = st.gradG;
    const pts: string[] = [];
    if (Math.abs(gr) > 1e-12) {
      for (const s of [BOX.sLo, BOX.sHi]) {
        const r = st.x[1] - (st.g + gs * (s - st.x[0])) / gr;
        pts.push(`${sx(s).toFixed(1)},${ry(Math.max(BOX.rLo - 5, Math.min(BOX.rHi + 5, r))).toFixed(1)}`);
      }
    }
    return pts.join(" ");
  }, [st]);
  const shadow = useMemo(() => {
    const a = runSqp("smooth", START, spec);
    const dp = 0.001;
    const up = runSqp("smooth", START, spec + dp), dn = runSqp("smooth", START, spec - dp);
    const ex = smoothOptimum(spec);
    const exUp = smoothOptimum(spec + dp), exDn = smoothOptimum(spec - dp);
    return { a, central: (up.f - dn.f) / (2 * dp), exact: (exUp.f - exDn.f) / (2 * dp), exactF: ex.f };
  }, [spec]);
  const end = res.steps[res.steps.length - 1]!;
  return (
    <Box data-opt-card="sqp" px="sm" py={8} style={{ border: BORDER, borderRadius: 4 }}>
      <OriginMark of="page" note="the engine's SQP structure written again, without Powell's relaxation and the watchdog" />
      <LandPick value={land} onChange={(v) => { setLand(v); setI(0); }} />
      <Plot land={land} label={`SQP on the ${land} landscape`}>
        {/* the tangent is drawn in plot pixels and its ends can lie far outside the axes: clip it to the frame */}
        <clipPath id="sqp-tangent-clip"><rect x={ML} y={MT} width={PW} height={PH} /></clipPath>
        {tangent && <polyline points={tangent} fill="none" stroke={ACCENT} strokeWidth="1.4" strokeDasharray="2 3"
          clipPath="url(#sqp-tangent-clip)" data-sqp-tangent="" />}
        <polyline points={trail} fill="none" stroke={INK} strokeWidth="1.2" />
        {res.steps.slice(0, i + 1).map((s, k) => <Mark key={k} at={s.x} kind={k === i ? "square" : "dot"} />)}
        <line x1={sx(st.x[0])} y1={ry(st.x[1])} x2={sx(st.x[0] + st.d[0])} y2={ry(st.x[1] + st.d[1])}
          stroke={WARN} strokeWidth="2" />
      </Plot>
      <Text size="xs" c="dimmed">
        Dotted line: the straight-line model of the limit at the current point. Orange segment: the step the
        quadratic program proposes (the line search may shorten it).
      </Text>
      <Stepper n={res.steps.length} i={i} setI={setI} label="iteration" />
      <Box data-pan-x="" style={{ overflowX: "auto" }}>
        <Table withTableBorder fz="xs" verticalSpacing={3} data-opt-sqp-table="">
          <Table.Tbody>
            <Table.Tr><Table.Td>point</Table.Td><Table.Td>s = {fmt(st.x[0], 4)}, r = {fmt(st.x[1], 4)}, f = {fmt(st.f, 4)}, g = {st.g.toExponential(2)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>slope of f, by forward differences</Table.Td><Table.Td data-opt-gradf="">df/ds = {fmt(st.gradF[0], 4)}, df/dr = {fmt(st.gradF[1], 4)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>slope of the limit g</Table.Td><Table.Td data-opt-gradg="">dg/ds = {fmt(st.gradG[0], 5)}, dg/dr = {fmt(st.gradG[1], 5)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>QP step</Table.Td><Table.Td>ds = {fmt(st.d[0], 4)}, dr = {fmt(st.d[1], 4)}; line search factor {fmt(st.alpha, 3)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>multiplier of the limit</Table.Td><Table.Td>{fmt(st.lambda, 3)} {st.active ? "(ACTIVE: the limit is tight)" : "(slack)"}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>verdict at this point</Table.Td><Table.Td>{st.note || "step taken"}</Table.Td></Table.Tr>
          </Table.Tbody>
        </Table>
      </Box>
      <Text size="sm" data-opt-sqp-final="">
        Ends after <b>{res.steps.length - 1}</b> iterations and <b>{res.evaluations}</b> evaluations: {res.reason}, at s = <b>{fmt(res.x[0], 4)}</b>,
        r = <b>{fmt(res.x[1], 4)}</b>, f = <b>{fmt(res.f, 4)}</b>, multiplier <b>{fmt(end.lambda, 2)}</b>.
        {land === "stepped"
          ? " The slope in s is zero on the plateau, so s never moved: KKT is satisfied for the function the method measured, and 14 stages is cheaper (see card 1)."
          : ""}
      </Text>
      {land === "smooth" && (
        <Box px="sm" py={6} data-opt-shadow="" style={{ border: BORDER, borderRadius: 4 }}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">the multiplier is a price: move the limit</Text>
          <Text size="xs">purity limit p_spec = <b>{spec.toFixed(3)}</b></Text>
          <Slider min={0.95} max={0.985} step={0.005} value={spec} onChange={setSpec} aria-label="purity limit" />
          <Text size="sm" mt={4}>
            At this limit SQP finds f* = <b>{fmt(shadow.a.f, 4)}</b> (exact {fmt(shadow.exactF, 4)}) with multiplier <b>{fmt(shadow.a.lambda, 2)}</b>.
            Moving the limit by 0.001 each way and re-running gives df*/dp = <b>{fmt(shadow.central, 2)}</b> by SQP and <b>{fmt(shadow.exact, 2)}</b> by the exact
            search: tightening the purity by 0.001 costs about <b>{fmt(shadow.a.lambda * 0.001, 3)}</b>.
          </Text>
        </Box>
      )}
      <Text size="sm">
        The quadratic program of each step is the one of the{" "}
        <Anchor component="button" type="button" onClick={() => setActiveMethodTool("active-set-qp")}>
          active-set QP page
        </Anchor>.
      </Text>
      <Cites ids={["sqpRun", "selfCheck", "fdStep", "bfgsInit", "qp", "box", "merit", "armijo", "damped", "multipliers"]} />
    </Box>
  );
}

// ---- card 4: MADS --------------------------------------------------------------

const POLL_MARK: Record<string, "triangle" | "diamond" | "circle" | "cross" | "dot"> = {
  dominates: "triangle", improves: "diamond", "no gain": "circle", "above the barrier": "cross",
  "outside the box": "dot", "on the centre": "dot",
};

function seedSummary(land: LandscapeId): {
  fBest: number; fMedian: number; fWorst: number; evalMedian: number; on14: number; runs: number;
} {
  const runs: MadsResult[] = [];
  for (let seed = 1; seed <= 20; ++seed) runs.push(runMads(land, START, seed));
  const f = runs.map((r) => r.f).sort((a, b) => a - b);
  const ev = runs.map((r) => r.evaluations).sort((a, b) => a - b);
  return {
    fBest: f[0]!, fMedian: 0.5 * (f[9]! + f[10]!), fWorst: f[19]!, evalMedian: 0.5 * (ev[9]! + ev[10]!),
    on14: runs.filter((r) => Math.round(r.best[0]) === 14).length, runs: runs.length,
  };
}

function MadsCard(): JSX.Element {
  const [land, setLand] = useState<LandscapeId>("stepped");
  const [seed, setSeed] = useState(2);
  const [i0, setI] = useState(0);
  const res = useMemo(() => runMads(land, START, seed), [land, seed]);
  const sums = useMemo(() => ({ smooth: seedSummary("smooth"), stepped: seedSummary("stepped") }), []);
  const i = clipI(i0, res.steps.length);
  const st = res.steps[i]!;
  const so = useMemo(() => smoothOptimum(), []);
  const enumerated = useMemo(() => enumerateStages(), []);
  const kinds = ["dominates", "improves", "no gain", "above the barrier", "outside the box"] as const;
  return (
    <Box data-opt-card="mads" px="sm" py={8} style={{ border: BORDER, borderRadius: 4 }}>
      <OriginMark of={["page", "reference"]} note="written from the papers named in the references; the engine's MADS is cited below and differs in the ways listed" />
      <LandPick value={land} onChange={(v) => { setLand(v); setI(0); }} />
      <Plot land={land} label={`MADS on the ${land} landscape`}>
        {land === "stepped" && [8, 9, 10, 11, 12, 13, 14].map((s) => (
          <line key={s} x1={sx(s)} x2={sx(s)} y1={MT} y2={MT + PH} stroke={INK} strokeWidth="0.6" strokeDasharray="1 4" />
        ))}
        <polyline fill="none" stroke={INK} strokeWidth="1"
          points={res.steps.slice(0, i + 1).map((s) => `${sx(s.centre[0]).toFixed(1)},${ry(s.centre[1]).toFixed(1)}`).join(" ")} />
        {st.poll.filter((p) => p.status !== "outside the box").map((p, k) => <Mark key={k} at={p.x} kind={POLL_MARK[p.status] ?? "circle"} />)}
        <Mark at={st.centre} kind="hollowSquare" big />
        {st.incumbentF && <Mark at={st.incumbentF.x} kind="square" big />}
        {land === "smooth" && <Mark at={[so.s, so.r]} kind="dot" />}
      </Plot>
      <Group gap="md" data-opt-mads-legend="">
        <Text size="xs">triangle: dominates the incumbent</Text>
        <Text size="xs">diamond: improves the violation only</Text>
        <Text size="xs">circle: no gain</Text>
        <Text size="xs">cross: above the barrier</Text>
        <Text size="xs">hollow square: poll centre; filled square: feasible incumbent</Text>
      </Group>
      <Group gap="md" align="center">
        <Text size="xs">random seed <b>{seed}</b></Text>
        <Slider w={160} min={1} max={20} step={1} value={seed} onChange={(v) => { setSeed(v); setI(0); }} aria-label="random seed of the poll directions" />
      </Group>
      <Stepper n={res.steps.length} i={i} setI={setI} label="iteration" />
      <Text size="sm" data-opt-mads-iter="">
        Iteration {st.it}: mesh level l = {st.level} (poll size {st.pollSize.toFixed(4)}, mesh size {st.meshSize.toExponential(2)}); poll centre
        s = {fmt(st.centre[0], 3)}, r = {fmt(st.centre[1], 3)} ({st.centreFeasible ? "feasible" : "infeasible"}); outcome <b>{st.outcome}</b>
        {st.outcome === "success" ? " (the mesh coarsens)" : st.outcome === "failure" ? " (the mesh refines)" : " (the barrier closes, the mesh stays)"};
        barrier threshold h_max = {Number.isFinite(st.hMax) ? st.hMax.toExponential(2) : "none yet"}; evaluations so far {st.evaluations}.
      </Text>
      <Box data-pan-x="" style={{ overflowX: "auto" }}>
        <Table withTableBorder fz="xs" verticalSpacing={3} data-opt-mads-poll="">
          <Table.Thead><Table.Tr><Table.Th>poll point (s, r)</Table.Th><Table.Th>cost</Table.Th><Table.Th>g</Table.Th><Table.Th>what it did</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {st.poll.map((p, k) => (
              <Table.Tr key={k}>
                <Table.Td>{fmt(p.x[0], 2)}, {fmt(p.x[1], 3)}</Table.Td><Table.Td>{fmt(p.f, 3)}</Table.Td>
                <Table.Td>{p.g === null ? "n/a" : p.g.toExponential(1)}</Table.Td><Table.Td>{p.status}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      <Text size="xs" c="dimmed">
        Mark vocabulary: {kinds.join(", ")}. {land === "stepped" ? "Dotted vertical lines are the whole-stage mesh of s: no poll step in s is finer than one stage." : "On the smooth landscape the stage count is real, so the mesh is the same in both variables."}
      </Text>
      <Text size="sm" data-opt-mads-final="">
        This seed ends after <b>{res.steps.length}</b> iterations and <b>{res.evaluations}</b> evaluations at s = <b>{fmt(res.best[0], 3)}</b>,
        r = <b>{fmt(res.best[1], 3)}</b>, f = <b>{fmt(res.f, 4)}</b> ({res.feasible ? "feasible" : "infeasible"}): {res.reason}.
      </Text>
      <Box data-pan-x="" style={{ overflowX: "auto" }} data-opt-mads-seeds="">
        <Title order={6}>twenty seeds, same start</Title>
        <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={3}>
          <Table.Thead><Table.Tr><Table.Th>landscape</Table.Th><Table.Th>best f</Table.Th><Table.Th>median f</Table.Th><Table.Th>worst f</Table.Th><Table.Th>median evaluations</Table.Th><Table.Th>runs ending on 14 stages</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {(["smooth", "stepped"] as const).map((l) => (
              <Table.Tr key={l}>
                <Table.Td>{l}</Table.Td><Table.Td>{fmt(sums[l].fBest, 4)}</Table.Td><Table.Td>{fmt(sums[l].fMedian, 4)}</Table.Td>
                <Table.Td>{fmt(sums[l].fWorst, 4)}</Table.Td><Table.Td>{sums[l].evalMedian}</Table.Td>
                <Table.Td>{sums[l].on14} of {sums[l].runs}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed">
          Exact optima for comparison: smooth {fmt(so.f, 4)}; stepped {fmt(enumerated.find((e) => e.s === 14)!.f, 4)} at 14 stages and {fmt(enumerated.find((e) => e.s === 13)!.f, 4)} at 13. MADS is a local
          method with random directions: the same start gives different ends.
        </Text>
      </Box>
      <Box px="sm" py={6} style={{ border: BORDER, borderRadius: 4 }} data-opt-mads-simplifications="">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">what this page simplified</Text>
        {MADS_SIMPLIFICATIONS.map((s, k) => <Text size="xs" key={k}>{k + 1}. {s}</Text>)}
        <Text size="xs" mt={4} data-opt-mads-engine="">
          The engine's own MADS differs from this page's in its poll directions, its projection onto the box and its barrier update; the lines it is cited at are listed below.
        </Text>
      </Box>
      <Cites ids={["parseMads", "madsRun", "madsCheck", "madsDelta", "madsDirections", "madsProject", "madsBarrier", "optim07"]} />
    </Box>
  );
}

// ---- card 5: a real run ---------------------------------------------------------

function RunCard(): JSX.Element {
  const rows = SHADOW_CHECK.rows;
  const central = (rows[3]![1] - rows[1]![1]) / (rows[3]![0] - rows[1]![0]);
  return (
    <Box data-opt-card="run" px="sm" py={8} style={{ border: BORDER, borderRadius: 4 }}>
      <OriginMark of="engine" note="recorded native run of optim06_integer_stages, 2026-11-24; the lesson test re-reads the run's outputs" />
      <Box data-pan-x="" style={{ overflowX: "auto" }}>
        <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={3} data-opt-run-table="">
          <Table.Thead><Table.Tr><Table.Th>stages</Table.Th><Table.Th>verdict</Table.Th><Table.Th>V_strip (kmol/s)</Table.Th><Table.Th>R</Table.Th><Table.Th>multiplier of x_D_LK &gt;= 0.98</Table.Th><Table.Th>reading</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {RUN_ROWS.map((r) => (
              <Table.Tr key={r.n} data-opt-run-row={r.n}>
                <Table.Td>{r.n}</Table.Td><Table.Td>{r.verdict}</Table.Td>
                <Table.Td>{r.v === null ? "none" : r.v}</Table.Td>
                <Table.Td>{r.r === null ? "none" : r.r}</Table.Td>
                <Table.Td>{r.lambda === null ? "not meaningful" : r.lambda}</Table.Td>
                <Table.Td>{r.why}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      <Text size="xs" c="dimmed">
        The best row (14 stages) is the case's golden: V_strip 0.03479, R 2.8994, x_D_LK 0.979999; 7 values tried, 3 converged and feasible.
      </Text>
      <Box px="sm" py={6} style={{ border: BORDER, borderRadius: 4 }} data-opt-shadow-check="">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">the multiplier checked against the engine</Text>
        <OriginMark of="engine" note="recorded by hand on 2026-11-24: optim06 cut to 13 and 14 stages in a scratch copy, the limit moved" />
        <Box data-pan-x="" style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={3}>
            <Table.Thead><Table.Tr><Table.Th>limit on x_D_LK</Table.Th><Table.Th>V_strip at 14 stages (kmol/s)</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{rows.map((r) => <Table.Tr key={r[0]}><Table.Td>{r[0]}</Table.Td><Table.Td>{r[1]}</Table.Td></Table.Tr>)}</Table.Tbody>
          </Table>
        </Box>
        <Text size="sm" mt={4}>
          The slope across 0.9795 to 0.9805 is <b>{central.toFixed(4)}</b> kmol/s per unit of purity; the multiplier the run printed is
          <b> {SHADOW_CHECK.lambdaPrinted}</b>. Relaxing the limit by 0.001 (0.98 to 0.979) saved <b>{(rows[2]![1] - rows[0]![1]).toFixed(7)}</b> kmol/s,
          the multiplier predicted <b>{(SHADOW_CHECK.lambdaPrinted * 0.001).toFixed(7)}</b>: the same, to the curvature of the price.
        </Text>
      </Box>
      <Cites ids={["enumeration", "integer", "multipliers"]} />
    </Box>
  );
}

// ---- card 6: which one -----------------------------------------------------------

function DecisionCard(): JSX.Element {
  const mk = useMemo(() => runMcKinnon(), []);
  const score = useMemo(() => scorecard(), []);
  const first = mk.steps.slice(0, 7);
  const diam = (s: typeof mk.steps[number]): number => {
    let d = 0;
    for (const v of s.verts) d = Math.max(d, Math.hypot(v[0] - s.verts[0]![0], v[1] - s.verts[0]![1]));
    return d;
  };
  return (
    <Box data-opt-card="decision" px="sm" py={8} style={{ border: BORDER, borderRadius: 4 }}>
      <OriginMark of={["page", "reference"]} note="a reading of the three methods; McKinnon's function from his paper, run with the engine's rules" />
      <Stack gap={6} data-opt-decision="">
        {DECISION_ROWS.map((r) => (
          <Box key={r.id} px="sm" py={6} data-opt-decision-row={r.id} style={{ border: BORDER, borderRadius: 4 }}>
            <Text size="sm" fw={700}>{r.problem}</Text>
            <Text size="xs"><b>Use:</b> {r.method}.</Text>
            <Text size="xs"><b>You get:</b> {r.gives}</Text>
            <Text size="xs"><b>Check:</b> {r.check}</Text>
          </Box>
        ))}
      </Stack>
      <Box mt={8} data-opt-nfl="">
        <Title order={6}>No free lunch, on the page's own two landscapes</Title>
        <OriginMark of={["page", "reference"]} note="the theorem is Wolpert and Macready's; the table is this page's runs from the one start" />
        <Text size="xs" c="dimmed">
          Gap = final cost above the exact optimum ({fmt(score.best.smooth, 4)} smooth; {fmt(score.best.stepped, 4)} stepped, the best whole
          stage count), and the evaluations used. Read down a column for who is exact and cheap on a class, and across a row for what the same method pays on the other. Nelder-Mead does well on both toys:
          two variables and a penalty weight that happens to suit; that is a property of the toys, not a ranking.
        </Text>
        <Box data-pan-x="" style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={3}>
            <Table.Thead><Table.Tr><Table.Th>method</Table.Th><Table.Th>smooth: gap</Table.Th><Table.Th>smooth: evaluations</Table.Th><Table.Th>stepped: gap</Table.Th><Table.Th>stepped: evaluations</Table.Th><Table.Th>notes</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {score.rows.map((r) => (
                <Table.Tr key={r.method} data-opt-nfl-row={r.method}>
                  <Table.Td>{r.method}</Table.Td>
                  <Table.Td>{r.smooth.gap.toExponential(2)}</Table.Td><Table.Td>{r.smooth.evaluations}</Table.Td>
                  <Table.Td>{r.stepped.gap.toExponential(2)}</Table.Td><Table.Td>{r.stepped.evaluations}</Table.Td>
                  <Table.Td>smooth: {r.smooth.note}; stepped: {r.stepped.note}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
        <Text size="sm">
          The theorem says that over ALL possible functions, equally weighted, no algorithm beats another. It does not say your problem is
          one of them: the smooth landscape is the class SQP exploits, and the stepped one, where its slope is blind, is the class a
          method that polls (MADS) or enumerates the integer is built for. The engineer's job is to know the class.
        </Text>
      </Box>
      <Box mt={8} data-opt-mckinnon="">
        <Title order={6}>McKinnon's example, run with the engine's Nelder-Mead rules</Title>
        <Text size="sm">
          Starting simplex (0, 0), (1, 1), ((1 + sqrt 33)/8, (1 - sqrt 33)/8); standard coefficients. Every move is a contraction,
          the best vertex stays at the origin and the simplex shrinks. After <b>{mk.steps.length - 1}</b> iterations the rule says
          "{mk.reason}" and converged, at ({fmt(mk.best[0], 3)}, {fmt(mk.best[1], 3)}) with f = {fmt(mk.fBest, 3)}.
          The slope of f in y at that point is 1, not 0, and f(0, -0.5) = {fmt(-0.25, 2)} is lower.
        </Text>
        <Box data-pan-x="" style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={3}>
            <Table.Thead><Table.Tr><Table.Th>iteration</Table.Th><Table.Th>move</Table.Th><Table.Th>best f</Table.Th><Table.Th>simplex size</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {first.map((s) => (
                <Table.Tr key={s.it}><Table.Td>{s.it}</Table.Td><Table.Td>{s.move}</Table.Td><Table.Td>{fmt(s.f[0], 4)}</Table.Td><Table.Td>{diam(s).toExponential(2)}</Table.Td></Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      </Box>
      <Cites ids={["parse", "parseSqp", "parseMads", "integer", "nmTolX", "nmTolF", "audit", "closure", "closureMsg"]} />
    </Box>
  );
}

// ---- the tool ----------------------------------------------------------------------

export function OptimizersTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Three ways to optimise a flowsheet</Title>
          <Text size="sm" c="dimmed" mt={4}>
            I have a flowsheet and a target: which optimiser can I trust, and how do I read what it tells me? Nelder-Mead,
            SQP and MADS stepped on two toy landscapes, then a real run of the shipped integer-stages case.
          </Text>
        </Box>
        {step(1)}
        <LandscapeCard />
        {step(2)}
        <NelderMeadCard />
        {step(3)}
        <SqpCard />
        {step(4)}
        <MadsCard />
        {step(5)}
        <RunCard />
        {step(6)}
        <DecisionCard />
        <BayesOptCard inTool />
        <LessonLimits limits={OPT_LIMITS_ALL} />
        <LessonQuiz title="Check your understanding" questions={OPT_QUIZ_ALL} lesson={OPT_STEPS_ALL} />
        <Text size="sm">
          Related:{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("active-set-qp")}>
            Quadratic programming with constraints
          </Anchor>{" "}(the inner problem of every SQP step) and{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("least-squares")}>
            Least squares
          </Anchor>.
        </Text>
        <LessonReferences tool="optimizers" />
      </Stack>
    </Box>
  );
}

export default OptimizersTool;
