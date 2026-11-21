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
  The three flow arrangements of a continuous convective dryer, as DATA
  (DEV.md 4c C465, Vitor 2026-11-21).

  WHAT THE ENGINE COMPUTES IS NOT TYPED HERE.  The page runs the three tutorial
  cases in the browser (case/methodRun.ts, the one home of "run a bundled
  witness") and draws X(z), Y(z) and T(z) from the unit's own `profile` and
  its outlet row from the unit's own KPIs.  This module holds only (a) which
  case and which unit is which arrangement, (b) the readers, which REFUSE a
  profile that lacks a column rather than draw one quantity under another's
  caption, and (c) where each arrangement is used, as the books say it, at a
  page.  Nothing is computed in TypeScript.

  EVERY CLAIM OF (c) IS A BOOK'S, AT A PAGE, read in the literature folder on
  2026-11-21: van 't Land, Drying in the Process Industry (2012), section 4.1
  "Modes of Flow", printed p. 42; Perry's Chemical Engineers' Handbook, 9th
  ed., Section 12, "Gas Flow Pattern in Dryer" and "Dryer Selection
  Considerations", p. 12-36; Mujumdar (ed.), Handbook of Industrial Drying,
  3rd ed. (2006), Chapter 3, section 3.6.2, printed pp. 57-66.
\*---------------------------------------------------------------------------*/

import type { UnitProfile } from "../../adapters/SolverAdapter.js";
import { ARRANGEMENT_IDS, type ArrangementId } from "./dryerDrawings.js";

export { ARRANGEMENT_IDS };
export type { ArrangementId };

export interface ArrangementCase {
  id: ArrangementId;
  label: string;
  /** The bundled tutorial the page runs and opens (relative to tutorials/). */
  witness: string;
  /** The unit of that case that is this arrangement. */
  unit: string;
  /** One sentence for the card: what the solid meets. */
  meets: string;
}

export const ARRANGEMENT_CASES: Readonly<Record<ArrangementId, ArrangementCase>> = {
  cocurrent: {
    id: "cocurrent", label: "Co-current",
    witness: "steady/drying/convDryer01_sugar_curve", unit: "co",
    meets: "The wettest solid meets the hottest, driest gas; the driest solid meets the gas "
      + "that is already used up.",
  },
  countercurrent: {
    id: "countercurrent", label: "Counter-current",
    witness: "steady/drying/convDryer02_sugar_countercurrent", unit: "dryer",
    meets: "The driest solid meets the freshest, hottest gas; the wettest solid meets the gas "
      + "that is already used up.",
  },
  crossflow: {
    id: "crossflow", label: "Cross-flow",
    witness: "steady/drying/convDryer03_sugar_crossflow", unit: "dryer",
    meets: "Every length of the solid meets gas fresh from the inlet; the exhaust is the mix of "
      + "all the elements.",
  },
};

/** The column of the engine's profile that is each plotted quantity. */
export const PROFILE_COLUMNS = {
  position: "position", X: "X_kg_kg", Y: "Y_kg_kg", T: "T_gas_K",
} as const;

export interface ArrangementProfile {
  /** Fraction of the contact area passed by the solid, 0 at the solid inlet. */
  xi: number[]; X: number[]; Y: number[]; T: number[];
}

/** The unit's profile, or null when it is absent or lacks a column or the
 *  columns disagree in length.  It never guesses a column by position. */
export function profileOfUnit(
  profiles: readonly UnitProfile[] | undefined, unit: string,
): ArrangementProfile | null {
  const p = profiles?.find((q) => q.unit === unit);
  if (!p) return null;
  const xi = p.columns[PROFILE_COLUMNS.position];
  const X = p.columns[PROFILE_COLUMNS.X];
  const Y = p.columns[PROFILE_COLUMNS.Y];
  const T = p.columns[PROFILE_COLUMNS.T];
  if (!xi || !X || !Y || !T) return null;
  if (xi.length < 2 || X.length !== xi.length || Y.length !== xi.length || T.length !== xi.length)
    return null;
  return { xi, X, Y, T };
}

export interface ArrangementOutlet {
  X: number; Y: number; Tair: number;
  /** Fraction of the area at which X crossed X_c, or null if it did not. */
  xiCrit: number | null;
}

/** The outlet row, from the unit's KPIs.  Null when a key is missing. */
export function outletOfUnit(
  kpis: { [unit: string]: { [key: string]: number } } | undefined, unit: string,
): ArrangementOutlet | null {
  const k = kpis?.[unit];
  if (!k) return null;
  const X = k["X_final"], Y = k["Y_air_out"], Tair = k["T_air_out"];
  if (![X, Y, Tair].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const c = k["position_critical"];
  return { X: X!, Y: Y!, Tair: Tair!, xiCrit: typeof c === "number" && Number.isFinite(c) ? c : null };
}

export interface ArrangementUse {
  id: ArrangementId;
  /** The situation, in the reader's words. */
  when: string;
  /** Why, as the book gives it. */
  why: string;
  /** The pages, as the page prints them. */
  src: string;
}

export const ARRANGEMENT_USES: readonly ArrangementUse[] = [
  {
    id: "cocurrent",
    when: "A heat-sensitive product.",
    why: "The gas temperature falls throughout the dryer, so the final solids temperature is much "
      + "lower than in cross-flow and \"cocurrent dryers are very suitable for drying "
      + "heat-sensitive materials\", although a solids temperature peak inside the dryer is "
      + "possible (Perry).  The feed meets the hottest gas, which gives a high initial rate, "
      + "and van 't Land warns that evaporation that is too rapid may damage the product or "
      + "harden the case.",
    src: "Perry 9th ed., p. 12-36; van 't Land, section 4.1, p. 42",
  },
  {
    id: "countercurrent",
    when: "The lowest final moisture, in a solid that stands heat.",
    why: "The exiting solid meets the hottest, driest gas, which gives a low final moisture "
      + "content by minimising the local equilibrium moisture; for that reason it is \"obviously "
      + "unsuitable for thermally sensitive solids\" (Perry).  van 't Land says the same: a very "
      + "low final moisture content, at the risk of overheating the processed material.",
    src: "Perry 9th ed., p. 12-36; van 't Land, section 4.1, p. 42",
  },
  {
    id: "crossflow",
    when: "A bed of particles that the air can cross: the through-circulation belt, the "
      + "plug-flow fluid bed.",
    why: "van 't Land names fluid-bed and band dryers as cross-flow, and Mujumdar develops the "
      + "plug-flow fluid bed as the cross-flow case with the solid in one dimension; in "
      + "cross-flow all the solids are exposed to the same gas temperature and the solids "
      + "temperature approaches the gas temperature near the end of drying (Perry).",
    src: "van 't Land, section 4.1, p. 42; Mujumdar 2006, section 3.6.2.3.1, p. 65; "
      + "Perry 9th ed., p. 12-36",
  },
];
