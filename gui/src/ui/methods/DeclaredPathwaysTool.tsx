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
  DeclaredPathwaysTool -- equilibrium, but only along the reactions you
  declare possible (commission C11, 2026-09-27).

  THE PAGE IS A SCROLLING LESSON on the shape of its two companions
  (`approach-to-equilibrium`, `equilibrium-landscapes`): steps 1-3 earn the
  interactive, step 4 names the second knob, step 5 and the limits close.

  THE DATA PATH.  ONE bundled witness,
  tutorials/steady/reactors/equil02_methanol_declared_pathways, run in the
  browser on the WASM build of `choupoSolve` through `useMethodRun` -- one
  run gives all three answers, because the case splits one syngas to three
  equilibrium reactors: `gibbs` (every species), `complete` (all three
  independent reactions declared) and `declared` (methanation left off the
  list).  The approach slider writes the NUMBER of the `temperatureApproach
  0;` the witness declares on `declared` (methodRun can replace a declared
  scalar and cannot add a key, which is why the key is declared at zero);
  the temperature slider writes the three reactors' `T` and the feed's,
  held together.

  ZERO PHYSICS IN TYPESCRIPT.  Every number on the panel is the engine's: the
  outlet mole fractions come from the result's stream table, the conversion,
  the Kp and the `T_Kp_<name>` evaluation temperatures from the declared
  reactor's KPI row.  The page forms no conversion, reads no enthalpy and
  decides no sign; the only arithmetic is one subtraction (T_Kp − T) to say
  which side of T each reaction's K was taken on.

  MEASURED on the native build before this file was written (2026-09-27):

      525 K, 50 bar, no approach
        gibbs     y_CH4 0.451305381529   y_methanol 1.75947464097e-10
        complete  y_CH4 0.451305381529   y_methanol 1.75947464088e-10
        declared  conversion_methanolSynthesis 0.609773723464, y_CH4 0
      525 K, temperatureApproach 20
        declared  T_Kp_methanolSynthesis 545, T_Kp_waterGasShift 505,
                  conversion_methanolSynthesis 0.442082369415
      625 K: declared conversion 0.0565289611462; gibbs y_CH4 0.446936366161
      the corners 525/625 K x 0/50 K all run; 500 K does not (the complete
      set's Newton stalls -- the lesson's limits say so).
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Group, Loader, Stack, Table, Text, Title,
} from "@mantine/core";

import { useMethodRun, type DictOverride } from "../../case/methodRun.js";
import type { RunResult } from "../../adapters/SolverAdapter.js";
import { KnobSlider, PanelNote, type PanelKnob } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { PATHWAYS_LIMITS, PATHWAYS_STEPS } from "./declaredPathwaysLesson.js";
import { setActiveMethodTool } from "./registry.js";

/** The bundled witness (no leading `tutorials/`). */
export const PATHWAYS_WITNESS =
  "steady/reactors/equil02_methanol_declared_pathways";

/** The three reactors of the witness, in the order the lesson reads them:
 *  every pathway open, every independent reaction declared, one closed. */
export interface PathwayColumn {
  unit: string;
  stream: string;
  label: string;
  what: string;
}

export const PATHWAY_COLUMNS: readonly PathwayColumn[] = [
  { unit: "gibbs", stream: "outGibbs", label: "Gibbs",
    what: "every species, no reaction declared" },
  { unit: "complete", stream: "outComplete", label: "all three reactions",
    what: "methanol synthesis + shift + methanation" },
  { unit: "declared", stream: "outDeclared", label: "methanation excluded",
    what: "methanol synthesis + shift only" },
];

/** The species the table shows, in the order the lesson talks about them. */
export const PATHWAY_SPECIES: readonly string[] =
  ["methanol", "CH4", "water", "CO", "CO2", "H2"];

/** The reactions the `declared` reactor carries (its KPI suffixes). */
export const DECLARED_REACTIONS: readonly string[] =
  ["methanolSynthesis", "waterGasShift"];

