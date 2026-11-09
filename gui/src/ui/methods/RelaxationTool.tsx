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
  RelaxationTool -- why a recycle must be iterated, and the three ways to do
  it (DEV.md 4c C246).  The ENTRY page of the numerics path "Recycle numerics";
  the Wegstein page is its second rung.

  FOUR FIGURES, EACH LIVE.  (i) the cobweb with a draggable loop gain and a
  relaxation slider, the effective slope drawn as a second line; (ii) the
  error per pass on a log axis for direct substitution, relaxed, Wegstein and
  Newton side by side; (iii) the (a, w) map; (iv) the engine half -- the tear
  mass imbalance per pass of process03_recycle under `recycleSolver
  directSubstitution; recycleRelaxation w;` for three w, READ from three
  in-browser runs and computed nowhere on this page.

  Figures (i)-(iii) are a one-variable linear toy declared in relaxationMath;
  figure (iv) is the engine.  The page says which at the top of each half.
  Colours and dash patterns per method are the Wegstein page's (direct red,
  Wegstein orange, Newton blue); the relaxed method is green.  Colour never
  carries meaning alone: each curve also differs by dash and marker.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Stack, Text, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper, LessonReferences } from "./lessonStep.js";
import { RELAXATION_LIMITS, RELAXATION_STEPS } from "./relaxationLesson.js";
import { GainMap, RELAXED, SlopeCobweb } from "./RelaxationFigures.js";
import { DIRECT, ErrorPlot, MEASURED, NEWTON, WEGSTEIN } from "./WegsteinTool.js";
import { KnobSlider, type PanelKnob } from "./knobPanel.js";
import { useNarrowViewport } from "./methodsChrome.js";
import { useMethodRun } from "../../case/methodRun.js";
import { OriginMark } from "./origin.js";
import { recycleResidual } from "./wegsteinMath.js";
import {
  ENGINE_QMAX, ENGINE_QMIN, ENGINE_W_VALUES, GAIN_MAX, GAIN_MIN, OPEN_QMAX,
  OPEN_QMIN, RELAXATION_WITNESS, W_MAX, W_MIN, drive, effectiveSlope,
  optimalW, passesToReduce, region, relaxationOverrides,
} from "./relaxationMath.js";

const GAIN: PanelKnob = {
  id: "a", label: "loop gain a", min: GAIN_MIN, max: GAIN_MAX, step: 0.01,
  why: "How much of a mistake in the guess survives one trip round the "
    + "loop (the slope of the plant's response). Below -1 the loop "
    + "overshoots wildly; above 1 it runs away. You can also drag the red "
    + "dot in the first figure.",
};
const FACTOR: PanelKnob = {
  id: "w", label: "relaxation factor w", min: W_MIN, max: W_MAX, step: 0.01,
  why: "The fraction of the way from the old guess to what the plant "
    + "returned. 1 is plain substitution. The engine's recycleRelaxation "
    + "accepts 0 < w <= 1; the part above 1 is drawn so you can see what "
    + "Wegstein does.",
};

/** Floor for the log plot: an exact zero (Newton's one-step landing) cannot be
 *  drawn on a log axis, so it is drawn at the machine floor. */
const FLOOR = 1e-16;

/** The engine's own verdict, quoted rather than reconstructed. */
const verdictOf = (log: string | null | undefined): string | null =>
  (log ?? "").split("\n").map((l) => l.trim())
    .find((l) => /^(Recycle converged|WARNING: recycle)/.test(l)) ?? null;

/** One engine run of the witness at a given factor: a hook per factor, called
 *  at a FIXED count so the order never changes. */
function useWitnessRun(w: number) {
  return useMethodRun(
    RELAXATION_WITNESS, relaxationOverrides(w), `relax:${w}`, "choupoSolve");
}

