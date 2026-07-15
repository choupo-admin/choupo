/*---------------------------------------------------------------------------*\
  ExploreWorkspace — the interactive Property Explorer.

  A visualiser scratchpad (gui-credo.md §3; design in docs/property-explorer-
  design.md): browse the standard catalogue, build a SET, pick a PLOT TYPE
  (gated by set size, disabled-with-reason — the "see, then decide" pedagogy),
  SEE the curve.  Reimplements ZERO physics: each plot synthesizes a transient
  choupoProps case (case/exploreSynth.ts), runs it via the WASM adapter (the
  SAME engine op an authored case uses), renders with CsvAutoPlot.  Nothing is
  written to disk; "Author this exploration" is the hand-off.

  PURE vs MIXTURE (the pedagogy that drives the layout): composition is shown
  ONLY where it changes the answer.  A per-component property (Psat, ...) is an
  intrinsic PURE-component curve — one curve per selected compound, composition
  irrelevant; the controls hide composition and say so.  A mixture scalar
  (Z, v_molar, H, S, ...) is evaluated at a composition (equimolar by default),
  shown with a loud badge.  Binary VLE sweeps composition along the x-axis, so
  composition appears there as the axis.  Ternary is gated until the engine op
  lands (Fase B) — never faked in TS.
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon, Alert, Badge, Box, Button, Chip, Code, Collapse, CopyButton, Group, Loader, NumberInput,
  Popover, SegmentedControl, Select, Stack, Switch, Text, Tooltip,
} from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import {
  IconAdjustmentsHorizontal, IconBook, IconChevronDown, IconChevronLeft, IconChevronRight,
  IconExternalLink,
} from "@tabler/icons-react";

import { resolveAdapter } from "../adapters/index.js";
import { EXPLORE_OUTPUT, synthesizeExploreCase, type ExploreSpec } from "../case/exploreSynth.js";
import { caseComponentFiles, caseComponents, mergeCatalogue, metaByName, type ComponentMeta } from "../case/catalogue.js";
import { fromJson, serialize } from "../dict/index.js";
import { CsvAutoPlot, axisDisplay } from "./plotting/CsvAutoPlot.js";
import { GibbsMapPanel } from "./GibbsMapPanel.js";
import type { JsonDict } from "../dict/index.js";
import { PurePhaseDiagram } from "./plotting/PurePhaseDiagram.js";
import { PsychroPlot } from "./plotting/PsychroPlot.js";
import { BinaryLlePlot } from "./plotting/BinaryLlePlot.js";
import { McCabePlot } from "./plotting/McCabePlot.js";
import { FlashPlot } from "./plotting/FlashPlot.js";
import { CompoundBrowser } from "./explore/CompoundBrowser.js";
import { EstimateForm } from "./explore/EstimateForm.js";
import { useRailWidth, type RailWidthHandle } from "./explore/useRailWidth.js";
import { popOutExploreMccabe } from "./explore/exploreMccabePopOut.js";
import { buildLocalUnifac, unifacGroupsBlock, hasUnifacGroups } from "../case/unifacGroups.js";
import { type PlotKind, viewsFor } from "../case/exploreViews.js";
import { hasPair } from "../case/pairsCatalogue.js";
import { solidPhaseFor } from "../case/solidPhaseData.js";
import { mergeTernaryCsvs, workerCount } from "../case/ternaryParallel.js";
import { familyForProperty, mergeMethodCsvs, methodSpread, specForModel } from "../case/methodCompare.js";
import { PLOT_COLORS } from "./plotting/plotly.js";
import { useStore } from "../state/store.js";
import {
  kToDisplay, paToDisplay, parseTemperature, parsePressure, temperatureLabel, pressureLabel,
} from "../state/displayUnits.js";

interface PlotType {
  id: PlotKind;
  label: string;
  min: number;
  max: number;      // 99 = "any"
  vle: boolean;     // requires every selected component VLE-able
  why: string;      // disabled-reason hint
  comingSoon?: string; // if set, the type is shown but always gated (not yet wired)
  needsUnifac?: boolean; // requires every selected component to have a UNIFAC decomposition
}
const PLOT_TYPES: PlotType[] = [
  { id: "scan",  label: "Property vs T/P", min: 1, max: 99, vle: false, why: "pick at least one component" },
  // Pure-compound P-T phase diagram: saturation curve to the critical point.
  { id: "phase", label: "Pure phase diagram (P-T)", min: 1, max: 1, vle: true,
    why: "needs exactly 1 VLE-able component (Tc + vapour pressure)" },
  { id: "txy",   label: "Binary boiling envelope (T-x-y)", min: 2, max: 2, vle: true, why: "needs exactly 2 VLE-able components" },
  { id: "gamma", label: "γ(x)", min: 2, max: 2, vle: true, why: "needs exactly 2 VLE-able components" },
  // McCabe-Thiele binary distillation: the interactive staircase over the SAME
  // y_eq(x) the T-x-y run already computes (no new physics).  R/q knobs re-walk
  // the staircase in pure TS — the curve only changes when P or the model change.
  { id: "mccabe", label: "McCabe-Thiele (distillation)", min: 2, max: 2, vle: true, why: "needs exactly 2 VLE-able components" },
  // Binary flash: the same y*(x) curve, read as an equilibrium tie-line through
  // the feed z — the lever rule gives V/F.  T (or V/F) and P are the 2 knobs
  // (Duhem); pure-TS redraw, no re-solve, like McCabe.
  { id: "flash", label: "Binary flash (x-y + lever rule)", min: 2, max: 2, vle: true, why: "needs exactly 2 VLE-able components" },
  // Binary LLE: g_mix(x) + the common-tangent construction reading the two
  // coexisting liquid compositions off a single LL flash (predictive UNIFAC γ).
  { id: "binaryLle", label: "Binary LLE (g_mix + tangent)", min: 2, max: 2, vle: false, needsUnifac: true,
    why: "needs exactly 2 components with UNIFAC groups (e.g. water + nButanol)" },
  // VLE boiling-temperature surface over the composition triangle — works for
  // ANY 3 VLE-able compounds (ideal binaries fine; needs only the 3 Psat).
  { id: "ternary", label: "Ternary boiling surface (T_bubble)", min: 3, max: 3, vle: true,
    why: "needs exactly 3 VLE-able components" },
  // LLE/solubility map (miscibility region + tie-lines).  Activity from UNIFAC
  // (group contribution) — no fitted binary pairs needed, so it works for real
  // systems (water/ethanol/benzene, …) whose components have UNIFAC groups.
  { id: "ternaryLle", label: "Ternary solubility (LLE)", min: 3, max: 3, vle: true, needsUnifac: true,
    why: "needs exactly 3 components with UNIFAC groups (e.g. water, ethanol, benzene)" },
  // Psychrometric chart: a carrier gas + a condensable vapour, ANY pair / P / T.
  // Carrier = the lower-Tb (stays gas); condensable = the higher-Tb (needs Psat).
  { id: "psychro", label: "Psychrometric chart", min: 2, max: 2, vle: false,
    why: "pick a carrier gas + a condensable (the condensable needs a vapour-pressure model)" },
  // Membrane-scaling audit (scalingScan engine op): speciate a water analysis
  // at increasing RO/NF recovery and SEE each mineral's SI = log10(IAP/K)
  // cross zero — the crossing IS the max safe recovery.  Needs only water (the
  // solvent); the ions are set in the analysis panel, not the compound set.
  { id: "scaling", label: "Scaling (SI vs recovery)", min: 1, max: 99, vle: false,
    why: "select water + a dissolved electrolyte (e.g. NaCl) — RO-scaling needs ions" },
  // Gibbs equilibrium map (forum 2026-07-02): iso-lines of equilibrium
  // composition over T x P — why industrial reactors fix T and P.
  { id: "gibbsmap", label: "Equilibrium map (Gibbs)", min: 2, max: 12, vle: false,
    why: "pick 2+ gas-phase species with parseable formulas (e.g. N2 + H2 + NH3)" },
  // Steam tables (steamTables engine op): IAPWS-IF97 (R7-97(2012)), the WATER
  // industrial formulation — the saturated-steam table (region-4 line) or an
  // isobar (h,s,v,cp vs T; the engine announces the Tsat crossing).
  { id: "steam", label: "Steam tables (IF97)", min: 1, max: 1, vle: false,
    why: "IF97 is the water formulation — select water alone" },
];

// Short lens labels for the toolbar SegmentedControl (the full label rides the
// tooltip).  Keeps the one toolbar row from wrapping while the long names stay
// discoverable on hover.
const LENS_SHORT: Record<PlotKind, string> = {
  scan: "scan", phase: "P-T", txy: "T-x-y", flash: "flash", gamma: "γ(x)", mccabe: "McCabe",
  binaryLle: "LLE", ternary: "ternary", ternaryLle: "tern.LLE",
  psychro: "psychro", scaling: "scaling", steam: "steam", gibbsmap: "gibbsmap",
};

// PURE = per-component intrinsic properties the engine resolves as <prop>_<c>:
// one curve per compound, composition has NO effect.  Everything else is a
// MIXTURE scalar evaluated at a composition.
const PURE_PROPS = ["Psat", "Cp_liquid"];
const MIXTURE_PROPS = ["Z", "v_molar", "Cp_ig", "H_real", "S_real"];
// Transport properties are their OWN family: the engine computes them from
// (T, x) only — they NEVER call the EOS (PropertyEvaluator.cpp:116-130).  The
// model is chosen WITHIN a family (Andrade vs Vogel), never across to the EOS.
const TRANSPORT_PROPS = ["viscosity_liquid", "viscosity_gas", "thermal_conductivity_liquid", "thermal_conductivity"];
// The ONLY scan properties that actually call eos() (PropertyEvaluator.cpp:110-113);
// the EOS picker shows for these alone (positive allowlist, not subtraction).
const EOS_PROPS = ["Z", "v_molar", "H_real", "S_real"];
const isPureProp = (p: string) => PURE_PROPS.includes(p);
const isTransportProp = (p: string) => TRANSPORT_PROPS.includes(p);
// Pretty labels for the transport keys (the engine keys are long/underscored).
const TRANSPORT_LABEL: Record<string, string> = {
  viscosity_liquid: "μ liquid", viscosity_gas: "μ gas",
  thermal_conductivity_liquid: "k liquid", thermal_conductivity: "k gas",
};
// Transport correlations with a real within-family CHOICE — the picker appears
// ONLY where choosing moves the curve.  Gas viscosity/conductivity are
// single-model (Chung / Eucken), so no picker is shown for them.
function transportModelsFor(property: string): string[] {
  if (property === "viscosity_liquid") return ["Andrade", "Vogel"];
  if (property === "thermal_conductivity_liquid") return ["SatoRiedel", "Latini"];
  return [];
}

// Scaling (SI vs recovery): the editable water analysis.  Master ions the
// standards speciation catalogue covers, with MW [g/mol] copied from
// data/standards/electrolyte/ions.dat ONLY for the mg/L <-> mol/kg display
// conversion (at rho ~ 1 kg/L, dilute) — the synthesized dict always carries
// mol/kg water; the engine never sees mg/L.  Defaults = the representative
// brackish groundwater of tutorials/props/electrolyte/scaling_ro_brackish
// (~1500 mg/L TDS, charge-balanced).
const SCALING_IONS: { ion: string; mw: number }[] = [
  { ion: "Ca", mw: 40.078 }, { ion: "Mg", mw: 24.305 }, { ion: "Na", mw: 22.99 },
  { ion: "K", mw: 39.098 }, { ion: "Cl", mw: 35.453 }, { ion: "SO4", mw: 96.06 },
  { ion: "HCO3", mw: 61.02 },
];
const BRACKISH_DEFAULT: { [ion: string]: number } = {
  Ca: 0.0021, Mg: 0.0011, Na: 0.0158, K: 0.0003,
  Cl: 0.0124, SO4: 0.0026, HCO3: 0.0030,
};
// The minerals the equilibrium toggle drives to SI = 0 — the canonical RO/NF
// scaling pair (carbonate + sulfate) the scan already reports SI for, matching
// tutorials/props/electrolyte/precipitation_ro_brackish.  NOT a user picker:
// equilibrate the same minerals the scaling kind tracks (credo — no extra
// mineral selector).  calcite ACIDIFIES (releases H+ into the pH-solve row);
// gypsum couples through the shared Ca.
const SCALING_EQUIL_MINERALS = ["calcite", "gypsum"];

// SI = log10(IAP/K): the zero crossing IS the lesson (max safe recovery).
const SI_REFERENCE = [
  { y: 0, label: "saturation — above this line the mineral precipitates" },
];

/** Parse a chemical formula ("C2H5OH", "NH3") into element counts.  Best
 *  effort: element = capital + optional lowercase, count = trailing digits;
 *  parentheses are expanded one level ("Ca(OH)2").  Unparseable -> {}. */
function parseFormulaAtoms(formula: string): { [el: string]: number } {
  if (!formula || /[^A-Za-z0-9()]/.test(formula)) return {};
  let f = formula;
  // expand one level of (...)n
  f = f.replace(/\(([A-Za-z0-9]+)\)(\d+)/g, (_m, grp: string, n: string) =>
    grp.repeat(parseInt(n, 10)));
  const out: { [el: string]: number } = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(f)) !== null) {
    if (m.index !== consumed) return {};        // gap -> unparseable
    consumed = m.index + m[0].length;
    const el = m[1]!;
    const n = m[2] ? parseInt(m[2], 10) : 1;
    out[el] = (out[el] ?? 0) + n;
  }
  return consumed === f.length ? out : {};
}

/** Drop one named column from a CSV (header + every row).  The scaling CSV
 *  carries the ionic strength I [mol/kg] beside the dimensionless SI columns;
 *  I is read out as text (its own unit) instead of sharing the SI axis. */
