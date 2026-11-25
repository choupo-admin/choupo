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
  InteriorPointTool -- "How does an interior-point method find the minimum?".

  A NOTES page with stepping controls, for a student with weak algebra: every
  card is a picture and one plain sentence first, then at most one glossed
  formula, then the engine file:line, then ONE question the picture answers.
  The task it serves, in one sentence: a student who meets `model interiorPoint;`
  or an `ipLog.csv` sees what the method does each iteration.

  Everything drawn is a RECORDED engine run (gui/src/case/interiorPointRecorded.json,
  written by bin/curate/interior_point_edutool_table.py); the page's own
  arithmetic is the level curves of HS21's formula, the distance of each iterate
  from its wall, the position of a filter corner and a maximum, each said where
  it is drawn.  Every fact is in interiorPointLesson.ts; this file only draws.

  ACCESSIBILITY.  A mark is a SHAPE and a WORD in the table, never a colour
  alone: circle = the step improved the height (type phi), square = it joined
  the list (type theta), triangle = it left restoration.
\*---------------------------------------------------------------------------*/

import { useState } from "react";

import { Anchor, Badge, Box, Button, Code, Group, SegmentedControl, Stack, Table, Text, Title } from "@mantine/core";

import {
  GAMMA, GIBBS, HS116, HS21, HS38, HS6, HS7, IP_ASKS, IP_LIMITS, IPM_QUIZ, IPM_STEPS, R1_ROWS, WB2000,
  attemptRows, corner, iterates, largestDw, lastPush, r1Case, r1Summary, sci, wallDistances,
  type IPRun,
} from "./interiorPointLesson.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";

const step = lessonStepper(IPM_STEPS);
const BORDER = "1px solid var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const ACCENT = "var(--mantine-color-teal-6)";
const WARN = "var(--mantine-color-orange-6)";

