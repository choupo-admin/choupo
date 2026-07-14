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
  return lines.slice(start, end).join("\n").trim();
}

// Unit-op type -> the theoryGuide.pdf named destination (\label in the .tex,
// surfaced as a PDF dest by hyperref's destlabel option).  An external link
// `docs/theoryGuide.pdf#nameddest=<dest>` opens the PDF at that exact section.
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
  dynamicCSTR: "ch:dyn-cstr",
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
  adiabaticFlash: "ch:flash",
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
    ? `${import.meta.env.BASE_URL}docs/theoryGuide.pdf#nameddest=${dest}`
    : `${import.meta.env.BASE_URL}docs/theoryGuide.pdf`;
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
  return `${import.meta.env.BASE_URL}docs/propsGuide.pdf#nameddest=${dest}`;
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
  // steamTables: no dedicated theory section yet -> guide front (honest).
};
export function propsOpHelpLink(opType: string): string {
  const m = OP_DEST[opType];
  const base = import.meta.env.BASE_URL;
  if (!m) return `${base}docs/propsGuide.pdf`;
  return `${base}docs/${m.pdf}${m.dest ? `#nameddest=${m.dest}` : ""}`;
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
  "DSPM-DE":         { guide: "theory", dest: "ch:membrane" }, // Donnan-steric pore + dielectric
  DSPMDE:            { guide: "theory", dest: "ch:membrane" },
};

// A link that opens the theory at the section deriving a given property MODEL
// (activity / EOS / vapour-pressure / transport / reference-state token), or
// null if the model has no dedicated section yet.  `model` is the exact dict
// token (NRTL, SRK, AmbroseWalton, ...) -- the same string the C++ factory
// dispatches on.
export function propsModelTheoryLink(model: string): string | null {
  if (!model) return null;
  const m = PROPS_MODEL_DEST[model];
  if (!m) return null;
  const pdf = m.guide === "props" ? "propsGuide.pdf" : "theoryGuide.pdf";
  return `${import.meta.env.BASE_URL}docs/${pdf}#nameddest=${m.dest}`;
}
