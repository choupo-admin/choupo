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
  ActiveSetQpTool — the working set, watched changing, on the one QP whose
  answer this engine asserts before every constrained optimisation it runs.

  TWO PANELS, AND THE PAGE SAYS WHICH IS WHICH AT THE TOP OF EACH.

  THE CONSTRUCTION panel draws the engine's own self-check problem
  (`verifyActiveSetQP`, src/solver/ActiveSetQP.cpp:320-360) in the plane: the
  objective's circular contours, the three half-planes, and the path the
  active-set method walks from the origin.  A reader moves the unconstrained
  minimum, moves the budget line, and warm-starts the working set — and
  watches constraints being ADDED when a step runs into them and DROPPED when
  a multiplier goes negative.  The answer at the DEFAULT knobs is the one the
  engine asserts to 1e-9, and the page prints that comparison rather than
  claiming agreement.

  THE ENGINE panel runs `analysis02_weighted_least_squares` in the browser: a
  real laboratory water analysis that does not balance on charge, reconciled
  by exactly this solver, with each law's LAGRANGE MULTIPLIER published as the
  number of standard deviations that law is responsible for moving each
  measurement.  Nothing on it is computed here — the table is read out of the
  solved stream file the run wrote.

  WHY THE PATH IS THE SUBJECT AND THE ANSWER IS NOT.  A QP solver that
  returns the right vector teaches nothing; every library does.  What a
  student needs to see is that the hard part is a COMBINATORIAL guess — which
  constraints are tight — and that the two corrections to a wrong guess are
  the two events drawn here.

  ACCESSIBILITY.  A constraint in the working set is drawn heavier AND named
  in the step table AND listed in words beside the plot; the action of each
  iteration is a word, never a colour.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Stack, Table, Text,
  Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { useNarrowViewport } from "./methodsChrome.js";
import { QP_LIMITS, QP_STEPS } from "./activeSetQpLesson.js";
import { KnobSlider, PanelNote, type PanelKnob } from "./knobPanel.js";
import { useMethodRun } from "../../case/methodRun.js";
import { parse } from "../../dict/parser.js";
import { toJson } from "../../dict/json.js";
import {
  ALKALINITY_SIGMA_DEFAULT_PCT, HAND_WORKED, HAND_WORKED_ANSWER, QP_WITNESS,
  activeSetQP, alkalinitySigmaOverride, analysisLines, objective,
  readReconciliation, rowValue,
  type QPProblem,
} from "./activeSetQpMath.js";

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const CONTOUR = "#90a4ae";
const ACTIVE = "#ffb74d";
const INACTIVE = "#78909c";
const PATH = "#26c6da";
const ANSWER = "#ce93d8";

const VW = 420, VH = 360;
const PAD = 40;

const fmt = (v: number, d = 4): string =>
  Number.isFinite(v) ? v.toFixed(d) : "—";

// ---- Knobs ------------------------------------------------------------------

const G1: PanelKnob = {
  id: "g1", label: "unconstrained minimum, d1", min: -1, max: 3, step: 0.1,
  why: "Where the objective would sit if nothing constrained it. Choupo "
    + "stores the linear term g, and the unconstrained minimum is at -g, so "
    + "moving this moves g. Drag it into the feasible region and every "
    + "constraint becomes slack: the working set empties and the method "
    + "stops in one step.",
};
const G2: PanelKnob = {
  id: "g2", label: "unconstrained minimum, d2", min: -1, max: 3, step: 0.1,
  why: "The other coordinate of the same point. The line between it and the "
    + "answer is the whole story of which constraints got in the way.",
};
const BUDGET: PanelKnob = {
  id: "c", label: "the budget line  d1 + d2 <= c", min: 0.2, max: 3.5,
  step: 0.1,
  why: "Row 0 of the engine's own self-check problem. Loosen it past the "
    + "unconstrained minimum and it stops binding; tighten it and it binds "
    + "harder, and its multiplier — the price of the budget — rises with it.",
};
const SIGMA: PanelKnob = {
  id: "sigma", label: "declared uncertainty of the alkalinity titration",
  min: 0.5, max: 20, step: 0.5, unit: "percent",
  why: "The QP's WEIGHT on that one measurement. The objective is a sum of "
    + "squared corrections measured in each row's own sigma, so a row "
    + "declared precise is expensive to move and a loose one is cheap. Widen "
    + "this and watch the charge correction migrate onto alkalinity.",
};

