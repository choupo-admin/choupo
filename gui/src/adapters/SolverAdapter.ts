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
  Abstract solver adapter.  Same interface for MockAdapter (Phase 1),
  WasmAdapter (Phase 1.5) and RemoteAdapter (Phase 4).

  RunResult carries both the streaming log (for the Log tab) and
  structured arrays / tables (for the Streams + Plots tabs).
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "../case/types.js";
import type { DynamicInstants } from "../case/dynamicInstants.js";

export interface StreamResult {
  name: string;
  role: "feed" | "intermediate" | "product";
  /** True for a feed consumed ONLY by observer units (a saturation calc
   *  declaring `outputs ( )`): a state under observation, not matter
   *  crossing the boundary.  The balance surfaces skip it -- counting it
   *  showed bubbleT01 as a 100 % mass-balance violation.  Mirrors the
   *  engine's one-home rule in src/reporting/Topology.H. */
  observed?: boolean;
  /** OVERALL molar flow in canonical SI: kmol/s -- the stream's whole
   *  material inventory, solids included, exactly what converged/<stream>
   *  stores as componentMolarFlows.  ONE STREAM, ONE SEMANTICS (ruled
   *  2026-08-08): this field used to carry the engine-internal fluid-only
   *  flow, which made the phase decomposition read as failing to close. */
  F: number;
  /** Temperature in canonical SI: K */
  T: number;
  /** Pressure in canonical SI: Pa */
  P: number;
  /** Vapour fraction OF THE FLUID PORTION (0 = pure liquid, 1 = pure
   *  vapour, 0..1 = two-phase).  It deliberately says nothing about a
   *  solid the stream also carries -- the phase decomposition owns the
   *  physical state; vf answers only the vapour question.  Authoritative
   *  -- written by every flash / saturation / column unit. */
  vf?: number;
  /** OVERALL molar enthalpy [J/mol] on the elements/formation datum:
   *  total enthalpy flow over total molar flow, so H and H_kW are one
   *  consistent pair (H_kW = F*H) rather than a fluid-only H beside an
   *  overall H_kW.  Absent for streams whose thermo blocks can't be
   *  evaluated. */
  H?: number;
  /** Total FLOW enthalpy [kW] over the OVERALL material (a solid
   *  product's crystals included).  = F*H.  The boundary energy balance
   *  reads this.  Absent => fall back to F*H. */
  H_kW?: number;
  /** OVERALL mass flow in canonical SI: kg/s (fluid + solid).  Optional
   *  --- only present when the solver emitted `F_mass`. */
  F_mass?: number;
  /** Utility category (populated by `utility <name>;` in a stream block).
   *  Non-empty means this stream is a plant utility -- the GUI uses it
   *  to differentiate visually (dashed grey edge, chama/floco terminal
   *  icon) and to populate the utility-consumption report. */
  category?: string;
  /** OVERALL mole fractions -- the whole material inventory, a
   *  precipitated crystal's share included (flash19: the stream's CaCO3
   *  is dissolved + crystal, and this says so).  Sums to 1. */
  composition: { [component: string]: number };
  /** Total solid-phase mass flow in canonical SI: kg/s -- an explicitly
   *  named PART of the overall material above, never a second inventory.
   *  Per-component solid mass [kg/s] in `solids`. */
  F_solid_mass?: number;
  solids?: { [component: string]: number };
  /** Particle-size distribution of the solid phase.  Populated by
   *  units that produce a distribution (MSMPR/FVM crystalliser,
   *  spray dryer, cyclone-fed cut, bag filter cake, ...).  `diameter`
   *  bin centres in metres; `massFrac` fraction of total solid mass
   *  per bin (sums to 1).  Absent for solid-bearing streams whose
   *  producer does not compute one (e.g. equilibrium crystalliser). */
  psd?: { diameter: number[]; massFrac: number[] };
  /** Components genuinely PRESENT in this stream that carry NO elements-datum
   *  enthalpy (no standardThermochemistry, no aqueous-ion reference).  When non-empty,
   *  H / H_kW are absent BY MISSING DATA, not by composition -- the energy
   *  balance must REFUSE and name these, never silently skip the stream.
   *  Absent for fully-curated streams (and for run logs from an older solver
   *  that did not yet emit the field). */
  H_missing?: string[];
  /** The SPECIATION the thermo package solved for this stream: the ions the
   *  apparent components resolve into, in the aqueous phase.  Report-only,
   *  exactly as on disk (converged/<stream>, nested under phases.aqueous):
   *  `composition` above stays the APPARENT material and is untouched by it.
   *  `flows` in kmol/s, the same basis as F.  Absent on a stream with no
   *  chemistry -- and on every stream of a non-reactive case. */
  speciation?: {
    network: string;
    basis: string;
    pH?: number;
    flows: { [species: string]: number };
  };
  /** The SECOND LIQUID, per component [kmol/s] -- the ORGANIC side ONLY,
   *  exactly as the engine stores it.  The aqueous side is derived by
   *  subtraction (overall F*z minus the solid's molar share minus this),
   *  so the decomposition closes by construction instead of by
   *  independently-rounded vectors agreeing: one home, no drift.
   *  Absent when the package declares no second liquid, or declares one that
   *  is not PRESENT -- the absence of a phase, never a phase of zero. */
  organicLiquid?: { [component: string]: number };
}

