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
-------------------------------------------------------------------------------
Module
    streamCardState

Description
    WHICH state does a stream's Properties card show -- the run's, or the
    file's?

    Before the stream-state architecture, only feeds had authored values, so
    "the flowsheet's stream if there is one, else the run result" was the same
    thing as "the answer".  Then the completeness contract gave EVERY stream a
    file in 0/, and that rule silently inverted: a product's card started
    reading its choupo-init0 SEED.

    flash19, on the published site: the `vapor` card showed F 53000 mol/h with
    the FEED's composition -- its seed -- while the node two centimetres away
    showed the solved 2890 mol/h, and the same card carried `vf` from the run.
    Two states in one table, nothing saying which was which.

    The rule, as one testable function rather than a condition buried in a
    600-line component:

      * a stream the SOLVER computes shows the RUN -- that is the answer, and
        the 0/ file is a starting guess the solver has already overwritten;
      * an authored FEED shows its own values -- they are the input, they are
        what the scratch fields edit, and the run cannot disagree with them;
      * with no run at all, the file is all there is: show it, and say it is
        an estimate.
\*---------------------------------------------------------------------------*/

export type StreamCardSource = "run" | "authored" | "none";

export function streamCardSource(args: {
  /** the stream has values from the case files (0/ + flowsheetDict) */
  hasAuthored: boolean;
  /** the last run carries this stream */
  hasRun: boolean;
  /** it is a topology FEED whose 0/ state the case AUTHORED (as opposed to
   *  a seed choupo-init0 generated for a computed stream) */
  isAuthoredFeed: boolean;
}): StreamCardSource {
  const { hasAuthored, hasRun, isAuthoredFeed } = args;
  if (hasRun && !(hasAuthored && isAuthoredFeed)) return "run";
  if (hasAuthored) return "authored";
  return hasRun ? "run" : "none";
}
