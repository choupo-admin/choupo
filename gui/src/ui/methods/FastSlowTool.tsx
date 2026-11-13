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
  FastSlowTool -- the EduTool `fast-and-slow`, "When the fast obeys the slow".

  The student's task, in one sentence: "My model is heavy and stiff: which
  variables can I stop integrating and replace by an algebraic relation, and
  how wrong will I be?"  The page answers that first (the ratio of the two
  time scales, and that the error falls with it), then lets the student test
  it on three case studies, each a mystery, a reveal and a breakage: a guess,
  the engine running BOTH models, a slider that makes the fast part slower
  until the reduction fails, the cost of the full model, and what is left
  when the fast part obeys -- the reduced law, counted, with its window.  It
  closes on the question the sister page asks: why correlations are simple.

  NO RUN STARTS ON OPENING.  Each case runs when the student presses its
  button, and every slider stop was run natively before it shipped (the
  design record holds the table).  The window sweep runs on its own button.

  WHERE EVERY NUMBER COMES FROM.  The curves are the engine's
  (case/fastSlow.ts lists the six witnesses and the one number each slider
  rewrites).  The page subtracts one curve from the other, divides mole
  numbers by their total, counts the step-history lines the engine prints,
  and draws two closed forms as CHECKS.  The plot, the panel and the table
  wrapper are the isotherm page's, imported, not redrawn.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Button, Group, Loader, NumberInput, SegmentedControl, Slider, Stack,
  Table, Text, Title,
} from "@mantine/core";

import { useMethodRun, useMethodRunSweep } from "../../case/methodRun.js";
import { tutorialByName } from "../../cases/tutorials.js";
import {
  CASE_ORDER, CASE_STUDIES, acceptedSteps, declared, explicitStepsAtLeast, fastestRate, gapOf,
  KINETICS, TANKS, linearGapMax, windowAt, type CaseStudy, type CaseStudyId, type Curve,
} from "../../case/fastSlow.js";
import { Panel, Wide, XYPlot, fmt } from "./AdsorptionIsothermsTool.js";
import { LessonLimits, Tex, TexText, lessonStepper } from "./lessonStep.js";
import { chapterSlug } from "./chapters.js";
import { openMethodToolAt } from "./registry.js";
import {
  FAST_SLOW_ADDS, FAST_SLOW_LIMITS, FAST_SLOW_PUZZLE, FAST_SLOW_STEPS, SIMPLE_LAWS,
  WINDOW_SENTENCE,
} from "./fastSlowLesson.js";

type XY = readonly [number, number];
const FULL = "#2a78d6", REDUCED = "#d4572a", CHECK = "#8a8a8a", GAP = "#1baf7a";

const step = lessonStepper(FAST_SLOW_STEPS);

/** The sister page's step this page continues (its title, as a chapter key). */
export const SISTER_STEP = "Two time scales: the slaving principle";

/** The task sentence, the page's first answer. */
export const FAST_SLOW_TASK = "My model is heavy and stiff: which variables can I stop "
  + "integrating and replace by an algebraic relation, and how wrong will I be?";

/** Each case's opening question and its three guesses (the gap, in % of
 *  the step or of the charge). */
const MYSTERY: Readonly<Record<CaseStudyId, { q: string; stepNo: number; guesses: string[] }>> = {
  tanks: {
    stepNo: 2,
    q: "A 50 mol tank sits behind a 1000 mol tank.  If you leave the small one out of the "
      + "model, how far off will the composition leaving the plant be, at worst?",
    guesses: ["under 1 %", "about 5 %", "about 20 %"],
  },
  equilibrium: {
    stepNo: 3,
    q: "A and B interconvert a hundred times faster than B turns into C.  Model them as one "
      + "pool at equilibrium: how far off will the amount of C be, at worst?",
    guesses: ["under 1 %", "about 5 %", "about 20 %"],
  },
  intermediate: {
    stepNo: 4,
    q: "The intermediate is used up a hundred times faster than it is made.  Drop it from "
      + "the model: how far off will the product be, at worst?  And is this a new problem?",
    guesses: ["under 1 %", "about 5 %", "about 20 %"],
  },
};

