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
 * defaultPlot -- the plot the Plots workspace lands on after a run, chosen in
 * ONE place (rehearsal 2026-11-13: a column opened on a two-bar element
 * balance while its stage profile sat two clicks away).
 *
 * THE RULE, first match wins:
 *   1. the case declares `views` (postDict)          -> its own views
 *   2. a campaign ledger                             -> campaign balance
 *   3. a dynamic balance trajectory                  -> dynamic balance
 *   4. a time trajectory                             -> trajectory
 *   5. a unit published a PROFILE                    -> profile   (was 7th: a
 *      column's profile now wins over the global element balance bars)
 *   6. an element balance                            -> element balance
 *   7. a T-x-y envelope                              -> T-x-y
 *   8. a sweep / scan CSV                            -> sweep / scan
 *   9. a convergence trace                           -> convergence
 *  10. otherwise                                     -> mass balance
 * The balances live in the Streams summary band; they land here only when
 * nothing about a unit's inside was published.  The one-shot `scanCsv` hint
 * of the focus-tab playground is the caller's (it wins before this).
 */

import type { RunResult } from "../adapters/SolverAdapter.js";
import { declaredViewsOf } from "./postProcessing.js";

export type DefaultPlotKey =
  | "views" | "campaignBalance" | "dynamicBalance" | "trajectory" | "profile"
  | "elementBalance" | "txy" | "scanCsv" | "convergence" | "massBalance";

export function defaultPlotKey(
  result: RunResult, scanCsvs: readonly string[],
): DefaultPlotKey {
  if (declaredViewsOf(result.postProcessing).length > 0) return "views";
  if (result.kpis?.["campaign"]) return "campaignBalance";
  if (result.csvFiles?.["balanceTrajectory.csv"] !== undefined
      || result.csvFiles?.["balanceTrajectory.meta"] !== undefined) return "dynamicBalance";
  if (result.trajectory) return "trajectory";
  if ((result.profiles?.length ?? 0) > 0) return "profile";
  if (Object.keys(result.csvFiles ?? {}).some(
        (k) => k.endsWith("elementBalance.csv") || k.endsWith("elementBalance.meta")))
    return "elementBalance";
  if (result.txy) return "txy";
  if (scanCsvs.length > 0) return "scanCsv";
  if (result.convergence.length > 0) return "convergence";
  return "massBalance";
}