export function RelaxationTool(): JSX.Element {
  const step = lessonStepper(RELAXATION_STEPS);
  const narrow = useNarrowViewport();

  const [a, setA] = useState(-1.5);
  const [w, setW] = useState(0.5);
  const [clamp, setClamp] = useState<"engine" | "open">("engine");

  const qMin = clamp === "engine" ? ENGINE_QMIN : OPEN_QMIN;
  const qMax = clamp === "engine" ? ENGINE_QMAX : OPEN_QMAX;

  const runs = useMemo(() => ({
    direct: drive("direct", a, 1),
    relaxed: drive("relaxed", a, w),
    wegstein: drive("wegstein", a, w, { qMin, qMax }),
    newton: drive("newton", a, w),
  }), [a, w, qMin, qMax]);

  const aEff = effectiveSlope(a, w);
  const wOpt = optimalW(a);
  const reg = region(a, w);
  const passes = passesToReduce(a, w);
  const verdictText: Record<typeof reg, string> = {
    converges: passes === null ? "" : `converges: the mistake shrinks by a factor ${Math.abs(aEff).toFixed(3)} per pass, about ${passes} passes to gain six digits`,
    "oscillates-out": "does not converge: the effective slope is below -1, so the mistake alternates in sign and grows. A smaller w would pull it back inside (-1, 1)",
    runaway: "does not converge: the gain is at least 1, so the effective slope is at least 1 for every w from 0 to 1. No positive relaxation factor rescues this loop (above a gain of 1 only a reversed step, w < 0, would)",
    neutral: "does not converge: the effective slope is exactly -1 or 1, the mistake neither grows nor shrinks",
  };

  // ---- The engine half: three real runs -------------------------------------
  const r0 = useWitnessRun(ENGINE_W_VALUES[0]);
  const r1 = useWitnessRun(ENGINE_W_VALUES[1]);
  const r2 = useWitnessRun(ENGINE_W_VALUES[2]);
  const engineRuns = [r0, r1, r2];
  const style = [
    { colour: DIRECT, dash: "", marker: "square" as const },
    { colour: RELAXED, dash: "5 3", marker: "circle" as const },
    { colour: WEGSTEIN, dash: "2 3", marker: "triangle" as const },
  ];
  const engineTraces = engineRuns.flatMap((r, i) => {
    const c = recycleResidual(r.result?.convergence, "mass");
    return c ? [{ label: `w = ${ENGINE_W_VALUES[i]}`, ...(style[i] as typeof style[0]),
      values: c }] : [];
  });
  const rail = narrow ? "1fr" : "minmax(220px, 280px) 1fr";

  const toTrace = (label: string, colour: string, dash: string,
    marker: "circle" | "square" | "triangle", e: number[]) =>
    ({ label, colour, dash, marker, values: e.map((v) => Math.max(v, FLOOR)) });

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>

        <Box>
          <Title order={3}>
            Relaxation: why a recycle is iterated, and three ways to do it
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            Closing a recycle means finding the stream that the plant sends
            back unchanged. You can walk toward it by plain substitution, by
            taking only part of each step (relaxation), by letting Wegstein
            choose the part, or by using Newton&apos;s whole slope. This page
            is the first of those, and it ends where the Wegstein page
            begins.
          </Text>
        </Box>

        {step(1)}
        {step(2)}

        {/* ---------------- THE TOY ---------------- */}
        <Box style={{ borderLeft: `3px solid ${RELAXED}`, paddingLeft: 12 }}>
          <Title order={4}>Three figures on one toy loop</Title>
          <Text size="sm" mt={4}>
            Everything in this block is arithmetic drawn in your browser, over
            a one-variable linear loop whose gain you set. It is not a Choupo
            model; it shows the mechanism exactly. Drag the red dot, drag the
            point on the map, or use the sliders: all of them move the same
            two numbers.
          </Text>
        </Box>

        <Box style={{ display: "grid", gap: 16, gridTemplateColumns: rail }}>
          <Stack gap={8}>
            <OriginMark of="assumption" note="the loop gain and the factor you choose" />
            <KnobSlider knob={GAIN} value={a} showWhy
              onChange={(v) => setA(Math.min(GAIN_MAX, Math.max(GAIN_MIN, v)))} />
            <KnobSlider knob={FACTOR} value={w} showWhy
              onChange={(v) => setW(Math.min(W_MAX, Math.max(W_MIN, v)))} />
            <Group gap={6} wrap="wrap">
              <Badge variant="light" color="gray">effective slope {aEff.toFixed(3)}</Badge>
              <Badge variant="light" color="gray">
                optimal w {wOpt === null ? "none" : wOpt.toFixed(3)}
              </Badge>
            </Group>
            <Text size="sm" role="status">{verdictText[reg]}</Text>
          </Stack>
          <Stack gap={6}>
            <OriginMark of="page" note="this page's arithmetic on the toy loop" />
            <Title order={5}>1. The cobweb: where each pass lands</Title>
            <SlopeCobweb a={a} w={w} onGain={setA} />
            <Text size="xs" c="dimmed">
              Red solid line: what the plant returns, y = a x. Green dashed
              line: the relaxed map, whose slope is the effective slope.
              Dotted red staircase: direct substitution. Solid green
              staircase: relaxation. The answer is where a line meets the
              dotted diagonal.
            </Text>
          </Stack>
        </Box>

        {step(3)}

        <Stack gap={6}>
          <OriginMark of="page" note="the four iterations run on the toy loop" />
          <Title order={5}>2. The mistake after each pass, four ways</Title>
          <Group gap="xs">
            <Text size="xs" fw={600}>Wegstein clamp</Text>
            <SegmentedControl size="xs" value={clamp}
              onChange={(v) => setClamp(v as "engine" | "open")}
              data={[
                { value: "engine", label: "engine default [-1, 0]" },
                { value: "open", label: "open [-5, 0.99]" },
              ]} />
          </Group>
          <ErrorPlot traces={[
            toTrace("direct", DIRECT, "", "square", runs.direct.err),
            toTrace("relaxed", RELAXED, "5 3", "circle", runs.relaxed.err),
            toTrace("Wegstein", WEGSTEIN, "2 3", "triangle", runs.wegstein.err),
            toTrace("Newton", NEWTON, "8 3", "circle", runs.newton.err),
          ]} />
          <Text size="xs" c="dimmed">
            A straight descending line is a constant effective slope: its
            steepness is how many digits each pass gains. Newton lands in one
            pass on this linear loop. With the engine&apos;s default clamp
            Wegstein never under-relaxes (it keeps w between 1 and 2), so on
            an oscillating loop it falls back to direct substitution; the
            open clamp lets it find the optimal factor on its own.
          </Text>
        </Stack>

        {step(4)}

        <Stack gap={6}>
          <OriginMark of="page" note="the convergence condition evaluated over the (a, w) plane" />
          <Title order={5}>3. The map: which factors converge for which gain</Title>
          <GainMap a={a} w={w} onPoint={(aa, ww) => { setA(aa); setW(ww); }} />
          <Text size="xs" c="dimmed">
            Green band: |1 − w + w a| &lt; 1, the iteration contracts. Green
            curve: the optimal factor, the one that makes the effective slope
            zero. Red region on the right: the gain is above 1 and no factor
            helps. Orange strip: w above 1, which Wegstein reaches by itself
            and the engine&apos;s recycleRelaxation refuses. The white dot is
            where the controls are; click or drag anywhere to move it.
          </Text>
        </Stack>

        {step(5)}
        {step(6)}
        {step(7)}
        {step(8)}

        {/* ---------------- THE ENGINE ---------------- */}
        <Box style={{ borderLeft: `3px solid ${MEASURED}`, paddingLeft: 12 }}>
          <Title order={4}>4. Measured: a real recycle, relaxed in your browser</Title>
          <Text size="sm" mt={4}>
            Everything below this line is three complete runs of{" "}
            <Text span ff="monospace" size="xs">tutorials/{RELAXATION_WITNESS}</Text>{" "}
            with <Text span ff="monospace" size="xs">recycleSolver directSubstitution;</Text>{" "}
            and <Text span ff="monospace" size="xs">recycleRelaxation w;</Text>{" "}
            written into its own system/solverDict, for w = 0.3, 0.6 and 1.
            The curves are the engine&apos;s own published tear mass
            imbalance per pass; this page computes none of it.
          </Text>
        </Box>
        <Stack gap={10}>
          <OriginMark of="engine" note="three recycle solves in this browser; every iterate is the engine's" />
          {engineRuns.some((r) => r.busy) && (
            <Group gap={6}><Loader size="xs" />
              <Text size="xs" c="dimmed">solving the flowsheet…</Text></Group>
          )}
          {engineRuns.map((r, i) => r.err ? (
            <Alert key={i} color="red" title={`The w = ${ENGINE_W_VALUES[i]} run did not finish`}>
              <Text size="sm">{r.err}</Text>
            </Alert>
          ) : null)}
          {engineTraces.length > 0 && <ErrorPlot traces={engineTraces} />}
          <Group gap="xs" wrap="wrap">
            {engineRuns.map((r, i) => {
              const v = verdictOf(r.result?.log ?? r.log);
              const tear = r.result?.streams.find(
                (s) => s.name === "recycle" || s.name.endsWith(".recycle"));
              return v ? (
                <Box key={i} px="sm" py={4}
                  style={{ borderLeft: "3px solid var(--mantine-color-default-border)" }}>
                  <Text size="xs" fw={600}>w = {ENGINE_W_VALUES[i]}</Text>
                  <Text size="xs" ff="monospace"
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{v}</Text>
                  {tear && (
                    <Text size="xs" c="dimmed">
                      tear F = {tear.F.toExponential(4)} kmol/s, T = {tear.T.toFixed(2)} K
                    </Text>
                  )}
                </Box>
              ) : null;
            })}
          </Group>
          <Text size="sm" c="dimmed">
            The three tear flows agree: the fixed point belongs to the
            topology and the feeds, and the factor only decides the path
            taken to it. A smaller w takes more passes on a loop that was
            already converging; it earns its keep only where plain
            substitution would diverge, which is what the toy above shows.
          </Text>
        </Stack>

        <LessonLimits limits={RELAXATION_LIMITS} />

        <LessonReferences tool="relaxation" />
      </Stack>
    </Box>
  );
}
