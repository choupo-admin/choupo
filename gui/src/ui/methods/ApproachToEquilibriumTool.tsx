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
  ApproachToEquilibriumTool -- the Gibbs reactor and the temperature approach.

  THE PAGE IS A SCROLLING LESSON.  Steps 1-4 of `approachToEquilibriumLesson`
  sit ABOVE the interactive and earn it; the three caveats the engine prints
  itself and the two things Choupo does NOT have sit below; the limits close.
  There is no docked rail -- the two knobs live in a column beside the
  readout, which is the VanHeerden layout.

  WHAT THE INTERACTIVE IS, and it is the one design decision on this page.
  A slider that writes `temperatureApproach` into a dict is IMPOSSIBLE here,
  and the reason is a contract rather than an omission: methodRun's override
  channel replaces the NUMBER of a DECLARED scalar and deliberately cannot add
  a key ("a knob that needs one is a knob the witness case should declare"),
  and -- measured 2026-09-25 -- no case in the corpus then declared an
  approach of any kind (`ammoniaStaged03_approach` declares one since that
  day; it runs at 200 bar under SRK, where the equivalence below does NOT
  hold, so it is named in the prose and is not a witness).

  THE SIGN IS THE ENGINE'S (ruled 2026-09-26).  A case declares
  `temperatureApproach` as a MAGNITUDE; a negative value is refused by name
  (GibbsReactor.cpp:278-289), and the engine assigns the direction from the
  isothermal enthalpy change between the feed and its true equilibrium at the
  physical T (`GibbsReactor::approachDirection`, :67-106).  This panel reads
  the SAME quantity the same way -- on these witnesses the feed and the
  reactor share a temperature, so the published `Q_kW` IS that isothermal
  change -- and moves the second run in the direction the engine would take.
  The other direction is still SHOWN, on request, because seeing the model
  beat its own equilibrium is the lesson; it is labelled as the direction the
  engine never takes, and this panel can only show it because it runs the
  case at a different temperature rather than declaring an approach.

  So the panel runs the SAME case TWICE, at T and at T + dT, and reads the
  composition off the second.  That is not a stand-in for the engine's
  approach; ON THESE TWO WITNESSES IT IS THE SAME COMPUTATION.  The outlet
  composition depends on the evaluation temperature ONLY through `g_over_RT`
  and, under a real equation of state, through ln(phi_i) -- the residual in
  gibbsGasSolve is built from `g_eff`, `ln_P` and the atom matrix alone
  (GibbsMethod.cpp:64-94).  Both witnesses run at 1 bar with
  `fugacityModel idealGas`, so phi = 1, `g_eff == g_over_RT`, and shifting the
  whole solve temperature and shifting only the chemistry are the same
  arithmetic.  VERIFIED against the native binary before this file was
  written, not argued:

      gibbs01_water_gas_shift, T = 800 K
        run at 850 K                     y_CO  = 0.182409956137
        temperatureApproach 50 at 800 K  y_CO  = 0.182409956137
      gibbs02_steam_reforming, T = 1000 K
        run at 1050 K                    y_CH4 = 0.000698983877988
        temperatureApproach 50 at 1000 K y_CH4 = 0.000698983877988

  The same comparison on gibbs10_ammonia_fugacity (200 bar, SRK) does NOT
  agree -- 0.280059 against 0.281596 -- which is why that case is named in the
  prose and is NOT a witness here.  The divergence IS the third caveat.

  THE FEED TEMPERATURE MOVES WITH THE REACTOR, and that is what makes `Q_kW`
  readable.  GibbsReactor.cpp:482 publishes `Q_kW = H_out - H_in` with H_in at
  the FEED temperature, so with a feed left behind it carries sensible heat and
  its sign stops being the thermicity (measured: the shift reactor at 1200 K
  with an 800 K feed reports +2.04 kW and is exothermic).  With both at the
  same T it is the isothermal reaction duty and its sign is exactly the sign of
  the transformation's enthalpy change.  The composition is untouched by this
  -- verified byte-identical on both witnesses -- because in isothermal mode
  the feed temperature reaches nothing but H_in.

  ZERO PHYSICS IN TYPESCRIPT.  Everything on the readout is an engine KPI.
  The only arithmetic is ONE subtraction between two published numbers and two
  sign reads, and the drawing plots exactly the two points that were computed
  and draws no curve between them, because no third point exists.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Stack, Text, Title,
} from "@mantine/core";

