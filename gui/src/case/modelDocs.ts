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

import { guideUrl } from "../help/guideLinks.js";

/*---------------------------------------------------------------------------*\
  modelDocs -- pull the prose that DESCRIBES a unit-op's model out of
  docs/ai/unit-ops.md, so the unit's Internals "Model" tab can SHOW the
  description inline (glass-box: the student reads what equations the unit
  solves right where they inspect it), with a pointer to the deeper theory.

  unit-ops.md documents each built-in under a `### \`<type>\`` heading; we
  slice from that heading to the next `### ` heading.  One copy in the bundle.
\*---------------------------------------------------------------------------*/

// Raw text of the unit-op catalogue (Vite reads it via server.fs.allow: ['..']).
const UNIT_OPS = import.meta.glob("../../../docs/ai/unit-ops.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function catalogue(): string {
  const key = Object.keys(UNIT_OPS)[0];
  return (key ? UNIT_OPS[key] : "") ?? "";
}

// The `### <type>` section (heading + body, up to the next `### `), or null.
// Matches `### \`cstr\``, `### cstr`, with the type token anywhere in the line.
export function modelSection(type: string): string | null {
  if (!type) return null;
  const text = catalogue();
  if (!text) return null;
  const lines = text.split("\n");
  const re = new RegExp("^###\\s.*\\b" + type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i] ?? "")) { start = i; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^###\s/.test(lines[i] ?? "")) { end = i; break; }
  }
  return stripAcceptanceRegions(lines.slice(start, end)).join("\n").trim();
}

// The generated "what this unit accepts" region (bin/curate/
// gen_unit_acceptance_docs.py) is drawn from its JSON twin
// (case/unitAcceptance.ts), so the raw text drops it rather than show it
// twice -- markers included, which a plain-text panel would print verbatim.
function stripAcceptanceRegions(lines: string[]): string[] {
  const out: string[] = [];
  let inside = false;
  for (const l of lines) {
    if (/^<!-- BEGIN GENERATED unit-acceptance /.test(l)) { inside = true; continue; }
    if (/^<!-- END GENERATED unit-acceptance /.test(l)) { inside = false; continue; }
    if (!inside) out.push(l);
  }
  return out;
}

