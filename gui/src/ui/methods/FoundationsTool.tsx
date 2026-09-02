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
  "The four laws: accepted, then tested" -- the FIRST page of the
  thermodynamics shelf, and the one the other six presuppose.  ONE mental
  model, per the owner's ruling of 2026-08-29: A LAW OF THERMODYNAMICS IS THE
  SUMMARY OF EVERY FAILED ATTEMPT TO VIOLATE IT.  It is not derived; it is
  accepted, deduced from, and tested without end.

  The owner's own framing (2026-09-02): thermodynamics is the perfect example
  that any theory must have foundations in reality that cannot be explained,
  only accepted and then tested again and again.  The page exists to lift
  what is usually attributed to Sommerfeld -- that on the third pass you know
  you do not understand it and no longer mind -- by naming what the third
  pass actually is: the moment you stop asking the laws to be explained.

  TWO WITNESSES RUN IN THE READER'S BROWSER, and the page reads them, never
  recomputes them:
    * steady/power/rankine02_water (choupoSolve) -- the FIRST law as the
      energy closure over the whole cycle (the engine's own stream enthalpies
      and duties re-added by case/balances.ts, the same helper the Streams
      summary uses), and the SECOND law as the turbine's published `dS_gen`
      beside its `eta_isen`: an inequality the engine tests on every run.
    * props/molecular/exergy01_air_dead_state (choupoProps) -- the second
      law's PRICE on a state: b = (h - h0) - T0 (s - s0), both legs published
      by the engine as `dh` and `T0ds`.

  ZERO PHYSICS HERE.  No logarithm, exponential or power call, no physical
  constant, no correlation (the test reads this source for them).  The
  formulas in the steps are TEXT a student reads, not code that runs; the
  numbers on the page are engine KPIs and engine diagnostics, and the only
  arithmetic is a re-addition the page names as its own.

  THE HONEST ABSENCE, stated on the page and pinned by the test: no unit
  operation publishes its own entropy generation.  The first law is checked
  on every unit of every run; the second only where a device is defined by
  an entropy reference or where a property op asks.  When a per-unit S_gen
  exists, the paragraph that says so is the one to rewrite.
\*---------------------------------------------------------------------------*/

import { useMemo } from "react";
import { Alert, Box, Group, Loader, Stack, Text, Title } from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import { energyBalance, unitEnergy } from "../../case/balances.js";
import { guideUrl } from "../../help/guideLinks.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import type { LessonLimit, LessonStep } from "./lessonStep.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";

/** The two witnesses.  Names as the bundled corpus spells them. */
export const CYCLE_WITNESS = "steady/power/rankine02_water";
export const EXERGY_WITNESS = "props/molecular/exergy01_air_dead_state";

/** The unit in the cycle witness that carries the second law as a KPI. */
export const TURBINE_UNIT = "steamTurbine";

/** The exergy op in the exergy witness whose state is NOT the dead state
 *  (the case runs the same op twice; `b_dead` sits AT the dead state and
 *  publishes zeros by construction). */
export const EXERGY_OP = "b_state";

// ---- the lesson --------------------------------------------------------------

