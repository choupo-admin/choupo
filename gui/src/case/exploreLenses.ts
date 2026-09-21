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
  exploreLenses — WHAT EACH EXPLORER LENS IS CALLED, and which one a selection
  OPENS on.

  The kind list (case/exploreViews.ts PLOT_KINDS) and its two label tables
  lived in two different files: the enumeration that a test can walk was pure,
  and the words a reader actually sees were buried 150 lines into a 2300-line
  component, where nothing could reach them.  So a lens could be added to the
  union, gated correctly, and still reach the strip with no word of its own —
  which is exactly how `yx` spent its life as an unlabelled sub-mode.  One
  home, beside the enumeration, so a missing label is a test failure rather
  than a screenshot.

  THE DEFAULT LENS IS A DECISION, so it has a function and not a literal.  The
  workspace booted every selection on the property scan, whose own default
  property is a VAPOUR PRESSURE; open `?components=water,NaCl` and the first
  thing on screen was the engine refusing `Psat_NaCl` — a red banner before the
  student had done anything at all.  The class already knows better: an aqueous
  electrolyte's question is the scaling audit.
\*---------------------------------------------------------------------------*/

import type { ComponentMeta } from "./catalogue.js";
import { classifySelection, viewsFor, type PlotKind } from "./exploreViews.js";
import type { buildLocalUnifac } from "./unifacGroups.js";

export interface PlotType {
  id: PlotKind;
  label: string;
  min: number;
  max: number;      // 99 = "any"
  vle: boolean;     // requires every selected component VLE-able
  why: string;      // disabled-reason hint
  comingSoon?: string; // if set, the type is shown but always gated (not yet wired)
  needsUnifac?: boolean; // requires every selected component to have a UNIFAC decomposition
}

export const PLOT_TYPES: PlotType[] = [
  { id: "scan",  label: "Property vs T/P", min: 1, max: 99, vle: false, why: "pick at least one component" },
  // Pure-compound P-T phase diagram: saturation curve to the critical point.
  { id: "phase", label: "Pure phase diagram (P-T)", min: 1, max: 1, vle: true,
    why: "needs exactly 1 VLE-able component (Tc + vapour pressure)" },
  { id: "txy",   label: "Binary boiling envelope (T-x-y)", min: 2, max: 2, vle: true, why: "needs exactly 2 VLE-able components" },
  //  The classical equilibrium curve: y*(x) against the y = x diagonal at
  //  fixed P.  THE SAME ENGINE RUN as the T-x-y (binaryVleSpec) read the other
  //  way round — no new op, no new physics.  It is a lens rather than a
  //  sub-mode because a reader looking for the most familiar diagram in VLE
  //  should find it on the strip where every other diagram is named.
  { id: "yx",    label: "Equilibrium curve y(x)", min: 2, max: 2, vle: true, why: "needs exactly 2 VLE-able components" },
  { id: "gamma", label: "Activity coefficients γ(x)", min: 2, max: 2, vle: true, why: "needs exactly 2 VLE-able components" },
  // (McCabe-Thiele and the psychrometric chart — METHOD CONSTRUCTIONS over the
  // same y_eq(x) run — moved to the Methods workspace 2026-08-15.  The binary
  // FLASH followed them 2026-09-21: it was rebuilt there as "Flash (operating
  // line)" on 2026-08-28 and had been living here in parallel ever since.)
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
  // Membrane-scaling audit (scalingScan engine op): speciate a water analysis
  // at increasing RO/NF recovery and SEE each mineral's SI = log10(IAP/K)
  // cross zero — the crossing IS the max safe recovery.  Needs only water (the
  // solvent); the ions are set in the analysis panel, not the compound set.
  { id: "scaling", label: "Scaling (SI vs recovery)", min: 1, max: 99, vle: false,
    why: "select water + a dissolved electrolyte (e.g. NaCl) — RO-scaling needs ions" },
  // Species distribution vs pH — the Bjerrum plot (ruled into EXPLORE, not
  // EduTools, 2026-08-18: a distribution diagram shows what a system IS, not a
  // construction a student performs).  One `speciate` op per pH point over the
  // curated chemistry network; the acid/base FAMILY is picked in the lens
  // panel, like the scaling analysis, because a master ion is not a component.
  { id: "bjerrum", label: "Species distribution vs pH (Bjerrum)", min: 1, max: 99, vle: false,
    why: "select water (alone, or with a dissolved salt) — aqueous speciation needs the solvent" },
  // Gibbs equilibrium map (forum 2026-07-02): iso-lines of equilibrium
  // composition over T x P — why industrial reactors fix T and P.  Offered
  // only where the selection HAS a stoichiometric degree of freedom and every
  // species carries the formation datum (case/gibbsMapSpec.ts).
  { id: "gibbsmap", label: "Equilibrium map (Gibbs)", min: 2, max: 12, vle: false,
    why: "pick 2+ species that can react — more species than elements, each with a formation datum (e.g. N2 + H2 + NH3)" },
  // Steam tables (steamTables engine op): IAPWS-IF97 (R7-97(2012)), the WATER
  // industrial formulation — the saturated-steam table (region-4 line) or an
  // isobar (h,s,v,cp vs T; the engine announces the Tsat crossing).
  { id: "steam", label: "Steam tables (IF97)", min: 1, max: 1, vle: false,
    why: "IF97 is the water formulation — select water alone" },
  //  Solvent selection by cohesive energy density.  Needs no pair parameters
  //  and no VLE: delta is derived per component from HvapTb, Tc and Vliq, so
  //  any two substances that carry those three can be compared -- which is
  //  what makes this the one study that works across the whole catalogue.
  { id: "solubility", label: "Solubility parameter (Hildebrand)", min: 2, max: 12, vle: false,
    why: "pick 2+ liquids that carry HvapTb, Tc and Vliq — delta is derived from those three" },
];

