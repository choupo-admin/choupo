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
  BayesOptCard: a STANDALONE prototype of the card that teaches Bayesian
  optimisation, to be dropped into the `optimizers` EduTool (README.md in this
  folder says how).  It touches no registry and no engine.

  WHAT IT SHOWS.  A one-variable function (drawn for the student, hidden from
  the optimiser); a Gaussian process with an RBF kernel drawn as a mean and a
  95 % band; the expected improvement under it; a next-point button that adds
  the maximiser and re-fits; sliders for the length scale and the noise
  allowance; and two counters of calls of f -- Bayesian optimisation and a
  finite-difference quasi-Newton SKETCH started at the same point.  The
  narrow-dip setting is the honest failure.

  ZERO PHYSICS IN TYPESCRIPT in the sense of this repository: this file makes
  no engine call.  The mathematics is gp.ts, held against hand values by
  tests/bayesOpt.test.ts; this file draws it.

  THE ENGINE STATUS SENTENCE is shown on the card (ENGINE_STATUS): the method
  is offered by the engine, opt-in (C499); the sentence quotes the measurement.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Button, Group, SegmentedControl, Stack, Text, Title,
} from "@mantine/core";

import { KnobSlider, PanelNote, type PanelKnob } from "../knobPanel.js";
import { lessonStepper, LessonLimits } from "../lessonStep.js";
import { LessonQuiz } from "../lessonQuiz.js";
import {
  BAYES_LIMITS, BAYES_QUIZ, BAYES_REFERENCES, BAYES_STEPS, BAYES_STEPS_IN_TOOL,
  BAYES_STEP_OFFSET, ENGINE_STATUS,
} from "./bayesOptLesson.js";
import {
  GRID, SETTINGS, bestAfter, boFit, expectedImprovement, gradientRun,
  gridMinimum, nextPoint, predict, DIP, type BoState, type SettingId,
} from "./gp.js";

const BORDER = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TRUTH = "#90a4ae";
const MEAN = "#26c6da";
const BAND = "rgba(38, 198, 218, 0.22)";
const POINT = "#ffb74d";
const NEXT = "#ce93d8";
const GRAD = "#ef5350";

const VW = 640, PAD_L = 44, PAD_R = 12;
const H1 = 270, H2 = 110, PAD_T = 10, PAD_B = 22;

const ELL_KNOB: PanelKnob = {
  id: "ell", label: "Length scale \\(\\ell\\)", min: 0.01, max: 0.5, step: 0.005,
  why: "How far apart two inputs must be before the model forgets one from "
    + "the other.  Long: smooth and confident.  Short: flexible and unsure.",
};
const NOISE_KNOB: PanelKnob = {
  id: "noise", label: "Noise allowance \\(\\sigma_n\\)", min: 0.001, max: 0.5,
  step: 0.001,
  why: "The standard deviation the model assumes the calls carry.  The "
    + "function here is noise-free; this is the model's allowance for being "
    + "wrong, and it widens the band at the data.",
};

const COSTS = [
  { value: "0.001", label: "1 ms", s: 0.001 },
  { value: "60", label: "1 min", s: 60 },
  { value: "3600", label: "1 h", s: 3600 },
] as const;