export interface ConvergenceCurve {
  label: string;
  residuals: number[];
}

/** One choupoProps operation's structured diagnostics (a flat key->number
 *  map straight from the engine's `operationResults` JSON).  For a
 *  `fitParameters` op this carries chi2 / reduced chi2 / RMS, the
 *  per-parameter standard error + 95% (Student-t) CI under `fit.<i>.*`, the
 *  parameter correlation matrix under `corr.<i>.<j>`, and identifiability
 *  flags (cond_JtJ, max_abs_corr, params_at_bound).  The GUI Fit view maps
 *  index <i> back to its parameter path via the propsDict it already holds. */
export interface OperationResult {
  name: string;
  type: string;
  diagnostics: { [key: string]: number };
  /** The op's OWN ranking of its answer (which diagnostic keys are the
   *  headline) -- emitted by the engine's headline(); shown first/emphasised
   *  in the Results epilogue.  Absent = show all equally. */
  headline?: string[];
  /** The WHY behind the decision: model used, author rationale, source
   *  ("fitted"/"literature"/"assumed"/"undeclared"). Feeds the decision ledger. */
  provenance?: { [key: string]: string };
  /** The CURATION axis: what MATURITY this answer claims, as words.
   *
   *  `verdict` is one of validated / notValidated / heldOutPerformed /
   *  validationRefused / notClaimed, computed by the engine from a held-out
   *  pass against a band declared BEFORE the fit, plus the band itself
   *  (`acceptanceMaxAADPct`, `acceptanceOrigin`) and the evidence partition's
   *  `partitionFingerprint`.
   *
   *  It is a DIFFERENT question from the identifiability verdict FitStatsPanel
   *  already draws, and the two must never be merged: identifiability asks
   *  whether the parameters are separately determined, this asks whether the
   *  model survived evidence it never saw.  A fit can be green on one and red
   *  on the other.
   *
   *  Absent = the op claims no maturity (not "the block did not run" -- every
   *  op that computes a verdict publishes one, `notClaimed` included). */
  curation?: { [key: string]: string };
}

/** Provenance of a raw experimental dataset (B1): where the lab data came from. */
export interface ExperimentalDataset {
  name: string;
  kind: string;
  component: string;
  source: string;
  citation: string;
  nPoints: number;
}

/** One model-vs-measured deviation, computed by the engine (the "validation
 *  weapon").  `aadAbs`/`aadRelPct` are null when not meaningful or status != ok
 *  (a wrong AAD is worse than none).  See choupoProps AadCompare. */
export interface AadRecord {
  model: string;
  property: string | null;
  kind: string | null;            // temperature | fraction | relative | null
  aadAbs: number | null;
  aadAbsUnit: string | null;
  aadRelPct: number | null;
  nMeas: number;
  nUsed: number;
  nOutOfRange: number;
  nNearZeroSkipped: number;
  nNonFinite: number;
  status: string;                 // ok | partialCoverage | abscissaMismatch | ...
}

/** A validation block: the AAD records of one experimental{} entry's models
 *  against its measured dataset.  Feeds the Comparison view's data-vs-models
 *  decision ("see, then decide" -> now with a NUMBER). */
export interface ValidationBlock {
  dataset: string;
  abscissa: string;
  aad: AadRecord[];
}

/** Provenance of one binary-interaction pair: HOW it resolved and the file it
 *  came from.  The `source` path itself reveals the owning node
 *  (".../SEPARATION/constant/..." vs ".../standards/...").  `provSource` is the
 *  file's own provenance.source ("placeholder"/"literature"/"fitted"/...).
 *  Feeds the foundation navigator + pair-coverage matrix. */
