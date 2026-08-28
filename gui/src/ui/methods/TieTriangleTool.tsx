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
  TieTriangleTool — the ternary tie-triangle with the Hunter-Nash stagewise
  construction.  Treybal's diagram: a composition triangle carrying the
  two-liquid region and its tie-lines, the four terminal streams of a
  counter-current extractor, the MIXING point M where the two overall-balance
  lines cross, the DIFFERENCE point Δ through which every operating line
  passes, and the staircase that alternates between the two.

  SELF-FEEDING, two witnesses, one run each (the Methods-workspace contract):
      tutorials/props/scan/ternary03_lle_water_ethanol_benzene   (choupoProps)
      tutorials/steady/absorption/extract01_ethanol_water_benzene (choupoSolve)
  They are the SAME SYSTEM — their thermoPhysPropDicts differ only in the two
  liquid-phase names and a vapour block the LL scan never reaches, and their
  sealed component records and UNIFAC pair tables are byte-identical (both
  pinned by tests/hunterNash.test.ts).  Without that, the tie-lines and the
  stage points would be two different chemistries on one sheet of paper.

  ZERO PHYSICS IN TYPESCRIPT.  Every composition drawn is engine output:
    * the two-liquid region and its tie-lines           — the scan's own rows;
    * every stage's tie-line R_j — E_j                  — the cascade's own
      profile columns xR_<comp> / xE_<comp>, which ARE the two phases the
      per-stage LL flash produced;
    * F and S                                           — the run's own inlet
      streams, bound to the cascade by the terminal FLOWS it published.
  The construction over them — the projection, two line intersections, and the
  perpendicular distances that MEASURE the method's colinearity claim — lives
  in case/hunterNash.ts, which imports nothing but types.  Its header
  enumerates each operation and what it is not.

  WHAT THIS TOOL DOES NOT DRAW, and why each absence is an absence and not a
  choice (the standing rule: never "omitted for clarity"):
    * NO BINODAL CURVE.  The engine publishes tie-line ENDS and a per-node
      phase classification; it does not publish the curve through them.
    * NO INTERPOLATED TIE-LINE, therefore NO FREE-HAND STAGE COUNT.  The
      classical hand method steps to a conjugate composition by reading a
      tie-line between the plotted ones; that tie-line is a flash nobody ran.
      The staircase here walks the cascade's OWN stages, so the tool cannot
      answer "how many stages would this duty need" graphically — it can only
      show what the method says about the stages the engine solved.  The
      missing piece is an ENGINE surface: a tie-line through a GIVEN
      composition.  Until that exists this is a stated limit, not a workaround.
    * NO PLAIT POINT, no spinodal, no minimum-solvent construction: none of
      the three is published, and each would be a curve fitted in the view.

  Inline SVG (the Merkel / Levenspiel precedent): the plotting bundle cannot
  load outside a browser, and keeping the reading + geometry in a plain module
  lets the node test runner pin them with no mock at all.

  Chrome: a scrolling lesson page with the shared `KnobSlider` — the
  knobs are the panel's, the construction gets the rest of the width.  The
  knob descriptors carry the structural `PanelKnob` fields, so they are handed
  to the slider whole rather than re-shaped for it.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { lessonStepper } from "./lessonStep.js";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Stack, Text,
  Title, Tooltip,
} from "@mantine/core";

import {
  COLUMN_WITNESS, MAP_CSV, MAP_WITNESS, TIE_TRIANGLE_KNOBS,
  WITNESS_CARRIER, WITNESS_COMPONENTS, WITNESS_SOLUTE, WITNESS_SOLVENT,
  bindInlets, buildConstruction, cornerOrder, defaultKnobValues,
  findExtractorFeeds, knobOverridesFor, project, readTernaryScan,
  worstResidual,
  type Construction, type Pt, type ScanRead, type StageTie, type Tri,
  type TieTriangleKnobValues,
} from "../../case/hunterNash.js";
import { useMethodRun } from "../../case/methodRun.js";
import { HUNTER_NASH_LIMITS, HUNTER_NASH_STEPS }
  from "./hunterNashLesson.js";
import {
  KnobField, KnobSlider, PanelNote,
} from "./knobPanel.js";