export const STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The curse, named",
    body: "A remark is usually attributed to Arnold Sommerfeld: the first time "
      + "through thermodynamics you understand nothing; the second time you "
      + "think you understand it except for a point or two; the third time "
      + "you know you do not understand it, but you are used to it and it no "
      + "longer bothers you.  He published no such sentence — it reaches us "
      + "by report, and this page quotes it as an attribution, not a source.  "
      + "It is repeated because every cohort recognises it, and the "
      + "recognition points at something real: the subject is taught as if "
      + "its laws were derived, and they are not.  They are ACCEPTED.  A "
      + "student who keeps looking for the derivation underneath the second "
      + "law circles forever, because inside the theory there is nothing "
      + "underneath it — only the record of every engine that failed to run "
      + "without a cold sink.",
    note: "The third reading is the one in which you stop asking the laws to "
      + "be explained and start asking what they forbid, what follows from "
      + "them, and how often they have been checked.",
  },
  {
    n: 2,
    title: "What a postulate is, and what it is not",
    body: "A theory of this kind has three layers, and confusing them is the "
      + "whole of the curse.  POSTULATES: statements taken as true because "
      + "experience has never contradicted them; they cannot be derived, only "
      + "denied by an experiment that succeeds where every previous one "
      + "failed.  DEDUCTIONS: everything that follows from the postulates by "
      + "mathematics alone — the potentials H, A, G, the Maxwell relations, "
      + "the equilibrium criteria, the phase rule — as certain as the "
      + "postulates and no more.  TESTS: every measurement and every "
      + "calculation that could have contradicted a postulate and did not.  A "
      + "test never proves a law; it fails to refute it once more.  "
      + "Statistical mechanics is sometimes offered as the explanation "
      + "underneath; it supplies a MECHANISM for entropy but rests on a "
      + "postulate of its own (equal a priori probability of accessible "
      + "microstates), accepted on exactly the same grounds.  It moves the "
      + "acceptance down one floor; it does not remove it.",
    note: "Every physical theory has this floor.  Thermodynamics is the one "
      + "where the floor is closest to the surface — which is why it is the "
      + "best subject in which to learn that the floor exists.",
  },
  {
    n: 3,
    title: "The zeroth law: a temperature exists",
    body: "Postulated: if A is in thermal equilibrium with B, and B with C, "
      + "then A is in thermal equilibrium with C.  Transitivity is what makes "
      + "‘the same temperature’ a relation that can be measured by a THIRD "
      + "body — it licenses the thermometer, an object whose one property is "
      + "read and then assigned to anything in equilibrium with it.  Tested: "
      + "every thermometer ever placed in every bath, so routinely that the "
      + "test is invisible.  That is the first lesson in what ‘tested without "
      + "end’ means: the tests you no longer notice are the ones that have "
      + "never failed.  In Choupo a stream's temperature is a declared state; "
      + "whether the NUMBER is trustworthy is a question about the "
      + "measurement chain, and it has its own pages on this shelf.",
  },
  {
    n: 4,
    title: "The first law: energy is conserved",
    body: "Postulated: there is a state function U such that, for any process "
      + "on a closed system, its change equals the heat crossing the boundary "
      + "plus the work done on the system — equivalently, a machine that "
      + "produces work from nothing, cycle after cycle, does not exist.  It "
      + "rests on Joule's paddle wheel (1843–1850): a measured weight falling "
      + "a measured height warms a measured mass of water by a measured "
      + "amount, and the ratio is the same whatever the path.  For an open "
      + "system at steady state the deduction is the enthalpy balance every "
      + "unit operation in this simulator is built on, and the engine CHECKS "
      + "it rather than imposing it: the energy-balance report runs by "
      + "default on every converged steady case, and below, your browser has "
      + "just re-added the engine's own stream enthalpies, duties and shaft "
      + "work for a whole steam cycle.",
    formula: "Σ_in ṅ·h + Q̇ + Ẇ = Σ_out ṅ·h",
    where: [
      { sym: "Σ_in / Σ_out", means: "sum over every stream entering / "
        + "leaving the control volume" },
      { sym: "ṅ", means: "molar flow of a stream crossing the boundary",
        unit: "kmol/s" },
      { sym: "h", means: "molar enthalpy of that stream at its own (T, P, "
        + "composition), priced by the case's thermodynamic package",
        unit: "J/mol" },
      { sym: "Q̇ / Q", means: "net heat added to the process by its units — "
        + "utility heating counted positive, cooling negative", unit: "kW" },
      { sym: "Ẇ / W", means: "net shaft work done ON the process — pump and "
        + "compressor positive, turbine negative", unit: "kW" },
      { sym: "dU", means: "change of the internal energy held inside the "
        + "control volume — zero at steady state", unit: "J" },
      { sym: "P", means: "pressure at the boundary a stream crosses, doing "
        + "flow work P·v on the way in or out", unit: "Pa" },
    ],
    derivation: [
      { step: "Take a control volume around the whole process at steady "
        + "state, so nothing accumulates inside it.",
        eq: "dU/dt = 0" },
      { step: "Every stream that crosses the boundary carries its internal "
        + "energy AND does flow work P·v to get in or out; H = U + P·V is "
        + "the combination that folds the flow work into a state function.",
        eq: "u + P·v = h" },
      { step: "What is left of Joule's postulate is the balance of "
        + "enthalpy flows, heat and shaft work — the equation above.  The "
        + "residual the engine publishes is that equation being tested "
        + "once more." },
    ],
  },
  {
    n: 5,
    title: "The second law: some things do not come back",
    body: "Postulated, in two provably equivalent DENIALS: no process has as "
      + "its sole result the transfer of heat from a colder body to a hotter "
      + "one (Clausius); no process has as its sole result the complete "
      + "conversion of heat from a single reservoir into work (Kelvin–"
      + "Planck).  It rests on every heat engine ever built rejecting heat to "
      + "a cold sink.  Carnot (1824) turned that record into a bound; "
      + "Clausius (1854–1865) turned the bound into a state function, "
      + "entropy, whose GENERATION is never negative.  Entropy is not "
      + "disorder and not a substance: it is a ledger entry — the running "
      + "total of heat divided by the temperature at which it crossed — and "
      + "the second law says the universe's ledger only ever grows.  The "
      + "engine tests this where a device is defined by it: the turbine "
      + "below solves its ideal outlet on the engine's own entropy surface "
      + "and publishes how far the real outlet falls short.",
    formula: "S_gen = ΔS_system − Σ_k Q_k / T_k ≥ 0",
    where: [
      { sym: "S_gen", means: "entropy generated by the process — zero only "
        + "in the reversible limit no real device reaches", unit: "J/K" },
      { sym: "ΔS_system", means: "change in the entropy of the system "
        + "itself between the two states, a state function", unit: "J/K" },
      { sym: "Σ_k", means: "sum over the boundary elements k through which "
        + "heat crosses" },
      { sym: "Q_k", means: "heat received by the system across boundary "
        + "element k", unit: "J" },
      { sym: "T_k", means: "temperature at which that heat crossed the "
        + "boundary", unit: "K" },
      { sym: "η_rev", means: "efficiency of the reversible engine between "
        + "two reservoirs — Carnot's bound", unit: "-" },
      { sym: "T_hot / T_cold", means: "temperatures of the hot and cold "
        + "reservoirs", unit: "K" },
      { sym: "δQ_rev", means: "an infinitesimal heat exchanged along a "
        + "REVERSIBLE path", unit: "J" },
      { sym: "T", means: "temperature at which that reversible heat is "
        + "exchanged", unit: "K" },
      { sym: "dS", means: "the infinitesimal change of entropy the ratio "
        + "defines", unit: "J/K" },
    ],
    derivation: [
      { step: "Carnot: no engine between two reservoirs beats the "
        + "reversible one, and the reversible efficiency depends on the "
        + "two temperatures alone.",
        eq: "η_rev = 1 − T_cold / T_hot" },
      { step: "Clausius: around any reversible cycle the heat-over-"
        + "temperature sums to zero, so δQ_rev/T integrates to a property "
        + "of the state — entropy.",
        eq: "∮ δQ_rev / T = 0     ⇒     dS = δQ_rev / T" },
      { step: "For any process at all, the entropy change is at least the "
        + "heat-over-temperature received; the difference is what was "
        + "generated, and it is never negative.  That inequality is the "
        + "formula above." },
    ],
    note: "‘Entropy always increases’ is wrong as stated: the entropy of a "
      + "SYSTEM falls whenever it is cooled.  What never falls is S_gen, "
      + "which includes the surroundings' share.  Read every ‘entropy "
      + "decreased’ as a question about where the rest went.",
  },
  {
    n: 6,
    title: "The third law: entropy has a zero",
    body: "Postulated: the entropy of a perfect crystal approaches zero as T "
      + "approaches 0 K (Nernst 1906, Planck 1911).  It rests on calorimetry "
      + "to ever-lower temperatures and on the practical impossibility of "
      + "reaching absolute zero in finitely many steps.  The first two laws "
      + "define only DIFFERENCES of entropy; the third gives every substance "
      + "an absolute s(T) built from heat capacities and transition "
      + "enthalpies alone — no reaction need be run.  That single fact is "
      + "what lets an equilibrium constant be computed from calorimetry on "
      + "the pure substances: every standardThermochemistry block in the "
      + "catalogue carries an s_298 on that footing, and every Gibbs reactor "
      + "in this simulator is the third law being used.  The ledger that "
      + "assembles such an entropy term by term is the subject of ‘What is "
      + "entropy?’, the page beside this one.",
    formula: "ΔG° = ΔH° − T·ΔS°        K = exp(−ΔG° / R·T)",
    where: [
      { sym: "ΔG", means: "Gibbs energy change of the reaction, in the "
        + "standard state (°)", unit: "J/mol" },
      { sym: "ΔH", means: "standard enthalpy change, from the elements "
        + "datum each species carries", unit: "J/mol" },
      { sym: "ΔS", means: "standard entropy change — computable ONLY "
        + "because each species has an absolute s_298", unit: "J/(mol·K)" },
      { sym: "K", means: "equilibrium constant of the reaction", unit: "-" },
      { sym: "R", means: "gas constant", unit: "J/(mol·K)" },
      { sym: "T", means: "temperature", unit: "K" },
    ],
  },
  {
    n: 7,
    title: "Where the laws stop: the seam",
    body: "The laws and their deductions are parameter-free.  They say THAT "
      + "chemical potentials must match across phases; they never say HOW to "
      + "compute one for a real mixture.  The Properties Guide draws this as "
      + "a target — the four laws at the core, the formalism around them, and "
      + "the first fault line at the ring of constitutive models: equations "
      + "of state, activity models, kinetic laws.  From that ring outward the "
      + "theory is necessary and no longer sufficient.  Confusion in "
      + "thermodynamics is almost always that seam showing through: a "
      + "derivation that felt exact suddenly needs a number nobody derived.  "
      + "Follow one result from postulate to printed number and name the "
      + "kind of statement each step is — the table below does it for the "
      + "vapour pressure of benzene, the road every bubble point in this "
      + "simulator travels.",
    formula: "log₁₀ P_sat = A − B / (C + T)",
    where: [
      { sym: "P_sat", means: "vapour pressure of the pure component",
        unit: "bar" },
      { sym: "A, B, C", means: "the three Antoine constants of the "
        + "catalogue record — FITTED to measurements over a declared "
        + "temperature window, not derived from any law" },
      { sym: "T", means: "temperature, inside that window or announced as "
        + "an extrapolation outside it", unit: "K" },
      { sym: "dP / dT", means: "slope of the coexistence curve — how fast "
        + "the vapour pressure rises with temperature", unit: "Pa/K" },
      { sym: "Δs / Δv", means: "molar entropy and molar volume of "
        + "vaporisation, vapour minus liquid", unit: "J/(mol·K), m³/mol" },
      { sym: "Δh_vap", means: "molar enthalpy of vaporisation",
        unit: "J/mol" },
      { sym: "R", means: "gas constant", unit: "J/(mol·K)" },
    ],
    derivation: [
      { step: "DEDUCTION from the second law: along coexistence the "
        + "chemical potentials of liquid and vapour are equal, and "
        + "differentiating along the curve gives Clapeyron, exact.",
        eq: "dP/dT = Δs/Δv = Δh_vap / (T·Δv)" },
      { step: "MODEL: take the vapour ideal and the liquid volume "
        + "negligible — two approximations the laws do not license, good "
        + "for benzene at one atmosphere, wrong near the critical point.",
        eq: "Δv ≈ R·T/P" },
      { step: "MODEL: take Δh_vap constant over the range and integrate — "
        + "Clausius–Clapeyron.",
        eq: "ln P = −Δh_vap/(R·T) + const" },
      { step: "FIT: Antoine adds the constant C so the line bends the way "
        + "the data do; the three constants are regressed, and the record "
        + "declares the window they were regressed over.  DATA: benzene's "
        + "record says Trange (287.7 354.07) K.  TEST: the bubble point of "
        + "a benzene/toluene feed is compared with a recorded golden on "
        + "every run of the suite." },
    ],
    note: "Three of those rows are as certain as the laws.  Two are "
      + "approximations.  One is a fit.  One is data with a declared range.  "
      + "The number a student reads off a flash is all of them at once, and "
      + "the curse lifts the moment the student can say which row each doubt "
      + "belongs to.",
  },
  {
    n: 8,
    title: "Tested without end",
    body: "‘Tested’ has a precise and deliberately modest meaning in this "
      + "project.  A golden is a REGRESSION, not a validation: every full "
      + "run compares thousands of published numbers against self-recorded "
      + "values, and a PASS proves an answer has not moved — not that it is "
      + "right.  The cases compared against independent published results "
      + "are a small, named subset.  The balances are the laws being tested: "
      + "mass, atoms and energy close on every converged steady run, and "
      + "their residuals are published so the test is VISIBLE, which is what "
      + "separates a test from an assumption.  A refusal is a test the "
      + "engine performs on itself: when a run leaves a declared validity "
      + "window the engine says so, and when a record lacks a datum the law "
      + "needs, it refuses rather than substituting.  The alternative — a "
      + "plausible number with nothing behind it — is exactly the state the "
      + "curse describes: used to it, no longer bothered.",
  },
];

