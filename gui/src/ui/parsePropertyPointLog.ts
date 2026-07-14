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
  parsePropertyPointLog
  =====================

  Extract per-operation results from the choupoProps stdout for cases
  whose operations are `propertyPoint`.  The binary emits a structured
  textual block per operation, e.g.:

      >>>  Operation [0]:  N2_298K_1bar   (type = propertyPoint)

      ==========================  PropertyPoint  ==========================
        State:           T = 298.15 K   ( 25.00 degC )
                         P = 1.00 bar   ( 100000.00 Pa )
        Composition (mole frac):
          N2                1.000000

        Ideal-gas MIXTURE:
          H_ig         = 0.000000e+00  J/mol
          S_ig         = 191.6100  J/(mol*K)
          Cp_ig        = 29.1769  J/(mol*K)
          gamma=Cp/Cv  = 1.3985

        EoS = idealGas  (vapour root):
          Z            = 1.000000
          v_molar      = 2.47896e-02  m3/mol
          H_residual   = 0.00000e+00  J/mol
          S_residual   = 0.0000  J/(mol*K)
          H_real       = 0.000000e+00  J/mol
          S_real       = 191.6100  J/(mol*K)
      =====================================================================

  Only `propertyPoint` operations are extracted; other operation types
  produce CSVs that the Plotly canvas handles, so they are ignored here.
\*---------------------------------------------------------------------------*/

export interface PointResult {
  name: string;
  T_K: number;
  P_bar: number;
  composition: string;       // e.g. "N2" or "N2:0.79 O2:0.21"
  H_ig?: number;             // J/mol
  S_ig?: number;             // J/(mol*K)
  Cp_ig?: number;            // J/(mol*K)
  gamma?: number;            // Cp/Cv
  Z?: number;                // compressibility (real EoS)
  S_real?: number;           // J/(mol*K)
}

/** Optional reference values declared in the propsDict per operation, e.g.
 *
 *      reference
 *      {
 *          source  "Sandler 4th ed.";
 *          Z       0.77;
 *          tol     0.02;
 *      }
 *
 *  `tol` is a relative tolerance (Δ relative); the cell is flagged green
 *  if |calc - ref|/|ref| <= tol, red otherwise.  Defaults to 0.02 (2%). */
export interface PointReference {
  source?: string;
  tol: number;               // relative tolerance, default 0.02
  values: Record<string, number>;   // e.g. { Z: 0.77, S_ig: 191.61 }
}

/** Extract reference{} blocks from a parsed propsDict, keyed by
 *  operation name.  Skips operations without a `reference` sub-block. */
export function parsePropertyPointReferences(
  propsDict: Record<string, unknown> | null | undefined,
): Map<string, PointReference> {
  const out = new Map<string, PointReference>();
  if (!propsDict) return out;
  const ops = (propsDict["operations"] ?? []) as Array<Record<string, unknown>>;
  for (let k = 0; k < ops.length; ++k) {
    const op = ops[k]!;
    const ref = op["reference"] as Record<string, unknown> | undefined;
    if (!ref || typeof ref !== "object") continue;
    const name = typeof op["name"] === "string"
      ? (op["name"] as string)
      : `${(op["type"] as string) ?? "op"}_${k}`;
    const values: Record<string, number> = {};
    let tol = 0.02;
    let source: string | undefined;
    for (const [key, val] of Object.entries(ref)) {
      if (key === "source" && typeof val === "string") source = val;
      else if (key === "tol" && typeof val === "number") tol = val;
      else if (typeof val === "number") values[key] = val;
    }
    out.set(name, { source, tol, values });
  }
  return out;
}