/** The engine's own stability advisory, raised by the LL flash on its OWN
 *  converged phases.  It is written to stderr, so the worker delivers it with
 *  a `[stderr] ` prefix; it qualifies every tie-line on the diagram and is
 *  therefore lifted onto the surface rather than left in a log the tool does
 *  not show. */
const TPD_RE = /TPD-unstable/;

function countMatching(log: string | undefined, re: RegExp): {
  count: number; first: string | null;
} {
  if (!log) return { count: 0, first: null };
  let count = 0; let first: string | null = null;
  for (const raw of log.split("\n")) {
    if (!re.test(raw)) continue;
    ++count;
    if (first === null) first = raw.replace(/^\s*\[stderr\]\s*/, "").trim();
  }
  return { count, first };
}

// ---- The drawn frame --------------------------------------------------------

const FW = 780, FH = 560;
const PAD = 54;

interface Transform { toX: (x: number) => number; toY: (y: number) => number }

/** Fit a world box into the frame, aspect preserved and centred.  Pure view
 *  arithmetic — it moves no composition, it chooses where the paper is. */
function fit(
  minX: number, maxX: number, minY: number, maxY: number,
): Transform {
  const w = Math.max(maxX - minX, 1e-9), h = Math.max(maxY - minY, 1e-9);
  const s = Math.min((FW - 2 * PAD) / w, (FH - 2 * PAD) / h);
  const ox = (FW - s * w) / 2 - s * minX;
  const oy = (FH - s * h) / 2 + s * maxY;
  return { toX: (x) => ox + s * x, toY: (y) => oy - s * y };
}

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const C_ONE = "#6b7a7d";          // one-phase nodes (the engine's word)
const C_LL = "#8d6e63";           // two-liquid nodes
const C_TIE = "#a1887f";          // published tie-lines
const C_STAGE = "#26c6da";        // the cascade's own stage tie-lines
const C_OPER = "#ffb74d";         // operating lines through Δ
const C_TERM = "#ce93d8";         // F, S, E1, RN
const C_DELTA = "#ff8a65";        // Δ and M

const fmt = (v: number | null | undefined, d = 3): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toPrecision(d) : "—";

/** The full straight LINE through two published points, as a pair of far
 *  endpoints the frame will cut off.  Drawn rather than the bare segment
 *  because the operating line's whole content is that it goes on to Δ — and Δ
 *  can be on either side (it is a DIFFERENCE, so its flow may be negative and
 *  its position then lies beyond the extract rather than beyond the
 *  raffinate).  Extending both ways states that without deciding it. */
function throughLine(a: Pt, b: Pt, reach: number): [Pt, Pt] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return [a, b];
  const ux = (dx / len) * reach, uy = (dy / len) * reach;
  return [{ x: a.x - ux, y: a.y - uy }, { x: b.x + ux, y: b.y + uy }];
}