/** What this page does NOT show, said rather than implied. */
export const LIMITS: readonly LessonLimit[] = [
  {
    id: "no-unit-sgen",
    title: "No unit operation publishes its own entropy generation.",
    body: "The first law is checked on every unit of every run by the "
      + "energy-balance report.  The second law is checked only where a "
      + "device is DEFINED by an entropy reference (the turbine and "
      + "compressor, whose dS_gen is on this page) or where a property "
      + "operation asks for it (the exergy op).  A heat exchanger that moved "
      + "heat from cold to hot would not be caught by any balance.  The "
      + "engine cannot produce such a state from consistent thermodynamics, "
      + "but not being able to produce it and checking that it was not "
      + "produced are different things, and this page records the second as "
      + "absent.  When a per-unit S_gen exists, this paragraph is the one to "
      + "rewrite.",
  },
  {
    id: "no-mechanism",
    title: "No mechanism for the laws.",
    body: "This page gives no molecular picture of entropy and no "
      + "statistical derivation, on purpose: the point of the page is that "
      + "the laws are accepted before any mechanism is offered, and that the "
      + "mechanism, when it comes, rests on a postulate of the same "
      + "standing.",
  },
  {
    id: "no-validation-claim",
    title: "The cycle below is a regression witness, not a validated plant.",
    body: "Its numbers agree with the IAPWS-IF97 steam tables where the "
      + "case says so; that is a check of the steam surface, not of a real "
      + "power station.",
  },
];