function dropCsvColumn(csv: string, name: string): string {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0) return csv;
  const i = lines[0]!.split(",").map((s) => s.trim()).indexOf(name);
  if (i < 0) return csv;
  return lines.map((l) => {
    const cells = l.split(",");
    cells.splice(i, 1);
    return cells.join(",");
  }).join("\n");
}

// Steam tables (IF97): which CSV columns each property pick shows, and the
// rename that keeps the plot's unit heuristic HONEST.  The steam CSVs are
// MASS-basis SI (J/kg, J/(kg·K), m³/kg) while the generic plot maps the bare
// tokens h/s/v/cp to MOLAR units — so the kept columns are renamed to steam-
// specific names (hf, hg, …, hmass, …) the unit map labels correctly.  Pure
// column selection/renaming on the engine's CSV — zero physics in TS.
const STEAM_SAT_VIEWS: Record<string, { label: string; keep: string[]; rename: Record<string, string> }> = {
  h:    { label: "h (h_f, h_g, h_fg)", keep: ["h_f", "h_g", "h_fg"],
          rename: { h_f: "hf", h_g: "hg", h_fg: "hfg" } },
  s:    { label: "s (s_f, s_g)", keep: ["s_f", "s_g"], rename: { s_f: "sf", s_g: "sg" } },
  v:    { label: "v (v_f, v_g)", keep: ["v_f", "v_g"], rename: { v_f: "vf", v_g: "vg" } },
  psat: { label: "psat", keep: ["psat"], rename: {} },
};
const STEAM_ISO_VIEWS: Record<string, { label: string; keep: string[]; rename: Record<string, string> }> = {
  h:  { label: "h", keep: ["h"], rename: { h: "hmass" } },
  s:  { label: "s", keep: ["s"], rename: { s: "smass" } },
  v:  { label: "v", keep: ["v"], rename: { v: "vmass" } },
  cp: { label: "cp", keep: ["cp"], rename: { cp: "cpmass" } },
};

/** Keep T + the chosen property columns of a steam CSV (renamed per the view).
 *  The mixed-magnitude full table (psat ~1e7 Pa beside v_f ~1e-3 m³/kg) is
 *  unreadable on one axis — one property family at a time reads best. */
function shapeSteamCsv(csv: string, mode: "saturation" | "isobar", prop: string): string {
  const view = (mode === "saturation" ? STEAM_SAT_VIEWS : STEAM_ISO_VIEWS)[prop];
  if (!view) return csv;
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0) return csv;
  const header = lines[0]!.split(",").map((s) => s.trim());
  const keep = header.map((h, i) => ({ h, i })).filter(({ h }) => h === "T" || view.keep.includes(h));
  if (keep.length < 2) return csv;   // stale CSV from another mode — pass through
  return [
    keep.map(({ h }) => view.rename[h] ?? h).join(","),
    ...lines.slice(1).map((l) => {
      const cells = l.split(",");
      return keep.map(({ i }) => cells[i] ?? "").join(",");
    }),
  ].join("\n");
}

/** First and last value of a named CSV column (the scan end-points). */
function csvColumnEnds(csv: string, name: string): { first: number; last: number } | null {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const i = lines[0]!.split(",").map((s) => s.trim()).indexOf(name);
  if (i < 0) return null;
  const first = parseFloat(lines[1]!.split(",")[i] ?? "");
  const last = parseFloat(lines[lines.length - 1]!.split(",")[i] ?? "");
  return Number.isFinite(first) && Number.isFinite(last) ? { first, last } : null;
}

// Map the active plot to the matching Theory Guide section (hyperref destlabel
// turns each \label{...} into a PDF named destination, so #nameddest jumps
// straight there).  The PDF is served at /docs/theoryGuide.pdf (dev + site).
function theoryAnchor(plotType: PlotKind, property: string): string {
  switch (plotType) {
    case "txy": return "ch:flash";          // binary VLE / bubble-dew
    case "mccabe": return "sec:mccabe-tray-efficiency"; // McCabe-Thiele staircase + tray efficiency (O'Connell/Murphree)
    case "flash": return "ch:flash";        // binary flash: tie-line + lever rule
    case "gamma": return "ch:activity";     // activity coefficients
    case "ternary": return "sec:ternary";   // ternary boiling surface
    case "ternaryLle": return "ch:lle-gibbs"; // liquid-liquid / solubility
    case "phase": return "ch:vap";           // vapour pressure / saturation
    case "psychro": return "ch:drying";      // psychrometrics / wet-bulb / Lewis number
    case "scaling": return "ch:electrolytes"; // ionic strength / activity / Pitzer
    case "gibbsmap": return "ch:gibbs";       // equilibrium maps (forum 2026-07-02)
    case "steam": return "ch:vap";           // saturation line / vapour pressure
    default:                                 // property scan
      if (property === "Psat") return "ch:vap";
      if (property === "Cp_liquid" || property === "Cp_ig") return "ch:heat";
      if (property === "viscosity_liquid" || property === "viscosity_gas") return "ch:viscosity";
      if (property === "thermal_conductivity_liquid" || property === "thermal_conductivity") return "ch:thermal-cond";
      return "ch:fugacity";                 // Z / v_molar / H / S → EoS departure
  }
}
const theoryUrl = (plotType: PlotKind, property: string) =>
  `/docs/theoryGuide.pdf#nameddest=${theoryAnchor(plotType, property)}`;

