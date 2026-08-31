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
  ONE PAGE, ONE MENTAL MODEL -- rearchitected 2026-08-29 on the owner's
  pedagogical ruling, which this header records because it governs every
  future edit:

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

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";

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
  "practical scale (ITS-90) / calibration",
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
      <Text size="lg" fw={700} ff="monospace" mt={2}>{sym}</Text>
      <Text size="xs" mt={4}>{body}</Text>
    </Box>
  );
  return (
    <Group gap={10} align="stretch" wrap="wrap" my={8}>
      {cell("quantity", "T",
        "The thermodynamic property of the system.  It exists whether or not "
        + "anyone measures it.")}
      {cell("unit", "K",
        "The unit T is expressed in — fixed since 2019 by declaring the "
        + "Boltzmann constant exact.  A convention, not a property.")}
      {cell("practical scale", "T₉₀",
        "The practical scale (ITS-90) through which precision temperature "
        + "measurements are realised and disseminated.")}
    </Group>
  );
}

// ---- the page ---------------------------------------------------------------

export function WhatIsTemperatureTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>What is a temperature?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Write one down: <strong>{T_SUBJECT_K} K</strong>.  It{" "}
            <em>looks</em> extremely precise.  By the end of this page you
            should be unable to read it that way again — not because the
            digits are wrong, but because you will see the whole chain hidden
            behind them: what was measured, by what, on what scale, through
            what model, and with what uncertainty.  Never confuse the number
            with the thing.
          </Text>
        </Box>

        <Box>
          <Title order={5}>1 · Two systems touch</Title>
          <Text size="sm" mt={4}>
            Put two systems in thermal contact.  If thermal contact alone
            produces a net flow of heat between them, they were{" "}
            <strong>not at the same temperature</strong> — that is what the
            words mean.  When the flow
            stops, the two are in <strong>thermal equilibrium</strong>, and
            there is one intensive property that is now equal in both.  We
            call that property <strong>temperature</strong>.
          </Text>
          <Text size="sm" mt={6}>
            Notice what this already gives you, with no formula: temperature
            is a property of a <em>state</em>, it decides which way heat
            flows, and equality of temperature is what equilibrium{" "}
            <em>is</em>.  Nature has a state; temperature is one property of
            that state.  Nothing about instruments yet — deliberately.
          </Text>
        </Box>

        <Box>
          <Title order={5}>2 · The thermodynamic definition</Title>
          <Text size="sm" mt={4}>
            The intuition above has an exact formulation, and it is worth
            seeing once, boxed, after the intuition rather than instead of it:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="xs" c={INK} fw={700} tt="uppercase">
              thermodynamic definition
            </Text>
            <Text size="sm" ff="monospace" mt={4}>
              1 / T = (∂S / ∂U)<sub>V, N</sub>
            </Text>
          </Box>
          <Text size="sm">
            Read it as: <strong>at fixed V and N, 1/T says how much the
            entropy changes when a little energy is added.</strong>  At high
            temperature, the same added joule produces a smaller entropy
            increase.  It needs no substance and no instrument — and
            that is precisely why everything that follows on this page is
            about the gap between this definition and a number on a screen.
          </Text>
        </Box>

        <Box>
          <Title order={5}>3 · T is not K — and K is not T₉₀</Title>
          <Text size="sm" mt={4}>
            Three different things wear the word “temperature”, and most
            confusion about it is one of them wearing another’s clothes.
            Keep them violently apart:
          </Text>
          <ThreeThings />
          <Text size="sm" mt={4}>
            Since 2019 the kelvin is defined by <em>declaring</em> the
            Boltzmann constant to be exactly 1.380649 × 10⁻²³ J/K.  Note
            carefully what was defined: <strong>the unit, not the
            quantity</strong> — and the definition gives you no way whatsoever
            to <em>measure</em> a temperature.  Measurement is disseminated
            through the practical scale instead: ITS-90, a chain of
            reproducible fixed points with declared instruments interpolating
            between them.  At {T_SUBJECT_K} K you sit just below the freezing
            point of tin (505.078 K), and a standard platinum resistance
            thermometer (SPRT) is the defining interpolating instrument —
            not the industrial Pt100 of the table below.  T₉₀ and
            thermodynamic T{" "}
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
          <Title order={5}>4 · The instrument does not see T</Title>
          <Text size="sm" mt={4}>
            Here is the lesson this page exists to install.  <strong>No
            instrument on your P&amp;ID observes temperature.</strong>  Each
            observes something else — a resistance, a voltage, a radiance —
            and a <em>bridge</em> of physics, calibration and assumptions
            turns that observable into a temperature number:
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
          {/*  ONE BRIDGE, WALKED WITH REAL NUMBERS.  The table names three
               observables and the row above calls the conversion a bridge,
               and until this block the page never crossed one: a reader met
               "a resistance" and never a resistance.  Owner's review,
               2026-08-31.  Closed-form and printed with its constants, per
               this file's zero-physics-in-TypeScript rule -- the reader
               redoes it on paper, and nothing here is an engine answer.  */}
          <Text size="sm" mt={8}>
            Walk one bridge with real numbers.  A Pt100 in a thermowell reads{" "}
            <strong>119.4 Ω</strong>.  That is the whole of the measurement —
            a resistance, nothing more.  The bridge is the Callendar–Van Dusen
            relation of IEC 60751, <em>R</em>(<em>t</em>) ={" "}
            <em>R</em><sub>0</sub>(1 + <em>At</em> + <em>Bt</em>²) with{" "}
            <em>R</em><sub>0</sub> = 100 Ω, <em>A</em> = 3.9083 × 10⁻³ °C⁻¹
            and <em>B</em> = −5.775 × 10⁻⁷ °C⁻², solved for <em>t</em>:
          </Text>
          <Box mt={6} p={8} style={{ border: `1px solid ${GRID}`,
            borderRadius: 4, fontSize: 13 }}>
            119.4 Ω → <em>t</em> = 50.01 °C → <strong>323.16 K</strong>
          </Box>
          <Text size="sm" mt={6}>
            Notice what that arithmetic did <em>not</em> give you.  It did not
            say the fluid is at 323.16 K — it said the <em>sensing element</em>
            is, if this particular Pt100 obeys the standard curve, if it has
            not drifted, if it is immersed deeply enough, and if the thermowell
            is not conducting heat along its stem.  Every one of those is an
            assumption inside the bridge, and none of them is visible in
            “119.4 Ω”.
          </Text>
          <Text size="sm" mt={8}>
            The whole page in one figure — read it top to bottom and notice
            how far the reported number sits from the state it is about:
          </Text>
          <ChainFigure />
        </Box>

        <Box>
          <Title order={5}>5 · What the bridge costs — a worked example</Title>
          <Text size="sm" mt={4}>
            The pyrometer is the instrument where the bridge is most visible,
            so it makes the best worked example.{"  "}
            <strong>A pyrometer does not measure temperature.  It measures
            radiance.</strong>  To turn radiance into a temperature it must
            ASSUME an emissivity — and what that assumption costs is
            computable, from Wien’s approximation to Planck:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="sm" ff="monospace">
              ΔT / T ≈ (λ·T / c₂) · (Δε / ε)
            </Text>
          </Box>
          <Text size="sm">
            Take a furnace reading of <strong>{T_HOT_C} °C</strong>{" "}
            ({T_HOT_K.toFixed(2)} K — a cracker firebox, a reformer flame).
            At λ = 0.65 µm with c₂ = {C2_UM_K} µm·K the sensitivity factor
            is{" "}
            <strong>{emissivitySensitivity(0.65, T_HOT_K).toFixed(3)}</strong>,
            so a <strong>10 % error in the emissivity you guessed</strong>{" "}
            puts about{" "}
            <strong>{emissivityBand_K(0.65, T_HOT_K, 0.10).toFixed(0)} K</strong>{" "}
            on the answer.  Tens of kelvin — against a display that prints a
            tenth of a degree.  In a metrology laboratory the assumption can
            be made very good (a blackbody cavity, a characterised surface);
            pointed at an oxidised tube it usually{" "}
            <strong>dominates the uncertainty</strong>.
          </Text>
          <Text size="sm" mt={6}>
            And note where that reading sits: above the silver point
            ({T_SILVER_K} K), <strong>the scale itself</strong> stops touching
            the thing and becomes radiation — so at the hot end the bridge is
            not one instrument’s weakness, it is all there is.
          </Text>
          <Text size="xs" c={INK} mt={6}>
            This is arithmetic over a printed closed form, not an engine run —
            redo it once on paper, three multiplications, and the number stops
            being something you were told.  Change the wavelength, target or
            method and the number moves; the shape of the lesson does not.
          </Text>
        </Box>

        <Box>
          <Title order={5}>6 · Traceability — how the number reaches your plant</Title>
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
          <Title order={5}>7 · Decimal places are not uncertainty</Title>
          <Text size="sm" mt={4}>
            As written, <strong>{T_SUBJECT_K} K</strong> is not yet a
            measurement result at all: it carries no uncertainty, names no
            scale, no instrument, no traceability.  A serious statement reads
            more like{" "}
            <strong>T₉₀ = 500.012 K, U = 0.015 K (k = 2)</strong> — where
            that ± is INVENTED here, for its shape alone, because no budget
            for this number has been read back from anywhere — plus how it
            was obtained.  The digits tell you how finely the number was{" "}
            <em>written</em>; only the uncertainty tells you how well it is{" "}
            <em>known</em>.  Display resolution and measurement uncertainty
            are different things and need not be comparable — though when a
            final result is reported, the value and its uncertainty should be
            rounded consistently.
          </Text>
        </Box>

        <Box>
          <Title order={5}>8 · Back to 500.012 K</Title>
          <Text size="sm" mt={4}>
            Now dismantle the number you started with.  When anyone shows you
            a reported temperature, you own it only when you can ask:
          </Text>
          <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${ACCENT}` }}>
            {INTERROGATION.map((q) => (
              <Text key={q} size="sm" ff="monospace">• {q}</Text>
            ))}
          </Box>
          <Text size="sm">
            <strong>A temperature reading is the end of a measurement chain,
            not a number that nature printed on the system.</strong>  An
            engineer who can walk that chain owns the number.  An engineer who
            can only repeat it does not.
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
            <br />• The pyrometer band is conditional on its own assumptions
            (wavelength, target, a 10 % emissivity error); it is a worked
            example, not a verdict on every pyrometer.
            <br />• The ITS-90 vs T difference near 500 K is given as an order
            of magnitude, never a value — the tabulated figure is a published
            number this repository has not read back against its source.
            <br />• No uncertainty is quoted here as if it had been
            measured.  The one ± on the page is the illustrative 0.015 K
            above, marked as invented where it appears; everywhere else, none
            having been read back from a primary source, the page tells you
            to ask for the budget rather than supplying a number to trust.
          </Text>
        </Box>

      </Stack>
    </Box>
  );
}

export default WhatIsTemperatureTool;
