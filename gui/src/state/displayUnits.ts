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
  Choupo GUI -- display-unit preferences

  The solver emits everything in canonical SI (F kmol/s, T K, P Pa).
  These helpers convert to whatever the student picked in the
  TopBar Units menu and format the result for tables, node tooltips,
  and plot axis labels.

  Flow can be molar (kmol/h / kmol/s / mol/h / mol/s) or mass
  (kg/h / kg/s / g/h / g/s) -- the latter is read straight from
  `F_mass` (kg/s) emitted by the solver, so the GUI
  never needs the per-component molar masses to make the switch.
\*---------------------------------------------------------------------------*/

import type { ColorScheme, ColorMode, ColorMap } from "../ui/plotting/palette.js";

export type PressureUnit = "bar" | "Pa" | "kPa" | "MPa" | "atm" | "psi";
export type TemperatureUnit = "K" | "degC";
export type TimeUnit = "s" | "min" | "h";
export type ConcentrationUnit = "mol/kg" | "mmol/kg" | "mg/L";
export type FlowUnit =
  | "kmol/h"
  | "kmol/s"
  | "mol/h"
  | "mol/s"
  | "kg/h"
  | "kg/s"
  | "g/h"
  | "g/s";

export interface DisplayPrefs {
  pressure: PressureUnit;
  temperature: TemperatureUnit;
  time: TimeUnit;
  flow: FlowUnit;
  /** Which phase palette the canvas + streams use (Colours menu). */
  colorScheme: ColorScheme;
  /** What the stream colour ENCODES: phase (default) | temperature | pressure. */
  colorMode: ColorMode;
  /** Which gradient the temperature / pressure modes use (intuitive blue->red
   *  `turbo` by default; `coolwarm`; `viridis` for colour-blind safety). */
  colorMap: ColorMap;
  /** Significant figures shown for numeric values (default 3). */
  sigFigs: number;
  /** Molality-bearing axes / columns (speciation tables, scaling scans).
   *  Canonical is mol/kg water -- what the electrolyte ops emit. */
  concentration: ConcentrationUnit;
  /** Pinch GRID diagram Pareto cutoff (percent): a thermal stream whose duty
   *  is below this fraction of the TOTAL process heating+cooling duty is
   *  omitted from the DRAWING -- announced in the diagram footer, never
   *  silent -- while the pinch numbers (targets, curves, matches) keep
   *  counting every stream.  0 = draw all; default 5. */
  pinchParetoPct: number;
}

export const DEFAULT_PREFS: DisplayPrefs = {
  pressure: "bar",
  temperature: "K",
  time: "s",
  flow: "kmol/h",
  concentration: "mol/kg",
  colorScheme: "default",
  colorMode: "phase",
  colorMap: "turbo",
  sigFigs: 3,
  pinchParetoPct: 0,   // draw EVERY stream by default; the cutoff is opt-in
};

// Named presets the menu exposes as one-click options.  The student
// can then fine-tune individual dimensions on top of a preset.  Presets
// touch only the UNIT triple -- colour prefs are orthogonal and untouched.
export const PRESETS: {
  [key: string]: Pick<DisplayPrefs, "pressure" | "temperature" | "flow">;
} = {
  "Chem-eng": { pressure: "bar", temperature: "K", flow: "kmol/h" },
  "SI strict": { pressure: "Pa", temperature: "K", flow: "kmol/s" },
  "Lab": { pressure: "atm", temperature: "degC", flow: "mol/h" },
  "Mass-basis": { pressure: "bar", temperature: "K", flow: "kg/h" },
};

// =====================================================================
//  Conversions
// =====================================================================

const PRESSURE_FACTOR: Record<PressureUnit, number> = {
  Pa: 1.0,
  kPa: 1.0e3,
  MPa: 1.0e6,
  bar: 1.0e5,
  atm: 101325.0,
  psi: 6894.757,
};

// Flow factor: input is canonical SI (kmol/s for molar, kg/s for mass).
// `basis` says which canonical value to start from.
const FLOW_BASIS: Record<FlowUnit, "molar" | "mass"> = {
  "kmol/h": "molar",
  "kmol/s": "molar",
  "mol/h": "molar",
  "mol/s": "molar",
  "kg/h": "mass",
  "kg/s": "mass",
  "g/h": "mass",
  "g/s": "mass",
};

