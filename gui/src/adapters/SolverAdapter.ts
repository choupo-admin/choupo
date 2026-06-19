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

export interface StreamResult {
  name: string;
  role: "feed" | "intermediate" | "product";
  /** Molar flow in canonical SI: kmol/s */
  F: number;
  /** Temperature in canonical SI: K */
  T: number;
  /** Pressure in canonical SI: Pa */
  P: number;
  /** Fluid-phase vapour fraction (0 = pure liquid, 1 = pure vapour,
   *  0..1 = two-phase).  Authoritative -- written by every flash /
   *  saturation / column unit.  Absent only for very old run logs
   *  produced before the C++ emitter started carrying it. */
  vf?: number;
  /** Specific molar enthalpy at the sensible+latent reference
   *  (per-component zero datum at 298.15 K).  J/mol.  Computed by
   *  Flowsheet::solve once the case converges.  Heat-flow rate is
   *  F * H * 1000 W (F kmol/s × 1000 mol/kmol × J/mol).  Absent for
   *  streams whose thermo blocks can't be evaluated (e.g. a
   *  nonvolatile component appearing at vf > 0). */
  H?: number;
  /** Mass flow in canonical SI: kg/s.  Optional --- only present when
   *  the solver emitted `F_mass`.  Equals F * MW_mix. */
  F_mass?: number;
  /** Utility category (populated by `utility <name>;` in a stream block).
   *  Non-empty means this stream is a plant utility -- the GUI uses it
   *  to differentiate visually (dashed grey edge, chama/floco terminal
   *  icon) and to populate the utility-consumption report. */
  category?: string;
  composition: { [component: string]: number };
  /** Total solid-phase mass flow in canonical SI: kg/s.  Particulate
   *  solids travel in s[] alongside the fluid; F / composition
   *  describe the FLUID only.  A solids-only stream has F = 0 but
   *  F_solid_mass > 0.  Per-component solid mass [kg/s] in `solids`. */
  F_solid_mass?: number;
  solids?: { [component: string]: number };
  /** Particle-size distribution of the solid phase.  Populated by
   *  units that produce a distribution (MSMPR/FVM crystalliser,
   *  spray dryer, cyclone-fed cut, bag filter cake, ...).  `diameter`
   *  bin centres in metres; `massFrac` fraction of total solid mass
   *  per bin (sums to 1).  Absent for solid-bearing streams whose
   *  producer does not compute one (e.g. equilibrium crystalliser). */
  psd?: { diameter: number[]; massFrac: number[] };
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
  /** The WHY behind the decision: model used, author rationale, source
   *  ("fitted"/"literature"/"assumed"/"undeclared"). Feeds the decision ledger. */
  provenance?: { [key: string]: string };
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
export interface PairResolution {
  model: string;
  i: string;
  j: string;
  /** "inline" | "perNode" | "caseRoot" | "standard" | "idealDefault" */
  status: string;
  source: string;
  provSource: string;
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
  /** Per-duty utility allocation from the solver: each heat duty (a unit's
   *  Q, or a column reboiler/condenser port) sized to a plant utility by
   *  temperature level, or flagged carried.  Lets the GUI show "which
   *  utility, how much, how much €" next to the duty. */
  utilityAllocation?: UtilityAllocationRow[];
  /** Solver "speak-up" advisories: a bound active at the converged solution, an
   *  equipment rating exceeded, an auto-initialised tear, a thermo model used
   *  outside its fitted range, an omitted electrolyte enthalpy channel.  The
   *  same events the log carries (`[bound]`/`[rating]`/`[init]`/`[thermo]`/
   *  `[electrolyte]`), surfaced so a student who never opens the Log still
   *  sees them ("no silent crutch"). */
  advisories?: Advisory[];
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
