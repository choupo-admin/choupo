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
  THE DEEP DIVE behind "What is a temperature?" -- split out 2026-08-29 on
  the owner's pedagogical ruling: the main page installs ONE mental model in
  10-15 minutes, and nobody should have to cross the philosophy of science
  before learning to interrogate a Pt100.  The reader who WANTS the
  epistemology comes here, and gets it whole.

  ONE question: how do we know a thermometer is right?  Answered in three
  movements -- the instrument that historically bridged definition and
  measurement (the gas thermometer, solved live by the engine in the
  reader's browser); the scale that dissemination actually runs on (ITS-90's
  own fixed points, and what happens above the last one); and the
  epistemological story (Regnault, Wedgwood, Duhem, and Hasok Chang's
  Inventing Temperature), which is not a digression, because the reader has
  just watched every one of its circles happen in the two engine-run pages.

  DELETED FROM THE OLD VERSION, by ruling, and recorded so it is not
  innocently reintroduced: the analogy equating a numerical solver's initial
  guess with Chang's epistemic iteration.  It was literarily neat and
  conceptually dangerous -- a numerical seed and the epistemology of
  measurement are not the same thing, and an elegant analogy that can
  install a wrong association is worse than none.  (The page's own test
  bans the analogy's wording outright, this comment included.)

  ZERO PHYSICS IN TYPESCRIPT: every compressibility factor is an engine run
  of `props/thermo/temperature01_gas_thermometer` in the reader's own
  browser; the pressure knob rewrites the case's own scan bound and the
  engine re-answers.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Badge, Box, Group, Loader, Slider, Stack, Text, Title }
  from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import { KnobField } from "./knobPanel.js";
import { T_SUBJECT_K } from "./WhatIsTemperatureTool.js";

const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";

/** The bundled tutorial this page runs in the browser. */
export const TEMPERATURE_WITNESS = "props/thermo/temperature01_gas_thermometer";
const PROPS_DICT = "system/propsDict";

/** ITS-90's own defining fixed points ABOVE the triple point of water --
 *  DECLARED, not computed here, and marked as such wherever they are shown.
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
 *  extrapolated Planck radiation -- the reason a melting point quoted above
 *  here cannot carry the precision it is usually printed with. */
export const ITS90_TOP_K = 1357.77;

/** Platinum's melting point, as it is usually quoted.  It is NOT an ITS-90
 *  fixed point: it is a measurement made ON the scale, in the extrapolated
 *  radiation region. */
export const T_PT_MELT_C = 1768.3;
export const T_PT_MELT_K = T_PT_MELT_C + 273.15;

/** Chang's four historical episodes are four CIRCLES: in each, the thing you
 *  would need in order to justify a measurement is the thing the measurement
 *  was for.  Each carries the escape that was actually found -- which is the
 *  point, because a page that only posed the circularity would leave a
 *  reader with scepticism instead of an engineering practice. */
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
      <line x1={ML} y1={Y(1)} x2={PW - MR} y2={Y(1)} stroke={GRID}
        strokeWidth={1.4} strokeDasharray="5 4" />
      <text x={PW - MR} y={Y(1) - 6} textAnchor="end" fontSize={10} fill={INK}>
        Z = 1 · the ideal gas
      </text>
      <path d={path} fill="none" stroke={ACCENT} strokeWidth={2} />
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

