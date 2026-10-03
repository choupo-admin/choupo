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
  StandardStateTool -- enthalpy, the standard state and equilibrium: what
  the degree sign really means (registry id `standard-state`; DEV.md 4c, C32).

  ZERO PHYSICS IN THE PANEL.  Every enthalpy drawn is read from a live
  `choupoProps` run of the witness (42 `propertyPoint` ops on SRK, one per
  node of the grid), through each op's own diagnostics: H_ig, H_R and
  H_real in J/mol on the engine's elements datum.  The REFERENCE points are
  read from the witness's shipped CSV (Leachman 2009 through CoolProp,
  re-computed by bin/curate/reference_h2_enthalpy.py).  What the panel
  computes: a subtraction (both sets shifted to h(300 K, 1 bar) = 0), the
  reader's zero shift (one constant added to every value -- step 6's lesson),
  two-point differences, and the deviation between the two residuals.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Select, Stack, Switch,
  Text, Title,
} from "@mantine/core";

import { methodCase, useMethodRun } from "../../case/methodRun.js";
import { KnobSlider, PanelNote } from "./knobPanel.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import {
  STANDARD_STATE_LIMITS, STANDARD_STATE_QUIZ, STANDARD_STATE_STEPS,
} from "./standardStateLesson.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

/** The witness, its grid, and the op names the GUI reads (`h_T<K>_P<bar>`). */
export const STANDARD_STATE_WITNESS = "props/thermo/standardState01_hydrogen_enthalpy_TP";
export const GRID_T: readonly number[] = [300, 400, 500, 600, 700, 800, 900, 1000];
export const GRID_P: readonly number[] = [1, 100, 300, 600, 1000];
/** The green-ammonia converter's state, evaluated by two extra ops. */
export const CONVERTER = { T: 733.15, P: 150, key: "h_converter", key1bar: "h_converter_1bar" };
/** The shipped reference (see the witness's constant/experimental/). */
export const REFERENCE_PATH =
  "constant/experimental/hydrogen_Hmolar_leachman2009_coolprop.csv";

export function nodeKey(T: number, P: number): string {
  return `h_T${T}_P${P}`;
}

/** One engine node, J/mol on the elements datum. */
export interface HPoint { hig: number; hr: number; hreal: number; }

export function refKey(T: number, P: number): string {
  return `${Number(T)}|${Number(P)}`;
}

/** The reference CSV: `#` comments, one header, `T_K,P_bar,Hmolar,Hmolar_residual`. */
export function parseReference(csv: string): Map<string, { h: number; hr: number }> {
  const out = new Map<string, { h: number; hr: number }>();
  let header: string[] | null = null;
  for (const raw of csv.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(",");
    if (!header) { header = cells; continue; }
    const col = (name: string): number => {
      const i = header!.indexOf(name);
      if (i < 0) throw new Error(`reference CSV has no column ${name}`);
      return Number(cells[i]);
    };
    out.set(refKey(col("T_K"), col("P_bar")),
      { h: col("Hmolar_J_mol"), hr: col("Hmolar_residual_J_mol") });
  }
  return out;
}

function fmt(v: number | null | undefined, d: number): string {
  return v !== null && v !== undefined && Number.isFinite(v) ? v.toFixed(d) : "—";
}

const SERIES_COLOURS = [
  "var(--mantine-color-blue-9)", "var(--mantine-color-blue-6)",
  "var(--mantine-color-cyan-6)", "var(--mantine-color-teal-6)",
  "var(--mantine-color-green-6)", "var(--mantine-color-lime-7)",
  "var(--mantine-color-yellow-7)", "var(--mantine-color-orange-6)",
];