/** The reduced law each case leaves, in LaTeX. */
const REDUCED_LAW: Readonly<Record<CaseStudyId, string>> = {
  tanks: String.raw`\begin{aligned} \tau_s\,\frac{\mathrm{d}x_s}{\mathrm{d}t} &= x_\mathrm{in} - x_s \\ x_f &= x_s \end{aligned}`,
  equilibrium: String.raw`\frac{\mathrm{d}P}{\mathrm{d}t} = -\frac{k\,K}{1+K}\,P`,
  intermediate: String.raw`\frac{\mathrm{d}n_P}{\mathrm{d}t} = k_1\,n_A`,
};
const COUNT_WORDS: Readonly<Record<CaseStudyId, { states: string; params: string }>> = {
  tanks: { states: "tracer held in each tank", params: "time constants" },
  equilibrium: { states: "amounts (A, B, C; the pool counted once)", params: "rate and equilibrium constants" },
  intermediate: { states: "amounts (A, I, P)", params: "rate constants" },
};

/** "x %" of a fraction. */
const pct = (v: number, d = 3): string => `${fmt(100 * v, d)} %`;
const valueLabel = (c: CaseStudy, v: number): string =>
  (c.id === "tanks" ? `ε = ${v}` : `${v}  (ε = ${fmt(c.epsOf(v), 3)})`);

function toLine(c: Curve | null): XY[] {
  return c ? c.t.map((t, i): XY => [t, c.y[i]!]) : [];
}

/** The tank case's fixed-step count, from the case's own declarations. */
function declaredFixedSteps(witness: string): number | null {
  const cd = tutorialByName(witness)?.files.rawFiles?.["system/controlDict"];
  if (!cd) return null;
  const tEnd = declared(cd, "endTime"), dt = declared(cd, "deltaT");
  return tEnd !== null && dt !== null && dt > 0 ? Math.round(tEnd / dt) : null;
}
function declaredEndTime(witness: string): number | null {
  const cd = tutorialByName(witness)?.files.rawFiles?.["system/controlDict"];
  return cd ? declared(cd, "endTime") : null;
}

