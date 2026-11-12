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
  BatchAdsorptionTool — the EduTool `batch-adsorption`.

  The student's task, in one sentence: "I have a tank of solution and an
  adsorbent with a known isotherm; how much adsorbent do I need, is it
  better split into stages, and how long does it take?"

  The isotherm is chosen first (one of three example systems with this
  page's own numbers, or any linear / Langmuir / Freundlich the student
  types, e.g. the one fitted on the adsorption-isotherms page), then each
  step answers one part of the question on that isotherm.

  ALL OF IT IS THIS PAGE'S ARITHMETIC (gui/src/case/batchAdsorption.ts, on
  the isotherm functions of gui/src/case/adsorptionIsotherms.ts), and every
  panel is marked so: the engine's batch adsorber contacts a gas.  The
  measurement and the proposal are in
  docs/design/batch-adsorption-in-a-stirred-tank.md.  The plot, the panel
  and the table wrapper are the isotherm page's, imported, not redrawn.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Box, Group, NumberInput, Select, Stack, Table, Text, Title,
} from "@mantine/core";

import { MODELS, MODEL_LABEL, PARAM_NAMES, type ModelId } from "../../case/adsorptionIsotherms.js";
import {
  EXAMPLES, bestTwoStageSplit, biot, closedFormC, countercurrent, crossflow, doseFor,
  equalSplit, equilibriumFloor, filmCoefficients, filmTrajectory, isothermRefusal, qStar,
  removalPct, stageEquilibrium, timeToTarget, type FilmInput, type Isotherm,
} from "../../case/batchAdsorption.js";
import { MODEL_COLOR, Panel, Wide, XYPlot, fmt } from "./AdsorptionIsothermsTool.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { BATCH_LIMITS, BATCH_STEPS } from "./batchAdsorptionLesson.js";

type XY = readonly [number, number];
const TEXT = "var(--mantine-color-text)";
const INK = "var(--mantine-color-dimmed)";
const CROSS = "#2a78d6", COUNTER = "#d4572a", ANSWER = "#1baf7a";

const step = lessonStepper(BATCH_STEPS);

/** Parameter units in the page's one basis (mg/L, mg/g). */
const PARAM_UNIT: Readonly<Record<ModelId, readonly string[]>> = {
  linear: ["L/g"],
  langmuir: ["mg/g", "mg/L"],
  freundlich: ["(mg/g)(L/mg)^(1/n)", "–"],
};

const DEFAULT_PARAMS: Readonly<Record<ModelId, readonly number[]>> = {
  linear: [5], langmuir: [200, 4], freundlich: [30, 0.3],
};

/** A duration in the largest unit that keeps it above one. */
export function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return "—";
  if (s < 120) return `${fmt(s, 3)} s`;
  if (s < 7200) return `${fmt(s / 60, 3)} min`;
  if (s < 172800) return `${fmt(s / 3600, 3)} h`;
  return `${fmt(s / 86400, 3)} d`;
}

const num = (v: number | string): number => (v === "" ? NaN : Number(v));

function grid(lo: number, hi: number, n: number, log = false): number[] {
  return Array.from({ length: n }, (_, k) => (log
    ? lo * Math.pow(hi / lo, k / (n - 1)) : lo + ((hi - lo) * k) / (n - 1)));
}