// ---- The drawing ------------------------------------------------------------

function QpPlot({ qp, path, active, answer }: {
  qp: QPProblem;
  path: readonly (readonly number[])[];
  active: readonly boolean[];
  answer: readonly number[];
}): JSX.Element {
  const lo = -0.6, hi = 3.2;
  const X = (v: number) => PAD + ((VW - 2 * PAD) * (v - lo)) / (hi - lo);
  const Y = (v: number) => VH - PAD - ((VH - 2 * PAD) * (v - lo)) / (hi - lo);
  //  B is the identity in every problem this page draws, so the contours are
  //  circles centred on the unconstrained minimum at -g.  Stated rather than
  //  assumed: a general B would give ellipses and this drawing does not.
  const cx = -(qp.g[0] ?? 0), cy = -(qp.g[1] ?? 0);
  const radii = [0.4, 0.8, 1.2, 1.6, 2.2, 2.8];

  /** A constraint row drawn as the line where it is exactly satisfied, over
   *  the whole window. */
  const line = (a: readonly number[], b: number): string => {
    const a1 = a[0] ?? 0, a2 = a[1] ?? 0;
    const pts: [number, number][] = [];
    if (Math.abs(a2) > 1e-12) {
      pts.push([lo, -(a1 * lo + b) / a2]);
      pts.push([hi, -(a1 * hi + b) / a2]);
    } else if (Math.abs(a1) > 1e-12) {
      pts.push([-b / a1, lo]);
      pts.push([-b / a1, hi]);
    }
    return pts.map(([u, v]) => `${X(u).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  };

  return (
    <Box style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%"
        style={{ display: "block", minWidth: 300, maxWidth: 460 }}
        role="img"
        aria-label={"The quadratic programme in the plane: circular objective "
          + "contours, the constraint lines, and the path the active-set "
          + "method walks from the origin to the answer"}>
        <defs>
          <clipPath id="qpwin">
            <rect x={PAD} y={PAD} width={VW - 2 * PAD} height={VH - 2 * PAD} />
          </clipPath>
        </defs>
        {/* axes */}
        <line x1={X(lo)} x2={X(hi)} y1={Y(0)} y2={Y(0)} stroke={GRID} />
        <line x1={X(0)} x2={X(0)} y1={Y(lo)} y2={Y(hi)} stroke={GRID} />
        <text x={X(hi)} y={Y(0) + 14} textAnchor="end" fontSize={10} fill={INK}>
          d1
        </text>
        <text x={X(0) + 6} y={PAD + 2} fontSize={10} fill={INK}>d2</text>

        <g clipPath="url(#qpwin)">
          {radii.map((r) => (
            <circle key={r} cx={X(cx)} cy={Y(cy)}
              r={((VW - 2 * PAD) * r) / (hi - lo)} fill="none"
              stroke={CONTOUR} strokeWidth={0.8} strokeDasharray="2 4" />
          ))}
          {qp.Aineq.map((a, k) => (
            <polyline key={k} points={line(a, qp.bineq[k] ?? 0)} fill="none"
              stroke={active[k] ? ACTIVE : INACTIVE}
              strokeWidth={active[k] ? 2.6 : 1.2} />
          ))}
          <polyline
            points={path.map((p) =>
              `${X(p[0] ?? 0).toFixed(1)},${Y(p[1] ?? 0).toFixed(1)}`).join(" ")}
            fill="none" stroke={PATH} strokeWidth={2} />
          {path.map((p, i) => (
            <g key={i}>
              <circle cx={X(p[0] ?? 0)} cy={Y(p[1] ?? 0)} r={3.2} fill={PATH} />
              <text x={X(p[0] ?? 0) + 6} y={Y(p[1] ?? 0) - 5} fontSize={9}
                fill={PATH}>{i}</text>
            </g>
          ))}
          <circle cx={X(cx)} cy={Y(cy)} r={3.6} fill="none" stroke={CONTOUR}
            strokeWidth={1.6} />
          <text x={X(cx) + 7} y={Y(cy) + 3} fontSize={9} fill={CONTOUR}>
            unconstrained
          </text>
          <polygon fill={ANSWER}
            points={`${X(answer[0] ?? 0)},${Y(answer[1] ?? 0) - 5} `
              + `${X(answer[0] ?? 0) - 4.5},${Y(answer[1] ?? 0) + 3.5} `
              + `${X(answer[0] ?? 0) + 4.5},${Y(answer[1] ?? 0) + 3.5}`} />
        </g>
        <text x={PAD} y={VH - 10} fontSize={9} fill={INK}>
          heavy line = in the working set · triangle = the answer
        </text>
      </svg>
    </Box>
  );
}

// ---- The tool ---------------------------------------------------------------

export function ActiveSetQpTool(): JSX.Element {
  const step = lessonStepper(QP_STEPS);

  /*  ONE COLUMN ON A PHONE.  Every panel here is a knob rail beside a drawing,
   *  and at 400 px a two-column grid leaves each of them about 190 px: the
   *  sliders collide with their own labels and the plot is a stripe.  The
   *  posture comes from `useNarrowViewport`, the ONE detection home
   *  (methodsChrome), rather than from a CSS media query this file would then
   *  own a second copy of.  */
  const narrow = useNarrowViewport();
  const rail = narrow ? "1fr" : "minmax(190px, 240px) 1fr";

  const [g1, setG1] = useState(1);
  const [g2, setG2] = useState(2);
  const [budget, setBudget] = useState(1);
  const [start, setStart] = useState<"cold" | "bounds">("cold");

  const qp: QPProblem = useMemo(() => ({
    ...HAND_WORKED,
    g: [-g1, -g2],
    bineq: [-budget, 0, 0],
    ineqLabels: [`d1 + d2 <= ${budget}`, "d1 >= 0", "d2 >= 0"],
  }), [g1, g2, budget]);

  const warm = start === "bounds" ? [false, true, true] : undefined;
  const trace = useMemo(() => activeSetQP(qp, warm), [qp, warm]);

  /** The ANCHOR: the engine's own self-check problem, solved here, beside the
   *  answer the engine asserts for it.  Run whatever the knobs say, so the
   *  comparison is always on screen. */
  const anchor = useMemo(() => {
    const t = activeSetQP(HAND_WORKED);
    const dGap = Math.max(
      ...HAND_WORKED_ANSWER.d.map((v, i) => Math.abs((t.d[i] ?? 0) - v)));
    const lGap = Math.max(...HAND_WORKED_ANSWER.lambdaIneq.map((v, i) =>
      Math.abs((t.lambdaIneq[i] ?? 0) - v)));
    return { t, worst: Math.max(dGap, lGap) };
  }, []);

  const path = useMemo(() => {
    const pts: number[][] = [];
    for (const s of trace.steps) {
      if (pts.length === 0) pts.push([...s.x]);
      const last = pts[pts.length - 1]!;
      if (Math.hypot((s.xNext[0] ?? 0) - (last[0] ?? 0),
        (s.xNext[1] ?? 0) - (last[1] ?? 0)) > 1e-12) pts.push([...s.xNext]);
    }
    return pts;
  }, [trace]);

  // ---- The engine ----------------------------------------------------------
  const [sigmaPct, setSigmaPct] = useState(ALKALINITY_SIGMA_DEFAULT_PCT);
  const run = useMethodRun(QP_WITNESS, alkalinitySigmaOverride(sigmaPct),
    String(sigmaPct), "choupoSolve");
  const rec = useMemo(() => readReconciliation(
    run.result?.convergedFiles,
    (t) => toJson(parse(t, { sourceName: "converged/feed" })) as
      { [k: string]: unknown }), [run.result]);
  const lines = analysisLines(run.log);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>

        <Box>
          <Title order={3}>
            Constrained quadratic programming: the active-set method
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            Minimise a quadratic subject to linear constraints. It is the one
            non-trivial optimisation problem that finishes exactly, in finitely
            many steps, and it is the inner problem of every SQP iteration. The
            hard part is not the algebra — it is guessing which constraints the
            answer will be pressed against, and the method is the search for
            that guess.
          </Text>
        </Box>

        {step(1)}
        {step(2)}

        {/* ---------------- THE CONSTRUCTION ---------------- */}
        <Box style={{ borderLeft: `3px solid ${ACTIVE}`, paddingLeft: 12 }}>
          <Title order={4}>The working set, watched changing</Title>
          <Text size="sm" mt={4}>
            The problem drawn below is the engine&apos;s own self-check
            problem, unchanged: minimise ½(d₁² + d₂²) − d₁ − 2d₂ subject to
            d₁ + d₂ ≤ 1, d₁ ≥ 0, d₂ ≥ 0. Choupo solves exactly this and
            asserts the answer against a hand-worked solution to 1e-9 before
            every constrained optimisation it runs — and if it cannot, it
            throws with the words{" "}
            <Text span fs="italic">
              ActiveSetQP is BROKEN — nothing downstream is trustworthy
            </Text>. The path is recomputed here, by a transcription of the
            engine&apos;s own loop, because the engine publishes the answer and
            not the sequence of working sets.
          </Text>
        </Box>

        <Box style={{ display: "grid", gap: 16,
          gridTemplateColumns: rail }}>
          <Stack gap={8}>
            <KnobSlider knob={G1} value={g1} showWhy onChange={setG1} />
            <KnobSlider knob={G2} value={g2} showWhy onChange={setG2} />
            <KnobSlider knob={BUDGET} value={budget} showWhy
              onChange={setBudget} />
            <Box>
              <Text size="xs" fw={600} mb={4}>start the working set</Text>
              <SegmentedControl size="xs" fullWidth orientation="vertical"
                value={start}
                onChange={(v) => setStart(v as "cold" | "bounds")}
                data={[
                  { value: "cold", label: "cold — nothing active" },
                  { value: "bounds", label: "warm — both bounds active" },
                ]} />
            </Box>
            <PanelNote>
              The warm start is how the SQP driver actually calls this: the
              previous iteration&apos;s active set is a good guess at the next
              one&apos;s. Choose it here and the first thing that happens is a
              DROP — the origin is on both bounds, both multipliers come out
              negative, and the method has to release them one at a time.
            </PanelNote>
            <PanelNote>
              B is the identity in every problem drawn here, which is why the
              contours are circles. A general positive-definite B gives
              ellipses and the method is unchanged; only the picture is.
            </PanelNote>
          </Stack>

          <Stack gap={10}>
            <QpPlot qp={qp} path={path} active={trace.active}
              answer={trace.d} />
            <Group gap="xs" wrap="wrap">
              <Badge variant="light" color={trace.converged ? "teal" : "red"}>
                {trace.converged ? trace.reason : "did not settle"}
              </Badge>
              <Badge variant="outline">
                answer ({fmt(trace.d[0] ?? 0, 4)}, {fmt(trace.d[1] ?? 0, 4)})
              </Badge>
              <Badge variant="outline">
                f = {fmt(objective(qp, trace.d), 4)}
              </Badge>
              <Badge variant="outline">
                active: {trace.active
                  .map((a, k) => (a ? qp.ineqLabels?.[k] ?? `row ${k}` : null))
                  .filter(Boolean).join(", ") || "none"}
              </Badge>
            </Group>

            <Box style={{ width: "100%", overflowX: "auto" }}>
              <Table striped withTableBorder fz="xs" miw={560}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>it</Table.Th>
                    <Table.Th>working set</Table.Th>
                    <Table.Th>step p</Table.Th>
                    <Table.Th>α</Table.Th>
                    <Table.Th>multipliers</Table.Th>
                    <Table.Th>what happened</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {trace.steps.map((s) => (
                    <Table.Tr key={s.it}>
                      <Table.Td ff="monospace">{s.it}</Table.Td>
                      <Table.Td ff="monospace">
                        {s.working.length > 0
                          ? s.working.map((k) => `row ${k}`).join(", ")
                          : "empty"}
                      </Table.Td>
                      <Table.Td ff="monospace">
                        {s.p.length > 0
                          ? `(${fmt(s.p[0] ?? 0, 3)}, ${fmt(s.p[1] ?? 0, 3)})`
                          : "—"}
                      </Table.Td>
                      <Table.Td ff="monospace">{fmt(s.alpha, 3)}</Table.Td>
                      <Table.Td ff="monospace">
                        {s.lambda.length > 0
                          ? s.lambda.map((l) => fmt(l, 3)).join(", ") : "—"}
                      </Table.Td>
                      <Table.Td>
                        {s.action === "add"
                          ? `ADD row ${s.row} — the step ran into it`
                          : s.action === "drop"
                          ? `DROP row ${s.row} — its multiplier went negative`
                          : s.action === "optimal"
                          ? "OPTIMAL — step zero, every multiplier ≥ 0"
                          : s.action === "step"
                          ? "a full step, nothing in the way"
                          : s.action === "licq"
                          ? "LICQ recovery — the KKT system went singular"
                          : "the working-set cap — the engine throws here"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>

            <Box px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                the anchor
              </Text>
              <Text size="sm">
                On the engine&apos;s own self-check problem this page&apos;s
                transcription answers{" "}
                <Text span ff="monospace">
                  ({fmt(anchor.t.d[0] ?? 0, 6)}, {fmt(anchor.t.d[1] ?? 0, 6)})
                </Text>{" "}
                with multipliers{" "}
                <Text span ff="monospace">
                  ({anchor.t.lambdaIneq.map((l) => fmt(l, 4)).join(", ")})
                </Text>. The engine asserts (0, 1) and (1, 0, 0); the largest
                disagreement is{" "}
                <Text span ff="monospace">
                  {anchor.worst.toExponential(2)}
                </Text>. Note that d₁ = 0 sits exactly ON its own bound with a
                multiplier of zero — a degenerate vertex, which is a good thing
                to have in an anchor and a bad thing to meet by surprise.
              </Text>
            </Box>

            <Box>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                constraint values at the answer
              </Text>
              {qp.Aineq.map((a, k) => {
                const v = rowValue(a, qp.bineq[k] ?? 0, trace.d);
                return (
                  <Text key={k} size="xs" ff="monospace">
                    {qp.ineqLabels?.[k] ?? `row ${k}`} → {fmt(v, 6)}{" "}
                    {trace.active[k] ? "(tight, in the working set)"
                      : "(slack)"}; multiplier{" "}
                    {fmt(trace.lambdaIneq[k] ?? 0, 4)}
                  </Text>
                );
              })}
            </Box>
          </Stack>
        </Box>

        {step(3)}
        {step(4)}
        {step(5)}
        {step(6)}
        {step(7)}

        {/* ---------------- THE ENGINE ---------------- */}
        <Box style={{ borderLeft: `3px solid ${PATH}`, paddingLeft: 12 }}>
          <Title order={4}>
            Measured: a water analysis that does not balance, reconciled
          </Title>
          <Text size="sm" mt={4}>
            Everything below this line is one run of{" "}
            <Text span ff="monospace" size="xs">
              tutorials/{QP_WITNESS}
            </Text>
            . The sheet reports calcium, chloride, alkalinity and total
            hardness, each with its own declared uncertainty, and it carries
            0.78 % more positive charge than negative — which no aqueous
            solution does. The engine sets up the QP of step 6 and hands it to
            the same active-set solver drawn above. The table is read out of
            the solved stream file the run wrote; nothing in it is computed by
            this page.
          </Text>
        </Box>

        <Box style={{ display: "grid", gap: 16,
          gridTemplateColumns: rail }}>
          <Stack gap={8}>
            <KnobSlider knob={SIGMA} value={sigmaPct} showWhy
              onChange={setSigmaPct} />
            {run.busy && (
              <Group gap={6}><Loader size="xs" />
                <Text size="xs" c="dimmed">reconciling…</Text></Group>
            )}
            <PanelNote>
              The knob writes the alkalinity row&apos;s declared{" "}
              <Text span ff="monospace" size="xs">uncertainty</Text> in the
              case&apos;s own{" "}
              <Text span ff="monospace" size="xs">0/feed</Text>, in per cent,
              and nothing else. Every other number on this panel is the
              engine&apos;s.
            </PanelNote>
          </Stack>

          <Stack gap={10}>
            {run.err && (
              <Alert color="red" title="The run did not finish">
                <Text size="sm">{run.err}</Text>
              </Alert>
            )}
            {rec ? (
              <>
                <Group gap="xs" wrap="wrap">
                  <Badge variant="light">method {rec.method}</Badge>
                  <Badge variant="outline">
                    Σ((x−m)/σ)² = {fmt(rec.objective, 4)}
                  </Badge>
                  <Badge variant="outline">
                    {rec.workingSetChanges} working-set change
                    {rec.workingSetChanges === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="outline">
                    charge {fmt(rec.imbalanceBeforePct, 4)} % →{" "}
                    {fmt(rec.imbalanceAfterPct, 4)} %
                  </Badge>
                  {rec.maxCorrectionSigma !== null && (
                    <Badge variant="outline">
                      limit {rec.maxCorrectionSigma} σ
                    </Badge>
                  )}
                </Group>

                <Box style={{ width: "100%", overflowX: "auto" }}>
                  <Table striped withTableBorder fz="xs" miw={600}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>measurement</Table.Th>
                        <Table.Th>reported</Table.Th>
                        <Table.Th>reconciled</Table.Th>
                        <Table.Th>σ declared</Table.Th>
                        <Table.Th>moved</Table.Th>
                        <Table.Th>by which law, exactly</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {rec.rows.map((r) => (
                        <Table.Tr key={r.label}>
                          <Table.Td ff="monospace">{r.label}</Table.Td>
                          <Table.Td ff="monospace">
                            {r.reported.toExponential(4)}
                          </Table.Td>
                          <Table.Td ff="monospace">
                            {r.adjusted.toExponential(4)}
                          </Table.Td>
                          <Table.Td ff="monospace">{r.sigmaPct} %</Table.Td>
                          <Table.Td ff="monospace">
                            {r.correctionSigma >= 0 ? "+" : ""}
                            {fmt(r.correctionSigma, 4)} σ
                            {r.atBound ? " (at its bound)" : ""}
                          </Table.Td>
                          <Table.Td>
                            {r.causedBy.map((c) =>
                              `${c.law}: ${c.deltaSigma >= 0 ? "+" : ""}`
                              + `${fmt(c.deltaSigma, 4)} σ`).join("  ·  ")}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Box>

                <Text size="sm">
                  Read the last column. Those parts are not attributed shares —
                  they are the terms of the stationarity identity of step 7,
                  and they sum EXACTLY to the correction beside them. The
                  engine asserts that before it publishes them, because a
                  published attribution that does not add up is worse than
                  none.
                </Text>

                <Box>
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                    the enforced laws, and what each one cost
                  </Text>
                  {rec.laws.map((l) => (
                    <Text key={l.name} size="xs">
                      <Text span ff="monospace" fw={600}>{l.name}</Text>{" "}
                      multiplier {fmt(l.multiplier, 4)}{" "}
                      {l.binding ? "(binding)" : "(slack)"} — {l.meaning}
                    </Text>
                  ))}
                </Box>
              </>
            ) : !run.busy && !run.err ? (
              <Text size="sm" c="dimmed">
                This run published no reconciliation block, so there is nothing
                to draw. The page computes nothing in its place.
              </Text>
            ) : null}

            {lines.length > 0 && (
              <Box px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                  what the run said on the console
                </Text>
                {lines.map((l, i) => (
                  <Text key={i} size="xs" ff="monospace"
                    style={{ whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere" }}>{l}</Text>
                ))}
              </Box>
            )}
          </Stack>
        </Box>

        <LessonLimits limits={QP_LIMITS} />
      </Stack>
    </Box>
  );
}