function CaseStudyBlock({ id }: { id: CaseStudyId }): JSX.Element {
  const c = CASE_STUDIES[id];
  const m = MYSTERY[id];
  const [guess, setGuess] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [vi, setVi] = useState(c.stops.indexOf(c.defaultStop));
  const v = c.stops[vi]!;
  const overrides = useMemo(() => c.fullOverrides(v), [c, v]);
  const full = useMethodRun(started ? c.full : null, overrides, JSON.stringify(overrides), c.binary);
  const red = useMethodRun(started ? c.reduced : null, [], "base", c.binary);

  const fCurve = full.result?.trajectory ? c.curveOf(full.result.trajectory, "full") : null;
  const rCurve = red.result?.trajectory ? c.curveOf(red.result.trajectory, "reduced") : null;
  const gap = fCurve && rCurve ? gapOf(fCurve, rCurve) : null;
  const eps = c.epsOf(v);
  const check = id === "equilibrium" ? null : linearGapMax(eps);
  const tEnd = declaredEndTime(c.full) ?? NaN;

  //  The closed-form curves of the linear cases, drawn as CHECKS.
  const checkLines = useMemo(() => {
    if (!fCurve || id === "equilibrium") return null;
    const ts = fCurve.t;
    if (id === "tanks") {
      const ts_ = TANKS.nSlow / TANKS.feed, tf = ts_ * v;
      const red_ = ts.map((t): XY => [t, 1 - Math.exp(-t / ts_)]);
      const full_ = ts.map((t): XY => [t, Math.abs(ts_ - tf) < 1e-9
        ? 1 - (1 + t / ts_) * Math.exp(-t / ts_)
        : 1 - (ts_ * Math.exp(-t / ts_) - tf * Math.exp(-t / tf)) / (ts_ - tf)]);
      return { red_, full_ };
    }
    const k1 = KINETICS.k1, k2 = v * KINETICS.k1;
    const red_ = ts.map((t): XY => [t, 1 - Math.exp(-k1 * t)]);
    const full_ = ts.map((t): XY => [t, Math.abs(k2 - k1) < 1e-15
      ? 1 - (1 + k1 * t) * Math.exp(-k1 * t)
      : 1 - (k2 * Math.exp(-k1 * t) - k1 * Math.exp(-k2 * t)) / (k2 - k1)]);
    return { red_, full_ };
  }, [fCurve, id, v]);

  const stepsFull = full.result ? acceptedSteps(full.result.log) : null;
  const stepsRed = red.result ? acceptedSteps(red.result.log) : null;
  const fixed = id === "tanks" ? declaredFixedSteps(c.full) : null;
  const explicit = Number.isFinite(tEnd) ? explicitStepsAtLeast(fastestRate(id, v), tEnd) : NaN;

  // ---- the window sweep, on its own button ----
  const [tolPct, setTolPct] = useState<number | string>(2);
  const [sweepOn, setSweepOn] = useState(false);
  const sets = useMemo(() => c.stops.map((s) => c.fullOverrides(s)), [c]);
  const sweep = useMethodRunSweep(sweepOn ? c.full : null, sets, `${c.id}-window`, c.binary);
  const sweepGaps = useMemo(() => sweep.results.map((r) => {
    if (!r?.trajectory || !rCurve) return null;
    const fc = c.curveOf(r.trajectory, "full");
    const g = fc ? gapOf(fc, rCurve) : null;
    return g ? g.max : null;
  }), [sweep.results, rCurve, c]);
  const tol = Number(tolPct) / 100;
  const win = windowAt(c.stops, sweepGaps, tol, c.epsOf);

  return (
    <Stack gap="md">
      {step(m.stepNo)}

      <Panel title="predict before you calculate" origin="assumption"
        originNote="the case's numbers are author-set for the lesson; no measurement enters">
        <Text size="sm">{m.q}</Text>
        <SegmentedControl size="xs" value={guess ?? ""} onChange={setGuess}
          data={m.guesses.map((g) => ({ value: g, label: g }))} />
        <Group gap="sm">
          <Button size="xs" disabled={guess === null || started}
            onClick={() => setStarted(true)}>
            Run both models in the engine
          </Button>
          {guess === null && <Text size="xs" c="dimmed">Choose a guess first.</Text>}
        </Group>
      </Panel>

      {started && (
        <Panel title="the reveal: both models, run by the engine" origin={["engine", "page"]}
          originNote={`full: ${c.full}; reduced: ${c.reduced}; the page draws both and subtracts them, and the closed form is a check`}>
          <Box>
            <Group justify="space-between" gap={6}>
              <Text size="xs" c="dimmed">
                <Tex src={c.ratioTex} mode="inline" />, {c.ratioLabel}
              </Text>
              <Text size="xs" ff="monospace">{valueLabel(c, v)}</Text>
            </Group>
            <Slider size="xs" mt={4} value={vi} min={0} max={c.stops.length - 1} step={1}
              label={null} onChange={setVi}
              marks={c.stops.map((_, i) => ({ value: i }))} />
            <Text size="xs" c="dimmed" mt={8}>
              {id === "tanks"
                ? "Move right to make the small tank slower: at ε = 1 the two tanks are equal and nothing is fast."
                : "Move left to make the fast step slower: at 1 the two rates are equal and nothing is fast."}
            </Text>
          </Box>
          {(full.busy || red.busy) && <Group gap={6}><Loader size="xs" /><Text size="xs">the engine is running…</Text></Group>}
          {(full.err || red.err) && (
            <Alert color="red" variant="light" title="the engine did not finish">
              <Text size="sm">{full.err ?? red.err}</Text>
            </Alert>
          )}
          {((full.result && !fCurve) || (red.result && !rCurve)) && (
            <Alert color="gray" variant="light" title="nothing to compare">
              <Text size="sm">
                A run finished but its trajectory does not carry the columns this page compares
                ({c.quantity}), so nothing is drawn rather than a curve the engine did not publish.
              </Text>
            </Alert>
          )}
          {fCurve && rCurve && (
            <>
              <XYPlot ariaLabel={`${c.quantity} against time, full and reduced`}
                xLabel="t [s]" yLabel={c.quantity}
                series={[
                  { name: "full model (engine)", color: FULL, line: toLine(fCurve) },
                  { name: "reduced model (engine)", color: REDUCED, line: toLine(rCurve), dash: "7 4" },
                  ...(checkLines ? [{ name: "closed form, full (check)", color: CHECK,
                    line: checkLines.full_, dash: "2 3" }] : []),
                ]} />
              {gap && (
                <XYPlot ariaLabel="the gap between the two models against time" xLabel="t [s]"
                  yLabel="full − reduced" yZero
                  series={[{ name: "full − reduced (difference of the two engine curves)",
                    color: GAP, line: gap.t.map((t, i): XY => [t, gap.d[i]!]) }]} />
              )}
              {gap && (
                <Text size="sm">
                  Your guess: <b>{guess}</b>.  The engine: the largest gap is{" "}
                  <b>{pct(gap.max)}</b>{id === "tanks" ? " of the step in composition" : " of the charge"},
                  at t = {fmt(gap.tAtMax, 3)} s.
                  {check !== null && (
                    <> The closed form for two linear first-order parts gives ε^(1/(1−ε)) ={" "}
                      {pct(check)} (a check, drawn grey above).</>
                  )}
                  {id === "intermediate" && (
                    <> This is the closed form of case 1 at the same ε: a tank behind a tank and
                      an intermediate between two steps are the same equation.</>
                  )}
                </Text>
              )}
            </>
          )}
        </Panel>
      )}

      {started && fCurve && (
        <Panel title="what the full model costs" origin={["engine", "page"]}
          originNote={id === "tanks"
            ? "the step counts are the cases' own declarations; the explicit bound is arithmetic on the small tank's time constant"
            : "accepted steps counted from the step history the engine prints; the explicit bound is arithmetic on the fastest rate constant"}>
          <Wide>
            <Table withTableBorder fz="xs" style={{ width: "auto" }}>
              <Table.Tbody>
                {id === "tanks" ? (
                  <Table.Tr><Table.Td>fixed RK4 steps, full and reduced (both declared: endTime / deltaT)</Table.Td>
                    <Table.Td ff="monospace">{fixed ?? "—"}</Table.Td></Table.Tr>
                ) : (
                  <>
                    <Table.Tr><Table.Td>accepted steps, full model (adaptive Rosenbrock23)</Table.Td>
                      <Table.Td ff="monospace">{stepsFull ?? "not published"}</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>accepted steps, reduced model</Table.Td>
                      <Table.Td ff="monospace">{stepsRed ?? "not published"}</Table.Td></Table.Tr>
                  </>
                )}
                <Table.Tr><Table.Td>a fixed explicit RK4 step would need at least (arithmetic, 2.785 / fastest rate)</Table.Td>
                  <Table.Td ff="monospace">{Number.isFinite(explicit) ? explicit : "—"}</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
          </Wide>
          <Text size="sm">
            {id === "tanks"
              ? "The router hands the big tank's outlet to the small one once per driver step, so the step must stay short against the small tank's time constant; this case holds it at 0.25 s for both models so the comparison is fair.  The driver publishes no count of its own, and nothing is shown in its place."
              : "Move the slider and watch the stiff integrator: it spends a few more steps on the first moment and then strides on the slow clock, so its count barely moves while the explicit bound grows in proportion to the fast rate.  With a stiff integrator, the reduction's gain is not speed.  It is the fast constants you no longer need to know."}
          </Text>
        </Panel>
      )}

      {started && (
        <Panel title="what is left when the fast part obeys" origin={["page", "engine"]}
          originNote="the counts are of the two cases' declarations; the window is the engine's gap at every slider stop, run on demand">
          <Tex src={REDUCED_LAW[id]} mode="display" />
          <Wide>
            <Table withTableBorder withColumnBorders fz="xs" style={{ width: "auto" }}>
              <Table.Thead><Table.Tr><Table.Th /><Table.Th>full</Table.Th><Table.Th>reduced</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                <Table.Tr><Table.Td>{COUNT_WORDS[id].states} followed in time</Table.Td>
                  <Table.Td ff="monospace">{c.count.fullStates}</Table.Td>
                  <Table.Td ff="monospace">{c.count.reducedStates}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>{COUNT_WORDS[id].params}</Table.Td>
                  <Table.Td ff="monospace">{c.count.fullParams}</Table.Td>
                  <Table.Td ff="monospace">{c.count.reducedParams}</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
          </Wide>
          <Text size="sm">
            Fewer variables, an algebraic relation in place of a differential equation, and a
            range where it holds: that is a correlation.  Set your tolerance and measure the
            range.
          </Text>
          <Group gap="sm" align="flex-end" wrap="wrap">
            <NumberInput label="tolerance on the gap, %" value={tolPct} onChange={setTolPct}
              min={0.01} max={50} step={0.5} decimalScale={2} w={170} />
            <Button size="xs" variant="light" disabled={sweepOn} onClick={() => setSweepOn(true)}>
              Run the full model at every slider stop ({c.stops.length} runs)
            </Button>
          </Group>
          {sweepOn && (
            <>
              {sweep.busy && <Group gap={6}><Loader size="xs" /><Text size="xs">{sweep.done} of {c.stops.length} runs done…</Text></Group>}
              <Wide>
                <Table withTableBorder fz="xs" style={{ width: "auto" }}>
                  <Table.Thead><Table.Tr><Table.Th>slider</Table.Th><Table.Th>ε</Table.Th>
                    <Table.Th>largest gap</Table.Th><Table.Th>within tolerance</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {c.stops.map((s, i) => (
                      <Table.Tr key={s}>
                        <Table.Td ff="monospace">{s}</Table.Td>
                        <Table.Td ff="monospace">{fmt(c.epsOf(s), 3)}</Table.Td>
                        <Table.Td ff="monospace">{sweepGaps[i] !== null && sweepGaps[i] !== undefined
                          ? pct(sweepGaps[i]!) : (sweep.errs[i] ? "did not run" : "…")}</Table.Td>
                        <Table.Td>{sweepGaps[i] === null || sweepGaps[i] === undefined ? ""
                          : sweepGaps[i]! <= tol ? <Badge size="xs" color="teal" tt="none">yes</Badge>
                            : <Badge size="xs" color="red" tt="none">no</Badge>}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Wide>
              {!sweep.busy && (
                <Text size="sm">
                  {win.edge === null
                    ? `No stop keeps the gap under ${fmt(Number(tolPct), 3)} %: tighten nothing, the reduction does not hold here.`
                    : `At ${fmt(Number(tolPct), 3)} % the reduced law holds up to ε = ${fmt(c.epsOf(win.edge), 3)} (slider ${win.edge}): that is its validity window.`}
                </Text>
              )}
            </>
          )}
        </Panel>
      )}
    </Stack>
  );
}

export function FastSlowTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto", minWidth: 0 }}>
        <Box>
          <Title order={3}>When the fast obeys the slow: separation of time scales</Title>
          <Text size="md" mt={6}>{FAST_SLOW_PUZZLE}</Text>
          <Text size="sm" c="dimmed" mt={6}>
            {FAST_SLOW_ADDS}{" "}
            <Text span component="a" href="#" c="accent" size="sm"
              onClick={(e) => { e.preventDefault(); openMethodToolAt("correlation-simplicity", chapterSlug(SISTER_STEP)); }}>
              Open the sister page.
            </Text>
          </Text>
        </Box>

        <Panel title="your task, and the short answer" origin="page"
          originNote="the answer is the arithmetic of two time scales, stated before it is tested">
          <Text size="sm" fs="italic">&ldquo;{FAST_SLOW_TASK}&rdquo;</Text>
          <Text size="sm">
            <TexText text={"The ones whose time scale is short against the slowest one you care about.  "
              + "Divide the two: \\(\\varepsilon = \\tau_\\mathrm{fast}/\\tau_\\mathrm{slow}\\).  "
              + "Replace each fast part by the relation that makes its own rate zero, and the "
              + "error you make falls with ε, roughly in proportion to it.  Below, the engine "
              + "runs both models three times, and you find how small ε must be for your tolerance."} />
          </Text>
        </Panel>

        {step(1)}

        {CASE_ORDER.map((id) => <CaseStudyBlock key={id} id={id} />)}

        {step(5)}

        <Panel title="three reduced laws beside the correlations you use" origin="page"
          originNote="text: what was assumed to have settled, and where it is in Choupo">
          <Stack gap={8}>
            {SIMPLE_LAWS.map((l) => (
              <Box key={l.law} px="sm" py={6}
                style={{ borderLeft: "3px solid var(--mantine-color-default-border)",
                  overflowWrap: "anywhere" }}>
                <Text size="sm" fw={600}><TexText text={l.law} /></Text>
                <Text size="sm"><Text span c="dimmed" size="xs">what was slaved · </Text>
                  <TexText text={l.slaved} /></Text>
                <Text size="sm"><Text span c="dimmed" size="xs">where it is in Choupo · </Text>
                  <TexText text={l.where} />
                  {l.tool && (
                    <>{" "}<Text span component="a" href="#" c="accent" size="sm"
                      onClick={(e) => { e.preventDefault(); openMethodToolAt(l.tool!, null); }}>
                      Open it.
                    </Text></>
                  )}
                </Text>
                <Text size="sm"><Text span c="dimmed" size="xs">the price · </Text>
                  <TexText text={l.price} /></Text>
              </Box>
            ))}
          </Stack>
          <Text size="sm">{WINDOW_SENTENCE}</Text>
        </Panel>

        <LessonLimits limits={FAST_SLOW_LIMITS} />

        <Text size="xs" c="dimmed">
          Next on this page, not built yet: batch electrodialysis (the film at the membrane
          against the emptying tank) and a cascade control loop (a fast inner loop slaved to a
          slow outer one).
        </Text>
      </Stack>
    </Box>
  );
}