// Unit-op type -> the Theory Guide named destination (\label in the .tex,
// surfaced as a PDF dest by hyperref's destlabel option).  The URL itself is
// built by `help/guideLinks` (the ONE home): it opens Choupo's own viewer page
// at that exact section, never a bare .pdf the browser might download.
// EVERY registered unit-op type maps to its Theory-Guide section.  Keep this in
// sync with registerBuiltins() (src/unitOperations/UnitOperation.cpp) -- every
// unit a student can place must point at the chapter that derives its model.
const THEORY_DEST: Record<string, string> = {
  // reactors
  cstr: "ch:cstr",
  pfr: "ch:pfr",
  gibbsReactor: "ch:gibbs-reactor",
  // spec-driven (non-kinetic) reactors: outlet fixed by a user conversion
  // (RStoic) or by mass yields (RYield).  No kinetics -- the outlet is a pure
  // stoichiometric / yield balance.  The conversion reactor has its own chapter
  // (extent from a specified conversion, contrasted with the Gibbs reactor).
  // yieldReactor is mass-yield distribution (no kinetics, no free energy) -- it
  // belongs with the spec-driven conversion reactor, NOT the Gibbs free-energy
  // minimiser (sending a student there mis-teaches the mechanism).
  conversionReactor: "ch:conversion-reactor",
  yieldReactor: "ch:conversion-reactor",
  batchReactor: "ch:batch-adiabatic",
  // the 1-D fixed bed (choupoBatch): its finite-volume balance; the scheme's
  // words open their own equations (SLOT_MODEL_DEST, C375).
  fixedBedAdsorber: "sec:fixed-bed",
  dynamicCSTR: "ch:dyn-cstr",
  dynamicTank: "ch:dyn-tank",
  // distillation / gas contacting
  distillationColumn: "ch:distillation",
  column: "ch:distillation",
  shortcutColumn: "ch:fug",
  FUG: "ch:fug",
  absorber: "ch:absorber",
  stripper: "ch:absorber",
  // flash + saturation
  flash: "ch:flash",
  isothermalFlash: "ch:flash",
  //  NOT `ch:flash`.  That label sits on a section titled "Isothermal flash,
  //  vapour-liquid", and `adiabaticFlash` is a DIFFERENT engine class -- so
  //  a student clicking "Theory -- the section deriving this unit" on an
  //  adiabatic drum landed on the derivation of the isothermal one, under a
  //  link promising it derived theirs.  Vítor found it on the first case a
  //  student runs.
  //
  //  A SHARED DESTINATION IS HONEST ONLY WHEN ITS HEADING COVERS EVERY TYPE
  //  THAT LANDS ON IT.  Measured across the whole table: 54 mapped types,
  //  28 destinations, 17 of them shared -- and every other share passes that
  //  test by its own heading ("compressors, turbines, pumps"; "cyclone, bag
  //  filter, ideal splitter"; "boiler / condenser"), or is an umbrella that
  //  names none of them on purpose ("The simple unit operations").  This was
  //  the only one that named ONE sharer and excluded another.
  //
  //  The adiabatic flash IS derived, inside that same chapter: the outer
  //  Newton in T around the isothermal kernel, whose two-loop figure carries
  //  the derivation in its caption.  `destlabel=true` (docs/preamble.tex)
  //  makes every \label a PDF named destination, so this resolves without
  //  touching the guide.
  adiabaticFlash: "fig:adiabatic-flash-loops",
  bubbleT: "ch:bubble-dew-ref",
  dewT: "ch:bubble-dew-ref",
  // membrane
  spiralWoundModule: "ch:membrane",
  membraneSW: "ch:membrane",
  spiralWound: "ch:membrane",
  // heat transfer
  heatExchanger: "sec:hx-design",   // rating + design + dP (the richer section)
  // multi-stream HX (MHeatX): N hot + M cold inside one adiabatic shell -- a
  // CHECKER not a solver (user furnishes all T_out, unit verifies Sum Q = 0 and
  // reads the internal pinch off pooled hot/cold composite curves).
  multiStreamHX: "ch:mheatx",
  MHeatX: "ch:mheatx",
  evaporator: "ch:evap-mode2",
  // dome-crossing phase change (boiler / condenser are aliases): wraps the
  // isothermal-flash (vf, x, y) kernel + dome-aware enthalpy, Q is the result.
  phaseChanger: "ch:phase-changer",
  boiler: "ch:phase-changer",
  condenser: "ch:phase-changer",
  // rotating + electrical
  compressor: "ch:rotating",
  turbine: "ch:rotating",
  pump: "ch:rotating",
  pressureExchanger: "sec:pressure-exchanger",
  electricLoad: "ch:simple-ops",
  // solids
  cyclone: "ch:solids-sep",
  bagFilter: "ch:solids-sep",
  gasSolidSplitter: "ch:solids-sep",
  crystalliser: "ch:crystalliser",
  batchCrystalliser: "ch:crystalliser",
  sprayDryer: "ch:drying",
  solidDryer: "ch:drying",
  // batch / control
  batchStill: "ch:rayleigh",
  still: "ch:rayleigh",
  batchAccumulator: "ch:rk4-packed",
  // simple plumbing
  mixer: "ch:simple-ops",
  splitter: "ch:simple-ops",
  heater: "ch:simple-ops",
  valve: "ch:simple-ops",
  // hydraulics: the dedicated Darcy-Weisbach chapter (mechanical-energy
  // balance, laminar 64/Re + Colebrook/Haaland/Churchill turbulent factor,
  // minor losses, static head) -- pressure drop is a computed RESULT.
  pipe: "ch:hydraulics",
  pneumaticConveyor: "sec:pneumatic-conveying",   // particle drag+Yang+saltation+bends
  // size reduction (DEV.md 4c C361): the breakage population balance on the
  // case's size grid; each selectable model opens its own subsection through
  // SLOT_MODEL_DEST below.
  mill: "sec:mill",
  // classification on the same grid (DEV.md 4c C361 slice 3): the three
  // classifiers, each its own section; the models and the partition curves
  // open theirs through SLOT_MODEL_DEST below.
  classifier: "sec:classifier",
  screen: "sec:screen",
  hydrocyclone: "sec:hydrocyclone",
  // solid-liquid separation (DEV.md 4c C361 slice 4): the three units, each
  // its own section; every selectable word opens its own through
  // SLOT_MODEL_DEST below.
  cakeFilter: "sec:cakeFilter",
  thickener: "sec:thickener",
  sedimentingCentrifuge: "sec:sedimentingCentrifuge",
  // liquid-liquid extraction column: each theoretical stage IS one LL Gibbs-
  // minimisation flash; the cascade just tears the counter-current stages.
  // The dedicated chapter (ch:extractor) extends the LL-flash chapter
  // (ch:lle-gibbs) with the counter-current Gauss-Seidel cascade.
  extractor: "ch:extractor",
  extract: "ch:extractor",
  // electrolyte / electrochemical separations: ion activities + speciation are
  // the electrolyte chapters; the ion-exchange mass action is solved by the SAME
  // log-molality / charge-balance Newton as aqueous speciation, and the ED
  // stack's Nernst / limiting-current build on those ion activities.
  ionExchanger: "ch:speciation",
  electrodialysisStack: "ch:electrolytes",
  // aqueous-speciation property ops: mass action + electroneutrality pH closure
  // + PHREEQC percent-error, and the SI/scaling scan layered on the same Newton.
  speciate: "ch:speciation",
  scalingScan: "ch:speciation",
};

