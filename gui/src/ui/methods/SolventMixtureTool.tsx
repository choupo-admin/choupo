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
  CHOOSING A SOLVENT, OR A SOLVENT MIXTURE (DEV.md 4c C128) -- five pages:
  the question (the target and the solvents, every parameter with its source
  and reference temperature); PREDICT FIRST (the student commits a best
  composition before any curve is shown); the curve of Ra against
  composition, pure solvents at the ends, the minimum marked, the phase word
  drawn at every point, the Teas triangle beside it; the real case
  (polystyrene with hexane + acetone and hexane + nitromethane) and the
  thesis's own observations beside a screen of thirteen solvents; what a
  small distance is and is not.

  WHERE EVERY NUMBER COMES FROM.  Three witnesses under
  tutorials/props/solvents/ run in the reader's browser through the WASM
  choupoProps, and every Ra, RED, Teas fraction and phase word on these
  pages is read from the CSV the engine's `hansenMixture` operation wrote.
  The page draws; it computes nothing -- the test bans Math.sqrt and friends
  from this file.  The observations are a case INPUT the third witness ships
  under constant/experimental/, read from the bundle.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert, Badge, Box, Button, Group, Loader, SegmentedControl, Slider, Stack, Table, Text, Title,
} from "@mantine/core";

import { tutorialByName } from "../../cases/tutorials.js";
import { useMethodRun } from "../../case/methodRun.js";
import { OriginMark, type OriginKind } from "./origin.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { SOLVENT_LIMITS, SOLVENT_STEPS } from "./solventMixtureLesson.js";
import {
  minimumRow, readBlendCsv, readObservationsCsv, type BlendPoint, type BlendTable,
  type Observation,
} from "./solventMixtureRead.js";

/** The bundled witnesses this page runs in the browser, and the CSVs their
 *  propsDicts declare.  The names here must match the dicts' `output { file }`
 *  words; the test holds them to each other. */
export const SYNTHETIC_WITNESS = "props/solvents/solvent01_synthetic_mixture";
export const SYNTHETIC_CSV = "hansenMixture.csv";
export const REAL_WITNESS = "props/solvents/solvent02_polystyrene_hexane_blends";
export const REAL_ACETONE_CSV = "hansen_hexane_acetone.csv";
export const REAL_NITRO_CSV = "hansen_hexane_nitromethane.csv";
export const OBSERVED_WITNESS = "props/solvents/solvent03_polystyrene_observed";
export const OBSERVED_CSV = "hansen_screen.csv";
export const OBSERVATIONS_PATH = "constant/experimental/hansen1967_table23_polystyrene.csv";

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const SURFACE = "var(--mantine-color-body)";

/** One colour per PHASE WORD, fixed: a word keeps its colour on every page. */
const PHASE_COLOR: Record<string, string> = {
  homogeneous: "#1baf7a", twoPhase: "#e34948", notVerified: "#8a8f98", pure: "#2a78d6",
};
const PHASE_LABEL: Record<string, string> = {
  homogeneous: "homogeneous (one liquid)", twoPhase: "two-phase (refused as one solvent)",
  notVerified: "not verified (the model cannot decide)", pure: "pure solvent",
};
const CURVE = "#2a78d6";
const TARGET = "#eb6834";
const GUESS = "#6250d6";

type PageId = "question" | "predict" | "curve" | "real" | "limits";
const PAGES: { value: PageId; label: string }[] = [
  { value: "question", label: "1 · The question" },
  { value: "predict", label: "2 · Predict first" },
  { value: "curve", label: "3 · The curve" },
  { value: "real", label: "4 · Polystyrene" },
  { value: "limits", label: "5 · What it is not" },
];

// ---- number formatting ------------------------------------------------------------

export function fmt(x: number, d = 2): string {
  return Number.isFinite(x) ? x.toFixed(d) : "—";
}

// ---- the Ra plot ------------------------------------------------------------------------

interface RaPlotProps {
  table: BlendTable;
  /** The second solvent's name (the x axis is its declared fraction). */
  xLabel: string;
  /** The target's R0 in MPa^1/2 (NaN when none): drawn as the RED = 1 line. */
  r0: number;
  guess?: number | null;
  height?: number;
}

