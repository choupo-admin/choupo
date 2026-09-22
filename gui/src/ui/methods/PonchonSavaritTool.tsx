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
  PONCHON-SAVARIT, DERIVED -- the construction McCabe-Thiele is an
  APPROXIMATION OF.  Ordered by the owner (credo §10, 2026-08-31: "e o
  Savarit também tem de ficar").

  WHY IT BELONGS BESIDE McCABE RATHER THAN INSTEAD OF IT.  McCabe-Thiele
  buys its straight operating lines with constant molar overflow.  That
  assumption is stated on the McCabe page and, until this one, could only be
  BELIEVED: nothing in the tree let a reader see what it costs.  This
  construction carries the enthalpy, so the same column is solved without
  it, and the difference stops being a caveat and becomes a diagram.

  WHAT IS BUILT AND WHAT IS NOT, said here rather than discovered by a
  student: the ENGINE half exists (the enthalpyConcentration op publishes
  both saturation curves and the equilibrium ties; witness
  tutorials/props/scan/hxy01_ethanol_water_1atm).  The INTERACTIVE drawing
  -- difference point, lever arms, a staircase the reader drags -- is NOT
  built.  This page derives the construction and points at the data; it
  does not pretend to draw it.  A page that showed a static picture of a
  construction the reader cannot drive would be worse than one that says so.

  ZERO PHYSICS IN TYPESCRIPT: nothing is computed here.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Box, Code, Group, Loader, Slider, Stack, Switch, Text, Title }
  from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import { readHxy, deltaD, hAt, leverLV, vapourEnthalpyAt }
  from "../../case/ponchonSavarit.js";
import { PonchonPlot } from "../plotting/PonchonPlot.js";
import { LessonStepView } from "./lessonStep.js";
import { PONCHON_STEPS } from "./ponchonLesson.js";

/** The op's output file, case-root-relative as csvFiles keys are. */
export const PONCHON_CSV = "enthalpyConcentration.csv";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

export const PONCHON_WITNESS = "props/scan/hxy01_ethanol_water_1atm";


/** THE LIVE CONSTRUCTION.  Runs the witness in this browser, reads the
 *  engine's own two curves and ties, and lets the reader move the two things
 *  the construction depends on.
 *
 *  THE LEVER-RULE READBACK IS THE POINT OF THE PANEL, not decoration: the
 *  page claims that L/V can be read off the diagram with a ruler, and the
 *  panel prints that ruler measurement beside the R the reader dialled.  A
 *  construction that cannot be checked against the number it came from is a
 *  picture, not a method. */