// A link that opens the theory guide at the unit's section, or null.
export function theoryLink(type: string): string {
  // Every unit-op gets a Theory link (Vitor: none must fall through).  A mapped
  // type deep-links to its section; an unmapped one (a unit with no dedicated
  // theory chapter yet, e.g. psa, or any newly-added op) lands on the guide's
  // front so the student can still navigate -- honest, never a dead link.
  const dest = THEORY_DEST[type];
  return dest
    ? guideUrl("theoryGuide", dest)
    : guideUrl("theoryGuide");
}

// Props-mode item GROUP -> the Properties-Guide section that derives the theory
// behind that estimate / test / fit.  (propsGuide.tex labels via destlabel.)
const PROPS_DEST: Record<string, string> = {
  Foundation: "ch:property-package",  // the thermo-readiness panel: what the
                                      // package selects + where the data lives
  Estimate: "ch:joback",              // group contribution (Joback + Lee-Kesler)
  Comparison: "ch:pairs",             // the see-then-decide model overlay
  Fit: "ch:pairs",                    // binary-pair regression (LM)
  Consistency: "ch:consistency-props",// area + Gibbs-Duhem tests on the data
};

// A link that opens the Properties Guide at the section behind a props item, or
// null (Points / Scan have no dedicated theory section).
export function propsTheoryLink(group: string): string | null {
  const dest = PROPS_DEST[group];
  if (!dest) return null;
  return guideUrl("propsGuide", dest);
}