/** The questions this page installs. */
export const INTERROGATION = [
  "Which layer is this doubt about — a law, a deduction, a model, a fit, a datum, or a test?",
  "Which balance would have caught it, and does the engine run that balance on this case?",
  "Is this quantity a difference the first two laws define, or an absolute the third law anchors?",
  "Where did the entropy this device generated go — and is the number on the page S_gen or ΔS_system?",
  "Has anything ever contradicted the law I am tempted to doubt — or only the model I fitted under it?",
] as const;

const step = lessonStepper(STEPS);

// ---- the engine, read ---------------------------------------------------------

/** What the page reads off the cycle run.  Every number is the engine's. */
export interface CycleReading {
  inKw: number;
  heatKw: number;
  workKw: number;
  outKw: number;
  deltaKw: number;
  closureErr: number;
  dSgen: number;       // J/(mol·K), the turbine's own KPI
  etaIsen: number;     // the turbine's own KPI
}

export function readCycle(
  streams: Parameters<typeof energyBalance>[0] | undefined,
  utilityAllocation: Parameters<typeof unitEnergy>[0],
  kpis: { [unit: string]: { [k: string]: number } } | undefined,
): CycleReading | null {
  if (!streams || !kpis) return null;
  const turbine = kpis[TURBINE_UNIT];
  if (!turbine || !("dS_gen" in turbine) || !("eta_isen" in turbine)) {
    return null;
  }
  const { heatAddedKw, heatRemovedKw, workKw } = unitEnergy(utilityAllocation,
    kpis);
  const eb = energyBalance(streams, { heatKw: heatAddedKw - heatRemovedKw,
    workKw });
  return {
    inKw: eb.inKw, heatKw: eb.heatKw, workKw: eb.workKw, outKw: eb.outKw,
    deltaKw: eb.delta, closureErr: eb.closureErr,
    dSgen: turbine["dS_gen"]!, etaIsen: turbine["eta_isen"]!,
  };
}

