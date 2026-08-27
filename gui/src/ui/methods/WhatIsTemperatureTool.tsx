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
  THE FIRST TOOL OF THE `notes` KIND: a chapter you scroll, with the engine
  running inside it.

  It teaches ONE question -- what the last digits of a temperature assert --
  and answers it in three movements: the DEFINITION (the kelvin is fixed by
  the Boltzmann constant, by decree), the REALISATION (an entirely separate
  practical scale, ITS-90, with a platinum resistor interpolating between
  fixed points), and the GAS THERMOMETER that historically bridged the two and
  only reads thermodynamic temperature in a limit no experiment can reach.

  ZERO PHYSICS IN TYPESCRIPT, exactly as everywhere else on this plane.  Every
  compressibility factor on the page is an engine run of the bundled tutorial
  `props/thermo/temperature01_gas_thermometer` in the reader's own browser;
  this file draws and says, and computes nothing.  The pressure knob rewrites
  the case's `to` bound and the engine re-scans -- so the curve the reader
  bends is the equation of state answering, not a formula transcribed here.

  WHY A SCROLLING PAGE AND NOT A CANVAS.  A construction tool answers "what
  does the classical graphical method say"; this answers "what does this
  quantity MEAN", and the argument has an order: the definition has to land
  before the realisation can be seen to be a separate thing.  A canvas has no
  order.  Prose does.
\*---------------------------------------------------------------------------*/

import { Fragment, useMemo, useState } from "react";
import { Alert, Badge, Box, Group, Loader, Slider, Stack, Text, Title }
  from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import { KnobField } from "./knobPanel.js";

//  The theme's own tokens, exactly as every other tool on this plane spells
//  them: a colour hard-coded here would be right in one theme and wrong in
//  the other, and the reader chooses the theme.
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";

/** The bundled tutorial this page runs in the browser. */
export const TEMPERATURE_WITNESS = "props/thermo/temperature01_gas_thermometer";
const PROPS_DICT = "system/propsDict";

/** The temperature the whole page is about.  It is arbitrary, and the page
 *  says so — what is not arbitrary is that it has three digits after the
 *  point, which is the question. */
export const T_SUBJECT_K = 500.012;

/** The hot end, as the owner posed it: "what the hell is a temperature of
 *  1608.1 degC?"  Above the silver point, so the platinum resistor is gone and
 *  the answer is radiation -- which is where the tenth of a degree dies. */
export const T_HOT_C = 1608.1;
export const T_HOT_K = T_HOT_C + 273.15;

/** Second radiation constant, um.K -- the ONE place this page carries a
 *  physical constant, and it is here because the engine has no radiation
 *  thermometry operation to ask.  See the section's own note. */
export const C2_UM_K = 14388;

/** Sensitivity of a narrow-band radiation thermometer to the emissivity it had
 *  to ASSUME.  From Wien's approximation to Planck:
 *
 *      dT/T  =  (lambda*T / c2) * (de/e)
 *
 *  It is arithmetic over a closed form, printed so a reader can redo it -- not
 *  an engine answer, and the page says so rather than letting it look like
 *  one. */
export function emissivitySensitivity(lambda_um: number, T_K: number): number {
  return (lambda_um * T_K) / C2_UM_K;
}

/** What a relative emissivity error of `relErr` costs, in kelvin, at `T_K`.
 *  The band the page prints beside the reading -- ONE home, because the
 *  sentence "1608 +/- 16" and the sentence "16 K on the answer" are the same
 *  number and a page that transcribes it twice will drift them. */
export function emissivityBand_K(
  lambda_um: number, T_K: number, relErr: number,
): number {
  return emissivitySensitivity(lambda_um, T_K) * relErr * T_K;
}

/** The second witness: the ladder of normal boiling points, verified. */
export const LADDER_WITNESS = "props/thermo/temperature02_engineers_ladder";

/** One rung, as the page reads it out of the run's own diagnostics.  The
 *  labels are what the substance IS on a plant, which is the half a reader
 *  needs and a formula cannot supply; the NUMBERS are all the engine's. */
export const LADDER: readonly {
  op: string; comp: string; T: number; what: string; caveat?: string;
}[] = [
  { op: "rung_H2",    comp: "H2",    T: 20.39,  what: "liquid hydrogen" },
  { op: "rung_neon",  comp: "neon",  T: 27.10,  what: "neon" },
  { op: "rung_N2",    comp: "N2",    T: 77.35,  what: "liquid nitrogen — air separation" },
  { op: "rung_Ar",    comp: "Ar",    T: 87.30,  what: "argon" },
  { op: "rung_O2",    comp: "O2",    T: 90.17,  what: "liquid oxygen" },
  { op: "rung_CH4",   comp: "CH4",   T: 111.66, what: "LNG" },
  { op: "rung_C2H4",  comp: "C2H4",  T: 169.42, what: "cryogenic ethylene" },
  { op: "rung_benzene", comp: "benzene", T: 353.24, what: "benzene — the aromatics train" },
  { op: "rung_water", comp: "water", T: 373.15, what: "water at one atmosphere" },
  { op: "rung_ethyleneGlycol", comp: "ethyleneGlycol", T: 470.45,
    what: "ethylene glycol — dehydration, glycol regeneration" },
  { op: "rung_naphthalene", comp: "naphthalene", T: 491.16, what: "naphthalene" },
  { op: "rung_biphenyl", comp: "biphenyl", T: 528.15,
    what: "biphenyl — a component of the hot-oil fluids" },
  { op: "rung_glycerol", comp: "glycerol", T: 563.15,
    what: "glycerol — and here the ladder breaks, on purpose",
    caveat: "This record's vapour pressure is `origin predictive` — "
      + "Ambrose-Walton corresponding states from Tc, Pc and omega, at "
      + "omega = 1.54, far outside where such a correlation was fitted.  The "
      + "record itself says \u201cvalidate against saturation data\u201d, and this "
      + "row IS that validation: it misses by a factor of 19.  Kept, and "
      + "labelled, because a table that only shows the rungs that land "
      + "teaches that records can be trusted without being checked." },
];

