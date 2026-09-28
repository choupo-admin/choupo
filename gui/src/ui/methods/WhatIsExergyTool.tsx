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
  "What is exergy?" -- ONE page, ONE mental model: exergy is the PRICE TAG
  on a state, in work, against an environment the case DECLARES.  The
  sequel the entropy ledger buys: entropy says which way; exergy says what
  it costs.  Built the same day the `exergy` bench op landed, so every
  claim cites an engine surface (src/propertyOps/Exergy.cpp), never a
  textbook alone.

  REORGANISED 2026-09-28 after the owner's pedagogical review, on the same
  three layers the temperature and entropy pages took that day.  Taken:
  (1) the opening "same energy, different worth" compared two air states
  that do NOT have the same energy -- it is now two reservoirs handing
  over the SAME heat at different temperatures, B_Q = Q(1 - T0/T), stated
  as the exergy of heat from a reservoir and never as a stream formula;
  (2) the first control now moves the SOURCE with the environment fixed
  (that reservoir formula, exact), and the T0 slider comes second; (3) the
  entropy leg is no longer "heat that must be dumped": it is signed, and a
  compressed gas at T0 is the worked case where it is NEGATIVE and carries
  the whole exergy; (4) the dead-state zero is an algebraic identity, a
  necessary check and not a validation; (5) "distance" is gone -- it was a
  metaphor read as a metric; (6) the engine surfaces and refusals moved to
  a final traceability part, kept whole.
  Found here, not in the review: the knob was titled "what ONE UNIT of
  dS_gen costs" over a machine's 4.2262 J/(mol K).

  The live centre (part B) runs tutorials/props/molecular/exergy01_air_dead_
  state in the reader's browser: the engine publishes the two legs (dh and
  T0*ds) beside its own b_physical, and THIS PAGE re-adds them in front of
  the reader -- plus the zero at the RESTRICTED dead state (thermo-
  mechanical: composition held fixed, never a claim of chemical
  indistinguishability).  The only arithmetic performed here is that
  re-addition and three exact closed forms printed with their constants:
  the reservoir heat's exergy, the ideal-gas isothermal b = R T0 ln(P/P0),
  and T0 times a published s_gen.

  Deliberately ABSENT, per the same one-page ruling as the temperature and
  entropy pages: heat-engine cycles, availability accounting frameworks,
  and CHEMICAL exergy -- which the ENGINE itself refuses by name (it needs
  a curated standard-environment model), and the page says so rather than
  teaching a formula the simulator cannot check.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Box, Group, Loader, Slider, Stack, Text, Title }
  from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import { Tex } from "./lessonStep.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";

/** The engine's own gas constant, to the digit (src/core/Constants.H:47). */
export const R_GAS = 8.314462618;

/** The witness the page runs: physical exergy against a declared dead state. */
export const EXERGY_WITNESS = "props/molecular/exergy01_air_dead_state";

/** The witness's declared dead state, mirrored from the case dict. */
export const DEAD_T0_K = 298.15;
export const DEAD_P0_PA = 1.0e5;

/** Part A's opening example: the same heat Q from two reservoirs, against
 *  an environment at T0.  Declared, round numbers of the example. */
export const RESERVOIRS = { Q_kJ: 100, T0_K: 300, T_hot_K: 600, T_warm_K: 350 } as const;

/** The work obtainable, at most, from heat Q received reversibly from a
 *  reservoir at CONSTANT temperature T > T0, with an environment at T0:
 *  B_Q = Q·(1 − T0/T).  The exergy of HEAT FROM A RESERVOIR -- not a
 *  stream's exergy and not a finite body's (whose temperature falls as it
 *  gives heat up).  Exact; from the entropy balance alone. */
export function heatExergy(Q: number, T_K: number, T0_K: number): number {
  return Q * (1 - T0_K / T_K);
}

/** Physical exergy of an IDEAL GAS at the environment's temperature T0 and
 *  pressure P: h = h0 (ideal-gas enthalpy depends on T alone), s − s0 =
 *  −R·ln(P/P0), so b = R·T0·ln(P/P0)  [J/mol].  Exact for the ideal gas;
 *  the engine's own number adds the real-gas residual. */
export function isothermalIdealGasExergy(T0_K: number, P_Pa: number,
                                         P0_Pa: number): number {
  return R_GAS * T0_K * Math.log(P_Pa / P0_Pa);
}