/** What the page reads off the exergy op: the two legs and their sum. */
export interface ExergyReading {
  dh: number; T0ds: number; b: number; T: number; T0: number;
}

export function readExergy(
  d: { [k: string]: number } | undefined,
): ExergyReading | null {
  if (!d) return null;
  for (const k of ["dh", "T0ds", "b_physical", "T", "T0"]) {
    if (!(k in d)) return null;
  }
  return { dh: d["dh"]!, T0ds: d["T0ds"]!, b: d["b_physical"]!,
    T: d["T"]!, T0: d["T0"]! };
}

// ---- visual pieces ---------------------------------------------------------

function Row({ label, value, unit, accent }:
  { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <Group justify="space-between" px="sm" py={4}
      style={{ borderBottom: `1px solid ${GRID}` }}>
      <Text size="sm" fw={accent ? 700 : 400}>{label}</Text>
      <Text size="sm" ff="monospace" fw={accent ? 700 : 400}
        c={accent ? ACCENT : undefined}>
        {value}{unit ? <Text span c={INK}> {unit}</Text> : null}
      </Text>
    </Group>
  );
}

function CycleTable({ c }: { c: CycleReading }) {
  const sgnKw = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(4)}`;
  return (
    <Box my={8} style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Group px="sm" py={6} style={{ borderBottom: `2px solid ${GRID}` }}>
        <Text size="xs" c={INK} fw={700} tt="uppercase">
          the first law, re-added from the engine’s own run of rankine02
        </Text>
      </Group>
      <Row label="boundary streams in  Σ ṅ·h" value={sgnKw(c.inKw)} unit="kW" />
      <Row label="heat added by the units  Q̇" value={sgnKw(c.heatKw)} unit="kW" />
      <Row label="shaft work on the process  Ẇ" value={sgnKw(c.workKw)} unit="kW" />
      <Row label="boundary streams out  Σ ṅ·h" value={sgnKw(c.outKw)} unit="kW" />
      <Row label="residual  (in + Q̇ + Ẇ) − out" value={sgnKw(c.deltaKw)}
        unit="kW" accent />
      <Group px="sm" py={6} style={{ borderTop: `2px solid ${GRID}` }}>
        <Text size="xs" c={INK} fw={700} tt="uppercase">
          the second law, as the turbine publishes it
        </Text>
      </Group>
      <Row label="entropy generated  dS_gen = s_out − s_in"
        value={c.dSgen.toExponential(3)} unit="J/(mol·K)" accent />
      <Row label="isentropic efficiency  η_isen = W / W_isentropic"
        value={c.etaIsen.toFixed(4)} />
      <Text size="xs" c={INK} px="sm" py={6}>
        The residual is the engine’s enthalpies, duties and shaft work added
        up by this page (the same helper the Streams summary uses) — the
        first law tested once more, on a closed steam cycle.  The turbine’s
        dS_gen is the engine’s own KPI: its ideal outlet was found by holding
        entropy constant on the real steam surface, and the sign of what the
        real outlet adds is the second law holding.  A negative number here
        would be a perpetual-motion machine of the second kind.
      </Text>
    </Box>
  );
}

function ExergyTable({ x }: { x: ExergyReading }) {
  const f = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  return (
    <Box my={8} style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Group px="sm" py={6} style={{ borderBottom: `2px solid ${GRID}` }}>
        <Text size="xs" c={INK} fw={700} tt="uppercase">
          the second law’s price on a state, from exergy01
        </Text>
      </Group>
      <Row label={`enthalpy above the dead state  h − h₀  (${x.T} K vs ${x.T0} K)`}
        value={f(x.dh)} unit="J/mol" />
      <Row label="what no device can turn into work  T₀·(s − s₀)"
        value={f(x.T0ds)} unit="J/mol" />
      <Row label="physical exergy  b = (h − h₀) − T₀·(s − s₀)"
        value={f(x.b)} unit="J/mol" accent />
      <Text size="xs" c={INK} px="sm" py={6}>
        Both legs are engine calls on the engine’s own h and s surfaces; the
        page prints them.  The first law says the whole of h − h₀ is there;
        the second law says only b of it is available.  The difference is
        the T₀·Δs leg, and it is the second law with a price tag.
      </Text>
    </Box>
  );
}

// ---- the page --------------------------------------------------------------

export function FoundationsTool(): JSX.Element {
  const cycle = useMethodRun(CYCLE_WITNESS, [], "foundations-cycle",
    "choupoSolve");
  const exergy = useMethodRun(EXERGY_WITNESS, [], "foundations-exergy",
    "choupoProps");

  const c = useMemo(() => readCycle(cycle.result?.streams,
    cycle.result?.utilityAllocation, cycle.result?.kpis), [cycle.result]);

  //  FIND THE OP BY WHAT IT PUBLISHES AND BY ITS STATE, never by its name
  //  alone: the witness runs the SAME op twice, once at the feed state and
  //  once AT the dead state (where every leg is zero by construction), and
  //  a table of zeros would read as the second law costing nothing.
  const x = useMemo(() => {
    const ops = exergy.result?.operationResults;
    const op = ops?.find((o) => o.diagnostics && "b_physical" in o.diagnostics
      && o.diagnostics["T"] !== o.diagnostics["T0"]);
    return readExergy(op?.diagnostics);
  }, [exergy.result]);

  const witnessAlert = (run: { busy: boolean; err: string | null },
    have: boolean, what: string, path: string) => {
    if (run.err) {
      return (
        <Alert color="yellow" my={8}>
          The witness could not run here ({run.err}) — {what} needs the WASM
          build.  The case is tutorials/{path}; run it with runCase to see the
          same numbers.
        </Alert>
      );
    }
    if (run.busy) {
      return (
        <Group gap={8} my={8}><Loader size="xs" />
          <Text size="sm" c="dimmed">running {path} in your browser…</Text>
        </Group>
      );
    }
    if (!have) {
      return (
        <Alert color="orange" my={8} title="The numbers did not arrive">
          The witness ran, but it did not publish what this table is built
          from, so there is nothing to show and this page cannot check
          itself against the engine.  That is a defect in tutorials/{path},
          not something you did.
        </Alert>
      );
    }
    return null;
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>The four laws: accepted, then tested</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Thermodynamics is the one subject in the curriculum whose
            foundations cannot be explained from anything more basic inside
            the theory.  By the end of this page a law should read to you as
            <strong> the summary of every failed attempt to violate it</strong>
            {" "}— accepted, deduced from, and tested without end — and a
            number from this simulator as a stack you can read layer by
            layer: postulate, deduction, model, fit, data, test.
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}

        <Box>
          <Text size="sm">
            Your browser has just asked the real engine (the same WASM
            solver that runs your cases) to solve a closed Rankine steam
            cycle — pump, boiler, turbine, condenser, recycle — on the
            IAPWS-IF97 surface, and this page re-adds what it published:
          </Text>
          {witnessAlert(cycle, c !== null, "the closure table", CYCLE_WITNESS)}
          {c && <CycleTable c={c} />}
        </Box>

        {step(5)}

        <Box>
          <Text size="sm">
            The same law, read as a price rather than a prohibition: the
            engine has also priced 79/21 nitrogen/oxygen at 400 K and 2 bar
            against a declared dead state at 298.15 K and 1 bar —
          </Text>
          {witnessAlert(exergy, x !== null, "the exergy table", EXERGY_WITNESS)}
          {x && <ExergyTable x={x} />}
        </Box>

        {step(6)}
        {step(7)}
        {step(8)}

        <LessonLimits limits={LIMITS} />

        <Box>
          <Title order={5}>The third reading</Title>
          <Text size="sm" mt={4}>
            Sommerfeld’s third pass — “you know you don’t understand it, but
            it no longer bothers you” — is usually told as resignation.  It
            is not.  It is the moment you stop demanding of the four laws
            something no law can give, and start holding them to the only
            standard that applies: <em>have they ever been contradicted?</em>
            {" "}They have not.  Everything else on this shelf is deduction
            from them, models beside them, data under them, and tests around
            them.  When anyone hands you a thermodynamic number, you own it
            when you can ask:
          </Text>
          <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${ACCENT}` }}>
            {INTERROGATION.map((q) => (
              <Text size="sm" key={q} mb={4}>· {q}</Text>
            ))}
          </Box>
          <Text size="xs" c={INK} mt={6}>
            The chapter behind this page, with the same four questions asked
            of each law and the seam read row by row:{" "}
            <a href={guideUrl("theoryGuide", "ch:foundations")}
               target="_blank" rel="noreferrer">
              Theory Guide · The four laws: accepted, then tested
            </a>.
          </Text>
        </Box>

      </Stack>
    </Box>
  );
}
