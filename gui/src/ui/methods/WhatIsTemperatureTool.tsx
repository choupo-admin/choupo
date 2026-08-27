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

import { useMemo, useState } from "react";
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

/** The second witness: the ladder of normal boiling points, verified. */
export const LADDER_WITNESS = "props/thermo/temperature02_engineers_ladder";

/** One rung, as the page reads it out of the run's own diagnostics.  The
 *  labels are what the substance IS on a plant, which is the half a reader
 *  needs and a formula cannot supply; the NUMBERS are all the engine's. */
export const LADDER: readonly { op: string; comp: string; T: number; what: string }[] = [
  { op: "rung_H2",    comp: "H2",    T: 20.39,  what: "liquid hydrogen" },
  { op: "rung_neon",  comp: "neon",  T: 27.10,  what: "neon" },
  { op: "rung_N2",    comp: "N2",    T: 77.35,  what: "liquid nitrogen — air separation" },
  { op: "rung_Ar",    comp: "Ar",    T: 87.30,  what: "argon" },
  { op: "rung_O2",    comp: "O2",    T: 90.17,  what: "liquid oxygen" },
  { op: "rung_CH4",   comp: "CH4",   T: 111.66, what: "LNG" },
  { op: "rung_C2H4",  comp: "C2H4",  T: 169.42, what: "cryogenic ethylene" },
  { op: "rung_water", comp: "water", T: 373.15, what: "water at one atmosphere" },
];

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
            Here is the bottom half of that range, and the engine checks it
            rather than quoting it.  Each row asks one question: at the
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
                    <tr key={r.op} style={{ borderBottom: `1px solid ${GRID}` }}>
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
