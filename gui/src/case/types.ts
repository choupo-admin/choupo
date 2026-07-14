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
  Typed in-memory representation of a case directory.  Each field stores
  the parsed JSON form (output of toJson on the dict AST) so React state
  can mutate it directly.  Re-serialisation goes JSON -> AST -> text.
\*---------------------------------------------------------------------------*/

import type { JsonDict } from "../dict/index.js";

export interface CaseFiles {
  // Either `flowsheet` (choupoSolve / Batch / Ctrl) or `propsDict`
  // (choupoProps) is present; the case loader picks based on which
  // file exists in the tutorial directory.  Both optional so a single
  // CaseFiles can carry either kind without forcing the other field.
  flowsheet?: JsonDict;
  propsDict?: JsonDict;
  thermoPackage: JsonDict;
  controlDict: JsonDict;
  reactions?: JsonDict;
  solverDict?: JsonDict;
  outerDict?: JsonDict;
  postDict?: JsonDict;
  // Raw passthrough files (relative paths under the case dir) for
  // case-local artefacts the solver needs but the GUI does not parse:
  //   constant/components/<name>.dat
  //   constant/binaryPairs/<pair>.dat
  //   constant/experiments/<file>.csv
  // and so on.  The keys are relative paths ("constant/components/agua.dat");
  // the values are the raw file bodies.  Written verbatim into MEMFS by
  // the WASM adapter / worker.
  extraFiles?: { [relPath: string]: string };
  // Every case file as its ORIGINAL raw text (relPath -> body), for the
  // read-only "Case" dict viewer.  Unlike the parsed JsonDict fields
  // above, this keeps the COMMENTS (which the dict parser discards) ---
  // the comments are part of the glass-box pedagogy.
  rawFiles?: { [relPath: string]: string };
}

export interface StreamSpec {
  F: number;
  T: number;
  P: number;
  composition: { [component: string]: number };
  /** Vapour fraction, when the state carries it (0/ files do) -- lets the
   *  pre-run canvas colour a feed by phase before a solve. */
  vf?: number;
}

/** Energy-wire producer port.  Declared on the producing unit.
 *  Publishes a scalar computed from the unit's operation values + KPIs
 *  via `expression`. */
export interface EnergyOutputSpec {
  name: string;
  kind: "work" | "heat";
  expression: string;
  unit?: string;
}

/** Energy-wire consumer port.  Declared on the consuming unit.
 *  Pulls a scalar from `<producer>.<port>` (`from`) into the consuming
 *  unit's `operation.<target>` BEFORE its solve(). */
export interface EnergyInputSpec {
  from: string;       // "<producer-unit>.<port-name>"
  kind: "work" | "heat";
  target: string;
}

export interface UnitSpec {
  name: string;
  type: string;
  /** Optional model variant, in the slot right after `type`
   *  (e.g. cyclone -> Muschelknautz, distillationColumn -> simultaneous). */
  model?: string;
  in: string | string[];
  outputs: string[];
  operation: JsonDict;
  reaction?: string;
  energyOutputs?: EnergyOutputSpec[];
  energyInputs?: EnergyInputSpec[];
  [extra: string]: unknown;
}

export interface FlowsheetView {
  streams: { [name: string]: StreamSpec };
  units: UnitSpec[];
  /** Set of stream names that are TEAR streams (internal recycle for a
   *  composite, or a flat-case tearStreams list).  Used by the layout
   *  pass to exclude tear edges from the longest-path layering: a tear
   *  must render as a back-edge, not pull its producer's downstream
   *  consumer one layer further to the right. */
  tearStreams?: Set<string>;
  /** For a COMPOSITE (parent of sectors): a renamed boundary outlet ->
   *  its child-qualified origin, e.g. "Stack" -> "DRYING/ExhaustClean".
   *  Only present when the parent's connections rename a child outlet
   *  (`from CHILD/X; to Y;` with Y != X).  Surfaced on the boundary
   *  terminal so the rename is VISIBLE, never silent (forum 2026-06-15). */
  origins?: { [displayName: string]: string };
}