import { useMethodRun, type DictOverride } from "../../case/methodRun.js";
import { KnobSlider, PanelNote, type PanelKnob } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { APPROACH_LIMITS, APPROACH_STEPS } from "./approachToEquilibriumLesson.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

/** One classroom witness: a bundled Gibbs case, the unit whose KPI row is
 *  read, and the ONE published mole fraction that measures how far the
 *  transformation went.
 *
 *  `moreIsMoreConverted` is a DECLARATION about what the species is, not a
 *  computation: CO2 is a shift PRODUCT so more of it is more conversion, and
 *  CH4 is the reformer's unconverted FEED so less of it is.  Both readings are
 *  the witness case's own framing, in its own header.  Nothing here derives a
 *  conversion; the panel compares one published number with itself at two
 *  temperatures. */
export interface ApproachWitness {
  id: string;
  label: string;
  /** Bundled tutorial identifier (no leading `tutorials/`). */
  witness: string;
  /** The unit name the case declares — the key into `result.kpis`. */
  unit: string;
  reaction: string;
  /** What the case declares, and why the equivalence above is exact here. */
  conditions: string;
  T0: number;
  Tmin: number;
  Tmax: number;
  metricKpi: string;
  metricLabel: string;
  moreIsMoreConverted: boolean;
}

//  Named consts rather than array literals so `?? WGS` resolves to a witness
//  and not to `ApproachWitness | undefined`: this tree compiles with
//  `noUncheckedIndexedAccess`, and a `[0]` fallback is exactly what that flag
//  exists to reject.
const WGS: ApproachWitness = {
  id: "wgs",
  label: "Water–gas shift",
  witness: "steady/gibbs/gibbs01_water_gas_shift",
  unit: "wgs",
  reaction: "CO + H₂O ⇌ CO₂ + H₂",
  conditions: "1 bar, fugacityModel idealGas, equimolar CO/steam feed",
  T0: 800, Tmin: 600, Tmax: 1200,
  metricKpi: "y_CO2",
  metricLabel: "equilibrium CO₂ mole fraction (the product)",
  moreIsMoreConverted: true,
};

const REFORMING: ApproachWitness = {
  id: "reforming",
  label: "Methane steam reforming",
  witness: "steady/gibbs/gibbs02_steam_reforming",
  unit: "reformer",
  reaction: "CH₄ + H₂O ⇌ CO + 3 H₂, with the shift on the same catalyst",
  conditions: "1 bar, fugacityModel idealGas, steam-to-carbon 3",
  T0: 1000, Tmin: 800, Tmax: 1300,
  metricKpi: "y_CH4",
  metricLabel: "equilibrium methane slip (the unconverted feed)",
  moreIsMoreConverted: false,
};

export const APPROACH_WITNESSES: readonly ApproachWitness[] = [WGS, REFORMING];

/** The two dict scalars one run writes: the reactor's evaluation temperature
 *  and the feed's, held together so `Q_kW` stays the isothermal reaction duty
 *  (see the header).  Both slots declare `K`, and the unit is asserted rather
 *  than assumed — methodRun refuses a mismatch by name. */
export function approachOverrides(T_K: number): DictOverride[] {
  return [
    { file: "system/flowsheetDict", key: "T", value: T_K, unit: "K" },
    { file: "0/feed", key: "T", value: T_K, unit: "K" },
  ];
}

/** Which way a declared approach has moved this reactor, from the ONE metric
 *  the witness declares.  `null` when there is nothing to compare.
 *
 *  This is a COMPARISON OF TWO ENGINE NUMBERS under a declared direction, and
 *  it is the whole of the tool's arithmetic.  It never asks what the reaction
 *  is, never reads an enthalpy and never forms a conversion. */
export type ApproachVerdict = "equilibrium" | "short" | "beyond";

export function verdictOf(
  base: number | null, shifted: number | null, dT: number,
  moreIsMoreConverted: boolean,
): ApproachVerdict | null {
  if (base === null || shifted === null) return null;
  if (dT === 0) return "equilibrium";
  const progressBase = moreIsMoreConverted ? base : -base;
  const progressShifted = moreIsMoreConverted ? shifted : -shifted;
  if (progressShifted === progressBase) return "equilibrium";
  return progressShifted < progressBase ? "short" : "beyond";
}

/** The thermicity WORD the engine's own duty carries, or null when the run
 *  published none.  Sign convention is GibbsReactor.cpp:482 — `Q_kW` is heat
 *  ADDED to the process to hold T, so a negative duty is heat removed. */
