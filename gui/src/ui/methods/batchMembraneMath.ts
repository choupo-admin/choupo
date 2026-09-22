/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  batchMembraneMath -- the CLASSICAL hand results of batch ultrafiltration and
  nanofiltration, as arithmetic, plus the readers that feed them from a run.

  THIS IS METHOD GEOMETRY, AND IT IS LABELLED AS SUCH (EduTools Guide, "Why
  the picture can be trusted", rule 2).  The standing rule of the EduTools
  plane is zero physics in TypeScript; the one exception is the METHOD BEING
  TAUGHT.  Here the method is the set of closed forms a student integrates by
  hand before ever meeting a simulator, each of which holds only while the
  observed rejection R is CONSTANT:

      constant volume     n/n_0 = exp(-(1 - R) N)
      concentration       n/n_0 = VCF^-(1 - R)   and   c/c_0 = VCF^R
      both in sequence    loss  = 1 - exp((R - 1)(ln VCF + N))
      wash time           t_DF  = N V / (A J_w)

  Nothing else is computed here.  The fluxes, the rejections, the osmotic
  pressures, the polarisation and the fouling are the ENGINE's, and this
  module never re-derives one.

  THE ENGINE IS THE JUDGE, NOT THE SOURCE.  `batchDiafilter` publishes its own
  `washoutActual_<s>` and `washoutIdeal_<s>` in constant-volume mode
  (src/unitOperations/batch/BatchDiafilter.cpp:604-607), and the idealisation
  is built from THIS RUN's own initial rejection R_initial_<s>
  (BatchDiafilter.cpp:283, 593) -- so the gap between them cannot have been
  arranged by a case.  `washoutIdeal` below must REPRODUCE that KPI from the
  engine's own R and N; where it does not, the finding is about this module,
  and where the engine's ideal parts from its actual, the finding is about the
  constant-R assumption.

  IN CONCENTRATION MODE THE ENGINE PUBLISHES NO IDEAL AT ALL, deliberately
  (BatchDiafilter.cpp:597-603: quoting the washout comparison there would be a
  category error).  So `retainedIdeal` is the ONLY idealisation on that branch
  and the tool says so rather than letting a reader think the engine drew it.

  NOTHING IS INVENTED.  Every vessel parameter is read from a surface the case
  or the run publishes, and a parameter on none of them is reported MISSING
  with the surface it would come from (`VesselDeclaration.missing`).  There is
  no default area, TMP, k_film, rho or rejection anywhere in this file -- and
  in particular `rho` is reported ABSENT rather than filled in with the 1000
  kg/m3 the engine announces when a case declares none
  (BatchDiafilter.cpp:140-158).
\*---------------------------------------------------------------------------*/

import type { RunResult, TrajectoryData } from "../../adapters/SolverAdapter.js";
import type { CaseFiles } from "../../case/types.js";
import type { JsonValue } from "../../dict/index.js";
import { scalarToSI } from "../../dict/scalarSI.js";

/** The run's KPI block, DERIVED from the adapter's own result type rather
 *  than restated -- a second home for a shape is a second home. */
export type KpiMap = NonNullable<RunResult["kpis"]>;
export type UnitKpis = KpiMap[string];

/** m/s -> L/(m2.h).  The engine's own conversion, at
 *  BatchDiafilter.cpp:553 and 586; kept here so the tool and the engine
 *  cannot disagree about what "LMH" means. */
export const LMH_PER_MS = 3.6e6;

// ---- Which unit in a run is a batch membrane vessel -------------------------

export interface DiafilterActivation {
  active: boolean;
  /** The KPI block's unit name (possibly a flattened `SECTOR.unit`). */
  unit: string | null;
  /** The solutes the unit tracked, read from its own `R_initial_<s>` keys. */
  solutes: string[];
  /** true when the run held the volume (the engine counts diavolumes only
   *  in constant-volume mode -- BatchDiafilter.H:262-263). */
  constantVolume: boolean;
}

const INACTIVE: DiafilterActivation =
  { active: false, unit: null, solutes: [], constantVolume: false };

/** The solute names a `batchDiafilter` KPI block carries, from the keys it
 *  publishes per solute (BatchDiafilter.cpp:593).  Derived from the run, never
 *  a list this file keeps. */
export function solutesFromKpis(unitKpis: UnitKpis | undefined): string[] {
  if (!unitKpis) return [];
  const out: string[] = [];
  for (const key of Object.keys(unitKpis)) {
    const m = /^R_initial_(.+)$/.exec(key);
    if (m?.[1] !== undefined) out.push(m[1]);
  }
  return out.sort();
}

/**
 * Find the batch membrane vessel in a run.
 *
 * THE SIGNATURE IS `V_permeated_m3` (BatchDiafilter.cpp:582), which no other
 * unit in the tree publishes.  `concentrationFactor` alone would NOT do:
 * `batchElectrodialysis` publishes a key of that name for a different
 * quantity (BatchElectrodialysis.cpp:882), and a detector that matched it
 * would open this page on an electrodialysis stack.  `diavolumes` is required
 * beside it because the two arrive together from the same unit and a block
 * carrying one without the other is not a shape this reader understands.
 */
export function detectDiafilter(
  columns: string[], kpis: KpiMap | undefined,
): DiafilterActivation {
  if (!kpis) return INACTIVE;
  for (const [unit, block] of Object.entries(kpis)) {
    if (!("V_permeated_m3" in block) || !("diavolumes" in block)) continue;
    const solutes = solutesFromKpis(block);
    if (solutes.length === 0) continue;
    //  The volume column is what every construction below walks along.
    if (!columns.includes(`${unit}.V_m3`)) continue;
    //  CONSTANT VOLUME IS READ FROM THE ENGINE'S OWN COUNTER, never from the
    //  case's `mode` word: the counter is zero in concentration mode by
    //  construction (BatchDiafilter.H:262-263), so a run that counted
    //  diavolumes held its volume, whatever any dict says.
    return {
      active: true, unit, solutes,
      constantVolume: (block["diavolumes"] ?? 0) > 0,
    };
  }
  return INACTIVE;
}

// ---- The classical closed forms --------------------------------------------

/**
 * CONSTANT-VOLUME DIAFILTRATION, the textbook washout.
 *
 *   V dc/dt = -Q_p (1 - R) c,  N = INTEGRAL Q_d dt / V_0  =>  n/n_0 = exp(-(1-R)N)
 *
 * This is the same expression the engine evaluates for `washoutIdeal_<s>`
 * (BatchDiafilter.cpp:606-607); reproducing it here is the CHECK that the two
 * pages are talking about one law, not two.
 */
export function washoutIdeal(R: number, N: number): number {
  return Math.exp(-(1 - R) * N);
}

/**
 * CONCENTRATION MODE, retained fraction.  Same balance with Q_d = 0, so the
 * volume is the clock instead of the wash:
 *
 *   dn/dt = -Q_p (1-R) n/V,  dV/dt = -Q_p  =>  dn/n = (1-R) dV/V
 *                                          =>  n/n_0 = (V/V_0)^(1-R)
 *                                                    = VCF^-(1-R)
 *
 * Sanity, both ends: R = 1 keeps everything (n/n_0 = 1); R = 0 lets the solute
 * follow the water exactly (n/n_0 = V/V_0).
 */
export function retainedIdeal(R: number, vcf: number): number {
  return Math.pow(vcf, -(1 - R));
}

/**
 * CONCENTRATION MODE, the concentration itself: c/c_0 = (n/n_0)(V_0/V)
 * = VCF^R.  R = 1 gives c/c_0 = VCF (everything stays, the volume shrinks);
 * R = 0 gives 1 (the solute is as concentrated as it started).
 */
export function concentrationIdeal(R: number, vcf: number): number {
  return Math.pow(vcf, R);
}

/**
 * PRODUCT LOST over a concentration to VCF followed by a wash of N
 * diavolumes, at constant R -- the two forms above multiplied, because the
 * retained fractions compose:
 *
 *   n/n_0 = VCF^-(1-R) exp(-(1-R)N) = exp((R-1)(ln VCF + N))
 *   loss  = 1 - n/n_0
 *
 * The exponent is the whole design statement: concentrating by a factor VCF
 * costs the same product as washing ln(VCF) diavolumes does.
 */
export function productLoss(R: number, vcf: number, N: number): number {
  return 1 - Math.exp((R - 1) * (Math.log(vcf) + N));
}

/**
 * The TIME a wash of N diavolumes takes at a volume V, area A and water flux
 * J_w (SI: m3, m2, m/s).  N diavolumes is N V of permeate, and the permeate
 * leaves at A J_w.
 */
export function diafiltrationTime(
  N: number, V: number, A: number, J_w: number,
): number {
  return N * V / (A * J_w);
}

// ---- The trajectory, as the constructions walk it ---------------------------

export interface Sample {
  t: number;
  /** Vessel volume [m3], the unit's own `V_m3` column
   *  (BatchDiafilter.cpp:552). */
  V: number;
  /** V_0/V -- the VOLUME CONCENTRATION FACTOR, on the engine's own
   *  definition of `concentrationFactor` (BatchDiafilter.cpp:580). */
  vcf: number;
  /** Water flux [L/(m2.h)], the unit's `J_w_LMH` column. */
  J_LMH: number;
  /** Permeate volumetric flow [m3/s], `Q_p_m3s`. */
  Qp: number;
  /** The engine's own diavolume counter at this instant, `diavolumes`
   *  (zero throughout a concentration-mode run, by construction). */
  N: number;
  /** The integrator's ACCEPTED permeated volume [m3], `V_perm_m3` -- the
   *  state, not a re-quadrature (BatchDiafilter.H:255-263). */
  Vperm: number;
  /** A_eff/A_w where the case declared fouling, else null. */
  permeanceRatio: number | null;
}

const column = (
  vars: TrajectoryData["vars"], unit: string, name: string,
): number[] | null => vars[`${unit}.${name}`] ?? null;

/**
 * The per-instant record every construction on this page walks, assembled
 * from the unit's own trajectory columns.  Returns null when the run does not
 * carry them -- the page then says so and draws nothing.
 */
export function readSamples(
  trajectory: TrajectoryData | undefined, unit: string, V0: number,
): Sample[] | null {
  if (!trajectory) return null;
  const V = column(trajectory.vars, unit, "V_m3");
  const J = column(trajectory.vars, unit, "J_w_LMH");
  const Qp = column(trajectory.vars, unit, "Q_p_m3s");
  const N = column(trajectory.vars, unit, "diavolumes");
  const Vp = column(trajectory.vars, unit, "V_perm_m3");
  const ratio = column(trajectory.vars, unit, "A_eff_over_A_w");
  if (V === null || J === null || Qp === null || N === null || Vp === null)
    return null;
  const out: Sample[] = [];
  for (let k = 0; k < trajectory.t.length; k++) {
    const v = V[k];
    if (v === undefined || !(v > 0)) continue;
    out.push({
      t: trajectory.t[k] ?? NaN,
      V: v,
      vcf: V0 > 0 ? V0 / v : NaN,
      J_LMH: J[k] ?? NaN,
      Qp: Qp[k] ?? NaN,
      N: N[k] ?? NaN,
      Vperm: Vp[k] ?? NaN,
      permeanceRatio: ratio?.[k] ?? null,
    });
  }
  return out.length > 0 ? out : null;
}

export interface SoluteSeries {
  /** Bulk concentration [kmol/m3], `c_b_<s>` (BatchDiafilter.cpp:564). */
  cb: number[];
  /** Permeate concentration [kmol/m3], `c_p_<s>` (line 565). */
  cp: number[];
  /** OBSERVED rejection 1 - c_p/c_b, the engine's own `R_obs_<s>`
   *  (lines 566-569) -- never recomputed here from cb and cp. */
  R: number[];
}

export function readSolute(
  trajectory: TrajectoryData | undefined, unit: string, solute: string,
): SoluteSeries | null {
  if (!trajectory) return null;
  const cb = column(trajectory.vars, unit, `c_b_${solute}`);
  const cp = column(trajectory.vars, unit, `c_p_${solute}`);
  const R = column(trajectory.vars, unit, `R_obs_${solute}`);
  if (cb === null || cp === null || R === null) return null;
  return { cb, cp, R };
}

// ---- The diafiltration optimum ---------------------------------------------

export interface OptimumPoint {
  vcf: number;
  /** The RETAINED solute's bulk concentration [kmol/m3]. */
  c: number;
  J_LMH: number;
  /** J_w c -- the quantity the classical optimum maximises. */
  Jc: number;
}

export interface OptimumScan {
  points: OptimumPoint[];
  /** Index of the largest J_w c in `points`. */
  iMax: number;
  /**
   * true when the maximum is strictly INSIDE the scanned window.  When it is
   * at an end, the run did not bracket an optimum and the page says so rather
   * than reporting an endpoint as a design answer.
   */
  interior: boolean;
}

/**
 * The classical diafiltration optimum, located on the RUN's own trajectory.
 *
 * A wash of N diavolumes at volume V takes t = N V/(A J_w).  For a fixed
 * inventory of the retained species, V is inversely proportional to its
 * concentration c, so the time is proportional to 1/(J_w c): the cheapest
 * wash is at the concentration where J_w c is LARGEST (Ng, Lundblad & Mitra,
 * Separation Science 11(5) (1976) 499-502,
 * doi:10.1080/01496397608085339).
 *
 * THE CLOSED FORM OF THAT OPTIMUM IS NOT REPRODUCED, and the omission is the
 * point.  The familiar c_gel/e answer follows from the GEL-POLARISED flux law
 * J_w = k ln(c_gel/c), which this engine does not carry -- its flux comes from
 * a transmembrane pressure less an osmotic pressure through the declared
 * transport law.  So the maximum is READ OFF the engine's own J_w(c), which
 * is the same method applied to a different flux law, and no constant is
 * borrowed from a model that is not running.
 */
export function scanWashOptimum(
  samples: readonly Sample[], cb: readonly number[],
): OptimumScan | null {
  const points: OptimumPoint[] = [];
  for (let k = 0; k < samples.length; k++) {
    const s = samples[k]!;
    const c = cb[k];
    if (c === undefined || !Number.isFinite(c) || !Number.isFinite(s.J_LMH))
      continue;
    points.push({ vcf: s.vcf, c, J_LMH: s.J_LMH, Jc: s.J_LMH * c });
  }
  if (points.length < 3) return null;
  let iMax = 0;
  for (let k = 1; k < points.length; k++)
    if (points[k]!.Jc > points[iMax]!.Jc) iMax = k;
  return { points, iMax, interior: iMax > 0 && iMax < points.length - 1 };
}

// ---- The trapezoid, and what it is for here --------------------------------

/**
 * Trapezoid rule over (x, y).  It exists on this page for ONE construction:
 * re-integrating the permeate flow over the WRITTEN samples and comparing it
 * with `V_perm_m3`, the volume the adaptive integrator actually accepted.
 *
 * `BatchDiafilter.H:255-263` records why the unit integrates the volume as a
 * STATE instead: a ledger built by re-quadrature disagrees with the accepted
 * state at O(dt).  This reproduces that disagreement, on the coarser mesh of
 * the write interval, so the gap is visible rather than described.
 */
export function trapezoid(x: readonly number[], y: readonly number[]): number {
  let area = 0;
  for (let k = 1; k < x.length && k < y.length; k++)
    area += 0.5 * (x[k]! - x[k - 1]!) * (y[k]! + y[k - 1]!);
  return area;
}

// ---- The vessel, read from the case ----------------------------------------

export interface FoulingDeclaration {
  /** The declared Hermia law word, verbatim (BatchDiafilter.cpp:161-182). */
  law: string;
  /** The declared constant; null when the case's value is not a number. */
  k: number | null;
  /** The author's REQUIRED statement of the mechanism
   *  (BatchDiafilter.cpp:191-199); null when the key is absent, which the
   *  engine refuses -- so a null here means the case would not run. */
  reason: string | null;
}

export interface VesselDeclaration {
  unitFound: boolean;
  /** `operation.mode`, verbatim; null when the case leaves it out (the
   *  engine then takes `concentration` -- BatchDiafilter.cpp:202). */
  mode: string | null;
  membrane: string | null;
  transport: string | null;
  /** Membrane area [m2] (BatchDiafilter.cpp:118). */
  area: number | null;
  /** Feed and permeate pressures [Pa], and their difference. */
  Pfeed: number | null;
  Pperm: number | null;
  tmp: number | null;
  /** The DECLARED film coefficient [m/s].  The engine REQUIRES it and
   *  refuses without it (BatchDiafilter.cpp:129-137), so a null here is a
   *  case that does not run. */
  kFilm: number | null;
  /** Solution density [kg/m3].  Null when the case declares none: the engine
   *  then defaults to 1000 and ANNOUNCES it (BatchDiafilter.cpp:140-158), and
   *  this reader reports the absence rather than repeating the default. */
  rho: number | null;
  fouling: FoulingDeclaration | null;
  missing: string[];
}

const isDict = (v: JsonValue | undefined): v is { [k: string]: JsonValue } =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const word = (v: JsonValue | undefined): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

/**
 * Read the vessel's declared operation from the case that produced the run.
 * `unit` is the KPI block's name; a flattened fractal name (`SECTOR.vessel`)
 * is matched on its last segment, exactly as the LUB page's reader does.
 * Every absence is NAMED in `missing` with the surface it would come from.
 */
export function readVessel(
  files: CaseFiles | null, unit: string,
): VesselDeclaration {
  const out: VesselDeclaration = {
    unitFound: false, mode: null, membrane: null, transport: null,
    area: null, Pfeed: null, Pperm: null, tmp: null, kFilm: null, rho: null,
    fouling: null, missing: [],
  };
  const leaf = unit.split(".").pop() ?? unit;
  const units = files?.flowsheet?.["units"];
  let op: { [k: string]: JsonValue } | null = null;
  if (Array.isArray(units)) {
    for (const u of units) {
      if (!isDict(u)) continue;
      const name = u["name"];
      if (name === unit || name === leaf) {
        const o = u["operation"];
        if (isDict(o)) op = o;
        out.unitFound = true;
        break;
      }
    }
  }
  if (op === null) {
    out.missing.push(`area, P_feed, P_permeate, k_film, rho, mode: no units[] `
      + `entry named '${unit}' with an operation {} block in `
      + "system/flowsheetDict");
    return out;
  }

  const readScalar = (key: string, what: string): number | null => {
    const raw = op![key];
    if (raw === undefined) {
      out.missing.push(`${what}: operation.${key} is not declared in `
        + "system/flowsheetDict");
      return null;
    }
    const v = scalarToSI(raw);
    if (!Number.isFinite(v)) {
      out.missing.push(`${what}: operation.${key} = '${String(raw)}' is not a `
        + "scalar this reader can convert to SI");
      return null;
    }
    return v;
  };

  out.mode = word(op["mode"]);
  if (out.mode === null)
    out.missing.push("mode: operation.mode is not declared in "
      + "system/flowsheetDict (the engine then runs `concentration`)");
  out.membrane = word(op["membrane"]);
  out.transport = word(op["transport"]);
  out.area = readScalar("area", "A");
  out.Pfeed = readScalar("P_feed", "P_feed");
  //  P_permeate has an ENGINE DEFAULT of zero gauge
  //  (BatchDiafilter.cpp:120), so its absence is not a gap: it is a
  //  declaration that the permeate side is at the reference pressure.
  out.Pperm = op["P_permeate"] === undefined
    ? 0 : readScalar("P_permeate", "P_permeate");
  out.tmp = out.Pfeed !== null && out.Pperm !== null
    ? out.Pfeed - out.Pperm : null;
  out.kFilm = readScalar("k_film", "k_film");
  //  rho: ABSENT is a state of its own, and the message says what the engine
  //  does about it rather than this reader doing the same thing quietly.
  if (op["rho"] === undefined)
    out.missing.push("rho: operation.rho is not declared -- the engine "
      + "defaults the solution density to 1000 kg/m3 and announces it, and "
      + "every concentration in the vessel is closed on that number");
  else
    out.rho = readScalar("rho", "rho");

  const fd = op["fouling"];
  if (isDict(fd)) {
    const kRaw = fd["k"];
    const kNum = kRaw === undefined ? NaN : scalarToSI(kRaw);
    out.fouling = {
      law: word(fd["law"]) ?? "(none declared)",
      k: Number.isFinite(kNum) ? kNum : null,
      reason: word(fd["reason"]),
    };
  }
  return out;
}

// ---- Reading the run's own verdict -----------------------------------------

export interface SoluteVerdict {
  solute: string;
  /** `R_initial_<s>` / `R_final_<s>` (BatchDiafilter.cpp:593-594). */
  R0: number | null;
  R1: number | null;
  /** `recovery_<s>` -- n/n_0 at the end (line 595). */
  recovery: number | null;
  /** `washoutActual_<s>` / `washoutIdeal_<s>`, published in constant-volume
   *  mode ONLY (lines 597-607); null on the concentration branch, where the
   *  engine deliberately publishes no idealisation. */
  washoutActual: number | null;
  washoutIdeal: number | null;
  /** The SAME idealisation recomputed here from the engine's own R_0 and N.
   *  Where the engine published one, the two must agree; where it did not,
   *  this is the only one on the page and is labelled as the tool's. */
  handIdeal: number | null;
  /** Concentration-mode idealisation from R_0 and the run's own VCF. */
  handRetainedConc: number | null;
}

const num = (v: number | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * One solute's engine numbers, and the hand law evaluated on the engine's own
 * R_0 and clock beside them.  Nothing here chooses between the two.
 */
export function soluteVerdict(
  unitKpis: UnitKpis | undefined, solute: string,
  N: number | null, vcf: number | null,
): SoluteVerdict {
  const R0 = num(unitKpis?.[`R_initial_${solute}`]);
  const washoutIdeal_ = num(unitKpis?.[`washoutIdeal_${solute}`]);
  return {
    solute,
    R0,
    R1: num(unitKpis?.[`R_final_${solute}`]),
    recovery: num(unitKpis?.[`recovery_${solute}`]),
    washoutActual: num(unitKpis?.[`washoutActual_${solute}`]),
    washoutIdeal: washoutIdeal_,
    handIdeal: R0 !== null && N !== null && N > 0 ? washoutIdeal(R0, N) : null,
    handRetainedConc: R0 !== null && vcf !== null && vcf > 0
      ? retainedIdeal(R0, vcf) : null,
  };
}

/** Which way the constant-R law was wrong, from the run's own two rejections.
 *  A statement about the SIGN only; the size is in the table beside it. */
export function gapDirection(v: SoluteVerdict): string | null {
  if (v.R0 === null || v.R1 === null) return null;
  const d = v.R1 - v.R0;
  if (Math.abs(d) < 1e-9) return "the observed rejection did not move, so the "
    + "constant-R law had nothing to be wrong about";
  return d > 0
    ? "the observed rejection ROSE during the run, so less solute passed than "
      + "a constant R predicted and MORE was retained than the ideal law says"
    : "the observed rejection FELL during the run, so more solute passed than "
      + "a constant R predicted and LESS was retained than the ideal law says";
}
