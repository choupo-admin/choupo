/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  annualBasis -- the sentence under the Reports utilities table (DEV.md 4c
  C264).  It used to multiply the hourly total by 8000 h of the GUI's own --
  on a batch plant whose economics runs 168 equivalent hours, a figure 48
  times the engine's.  It now says the economics' utility bill C_UT and the
  hours the economics used, and where those hours came from; with no
  economics pass there is no annual basis, and it says that instead.  Every
  number is the engine's (`economics.utilityBill`, `operatingHours`,
  `operatingHoursFrom`); this file only words them.
\*---------------------------------------------------------------------------*/

import type { Economics } from "../adapters/SolverAdapter.js";

export function annualUtilitiesLine(economics: Economics | undefined): string {
  if (!economics || economics.operatingHours === undefined) {
    return "No annual figure: the case runs no economics, and the hours a year are an"
      + " economics input (its stream factor, or a batch plan's equivalent hours).";
  }
  const H = economics.operatingHours;
  const from = economics.operatingHoursFrom === "batchPlan"
    ? "the batch plan's equivalent flowsheet hours, H_eq = Q / r_P (streamFactor fromBatchPlan)"
    : economics.operatingHoursFrom === "declared"
      ? "the stream factor declared in constant/economics x 8760 h"
      : "the economics' stated default stream factor 0.90 x 8760 h";
  const bill = economics.utilityBill;
  const cur = economics.currency === "EUR" ? "€" : economics.currency;
  return (bill !== undefined
    ? `C_UT = ${Math.round(bill).toLocaleString("en-US")} ${cur}/yr, the economics' utility bill, `
    : "The economics' utility bill is not published; ")
    + `on H = ${H.toFixed(H < 1000 ? 2 : 0)} h/yr: ${from}.`;
}