/** Rebuild b from the engine's two published legs and compare with the
 *  engine's own total.  Every input is an ENGINE number; the page only
 *  subtracts. */
export interface ExergyLedger {
  dh: number;        // h - h0, engine H_real at both states  [J/mol]
  T0ds: number;      // T0 * (s - s0), engine S_real at both  [J/mol]
  rebuilt: number;   // dh - T0ds, re-added by this page
  b: number;         // the engine's own b_physical
  gap: number;       // |rebuilt - b| -- the page's self-check
}
export function rebuildExergy(
  d: { [k: string]: number } | undefined,
): ExergyLedger | null {
  if (!d) return null;
  for (const k of ["dh", "T0ds", "b_physical"]) if (!(k in d)) return null;
  const rebuilt = d["dh"]! - d["T0ds"]!;
  return {
    dh: d["dh"]!, T0ds: d["T0ds"]!, rebuilt,
    b: d["b_physical"]!, gap: Math.abs(rebuilt - d["b_physical"]!),
  };
}

/** Gouy-Stodola: the work an irreversibility destroys, W_lost = T0 * s_gen.
 *  Exact product -- the s_gen is the machine's own published KPI. */
export function lostWork(T0_K: number, sGen: number): number {
  return T0_K * sGen;
}

/** The claims of the page, each with the engine surface that carries it.
 *  `line`, `note` and the interrogation carry their mathematics between
 *  `$` marks, rendered by KaTeX (owner, 2026-09-28). */
export const EXERGY_META = [
  {
    name: "formula",
    line: "b_{\\mathrm{ph}} = (h - h_0) - T_0\\,(s - s_0)",
    question: "What is this state worth, in work?",
    cite: "src/propertyOps/Exergy.cpp · Exergy::run",
    note: "Every term is the engine's own H_real / S_real at the SAME "
      + "composition — the op subtracts and publishes both legs, nothing "
      + "more.",
  },
  {
    name: "dead state",
    line: "\\text{deadState}\\ \\{\\,T_0;\\ P_0;\\,\\}",
    question: "Against WHICH environment?",
    cite: "src/propertyOps/Exergy.cpp · the missing-deadState refusal",
    note: "An exergy is a statement about a state AND an environment.  The "
      + "engine REFUSES to assume one — a silently defaulted 25 °C would "
      + "hand a plant in another climate the wrong number with nothing to "
      + "see.  The block declares the reference temperature and pressure "
      + "the physical-exergy op needs — two numbers do not define a "
      + "complete environment, and the page does not pretend they do.",
  },
  {
    name: "zero",
    line: "b_{\\mathrm{ph}}(T_0, P_0, x) = 0",
    question: "Where does the price hit zero?",
    cite: "tutorials/props/molecular/exergy01_air_dead_state · b_dead",
    note: "The witness's second row evaluates $(T_0, P_0)$ at the SAME "
      + "composition: both legs are exactly zero, by construction — an "
      + "algebraic identity the golden pins, necessary but not a "
      + "validation.  No thermo-mechanical work potential is left there; "
      + "the stream may still differ CHEMICALLY from the environment, and "
      + "that part is refused, never silently zeroed.",
  },
  {
    name: "datum",
    line: "\\text{datum-independence}",
    question: "Why doesn't the reference zero matter?",
    cite: "src/propertyOps/Exergy.cpp · the differencing comment",
    note: "Only DIFFERENCES at fixed composition enter, so additive "
      + "reference offsets common to both states — the enthalpy datum, the "
      + "$s^\\circ_{298}$ anchors, the ideal-mixing line (composition-only, "
      + "identical in both states), the 1 bar reference-pressure convention "
      + "— all drop out.  Datum-independent is NOT model-independent: "
      + "different models predict different $\\Delta h$ and $\\Delta s$, and "
      + "that difference is physics, not bookkeeping.",
  },
  {
    name: "destruction",
    line: "B_{\\mathrm{destroyed}} = T_0\\,S_{\\mathrm{gen}}",
    question: "What does an irreversibility cost?",
    cite: "src/unitOperations/rotating/IsentropicCore.cpp · dS_gen KPI",
    note: "Every compressor and turbine already publishes dS_gen — and for "
      + "these ADIABATIC machines the stream's entropy rise IS the "
      + "generation (a unit with heat transfer would need the boundary "
      + "term too).  Multiply by $T_0$ and the entropy the machine "
      + "generated becomes the exergy it destroyed (Gouy–Stodola).",
  },
] as const;

