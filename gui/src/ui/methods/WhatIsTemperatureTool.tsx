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
            Write one down: <strong>500.012 K</strong>.  What does the “012”
            assert?  Three digits past the point is a specific claim about the
            world.  Whose claim, and resting on what?
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
          <Title order={5}>1 · The definition, and it is a decree</Title>
          <Text size="sm" mt={4}>
            Since 2019 the kelvin is not defined by any substance.  It is
            defined by <em>fixing</em> the Boltzmann constant at exactly{" "}
            <strong>1.380649 × 10⁻²³ J/K</strong>.  Not measured — fixed.  A
            temperature is therefore a conversion factor between energy and
            degrees, and nothing else.
          </Text>
          <Text size="sm" mt={6}>
            The triple point of water, which <em>defined</em> the kelvin for
            sixty-five years, became overnight a quantity that is{" "}
            <strong>measured</strong>, with an uncertainty.  Sit with that: the
            definition tells you what a kelvin means and gives you no way
            whatsoever to measure one.
          </Text>
        </Box>

        <Box>
          <Title order={5}>2 · The realisation, which is a different thing</Title>
          <Text size="sm" mt={4}>
            Nobody puts the Boltzmann constant inside a thermometer.  Reading a
            temperature needs a chain of reproducible fixed points and an
            instrument that interpolates between them — in practice ITS-90,
            with a platinum resistance thermometer doing the interpolating.  At
            500 K you sit between the triple point of water and the freezing
            point of zinc.
          </Text>
          <Text size="sm" mt={6}>
            The practical scale and the thermodynamic temperature{" "}
            <strong>are not the same number</strong>.  They differ by a few
            millikelvin in this region — known, tabulated, revised as
            measurements improve.  So the “012” is a statement about a platinum
            resistor and a chain of fixed points.  It is not a statement about
            nature.
          </Text>
        </Box>

        <Box>
          <Title order={5}>3 · The bridge, and where it breaks</Title>
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
          <Title order={5}>4 · So what range does this actually matter over?</Title>
          <Text size="sm" mt={4}>
            Not all of them.  A chemical engineer works between roughly{" "}
            <strong>20 K and 2300 K</strong> — liquid hydrogen at the bottom, a
            fired heater or a flare at the top.  Two orders of magnitude, and
            that is the whole of it.
          </Text>
          <Text size="sm" mt={6}>
            Below that is cryogenic physics; above it is plasma.  Both are real
            and neither is ours, and saying so is worth more than a survey that
            pretends everything matters equally.  <strong>We are not doing
            nuclear physics here</strong>, and a page that hedged towards
            nanokelvin and fusion would teach a reader nothing about the plant
            they are going to design.
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
            <strong> Water does not.</strong>  Its Antoine fit declares a
            validity range ending at 373 K and its normal boiling point is
            373.15 K — the fit stops <em>0.15 K before the temperature everybody
            uses it at</em>, and evaluated there it returns 1.026 atm instead of
            1.000.
          </Text>
          <Text size="sm" mt={6}>
            The run says so without being asked:{" "}
            <code>[psat] component &apos;water&apos;: Antoine evaluated at
            T = 373.15 K, OUTSIDE its declared Trange (273 373).</code>
          </Text>
          <Text size="sm" mt={6}>
            Familiarity is not accuracy.  A declared validity range is worth
            more than a feeling.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>5 · How T is realised, across that range</Title>
          <Text size="sm" mt={4}>
            One scale covers essentially the whole of it — <strong>ITS-90</strong>,
            from 0.65 K to the copper point and above by radiation — but it is
            not one instrument.  It is four, each interpolating between fixed
            points, handed over where the previous one runs out:
          </Text>
          <Text size="sm" mt={6} component="div">
            <ul style={{ marginTop: 4, paddingLeft: 20 }}>
              <li>helium vapour pressure, at the very bottom;</li>
              <li>an interpolating constant-volume gas thermometer above it —
                the instrument §3 is about;</li>
              <li>the <strong>platinum resistance thermometer</strong> over the
                great middle, from the hydrogen triple point to the silver
                point.  <strong>Every temperature in the table above lives
                here</strong>;</li>
              <li>Planck’s radiation law above the silver point, where nothing
                can be touched.</li>
            </ul>
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
            The defining fixed-point VALUES are not quoted here.  They are
            published by the BIPM and this repository has not read them back
            against that source, and a citation invented is worse than a gap
            admitted.  What is stated above is the scale’s structure, not its
            table.
          </Text>
        </Box>

        <Box>
          <Title order={5}>6 · And your plant instrument is none of these</Title>
          <Text size="sm" mt={4}>
            Everything above is metrology.  The thing on your P&amp;ID is a
            thermocouple in a thermowell, and the chain from the definition to
            the number on the DCS screen loses <strong>orders of
            magnitude</strong> of precision at every handover: the scale is
            realised in a laboratory, a reference is calibrated against it, your
            instrument is calibrated against that, and then it is welded into a
            pipe and left there for five years.
          </Text>
          <Text size="sm" mt={6}>
            So <strong>500.012 K is a metrology-laboratory statement.</strong>
            {" "}A plant reading of the same state is 500 K give or take a
            couple — and knowing which of the two you are holding is the whole
            of the skill.
          </Text>
        </Box>

        <Box>
          <Title order={5}>6b · Where the boiling-point ladder ends — and what takes over</Title>
          <Text size="sm" mt={4}>
            The table stops at glycerol, and not because the list got boring.
            Above roughly <strong>600 K an ordinary organic cracks before it
            boils</strong>: there is no one-atmosphere equilibrium left to ask
            about, so there is no rung to check.  A normal boiling point simply
            runs out as a way of marking temperature.
          </Text>
          <Text size="sm" mt={6}>
            <strong>The official scale does exactly the same thing.</strong>
            {" "}Above the triple point of water, ITS-90’s defining fixed points
            are no longer boiling points at all — they are the{" "}
            <strong>freezing points of metals</strong>:
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
            DECLARED, not computed — unlike every other number on this page.
            These are the values of the International Temperature Scale of 1990
            as it is universally quoted (Preston-Thomas, <em>Metrologia</em> 27
            (1990) 3–10, with its erratum).  This repository has not read them
            back against the BIPM text, and says so rather than letting a table
            look measured.
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
            And there is a second thing the printed number hides: a melting
            point is <strong>impurity-sensitive</strong>.  “Pure platinum” is
            itself a claim, and parts per million move it measurably.  The
            value is a real, careful measurement of a real, careful sample.
            The <strong>.3</strong> is decoration.
          </Text>
          <Text size="xs" c="dimmed" mt={8}>
            No uncertainty figure is quoted for platinum here, deliberately.
            This repository has not read one back from a primary source, and an
            invented ± would be worse than the missing one: it would turn an
            honest gap into a false claim.  What IS shown is derived from this
            page’s own arithmetic.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>7 · And what, exactly, is 1608.1 °C?</Title>
          <Text size="sm" mt={4}>
            That is {T_HOT_K.toFixed(2)} K — a cracker firebox, a reformer
            flame, an incinerator.  A real number off a real plant.  And look
            where it falls: <strong>above the silver point</strong>.  The
            platinum resistance thermometer of §5 has ended.  Nothing survives
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
            an emissivity — and nobody knows the emissivity of a furnace
            refractory, a flame or an oxidised tube to better than about ±0.05.
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
            So {T_HOT_C} °C is, at best,{" "}
            <strong>
              {Math.round(T_HOT_C)} ± {emissivityBand_K(0.65, T_HOT_K, 0.10).toFixed(0)} °C
            </strong>.  The tenth of a degree is noise wearing the clothes of
            precision.
          </Text>
        </Box>

        <Alert variant="light" title="A second epigraph, and the same warning">
          <Text size="sm" fs="italic">
            “The physicist can never subject an isolated hypothesis to
            experimental test, but only a whole group of hypotheses.”
          </Text>
          <Text size="xs" mt={6} c="dimmed">
            Pierre Duhem, <em>La Théorie Physique: Son Objet, Sa Structure</em>
            {" "}(1906).  Marked exactly as the Sommerfeld one is: the thesis is
            certainly Duhem’s, the English wording here is one of several
            translations in circulation and this repository has not checked it
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
            the thermometer was for.  <strong>That book has now been read, and
            §8 below is what it says.</strong>  (This paragraph used to end
            “this repository has not read it back and quotes nothing from it”,
            which was true when it was written and stopped being true the day
            the book was opened.  A claim about what has been checked is the
            worst kind to leave standing after it expires.)
          </Text>
        </Alert>

        <Box>
          <Title order={5}>The symmetry, which is the whole answer</Title>
          <Text size="sm" mt={4}>
            At <strong>20 K</strong> and at <strong>{T_HOT_K.toFixed(0)} K</strong>
            {" "}you are outside the platinum resistor — on both sides.  The vast
            accurate middle, where ITS-90 is good to millikelvin, is where the
            engineer’s ordinary life happens; and{" "}
            <strong>both ends of the engineer’s own range are served by
            different physics</strong>.
          </Text>
          <Text size="sm" mt={6}>
            That is why “what is a temperature” has no single answer.  It has
            four, handed over in turn, and the honest thing an engineer can do
            is know which one is under the number they are holding.
          </Text>
        </Box>

        <Alert variant="light" color="gray"
          title="Why this section has no slider">
          <Text size="xs">
            Every other number on this page is an engine run.  This one is not:
            Choupo has no radiation-thermometry operation, so an interactive
            here would have to compute physics in the page — which this plane
            forbids, and for good reason.  The arithmetic is printed instead,
            with its constants, so a reader can redo it.  A missing interactive
            that says why is better than one that quietly breaks the rule.
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
          <Title order={5}>8 · So what IS a temperature, taken whole?</Title>
          <Text size="sm" mt={4}>
            Everything above is one instrument at a time.  Put them together
            and a different kind of answer appears — and it is not the one a
            textbook gives.  <strong>A temperature is not a fact you read off
            nature.  It is a position inside a system of measurements,
            instruments, fixed points and theories that hold each other
            up.</strong>  Nothing in that system is self-justifying.  It works
            anyway, and understanding <em>how</em> it works anyway is the whole
            of the skill.
          </Text>
          <Text size="sm" mt={6}>
            That is the argument of the book this page has been circling since
            §7: {CHANG_CITATION}.  It has now been read.  Its spine is{" "}
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
              describing §7 of this page, and the last clause is the reason
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
            <strong>Circle 1 is §4’s water rung.</strong>  Water refuses to
            boil at the boiling point — Chang’s whole first chapter — and it
            refused again here, 250 years later, inside an Antoine fit that
            stops 0.15 K short and answers 1.026 atm.  The fixed point is still
            not as fixed as the schoolroom says.
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
            <strong>Circle 3 is §5 and §6b.</strong>  Four instruments handed
            over in turn, and a scale assembled where each ends — not one
            method validated against a standard, but a standard built out of
            agreement.  Wedgwood’s kiln is §7’s pyrometer with worse hardware.
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
            When someone asks what 500.012 K, or 1608.1 °C, or 1768.3 °C
            <em>is</em>, the honest answer is not a number and not a
            definition.  It is: <strong>“that is where this state sits in a
            scale realised by these instruments, between these fixed points,
            under these assumptions — and here is which of them I would doubt
            first.”</strong>  An engineer who can say that owns the number.  An
            engineer who can only repeat it does not.
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
            <br />• §8 summarises Chang’s book, read from a copy supplied by
            this project’s author.  The reading of it is mine and the
            compression is severe: four chapters and a philosophical synthesis
            in a screen.  Quotations are short and attributed; the historical
            claims (Cavendish on boiling, Regnault on comparability, Wedgwood’s
            clay, Peirce on self-correcting reasoning) are Chang’s reporting,
            not this repository’s independent scholarship.  Read the book.
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