// Per-OP-TYPE help destination (the F1 target): what does THIS operation do?
// Maps every registered choupoProps op type to the guide section that
// explains it; falls back to the Properties Guide front (the bench: CREATE /
// SEE / TEST / FIT) so F1 always lands somewhere useful.
const OP_DEST: Record<string, { pdf: string; dest?: string }> = {
  // THEORY-FIRST (F1 = the thermophysics + the numerical method of what runs):
  speciate:          { pdf: "theoryGuide.pdf", dest: "ch:speciation" },    // mass action + charge balance + Newton in log-molality
  scalingScan:       { pdf: "theoryGuide.pdf", dest: "ch:speciation" },    // + the speciation->SI scaling link
  exchange:          { pdf: "theoryGuide.pdf", dest: "ch:ion-exchange" },  // Gaines-Thomas mass action
  pitzerActivity:    { pdf: "theoryGuide.pdf", dest: "ch:electrolytes" },  // ionic strength, phi, Pitzer 1:1
  electrolyteActivity: { pdf: "theoryGuide.pdf", dest: "ch:electrolytes" },
  enrtlMixedSolvent: { pdf: "theoryGuide.pdf", dest: "sec:enrtl-mixed" },  // Chen & Song segment eNRTL
  enrtlMultiSalt: { pdf: "theoryGuide.pdf", dest: "ch:electrolytes" },     // Song & Chen 2009 multicomponent
  gibbsMap: { pdf: "theoryGuide.pdf", dest: "sec:gibbs-maps" },                  // equilibrium maps (forum 2026-07-02)
  fitParameters:     { pdf: "theoryGuide.pdf", dest: "ch:lm" },            // Levenberg-Marquardt
  vaporPressureFit:  { pdf: "theoryGuide.pdf", dest: "ch:lm" },
  heatCapacityFit:   { pdf: "theoryGuide.pdf", dest: "ch:lm" },
  kinetics1D:        { pdf: "theoryGuide.pdf", dest: "ch:lm" },
  // Workflow-first (the derivation lives in the Props Guide):
  estimateComponent: { pdf: "propsGuide.pdf", dest: "ch:joback" },
  vleConsistency:    { pdf: "propsGuide.pdf", dest: "ch:consistency-props" },
  propertyScan1D:    { pdf: "propsGuide.pdf", dest: "ch:pairs" },
  propertyScan2D:    { pdf: "propsGuide.pdf", dest: "ch:pairs" },
  propertyScanBinary:  { pdf: "propsGuide.pdf", dest: "ch:pairs" },
  propertyScanTernary: { pdf: "propsGuide.pdf", dest: "ch:pairs" },
  // The calculation map's op blocks (DEV.md 4c C151): the benches whose
  // derivation has a chapter of its own in the Theory Guide.
  poreTransport:      { pdf: "theoryGuide.pdf", dest: "sec:dspmde-model" },   // DSPM-DE pore at imposed J_v (the help index agrees, C166)
  polarisationIndex:  { pdf: "theoryGuide.pdf", dest: "sec:polarisation-multiionic" }, // Geraldes & Afonso 2007
  compactionFit:      { pdf: "theoryGuide.pdf", dest: "ch:powder-compaction" }, // Heckel, Kawakita, Ryshkewitch-Duckworth (C195)
  isothermEval:       { pdf: "theoryGuide.pdf", dest: "ch:adsorption" },      // the curated isotherm
  thielePellet:       { pdf: "theoryGuide.pdf", dest: "ch:thiele" },          // Thiele modulus, effectiveness
  reactionCurve:      { pdf: "theoryGuide.pdf", dest: "sec:reactioncurve" },  // open-loop identification
  hansenMixture:      { pdf: "theoryGuide.pdf", dest: "ch:hansen-mixture" },
  solubilityParameter: { pdf: "theoryGuide.pdf", dest: "ch:solubility-parameter" },
  enthalpyConcentration: { pdf: "theoryGuide.pdf", dest: "ch:ponchon" },
  rateLawBench:       { pdf: "theoryGuide.pdf", dest: "eq:ratelaw" },
  referenceEoS:       { pdf: "theoryGuide.pdf", dest: "ch:helmholtz-eos" }, // reference Helmholtz EoS (C333)
  // steamTables and every op above without a chapter of its own: the op's own
  // entry of the Props Guide's operations reference (`op:<type>`, generated by
  // bin/curate/props_ops_reference.py) -- what it computes and every key.
};
export function propsOpHelpLink(opType: string): string {
  const m = OP_DEST[opType];
  if (!m) return guideUrl("propsGuide", `op:${opType}`);
  return guideUrl(m.pdf, m.dest);
}