function Grid({ head, rows, id, hi }: { head: readonly string[]; rows: readonly (readonly string[])[]; id: string; hi?: number }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ overflowX: "auto" }} data-ip-table={id}>
      <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={3}>
        <Table.Thead>
          <Table.Tr>{head.map((h) => <Table.Th key={h}>{h}</Table.Th>)}</Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => (
            <Table.Tr key={i} style={i === hi ? { background: "var(--mantine-color-teal-light)" } : undefined}>
              {r.map((c, j) => <Table.Td key={j}>{c}</Table.Td>)}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

function Ask({ n }: { n: number }): JSX.Element {
  return (
    <Box px="sm" py={6} data-ip-ask={n} style={{ border: BORDER, borderRadius: 4, borderLeft: `4px solid ${ACCENT}` }}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">look at the picture and answer</Text>
      <Text size="sm">{IP_ASKS[n]}</Text>
    </Box>
  );
}

function Stepper({ k, setK, max, label }: { k: number; setK: (n: number) => void; max: number; label: string }): JSX.Element {
  return (
    <Group gap={6} data-ip-stepper="">
      <Button size="compact-xs" variant="default" disabled={k <= 0} onClick={() => setK(k - 1)}>previous</Button>
      <Button size="compact-xs" variant="default" disabled={k >= max} onClick={() => setK(k + 1)}>next</Button>
      <Button size="compact-xs" variant="subtle" onClick={() => setK(max)}>show all</Button>
      <Text size="xs">{label} {k} of {max}</Text>
    </Group>
  );
}

// ---- card 1: the cushion ----------------------------------------------------

const PW = 440, PH = 400, PM = 36;
const X1: [number, number] = [1.9, 2.9], X2: [number, number] = [-1.15, 0.15];
const px = (x1: number): number => PM + ((x1 - X1[0]) / (X1[1] - X1[0])) * (PW - 2 * PM);
const py = (x2: number): number => PH - PM - ((x2 - X2[0]) / (X2[1] - X2[0])) * (PH - 2 * PM);
const LEVELS = [0.1, 0.3, 0.6, 1.1];   // f + 100 = 0.01 x1^2 + x2^2

function levelPath(L: number, sign: 1 | -1): string {
  const pts: string[] = [];
  for (let i = 0; i <= 80; i += 1) {
    const x1 = X1[0] + ((X1[1] - X1[0]) * i) / 80;
    const r = L - 0.01 * x1 * x1;
    if (r < 0) continue;
    pts.push(`${pts.length === 0 ? "M" : "L"}${px(x1).toFixed(1)},${py(sign * Math.sqrt(r)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function PathPlot({ k }: { k: number }): JSX.Element {
  const pts = iterates(HS21);
  const wall = HS21.activeBound?.at ?? 2;
  return (
    <Box data-pan-x="" style={{ overflowX: "auto" }} data-ip-path="">
      <svg viewBox={`0 0 ${PW} ${PH}`} width="100%" style={{ maxWidth: PW, display: "block" }} role="img"
        aria-label="HS21: the level curves of the height, the wall at x1 equal to 2, and the iterates of the run">
        <defs>
          <clipPath id="ip-clip"><rect x={PM} y={PM / 2} width={PW - 2 * PM} height={PH - 1.5 * PM} /></clipPath>
          <pattern id="ip-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={INK} strokeWidth="1" opacity="0.55" />
          </pattern>
        </defs>
        <g clipPath="url(#ip-clip)">
          {LEVELS.map((L) => (
            <g key={L}>
              <path d={levelPath(L, 1)} fill="none" stroke={INK} strokeWidth="1" opacity="0.7" />
              <path d={levelPath(L, -1)} fill="none" stroke={INK} strokeWidth="1" opacity="0.7" />
            </g>
          ))}
          <rect x={PM} y={PM / 2} width={px(wall) - PM} height={PH - 1.5 * PM} fill="url(#ip-hatch)" />
          <line x1={px(wall)} x2={px(wall)} y1={PM / 2} y2={PH - PM} stroke={TEXT} strokeWidth="2" strokeDasharray="6 4" />
          <polyline fill="none" stroke={ACCENT} strokeWidth="1.5"
            points={pts.slice(0, k + 1).map((p) => `${px(p[0] ?? 0).toFixed(1)},${py(p[1] ?? 0).toFixed(1)}`).join(" ")} />
          {pts.slice(0, k + 1).map((p, i) => (
            <g key={i}>
              <circle cx={px(p[0] ?? 0)} cy={py(p[1] ?? 0)} r={i === k ? 5.5 : 3.5}
                fill={i === k ? ACCENT : "var(--mantine-color-body)"} stroke={TEXT} strokeWidth="1.2" />
              <text x={px(p[0] ?? 0) + 7} y={py(p[1] ?? 0) - 6} fontSize="10" fill={TEXT}>{i}</text>
            </g>
          ))}
        </g>
        <rect x={PM} y={PM / 2} width={PW - 2 * PM} height={PH - 1.5 * PM} fill="none" stroke={INK} />
        {[2, 2.25, 2.5, 2.75].map((v) => (
          <text key={v} x={px(v)} y={PH - PM + 14} fontSize="10" textAnchor="middle" fill={INK}>{v}</text>
        ))}
        {[-1, -0.5, 0].map((v) => (
          <text key={v} x={PM - 4} y={py(v) + 3} fontSize="10" textAnchor="end" fill={INK}>{v}</text>
        ))}
        <text x={PW / 2} y={PH - 6} fontSize="11" textAnchor="middle" fill={INK}>x1 (the wall is the dashed line; the hatched side is not allowed)</text>
        <text x={10} y={PH / 2} fontSize="11" textAnchor="middle" fill={INK} transform={`rotate(-90 10 ${PH / 2})`}>x2</text>
      </svg>
    </Box>
  );
}

function logY(v: number): number { return Math.log10(Math.max(v, 1e-12)); }

/** Two series against the iteration number on a log axis: distance and mu. */
function CushionChart({ k }: { k: number }): JSX.Element {
  const W = 440, H = 210, ML = 40, MT = 10, MB = 28, MR = 66;
  const n = HS21.rows.length;                       // iterations 0..n; the last iterate ends the run
  const d = wallDistances(HS21);
  const mu = [...HS21.rows.map((r) => r.mu), HS21.rows[n - 1]?.mu ?? 0];
  const lo = -9, hi = 0;
  const X = (i: number): number => ML + (i / n) * (W - ML - MR);
  const Y = (v: number): number => MT + (1 - (logY(v) - lo) / (hi - lo)) * (H - MT - MB);
  const upto = (a: number[]): number[] => a.slice(0, k + 1);
  const line = (a: number[]): string => upto(a).map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  return (
    <Box data-pan-x="" style={{ overflowX: "auto" }} data-ip-cushion="">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block" }} role="img"
        aria-label="distance to the wall and the cushion strength against the iteration, on a log axis">
        <rect x={ML} y={MT} width={W - ML - MR} height={H - MT - MB} fill="none" stroke={INK} />
        {[-8, -6, -4, -2, 0].map((e) => (
          <g key={e}>
            <line x1={ML} x2={W - MR} y1={MT + (1 - (e - lo) / (hi - lo)) * (H - MT - MB)} y2={MT + (1 - (e - lo) / (hi - lo)) * (H - MT - MB)} stroke={INK} opacity="0.2" />
            <text x={ML - 4} y={MT + (1 - (e - lo) / (hi - lo)) * (H - MT - MB) + 3} fontSize="10" textAnchor="end" fill={INK}>1e{e}</text>
          </g>
        ))}
        {Array.from({ length: n + 1 }, (_, i) => (
          <text key={i} x={X(i)} y={H - 12} fontSize="10" textAnchor="middle" fill={INK}>{i}</text>
        ))}
        <text x={ML + (W - ML - MR) / 2} y={H - 1} fontSize="11" textAnchor="middle" fill={INK}>iteration</text>
        <polyline fill="none" stroke={ACCENT} strokeWidth="1.6" points={line(d)} />
        <polyline fill="none" stroke={WARN} strokeWidth="1.6" strokeDasharray="5 3" points={line(mu)} />
        {upto(d).map((v, i) => <circle key={`d${i}`} cx={X(i)} cy={Y(v)} r="3.2" fill={ACCENT} stroke={TEXT} />)}
        {upto(mu).map((v, i) => <rect key={`m${i}`} x={X(i) - 3} y={Y(v) - 3} width="6" height="6" fill="var(--mantine-color-body)" stroke={TEXT} />)}
        <text x={W - MR + 4} y={Y(d[n] ?? 1e-8) - 2} fontSize="10" fill={TEXT}>distance (circles)</text>
        <text x={W - MR + 4} y={Y(mu[n] ?? 1e-8) + 12} fontSize="10" fill={TEXT}>cushion (squares)</text>
      </svg>
    </Box>
  );
}

function CushionCard(): JSX.Element {
  const n = HS21.rows.length;
  const [k, setK] = useState(n);
  const pts = iterates(HS21), d = wallDistances(HS21);
  const rows = pts.map((p, i) => {
    const mu = HS21.rows[Math.min(i, n - 1)]?.mu ?? 0;
    return [String(i), sci(mu), (p[0] ?? 0).toPrecision(6), (p[1] ?? 0).toPrecision(3), sci(d[i] ?? 0)];
  });
  return (
    <Stack gap={8} data-ip-card="cushion">
      <OriginMark of={["engine", "page"]}
        note="recorded run of HS21 (test/interior_point_hs.cpp --iterates); the level curves and the distance x1 minus 2 are the page's arithmetic" />
      <Stepper k={k} setK={setK} max={n} label="iterate" />
      <Group align="flex-start" gap="md" grow>
        <PathPlot k={k} />
        <CushionChart k={k} />
      </Group>
      <Grid id="cushion" head={["iterate", "cushion strength μ", "x1", "x2", "distance to the wall (x1 − 2)"]} rows={rows} hi={k} />
      <Text size="xs" c="dimmed">
        The last iterate is the end of the run and takes its μ from the last round's. The engine prints the wall's push as z = {HS21.activeBound?.z};
        the cushion's strength divided by the distance at the end is {lastPush(HS21).toPrecision(3)} (the page's arithmetic).
        The early steps are long and land further from the wall than the start (iterate 2 is at 0.72); only as the cushion
        deflates does the run settle against it. The problem is HS21: minimise 0.01·x1² + x2² − 100 with x1 at least 2 and 10·x1 − x2 at least 10; the second rule
        is far from the iterates here, so only the wall matters.
      </Text>
      <Ask n={1} />
    </Stack>
  );
}

// ---- card 2: the list of not-worse-than ----------------------------------------

const FW = 460, FH = 340, FL = 44, FR = 14, FT = 12, FB = 40;
const TH: [number, number] = [-8.5, 1.2], PHI: [number, number] = [-3.2, 6];
const fx = (t: number): number => FL + ((Math.log10(Math.max(t, 1e-12)) - TH[0]) / (TH[1] - TH[0])) * (FW - FL - FR);
const fy = (p: number): number => FT + (1 - (p - PHI[0]) / (PHI[1] - PHI[0])) * (FH - FT - FB);

const TYPE_WORD: Record<string, string> = {
  phi: "improved the height", theta: "joined the list", resto: "left restoration",
};

function FilterPlot({ k }: { k: number }): JSX.Element {
  const rows = WB2000.rows;
  const cur = rows[k];
  const alive = rows.slice(0, k + 1).filter((r) => r.type === "theta" && r.mu === cur?.mu);
  return (
    <Box data-pan-x="" style={{ overflowX: "auto" }} data-ip-filter="">
      <svg viewBox={`0 0 ${FW} ${FH}`} width="100%" style={{ maxWidth: FW, display: "block" }} role="img"
        aria-label="WB2000: each iterate by how much it breaks the rules (log axis) and its cushioned height, with the corners of the list">
        <rect x={FL} y={FT} width={FW - FL - FR} height={FH - FT - FB} fill="none" stroke={INK} />
        {alive.map((r) => {
          const [ct, cp] = corner(r.theta, r.phi);
          return (
            <rect key={`c${r.it}`} x={fx(ct)} y={fy(PHI[1])} width={Math.max(0, FW - FR - fx(ct))} height={Math.max(0, fy(cp) - fy(PHI[1]))}
              fill={INK} fillOpacity={0.12} stroke="none" />
          );
        })}
        {alive.map((r) => {
          const [ct, cp] = corner(r.theta, r.phi);
          return <path key={`l${r.it}`} d={`M${fx(ct)},${fy(PHI[1])}L${fx(ct)},${fy(cp)}L${FW - FR},${fy(cp)}`} fill="none" stroke={TEXT} strokeWidth="1" strokeDasharray="3 2" />;
        })}
        <polyline fill="none" stroke={INK} strokeWidth="1"
          points={rows.slice(0, k + 1).map((r) => `${fx(r.theta).toFixed(1)},${fy(r.phi).toFixed(1)}`).join(" ")} />
        {rows.slice(0, k + 1).map((r) => {
          const x = fx(r.theta), y = fy(r.phi), a = r.it === k ? 6 : 4.5;
          const mark = r.type === "theta"
            ? <rect x={x - a} y={y - a} width={2 * a} height={2 * a} fill={ACCENT} stroke={TEXT} strokeWidth="1.2" />
            : r.type === "resto"
              ? <polygon points={`${x},${y - a - 1} ${x - a - 1},${y + a} ${x + a + 1},${y + a}`} fill={WARN} stroke={TEXT} strokeWidth="1.2" />
              : <circle cx={x} cy={y} r={a} fill="var(--mantine-color-body)" stroke={TEXT} strokeWidth="1.2" />;
          return (
            <g key={r.it}>
              {mark}
              <text x={x + 8} y={y - 6} fontSize="10" fill={TEXT}>{r.it}</text>
            </g>
          );
        })}
        {[-8, -6, -4, -2, 0].map((e) => (
          <text key={e} x={FL + ((e - TH[0]) / (TH[1] - TH[0])) * (FW - FL - FR)} y={FH - FB + 14} fontSize="10" textAnchor="middle" fill={INK}>1e{e}</text>
        ))}
        {[-2, 0, 2, 4, 6].map((v) => (
          <text key={v} x={FL - 4} y={fy(v) + 3} fontSize="10" textAnchor="end" fill={INK}>{v}</text>
        ))}
        <text x={FL + (FW - FL - FR) / 2} y={FH - 6} fontSize="11" textAnchor="middle" fill={INK}>how much the rules are broken (log axis; left is better)</text>
        <text x={10} y={FH / 2} fontSize="11" textAnchor="middle" fill={INK} transform={`rotate(-90 10 ${FH / 2})`}>cushioned height (down is better)</text>
      </svg>
    </Box>
  );
}

function FilterCard(): JSX.Element {
  const n = WB2000.rows.length - 1;
  const [k, setK] = useState(n);
  const rows = WB2000.rows.map((r) => {
    const notes = r.events.filter((e) => e.kind !== "attempt").map((e) => e.text ?? "").join("; ");
    return [String(r.it), sci(r.theta), r.phi.toFixed(3), String(r.ls), TYPE_WORD[r.type] ?? r.type, String(r.filter),
      notes.length > 70 ? notes.slice(0, 68) + "…" : notes];
  });
  return (
    <Stack gap={8} data-ip-card="filter">
      <OriginMark of={["engine", "page"]}
        note="recorded run of WB2000 (a three-variable problem of the collection that needs restoration); a corner's position is the page's arithmetic on the row" />
      <Stepper k={k} setK={setK} max={n} label="iteration" />
      <FilterPlot k={k} />
      <Text size="xs" c="dimmed">
        Circle: the step improved the height (the list is unchanged). Square: it improved only one measure, so the point joined the
        list as a corner (drawn by the page as the point moved by {GAMMA} of its rule-breaking, with the not-allowed quarter shaded).
        Triangle: the iteration that left restoration. The list is wiped whenever the cushion deflates, so only the corners of the
        current cushion are drawn.
      </Text>
      <Grid id="filter" head={["iteration", "rules broken", "height", "trials", "what the step did", "list size", "events"]} rows={rows} hi={k} />
      <Ask n={2} />
    </Stack>
  );
}

// ---- card 3: bowl or saddle ----------------------------------------------------

function Landscapes(): JSX.Element {
  const bowl = Array.from({ length: 41 }, (_, i) => { const x = -1 + i / 20; return `${60 + 50 * x},${90 - 55 * x * x}`; }).join(" ");
  const saddle = Array.from({ length: 41 }, (_, i) => { const x = -1 + i / 20; return `${260 + 50 * x},${40 + 55 * x * x}`; }).join(" ");
  return (
    <Box data-pan-x="" style={{ overflowX: "auto" }} data-ip-landscapes="">
      <svg viewBox="0 0 380 130" width="100%" style={{ maxWidth: 380, display: "block" }} role="img"
        aria-label="a cross-section of a bowl, the ground curving up on both sides, and of a hilltop, the ground curving down">
        <polyline fill="none" stroke={TEXT} strokeWidth="2" points={bowl} />
        <circle cx="60" cy="90" r="4.5" fill={ACCENT} stroke={TEXT} />
        <text x="60" y="115" fontSize="11" textAnchor="middle" fill={TEXT}>a bowl: the bottom is a good step</text>
        <polyline fill="none" stroke={TEXT} strokeWidth="2" strokeDasharray="6 4" points={saddle} />
        <circle cx="260" cy="40" r="4.5" fill={WARN} stroke={TEXT} />
        <text x="260" y="115" fontSize="11" textAnchor="middle" fill={TEXT}>one direction curves down: a trap</text>
      </svg>
    </Box>
  );
}

const word = (t: readonly number[] | undefined): string =>
  t ? `${t[0]} up, ${t[1]} down, ${t[2]} flat` : "";

function LadderCard(): JSX.Element {
  const runs: Record<string, IPRun> = { HS6, HS7, HS38, WB2000 };
  const [name, setName] = useState("HS6");
  const run = runs[name] as IPRun;
  const rows = attemptRows(run).slice(0, 14);
  const first = run.rows.find((r) => r.events.some((e) => e.kind === "attempt"));
  const want = first?.events.find((e) => e.kind === "attempt")?.wanted;
  return (
    <Stack gap={8} data-ip-card="ladder">
      <OriginMark of="engine" note="recorded runs; each failed try is an event line of the engine's own trace (InertiaCorrection.cpp:88)" />
      <Landscapes />
      <SegmentedControl size="xs" value={name} onChange={setName} data={["HS6", "HS7", "HS38", "WB2000"]} aria-label="which recorded run" />
      <Text size="sm" data-ip-ladder-summary="">
        {name}: {run.iterations} iterations; the stiffness was needed in {run.inertiaCorrections} of them; the largest stiffness
        any iteration settled on was {sci(largestDw(run))}. The run wants {word(want)}.
      </Text>
      <Grid id="ladder" head={["iteration", "stiffness tried → what the ground counted as (failed tries)", "stiffness used"]}
        rows={rows.map((r) => [String(r.it),
          r.attempts.map((a) => `${sci(a.dw ?? 0)} → ${word(a.got)}`).join(";  "), sci(r.settled)])} />
      {attemptRows(run).length > rows.length && (
        <Text size="xs" c="dimmed">The first {rows.length} of {attemptRows(run).length} iterations that needed stiffness are shown.</Text>
      )}
      <Text size="xs" c="dimmed">
        For a problem with rules, the right count is one direction up for each unknown, one down for each rule, and none flat.
        A flat direction (a zero) is a ground that is level in some direction, and counts as wrong too.
        The matrix count behind this is explained in{" "}
        <Anchor component="button" type="button" onClick={() => setActiveMethodTool("linear-algebra-without-pain")}>
          Linear algebra without pain
        </Anchor>.
      </Text>
      <Ask n={3} />
    </Stack>
  );
}

// ---- card 4: the Gibbs reactor ---------------------------------------------------

const ELEMENTS = ["C", "H", "O"];

function GibbsCard(): JSX.Element {
  const its = GIBBS.iterations;
  const rows = its.map((r) => [String(r["it"]), sci(r["mu"] ?? 0), (r["phi_mu"] ?? 0).toPrecision(6), sci(r["theta"] ?? 0),
    sci(r["inf_du"] ?? 0), sci(r["alpha_pr"] ?? 0), String(r["line_search_trials"] ?? "")]);
  const bridge = ELEMENTS.filter((e) => GIBBS.bridge[`lambda_${e}`] !== undefined).map((e) => {
    const l = GIBBS.bridge[`lambda_${e}`] as number, p = GIBBS.bridge[`pi_${e}`] as number;
    return [e, l.toPrecision(8), (-l).toPrecision(8), p.toPrecision(8)];
  });
  return (
    <Stack gap={8} data-ip-card="gibbs">
      <OriginMark of="engine" note="recorded run of tutorials/steady/gibbs/gibbs14_interior_point and its ipLog.csv" />
      <Text size="sm">
        The case is CO + 3 H2O at 350 K and 1 bar, <Code>model interiorPoint;</Code>. The floor is the Gibbs energy; the cushion is on the
        liquid water only. Each row is one iteration of the engine's own log: the cushion strength μ, the cushioned height
        (the Gibbs energy plus the cushion, in the optimizer's scaled units), how much the atom balances are broken, and the step.
      </Text>
      <Grid id="gibbs-log" head={["iteration", "cushion μ", "cushioned height", "atoms not balanced", "price mismatch", "step length", "trials"]} rows={rows} />
      <Text size="xs" c="dimmed" data-ip-gibbs-polish="">
        The finishing Newton step then changed the interior point's own amounts by at most {sci(GIBBS.polish["largest_relative_change"] ?? 0)}
        (relative): the cushion on the water left the gases right.
      </Text>
      <Text size="sm" fw={600}>The price of one more atom, found two ways</Text>
      <Grid id="gibbs-bridge" head={["element", "multiplier λ", "−λ", "element potential π (the finishing Newton)"]} rows={bridge} />
      <Ask n={4} />
    </Stack>
  );
}

// ---- card 5: no cushion on a mixture -------------------------------------------------

function MixtureCard(): JSX.Element {
  const def = r1Summary("condensedPhases"), all = r1Summary("everyAmount");
  const cases = Array.from(new Set(R1_ROWS.map(r1Case)));
  const value = (c: string, v: string): string => {
    const r = R1_ROWS.find((x) => r1Case(x) === c && x.variant === v);
    return r ? sci(r.polish) : "not run";
  };
  return (
    <Stack gap={8} data-ip-card="mixture">
      <OriginMark of={["engine", "page"]}
        note="the rows are the table mode of check_gibbs_interior_point.py (review R1); the counts and maxima are the page's arithmetic on them" />
      <Text size="sm">
        The finishing step of the Gibbs reactor changes the amounts the interior point found by some relative amount (the
        “polish”). Small means the interior point's own answer was already right. With the cushion only on the condensed phase
        (the default), <b data-ip-r1-default="">{def.within} of {def.n}</b> recorded solves need a change of 1e-6 or less
        (largest {sci(def.max)}; the others are named in the table: one reactor the gate exempts because the finish rescued the interior point, and two solves at the edge of the phase boundary).
        With a cushion on every amount only <b data-ip-r1-every="">{all.within} of {all.n}</b> do, and the largest change is {sci(all.max)}: the
        trace species had been left that far from where the finish put them.
      </Text>
      <Grid id="r1" head={["case and reactor", "change of the amounts, default", "change of the amounts, cushion on every amount"]}
        rows={cases.map((c) => [c, value(c, "condensedPhases"), value(c, "everyAmount")])} />
      <Ask n={5} />
    </Stack>
  );
}

// ---- card 6: a book's optimum --------------------------------------------------------

function BookCard(): JSX.Element {
  return (
    <Stack gap={8} data-ip-card="book">
      <OriginMark of={["engine", "reference"]} note="the test binary's HS116 row, and the collection's published value as the test file quotes it" />
      <Grid id="hs116" head={["", "value of the height"]}
        rows={[["the collection's published optimum", String(HS116.published)], ["Choupo's run (and the reference value in the test)", String(HS116.f)]]} />
      <Ask n={6} />
    </Stack>
  );
}

// ---- the page ----------------------------------------------------------------------------

export function InteriorPointTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>How does an interior-point method find the minimum?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            A ball in a room, a cushion along the walls that slowly deflates, a list of points never to go back to, and a check that the
            ground is a bowl: what Choupo's interior-point optimizer does at each iteration, drawn from its own runs.
          </Text>
          <Group gap={6} mt={6} data-ip-recorded="">
            <Badge size="sm" variant="light" color="orange">recorded, not live</Badge>
            <Text size="xs" c="dimmed">
              Every picture is a recorded native run of the engine (the test problems of a standard collection and the Gibbs reactor
              gibbs14). The page runs no optimizer in your browser. The technical words, barrier, filter, restoration, inertia, are
              given once, after the picture.
            </Text>
          </Group>
        </Box>

        {step(1)}
        <CushionCard />
        {step(2)}
        <FilterCard />
        {step(3)}
        <LadderCard />
        {step(4)}
        <GibbsCard />
        {step(5)}
        <MixtureCard />
        {step(6)}
        <BookCard />

        <LessonLimits limits={IP_LIMITS} />

        <LessonQuiz title="Check your understanding" questions={IPM_QUIZ} lesson={IPM_STEPS} />

        <Text size="sm">
          Related:{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("linear-algebra-without-pain")}>
            Linear algebra without pain
          </Anchor>{" "}(the algebra this page leaves out) and{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("optimizers")}>
            Three ways to optimise a flowsheet
          </Anchor>{" "}(where the interior point sits among the other optimisers).
        </Text>

        <LessonReferences tool="interior-point" />
      </Stack>
    </Box>
  );
}

export default InteriorPointTool;
