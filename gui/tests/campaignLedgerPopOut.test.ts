// campaignLedgerPopOut -- the two ledgers as full tables in a separate tab.
//
// The HTML is built by a pure function so exactly this can be asserted with no
// DOM and no Blob: that a REFUSED record prints as a refusal.  A table is the
// easiest surface on which to lose that -- a blank cell, an em dash and a "0"
// all look tidy, and only one of them is what the engine said.
import { describe, expect, it } from "vitest";
import {
  campaignLedgerHtml, esc,
} from "../src/ui/campaignLedgerPopOut.js";
import type {
  EnergyRecord, TransferRecord,
} from "../src/adapters/SolverAdapter.js";

const C = {
  bg: "#fff", text: "#000", textStrong: "#000", dim: "#666", panel: "#eee",
  border: "#ccc", cell: "#ddd", red: "#c00", accent: "#0aa",
};

const priced: TransferRecord = {
  tStart: 100, tEnd: 100, from: "hot", to: "cold", kind: "discrete",
  dn: { ethanol: 0.0005 }, H_kJ: -136.599454691,
};
const refusedT: TransferRecord = {
  tStart: 1, tEnd: 600, from: "potA", to: "recA", kind: "continuous",
  dn: { benzene: 0.00058, compA: 3.5e-6 }, H_missing: ["compA"],
};
const pricedE: EnergyRecord = {
  tStart: 200, tEnd: 600, unit: "potA", kind: "reboiler", E_kJ: 20.785,
  T_service_K: 371.612, basis: "reboiler: first law over the pot",
};
const refusedE: EnergyRecord = {
  tStart: 0, tEnd: 200, unit: "potA", kind: "reboiler",
  T_service_K: 372.484, E_missing: ["no enthalpy datum for 'compA'"],
  basis: "still duty UNAVAILABLE: unpriceable segment",
};

describe("campaignLedgerHtml", () => {
  it("prints every field of both ledgers", () => {
    const h = campaignLedgerHtml([priced], [pricedE], C);
    expect(h).toContain("ethanol");
    expect(h).toContain("-136.599");
    expect(h).toContain("discrete");
    expect(h).toContain("reboiler");
    expect(h).toContain("20.785");
    expect(h).toContain("371.612");
    expect(h).toContain("first law over the pot");
  });

  //  THE LOAD-BEARING ONE.  A refused cell must carry the engine's reason and
  //  must NOT carry a number.  Goes red under `?? 0` in the reader.
  it("prints a refusal as a refusal, never as a number", () => {
    const h = campaignLedgerHtml([refusedT], [refusedE], C);
    expect(h).toContain("H unpriceable");
    expect(h).toContain("E unpriceable");
    expect(h).toContain("no enthalpy datum for &#39;compA&#39;");
    expect(h).toContain(`class="refused"`);
    //  a priced cell's markup must be absent for these rows
    expect(h).not.toMatch(/<td class="num">-?\d+\.\d+<\/td>\s*<td class="num">371/);
  });

  //  PRECISELY WHERE the number would have gone.  A blunt "no zero anywhere"
  //  assertion is useless here -- `tStart: 0` is a legitimate zero in a time
  //  column -- so this checks the VALUE CELL's own position: the cell that
  //  follows the `kind` span is the priced-number cell, and on a refused
  //  record it must not exist.
  const VALUE_CELL_AFTER_KIND = /class="kind">reboiler<\/span><\/td>\s*<td class="num">/;
  it("the value cell itself is absent on a refused record", () => {
    expect(campaignLedgerHtml([], [pricedE], C))
      .toMatch(VALUE_CELL_AFTER_KIND);
    expect(campaignLedgerHtml([], [refusedE], C))
      .not.toMatch(VALUE_CELL_AFTER_KIND);
  });

  //  The scale is DECLARED here too, so the table and the plot agree about
  //  what "full height" meant.
  it("declares the energy scale, and names its absence", () => {
    expect(campaignLedgerHtml([], [pricedE], C))
      .toContain("largest |E| in this run: 20.785 kJ");
    expect(campaignLedgerHtml([], [refusedE], C))
      .toContain("no energy scale — all refused");
  });

  //  An absent ledger is SAID.  An empty table would read as "nothing
  //  happened"; "no segment was ledgered" is the fact.
  it("says an absent energy ledger is not the same as no heat", () => {
    const h = campaignLedgerHtml([priced], undefined, C);
    expect(h).toContain("published no energy ledger");
    expect(h).toContain("not the same as");
  });

  it("says an absent material ledger", () => {
    expect(campaignLedgerHtml(undefined, [pricedE], C))
      .toContain("published no material ledger");
  });

  it("flags an instantaneous record rather than implying an interval", () => {
    const h = campaignLedgerHtml([], [{ ...pricedE, tStart: 200, tEnd: 200 }],
                                 C);
    expect(h).toContain("instant");
  });

  it("escapes what the engine wrote -- a basis is free text", () => {
    const h = campaignLedgerHtml([], [{ ...pricedE,
      basis: "Q = dH <b>& more</b>" }], C);
    expect(h).toContain("Q = dH &lt;b&gt;&amp; more&lt;/b&gt;");
    expect(h).not.toContain("<b>& more</b>");
  });

  it("esc handles every character it claims to", () => {
    expect(esc(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });
});
