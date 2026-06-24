/*---------------------------------------------------------------------------*\
  exploreViews — the SINGLE SOURCE deciding which Explore views are OFFERED for a
  component selection.  classifySelection() gives the selection's physical class;
  viewsFor() maps class (+ length / vleAble / UNIFAC sub-gates) to the admissible
  view set.  A view absent from the set DISAPPEARS from the strip (gui-credo: an
  irrelevant control is removed, never greyed).  Kept pure (no React) so the view
  relevance is unit-tested directly — the regression that shut the benzene-water
  bug (psychrometrics + RO-scaling offered for an aqueous-organic pair).
\*---------------------------------------------------------------------------*/

import { metaByName, type ComponentMeta } from "./catalogue.js";
import { buildLocalUnifac, hasUnifacGroups } from "./unifacGroups.js";

export type PlotKind = "scan" | "txy" | "flash" | "gamma" | "mccabe" | "binaryLle" | "ternary"
  | "ternaryLle" | "phase" | "psychro" | "scaling" | "steam";

export type SelClass = "pure" | "organic-mixture" | "aqueous-organic"
  | "aqueous-electrolyte" | "humid-gas" | "mixed";

/** The physical class of a component selection. */
export function classifySelection(sel: string[], cat: ComponentMeta[]): SelClass {
  if (sel.length === 0) return "mixed";
  if (sel.length === 1) return "pure";
  const metas = sel.map((c) => metaByName(c, cat));
  const hasWater = sel.includes("water");
  const electrolyte = metas.some((m) => m?.isElectrolyte);
  const permGas = metas.some((m) => m?.isPermanentGas);
  const condensable = metas.some((m) => (m?.vleAble ?? false) && !(m?.isPermanentGas ?? false));
  if (permGas && condensable) return "humid-gas";            // carrier gas + condensable
  if (hasWater && electrolyte) return "aqueous-electrolyte";  // ions in water
  if (metas.every((m) => m?.vleAble))
    return hasWater ? "aqueous-organic" : "organic-mixture";
  return "mixed";                                            // honest catch-all -> scan only
}

/** The views that PHYSICALLY apply to a selection (length + vleAble + UNIFAC
 *  sub-gates folded in).  reasonFor() is null iff the view is in here. */
export function viewsFor(sel: string[], cat: ComponentMeta[],
                         localUnifac: ReturnType<typeof buildLocalUnifac>): Set<PlotKind> {
  const out = new Set<PlotKind>(["scan"]);                   // a property scan always applies
  const n = sel.length;
  if (n === 0) return out;
  const metas = sel.map((c) => metaByName(c, cat));
  const cls = classifySelection(sel, cat);
  const allVle = metas.every((m) => m?.vleAble ?? false);
  // UNIFAC-able = groups in the component .dat (engine reads them) OR a case-local
  // unifac block OR the built-in map — any of the three.
  const allUnifac = sel.every((c, i) =>
    (metas[i]?.hasUnifac ?? false) || hasUnifacGroups(c, localUnifac));
  const vleMix = cls === "aqueous-organic" || cls === "organic-mixture";
  if (n === 1) {
    if (metas[0]?.vleAble) out.add("phase");
    if (sel[0] === "water") out.add("steam");
  }
  // McCabe-Thiele binary distillation: same front door as the T-x-y (exactly 2
  // VLE-able components with a binary VLE curve) — the analyzer reuses that
  // run's y_eq(x) as the real equilibrium curve, so it is offered iff txy is.
  if (n === 2 && vleMix && allVle) { out.add("txy"); out.add("flash"); out.add("gamma"); out.add("mccabe"); }
  if (n === 2 && allUnifac) out.add("binaryLle");            // immiscibility instrument
  if (n === 3 && vleMix && allVle) out.add("ternary");
  if (n === 3 && vleMix && allVle && allUnifac) out.add("ternaryLle");
  if (cls === "humid-gas" && n === 2) out.add("psychro");
  if (cls === "aqueous-electrolyte") out.add("scaling");
  return out;
}