function ConstructionPane(): JSX.Element {
  const run = useMethodRun(PONCHON_WITNESS, [], "ponchon-savarit",
    "choupoProps");
  const [xD, setXD] = useState(0.80);
  const [R, setR] = useState(2.0);
  const [ties, setTies] = useState(true);

  const rows = useMemo(
    () => readHxy(run.result?.csvFiles?.[PONCHON_CSV] ?? ""),
    [run.result]);

  const readback = useMemo(() => {
    if (rows.length < 2) return null;
    const d = deltaD(rows, xD, R);
    const h = hAt(rows, xD);
    const H = vapourEnthalpyAt(rows, xD);
    if (!d || h === null || H === null) return null;
    return { delta: d.y, lv: leverLV(d, H, h) };
  }, [rows, xD, R]);

  if (run.busy) {
    return (
      <Group gap={8} p="md"><Loader size="sm" />
        <Text size="sm" c="dimmed">running the witness in this browser…</Text>
      </Group>
    );
  }
  if (run.err) {
    return (
      <Alert color="red" variant="light" title="the engine refused">
        <Text size="xs">{run.err}</Text>
      </Alert>
    );
  }
  if (rows.length < 2) {
    return (
      <Alert color="yellow" variant="light" title="no usable rows">
        <Text size="sm">
          The run produced no equilibria this construction can be drawn on.
          A refused node keeps its grid coordinate and leaves the solved
          fields empty, and those rows are DROPPED here rather than
          interpolated across — a curve bridged over a state the engine
          declined to compute would be a drawing, not a result.
        </Text>
      </Alert>
    );
  }

  return (
    <Box>
      <Title order={5}>The construction, on the engine's own curves</Title>
      <Group gap={20} mt={8} align="flex-end" wrap="wrap">
        <Box style={{ minWidth: 210 }}>
          <Text size="xs" c={INK}>distillate composition x_D = {xD.toFixed(2)}</Text>
          <Slider min={0.5} max={0.95} step={0.01} value={xD} onChange={setXD}
            label={null} />
        </Box>
        <Box style={{ minWidth: 210 }}>
          <Text size="xs" c={INK}>reflux ratio R = {R.toFixed(2)}</Text>
          <Slider min={0.3} max={6} step={0.1} value={R} onChange={setR}
            label={null} />
        </Box>
        <Switch size="xs" checked={ties} label="equilibrium ties"
          onChange={(e) => setTies(e.currentTarget.checked)} />
      </Group>

      <Box mt={10} style={{ height: 420 }}>
        <PonchonPlot rows={rows} xD={xD} R={R} showTies={ties} />
      </Box>

      {readback && (
        <Box mt={8} px="sm" py={8}
          style={{ border: `1px solid ${GRID}`, borderRadius: 4 }}>
          <Text size="sm">
            Δ_D sits at{" "}
            <Text span ff="monospace">{(readback.delta / 1000).toFixed(1)} kJ/mol</Text>
            {" "}— off the top of the curves, as it should be: it is a net
            flow over a flow, not a state.  Read the lever rule back:{" "}
            <Text span ff="monospace">
              L/V = {readback.lv === null ? "—" : readback.lv.toFixed(4)}
            </Text>
            , against{" "}
            <Text span ff="monospace">R/(R+1) = {(R / (R + 1)).toFixed(4)}</Text>
            {" "}from the reflux you dialled.
          </Text>
          <Text size="sm" mt={6}>
            <strong>They agree identically, and that is worth less than it
            looks.</strong>  Δ_D was PLACED from R, so
            Δ_D − H₁ = R(H₁ − h_D) and Δ_D − h_D = (R + 1)(H₁ − h_D) by
            construction: the ratio comes out R/(R+1) whatever H₁ is, even a
            wrong one.  This readback confirms the difference point was put
            where the reflux says, and nothing else — it cannot tell you the
            enthalpies underneath it are right.  (An earlier version of this
            page called it “the check to demand of any construction”.  It is
            an identity, not a check, and the arithmetic above says which.)
          </Text>
          <Text size="sm" mt={6}>
            The check that WOULD bite is the one this page does not yet reach:
            step to the next tray and read the lever there.  L₁/V₂ is no
            longer R/(R+1) — it depends on the SHAPE of the two curves — so
            comparing it against the material balance V₂ = L₁ + D tests the
            enthalpies rather than restating the reflux.  That needs the
            staircase named below as missing.
          </Text>
        </Box>
      )}

      <Text size="xs" c={INK} mt={6}>
        Curves and ties are the engine's, from{" "}
        <Code style={{ fontSize: 11 }}>tutorials/{PONCHON_WITNESS}</Code>; the
        difference point and its ray are geometry on those points
        (<Code style={{ fontSize: 11 }}>case/ponchonSavarit.ts</Code>).
        Nothing here evaluates a thermophysical property.
      </Text>
    </Box>
  );
}

export function PonchonSavaritTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap={14}>
        <Box>
          <Title order={3}>Ponchon-Savarit, derived</Title>
          <Text size="sm" mt={4}>
            The construction McCabe-Thiele is an approximation of.  Put
            enthalpy on the vertical axis and the energy balance stops being
            a separate calculation: it becomes a point on the diagram, and
            constant molar overflow — the assumption McCabe-Thiele spends to
            get straight lines — becomes something you can look at.
          </Text>
        </Box>

        {PONCHON_STEPS.map((s) => <LessonStepView key={s.n} step={s} />)}

        <ConstructionPane />

        <Alert variant="light" color="orange"
          title="What this construction does not do">
          <Text size="sm">
            The <strong>engine half exists</strong>.  The{" "}
            <Code>enthalpyConcentration</Code> op publishes both saturation
            curves and the equilibrium ties — one row per equilibrium,
            carrying both ends and the temperature they share, so nothing
            downstream pairs rows by index or interpolates one end of a tie.
            Run it:{" "}
            <Code>runCase tutorials/{PONCHON_WITNESS}</Code>.
          </Text>
          <Text size="sm" mt={6}>
            The diagram above draws the curves, the ties, the difference
            point and ONE ray — the top tray's.  It does not step a full
            staircase down the column, and there is no second difference
            point for the stripping section yet.  Stated rather than left
            for you to discover: what is here is enough to see where Δ_D
            goes as the reflux moves, and not yet enough to count stages.
          </Text>
        </Alert>

        <Text size="xs" c={INK}>
          Theory: <Code>ch:ponchon</Code> in the Theory Guide.  Engine:{" "}
          <Code>src/propertyOps/EnthalpyConcentration.{"{H,cpp}"}</Code>.
        </Text>
      </Stack>
    </Box>
  );
}