/** The questions this page installs. */
export const EXERGY_INTERROGATION = [
  "Against which restricted dead state $(T_0, P_0)$ is this exergy quoted "
    + "— and who declared it?",
  "Is this the physical exergy alone, or does someone claim a chemical "
    + "part — and from which standard environment?",
  "How much of the inlet exergy leaves in the product, and how much was "
    + "destroyed ($T_0 S_{\\mathrm{gen}}$)?",
  "Would this number change if the enthalpy datum changed? (It must not — "
    + "and why not?)",
  "At the dead state itself, does the claimed formula return zero? "
    + "(Necessary, not sufficient: a wrong formula returns zero there too.)",
] as const;

// ---- visual pieces ----------------------------------------------------------

function M({ t }: { t: string }): JSX.Element {
  return <Tex src={t} mode="inline" />;
}

/** Prose with its mathematics between `$` marks, for the text that lives in
 *  data (the claim notes, the interrogation) rather than in JSX. */
function Md({ s }: { s: string }): JSX.Element {
  return (
    <>
      {s.split("$").map((part, i) => (i % 2 === 1
        ? <Tex key={i} src={part} mode="inline" />
        : <span key={i}>{part}</span>))}
    </>
  );
}

/** The heading of one of the page's three parts. */
function Layer({ letter, title, note }: {
  letter: string; title: string; note: string;
}): JSX.Element {
  return (
    <Box mt={6} pt={6} style={{ borderTop: `2px solid ${ACCENT}` }}>
      <Text size="xs" c={INK} fw={700} tt="uppercase">Part {letter}</Text>
      <Title order={4}>{title}</Title>
      <Text size="xs" c={INK} mt={2}>{note}</Text>
    </Box>
  );
}

/** A question the reader answers before reading on, with its answer. */
function Check({ q, a }: { q: ReactNode; a: ReactNode }): JSX.Element {
  return (
    <Box mt={6} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
      <Text size="sm" fw={600}>{q}</Text>
      <Text size="sm" c={INK} mt={2}><em>Answer:</em> {a}</Text>
    </Box>
  );
}

/** The first control: move the SOURCE, the environment stays where it is. */
function ReservoirKnob() {
  const { Q_kJ, T0_K } = RESERVOIRS;
  const [T, setT] = useState<number>(RESERVOIRS.T_hot_K);
  const B = heatExergy(Q_kJ, T, T0_K);
  return (
    <Box my={8} px="sm" py={8} style={{ border: `1px solid ${GRID}`,
      borderRadius: 6 }}>
      <Text size="xs" c={INK} fw={700} tt="uppercase">
        the same 100 kJ, from a reservoir you move
      </Text>
      <Text size="sm" mt={4}>
        reservoir <M t="T" /> = <Text span ff="monospace">{T.toFixed(0)} K</Text>
        {" "}(environment fixed at <M t="T_0 = 300\ \mathrm{K}" />)
      </Text>
      <Slider min={310} max={1200} step={5} value={T}
        onChange={setT} label={null} my={6} />
      <Text size="sm">
        <M t="B_Q = Q\left(1 - \frac{T_0}{T}\right)" /> ={" "}
        <Text span ff="monospace">{B.toFixed(1)}</Text> kJ of the
        {" "}{Q_kJ} kJ
      </Text>
      <Text size="xs" c={INK} mt={4}>
        The energy is the same at every position of the slider; the work it
        can buy is not.  As <M t="T" /> falls toward <M t="T_0" /> the heat
        becomes worth nothing, although not one joule of it is lost.
      </Text>
    </Box>
  );
}