export type PairOrigin =
  | "literature" | "regressed" | "predictive" | "estimated"
  | "assumed" | "placeholder" | "unattributed";

export interface Range { min: number; max: number; }

export interface ValidityDomain {
  temperature?: Range;
  pressure?: Range;
  composition?: Record<string, Range>;
  note?: string;
}

/** The auditable record of a human promoting past a diagnostic (E2):
 *  reason and authorship travel to every consumer, never reduced to a flag. */
export interface PromotionOverride {
  identifiable: number;
  reason: string;
  by: string;
  date: string;
}

export interface PairResolution {
  model: string;
  i: string;
  j: string;
  /** "inline" | "perNode" | "caseRoot" | "standard" | "idealDefault" */
  status: string;
  source: string;
  provSource: string;
  /** The TYPED provenance class (forum #77/#79): ranking/badge policy uses
   *  THIS.  provSource stays the raw source label / legacy detail.  All audit
   *  fields are optional: absent on results emitted before they existed. */
  origin?: PairOrigin;
  method?: string;
  methodVersion?: string;
  validity?: ValidityDomain;
  promotedDespite?: PromotionOverride;
}

/** Per-component thermo coverage: which capabilities the loaded data provides,
 *  so the GUI can show whether a component is flowsheet-ready or a gap. */
export interface ComponentCoverage {
  name: string;
  criticals: boolean;   // Tc, Pc
  psat: boolean;        // Antoine / vapour pressure -> VLE
  vliq: boolean;        // liquid molar volume -> pump / density
  cpIdealGas: boolean;  // ideal-gas Cp -> energy balances
  gibbs: boolean;       // formation data -> Gibbs reactor
  nonvolatile: boolean; // solute with no Psat by design
}

export interface TxyData {
  P: number;
  components: [string, string];
  /** liquid mole fractions of component[0] on the bubble curve */
  xBubble: number[];
  /** bubble-point temperature (K) for each xBubble */
  Tbubble: number[];
  /** vapour mole fractions of component[0] on the dew curve */
  yDew: number[];
  /** dew-point temperature (K) for each yDew */
  Tdew: number[];
}

/**
 * 1-D internal profile of a unit op (PFR axial sweep, distillation
 * stage table,...).  `xAxis` names the independent column; every
 * other column is plotted against it.  `markers` are vertical
 * annotations the unit wants drawn (e.g. the column's feed stage).
 */
export interface ProfileMarker {
  x: number;
  label: string;
}

export interface UnitProfile {
  unit: string;
  xAxis: string;
  columns: { [name: string]: number[] };
  markers?: ProfileMarker[];
}

/** One fired event of a batch campaign (the sequence/Gantt feed). */
export interface TimelineEvent {
  t: number;
  kind: "recipe" | "status";
  action: string;      // transfer | setParameter | <status name>
  detail: string;      // pre-formatted human line
  trigger: string;     // "time" | "when: <unit.q op v>" | "" (status)
  from: string;        // acting unit (transfer source / setParameter unit / status unit)
  to: string;          // transfer destination; "" otherwise
  /** > t: a CONTINUOUS action's interval end (dischargeTo / externalOutlet);
   *  absent for instantaneous events.  The Gantt draws these as bars. */
  tEnd?: number;
}

/**
 * Time-series trajectory emitted by the dynamic binaries
 * (choupoBatch, choupoCtrl).  `t` is the time vector (s).  `vars`
 * maps the CSV column name (e.g. "reactor.T", "TC1.MV") to its
 * sampled values, one per t[i].
 */
export interface TrajectoryData {
  t: number[];
  vars: { [name: string]: number[] };
}