/** Ra against the second solvent's declared fraction, one point per row,
 *  each point painted with its phase word.  A refused point has no Ra and
 *  is drawn as a cross on the axis.  Linear axes; the x range is 0..1. */
function RaPlot({ table, xLabel, r0, guess, height = 300 }: RaPlotProps): JSX.Element {
  const W = 720, H = height, L = 60, R = 16, T = 14, B = 44;
  const rows = table.rows;
  const ys = rows.map((r) => r.Ra).filter((v) => Number.isFinite(v));
  const yMax = Math.max(1e-9, ...ys, Number.isFinite(r0) ? r0 : 0) * 1.1;
  const sx = (s: number) => L + s * (W - L - R);
  const sy = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const best = minimumRow(table);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  //  Crosshair: the row whose declared fraction is nearest the pointer.
  let near: BlendPoint | null = null;
  if (hover !== null) {
    const s = (hover - L) / (W - L - R);
    let bd = Infinity;
    for (const r of rows) {
      const d = Math.abs(r.s - s);
      if (d < bd) { bd = d; near = r; }
    }
  }
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  let path = "";
  let pen = false;
  for (const r of rows) {
    if (!Number.isFinite(r.Ra)) { pen = false; continue; }
    path += `${pen ? "L" : "M"}${sx(r.s).toFixed(1)},${sy(r.Ra).toFixed(1)}`;
    pen = true;
  }
  return (
    <Box>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`Hansen distance against the fraction of ${xLabel}`}
        style={{ display: "block", touchAction: "none" }}
        onPointerMove={(e) => {
          const rc = svgRef.current?.getBoundingClientRect();
          if (!rc) return;
          const px = ((e.clientX - rc.left) * W) / rc.width;
          setHover(px >= L && px <= W - R ? px : null);
        }}
        onPointerLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={T} y2={H - B} stroke={GRID} />
            <text x={sx(v)} y={H - B + 15} fontSize={11} fill={INK} textAnchor="middle">{v}</text>
          </g>
        ))}
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke={GRID} />
            <text x={L - 6} y={sy(v) + 4} fontSize={11} fill={INK} textAnchor="end">{fmt(v, 1)}</text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 6} fontSize={12} fill={TEXT} textAnchor="middle">
          fraction of {xLabel} ({rows[0]?.basis ?? "volume"} basis)
        </text>
        <text x={14} y={(T + H - B) / 2} fontSize={12} fill={TEXT} textAnchor="middle"
          transform={`rotate(-90 14 ${(T + H - B) / 2})`}>Ra, MPa^1/2</text>
        {Number.isFinite(r0) && (
          <g>
            <line x1={L} x2={W - R} y1={sy(r0)} y2={sy(r0)} stroke={TARGET} strokeDasharray="6 4" />
            <text x={W - R - 4} y={sy(r0) - 4} fontSize={11} fill={TARGET} textAnchor="end">
              R0 = {fmt(r0)} (RED = 1)
            </text>
          </g>
        )}
        {typeof guess === "number" && Number.isFinite(guess) && (
          <g>
            <line x1={sx(guess)} x2={sx(guess)} y1={T} y2={H - B} stroke={GUESS} strokeDasharray="3 3" />
            <text x={sx(guess) + 4} y={T + 12} fontSize={11} fill={GUESS}>your guess</text>
          </g>
        )}
        <path d={path} fill="none" stroke={CURVE} strokeWidth={2} strokeLinejoin="round" />
        {rows.map((r) => Number.isFinite(r.Ra)
          ? <circle key={r.point} cx={sx(r.s)} cy={sy(r.Ra)} r={4.5}
              fill={r.phase === "notVerified" ? SURFACE : PHASE_COLOR[r.phase] ?? INK}
              stroke={PHASE_COLOR[r.phase] ?? INK} strokeWidth={2} />
          : <g key={r.point} stroke={PHASE_COLOR.twoPhase} strokeWidth={2}>
              <line x1={sx(r.s) - 5} x2={sx(r.s) + 5} y1={H - B - 5} y2={H - B + 5} />
              <line x1={sx(r.s) - 5} x2={sx(r.s) + 5} y1={H - B + 5} y2={H - B - 5} />
            </g>)}
        {best && (
          <g>
            <circle cx={sx(best.s)} cy={sy(best.Ra)} r={9} fill="none" stroke={TARGET} strokeWidth={2} />
            <text x={sx(best.s)} y={sy(best.Ra) - 14} fontSize={11} fill={TARGET} textAnchor="middle">
              minimum Ra {fmt(best.Ra, 3)} at {fmt(best.s, 2)}
            </text>
          </g>
        )}
        {near && (
          <g>
            <line x1={sx(near.s)} x2={sx(near.s)} y1={T} y2={H - B} stroke={INK} strokeDasharray="2 3" />
            <rect x={Math.min(sx(near.s) + 8, W - 250)} y={T + 4} width={236} height={62} rx={4}
              fill={SURFACE} stroke={GRID} />
            <text x={Math.min(sx(near.s) + 14, W - 244)} y={T + 20} fontSize={11} fill={TEXT}>
              s = {fmt(near.s, 3)}  φ = {table.solvents.map((n) => fmt(near!.phi[n] ?? NaN, 3)).join(" / ")}
            </text>
            <text x={Math.min(sx(near.s) + 14, W - 244)} y={T + 36} fontSize={11} fill={TEXT}>
              Ra {fmt(near.Ra, 3)}{Number.isFinite(near.RED) ? `  RED ${fmt(near.RED, 3)}` : ""}
            </text>
            <text x={Math.min(sx(near.s) + 14, W - 244)} y={T + 52} fontSize={11}
              fill={PHASE_COLOR[near.phase] ?? INK}>
              {PHASE_LABEL[near.phase] ?? near.phase}{Number.isFinite(near.tm) ? `  tm ${near.tm.toExponential(2)}` : ""}
            </text>
          </g>
        )}
      </svg>
      <Group gap={14} mt={4}>
        {Object.keys(PHASE_COLOR).map((w) => (
          <Group key={w} gap={4}>
            <Box w={10} h={10} style={{ borderRadius: 5, background: PHASE_COLOR[w],
              border: `2px solid ${PHASE_COLOR[w]}` }} />
            <Text size="xs" c="dimmed">{PHASE_LABEL[w]}</Text>
          </Group>
        ))}
      </Group>
    </Box>
  );
}

