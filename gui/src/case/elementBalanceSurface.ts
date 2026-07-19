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
  elementBalanceSurface -- the PURE parser of the steady elementBalance
  artefacts (reports/balances/elementBalance.csv + .meta).  NO atom/formula
  computation in TypeScript: the rows and the FULL/PARTIAL/UNAVAILABLE
  status are the engine's own; the metadata is sovereign.
\*---------------------------------------------------------------------------*/

export interface ElementBalanceRow {
  element: string;
  inKmolAtomH: number;
  outKmolAtomH: number;
  closurePct: number;
}

export interface ElementBalanceSurface {
  present: boolean;
  status: "FULL" | "PARTIAL" | "UNAVAILABLE";
  /** A malformed artefact (bad numeric row, bad header, non-finite partial
   *  fraction) WITHDRAWS the claim with this named reason -- the same
   *  contract as the ctrl trajectory parser; never a silent skip. */
  malformedReason?: string;
  /** qualified-key detail rows from the .meta sidecar */
  refused: { species: string; reason: string }[];
  partial: { species: string; unaccounted: number }[];
  missingStreams: string[];
  rows: ElementBalanceRow[];
}

/** The GLOBAL ATOMIC view of an element-balance surface: total kmol-atom/h
 *  in and out, sealed ONLY when EVERY element closes (a signed total can
 *  cancel a +C error against a -O error, so the per-element detail decides
 *  the seal; the compact indicator is the worst per-element deviation). */
export interface AtomicBalanceView {
  totalInKmolAtomH: number;
  totalOutKmolAtomH: number;
  residualKmolAtomH: number;
  /** worst per-element |closure - 100| in percent */
  worstElementOffPct: number;
  /** EVERY element within tolerance -- never the signed total alone */
  allElementsClose: boolean;
}

export function atomicBalanceView(
  surface: ElementBalanceSurface,
  tolPct = 0.01,
): AtomicBalanceView {
  let tin = 0, tout = 0, worst = 0;
  for (const r of surface.rows) {
    tin += r.inKmolAtomH;
    tout += r.outKmolAtomH;
    worst = Math.max(worst, Math.abs(r.closurePct - 100.0));
  }
  return {
    totalInKmolAtomH: tin,
    totalOutKmolAtomH: tout,
    residualKmolAtomH: tout - tin,
    worstElementOffPct: worst,
    allElementsClose: surface.rows.length > 0 && worst <= tolPct,
  };
}

export function elementBalanceSurface(
  csv: string | undefined,
  meta: string | undefined,
): ElementBalanceSurface {
  const out: ElementBalanceSurface = {
    present: false, status: "UNAVAILABLE",
    refused: [], partial: [], missingStreams: [], rows: [],
  };
  if (!csv && !meta) return out;
  out.present = true;

  if (meta) {
    for (const line of meta.split("\n")) {
      const comma = line.indexOf(",");
      if (comma < 0) continue;
      const key = line.slice(0, comma).trim();
      const val = line.slice(comma + 1).trim()
        .replace(/^"|"$/g, "").replace(/""/g, '"');
      if (key === "status"
          && (val === "FULL" || val === "PARTIAL" || val === "UNAVAILABLE"))
        out.status = val;
      else if (key.startsWith("refusedSpecies."))
        out.refused.push({ species: key.slice(15), reason: val });
      else if (key.startsWith("partialSpecies.")) {
        const un = Number(val);
        if (!Number.isFinite(un) || un < 0) {
          out.status = "UNAVAILABLE";
          out.malformedReason = `malformed sidecar (partialSpecies.`
            + `${key.slice(15)} = ${val})`;
          out.rows = [];
          return out;
        }
        out.partial.push({ species: key.slice(15), unaccounted: un });
      }
      else if (key.startsWith("missingStream."))
        out.missingStreams.push(key.slice(14));
    }
  }

  // Metadata sovereignty: rows are drawn only when the engine's status
  // allows them (FULL/PARTIAL); an UNAVAILABLE table stays undrawn even if
  // a stale CSV carries rows.
  if (csv && out.status !== "UNAVAILABLE") {
    const lines = csv.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length >= 1) {
      const header = lines[0]!.split(",");
      const iE = header.indexOf("element");
      const iIn = header.indexOf("in_kmol_atom_h");
      const iOut = header.indexOf("out_kmol_atom_h");
      const iC = header.indexOf("closure_pct");
      if (iE < 0 || iIn < 0 || iOut < 0 || iC < 0) {
        // A table without the canonical header is MALFORMED with a reason,
        // never a silent not-drawn.
        out.status = "UNAVAILABLE";
        out.malformedReason =
          "malformed elementBalance.csv (missing canonical header)";
        return out;
      }
      for (let li = 1; li < lines.length; ++li) {
        const c = lines[li]!.split(",");
        const inV = Number(c[iIn]);
        const outV = Number(c[iOut]);
        const cl = Number(c[iC]);
        if (!Number.isFinite(inV) || !Number.isFinite(outV)
            || !Number.isFinite(cl)) {
          // A malformed numeric row WITHDRAWS the claim -- a FULL badge
          // over silently-skipped rows is exactly the lie this surface
          // exists to prevent.
          out.status = "UNAVAILABLE";
          out.malformedReason =
            `malformed elementBalance.csv (row ${li + 1})`;
          out.rows = [];
          return out;
        }
        out.rows.push({ element: c[iE]!, inKmolAtomH: inV,
                        outKmolAtomH: outV, closurePct: cl });
      }
    }
  }
  return out;
}
