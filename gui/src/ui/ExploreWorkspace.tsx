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
  Popover, Select, Stack, Switch, Text, Tooltip,
} from "@mantine/core";
import { IconAdjustmentsHorizontal, IconBook } from "@tabler/icons-react";

import { resolveAdapter } from "../adapters/index.js";
import { EXPLORE_OUTPUT, synthesizeExploreCase, type ExploreSpec } from "../case/exploreSynth.js";
import { caseComponentFiles, caseComponents, mergeCatalogue, metaByName, type ComponentMeta } from "../case/catalogue.js";
import { fromJson, serialize } from "../dict/index.js";
import { CsvAutoPlot, axisDisplay } from "./plotting/CsvAutoPlot.js";
import { PurePhaseDiagram } from "./plotting/PurePhaseDiagram.js";
import { PsychroPlot } from "./plotting/PsychroPlot.js";
import { BinaryLlePlot } from "./plotting/BinaryLlePlot.js";
import { McCabePlot } from "./plotting/McCabePlot.js";
import { CompoundBrowser } from "./explore/CompoundBrowser.js";
import { EstimateForm } from "./explore/EstimateForm.js";
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
  // Steam tables (steamTables engine op): IAPWS-IF97 (R7-97(2012)), the WATER
  // industrial formulation — the saturated-steam table (region-4 line) or an
  // isobar (h,s,v,cp vs T; the engine announces the Tsat crossing).
  { id: "steam", label: "Steam tables (IF97)", min: 1, max: 1, vle: false,
    why: "IF97 is the water formulation — select water alone" },
];

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
    case "mccabe": return "ch:flash";       // McCabe-Thiele over the binary VLE curve
    case "gamma": return "ch:activity";     // activity coefficients
    case "ternary": return "sec:ternary";   // ternary boiling surface
    case "ternaryLle": return "ch:lle-gibbs"; // liquid-liquid / solubility
    case "phase": return "ch:vap";           // vapour pressure / saturation
    case "psychro": return "ch:drying";      // psychrometrics / wet-bulb / Lewis number
    case "scaling": return "ch:electrolytes"; // ionic strength / activity / Pitzer
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
  const isVle = plotType === "txy" || plotType === "gamma" || plotType === "mccabe";
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

    if (plotType === "txy" || plotType === "gamma" || plotType === "mccabe") {
      // binary VLE: sweep x of the first component 0->1 at fixed P.  McCabe-Thiele
      // needs the SAME y_eq(x) curve as the T-x-y — so it shares that branch
      // (T_bubble + y_eq_<c1>); the staircase is then pure TS, zero re-solve.
      const c1 = selected[0] ?? "", c2 = selected[1] ?? "";
      const isTxy = plotType === "txy" || plotType === "mccabe";
      // the T-x-y also probes per-x liquid-liquid stability so it can mark the
      // immiscibility gap instead of drawing a phantom homogeneous curve.
      const properties = isTxy
        ? ["T_bubble", `y_eq_${c1}`, "liquid_stable"]
        : [`gamma_${c1}`, `gamma_${c2}`];
      return {
        components: selected,
        properties,
        axis: { variable: `x[${c1}]`, from: 0, to: 1, n: Math.max(2, Math.round(nPts)) },
        state: { P: fixedP, composition },
        activityModel: { model: activity },     // NRTL auto-resolves the pair by name
        equationOfState: { model: eos },
        ...(isTxy ? { vleTwoLiquid: true } : {}),   // 2-liquid package so the LL probe can fire
        // UNIFAC is predictive — ship the group decomposition so it isn't ideal
        ...(activity === "UNIFAC" ? { unifacGroups: unifacGroupsBlock(selected, localUnifac) } : {}),
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
  }, [selected, plotType, property, axisVar, tFrom, tTo, pFrom, pTo, nPts, tieStride, fixedP, fixedT, eos, transportModel, activity, rhFrom, rhTo, rhStep, wbStep, ionTotals, scalingPHMode, scalingPH, scalingAtm, scalingPCO2, scalingT, scalingActivity, scalingEquil, scalingFeedFlow, recFrom, recTo, steamMode, satFrom, satTo, isoFrom, isoTo, steamP, localUnifac, localComponentFiles, hasLocal]);

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
        ? "choupoProps did not finish — see the Log."
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
  const helpUrl = theoryUrl(plotType, property);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); window.open(helpUrl, "_blank"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpUrl]);

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
  const subtitle = plotType === "phase"
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
        <LeftRail selected={selected} onAdd={addComp} onRemove={removeComp} vleContext={isVle || isTernary} caseComponents={caseList} onEstimate={openEstimate} />
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

  return (
    <Box style={{ position: "absolute", inset: 0, display: "flex", minHeight: 0 }}>
      <LeftRail selected={selected} onAdd={addComp} onRemove={removeComp} vleContext={isVle || isTernary} caseComponents={caseList} onEstimate={openEstimate} />
      <EstimateForm opened={estimateOpen} onClose={() => setEstimateOpen(false)} prefillName={estimatePrefill} />

      {/* RIGHT — plot-type strip + controls + canvas */}
      <Box style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Controls PINNED at the top — the plot-type strip + the unit bars stay
            visible; only the plot/below scrolls (they no longer slide away). */}
        <Box style={{ flex: "0 0 auto", padding: 16, paddingBottom: 8 }}>
        <Stack gap="sm">
          {/* plot-type strip: only the views that APPLY to the current selection
              are shown -- a non-applicable view (steam tables for a non-water
              component, a binary plot for one compound, ...) DISAPPEARS rather
              than sitting greyed (Vitor 2026-06-15).  The currently-active view
              is kept even if it just became invalid, so the toggle never
              vanishes under you -- it stays disabled with its reason. */}
          <Group gap={6}>
            {PLOT_TYPES.filter((pt) => reasonFor(pt) === null || pt.id === plotType).map((pt) => {
              const reason = reasonFor(pt);
              const btn = (
                <Button key={pt.id} size="xs" variant={pt.id === plotType ? "filled" : "default"}
                  color="accent" disabled={!!reason} onClick={() => setPlotType(pt.id)}>
                  {pt.label}
                </Button>
              );
              return reason ? <Tooltip key={pt.id} label={reason} withArrow multiline w={240}>{<span>{btn}</span>}</Tooltip> : btn;
            })}
          </Group>

          {/* loud mode pill — the pure-vs-mixture distinction the forum flagged
              as too easy to miss in the subtitle alone */}
          {plotType === "scan" && (
            <Badge size="sm" variant="light" tt="none" w="fit-content"
              color={scanMode === "pure" ? "teal" : "accent"}>
              {scanMode === "pure"
                ? "PURE-component · one curve per compound · composition ignored"
                : selected.length >= 2
                  ? `MIXTURE scalar · equimolar (xᵢ = 1/${selected.length})`
                  : "MIXTURE scalar · single component (x = 1.0)"}
            </Badge>
          )}
          <Group gap="xs" align="center" wrap="nowrap">
            <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 0 }}>{subtitle}</Text>
            <Tooltip label="Open the matching section of the Theory Guide (or press F1)" withArrow>
              <Button component="a" href={helpUrl} target="_blank" rel="noopener noreferrer"
                variant="subtle" size="compact-xs" leftSection={<IconBook size={14} />}>
                Theory
              </Button>
            </Tooltip>
          </Group>

          <Group align="end" gap="sm" wrap="wrap">
            {plotType === "scan" && (
              <>
                <Select label="Property"
                  data={[
                    { group: "pure component", items: PURE_PROPS },
                    { group: "mixture scalar", items: MIXTURE_PROPS },
                    { group: "transport (no EOS)",
                      items: TRANSPORT_PROPS.map((v) => ({ value: v, label: TRANSPORT_LABEL[v] ?? v })) },
                  ]}
                  value={property} onChange={(v) => setProperty(v ?? "Psat")} w={190} allowDeselect={false} />
                <Select label="Axis" data={["T", "P"]} value={axisVar}
                  onChange={(v) => setAxisVar((v as "T" | "P") ?? "T")} w={70} allowDeselect={false} />
                <NumberInput label={`from (${axisUnit})`} value={axisToDisp(fromV)}
                  onChange={(v) => setFromV(axisToSI(num(v, axisToDisp(fromV))))} w={110} />
                <NumberInput label={`to (${axisUnit})`} value={axisToDisp(toV)}
                  onChange={(v) => setToV(axisToSI(num(v, axisToDisp(toV))))} w={110} />
                {axisVar === "P" && <NumberInput label={`T (${temperatureLabel(Tu)})`} value={kToDisplay(fixedT, Tu)}
                  onChange={(v) => setFixedT(parseTemperature(num(v, kToDisplay(fixedT, Tu)), Tu))} w={100} />}
              </>
            )}
            {plotType === "scaling" && (
              <>
                {/* The water analysis: total (element) molalities; 0 drops the
                    ion.  Defaults = the tutorial's brackish groundwater. */}
                <Tooltip label="analysis units — mg/L converts to molality at ρ ≈ 1 kg/L (dilute); the synthesized dict always carries mol/kg water" multiline w={260} withArrow>
                  <Select label="analysis" data={["mg/L", "mol/kg"]} value={ionUnit}
                    onChange={(v) => setIonUnit((v as "mg/L" | "mol/kg") ?? "mg/L")} w={92} allowDeselect={false} />
                </Tooltip>
                {SCALING_IONS.map(({ ion, mw }) => (
                  <NumberInput key={ion} label={ion} w={86} min={0}
                    value={ionToDisp(ionTotals[ion] ?? 0, mw)}
                    step={ionUnit === "mg/L" ? 10 : 0.001}
                    decimalScale={ionUnit === "mg/L" ? 2 : 6}
                    onChange={(v) => setIonTotals((t) => ({
                      ...t,
                      [ion]: Math.max(0, ionToMolal(num(v, ionToDisp(t[ion] ?? 0, mw)), mw)),
                    }))} />
                ))}
                <Tooltip label="solved (electroneutrality): H+ joins the unknowns, charge balance closes the system per point — the engine announces the feed charge imbalance the solved pH absorbs.  given: the numeric pH is held across the scan (no degassing / alkalinity shift)." multiline w={300} withArrow>
                  <Select label="pH" w={190} allowDeselect={false}
                    data={[
                      { value: "solve", label: "solved (electroneutrality)" },
                      { value: "given", label: "given" },
                    ]}
                    value={scalingPHMode}
                    onChange={(v) => setScalingPHMode((v as "solve" | "given") ?? "solve")} />
                </Tooltip>
                <NumberInput label="pH value" value={scalingPH} w={80} min={0} max={14} step={0.1}
                  disabled={scalingPHMode === "solve"}
                  onChange={(v) => setScalingPH(num(v, scalingPH))} />
                <Tooltip label="closed: every total (DIC included) concentrates as feed/(1−r).  open (CO₂): the concentrate equilibrates with the atmosphere — a(CO2aq) pinned by Henry, DIC a solved outcome (degassing / invasion allowed)." multiline w={300} withArrow>
                  <Select label="system" w={110} allowDeselect={false}
                    data={[
                      { value: "closed", label: "closed" },
                      { value: "open", label: "open (CO₂)" },
                    ]}
                    value={scalingAtm}
                    onChange={(v) => setScalingAtm((v as "closed" | "open") ?? "closed")} />
                </Tooltip>
                {scalingAtm === "open" && (
                  <NumberInput label="pCO₂ (atm)" value={scalingPCO2} w={110} min={0}
                    step={1e-4} decimalScale={6}
                    onChange={(v) => setScalingPCO2(Math.max(0, num(v, scalingPCO2)))} />
                )}
                <NumberInput label={`T (${temperatureLabel(Tu)})`} w={86}
                  value={Number(kToDisplay(scalingT, Tu).toFixed(2))}
                  onChange={(v) => setScalingT(parseTemperature(num(v, kToDisplay(scalingT, Tu)), Tu))} />
                <Tooltip label="Davies (extended Debye-Hückel): single I-controlled curve, quantitative to I ≈ 0.5 mol/kg, indicative beyond.  Pitzer HMW: ion-specific virial interactions (e.g. the Ca-SO4 2:2 pairing), validated vs HMW-1984 seawater to I ≈ 6 mol/kg.  The SI curves track at low I and FORK in brine — the recovery decision flips on the model." multiline w={320} withArrow>
                  <Select label="activity" w={190} allowDeselect={false}
                    data={[
                      { value: "davies", label: "Davies (to I~0.5)" },
                      { value: "pitzer", label: "Pitzer HMW (brines, to I~6)" },
                    ]}
                    value={scalingActivity}
                    onChange={(v) => setScalingActivity((v as "davies" | "pitzer") ?? "davies")} />
                </Tooltip>
                <Tooltip label="off: SI only — how supersaturated each mineral is vs recovery (the propensity curve).  on: let the scaling minerals (calcite, gypsum) precipitate to SI = 0 — the engine reports SIeq_<m> (clamped at 0), n_<m> and scale_<m> (the deposit curve).  EQUILIBRIUM CEILING: the thermodynamic maximum (SI→0, infinite time, no nucleation barrier), NOT a kinetic deposit prediction — real scale ≤ ceiling, antiscalants act on kinetics this cannot see." multiline w={320} withArrow>
                  <Select label="equilibrium" w={210} allowDeselect={false}
                    data={[
                      { value: "off", label: "off — SI only (propensity)" },
                      { value: "on", label: "on — precipitate to SI = 0" },
                    ]}
                    value={scalingEquil ? "on" : "off"}
                    onChange={(v) => setScalingEquil(v === "on")} />
                </Tooltip>
                {scalingEquil && (
                  <Tooltip label="feed volumetric flow — enables the kg/day scale-rate column (kgday_<m>).  Optional even with equilibrium on: without it the engine still gives the precipitated amount in mol/kg." multiline w={280} withArrow>
                    <NumberInput label="feed flow (m³/h)" value={scalingFeedFlow} w={120} min={0} step={1}
                      onChange={(v) => setScalingFeedFlow(Math.max(0, num(v, scalingFeedFlow)))} />
                  </Tooltip>
                )}
                <NumberInput label="recovery from" value={recFrom} w={110} min={0} max={0.98} step={0.05}
                  onChange={(v) => setRecFrom(num(v, recFrom))} />
                <NumberInput label="to" value={recTo} w={86} min={0.01} max={0.99} step={0.05}
                  onChange={(v) => setRecTo(num(v, recTo))} />
              </>
            )}
            {plotType === "steam" && (() => {
              // Per-mode T range (different defaults + validity), shared inputs.
              const sFrom = steamMode === "saturation" ? satFrom : isoFrom;
              const sTo = steamMode === "saturation" ? satTo : isoTo;
              const setSFrom = steamMode === "saturation" ? setSatFrom : setIsoFrom;
              const setSTo = steamMode === "saturation" ? setSatTo : setIsoTo;
              const views = steamMode === "saturation" ? STEAM_SAT_VIEWS : STEAM_ISO_VIEWS;
              const propPick = views[steamProp] ? steamProp : "h";
              return (
                <>
                  <Tooltip label="saturation curve: the region-4 line with the f/g property pairs (regions 1/2 evaluated on the line, valid 0.01–350 °C).  isobar: h, s, v, cp vs T at fixed P — crossing Tsat jumps the properties." multiline w={280} withArrow>
                    <Select label="mode" w={150} allowDeselect={false}
                      data={[
                        { value: "saturation", label: "saturation curve" },
                        { value: "isobar", label: "isobar" },
                      ]}
                      value={steamMode}
                      onChange={(v) => setSteamMode((v as "saturation" | "isobar") ?? "saturation")} />
                  </Tooltip>
                  {steamMode === "isobar" && (
                    <NumberInput label={`P (${pressureLabel(Pu)})`} value={paToDisplay(steamP, Pu)} w={100}
                      onChange={(v) => setSteamP(parsePressure(num(v, paToDisplay(steamP, Pu)), Pu))} />
                  )}
                  <NumberInput label={`from (${temperatureLabel(Tu)})`} w={110}
                    value={Number(kToDisplay(sFrom, Tu).toFixed(2))}
                    onChange={(v) => setSFrom(parseTemperature(num(v, kToDisplay(sFrom, Tu)), Tu))} />
                  <NumberInput label={`to (${temperatureLabel(Tu)})`} w={110}
                    value={Number(kToDisplay(sTo, Tu).toFixed(2))}
                    onChange={(v) => setSTo(parseTemperature(num(v, kToDisplay(sTo, Tu)), Tu))} />
                  <Tooltip label="one property family at a time — the full table mixes magnitudes (psat ~10⁷ Pa beside v_f ~10⁻³ m³/kg) that flatten each other on a shared axis" multiline w={260} withArrow>
                    <Select label="property" w={150} allowDeselect={false}
                      data={Object.entries(views).map(([value, vw]) => ({ value, label: vw.label }))}
                      value={propPick}
                      onChange={(v) => setSteamProp(v ?? "h")} />
                  </Tooltip>
                </>
              );
            })()}
            {/* resolution / performance knobs tucked into a ⚙ popover — not
                the physics, so they don't clutter the main row.  For the
                psychrometric chart EVERY knob lives here (the chart fills the
                row): range, humidity, saturation-line spacing, y-scale. */}
            <Popover position="bottom-end" withArrow shadow="md">
              <Popover.Target>
                <Tooltip label={plotType === "psychro" ? "chart options" : "resolution & display options"} withArrow>
                  <ActionIcon variant="default" size="lg" aria-label="options" style={{ alignSelf: "flex-end" }}>
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
            {plotType === "ternaryLle" && <NumberInput label={`T (${temperatureLabel(Tu)})`} value={kToDisplay(fixedT, Tu)}
              onChange={(v) => setFixedT(parseTemperature(num(v, kToDisplay(fixedT, Tu)), Tu))} w={100} />}
            {(isVle || isTernary || (plotType === "scan" && axisVar === "T")) && <NumberInput label={`P (${pressureLabel(Pu)})`} value={paToDisplay(fixedP, Pu)}
              onChange={(v) => setFixedP(parsePressure(num(v, paToDisplay(fixedP, Pu)), Pu))} w={100} />}
            {showGamma && (
              <Tooltip label="liquid activity model: ideal = Raoult (no azeotrope); NRTL/Wilson auto-resolve curated binary pairs by name, else that pair is ideal; UNIFAC is PREDICTIVE (γ from molecular groups, no fitted pairs) — a component without a group decomposition is treated as ideal" multiline w={280} withArrow>
                <Select label="γ model" data={["ideal", "NRTL", "Wilson", "UNIFAC"]} value={activity}
                  onChange={(v) => setActivity(v ?? "NRTL")} w={120} allowDeselect={false} />
              </Tooltip>
            )}
            {showEos && (
              <Tooltip label="vapour equation of state: idealGas ⇒ Z = 1; SRK/PR are cubic real-gas models" multiline w={240} withArrow>
                <Select label="EoS" data={["idealGas", "SRK", "PR"]} value={eos}
                  onChange={(v) => setEos(v ?? "idealGas")} w={110} allowDeselect={false} />
              </Tooltip>
            )}
            {showTransport && (
              <Tooltip label="transport correlation, chosen WITHIN a family (e.g. Andrade vs Vogel) — a sibling of the EOS, never driven by it; both move the curve, so you SEE which you commit to" multiline w={280} withArrow>
                <Select label="model" data={tModels} value={tModel}
                  onChange={(v) => setTransportModel(v ?? tModels[0]!)} w={130} allowDeselect={false} />
              </Tooltip>
            )}
            {/* (v) multi-method: overlay several models of the same family and
                SEE the spread.  Only for a scan of ONE component on a comparable
                family; opt-in (single-model is the default). */}
            {compareFamily && (
              <Group gap={8} align="flex-end" style={{ alignSelf: "flex-end", paddingBottom: 4 }}>
                <Tooltip label="overlay several models of the same family and SEE the spread (≤3)" withArrow multiline w={240}>
                  <Switch size="xs" checked={compareOn} onChange={(e) => setCompareOn(e.currentTarget.checked)}
                    label="compare" styles={{ label: { fontSize: 11 } }} />
                </Tooltip>
                {compareOn && (
                  <Chip.Group multiple value={cmpModels}
                    onChange={(v) => setCompareModels((v as string[]).slice(0, 3))}>
                    <Group gap={4}>
                      {compareFamily.models.map((m) => (
                        <Chip key={m} size="xs" value={m} color="accent">{m}</Chip>
                      ))}
                    </Group>
                  </Chip.Group>
                )}
              </Group>
            )}
            {/* No Plot button — the view recomputes live on any change. */}
            {busy && (
              <Group gap={6} style={{ alignSelf: "flex-end", paddingBottom: 6 }}>
                <Loader size="xs" /><Text size="xs" c="dimmed">computing…</Text>
              </Group>
            )}
          </Group>

          {pairNote && <Text size="xs" c="dimmed">{pairNote}</Text>}
          {skipped.length > 0 && (
            <Text size="xs" c="dimmed">No vapour pressure (curve not shown): {skipped.join(", ")}</Text>
          )}
          {/* Validity readout: the ionic strength the engine computed rides the
              CSV (column I); the SI axis stays pure log10(IAP/K). */}
          {iEnds && (
            <Text size="xs" c="dimmed">
              ionic strength I = {iEnds.first.toPrecision(3)} → {iEnds.last.toPrecision(3)} mol/kg
              across the scan — {scalingActivity === "pitzer"
                ? "Pitzer-HMW activity is quantitative to I ≈ 6 mol/kg (brine-grade)"
                : "Davies activity is quantitative to I ≈ 0.5 mol/kg"}
            </Text>
          )}
          {/* The op's own honesty lines (e.g. Davies beyond trust range), lifted
              off the run log so the Explorer never swallows them. */}
          {opAdvisories.length > 0 && (
            <Alert color="yellow" variant="light" title="Solver advisory">
              {opAdvisories.map((a) => (<Text key={a} size="xs">{a}</Text>))}
            </Alert>
          )}
          {idealLieWarning && (
            <Alert color="orange" variant="light" title="Assuming ideal mixing — not your real system">
              <Text size="xs">{idealLieWarning}</Text>
            </Alert>
          )}
          {lleInTxy && (
            <Alert color="orange" variant="light" title="Heteroazeotrope — flat three-phase line">
              <Text size="xs">{lleInTxy}</Text>
            </Alert>
          )}
          {err && <Alert color="red" variant="light">{err}</Alert>}
          {activeReason && <Alert color="yellow" variant="light" title="Cannot plot">{activeReason}</Alert>}
        </Stack>
        </Box>

        {/* Scrollable body: the plot + method chips/spread + author/snippet. */}
        <Box style={{ flex: 1, minWidth: 0, overflow: "auto", padding: 16, paddingTop: 8 }}>
        <Stack gap="sm">
          {csv ? (
            <Box style={{ height: plotType === "mccabe" ? 720 : 460, position: "relative" }}>
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
                <McCabePlot csv={dropCsvColumn(csv, "liquid_stable")}
                  compA={selected[0] ?? ""} compB={selected[1] ?? ""} P={fixedP} />
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
            <Box style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">computing — {subtitle}</Text></Group>
            </Box>
          ) : (
            <Box style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Text size="sm" c="dimmed">{subtitle}</Text>
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
              <Group gap={8} align="center">
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

          <Group gap="xs">
            <Button variant="subtle" size="xs" onClick={() => setSnippetOpen((o) => !o)}>
              {snippetOpen ? "Hide propsDict" : "Author this exploration → copy propsDict"}
            </Button>
            {isVle && <Text size="xs" c="dimmed">NRTL/Wilson pairs auto-resolve by name; absent → ideal (no azeotrope).</Text>}
          </Group>
          <Collapse in={snippetOpen}>
            <Text size="xs" c="dimmed" mb={4}>
              Create or open a case, then put this block in <code>system/propsDict</code> under
              <code> operations ( … )</code>; keep <code>constant/thermoPackage</code> in sync with the
              components/models above, and <code>runCase</code>.
            </Text>
            <Group gap="xs" mb={4}>
              <CopyButton value={snippet}>
                {({ copied, copy }) => (
                  <Button size="xs" variant={copied ? "filled" : "light"} color="accent" onClick={copy}>
                    {copied ? "Copied ✓" : "Copy propsDict"}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Code block style={{ fontSize: 11 }}>{snippet}</Code>
          </Collapse>
        </Stack>
        </Box>
      </Box>
    </Box>
  );
}

/** The compound browser rail — shared by the empty state and the live view. */
function LeftRail({
  selected, onAdd, onRemove, vleContext = false, caseComponents, onEstimate,
}: {
  selected: string[];
  onAdd: (n: string) => void;
  onRemove: (n: string) => void;
  vleContext?: boolean;
  caseComponents: ComponentMeta[];
  onEstimate: (name: string) => void;
}) {
  return (
    <Box style={{
      width: 240, flexShrink: 0, height: "100%", padding: 12, overflow: "hidden",
      borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
    }}>
      <CompoundBrowser selected={selected} onAdd={onAdd} onRemove={onRemove} vleContext={vleContext} caseComponents={caseComponents} onEstimate={onEstimate} />
    </Box>
  );
}