export interface RunResult {
  status: "done" | "error";
  log: string;
  streams: StreamResult[];
  convergence: ConvergenceCurve[];
  /** Per-unit KPIs from the structured JSON (yield, c_sat, supersaturation,
   *  Q_removed,...).  Keyed by unit name as written in flowsheetDict.
   *  Empty / absent on cases that don't have a flowsheet (props runs). */
  kpis?: { [unitName: string]: { [key: string]: number } };
  /** Post-processing computed expressions from the case's variables{} block
   *  (`compute "..."` entries -- W_net, eta_thermal, ...), evaluated by the
   *  solver after the run.  Keyed by variable name.  Feeds the Variables
   *  workspace's "solved value" column. */
  computed?: { [name: string]: number };
  profiles?: UnitProfile[];
  txy?: TxyData;
  trajectory?: TrajectoryData;
  /** OpenFOAM-style real-time INSTANTS harvested from MEMFS after a dynamic run
   *  (choupoBatch / choupoCtrl with `solutionControl { write true; }`): the
   *  per-time holdup state (mole inventory, T, V, conversion) + outlet faces.
   *  Feeds the TIME SCRUBBER -- scrub a time, see the reactor's actual state at
   *  that instant.  Absent for steady runs / solutionControl-off cases. */
  instants?: DynamicInstants;
  /** Per-component molar mass (kg/kmol) emitted by the solver since
   *.  Lets the GUI derive mass fractions w_i locally
   *  (w_i = z_i * MW_i / Sigma_j z_j * MW_j). */
  componentMolarMass?: { [component: string]: number };
  /** Generic bag of CSV files the run wrote into the case directory.
   *  Keys are paths relative to the case root (e.g. "psat.csv",
   *  "scan/Z_co2.csv", "fit_history.csv").  Populated by choupoProps
   *  scans + fits; also redundantly carries trajectory.csv
   *  for the dynamic binaries. */
  csvFiles?: { [relPath: string]: string };
  /** The SOLVED stream-state files the run wrote under converged/ (one per
   *  stream, exactly what a native run leaves on disk beside 0/).  Keys are
   *  case-root-relative ("converged/liquid").  The Case tab shows them
   *  read-only so a browser run's answer is inspectable file-by-file, the
   *  glass-box way -- without this the WASM run wrote the solution into
   *  MEMFS and discarded it with the worker. */
  convergedFiles?: { [relPath: string]: string };
  /** Per-duty utility allocation from the solver: each heat duty (a unit's
   *  Q, or a column reboiler/condenser port) sized to a plant utility by
   *  temperature level, or flagged carried.  Lets the GUI show "which
   *  utility, how much, how much €" next to the duty. */
  utilityAllocation?: UtilityAllocationRow[];
  /** Batch campaign timeline: every recipe action that FIRED (with the
   *  trigger that fired it -- the scheduled time or the tripped `when`
   *  condition, verbatim) plus unit status events (a rectifier hitting
   *  refluxMax).  `from` is the acting unit (the Gantt lane); `to` the
   *  transfer destination.  Absent unless the run fired events. */
  timeline?: TimelineEvent[];
  /** Solver "speak-up" advisories: a bound active at the converged solution, an
   *  equipment rating exceeded, an auto-initialised tear, a thermo model used
   *  outside its fitted range, an omitted electrolyte enthalpy channel.  The
   *  same events the log carries (`[bound]`/`[rating]`/`[init]`/`[thermo]`/
   *  `[electrolyte]`), surfaced so a student who never opens the Log still
   *  sees them ("no silent crutch"). */
  advisories?: Advisory[];
  /** Problem divergences -- see the Divergence interface.  Kept apart from
   *  `advisories` deliberately; merging them buries the one entry that changes
   *  what the numbers mean among the ones that only qualify them. */
  divergences?: Divergence[];
  /** Model-boundary audit: internal streams where adjacent units use different
   *  thermo models -- the enthalpy the two models disagree about (or a refusal
   *  across a speciation change).  H is conserved, T is the model-dependent
   *  readout; surfaced so the student SEES the inconsistency, never a silent
   *  T-nudge. */
  modelBoundaries?: ModelBoundary[];
  /** Per-operation diagnostics from a choupoProps run (fit stats, scan
   *  counts).  Empty/absent for choupoSolve runs.  The Fit view reads the
   *  `fitParameters` entries. */
  operationResults?: OperationResult[];
  /** Binary-pair resolution provenance (which pairs resolved, from where).
   *  Emitted by both choupoSolve and choupoProps when an activity model
   *  (NRTL) is in play.  Feeds the foundation navigator + pair-coverage map. */
  thermoResolution?: PairResolution[];
  /** Per-component thermo coverage (criticals / Psat / Vliq / Cp / Gibbs) so
   *  the thermo view shows which components are flowsheet-ready vs a gap. */
  componentCoverage?: ComponentCoverage[];
  /** Raw experimental datasets a choupoProps run declared (with provenance).
   *  Feeds the decision ledger. */
  experimentalDatasets?: ExperimentalDataset[];
  /** Engine-computed model-vs-measured AAD per experimental{} entry (the
   *  validation weapon).  Feeds the Comparison view. */
  validation?: ValidationBlock[];
  /** Component proposal .dat files written by an `estimateComponent` op with
   *  `output { proposal auto; }` -- harvested from the run dir (keyed by path
   *  relative to the case root, e.g. "constant/components/acetone.estimate-
   *  2026-06-02.dat").  The GUI previews them read-only and offers a download
   *  of the DATED file; promotion to the bare <name>.dat stays an off-GUI act. */
  proposals?: { [relPath: string]: string };
  /** Discounted-cash-flow appraisal (Perry / Turton Ch.10) from an economics
   *  postDict: the headline scalars (FCI / TCI / COM_d / revenue / NPV / IRR /
   *  payback + AACE accuracy band) AND the year-by-year DCF table.  Absent for
   *  cases without an economics report.  Feeds the Reports "Economic appraisal"
   *  section. */
  economics?: Economics;
}

