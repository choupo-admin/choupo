/*---------------------------------------------------------------------------*\
  Property Explorer — transient propsDict synthesizer.

  Pure: a spec (the components / models / axis / properties the student picks
  interactively) -> a `CaseFiles` the choupoProps WASM adapter runs, IDENTICAL
  in shape to a hand-authored `propertyScan1D` case.

  This is the ONLY explorer-specific "compute" code, and it computes NOTHING
  physical -- it builds a dict.  Every number the explorer plots comes from the
  engine running this case (the same `propertyScan1D` + `evaluateProperty` an
  authored case uses), rendered by the shared `gui/src/ui/plotting/` kit.  The
  reuse contract: reimplement zero physics in TS; the explorer drives the engine.
  See docs/property-architecture.md and docs/ai/gui-credo.md §3.

  Values are CANONICAL SI (raw scalars) -- the engine reads a raw scalar as SI
  (Pa, K, kmol/s, mole-fraction).  The student-facing UI converts for display;
  the synthesized dict stays SI, which sidesteps unit-suffix representation.
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "./types.js";
import type { JsonDict } from "../dict/index.js";

/** The swept axis: a single engine state variable over a range.
 *  `variable` is an engine keyword: "T", "P", or "x[<componentName>]". */
export interface ExploreAxis {
  variable: string;
  from: number; // canonical SI: K for T, Pa for P, mole-fraction for x[...]
  to: number;
  n: number; // number of grid points
}

