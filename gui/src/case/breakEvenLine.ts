/*---------------------------------------------------------------------------*\
  The sentence the economics summary prints for one price break-even
  (`economics { breakEven { price ( <stream> ... ); } }`).  Every number is the
  engine's (`economics.breakEvenPrices`); this file only words them.
\*---------------------------------------------------------------------------*/

import type { EconomicBreakEvenPrice } from "../adapters/SolverAdapter.js";

export function breakEvenPriceLine(currency: string, b: EconomicBreakEvenPrice): string {
  const declared = Number.isFinite(b.declared)
    ? ` (declared ${b.declared.toPrecision(4)})` : "";
  const what = b.role === "product"
    ? "the minimum selling price"
    : "the highest purchase price the plant can bear";
  return `NPV = 0 at ${b.breakEven.toPrecision(4)} ${currency}/kg of ${b.stream}`
    + `${declared} -- ${what}, every other price held.`;
}
