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

  const overrides = useMemo(() => [{
    file: PROPS_DICT, key: "to", value: pMaxMPa * 1e6,
    occurrence: 0,
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