export interface ExploreSpec {
  /** Component names (standard catalogue or case-local). */
  components: string[];
  /** Property keywords to plot (e.g. "Psat_ethanol", "gamma_water"). */
  properties: string[];
  /** The swept variable + range. */
  axis: ExploreAxis;
  /** Fixed state: axes NOT varying + the composition (SI / mole-fraction). */
  state: { P?: number; T?: number; composition: { [comp: string]: number } };
  /** Liquid activity model (default ideal). */
  activityModel?: JsonDict;
  /** Equation of state (default idealGas). */
  equationOfState?: JsonDict;
  /** Transport-property model selection → thermoPackage `transport {}` block.
   *  Each present field emits its sub-block; the engine reads it to pick the
   *  correlation (Andrade vs Vogel, …).  A SIBLING of the EOS — transport NEVER
   *  depends on the equation of state (PropertyEvaluator only Z/v/H_R/S_R call
   *  eos(); viscosity/conductivity/diffusivity take just (T,x)). */
  transport?: {
    model?: string;               // gas viscosity (Chung)
    liquidViscosity?: string;     // Andrade | Vogel
    liquidConductivity?: string;  // SatoRiedel | Latini
    thermalConductivity?: string; // gas thermal conductivity (Eucken)
    diffusivity?: string;         // gas diffusivity (Fuller)
  };
  /** Estimate a NEW component by group contribution — the in-Explorer create
   *  flow.  MUTUALLY EXCLUSIVE with the plot specs: synthesizes a one-op
   *  estimateComponent case that writes a reviewable .estimate-DATE.dat the
   *  student DOWNLOADS (guard-rail 6).  `reference` (optional) is SI: Tb,Tc in K,
   *  Pc in Pa, omega dimensionless. */
  estimate?: {
    component: string;
    groups: { group: string; count: number }[];
    estimator?: string;                      // default "Joback"
    reference?: { [key: string]: number };
  };
  /** Raw .dat bodies for NON-standard components, keyed by relative path
   *  (e.g. "constant/components/myComp.dat") -> verbatim into MEMFS. */
  componentFiles?: { [relPath: string]: string };
  /** Scan semantics, for self-documentation of the synthesized case:
   *  "pure"    = per-component intrinsic curves (composition has NO effect),
   *  "mixture" = a true mixture scalar at the given composition (equimolar by
   *              default).  Undefined for VLE sweeps (composition is the axis). */
  mode?: "pure" | "mixture";
  /** Ternary diagram (overrides the 1D scan when set).  `bubbleT` = boiling-
   *  temperature surface (VLE, works with ideal binaries); `lle` = phase-region
   *  map + tie-lines (needs a VLLE-capable package).  `n` = grid intervals. */
  ternary?: { mode: "bubbleT" | "lle"; n: number; tieStride?: number;
    /** parallel work shard (round-robin over outer grid rows): node i runs iff
     *  i % shard.n === shard.k.  Omitted → the whole grid (one run). */
    shard?: { k: number; n: number } };
  /** Binary LLE: g_mix(x) + common-tangent binodal via a liquid-liquid flash
   *  (needs the same 2-liquid-phase package as the ternary LLE).  `n` = g_mix
   *  composition samples. */
  binaryLle?: { n: number };
  /** A binary VLE (T-x-y) that also runs the per-x liquid-liquid stability probe
   *  (the `liquid_stable` property): forces the 2-liquid-phase package so the LL
   *  flash can fire, and the diagram marks the immiscibility gap instead of
   *  drawing a phantom homogeneous curve through it. */
  vleTwoLiquid?: boolean;
  /** Pure-compound P-T phase diagram (single component).  `solid` adds the
   *  sublimation + fusion lines (triple point, ΔHfus/ΔHsub/ΔVfus); omitted →
   *  liquid-vapour + critical only. */
  phaseDiagram?: {
    grid: number;
    solid?: { tripleT: number; tripleP: number; Hfus: number; Hsub: number; deltaVfus: number };
  };
  /** Psychrometric chart (carrier gas + condensable vapour) via the
   *  psychrometricChart engine op.  Saturation + relative-humidity + adiabatic-
   *  saturation (wet-bulb) curves, for ANY pair at ANY P / T range. */
  psychrometry?: {
    carrier: string; condensable: string;
    P: number; TminC: number; TmaxC: number; gridN: number;
    rh: number[]; wetBulb: number[];
  };
  /** Membrane-scaling audit via the scalingScan engine op: speciate a water
   *  analysis at a series of RO/NF recoveries -> SI = log10(IAP/K) per mineral
   *  vs recovery.  `totals` are TOTAL master molalities [mol/kg water].
   *  `pH` is either a NUMBER (given, held across the scan) or the word
   *  "solve" (H+ joins the Newton unknowns; electroneutrality closes the
   *  system and the engine announces the feed charge imbalance) -> emits
   *  `pH <v>;` / `pH solve;`.  `pCO2atm` (optional) opens the system to the
   *  atmosphere -> `atmosphere { pCO2 <v> atm; }` (DIC set by Henry).  `T`
   *  (optional, K) -> `temperature <K>;` (engine default 298.15 K).  The
   *  speciation/mineral/ion catalogue resolves from data/standards/
   *  electrolyte/, which reaches the WASM worker EMBEDDED in the .wasm image
   *  (make/wasm.mk --embed-file) -- the identical mechanism the component
   *  catalogue uses; nothing is bundled here. */
  scaling?: {
    totals: { [ion: string]: number };
    pH: number | "solve";
    pCO2atm?: number;
    T?: number;
    /** Ionic-activity model the scalingScan op uses -> `activityModel <v>;`.
     *  "davies" (extended Debye-Hückel, quantitative to I ≈ 0.5 mol/kg) is the
     *  engine default, so it is OMITTED (undefined -> default path); "pitzer"
     *  (Pitzer-HMW, valid to I ≈ 6 mol/kg in brines) is emitted explicitly.
     *  The SI curves track at low I and FORK past I ≈ 1 — the flagship
     *  differentiator (the engineering recovery decision flips on the model). */
    activityModel?: "davies" | "pitzer";
    from: number; to: number; n: number;
    /** Equilibrium precipitation: when set, the named minerals are driven to
     *  SI = 0 (let supersaturation precipitate) -> `equilibrate { minerals
     *  ( <m> ); }`.  The engine then ADDS SIeq_<m> (clamped at 0), n_<m>
     *  (mol/kg concentrate water) and scale_<m> (mol/kg feed) columns and
     *  prints the non-suppressible EQUILIBRIUM-CEILING banner.  Omitted /
     *  undefined keeps the SI-only propensity path byte-identical. */
    equilibrate?: string[];
    /** Volumetric feed flow [m3/h] -> `feedFlow <v> m3/h;`, which enables the
     *  kgday_<m> scale-rate column.  Only meaningful with `equilibrate`
     *  (the engine REFUSES a bare feedFlow without it); optional even then —
     *  without it the engine still gives mol/kg, kg/day simply absent. */
    feedFlowM3h?: number;
  };
  /** Steam tables via the steamTables engine op (IAPWS-IF97, R7-97(2012)) —
   *  water ONLY (IF97 is the water formulation).  `saturation` scans the
   *  region-4 line (from/to in K, regions 1/2 evaluated ON the line);
   *  `isobar` scans h,s,v,cp vs T at fixed P (Pa) — the engine announces the
   *  Tsat crossing.  All values canonical SI, like every synthesized scalar. */
  steam?: { mode: "saturation" | "isobar"; from: number; to: number; n: number; P?: number };
  /** UNIFAC group decompositions per component — used by the LLE ternary path to
   *  synthesize a predictive VLLE package (no fitted pairs).  A component absent
   *  here is omitted from the groups block → UNIFAC treats it as ideal (γ=1). */
  unifacGroups?: Record<string, { group: string; count: number }[]>;
}