export function BatchAdsorptionTool(): JSX.Element {
  // ---- the isotherm and the tank ----
  const [system, setSystem] = useState<string>(EXAMPLES[0]!.id);
  const [customModel, setCustomModel] = useState<ModelId>("langmuir");
  const [customParams, setCustomParams] = useState<(number | string)[]>([...DEFAULT_PARAMS.langmuir]);
  const ex = EXAMPLES.find((e) => e.id === system) ?? null;
  const iso: Isotherm = ex ? ex.iso : { model: customModel, params: customParams.map(num) };
  const isoRefused = isothermRefusal(iso);
  const isoKey = `${iso.model}:${iso.params.join(",")}`;

  const [Vs, setV] = useState<number | string>(100);
  const [c0s, setC0] = useState<number | string>(50);
  const [Ms, setM] = useState<number | string>(20);
  const [q0s, setQ0] = useState<number | string>(0);
  const V = num(Vs), c0 = num(c0s), M = num(Ms), q0 = num(q0s);
  const tankRefused = isoRefused ?? (!(V > 0) ? "the volume must be positive"
    : !(c0 > 0) ? "the initial concentration must be positive"
      : !(M > 0) ? "the adsorbent mass must be positive"
        : !(q0 >= 0) ? "the initial loading cannot be negative" : null);
  const ok = tankRefused === null;

  // ---- step 1 ----
  const s1 = useMemo(() => (ok ? stageEquilibrium(iso, V, M, c0, q0) : null),
    [ok, isoKey, V, M, c0, q0]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cf1 = ok ? closedFormC(iso, V, M, c0, q0) : null;

  // ---- step 2 ----
  const [targetS, setTarget] = useState<number | string>(90);
  const target = num(targetS) / 100;
  const dose = ok ? doseFor(iso, V, c0, target, q0) : null;
  const floor = ok ? equilibriumFloor(iso, q0) : NaN;
  const doseCurve = useMemo(() => {
    if (!ok) return [] as XY[];
    const rs = [...grid(1, 90, 60), ...grid(90.5, 99.9, 40)];
    return rs.map((r): XY => [r, doseFor(iso, V, c0, r / 100, q0).M_g])
      .filter((p) => Number.isFinite(p[1]) && p[1] > 0);
  }, [ok, isoKey, V, c0, q0]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- step 3 (fresh adsorbent) ----
  const staged = useMemo(() => {
    if (!ok) return null;
    const Ns = [1, 2, 3, 4];
    return {
      cross: Ns.map((N) => crossflow(iso, V, M, c0, equalSplit(N))),
      counter: Ns.map((N) => countercurrent(iso, V, M, c0, N)),
      best: bestTwoStageSplit(iso, V, M, c0),
      splitCurve: grid(0.2, 0.8, 61).map((f): XY => [f, crossflow(iso, V, M, c0, [f, 1 - f]).cOut]),
    };
  }, [ok, isoKey, V, M, c0]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- step 4 (fresh adsorbent) ----
  const [dMm, setD] = useState<number | string>(0.5);
  const [rhoP, setRho] = useState<number | string>(800);
  const [DAB9, setDAB] = useState<number | string>(1);   // in 1e-9 m2/s
  const [Sh, setSh] = useState<number | string>(2);
  const [cTargetS, setCTarget] = useState<number | string>("");
  const film: FilmInput | null = ok && num(dMm) > 0 && num(rhoP) > 0 && num(DAB9) > 0 && num(Sh) > 0
    ? { iso, V_L: V, M_g: M, c0, d_m: num(dMm) / 1000, rhoP: num(rhoP), DAB: num(DAB9) * 1e-9, Sh: num(Sh) }
    : null;
  const cInfFresh = ok ? stageEquilibrium(iso, V, M, c0).c : NaN;
  const cTargetDefault = Number((cInfFresh + 0.05 * (c0 - cInfFresh)).toPrecision(3));
  const cTarget = cTargetS === "" ? cTargetDefault : num(cTargetS);
  const kin = useMemo(() => {
    if (!film) return null;
    const coef = filmCoefficients(film);
    const tt = timeToTarget(film, cTarget);
    //  Draw to 99 % of the approach to equilibrium, or past the target if later.
    const cInf = stageEquilibrium(iso, V, M, c0).c;
    const t99 = timeToTarget(film, cInf + 0.01 * (c0 - cInf)).t;
    const tEnd = Math.max(Number.isFinite(t99) ? t99 : 0, Number.isFinite(tt.t) ? 1.3 * tt.t : 0) || 10 / coef.kLa;
    const traj = filmTrajectory(film, tEnd);
    const sizes = [0.25, 0.5, 1, 2, 4].map((m) => {
      const f = { ...film, d_m: film.d_m * m };
      return { d_mm: f.d_m * 1000, t: timeToTarget(f, cTarget) };
    });
    return { coef, tt, traj, tEnd, sizes };
  }, [film?.d_m, film?.rhoP, film?.DAB, film?.Sh, ok, isoKey, V, M, c0, cTarget]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- step 5 ----
  const [De9, setDe] = useState<number | string>(0.1);   // in 1e-9 m2/s
  const bi = kin && num(De9) > 0 ? biot(kin.coef.kL, film!.d_m, num(De9) * 1e-9) : null;

  const tankPlotMax = ok ? Math.max(c0, s1 ? s1.c : 0) * 1.08 : 1;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto", minWidth: 0 }}>
        <Box>
          <Title order={3}>Batch adsorption in a stirred tank</Title>
          <Text size="sm" c="dimmed" mt={4}>
            You have a tank of solution and an adsorbent with a known isotherm.  How much
            adsorbent do you need, is it better split into stages, and how long does it take?
            Choose the isotherm and the tank below; each step answers one part of the question
            on them.  Every number here is computed by this page in your browser; the engine's
            batch adsorber contacts a gas, not a liquid.
          </Text>
        </Box>

        <Panel title="the isotherm and the tank" origin="assumption"
          originNote={ex ? "an example isotherm with this page's own illustrative numbers, and your tank"
            : "your isotherm and your tank"}>
          <Select label="isotherm" allowDeselect={false} value={system}
            onChange={(v) => { if (v) setSystem(v); }}
            data={[...EXAMPLES.map((e) => ({ value: e.id, label: e.label })),
              { value: "custom", label: "Your own isotherm (e.g. fitted on the isotherms page)" }]} />
          {ex ? (
            <Text size="sm">
              {ex.story}  {MODEL_LABEL[ex.iso.model]}:{" "}
              {PARAM_NAMES[ex.iso.model].map((nm, k) => `${nm} = ${ex.iso.params[k]}${PARAM_UNIT[ex.iso.model][k] === "–" ? "" : ` ${PARAM_UNIT[ex.iso.model][k]}`}`).join(", ")}.
              {" "}Illustrative values chosen for this page, not measurements.
            </Text>
          ) : (
            <Group gap="sm" align="flex-end" wrap="wrap">
              <Select label="model" allowDeselect={false} value={customModel} w={150}
                onChange={(v) => {
                  if (v) { setCustomModel(v as ModelId); setCustomParams([...DEFAULT_PARAMS[v as ModelId]]); }
                }}
                data={MODELS.map((m) => ({ value: m, label: MODEL_LABEL[m] }))} />
              {PARAM_NAMES[customModel].map((nm, k) => (
                <NumberInput key={`${customModel}${nm}`} w={150} min={0} decimalScale={6}
                  label={`${nm}${PARAM_UNIT[customModel][k] === "–" ? "" : `, ${PARAM_UNIT[customModel][k]}`}`}
                  value={customParams[k]}
                  onChange={(v) => setCustomParams((p) => p.map((x, i) => (i === k ? v : x)))} />
              ))}
            </Group>
          )}
          <Group gap="sm" align="flex-end" wrap="wrap">
            <NumberInput label="V, L" value={Vs} onChange={setV} min={0} w={110} />
            <NumberInput label="c₀, mg/L" value={c0s} onChange={setC0} min={0} w={120} />
            <NumberInput label="M, g" value={Ms} onChange={setM} min={0} w={110} />
            <NumberInput label="q₀ as added, mg/g" value={q0s} onChange={setQ0} min={0} w={150} />
          </Group>
          <Text size="xs" c="dimmed">
            One basis throughout: c in mg/L, q in mg/g, V in L, M in g, so that V c and M q are
            both milligrams.  q₀ is the loading the adsorbent carries when added (0 for fresh);
            it enters steps 1 and 2.  Steps 3 to 5 use fresh adsorbent.
          </Text>
          {tankRefused && (
            <Alert color="red" variant="light" title="Refused">
              <Text size="sm">{tankRefused}</Text>
            </Alert>
          )}
        </Panel>

        {step(1)}

        {ok && s1 && (
          <Panel title="one stage at equilibrium" origin="page"
            originNote="the root of the balance by bisection, and the closed form where one exists, by this page">
            <Text size="sm">
              {fmt(M)} g in {fmt(V)} L at {fmt(c0)} mg/L ends at <b>c = {fmt(s1.c)} mg/L</b> and
              q = {fmt(s1.q)} mg/g: <b>{fmt(removalPct(c0, s1.c), 4)} % removed</b>
              {s1.c > c0 ? " (negative: the loaded adsorbent gives solute back to this liquid)" : ""}.
              Bisection took {s1.iterations} halvings of the bracket [0, {fmt(c0 + (M * q0) / V)}] mg/L.
            </Text>
            <Text size="sm">
              {cf1 !== null
                ? `Closed form (${iso.model === "linear" ? "c = (V c₀ + M q₀)/(V + M K)" : "the positive root of the quadratic"}): c = ${fmt(cf1, 10)} mg/L, against ${fmt(s1.c, 10)} from the root solve -- a relative difference of ${fmt(Math.abs(cf1 - s1.c) / cf1, 2)}.`
                : "Freundlich has no closed form for this crossing; the root solve is the answer."}
            </Text>
            <XYPlot ariaLabel="isotherm with the operating line of one stage"
              xLabel="c, mg/L" yLabel="q, mg/g"
              series={[
                { name: `${MODEL_LABEL[iso.model]} isotherm`, color: MODEL_COLOR[iso.model],
                  line: grid(0, tankPlotMax, 160).map((c): XY => [c, qStar(iso, c)]) },
                { name: "operating line, slope −V/M", color: TEXT, dash: "6 4",
                  line: [[c0, q0], [s1.c, s1.q]] as XY[] },
                { name: "start (c₀, q₀)", color: INK, points: [[c0, q0]] },
                { name: "equilibrium", color: ANSWER, points: [[s1.c, s1.q]] },
              ]} />
          </Panel>
        )}

        {step(2)}

        {ok && dose && (
          <Panel title="the dose for a target removal" origin={["page", "assumption"]}
            originNote="the balance of step 2 on the isotherm above, by this page; the target is your input">
            <Group gap="sm" align="flex-end" wrap="wrap">
              <NumberInput label="target removal, %" value={targetS} onChange={setTarget} min={0} max={100}
                decimalScale={4} w={160} />
            </Group>
            {dose.refused ? (
              <Alert color="red" variant="light" title="Refused: this target cannot be reached">
                <Text size="sm">{dose.refused}</Text>
              </Alert>
            ) : (
              <Text size="sm">
                To take {fmt(c0)} mg/L down to <b>{fmt(dose.c)} mg/L</b>, the isotherm holds
                q* = {fmt(dose.q)} mg/g there and the balance needs <b>M = {fmt(dose.M_g)} g</b>
                {" "}({fmt(dose.M_g / V)} g per litre).
              </Text>
            )}
            {q0 > 0 && (
              <Text size="sm">
                The adsorbent as added carries {fmt(q0)} mg/g, so it is already in equilibrium with
                c*(q₀) = {fmt(floor)} mg/L: no dose takes the liquid below that floor
                ({fmt(removalPct(c0, floor), 4)} % removal{floor >= c0 ? ", i.e. none at all" : ""}).
              </Text>
            )}
            {doseCurve.length > 1 && (
              <XYPlot ariaLabel="adsorbent dose against target removal" ylog
                xLabel="target removal, %" yLabel="M, g (log scale)"
                series={[
                  { name: "dose for the removal", color: MODEL_COLOR[iso.model], line: doseCurve },
                  ...(dose.refused ? [] : [{ name: "your target", color: ANSWER, points: [[100 * target, dose.M_g]] as XY[] }]),
                ]} />
            )}
            {doseCurve.length > 1 && (() => {
              const at = (r: number) => doseFor(iso, V, c0, r, q0).M_g;
              const m90 = at(0.9), m99 = at(0.99), m999 = at(0.999);
              return Number.isFinite(m90) && Number.isFinite(m999) ? (
                <Text size="xs" c="dimmed">
                  On this isotherm: {fmt(m90)} g for 90 %, {fmt(m99)} g for 99 % ({fmt(m99 / m90, 3)} times
                  as much), {fmt(m999)} g for 99.9 % ({fmt(m999 / m99, 3)} times as much again).  The
                  vertical axis is logarithmic.
                </Text>
              ) : null;
            })()}
          </Panel>
        )}

        {step(3)}

        {ok && staged && (
          <Panel title="the same adsorbent in stages" origin="page"
            originNote="crossflow by the stage solve of step 1, countercurrent by shooting on the outlet concentration, both by this page; fresh adsorbent">
            <Wide>
              <Table fz="xs" striped withTableBorder style={{ minWidth: 520 }} styles={{ th: { whiteSpace: "nowrap" } }}>
                <Table.Thead><Table.Tr>
                  <Table.Th>stages N</Table.Th>
                  <Table.Th>crossflow, M/N each: c out, removal</Table.Th>
                  <Table.Th>countercurrent, M through all: c out, removal</Table.Th>
                  <Table.Th>largest balance error</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {staged.cross.map((cf, k) => {
                    const cc = staged.counter[k]!;
                    return (
                      <Table.Tr key={k}>
                        <Table.Td>{k + 1}</Table.Td>
                        <Table.Td>{fmt(cf.cOut)} mg/L, {fmt(cf.removal, 4)} %</Table.Td>
                        <Table.Td>{cc.refused ? `refused: ${cc.refused}` : `${fmt(cc.cOut)} mg/L, ${fmt(cc.removal, 4)} %`}</Table.Td>
                        <Table.Td>{fmt(Math.max(cf.balanceError, cf.stageBalanceError, cc.balanceError, cc.stageBalanceError), 2)}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Wide>
            <Text size="xs" c="dimmed">
              The balance error is |V c₀ − (V c_out + solute on the solid)| / (V c₀), over the
              whole arrangement and over each stage, recomputed from the stage states.
            </Text>
            <XYPlot ariaLabel="removal gained over one stage against number of stages, crossflow and countercurrent"
              xLabel="number of stages N" yLabel="removal gained over 1 stage, % points"
              series={[
                { name: "crossflow, equal shares", color: CROSS,
                  points: staged.cross.map((r, k): XY => [k + 1, r.removal - staged.cross[0]!.removal]),
                  line: staged.cross.map((r, k): XY => [k + 1, r.removal - staged.cross[0]!.removal]), dash: "2 3" },
                { name: "countercurrent", color: COUNTER,
                  points: staged.counter.map((r, k): XY => [k + 1, r.removal - staged.cross[0]!.removal]),
                  line: staged.counter.map((r, k): XY => [k + 1, r.removal - staged.cross[0]!.removal]), dash: "2 3" },
              ]} />
            <Text size="xs" c="dimmed">
              Drawn as the gain over one stage ({fmt(staged.cross[0]!.removal, 4)} % removed), so a small
              gain is visible; the table gives the removals themselves.
            </Text>
            <Text size="sm">
              <b>Best split of {fmt(M)} g between two crossflow stages:</b>{" "}
              {fmt(100 * staged.best.fraction, 3)} % in the first stage, leaving{" "}
              {fmt(staged.best.cOut)} mg/L ({fmt(staged.best.removal, 5)} % removed), against{" "}
              {fmt(staged.best.cEqual)} mg/L ({fmt(staged.best.removalEqual, 5)} %) for half and half.{" "}
              {iso.model === "linear"
                ? "For a linear isotherm the optimum is exactly half and half, as the algebra of step 3 says."
                : Math.abs(staged.best.fraction - 0.5) < 5e-3
                  ? "Here the optimum is within half a percent of an equal split: the isotherm is nearly linear over the concentrations this charge sees."
                  : `The optimum is not an equal split: it lowers the outlet concentration by ${fmt(100 * (staged.best.cEqual - staged.best.cOut) / staged.best.cEqual, 3)} % of the equal-split value.`}
            </Text>
            <XYPlot ariaLabel="outlet concentration against the share of adsorbent in the first stage"
              xLabel="share of the adsorbent in stage 1" yLabel="c out vs equal split, %"
              series={[
                { name: "two crossflow stages", color: CROSS,
                  line: staged.splitCurve.map(([f, c]): XY => [f, (100 * (c - staged.best.cEqual)) / staged.best.cEqual]) },
                { name: "best split", color: ANSWER,
                  points: [[staged.best.fraction, (100 * (staged.best.cOut - staged.best.cEqual)) / staged.best.cEqual]] },
                { name: "equal split", color: INK, points: [[0.5, 0]] },
              ]} />
            <Text size="xs" c="dimmed">
              The outlet concentration of the second stage, as a percentage above or below the
              equal-split value: below zero the split beats half and half.
            </Text>
          </Panel>
        )}

        {step(4)}

        {ok && (
          <Panel title="the uptake in time, film resistance only" origin={["page", "assumption"]}
            originNote="the film model of step 4 by this page; the particle size, density, diffusivity and Sherwood number are your inputs">
            <Group gap="sm" align="flex-end" wrap="wrap">
              <NumberInput label="d, mm" value={dMm} onChange={setD} min={0} decimalScale={4} w={110} />
              <NumberInput label="ρ_p (particle), kg/m³" value={rhoP} onChange={setRho} min={0} w={170} />
              <NumberInput label="D_AB, 10⁻⁹ m²/s" value={DAB9} onChange={setDAB} min={0} decimalScale={4} w={150} />
              <NumberInput label="Sh" value={Sh} onChange={setSh} min={0} decimalScale={3} w={90} />
              <NumberInput label="target c, mg/L" value={cTargetS === "" ? cTargetDefault : cTargetS}
                onChange={setCTarget} min={0} decimalScale={6} w={140} />
            </Group>
            <Text size="xs" c="dimmed">
              ρ_p is the PARTICLE density (a particle's mass over its own volume, pores included),
              which is what turns a mass of adsorbent into a number of spheres.  Sh = 2 is a sphere
              in still liquid: a lower bound on the film coefficient in a stirred tank.  The default
              target is 95 % of the way from c₀ to this dose's equilibrium,{" "}
              {fmt(cInfFresh)} mg/L.
            </Text>
            {!film && (
              <Alert color="red" variant="light" title="Refused">
                <Text size="sm">the diameter, density, diffusivity and Sherwood number must all be positive</Text>
              </Alert>
            )}
            {kin && (
              <>
                <Text size="sm">
                  k_L = {fmt(kin.coef.kL, 3)} m/s, a = {fmt(kin.coef.a, 3)} 1/m, k_L a = {fmt(kin.coef.kLa, 3)} 1/s.
                  {" "}{kin.traj.method === "closed form"
                    ? "Linear isotherm: the curve is the closed form c(t) = (c₀/β)[exp(−k_L a β t) + α]."
                    : `${MODEL_LABEL[iso.model]} isotherm: no closed form; the curve is a numerical integral of the ODE (fourth-order Runge-Kutta with step doubling, ${kin.traj.t.length - 1} accepted steps).`}
                </Text>
                {kin.tt.refused ? (
                  <Alert color="red" variant="light" title="Refused: this target is never reached">
                    <Text size="sm">{kin.tt.refused}</Text>
                  </Alert>
                ) : (
                  <Text size="sm">
                    Time to reach {fmt(cTarget)} mg/L: <b>{fmtTime(kin.tt.t)}</b> ({kin.tt.method}).
                  </Text>
                )}
                <XYPlot ariaLabel="bulk concentration against time"
                  xLabel="t, h" yLabel="c, mg/L"
                  series={[
                    { name: "c(t)", color: MODEL_COLOR[iso.model],
                      line: kin.traj.t.map((t, i): XY => [t / 3600, kin.traj.c[i]!]) },
                    { name: "equilibrium of step 1 (fresh adsorbent)", color: INK, dash: "6 4",
                      line: [[0, kin.traj.cInf], [kin.tEnd / 3600, kin.traj.cInf]] as XY[] },
                    ...(kin.tt.refused ? [] : [{ name: "target reached", color: ANSWER, points: [[kin.tt.t / 3600, cTarget]] as XY[] }]),
                  ]} />
                <Wide>
                  <Table fz="xs" striped withTableBorder style={{ minWidth: 360 }}>
                    <Table.Thead><Table.Tr>
                      <Table.Th>d, mm</Table.Th><Table.Th>time to target</Table.Th><Table.Th>÷ time at your d</Table.Th>
                    </Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {kin.sizes.map((s) => (
                        <Table.Tr key={s.d_mm}>
                          <Table.Td>{fmt(s.d_mm, 3)}</Table.Td>
                          <Table.Td>{s.t.refused ? "—" : fmtTime(s.t.t)}</Table.Td>
                          <Table.Td>{s.t.refused || kin.tt.refused ? "—" : fmt(s.t.t / kin.tt.t, 4)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Wide>
                <Text size="xs" c="dimmed">
                  Half the diameter, a quarter of the time; twice, four times: with Sh fixed every
                  time scales as d², for every isotherm, because d only multiplies k_L a.
                </Text>
              </>
            )}
          </Panel>
        )}

        {step(5)}

        {kin && (
          <Panel title="is the film-only answer reliable? the Biot number" origin={["page", "assumption"]}
            originNote="the Biot number and Glueckauf's series resistance by this page; the effective pore diffusivity is your assumption">
            <Group gap="sm" align="flex-end" wrap="wrap">
              <NumberInput label="D_e, effective pore diffusivity, 10⁻⁹ m²/s" value={De9} onChange={setDe} min={0}
                decimalScale={4} w={300} />
            </Group>
            {bi ? (
              <>
                <Text size="sm">
                  Bi = k_L R_p / D_e = {fmt(bi.Bi, 3)}, so the resistance inside the particle is about{" "}
                  <b>{fmt(bi.internalOverFilm, 3)} times</b> the film's (Bi/5, Glueckauf).  The film-only
                  times above would be multiplied by about {fmt(1 + bi.internalOverFilm, 3)} if the
                  particle's resistance were added in series.  With Sh = {fmt(num(Sh), 3)}, Bi = (Sh/2)(D_AB/D_e)
                  = {fmt((num(Sh) / 2) * (num(DAB9) / num(De9)), 3)}: the same at every particle diameter.
                </Text>
                {bi.unreliable ? (
                  <Alert color="yellow" variant="light" title="The film-only model is unreliable here">
                    <Text size="sm">
                      Diffusion inside the particle adds more than 10 % to the film's resistance at
                      the Sh you declared, and the times of step 4 leave it out.  At Sh = 2 the film is
                      itself slower than in a stirred tank, which partly hides the omission; with a
                      realistic, larger Sh the film is faster and the particle controls even more.  So
                      for these particles the film-only times are too short (optimistic).  The page
                      does not solve the diffusion inside the particle.
                    </Text>
                  </Alert>
                ) : (
                  <Text size="sm">
                    The internal resistance adds less than 10 % to the film's: the film-only model is a
                    fair description of these particles.
                  </Text>
                )}
              </>
            ) : (
              <Alert color="red" variant="light" title="Refused">
                <Text size="sm">the effective pore diffusivity must be positive</Text>
              </Alert>
            )}
          </Panel>
        )}

        {step(6)}

        <LessonLimits limits={BATCH_LIMITS} />
        <LessonReferences tool="batch-adsorption" />
      </Stack>
    </Box>
  );
}
