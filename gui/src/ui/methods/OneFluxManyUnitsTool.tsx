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
  OneFluxManyUnitsTool — the EduTool `one-flux-many-units` (DEV.md 4c C401).

  The student's task, in one sentence: "I have a film coefficient from a
  correlation, a Henry's-law constant from a table and a flux to compute:
  which form is each one in, how do I get the form my equation needs, and
  what changes when the gas reacts in the liquid?"

  Seven steps, each followed by the panel that answers it: a converter of
  film coefficients, the table of who calls what, a Henry's-law converter,
  the overall coefficient, its failure on Seader's curved SO2 line, the
  Hatta number and the enhancement factor on a log plot, and six exercises
  with their worked solutions hidden until asked.  ALL OF IT IS THIS PAGE'S
  ARITHMETIC (gui/src/case/oneFluxManyUnits.ts), every panel marked so; the
  engine is cited where it uses one of the forms, never run.  The plot, the
  panel and the table wrapper are the isotherm page's, imported.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Anchor, Box, Button, Group, NumberInput, Select, Slider, Stack, Table, Text, Title,
} from "@mantine/core";

import { guideUrl, openGuide } from "../../help/guideLinks.js";
import {
  ATM, CHOUPO_O2_HREF_PA, FORM_LABEL, FORM_PHASE, FORM_SI_UNIT, FORM_UNITS, HENRY_FORMS, HENRY_HOW, HENRY_INFO,
  HENRY_SI_UNIT, HENRY_UNITS, MISSEN_9_6, M_W_SANDER, REGIME_SAYS, RHO_W_SANDER, SANDER_EXAMPLES, SO2,
  T_STD, convertFilm, curvedDemo, driftLogMean, eCurves, exercises, fromHcp, gasMolarDensity, henrySlope,
  overallConcentration, overallMoleFraction, reactive, reactiveRefusal, sig, so2x, so2y,
  stagnantFilmRatio, stateRefusal, toHcp,
  type FilmState, type FormId, type HenryForm, type ReactiveInput,
} from "../../case/oneFluxManyUnits.js";
import { Panel, Wide, XYPlot } from "./AdsorptionIsothermsTool.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { NOTATION_ROWS, OFMU_ENGINE_SCOPE, OFMU_LIMITS, OFMU_STEPS, OFMU_TASK } from "./oneFluxManyUnitsLesson.js";

/** The Theory Guide section that writes the engine's own film equations. */
export const THEORY_ANCHOR = "sec:rateBasedSegment";

type XY = readonly [number, number];
const TEXT = "var(--mantine-color-text)";
const INK = "var(--mantine-color-dimmed)";
const BLUE = "#2a78d6", ORANGE = "#d4572a", GREEN = "#1baf7a", VIOLET = "#8a5cd6", AMBER = "#e0a100";

const step = lessonStepper(OFMU_STEPS);
const num = (v: number | string): number => (v === "" ? NaN : Number(v));

/** A share drawn as a bar, with its number beside it. */
function ShareBar({ label, share, color }: { label: string; share: number; color: string }): JSX.Element {
  const pct = Math.max(0, Math.min(1, share)) * 100;
  return (
    <Group gap={8} wrap="nowrap">
      <Text size="xs" w={110}>{label}</Text>
      <Box style={{ flex: 1, height: 12, background: "var(--mantine-color-default-border)", borderRadius: 3 }}>
        <Box style={{ width: `${pct}%`, height: 12, background: color, borderRadius: 3 }} />
      </Box>
      <Text size="xs" w={60} ta="right">{sig(100 * share, 3)} %</Text>
    </Group>
  );
}

// ---- 1. the film-coefficient converter ---------------------------------------------