// `factor` = (value in canonical SI) / (value in this unit).
// Used as:  value_display = value_SI / factor.
const FLOW_FACTOR: Record<FlowUnit, number> = {
  "kmol/s": 1.0,
  "kmol/h": 1.0 / 3600.0,
  "mol/s": 1.0e-3,
  "mol/h": 1.0e-3 / 3600.0,
  "kg/s": 1.0,
  "kg/h": 1.0 / 3600.0,
  "g/s": 1.0e-3,
  "g/h": 1.0e-3 / 3600.0,
};

// =====================================================================
//  Significant figures (the display precision the student picks)
// =====================================================================
//
// Numbers are shown to N significant figures, NOT fixed decimals: 3 sig figs
// reads sensibly across magnitudes (370 K, 0.00345, 1.23e6 Pa) without a
// per-quantity decimal table.  The count is a DisplayPref, persisted, and
// spliced into controlDict so the C++ log honours the same choice.
//
// A module-level default lets the ~60 format call sites inherit the pref
// without threading it through each one; the store keeps it in sync via
// setDisplaySigFigs() on load and on every change.

let DEFAULT_SIG = 3;

export function setDisplaySigFigs(n: number): void {
  DEFAULT_SIG = Math.max(1, Math.min(12, Math.round(n || 3)));
}
export function getDisplaySigFigs(): number {
  return DEFAULT_SIG;
}

/** Format a number to `sig` significant figures.  Plain decimal for friendly
 *  magnitudes; scientific for very small / very large so trace ions and huge
 *  duties stay readable instead of collapsing to 0 or a wall of zeros. */
export function formatSig(v: number, sig: number = DEFAULT_SIG): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  const s = Math.max(1, Math.min(12, Math.round(sig)));
  if (v === 0) return "0";
  const r = Number(v.toPrecision(s));
  const a = Math.abs(r);
  if (a < 1e-4 || a >= 1e7) return r.toExponential(s - 1);
  return String(r);
}

export function pressureLabel(u: PressureUnit): string {
  return u;
}
export function temperatureLabel(u: TemperatureUnit): string {
  return u === "degC" ? "°C" : "K";
}
export function flowLabel(u: FlowUnit): string {
  return u;
}

// Pa -> picked unit.  Defensive against undefined / non-finite inputs:
// streams that come straight from a flowsheetDict (vs from a solver
// result) may have a missing P, T or F entry.  We render "—" rather
// than crash the panel (the crash propagates to the global
// ErrorBoundary in App.tsx and the user sees a wall of stack trace
// instead of the actual case).
// Pressure: Pa -> picked unit, then to `sig` significant figures (defaults
// to the session pref).  Callers may pass an explicit sig to override.
export function formatPressure(Pa: number,
  u: PressureUnit,
  sig: number = DEFAULT_SIG,
): string {
  if (Pa === undefined || Pa === null || !Number.isFinite(Pa)) return "—";
  return formatSig(Pa / PRESSURE_FACTOR[u], sig);
}

// Numeric (not string) converters -- for plot axes that need the converted
// VALUE, not a formatted label.  Pa -> picked unit; K -> picked unit.
export function paToDisplay(Pa: number, u: PressureUnit): number {
  return Pa / PRESSURE_FACTOR[u];
}
export function kToDisplay(K: number, u: TemperatureUnit): number {
  return u === "degC" ? K - 273.15 : K;
}
const TIME_FACTOR: Record<TimeUnit, number> = { s: 1.0, min: 60.0, h: 3600.0 };
export function sToDisplay(s: number, u: TimeUnit): number {
  return s / TIME_FACTOR[u];
}
export function timeLabel(u: TimeUnit): string { return u; }
/** Canonical SI flow (kmol/s molar, kg/s mass) -> picked unit's VALUE (numeric,
 *  for export/plots that need the number not a formatted label). */
export function flowToDisplay(F_si: number, u: FlowUnit): number {
  return F_si / FLOW_FACTOR[u];
}

// =====================================================================
//  Concentration (molality).  Canonical unit is mol/kg water -- what the
//  speciate / scalingScan ops emit.  mol/kg <-> mmol/kg is exact and
//  always available; mg/L NEEDS the species' molar mass [g/mol] (and
//  assumes rho ~ 1 kg/L, dilute -- same convention as the Explorer's
//  water-analysis editor).  The plot layer has no molar masses for
//  arbitrary speciation tables, so a renderer without one must fall back
//  (effectiveConcentrationUnit) rather than invent numbers.
// =====================================================================