export function StandardStateTool(): JSX.Element {
  const run = useMethodRun(STANDARD_STATE_WITNESS, [], "grid", "choupoProps");
  const [axis, setAxis] = useState<"T" | "P">("T");
  const [zero, setZero] = useState(0);              // kJ/mol added to every value
  const [showRef, setShowRef] = useState(true);
  const [withResidual, setWithResidual] = useState(true);
  const [fixed, setFixed] = useState<string>("1");   // the held variable's value
  const [a, setA] = useState<string>("300");
  const [b, setB] = useState<string>("1000");
  const step = lessonStepper(STANDARD_STATE_STEPS);

  //  The engine's nodes, by (T, P).
  const engine = useMemo(() => {
    const byName = new Map<string, { [k: string]: number }>();
    for (const o of run.result?.operationResults ?? [])
      if (o.type === "propertyPoint") byName.set(o.name, o.diagnostics);
    const pt = (name: string): HPoint | null => {
      const d = byName.get(name);
      if (!d) return null;
      const hig = d["H_ig"], hr = d["H_R"], hreal = d["H_real"];
      return [hig, hr, hreal].every((v) => typeof v === "number" && Number.isFinite(v))
        ? { hig: hig!, hr: hr!, hreal: hreal! } : null;
    };
    const grid = new Map<string, HPoint>();
    let complete = byName.size > 0;
    for (const T of GRID_T) for (const P of GRID_P) {
      const p = pt(nodeKey(T, P));
      if (p) grid.set(refKey(T, P), p); else complete = false;
    }
    return { grid, complete, conv: pt(CONVERTER.key), conv1: pt(CONVERTER.key1bar) };
  }, [run.result]);

  //  The reference, from the witness's shipped CSV.
  const reference = useMemo(() => {
    try {
      const csv = methodCase(STANDARD_STATE_WITNESS, []).extraFiles?.[REFERENCE_PATH];
      return csv ? parseReference(csv) : null;
    } catch { return null; }
  }, []);

  const h0 = engine.grid.get(refKey(300, 1))?.hreal ?? null;
  const r0 = reference?.get(refKey(300, 1))?.h ?? null;
  /** Drawn value, kJ/mol: engine, shifted to the common zero plus the slider. */
  const hEng = (T: number, P: number): number | null => {
    const p = engine.grid.get(refKey(T, P));
    return p && h0 !== null ? (p.hreal - h0) / 1000 + zero : null;
  };
  const hRef = (T: number, P: number): number | null => {
    const r = reference?.get(refKey(T, P));
    return r && r0 !== null ? (r.h - r0) / 1000 + zero : null;
  };

  //  The two-point comparison.
  const held = Number(fixed), va = Number(a), vb = Number(b);
  const at = (f: (T: number, P: number) => number | null, v: number) =>
    axis === "T" ? f(v, held) : f(held, v);
  const dEng = engine.complete ? (at(hEng, vb) ?? NaN) - (at(hEng, va) ?? NaN) : null;
  const dRef = reference ? (at(hRef, vb) ?? NaN) - (at(hRef, va) ?? NaN) : null;

  //  The residuals' disagreement, where it is largest.
  const worst = useMemo(() => {
    if (!engine.complete || !reference) return null;
    let w: { T: number; P: number; eng: number; ref: number } | null = null;
    for (const T of GRID_T) for (const P of GRID_P) {
      const e = engine.grid.get(refKey(T, P))!.hr, r = reference.get(refKey(T, P))?.hr;
      if (r === undefined) continue;
      if (!w || Math.abs(e - r) > Math.abs(w.eng - w.ref)) w = { T, P, eng: e, ref: r };
    }
    return w;
  }, [engine, reference]);

  const chart = (() => {
    if (!engine.complete || h0 === null) return null;
    const W = 600, H = 300, L = 60, R = 70, Tp = 14, B = 40;
    const xs = axis === "T" ? GRID_T : GRID_P;
    const series = axis === "T" ? GRID_P : GRID_T;
    const xLo = xs[0]!, xHi = xs[xs.length - 1]!;
    const all: number[] = [];
    for (const T of GRID_T) for (const P of GRID_P) {
      const e = hEng(T, P); if (e !== null) all.push(e);
      const r = showRef ? hRef(T, P) : null; if (r !== null) all.push(r);
    }
    const vLo = Math.min(...all) - 0.5, vHi = Math.max(...all) + 0.5;
    const px = (x: number) => L + ((x - xLo) / (xHi - xLo)) * (W - L - R);
    const py = (v: number) => Tp + ((vHi - v) / (vHi - vLo)) * (H - Tp - B);
    const valueOf = (s: number, x: number, f: typeof hEng) =>
      axis === "T" ? f(x, s) : f(s, x);
    const yTicks = (() => {
      const span = vHi - vLo, stp = span > 12 ? 5 : span > 4 ? 1 : 0.5;
      const t: number[] = [];
      for (let v = Math.ceil(vLo / stp) * stp; v <= vHi; v += stp) t.push(Number(v.toFixed(3)));
      return t;
    })();
    const hiA = at(hEng, va), hiB = at(hEng, vb);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label="molar enthalpy of hydrogen against temperature and pressure">
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke={GRID} />
        <line x1={L} y1={Tp} x2={L} y2={H - B} stroke={GRID} />
        <text x={(W - R + L) / 2} y={H - 8} fontSize={11} fill={INK} textAnchor="middle">
          {axis === "T" ? "temperature [K]  (one curve per pressure)"
            : "pressure [bar]  (one curve per temperature)"}
        </text>
        <text x={6} y={Tp - 2} fontSize={11} fill={INK}>h − h(300 K, 1 bar) [kJ/mol]</text>
        {xs.map((x) => (
          <text key={x} x={px(x)} y={H - B + 14} fontSize={10} fill={INK}
            textAnchor="middle">{x}</text>
        ))}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={L - 3} y1={py(v)} x2={W - R} y2={py(v)} stroke={GRID} strokeDasharray="2 4" />
            <text x={L - 6} y={py(v) + 3} fontSize={10} fill={INK} textAnchor="end">{v}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const pts = xs.map((x) => [px(x), py(valueOf(s, x, hEng) ?? 0)] as const);
          const colour = SERIES_COLOURS[i % SERIES_COLOURS.length];
          const last = pts[pts.length - 1]!;
          return (
            <g key={s}>
              <polyline fill="none" stroke={colour} strokeWidth={1.5}
                points={pts.map((p) => p.join(",")).join(" ")} />
              {pts.map((p, k) => <circle key={k} cx={p[0]} cy={p[1]} r={2.5} fill={colour} />)}
              {showRef && xs.map((x, k) => {
                const r = valueOf(s, x, hRef);
                return r === null ? null : (
                  <circle key={`r${k}`} cx={px(x)} cy={py(r)} r={4}
                    fill="none" stroke={colour} strokeWidth={1} />
                );
              })}
              <text x={last[0] + 5} y={last[1] + 3} fontSize={9} fill={colour}>
                {axis === "T" ? `${s} bar` : `${s} K`}
              </text>
            </g>
          );
        })}
        {hiA !== null && (
          <circle cx={px(va)} cy={py(hiA)} r={6} fill="none"
            stroke="var(--mantine-color-red-6)" strokeWidth={2} />
        )}
        {hiB !== null && (
          <circle cx={px(vb)} cy={py(hiB)} r={6} fill="none"
            stroke="var(--mantine-color-red-6)" strokeWidth={2} />
        )}
      </svg>
    );
  })();

  const heldOptions = (axis === "T" ? GRID_P : GRID_T).map((v) => String(v));
  const varyOptions = (axis === "T" ? GRID_T : GRID_P).map((v) => String(v));
  const switchAxis = (v: string) => {
    const ax = v as "T" | "P";
    setAxis(ax);
    if (ax === "T") { setFixed("1"); setA("300"); setB("1000"); }
    else { setFixed("300"); setA("1"); setB("1000"); }
  };

  const conv = engine.conv, conv1 = engine.conv1;
  const convRef = reference?.get(refKey(CONVERTER.T, CONVERTER.P))?.hr ?? null;
  const convShown = conv ? (withResidual ? conv.hreal : conv.hig) / 1000 : null;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Enthalpy, the standard state and equilibrium: what does the ° mean?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            First the behaviour, then the reference, only then the symbol. How much
            the enthalpy of a real gas moves with temperature against pressure —
            priced by the engine — and what that makes of the degree sign, the
            zero of enthalpy, a process at 150 bar, and the three derivatives that
            all carry a 1/T².
          </Text>
        </Box>

        <Box>
          <Title order={5}>How much does the enthalpy of hydrogen really change?</Title>
          <Text size="sm" mt={4}>
            Filled points and lines: the engine (SRK) at 40 nodes, straight
            segments between them. Hollow rings: the reference equation of state
            (Leachman 2009, through CoolProp). Both shifted so that 300 K and
            1 bar is zero. Pick two states and read their difference; then move
            the zero and watch the difference stay.
          </Text>
          {run.err && (
            <Alert color="red" variant="light" mt={8} title="The engine did not finish">
              <Text size="sm">{run.err}</Text>
            </Alert>
          )}
          <Box mt={10} style={{
            display: "grid", gap: 14,
            gridTemplateColumns: "minmax(220px, 270px) 1fr",
          }}>
            <Stack gap={8}>
              <SegmentedControl size="xs" fullWidth value={axis} onChange={switchAxis}
                data={[{ value: "T", label: "vary T, hold P" }, { value: "P", label: "vary P, hold T" }]} />
              <Select size="xs" label={axis === "T" ? "pressure held [bar]" : "temperature held [K]"}
                data={heldOptions} value={fixed} onChange={(v) => v && setFixed(v)} allowDeselect={false} />
              <Group grow gap="xs">
                <Select size="xs" label={`state A [${axis === "T" ? "K" : "bar"}]`}
                  data={varyOptions} value={a} onChange={(v) => v && setA(v)} allowDeselect={false} />
                <Select size="xs" label={`state B [${axis === "T" ? "K" : "bar"}]`}
                  data={varyOptions} value={b} onChange={(v) => v && setB(v)} allowDeselect={false} />
              </Group>
              <KnobSlider
                knob={{ id: "zero",
                  label: "zero of the enthalpy: constant added to every value [kJ/mol]",
                  min: -10, max: 10, step: 0.5, unit: "",
                  why: "Step 6: the zero is a convention.  Every curve moves by "
                    + "this constant; no difference between two states does." }}
                value={zero} onChange={setZero} showWhy />
              <Switch size="xs" checked={showRef} onChange={(e) => setShowRef(e.currentTarget.checked)}
                label="show the reference equation of state (hollow rings)" />
              <PanelNote>
                Runs <code>tutorials/{STANDARD_STATE_WITNESS}</code> in your browser,
                on the WASM build of <code>choupoProps</code>: 42{" "}
                <code>propertyPoint</code> operations on SRK. Only the subtraction,
                the zero shift and the differences are computed here.
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
                <Badge variant="light" color="blue" tt="none">
                  Δh(A→B) engine: {fmt(dEng, 3)} kJ/mol
                </Badge>
                <Badge variant="light" color="gray" tt="none">
                  Δh(A→B) reference: {fmt(dRef, 3)} kJ/mol
                </Badge>
                <Badge variant="light" color="orange" tt="none">
                  zero shifted by {fmt(zero, 1)} kJ/mol — differences unchanged
                </Badge>
              </Group>
              {worst && (
                <Text size="xs" c="dimmed" mt={6}>
                  Where the two RESIDUALS disagree most: {worst.T} K, {worst.P} bar —
                  engine {fmt(worst.eng / 1000, 3)} against reference{" "}
                  {fmt(worst.ref / 1000, 3)} kJ/mol. The ideal-gas part agrees to a
                  few joules per mole everywhere; the residual is where SRK is a
                  model of hydrogen rather than hydrogen.
                </Text>
              )}
            </Box>
          </Box>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}

        <Box>
          <Title order={5}>The process is at 150 bar — the converter&apos;s hydrogen</Title>
          <Text size="sm" mt={4}>
            The witness evaluates hydrogen at the green-ammonia converter&apos;s state,
            {" "}{CONVERTER.T} K and {CONVERTER.P} bar, as the two halves of step 5.
            Switch the residual off to price the state as an ideal gas and read
            the error.
          </Text>
          <Group gap="md" mt={8} align="flex-start" wrap="wrap">
            <Switch size="xs" checked={withResidual}
              onChange={(e) => setWithResidual(e.currentTarget.checked)}
              label="add the SRK residual at 150 bar" />
            <Group gap="xs" wrap="wrap">
              <Badge variant="light" color="blue" tt="none">
                ideal-gas rise from 298.15 K: {fmt(conv ? conv.hig / 1000 : null, 3)} kJ/mol
              </Badge>
              <Badge variant="light" color={withResidual ? "teal" : "red"} tt="none">
                h at the converter: {fmt(convShown, 3)} kJ/mol
                {withResidual ? "" : " (residual dropped)"}
              </Badge>
              <Badge variant="light" color="gray" tt="none">
                residual: engine {fmt(conv ? conv.hr / 1000 : null, 3)}, reference{" "}
                {fmt(convRef !== null ? convRef / 1000 : null, 3)} kJ/mol
              </Badge>
            </Group>
          </Group>
          {conv && (
            <Text size="sm" mt={6}>
              Pricing the gas as ideal at 150 bar leaves out{" "}
              <b>{fmt(conv.hr / 1000, 3)} kJ/mol</b>, which is{" "}
              <b>{fmt(100 * conv.hr / conv.hig, 1)} %</b> of the ideal-gas enthalpy
              rise from 298.15 K to {CONVERTER.T} K. At 1 bar and the same
              temperature the residual is {fmt(conv1 ? conv1.hr : null, 1)} J/mol: the
              real gas at the standard pressure is a hair from the ideal one, and
              still not the same definition (step 3).
            </Text>
          )}
          <PanelNote>
            Hydrogen is an element, so on the engine&apos;s elements datum its
            ideal-gas enthalpy is zero at 298.15 K and the number above IS the
            sensible rise. The percentage divides one well-identified difference by
            another; no percentage of a zero-dependent value appears on this page.
          </PanelNote>
        </Box>

        {step(5)}
        {step(6)}
        {step(7)}
        {step(8)}
        {step(9)}
        {step(10)}

        <LessonQuiz title="Six questions" questions={STANDARD_STATE_QUIZ} />

        <LessonLimits limits={STANDARD_STATE_LIMITS} />
      </Stack>
    </Box>
  );
}
