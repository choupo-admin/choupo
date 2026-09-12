// The IF97 steam lens remembers ONE property pick across a mode switch, and the
// two modes offer DIFFERENT sets: `psat` exists only on the saturation table,
// `cp` only on the isobar.  So the remembered pick can name a view the active
// mode does not have, and WHICH VIEW IS IN FORCE must have one home — it had
// two (the toolbar fell back to "h", the plot did not) and they disagreed:
// shapeSteamCsv took its unknown-view arm and handed the WHOLE raw isobar table
// to the generic scan renderer, which draws `region` as a curve and labels
// v/h/s/cp in MOLAR units over IF97's mass-basis numbers — while the toolbar on
// screen still read "h".
//
// Both CSV fixtures are verbatim engine output: choupoProps `steamTables`,
// saturation { from 300; to 600; n 8; } and isobar { P 1e5; ... }, first rows.

import { describe, expect, it } from "vitest";

import {
  STEAM_ISO_VIEWS, STEAM_SAT_VIEWS, shapeSteamCsv, steamViewKey,
} from "../src/ui/plotting/steamViews.js";

const SAT = [
  "T,psat,v_f,v_g,h_f,h_g,s_f,s_g,h_fg",
  "3.000000000e+02,3.536589413e+03,1.003497930e-03,3.908205832e+01,1.125749908e+05,2.549893008e+06,3.931236015e+02,8.517536685e+03,2.437318017e+06",
  "3.428571429e+02,3.080755682e+04,1.022583467e-03,5.099981080e+00,2.917910837e+05,2.625598054e+06,9.514170181e+02,7.758335339e+03,2.333806970e+06",
].join("\n");

const ISO = [
  "T,region,v,h,s,cp",
  "3.000000000e+02,1,1.003454409e-03,1.126638233e+05,3.930970473e+02,4.181101062e+03",
  "3.428571429e+02,1,1.022551632e-03,2.918477101e+05,9.513758128e+02,4.187912039e+03",
].join("\n");

const header = (csv: string) => csv.split("\n")[0]!.split(",");

describe("steamViews — one home for which property view is in force", () => {
  it("the two modes really do offer different sets (that is the whole trap)", () => {
    expect(Object.keys(STEAM_SAT_VIEWS)).toContain("psat");
    expect(Object.keys(STEAM_ISO_VIEWS)).not.toContain("psat");
    expect(Object.keys(STEAM_ISO_VIEWS)).toContain("cp");
    expect(Object.keys(STEAM_SAT_VIEWS)).not.toContain("cp");
    // both carry the fallback
    expect(STEAM_SAT_VIEWS["h"]).toBeDefined();
    expect(STEAM_ISO_VIEWS["h"]).toBeDefined();
  });

  it("a pick the mode does not offer resolves to the default, both ways", () => {
    expect(steamViewKey("isobar", "psat")).toBe("h");
    expect(steamViewKey("saturation", "cp")).toBe("h");
    expect(steamViewKey("isobar", "cp")).toBe("cp");
    expect(steamViewKey("saturation", "psat")).toBe("psat");
  });

  it("a stale pick no longer leaks the RAW table into the plot", () => {
    // the defect: shapeSteamCsv(ISO, "isobar", "psat") returned ISO unchanged,
    // so `region` was drawn and h/s/v/cp were labelled with MOLAR units.
    const shaped = shapeSteamCsv(ISO, "isobar", "psat");
    expect(header(shaped)).toEqual(["T", "hmass"]);
    expect(header(shaped)).not.toContain("region");
    expect(header(shaped)).not.toContain("h");     // the bare token maps to J/mol
  });

  it("the mirror case: a saturation table asked for `cp`", () => {
    const shaped = shapeSteamCsv(SAT, "saturation", "cp");
    expect(header(shaped)).toEqual(["T", "hf", "hg", "hfg"]);
  });

  it("every kept column is renamed away from a MOLAR token", () => {
    const molarTokens = ["h", "s", "v", "cp"];
    for (const [mode, views] of [
      ["saturation", STEAM_SAT_VIEWS], ["isobar", STEAM_ISO_VIEWS],
    ] as const)
      for (const key of Object.keys(views)) {
        const csv = mode === "saturation" ? SAT : ISO;
        for (const h of header(shapeSteamCsv(csv, mode, key)).slice(1))
          expect(molarTokens).not.toContain(h.toLowerCase());
      }
  });

  it("a valid pick still selects exactly its own columns (nothing moved)", () => {
    expect(header(shapeSteamCsv(SAT, "saturation", "h"))).toEqual(["T", "hf", "hg", "hfg"]);
    expect(header(shapeSteamCsv(SAT, "saturation", "v"))).toEqual(["T", "vf", "vg"]);
    expect(header(shapeSteamCsv(SAT, "saturation", "psat"))).toEqual(["T", "psat"]);
    expect(header(shapeSteamCsv(ISO, "isobar", "cp"))).toEqual(["T", "cpmass"]);
    // and the values ride along untouched
    expect(shapeSteamCsv(ISO, "isobar", "v").split("\n")[1])
      .toBe("3.000000000e+02,1.003454409e-03");
  });
});