// ---- the Teas triangle --------------------------------------------------------------------

/** The Teas ternary: corners dispersion (bottom left), polar (bottom right),
 *  hydrogen bonding (top).  Each point is placed by the fractions the engine
 *  wrote -- fd, fp, fh -- which sum to one, so the placement is a weighted
 *  sum of the three corners and nothing else is computed. */
function TeasTriangle({ table }: { table: BlendTable }): JSX.Element {
  const W = 320, H = 290, m = 24;
  const D = [m, H - m], P = [W - m, H - m], Hc = [W / 2, m];
  const at = (fd: number, fp: number, fh: number): [number, number] =>
    [fd * D[0]! + fp * P[0]! + fh * Hc[0]!, fd * D[1]! + fp * P[1]! + fh * Hc[1]!];
  const pts = table.rows.filter((r) => Number.isFinite(r.fd));
  const t0 = table.rows[0];
  const tgt = t0 && Number.isFinite(t0.fdT) ? at(t0.fdT, t0.fpT, t0.fhT) : null;
  let path = "";
  pts.forEach((r, i) => {
    const [x, y] = at(r.fd, r.fp, r.fh);
    path += `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Teas triangle"
      style={{ display: "block", maxWidth: 360 }}>
      <polygon points={`${D[0]},${D[1]} ${P[0]},${P[1]} ${Hc[0]},${Hc[1]}`} fill="none" stroke={GRID} />
      <text x={D[0]} y={D[1]! + 14} fontSize={11} fill={INK} textAnchor="start">f_d = 1</text>
      <text x={P[0]} y={P[1]! + 14} fontSize={11} fill={INK} textAnchor="end">f_p = 1</text>
      <text x={Hc[0]} y={Hc[1]! - 8} fontSize={11} fill={INK} textAnchor="middle">f_h = 1</text>
      <path d={path} fill="none" stroke={CURVE} strokeWidth={2} />
      {pts.map((r) => {
        const [x, y] = at(r.fd, r.fp, r.fh);
        return <circle key={r.point} cx={x} cy={y} r={3.5}
          fill={r.phase === "notVerified" ? SURFACE : PHASE_COLOR[r.phase] ?? INK}
          stroke={PHASE_COLOR[r.phase] ?? INK} strokeWidth={1.5} />;
      })}
      {tgt && (
        <g>
          <circle cx={tgt[0]} cy={tgt[1]} r={6} fill="none" stroke={TARGET} strokeWidth={2} />
          <text x={tgt[0] + 9} y={tgt[1] + 4} fontSize={11} fill={TARGET}>target</text>
        </g>
      )}
    </svg>
  );
}

// ---- small helpers ---------------------------------------------------------------------------

/** A panel.  `origin` is REQUIRED (DEV.md 4c C112): every panel on this
 *  page states where its numbers came from. */
function Panel({ title, origin, originNote, children }: {
  title: string; origin: OriginKind | readonly OriginKind[];
  originNote?: string; children: ReactNode;
}): JSX.Element {
  return (
    <Box px="sm" py="sm" style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>{title}</Text>
      <Box mb={8}><OriginMark of={origin} note={originNote} /></Box>
      <Stack gap={10}>{children}</Stack>
    </Box>
  );
}

function EngineSource({ witness, csv }: { witness: string; csv: string }): JSX.Element {
  return (
    <Text size="xs" c="dimmed">
      Every number here is read from{" "}
      <Text span ff="monospace" size="xs">{csv}</Text>, written by the engine&apos;s{" "}
      <Text span ff="monospace" size="xs">hansenMixture</Text> operation when the witness{" "}
      <Text span ff="monospace" size="xs">{witness}</Text> ran in your browser. The page
      draws it and computes nothing.
    </Text>
  );
}

function PhaseSummary({ table }: { table: BlendTable }): JSX.Element {
  const counts: Record<string, number> = {};
  for (const r of table.rows) counts[r.phase] = (counts[r.phase] ?? 0) + 1;
  return (
    <Group gap={8}>
      {Object.entries(counts).map(([w, n]) => (
        <Badge key={w} variant="light" style={{ color: PHASE_COLOR[w] ?? INK }}>
          {n} × {PHASE_LABEL[w] ?? w}
        </Badge>
      ))}
    </Group>
  );
}

/** The run of one witness, started on demand and kept. */
function useWitness(witness: string, started: boolean) {
  return useMethodRun(started ? witness : null, [], "", "choupoProps");
}

function Waiting({ witness, err }: { witness: string; err: string | null }): JSX.Element {
  if (err) {
    return (
      <Alert color="red" variant="light" title="the engine run did not finish">
        <Text size="sm">{err}</Text>
      </Alert>
    );
  }
  return (
    <Group gap={8}>
      <Loader size="xs" />
      <Text size="sm" c="dimmed">running {witness} with choupoProps in your browser…</Text>
    </Group>
  );
}

// ---- the pages ------------------------------------------------------------------------------

const step = lessonStepper(SOLVENT_STEPS);

function QuestionPage(): JSX.Element {
  return (
    <Stack gap="md">
      {step(1)}
      {step(2)}
      <Panel title="the records this lesson runs on" origin={["reference", "assumption"]}
        originNote="the synthetic pair is invented for the arithmetic; Hansen's 1967 placements are transcribed from his thesis">
        <Text size="sm">
          Page 2 and 3 use a <b>synthetic</b> pair -- solventA (16, 2, 4), solventB (16, 10, 12)
          and a polymer P at (17, 6, 8) with R0 = 4, all MPa^1/2, all invented so the
          arithmetic is checkable by hand; the engine announces them as not real on every
          run.  Page 4 uses <b>Hansen&apos;s own</b> placements of 1967: polystyrene (his
          solute G) at (8.6, 3.0, 2.0) with radius 3.5 in his (cal/cm³)^1/2, and solvents
          from his Table 2.1, each transcribed into a case-local record with the thesis
          page and row beside it, converted to Pa^1/2 and marked interim.  Every record
          declares the temperature its triple was placed at (adopted 25 °C; the thesis
          prints none beside its tables), and no correction moves it elsewhere.
        </Text>
      </Panel>
    </Stack>
  );
}

function PredictPage({ guess, setGuess, committed, commit }: {
  guess: number; setGuess: (v: number) => void; committed: boolean; commit: () => void;
}): JSX.Element {
  return (
    <Stack gap="md">
      {step(3)}
      <Panel title="your prediction -- before the curve" origin="assumption"
        originNote="your guess, and the synthetic pair's declared parameters">
        <Text size="sm">
          solventA is (16, 2, 4), solventB is (16, 10, 12), the polymer is (17, 6, 8), all
          MPa^1/2.  At which <b>volume fraction of solventB</b> do you expect the blend to
          come closest to the polymer?
        </Text>
        <Slider min={0} max={1} step={0.05} value={guess} onChange={setGuess}
          label={(v) => `${(100 * v).toFixed(0)} % B`} disabled={committed}
          marks={[{ value: 0, label: "pure A" }, { value: 0.5, label: "50:50" }, { value: 1, label: "pure B" }]} />
        <Group mt={18}>
          <Button size="xs" onClick={commit} disabled={committed}>
            {committed ? `committed: ${(100 * guess).toFixed(0)} % B` : "commit this guess"}
          </Button>
          <Text size="xs" c="dimmed">The curve on page 3 stays hidden until you commit.</Text>
        </Group>
      </Panel>
    </Stack>
  );
}

function CurvePage({ table, guess, committed }: {
  table: BlendTable; guess: number; committed: boolean;
}): JSX.Element {
  const best = minimumRow(table);
  const r0 = best && Number.isFinite(best.RED) && best.RED > 0 ? best.Ra / best.RED : NaN;
  const ends = table.rows.filter((r) => r.phase === "pure");
  return (
    <Stack gap="md">
      {step(4)}
      {!committed ? (
        <Alert color="gray" variant="light" title="predict first">
          <Text size="sm">Commit a guess on page 2; the curve is revealed after it.</Text>
        </Alert>
      ) : (
        <>
          <Panel title="Ra along the A/B line -- the engine's rows" origin="engine"
            originNote="the hansenMixture operation, run in this browser (choupoProps)">
            <RaPlot table={table} xLabel={table.solvents[1] ?? "B"} r0={r0} guess={guess} />
            {best && (
              <Text size="sm">
                Your guess: <b>{(100 * guess).toFixed(0)} % B</b>.  The engine&apos;s minimum:{" "}
                <b>Ra = {fmt(best.Ra, 3)} MPa^1/2 at {(100 * best.s).toFixed(0)} % B</b>
                {Number.isFinite(best.RED) ? ` (RED ${fmt(best.RED, 3)})` : ""};
                the pure ends sit at{" "}
                {ends.map((r) => `${r.label} ${fmt(r.Ra, 3)}`).join(" and ")}.
              </Text>
            )}
            <PhaseSummary table={table} />
            <EngineSource witness={SYNTHETIC_WITNESS} csv={SYNTHETIC_CSV} />
          </Panel>
          <Group align="flex-start" grow>
            <Panel title="the same path on the Teas triangle" origin="engine"
              originNote="the engine's rows, drawn on the triangle">
              <TeasTriangle table={table} />
              <Text size="xs" c="dimmed">
                The triangle normalises the magnitude away: it shows the character of the
                interaction, never its strength.  Read it beside the curve, not instead of it.
              </Text>
            </Panel>
            <Box>{step(5)}</Box>
          </Group>
        </>
      )}
    </Stack>
  );
}

function BlendTableView({ table }: { table: BlendTable }): JSX.Element {
  return (
    <Box style={{ overflowX: "auto" }}>
      <Table fz="xs" striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>s ({table.rows[0]?.basis})</Table.Th>
            {table.solvents.map((s) => <Table.Th key={s}>φ {s}</Table.Th>)}
            <Table.Th>dD</Table.Th><Table.Th>dP</Table.Th><Table.Th>dH</Table.Th>
            <Table.Th>Ra</Table.Th><Table.Th>RED</Table.Th><Table.Th>phase</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {table.rows.map((r) => (
            <Table.Tr key={r.point}>
              <Table.Td>{fmt(r.s, 2)}</Table.Td>
              {table.solvents.map((s) => <Table.Td key={s}>{fmt(r.phi[s] ?? NaN, 3)}</Table.Td>)}
              <Table.Td>{fmt(r.dD)}</Table.Td><Table.Td>{fmt(r.dP)}</Table.Td><Table.Td>{fmt(r.dH)}</Table.Td>
              <Table.Td>{fmt(r.Ra, 3)}</Table.Td><Table.Td>{fmt(r.RED, 3)}</Table.Td>
              <Table.Td style={{ color: PHASE_COLOR[r.phase] ?? INK }}>{r.phase}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

function RealPage({ acetone, nitro, screen, observations }: {
  acetone: BlendTable; nitro: BlendTable; screen: BlendTable; observations: Observation[];
}): JSX.Element {
  const r0of = (t: BlendTable) => {
    const b = minimumRow(t);
    return b && Number.isFinite(b.RED) && b.RED > 0 ? b.Ra / b.RED : NaN;
  };
  const obsOf = new Map(observations.map((o) => [o.solvent, o]));
  const bestA = minimumRow(acetone), bestN = minimumRow(nitro);
  return (
    <Stack gap="md">
      {step(6)}
      <Panel title="polystyrene against hexane + acetone, by volume" origin={["engine", "reference"]}
        originNote="the engine's rows on Hansen's own placements">
        <RaPlot table={acetone} xLabel={acetone.solvents[1] ?? "acetone"} r0={r0of(acetone)} />
        {bestA && (
          <Text size="sm">
            Minimum Ra = {fmt(bestA.Ra, 3)} MPa^1/2 (RED {fmt(bestA.RED, 3)}) at{" "}
            {(100 * bestA.s).toFixed(0)} % acetone by volume; pure ends{" "}
            {acetone.rows.filter((r) => r.phase === "pure").map((r) => `${r.label} RED ${fmt(r.RED, 3)}`).join(", ")}.
          </Text>
        )}
        <PhaseSummary table={acetone} />
        <EngineSource witness={REAL_WITNESS} csv={REAL_ACETONE_CSV} />
      </Panel>
      {step(7)}
      <Panel title="polystyrene against hexane + nitromethane, by mole" origin={["engine", "reference"]}
        originNote="the engine's rows on Hansen's own placements">
        <RaPlot table={nitro} xLabel={nitro.solvents[1] ?? "nitromethane"} r0={r0of(nitro)} />
        {bestN && (
          <Text size="sm">
            Minimum over the points that survive: Ra = {fmt(bestN.Ra, 3)} MPa^1/2 (RED{" "}
            {fmt(bestN.RED, 3)}) at mole fraction {fmt(bestN.s, 2)} of nitromethane (volume
            fraction {fmt(bestN.phi.nitromethane ?? NaN, 3)}).
          </Text>
        )}
        <PhaseSummary table={nitro} />
        <BlendTableView table={nitro} />
        <EngineSource witness={REAL_WITNESS} csv={REAL_NITRO_CSV} />
      </Panel>
      {step(8)}
      <Panel title="thirteen pure solvents: predicted RED beside the thesis's rating" origin={["engine", "reference"]}
        originNote="RED is the engine's; the ratings are the thesis's observations">
        <Box style={{ overflowX: "auto" }}>
          <Table fz="xs" striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>solvent</Table.Th><Table.Th>dD</Table.Th><Table.Th>dP</Table.Th>
                <Table.Th>dH</Table.Th><Table.Th>Ra</Table.Th><Table.Th>RED</Table.Th>
                <Table.Th>predicted</Table.Th><Table.Th>observed (Table 2.3)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...screen.rows].sort((a, b) => a.RED - b.RED).map((r) => {
                const o = obsOf.get(r.label);
                const inside = r.RED < 1;
                const agrees = o ? (inside ? o.rating <= 2 : o.rating >= 3) : null;
                return (
                  <Table.Tr key={r.point}>
                    <Table.Td>{r.label}</Table.Td>
                    <Table.Td>{fmt(r.dD)}</Table.Td><Table.Td>{fmt(r.dP)}</Table.Td><Table.Td>{fmt(r.dH)}</Table.Td>
                    <Table.Td>{fmt(r.Ra, 3)}</Table.Td><Table.Td>{fmt(r.RED, 3)}</Table.Td>
                    <Table.Td style={{ color: inside ? PHASE_COLOR.homogeneous : PHASE_COLOR.twoPhase }}>
                      {inside ? "inside the sphere" : "outside"}
                    </Table.Td>
                    <Table.Td>
                      {o ? `${o.rating} — ${o.ratingMeaning}` : "no observation shipped"}
                      {agrees === false ? " (the thesis's own residual)" : ""}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Box>
        <Text size="xs" c="dimmed">
          Observations: {observations[0]?.source ?? "—"}.  The ratings are the thesis&apos;s
          1..6 scale; inside / outside is the engine&apos;s RED against the radius the same
          thesis fitted through these observations.
        </Text>
        <EngineSource witness={OBSERVED_WITNESS} csv={OBSERVED_CSV} />
      </Panel>
    </Stack>
  );
}

// ---- the page ------------------------------------------------------------------------------

export function SolventMixtureTool(): JSX.Element {
  const [page, setPage] = useState<PageId>("question");
  const [guess, setGuess] = useState(0.5);
  const [committed, setCommitted] = useState(false);
  //  Each witness starts the first time a page needs it and is kept.
  const [synStarted, setSynStarted] = useState(false);
  const [realStarted, setRealStarted] = useState(false);
  useEffect(() => {
    if (page === "curve") setSynStarted(true);
    if (page === "real") setRealStarted(true);
  }, [page]);
  const syn = useWitness(SYNTHETIC_WITNESS, synStarted);
  const real = useWitness(REAL_WITNESS, realStarted);
  const obs = useWitness(OBSERVED_WITNESS, realStarted);
  const synTable = useMemo(() => readBlendCsv(syn.result?.csvFiles?.[SYNTHETIC_CSV] ?? ""), [syn.result]);
  const acetone = useMemo(() => readBlendCsv(real.result?.csvFiles?.[REAL_ACETONE_CSV] ?? ""), [real.result]);
  const nitro = useMemo(() => readBlendCsv(real.result?.csvFiles?.[REAL_NITRO_CSV] ?? ""), [real.result]);
  const screen = useMemo(() => readBlendCsv(obs.result?.csvFiles?.[OBSERVED_CSV] ?? ""), [obs.result]);
  const observations = useMemo(() => {
    const text = tutorialByName(OBSERVED_WITNESS)?.files.extraFiles?.[OBSERVATIONS_PATH];
    return text ? readObservationsCsv(text) : [];
  }, []);
  const synReady = synTable.rows.length > 0;
  const realReady = acetone.rows.length > 0 && nitro.rows.length > 0 && screen.rows.length > 0;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Choosing a solvent, or a solvent mixture</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Hansen&apos;s three parameters, the distance of a solvent or a blend from the
            substance to be dissolved, the volume-fraction rule for a mixture, and the
            phase check that decides whether the blend is one liquid at all. You predict
            the best composition before the engine shows its curve; then the real case,
            beside what Hansen observed.
          </Text>
        </Box>
        <Alert color="gray" variant="light" title="Affinity, not solubility">
          <Text size="sm">
            A small Hansen distance is a compatibility indicator in this approach -- the
            solvent lies where the substance was observed to dissolve or swell. No
            saturation concentration follows from it, and none is shown here.
          </Text>
        </Alert>
        <SegmentedControl fullWidth value={page} onChange={(v) => setPage(v as PageId)} data={PAGES} />
        {page === "question" && <QuestionPage />}
        {page === "predict" && (
          <PredictPage guess={guess} setGuess={setGuess} committed={committed}
            commit={() => setCommitted(true)} />
        )}
        {page === "curve" && (synReady
          ? <CurvePage table={synTable} guess={guess} committed={committed} />
          : <Waiting witness={SYNTHETIC_WITNESS} err={syn.err} />)}
        {page === "real" && (realReady
          ? <RealPage acetone={acetone} nitro={nitro} screen={screen} observations={observations} />
          : <Waiting witness={REAL_WITNESS} err={real.err ?? obs.err} />)}
        {page === "limits" && (
          <Stack gap="md">
            {step(9)}
            <LessonLimits limits={SOLVENT_LIMITS} />
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
