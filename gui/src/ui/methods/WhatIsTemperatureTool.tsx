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
  THREE LAYERS, CONCEPT FIRST -- reorganised 2026-09-28 on the owner's
  review (Vitor): the title promises to explain a QUANTITY, and the page
  spent most of its length teaching distrust of an INSTRUMENT, with the
  entropy derivative in its second section.  Ruling: keep the content,
  reorganise the entry, correct the absolute statements, and make the
  depth a later choice rather than deleting it.  So:

    A  What a temperature is -- no calculus: two bodies, the direction of
       heat, temperature is not internal energy, thermal equilibrium stated
       with its condition (a wall that lets heat pass), three checks with
       their answers.
    B  How it is measured -- the Pt100 bridge only, and why printed digits
       are not knowledge.
    C  Going further (optional) -- the entropy definition framed for a
       simple system in equilibrium, unit vs scale (ITS-90), the pyrometer's
       emissivity (magnitudes, the sign stated), traceability.

  The acceptance criterion the review set: before C, the reader can predict
  the direction of heat, tell temperature from total internal energy, and
  explain what a reading with an uncertainty means.  More metrology does
  not repair a gap in A.

  The 2026-08-29 ruling below still governs the MEASUREMENT half (B and C):

  ONE PAGE, ONE MENTAL MODEL -- rearchitected 2026-08-29 on the owner's
  pedagogical ruling:

      A temperature reading is the end of a MEASUREMENT CHAIN, not a number
      that nature printed on the system.

      STATE -> T -> SCALE -> SENSOR -> SIGNAL -> MODEL/CALIBRATION
            -> REPORTED VALUE +/- UNCERTAINTY

  That chain is the spine of the page, and every block on it must answer the
  question "what mental structure does this install?"  A block whose answer is
  not directly tied to *what is a temperature?* does not belong here: the
  first version of this page tried to teach thermal equilibrium, the entropy
  definition, the SI kelvin, ITS-90, primary thermometry, the gas
  thermometer, non-ideality, fixed points, a boiling-point ladder, database
  inconsistencies, pyrometry, traceability, Duhem, and the whole of Hasok
  Chang's book AT ONCE, with roughly equal weight -- three or four essays
  chained together, and the centre lost.

  What moved OUT, and where (the material was good; it was teaching the
  wrong lesson HERE):

    * the boiling-point ladder, the water record that disagrees with itself,
      and the glycerol rung -> `PropertyTrustTool` ("When a property database
      lies to you") -- their lesson is *never trust a thermophysical record
      merely because it exists*, which is a property-data lesson;
    * the gas thermometer (with its engine run and knob), ITS-90's own fixed
      points, the platinum question, Duhem, Regnault, Wedgwood and Chang
      -> `ThermometerTrustTool` ("How do we know a thermometer is right?") --
      the deep dive, for the reader who wants the epistemology after the
      engineering;
    * the Newton-iteration = epistemic-iteration analogy -> DELETED, by
      ruling: a numerical initial guess and Chang's epistemology are not the
      same thing, and an elegant analogy that can install a wrong association
      is worse than none.

  ZERO PHYSICS IN TYPESCRIPT: the one quantitative example on this page (what
  an assumed emissivity costs a pyrometer) is closed-form arithmetic printed
  with its constants so the reader can redo it on paper, and the page says
  exactly that rather than letting it look like an engine answer.
\*---------------------------------------------------------------------------*/

import { Box, Group, Stack, Text, Title } from "@mantine/core";

import { Tex } from "./lessonStep.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";

/** A variable or short relation in running prose, set as mathematics
 *  (KaTeX, the one renderer every lesson uses) rather than as plain
 *  letters -- a T in prose and a T in an equation must look alike. */
function M({ t }: { t: string }): JSX.Element {
  return <Tex src={t} mode="inline" />;
}

/** The temperature the whole page is about.  It is arbitrary, and the page
 *  says so — what is not arbitrary is that it has three digits after the
 *  point, which is the question. */
export const T_SUBJECT_K = 500.012;

/** The hot end, as the owner posed it: "what the hell is a temperature of
 *  1608.1 degC?"  Above the silver point, so contact thermometry is gone and
 *  the answer is radiation -- which is where the tenth of a degree dies. */
export const T_HOT_C = 1608.1;
export const T_HOT_K = T_HOT_C + 273.15;

/** The silver point — the highest temperature ITS-90 still touches with a
 *  contact instrument.  Above it the scale itself is Planck radiation.  ONE
 *  number here; the full fixed-point table lives on the deep-dive page. */
export const T_SILVER_K = 1234.93;

/** Second radiation constant, um.K -- the one physical constant this page
 *  COMPUTES WITH -- Boltzmann and 273.15 appear in its prose, this is the
 *  only one that enters an arithmetic here -- and it is carried at all
 *  because the engine has no radiation-thermometry operation to ask.  See the pyrometer step's own note. */
export const C2_UM_K = 14388;

/** Sensitivity of a narrow-band radiation thermometer to the emissivity it
 *  had to ASSUME.  From Wien's approximation to Planck:
 *
 *      dT/T  =  (lambda*T / c2) * (de/e)
 */
export function emissivitySensitivity(lambda_um: number, T_K: number): number {
  return (lambda_um * T_K) / C2_UM_K;
}

/** What a relative emissivity error of `relErr` costs, in kelvin, at `T_K`.
 *  ONE home, because "1608 +/- 16" and "16 K on the answer" are the same
 *  number and a page that transcribes it twice will drift them. */
export function emissivityBand_K(
  lambda_um: number, T_K: number, relErr: number,
): number {
  return emissivitySensitivity(lambda_um, T_K) * relErr * T_K;
}

/** The three plant instruments, each as WANT / OBSERVE / BRIDGE.  This table
 *  is the page's centre of gravity: an instrument does not observe the
 *  measurand, and the bridge between them is where the assumptions live. */
export const INSTRUMENTS: readonly {
  name: string; want: string; observe: string; bridge: string;
}[] = [
  {
    name: "Pt100",
    want: "temperature",
    observe: "electrical resistance",
    bridge: "an R(T) calibration — a fitted polynomial anchored at known "
      + "points, valid over a declared range",
  },
  {
    name: "thermocouple",
    want: "temperature",
    observe: "a small voltage",
    bridge: "the Seebeck relation, plus a reference junction whose own "
      + "temperature must be known or compensated",
  },
  {
    name: "pyrometer",
    want: "temperature",
    observe: "radiance",
    bridge: "Planck's law, plus an ASSUMED emissivity and the optics of the "
      + "sight path",
  },
];

/** The chain, as data, so the drawing and the tests read one home. */
export const CHAIN: readonly string[] = [
  "PHYSICAL STATE",
  "thermodynamic temperature T",
  "practical scale / calibration",
  "sensor",
  "physical observable (R, V, radiance)",
  "model / correlation / calibration",
  "displayed number",
  "reported value ± uncertainty",
];

/** The interrogation the page exists to install — the questions an engineer
 *  must be able to put to any reported temperature. */
export const INTERROGATION: readonly string[] = [
  "What exactly was measured?",
  "By what instrument?",
  "On what scale?",
  "Against what calibration?",
  "Through what model?",
  "With what uncertainty?",
  "And which assumption would I doubt first?",
];

// ---- small visuals ----------------------------------------------------------

/** The chain, drawn.  Monospace and vertical, because the POINT is the order:
 *  everything below T is machinery, and the reported number is eight arrows
 *  away from the state it is about. */
function ChainFigure(): JSX.Element {
  return (
    <Box my={8} px="md" py={10}
      style={{ borderLeft: `3px solid ${ACCENT}` }}>
      {CHAIN.map((s, i) => (
        <Box key={s}>
          {i > 0 && (
            <Text size="sm" ff="monospace" c={INK} style={{ lineHeight: 1.1 }}>
              {"   ↓"}
            </Text>
          )}
          <Text size="sm" ff="monospace"
            fw={i === 0 || i === CHAIN.length - 1 ? 700 : 400}>
            {s}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

/** The three-way distinction, drawn as three boxes so it cannot be read as
 *  one idea with three spellings. */
function ThreeThings(): JSX.Element {
  const cell = (head: string, sym: string, body: string) => (
    <Box px="sm" py={8} style={{ border: `1px solid ${GRID}`, borderRadius: 6,
      flex: "1 1 180px", minWidth: 170 }}>
      <Text size="xs" c={INK} fw={700} tt="uppercase">{head}</Text>
      <Text size="lg" fw={700} mt={2}><M t={sym} /></Text>
      <Text size="xs" mt={4}>{body}</Text>
    </Box>
  );
  return (
    <Group gap={10} align="stretch" wrap="wrap" my={8}>
      {cell("quantity", "T",
        "The thermodynamic property of the system.  It exists whether or not "
        + "anyone measures it.")}
      {cell("unit", "\\mathrm{K}",
        "The unit T is expressed in — fixed since 2019 by declaring the "
        + "Boltzmann constant exact.  A convention, not a property.")}
      {cell("practical scale", "T_{90}",
        "The practical scale (ITS-90) through which precision temperature "
        + "measurements are realised and disseminated.")}
    </Group>
  );
}

// ---- the page ---------------------------------------------------------------

/** A layer heading: the page is read in three layers, and the reader must
 *  be able to see where the conceptual part ends and the optional part
 *  begins. */
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
function Check({ q, a }: { q: string; a: string }): JSX.Element {
  return (
    <Box mt={6} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
      <Text size="sm" fw={600}>{q}</Text>
      <Text size="sm" c={INK} mt={2}><em>Answer:</em> {a}</Text>
    </Box>
  );
}

export function WhatIsTemperatureTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>What is a temperature?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Two bodies can have the same temperature and very different
            amounts of energy.  Temperature is what lets you predict the
            direction of heat transfer when you put them in thermal contact.
            This page is read in three parts: <strong>A</strong>, what a
            temperature is (no calculus); <strong>B</strong>, how one is
            measured; and <strong>C</strong>, an optional part for going
            further.  Stop after B if A and B are new to you.
          </Text>
        </Box>

        <Layer letter="A" title="What a temperature is"
          note="No formula in this part." />

        <Box>
          <Title order={5}>1 · Two systems touch</Title>
          <Text size="sm" mt={4}>
            <strong>Predict first.</strong>  A small cup of water at 80 °C
            is placed in a large tank of water at 30 °C, in thermal contact:
            nothing between them stops heat from passing.  Which way does
            heat flow, and why?
          </Text>
          <Text size="sm" mt={6}>
            From the cup to the tank — from the higher temperature to the
            lower.  Yet the tank, being much larger, can hold far more
            internal energy than the cup.  It receives heat anyway.{" "}
            <strong>Temperature is not an amount of energy.</strong>  It is
            the property that decides which way heat flows.
          </Text>
          <Text size="sm" mt={6}>
            <strong>Watch what happens.</strong>  The cup cools and the tank
            warms, and the two temperatures approach each other.  If the
            cup and the tank are isolated from everything else, the energy
            the cup gives up is exactly the energy the tank gains: the total
            is conserved.  The tank’s temperature moves only a little,
            because the same energy is shared over much more water.
          </Text>
          <Text size="sm" mt={6}>
            <strong>Name it.</strong>  When the heat flow through that contact
            stops, the two are in <strong>thermal equilibrium</strong>, and
            their temperatures are equal.  That is what the words mean:
            equality of temperature is what thermal equilibrium{" "}
            <em>is</em>.  Temperature is an <strong>intensive</strong>{" "}
            property — a property of the state, not of the amount: a second
            litre of water in the same state has the same temperature and
            twice the internal energy.
          </Text>
          <Text size="sm" mt={6}>
            One condition matters.  The conclusion needs a contact that{" "}
            <em>lets heat pass</em>.  Two bodies separated by a perfectly
            insulating (adiabatic) wall exchange no heat at any pair of
            temperatures, so “no heat flows” alone does not prove “same
            temperature”.  Nothing about instruments yet — deliberately.
          </Text>
          <Text size="sm" fw={700} mt={10}>Check yourself before reading on</Text>
          <Check
            q="Two bodies, isolated from each other, with no heat flowing between them: must they have the same temperature?"
            a="No. There may be no path for heat to take — an insulating wall stops the flow at any pair of temperatures." />
          <Check
            q="Doubling the mass of water, in the same state: does it double the temperature?"
            a="No. The total internal energy doubles with the mass; the temperature, an intensive property, stays the same." />
          <Check
            q="A cup at 80 °C and a tank at 30 °C: can the tank hold more internal energy and still receive heat from the cup?"
            a="Yes. Heat flows from higher to lower temperature, whatever the amounts of energy." />
        </Box>

        <Layer letter="B" title="How a temperature is measured"
          note="One instrument, one bridge, and what printed digits do not tell you." />

        <Box>
          <Title order={5}>2 · A thermometer measures T through a chain</Title>
          <Text size="sm" mt={4}>
            A thermometer does measure temperature — but not directly.
            Separate the <strong>measurand</strong> (the quantity you want,
            here the temperature) from the <strong>signal</strong> the
            instrument actually observes (a resistance, a voltage, a
            radiance).  A <em>bridge</em> of physics, calibration and
            assumptions turns the signal into a temperature number:
          </Text>
          <Box mt={8} style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%",
              fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${GRID}` }}>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>instrument</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>what you want</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>what it observes</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>the hidden bridge</th>
                </tr>
              </thead>
              <tbody>
                {INSTRUMENTS.map((r) => (
                  <tr key={r.name} style={{ borderBottom: `1px solid ${GRID}` }}>
                    <td style={{ padding: "4px 8px", fontWeight: 700 }}>{r.name}</td>
                    <td style={{ padding: "4px 8px" }}>{r.want}</td>
                    <td style={{ padding: "4px 8px" }}>{r.observe}</td>
                    <td style={{ padding: "4px 8px", color: INK }}>{r.bridge}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
          {/*  ONE BRIDGE, WALKED WITH REAL NUMBERS.  Closed-form and printed
               with its constants, per this file's zero-physics-in-TypeScript
               rule -- the reader redoes it on paper, and nothing here is an
               engine answer.  */}
          <Text size="sm" mt={8}>
            Walk one bridge with real numbers.  A Pt100 in a thermowell reads{" "}
            <strong>119.4 Ω</strong>.  That is the signal — a resistance.
            The bridge is the Callendar–Van Dusen relation of IEC 60751,{" "}
            <M t="R(t) = R_0\,(1 + A t + B t^2)" /> with{" "}
            <M t="R_0 = 100\ \Omega" />,{" "}
            <M t="A = 3.9083\times10^{-3}\ {}^{\circ}\mathrm{C}^{-1}" /> and{" "}
            <M t="B = -5.775\times10^{-7}\ {}^{\circ}\mathrm{C}^{-2}" />,
            solved for <M t="t" />:
          </Text>
          <Box mt={6} p={8} style={{ border: `1px solid ${GRID}`,
            borderRadius: 4, fontSize: 13 }}>
            signal 119.4 Ω → calibration → <M t="t" /> ≈ 50.01 °C →{" "}
            <strong>323.16 K</strong>
          </Box>
          <Text size="sm" mt={6}>
            Notice what that arithmetic gives you.  It is the temperature of
            the <em>sensing element</em>, provided this Pt100 obeys the
            standard curve, has not drifted, is immersed deeply enough, is
            not losing heat along the thermowell stem, and has had time to
            reach the fluid’s temperature.  A sensor lagging behind a fluid
            whose temperature is changing reports its own state, not the
            fluid’s.  Each of those is an assumption inside the bridge, and
            none of them is visible in “119.4 Ω”.
          </Text>
        </Box>

        <Box>
          <Title order={5}>3 · Decimal places are not uncertainty</Title>
          <Text size="sm" mt={4}>
            A display shows <strong>50.012 °C</strong>.  Does it prove that
            the temperature is known to a thousandth of a degree?  No.  The
            digits tell you how finely the number was <em>written</em>; only
            the uncertainty tells you how well it is <em>known</em>.
          </Text>
          <Text size="sm" mt={6}>
            The same holds for any number.  Write one down:{" "}
            <strong>{T_SUBJECT_K} K</strong>.  As written, it is not yet a
            measurement result: it carries no uncertainty and names no scale,
            no instrument, no traceability.  A serious statement reads more
            like{" "}
            <strong><M t="T_{90} = 500.012\ \mathrm{K},\quad U = 0.015\ \mathrm{K}\ (k = 2)" /></strong>{" "}
            — where
            that ± is INVENTED here, for its shape alone, because no budget
            for this number has been read back from anywhere — plus how it
            was obtained.  Display resolution and measurement uncertainty are
            different things and need not be comparable — though when a final
            result is reported, the value and its uncertainty should be
            rounded consistently.  Never confuse the number with the thing.
          </Text>
        </Box>

        <Box>
          <Title order={5}>4 · The questions to ask of any reported temperature</Title>
          <Text size="sm" mt={4}>
            Read the chain top to bottom, and notice how far the reported
            number sits from the state it is about:
          </Text>
          <ChainFigure />
          <Text size="sm">
            When anyone shows you a reported temperature, you can defend it
            only when you can answer:
          </Text>
          <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${ACCENT}` }}>
            {INTERROGATION.map((q) => (
              <Text key={q} size="sm" ff="monospace">• {q}</Text>
            ))}
          </Box>
          <Text size="sm">
            <strong>A temperature reading is the end of a measurement chain,
            not a number that nature printed on the system.</strong>  An
            engineer who can walk that chain can defend the number; one who
            can only repeat it cannot.
          </Text>
        </Box>

        <Layer letter="C" title="Going further (optional)"
          note="For the reader who is comfortable with A and B.  Nothing here is needed to use a temperature correctly." />

        <Box>
          <Title order={5}>5 · The thermodynamic definition</Title>
          <Text size="sm" mt={4}>
            The intuition of part A has an exact formulation.  For a simple
            system in equilibrium — one substance, at fixed volume{" "}
            <M t="V" /> and amount <M t="N" />, with no other way of doing
            work — the temperature <M t="T" /> is defined by:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="xs" c={INK} fw={700} tt="uppercase">
              thermodynamic definition
            </Text>
            <Tex mode="display"
              src="\frac{1}{T} = \left(\frac{\partial S}{\partial U}\right)_{V,N}" />
          </Box>
          <Text size="sm">
            Read it as: <strong>at fixed <M t="V" /> and <M t="N" />,{" "}
            <M t="1/T" /> says how much the entropy <M t="S" /> changes when
            a little internal energy <M t="U" /> is added.</strong>  At high temperature, the same added joule
            produces a smaller entropy increase.  It needs no substance and
            no instrument, which is why part B is about the gap between this
            definition and a number on a screen.
          </Text>
        </Box>

        <Box>
          <Title order={5}>6 · <M t="T" /> is not K — and K is not <M t="T_{90}" /></Title>
          <Text size="sm" mt={4}>
            Three different things share the word “temperature”, and much
            confusion about it comes from mixing them.  Keep them apart:
          </Text>
          <ThreeThings />
          <Text size="sm" mt={4}>
            Since 2019 the kelvin is defined by <em>declaring</em> the
            Boltzmann constant to be exactly{" "}
            <M t="k_\mathrm{B} = 1.380649\times10^{-23}\ \mathrm{J/K}" />.  What was
            defined is <strong>the unit, not the quantity</strong> — and the
            definition of the unit is not, by itself, a measurement
            procedure.  Measurement is disseminated through the practical
            scale instead: ITS-90, a chain of reproducible fixed points with
            declared instruments interpolating between them.  At{" "}
            {T_SUBJECT_K} K you sit just below the freezing point of tin
            (505.078 K), and a standard platinum resistance thermometer
            (SPRT) is the defining interpolating instrument — not the
            industrial Pt100 of part B.  <M t="T_{90}" /> and thermodynamic{" "}
            <M t="T" />{" "}
            <strong>are not the same number</strong> — near 500 K they differ
            by of order ten millikelvin, known and tabulated.
          </Text>
          <Text size="xs" c={INK} mt={6}>
            How the kelvin actually reaches a thermometer — the fixed points,
            the four interpolating instruments, and what happens above the
            silver point — is the deep dive: <em>How do we know a thermometer
            is right?</em>
          </Text>
        </Box>

        <Box>
          <Title order={5}>7 · What an assumed emissivity costs — a worked example</Title>
          <Text size="sm" mt={4}>
            The pyrometer is the instrument where the bridge is most visible.
            It observes <strong>radiance</strong>, not temperature directly,
            and to turn radiance into a temperature it must ASSUME an
            emissivity <M t="\varepsilon" />.  What an error in that assumption costs is
            computable, from Wien’s approximation to Planck:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Tex mode="display"
              src="\frac{|\Delta T|}{T} \approx \frac{\lambda T}{c_2}\,\frac{|\Delta\varepsilon|}{\varepsilon}" />
          </Box>
          <Text size="sm">
            Here <M t="\Delta\varepsilon" /> is the error in the{" "}
            <em>assumed</em> emissivity, and the
            formula gives the size of the effect, not its sign: at a fixed
            radiance, assuming a larger emissivity yields a lower inferred
            temperature.  Take a furnace reading of{" "}
            <strong>{T_HOT_C} °C</strong> ({T_HOT_K.toFixed(2)} K — a cracker
            firebox, a reformer flame).  At{" "}
            <M t="\lambda = 0.65\ \mu\mathrm{m}" /> with{" "}
            <M t={`c_2 = ${C2_UM_K}\ \mu\mathrm{m\,K}`} /> the sensitivity
            factor <M t="\lambda T / c_2" /> is{" "}
            <strong>{emissivitySensitivity(0.65, T_HOT_K).toFixed(3)}</strong>,
            so a <strong>10 % error in the emissivity you assumed</strong>{" "}
            moves the answer by about{" "}
            <strong>{emissivityBand_K(0.65, T_HOT_K, 0.10).toFixed(0)} K</strong>.
            Tens of kelvin — against a display that prints a tenth of a
            degree.  In a metrology laboratory the assumption can be made
            very good (a blackbody cavity, a characterised surface); pointed
            at an oxidised tube it usually{" "}
            <strong>dominates the uncertainty</strong>.
          </Text>
          <Text size="sm" mt={6}>
            And note where that reading sits: above the silver point
            ({T_SILVER_K} K), <strong>the scale itself</strong> is realised
            by radiation — so at the hot end the radiation bridge is not one
            instrument’s weakness, it is how the scale itself is carried.
          </Text>
          <Text size="xs" c={INK} mt={6}>
            This is arithmetic over a printed closed form, not an engine run —
            redo it once on paper, three multiplications, and the number stops
            being something you were told.  Change the wavelength, target or
            method and the number moves; the shape of the lesson does not.
          </Text>
        </Box>

        <Box>
          <Title order={5}>8 · Traceability — how the number reaches your plant</Title>
          <Text size="sm" mt={4}>
            The bridge is calibrated, and the calibration has a pedigree:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
              {"national standard\n → reference standard\n  → calibration laboratory\n   → plant instrument\n    → thermowell / installation\n     → transmitter\n      → displayed value"}
            </Text>
          </Box>
          <Text size="sm">
            <strong>Uncertainty accumulates along that chain.</strong>  By how
            much is an engineering question with an answer for{" "}
            <em>your installation</em>, not a universal constant: sensor type,
            calibration, immersion depth, the thermowell, gradients along it,
            drift, and the transmitter all contribute.  A well-installed loop
            can be very good; a badly installed one can be tens of kelvin out
            and look perfectly fine on the DCS.
          </Text>
        </Box>

        <Box>
          <Title order={5}>Where to go deeper</Title>
          <Text size="xs" c={INK} mt={4}>
            • <em>How do we know a thermometer is right?</em> — the deep dive:
            ITS-90’s own fixed points, the gas thermometer solved live by the
            engine, why platinum’s melting point cannot carry a tenth of a
            degree, and the historical/epistemological story (Regnault,
            Wedgwood, Hasok Chang’s <em>Inventing Temperature</em>).
            <br />• <em>When a property database lies to you</em> — the
            boiling-point ladder, checked live by the engine: a water record
            that disagrees with itself by 0.70 K and a glycerol correlation
            that misses by a factor of 19, and the discipline of testing a
            record’s internal consistency before trusting it.
          </Text>
        </Box>

        <Box>
          <Title order={5}>What this page is not</Title>
          <Text size="xs" c={INK} mt={4}>
            • {T_SUBJECT_K} K is arbitrary.  What is not arbitrary is that it
            has three digits after the point.
            <br />• The cup and the tank are described, not computed: no
            number on this page is an engine answer.
            <br />• The pyrometer band is conditional on its own assumptions
            (wavelength, target, a 10 % emissivity error); it is a worked
            example, not a verdict on every pyrometer.
            <br />• The ITS-90 vs T difference near 500 K is given as an order
            of magnitude, never a value — the tabulated figure is a published
            number not read back against its source here.
            <br />• No uncertainty is quoted here as if it had been
            measured.  The one ± on the page is the illustrative 0.015 K
            in part B, marked as invented where it appears; everywhere else,
            none having been read back from a primary source, the page tells
            you to ask for the budget rather than supplying a number to trust.
          </Text>
        </Box>

      </Stack>
    </Box>
  );
}

export default WhatIsTemperatureTool;