function FilmConverter(): JSX.Element {
  const [form, setForm] = useState<FormId>("kp");
  const [unit, setUnit] = useState<string>("kmol/(m2 h kPa)");
  const [valS, setVal] = useState<number | string>(0.040);
  const [TS, setT] = useState<number | string>(50);
  const [PS, setP] = useState<number | string>(202.65);
  const [cS, setC] = useState<number | string>(55.0);
  const [aS, setA] = useState<number | string>(100);
  const [ybS, setYb] = useState<number | string>(0.085);
  const [yiS, setYi] = useState<number | string>(0.084);

  const units = FORM_UNITS[form];
  const u = units.find((x) => x.id === unit) ?? units[0]!;
  const phase = FORM_PHASE[form];
  const drift = driftLogMean(num(ybS), num(yiS));
  const s: FilmState = {
    T: num(TS) + 273.15, P: num(PS) * 1000, cL: num(cS) * 1000, a: num(aS),
    yBLM: phase === "gas" ? drift : 1, xBLM: phase === "liquid" ? drift : 1,
  };
  const value = num(valS) * u.toSI;
  const refused = !(value > 0) ? "the coefficient must be positive"
    : !(num(ybS) >= 0 && num(ybS) < 1 && num(yiS) >= 0 && num(yiS) < 1)
      ? "the two mole fractions of A lie in [0, 1)" : stateRefusal(s);
  const rows = refused ? [] : convertFilm(form, value, s);
  const ratio = stagnantFilmRatio(num(ybS), num(yiS));

  return (
    <Panel title="convert a film coefficient" origin={["page", "assumption"]}
      originNote="the conversions of step 1 and the drift factor of step 2, by this page, on the coefficient and the state you type (the defaults are Seader's Example 3.18 gas coefficient; a = 100 m²/m³ is this page's illustrative value)">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select label="the form you have" allowDeselect={false} value={form} w={260}
          onChange={(v) => {
            if (!v) return;
            const f = v as FormId;
            //  A change of phase resets the film's two compositions to Seader's
            //  Example 3.18 values for that phase (p. 80).
            if (FORM_PHASE[f] !== phase) {
              if (FORM_PHASE[f] === "gas") { setYb(0.085); setYi(0.084); } else { setYb(0.001); setYi(0.00196); }
            }
            setForm(f); setUnit(FORM_UNITS[f][0]!.id);
          }}
          data={(Object.keys(FORM_LABEL) as FormId[]).map((f) => ({ value: f, label: FORM_LABEL[f] }))} />
        <NumberInput label="value" value={valS} onChange={setVal} min={0} decimalScale={8} w={130} />
        <Select label="unit" allowDeselect={false} value={u.id} onChange={(v) => { if (v) setUnit(v); }} w={190}
          data={units.map((x) => ({ value: x.id, label: x.label }))} />
      </Group>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <NumberInput label="T, °C" value={TS} onChange={setT} w={90} />
        <NumberInput label="P, kPa" value={PS} onChange={setP} min={0} decimalScale={4} w={110} />
        <NumberInput label="liquid c, kmol/m³" value={cS} onChange={setC} min={0} decimalScale={4} w={140} />
        <NumberInput label="a, m²/m³" value={aS} onChange={setA} min={0} decimalScale={3} w={110} />
      </Group>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <NumberInput label={`A in the bulk ${phase === "gas" ? "gas, y_A,b" : "liquid, x_A,b"}`} value={ybS}
          onChange={setYb} min={0} max={0.999} step={0.01} decimalScale={5} w={190} />
        <NumberInput label={`A at the interface, ${phase === "gas" ? "y_A,i" : "x_A,i"}`} value={yiS}
          onChange={setYi} min={0} max={0.999} step={0.01} decimalScale={5} w={190} />
      </Group>
      {refused ? (
        <Alert color="red" variant="light" title="Refused"><Text size="sm">{refused}</Text></Alert>
      ) : (
        <>
          <Text size="sm">
            Given: {sig(num(valS))} {u.label} = <b>{sig(value)} {FORM_SI_UNIT[form]}</b> in SI with moles.
            {phase === "gas"
              ? ` The gas molar density is c_G = P/(R T) = ${sig(s.P)}/(8.314 × ${sig(s.T)}) = ${sig(gasMolarDensity(s.T, s.P))} mol/m³.`
              : ` The liquid's total molar concentration is c = ${sig(s.cL)} mol/m³.`}
          </Text>
          <Wide>
            <Table fz="xs" striped withTableBorder style={{ minWidth: 520 }}>
              <Table.Thead><Table.Tr>
                <Table.Th>form</Table.Th><Table.Th>meaning</Table.Th><Table.Th>value</Table.Th>
                <Table.Th>unit</Table.Th><Table.Th>how</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {rows.map((r) => (
                  <Table.Tr key={r.key}>
                    <Table.Td><b>{r.sym}</b></Table.Td><Table.Td>{r.meaning}</Table.Td>
                    <Table.Td>{sig(r.value)}</Table.Td><Table.Td>{r.unit}</Table.Td><Table.Td>{r.how}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Wide>
          <Text size="xs" c="dimmed">
            The drift factor: ({phase === "gas" ? "y" : "x"}_B)_LM = log mean of {sig(1 - num(ybS))} and{" "}
            {sig(1 - num(yiS))} = {sig(drift)}.  Taylor and Kooijman&apos;s logarithm (their Eq. 3.82) over the
            ordinary driving force gives {sig(ratio)}; 1/(y_B)_LM = {sig(1 / drift)}: the same number, as step 2
            derives.
          </Text>
        </>
      )}
    </Panel>
  );
}

// ---- who calls what -------------------------------------------------------------------

function NotationTable(): JSX.Element {
  return (
    <Panel title="who calls what" origin="reference"
      originNote="each cell read in the source at the equation it names; the Choupo column at the cited line">
      <Wide>
        <Table fz="xs" striped withTableBorder style={{ minWidth: 900 }}>
          <Table.Thead><Table.Tr>
            <Table.Th>quantity</Table.Th><Table.Th>this page</Table.Th><Table.Th>Treybal (1980)</Table.Th>
            <Table.Th>Seader et al. (2016)</Table.Th><Table.Th>Missen et al. (1999)</Table.Th>
            <Table.Th>Taylor and Kooijman (2014)</Table.Th><Table.Th>Choupo&apos;s code</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {NOTATION_ROWS.map((r) => (
              <Table.Tr key={r.quantity}>
                <Table.Td><b>{r.quantity}</b></Table.Td><Table.Td>{r.page}</Table.Td><Table.Td>{r.treybal}</Table.Td>
                <Table.Td>{r.seader}</Table.Td><Table.Td>{r.missen}</Table.Td><Table.Td>{r.taylorKooijman}</Table.Td>
                <Table.Td>{r.choupo}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Wide>
      <Text size="xs" c="dimmed">
        Before you use a coefficient from a book or a correlation, find its driving force in the equation that
        defines it, not in its letter: the same letter means different things in two books, and in two chapters of
        one book.
      </Text>
    </Panel>
  );
}

// ---- 3. the Henry converter ----------------------------------------------------------------

function HenryConverter(): JSX.Element {
  const [preset, setPreset] = useState<string>("O2");
  const [form, setForm] = useState<HenryForm>("Hcp");
  const [unit, setUnit] = useState<string>("mol/(m3 Pa)");
  const [valS, setVal] = useState<number | string>(1.3e-5);
  const [TS, setT] = useState<number | string>(T_STD);
  const [PS, setP] = useState<number | string>(101.325);
  const [rhoS, setRho] = useState<number | string>(RHO_W_SANDER);
  const [MS, setM] = useState<number | string>(M_W_SANDER * 1000);

  const choose = (id: string): void => {
    setPreset(id);
    const g = SANDER_EXAMPLES.find((x) => x.id === id);
    if (g) { setForm("Hcp"); setUnit("mol/(m3 Pa)"); setVal(g.Hcp); setT(T_STD); }
  };
  const units = HENRY_UNITS[form];
  const u = units.find((x) => x.id === unit) ?? units[0]!;
  const T = num(TS), P = num(PS) * 1000, w = { rho: num(rhoS), M: num(MS) / 1000 };
  const refused = !(num(valS) > 0) ? "the constant must be positive" : !(T > 0) ? "T must be above absolute zero"
    : !(P > 0) ? "P must be positive" : !(w.rho > 0 && w.M > 0) ? "ρ_w and M_w must be positive" : null;
  const all = refused ? null : fromHcp(toHcp(form, num(valS) * u.toSI, T, w), T, w);
  const m = all ? henrySlope(all.KHpx, P) : NaN;
  const g = SANDER_EXAMPLES.find((x) => x.id === preset);

  return (
    <Panel title="convert a Henry's-law constant" origin={["page", "reference", "assumption"]}
      originNote="Sander's definitions and dilute conversions (Eqs. 1-16) evaluated by this page; the presets are Sander's Table 6 values; T, P, ρ_w and M_w are yours (the defaults are Sander's)">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select label="gas" allowDeselect={false} value={preset} onChange={(v) => { if (v) choose(v); }} w={250}
          data={[...SANDER_EXAMPLES.map((x) => ({ value: x.id, label: `${x.name} (Sander 2015, p. ${x.page})` })),
            { value: "own", label: "your own constant" }]} />
        <Select label="the variant you have" allowDeselect={false} value={form} w={250}
          onChange={(v) => { if (v) { const f = v as HenryForm; setForm(f); setUnit(HENRY_UNITS[f][0]!.id); setPreset("own"); } }}
          data={HENRY_FORMS.map((f) => ({ value: f, label: `${HENRY_INFO[f].plain} = ${HENRY_INFO[f].defn} (${HENRY_INFO[f].kind})` }))} />
      </Group>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <NumberInput label="value" value={valS} onChange={(v) => { setVal(v); setPreset("own"); }} min={0} decimalScale={12} w={150} />
        <Select label="unit" allowDeselect={false} value={u.id} onChange={(v) => { if (v) setUnit(v); }} w={200}
          data={units.map((x) => ({ value: x.id, label: x.label }))} />
        <NumberInput label="T, K" value={TS} onChange={setT} decimalScale={3} w={100} />
        <NumberInput label="P, kPa" value={PS} onChange={setP} min={0} decimalScale={4} w={110} />
        <NumberInput label="ρ_w, kg/m³" value={rhoS} onChange={setRho} min={0} decimalScale={3} w={110} />
        <NumberInput label="M_w, g/mol" value={MS} onChange={setM} min={0} decimalScale={5} w={110} />
      </Group>
      {g && (
        <Text size="xs" c="dimmed">
          Sander&apos;s Table 6 (p. {g.page}), {g.name}: H^cp = {sig(g.Hcp, 2)} mol/(m³ Pa) at 298.15 K,
          d ln H^cp/d(1/T) = {g.dlnHdinvT} K, from {g.row}.  The values are printed to two significant figures.
        </Text>
      )}
      {refused || !all ? (
        <Alert color="red" variant="light" title="Refused"><Text size="sm">{refused}</Text></Alert>
      ) : (
        <>
          <Wide>
            <Table fz="xs" striped withTableBorder style={{ minWidth: 480 }}>
              <Table.Thead><Table.Tr>
                <Table.Th>variant</Table.Th><Table.Th>defined as</Table.Th><Table.Th>type</Table.Th>
                <Table.Th>value (SI)</Table.Th><Table.Th>how</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {HENRY_FORMS.map((f) => (
                  <Table.Tr key={f}>
                    <Table.Td><b>{HENRY_INFO[f].plain}</b></Table.Td><Table.Td>{HENRY_INFO[f].defn}</Table.Td>
                    <Table.Td>{HENRY_INFO[f].kind}</Table.Td>
                    <Table.Td>{sig(all[f])} {HENRY_SI_UNIT[f]}</Table.Td>
                    <Table.Td>{f === form ? "given" : HENRY_HOW[f]}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Wide>
          <Text size="sm">
            K_H^px = {sig(all.KHpx)} Pa = {sig(all.KHpx / ATM)} atm = {sig(all.KHpx / 1e5)} bar.  At P = {sig(P)} Pa the
            slope of y = m x is <b>m = K_H^px/P = {sig(m)}</b>: a liquid at x = 10⁻⁶ stands against a gas at
            y = {sig(m * 1e-6)}.
          </Text>
          {preset === "O2" && (
            <Text size="sm">
              Choupo&apos;s oxygen record (data/standards/parameters/Henry/O2-water.dat) stores H_ref ={" "}
              {sig(CHOUPO_O2_HREF_PA, 3)} Pa as p/x, which Sander writes K_H^px; Sander&apos;s first oxygen row
              converts to {sig(all.KHpx, 3)} Pa ({sig(100 * (CHOUPO_O2_HREF_PA / all.KHpx - 1), 2)} % apart).  His oxygen
              rows run from 1.2×10⁻⁵ to 1.3×10⁻⁵ mol/(m³ Pa), which is {sig(fromHcp(1.3e-5, T_STD).KHpx, 3)} to{" "}
              {sig(fromHcp(1.2e-5, T_STD).KHpx, 3)} Pa: the record lies inside that spread.
            </Text>
          )}
        </>
      )}
    </Panel>
  );
}

// ---- 4. the overall coefficient -------------------------------------------------------------

function OverallPanel(): JSX.Element {
  const [kyS, setKy] = useState<number | string>(8.1);
  const [kxS, setKx] = useState<number | string>(9.9);
  const [mS, setM] = useState<number | string>(49.7);
  const [ybS, setYb] = useState<number | string>(0.085);
  const [xbS, setXb] = useState<number | string>(0.001);
  const [kpS, setKp] = useState<number | string>(1.0e-5);
  const [kLS, setKL] = useState<number | string>(1.0e-4);
  const [HS, setH] = useState<number | string>(0.59);
  const ky = num(kyS), kx = num(kxS), m = num(mS), yb = num(ybS), xb = num(xbS);
  const ok = ky > 0 && kx > 0 && m > 0 && yb >= 0 && xb >= 0;
  const o = ok ? overallMoleFraction(ky, kx, m) : null;
  const kp = num(kpS), kL = num(kLS), H = num(HS);
  const okC = kp > 0 && kL > 0 && H > 0;
  const oc = okC ? overallConcentration(kp, kL, H) : null;
  return (
    <Panel title="the overall coefficient and the controlling film" origin={["page", "assumption"]}
      originNote="Treybal Eqs. 5.7-5.11 and Seader Eqs. 3-187, 3-191 by this page; the defaults are Seader's Example 3.18 (a) and exercise 4's values">
      <Text size="sm" fw={600}>Mole fractions (one slope m for both chords)</Text>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <NumberInput label="k_y, kmol/(h m²)" value={kyS} onChange={setKy} min={0} decimalScale={6} w={140} />
        <NumberInput label="k_x, kmol/(h m²)" value={kxS} onChange={setKx} min={0} decimalScale={6} w={140} />
        <NumberInput label="m" value={mS} onChange={setM} min={0} decimalScale={6} w={100} />
        <NumberInput label="y_b" value={ybS} onChange={setYb} min={0} max={1} decimalScale={6} w={100} />
        <NumberInput label="x_b" value={xbS} onChange={setXb} min={0} max={1} decimalScale={6} w={100} />
      </Group>
      {!o ? (
        <Alert color="red" variant="light" title="Refused"><Text size="sm">k_y, k_x and m must be positive; y_b and x_b not negative.</Text></Alert>
      ) : (
        <>
          <Text size="sm">
            1/K_y = 1/k_y + m/k_x = {sig(1 / ky)} + {sig(m / kx)} = {sig(1 / o.Ky)}, so <b>K_y = {sig(o.Ky)}</b>; and{" "}
            <b>K_x = m K_y = {sig(o.Kx)}</b> (the unit of k_y).  The flux on the bulk compositions:{" "}
            N = K_y (y_b − m x_b) = {sig(o.Ky)} × ({sig(yb)} − {sig(m * xb)}) = <b>{sig(o.Ky * (yb - m * xb))}</b>
            {yb - m * xb < 0 ? " (negative: the liquid gives A to the gas; this is stripping)" : ""}.
          </Text>
          <ShareBar label="gas film" share={o.gasShare} color={BLUE} />
          <ShareBar label="liquid film" share={o.liquidShare} color={ORANGE} />
          <Text size="sm">
            {o.controlling === "both" ? "Neither film holds 90 % of the resistance: both matter."
              : `The ${o.controlling} film controls (90 % or more of the resistance, this page's line).`}
          </Text>
        </>
      )}
      <Text size="sm" fw={600} mt={6}>Concentrations and a Henry solubility</Text>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <NumberInput label="k_p, mol/(m² s Pa)" value={kpS} onChange={setKp} min={0} decimalScale={10} w={160} />
        <NumberInput label="k_L, m/s" value={kLS} onChange={setKL} min={0} decimalScale={10} w={130} />
        <NumberInput label="H^cp, mol/(m³ Pa)" value={HS} onChange={setH} min={0} decimalScale={10} w={160} />
      </Group>
      {!oc ? (
        <Alert color="red" variant="light" title="Refused"><Text size="sm">k_p, k_L and H^cp must be positive.</Text></Alert>
      ) : (
        <Text size="sm">
          1/K_G = 1/k_p + 1/(H k_L) = {sig(1 / kp)} + {sig(1 / (H * kL))}: <b>K_G = {sig(oc.KG)} mol/(m² s Pa)</b>;{" "}
          <b>K_L = K_G/H = {sig(oc.KL)} m/s</b>.  The gas film holds {sig(100 * oc.gasShare, 3)} % of the resistance.
        </Text>
      )}
    </Panel>
  );
}

// ---- 5. the curved line ------------------------------------------------------------------

function CurvedPanel(): JSX.Element {
  const [logScale, setLogScale] = useState<number>(0);   // log10 of the k_y multiplier
  const scale = Math.pow(10, logScale);
  const d = useMemo(() => curvedDemo(scale), [scale]);
  const err = (n: number): string => `${n >= d.N ? "+" : ""}${sig(100 * (n / d.N - 1), 2)} %`;
  const xs = Array.from({ length: 80 }, (_, k) => (0.0032 * k) / 79);
  return (
    <Panel title="a curved equilibrium line: SO₂ into water at 50 °C and 2 atm" origin={["page", "reference"]}
      originNote="Seader's equilibrium fit, coefficients and bulk compositions (Example 3.18, pp. 79-80); the interface and every estimate solved by this page">
      <Text size="sm">
        Bulk gas y_b = {SO2.yb}, bulk liquid x_b = {SO2.xb}; k_x = {sig(SO2.kx, 3)} and k_y = {sig(SO2.ky, 4)} kmol/(h m²)
        in Seader&apos;s case.  Multiply k_y to weaken or strengthen the gas film:
      </Text>
      <Box px={6}>
        <Slider min={-2} max={1} step={0.05} value={logScale} onChange={setLogScale} label={(v) => `× ${sig(Math.pow(10, v), 3)}`}
          marks={[{ value: -2, label: "× 0.01" }, { value: -1, label: "× 0.1" }, { value: 0, label: "Seader" }, { value: 1, label: "× 10" }]} />
      </Box>
      <Text size="sm" mt={14}>
        k_y = {sig(d.ky, 4)} kmol/(h m²).  The interface, solved on the curve: x_i = {sig(d.xi)}, y_i = {sig(d.yi)};
        the exact flux N = k_x (x_i − x_b) = <b>{sig(d.N)} kmol/(h m²)</b>.  The two chords: m′ = {sig(d.mChordCM)},
        m″ = {sig(d.mChordMD)}; with m″, Treybal&apos;s Eq. 5.9 returns the exact flux ({sig(d.NfromChord)}).
      </Text>
      <Wide>
        <Table fz="xs" striped withTableBorder style={{ minWidth: 460 }}>
          <Table.Thead><Table.Tr>
            <Table.Th>overall coefficient built on</Table.Th><Table.Th>slope</Table.Th><Table.Th>x*</Table.Th>
            <Table.Th>N, kmol/(h m²)</Table.Th><Table.Th>error</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            <Table.Tr><Table.Td>the chord m″ (exact)</Table.Td><Table.Td>{sig(d.mChordMD)}</Table.Td><Table.Td>{sig(d.xStar)}</Table.Td><Table.Td>{sig(d.NfromChord)}</Table.Td><Table.Td>{err(d.NfromChord)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>Seader (a): average slope between the bulk equilibria</Table.Td><Table.Td>{sig(d.mAverage)}</Table.Td><Table.Td>{sig(d.xStar)}</Table.Td><Table.Td>{sig(d.NAverage)}</Table.Td><Table.Td>{err(d.NAverage)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>Seader (b): local slope at x*</Table.Td><Table.Td>{sig(d.mAtXstar)}</Table.Td><Table.Td>{sig(d.xStar)}</Table.Td><Table.Td>{sig(d.NAtXstar)}</Table.Td><Table.Td>{err(d.NAtXstar)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>a straight Henry line at the dilute slope</Table.Td><Table.Td>{sig(d.mDilute)}</Table.Td><Table.Td>{sig(d.xStarDilute)}</Table.Td><Table.Td>{sig(d.NDilute)}</Table.Td><Table.Td>{err(d.NDilute)}</Table.Td></Table.Tr>
          </Table.Tbody>
        </Table>
      </Wide>
      <Text size="xs" c="dimmed">
        At Seader&apos;s k_y the book prints K_x = 9.66 and N = 0.00942 for (a) and K_x = 9.69 and N = 0.00945 for (b)
        (p. 80); the page computes from his unrounded curve, so its average slope is {sig(d.mAverage, 3)} where the book,
        from y* rounded to 0.0365, prints 49.7.
      </Text>
      <XYPlot ariaLabel="the SO2 equilibrium curve, a straight Henry line, the bulk point, the interface and the two fictitious equilibria"
        xLabel="x, mole fraction SO₂ in the liquid" yLabel="y, mole fraction SO₂ in the gas"
        series={[
          { name: "equilibrium, Seader's fit", color: TEXT, line: xs.map((x): XY => [x, so2y(x)]) },
          { name: "straight Henry line, slope 29.74", color: INK, dash: "6 4", line: xs.map((x): XY => [x, SO2.a * x]) },
          { name: "film line from the bulk point to the interface", color: BLUE, line: [[SO2.xb, SO2.yb], [d.xi, d.yi]] },
          { name: "bulk point (x_b, y_b)", color: ORANGE, points: [[SO2.xb, SO2.yb]] },
          { name: "interface (x_i, y_i)", color: GREEN, points: [[d.xi, d.yi]] },
          { name: "x* on the curve, and on the straight line", color: VIOLET, points: [[so2x(SO2.yb), SO2.yb], [d.xStarDilute, SO2.yb]] },
          { name: "y* (in equilibrium with x_b)", color: AMBER, points: [[SO2.xb, d.yStar]] },
        ]} />
    </Panel>
  );
}

// ---- 6. Hatta and the enhancement factor ----------------------------------------------------

const E_PARAMS = [2, 5, 10, 20, 50, 100, 200, 1000] as const;

function ReactionPanel(): JSX.Element {
  const [k2S, setK2] = useState<number | string>(MISSEN_9_6.k2 * 1000);
  const [cBS, setCB] = useState<number | string>(MISSEN_9_6.cB / 1000);
  const [DAS, setDA] = useState<number | string>(MISSEN_9_6.DA * 1e4);
  const [DBS, setDB] = useState<number | string>(MISSEN_9_6.DB * 1e4);
  const [kLS, setKL] = useState<number | string>(MISSEN_9_6.kL * 100);
  const [bS, setB] = useState<number | string>(MISSEN_9_6.b);
  const [HAS, setHA] = useState<number | string>(MISSEN_9_6.HA / 100);
  const [pS, setPA] = useState<number | string>(MISSEN_9_6.pA / 1e5);
  const r: ReactiveInput = {
    k2: num(k2S) / 1000, cB: num(cBS) * 1000, DA: num(DAS) * 1e-4, DB: num(DBS) * 1e-4,
    kL: num(kLS) / 100, b: num(bS), HA: num(HAS) * 100, pA: num(pS) * 1e5,
  };
  const refused = reactiveRefusal(r);
  const res = refused ? null : reactive(r);
  const curves = useMemo(() => eCurves(E_PARAMS), []);
  const preset = (cB: number): void => {
    setK2(MISSEN_9_6.k2 * 1000); setCB(cB); setDA(MISSEN_9_6.DA * 1e4); setDB(MISSEN_9_6.DB * 1e4);
    setKL(MISSEN_9_6.kL * 100); setB(MISSEN_9_6.b); setHA(MISSEN_9_6.HA / 100); setPA(MISSEN_9_6.pA / 1e5);
  };
  const vkhColors = [ORANGE, AMBER, GREEN, VIOLET, BLUE, ORANGE, AMBER, GREEN];
  return (
    <Panel title="the Hatta number and the enhancement factor" origin={["page", "assumption"]}
      originNote="Missen Eqs. 9.2-49 to 9.2-54 by this page (van Krevelen-Hoftijzer by bisection) on the data you type; the presets are Missen's Example 9-6">
      <Group gap="xs">
        <Button size="xs" variant="light" onClick={() => preset(0.1)}>Missen 9-6 (a): c_B = 0.1 mol/L</Button>
        <Button size="xs" variant="light" onClick={() => preset(6)}>Missen 9-6 (b): c_B = 6 mol/L</Button>
      </Group>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <NumberInput label="k₂, L/(mol s)" value={k2S} onChange={setK2} min={0} decimalScale={6} w={130} />
        <NumberInput label="c_B, mol/L" value={cBS} onChange={setCB} min={0} decimalScale={6} w={110} />
        <NumberInput label="D_A, cm²/s" value={DAS} onChange={setDA} min={0} decimalScale={10} w={130} />
        <NumberInput label="D_B, cm²/s" value={DBS} onChange={setDB} min={0} decimalScale={10} w={130} />
        <NumberInput label="k_L, cm/s" value={kLS} onChange={setKL} min={0} decimalScale={6} w={110} />
        <NumberInput label="b" value={bS} onChange={setB} min={0} decimalScale={3} w={70} />
        <NumberInput label="H_A, bar L/mol" value={HAS} onChange={setHA} min={0} decimalScale={6} w={130} />
        <NumberInput label="p_A, bar" value={pS} onChange={setPA} min={0} decimalScale={6} w={100} />
      </Group>
      {refused || !res ? (
        <Alert color="red" variant="light" title="Refused"><Text size="sm">{refused}</Text></Alert>
      ) : (
        <>
          <Text size="sm">
            <b>Ha = {sig(res.Ha, 3)}</b>: {REGIME_SAYS[res.regime]} (Missen p. 253).  With no gas film,
            c_Ai = p_A/H_A = {sig(res.cAi)} mol/m³ and <b>E_i = {sig(res.Ei, 3)}</b>.  Pseudo-first-order:{" "}
            <b>E = Ha/tanh Ha = {sig(res.Epfo, 3)}</b>; van Krevelen-Hoftijzer: <b>E = {sig(res.Evkh, 3)}</b>, which is{" "}
            {sig(100 * res.ratio, 3)} % of it.  Flux without reaction k_L c_Ai = {sig(res.Nphys, 3)} mol/(m² s); with
            reaction {sig(res.Nvkh, 3)} (van Krevelen-Hoftijzer) or {sig(res.Npfo, 3)} (pseudo-first-order
            {res.pfoAboveInstantaneous ? ": above the instantaneous limit, not valid here" : ""}).
          </Text>
          {res.pfoAboveInstantaneous && (
            <Alert color="yellow" variant="light" title="Pseudo-first-order is above the instantaneous limit"
              data-pfo-above-instantaneous="">
              <Text size="sm">
                E = Ha/tanh Ha = {sig(res.Epfo, 3)} exceeds E_i = {sig(res.Ei, 3)}: no reaction can raise the flux above
                the instantaneous limit, so the pseudo-first-order value and its flux are not valid here.  B is too
                dilute to stay uniform across the film; the van Krevelen-Hoftijzer value, bounded by E_i, is the one
                to read.
              </Text>
            </Alert>
          )}
          <Text size="xs" c="dimmed">
            Read the ratio: near 100 %, B is plentiful at the interface and the pseudo-first-order formula is enough;
            well below it, E bends towards E_i, the limit set by how fast B diffuses to meet A.
          </Text>
        </>
      )}
      <XYPlot ariaLabel="enhancement factor against Hatta number, pseudo-first-order and van Krevelen-Hoftijzer curves, with your point"
        xLabel="Ha" yLabel="E" xlog ylog
        series={[
          { name: "E = Ha/tanh Ha (pseudo-first-order, E_i → ∞)", color: TEXT, line: curves.Ha.map((h, k): XY => [h, curves.pfo[k]!]) },
          ...curves.vkh.map((c, j) => ({
            name: `van Krevelen-Hoftijzer, E_i = ${c.Ei}`, color: vkhColors[j]!, dash: "5 3",
            line: curves.Ha.map((h, k): XY => [h, c.E[k]!]),
          })),
          ...(res ? [{ name: "your case (van Krevelen-Hoftijzer)", color: BLUE, points: [[res.Ha, res.Evkh]] as XY[] }] : []),
        ]} />
      <Text size="xs" c="dimmed">
        Each dashed curve rises with Ha along the pseudo-first-order line and then levels off at its E_i, as in
        Missen&apos;s Figure 9.8 and Seader&apos;s Figure 6.45.  Ha below 0.1 sits at E = 1: the reaction happens in the bulk.
      </Text>
    </Panel>
  );
}

// ---- the exercises ----------------------------------------------------------------------

function Exercises(): JSX.Element {
  const list = useMemo(() => exercises(), []);
  const [shown, setShown] = useState<readonly boolean[]>(list.map(() => false));
  return (
    <Panel title="exercises" origin={["page", "reference", "assumption"]}
      originNote="each statement's data from the source it names or marked illustrative; every number of every solution computed by this page from those data">
      <Text size="sm">
        Six short exercises of the kind set in a course.  Work each one on paper first; then open the solution.  Every
        number in a solution is computed by the page from the data above it, so a wrong step shows.
      </Text>
      <Stack gap={14}>
        {list.map((e, k) => (
          <Box key={e.id} data-exercise={e.id}>
            <Text size="sm" fw={700}>{k + 1}. {e.title}</Text>
            <Text size="sm">{e.statement}</Text>
            <Box component="ul" my={4} pl={20}>
              {e.data.map((d) => <Box component="li" key={d}><Text size="sm">{d}</Text></Box>)}
            </Box>
            <Text size="xs" c="dimmed">Source: {e.source}</Text>
            {shown[k] ? (
              <Box mt={4} pl={8} style={{ borderLeft: `3px solid ${GREEN}` }}>
                {e.solution.map((s) => <Text key={s} size="sm">{s}</Text>)}
                <Text size="sm" fw={700} mt={4}>Answer: {e.answer}</Text>
              </Box>
            ) : (
              <Button size="xs" variant="light" mt={4}
                onClick={() => setShown((v) => v.map((x, i) => (i === k ? true : x)))}>Show the solution</Button>
            )}
          </Box>
        ))}
      </Stack>
    </Panel>
  );
}

// ---- the page ------------------------------------------------------------------------------

export function OneFluxManyUnitsTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto", minWidth: 0 }}>
        <Box>
          <Title order={3}>One flux, many units: film coefficients, Henry&apos;s law and reaction in the film</Title>
          <Text size="sm" c="dimmed" mt={4}>{OFMU_TASK}</Text>
        </Box>

        <Alert color="gray" variant="light" title="Where Choupo's engine uses these forms">
          <Text size="sm">{OFMU_ENGINE_SCOPE}</Text>
          <Text size="sm" mt={6}>
            The Theory Guide writes the rate-based segment&apos;s own film equations in full:{" "}
            <Anchor component="button" type="button"
              onClick={() => openGuide(guideUrl("theoryGuide", THEORY_ANCHOR))}>
              the rate-based packed segment
            </Anchor>.
          </Text>
        </Alert>

        {step(1)}
        <FilmConverter />
        <NotationTable />
        {step(2)}
        {step(3)}
        <HenryConverter />
        {step(4)}
        <OverallPanel />
        {step(5)}
        <CurvedPanel />
        {step(6)}
        <ReactionPanel />
        {step(7)}

        <LessonLimits limits={OFMU_LIMITS} />
        <Exercises />
        <LessonReferences tool="one-flux-many-units" />
      </Stack>
    </Box>
  );
}