function ExergyTable({ lg }: { lg: ExergyLedger }) {
  const row = (label: ReactNode, v: number, accent?: boolean) => (
    <Group justify="space-between" px="sm" py={4}
      style={{ borderBottom: `1px solid ${GRID}` }}>
      <Text size="sm" fw={accent ? 700 : 400}>{label}</Text>
      <Text size="sm" ff="monospace" fw={accent ? 700 : 400}
        c={accent ? ACCENT : undefined}>
        {v >= 0 ? "+" : ""}{v.toFixed(2)}
      </Text>
    </Group>
  );
  return (
    <Box my={8} style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Group justify="space-between" px="sm" py={6}
        style={{ borderBottom: `2px solid ${GRID}` }}>
        <Text size="xs" c={INK} fw={700} tt="uppercase">
          the price, from the engine’s own run  [J/mol]
        </Text>
      </Group>
      {row(<>enthalpy leg <M t="h - h_0" /></>, lg.dh)}
      {row(<>entropy leg <M t="T_0\,(s - s_0)" /></>, lg.T0ds)}
      {row(<><M t="b_{\mathrm{ph}} = (h - h_0) - T_0\,(s - s_0)" />, rebuilt here</>,
        lg.rebuilt, true)}
      {row("the engine’s own b_physical", lg.b, true)}
      <Text size="xs" c={INK} px="sm" py={6}>
        Both legs are shown with the sign the engine publishes them at;
        the subtraction is visible in the rebuilt row.  They agree to
        {" "}{lg.gap.toExponential(1)} J/mol at the published precision —
        <strong> an arithmetic consistency check, not a validation</strong>:
        it shows the page subtracts what the engine subtracted, not that
        the property model behind the two legs is right.
      </Text>
    </Box>
  );
}

//  A REAL MACHINE'S IRREVERSIBILITY, quoted from a golden and therefore
//  re-verified by every runTests -- the same provenance class as
//  FourWaysMixtureTool's flash20 and fitNRTL02 numbers.  (It used to price
//  a round 1.0 J/(mol K) described as "a representative machine"; a claim
//  about what the engine publishes is worth more when the number on the
//  slider IS one of them.)
const MACHINE = {
  case_: "compressor01_air",
  dS_gen: 4.22615345389,          // J/(mol·K) -- expected:15
  what: "an air compressor",
} as const;

function GouyStodolaKnob() {
  const S_GEN = MACHINE.dS_gen;
  const [T0, setT0] = useState<number>(DEAD_T0_K);
  const w = lostWork(T0, S_GEN);
  return (
    <Box my={8} px="sm" py={8} style={{ border: `1px solid ${GRID}`,
      borderRadius: 6 }}>
      <Text size="xs" c={INK} fw={700} tt="uppercase">
        what this compressor’s dS_gen costs, under your finger
      </Text>
      <Text size="sm" mt={4}>
        environment <M t="T_0" /> = <Text span ff="monospace">{T0.toFixed(0)} K</Text>
      </Text>
      <Slider min={250} max={330} step={1} value={T0}
        onChange={setT0} label={null} my={6} />
      <Text size="sm">
        <M t="b_{\mathrm{destroyed}} = T_0\,s_{\mathrm{gen}}" /> ={" "}
        <Text span ff="monospace">
          {T0.toFixed(0)} × {S_GEN.toFixed(4)} = {w.toFixed(0)}
        </Text> J/mol
      </Text>
      <Text size="xs" c={INK} mt={4}>
        That <M t="s_{\mathrm{gen}}" /> is not a round number chosen to look
        like one: it is {MACHINE.what} in this corpus —
        {" "}<Text span ff="monospace">{MACHINE.case_}</Text> — whose golden
        pins <Text span ff="monospace">dS_gen = {MACHINE.dS_gen}</Text>
        {" "}J/(mol·K), re-verified by every regression run.  For a FIXED
        entropy generation, a higher declared <M t="T_0" /> assigns a larger
        exergy destruction to the same irreversibility.  Moving this slider
        does not change the compressor: it re-prices the entropy the
        compressor already generated.
      </Text>
    </Box>
  );
}

// ---- the page ---------------------------------------------------------------