// Short lens labels for the toolbar SegmentedControl (the full label rides the
// tooltip).  Keeps the one toolbar row from wrapping while the long names stay
// discoverable on hover.
export const LENS_SHORT: Record<PlotKind, string> = {
  scan: "scan", phase: "P-T", txy: "T-x-y",
  //  "y-x", not "y(x)": on the strip it sits beside "T-x-y" and reads as the
  //  same family of axis pair, which is what it is.
  yx: "y-x",
  //  NOT "γ(x)".  In this sans-serif face a lowercase gamma and a lowercase y
  //  are the same glyph, and this is the one place the symbol stands alone
  //  with no word beside it to disambiguate.  Next to `T-x-y`, a reader
  //  looking for the equilibrium curve y(x) -- the most familiar diagram in
  //  VLE, a function of the same x, drawn against the same axis -- clicked
  //  this and got activity coefficients.  Reported three times before anyone
  //  looked at the SCREEN rather than the code.  The word carries it; and
  //  since 2026-09-21 the diagram they were looking for is on the strip too.
  gamma: "activity γ",
  binaryLle: "LLE", ternary: "ternary", ternaryLle: "tern.LLE",
  scaling: "scaling", steam: "steam", gibbsmap: "gibbsmap", bjerrum: "Bjerrum",
  solubility: "delta",
};

/** The lens a selection OPENS on.  The property scan is the honest default for
 *  anything whose first question is "what does this compound's property look
 *  like" — but an aqueous electrolyte's is not: the scan's own boot property is
 *  Psat, a salt has none, and the landing was therefore a refusal.  Decided
 *  from the physical CLASS and never from a name, and it only ever names a
 *  lens `viewsFor` agrees applies. */
export function defaultLensFor(
  sel: string[], cat: ComponentMeta[],
  localUnifac: ReturnType<typeof buildLocalUnifac>,
): PlotKind {
  if (sel.length === 0) return "scan";
  const views = viewsFor(sel, cat, localUnifac);
  if (classifySelection(sel, cat) === "aqueous-electrolyte" && views.has("scaling"))
    return "scaling";
  return "scan";
}