// ---------------------------------------------------------------------------
// Per-PROPERTY-MODEL theory destinations.
//
// The activity / EOS / vapour-pressure / transport panels in the unit
// Internals (and the props foundation card) name the ACTIVE sub-model -- the
// exact token a student writes in `thermoPackage` and the SAME string the C++
// factory dispatches on (registerBuiltins() in ActivityModel.cpp,
// EquationOfState.cpp, VaporPressureModel.cpp, plus the transport + reference-
// state correlations).  This map lets each of those panels deep-link to the
// section that DERIVES that one model -- glass-box: read the equation right
// where you pick the model.
//
// `guide` selects which companion PDF holds the section.  The property-model
// theory currently lives in theoryGuide (ch:activity, ch:cubic-eos, ...); the
// roadmap migrates the curation-facing derivations into propsGuide.  Until a
// given chapter LANDS in propsGuide we point at its real home in theoryGuide,
// so the link never 404s.  Flip a `guide` to "props" (and the dest) in the
// SAME commit that moves the chapter -- never leave a dangling nameddest.
//
// Keep the model tokens in sync with the registerBuiltins() of each base.
type ModelDest = { guide: "theory" | "props"; dest: string };
const PROPS_MODEL_DEST: Record<string, ModelDest> = {
  // -- activity coefficient (ActivityModel.cpp) ---------------------------
  ideal:    { guide: "theory", dest: "ch:ideal-mixing" }, // Raoult / ideal solution
  NRTL:     { guide: "theory", dest: "ch:activity" },     // local-composition, 3 params/pair
  Wilson:   { guide: "theory", dest: "ch:activity" },     // no LLE -- single-liquid only
  UNIQUAC:  { guide: "theory", dest: "ch:activity" },     // combinatorial + residual, r/q
  UNIFAC:   { guide: "theory", dest: "ch:activity" },     // PREDICTIVE group contribution
  // electrolyte activity (options of the activity slot; ElectrolyteModel iface)
  pitzer:   { guide: "theory", dest: "ch:pitzer-hmw" },   // ion-interaction (HMW virial)
  eNRTL:    { guide: "theory", dest: "ch:enrtl" },        // electrolyte-NRTL (local + PDH)
  // -- equation of state (EquationOfState.cpp) ----------------------------
  idealGas:     { guide: "theory", dest: "ch:fugacity" }, // phi = 1
  SRK:          { guide: "theory", dest: "ch:cubic-eos" },// Soave-Redlich-Kwong
  PR:           { guide: "theory", dest: "ch:cubic-eos" },// Peng-Robinson (same chapter)
  PengRobinson: { guide: "theory", dest: "ch:cubic-eos" },
  // -- vapour pressure (VaporPressureModel.cpp) ---------------------------
  Antoine:       { guide: "theory", dest: "ch:vap" },     // log10 P = A - B/(C+T)
  AmbroseWalton: { guide: "theory", dest: "ch:vap" },     // corresponding-states, needs Tc/Pc/omega
  // -- reference-state / pure-component correlations ----------------------
  Rackett:     { guide: "theory", dest: "ch:rackett" },        // saturated-liquid molar volume
  sublimation: { guide: "theory", dest: "ch:sublimation" },    // solid-vapour curve, triple point
  henry:       { guide: "theory", dest: "ch:fugacity" },       // dilute-solute K from Henry const
  // -- transport (used by HX / pipe / HETP) -------------------------------
  // both the property CATEGORY (panel label) and each dispatch token map to
  // the deriving chapter (TransportModel.cpp + the Liquid*/Thermal* siblings).
  viscosity:    { guide: "theory", dest: "ch:viscosity" },
  Chung:        { guide: "theory", dest: "ch:viscosity" },     // gas viscosity, corresponding states
  Andrade:      { guide: "theory", dest: "ch:viscosity" },     // liquid viscosity, Arrhenius-in-1/T
  Vogel:        { guide: "theory", dest: "ch:viscosity" },     // liquid viscosity, VFT 3-param
  conductivity: { guide: "theory", dest: "ch:thermal-cond" },
  Eucken:       { guide: "theory", dest: "ch:thermal-cond" },  // gas thermal conductivity
  SatoRiedel:   { guide: "theory", dest: "ch:thermal-cond" },  // liquid thermal conductivity
  Latini:       { guide: "theory", dest: "ch:thermal-cond" },
  diffusivity:  { guide: "theory", dest: "ch:diffusivity" },
  Fuller:       { guide: "theory", dest: "ch:diffusivity" },   // gas binary diffusivity
  WilkeChang:   { guide: "theory", dest: "ch:diffusivity" },   // liquid infinite-dilution diffusivity
  Scheibel:     { guide: "theory", dest: "ch:diffusivity" },
  // -- heat capacity (HeatCapacityModel.cpp) ------------------------------
  polynomial: { guide: "theory", dest: "ch:heat" },       // ideal-gas/liquid Cp = a + bT + cT^2 + ...
  // -- membrane transport (NF/RO) -----------------------------------------
  solutionDiffusion: { guide: "theory", dest: "ch:membrane" }, // textbook 2-param S-D
  "DSPM-DE":         { guide: "theory", dest: "ch:dspmde" },   // Donnan-steric pore + dielectric
  DSPMDE:            { guide: "theory", dest: "ch:dspmde" },
  SDEM:              { guide: "theory", dest: "ch:sdem" },     // solution-diffusion-electromigration
  // -- the choices INSIDE a pore law and its film (the calculation map's
  //    model rows, DEV.md 4c C151): each the equation that states it.
  DechadilokDeen2006: { guide: "theory", dest: "eq:dspmde-H" },  // hindrance polynomials
  finiteDifference:   { guide: "theory", dest: "eq:dspmde-sg" }, // the pore solved at every node at once
  bulkOverPoreDavies: { guide: "theory", dest: "sec:davies" },
  davies:             { guide: "theory", dest: "sec:davies" },
  StirredCell:        { guide: "theory", dest: "eq:film" },      // film coefficient of a stirred cell
  GeraldesAfonso2006: { guide: "theory", dest: "eq:polar-xi-2006" }, // suction correction
  GeraldesAfonso2007: { guide: "theory", dest: "sec:polarisation-multiionic" },
  electroneutral:     { guide: "theory", dest: "eq:polar-electroneutral" },
  // -- isotherms, regression, estimation, fixed forms ----------------------
  langmuir:           { guide: "theory", dest: "eq:langmuir" },
  LevenbergMarquardt: { guide: "theory", dest: "ch:lm" },
  Joback:             { guide: "props",  dest: "ch:joback" },
  pitzerHMW:          { guide: "theory", dest: "ch:pitzer-hmw" },
  PPR78:              { guide: "theory", dest: "ch:cubic-eos" },
  Thiele:             { guide: "theory", dest: "ch:thiele" },
  ratelaw:            { guide: "theory", dest: "eq:ratelaw" },
  gammaPhi:           { guide: "theory", dest: "ch:fugacity" },
  // -- reference equations of state (pureFluids method Helmholtz; C333) ----
  Helmholtz:          { guide: "theory", dest: "ch:helmholtz-eos" },
  IAPWS95:            { guide: "theory", dest: "sec:helmholtz-eos-fluids" },
  SpanWagner1996:     { guide: "theory", dest: "sec:helmholtz-eos-fluids" },
  Span2000:           { guide: "theory", dest: "sec:helmholtz-eos-fluids" },
  SetzmannWagner1991: { guide: "theory", dest: "sec:helmholtz-eos-fluids" },
  // -- the mill's selection functions (MillModels.cpp; DEV.md 4c C361) ------
  //    unambiguous tokens; `austin` names TWO models and is resolved by its
  //    slot in SLOT_MODEL_DEST.
  herbstFuerstenau:   { guide: "theory", dest: "sec:mill-selection-hf" },
  vogelPeukert:       { guide: "theory", dest: "sec:mill-selection-vp" },
};

