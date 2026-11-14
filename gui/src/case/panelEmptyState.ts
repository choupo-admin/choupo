/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * panelEmptyState -- what the Panel workspace says when it has nothing to draw
 * (rehearsal 2026-11-13: a browser run on an engine older than the panel slice
 * "converged" and the tab still said "Run it").  A pure function of what the
 * run published, so the three sentences have one home and a test.
 *
 *   noPanelDeclared  the case has no system/panelDict.
 *   notRun           the case declares a panel and has not been run (or the
 *                    last run failed): run it.
 *   engineNoPanel    the case declares a panel, a run FINISHED, and the result
 *                    carries no `panel` block: the engine that ran it
 *                    predates the panel slice (or did not read the dict).
 *                    Running again changes nothing; the engine has to be
 *                    updated, so the sentence says that and not "Run it".
 *   noTrajectory     a panel block without the run's written instants.
 */

export type PanelEmptyKind = "noPanelDeclared" | "notRun" | "engineNoPanel" | "noTrajectory";

export interface PanelEmptyState {
  kind: PanelEmptyKind;
  text: string;
}

export function panelEmptyState(
  declared: boolean,
  run: { status?: string; panel?: unknown; trajectory?: unknown } | null | undefined,
): PanelEmptyState {
  if (!declared) {
    return {
      kind: "noPanelDeclared",
      text: "This case declares no panel.  The panel is declared in system/panelDict and read by the engine after a time-integrated run; the Panel guide says what to write.",
    };
  }
  if (!run || run.status !== "done") {
    return {
      kind: "notRun",
      text: "This case declares a panel (system/panelDict).  Run it: the panel draws what the engine reports about the run.",
    };
  }
  if (!run.panel) {
    return {
      kind: "engineNoPanel",
      text: "This case declares a panel (system/panelDict), but the engine that ran it published no panel block: it predates the operator panel (or did not read the dict).  Running again will not change that; update the engine and run again.",
    };
  }
  return {
    kind: "noTrajectory",
    text: "The engine published the panel's facts but no trajectory of the run, so the panel has no instants to draw.",
  };
}
