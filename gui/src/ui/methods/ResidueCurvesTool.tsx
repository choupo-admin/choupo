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
  ResidueCurvesTool -- the residue curve map of a ternary, and what it says
  about azeotropic and extractive distillation.

  TWO ENGINE RUNS, both choupoProps in this browser, on a case the page
  builds (gui/src/case/residueCurves.ts writes the dicts; nothing in the
  bundled corpus is touched):

    1. the GRID: one `propertyPoint` per composition of a triangular grid,
       asking for T_bubble and y_eq_<comp> at the chosen pressure;
    2. the REFINEMENT: a finer set of compositions around each azeotrope the
       page located on the grid, and the engine's own liquid-liquid flash
       over the whole triangle at the lowest bubble temperature of the map.

  Everything else -- the curves, the singular points and their types, the
  boundaries, the regions, the lever rule -- is the page's arithmetic over
  the engine's field, and every panel that shows it says so.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Select, Stack, Table, Text, Title,
} from "@mantine/core";

import { useCaseFilesRun } from "../../case/methodRun.js";
import { filesToCaseFiles } from "../../cases/tutorials.js";
import type { RunResult } from "../../adapters/SolverAdapter.js";
import {
  RCM_CASE_NAME, llOpName, rcmTag, applyRefinement, curvesCross, largestTDrop,
  limitingSplits, rcmGridCaseFiles, rcmRefineCaseFiles, readRcmField, readRefinement,
  refinementPlan, regionKey, regionOf, regionsOf, residueCurve, seedGrid, separatrices,
  singularPoints, type Curve, type RcmField, type SingularPoint, type Vec3,
} from "../../case/residueCurves.js";
import { OriginMark, type OriginKind } from "./origin.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { PUBLISHED_AZEOTROPES, RCM_LIMITS, RCM_STEPS } from "./residueCurvesLesson.js";

// ---- presets -----------------------------------------------------------------------

export interface RcmPreset {
  id: string;
  label: string;
  /** Drawn order: bottom-left, bottom-right, apex. */
  comps: readonly [string, string, string];
  why: string;
}

export const RCM_PRESETS: readonly RcmPreset[] = [
  {
    id: "glycol", comps: ["ethanol", "water", "ethyleneGlycol"],
    label: "Ethanol + water + ethylene glycol (extractive)",
    why: "The textbook extractive pair: a heavy entrainer added to the "
      + "ethanol-water azeotrope.  Watch for the number of regions.",
  },
  {
    id: "ipa", comps: ["isopropanol", "methanol", "water"],
    label: "Isopropanol + methanol + water",
    why: "One minimum-boiling azeotrope (isopropanol-water) and a boundary "
      + "running from it to methanol.",
  },
  {
    id: "chloroform", comps: ["chloroform", "methanol", "methylEthylKetone"],
    label: "Chloroform + methanol + methyl ethyl ketone",
    why: "Minimum- and maximum-boiling azeotropes on one map; try the "
      + "pressure control.",
  },
  {
    id: "meoac", comps: ["benzene", "methanol", "methylAcetate"],
    label: "Benzene + methanol + methyl acetate",
    why: "Two minimum-boiling azeotropes and the boundary between them.",
  },
  {
    id: "acn", comps: ["acetonitrile", "ethanol", "water"],
    label: "Acetonitrile + ethanol + water",
    why: "Three binary azeotropes, and a ternary one the model places a few "
      + "hundredths of a kelvin below one of them: a map that is hard to "
      + "resolve.  Compare the two grids.",
  },
];

export const RCM_PRESSURES = ["0.3", "1.01325", "2", "5"] as const;
export const RCM_GRIDS = ["24", "36"] as const;

// ---- drawing helpers --------------------------------------------------------------

const W = 600, H = 590, L = 480, X0 = 60, Y0 = 520;
const S3 = Math.sqrt(3) / 2;
const toXY = (x: Vec3): [number, number] =>
  [X0 + L * (x[1] + 0.5 * x[2]), Y0 - L * S3 * x[2]];