// THE SAME WORD IN ANOTHER SLOT IS ANOTHER EQUATION (DEV.md 4c C165).  The
// table above is keyed by the bare token, which is right while a token names
// ONE model wherever it is written -- and wrong for `ideal`: in a package's
// activity slot it is Raoult's ideal solution (ch:ideal-mixing), but in a
// DSPM-DE law's `transportParameters.activity` it is the choice of the
// activity RATIO in the pore's partition at each face (gamma = 1 both sides),
// and a student who pressed F1 there landed on the Raoult chapter.  So a slot
// that gives its words their own meaning is resolved here FIRST, keyed
// "<op type>.<slot key>:<token>"; everything else falls through to the bare
// token.  The three DSPM-DE activity words all land on the partition
// equation, whose activity ratio is what each of them chooses.
const SLOT_MODEL_DEST: Record<string, ModelDest> = {
  "poreTransport.transportParameters.activity:ideal":              { guide: "theory", dest: "eq:dspmde-partition" },
  "poreTransport.transportParameters.activity:wallDavies":         { guide: "theory", dest: "eq:dspmde-partition" },
  "poreTransport.transportParameters.activity:bulkOverPoreDavies": { guide: "theory", dest: "eq:dspmde-partition" },
  // THE COLUMN'S SELECTABLES (DEV.md 4c C329).  A distillation column's
  // block opens ch:distillation (THEORY_DEST); each word chosen INSIDE it
  // opens the section that derives that choice.  Keyed
  // "<unit type>.<dict path>:<token>", the path as the case writes it
  // (`model` is the unit-level slot; the rest sit under `operation`).
  "distillationColumn.model:totalReflux":                          { guide: "theory", dest: "sec:total-reflux" },
  "distillationColumn.operation.efficiency.model:AIChE":           { guide: "theory", dest: "sec:eff-aiche" },
  "distillationColumn.operation.efficiency.model:ChanFair":        { guide: "theory", dest: "sec:eff-chanfair" },
  "distillationColumn.operation.efficiency.model:SyedaChuang":     { guide: "theory", dest: "sec:eff-syeda" },
  "distillationColumn.operation.hydraulics.pressureDropModel:BollesFair": { guide: "theory", dest: "sec:bolles-fair" },
  "distillationColumn.operation.hydraulics.pressureDropModel:Sinnott": { guide: "theory", dest: "ch:hydraulics" },
  "distillationColumn.operation.packing.model:RochaBravoFair":     { guide: "theory", dest: "sec:packing-rbf" },
  "distillationColumn.operation.packing.model:Delft":              { guide: "theory", dest: "sec:packing-delft" },
  "column.model:totalReflux":                                      { guide: "theory", dest: "sec:total-reflux" },
  "column.operation.efficiency.model:AIChE":                       { guide: "theory", dest: "sec:eff-aiche" },
  "column.operation.efficiency.model:ChanFair":                    { guide: "theory", dest: "sec:eff-chanfair" },
  "column.operation.efficiency.model:SyedaChuang":                 { guide: "theory", dest: "sec:eff-syeda" },
  "column.operation.hydraulics.pressureDropModel:BollesFair":      { guide: "theory", dest: "sec:bolles-fair" },
  "column.operation.hydraulics.pressureDropModel:Sinnott":         { guide: "theory", dest: "ch:hydraulics" },
  "column.operation.packing.model:RochaBravoFair":                 { guide: "theory", dest: "sec:packing-rbf" },
  "column.operation.packing.model:Delft":                          { guide: "theory", dest: "sec:packing-delft" },
  //  The mill (DEV.md 4c C361): the unit's `model` word is its SELECTION
  //  function, `operation.breakage.model` its BREAKAGE function -- and both
  //  can be `austin`, two different equations.
  "mill.model:austin":                      { guide: "theory", dest: "sec:mill-selection-austin" },
  "mill.model:herbstFuerstenau":            { guide: "theory", dest: "sec:mill-selection-hf" },
  "mill.model:vogelPeukert":                { guide: "theory", dest: "sec:mill-selection-vp" },
  "mill.operation.breakage.model:austin":   { guide: "theory", dest: "sec:mill-breakage-austin" },
  //  Classification (DEV.md 4c C361 slice 3): the unit's `model` word, and the
  //  `partition { model ...; }` curve every classifier takes -- `declared` and
  //  `tabulated` are words other places use, so they are resolved by slot.
  "screen.model:karra":                     { guide: "theory", dest: "sec:screen-karra" },
  "screen.model:declared":                  { guide: "theory", dest: "sec:screen-declared" },
  "hydrocyclone.model:declared":            { guide: "theory", dest: "sec:hydrocyclone-declared" },
  "classifier.operation.partition.model:whiten":             { guide: "theory", dest: "sec:partition-whiten" },
  "classifier.operation.partition.model:rosinRammler":       { guide: "theory", dest: "sec:partition-rr" },
  "classifier.operation.partition.model:tabulated":          { guide: "theory", dest: "sec:partition-tab" },
  "screen.operation.partition.model:whiten":                 { guide: "theory", dest: "sec:partition-whiten" },
  "screen.operation.partition.model:rosinRammler":           { guide: "theory", dest: "sec:partition-rr" },
  "screen.operation.partition.model:tabulated":              { guide: "theory", dest: "sec:partition-tab" },
  "hydrocyclone.operation.partition.model:whiten":           { guide: "theory", dest: "sec:partition-whiten" },
  "hydrocyclone.operation.partition.model:rosinRammler":     { guide: "theory", dest: "sec:partition-rr" },
  "hydrocyclone.operation.partition.model:tabulated":        { guide: "theory", dest: "sec:partition-tab" },
  //  Solid-liquid separation (DEV.md 4c C361 slice 4): the unit's `model` word
  //  and the washing law of a cake filter.
  "cakeFilter.model:rotaryDrum":            { guide: "theory", dest: "sec:cakeFilter-rotaryDrum" },
  "cakeFilter.model:batchPress":            { guide: "theory", dest: "sec:cakeFilter-batchPress" },
  "cakeFilter.operation.washing.model:displacement": { guide: "theory", dest: "sec:wash-displacement" },
  "cakeFilter.operation.washing.model:tabulated":    { guide: "theory", dest: "sec:wash-tabulated" },
  "thickener.model:talmageFitch":           { guide: "theory", dest: "sec:thickener-talmageFitch" },
  "thickener.model:coeClevenger":           { guide: "theory", dest: "sec:thickener-coeClevenger" },
  "sedimentingCentrifuge.model:tubularBowl": { guide: "theory", dest: "sec:centrifuge-tubularBowl" },
  "sedimentingCentrifuge.model:discStack":   { guide: "theory", dest: "sec:centrifuge-discStack" },
  //  The fixed bed's convection scheme (DEV.md 4c C375): `upwind` opens the
  //  derivation of its numerical dispersion v dz/2, `vanLeer` the limited
  //  slope that removes it -- both inside the section on the scheme.
  "fixedBedAdsorber.operation.convectionScheme:upwind":  { guide: "theory", dest: "eq:bed-numdisp" },
  "fixedBedAdsorber.operation.convectionScheme:vanLeer": { guide: "theory", dest: "eq:bed-vanleer" },
};