/** mol/kg water -> picked unit.  mg/L without a molar mass is a fake
 *  number: this returns NaN rather than guessing (callers should have
 *  fallen back via effectiveConcentrationUnit first). */
export function molalToDisplay(m: number,
  u: ConcentrationUnit,
  mw_g_mol?: number,
): number {
  if (u === "mmol/kg") return m * 1.0e3;
  if (u === "mg/L")
    return mw_g_mol !== undefined && Number.isFinite(mw_g_mol)
      ? m * mw_g_mol * 1.0e3
      : NaN;
  return m;
}

export function concentrationLabel(u: ConcentrationUnit): string {
  return u;
}

/** The unit a renderer can honestly use: mg/L requires a molar mass for
 *  every plotted species; without one it falls back to canonical mol/kg
 *  (the axis label follows, so the plot says what is truly drawn). */
export function effectiveConcentrationUnit(u: ConcentrationUnit,
  hasMolarMass: boolean,
): ConcentrationUnit {
  return u === "mg/L" && !hasMolarMass ? "mol/kg" : u;
}

// Temperature: K -> picked unit, then sig figs.
export function formatTemperature(K: number,
  u: TemperatureUnit,
  sig: number = DEFAULT_SIG,
): string {
  if (K === undefined || K === null || !Number.isFinite(K)) return "—";
  const v = u === "degC" ? K - 273.15 : K;
  return formatSig(v, sig);
}

// Caller picks the right canonical input value depending on basis:
//   molar basis -> pass F_mol_per_s (kmol/s)
//   mass  basis -> pass F_mass_kg_per_s (kg/s)
export function formatFlow(F_si: number,
  u: FlowUnit,
  sig: number = DEFAULT_SIG,
): string {
  if (F_si === undefined || F_si === null || !Number.isFinite(F_si)) return "—";
  return formatSig(F_si / FLOW_FACTOR[u], sig);
}

export function flowBasis(u: FlowUnit): "molar" | "mass" {
  return FLOW_BASIS[u];
}

// Render an AUTHORED scalar (a value carrying its OWN authored unit, e.g. a
// unit-op's `P 1.0 bar` / `T 25 degC` / `F 100 kmol/h` operation param) in the
// user's chosen display prefs -- so node params FOLLOW the units menu exactly
// like the stream chips (which already arrive in canonical SI).  Returns null
// when `unit` is not a dimension the prefs system knows, so the caller can fall
// back to showing the raw authored value.  This is what stops a node reading
// "P = 1 bar" while its streams read "100000 Pa" under the SI-strict preset.
export function authoredScalarToPrefs(
  v: number,
  unit: string | undefined,
  prefs: DisplayPrefs,
): string | null {
  if (unit === undefined || !Number.isFinite(v)) return null;
  // pressure: authored unit -> Pa -> prefs
  if (Object.prototype.hasOwnProperty.call(PRESSURE_FACTOR, unit)) {
    const Pa = v * PRESSURE_FACTOR[unit as PressureUnit];
    return `${formatPressure(Pa, prefs.pressure)} ${pressureLabel(prefs.pressure)}`;
  }
  // temperature
  if (unit === "K" || unit === "degC") {
    const K = unit === "degC" ? v + 273.15 : v;
    return `${formatTemperature(K, prefs.temperature)} ${temperatureLabel(prefs.temperature)}`;
  }
  // flow: only when the authored basis matches the pref basis (mass<->molar
  // needs a molar mass we do not have here) -- else fall back to raw.
  if (Object.prototype.hasOwnProperty.call(FLOW_FACTOR, unit)) {
    if (FLOW_BASIS[unit as FlowUnit] !== FLOW_BASIS[prefs.flow]) return null;
    const si = v * FLOW_FACTOR[unit as FlowUnit];
    return `${formatFlow(si, prefs.flow)} ${flowLabel(prefs.flow)}`;
  }
  return null;
}

// =====================================================================
//  Inverse conversions (user-typed display value -> canonical SI).
//  Used by the PropertyPanel's edit fields, so the dict on disk and
//  the WASM MEMFS always store canonical SI.
// =====================================================================

export function parsePressure(displayValue: number, u: PressureUnit): number {
  return displayValue * PRESSURE_FACTOR[u];
}

export function parseTemperature(displayValue: number, u: TemperatureUnit): number {
  return u === "degC" ? displayValue + 273.15 : displayValue;
}

export function parseFlow(displayValue: number, u: FlowUnit): number {
  return displayValue * FLOW_FACTOR[u];
}