function TriangleSvg({ scan, stages, cons, corners, zoom, busy }: {
  scan: ScanRead | null;
  stages: readonly StageTie[];
  cons: Construction;
  corners: readonly [string, string, string];
  zoom: "triangle" | "delta";
  busy: boolean;
}): JSX.Element {
  const order = cons.order;
  const A = project([1, 0, 0] as Tri, [0, 1, 2]);   // frame corners are fixed
  const B = project([0, 1, 0] as Tri, [0, 1, 2]);
  const C = project([0, 0, 1] as Tri, [0, 1, 2]);

  // World box: the triangle always; Δ too when the reader asks for it.
  let minX = -0.04, maxX = 1.04, minY = -0.04, maxY = C.y + 0.06;
  if (zoom === "delta" && cons.delta) {
    minX = Math.min(minX, cons.delta.x - 0.08);
    maxX = Math.max(maxX, cons.delta.x + 0.08);
    minY = Math.min(minY, cons.delta.y - 0.08);
    maxY = Math.max(maxY, cons.delta.y + 0.08);
  }
  const deltaInFrame = !!cons.delta
    && cons.delta.x >= minX && cons.delta.x <= maxX
    && cons.delta.y >= minY && cons.delta.y <= maxY;
  const t = fit(minX, maxX, minY, maxY);
  const P = (p: Pt) => `${t.toX(p.x).toFixed(2)},${t.toY(p.y).toFixed(2)}`;
  const reach = Math.hypot(maxX - minX, maxY - minY);

  const tri = (x: Tri) => project(x, order);

  return (
    <Box style={{ flex: 1, minHeight: 0, position: "relative" }}>
      {busy && (
        <Box style={{ position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1,
          background: "light-dark(rgba(255,255,255,0.5), rgba(0,0,0,0.35))" }}>
          <Loader size="sm" />
        </Box>
      )}
      <svg viewBox={`0 0 ${FW} ${FH}`} width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={"Ternary tie-triangle with the Hunter-Nash construction: "
          + "the engine's two-liquid region and tie-lines, the extractor's "
          + "terminal streams, the mixing point, the difference point, and "
          + "the stagewise staircase between tie-lines and operating lines"}>

        {/* the composition triangle */}
        <polygon points={`${P(A)} ${P(B)} ${P(C)}`} fill="none"
          stroke={GRID} strokeWidth={1.4} />
        <text x={t.toX(A.x) - 6} y={t.toY(A.y) + 16} textAnchor="middle"
          fontSize={12} fill={INK}>{corners[0]}</text>
        <text x={t.toX(B.x) + 6} y={t.toY(B.y) + 16} textAnchor="middle"
          fontSize={12} fill={INK}>{corners[1]}</text>
        <text x={t.toX(C.x)} y={t.toY(C.y) - 8} textAnchor="middle"
          fontSize={12} fill={INK}>{corners[2]}</text>

        {/* the scan's node classification — the engine's own word per node */}
        {scan?.nodes.map((n, i) => {
          const p = tri(n.x);
          return (
            <circle key={`n${i}`} cx={t.toX(p.x)} cy={t.toY(p.y)} r={2}
              fill={n.region === "ONE_PHASE" ? C_ONE : C_LL} opacity={0.55} />
          );
        })}

        {/* the published tie-lines, exactly as published */}
        {scan?.ties.map((tie) => {
          const a = tri(tie.ends[0]), b = tri(tie.ends[1]);
          return (
            <g key={`t${tie.id}`}>
              <line x1={t.toX(a.x)} y1={t.toY(a.y)} x2={t.toX(b.x)} y2={t.toY(b.y)}
                stroke={C_TIE} strokeWidth={0.9} opacity={0.75} />
              <circle cx={t.toX(a.x)} cy={t.toY(a.y)} r={1.8} fill={C_TIE} />
              <circle cx={t.toX(b.x)} cy={t.toY(b.y)} r={1.8} fill={C_TIE} />
            </g>
          );
        })}

        {/* the two overall-balance lines and their crossing, M */}
        <line x1={t.toX(cons.F.x)} y1={t.toY(cons.F.y)}
          x2={t.toX(cons.S.x)} y2={t.toY(cons.S.y)}
          stroke={C_DELTA} strokeWidth={1.1} strokeDasharray="5 4" opacity={0.8} />
        <line x1={t.toX(cons.E1.x)} y1={t.toY(cons.E1.y)}
          x2={t.toX(cons.RN.x)} y2={t.toY(cons.RN.y)}
          stroke={C_DELTA} strokeWidth={1.1} strokeDasharray="5 4" opacity={0.8} />
        {cons.mixingGeometric && (
          <g>
            <circle cx={t.toX(cons.mixingGeometric.x)} cy={t.toY(cons.mixingGeometric.y)}
              r={4} fill="none" stroke={C_DELTA} strokeWidth={1.8} />
            <text x={t.toX(cons.mixingGeometric.x) + 7}
              y={t.toY(cons.mixingGeometric.y) - 6} fontSize={11} fill={C_DELTA}>M</text>
          </g>
        )}

        {/* the operating lines: every one of them passes through Δ */}
        {cons.delta && cons.legs.map((leg) => {
          const [p, q] = throughLine(leg.partner, leg.raffinate, reach);
          return (
            <line key={`o${leg.stage}`}
              x1={t.toX(p.x)} y1={t.toY(p.y)} x2={t.toX(q.x)} y2={t.toY(q.y)}
              stroke={C_OPER} strokeWidth={1.2}
              strokeDasharray={leg.byConstruction ? "2 3" : undefined}
              opacity={0.85} />
          );
        })}

        {/* the cascade's own stage tie-lines — the staircase's equilibrium legs */}
        {stages.map((s) => {
          const r = tri(s.raffinate), e = tri(s.extract);
          return (
            <g key={`s${s.stage}`}>
              <line x1={t.toX(r.x)} y1={t.toY(r.y)} x2={t.toX(e.x)} y2={t.toY(e.y)}
                stroke={C_STAGE} strokeWidth={2.2} />
              <circle cx={t.toX(r.x)} cy={t.toY(r.y)} r={3.2} fill={C_STAGE} />
              <circle cx={t.toX(e.x)} cy={t.toY(e.y)} r={3.2} fill={C_STAGE} />
              <text x={t.toX(r.x) + 6} y={t.toY(r.y) - 5} fontSize={10}
                fill={C_STAGE}>R{s.stage}</text>
              <text x={t.toX(e.x) - 6} y={t.toY(e.y) - 5} fontSize={10}
                textAnchor="end" fill={C_STAGE}>E{s.stage}</text>
            </g>
          );
        })}

        {/* the four terminal points */}
        {([[cons.F, "F"], [cons.S, "S"], [cons.E1, "E₁"],
          [cons.RN, "R_N"]] as [Pt, string][]).map(([p, lab]) => (
          <g key={lab}>
            <rect x={t.toX(p.x) - 3.6} y={t.toY(p.y) - 3.6} width={7.2} height={7.2}
              fill={C_TERM} />
            <text x={t.toX(p.x) + 8} y={t.toY(p.y) + 4} fontSize={11}
              fill={C_TERM}>{lab}</text>
          </g>
        ))}

        {/* Δ, whenever the frame actually contains it */}
        {cons.delta && deltaInFrame && (
          <g>
            <circle cx={t.toX(cons.delta.x)} cy={t.toY(cons.delta.y)} r={5}
              fill="none" stroke={C_DELTA} strokeWidth={2} />
            <line x1={t.toX(cons.delta.x) - 8} y1={t.toY(cons.delta.y)}
              x2={t.toX(cons.delta.x) + 8} y2={t.toY(cons.delta.y)}
              stroke={C_DELTA} strokeWidth={1} />
            <line x1={t.toX(cons.delta.x)} y1={t.toY(cons.delta.y) - 8}
              x2={t.toX(cons.delta.x)} y2={t.toY(cons.delta.y) + 8}
              stroke={C_DELTA} strokeWidth={1} />
            <text x={t.toX(cons.delta.x) + 10} y={t.toY(cons.delta.y) - 8}
              fontSize={11} fill={C_DELTA}>Δ</text>
          </g>
        )}
        {cons.delta && !deltaInFrame && (
          <text x={FW - 10} y={FH - 10} textAnchor="end" fontSize={10} fill={C_DELTA}>
            Δ is off this frame — the operating lines still run through it;
            switch the frame to &quot;include Δ&quot; to see where
          </text>
        )}
        {!cons.delta && (
          <text x={FW - 10} y={FH - 10} textAnchor="end" fontSize={10} fill={C_DELTA}>
            the two defining lines are parallel — Δ is at infinity, so no
            operating lines are drawn
          </text>
        )}
      </svg>
    </Box>
  );
}