function fromXY(X: number, Y: number): Vec3 | null {
  const x3 = (Y0 - Y) / (L * S3);
  const x2 = (X - X0) / L - 0.5 * x3;
  const x1 = 1 - x2 - x3;
  return [x1, x2, x3].every((v) => v >= -1e-9) ? [x1, x2, x3] : null;
}

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const CURVE = "#2a78d6";
const BOUND = "#c0392b";
const FEED = "#eb6834";
const TYPE_COLOR: Record<string, string> = {
  "unstable node": "#1baf7a", "stable node": "#6250d6", saddle: "#8a8f98",
};

const fmt = (v: number, d = 2): string => {
  if (!Number.isFinite(v)) return "—";
  const s = v.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;   // no "-0.000"
};
const comp3 = (x: Vec3, d = 3): string => `(${x.map((v) => fmt(v, d)).join(", ")})`;

function pathOf(c: Curve): string {
  return c.x.map((p, k) => {
    const [X, Y] = toXY(p);
    return `${k ? "L" : "M"}${X.toFixed(1)},${Y.toFixed(1)}`;
  }).join(" ");
}

/** A small arrowhead at the middle of a curve, pointing to rising xi. */
function Arrow({ c, color }: { c: Curve; color: string }): JSX.Element | null {
  if (c.x.length < 6) return null;
  const m = Math.floor(c.x.length / 2);
  const [ax, ay] = toXY(c.x[m - 2]!), [bx, by] = toXY(c.x[m + 2]!);
  const ang = Math.atan2(by - ay, bx - ax);
  const s = 7;
  const p = (a: number, r: number) => `${(bx + r * Math.cos(a)).toFixed(1)},${(by + r * Math.sin(a)).toFixed(1)}`;
  return <polygon points={`${p(ang, s)} ${p(ang + 2.5, s)} ${p(ang - 2.5, s)}`} fill={color} />;
}

function Marker({ sp }: { sp: SingularPoint }): JSX.Element {
  const [X, Y] = toXY(sp.x);
  const col = TYPE_COLOR[sp.type] ?? INK;
  if (sp.type === "stable node")
    return <rect x={X - 6} y={Y - 6} width={12} height={12} fill={col} stroke={TEXT} strokeWidth={1} />;
  if (sp.type === "saddle")
    return <polygon points={`${X},${Y - 7} ${X + 7},${Y} ${X},${Y + 7} ${X - 7},${Y}`}
      fill={col} stroke={TEXT} strokeWidth={1} />;
  return <circle cx={X} cy={Y} r={6.5} fill={col} stroke={TEXT} strokeWidth={1} />;
}

// ---- panels --------------------------------------------------------------------------

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

/** Tables scroll inside their own box, never the page. */
function Wide({ children }: { children: ReactNode }): JSX.Element {
  return <Box style={{ overflowX: "auto", maxWidth: "100%" }}>{children}</Box>;
}

function spName(sp: SingularPoint, comps: readonly string[]): string {
  if (sp.kind === "pure") return comps[sp.x.indexOf(1)] ?? "pure";
  if (sp.kind === "binary azeotrope" && sp.edge)
    return `${comps[sp.edge[0]]}-${comps[sp.edge[1]]} azeotrope`;
  return "ternary azeotrope";
}

// ---- the pair parameters, as the engine reported them ---------------------------------

interface PairRow { pair: string; status: string; source: string; grade: string; notes: string[] }

export function pairRows(result: RunResult | null, comps: readonly string[]): PairRow[] {
  if (!result) return [];
  const adv = result.advisories ?? [];
  const pairs: [string, string][] = [[comps[0]!, comps[1]!], [comps[0]!, comps[2]!], [comps[1]!, comps[2]!]];
  return pairs.map(([a, b]) => {
    const res = (result.thermoResolution ?? []).find((r) =>
      (r.i === a && r.j === b) || (r.i === b && r.j === a));
    const mine = adv.filter((v) => {
      const l = v.locus;
      return [`pair ${a}-${b}`, `pair ${b}-${a}`, `NRTL pair '${a}-${b}'`, `NRTL pair '${b}-${a}'`]
        .includes(l);
    });
    const gradeMsg = mine.find((v) => /fitGrade/.test(v.message));
    const g = gradeMsg ? /fitGrade\s+(\w+)/.exec(gradeMsg.message)?.[1] ?? "" : "";
    const file = res?.source ? res.source.split("/").slice(-1)[0] ?? "" : "";
    return {
      pair: `${a} - ${b}`,
      status: res ? `${res.status}${res.origin ? `, ${res.origin}` : ""}` : "not reported",
      source: file,
      grade: g ? g.toLowerCase() : "none on record",
      notes: mine.map((v) => v.message),
    };
  });
}