export function thermicityOf(Q_kW: number | null):
  "exothermic" | "endothermic" | "thermally neutral" | null {
  if (Q_kW === null) return null;
  if (Q_kW < 0) return "exothermic";
  if (Q_kW > 0) return "endothermic";
  return "thermally neutral";
}

/** The sign the ENGINE assigns, from the thermicity alone (step 4): the
 *  same rule `GibbsReactor::approachDirection` applies -- T + |ΔT| for an
 *  exothermic transformation, T − |ΔT| for an endothermic one, and `null`
 *  where it cannot decide (the engine then takes + and says so). */
export function engineSignOf(
  t: ReturnType<typeof thermicityOf>,
): "positive" | "negative" | null {
  if (t === "exothermic") return "positive";
  if (t === "endothermic") return "negative";
  return null;
}

/** The magnitude knob.  Its floor is 0 because the engine's is: a negative
 *  `temperatureApproach` is refused by name (GibbsReactor.cpp:278-289), so a
 *  slider that offered one would teach a declaration the engine rejects. */
export const DT_KNOB: PanelKnob = {
  id: "dT", label: "approach |ΔT| — a MAGNITUDE; the engine picks the direction",
  min: 0, max: 100, step: 5, unit: "K",
  why: "You declare only how FAR from equilibrium the outlet sits.  The "
    + "engine reads the thermicity of your feed's transformation at the "
    + "physical T and moves the chemistry the way that under-predicts it: "
    + "T + |ΔT| for exothermic, T − |ΔT| for endothermic.  The readout says "
    + "which it chose; the switch below lets you SEE the other direction, "
    + "which the engine never takes.",
};

export type DirectionShown = "engine" | "other";

function fmt(v: number | null, digits: number): string {
  return v === null ? "—" : v.toFixed(digits);
}