/** The dict scalars one run writes.  `T` appears three times in the
 *  flowsheet (gibbs, declared, complete -- in that order) and once in the
 *  feed; every slot declares `K`, and the unit is ASSERTED rather than
 *  assumed -- methodRun refuses a mismatch by name.  The approach slot is a
 *  bare number, as the engine reads it. */
export function pathwaysOverrides(T_K: number, dT_K: number): DictOverride[] {
  return [
    { file: "system/flowsheetDict", key: "T", value: T_K, unit: "K", occurrence: 1 },
    { file: "system/flowsheetDict", key: "T", value: T_K, unit: "K", occurrence: 2 },
    { file: "system/flowsheetDict", key: "T", value: T_K, unit: "K", occurrence: 3 },
    { file: "0/feed", key: "T", value: T_K, unit: "K" },
    { file: "system/flowsheetDict", key: "temperatureApproach", value: dT_K, unit: "" },
  ];
}

/** Which side of T a reaction's K was taken on -- one subtraction between
 *  two engine numbers, and the only arithmetic on this page. */
export function sideOf(T_Kp: number | null, T: number): "above" | "below" | "at" | null {
  if (T_Kp === null) return null;
  if (T_Kp > T) return "above";
  if (T_Kp < T) return "below";
  return "at";
}

export const T_KNOB: PanelKnob = {
  id: "T", label: "reactor temperature T — all three reactors",
  min: 525, max: 625, step: 25, unit: "K",
  why: "The physical temperature, held by every reactor.  The Gibbs column "
    + "stays methane across the range; watch what the declared column does.  "
    + "The slider stops at 525 K because at 500 K the complete set's Newton "
    + "stalls (the limits below say so).",
};

export const DT_KNOB: PanelKnob = {
  id: "dT", label: "approach |ΔT| on the declared reactor — a MAGNITUDE",
  min: 0, max: 50, step: 5, unit: "K",
  why: "You declare only how far short of equilibrium the bed sits.  The "
    + "engine gives each declared reaction its own sign from the way it "
    + "RUNS: methanol synthesis runs forward and is exothermic, so its K is "
    + "taken above T; the shift runs backward here, so its K is taken below.",
};

function fmtY(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  return Math.abs(v) >= 1e-3 ? v.toFixed(4) : v.toExponential(2);
}

function compositionOf(r: RunResult | null, stream: string):
  { [c: string]: number } | null {
  const s = r?.streams.find((x) => x.name === stream);
  return s ? s.composition : null;
}