function num(v: number | string, fallback: number): number {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function ExploreWorkspace() {
  const [selected, setSelected] = useState<string[]>([]);
  const [plotType, setPlotType] = useState<PlotKind>("scan");
  // The resizable left-component-bar (Vítor's ask) — drag the right border,
  // double-click to reset, persisted GLOBALLY.  See useRailWidth.ts.
  const rail = useRailWidth();
  // scan controls
  const [property, setProperty] = useState("Psat");
  const [axisVar, setAxisVar] = useState<"T" | "P">("T");
  // Swept-axis range kept PER DIMENSION (K vs Pa) so switching the axis or the
  // plot kind never re-reads a pressure as a temperature: the psychrometric
  // chart reads the T-range in Kelvin even right after a P-scan.
  const [tFrom, setTFrom] = useState(290);    // K
  const [tTo, setTTo] = useState(380);        // K
  const [pFrom, setPFrom] = useState(5e4);    // Pa (0.5 bar)
  const [pTo, setPTo] = useState(5e5);        // Pa (5 bar)
  const fromV = axisVar === "T" ? tFrom : pFrom;
  const toV = axisVar === "T" ? tTo : pTo;
  const setFromV = axisVar === "T" ? setTFrom : setPFrom;
  const setToV = axisVar === "T" ? setTTo : setPTo;
  const [fixedT, setFixedT] = useState(298.15); // K, when P is swept
  // shared
  const [nPts, setNPts] = useState(60);
  const [tieStride, setTieStride] = useState(4);  // ternary LLE tie-line density
  const [fixedP, setFixedP] = useState(101325); // Pa (canonical SI; display via the Units menu)
  const [eos, setEos] = useState("idealGas");
  const [transportModel, setTransportModel] = useState("Andrade"); // Andrade/Vogel, SatoRiedel/Latini
  // (v) multi-method comparison
  const [compareOn, setCompareOn] = useState(false);
  const [compareModels, setCompareModels] = useState<string[]>([]);
  const [compareInfo, setCompareInfo] = useState<{ models: string[]; spread: { absMax: number; relMaxPct: number }; property: string } | null>(null);
  const [activity, setActivity] = useState("NRTL"); // for VLE templates
  // Psychrometry: relative-humidity curve interval to plot (%).
  const [rhFrom, setRhFrom] = useState(10);
  const [rhTo, setRhTo] = useState(90);
  const [rhStep, setRhStep] = useState(20);
  const [wbStep, setWbStep] = useState(10); // ΔT (°C) between wet-bulb / adiabatic-saturation anchor lines
  const [psyYMax, setPsyYMax] = useState(0); // y-axis cap [kg/kg]; 0 = auto (full)
  // Scaling: the water analysis (TOTAL molalities, mol/kg water — canonical;
  // the unit select converts for DISPLAY only), pH, recovery range.  Setting
  // an ion to 0 drops it from the synthesized `totals {}`.
  const [ionTotals, setIonTotals] = useState<{ [ion: string]: number }>({ ...BRACKISH_DEFAULT });
  const [ionUnit, setIonUnit] = useState<"mg/L" | "mol/kg">("mg/L");
  // pH default = SOLVED from electroneutrality (`pH solve;` — the honest
  // flagship: the engine announces the feed charge imbalance the solved pH
  // absorbs).  "given" holds the numeric pH across the scan instead.
  const [scalingPHMode, setScalingPHMode] = useState<"solve" | "given">("solve");
  const [scalingPH, setScalingPH] = useState(7.8);
  // closed (default): DIC concentrates with the water.  open: the analysis
  // equilibrates with CO2(g) at pCO2 -> `atmosphere { pCO2 <v> atm; }`.
  const [scalingAtm, setScalingAtm] = useState<"closed" | "open">("closed");
  const [scalingPCO2, setScalingPCO2] = useState(4.2e-4);  // atm
  const [scalingT, setScalingT] = useState(298.15);        // K (engine default)
  // Ionic-activity model: davies (extended-DH, default, to I ≈ 0.5) vs pitzer
  // (Pitzer-HMW, brine-grade, to I ≈ 6).  The SI curves FORK at high I — the
  // flagship differentiator the engineering recovery decision flips on.
  const [scalingActivity, setScalingActivity] = useState<"davies" | "pitzer">("davies");
  // Equilibrium precipitation: off (default) = SI-only propensity curve; on =
  // let the canonical RO scaling minerals (calcite, gypsum) precipitate to
  // SI = 0 and report the amount (the thermodynamic CEILING, not a deposit
  // prediction).  Same mineral set the scan already reports SI for; no picker.
  const [scalingEquil, setScalingEquil] = useState(false);
  // Optional feed flow [m3/h] -> the kg/day scale-rate column (only with equil).
  const [scalingFeedFlow, setScalingFeedFlow] = useState(10);

  // ---- Gibbs equilibrium map state ----------------------------------------
  const [gmFeed, setGmFeed] = useState<{ [c: string]: number }>({});
  const [gmTfrom, setGmTfrom] = useState(573.15);   // K
  const [gmTto, setGmTto] = useState(973.15);
  const [gmPfrom, setGmPfrom] = useState(1.0e5);    // Pa
  const [gmPto, setGmPto] = useState(3.0e7);
  const [gmMetricSp, setGmMetricSp] = useState<string | null>(null);
  const [gmDeltaT, setGmDeltaT] = useState(0);      // K, advanced-only
  const [gmAdvanced, setGmAdvanced] = useState(false);
  const [recFrom, setRecFrom] = useState(0);
  const [recTo, setRecTo] = useState(0.85);
  // Steam tables (IF97): mode + per-mode T range (canonical SI, K) + isobar P.
  // Saturation defaults span the region-1/2-on-the-line validity (0.01–350 °C);
  // the isobar defaults match the tutorial's 1 bar / 20–300 °C scan.
  const [steamMode, setSteamMode] = useState<"saturation" | "isobar">("saturation");
  const [steamProp, setSteamProp] = useState("h");   // display-side column pick
  const [satFrom, setSatFrom] = useState(273.16);    // K (0.01 °C)
  const [satTo, setSatTo] = useState(623.15);        // K (350 °C)
  const [isoFrom, setIsoFrom] = useState(293.15);    // K (20 °C)
  const [isoTo, setIsoTo] = useState(573.15);        // K (300 °C)
  const [steamP, setSteamP] = useState(1.0e5);       // Pa (1 bar)

  const [csv, setCsv] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Op advisories lifted off the run LOG (the Explorer has no log tab — the
  // engine's honesty lines, e.g. scalingScan's Davies trust-range warning,
  // must not be swallowed).
  const [opAdvisories, setOpAdvisories] = useState<string[]>([]);
  const [snippetOpen, setSnippetOpen] = useState(false);
  // The honesty footer (alerts + validity readouts) collapses to a `⚠ N` pill
  // so it never pushes the plot's top origin down — but it stays VISIBLE
  // (numerical-honesty credo), defaulting OPEN whenever there is something to
  // say.  A user can fold it; a NEW alert re-expands it (see the effect below).
  const [footerOpen, setFooterOpen] = useState(true);

  // Display units (the TopBar Units menu) — state stays canonical SI; the inputs
  // convert for DISPLAY only, so the synthesized propsDict is always SI.
  const prefs = useStore((s) => s.displayPrefs);
  const Tu = prefs.temperature, Pu = prefs.pressure;
  // from/to carry the SWEPT-axis dimension: K (T-axis) or Pa (P-axis), in SI.
  const axisToDisp = (si: number) => (axisVar === "T" ? kToDisplay(si, Tu) : paToDisplay(si, Pu));
  const axisToSI   = (d: number)  => (axisVar === "T" ? parseTemperature(d, Tu) : parsePressure(d, Pu));
  const axisUnit   = axisVar === "T" ? temperatureLabel(Tu) : pressureLabel(Pu);

  // Scaling analysis: mol/kg (canonical, what the dict carries) <-> the chosen
  // display unit.  mg/L converts at rho ~ 1 kg/L (a dilute analysis) — a
  // DISPLAY convenience exactly like kToDisplay, not engine physics.
  const ionToDisp = (m: number, mw: number) =>
    ionUnit === "mg/L" ? Number((m * mw * 1000).toFixed(2)) : m;
  const ionToMolal = (d: number, mw: number) =>
    ionUnit === "mg/L" ? d / (mw * 1000) : d;

  // Case-local components (G1/G2): when a case is open, its constant/components/
  // *.dat appear in the browser, supply UNIFAC groups, and ship to the WASM run.
  // With no case open, all three are empty → behaviour identical to the
  // standalone Explorer (mergeCatalogue returns the same CATALOGUE reference).
  const caseRaw = useStore((s) => s.caseFiles.rawFiles);
  // catalogue (merged) = the flat NAME-LOOKUP pool (gating, metaByName);
  // caseList = the SEPARATE case-component list the browser shows apart from
  // the standard catalogue; localComponentFiles = those bodies flattened to the
  // case root so the synthesized flat run resolves a sector-nested component.
  const catalogue = useMemo<ComponentMeta[]>(() => mergeCatalogue(caseRaw), [caseRaw]);

  // Default metric species: the one spanning the MOST distinct elements
  // (a compound like NH3 over diatomic reactants N2/H2 — usually the product
  // of interest); ties break to the last selected.  Used identically by the
  // dropdown value and the spec target so they never disagree.
  const gmDefaultSpecies = useMemo(() => {
    let best = selected[selected.length - 1] ?? null, bestN = -1;
    for (const c of selected) {
      const nEl = Object.keys(parseFormulaAtoms(metaByName(c, catalogue)?.formula ?? "")).length;
      if (nEl > bestN) { bestN = nEl; best = c; }
    }
    return best;
  }, [selected, catalogue]);

  const caseList = useMemo<ComponentMeta[]>(() => caseComponents(caseRaw), [caseRaw]);
  const localUnifac = useMemo(() => buildLocalUnifac(caseRaw), [caseRaw]);
  const localComponentFiles = useMemo<Record<string, string>>(() => caseComponentFiles(caseRaw), [caseRaw]);
  const hasLocal = Object.keys(localComponentFiles).length > 0;

  // Honest DEFAULT model: a fitted-pair model (NRTL/Wilson) with NO curated pair
  // silently collapses to ideal — a meaningless lens.  When a freshly-selected
  // binary has no such pair but DOES have UNIFAC groups, default to UNIFAC
  // (predictive, shows the real non-ideality + any split) instead of ideal-garbage.
  // Fires only on a COMPONENT change (not on model change), so a manual pick of
  // NRTL for the same pair is respected.
  const unifacAble = useCallback((c: string) =>
    (metaByName(c, catalogue)?.hasUnifac ?? false) || hasUnifacGroups(c, localUnifac),
    [catalogue, localUnifac]);
  useEffect(() => {
    if (selected.length !== 2) return;
    const a = selected[0]!, b = selected[1]!;
    if (!unifacAble(a) || !unifacAble(b)) return;
    setActivity((prev) =>
      (prev === "NRTL" || prev === "Wilson") && !hasPair(prev, a, b) ? "UNIFAC" : prev);
  }, [selected, unifacAble]);

  const addComp = useCallback((n: string) => setSelected((s) => (s.includes(n) ? s : [...s, n])), []);
  const removeComp = useCallback((n: string) => setSelected((s) => s.filter((x) => x !== n)), []);

  // G3: the in-Explorer "estimate a missing component" modal.
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimatePrefill, setEstimatePrefill] = useState("");
  const openEstimate = useCallback((nm: string) => { setEstimatePrefill(nm); setEstimateOpen(true); }, []);

  // McCabe-Thiele consumes the SAME engine run as the T-x-y (the y_eq(x) curve),
  // so it walks the VLE path for the spec / model pickers / fixed-P control.
  const isVle = plotType === "txy" || plotType === "gamma" || plotType === "mccabe" || plotType === "flash";
  const isTernary = plotType === "ternary" || plotType === "ternaryLle";
  // Scan mode is DERIVED from the property (correct-by-construction): a
  // per-component property is a pure-component comparison; anything else is a
  // mixture scalar.  No manual toggle that could pick a physically-wrong combo.
  const scanMode: "pure" | "mixture" = isPureProp(property) ? "pure" : "mixture";

  // availability + reason per plot type (the gating IS the pedagogy)
  // Single source: a view is applicable iff it is in viewsFor(classify(sel)).
  // (Inapplicable views DISAPPEAR from the strip; reasonFor's string only shows
  // for the ACTIVE view, if the selection drifts out from under it.)
  const reasonFor = useCallback((pt: PlotType): string | null => {
    if (pt.comingSoon) return pt.comingSoon;
    if (viewsFor(selected, catalogue, localUnifac).has(pt.id)) return null;
    if (selected.length < pt.min || selected.length > pt.max) return pt.why;
    // applicable count but wrong physical class -> the view's own hint says why
    return pt.why;
  }, [selected, catalogue, localUnifac]);

  const active = PLOT_TYPES.find((p) => p.id === plotType) ?? PLOT_TYPES[0]!;
  const activeReason = reasonFor(active);

  // The lenses that currently APPLY (single source: viewsFor).  Drives the
  // strip grouping, the "what unlocks next" line, and the new-lens pulse.
  const currentViews = useMemo(
    () => viewsFor(selected, catalogue, localUnifac),
    [selected, catalogue, localUnifac]);

  // New-lens PULSE — when a lens NEWLY appears in the strip (diff the previous
  // viewsFor set via a ref), give it a 600ms accent ring so the unlock is felt,
  // not silent.  The single most important discoverability addition.
  const prevViewsRef = useRef<Set<PlotKind>>(currentViews);
  const [pulsing, setPulsing] = useState<Set<PlotKind>>(new Set());
  useEffect(() => {
    const prev = prevViewsRef.current;
    const fresh = new Set<PlotKind>();
    currentViews.forEach((v) => { if (!prev.has(v)) fresh.add(v); });
    prevViewsRef.current = currentViews;
    if (fresh.size === 0) return;
    setPulsing(fresh);
    const t = setTimeout(() => setPulsing(new Set()), 650);
    return () => clearTimeout(t);
  }, [currentViews]);

  // "What unlocks next" — a structural fact (not a recommendation): what ONE
  // more pick of each selection-class would materialise, diffed over the SAME
  // exploreViews source.  States teaching ("two VLE compounds HAVE a McCabe
  // diagram"), never a black-box "recommended" nudge.
  const unlockLine = useMemo<string | null>(() => {
    if (selected.length === 0) return null;
    const has = (n: string) => metaByName(n, catalogue);
    const vleCount = selected.filter((c) => has(c)?.vleAble).length;
    const allVle = selected.every((c) => has(c)?.vleAble);
    const hasWater = selected.includes("water");
    const hasElectrolyte = selected.some((c) => has(c)?.isElectrolyte);
    if (selected.length === 1 && vleCount === 1)
      return "+1 VLE compound → boiling envelope, γ(x), McCabe-Thiele";
    if (selected.length === 2 && allVle && !currentViews.has("ternary"))
      return "+1 VLE compound → ternary boiling surface";
    if (hasWater && !hasElectrolyte && !currentViews.has("scaling"))
      return "+ a dissolved salt (e.g. NaCl) → RO-scaling audit";
    return null;
  }, [selected, catalogue, currentViews]);

  const spec = useMemo<ExploreSpec>(() => {
    const composition: { [c: string]: number } = {};
    selected.forEach((c) => { composition[c] = 1 / Math.max(selected.length, 1); });

    if (plotType === "phase") {
      // Pure-compound P-T via the purePhaseDiagram engine op (Clapeyron physics
      // lives there).  Saturation uses AmbroseWalton (valid to Tc) via a
      // case-local overlay; `solid` (if curated) adds sublimation + fusion.
      const c = selected[0] ?? "";
      return {
        components: [c],
        properties: [],
        axis: { variable: "T", from: 0, to: 1, n: 2 },   // unused
        state: { composition: { [c]: 1 } },
        phaseDiagram: { grid: Math.max(20, Math.round(nPts)), solid: solidPhaseFor(c) },
        componentFiles: {
          ...localComponentFiles,   // case-local components reach the run too
          [`constant/components/${c}.dat`]: `name ${c};\nvaporPressure { model AmbroseWalton; }\n`,
        },
      };
    }

    if (plotType === "psychro") {
      // Carrier = lower-Tb (stays gas); condensable = higher-Tb (condenses).
      const byTb = [...selected].sort((a, b) =>
        (metaByName(a, catalogue)?.tb ?? 0) - (metaByName(b, catalogue)?.tb ?? 0));
      const carrier = byTb[0] ?? "";
      const condensable = byTb[byTb.length - 1] ?? "";
      // tFrom/tTo are stored in SI (Kelvin) — convert straight to °C (do NOT
      // parseTemperature again: that double-converts and sent T to ~290 °C).
      // Read the T-range state DIRECTLY (never fromV/toV, which alias the
      // swept-axis dimension and would be Pa right after a P-scan).
      const TminC = tFrom - 273.15;
      const TmaxC = tTo - 273.15;
      const rh: number[] = [];
      for (let p = rhFrom; p <= rhTo + 1e-9 && p < 100; p += Math.max(1, rhStep)) rh.push(Math.round(p));
      // Wet-bulb / adiabatic-saturation anchors at ROUND temperatures (10, 20,
      // … °C) so each line meets the saturation curve at a clean value.  The
      // engine drops any anchor past the condensable's boiling point.
      const wetBulb: number[] = [];
      const dTsat = Math.max(5, wbStep);
      for (let t = Math.ceil(TminC / dTsat) * dTsat; t <= Math.min(TmaxC, 95); t += dTsat) wetBulb.push(t);
      return {
        components: [carrier, condensable],
        properties: [],
        axis: { variable: "T", from: 0, to: 1, n: 2 },   // unused
        state: { composition: { [carrier]: 0.5, [condensable]: 0.5 } },
        psychrometry: {
          carrier, condensable, P: fixedP, TminC, TmaxC,
          gridN: Math.max(20, Math.round(nPts)), rh, wetBulb,
        },
        // Transport models so the op can compute the Lewis number (true wet-bulb):
        // Chung viscosity -> Eucken k_gas (for alpha) + Fuller D_AB.  When a
        // component lacks a diffusion volume the op silently omits the wet-bulb line.
        transport: { model: "Chung", thermalConductivity: "Eucken", diffusivity: "Fuller" },
        componentFiles: { ...localComponentFiles },
      };
    }

    if (plotType === "gibbsmap") {
      // Elements + atoms derived from each component's FORMULA (glass-box:
      // the same numbers a student would write in the gibbsReactor dict).
      const parsed = selected.map((c) => ({
        name: c, atoms: parseFormulaAtoms(metaByName(c, catalogue)?.formula ?? ""),
      }));
      const elements = [...new Set(parsed.flatMap((p) => Object.keys(p.atoms)))].sort();
      const species = parsed.map((p) => ({
        name: p.name, atoms: elements.map((e) => p.atoms[e] ?? 0),
      }));
      const feed: { [c: string]: number } = {};
      for (const c of selected) feed[c] = gmFeed[c] ?? 1;
      const target = gmMetricSp && selected.includes(gmMetricSp)
        ? gmMetricSp : (gmDefaultSpecies ?? selected[selected.length - 1]!);
      return {
        components: [...selected],
        properties: [],
        axis: { variable: "T", from: 0, to: 1, n: 2 },   // unused
        state: { composition: Object.fromEntries(selected.map((c) => [c, 1 / selected.length])) },
        gibbsmap: {
          elements, species, feed,
          Tfrom: gmTfrom, Tto: gmTto, nT: 25,
          Pfrom: gmPfrom, Pto: gmPto, nP: 25, logP: true,
          metric: { type: "moleFraction", species: target },
          ...(gmDeltaT !== 0 ? { deltaT: gmDeltaT } : {}),
        },
        ...(hasLocal ? { componentFiles: localComponentFiles } : {}),
      };
    }

    if (plotType === "scaling") {
      // The scalingScan op: ions live in the op's `totals {}` (the analysis),
      // NOT in the component set — water alone is the thermoPackage.  The
      // speciation/mineral catalogue resolves engine-side from the embedded
      // data/standards/electrolyte/ (same mechanism as the component .dats).
      const totals: { [ion: string]: number } = {};
      for (const { ion } of SCALING_IONS) {
        const m = ionTotals[ion] ?? 0;
        if (m > 0) totals[ion] = m;
      }
      return {
        components: ["water"],
        properties: [],
        axis: { variable: "T", from: 0, to: 1, n: 2 },   // unused
        state: { composition: { water: 1 } },
        scaling: {
          totals,
          pH: scalingPHMode === "solve" ? ("solve" as const) : scalingPH,
          ...(scalingAtm === "open" ? { pCO2atm: scalingPCO2 } : {}),
          T: scalingT,
          activityModel: scalingActivity,
          // equilibrium ON -> let the canonical scaling minerals precipitate to
          // SI = 0; OFF -> omit, keeping the SI-only path byte-identical.  The
          // optional feedFlow (kg/day column) rides only when equilibrium is on.
          ...(scalingEquil
            ? { equilibrate: [...SCALING_EQUIL_MINERALS],
                ...(scalingFeedFlow > 0 ? { feedFlowM3h: scalingFeedFlow } : {}) }
            : {}),
          from: recFrom, to: recTo, n: Math.max(2, Math.round(nPts)),
        },
        ...(hasLocal ? { componentFiles: localComponentFiles } : {}),
      };
    }

    if (plotType === "steam") {
      // The steamTables op: IF97 is a water-only formulation — the op ignores
      // the thermoPackage models entirely; water alone is the component set.
      return {
        components: ["water"],
        properties: [],
        axis: { variable: "T", from: 0, to: 1, n: 2 },   // unused
        state: { composition: { water: 1 } },
        steam: steamMode === "saturation"
          ? { mode: "saturation", from: satFrom, to: satTo, n: Math.max(2, Math.round(nPts)) }
          : { mode: "isobar", P: steamP, from: isoFrom, to: isoTo, n: Math.max(2, Math.round(nPts)) },
        ...(hasLocal ? { componentFiles: localComponentFiles } : {}),
      };
    }

    if (plotType === "ternary" || plotType === "ternaryLle") {
      // The grid IS the composition; state carries only T/P.
      const g = Math.max(8, Math.min(28, Math.round(nPts)));
      const axis = { variable: "T", from: 0, to: 1, n: 2 };  // unused for ternary
      if (plotType === "ternaryLle") {
        // LLE solubility map — predictive UNIFAC activity (no fitted pairs).
        return {
          components: selected,
          properties: [],
          axis,
          state: { T: fixedT, P: fixedP, composition },
          ternary: { mode: "lle", n: g, tieStride: Math.max(1, Math.round(tieStride)) },
          unifacGroups: unifacGroupsBlock(selected, localUnifac),
          ...(hasLocal ? { componentFiles: localComponentFiles } : {}),
        };
      }
      // VLE boiling-temperature surface.
      return {
        components: selected,
        properties: [],
        axis,
        state: { P: fixedP, composition },
        ternary: { mode: "bubbleT", n: g },
        activityModel: { model: activity },
        equationOfState: { model: eos },
        ...(activity === "UNIFAC" ? { unifacGroups: unifacGroupsBlock(selected, localUnifac) } : {}),
        ...(hasLocal ? { componentFiles: localComponentFiles } : {}),
      };
    }

    if (plotType === "binaryLle") {
      // binary LLE: g_mix(x) curve + the common-tangent binodal from an LL flash,
      // at fixed (T,P).  Predictive UNIFAC γ (groups come from the components' .dat).
      return {
        components: selected,
        properties: [],
        axis: { variable: "x", from: 0, to: 1, n: 2 },   // unused; the op sweeps x internally
        state: { T: fixedT, P: fixedP, composition },
        binaryLle: { n: Math.max(11, Math.round(nPts)) },
        unifacGroups: unifacGroupsBlock(selected, localUnifac),
        ...(hasLocal ? { componentFiles: localComponentFiles } : {}),
      };
    }

    if (plotType === "txy" || plotType === "gamma" || plotType === "mccabe" || plotType === "flash") {
      // binary VLE: sweep x of the first component 0->1 at fixed P.  McCabe-Thiele
      // and the binary FLASH need the SAME y_eq(x) curve as the T-x-y — so they
      // share that branch (T_bubble + y_eq_<c1>); the staircase / tie-line is
      // then pure TS, zero re-solve.
      //
      // Put the MORE VOLATILE component (lower normal boiling point) on the
      // x-axis, so the equilibrium curve y*(x) lies ABOVE the y=x diagonal and
      // the McCabe-Thiele staircase can be drawn at all.  Order by Tb; only
      // reorder when BOTH boiling points are known (else keep the user's order).
      const tb0 = metaByName(selected[0] ?? "", catalogue)?.tb;
      const tb1 = metaByName(selected[1] ?? "", catalogue)?.tb;
      const vle = (typeof tb0 === "number" && typeof tb1 === "number" && tb1 < tb0)
        ? [selected[1]!, selected[0]!]
        : selected;
      const c1 = vle[0] ?? "", c2 = vle[1] ?? "";
      const isTxy = plotType === "txy" || plotType === "mccabe" || plotType === "flash";
      // the T-x-y also probes per-x liquid-liquid stability so it can mark the
      // immiscibility gap instead of drawing a phantom homogeneous curve.
      const properties = isTxy
        ? ["T_bubble", `y_eq_${c1}`, "liquid_stable"]
        : [`gamma_${c1}`, `gamma_${c2}`];
      return {
        components: vle,
        properties,
        axis: { variable: `x[${c1}]`, from: 0, to: 1, n: Math.max(2, Math.round(nPts)) },
        state: { P: fixedP, composition },
        activityModel: { model: activity },     // NRTL auto-resolves the pair by name
        equationOfState: { model: eos },
        ...(isTxy ? { vleTwoLiquid: true } : {}),   // 2-liquid package so the LL probe can fire
        // UNIFAC is predictive — ship the group decomposition so it isn't ideal
        ...(activity === "UNIFAC" ? { unifacGroups: unifacGroupsBlock(vle, localUnifac) } : {}),
        ...(hasLocal ? { componentFiles: localComponentFiles } : {}),
      };
    }
    // scan: property vs T or P.  PURE -> one curve per compound (Psat_<c>),
    // composition irrelevant; MIXTURE -> the single mixture scalar at composition.
    const pure = isPureProp(property);
    const properties = pure ? selected.map((c) => `${property}_${c}`) : [property];
    const state: ExploreSpec["state"] = { composition };
    if (axisVar === "T") state.P = fixedP; else state.T = fixedT;
    // Transport: emit the matching `transport {}` sub-block (the model selection
    // the engine needs).  NEVER an EOS — transport is computed from (T,x) alone.
    const tMods = transportModelsFor(property);
    const tMod = tMods.includes(transportModel) ? transportModel : (tMods[0] ?? "");
    const transportSpec: ExploreSpec["transport"] | undefined =
      property === "viscosity_liquid" ? { liquidViscosity: tMod }
        : property === "thermal_conductivity_liquid" ? { liquidConductivity: tMod }
          : property === "viscosity_gas" ? { model: "Chung" }
            : property === "thermal_conductivity" ? { model: "Chung", thermalConductivity: "Eucken" }
              : undefined;
    return {
      components: selected,
      properties,
      axis: {
        variable: axisVar,
        from: fromV,
        to: toV,
        n: Math.max(2, Math.round(nPts)),
      },
      state,
      mode: pure ? "pure" : "mixture",
      activityModel: { model: "ideal" },
      // EOS only for properties that actually call eos(); transport gets a
      // transport block; everything else neither (no stale knob riding along).
      ...(EOS_PROPS.includes(property) ? { equationOfState: { model: eos } } : {}),
      ...(transportSpec ? { transport: transportSpec } : {}),
      ...(hasLocal ? { componentFiles: localComponentFiles } : {}),
    };
  }, [selected, plotType, property, axisVar, tFrom, tTo, pFrom, pTo, nPts, tieStride, fixedP, fixedT, eos, transportModel, activity, rhFrom, rhTo, rhStep, wbStep, ionTotals, scalingPHMode, scalingPH, scalingAtm, scalingPCO2, scalingT, scalingActivity, scalingEquil, scalingFeedFlow, recFrom, recTo, steamMode, satFrom, satTo, isoFrom, isoTo, steamP, localUnifac, localComponentFiles, hasLocal,
    gmFeed, gmTfrom, gmTto, gmPfrom, gmPto, gmMetricSp, gmDefaultSpecies, gmDeltaT, catalogue]);

  const snippet = useMemo(() => {
    try { return serialize(fromJson(synthesizeExploreCase(spec).propsDict!)); }
    catch { return "(invalid spec)"; }
  }, [spec]);

  // (v) multi-method — scan of ONE component on a family with several models
  // (Antoine vs AmbroseWalton, idealGas/SRK/PR, Andrade vs Vogel, …).  Declared
  // BEFORE run() (which references them in its fan-out branch).
  const compareFamily = (plotType === "scan" && selected.length === 1)
    ? familyForProperty(property) : null;
  const cmpModels = compareModels.filter((m) => compareFamily?.models.includes(m));
  const comparing = compareOn && !!compareFamily && cmpModels.length >= 2;
  const cmpFam = compareFamily?.family;

  // Reactive auto-plot: no Plot button — every spec change recomputes (the runs
  // are fast).  A run-sequence counter discards stale results and an
  // AbortController cancels the previous in-flight run when a new one starts.
  const runSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (activeReason) { abortRef.current?.abort(); setCsv(null); setErr(null); setCompareInfo(null); setOpAdvisories([]); setBusy(false); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const seq = ++runSeq.current;
    setBusy(true); setErr(null);
    try {
      const resolved = await resolveAdapter("wasm");
      if (seq !== runSeq.current) return;
      if (resolved.kind === "unavailable") {
        setErr(resolved.fallbackReason ?? "The real solver could not be loaded (build the WASM).");
        setBusy(false); return;
      }
      // (v) multi-method: one run per model, curves overlaid via a merged CSV.
      if (comparing && compareFamily) {
        setOpAdvisories([]);
        const models = compareModels.filter((m) => compareFamily.models.includes(m));
        const results = await Promise.all(models.map((m) =>
          resolved.adapter.run(
            synthesizeExploreCase(specForModel(spec, compareFamily.family, m, selected)),
            () => {}, ctrl.signal, "choupoProps")));
        if (seq !== runSeq.current) return;
        const got = results
          .map((r, i) => ({ model: models[i]!, csv: r.csvFiles?.[EXPLORE_OUTPUT] ?? "" }))
          .filter((x) => x.csv.length > 0);
        if (got.length >= 2) {
          const merged = mergeMethodCsvs(got);
          setCsv(merged); setErr(null);
          setCompareInfo({ models: got.map((g) => g.model), spread: methodSpread(merged), property });
        } else {
          // Stale chips/spread must never persist under the error banner.
          setCompareInfo(null);
          setErr("multi-method: too few curves returned — a model may lack data for this compound.");
        }
        return;
      }
      setCompareInfo(null);

      let out: string | undefined;
      let notDone = false;
      let failureDetail: string | undefined;
      let advisories: string[] = [];
      const N = isTernary && spec.ternary ? workerCount(spec.ternary.n) : 1;
      if (isTernary && spec.ternary && N > 1) {
        // fan the simplex across N WASM workers (each its own instance) + merge
        const results = await Promise.all(
          Array.from({ length: N }, (_, k) =>
            resolved.adapter.run(
              synthesizeExploreCase({ ...spec, ternary: { ...spec.ternary!, shard: { k, n: N } } }),
              () => {}, ctrl.signal, "choupoProps")));
        if (seq !== runSeq.current) return;   // superseded by a newer change
        const csvs = results
          .map((r) => r.csvFiles?.[EXPLORE_OUTPUT])
          .filter((x): x is string => typeof x === "string" && x.length > 0);
        if (csvs.length === N) out = mergeTernaryCsvs(csvs);
        else notDone = results.some((r) => r.status !== "done");
      } else {
        const result = await resolved.adapter.run(synthesizeExploreCase(spec), () => {}, ctrl.signal, "choupoProps");
        if (seq !== runSeq.current) return;   // superseded by a newer change
        out = result.csvFiles?.[EXPLORE_OUTPUT];
        notDone = result.status !== "done";
        failureDetail = result.log
          .split("\n")
          .map((line) => line.trim())
          .reverse()
          .find((line) => /(?:error|fatal|refused|failed)/i.test(line));
        // Honesty: lift the op's "[advisory]" lines off the run log (e.g.
        // scalingScan's Davies-beyond-trust-range flag) — the Explorer shows
        // no log tab, and a swallowed advisory is a silent crutch.  The
        // pH-solve charge-imbalance announcement is lifted the same way (the
        // solved pH absorbs exactly that analysis error — it must be SEEN).
        // The steamTables Tsat-crossing announcement is lifted too: a
        // subcritical isobar JUMPS in h/s/v at Tsat, and the student should
        // read why from the engine's own words, not guess from the kink.
        // The scalingScan EQUILIBRIUM-CEILING banner (printed when equilibrate
        // is on) is lifted as well — the precipitated amount is a thermodynamic
        // maximum, never a deposit prediction; that honesty must SURFACE.
        advisories = (result.log.match(/^\s*(\[advisory\]|speciation: feed charge imbalance|steamTables: the .* isobar crosses|EQUILIBRATE allowed|.*precipitation CEILING).*$/gm) ?? []).map((s) => s.trim());
      }
      setOpAdvisories(advisories);
      if (out) { setCsv(out); setErr(null); }
      else setErr(notDone
        ? `choupoProps did not finish${failureDetail ? `: ${failureDetail}` : ". Try a narrower range or a curated compound."}`
        : `No data — ${property} may not be defined for the selected compound(s) over this range.`);
    } catch (e) {
      if (seq === runSeq.current && !ctrl.signal.aborted) {
        setErr(e instanceof Error ? e.message : String(e));
        setCompareInfo(null);   // no stale spread chips under an error banner
      }
    } finally {
      if (seq === runSeq.current) setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, activeReason, property, comparing, compareOn, compareModels, cmpFam]);

  // Switching plot type clears the chart immediately: each plot kind owns a
  // DIFFERENT CSV schema (a scan is `T,prop`, psychro is `T_C,Y,curve`).  If a
  // new run returns empty we keep showing the PREVIOUS csv -- which, rendered by
  // the new plot's parser, would be garbage (the psychro renderer choking on a
  // stale scan CSV froze the tab).  Drop it so the new run starts from blank.
  // steamMode joins the deps: saturation and isobar own DIFFERENT CSV schemas
  // (h_f/h_g/… vs h/s/v/cp), so a stale CSV must not survive the mode switch.
  useEffect(() => { setCsv(null); setErr(null); setOpAdvisories([]); }, [plotType, steamMode]);

  // Debounced so dragging a number field fires ONE run after the user pauses,
  // not one per keystroke; `run` itself aborts any prior in-flight run.
  useEffect(() => {
    const t = setTimeout(() => { void run(); }, 300);
    return () => clearTimeout(t);
  }, [run]);

  // Reset the compared model set to the family's first two when the family
  // changes (or vanishes) — keeps the multi-select coherent with the property.
  useEffect(() => {
    setCompareModels(compareFamily ? compareFamily.models.slice(0, 2) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmpFam]);

  // F1 = open the Theory Guide at the section matching the active plot (a
  // keyboard accelerator; the visible "Theory" link is the primary path).
  // `[` = fold / unfold the SET rail (guarded: ignored while a text field is
  // focused, so typing "[" into the search box never collapses the browser).
  const helpUrl = theoryUrl(plotType, property);
  const toggleCollapsed = rail.toggleCollapsed;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); window.open(helpUrl, "_blank"); return; }
      if (e.key === "[" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpUrl, toggleCollapsed]);

  // Components that can't yield the chosen pure property (so their curve won't
  // appear) — surfaced as a note instead of a silent gap.  Only Psat is
  // pre-checkable from the catalogue (vleAble = has vapour pressure).
  const skipped = (!isVle && plotType !== "scaling" && property === "Psat")
    ? selected.filter((c) => !(metaByName(c, catalogue)?.vleAble ?? false))
    : [];

  // Scaling validity surface: the ionic strength at the scan end-points, read
  // off the engine's CSV (column I) — the number Davies' trust hinges on.
  const iEnds = plotType === "scaling" && csv ? csvColumnEnds(csv, "I") : null;

  // which curated binary pairs back the chosen activity model (so the student
  // SEES whether a pair is found → non-ideal, or absent → ideal fallback)
  const pairNote = (() => {
    if (isVle === false && plotType !== "ternary") return null;   // only VLE / bubble-T use γ pairs
    if (activity === "ideal") return null;
    if (activity === "UNIFAC") {                                   // predictive: group coverage, not pairs
      const missing = selected.filter((c) => !unifacAble(c));
      return missing.length
        ? `UNIFAC groups — missing for ${missing.join(", ")} (treated as ideal); try water, ethanol, benzene, nHexane, nButanol…`
        : `UNIFAC groups — all ${selected.length} components covered ✓ (predictive, no fitted pairs)`;
    }
    const combos: [string, string][] = [];
    if (selected.length === 2) combos.push([selected[0]!, selected[1]!]);
    else if (selected.length === 3)
      combos.push([selected[0]!, selected[1]!], [selected[0]!, selected[2]!], [selected[1]!, selected[2]!]);
    if (!combos.length) return null;
    const parts = combos.map(([a, b]) =>
      `${a}–${b}: ${hasPair(activity, a, b) ? `${activity} ✓` : "absent → ideal"}`);
    return `pairs — ${parts.join("  ·  ")}`;
  })();

  // Slice 0 — the "no-lie" state: a binary VLE diagram with a fitted-pair model
  // but NO curated pair silently falls back to IDEAL, which by construction can
  // show neither an azeotrope nor a liquid-liquid split.  Announce it loudly
  // (no silent crutch) instead of drawing a clean, misleading single-liquid lens.
  const idealLieWarning = (() => {
    if (!isVle || selected.length !== 2) return null;
    if (activity !== "NRTL" && activity !== "Wilson") return null;
    const a = selected[0]!, b = selected[1]!;
    if (hasPair(activity, a, b)) return null;
    return `No curated ${activity} pair covers ${a}–${b}, so this diagram assumes IDEAL mixing — `
      + `it cannot show an azeotrope or a liquid-liquid split. Switch γ to UNIFAC (predictive, `
      + `from the components' groups), or curate a ${activity} pair for this system.`;
  })();

  // T-x-y liquid-liquid split (from the `liquid_stable` probe): the homogeneous
  // boiling envelope is a PHANTOM where the liquid splits.  Report it (model +
  // run named) and steer to the Binary LLE view — never silently draw through it.
  const lleInTxy = (() => {
    if (plotType !== "txy" || !csv) return null;
    const rows = csv.trim().split("\n");
    const col = (rows[0] ?? "").split(",").indexOf("liquid_stable");
    if (col < 0) return null;
    let split = 0, total = 0;
    for (let i = 1; i < rows.length; i++) {
      const v = Number(rows[i]!.split(",")[col]);
      if (Number.isFinite(v)) { total++; if (v === 0) split++; }
    }
    return split > 0
      ? `${activity} predicts a liquid-liquid split over ${split} of ${total} compositions — `
        + `the FLAT segment is the heteroazeotrope (the three-phase L-L-V line: constant boiling T `
        + `and a fixed vapour, the same across the gap). Open “Binary LLE (g_mix + tangent)” to read `
        + `the two coexisting liquid compositions.`
      : null;
  })();

  // The honesty footer re-expands whenever a NEW alert appears (an error,
  // advisory, or model-lie warning), so a folded footer never SWALLOWS a fresh
  // honesty signal — the student always SEES the new flag.
  const hasAlert = !!err || !!activeReason || opAdvisories.length > 0 || !!idealLieWarning || !!lleInTxy || plotType === "gibbsmap";
  useEffect(() => { if (hasAlert) setFooterOpen(true); }, [hasAlert]);

  // context: which model pickers are physically relevant for the active plot
  const showGamma = isVle || plotType === "ternary";       // γ model drives VLE + bubble-T (LLE uses UNIFAC)
  // EOS picker: ONLY for properties that actually consume the EOS (positive
  // allowlist) — and hidden when its family is being multi-method compared.
  const showEos = (isVle || plotType === "ternary" || (plotType === "scan" && EOS_PROPS.includes(property)))
    && !(compareOn && cmpFam === "equationOfState");
  // Transport-model picker: only where a within-family choice exists (hidden
  // when that transport family is being compared).
  const tModels = transportModelsFor(property);
  const tModel = tModels.includes(transportModel) ? transportModel : (tModels[0] ?? "");
  const showTransport = plotType === "scan" && tModels.length > 1
    && !(compareOn && (cmpFam === "transportLiquidVisc" || cmpFam === "transportLiquidCond"));

  // a plain-words subtitle of what is being computed (T6)
  const axisLabel = axisVar === "T" ? "T" : "P";
  const subtitle = plotType === "gibbsmap"
    ? `Equilibrium map — iso-lines of ${gmMetricSp && selected.includes(gmMetricSp) ? gmMetricSp : (selected[selected.length - 1] ?? "product")} mole fraction over T × log-P by Gibbs-energy minimisation (the ATOMS you fed, redistributed to minimum G at each cell). Labelled industrial window + a user-declared kinetic band; unconverged cells marked, never interpolated. Click any cell for its full composition + the gibbsReactor dict.${gmDeltaT !== 0 ? ` ΔT approach = ${gmDeltaT} K: reaction equilibrium at T+ΔT, physical state at T (empirical; ghost ΔT=0 contours underneath).` : ""}`
    : plotType === "phase"
    ? `Pure-compound P–T phase diagram — liquid–vapour saturation curve to the critical point (AmbroseWalton corresponding states; marks Tc, Pc, normal b.p.). Solid region omitted — needs triple-point / ΔHfus data.`
    : plotType === "psychro"
    ? `Psychrometric chart at ${paToDisplay(fixedP, Pu)} ${pressureLabel(Pu)} — humidity ratio Y vs dry-bulb T (carrier = lower-Tb, condensable = higher-Tb). Saturation + relative-humidity + adiabatic-saturation + true wet-bulb (via the Lewis number) curves.`
    : plotType === "scaling"
    ? `Membrane-scaling audit — SI = log₁₀(IAP/K) per mineral vs water recovery; concentrate totals = feed/(1−r) (pure water removal), ${
        scalingPHMode === "solve"
          ? "pH solved from electroneutrality per point (the dashed pH curve rides the right axis)"
          : `pH held at ${scalingPH} across the scan`
      }, ${
        scalingAtm === "open"
          ? `open to CO₂(g) at pCO₂ = ${scalingPCO2} atm — DIC set by gas–liquid equilibrium (degassing allowed)`
          : "closed system — DIC concentrates with the water"
      }. ${
        scalingActivity === "pitzer"
          ? "Pitzer-HMW activity (validated vs HMW-1984 seawater) — quantitative to I ≈ 6 mol/kg in brines"
          : "Davies activity — quantitative to I ≈ 0.5 mol/kg, indicative beyond"
      }. SI > 0 ⇒ the mineral precipitates.${
        scalingEquil
          ? ` Equilibrium ON: ${SCALING_EQUIL_MINERALS.join(", ")} driven to SI = 0 — plot SIeq_<m> (clamped) or scale_<m> (the deposit curve${scalingFeedFlow > 0 ? ", kgday_<m> rated by feed flow" : ""}). EQUILIBRIUM CEILING — the thermodynamic maximum, NOT a kinetic deposit prediction.`
          : ""
      }`
    : plotType === "steam"
    ? steamMode === "saturation"
      ? `Saturated-steam table — IAPWS-IF97 (R7-97(2012)), the industrial water formulation; regions 1/2 evaluated ON the region-4 saturation line (valid 0.01–350 °C). Mass-basis SI columns; pick the property family above.`
      : `Steam isobar at ${paToDisplay(steamP, Pu)} ${pressureLabel(Pu)} — IAPWS-IF97 (R7-97(2012)), the industrial water formulation; h, s, v, cp vs T (mass-basis SI). A subcritical isobar jumps at the Tsat crossing — the engine announces it.`
    : plotType === "ternaryLle"
    ? `Ternary solubility (LLE) at ${kToDisplay(fixedT, Tu).toFixed(1)} ${temperatureLabel(Tu)}, ${paToDisplay(fixedP, Pu)} ${pressureLabel(Pu)} — miscibility regions + tie-lines; activity from UNIFAC (group contribution, no fitted pairs)`
    : isTernary
    ? `Ternary boiling-temperature SURFACE at P = ${paToDisplay(fixedP, Pu)} ${pressureLabel(Pu)} — colour = T_bubble at each composition (a continuous surface, not contours or phase regions)`
    : isVle
      ? plotType === "txy"
        ? `Binary VLE — liquid composition swept 0→1 at ${paToDisplay(fixedP, Pu)} ${pressureLabel(Pu)}`
        : plotType === "mccabe"
        ? `McCabe-Thiele binary distillation at ${paToDisplay(fixedP, Pu)} ${pressureLabel(Pu)} — the real y*(x) curve (engine) + the interactive staircase; turn R and q (pure-TS redraw, no re-solve)`
        : plotType === "flash"
        ? `Binary flash at ${paToDisplay(fixedP, Pu)} ${pressureLabel(Pu)} — the real y*(x) curve + the tie-line through the feed z; the lever rule gives V/F (pure-TS redraw, no re-solve)`
        : `Activity coefficients γ(x) — composition swept 0→1`
      : isTransportProp(property)
        ? `${TRANSPORT_LABEL[property] ?? property} — transport correlation${tModel ? ` (${tModel})` : ""}, computed from (T, x) only — independent of the equation of state · ${selected.length >= 2 ? `mixture xᵢ = 1/${selected.length}` : "pure"} vs ${axisLabel}`
        : scanMode === "pure"
          ? `Pure-component ${property} vs ${axisLabel} — composition has no effect`
          : selected.length >= 2
            ? `Equimolar mixture (xᵢ = 1/${selected.length}) — ${property} vs ${axisLabel}`
            : `${property} vs ${axisLabel}`;

  // ---- empty state (T3): no compounds picked yet ----
  if (selected.length === 0) {
    return (
      <Box style={{ position: "absolute", inset: 0, display: "flex", minHeight: 0 }}>
        <LeftRail selected={selected} onAdd={addComp} onRemove={removeComp} vleContext={isVle || isTernary} caseComponents={caseList} onEstimate={openEstimate} rail={rail} unlockLine={unlockLine} />
        {rail.collapsed && <RailReopenTab count={selected.length} onExpand={rail.toggleCollapsed} />}
        <EstimateForm opened={estimateOpen} onClose={() => setEstimateOpen(false)} prefillName={estimatePrefill} />
        <Box style={{ flex: 1, minWidth: 0, height: "100%", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Stack gap="xs" align="center" maw={420} style={{ textAlign: "center" }}>
            <Text fw={600} size="lg">Property Explorer</Text>
            <Text size="sm" c="dimmed">
              Pick one or more compounds from the browser on the left to compare
              their <b>pure-component</b> properties (Psat, Cp, …) or a
              <b> mixture</b> scalar (Z, v_molar, …).  Pick exactly two VLE-able
              compounds for a binary <b>T-x-y</b> diagram.
            </Text>
            <Text size="xs" c="dimmed">Tip: try benzene + toluene, or ethanol + water.</Text>
          </Stack>
        </Box>
      </Box>
    );
  }

  // The mode pill (PURE vs MIXTURE) becomes an ON-PLOT overlay (top-left) — it
  // annotates the curve's state, so it rides ON the curve rather than as a
  // pre-plot row.  Computed once, consumed in the plot region below.
  const modeBadge = plotType === "scan" ? (
    <Badge size="sm" variant="light" tt="none"
      color={scanMode === "pure" ? "teal" : "accent"}>
      {scanMode === "pure"
        ? "PURE · one curve per compound · composition ignored"
        : selected.length >= 2
          ? `MIXTURE · equimolar (xᵢ = 1/${selected.length})`
          : "MIXTURE · single component (x = 1.0)"}
    </Badge>
  ) : null;

  return (
    <Box style={{ position: "absolute", inset: 0, display: "flex", minHeight: 0 }}>
      <LeftRail selected={selected} onAdd={addComp} onRemove={removeComp} vleContext={isVle || isTernary} caseComponents={caseList} onEstimate={openEstimate} rail={rail} unlockLine={unlockLine} />
      {rail.collapsed && <RailReopenTab count={selected.length} onExpand={rail.toggleCollapsed} />}
      <EstimateForm opened={estimateOpen} onClose={() => setEstimateOpen(false)} prefillName={estimatePrefill} />

      {/* RIGHT — the VIEW column.  Chrome lives in exactly THREE homes (see the
          NO-REBLOAT invariant below): (1) the collapsible left SET rail; (2) the
          ONE non-wrapping toolbar right below; (3) the collapsible honesty
          footer under the plot.  The plot is the one primary surface — flex:1,
          its top-left origin FIXED (it never lurches when a lens or option
          changes).

          ───────────────────────────────────────────────────────────────────
          NO-REBLOAT RULE (invariant — do NOT break).  Any NEW control goes into
          the toolbar as a menu-button / popover, or into an existing popover —
          NEVER a new stacked row above the plot.  The toolbar is `wrap:nowrap`:
          a control that would force it to wrap is wrong by construction — fold
          it into a popover.  The plot's top edge must not move when lenses or
          options change.  (See docs/ai/gui-credo.md, Explorer clause.)
          ─────────────────────────────────────────────────────────────────── */}
      <Box style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* THE ONE TOOLBAR — non-wrapping, ~44px.  Left→right: the lens
            SegmentedControl, the active lens's curve-moving controls (menu-
            buttons + inline fields + the analysis/steam popovers), the ⚙
            overflow, then (right-pinned) Theory + the McCabe pop-out. */}
        <Box style={{
          flexShrink: 0, minHeight: 44, padding: "6px 12px", overflowX: "auto", overflowY: "hidden",
          borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
        }}>
        <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: "fit-content" }}>
          {/* lens picker — SegmentedControl (same idiom as McCabe's
              Construction|Sensitivity).  Gating UNCHANGED: only the views that
              APPLY are shown; the active view stays even if it just became
              invalid (so the control never vanishes under you).  A lens that
              NEWLY materialises pulses for ~600ms (the unlock, felt) via the
              accent ring on the wrapper. */}
          {(() => {
            const lenses = PLOT_TYPES.filter((pt) => reasonFor(pt) === null || pt.id === plotType);
            const anyPulse = lenses.some((pt) => pulsing.has(pt.id));
            return (
              <Box className={anyPulse ? "choupo-lens-pulse" : undefined} style={{ borderRadius: 6 }}>
                <SegmentedControl size="xs" color="accent" value={plotType}
                  onChange={(v) => setPlotType(v as PlotKind)}
                  data={lenses.map((pt) => ({
                    value: pt.id,
                    label: (
                      <Tooltip label={pt.label} withArrow openDelay={400}>
                        <span>{LENS_SHORT[pt.id] ?? pt.label}</span>
                      </Tooltip>
                    ),
                  }))} />
              </Box>
            );
          })()}

          {plotType === "scan" && (
            <>
              <ToolField label="Property">
                <Select size="xs"
                  data={[
                    { group: "pure component", items: PURE_PROPS },
                    { group: "mixture scalar", items: MIXTURE_PROPS },
                    { group: "transport (no EOS)",
                      items: TRANSPORT_PROPS.map((v) => ({ value: v, label: TRANSPORT_LABEL[v] ?? v })) },
                  ]}
                  value={property} onChange={(v) => setProperty(v ?? "Psat")} w={170} allowDeselect={false} />
              </ToolField>
              <ToolField label="Axis">
                <Select size="xs" data={["T", "P"]} value={axisVar}
                  onChange={(v) => setAxisVar((v as "T" | "P") ?? "T")} w={64} allowDeselect={false} />
              </ToolField>
              <ToolField label={`from (${axisUnit})`}>
                <NumberInput size="xs" value={axisToDisp(fromV)}
                  onChange={(v) => setFromV(axisToSI(num(v, axisToDisp(fromV))))} w={96} />
              </ToolField>
              <ToolField label={`to (${axisUnit})`}>
                <NumberInput size="xs" value={axisToDisp(toV)}
                  onChange={(v) => setToV(axisToSI(num(v, axisToDisp(toV))))} w={96} />
              </ToolField>
              {axisVar === "P" && (
                <ToolField label={`T (${temperatureLabel(Tu)})`}>
                  <NumberInput size="xs" value={kToDisplay(fixedT, Tu)}
                    onChange={(v) => setFixedT(parseTemperature(num(v, kToDisplay(fixedT, Tu)), Tu))} w={90} />
                </ToolField>
              )}
            </>
          )}
          {plotType === "gibbsmap" && (
            <>
              {selected.map((c) => (
                <ToolField key={c} label={`feed ${c} [mol]`}>
                  <NumberInput size="xs" w={80} min={0} step={0.5}
                    value={gmFeed[c] ?? 1}
                    onChange={(v) => setGmFeed({ ...gmFeed, [c]: num(v, gmFeed[c] ?? 1) })} />
                </ToolField>
              ))}
              <ToolField label="T range [°C]">
                <Group gap={4} wrap="nowrap">
                  <NumberInput size="xs" w={72} value={Math.round(gmTfrom - 273.15)}
                    onChange={(v) => setGmTfrom(num(v, gmTfrom - 273.15) + 273.15)} />
                  <Text size="xs" c="dimmed">–</Text>
                  <NumberInput size="xs" w={72} value={Math.round(gmTto - 273.15)}
                    onChange={(v) => setGmTto(num(v, gmTto - 273.15) + 273.15)} />
                </Group>
              </ToolField>
              <ToolField label="P range [bar]">
                <Group gap={4} wrap="nowrap">
                  <NumberInput size="xs" w={72} value={gmPfrom / 1e5}
                    onChange={(v) => setGmPfrom(num(v, gmPfrom / 1e5) * 1e5)} />
                  <Text size="xs" c="dimmed">–</Text>
                  <NumberInput size="xs" w={72} value={gmPto / 1e5}
                    onChange={(v) => setGmPto(num(v, gmPto / 1e5) * 1e5)} />
                </Group>
              </ToolField>
              <ToolField label="map of">
                <Select size="xs" w={110} data={selected}
                  value={gmMetricSp && selected.includes(gmMetricSp)
                    ? gmMetricSp : gmDefaultSpecies}
                  onChange={(v) => setGmMetricSp(v)} />
              </ToolField>
              <ToolField label="advanced">
                <Switch size="xs" checked={gmAdvanced}
                  onChange={(e) => { setGmAdvanced(e.currentTarget.checked);
                    if (!e.currentTarget.checked) setGmDeltaT(0); }} />
              </ToolField>
              {gmAdvanced && (
                <ToolField label="ΔT approach [K]">
                  {/* SNAPS (no animation, forum): equilibrium at T+ΔT, physics at T.
                      Empirical + calibrated; 0 = true equilibrium.  Ghost ΔT=0
                      contours appear underneath when ΔT ≠ 0. */}
                  <NumberInput size="xs" w={80} min={-100} max={100} step={5}
                    value={gmDeltaT} onChange={(v) => setGmDeltaT(num(v, gmDeltaT))} />
                </ToolField>
              )}
            </>
          )}
          {plotType === "scaling" && (
            <>
              {/* The activity-model fork (Davies/Pitzer) stays INLINE as a
                  segment — it is the one scaling control that FORKS the SI
                  curve, and SEEING the fork is the lesson.  Everything else in
                  the water analysis folds into the "Water analysis ▾" popover. */}
              <Tooltip label="Davies (extended Debye-Hückel): single I-controlled curve, quantitative to I ≈ 0.5 mol/kg, indicative beyond.  Pitzer HMW: ion-specific virial interactions (e.g. the Ca-SO4 2:2 pairing), validated vs HMW-1984 seawater to I ≈ 6 mol/kg.  The SI curves track at low I and FORK in brine — the recovery decision flips on the model." multiline w={320} withArrow>
                <Box>
                  <SegmentedControl size="xs" color="accent" value={scalingActivity}
                    onChange={(v) => setScalingActivity((v as "davies" | "pitzer") ?? "davies")}
                    data={[
                      { value: "davies", label: "Davies" },
                      { value: "pitzer", label: "Pitzer" },
                    ]} />
                </Box>
              </Tooltip>
              <ToolMenu label="Water analysis" value="" wide>
                <Stack gap="xs" style={{ width: 320 }}>
                  {/* The water analysis: total (element) molalities; 0 drops the
                      ion.  Defaults = the tutorial's brackish groundwater. */}
                {/* The water analysis: total (element) molalities; 0 drops the
                    ion.  Defaults = the tutorial's brackish groundwater. */}
                  <Tooltip label="analysis units — mg/L converts to molality at ρ ≈ 1 kg/L (dilute); the synthesized dict always carries mol/kg water" multiline w={260} withArrow>
                    <Select label="analysis" data={["mg/L", "mol/kg"]} value={ionUnit}
                      onChange={(v) => setIonUnit((v as "mg/L" | "mol/kg") ?? "mg/L")} allowDeselect={false} />
                  </Tooltip>
                  <Group gap="xs" grow>
                    {SCALING_IONS.map(({ ion, mw }) => (
                      <NumberInput key={ion} label={ion} min={0}
                        value={ionToDisp(ionTotals[ion] ?? 0, mw)}
                        step={ionUnit === "mg/L" ? 10 : 0.001}
                        decimalScale={ionUnit === "mg/L" ? 2 : 6}
                        onChange={(v) => setIonTotals((t) => ({
                          ...t,
                          [ion]: Math.max(0, ionToMolal(num(v, ionToDisp(t[ion] ?? 0, mw)), mw)),
                        }))} />
                    ))}
                  </Group>
                  <Group gap="xs" grow>
                    <Tooltip label="solved (electroneutrality): H+ joins the unknowns, charge balance closes the system per point — the engine announces the feed charge imbalance the solved pH absorbs.  given: the numeric pH is held across the scan (no degassing / alkalinity shift)." multiline w={300} withArrow>
                      <Select label="pH" allowDeselect={false}
                        data={[
                          { value: "solve", label: "solved (electroneutrality)" },
                          { value: "given", label: "given" },
                        ]}
                        value={scalingPHMode}
                        onChange={(v) => setScalingPHMode((v as "solve" | "given") ?? "solve")} />
                    </Tooltip>
                    <NumberInput label="pH value" value={scalingPH} min={0} max={14} step={0.1}
                      disabled={scalingPHMode === "solve"}
                      onChange={(v) => setScalingPH(num(v, scalingPH))} />
                  </Group>
                  <Group gap="xs" grow>
                    <Tooltip label="closed: every total (DIC included) concentrates as feed/(1−r).  open (CO₂): the concentrate equilibrates with the atmosphere — a(CO2aq) pinned by Henry, DIC a solved outcome (degassing / invasion allowed)." multiline w={300} withArrow>
                      <Select label="system" allowDeselect={false}
                        data={[
                          { value: "closed", label: "closed" },
                          { value: "open", label: "open (CO₂)" },
                        ]}
                        value={scalingAtm}
                        onChange={(v) => setScalingAtm((v as "closed" | "open") ?? "closed")} />
                    </Tooltip>
                    {scalingAtm === "open" && (
                      <NumberInput label="pCO₂ (atm)" value={scalingPCO2} min={0}
                        step={1e-4} decimalScale={6}
                        onChange={(v) => setScalingPCO2(Math.max(0, num(v, scalingPCO2)))} />
                    )}
                    <NumberInput label={`T (${temperatureLabel(Tu)})`}
                      value={Number(kToDisplay(scalingT, Tu).toFixed(2))}
                      onChange={(v) => setScalingT(parseTemperature(num(v, kToDisplay(scalingT, Tu)), Tu))} />
                  </Group>
                  <Tooltip label="off: SI only — how supersaturated each mineral is vs recovery (the propensity curve).  on: let the scaling minerals (calcite, gypsum) precipitate to SI = 0 — the engine reports SIeq_<m> (clamped at 0), n_<m> and scale_<m> (the deposit curve).  EQUILIBRIUM CEILING: the thermodynamic maximum (SI→0, infinite time, no nucleation barrier), NOT a kinetic deposit prediction — real scale ≤ ceiling, antiscalants act on kinetics this cannot see." multiline w={320} withArrow>
                    <Select label="equilibrium" allowDeselect={false}
                      data={[
                        { value: "off", label: "off — SI only (propensity)" },
                        { value: "on", label: "on — precipitate to SI = 0" },
                      ]}
                      value={scalingEquil ? "on" : "off"}
                      onChange={(v) => setScalingEquil(v === "on")} />
                  </Tooltip>
                  {scalingEquil && (
                    <Tooltip label="feed volumetric flow — enables the kg/day scale-rate column (kgday_<m>).  Optional even with equilibrium on: without it the engine still gives the precipitated amount in mol/kg." multiline w={280} withArrow>
                      <NumberInput label="feed flow (m³/h)" value={scalingFeedFlow} min={0} step={1}
                        onChange={(v) => setScalingFeedFlow(Math.max(0, num(v, scalingFeedFlow)))} />
                    </Tooltip>
                  )}
                  <Group gap="xs" grow>
                    <NumberInput label="recovery from" value={recFrom} min={0} max={0.98} step={0.05}
                      onChange={(v) => setRecFrom(num(v, recFrom))} />
                    <NumberInput label="to" value={recTo} min={0.01} max={0.99} step={0.05}
                      onChange={(v) => setRecTo(num(v, recTo))} />
                  </Group>
                </Stack>
              </ToolMenu>
            </>
          )}
          {plotType === "steam" && (() => {
            // Per-mode T range (different defaults + validity), shared inputs.
            // The mode (saturation|isobar) FORKS the table schema, so it stays
            // INLINE as a segment; the ranges + property pick fold into "Steam ▾".
            const sFrom = steamMode === "saturation" ? satFrom : isoFrom;
            const sTo = steamMode === "saturation" ? satTo : isoTo;
            const setSFrom = steamMode === "saturation" ? setSatFrom : setIsoFrom;
            const setSTo = steamMode === "saturation" ? setSatTo : setIsoTo;
            const views = steamMode === "saturation" ? STEAM_SAT_VIEWS : STEAM_ISO_VIEWS;
            const propPick = views[steamProp] ? steamProp : "h";
            return (
              <>
                <Tooltip label="saturation curve: the region-4 line with the f/g property pairs (regions 1/2 evaluated on the line, valid 0.01–350 °C).  isobar: h, s, v, cp vs T at fixed P — crossing Tsat jumps the properties." multiline w={280} withArrow>
                  <Box>
                    <SegmentedControl size="xs" color="accent" value={steamMode}
                      onChange={(v) => setSteamMode((v as "saturation" | "isobar") ?? "saturation")}
                      data={[
                        { value: "saturation", label: "saturation" },
                        { value: "isobar", label: "isobar" },
                      ]} />
                  </Box>
                </Tooltip>
                <ToolMenu label="Steam" value={views[propPick]?.label ?? propPick}>
                  <Stack gap="xs" style={{ width: 240 }}>
                    {steamMode === "isobar" && (
                      <NumberInput label={`P (${pressureLabel(Pu)})`} value={paToDisplay(steamP, Pu)}
                        onChange={(v) => setSteamP(parsePressure(num(v, paToDisplay(steamP, Pu)), Pu))} />
                    )}
                    <Group gap="xs" grow>
                      <NumberInput label={`from (${temperatureLabel(Tu)})`}
                        value={Number(kToDisplay(sFrom, Tu).toFixed(2))}
                        onChange={(v) => setSFrom(parseTemperature(num(v, kToDisplay(sFrom, Tu)), Tu))} />
                      <NumberInput label={`to (${temperatureLabel(Tu)})`}
                        value={Number(kToDisplay(sTo, Tu).toFixed(2))}
                        onChange={(v) => setSTo(parseTemperature(num(v, kToDisplay(sTo, Tu)), Tu))} />
                    </Group>
                    <Tooltip label="one property family at a time — the full table mixes magnitudes (psat ~10⁷ Pa beside v_f ~10⁻³ m³/kg) that flatten each other on a shared axis" multiline w={260} withArrow>
                      <Select label="property" allowDeselect={false}
                        data={Object.entries(views).map(([value, vw]) => ({ value, label: vw.label }))}
                        value={propPick}
                        onChange={(v) => setSteamProp(v ?? "h")} />
                    </Tooltip>
                  </Stack>
                </ToolMenu>
              </>
            );
          })()}
          {/* The fixed (T,P) the lens evaluates at — compact menu-buttons that
              SHOW their value (`P 1 bar`, `T 25 °C`); they MOVE the curve, so
              they sit in the toolbar, each opening a stable popover. */}
          {plotType === "ternaryLle" && (
            <ToolMenu label="T" value={`${kToDisplay(fixedT, Tu).toFixed(1)} ${temperatureLabel(Tu)}`}>
              <NumberInput size="xs" label={`T (${temperatureLabel(Tu)})`} value={kToDisplay(fixedT, Tu)} w={130}
                onChange={(v) => setFixedT(parseTemperature(num(v, kToDisplay(fixedT, Tu)), Tu))} />
            </ToolMenu>
          )}
          {(isVle || isTernary || (plotType === "scan" && axisVar === "T")) && (
            <ToolMenu label="P" value={`${paToDisplay(fixedP, Pu)} ${pressureLabel(Pu)}`}>
              <NumberInput size="xs" label={`P (${pressureLabel(Pu)})`} value={paToDisplay(fixedP, Pu)} w={130}
                onChange={(v) => setFixedP(parsePressure(num(v, paToDisplay(fixedP, Pu)), Pu))} />
            </ToolMenu>
          )}
          {/* The curve-moving model pickers (γ / EoS / transport) — each a
              menu-button showing the committed value, opening its Select. */}
          {showGamma && (
            <ToolMenu label="γ" value={activity}
              tip="liquid activity model: ideal = Raoult (no azeotrope); NRTL/Wilson auto-resolve curated binary pairs by name, else that pair is ideal; UNIFAC is PREDICTIVE (γ from molecular groups, no fitted pairs) — a component without a group decomposition is treated as ideal">
              <Select size="xs" label="γ model" data={["ideal", "NRTL", "Wilson", "UNIFAC"]} value={activity}
                onChange={(v) => setActivity(v ?? "NRTL")} w={150} allowDeselect={false} />
            </ToolMenu>
          )}
          {showEos && (
            <ToolMenu label="EoS" value={eos}
              tip="vapour equation of state: idealGas ⇒ Z = 1; SRK/PR are cubic real-gas models">
              <Select size="xs" label="EoS" data={["idealGas", "SRK", "PR"]} value={eos}
                onChange={(v) => setEos(v ?? "idealGas")} w={150} allowDeselect={false} />
            </ToolMenu>
          )}
          {showTransport && (
            <ToolMenu label="model" value={tModel}
              tip="transport correlation, chosen WITHIN a family (e.g. Andrade vs Vogel) — a sibling of the EOS, never driven by it; both move the curve, so you SEE which you commit to">
              <Select size="xs" label="model" data={tModels} value={tModel}
                onChange={(v) => setTransportModel(v ?? tModels[0]!)} w={150} allowDeselect={false} />
            </ToolMenu>
          )}
          {/* (v) multi-method: overlay several models of the same family and
              SEE the spread.  Only for a scan of ONE component on a comparable
              family; opt-in (single-model is the default). */}
          {compareFamily && (
            <Group gap={8} align="center" wrap="nowrap">
              <Tooltip label="overlay several models of the same family and SEE the spread (≤3)" withArrow multiline w={240}>
                <Switch size="xs" checked={compareOn} onChange={(e) => setCompareOn(e.currentTarget.checked)}
                  label="compare" styles={{ label: { fontSize: 11 } }} />
              </Tooltip>
              {compareOn && (
                <Chip.Group multiple value={cmpModels}
                  onChange={(v) => setCompareModels((v as string[]).slice(0, 3))}>
                  <Group gap={4} wrap="nowrap">
                    {compareFamily.models.map((m) => (
                      <Chip key={m} size="xs" value={m} color="accent">{m}</Chip>
                    ))}
                  </Group>
                </Chip.Group>
              )}
            </Group>
          )}

          {/* resolution / performance knobs in the ⚙ overflow — not the
              physics, so they don't clutter the row.  For the psychrometric
              chart EVERY knob lives here (the chart fills the row): range,
              humidity, saturation-line spacing, y-scale.  size md → fits 44px. */}
          <Popover position="bottom-end" withArrow shadow="md">
            <Popover.Target>
              <Tooltip label={plotType === "psychro" ? "chart options" : "resolution & display options"} withArrow>
                <ActionIcon variant="default" size="md" aria-label="options">
                  <IconAdjustmentsHorizontal size={16} />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="xs">
                {plotType === "psychro" && (
                  <>
                    <Group gap="xs" grow>
                      <NumberInput label={`T from (${temperatureLabel(Tu)})`} value={Number(kToDisplay(tFrom, Tu).toFixed(1))}
                        step={5} decimalScale={1}
                        onChange={(v) => setTFrom(parseTemperature(num(v, kToDisplay(tFrom, Tu)), Tu))} />
                      <NumberInput label={`T to (${temperatureLabel(Tu)})`} value={Number(kToDisplay(tTo, Tu).toFixed(1))}
                        step={5} decimalScale={1}
                        onChange={(v) => setTTo(parseTemperature(num(v, kToDisplay(tTo, Tu)), Tu))} />
                    </Group>
                    <NumberInput label={`P (${pressureLabel(Pu)})`} value={paToDisplay(fixedP, Pu)}
                      onChange={(v) => setFixedP(parsePressure(num(v, paToDisplay(fixedP, Pu)), Pu))} w={260} />
                    <Group gap="xs" grow>
                      <NumberInput label="RH from (%)" value={rhFrom} min={0} max={99}
                        onChange={(v) => setRhFrom(num(v, rhFrom))} />
                      <NumberInput label="RH to (%)" value={rhTo} min={1} max={99}
                        onChange={(v) => setRhTo(num(v, rhTo))} />
                      <NumberInput label="RH step (%)" value={rhStep} min={1} max={50}
                        onChange={(v) => setRhStep(num(v, rhStep))} />
                    </Group>
                    <NumberInput label={`ΔT between sat. lines (${temperatureLabel(Tu)})`} value={wbStep} min={5} max={50} step={5}
                      onChange={(v) => setWbStep(num(v, wbStep))} w={260}
                      description="spacing of the wet-bulb / adiabatic-saturation anchor lines" />
                    <NumberInput label="Y max (0=auto)" value={psyYMax} min={0} step={0.05} decimalScale={3}
                      onChange={(v) => setPsyYMax(num(v, psyYMax))} w={260}
                      description="auto = drying band; raise to see full saturation" />
                  </>
                )}
                <NumberInput label={isTernary ? "grid (intervals per edge)" : "points"} value={nPts}
                  onChange={(v) => setNPts(num(v, nPts))} w={260} min={2}
                  description={isTernary ? "more = finer triangle, slower"
                    : plotType === "scaling" ? "recovery points across the scan"
                    : "samples along the axis"} />
                {plotType === "ternaryLle" && (
                  <NumberInput label="tie-line stride" value={tieStride}
                    onChange={(v) => setTieStride(num(v, tieStride))} w={260} min={1}
                    description="draw a tie-line every Nth split node (higher = fewer lines)" />
                )}
              </Stack>
            </Popover.Dropdown>
          </Popover>

          {/* No Plot button — the view recomputes live on any change. */}
          {busy && (
            <Group gap={6} wrap="nowrap">
              <Loader size="xs" /><Text size="xs" c="dimmed">computing…</Text>
            </Group>
          )}

          {/* spacer pushes the trailing affordances to the right edge */}
          <Box style={{ flex: 1, minWidth: 8 }} />

          {/* trailing: the McCabe pop-out (only for that lens) + Theory */}
          {plotType === "mccabe" && csv && (
            <Tooltip label="Open the McCabe-Thiele analyzer full-window in a new tab" withArrow>
              <ActionIcon variant="subtle" size="md" color="accent" aria-label="pop out McCabe analyzer"
                onClick={() => popOutExploreMccabe({
                  csv: dropCsvColumn(csv, "liquid_stable"),
                  compA: selected[0] ?? "", compB: selected[1] ?? "",
                  P: fixedP, model: activity,
                })}>
                <IconExternalLink size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Open the matching section of the Theory Guide (or press F1)" withArrow>
            <ActionIcon component="a" href={helpUrl} target="_blank" rel="noopener noreferrer"
              variant="subtle" size="md" color="gray" aria-label="open the Theory Guide">
              <IconBook size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
        </Box>

        {/* VIEW — the plot is the one primary surface: flex:1, its top-left
            origin FIXED (it never lurches when a lens / option changes; chrome
            is evicted to the toolbar above + the honesty footer below).  The
            SET pill, the PURE/MIXTURE badge and the plain-words caption ride as
            on-plot overlays (top-left), annotating the curve ON the curve. */}
        <Box style={{ flex: 1, minWidth: 0, overflow: "hidden", padding: 16, paddingTop: 12, display: "flex", flexDirection: "column" }}>
        <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
          {csv ? (
            <Box style={{ flex: 1, minHeight: 360, position: "relative" }}>
              {/* on-plot overlays (top-left): SET pill (load-bearing when the
                  rail is collapsed) + the PURE/MIXTURE badge + the caption.
                  Absolutely positioned so they never push the figure down. */}
              <Box style={{ position: "absolute", top: 4, left: 8, zIndex: 4,
                display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start",
                pointerEvents: "none", maxWidth: "70%" }}>
                <Group gap={6} align="center" style={{ pointerEvents: "auto" }}>
                  <Badge size="sm" variant="outline" color="gray" tt="none"
                    style={{ background: "light-dark(rgba(255,255,255,0.7), rgba(0,0,0,0.5))" }}>
                    {selected.join(" · ")}
                  </Badge>
                  {modeBadge}
                </Group>
                <Text size="xs" c="dimmed"
                  style={{ background: "light-dark(rgba(255,255,255,0.6), rgba(0,0,0,0.45))",
                    borderRadius: 4, padding: "1px 4px", lineHeight: 1.3 }}>
                  {subtitle}
                </Text>
              </Box>
              {plotType === "phase" ? (
                <PurePhaseDiagram csv={csv} comp={selected[0] ?? ""}
                  tc={metaByName(selected[0] ?? "", catalogue)?.tc}
                  pc={metaByName(selected[0] ?? "", catalogue)?.pc}
                  tb={metaByName(selected[0] ?? "", catalogue)?.tb} />
              ) : plotType === "psychro" ? (
                <PsychroPlot csv={csv} yMax={psyYMax} />
              ) : plotType === "binaryLle" ? (
                <BinaryLlePlot csv={csv} compA={selected[0] ?? ""} compB={selected[1] ?? ""} />
              ) : plotType === "mccabe" ? (
                // The interactive McCabe-Thiele staircase over the engine's
                // y_eq(x) (read out of the same T-x-y CSV) — R/q knobs re-walk
                // the staircase in pure TS, no WASM re-solve.
                // The ↗ pop-out trigger lives in the toolbar (trailing), one
                // affordance not two; the inline plot stays single-column.
                <McCabePlot csv={dropCsvColumn(csv, "liquid_stable")}
                  compA={selected[0] ?? ""} compB={selected[1] ?? ""} P={fixedP} />
              ) : plotType === "flash" ? (
                // The binary flash: the engine's y_eq(x) read as an equilibrium
                // tie-line through the feed z; T/P knobs move the split, the
                // lever rule gives V/F — pure TS, no WASM re-solve.
                <FlashPlot csv={dropCsvColumn(csv, "liquid_stable")}
                  compA={selected[0] ?? ""} compB={selected[1] ?? ""} P={fixedP} />
              ) : plotType === "gibbsmap" && spec.gibbsmap ? (
                <GibbsMapPanel
                  op={{
                    elements: spec.gibbsmap.elements,
                    species: spec.gibbsmap.species.map((sp) => ({ name: sp.name, atoms: sp.atoms })),
                    feed: spec.gibbsmap.feed,
                    metric: spec.gibbsmap.metric as unknown as JsonDict,
                  } as unknown as JsonDict}
                  csv={csv} />
              ) : (
                <CsvAutoPlot
                  // Scaling: the SI columns share the axis; the I column (its
                  // own unit, mol/kg) is read out as text above instead, and
                  // the pH column (≈7–9 would flatten the SI curves) rides a
                  // dashed right-hand axis — SEEN, never silently dropped.
                  // Steam: one property family at a time (mixed magnitudes
                  // flatten each other), renamed to the mass-basis SI labels.
                  csv={plotType === "scaling" ? dropCsvColumn(csv, "I")
                    : plotType === "txy" ? dropCsvColumn(csv, "liquid_stable")
                    : plotType === "steam" ? shapeSteamCsv(csv, steamMode, steamProp) : csv}
                  filename={EXPLORE_OUTPUT}
                  referenceLines={plotType === "scaling" ? SI_REFERENCE : undefined}
                  secondaryColumn={plotType === "scaling" ? "pH" : undefined}
                  txyPartner={plotType === "txy" ? selected[1] : undefined}
                  txyP={plotType === "txy" ? fixedP : undefined}
                  ternaryLabels={selected.length === 3
                    ? [selected[0]!, selected[1]!, selected[2]!] : undefined} />
              )}
              {/* keep the last plot visible, dimmed, while the next recompute runs */}
              {busy && (
                <Box style={{ position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  background: "light-dark(rgba(255,255,255,0.45), rgba(0,0,0,0.45))" }}>
                  <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">recomputing…</Text></Group>
                </Box>
              )}
            </Box>
          ) : busy ? (
            <Box style={{ flex: 1, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">computing — {subtitle}</Text></Group>
            </Box>
          ) : (
            <Box style={{ flex: 1, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Text size="sm" c="dimmed" ta="center" maw={460}>{subtitle}</Text>
            </Box>
          )}

          {/* (v) per-curve method chips (colour === trace colour) + the spread */}
          {compareInfo && csv && (() => {
            // Unit-tag the spread in the SAME display unit as the plotted axis.
            // absMax is a DIFFERENCE in canonical SI: conv(x)−conv(0) converts
            // a delta correctly for any affine unit map (Pa→bar, K→°C, …).
            const ax = axisDisplay(compareInfo.property, prefs);
            const dAbs = ax.conv(compareInfo.spread.absMax) - ax.conv(0);
            const unitTag = ax.unit && ax.unit !== "—" ? ` ${ax.unit}` : "";
            return (
              <Group gap={8} align="center" wrap="wrap">
                {compareInfo.models.map((m, i) => (
                  <Badge key={m} size="sm" variant="light" tt="none"
                    styles={{ root: {
                      color: PLOT_COLORS.series[i % PLOT_COLORS.series.length],
                      borderColor: PLOT_COLORS.series[i % PLOT_COLORS.series.length],
                      border: "1px solid",
                    } }}>
                    {m}
                  </Badge>
                ))}
                <Text size="xs" c="dimmed">
                  spread: max Δ {dAbs.toPrecision(3)}{unitTag} ({compareInfo.spread.relMaxPct.toFixed(1)}%)
                </Text>
              </Group>
            );
          })()}
        </Stack>
        </Box>

        {/* THE HONESTY FOOTER — chrome home #3.  The run-level honesty (which γ
            pairs resolved / op advisories / the ideal-mixing lie / the
            heteroazeotrope / validity readouts) + the "Author this exploration"
            hand-off live BELOW the plot in a collapsible strip, so they STAY
            VISIBLE (numerical-honesty credo) but never push the plot's top
            origin down.  A `⚠ N` pill folds it; a new alert re-expands it. */}
        {(() => {
          const alerts: React.ReactNode[] = [];
          if (err) alerts.push(<Alert key="err" color="red" variant="light">{err}</Alert>);
          if (activeReason) alerts.push(<Alert key="reason" color="yellow" variant="light" title="Cannot plot">{activeReason}</Alert>);
          if (opAdvisories.length > 0) alerts.push(
            <Alert key="adv" color="yellow" variant="light" title="Solver advisory">
              {opAdvisories.map((a) => (<Text key={a} size="xs">{a}</Text>))}
            </Alert>);
          if (idealLieWarning) alerts.push(
            <Alert key="ideal" color="orange" variant="light" title="Assuming ideal mixing — not your real system">
              <Text size="xs">{idealLieWarning}</Text>
            </Alert>);
          if (lleInTxy) alerts.push(
            <Alert key="lle" color="orange" variant="light" title="Heteroazeotrope — flat three-phase line">
              <Text size="xs">{lleInTxy}</Text>
            </Alert>);
          if (plotType === "gibbsmap") {
            // The undergrad's #1 confusion, answered BEFORE the map: Gibbs
            // needs no reaction -- it redistributes the ATOMS you fed.  The
            // live element balance makes that concrete.
            const bal: { [el: string]: number } = {};
            for (const c of selected) {
              const atoms = parseFormulaAtoms(metaByName(c, catalogue)?.formula ?? "");
              const f = gmFeed[c] ?? 1;
              for (const [el, k] of Object.entries(atoms)) bal[el] = (bal[el] ?? 0) + k * f;
            }
            const balStr = Object.entries(bal).map(([el, n]) => `${el}: ${n.toPrecision(3)}`).join(" · ");
            const unparsed = selected.filter((c) => Object.keys(parseFormulaAtoms(metaByName(c, catalogue)?.formula ?? "")).length === 0);
            alerts.push(
              <Alert key="gm-explain" color="blue" variant="light"
                title="A Gibbs map needs no reaction — it redistributes atoms">
                <Text size="xs">
                  Equilibrium finds the composition of minimum Gibbs energy given the
                  atoms you fed; no reaction is written.  Fed atoms (mol): <b>{balStr || "—"}</b>.
                  Each map cell holds those totals fixed and solves for the composition
                  that minimises G at that (T, P); click any cell for its full answer.
                </Text>
                {unparsed.length > 0 && (
                  <Text size="xs" c="orange" mt={4}>
                    Formula not parseable for: {unparsed.join(", ")} — the atom matrix
                    will be wrong.  Pick species with plain formulas (e.g. N2, H2, NH3).
                  </Text>
                )}
              </Alert>);
          }
          const notes: React.ReactNode[] = [];
          if (pairNote) notes.push(<Text key="pair" size="xs" c="dimmed">{pairNote}</Text>);
          if (skipped.length > 0) notes.push(
            <Text key="skip" size="xs" c="dimmed">No vapour pressure (curve not shown): {skipped.join(", ")}</Text>);
          if (iEnds) notes.push(
            <Text key="i" size="xs" c="dimmed">
              ionic strength I = {iEnds.first.toPrecision(3)} → {iEnds.last.toPrecision(3)} mol/kg
              across the scan — {scalingActivity === "pitzer"
                ? "Pitzer-HMW activity is quantitative to I ≈ 6 mol/kg (brine-grade)"
                : "Davies activity is quantitative to I ≈ 0.5 mol/kg"}
            </Text>);
          const nFlags = alerts.length;
          return (
            <Box style={{ flexShrink: 0, padding: "4px 12px 8px",
              borderTop: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
              <Group gap="xs" wrap="nowrap" align="center">
                <Button variant="subtle" size="compact-xs" color="gray"
                  onClick={() => setFooterOpen((o) => !o)}
                  leftSection={nFlags > 0
                    ? <Badge size="xs" circle color="orange" variant="filled">{nFlags}</Badge>
                    : undefined}>
                  {footerOpen ? "Hide details" : nFlags > 0 ? "Honesty & details" : "Details"}
                </Button>
                <Button variant="subtle" size="compact-xs" onClick={() => setSnippetOpen((o) => !o)}>
                  {snippetOpen ? "Hide propsDict" : "Author → copy propsDict"}
                </Button>
                {!footerOpen && nFlags === 0 && isVle && (
                  <Text size="xs" c="dimmed" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    NRTL/Wilson pairs auto-resolve by name; absent → ideal (no azeotrope).
                  </Text>
                )}
              </Group>
              <Collapse in={footerOpen}>
                <Stack gap={6} mt={6}>
                  {alerts}
                  {notes}
                  {isVle && <Text size="xs" c="dimmed">NRTL/Wilson pairs auto-resolve by name; absent → ideal (no azeotrope).</Text>}
                </Stack>
              </Collapse>
              <Collapse in={snippetOpen}>
                <Stack gap={4} mt={6}>
                  <Text size="xs" c="dimmed">
                    Create or open a case, then put this block in <code>system/propsDict</code> under
                    <code> operations ( … )</code>; keep <code>constant/propertyDict</code> in sync with the
                    components/models above, and <code>runCase</code>.
                  </Text>
                  <Group gap="xs">
                    <CopyButton value={snippet}>
                      {({ copied, copy }) => (
                        <Button size="xs" variant={copied ? "filled" : "light"} color="accent" onClick={copy}>
                          {copied ? "Copied ✓" : "Copy propsDict"}
                        </Button>
                      )}
                    </CopyButton>
                  </Group>
                  <Code block style={{ fontSize: 11, maxHeight: 200, overflow: "auto" }}>{snippet}</Code>
                </Stack>
              </Collapse>
            </Box>
          );
        })()}
      </Box>
    </Box>
  );
}

/** The compound browser rail (SET region) — shared by the empty state and the
 *  live view.  The width is draggable (the 6px col-resize splitter over the
 *  right border, reusing the AgentConsole pointer-capture idiom): clamp 200–460,
 *  double-click → snap to 240, persisted to the single GLOBAL key
 *  `choupo.explore.railWidth` (NOT case-keyed — the Explorer is a scratchpad
 *  over the same catalogue regardless of the open case).  Explorer-only; never
 *  an app-wide panel. */
function LeftRail({
  selected, onAdd, onRemove, vleContext = false, caseComponents, onEstimate, rail, unlockLine,
}: {
  selected: string[];
  onAdd: (n: string) => void;
  onRemove: (n: string) => void;
  vleContext?: boolean;
  caseComponents: ComponentMeta[];
  onEstimate: (name: string) => void;
  rail: RailWidthHandle;
  unlockLine?: string | null;
}) {
  const [hover, setHover] = useState(false);
  const collapsed = rail.collapsed;
  // Animate WIDTH (not translateX — a transform would slide the rail OVER the
  // plot and the plot would jump at the end); reduced-motion → instant.  Fire
  // a window resize on transitionend (Plotly's useResizeHandler listens for it)
  // so the figure re-fits the new width once the fold settles.  A one-shot rAF
  // covers the reduced-motion case where no transition event fires.
  const reduce = useReducedMotion();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!reduce) return;   // animated path resizes on transitionend instead
    const id = window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => window.cancelAnimationFrame(id);
  }, [collapsed, reduce]);
  return (
    <Box
      onTransitionEnd={(e) => { if (e.propertyName === "width") window.dispatchEvent(new Event("resize")); }}
      style={{
      width: collapsed ? 0 : rail.width, flexShrink: 0, height: "100%",
      padding: collapsed ? 0 : 12, overflow: "hidden", position: "relative",
      transition: reduce ? "none" : "width 180ms ease, padding 180ms ease",
      borderRight: collapsed
        ? "none"
        : "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
    }}>
      <Group justify="space-between" align="center" mb={6} wrap="nowrap" gap={4}>
        <Text size="xs" fw={700} c="dimmed" style={{ letterSpacing: 0.5 }}>SET</Text>
        <Tooltip label="Collapse the component browser (shortcut: [ )" withArrow>
          <ActionIcon variant="subtle" size="sm" color="gray" aria-label="collapse component browser"
            onClick={rail.toggleCollapsed}>
            <IconChevronLeft size={15} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Box style={{ height: "calc(100% - 28px)" }}>
        <CompoundBrowser selected={selected} onAdd={onAdd} onRemove={onRemove} vleContext={vleContext} caseComponents={caseComponents} onEstimate={onEstimate} unlockLine={unlockLine} />
      </Box>
      {/* 6px col-resize splitter over the rail's right border (drag to resize,
          double-click to reset); the hover seam tints with the accent.  Hidden
          when collapsed (the 28px re-open tab is the only left-edge affordance
          then). */}
      {!collapsed && (
        <Box
          onPointerDown={rail.onPointerDown}
          onDoubleClick={rail.reset}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          title="drag to resize · double-click to reset"
          style={{
            position: "absolute", top: 0, right: -3, width: 6, height: "100%",
            cursor: "ew-resize", zIndex: 5,
            background: hover ? `color-mix(in srgb, ${PLOT_COLORS.accent} 30%, transparent)` : "transparent",
            transition: "background 120ms",
          }}
        />
      )}
    </Box>
  );
}

/** An inline toolbar field: a small dimmed label beside a compact control, so
 *  the scan Property / Axis / from / to read on ONE 44px toolbar row instead of
 *  the label-on-top stack the standalone Mantine inputs default to. */
function ToolField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap={4} wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
      <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{label}</Text>
      {children}
    </Group>
  );
}

/** A curve-moving toolbar control folded into a menu-button: the button SHOWS
 *  its committed value (`P 1 bar`, `γ NRTL`) and opens a fixed-position popover
 *  with the real Select / NumberInput — spatial stability (the control never
 *  wraps or jumps), the value stays SEEN.  The popover is what keeps the one
 *  toolbar row from growing into the stacked-rows it replaced. */
function ToolMenu({
  label, value, tip, wide = false, children,
}: {
  label: string;
  value: string;
  tip?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const btn = (
    <Button size="xs" variant="default" rightSection={<IconChevronDown size={13} />}
      style={{ flexShrink: 0 }}>
      <Text span size="xs" c="dimmed" mr={value ? 4 : 0}>{label}</Text>
      {value && <Text span size="xs" fw={600}>{value}</Text>}
    </Button>
  );
  return (
    <Popover position="bottom-start" withArrow shadow="md" width={wide ? undefined : 220}>
      <Popover.Target>
        {tip ? <Tooltip label={tip} multiline w={280} withArrow openDelay={300}>{btn}</Tooltip> : btn}
      </Popover.Target>
      <Popover.Dropdown>{children}</Popover.Dropdown>
    </Popover>
  );
}

/** The 28px vertical re-open tab, flush to the plot's left edge, rendered ONLY
 *  when the rail is collapsed.  A `›` chevron + a rotated micro-label `SET · N`
 *  (N = the selected-set size = load-bearing scent: the SET is state, not just
 *  navigation).  The whole strip is the click target (a large Fitts edge strip,
 *  Linear/Notion idiom), mirroring the collapse chevron's corner. */
function RailReopenTab({ count, onExpand }: { count: number; onExpand: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Tooltip label="Show the component browser (shortcut: [ )" withArrow position="right">
      <Box
        onClick={onExpand}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        role="button" aria-label="show component browser" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onExpand(); } }}
        style={{
          width: 28, flexShrink: 0, height: "100%", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          paddingTop: 10,
          borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
          background: hover
            ? "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))"
            : "transparent",
          transition: "background 120ms",
        }}>
        <IconChevronRight size={15} color="var(--mantine-color-dimmed)" />
        <Text size="xs" fw={700} c="dimmed"
          style={{ writingMode: "vertical-rl", letterSpacing: 0.5, userSelect: "none" }}>
          SET · {count}
        </Text>
      </Box>
    </Tooltip>
  );
}
