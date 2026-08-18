/*---------------------------------------------------------------------------*\
  exploreTheory — the Explore workspace's Theory Guide destinations.

  Extracted from ExploreWorkspace.tsx (2026-08-18) for the same reason
  exploreViews.ts was: the decision is pure, and a pure module can be gated
  directly.  It was NOT gated — `tests/methodTheoryAnchors.test.ts` watches the
  EduTools registry's anchors and nothing watched these, so a lens with no
  `case` of its own fell through to the property-scan default and opened the
  vapour-pressure chapter over a liquid-liquid diagram.  The gate that now
  watches this file is `tests/exploreTheoryAnchors.test.ts`; its header carries
  the failure it was written to catch.

  THE SHAPE MATTERS: every PlotKind except the property scan resolves to ONE
  destination, INDEPENDENT of the selected property.  A kind whose anchor moves
  when the property moves is a kind that has no `case` here — which is exactly
  how a reader gets sent somewhere plausible and wrong.  Only `scan` dispatches
  on the property, because for a property scan the property IS the subject.
\*---------------------------------------------------------------------------*/

import { guideUrl } from "../help/guideLinks.js";
import type { PlotKind } from "./exploreViews.js";

// Map the active plot to the matching Theory Guide section (hyperref destlabel
// turns each \label{...} into a PDF named destination, so #nameddest jumps
// straight there).  The URL itself comes from `help/guideLinks`, the one
// home for it -- ExploreWorkspace used to hardcode a leading "/", which points
// outside the app under a deployed base.
export function theoryAnchor(plotType: PlotKind, property: string): string {
  switch (plotType) {
    case "txy": return "ch:flash";          // binary VLE / bubble-dew
    case "flash": return "ch:flash";        // binary flash: tie-line + lever rule
    case "gamma": return "ch:activity";     // activity coefficients
    case "ternary": return "sec:ternary";   // ternary boiling surface
    case "ternaryLle": return "ch:lle-gibbs"; // liquid-liquid / solubility
    // The binary g_mix + common-tangent lens is liquid-liquid equilibrium by
    // Gibbs minimisation one dimension below the ternary lens above, so it
    // takes the same chapter -- and inside it \label{sec:common-tangent},
    // written for this construction.  Until 2026-08-18 this case was ABSENT:
    // the lens fell through to the property scan below and, on the workspace's
    // boot property, sent the reader to `ch:vap` -- vapour pressure, over a
    // liquid-liquid diagram.  It opened, it showed a chapter, and only a
    // reader who already knew the subject could tell it was the wrong one.
    case "binaryLle": return "ch:lle-gibbs";
    case "phase": return "ch:vap";           // vapour pressure / saturation
    case "scaling": return "ch:electrolytes"; // ionic strength / activity / Pitzer
    // `ch:gibbs` was never a label in any build of the Theory Guide, so this
    // lens's Theory link opened the guide at page 1 and said nothing.  The
    // real section is \label{sec:gibbs-maps}, "Equilibrium maps and the
    // temperature approach" — the same destination modelDocs already gives
    // the gibbsMap props op.
    case "gibbsmap": return "sec:gibbs-maps"; // equilibrium maps (forum 2026-07-02)
    case "steam": return "ch:vap";           // saturation line / vapour pressure
    case "scan":                             // the property IS the subject here
    default:
      if (property === "Psat") return "ch:vap";
      if (property === "Cp_liquid" || property === "Cp_ig") return "ch:heat";
      if (property === "viscosity_liquid" || property === "viscosity_gas") return "ch:viscosity";
      if (property === "thermal_conductivity_liquid" || property === "thermal_conductivity") return "ch:thermal-cond";
      return "ch:fugacity";                 // Z / v_molar / H / S → EoS departure
  }
}

export const theoryUrl = (plotType: PlotKind, property: string) =>
  guideUrl("theoryGuide", theoryAnchor(plotType, property));