export function WhatIsExergyTool(): JSX.Element {
  const run = useMethodRun(EXERGY_WITNESS, [], "exergy-ledger",
    "choupoProps");
  const [lg, zero] = useMemo(() => {
    const ops = run.result?.operationResults;
    const st = ops?.find((o) => o.name === "b_state");
    const dd = ops?.find((o) => o.name === "b_dead");
    return [rebuildExergy(st?.diagnostics),
            rebuildExergy(dd?.diagnostics)] as const;
  }, [run.result]);
  const { Q_kJ, T0_K, T_hot_K, T_warm_K } = RESERVOIRS;
  const bIso = isothermalIdealGasExergy(DEAD_T0_K, 2.0e5, DEAD_P0_PA);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>What is exergy?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Energy is conserved — the first law will not let a joule vanish
            — but <strong>the capacity to produce work is not
            conserved</strong>, and exergy is that capacity made a number:
            what a state or a transfer is worth in <em>work</em>, against the
            environment it will finally end in.  This page is read in three
            parts: <strong>A</strong>, the idea, on heat and then on a
            stream; <strong>B</strong>, one stream priced live by the engine;
            {" "}<strong>C</strong>, where Choupo computes each piece and what
            it refuses.  It assumes the energy and entropy balances (the
            entropy page before this one).
          </Text>
        </Box>

        <Layer letter="A" title="What exergy measures"
          note="Heat first, then a flowing stream, then what an irreversibility destroys." />

        <Box>
          <Title order={5}>1 · Energy conserved, work potential different</Title>
          <Text size="sm" mt={4}>
            Two reservoirs, each at a constant temperature, each hand over
            the same <M t="Q = 100\ \mathrm{kJ}" />; the surroundings are at
            {" "}<M t="T_0 = 300\ \mathrm{K}" />.  One is at 600 K, the other
            at 350 K.  Before reading on: which heat lets you produce more
            work?
          </Text>
          <Text size="sm" mt={6}>
            Heat <M t="Q" /> received reversibly at <M t="T" /> brings entropy
            {" "}<M t="Q/T" /> with it (the transfer term of the entropy
            balance).  Work carries none, so a device that turns this heat
            into work, and is itself left unchanged, must hand that entropy
            on to the environment — at
            {" "}<M t="T_0" />, which takes heat <M t="T_0\,Q/T" />.  What is
            left can be work, and no more than that:
          </Text>
          <Tex mode="display"
            src="B_Q = Q\left(1 - \frac{T_0}{T}\right), \qquad T > T_0" />
          <Text size="sm">
            At 600 K: <M t="B_Q = 100\,(1 - 300/600) = 50\ \mathrm{kJ}" />.
            At 350 K: <M t="B_Q = 100\,(1 - 300/350) \approx 14.3\ \mathrm{kJ}" />.
            The energy received is the same; the work it can buy is not.
            This is the exergy of <em>heat from a reservoir at constant
            temperature</em> — not the exergy of a stream, and not of a
            finite body whose temperature falls as it gives heat up; those
            come next.  Move the source, with the environment fixed:
          </Text>
          <ReservoirKnob />
          <Text size="xs" c={INK}>
            Below <M t="T_0" /> the sign turns over: a reservoir colder than
            the surroundings is worth work too (check 2 below).
          </Text>
          <Text size="xs" c={INK} mt={2}>
            The example’s numbers: <M t="Q" /> = {Q_kJ} kJ,
            {" "}<M t="T_0" /> = {T0_K} K, reservoirs at {T_hot_K} K and
            {" "}{T_warm_K} K.
          </Text>
        </Box>

        <Box>
          <Title order={5}>2 · The environment is part of the problem</Title>
          <Text size="sm" mt={4}>
            <M t="T_0" /> appeared in the answer, and it is not a constant of
            nature — it is a <strong>declaration</strong>: the temperature
            (and, for a stream, the pressure <M t="P_0" />) of the
            surroundings the process finally exchanges with.  The same heat
            is worth more work in winter than in summer.  This simulator
            refuses to run the exergy operation without a
            {" "}<Text span ff="monospace">deadState {"{"} T0; P0; {"}"}</Text>
            {" "}block, because an exergy is a statement about a state AND an
            environment, and your environment is your fact, not the
            engine’s.  Two numbers do not define a complete environmental
            dead state, which would also need chemical equilibrium with a
            declared environmental composition; they are what the physical
            part needs.
          </Text>
        </Box>

        <Box>
          <Title order={5}>3 · A stream, brought to the environment</Title>
          <Text size="sm" mt={4}>
            <strong>Physical flow exergy is the maximum useful work
            obtainable as a flowing stream is brought reversibly to
            {" "}<M t="(T_0, P_0)" />, with its composition held
            fixed</strong> — the <em>restricted dead state</em>.  The same
            argument as for the reservoir, now with the stream’s own enthalpy
            and entropy:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="xs" c={INK} fw={700} tt="uppercase">
              physical (thermo-mechanical) flow exergy
            </Text>
            <Tex mode="display"
              src="b_{\mathrm{ph}} = (h - h_0) - T_0\,(s - s_0)" />
            <Text size="xs" c={INK} mt={4}>
              <M t="b" />, <M t="h" /> and <M t="s" /> on ONE basis (molar
              here: J/mol and J/(mol·K)); <M t="h_0" /> and <M t="s_0" /> at
              {" "}<M t="(T_0, P_0)" /> with the stream’s OWN composition
            </Text>
          </Box>
          <Text size="sm">
            <strong>Read the entropy leg with its sign.</strong>
            {" "}<M t="T_0\,(s - s_0)" /> is the heat the stream exchanges with
            the environment on its reversible way to the dead state.  When
            it is positive, that heat is rejected to the surroundings and is
            subtracted from what the enthalpy drop could deliver.  When it
            is negative, the stream <em>absorbs</em> heat from the
            surroundings on the way, and the work exceeds the enthalpy drop.
            It is not always a loss.  The cleanest case: an ideal gas at
            {" "}<M t="T_0" /> but compressed to <M t="P" />.  Its enthalpy
            equals <M t="h_0" /> (an ideal gas’s depends on temperature
            alone), yet <M t="s - s_0 = -R\ln(P/P_0) < 0" />, so
          </Text>
          <Tex mode="display"
            src="b_{\mathrm{ph}} = R\,T_0 \ln\frac{P}{P_0}" />
          <Text size="sm">
            — at 298.15 K and 2 bar, {bIso.toFixed(1)} J/mol, every joule of
            it from the entropy leg.  Being compressed is worth work even with
            no enthalpy to give.  What this expression deliberately excludes:
            {" "}<em>chemical</em> exergy (the engine refuses it by name — part
            C), and <em>kinetic</em> and <em>potential</em> exergy (streams
            here carry no velocity or elevation).
          </Text>
        </Box>

        <Box>
          <Title order={5}>4 · Reversible and real: what is destroyed</Title>
          <Text size="sm" mt={4}>
            Everything above is the <em>reversible</em> limit.  A real
            process generates entropy, and each unit of entropy generated
            is work that could have been had and was not:
          </Text>
          <Tex mode="display"
            src="B_{\mathrm{destroyed}} = T_0\,S_{\mathrm{gen}} \ge 0" />
          <Text size="sm">
            (the Gouy–Stodola relation).  Energy is still conserved in the
            real process; exergy is not — it is destroyed, in energy units,
            relative to the declared environment.  Every compressor and
            turbine in this simulator publishes the entropy its declared
            inefficiency generated, and for these adiabatic machines the
            stream’s entropy rise IS the generation.  Here the environment
            moves and the machine does not:
          </Text>
          <GouyStodolaKnob />
        </Box>

        <Box>
          <Title order={5}>Check yourself</Title>
          <Check
            q="Does air at T0 and P0 necessarily have zero total exergy?"
            a={<>Its <em>physical</em> exergy is zero there.  A chemical part
              needs its composition compared with the environment’s — which
              this engine refuses to do without a declared standard
              environment.</>} />
          <Check
            q="Can a refrigerant below T0 have physical exergy?"
            a={<>Yes.  Being cold relative to the surroundings also allows a
              useful process; exergy is not “heat above ambient”.  With
              {" "}<M t="T < T_0" />, <M t="h - h_0" /> and
              {" "}<M t="T_0\,(s - s_0)" /> are both negative, and their
              difference is positive.</>} />
          <Check
            q="Does changing the zero of enthalpy change the physical exergy?"
            a={<>No — if the same shift is applied consistently to both states
              at the same composition, it cancels in <M t="h - h_0" />.</>} />
          <Check
            q="Does raising T0 on the compressor slider change the simulated compressor?"
            a={<>No.  It re-prices a <M t="s_{\mathrm{gen}}" /> held fixed;
              the machine, its outlet and its entropy generation are the
              ones the case computed.</>} />
        </Box>

        <Layer letter="B" title="One stream, priced live"
          note="The engine prices a state and its own dead state in your browser; the page re-adds the legs." />

        <Box>
          <Text size="sm" mt={4}>
            Your browser has just asked the real engine to price 79/21
            {" "}<M t="\mathrm{N_2}/\mathrm{O_2}" /> at 400 K and 2 bar against
            a declared 298.15 K / 1 bar dead state — and to price the dead
            state itself:
          </Text>
          {run.busy && (
            <Group gap={8} my={8}><Loader size="xs" />
              <Text size="sm" c="dimmed">
                running the exergy case in your browser…
              </Text></Group>
          )}
          {run.err && (
            <Alert color="yellow" my={8}>
              The witness could not run here ({run.err}) — the table below
              needs the WASM build.  The case is
              tutorials/{EXERGY_WITNESS}; run it with runCase to see the
              same numbers.
            </Alert>
          )}
          {lg && <ExergyTable lg={lg} />}
          {lg && (
            <Text size="sm">
              Here the entropy leg is positive: hot and above
              {" "}<M t="P_0" />, the stream would reject heat on its way down,
              so <M t="b_{\mathrm{ph}}" /> is smaller than
              {" "}<M t="h - h_0" />.  Compare the compressed gas at
              {" "}<M t="T_0" /> in part A, where the same leg was negative.
            </Text>
          )}
          {zero && (
            <Text size="sm" mt={6}>
              <M t="b_{\mathrm{ph}}" />(restricted dead state) ={" "}
              <Text span ff="monospace">{zero.b.toFixed(2)}</Text> J/mol —
              both legs exactly zero, by construction: the state and the
              reference are the same state.  That is an{" "}
              <strong>algebraic identity</strong>, a check any correct
              implementation must pass — and not a validation, because a
              wrong formula also returns zero when it subtracts a state from
              itself.  At <M t="(T_0, P_0)" />, with the composition held
              fixed, no thermo-mechanical work potential remains; any
              CHEMICAL difference from the environment is neither computed
              nor hidden — the op refuses it.
            </Text>
          )}
          <Text size="sm" mt={6}>
            <M t="b_{\mathrm{ph}}" /> is built from <em>differences</em> at
            fixed composition, so additive reference offsets common to both
            states — the enthalpy datum, the <M t="s^\circ_{298}" /> anchors,
            the ideal-mixing line (composition-only, identical in both
            states), the 1 bar reference-pressure convention — all drop out.
            Physical exergy is therefore <strong>datum-independent, not
            model-independent</strong>: different thermodynamic models
            predict different <M t="\Delta h" /> and <M t="\Delta s" /> and
            hence different exergies, and those are physical model
            differences, never reference-zero arbitrariness.
          </Text>
        </Box>

        <Layer letter="C" title="Where Choupo computes it — and what it refuses"
          note="Traceability: each claim with the engine surface that carries it." />

        <Box>
          <Box my={8}>
            {EXERGY_META.map((m) => (
              <Box key={m.name} px="sm" py={6}
                style={{ borderLeft: `3px solid ${GRID}`, marginBottom: 6 }}>
                <Group justify="space-between">
                  <Text size="sm" fw={700}><M t={m.line} /></Text>
                  <Text size="xs" c={INK}>{m.question}</Text>
                </Group>
                <Text size="xs" mt={2}><Md s={m.note} /></Text>
                <Text size="xs" c={INK} ff="monospace" mt={2}>{m.cite}</Text>
              </Box>
            ))}
          </Box>
          <Text size="xs" c={INK} mt={6}>
            What this engine deliberately does NOT compute, and says so by
            name: CHEMICAL exergy — the work available from a composition
            differing from the environment’s — refuses in the op itself,
            because it needs a standard-environment model (Szargut’s
            reference substances, or another) that is a curated,
            primary-cited data decision, not a formula to transcribe.  And
            no audited flowsheet-wide exergy balance is implemented or
            claimed: this operation prices the physical exergy of one
            state.  A complete flowsheet ledger would additionally need
            explicit, traceable stream, work, heat-boundary and
            entropy-generation terms — and chemical exergy wherever
            composition changes relative to the environment.  The recorded
            status of the missing entropy provenance lives in the design
            trace (docs/design/entropy-glass-box-trace.md).
          </Text>
        </Box>

        <Box>
          <Title order={5}>Back to the number</Title>
          <Text size="sm" mt={4}>
            When anyone hands you an exergy, you can defend it when you can
            ask:
          </Text>
          <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${ACCENT}` }}>
            {EXERGY_INTERROGATION.map((q) => (
              <Text size="sm" key={q} mb={4}>· <Md s={q} /></Text>
            ))}
          </Box>
          <Text size="sm">
            The test is not whether you can subtract the two legs.  It is
            whether you can tell energy, exergy transferred and exergy
            destroyed apart — and say why the environment had to be declared.
          </Text>
        </Box>

      </Stack>
    </Box>
  );
}