/** ITS-90's own defining fixed points ABOVE the triple point of water --
 *  DECLARED, not computed here, and marked as such wherever they are shown.
 *
 *  They belong on this page because they are what the ladder of boiling
 *  points TURNS INTO: above roughly 600 K an organic cracks before it boils,
 *  so there is no one-atmosphere equilibrium left to ask about, and the scale
 *  changes character -- it is realised on metal FREEZING points instead.
 *
 *  Provenance, marked exactly as the epigraphs are: these are the values of
 *  the International Temperature Scale of 1990 as it is universally quoted
 *  (Preston-Thomas, Metrologia 27 (1990) 3-10, plus its erratum).  This
 *  repository has NOT read them back against the BIPM text, and the page says
 *  so rather than letting a table look measured. */
export const ITS90_ABOVE_WATER: readonly { what: string; T: number }[] = [
  { what: "gallium (melting)",   T: 302.9146 },
  { what: "indium (freezing)",   T: 429.7485 },
  { what: "tin (freezing)",      T: 505.078 },
  { what: "zinc (freezing)",     T: 692.677 },
  { what: "aluminium (freezing)", T: 933.473 },
  { what: "silver (freezing)",   T: 1234.93 },
  { what: "gold (freezing)",     T: 1337.33 },
  { what: "copper (freezing)",   T: 1357.77 },
];

/** The HIGHEST defining fixed point ITS-90 has.  Everything above it is
 *  extrapolated Planck radiation -- which is the whole reason section 7
 *  exists, and the reason a melting point quoted above here cannot carry the
 *  precision it is usually printed with. */
export const ITS90_TOP_K = 1357.77;

/** Platinum's melting point, as it is usually quoted -- the number that
 *  provoked this part of the page.  It is NOT an ITS-90 fixed point: it is a
 *  measurement made ON the scale, in the extrapolated radiation region. */
export const T_PT_MELT_C = 1768.3;
export const T_PT_MELT_K = T_PT_MELT_C + 273.15;

/** How far a rung's computed vapour pressure sits from one atmosphere, in per
 *  cent.  Derived from the engine's own diagnostics; the page computes no
 *  pressure of its own. */
export function rungDeparturePct(psat: number): number {
  return (psat / 101325 - 1) * 100;
}

/** Pull each rung's computed vapour pressure out of the run's own operation
 *  diagnostics.  A rung the run did not produce is left OUT, never defaulted
 *  to 101325 -- that would paint a missing answer as a perfect one. */
export function readLadder(
  ops: readonly { name?: string; diagnostics?: Record<string, number> }[] | undefined,
): { op: string; psat: number }[] {
  const out: { op: string; psat: number }[] = [];
  for (const r of LADDER) {
    const o = ops?.find((x) => x.name === r.op);
    const v = o?.diagnostics?.["Psat_" + r.comp];
    if (typeof v === "number" && Number.isFinite(v)) out.push({ op: r.op, psat: v });
  }
  return out;
}

/** The book this page has been circling from its first line, now READ rather
 *  than named.  Chang's four historical episodes are four CIRCLES: in each,
 *  the thing you would need in order to justify a measurement is the thing
 *  the measurement was for.  Each carries the escape that was actually
 *  found -- which is the point, because a page that only posed the
 *  circularity would leave a reader with scepticism instead of an
 *  engineering practice. */
export const CHANG_CIRCLES: readonly {
  ch: number; title: string; circle: string; escape: string;
}[] = [
  {
    ch: 1,
    title: "Keeping the fixed points fixed",
    circle: "A thermometer is graduated between two phenomena assumed to "
      + "happen always at the same temperature.  But how was that judged, "
      + "before any trusted thermometer existed?  And water does NOT "
      + "cooperate: it superheats, it bumps, it hisses, and its boiling "
      + "temperature moves with the vessel, the dissolved air and the "
      + "pressure.  Cavendish, around 1780: \u201cThe excess of the heat of "
      + "water above the boiling point is influenced by a great variety of "
      + "circumstances.\u201d",
    escape: "A self-improving spiral of quantification: bodily sensation "
      + "first, then an ORDINAL thermoscope that ranks without numbering, "
      + "then a CARDINAL thermometer.  Each stage is built with the "
      + "previous one and ends up better than it.",
  },
  {
    ch: 2,
    title: "Spirit, air and quicksilver",
    circle: "The two-point method assumes the fluid expands uniformly with "
      + "temperature.  To test that you must plot volume against "
      + "temperature \u2014 and you have no temperature until the thermometer "
      + "you are testing is trusted.  Chang calls this the PROBLEM OF NOMIC "
      + "MEASUREMENT, and it is general: you want X, you can only observe "
      + "Y, you need a law X = f(Y), and f cannot be tested without knowing "
      + "X.  Mercury, alcohol and air thermometers disagreed, and at most "
      + "one of them could be right.",
    escape: "Regnault's COMPARABILITY, and it is beautifully minimal: a "
      + "real physical property has ONE value in a given situation (the "
      + "principle of single value), so an instrument that disagrees with "
      + "itself, or with others of its own kind, is wrong \u2014 and you can "
      + "know that WITHOUT knowing which one is right.  It tests "
      + "thermometers while assuming nothing about the nature of heat.",
  },
  {
    ch: 3,
    title: "To go beyond",
    circle: "Extend the scale past where it was built and the instrument "
      + "itself fails: mercury freezes, glass softens, the thermometer "
      + "melts in the kiln.  There is no pre-existing standard in the new "
      + "domain against which a new method could be checked.  Wedgwood the "
      + "potter measured his kilns by the shrinkage of clay \u2014 and clay "
      + "CONTRACTS with heat, so the scale ran backwards.",
    escape: "CONVERGENCE.  The concept in the new domain is partly BUILT by "
      + "several independent methods being made to agree there.  Not one "
      + "method validated against a standard, but a standard assembled out "
      + "of agreement.",
  },
  {
    ch: 4,
    title: "Theory, measurement, and absolute temperature",
    circle: "Thomson (Kelvin) built a temperature that refers to no "
      + "substance whatsoever.  But connecting that abstraction to any "
      + "actual apparatus needs a theory, and testing the theory needs "
      + "temperature measurements \u2014 which need the connection.",
    escape: "ITERATION on an admitted guess: assume the unjustified "
      + "hypothesis provisionally, use it, and let the results correct the "
      + "assumption you started from.  Peirce's observation, which Chang "
      + "quotes: reasoning \u201cnot only corrects its conclusions, it even "
      + "corrects its premisses.\u201d",
  },
];