// ---- The tool ---------------------------------------------------------------

export function TieTriangleTool(): JSX.Element {
  const [knobs, setKnobs] = useState<TieTriangleKnobValues>(defaultKnobValues);
  const [zoom, setZoom] = useState<"triangle" | "delta">("triangle");
  const knobsKey = JSON.stringify(knobs);

  const mapRun = useMethodRun(
    MAP_WITNESS, knobOverridesFor(knobs, MAP_WITNESS), knobsKey, "choupoProps");
  const colRun = useMethodRun(
    COLUMN_WITNESS, knobOverridesFor(knobs, COLUMN_WITNESS), knobsKey,
    "choupoSolve");
  const busy = mapRun.busy || colRun.busy;

  // ---- The map -------------------------------------------------------------
  const scanRead = useMemo(() => {
    const csv = mapRun.result?.csvFiles?.[MAP_CSV];
    return csv ? readTernaryScan(csv) : null;
  }, [mapRun.result]);
  const scan = scanRead?.ok ? scanRead.read : null;

  // ---- The cascade ---------------------------------------------------------
  const feed = useMemo(
    () => findExtractorFeeds(
      colRun.result?.profiles, colRun.result?.kpis, WITNESS_COMPONENTS)[0] ?? null,
    [colRun.result]);

  const built = useMemo(() => {
    if (!feed) return null;
    const inlets = bindInlets(
      colRun.result?.streams, feed.kpis, WITNESS_COMPONENTS);
    if (!inlets.ok) return { ok: false as const, why: inlets.why };
    const order = cornerOrder(WITNESS_COMPONENTS,
      [WITNESS_CARRIER, WITNESS_SOLVENT, WITNESS_SOLUTE]);
    return buildConstruction(inlets.feed, inlets.solvent, feed.stages, order);
  }, [feed, colRun.result]);

  const cons = built?.ok ? built.construction : null;
  const worst = cons ? worstResidual(cons) : null;

  // ---- The engine's own caveats, lifted onto the surface --------------------
  const tpdMap = countMatching(mapRun.result?.log, TPD_RE);
  const tpdCol = countMatching(colRun.result?.log, TPD_RE);
  const tpdTotal = tpdMap.count + tpdCol.count;
  const tpdFirst = tpdMap.first ?? tpdCol.first;

  const alerts: JSX.Element[] = [];
  if (mapRun.err) alerts.push(
    <Alert key="e1" color="red" variant="light" m={12}
      title="The map run refused or failed — the engine's message, verbatim">
      <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{mapRun.err}</Text>
    </Alert>);
  if (colRun.err) alerts.push(
    <Alert key="e2" color="red" variant="light" m={12}
      title="The cascade run refused or failed — the engine's message, verbatim">
      <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{colRun.err}</Text>
    </Alert>);
  if (scanRead && !scanRead.ok) alerts.push(
    <Alert key="e3" color="orange" variant="light" m={12}
      title="The map run produced no phase map">
      <Text size="xs">{scanRead.why}</Text>
    </Alert>);
  if (built && !built.ok) alerts.push(
    <Alert key="e4" color="orange" variant="light" m={12}
      title="The construction cannot be placed on the diagram">
      <Text size="xs">{built.why}</Text>
    </Alert>);
  if (tpdTotal > 0) alerts.push(
    <Alert key="tpd" color="yellow" variant="light" m={12}
      title={`The flash flags its own answers: ${tpdTotal} stability warnings`}>
      <Text size="xs">
        Every tie-line here — the map&apos;s and the cascade&apos;s — is a
        converged two-liquid split whose tangent-plane test says a further
        split may be favourable. The engine warns and does not refuse, so the
        diagram is drawn and the warning travels with it. The first, verbatim:
      </Text>
      <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{tpdFirst}</Text>
    </Alert>);
  if (cons && cons.openCompositions.length > 0) alerts.push(
    <Alert key="open" color="yellow" variant="light" m={12}
      title="A published composition does not sum to one">
      <Text size="xs">
        {cons.openCompositions.join("; ")} — reported as published; the view
        does not renormalise, because a composition that does not close is a
        fact about the run.
      </Text>
    </Alert>);

  // The rail's contents.  Knob descriptors are handed to the shared
  // `KnobSlider` WHOLE (the tie-triangle knob type carries the structural
  // `PanelKnob` fields), so this tool's inputs look and behave like every
  // other EduTool's.
  const controls = (
    <>
      <KnobField label="frame">
        <SegmentedControl size="xs" value={zoom} fullWidth
          onChange={(v) => setZoom(v === "delta" ? "delta" : "triangle")}
          data={[
            { label: "triangle", value: "triangle" },
            { label: "include Δ", value: "delta" },
          ]} />
      </KnobField>
      {busy && (
        <Group gap={6} wrap="nowrap" align="center">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            re-solving the map AND the cascade — seconds, not instant
          </Text>
        </Group>
      )}
      {TIE_TRIANGLE_KNOBS.map((k) => (
        <KnobSlider key={k.id} knob={k} value={knobs[k.id] ?? k.def} showWhy
          onChange={(v) => setKnobs((s) => ({ ...s, [k.id]: v }))} />
      ))}
      <PanelNote>
        Runs tutorials/{MAP_WITNESS} (choupoProps) AND
        tutorials/{COLUMN_WITNESS} (choupoSolve) with your parameters, in your
        browser.
      </PanelNote>
      <PanelNote>
        One system, two runs: the two cases declare the same components, the
        same gammaGamma formulation and the same UNIFAC model, and carry
        byte-identical sealed component records and UNIFAC pair tables — so the
        map&apos;s tie-lines and the column&apos;s stages are the same physics.
      </PanelNote>
      <PanelNote>
        There is NO temperature knob: the map&apos;s T sits in an inline
        sub-dict the override grammar cannot reach, and moving the column alone
        would draw one temperature&apos;s stages on another temperature&apos;s
        map.
      </PanelNote>
    </>
  );

  /*  ONE renderer for the lesson, above BOTH returns: the empty state and
   *  the full page show the same steps.  The Rayleigh tool shipped with the
   *  explanation only in the branch that HAD a diagram, so it vanished
   *  exactly when there was nothing to explain -- that is the defect this
   *  shape avoids. */
  const lessonStep = lessonStepper(HUNTER_NASH_STEPS);

  const lessonHead = (
    <Box>
      <Title order={3}>Extraction, where the operating line becomes a point</Title>
      <Text size="sm" c="dimmed" mt={4}>
        The fifth time you meet this construction — and the first time it
        leaves the x–y plane.
      </Text>
    </Box>
  );

  const lessonLimits = (
    <Box>
      <Title order={5}>What this does not model</Title>
      <Box mt={4} style={{ display: "grid", columnGap: 16, rowGap: 6,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {HUNTER_NASH_LIMITS.map((l) => (
          <Text key={l.id} size="xs" c="dimmed">
            <b>{l.title}</b> {l.body}
          </Text>
        ))}
      </Box>
    </Box>
  );

  if (!cons) {

    return (
      <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
        <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        {lessonHead}
        {alerts}
        {[1, 2, 3, 4, 5].map(lessonStep)}
        <Stack gap={8} style={{ maxWidth: 280 }}>{controls}</Stack>
        <Box style={{ display: "flex", alignItems: "center",
          justifyContent: "center", padding: 12 }}>
          {busy || (colRun.result === null && colRun.err === null) ? (
            <Group gap="sm" wrap="nowrap" align="center">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                the engine is sweeping the simplex and tearing the cascade —
                seconds, not instant
              </Text>
            </Group>
          ) : (
            <Text size="sm" c="dimmed" ta="center" maw={520}>
              No construction yet. It needs an extractor profile carrying a
              stage axis with xE_&lt;comp&gt; and xR_&lt;comp&gt; columns, a KPI
              block carrying F_feed / F_solvent / F_extract / F_raffinate, and
              the run&apos;s two inlet streams.
            </Text>
          )}
        </Box>
        {lessonLimits}
        </Stack>
      </Box>
    );
  }

  const stages = feed?.stages ?? [];
  const recovery = feed?.kpis[`recovery_${WITNESS_SOLUTE}`];

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
      {lessonHead}
      {alerts}
      {lessonStep(1)}
      {lessonStep(2)}
      {lessonStep(3)}
      {lessonStep(4)}

      <Box>
        <Title order={5}>Now read the cascade the engine solved</Title>
        <Text size="sm" mt={4}>
          The triangle below carries the engine’s own tie-lines, its cascade
          stage by stage, and the difference point located by two independent
          balances.  Turn the knobs and watch Δ move — and notice where it
          goes.
        </Text>
      </Box>

      <Box style={{ display: "grid", gap: 14,
        gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
        <Stack gap={8}>{controls}</Stack>
        <Box style={{ minWidth: 0 }}>

      <Group gap="sm" wrap="wrap" align="center" px={12} py={6} style={{ flexShrink: 0 }}>
        <Tooltip withArrow multiline w={460}
          label={"Hunter-Nash says Δ, R_j and E_{j+1} are colinear at EVERY "
            + "cut, because the net stream Δ = F − E₁ = R_j − E_{j+1} is the "
            + "same at every one.  Δ was located from two of those lines "
            + "(F–E₁ and R_N–S), so the remaining cuts are a TEST: this is the "
            + "largest perpendicular distance from the engine's own E_{j+1} to "
            + "the line through Δ and its own R_j, in units where a triangle "
            + "edge is 1.  It comes out of the same ORDER as the cascade's own "
            + "stopping tolerance (a relative mass closure of 1e-4) — an "
            + "order-of-magnitude remark and not an identity, since a mass "
            + "closure and a distance on a diagram are different quantities."}>
          <Badge variant="light" color={worst === null ? "gray" : "cyan"} tt="none"
            styles={{ root: { cursor: "help" } }}>
            worst colinearity residual = {fmt(worst)} (triangle edge = 1)
          </Badge>
        </Tooltip>
        <Tooltip withArrow multiline w={460}
          label={"Two independent determinations of the SAME point.  The "
            + "circle is where the line F–S crosses the line E₁–R_N (the "
            + "construction).  The lever-rule value is (F·z_F + S·z_S)/(F+S) "
            + "from the run's own published flows and compositions.  They are "
            + "not the same calculation, so their gap is a real check on the "
            + "cascade's overall balance."}>
          <Badge variant="light" color="grape" tt="none"
            styles={{ root: { cursor: "help" } }}>
            M: construction vs lever rule = {fmt(cons.mixingGap)}
          </Badge>
        </Tooltip>
        {typeof recovery === "number" && (
          <Badge variant="light" color="teal" tt="none">
            {WITNESS_SOLUTE} recovery to extract = {(100 * recovery).toFixed(1)} %
            {" "}over {stages.length} stage{stages.length === 1 ? "" : "s"}
          </Badge>
        )}
        {scan && (
          <Badge variant="light" color="orange" tt="none">
            map: {scan.ties.length} published tie-lines, {scan.nodes.length} classified nodes
          </Badge>
        )}
      </Group>

      <TriangleSvg scan={scan} stages={stages} cons={cons}
        corners={[WITNESS_CARRIER, WITNESS_SOLVENT, WITNESS_SOLUTE]}
        zoom={zoom} busy={busy} />

      {/* What the picture is, and what it is not.  Both halves are required
          reading, and neither is a preference. */}
      <Box px={12} pb={8} style={{ flexShrink: 0 }}>
        <Text size="xs" c="dimmed">
          <b>Engine output:</b> the brown dots are the scan&apos;s per-node
          phase classification and the thin brown segments its tie-lines, both
          straight off <code>{MAP_CSV}</code>
          (<code>x1,x2,x3,region,kind,tieline_id</code>). The thick cyan
          segments are the cascade&apos;s per-stage tie-lines — the profile
          columns <code>xR_&lt;comp&gt;</code> and <code>xE_&lt;comp&gt;</code>,
          which are the two liquids that stage&apos;s LL flash produced. F and S
          are the run&apos;s two inlet streams, bound to the cascade by the
          <code> F_feed</code> / <code>F_solvent</code> KPIs rather than by
          name. A stage&apos;s pair is an equilibrium pair to the
          cascade&apos;s own convergence and no further: the sweep is
          under-relaxed, so what is published is the fixed point it settled on
          rather than the raw output of one flash.
        </Text>
        <Text size="xs" c="dimmed" mt={2}>
          <b>Drawn by this view:</b> the projection onto the triangle; the two
          crossings that locate M and Δ; the operating lines through Δ; the
          perpendicular distances reported above. Nothing else.
        </Text>
        <Text size="xs" c="dimmed" mt={2}>
          <b>Not on this diagram, because nothing publishes it:</b> the binodal
          CURVE (the engine publishes tie-line ends and a node classification,
          not a curve through them); the plait point; the spinodal; and any
          tie-line at a composition the engine did not solve — which is why the
          staircase walks the cascade&apos;s own stages instead of counting
          stages graphically. A graphical stage count needs an engine surface
          that returns the tie-line through a GIVEN composition; that surface
          does not exist yet.
        </Text>
        {scan && (
          <Text size="xs" c="dimmed" mt={2}>
            Shallowest published split on the map: β = {fmt(scan.minorBetaMin, 2)}
            {" "}at {scan.minorBetaMinCount} node
            {scan.minorBetaMinCount === 1 ? "" : "s"} — the minimum of the
            engine&apos;s own phase-fraction columns, quoted so the reader can
            see how nearly single-phase the weakest tie-line is. Nothing is
            filtered on it.
            {scan.skippedRows > 0
              && ` ${scan.skippedRows} CSV row(s) were unreadable and are not drawn.`}
            {scan.unpairedTies > 0
              && ` ${scan.unpairedTies} tie id(s) arrived without a partner row `
                + "and are not drawn (a tie-line is two compositions)."}
          </Text>
        )}
        <Text size="xs" c="dimmed" mt={2}>
          The dotted operating line is the cut R_N–S, one of the two that
          located Δ: it closes exactly by construction and is not evidence of
          anything.
        </Text>
      </Box>
        </Box>
      </Box>

      {lessonStep(5)}
      {lessonLimits}
      </Stack>
    </Box>
  );
}