// ---- the page ------------------------------------------------------------------------

const step = lessonStepper(RCM_STEPS);

function Status({ busy, err, what }: { busy: boolean; err: string | null; what: string }): JSX.Element | null {
  if (err)
    return (
      <Alert color="red" variant="light" title="the engine run did not finish">
        <Text size="sm">{err}</Text>
      </Alert>
    );
  if (busy)
    return (
      <Group gap={8}>
        <Loader size="xs" />
        <Text size="sm" c="dimmed">{what}</Text>
      </Group>
    );
  return null;
}

export function ResidueCurvesTool(): JSX.Element {
  const [presetId, setPresetId] = useState<string>(RCM_PRESETS[0]!.id);
  const [pStr, setPStr] = useState<string>("1.01325");
  const [nStr, setNStr] = useState<string>("24");
  const [feed, setFeed] = useState<Vec3 | null>(null);
  const preset = RCM_PRESETS.find((p) => p.id === presetId) ?? RCM_PRESETS[0]!;
  const comps = preset.comps;
  const P_bar = Number(pStr), n = Number(nStr);

  //  Run 1: the grid.
  const gridKey = `${preset.id}|${pStr}|${nStr}`;
  const tag = rcmTag(comps, P_bar, n);
  const runA = useCaseFilesRun(
    () => filesToCaseFiles(RCM_CASE_NAME, rcmGridCaseFiles(comps, P_bar, n)), gridKey, "choupoProps");
  const field: RcmField | null = useMemo(() => {
    const ops = runA.result?.operationResults;
    if (!ops) return null;
    //  An answer to another question (a run that finished after the preset
    //  changed) carries another tag, reads as all-missing, and is not drawn.
    const f = readRcmField(ops, comps, n, P_bar * 1e5, tag);
    return f.missing < ((n + 1) * (n + 2)) / 2 ? f : null;
    // comps, n and P_bar are what `tag` names
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runA.result, tag]);
  const coarse = useMemo(() => (field ? singularPoints(field) : []), [field]);
  const plan = useMemo(() => (field ? refinementPlan(field, coarse) : null), [field, coarse]);
  const Tmin = useMemo(() => {
    if (!field) return NaN;
    let m = Infinity;
    for (const row of field.nodes) for (const nd of row) if (nd && nd.T < m) m = nd.T;
    return m;
  }, [field]);

  //  Run 2: the refinement and the liquid-liquid check.
  const runB = useCaseFilesRun(
    field && plan
      ? () => filesToCaseFiles(RCM_CASE_NAME, rcmRefineCaseFiles(comps, P_bar, plan.points, Tmin, tag))
      : null,
    `${gridKey}|refine|${field ? "ready" : "none"}`, "choupoProps");
  const sps = useMemo(() => {
    if (!field || !plan) return coarse;
    const ops = runB.result?.operationResults;
    if (!ops) return coarse;
    return applyRefinement(field, coarse, plan, readRefinement(ops, comps, plan.points, tag));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, coarse, plan, runB.result, tag]);
  const ll = runB.result?.operationResults?.find((o) => o.name === llOpName(tag))?.diagnostics;

  const geometry = useMemo(() => {
    if (!field) return null;
    const bounds = separatrices(field, sps);
    const curves = seedGrid(8).map((s) => residueCurve(field, s, sps));
    const regions = regionsOf(field, sps);
    let drop = 0;
    for (const c of [...curves, ...bounds.map((b) => b.curve)]) drop = Math.max(drop, largestTDrop(c));
    let crossings = 0;
    for (let a = 0; a < curves.length; a++)
      for (let b = a + 1; b < curves.length; b++)
        if (curvesCross(curves[a]!, curves[b]!, sps, 2 / field.n)) crossings++;
    const ended = curves.filter((c) => c.start !== null && c.end !== null).length;
    return { bounds, curves, regions, drop, crossings, ended };
  }, [field, sps]);

  const feedInfo = useMemo(() => {
    if (!field || !geometry || !feed) return null;
    const region = regionOf(field, feed, sps);
    return {
      region, curve: residueCurve(field, feed, sps),
      splits: limitingSplits(feed, region, sps, geometry.bounds),
    };
  }, [field, geometry, feed, sps]);

  const pairs = useMemo(() => pairRows(runA.result, comps), [runA.result, comps]);
  const nameOf = (k: number | null): string => (k === null ? "unresolved" : spName(sps[k]!, comps));
  const atmospheric = pStr === "1.01325";

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Residue curve maps</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The phase diagram behind azeotropic and extractive distillation of a three-component
            mixture: the paths a boiling pot follows, the points where they start and end, the
            boundaries between them, and what that says about the products a simple column can
            make from a feed. The equilibrium comes from the engine, in your browser; the
            geometry is drawn by this page over it.
          </Text>
        </Box>
        {step(1)}
        {step(2)}

        <Panel title="the mixture, the pressure, and the grid" origin="engine"
          originNote="choupoProps, propertyPoint at every grid composition, run in this browser">
          <Group gap="sm" align="flex-end" wrap="wrap">
            <Select label="mixture" data={RCM_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
              value={presetId} onChange={(v) => { if (v) { setPresetId(v); setFeed(null); } }}
              allowDeselect={false} style={{ minWidth: 260, flex: "1 1 260px" }} />
            <Box>
              <Text size="sm" fw={500} mb={4}>pressure, bar</Text>
              <SegmentedControl size="xs" data={[...RCM_PRESSURES]} value={pStr}
                onChange={(v) => { setPStr(v); setFeed(null); }} />
            </Box>
            <Box>
              <Text size="sm" fw={500} mb={4}>grid intervals per edge</Text>
              <SegmentedControl size="xs" data={[...RCM_GRIDS]} value={nStr}
                onChange={(v) => { setNStr(v); setFeed(null); }} />
            </Box>
          </Group>
          <Text size="sm" c="dimmed">{preset.why}</Text>
          <Text size="xs" c="dimmed">
            The page writes a props case with one <Text span ff="monospace" size="xs">propertyPoint</Text>{" "}
            operation per composition of the grid ({((n + 1) * (n + 2)) / 2} compositions at{" "}
            {n} intervals per edge), each asking for <Text span ff="monospace" size="xs">T_bubble</Text>{" "}
            and <Text span ff="monospace" size="xs">y_eq_&lt;component&gt;</Text> at {pStr} bar, with
            NRTL for the liquid and an ideal-gas vapour, and runs it with choupoProps here.
            {field ? ` The engine returned ${((n + 1) * (n + 2)) / 2 - field.missing} of them`
              + (field.missing ? `; ${field.missing} returned no finite answer and are left out.` : ".") : ""}
          </Text>
          <Status busy={runA.busy} err={runA.err} what="running the grid with choupoProps in your browser…" />
          {pairs.length > 0 && (
            <Wide>
              <Table fz="xs" striped withTableBorder style={{ minWidth: 560 }}>
                <Table.Thead><Table.Tr>
                  <Table.Th>pair</Table.Th><Table.Th>where the engine found it</Table.Th>
                  <Table.Th>fit grade</Table.Th><Table.Th>what the engine said</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {pairs.map((r) => (
                    <Table.Tr key={r.pair}>
                      <Table.Td>{r.pair}</Table.Td>
                      <Table.Td>{r.status}{r.source ? ` (${r.source})` : ""}</Table.Td>
                      <Table.Td>
                        <Badge size="xs" variant="light"
                          color={r.grade === "clean" ? "green" : r.grade === "warning" ? "yellow"
                            : r.grade === "severe" ? "red" : "gray"}>{r.grade}</Badge>
                      </Table.Td>
                      <Table.Td>{r.notes.length ? r.notes.map((m, k) => <Text key={k} size="xs">{m}</Text>)
                        : <Text size="xs" c="dimmed">nothing</Text>}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Wide>
          )}
          {pairs.some((r) => r.grade !== "clean") && (
            <Alert color="yellow" variant="light" title="Not every pair is clean">
              <Text size="sm">
                At least one of the three pairs carries a warning or a severe fit grade, or no grade
                at all, and the engine's sentences above say where each one is used outside the
                temperatures its data covered. Read the map as what this model predicts, not as
                what the mixture does.
              </Text>
            </Alert>
          )}
        </Panel>

        {field && geometry && (
          <Panel title="the residue curve map" origin={["engine", "page"]}
            originNote="the engine's T_bubble and y* on the grid; the curves, points and boundaries are this page's arithmetic over them">
            <Box style={{ width: "100%", maxWidth: 620, margin: "0 auto" }}>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
                aria-label="residue curve map" style={{ display: "block", cursor: "crosshair" }}
                onClick={(e) => {
                  const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                  const X = ((e.clientX - r.left) / r.width) * W;
                  const Y = ((e.clientY - r.top) / r.height) * H;
                  const x = fromXY(X, Y);
                  if (x && x.every((v) => v > 0.01)) setFeed(x);
                }}>
                <polygon points={[toXY([1, 0, 0]), toXY([0, 1, 0]), toXY([0, 0, 1])]
                  .map(([X, Y]) => `${X},${Y}`).join(" ")} fill="none" stroke={TEXT} strokeWidth={1.2} />
                {[0.2, 0.4, 0.6, 0.8].map((t) => (
                  <g key={t} stroke={GRID} strokeWidth={0.6}>
                    {[0, 1, 2].map((c) => {
                      const a: Vec3 = [0, 0, 0], b: Vec3 = [0, 0, 0];
                      a[c] = t; b[c] = t; a[(c + 1) % 3] = 1 - t; b[(c + 2) % 3] = 1 - t;
                      const [ax, ay] = toXY(a), [bx, by] = toXY(b);
                      return <line key={c} x1={ax} y1={ay} x2={bx} y2={by} />;
                    })}
                  </g>
                ))}
                {geometry.curves.map((c, k) => (
                  <g key={k}>
                    <path d={pathOf(c)} fill="none" stroke={CURVE} strokeWidth={1.1} opacity={0.75} />
                    <Arrow c={c} color={CURVE} />
                  </g>
                ))}
                {geometry.bounds.map((b, k) => (
                  <g key={`b${k}`}>
                    <path d={pathOf(b.curve)} fill="none" stroke={BOUND} strokeWidth={3} />
                    <Arrow c={b.curve} color={BOUND} />
                  </g>
                ))}
                {feedInfo && (
                  <g>
                    <path d={pathOf(feedInfo.curve)} fill="none" stroke={FEED} strokeWidth={2.2} />
                    <Arrow c={feedInfo.curve} color={FEED} />
                    {feedInfo.splits.map((s) => {
                      const [dx, dy] = toXY(s.D), [bx, by] = toXY(s.B);
                      return (
                        <g key={s.name}>
                          <line x1={dx} y1={dy} x2={bx} y2={by} stroke={FEED}
                            strokeDasharray={s.name === "direct" ? "6 4" : "2 3"} strokeWidth={1.6} />
                          <circle cx={dx} cy={dy} r={4} fill="none" stroke={FEED} strokeWidth={1.6} />
                          <circle cx={bx} cy={by} r={4} fill={FEED} />
                        </g>
                      );
                    })}
                    {(() => {
                      const [fx, fy] = toXY(feed!);
                      return <circle cx={fx} cy={fy} r={5.5} fill="white" stroke={FEED} strokeWidth={2.5} />;
                    })()}
                  </g>
                )}
                {sps.map((sp, k) => <Marker key={k} sp={sp} />)}
                {[0, 1, 2].map((v) => {
                  const x: Vec3 = [0, 0, 0]; x[v] = 1;
                  const [X, Y] = toXY(x);
                  const sp = sps.find((s) => s.kind === "pure" && s.x[v] === 1);
                  const dy = v === 2 ? -40 : 30;
                  const anchor = v === 0 ? "start" : v === 1 ? "end" : "middle";
                  const dx = v === 0 ? -48 : v === 1 ? 48 : 0;
                  return (
                    <text key={v} x={X + dx} y={Y + dy} textAnchor={anchor} fontSize={22} fill={TEXT}>
                      <tspan fontWeight={700}>{comps[v]}</tspan>
                      <tspan x={X + dx} dy={22} fontSize={18} fill={TEXT}>{sp ? `${fmt(sp.T, 1)} K` : ""}</tspan>
                    </text>
                  );
                })}
              </svg>
            </Box>
            <Group gap={14} wrap="wrap">
              <Text size="xs"><Text span c={CURVE} fw={700}>—</Text> residue curves, arrow to rising T</Text>
              <Text size="xs"><Text span c={BOUND} fw={700}>━</Text> distillation boundary</Text>
              <Text size="xs"><Text span c={TYPE_COLOR["unstable node"]} fw={700}>●</Text> unstable node</Text>
              <Text size="xs"><Text span c={TYPE_COLOR["stable node"]} fw={700}>■</Text> stable node</Text>
              <Text size="xs"><Text span c={TYPE_COLOR.saddle} fw={700}>◆</Text> saddle</Text>
              <Text size="xs"><Text span c={FEED} fw={700}>○</Text> your feed (click inside the triangle)</Text>
            </Group>
            <Text size="xs" c="dimmed">
              Each curve is integrated by this page with fourth-order Runge-Kutta on
              dx/dξ = x − y*, the direction normalised to a step of {fmt(0.25 / field.n, 4)} in mole
              fraction, forwards and backwards from {geometry.curves.length} seeds spread over the
              triangle, y* and T taken from the engine's grid by linear interpolation inside each
              grid cell. A curve ends when it comes within {fmt(0.6 / field.n, 3)} of a node.
            </Text>
            <Text size="xs" c="dimmed">
              Checks on this drawing: {geometry.ended} of {geometry.curves.length} curves start and end
              at a located node; {geometry.crossings === 0 ? "no two drawn curves cross" :
                `${geometry.crossings} pairs of drawn curves cross (away from the singular points) — the grid is too coarse here`};
              the largest fall in boiling temperature between consecutive points of any drawn curve
              is {fmt(geometry.drop, 4)} K (the interpolation's creases; the physics allows none).
            </Text>
          </Panel>
        )}

        {step(3)}
        {field && (
          <Panel title="singular points" origin={["engine", "page"]}
            originNote="located and classified by this page on the engine's field; the temperatures of refined points are the engine's own bubble points">
            <Status busy={runB.busy} err={runB.err}
              what="refining the azeotropes and checking for two liquids (second engine run)…" />
            <Wide>
              <Table fz="xs" striped withTableBorder style={{ minWidth: 620 }}>
                <Table.Thead><Table.Tr>
                  <Table.Th>point</Table.Th><Table.Th>T, K</Table.Th>
                  <Table.Th>composition ({comps.join(", ")})</Table.Th>
                  <Table.Th>type, from the temperatures</Table.Th><Table.Th>type, from J</Table.Th>
                  <Table.Th>located to</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {[...sps].sort((a, b) => a.T - b.T).map((sp, k) => (
                    <Table.Tr key={k}>
                      <Table.Td>{spName(sp, comps)}</Table.Td>
                      <Table.Td>{fmt(sp.T, 2)}</Table.Td>
                      <Table.Td>{comp3(sp.x)}</Table.Td>
                      <Table.Td><Text span size="xs" c={TYPE_COLOR[sp.type]} fw={700}>{sp.type}</Text></Table.Td>
                      <Table.Td>{sp.jacobianType}{sp.jacobianType !== sp.type && sp.jacobianType !== "undetermined"
                        ? " — disagrees" : ""}</Table.Td>
                      <Table.Td>{sp.kind === "pure" ? "exact" : `±${fmt(sp.resolution, 4)}${sp.refined ? " (refined)" : " (grid)"}`}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Wide>
            <Text size="xs" c="dimmed">
              A binary azeotrope is found where y − x of one component changes sign between two grid
              points of an edge; a ternary one where the linear interpolant of x − y* vanishes inside
              a grid cell. The refinement run asks the engine again at {21} points across the
              bracketing cell of each binary azeotrope and on an eight-by-eight sub-grid around each
              ternary one; the type is then read again with the refined temperature. Pure
              components are exact.
            </Text>
          </Panel>
        )}

        {step(4)}
        {geometry && field && (
          <Panel title="regions" origin="page"
            originNote="every seed of a 12-by-12 interior grid integrated both ways by this page, and labelled by where it starts and ends">
            <Text size="sm">
              {(() => {
                const real = geometry.regions.filter((r) => r.un !== null && r.sn !== null);
                return real.length === 1
                  ? "One distillation region: every liquid on this map boils down to the same heavy end."
                  : `${real.length} distillation regions, separated by ${geometry.bounds.length} boundary curve${geometry.bounds.length === 1 ? "" : "s"}.`;
              })()}
            </Text>
            <Wide>
              <Table fz="xs" striped withTableBorder style={{ minWidth: 420 }}>
                <Table.Thead><Table.Tr>
                  <Table.Th>starts at (unstable node)</Table.Th><Table.Th>ends at (stable node)</Table.Th>
                  <Table.Th>seeds</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {geometry.regions.map((r) => (
                    <Table.Tr key={regionKey(r)}>
                      <Table.Td>{nameOf(r.un)}</Table.Td><Table.Td>{nameOf(r.sn)}</Table.Td>
                      <Table.Td>{r.nodes}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Wide>
            {geometry.regions.some((r) => r.un === null || r.sn === null) && (
              <Text size="xs" c="dimmed">
                An "unresolved" end is a seed whose curve stopped without reaching a located node --
                usually a node the grid did not resolve. Try the finer grid.
              </Text>
            )}
          </Panel>
        )}

        {step(5)}
        {geometry && (
          <Panel title="your feed and the two limiting splits" origin="page"
            originNote="the lever rule on the engine's map, drawn by this page; no column is solved">
            {!feedInfo ? (
              <Text size="sm">Click a point inside the triangle to place a feed.</Text>
            ) : (
              <>
                <Text size="sm">
                  Feed {comp3(feed!)}: its residue curve starts at <b>{nameOf(feedInfo.region.un)}</b> and
                  ends at <b>{nameOf(feedInfo.region.sn)}</b>, so that is its region.
                </Text>
                <Wide>
                  <Table fz="xs" striped withTableBorder style={{ minWidth: 520 }}>
                    <Table.Thead><Table.Tr>
                      <Table.Th>split</Table.Th><Table.Th>distillate</Table.Th><Table.Th>bottoms</Table.Th>
                      <Table.Th>D/F</Table.Th>
                    </Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {feedInfo.splits.map((s) => (
                        <Table.Tr key={s.name}>
                          <Table.Td>{s.name === "direct" ? "direct (dashed)" : "indirect (dotted)"}</Table.Td>
                          <Table.Td>{comp3(s.D)}</Table.Td><Table.Td>{comp3(s.B)}</Table.Td>
                          <Table.Td>{fmt(s.DoverF, 3)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Wide>
                <Text size="xs" c="dimmed">
                  The direct split puts the distillate on the region's unstable node and the bottoms
                  where the straight line from it through the feed meets the region's edge — a side
                  of the triangle or a boundary curve; the indirect split does the same from the
                  stable node. D/F is the lever rule, |FB| / |DB|. These are the limits the rule of
                  thumb allows, not a column's answer (step 5 says why only approximately).
                </Text>
              </>
            )}
          </Panel>
        )}

        {step(6)}
        <Panel title="published azeotropes beside the engine's" origin={["engine", "reference"]}
          originNote="the engine's located azeotropes at 1.01325 bar, beside readings of measured points from the cited articles">
          {!atmospheric && (
            <Text size="sm" c="dimmed">The comparison is made at 1.01325 bar; choose that pressure to see it.</Text>
          )}
          <Wide>
            <Table fz="xs" striped withTableBorder style={{ minWidth: 640 }}>
              <Table.Thead><Table.Tr>
                <Table.Th>azeotrope</Table.Th><Table.Th>engine x, T</Table.Th>
                <Table.Th>published x, T (P)</Table.Th><Table.Th>how it was read</Table.Th>
                <Table.Th>source</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {PUBLISHED_AZEOTROPES.map((pa) => {
                  const ia = comps.indexOf(pa.pair[0]), ib = comps.indexOf(pa.pair[1]);
                  const here = ia >= 0 && ib >= 0;
                  const sp = here && atmospheric ? sps.find((s) => s.kind === "binary azeotrope" && s.edge
                    && ((s.edge[0] === ia && s.edge[1] === ib) || (s.edge[0] === ib && s.edge[1] === ia))) : undefined;
                  return (
                    <Table.Tr key={pa.doi}>
                      <Table.Td>{pa.pair[0]} - {pa.pair[1]}</Table.Td>
                      <Table.Td>{!here ? "not on this map" : !atmospheric ? "—"
                        : sp ? `${fmt(sp.x[ia]!, 3)}, ${fmt(sp.T, 2)} K` : "none found"}</Table.Td>
                      <Table.Td>{pa.x}, {pa.T_K} K ({pa.P_kPa} kPa)</Table.Td>
                      <Table.Td>{pa.how}</Table.Td>
                      <Table.Td>{pa.cite}, doi:{pa.doi}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Wide>
          <Text size="xs" c="dimmed">
            x is the mole fraction of the first-named component. The published values are this
            page's reading of the articles' measured points as the corpus carries them (located
            through the NIST/TRC ThermoML Archive; the reading is written out in
            docs/design/residue-curve-maps.md). The measured pressures differ from 1.01325 bar by up
            to 1.3 %, which alone moves an azeotrope's temperature by a few tenths of a kelvin.
            Three of the four series (all but ethanol-water) are transcriptions that were not read
            back against their articles. The isopropanol-water pair was fitted to the very series
            read here, so that row is in-sample and shows only that the fit and the page agree; the
            methyl acetate-methanol and acetonitrile-water pairs were fitted to other series, and
            these are their held-out ones; the ethanol-water pair is a literature record.
            No measured azeotrope was read for benzene-methanol, chloroform-methanol,
            chloroform-methyl ethyl ketone, methanol-methyl ethyl ketone, benzene-isopropanol,
            acetonitrile-ethanol or the ternary azeotrope of the last preset, so those are not
            compared here.
          </Text>
        </Panel>

        <Panel title="does the liquid split into two?" origin="engine"
          originNote="the engine's liquid-liquid flash (propertyScanTernary, mode lle) over the triangle at the map's lowest bubble temperature">
          <Status busy={runB.busy} err={runB.err} what="checking…" />
          {ll ? (
            <Text size="sm">
              At {fmt(Tmin, 2)} K, the lowest bubble temperature on the map, the engine's
              liquid-liquid flash found <b>{fmt(ll["n_ll"] ?? NaN, 0)}</b> two-liquid compositions out
              of {fmt(ll["n_nodes"] ?? NaN, 0)} it tried
              {(ll["failures"] ?? 0) > 0 ? ` (and ${fmt(ll["failures"]!, 0)} it could not decide)` : ""}.{" "}
              {(ll["n_ll"] ?? 0) > 0
                ? "The model predicts two liquids there, and this map, which assumes one, is wrong in that part of the triangle."
                : "At that temperature the model keeps one liquid everywhere. That is one temperature, checked; the rest of the map is hotter, where most liquid-liquid gaps shrink, but this is not a proof."}
            </Text>
          ) : null}
        </Panel>

        <LessonLimits limits={RCM_LIMITS} />
        <LessonReferences tool="residue-curves" />
      </Stack>
    </Box>
  );
}