/** The book, cited once, in one place. */
export const CHANG_CITATION =
  "Hasok Chang, Inventing Temperature: Measurement and Scientific Progress "
  + "(Oxford University Press, 2004; Oxford Studies in the Philosophy of "
  + "Science)";

/** One row of the scan the engine writes. */
export interface ZRow { P: number; Z: number }

/** Read the engine's own CSV.  Header equality, not a prefix test: a drifted
 *  header must refuse rather than be read positionally and mis-columned. */
export function readZScan(csv: string): ZRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0]!.split(",").map((s) => s.trim());
  const iP = head.indexOf("P"), iZ = head.indexOf("Z");
  if (iP < 0 || iZ < 0) return [];
  const out: ZRow[] = [];
  for (let i = 1; i < lines.length; ++i) {
    const c = lines[i]!.split(",");
    const P = Number(c[iP]), Z = Number(c[iZ]);
    if (Number.isFinite(P) && Number.isFinite(Z)) out.push({ P, Z });
  }
  return out;
}

/** The worst departure from ideality on a scan, as a percentage.  Derived from
 *  the engine's own rows and never from a formula here. */
export function worstDeparturePct(rows: readonly ZRow[]): number | null {
  let worst = 0, seen = false;
  for (const r of rows) {
    const d = Math.abs(r.Z - 1) * 100;
    if (d > worst) worst = d;
    seen = true;
  }
  return seen ? worst : null;
}

// ---- the plot ---------------------------------------------------------------

const PW = 640, PH = 300, ML = 62, MR = 18, MT = 16, MB = 44;

function ZPlot({ rows }: { rows: readonly ZRow[] }): JSX.Element {
  if (rows.length < 2) {
    return (
      <svg viewBox={`0 0 ${PW} ${PH}`} width="100%" role="img"
        aria-label="compressibility factor against pressure, not yet solved">
        <text x={PW / 2} y={PH / 2} textAnchor="middle" fontSize={12} fill={INK}>
          solving in your browser…
        </text>
      </svg>
    );
  }
  const pMax = Math.max(...rows.map((r) => r.P));
  const zLo = Math.min(1, ...rows.map((r) => r.Z));
  const zHi = Math.max(1, ...rows.map((r) => r.Z));
  const pad = Math.max(1e-4, (zHi - zLo) * 0.18);
  const y0 = zLo - pad, y1 = zHi + pad;
  const X = (p: number) => ML + (p / pMax) * (PW - ML - MR);
  const Y = (z: number) => MT + (1 - (z - y0) / (y1 - y0)) * (PH - MT - MB);
  const path = rows.map((r, i) => `${i ? "L" : "M"}${X(r.P)},${Y(r.Z)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${PW} ${PH}`} width="100%" role="img"
      aria-label={"Compressibility factor Z of nitrogen against pressure at "
        + T_SUBJECT_K + " kelvin, computed by the engine; the dashed line marks "
        + "Z = 1, the ideal gas, which the curve approaches only as the "
        + "pressure goes to zero"}>
      {/* Z = 1 — the ideal gas.  Dashed, because it is not a curve the
          substance follows: it is the limit the curve leaves. */}
      <line x1={ML} y1={Y(1)} x2={PW - MR} y2={Y(1)} stroke={GRID}
        strokeWidth={1.4} strokeDasharray="5 4" />
      <text x={PW - MR} y={Y(1) - 6} textAnchor="end" fontSize={10} fill={INK}>
        Z = 1 · the ideal gas
      </text>
      <path d={path} fill="none" stroke={ACCENT} strokeWidth={2} />
      {/* The zero-pressure end, which is where a gas thermometer would have to
          take its reading and cannot. */}
      <circle cx={X(rows[0]!.P)} cy={Y(rows[0]!.Z)} r={3.5} fill={ACCENT} />
      <line x1={ML} y1={MT} x2={ML} y2={PH - MB} stroke={TEXT} strokeWidth={1} />
      <line x1={ML} y1={PH - MB} x2={PW - MR} y2={PH - MB} stroke={TEXT}
        strokeWidth={1} />
      <text x={ML} y={PH - MB + 16} textAnchor="middle" fontSize={10} fill={INK}>0</text>
      <text x={PW - MR} y={PH - MB + 16} textAnchor="end" fontSize={10} fill={INK}>
        {(pMax / 1e6).toFixed(2)} MPa
      </text>
      <text x={(ML + PW - MR) / 2} y={PH - 8} textAnchor="middle" fontSize={11}
        fill={TEXT}>pressure the reading is taken at</text>
      <text x={16} y={(MT + PH - MB) / 2} fontSize={11} fill={TEXT}
        transform={`rotate(-90 16 ${(MT + PH - MB) / 2})`}
        textAnchor="middle">Z = Pv / RT</text>
      <text x={ML - 6} y={Y(zHi) + 4} textAnchor="end" fontSize={10} fill={INK}>
        {zHi.toFixed(4)}
      </text>
    </svg>
  );
}

// ---- the page ---------------------------------------------------------------

