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
  registry — the EduTools (classical method constructions) tool registry, and
  the one home of "which tool is open".

  It lives in its OWN module (2026-08-16): once the permanent 252px tool rail
  was ruled out in favour of a top-bar dropdown, the registry gained a SECOND
  reader — the workspace body (MethodsWorkspace.tsx) and the menu bar
  (MenuBar.tsx) both need it.
  MethodsWorkspace reaches Plotly at module scope, so a MenuBar that imported
  the registry FROM it would drag the plotting bundle into the menu bar (and
  out of the node test runner's reach).  One registry, one selection, two
  readers — never a second hand-written tool list in the menu.

  The SELECTION is module state rather than component state because the menu
  that sets it and the workspace that renders it are siblings, mounted
  independently (the workspace is lazy, and the menu exists before it).  A
  React-external store with useSyncExternalStore keeps them in step without
  the tool id having to become global application state: it is a property of
  this workspace, and it stays here.

  The deep link `?workspace=methods&tool=<id>` is a CONTRACT (gui-credo §4:
  the address bar is a shareable bookmark of what is on screen).  It keeps the
  `methods` key even though the workspace is now LABELLED EduTools — a URL
  already in a student's notes must not stop working because a caption changed.
\*---------------------------------------------------------------------------*/

import { useSyncExternalStore } from "react";
import { guideUrl } from "../../help/guideLinks.js";

export type MethodToolId =
  | "mccabe" | "psychro" | "kremser" | "pinch-composite" | "entu"
  | "pump-system" | "breakthrough" | "merkel" | "rayleigh" | "levenspiel"
  | "vanheerden" | "drying" | "hunter-nash";

export interface MethodTool {
  id: MethodToolId;
  label: string;
  status: "live" | "planned";
  /** One line: what this construction teaches. */
  teaches: string;
  /** Theory Guide named destination (hyperref destlabel), when one exists. */
  theory?: string;
  /** Planned entries: the engine output that will feed the tool. */
  fedBy?: string;
}

// ---- The method-tool registry ----------------------------------------------
// One entry per classical construction.  `status: "planned"` entries are
// VISIBLE but disabled — the menu is the roadmap, stated rather than implied —
// and each names the engine output that will feed it (zero physics in TS is
// the standing rule for a planned tool exactly as for a live one).
//
// `theory` must name a REAL `\label{...}` in docs/theoryGuide.tex: the
// preamble sets destlabel=true, so each label becomes a PDF named destination
// the viewer can jump to.  An anchor the guide does not define opens the PDF
// at page 1 with no error — tests/methodTheoryAnchors.test.ts is the gate that
// makes that failure loud (it caught `sec:mccabe-tray-efficiency`, an anchor
// that never existed in any build of the guide).

export const METHOD_TOOLS: MethodTool[] = [
  {
    id: "mccabe", label: "Distillation (McCabe-Thiele)", status: "live",
    teaches: "Operating lines, the q-line and the staircase: how reflux R and feed quality q set the number of ideal stages.",
    theory: "ch:distillation",
  },
  {
    id: "psychro", label: "Psychrometric chart", status: "live",
    teaches: "The humid-gas state map: saturation, relative-humidity and adiabatic-saturation / wet-bulb lines locate every drying and conditioning path.",
    theory: "ch:drying",
  },
  {
    id: "kremser", label: "Absorption (Kremser)", status: "live",
    teaches: "The absorption factor A = L/(mV): how solute recovery scales with stage count when both lines are straight — judged against the engine's stagewise recovery.",
    theory: "ch:absorber",
  },
  {
    id: "pinch-composite", label: "Pinch composite curves", status: "live",
    teaches: "Hot and cold composite curves: the pinch splits the problem and fixes Q_H,min / Q_C,min before any exchanger is drawn — the in-view cascade cross-checked against the engine's targets.",
    theory: "ch:pinch",
  },
  {
    id: "entu", label: "Heat exchanger (ε-NTU)", status: "live",
    teaches: "Effectiveness vs NTU at a capacity ratio: why counter-current wins and when extra area stops paying — the run's exchanger placed on its own curve.",
    theory: "ch:hx-entu",
  },
  {
    id: "pump-system", label: "Pump vs system curve", status: "live",
    teaches: "The operating point is an intersection: the pump model's rise falling with flow against the pipe system's demand rising with it — crossed where the engine's own columns cross.",
    theory: "ch:rotating",
  },
  {
    id: "merkel", label: "Cooling tower (Merkel)", status: "live",
    teaches: "Merkel's one diagram: saturated-air enthalpy above, the operating line below, and the shaded gap between them is the driving force the packing must buy.",
    theory: "ch:coolingTower",
  },
  {
    id: "rayleigh", label: "Batch still (Rayleigh)", status: "live",
    teaches: "The graphical Rayleigh integration: the area under 1/(y*−x) between the charge and the pot IS ln(W0/W) — drawn from the engine's own equilibrium curve, judged against the engine's rigorous still.",
    theory: "ch:rayleigh",
  },
  {
    id: "levenspiel", label: "Reactor sizing (Levenspiel)", status: "live",
    teaches: "One chart, two areas: the PFR's integral under 1/(−r) against the CSTR's rectangle at the outlet rate — why a CSTR needs more volume for the same conversion under positive-order kinetics.",
    theory: "ch:pfr",
  },
  {
    id: "vanheerden", label: "Ignition / extinction (Van Heerden)", status: "live",
    teaches: "Heat generated against heat removed: a straight line can cut a sigmoid three times, so the same reactor with the same feed has three steady states — and the middle one is the state no start-up procedure can hold.",
    theory: "ch:cstr",
  },
  {
    id: "drying", label: "Drying curve (batch tray)", status: "live",
    teaches: "The two classical drying plots: X against time, and the rate against moisture — where the critical moisture is VISIBLE as the corner at which a flat rate starts to fall toward the isotherm's equilibrium.",
    theory: "ch:drying",
  },
  {
    id: "breakthrough", label: "Adsorption breakthrough", status: "live",
    teaches: "The S-shaped breakthrough curve: the mass-transfer zone consumes bed capacity long before the bed saturates — the ideal square wave drawn at the engine's stoichiometric time.",
    theory: "ch:adsorption",
  },
  //  MOUNTED 2026-08-19.  This entry arrived deliberately `planned` with the
  //  mount written out below it, because the host's dispatch was a hand-written
  //  `tool === "…" ? <X/>` chain whose FALLBACK was the breakthrough tool:
  //  flipping the status before the mount landed would have published a page
  //  captioned Hunter-Nash drawing an adsorption breakthrough curve.  Both are
  //  now done — MethodsWorkspace lazy-imports TieTriangleTool and dispatches on
  //  the id — and the fallback itself REFUSES BY NAME, so the trap that made
  //  the caution necessary is closed for every tool after this one.
  {
    id: "hunter-nash", label: "Extraction (Hunter-Nash)", status: "live",
    teaches: "One point rules the whole column: the difference point Δ = F − E₁ = R_j − E_{j+1} lies on every operating line, so the triangle alternates tie-lines with lines through Δ — and the rigorous cascade's own stages are laid on it as the test.",
    theory: "sec:hunter-nash",
    fedBy: "ui/methods/TieTriangleTool.tsx over "
      + "case/hunterNash.ts.  Its engine feeds already exist and are verified — "
      + "propertyScanTernary `mode lle` (x1,x2,x3,region,kind,tieline_id) from "
      + "tutorials/props/scan/ternary03_lle_water_ethanol_benzene, and the "
      + "extractor's stage profile (xE_<comp>/xR_<comp>) plus its terminal-flow "
      + "KPIs from tutorials/steady/absorption/extract01_ethanol_water_benzene.  "
      + "What is missing is the host dispatch in MethodsWorkspace.tsx (see the "
      + "comment above this entry), not an engine output.",
  },
];

/** The workspace's own caption.  The URL key stays `methods` (deep-link
 *  contract); this is the word a student reads. */
export const EDUTOOLS_LABEL = "EduTools";

/** The one-paragraph blurb: what this plane is, and where the OTHER half of
 *  the material lives.  Rendered in the dropdown's footer. */
export const EDUTOOLS_BLURB =
  "Classical graphical methods, constructed over curves the engine computes — "
  + "the method's answer beside the engine's.  Property surfaces (T-x-y, γ, Psat) "
  + "live in Explore; the split criterion: method-construction → EduTools, "
  + "property-surface → Explore.";

/** The Theory Guide deep link for a tool's named destination.
 *
 *  BASE-AWARE.  Every other PDF link in the GUI already builds on
 *  `import.meta.env.BASE_URL` (helpMap.helpUrl, modelDocs, the Help menu);
 *  this one used to hardcode a leading "/", so under a deployed base (the
 *  landing serves the app at /app) it pointed outside the app and 404'd —
 *  which a browser answers by downloading or erroring, never by jumping to a
 *  section. */
export const theoryUrl = (dest: string): string =>
  guideUrl("theoryGuide", dest);

/** Boot tool from the URL: `?workspace=methods&tool=<id>` (the contract), or
 *  the legacy Explorer deep-link `?explore=mccabe` WITHOUT a `&key=` stash
 *  (with a key it is the analyzer pop-out tab, which AppShell routes first). */
export function bootTool(): MethodToolId {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search);
    if (q.get("explore") === "mccabe" && !q.has("key")) return "mccabe";
    const t = q.get("tool");
    if (METHOD_TOOLS.some((m) => m.id === t && m.status === "live"))
      return t as MethodToolId;
  }
  return "mccabe";
}

// ---- The selection (one home, two readers) ---------------------------------

let activeTool: MethodToolId = bootTool();
const listeners = new Set<() => void>();

export function getActiveMethodTool(): MethodToolId {
  return activeTool;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Select a tool.  Also writes the deep link back into the URL
 *  (history.replaceState — no history spam), so the address bar stays a
 *  shareable bookmark of what is on screen; bootTool() reads it back.  The
 *  legacy `?explore=mccabe` param is dropped on the way (it would otherwise
 *  out-vote `tool=` on the next boot). */
export function setActiveMethodTool(id: MethodToolId): void {
  activeTool = id;
  if (typeof window !== "undefined"
    && typeof window.history?.replaceState === "function") {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("workspace", "methods");
      url.searchParams.set("tool", id);
      url.searchParams.delete("explore");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch { /* opaque URL / blocked history — the selection alone is fine */ }
  }
  for (const fn of listeners) fn();
}

/** The active tool as React state, for any component that renders it (the
 *  workspace body and the top-bar dropdown's check mark). */
export function useActiveMethodTool(): MethodToolId {
  return useSyncExternalStore(subscribe, getActiveMethodTool, getActiveMethodTool);
}