/** One row of the year-by-year discounted-cash-flow table (the income / cash-
 *  flow statement).  Year 0 is construction (the investment outflow); years
 *  1..N are operating years.  Monetary fields in the report currency. */
export interface CashFlowRow {
  year: number;
  investment: number;     // FCI + WC outflow (year 0), <0
  revenue: number;
  opex: number;           // COM_d (no depreciation)
  depreciation: number;
  taxableIncome: number;
  tax: number;
  afterTaxProfit: number;
  cashFlow: number;
  discountFactor: number;
  discountedCF: number;
  cumulativeDCF: number;  // running sum of discountedCF
}

/** Headline economic appraisal + the full DCF table.  Mirrors the C++
 *  EconomicsSummary (reports/economics/cashFlow.csv).  IRR is null when no real
 *  internal rate exists (no sign change); payback is null when never recovered. */
export interface Economics {
  currency: string;
  FCI: number;
  WC: number;
  TCI: number;
  COM_d: number;
  revenue: number;
  depreciation: number;
  NPV: number;
  IRR: number | null;          // fraction; null when none
  irrAmbiguous: boolean;
  discountedPayback: number | null;  // years; null when never
  simplePayback: number | null;
  discountRate: number;        // fraction
  taxRate: number;             // fraction
  projectLife: number;
  estimateClass: number;       // AACE class
  accLo: number;               // accuracy band low  (%)
  accHi: number;               // accuracy band high (%)
  cashFlow: CashFlowRow[];
}

/** A PROBLEM DIVERGENCE: the run solved something other than what the case
 *  describes on its face (engine contract, 2026-08-11 --
 *  docs/design/problem-divergence-contract.md).  A DIFFERENT thing from an
 *  Advisory: an advisory qualifies the answer, a divergence says the answer is
 *  to a different question, which is why the two never share a surface here
 *  any more than they do in the engine's own output.
 *
 *  `kind` is "substitution" (the engine delivered other than what was
 *  requested -- authorised, or it would have refused) or
 *  "declaredApproximation" (what the case asked for, recorded because a stream
 *  table cannot show it).  The GUI RENDERS this verdict; it never infers one. */
export interface Divergence {
  kind: string;
  locus: string;
  requested: string;
  solved: string;
  reason: string;
}

export interface Advisory {
  category: string;   // "bound" | "rating" | "init" | "thermo" | "electrolyte"
  severity: string;   // "info" | "warning"
  locus: string;      // "tear 'recycle'" | "membrane 'SW30HR'" | "vessel 'reactor'"
  message: string;
}

/** Model-boundary audit finding: an internal stream whose producer and consumer
 *  use different thermo models.  H is the conserved truth, T the model-dependent
 *  readout; dH is the enthalpy the two models disagree about at the stream's
 *  (T,P,z).  `refused` = a speciation change (electrolyte<->molecular) where a
 *  single dH would lie, so no number is computed (only `reason`). */
export interface ModelBoundary {
  stream: string;
  producer: string;
  consumer: string;
  refused: boolean;
  reason?: string;          // present when refused
  dH_kJ_per_mol?: number;   // present when not refused
  dH_kW?: number;
  implied_dT_K?: number;
}

export interface UtilityAllocationRow {
  unit: string;
  port: string;        // "reboiler" / "condenser" / "" (generic)
  tier: string;        // "heating" / "cooling"
  utility: string;     // catalogue name, or "(carried: ...)" / "(none adequate)"
  duty_kW: number;
  T: number;
  kg_s: number;
  MW: number;
  eur_h: number;
  allocated: boolean;
}

export interface SolverAdapter {
  run(caseFiles: CaseFiles,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    /** Force a specific binary regardless of controlDict.application.  The
     *  Props view passes "choupoProps" so a flowsheet case (application
     *  choupoSolve) can run its property comparisons -- one case, two run
     *  paths chosen by the view you are in. */
    binaryOverride?: string,
  ): Promise<RunResult>;
}
