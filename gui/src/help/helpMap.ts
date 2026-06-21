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

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  Context-sensitive help map.  F1 resolves the current Choupo context (the
  selected unit's type, else the active workspace) to a guide + a PDF named
  destination, and opens the guide AT that section.

  The anchors below are REAL `\label{...}` destinations in the LaTeX guides
  (the preamble sets `destlabel=true`, so each `\label{ch:x}` becomes a PDF
  named destination reachable via `theoryGuide.pdf#nameddest=ch:x`).  Only
  labels that actually exist in the .tex are used here -- where a context has
  no dedicated section, it maps to the CLOSEST real chapter and a comment says
  so.  Do NOT add an anchor that the .tex does not define.
\*---------------------------------------------------------------------------*/

export type GuideKey = "theory" | "user" | "props" | "developer";

export interface HelpTarget {
  guide: GuideKey;
  /** A PDF named destination (`\label` name).  Omitted => open at the top. */
  anchor?: string;
}

/** Unit-op `type` (the schema name) -> the guide section that derives it.
 *  Every anchor here is a verified `\label{ch:...}` in docs/theoryGuide.tex. */
export const UNIT_HELP: Record<string, HelpTarget> = {
  // Flash / phase equilibrium
  adiabaticFlash: { guide: "theory", anchor: "ch:flash" },
  isothermalFlash: { guide: "theory", anchor: "ch:flash" },
  bubbleT: { guide: "theory", anchor: "ch:bubble-dew-ref" },
  dewT: { guide: "theory", anchor: "ch:bubble-dew-ref" },
  // Distillation / separation columns
  distillationColumn: { guide: "theory", anchor: "ch:distillation" },
  shortcutColumn: { guide: "theory", anchor: "ch:distillation" },
  absorber: { guide: "theory", anchor: "ch:absorber" },
  stripper: { guide: "theory", anchor: "ch:absorber" }, // shares the absorber chapter
  extractor: { guide: "theory", anchor: "ch:extractor" },
  // Reactors -> the gas-phase kinetics chapter (rates) + the reactor model
  cstr: { guide: "theory", anchor: "ch:cstr" },
  pfr: { guide: "theory", anchor: "ch:pfr" },
  gibbsReactor: { guide: "theory", anchor: "ch:gibbs-reactor" },
  // Crystallisation
  crystalliser: { guide: "theory", anchor: "ch:crystalliser" },
  // Heat
  heater: { guide: "theory", anchor: "ch:heat" },
  heatExchanger: { guide: "theory", anchor: "ch:hx-entu" },
  evaporator: { guide: "theory", anchor: "ch:evap-mode2" },
  // Rotating equipment
  compressor: { guide: "theory", anchor: "ch:rotating" },
  turbine: { guide: "theory", anchor: "ch:rotating" },
  pump: { guide: "theory", anchor: "ch:rotating" },
  // Drying
  solidDryer: { guide: "theory", anchor: "ch:drying" },
  sprayDryer: { guide: "theory", anchor: "ch:drying" },
  // Solids separation
  cyclone: { guide: "theory", anchor: "ch:solids-sep" },
  bagFilter: { guide: "theory", anchor: "ch:solids-sep" },
  gasSolidSplitter: { guide: "theory", anchor: "ch:solids-sep" },
  // Simple ops (no dedicated section each -> the simple-ops chapter)
  mixer: { guide: "theory", anchor: "ch:simple-ops" },
  splitter: { guide: "theory", anchor: "ch:simple-ops" },
  // Property ops -> criticals / property chapters (no per-op section)
  propertyPoint: { guide: "theory", anchor: "ch:criticals" },
  propertyScan1D: { guide: "theory", anchor: "ch:criticals" },
  propertyScan2D: { guide: "theory", anchor: "ch:criticals" },
  fitParameters: { guide: "props", anchor: "ch:pairs" },
};

/** Active workspace -> the guide section that explains it. */
export const WORKSPACE_HELP: Record<string, HelpTarget> = {
  explore: { guide: "theory", anchor: "ch:criticals" }, // property exploration
  props: { guide: "props", anchor: "ch:consistency-props" },
  pinch: { guide: "theory", anchor: "ch:heat" }, // no ch:pinch -> heat chapter
  streams: { guide: "theory", anchor: "ch:stream-as-state" },
  variables: { guide: "user", anchor: "sec:outer" }, // outer drivers / sweep
  plots: { guide: "user", anchor: "sec:gui" }, // no dedicated section -> GUI chapter
  log: { guide: "user", anchor: "sec:troubleshoot" },
  case: { guide: "user", anchor: "sec:gui" },
  reports: { guide: "user", anchor: "sec:post" },
};

/** When nothing more specific applies. */
export const DEFAULT_HELP: HelpTarget = { guide: "user", anchor: "sec:gui" };

const GUIDE_FILE: Record<GuideKey, string> = {
  theory: "theoryGuide.pdf",
  user: "userGuide.pdf",
  props: "propsGuide.pdf",
  developer: "developerGuide.pdf",
};

/** The browser URL that opens a guide at its section (PDF named destination). */
export function helpUrl(target: HelpTarget, baseUrl: string): string {
  const file = GUIDE_FILE[target.guide];
  const dest = target.anchor ? `#nameddest=${target.anchor}` : "";
  return `${baseUrl}docs/${file}${dest}`;
}

/** Resolve the current context to a help target.
 *  Priority: a selected unit's type, then the active workspace, then default. */
export function resolveHelp(args: {
  selectedUnitType?: string | null;
  activeWorkspace?: string | null;
}): HelpTarget {
  if (args.selectedUnitType && UNIT_HELP[args.selectedUnitType]) {
    return UNIT_HELP[args.selectedUnitType]!;
  }
  if (args.activeWorkspace && WORKSPACE_HELP[args.activeWorkspace]) {
    return WORKSPACE_HELP[args.activeWorkspace]!;
  }
  return DEFAULT_HELP;
}