export function DeclaredPathwaysTool(): JSX.Element {
  const [T, setT] = useState(T_KNOB.min);
  const [dT, setDT] = useState(0);

  const ov = useMemo(() => pathwaysOverrides(T, dT), [T, dT]);
  const run = useMethodRun(PATHWAYS_WITNESS, ov, JSON.stringify([T, dT]),
    "choupoSolve");
  const r = run.result;
  const decl = r?.kpis?.["declared"] ?? null;
  const pick = (key: string): number | null => {
    const v = decl?.[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const conversion = pick("conversion_methanolSynthesis");

  const step = lessonStepper(PATHWAYS_STEPS);

  const table = (
    <Table striped withTableBorder withColumnBorders fz="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>outlet mole fraction</Table.Th>
          {PATHWAY_COLUMNS.map((c) => (
            <Table.Th key={c.unit}>
              {c.label}
              <Text size="xs" c="dimmed" fw={400}>{c.what}</Text>
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {PATHWAY_SPECIES.map((sp) => (
          <Table.Tr key={sp}>
            <Table.Td>{sp}</Table.Td>
            {PATHWAY_COLUMNS.map((c) => (
              <Table.Td key={c.unit}>
                {fmtY(compositionOf(r, c.stream)?.[sp])}
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  const approachRows = DECLARED_REACTIONS.map((rx) => {
    const tkp = pick(`T_Kp_${rx}`);
    //  With no approach active the engine publishes no T_Kp at all: K was
    //  taken at T, and the page says so rather than inventing the number.
    const at = tkp ?? (dT === 0 ? T : null);
    const side = sideOf(at, T);
    return (
      <Text size="sm" key={rx}>
        <code>{rx}</code>: extent {fmtY(pick(`extent_${rx}_kmol_h`))} kmol/h
        {" "}({(pick(`extent_${rx}_kmol_h`) ?? 0) < 0 ? "runs BACKWARD" : "runs forward"}),
        K = {fmtY(pick(`Kp_${rx}`))} taken at{" "}
        <b>{at === null ? "—" : `${at.toFixed(0)} K`}</b>
        {side === "above" ? " (above T)" : side === "below" ? " (below T)" : ""}
      </Text>
    );
  });

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={4}>
            Declared pathways: equilibrium along the reactions you allow
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            Assume equilibrium — but declare which reaction pathways are the
            ONLY ones possible. Experience says which reactions a catalyst
            leaves too slow to matter; thermodynamics says where the rest stop.
            One syngas, three equilibrium reactors, and the difference between
            them is one word left off a list.
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}

        <Box>
          <Title order={5}>Now run it</Title>
          <Text size="sm" mt={4}>
            One run of the witness, in your browser: the same feed (70 H₂ : 25
            CO : 5 CO₂ at 50 bar) to the three reactors. Read the methane row
            first, then the methanol row, then move the two knobs.
          </Text>

          {run.err && (
            <Alert color="red" variant="light" mt={8}
              title="The engine did not finish">
              <Text size="sm">{run.err}</Text>
            </Alert>
          )}

          <Box mt={10} style={{
            display: "grid", gap: 14,
            gridTemplateColumns: "minmax(200px, 250px) 1fr",
          }}>
            <Stack gap={8}>
              <KnobSlider knob={T_KNOB} value={T} onChange={setT} showWhy />
              <KnobSlider knob={DT_KNOB} value={dT} onChange={setDT} showWhy />
              <PanelNote>
                Runs <code>tutorials/{PATHWAYS_WITNESS}</code> on the WASM
                build of <code>choupoSolve</code>. The approach knob writes the
                number of the <code>temperatureApproach 0;</code> the witness
                declares on its <code>declared</code> reactor; the engine
                assigns each reaction&apos;s sign and announces it in the run
                log.
              </PanelNote>
            </Stack>
            <Box style={{ minWidth: 0 }}>
              {run.busy && (
                <Group gap="sm" wrap="nowrap" align="center" mb={6}>
                  <Loader size="xs" />
                  <Text size="xs" c="dimmed">
                    one Gibbs minimisation and two reaction-set Newtons
                  </Text>
                </Group>
              )}
              {table}
              <Group gap="xs" wrap="wrap" mt={8}>
                <Badge variant="light" color="teal">
                  declared: methanol synthesis converts{" "}
                  {conversion === null ? "—" : `${(100 * conversion).toFixed(1)} %`}
                  {" "}of the CO fed
                </Badge>
                <Badge variant="light" color="gray">T = {T} K · |ΔT| = {dT} K</Badge>
              </Group>
              <Box mt={6}>{approachRows}</Box>
              <Text size="xs" c="dimmed" mt={6}>
                The Gibbs and the all-three columns should agree to every digit
                shown: a complete set of independent reactions IS the Gibbs
                reactor (step 2). The approach knob moves only the third
                column, and the reactor stays at T — only each K moves.
              </Text>
            </Box>
          </Box>
        </Box>

        {step(4)}
        {step(5)}

        <LessonLimits limits={PATHWAYS_LIMITS} />

        <Text size="sm">
          The level below this one — where the SPECIES list is the only
          kinetic statement and one approach applies to the whole
          transformation — is the page{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("equilibrium-landscapes")}>
            Equilibrium landscapes
          </Anchor>.
        </Text>
      </Stack>
    </Box>
  );
}
