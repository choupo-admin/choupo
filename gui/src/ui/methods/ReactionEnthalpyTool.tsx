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
  ReactionEnthalpyTool -- the reaction enthalpy is a function of temperature
  (registry id `reaction-enthalpy`; DEV.md 4c, C31).

  ZERO PHYSICS IN THE PANEL.  The seven engine points are read from a live
  `choupoProps` run of the witness, through the op's own diagnostics; the
  only arithmetic here is the CONSTANT-heat-capacity Kirchhoff line the
  reader drags (step 6), which is drawn beside the engine's points so the
  approximation can be seen failing, and the per-mole-of-ammonia division
  (the reaction makes two).
\*---------------------------------------------------------------------------*/

import { useState } from "react";

import { Alert, Badge, Box, Group, Loader, Stack, Text, Title } from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import { KnobSlider, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { ENTHALPY_LIMITS, ENTHALPY_STEPS } from "./reactionEnthalpyLesson.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

/** The witness and the temperatures its `haberT` operation declares.  The
 *  diagnostic keys are the op's own: `haberBosch_T<int K>K_dH_kJ_mol`. */
export const ENTHALPY_WITNESS = "props/gibbs/reactionEnthalpy01_haber_kirchhoff";
export const ENTHALPY_OP = "haberT";
export const ENTHALPY_TEMPERATURES: readonly number[] =
  [298.15, 400, 500, 600, 700, 773.15, 800];
/** Moles of ammonia per mole of reaction (N2 + 3 H2 -> 2 NH3). */
export const NH3_PER_REACTION = 2;
/** The PEQ 2026-27 base data's value, section 2.4: kJ per mole of NH3. */
export const BASE_DATA_DH = -46.1;

export function diagKey(T: number): string {
  return `haberBosch_T${Math.floor(T)}K_dH_kJ_mol`;
}

/** Kirchhoff with a CONSTANT reaction heat capacity, per mole of NH3:
 *  dH(T) = dH(T0) + dCp (T - T0).  dCp in J/(K mol NH3), dH in kJ/mol NH3. */
export function kirchhoffConstant(dH0: number, dCp_J: number,
  T0: number, T: number): number {
  return dH0 + (dCp_J / 1000) * (T - T0);
}

function fmt(v: number | null, d: number): string {
  return v !== null && Number.isFinite(v) ? v.toFixed(d) : "—";
}

export function ReactionEnthalpyTool(): JSX.Element {
  const run = useMethodRun(ENTHALPY_WITNESS, [], "haberT", "choupoProps");
  const diag = run.result?.operationResults
    ?.find((o) => o.name === ENTHALPY_OP && o.type === "reactionGibbs")?.diagnostics;
  const pts = ENTHALPY_TEMPERATURES.map((T) => {
    const v = diag?.[diagKey(T)];
    return { T, dH: typeof v === "number" ? v / NH3_PER_REACTION : null };
  });
  const dH0 = pts[0]?.dH ?? null;
  const [dCp, setDCp] = useState(-21);      // J/(K mol NH3), step 6's slope
  const step = lessonStepper(ENTHALPY_STEPS);

  const chart = (() => {
    if (pts.some((p) => p.dH === null) || dH0 === null) return null;
    const W = 560, H = 260, L = 64, R = 18, Tp = 16, B = 42;
    const tLo = 280, tHi = 820;
    const vals = pts.map((p) => p.dH as number);
    const kLo = kirchhoffConstant(dH0, dCp, 298.15, tLo);
    const kHi = kirchhoffConstant(dH0, dCp, 298.15, tHi);
    const kLine = [kLo, kHi];
    const vLo = Math.min(...vals, ...kLine, BASE_DATA_DH) - 1;
    const vHi = Math.max(...vals, ...kLine, BASE_DATA_DH) + 1;
    const px = (T: number) => L + ((T - tLo) / (tHi - tLo)) * (W - L - R);
    const py = (v: number) => Tp + ((vHi - v) / (vHi - vLo)) * (H - Tp - B);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label="standard reaction enthalpy of ammonia synthesis against temperature">
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke={GRID} />
        <line x1={L} y1={Tp} x2={L} y2={H - B} stroke={GRID} />
        <text x={(W + L) / 2} y={H - 8} fontSize={11} fill={INK}
          textAnchor="middle">temperature [K]</text>
        <text x={8} y={Tp + 4} fontSize={11} fill={INK}>kJ per mol NH₃</text>
        {[300, 400, 500, 600, 700, 800].map((T) => (
          <text key={T} x={px(T)} y={H - B + 14} fontSize={10} fill={INK}
            textAnchor="middle">{T}</text>
        ))}
        {[Math.ceil(vLo), Math.floor(vHi)].map((v) => (
          <text key={v} x={L - 6} y={py(v) + 3} fontSize={10} fill={INK}
            textAnchor="end">{v}</text>
        ))}
        <line x1={px(tLo)} y1={py(BASE_DATA_DH)} x2={px(tHi)} y2={py(BASE_DATA_DH)}
          stroke="var(--mantine-color-red-6)" strokeDasharray="5 4" />
        <text x={px(tHi) - 4} y={py(BASE_DATA_DH) - 5} fontSize={10}
          fill="var(--mantine-color-red-6)" textAnchor="end">
          base data, −46.1 (the 25 °C value)
        </text>
        <line x1={px(tLo)} y1={py(kLo)} x2={px(tHi)} y2={py(kHi)}
          stroke="var(--mantine-color-orange-6)" strokeDasharray="2 3" />
        {pts.map((p) => (
          <circle key={p.T} cx={px(p.T)} cy={py(p.dH as number)} r={4.5}
            fill="var(--mantine-color-blue-6)" />
        ))}
      </svg>
    );
  })();

  const at773 = pts.find((p) => p.T === 773.15)?.dH ?? null;
  const k773 = dH0 !== null ? kirchhoffConstant(dH0, dCp, 298.15, 773.15) : null;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={4}>The reaction enthalpy depends on temperature</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The table gives the reaction enthalpy at 25 °C, and no reactor runs
            there. What the degree sign means, how the value moves with
            temperature, and how much it moves for ammonia — priced by the
            engine, not quoted.
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}

        <Box>
          <Title order={5}>The engine&apos;s numbers, and a straight line</Title>
          <Text size="sm" mt={4}>
            Blue: the standard reaction enthalpy per mole of ammonia at seven
            temperatures, from a live run of the witness. Red: the base
            data&apos;s value, which is the 25 °C one. Orange: Kirchhoff with a
            CONSTANT reaction heat capacity, which you set — start at the slope
            the engine&apos;s first two points give, then try to make the line
            pass through all seven.
          </Text>
          {run.err && (
            <Alert color="red" variant="light" mt={8} title="The engine did not finish">
              <Text size="sm">{run.err}</Text>
            </Alert>
          )}
          <Box mt={10} style={{
            display: "grid", gap: 14,
            gridTemplateColumns: "minmax(200px, 250px) 1fr",
          }}>
            <Stack gap={8}>
              <KnobSlider
                knob={{ id: "dcp",
                  label: "constant reaction heat capacity [J/(K·mol NH₃)]",
                  min: -40, max: 0, step: 0.5, unit: "",
                  why: "Kirchhoff's integral with the heat capacity held "
                    + "constant: a straight line through the 25 °C point." }}
                value={dCp} onChange={setDCp} showWhy />
              <PanelNote>
                Runs <code>tutorials/{ENTHALPY_WITNESS}</code> in your browser,
                on the WASM build of <code>choupoProps</code>: the
                {" "}<code>reactionGibbs</code> operation at seven temperatures.
                Only the orange line is computed here.
              </PanelNote>
            </Stack>
            <Box style={{ minWidth: 0 }}>
              {run.busy && (
                <Group gap="sm" mb={6}><Loader size="xs" />
                  <Text size="xs" c="dimmed">one property run — seconds</Text>
                </Group>
              )}
              {chart}
              <Group gap="xs" wrap="wrap" mt={6}>
                <Badge variant="light" color="blue">
                  engine at 298 K: {fmt(dH0, 2)} kJ/mol NH₃
                </Badge>
                <Badge variant="light" color="blue">
                  engine at 773 K: {fmt(at773, 2)}
                </Badge>
                <Badge variant="light" color="orange">
                  straight line at 773 K: {fmt(k773, 2)}
                </Badge>
              </Group>
              {at773 !== null && (
                <Text size="sm" mt={6}>
                  At 773 K the 25 °C value under-states the heat released by{" "}
                  <b>{fmt(100 * (1 - BASE_DATA_DH / at773), 1)} %</b>.
                </Text>
              )}
            </Box>
          </Box>
        </Box>

        {step(4)}
        {step(5)}
        {step(6)}

        <LessonLimits limits={ENTHALPY_LIMITS} />
      </Stack>
    </Box>
  );
}