// The theory link of a word chosen INSIDE a unit block -- `model
// totalReflux`, `efficiency { model ChanFair; }`, ... -- or the unit's own
// section when the word has no section of its own.  `path` is the dotted
// dict path of the key that holds the word (e.g. "operation.efficiency.model").
// The unit's block link (theoryLink) is unchanged by this.
export function unitSlotTheoryLink(type: string, path: string, token: string): string {
  const m = SLOT_MODEL_DEST[`${type}.${path}:${token}`];
  return m ? guideUrl(m.guide === "props" ? "propsGuide" : "theoryGuide", m.dest) : theoryLink(type);
}


// A link that opens the section deriving the model a UNIT's slot names --
// ONLY when that slot is listed above (no fall-through to the bare token: a
// word in a unit means what its slot says, and an unlisted slot keeps the
// unit's own theory link).
export function unitModelTheoryLink(type: string, key: string, word: string): string | null {
  const m = SLOT_MODEL_DEST[`${type}.${key}:${word}`];
  return m ? guideUrl(m.guide === "props" ? "propsGuide" : "theoryGuide", m.dest) : null;
}

// A link that opens the theory at the section deriving a given property MODEL
// (activity / EOS / vapour-pressure / transport / reference-state token), or
// null if the model has no dedicated section yet.  `model` is the exact dict
// token (NRTL, SRK, AmbroseWalton, ...) -- the same string the C++ factory
// dispatches on.  `slot`, when the caller knows it, names WHERE the token was
// written (an op type and its model-slot key): a slot that gives the word its
// own meaning is resolved first (SLOT_MODEL_DEST).
export function propsModelTheoryLink(model: string, slot?: { opType: string; key?: string }): string | null {
  if (!model) return null;
  const s = slot?.key ? SLOT_MODEL_DEST[`${slot.opType}.${slot.key}:${model}`] : undefined;
  const m = s ?? PROPS_MODEL_DEST[model];
  if (!m) return null;
  return guideUrl(m.guide === "props" ? "propsGuide" : "theoryGuide", m.dest);
}