function clock(sec: number): string {
  if (sec < 1) return `${(sec * 1000).toFixed(0)} ms`;
  if (sec < 120) return `${sec.toFixed(0)} s`;
  if (sec < 7200) return `${(sec / 60).toFixed(0)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
}

/** `inTool`: drawn as a section of the `optimizers` tool, which draws the
 *  limits, quiz and references of the whole lesson once at its end. */
export function BayesOptCard({ inTool = false }: { inTool?: boolean }): JSX.Element {
  const [settingId, setSettingId] = useState<SettingId>("smooth");
  const setting = SETTINGS.find((s) => s.id === settingId) ?? SETTINGS[0]!;
  const f = setting.f;

  const init = (s: typeof setting): BoState => ({
    X: [...s.initial], y: s.initial.map((x) => s.f(x)),
  });
  const [data, setData] = useState<BoState>(() => init(setting));
  const [ell, setEll] = useState(setting.ell);
  const [noise, setNoise] = useState(0.01);
  const [cost, setCost] = useState<string>("60");
  const [last, setLast] = useState<{ x: number; exploration: boolean } | null>(null);

  const choose = (id: SettingId): void => {
    const s = SETTINGS.find((q) => q.id === id) ?? SETTINGS[0]!;
    setSettingId(id);
    setData(init(s));
    setEll(s.ell);
    setLast(null);
  };

  // ---- the model, the maximiser and the two runs ---------------------------
  const noise2 = noise * noise;
  const model = useMemo(() => {
    try {
      const fit = boFit(data, ell, noise2);
      const xs: number[] = [];
      const mean: number[] = [], sd: number[] = [], ei: number[] = [];
      const fmin = Math.min(...data.y);
      for (let i = 0; i < GRID; i++) {
        const x = i / (GRID - 1);
        const p = predict(fit, x);
        const s = Math.sqrt(p.variance);
        xs.push(x); mean.push(p.mean); sd.push(s);
        ei.push(expectedImprovement(p.mean, s, fmin));
      }
      return { ok: true as const, xs, mean, sd, ei, next: nextPoint(data, ell, noise2) };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
    }
  }, [data, ell, noise2]);

  const truth = useMemo(() => {
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < 600; i++) { const x = i / 599; xs.push(x); ys.push(f(x)); }
    return { xs, ys, min: gridMinimum(f) };
  }, [f]);

  const gradLog = useMemo(() => gradientRun(f, setting.gradientStart), [f, setting]);

  const nBo = data.y.length;
  const nGrad = Math.min(nBo, gradLog.length);
  const boBest = Math.min(...data.y);
  const gradBest = bestAfter(gradLog, nBo);
  const costS = COSTS.find((c) => c.value === cost)?.s ?? 60;

  const step = (): void => {
    if (!model.ok) return;
    const nx = model.next;
    setData({ X: [...data.X, nx.x], y: [...data.y, f(nx.x)] });
    setLast({ x: nx.x, exploration: nx.exploration });
  };

  // ---- the drawing ----------------------------------------------------------
  const allY = [...truth.ys, ...data.y];
  const yLo = Math.min(...allY) - 0.4, yHi = Math.max(...allY) + 0.4;
  const X = (v: number): number => PAD_L + (VW - PAD_L - PAD_R) * v;
  const Y1 = (v: number): number =>
    PAD_T + (H1 - PAD_T - PAD_B) * (1 - (v - yLo) / (yHi - yLo));
  const eiMax = model.ok ? Math.max(...model.ei, 1e-12) : 1;
  const Y2 = (v: number): number =>
    PAD_T + (H2 - PAD_T - PAD_B) * (1 - v / eiMax);

  const bandPath = model.ok ? ((): string => {
    const up = model.xs.map((x, i) => `${X(x).toFixed(1)},${Y1(Math.min(yHi + 5, model.mean[i]! + 1.96 * model.sd[i]!)).toFixed(1)}`);
    const dn = model.xs.map((x, i) => `${X(x).toFixed(1)},${Y1(Math.max(yLo - 5, model.mean[i]! - 1.96 * model.sd[i]!)).toFixed(1)}`).reverse();
    return `M${up.join(" L")} L${dn.join(" L")} Z`;
  })() : "";
  const line = (xs: number[], ys: number[], Y: (v: number) => number): string =>
    xs.map((x, i) => `${i === 0 ? "M" : "L"}${X(x).toFixed(1)},${Y(ys[i]!).toFixed(1)}`).join(" ");

  const stepOfRaw = lessonStepper(inTool ? BAYES_STEPS_IN_TOOL : BAYES_STEPS, { foldSymbols: true });
  const off = inTool ? BAYES_STEP_OFFSET : 0;
  const stepOf = (n: number): JSX.Element | null => stepOfRaw(n + off);
  const dipMissed = settingId === "narrowDip"
    && !data.X.some((x) => Math.abs(x - DIP.at) < 0.04);

  return (
    <Stack gap="md" data-bayes-card="">
      <Title order={4}>Bayesian optimisation: spending a model to save calls</Title>
      <Alert color="yellow" variant="light" data-engine-status="">
        {ENGINE_STATUS}
      </Alert>

      {stepOf(1)}
      {stepOf(2)}
      {stepOf(3)}
      {stepOf(4)}

      <Box data-bayes-workbench="" px="sm" py="sm"
        style={{ border: `1px solid ${BORDER}`, borderRadius: 4 }}>
        <Group justify="space-between" align="flex-end" wrap="wrap" mb="xs">
          <Box>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">Setting</Text>
            <SegmentedControl size="xs" value={settingId}
              onChange={(v) => choose(v as SettingId)}
              data={SETTINGS.map((s) => ({ value: s.id, label: s.label }))} />
          </Box>
          <Group gap="xs">
            <Button size="xs" onClick={step} disabled={!model.ok}>
              Next point (maximise EI)
            </Button>
            <Button size="xs" variant="default"
              onClick={() => { setData(init(setting)); setLast(null); }}>
              Reset
            </Button>
          </Group>
        </Group>

        <Group grow align="flex-start" wrap="wrap" mb="xs">
          <KnobSlider knob={ELL_KNOB} value={ell} onChange={setEll} showWhy />
          <KnobSlider knob={NOISE_KNOB} value={noise} onChange={setNoise} showWhy />
        </Group>

        {!model.ok && (
          <Alert color="red" variant="light" mb="xs">
            The model could not be fitted: {model.message}
          </Alert>
        )}

        <Box style={{ width: "100%", overflowX: "auto" }}>
          <svg viewBox={`0 0 ${VW} ${H1 + H2}`} width="100%"
            style={{ display: "block", minWidth: 300 }} role="img"
            aria-label={"Top: the true function (grey, hidden from the "
              + "optimiser), the Gaussian-process mean and its 95 percent "
              + "band, the evaluated points and the next point.  Bottom: "
              + "the expected improvement."}>
            {/* top panel */}
            <line x1={X(0)} x2={X(1)} y1={Y1(yLo)} y2={Y1(yLo)} stroke={BORDER} />
            <line x1={X(0)} x2={X(0)} y1={Y1(yLo)} y2={Y1(yHi)} stroke={BORDER} />
            <text x={X(0) - 6} y={Y1(yHi) + 8} textAnchor="end" fontSize={10} fill={INK}>f</text>
            <text x={X(1)} y={Y1(yLo) + 14} textAnchor="end" fontSize={10} fill={INK}>x</text>
            {model.ok && <path d={bandPath} fill={BAND} stroke="none" />}
            <path d={line(truth.xs, truth.ys, Y1)} fill="none" stroke={TRUTH}
              strokeWidth={1.4} strokeDasharray="5 3" />
            {model.ok && (
              <path d={line(model.xs, model.mean, (v) => Y1(Math.min(yHi + 5, Math.max(yLo - 5, v))))}
                fill="none" stroke={MEAN} strokeWidth={2} />
            )}
            {gradLog.slice(0, nGrad).map((r, i) => (
              <path key={`g${i}`} d={`M${X(r.x) - 3.5},${Y1(r.f) + 3.5} L${X(r.x) + 3.5},${Y1(r.f) + 3.5} L${X(r.x)},${Y1(r.f) - 4} Z`}
                fill={GRAD} fillOpacity={0.55} />
            ))}
            {data.X.map((x, i) => (
              <circle key={`p${i}`} cx={X(x)} cy={Y1(data.y[i]!)} r={4.5}
                fill={POINT} stroke="#000" strokeOpacity={0.4} />
            ))}
            {model.ok && (
              <line x1={X(model.next.x)} x2={X(model.next.x)} y1={Y1(yLo)}
                y2={Y1(yHi)} stroke={NEXT} strokeWidth={1.2} strokeDasharray="2 3" />
            )}
            {/* bottom panel */}
            <g transform={`translate(0, ${H1})`}>
              <line x1={X(0)} x2={X(1)} y1={Y2(0)} y2={Y2(0)} stroke={BORDER} />
              <line x1={X(0)} x2={X(0)} y1={Y2(0)} y2={Y2(eiMax)} stroke={BORDER} />
              <text x={X(0) - 6} y={Y2(eiMax) + 8} textAnchor="end" fontSize={10} fill={INK}>EI</text>
              {model.ok && (
                <path d={line(model.xs, model.ei, Y2)} fill="none" stroke={NEXT} strokeWidth={1.8} />
              )}
              {model.ok && (
                <line x1={X(model.next.x)} x2={X(model.next.x)} y1={Y2(0)}
                  y2={Y2(eiMax)} stroke={NEXT} strokeWidth={1.2} strokeDasharray="2 3" />
              )}
            </g>
          </svg>
        </Box>

        <Group gap="md" wrap="wrap" mt={4}>
          <Legend color={TRUTH} dashed text="true f (hidden from the optimiser)" />
          <Legend color={MEAN} text="GP mean, with 95 % band" />
          <Legend color={POINT} dot text="calls of f made" />
          <Legend color={GRAD} tri text="gradient sketch, same budget" />
          <Legend color={NEXT} dashed text="next point (EI maximiser)" />
        </Group>

        <Group gap="md" align="stretch" wrap="wrap" mt="sm">
          <Counter title="Bayesian optimisation" calls={nBo} best={boBest}
            sub={`${setting.initial.length} initial + ${nBo - setting.initial.length} chosen by EI`}
            wall={nBo * costS} />
          <Counter title="Gradient method (sketch)" calls={nGrad} best={gradBest}
            sub={gradLog.length <= nBo
              ? `stopped at ${gradLog.length} calls (|g| < 1e-3 or budget)`
              : `first ${nGrad} of its ${gradLog.length} calls`}
            wall={nGrad * costS} />
          <Box>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">Cost of one call</Text>
            <SegmentedControl size="xs" value={cost} onChange={setCost}
              data={COSTS.map((c) => ({ value: c.value, label: c.label }))} />
            <Text size="xs" c="dimmed" mt={4} maw={220}>
              True minimum: f = {truth.min.f.toFixed(3)} at x = {truth.min.x.toFixed(3)}.
              Wall time counts only the calls; the model's own arithmetic is
              milliseconds here.
            </Text>
          </Box>
        </Group>

        {last && (
          <PanelNote>
            Last step: the EI maximiser chose x = {last.x.toFixed(3)}
            {last.exploration ? " (expected improvement was zero everywhere, so the most uncertain point was taken instead)." : "."}
          </PanelNote>
        )}
        {dipMissed && nBo > setting.initial.length && (
          <PanelNote>
            No call has landed near the dip yet (x = {DIP.at}, the true minimum).
            At this length scale the model cannot imagine it; try
            shortening it, or keep pressing the button.
          </PanelNote>
        )}
        <PanelNote>
          Bayesian optimisation returns a point and a value only, never
          multipliers or a shadow price.  The gradient method is a one-variable
          sketch of ours, not the engine&apos;s <code>sqp</code>.
        </PanelNote>
      </Box>

      {stepOf(5)}
      {stepOf(6)}

      {!inTool && <LessonLimits limits={BAYES_LIMITS} />}

      {!inTool && <LessonQuiz title="Check yourself" questions={BAYES_QUIZ} lesson={BAYES_STEPS} />}

      {!inTool && <Box data-lesson-references="">
        <Title order={5}>References</Title>
        <Box component="ol" mt={6} mb={0} pl={22}>
          {BAYES_REFERENCES.map((r) => (
            <Box component="li" key={r.text} mb={6}>
              <Text size="sm">
                {r.text}
                {r.doi && (<>{" "}doi:{r.doi}</>)}
                {r.url && (<>{" "}{r.url}</>)}
              </Text>
              <Text size="xs" c="dimmed">{r.note}</Text>
            </Box>
          ))}
        </Box>
      </Box>}
    </Stack>
  );
}

function Legend({ color, text, dashed, dot, tri }: {
  color: string; text: string; dashed?: boolean; dot?: boolean; tri?: boolean;
}): JSX.Element {
  return (
    <Group gap={6} wrap="nowrap">
      <svg width={22} height={12} aria-hidden="true">
        {dot ? <circle cx={11} cy={6} r={4.5} fill={color} />
          : tri ? <path d="M7,10 L15,10 L11,2 Z" fill={color} fillOpacity={0.6} />
          : <line x1={1} x2={21} y1={6} y2={6} stroke={color} strokeWidth={2}
              strokeDasharray={dashed ? "4 3" : undefined} />}
      </svg>
      <Text size="xs" c="dimmed">{text}</Text>
    </Group>
  );
}

function Counter({ title, calls, best, sub, wall }: {
  title: string; calls: number; best: number; sub: string; wall: number;
}): JSX.Element {
  return (
    <Box px="sm" py={6} style={{ border: `1px solid ${BORDER}`, borderRadius: 4, minWidth: 190 }}>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">{title}</Text>
      <Group gap="xs" mt={2}>
        <Badge variant="light" size="lg" data-calls="">{calls} calls</Badge>
        <Badge variant="outline">best f = {Number.isFinite(best) ? best.toFixed(3) : "—"}</Badge>
      </Group>
      <Text size="xs" c="dimmed" mt={2}>{sub}</Text>
      <Text size="xs" c="dimmed">calls take {clock(wall)} in all</Text>
    </Box>
  );
}