export function ThermometerTrustTool(): JSX.Element {
  const [pMaxMPa, setPMaxMPa] = useState(5);

  //  `occurrence` IS 1-BASED (methodRun's `locate`) -- the history of this
  //  knob shipping broken at 0 is recorded in the main page's own test.
  const overrides = useMemo(() => [{
    file: PROPS_DICT, key: "to", value: pMaxMPa * 1e6,
    occurrence: 1,
  }], [pMaxMPa]);

  const run = useMethodRun(TEMPERATURE_WITNESS, overrides,
    String(pMaxMPa), "choupoProps");
  const rows = useMemo(
    () => readZScan(run.result?.csvFiles?.["gasThermometer.csv"] ?? ""),
    [run.result]);
  const worst = worstDeparturePct(rows);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 760, margin: "0 auto" }}>

        <Box>
          <Title order={3}>How do we know a thermometer is right?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The main page (<em>What is a temperature?</em>) installs the
            chain: STATE → T → scale → sensor → signal → model → reported
            value ± uncertainty.  This page asks the question that chain
            quietly begs.  To check a thermometer you need to know the
            temperature — which is what the thermometer was for.  How did
            anyone ever get out of that circle?
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
          <Title order={5}>1 · The bridge instrument, and where it breaks</Title>
          <Text size="sm" mt={4}>
            Thermodynamic temperature was historically got at with a
            constant-volume gas thermometer: hold the volume, measure the
            pressure, and read the temperature off the gas law:
          </Text>
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="sm" ff="monospace">
              T = P·v / R        (exact only in the limit P → 0)
            </Text>
          </Box>
          <Text size="sm">
            Except no real gas obeys that.  Below is nitrogen at{" "}
            {T_SUBJECT_K} K, solved in your browser by the same engine that
            runs the simulator — drag the knob and watch the equation of
            state answer: Z = Pv/RT leaves 1 the moment the pressure is real,
            and the reading with it.
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

        <Alert variant="light" title="The dogma, stated rather than buried">
          <Text size="sm">
            The ideal gas is not a substance.  It is a <strong>limit</strong>.
            A gas thermometer reads thermodynamic temperature only as{" "}
            <em>P → 0</em> — that is, only where you cannot actually take a
            measurement.  Every real reading is an extrapolation towards a
            place no experiment reaches.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>2 · How T₉₀ is realised, across the whole range</Title>
          <Text size="sm" mt={4}>
            One scale covers essentially all of practical thermometry —{" "}
            <strong>ITS-90</strong>, from 0.65 K upwards — but it is not one
            instrument.  It is four, each interpolating between fixed points,
            and they <strong>overlap</strong> rather than meeting at points:
          </Text>
          <Text size="sm" mt={6} component="div">
            <ul style={{ marginTop: 4, paddingLeft: 20 }}>
              <li>helium vapour pressure, <strong>0.65 – 5 K</strong>;</li>
              <li>an interpolating constant-volume gas thermometer,{" "}
                <strong>3 – 24.5561 K</strong> — the instrument of §1;</li>
              <li>the <strong>platinum resistance thermometer</strong> over the
                great middle, <strong>13.8033 K (the hydrogen triple point) to
                1234.93 K (the silver point)</strong> — where essentially all
                of chemical processing lives;</li>
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
            Above the triple point of water, the defining fixed points are
            melting and freezing points of metals, chosen because they are
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
            Declared, not computed — unlike the plot above.  These are the
            ITS-90 values as universally quoted (Preston-Thomas,{" "}
            <em>Metrologia</em> 27 (1990) 3–10), not read back here against
            the BIPM text.
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
            extrapolation carries, the assumed emissivity first among them
            (the main page works that arithmetic).
          </Text>
          <Text size="sm" mt={8}>
            And a second thing the printed number does not carry: a melting
            point is <strong>impurity-sensitive</strong>.  “Pure platinum” is
            itself a claim about a sample, and parts per million move it
            measurably.
          </Text>
          <Text size="xs" c="dimmed" mt={8}>
            No ± is quoted for platinum here: none has been read back from a
            primary source, and an invented one would be worse than none.
            Careful work at these temperatures has been done; the number may
            well deserve its digits, or may not, and the quoted figure alone
            cannot tell you which.  Ask where it came from and what its
            budget was.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>3 · The asymmetry, which is the surprise</Title>
          <Text size="sm" mt={4}>
            You might expect process temperatures to poke out of the platinum
            resistor at both ends.  They do not.  <strong>The cold end does
            not escape at all</strong>: liquid hydrogen at 20.39 K sits above
            13.8033 K, so a hydrogen liquefier is still interpolated by the
            same instrument as a distillation column.{"  "}
            <strong>Only the hot end leaves.</strong>  Above 1234.93 K there
            is no RESISTOR — the platinum thermometer stops at silver and
            the scale becomes Planck radiation, referred back to the silver,
            gold or copper point.  Above copper ({ITS90_TOP_K} K) there is no
            defining fixed point at all, and the physics changes completely.  What an engineer owes a number is knowing which side
            of the silver point it came from.
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
            {" "}You never measure the temperature.  You measure a radiance,
            and to get a number out you carry Planck’s law, an assumed
            emissivity, the transmission of a dirty window and the geometry of
            a sight path — all at once.  When the answer comes out wrong,{" "}
            <strong>nothing tells you which of them failed.</strong>
          </Text>
        </Alert>

        <Box>
          <Title order={5}>4 · The four circles, and the four ways out</Title>
          <Text size="sm" mt={4}>
            The deeper form of the problem is older than the pyrometer and has
            a modern book of its own: {CHANG_CITATION}.  Its spine is{" "}
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
              as quoted by Chang at the head of his chapter 3.  The last
              clause is the reason this page exists.
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
            empiricism demands that theories be justified by observations.
            His answer is not to escape the circle but to accept it:{" "}
            <strong>justification in empirical science is coherentist</strong>,
            and progress happens by <strong>epistemic iteration</strong> —
            adopt the existing system with respect but without assurance, work
            with it, and let it correct itself.
          </Text>
          <Text size="sm" mt={6}>
            Note what that is <em>not</em>: it is not relativism, and it is
            not “anything goes”.  The system is savagely constrained — by
            comparability, by convergence, by every instrument having to agree
            with every other.  It simply is not constrained <em>from
            underneath</em>.
          </Text>
        </Box>

        <Alert variant="light" color="orange"
          title="Why this is not a philosophy digression">
          <Text size="sm">
            Two of the circles have already happened to you, in this
            simulator, in numbers the engine produced.  <em>When a property
            database lies to you</em> finds a water record whose Antoine
            coefficients put its boiling point 0.70 K from the value the same
            file declares — Circle 1’s moral, that the datum everybody is
            surest of is the one nobody had ever asked twice.  And its
            glycerol rung is Circle 2’s move exactly: nobody knows the
            “true” vapour pressure, but <strong>comparability</strong> —
            asking whether the record agrees <em>with itself</em> — caught a
            factor-of-19 miss without anybody knowing the right answer.
            Circle 3 is §2 of this page: a scale assembled out of the
            agreement of overlapping instruments, not validated against a
            standard that was never there.
          </Text>
        </Alert>

        <Alert variant="light" title="And the sentence to take away">
          <Text size="sm">
            A thermometer is never right by itself.  It is right the way a
            witness is credible — by agreeing with itself, agreeing with
            others, and being cross-examined.{"  "}
            <strong>Comparability, convergence, iteration</strong>: those are
            the three tests, they are three hundred years old, and every gate
            in this simulator’s own test suite is one of them wearing work
            clothes.
          </Text>
          <Text size="xs" c="dimmed" mt={8}>
            Chang calls this way of working <em>complementary science</em>:
            asking the scientific questions that specialist science has
            stopped asking, by re-examining what everyone already accepts.  He
            warns that when belief goes unquestioned it becomes “a substitute
            for genuine understanding”.  That is what this page is for, and
            the debt is his.
          </Text>
        </Alert>

        <Box>
          <Title order={5}>What this page is not</Title>
          <Text size="xs" c={INK} mt={4}>
            • SRK is not the truth about nitrogen.  It establishes that Z
            leaves 1 and roughly by how much — not the third decimal of that.
            A better equation moves the number and leaves the argument alone.
            <br />• No number here is compared with a measurement: the corpus
            holds no primary Z data for nitrogen, so the plot is a structural
            witness and says so.
            <br />• §4 is a compression of Chang’s book — four chapters and a
            philosophical synthesis in one screen.  The history in it
            (Cavendish on boiling, Regnault on comparability, Wedgwood’s clay,
            Peirce on self-correcting reasoning) is his, quoted short and
            attributed.  Read the book.
          </Text>
        </Box>

        <Text size="xs" c={TEXT} mt="xs">
          Runs tutorials/{TEMPERATURE_WITNESS} in your browser.  Every Z on
          this page is the engine’s; the fixed-point table is declared and
          marked as such.
        </Text>
      </Stack>
    </Box>
  );
}

export default ThermometerTrustTool;