export function WhatIsTemperatureTool(): JSX.Element {
  //  The one knob: how high a pressure the reading is taken at.  It rewrites
  //  the case's own scan bound, so the engine re-answers.
  const [pMaxMPa, setPMaxMPa] = useState(5);

  //  `occurrence` IS 1-BASED (methodRun's `locate`: `matches[(occurrence ?? 1)
  //  - 1]`).  Shipped as 0, which finds nothing and throws -- so the knob did
  //  not merely fail to move the curve, it failed on every drag.  Caught by
  //  this tool's own test the same day, together with the case having written
  //  `vary { ... to 5000000 Pa; ... }` on ONE line, where the override cannot
  //  anchor on the key at all.  Two independent ways for one control to do
  //  nothing, and neither shows on screen.
  const overrides = useMemo(() => [{
    file: PROPS_DICT, key: "to", value: pMaxMPa * 1e6,
    occurrence: 1,
  }], [pMaxMPa]);

  const run = useMethodRun(TEMPERATURE_WITNESS, overrides,
    String(pMaxMPa), "choupoProps");
  //  The ladder takes no knob -- it is the same eight questions every time --
  //  so it runs once with no overrides.
  const ladderRun = useMethodRun(LADDER_WITNESS, [], "ladder", "choupoProps");
  const ladder = useMemo(
    () => readLadder(ladderRun.result?.operationResults),
    [ladderRun.result]);
  const rows = useMemo(
    () => readZScan(run.result?.csvFiles?.["gasThermometer.csv"] ?? ""),
    [run.result]);
  const worst = worstDeparturePct(rows);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>What is a temperature?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Write one down: <strong>500.012 K</strong>.  It <em>looks</em>
            precise.  But decimal places are not uncertainty, and as written
            this is not yet a measurement result at all — it carries no
            uncertainty, names no scale, no method and no traceability.  A
            serious one reads more like{" "}
            <strong>T₉₀ = 500.012 K, U = 0.015 K (k = 2)</strong>, plus how it
            was obtained.  So: what would have to be true for those three
            digits to mean anything?
          </Text>
        </Box>

        <Alert variant="light" title="An epigraph, and a warning about it">
          <Text size="sm" fs="italic">
            “Thermodynamics is a funny subject.  The first time you go through
            it, you don’t understand it at all.  The second time you go through
            it, you think you understand it, except for one or two small points.
            The third time you go through it, you know you don’t understand it,
            but by that time you are so used to it, it doesn’t bother you any
            more.”
          </Text>
          <Text size="xs" mt={6} c="dimmed">
            Attributed to Arnold Sommerfeld — and this page will not pretend
            otherwise: he published no such sentence, it reaches us by report,
            and the source has not been read back.  It is quoted as an
            attribution, marked as one.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>1 · What temperature IS, before any thermometer</Title>
          <Text size="sm" mt={4}>
            Thermodynamics defines temperature without measuring anything.  Put
            two systems in thermal contact and let them exchange energy; the
            total entropy rises until it stops.  What is equal at that point,
            for every pair of systems in equilibrium, is one intensive
            quantity — and that quantity <em>is</em> the temperature:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="sm" ff="monospace">
              1 / T = (∂S / ∂U)<sub>V, N</sub>
            </Text>
          </Box>
          <Text size="sm">
            Read it as: <strong>temperature says how reluctantly a system
            accepts energy.</strong>  Add a joule; if the entropy barely
            rises, T is high.  That is the whole definition, it needs no
            substance and no instrument, and everything else on this page is
            about the gap between it and a number on a screen.
          </Text>
        </Box>

        <Box>
          <Title order={5}>2 · The kelvin is a different thing from T</Title>
          <Text size="sm" mt={4}>
            §1 defined a <em>quantity</em>.  A unit is a separate decision, and
            since 2019 the kelvin is not defined by any substance either: it is
            fixed by <em>declaring</em> the Boltzmann constant to be exactly{" "}
            <strong>1.380649 × 10⁻²³ J/K</strong>.  Not measured — fixed.
          </Text>
          <Text size="sm" mt={6}>
            Note carefully what was defined.  <strong>The unit, not the
            quantity.</strong>  Temperature is still what §1 says it is;
            k<sub>B</sub> is the conversion factor, appearing as k<sub>B</sub>T
            wherever a temperature has to become an energy.  Saying “a
            temperature is a conversion factor” gets it exactly backwards.
          </Text>
          <Text size="sm" mt={6}>
            The triple point of water, which <em>defined</em> the kelvin for
            sixty-five years, became overnight a quantity that is{" "}
            <strong>measured</strong>, with an uncertainty.  Sit with that: the
            definition tells you what a kelvin means and gives you no way
            whatsoever to measure one.
          </Text>
          <Text size="sm" mt={6}>
            <strong>Three things, kept apart from here on:</strong> the
            quantity <em>T</em>; the unit <em>K</em>; and the practical scale{" "}
            <em>T₉₀</em> that instruments actually read.  Most confusion about
            temperature is one of these wearing another’s clothes.
          </Text>
        </Box>

        <Box>
          <Title order={5}>3 · The realisation, which is a different thing again</Title>
          <Text size="sm" mt={4}>
            Nobody puts the Boltzmann constant inside a thermometer.  There ARE
            primary thermometers that realise thermodynamic temperature
            directly — acoustic and dielectric-constant gas thermometry,
            Johnson-noise thermometry, radiometry — and since the redefinition
            they are expected to take over more of the range, particularly at
            the two ends.  But they are laboratory instruments.
          </Text>
          <Text size="sm" mt={6}>
            <strong>Almost all practical thermometry is disseminated instead
            through ITS-90</strong>: a chain of reproducible fixed points with
            declared instruments interpolating between them.  At 500 K you sit
            just below the <strong>freezing point of tin, 505.078 K</strong> —
            with indium at 429.7485 K below you — and a platinum resistance
            thermometer is doing the interpolating.
          </Text>
          <Text size="sm" mt={6}>
            The practical scale and the thermodynamic temperature{" "}
            <strong>are not the same number</strong>.  Near 500 K they differ
            by of order ten millikelvin — known, tabulated, revised as
            measurements improve.  So the “012” is a statement about a platinum
            resistor and a chain of fixed points.  It is not a statement about
            nature.
          </Text>
        </Box>

        <Box>
          <Title order={5}>4 · The bridge, and where it breaks</Title>
          <Text size="sm" mt={4}>
            Thermodynamic temperature was historically got at with a
            constant-volume gas thermometer: hold the volume, measure the
            pressure, read <em>T</em> off <em>PV = nRT</em>.  Except no real gas
            obeys that.  Below is nitrogen at {T_SUBJECT_K} K, solved in your
            browser by the same engine that runs the simulator — drag the knob
            and watch the equation of state answer.
          </Text>
        </Box>

        <KnobField label="take the reading up to">
          <Group gap={10} wrap="nowrap" align="center">
            <Slider flex={1} min={0.1} max={20} step={0.1} value={pMaxMPa}
              onChange={setPMaxMPa}
              label={(v) => `${v.toFixed(1)} MPa`} />
            {run.busy && <Loader size="xs" />}
          </Group>
        </KnobField>

        <ZPlot rows={rows} />

        {run.err && (
          <Alert color="red" variant="light" title="the engine refused">
            <Text size="xs">{run.err}</Text>
          </Alert>
        )}

        {worst !== null && (
          <Group gap={8} wrap="wrap">
            <Badge variant="light">
              worst departure from ideal: {worst.toFixed(3)} %
            </Badge>
            <Badge variant="light" color="gray">
              {rows.length} points, engine-solved
            </Badge>
          </Group>
        )}

        <Box>
          <Title order={5}>5 · So what range does this actually matter over?</Title>
          <Text size="sm" mt={4}>
            Not all of them.  Conventional chemical-process work lives
            between roughly <strong>20 K and 2300 K</strong> — liquid hydrogen
            at the bottom, a fired heater or a flare at the top.  Two orders of
            magnitude, and this tool stays inside them.
          </Text>
          <Text size="sm" mt={6}>
            <strong>That is an engineering scope, not a boundary of
            physics.</strong>  Nothing changes character at 2300 K; there is no
            temperature at which “plasma begins”, because ionisation depends on
            the species, the pressure and the density.  And chemical
            engineering does reach outside these numbers — dilution
            refrigeration below, combustion diagnostics above.  The bracket
            says where this page has chosen to be useful.
          </Text>
          <Text size="sm" mt={6}>
            Choosing is worth more than a survey that pretends everything
            matters equally.  A page that hedged towards nanokelvin and fusion
            would teach a reader nothing about the plant they are going to
            design.
          </Text>
          <Text size="sm" mt={6}>
            Here is that range climbed as far as a boiling point can carry
            it, and the engine checks every rung rather than quoting it.  Each row asks one question: at the
            temperature this substance’s record calls its normal boiling point,
            what does its vapour-pressure correlation say the pressure is?  It
            should be one atmosphere — that is what a normal boiling point
            means.
          </Text>
        </Box>

        {ladderRun.busy && (
          <Group gap={8}><Loader size="xs" />
            <Text size="xs" c="dimmed">solving the ladder…</Text></Group>
        )}

        {ladder.length > 0 && (
          <Box style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%",
              fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${GRID}` }}>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>T [K]</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>what it is</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>P<sub>sat</sub> / atm</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>off by</th>
                </tr>
              </thead>
              <tbody>
                {LADDER.map((r) => {
                  const hit = ladder.find((x) => x.op === r.op);
                  if (!hit) return null;
                  const d = rungDeparturePct(hit.psat);
                  const bad = Math.abs(d) > 2;
                  return (
                    <Fragment key={r.op}>
                    <tr style={{ borderBottom: r.caveat ? "none"
                      : `1px solid ${GRID}` }}>
                      <td style={{ padding: "4px 8px" }}>{r.T.toFixed(2)}</td>
                      <td style={{ padding: "4px 8px", color: INK }}>{r.what}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>
                        {(hit.psat / 101325).toFixed(3)}
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "right",
                        fontWeight: bad ? 700 : 400 }}>
                        {d >= 0 ? "+" : ""}{d.toFixed(1)} %
                      </td>
                    </tr>
                    {r.caveat && (
                      <tr style={{ borderBottom: `1px solid ${GRID}` }}>
                        <td colSpan={4} style={{ padding: "0 8px 6px 8px",
                          color: INK, fontSize: 12, lineHeight: 1.45 }}>
                          {r.caveat}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </Box>
        )}

        <Alert variant="light" color="orange"
          title="And the worst rung is the one you trust most">
          <Text size="sm">
            Seven cryogens no reader has any intuition for land inside 1.4 %.
            <strong> Water does not</strong> — it comes out at 1.026 atm.  And
            it is worth being exact about what that does and does not show,
            because the obvious reading is wrong.
          </Text>
          <Text size="sm" mt={6}>
            The run does raise an extrapolation notice, unasked:{" "}
            <code>[psat] component &apos;water&apos;: Antoine evaluated at
            T = 373.15 K, OUTSIDE its declared Trange (273 373).</code>{" "}
            <strong>But 0.15 K of extrapolation is not what went wrong.</strong>
            {" "}At 373.00 K, safely inside the window, the same correlation
            already reads 1.020 atm.  The extrapolation is worth about half a
            per cent of the two and a half.
          </Text>
          <Text size="sm" mt={6}>
            What the rung actually found is this:{" "}
            <strong>solve the record’s own Antoine coefficients for one
            atmosphere and they give 372.45 K</strong>, while the same record
            declares <code>Tb 373.15</code> a few lines above.  The file
            disagrees with itself by <strong>0.70 K</strong>.
          </Text>
          <Text size="sm" mt={6}>
            So the engine has <em>not</em> discovered that water disobeys its
            boiling point.  It has discovered that <strong>its own water record
            does not close</strong> — two homes for one fact, drifted apart,
            and nothing had ever asked them the same question until this table
            did.  That is a data defect, and finding it is exactly why
            declared validity ranges and a correlation you can interrogate are
            worth having.
          </Text>
          <Text size="sm" mt={6}>
            The lesson survives intact, only aimed correctly:{" "}
            <strong>familiarity is not accuracy</strong>.  The rung nobody
            would think to check is the one that failed.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>6 · How T₉₀ is realised, across that range</Title>
          <Text size="sm" mt={4}>
            One scale covers essentially the whole of it — <strong>ITS-90</strong>,
            from 0.65 K upwards — but it is not one instrument.  It is four,
            each interpolating between fixed points, and they{" "}
            <strong>overlap</strong> rather than meeting at points:
          </Text>
          <Text size="sm" mt={6} component="div">
            <ul style={{ marginTop: 4, paddingLeft: 20 }}>
              <li>helium vapour pressure, <strong>0.65 – 5 K</strong>;</li>
              <li>an interpolating constant-volume gas thermometer,{" "}
                <strong>3 – 24.5561 K</strong> — the instrument §4 is about;</li>
              <li>the <strong>platinum resistance thermometer</strong> over the
                great middle, <strong>13.8033 K (the hydrogen triple point) to
                1234.93 K (the silver point)</strong>.  <strong>Every
                temperature in the table above lives here</strong>, the
                20.39 K hydrogen rung included;</li>
              <li>Planck’s radiation law above the silver point, where nothing
                can be touched.</li>
            </ul>
          </Text>
          <Text size="sm" mt={6}>
            The overlaps are not untidiness, they are the design.  Where two
            instruments both apply they can be compared, and a scale that
            handed over at bare points would have no way of checking itself at
            the joins.
          </Text>
          <Text size="sm" mt={6}>
            <strong>And the fixed points are a different ladder from the one
            above.</strong>  ITS-90 is realised on triple points of gases and
            freezing points of metals, chosen because they are{" "}
            <em>reproducible</em>.  The table above is boiling points at one
            atmosphere, chosen because they are what a plant{" "}
            <em>distils at</em>.  Two ladders, two reasons, and conflating them
            is a mistake worth naming.
          </Text>
          <Text size="xs" c={INK} mt={6}>
            The fixed points themselves are listed in §8.
          </Text>
        </Box>

        <Box>
          <Title order={5}>7 · And your plant instrument is none of these</Title>
          <Text size="sm" mt={4}>
            Everything above is metrology.  The thing on your P&amp;ID is a
            thermocouple in a thermowell, or a Pt100, or something else again —
            and it is at the far end of a <strong>traceability chain</strong>:
            the scale is realised in a national laboratory, a reference is
            calibrated against that, your instrument against the reference, and
            then it is welded into a pipe and left there for five years.
          </Text>
          <Text size="sm" mt={6}>
            <strong>Uncertainty grows at every link of that chain.</strong>  By
            how much is an engineering question with an answer for your
            installation, not a universal constant: sensor type, calibration,
            immersion depth, the thermowell, gradients along it, drift, and the
            transmitter all decide it.  A well-installed loop can be very good;
            a badly installed one can be tens of kelvin out and look fine.
          </Text>
          <Text size="sm" mt={6}>
            So <strong>500.012 K is a metrology-laboratory statement.</strong>
            {" "}What the same state reads on a plant is a different question
            with a different answer — and knowing which of the two you are
            holding, and roughly what it cost to get there, is the whole of the
            skill.
          </Text>
        </Box>

        <Box>
          <Title order={5}>8 · Where the boiling-point ladder ends — and what takes over</Title>
          <Text size="sm" mt={4}>
            The table stops at glycerol, and not because the list got boring.
            As molecules get heavier and more fragile, a normal boiling point
            becomes <strong>progressively less useful</strong>: many decompose
            at or before it, which is why heavy fractions are distilled under
            vacuum in the first place.  There is no wall — anthracene boils
            near 613 K, p-terphenyl above 660 K — but the further you go the
            fewer substances have a one-atmosphere boiling point worth
            marking a scale with.
          </Text>
          <Text size="sm" mt={6}>
            <strong>The official scale reaches the same conclusion by its own
            route.</strong>  Above the triple point of water, ITS-90’s defining
            fixed points are not boiling points at all — they are{" "}
            <strong>melting and freezing points of metals</strong> (gallium
            melts; the rest are freezing points), chosen because they are
            reproducible to microkelvin:
          </Text>
          <Box mt={8} style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%",
              fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${GRID}` }}>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>T [K]</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>fixed point</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>T [°C]</th>
                </tr>
              </thead>
              <tbody>
                {ITS90_ABOVE_WATER.map((f) => (
                  <tr key={f.what} style={{ borderBottom: `1px solid ${GRID}` }}>
                    <td style={{ padding: "4px 8px" }}>{f.T.toFixed(4)}</td>
                    <td style={{ padding: "4px 8px", color: INK }}>{f.what}</td>
                    <td style={{ padding: "4px 8px", textAlign: "right" }}>
                      {(f.T - 273.15).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
          <Text size="xs" c="dimmed" mt={6}>
            Declared, not computed — unlike every other number on this page.
            These are the ITS-90 values as universally quoted
            (Preston-Thomas, <em>Metrologia</em> 27 (1990) 3–10), not read
            back here against the BIPM text.
          </Text>
          <Text size="sm" mt={10}>
            Now read the bottom of that table again.  <strong>It stops at
            copper, {ITS90_TOP_K} K.</strong>  ITS-90 defines no fixed point
            above it.  Everything hotter is <strong>extrapolated</strong> —
            Planck radiation, referred back to silver, gold or copper.
          </Text>
        </Box>

        <Alert variant="light" color="orange"
          title="So how can anyone say platinum melts at 1768.3 °C?">
          <Text size="sm">
            They can say it.  They cannot say it to a tenth of a degree, and
            the reason is in the table you just read.  <strong>Platinum is not
            an ITS-90 fixed point.</strong>  At{" "}
            {T_PT_MELT_K.toFixed(2)} K it sits{" "}
            {(T_PT_MELT_K - ITS90_TOP_K).toFixed(0)} K above the highest one
            there is, deep in the extrapolated radiation region.  So its
            melting point is a <em>measurement made on the scale</em>, not a
            definition of it — and it inherits every uncertainty the
            extrapolation carries.
          </Text>
          <Text size="sm" mt={8}>
            How much it inherits is the arithmetic of the next section, applied
            one step higher.  The emissivity sensitivity λ·T / c₂ at 0.65 µm is{" "}
            <strong>{emissivitySensitivity(0.65, T_HOT_K).toFixed(3)}</strong>{" "}
            at {T_HOT_K.toFixed(0)} K and{" "}
            <strong>{emissivitySensitivity(0.65, T_PT_MELT_K).toFixed(3)}</strong>{" "}
            at {T_PT_MELT_K.toFixed(0)} K.  A scale that pays{" "}
            {emissivityBand_K(0.65, T_PT_MELT_K, 0.10).toFixed(0)} K for a 10 %
            error in an assumed emissivity is not handing anybody tenths of a
            degree.
          </Text>
          <Text size="sm" mt={8}>
            And a second thing the printed number does not carry: a melting
            point is <strong>impurity-sensitive</strong>.  “Pure platinum” is
            itself a claim about a sample, and parts per million move it
            measurably.
          </Text>
          <Text size="sm" mt={8}>
            <strong>So what should you conclude about the .3?</strong>  Not
            that it is meaningless — this page cannot say that, because it has
            not read the measurement that produced it.  What it can say is the
            useful thing: <strong>the value arrives with no uncertainty
            attached, and a digit is not an uncertainty.</strong>  Ask where it
            came from and what its budget was.  Careful work at these
            temperatures has been done; the number in front of you may well
            deserve its digits, or may not, and the quoted figure alone cannot
            tell you which.
          </Text>
          <Text size="xs" c="dimmed" mt={8}>
            No ± is quoted for platinum here: none has been read back from a
            primary source, and an invented one would be worse than none —
            which is also why this section stops at “ask for the budget”
            instead of declaring the last digit decorative.  The kelvin figures
            above are the arithmetic on this page and nothing more.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>9 · And what, exactly, is 1608.1 °C?</Title>
          <Text size="sm" mt={4}>
            That is {T_HOT_K.toFixed(2)} K — a cracker firebox, a reformer
            flame, an incinerator.  A real number off a real plant.  And look
            where it falls: <strong>above the silver point</strong>.  The
            platinum resistance thermometer of §6 has ended.  Nothing survives
            there, and ITS-90 stops using resistance for exactly that reason.
          </Text>
          <Text size="sm" mt={6}>
            What is left is <strong>radiation</strong>: Planck’s law, and a
            pyrometer looking at the thing.  Which is where the tenth of a
            degree dies.
          </Text>
          <Text size="sm" mt={6}>
            <strong>A pyrometer does not measure temperature.  It measures
            radiance.</strong>  To turn that into a temperature it must ASSUME
            an emissivity.  In a metrology laboratory that assumption can be
            made very good — a blackbody cavity, a characterised surface,
            ratio pyrometry — and radiometric thermometry is a primary method.
            Pointed at a furnace refractory, a flame or an oxidised tube it is
            a different matter, and there the emissivity usually{" "}
            <strong>dominates the uncertainty</strong>.
          </Text>
          <Text size="sm" mt={6}>
            What that costs is computable, from Wien’s approximation to
            Planck:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="sm" ff="monospace">
              ΔT / T ≈ (λ·T / c₂) · (Δε / ε)
            </Text>
          </Box>
          <Text size="sm">
            At {T_HOT_K.toFixed(0)} K with a narrow band at λ = 0.65 µm and
            c₂ = {C2_UM_K} µm·K, that factor is{" "}
            <strong>{emissivitySensitivity(0.65, T_HOT_K).toFixed(3)}</strong>.
            So a <strong>10 % error in the emissivity you guessed</strong> puts{" "}
            <strong>{emissivityBand_K(0.65, T_HOT_K, 0.10).toFixed(0)} K</strong>{" "}
            on the answer.
          </Text>
          <Text size="sm" mt={6}>
            So <strong>if</strong> the emissivity of that target is uncertain
            by 10 % relative, <strong>this geometry alone</strong> puts about{" "}
            {emissivityBand_K(0.65, T_HOT_K, 0.10).toFixed(0)} K on the answer.
            That is a worked example, not a verdict on every pyrometer: change
            the wavelength, the target or the method and the number changes
            with it.  What does not change is the shape of it — at these
            temperatures the emissivity you assumed is usually the biggest
            term in your budget, and a tenth of a degree written after a
            radiance measurement is asserting something the measurement did not
            establish.
          </Text>
        </Box>

        <Alert variant="light" title="A second epigraph, and the same warning">
          <Text size="sm" fs="italic">
            “The physicist can never subject an isolated hypothesis to
            experimental test, but only a whole group of hypotheses.”
          </Text>
          <Text size="xs" mt={6} c="dimmed">
            Pierre Duhem, <em>La Théorie Physique: Son Objet, Sa Structure</em>
            {" "}(1906).  The thesis is certainly Duhem’s; this English
            wording is one of several translations and has not been checked
            against a specific edition.
          </Text>
          <Text size="sm" mt={8}>
            <strong>Reading a pyrometer is that thesis, made of metal.</strong>
            {" "}You never measure the temperature.  You measure a radiance, and
            to get a number out you carry Planck’s law, an assumed emissivity,
            the transmission of a dirty window and the geometry of a sight path
            — all at once.  When the answer comes out wrong,{" "}
            <strong>nothing tells you which of them failed.</strong>
          </Text>
          <Text size="sm" mt={6}>
            The deeper form of the problem is older than the pyrometer and has
            a modern book of its own: Hasok Chang, <em>Inventing
            Temperature</em> (2004), on what he calls the <strong>problem of
            nomic measurement</strong> — to check that a thermometer reads
            truly you need a way of knowing the temperature, which is the thing
            the thermometer was for.  <strong>§10 takes it up.</strong>
          </Text>
        </Alert>

        <Box>
          <Title order={5}>The asymmetry, which is the surprise</Title>
          <Text size="sm" mt={4}>
            You might expect the engineer’s range to poke out of the platinum
            resistor at both ends.  It does not.  <strong>The cold end does
            not escape at all</strong>: liquid hydrogen at 20.39 K sits above
            13.8033 K, so the coldest thing in this whole tool is still
            interpolated by the same instrument as a distillation column.
          </Text>
          <Text size="sm" mt={6}>
            <strong>Only the hot end leaves.</strong>  Above 1234.93 K there is
            no resistor and no fixed point, and the physics changes completely
            — which is why {T_HOT_C} °C got a section of its own and 20 K did
            not.
          </Text>
          <Text size="sm" mt={6}>
            That is the shape worth carrying: not “thermometry breaks at both
            extremes”, but <strong>one instrument covers almost everything you
            will ever do, and the exception is at the top</strong>.  What an
            engineer owes a number is knowing which side of 1234.93 K it came
            from.
          </Text>
        </Box>

        <Alert variant="light" color="gray" title="Nothing to drag here">
          <Text size="xs">
            Every other number on this page is an engine run; this one is
            arithmetic, printed with its constants so you can redo it yourself
            on paper.  Do that once — it is three multiplications — and the
            number stops being something you were told.
          </Text>
        </Alert>

        <Alert variant="light" title="The dogma, stated rather than buried">
          <Text size="sm">
            The ideal gas is not a substance.  It is a <strong>limit</strong>.
            A gas thermometer reads thermodynamic temperature only as{" "}
            <em>P → 0</em> — that is, only where you cannot actually take a
            measurement.  Every real reading is an extrapolation towards a place
            no experiment reaches.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>10 · So what IS a temperature, taken whole?</Title>
          <Text size="sm" mt={4}>
            §1 said what temperature <em>is</em>, and that answer stands: an
            intensive variable defined by thermal equilibrium, needing no
            instrument.  This section is about the other thing — the number.
            <strong> A reported temperature measurement is not a fact read off
            nature.  It is a position inside a system of measurements,
            instruments, fixed points and theories that hold each other
            up.</strong>  Nothing in that system is self-justifying.  It works
            anyway, and understanding <em>how</em> it works anyway is the whole
            of the skill.
          </Text>
          <Text size="sm" mt={6}>
            That is the argument of the book this page has been circling since
            §9: {CHANG_CITATION}.  Its spine is{" "}
            <strong>four circles</strong> — four moments where the thing you
            would need in order to justify a measurement <em>is</em> the thing
            the measurement was for — and, crucially, the four escapes that
            were actually found.
          </Text>

          <Box my={10} px="sm" py={8} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="sm" fs="italic">
              “Now, when it is desired to determine the magnitude of some high
              temperature, the target emissivity is established using a
              reflected laser beam, the temperature is measured by an
              infrared-sensing, two-colour pyrometer, information is
              automatically logged into a computer data bank, and the engineer
              in charge gives no thought to the possibility that it might not
              always have been done this way.”
            </Text>
            <Text size="xs" c="dimmed" mt={6}>
              J. W. Matousek, “Temperature Measurements in Olden Tymes” (1990),
              as quoted by Chang at the head of his chapter 3.  He is
              describing §9 of this page, and the last clause is the reason
              this section exists.
            </Text>
          </Box>

          {CHANG_CIRCLES.map((c) => (
            <Box key={c.ch} mt={12} px="sm" py={8}
              style={{ borderLeft: `3px solid ${ACCENT}` }}>
              <Text size="sm" fw={700}>
                Circle {c.ch} · {c.title}
              </Text>
              <Text size="sm" mt={4}>{c.circle}</Text>
              <Text size="sm" mt={6}>
                <strong>The way out — </strong>{c.escape}
              </Text>
            </Box>
          ))}

          <Text size="sm" mt={14}>
            And the synthesis, which is Chang’s chapter 5.  Measurement is
            where <strong>foundationalism</strong> — the idea that knowledge
            rests on self-justifying bedrock — fails most visibly, because
            empirical science needs observations that depend on theories while
            empiricism demands that theories be justified by observations.  His
            answer is not to escape the circle but to accept it:{" "}
            <strong>justification in empirical science is coherentist</strong>,
            and progress happens by <strong>epistemic iteration</strong> —
            adopt the existing system with respect but without assurance, work
            with it, and let it correct itself.
          </Text>
          <Text size="sm" mt={6}>
            Note what that is <em>not</em>: it is not relativism, and it is not
            “anything goes”.  The system is savagely constrained — by
            comparability, by convergence, by every instrument having to agree
            with every other.  It simply is not constrained <em>from
            underneath</em>.
          </Text>
        </Box>

        <Alert variant="light" color="orange"
          title="Why this is not a philosophy digression — read this page again">
          <Text size="sm">
            Every circle above has already happened to you, in this tool, in
            numbers the engine produced:
          </Text>
          <Text size="sm" mt={8}>
            <strong>Circle 1 is §5’s water rung</strong> — though not in the
            way it first looks.  Chang’s first chapter is about a fixed point
            that would not stay fixed; what this page found is a{" "}
            <em>record</em> that will not agree with itself, its Antoine
            coefficients putting the boiling point 0.70 K from the value the
            same file declares.  Different failure, same moral: the datum
            everybody is surest of is the one nobody had ever asked twice.
          </Text>
          <Text size="sm" mt={8}>
            <strong>Circle 2 is the glycerol rung.</strong>  We cannot check a
            vapour-pressure correlation against the truth; we have no truth to
            check it against.  What we CAN do is exactly Regnault’s move — ask
            whether the record <em>agrees with itself</em>, by evaluating its
            own correlation at its own declared boiling point.  It missed by a
            factor of 19.  <strong>Comparability caught it without anybody
            knowing the right answer</strong>, which is the entire point of the
            criterion.
          </Text>
          <Text size="sm" mt={8}>
            <strong>Circle 3 is §6 and §8.</strong>  Four instruments handed
            over in turn, and a scale assembled where each ends — not one
            method validated against a standard, but a standard built out of
            agreement.  Wedgwood’s kiln is §9’s pyrometer with worse hardware.
          </Text>
          <Text size="sm" mt={8}>
            <strong>Circle 4 is every solver in this simulator.</strong>  A
            Newton iteration starts from a guess nobody justified, and the
            answer corrects the guess.  Choupo’s refusal to hide that guess —{" "}
            <em>no silent crutch</em> — is epistemic iteration with the
            iteration left visible.
          </Text>
        </Alert>

        <Alert variant="light" title="And the sentence to take to the exam">
          <Text size="sm">
            When someone asks what the reported value 500.012 K — or
            1608.1 °C, or 1768.3 °C — <em>means</em>, the honest answer is not
            the number and not the definition.  It is:{" "}
            <strong>“that is where this state sits on a scale realised by
            these instruments, between these fixed points, under these
            assumptions; here is its uncertainty and how it was obtained; and
            here is which of those assumptions I would doubt first.”</strong>
            {" "}An engineer who can say that owns the number.  An engineer who
            can only repeat it does not.
          </Text>
          <Text size="xs" c="dimmed" mt={8}>
            Chang calls this way of working <em>complementary science</em>:
            asking the scientific questions that specialist science has stopped
            asking, by re-examining what everyone already accepts.  He warns
            that when belief goes unquestioned it becomes “a substitute for
            genuine understanding”.  That is what this tool is for, and the
            debt is his.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>What this page is not</Title>
          <Text size="xs" c={INK} mt={4}>
            • SRK is not the truth about nitrogen.  It establishes that Z leaves
            1 and roughly by how much — not the third decimal of that.  A better
            equation moves the number and leaves the argument alone.
            <br />• No number here is compared with a measurement: the corpus
            holds no primary Z data for nitrogen, so this is a structural
            witness and says so.
            <br />• The ITS-90 differences are given as an order of magnitude,
            never a value.  The tabulated figure is a published number this
            repository has not read back against its source, and inventing a
            citation is worse than admitting a gap.
            <br />• 500.012 K is arbitrary.  What is not arbitrary is that it
            has three digits after the point.
            <br />• §10 is a compression of Chang’s book — four chapters and a
            philosophical synthesis in one screen.  The history in it
            (Cavendish on boiling, Regnault on comparability, Wedgwood’s clay,
            Peirce on self-correcting reasoning) is his, quoted short and
            attributed.  Read the book.
          </Text>
        </Box>

        <Text size="xs" c={TEXT} mt="xs">
          Runs tutorials/{TEMPERATURE_WITNESS} in your browser.  Nothing on this
          page is computed in the page: every Z is the engine’s.
        </Text>
      </Stack>
    </Box>
  );
}

export default WhatIsTemperatureTool;