export function ApproachToEquilibriumTool(): JSX.Element {
  const [witnessId, setWitnessId] = useState(WGS.id);
  const w = APPROACH_WITNESSES.find((x) => x.id === witnessId) ?? WGS;
  const [T, setT] = useState(WGS.T0);
  const [dTmag, setDTmag] = useState(0);
  const [shown, setShown] = useState<DirectionShown>("engine");

  //  A witness swap carries its own base temperature: 800 K is inside the
  //  reformer's window but is not its case, and a slider left behind would
  //  silently run the second case at the first one's condition.
  const onWitness = (id: string) => {
    const next = APPROACH_WITNESSES.find((x) => x.id === id);
    if (!next) return;
    setWitnessId(id);
    setT(next.T0);
  };

  const Tbase = Math.min(Math.max(T, w.Tmin), w.Tmax);

  //  The base run comes first: the direction is READ off it, exactly as the
  //  engine reads the direction off its own dT = 0 probe.
  const baseOv = useMemo(() => approachOverrides(Tbase), [Tbase]);
  const baseRun = useMethodRun(
    w.witness, baseOv, JSON.stringify([w.id, Tbase]), "choupoSolve");

  const rowOf = (r: typeof baseRun) => r.result?.kpis?.[w.unit] ?? null;
  const pick = (r: typeof baseRun, key: string): number | null => {
    const v = rowOf(r)?.[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  const Q_kW = pick(baseRun, "Q_kW");
  const thermicity = thermicityOf(Q_kW);
  const engineSign = engineSignOf(thermicity);
  //  Undecidable -> + is the engine's announced default (approachDirection).
  const engineDir = engineSign === "negative" ? -1 : +1;
  const dT = (shown === "engine" ? engineDir : -engineDir) * dTmag;
  const Tshift = Tbase + dT;

  const shiftOv = useMemo(() => approachOverrides(Tshift), [Tshift]);
  const shiftRun = useMethodRun(
    w.witness, shiftOv, JSON.stringify([w.id, Tshift]), "choupoSolve");

  const metricBase = pick(baseRun, w.metricKpi);
  const metricShift = pick(shiftRun, w.metricKpi);

  const verdict = verdictOf(metricBase, metricShift, dT, w.moreIsMoreConverted);

  const busy = baseRun.busy || shiftRun.busy;
  const err = baseRun.err ?? shiftRun.err;

  const step = lessonStepper(APPROACH_STEPS);

  // ---- the drawing: exactly the two points that were computed --------------
  //  No curve, no interpolation, no third point.  The axis spans the two
  //  evaluation temperatures and the two published values, so the arrow's
  //  direction is the only claim it makes and that claim is a subtraction.
  const chart = (() => {
    if (metricBase === null || metricShift === null) return null;
    const W = 460, H = 220, L = 66, Rr = 18, Tp = 18, B = 42;
    const tLo = Math.min(Tbase, Tshift), tHi = Math.max(Tbase, Tshift);
    const tSpan = tHi - tLo || 1;
    const vLo = Math.min(metricBase, metricShift);
    const vHi = Math.max(metricBase, metricShift);
    const vSpan = vHi - vLo || Math.max(vHi, 1e-6);
    const px = (t: number) =>
      L + ((t - (tLo - 0.25 * tSpan)) / (1.5 * tSpan)) * (W - L - Rr);
    const py = (v: number) =>
      H - B - ((v - (vLo - 0.25 * vSpan)) / (1.5 * vSpan)) * (H - Tp - B);
    const x0 = px(Tbase), y0 = py(metricBase);
    const x1 = px(Tshift), y1 = py(metricShift);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%"
        preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="the two computed equilibrium points">
        <line x1={L} y1={H - B} x2={W - Rr} y2={H - B}
          stroke={GRID} strokeWidth={1} />
        <line x1={L} y1={Tp} x2={L} y2={H - B} stroke={GRID} strokeWidth={1} />
        <text x={(W + L) / 2} y={H - 8} fontSize={11} fill={INK}
          textAnchor="middle">evaluation temperature [K]</text>
        <text x={12} y={Tp + 10} fontSize={11} fill={INK}>{w.metricKpi}</text>
        {dT !== 0 && (
          <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={GRID}
            strokeWidth={1.5} strokeDasharray="4 3" />
        )}
        <circle cx={x0} cy={y0} r={5} fill="var(--mantine-color-blue-6)" />
        <circle cx={x1} cy={y1} r={5} fill="var(--mantine-color-orange-6)" />
        <text x={x0} y={y0 - 10} fontSize={10} fill={INK} textAnchor="middle">
          T = {Tbase.toFixed(0)} K
        </text>
        <text x={x1} y={y1 + 18} fontSize={10} fill={INK} textAnchor="middle">
          T {dT < 0 ? "−" : "+"} |ΔT| = {Tshift.toFixed(0)} K
        </text>
      </svg>
    );
  })();

  const controls = (
    <>
      <KnobSlider
        knob={{
          id: "T", label: "reactor temperature T — the PHYSICAL one",
          min: w.Tmin, max: w.Tmax, step: 10, unit: "K",
          why: "The temperature the outlet stream actually leaves at, and the "
            + "one the enthalpy is priced at.  A declared approach never "
            + "moves it.",
        }}
        value={Tbase} onChange={setT} showWhy />
      <KnobSlider knob={DT_KNOB} value={dTmag} onChange={setDTmag} showWhy />
      <Text size="xs" fw={600} mt={4}>direction shown</Text>
      <SegmentedControl size="xs" fullWidth value={shown}
        onChange={(v) => setShown(v as DirectionShown)}
        data={[
          { value: "engine", label: "the engine's" },
          { value: "other", label: "the other way" },
        ]} />
      <PanelNote>
        Runs <code>tutorials/{w.witness}</code> twice, in your browser, on the
        WASM build of <code>choupoSolve</code> — once at T and once at
        T ± |ΔT|, the sign read off the first run&apos;s isothermal duty
        exactly as the engine reads it off its own probe.
        Nothing here writes <code>temperatureApproach</code> into a dict;
        on this witness the shifted run&apos;s COMPOSITION is the same
        computation, and its temperature and duty are not.  {w.conditions}.
      </PanelNote>
    </>
  );

  const readout = (
    <Box>
      <Group gap="xs" wrap="wrap" mb={8}>
        <Badge variant="light" color="blue">
          at T = {Tbase.toFixed(0)} K · {w.metricKpi} ={" "}
          {fmt(metricBase, 6)}
        </Badge>
        <Badge variant="light" color="orange">
          at T {dT < 0 ? "−" : "+"} |ΔT| = {Tshift.toFixed(0)} K ·{" "}
          {w.metricKpi} = {fmt(metricShift, 6)}
        </Badge>
        <Badge variant="light" color="gray">
          Q_kW at T = {fmt(Q_kW, 3)} kW
        </Badge>
      </Group>
      <Text size="sm">
        {thermicity === null
          ? "This run published no duty, so nothing here names the thermicity."
          : (
            <>
              The engine&apos;s own isothermal duty is{" "}
              <b>{fmt(Q_kW, 3)} kW</b>
              {thermicity === "thermally neutral"
                ? <>, so no heat crosses the boundary to hold T: this
                    transformation is <b>{thermicity}</b>, the thermicity
                    cannot decide a direction, and the engine takes
                    T + |ΔT| and says so.</>
                : (
                  <>
                    , so heat must be{" "}
                    <b>{Q_kW !== null && Q_kW < 0 ? "REMOVED" : "ADDED"}</b>
                    {" "}to hold T: this transformation is <b>{thermicity}</b>
                    {engineSign
                      ? <> — so the engine assigns{" "}
                          <b>T {engineSign === "positive" ? "+" : "−"} |ΔT|</b>
                          {shown === "other"
                            ? <>; you are looking at the OTHER direction.</>
                            : "."}</>
                      : "."}
                  </>
                )}
            </>
          )}
      </Text>
      <Text size="sm" mt={6}>
        {verdict === null
          ? "Waiting for both runs."
          : verdict === "equilibrium"
            ? "ΔT = 0: the two runs are the same question, and the answer is "
              + "true equilibrium."
            : verdict === "short"
              ? "This ΔT puts the reported outlet SHORT of the equilibrium at "
                + "the physical T — which is what a real bed does, and what "
                + "the parameter is for."
              : "This direction reports an outlet BEYOND the equilibrium the "
                + "same model just computed at the physical T.  Both witnesses "
                + "here are fed on the reactant side, so for a single "
                + "dominant reaction that is thermodynamically impossible."}
      </Text>
      {verdict === "beyond" && (
        <Alert color="yellow" variant="light" mt={8}
          title="This is the direction the engine never takes">
          Since 2026-09-26 the author declares only a MAGNITUDE and the engine
          assigns the sign from the thermicity you see above; a negative
          <code>temperatureApproach</code> is refused by name
          (<code>GibbsReactor.cpp:278–289</code>). A Gibbs reactor is told no
          reactions, so it takes its thermicity from the one extent it has —
          the transformation from its own feed to the true equilibrium at T,
          solved once more before the detuned solve
          (<code>approachDirection</code>). This panel can still show the
          other direction because it runs the case at a different
          temperature rather than declaring an approach.
        </Alert>
      )}
    </Box>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={4}>
            The Gibbs reactor, and the approach to equilibrium
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            A reactor that is told no reactions, and the one calibrated number
            that stops it from handing the flowsheet a conversion no real
            converter achieves. Read the four steps, then move |ΔT| and watch
            which way the engine points it — and, on request, the other way,
            which takes the model somewhere no reactor can be.
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}

        <Box>
          <Title order={5}>Now move it</Title>
          <Text size="sm" mt={4}>
            Two runs of the same case: the equilibrium at the physical
            temperature, and the equilibrium at the temperature the chemistry
            is asked. The two witnesses are different chemistries — they are
            here because their reaction enthalpies have opposite SIGNS, and
            the one slider, the one verdict rule and the one comparison are
            identical for both, so the only thing that changes between them
            is which way the engine points ΔT.
          </Text>
          <SegmentedControl mt={8} fullWidth value={witnessId}
            onChange={onWitness}
            data={APPROACH_WITNESSES.map((x) => ({
              value: x.id, label: x.label,
            }))} />
          <Text size="xs" c="dimmed" mt={6}>
            {w.reaction} · {w.metricLabel}
          </Text>

          {err && (
            <Alert color="red" variant="light" mt={8}
              title="The engine did not finish">
              <Text size="sm">{err}</Text>
            </Alert>
          )}

          <Box mt={10} style={{
            display: "grid", gap: 14,
            gridTemplateColumns: "minmax(200px, 250px) 1fr",
          }}>
            <Stack gap={8}>{controls}</Stack>
            <Box style={{ minWidth: 0 }}>
              {busy && (
                <Group gap="sm" wrap="nowrap" align="center" mb={6}>
                  <Loader size="xs" />
                  <Text size="xs" c="dimmed">
                    two Gibbs minimisations — seconds, not instant
                  </Text>
                </Group>
              )}
              {chart}
              {readout}
            </Box>
          </Box>

          <Text size="xs" c="dimmed" mt={10}>
            The drawing carries exactly the two points that were computed and
            no line through them: two runs is two points, and a curve drawn
            between them would be a claim nothing here evaluated.
          </Text>
        </Box>

        {step(5)}
        {step(6)}

        <LessonLimits limits={APPROACH_LIMITS} />
      </Stack>
    </Box>
  );
}