export const EXPLORE_OUTPUT = "explore.csv";

/** Build the transient choupoProps case for one exploration. Never written to
 *  disk -- the explorer is a scratchpad; persisting is an authoring act. */
export function synthesizeExploreCase(spec: ExploreSpec): CaseFiles {
  // Estimate-a-new-component: a self-contained one-op case, mutually exclusive
  // with the plot specs.  estimateComponent reads its groups from the propsDict,
  // so the thermoPackage just needs a placeholder component to load.
  if (spec.estimate) {
    const e = spec.estimate;
    const propsDict: JsonDict = {
      operations: [
        {
          name: "estimate",
          type: "estimateComponent",
          component: e.component,
          model: e.estimator ?? "Joback",
          groups: e.groups.map((g) => ({ group: g.group, count: g.count })),
          ...(e.reference && Object.keys(e.reference).length > 0 ? { reference: { ...e.reference } } : {}),
          output: { proposal: "auto" },
        },
      ],
    };
    const thermoPackage: JsonDict = {
      components: ["water"], // placeholder; the estimate reads its groups from the op
      activityModel: { model: "ideal" },
      equationOfState: { model: "idealGas" },
    };
    const controlDict: JsonDict = {
      application: "choupoProps",
      description: "Property Explorer -- estimate a new component (ephemeral)",
      verbosity: 2,
    };
    return { propsDict, thermoPackage, controlDict };
  }

  const state: JsonDict = { composition: { ...spec.state.composition } };
  if (spec.state.P !== undefined) state.P = spec.state.P;
  if (spec.state.T !== undefined) state.T = spec.state.T;

  // Ternary: the grid IS the composition, so state carries only T/P.
  const ternaryState: JsonDict = {};
  if (spec.state.P !== undefined) ternaryState.P = spec.state.P;
  if (spec.state.T !== undefined) ternaryState.T = spec.state.T;

  const ternaryOp: JsonDict | null = spec.ternary
    ? {
        name: "explore",
        type: "propertyScanTernary",
        mode: spec.ternary.mode,            // bubbleT | lle
        state: ternaryState,
        grid: { n: spec.ternary.n },
        ...(spec.ternary.tieStride !== undefined ? { tieStride: spec.ternary.tieStride } : {}),
        ...(spec.ternary.shard ? { shard: { k: spec.ternary.shard.k, n: spec.ternary.shard.n } } : {}),
        output: { file: EXPLORE_OUTPUT },
      }
    : null;

  const binaryOp: JsonDict | null = spec.binaryLle
    ? {
        name: "explore",
        type: "propertyScanBinary",
        state: ternaryState,                 // T, P only (composition IS the sweep)
        grid: { n: spec.binaryLle.n },
        output: { file: EXPLORE_OUTPUT },
      }
    : null;

  const phaseOp: JsonDict | null = spec.phaseDiagram
    ? {
        name: "explore",
        type: "purePhaseDiagram",
        grid: { n: spec.phaseDiagram.grid },
        ...(spec.phaseDiagram.solid ? { solid: { ...spec.phaseDiagram.solid } } : {}),
        output: { file: EXPLORE_OUTPUT },
      }
    : null;

  const psychroOp: JsonDict | null = spec.psychrometry
    ? {
        name: "explore",
        type: "psychrometricChart",
        carrier: spec.psychrometry.carrier,
        condensable: spec.psychrometry.condensable,
        P: spec.psychrometry.P,
        TminC: spec.psychrometry.TminC,
        TmaxC: spec.psychrometry.TmaxC,
        grid: { n: spec.psychrometry.gridN },
        relativeHumidity: [...spec.psychrometry.rh],
        wetBulb: [...spec.psychrometry.wetBulb],
        output: { file: EXPLORE_OUTPUT },
      }
    : null;

  // Same dict grammar as tutorials/props/electrolyte/scaling_ro_brackish.
  const scalingOp: JsonDict | null = spec.scaling
    ? {
        name: "explore",
        type: "scalingScan",
        // ionic-activity model: emit only `pitzer` (the brine-grade fork);
        // `davies` is the engine default, so omitting keeps the default path.
        ...(spec.scaling.activityModel === "pitzer" ? { activityModel: "pitzer" } : {}),
        // mol/kg suffix: `totals` entries MUST declare their basis (engine units law)
        totals: Object.fromEntries(Object.entries(spec.scaling.totals).map(([ion, m]) => [ion, `${m} mol/kg`])),
        // `pH solve;` (word -> electroneutrality closure) or `pH <v>;` (given)
        pH: spec.scaling.pH,
        // open system: the atm suffix is MANDATORY engine-side (a partial
        // pressure must declare its basis) -> `atmosphere { pCO2 <v> atm; }`
        ...(spec.scaling.pCO2atm !== undefined
          ? { atmosphere: { pCO2: `${spec.scaling.pCO2atm} atm` } } : {}),
        // raw scalar = canonical SI (K), like every other synthesized value
        ...(spec.scaling.T !== undefined ? { temperature: spec.scaling.T } : {}),
        // equilibrium precipitation: name the allowed minerals -> each is driven
        // to SI = 0; omitted entirely keeps the SI-only path byte-identical.
        // Same grammar as tutorials/props/electrolyte/precipitation_ro_brackish.
        ...(spec.scaling.equilibrate && spec.scaling.equilibrate.length > 0
          ? { equilibrate: { minerals: [...spec.scaling.equilibrate] } } : {}),
        // feedFlow enables the kg/day scale-rate column (only legal WITH
        // equilibrate, which the engine enforces); the m3/h basis is mandatory.
        ...(spec.scaling.equilibrate && spec.scaling.equilibrate.length > 0
            && spec.scaling.feedFlowM3h !== undefined
          ? { feedFlow: `${spec.scaling.feedFlowM3h} m3/h` } : {}),
        recovery: { from: spec.scaling.from, to: spec.scaling.to, n: spec.scaling.n },
        output: { file: EXPLORE_OUTPUT },
      }
    : null;

  // Same dict grammar as tutorials/props/steam/steam01_if97_verification:
  // exactly ONE mode block (saturation { from to n } | isobar { P from to n }).
  const steamOp: JsonDict | null = spec.steam
    ? {
        name: "explore",
        type: "steamTables",
        ...(spec.steam.mode === "saturation"
          ? { saturation: { from: spec.steam.from, to: spec.steam.to, n: spec.steam.n } }
          : { isobar: { P: spec.steam.P ?? 1.0e5,
                        from: spec.steam.from, to: spec.steam.to, n: spec.steam.n } }),
        output: { file: EXPLORE_OUTPUT },
      }
    : null;

  const propsDict: JsonDict = {
    operations: [
      phaseOp ?? psychroOp ?? ternaryOp ?? binaryOp ?? scalingOp ?? steamOp ?? {
        name: "explore",
        type: "propertyScan1D",
        vary: {
          variable: spec.axis.variable,
          from: spec.axis.from,
          to: spec.axis.to,
          n: spec.axis.n,
        },
        state,
        properties: [...spec.properties],
        output: { file: EXPLORE_OUTPUT },
      },
    ],
  };

  // A two-liquid package's liquid phases share one activity model.  LLE views are
  // PREDICTIVE (UNIFAC, γ from molecular groups, no fitted pairs).  A VLE
  // two-liquid PROBE (the T-x-y stability check) uses the student's CHOSEN model
  // (so its split verdict matches the curve they see); UNIFAC carries its groups.
  const liquidActivity = (): JsonDict => {
    const lleView = spec.binaryLle !== undefined || spec.ternary?.mode === "lle";
    if (lleView || spec.activityModel?.["model"] === "UNIFAC")
      return { model: "UNIFAC", groups: JSON.parse(JSON.stringify(spec.unifacGroups ?? {})) as JsonDict };
    return spec.activityModel ?? { model: "ideal" };
  };
  // Transport model selection (a sibling of the EOS) — only emitted when a
  // transport property is being scanned, so an EOS-only scan stays EOS-only.
  const transportBlock = ((): JsonDict | null => {
    const t = spec.transport;
    if (!t) return null;
    const b: JsonDict = {};
    if (t.model) b.model = t.model;
    if (t.liquidViscosity) b.liquidViscosity = { model: t.liquidViscosity };
    if (t.liquidConductivity) b.liquidConductivity = { model: t.liquidConductivity };
    if (t.thermalConductivity) b.thermalConductivity = { model: t.thermalConductivity };
    if (t.diffusivity) b.diffusivity = { model: t.diffusivity };
    return Object.keys(b).length ? b : null;
  })();

  const thermoPackage: JsonDict = (spec.ternary?.mode === "lle" || spec.binaryLle || spec.vleTwoLiquid)
    ? {
        components: [...spec.components],
        phases: [
          { name: "vapor", type: "vapor", eos: { model: "idealGas" } },
          { name: "liquid1", type: "liquid", activity: liquidActivity() },
          { name: "liquid2", type: "liquid", activity: liquidActivity() },
        ],
      }
    : {
        components: [...spec.components],
        // UNIFAC is predictive: it needs the per-component group decomposition
        // attached to the activityModel (same shape as the LLE phases above).
        activityModel: spec.activityModel?.["model"] === "UNIFAC"
          ? { model: "UNIFAC", groups: JSON.parse(JSON.stringify(spec.unifacGroups ?? {})) as JsonDict }
          : (spec.activityModel ?? { model: "ideal" }),
        equationOfState: spec.equationOfState ?? { model: "idealGas" },
        ...(transportBlock ? { transport: transportBlock } : {}),
      };

  const modeNote =
    spec.mode === "pure" ? " -- pure-component curves (composition has no effect)"
      : spec.mode === "mixture" ? " -- mixture property at the stated composition"
        : "";
  const controlDict: JsonDict = {
    application: "choupoProps",
    description: `Property Explorer (interactive; ephemeral -- never written to disk)${modeNote}`,
    verbosity: 2,
  };

  const files: CaseFiles = { propsDict, thermoPackage, controlDict };
  if (spec.componentFiles && Object.keys(spec.componentFiles).length > 0)
    files.extraFiles = { ...spec.componentFiles };
  return files;
}
