/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * How much of a case description the flowsheet header shows.
 *
 * The real witness is the flagship: its description is the one Vítor was
 * looking at when he said the header takes too much room.
 */
import { describe, it, expect } from "vitest";
import { caseDescription, LEAD_MAX_CHARS } from "../src/case/caseDescription";

//  The OPENING of tutorials/plant/greenAmmoniaIndustrialN2's description,
//  copied verbatim and cut at its first full stop; the real one continues
//  (SRK vapour, the Henry constants, the purification package).  Ninety
//  words before that first stop, which is why a sentence split alone would
//  not have folded it -- and the real description is LONGER still, so this
//  fixture is the easy case, not the worst one.
const FLAGSHIP =
  "Green ammonia, 500 t/day (Sines), with INDUSTRIAL-GRADE nitrogen (99.5 %"
  + " N2 / 0.40 % O2 / 0.10 % Ar), laid out in three sectors: PURIFICATION"
  + " (nitrogen booster, 3:1 mixing, Pd deoxo, chilling to 279 K, knock-out"
  + " drum, 4A molecular-sieve dryer and the synthesis compressor), LOOP"
  + " (Haber-Bosch loop with feed/effluent exchanger, adiabatic converter,"
  + " cooling, cold separation at 250 K, purge and recycle) and PRODUCT"
  + " (let-down to 20 bar).";

describe("the flagship, which is the case that prompted this", () => {
  const d = caseDescription(FLAGSHIP)!;

  it("folds: the lead is one line and the rest is offered", () => {
    expect(d.hasMore).toBe(true);
    expect(d.lead.length).toBeLessThanOrEqual(LEAD_MAX_CHARS + 1); // +1 for the ellipsis
    expect(d.full).toBe(FLAGSHIP);
  });

  it("the lead is not cut mid-word", () => {
    const shown = d.lead.replace(/…$/, "");
    expect(FLAGSHIP.startsWith(shown)).toBe(true);
    //  the character right after what we show is a boundary, not a letter
    const next = FLAGSHIP.charAt(shown.length);
    expect(next === "" || /\s/.test(next)).toBe(true);
  });

  it("the cut is MARKED -- a silent truncation tells the reader nothing", () => {
    expect(d.lead.endsWith("…")).toBe(true);
  });
});

describe("a description short enough to be its own lead is left alone", () => {
  it("shows the whole thing and offers nothing", () => {
    const d = caseDescription("Benzene-toluene flash at 1 atm.")!;
    expect(d.lead).toBe("Benzene-toluene flash at 1 atm.");
    expect(d.hasMore).toBe(false);
  });

  it("leads with the FIRST SENTENCE when there is a short one", () => {
    const d = caseDescription(
      "A single equilibrium stage. The feed is an equimolar mixture and the"
      + " lesson is that one stage cannot cross an azeotrope.",
    )!;
    expect(d.lead).toBe("A single equilibrium stage.");
    expect(d.hasMore).toBe(true);
    //  and the popover still holds all of it
    expect(d.full).toContain("azeotrope");
  });
});

describe("what it refuses to invent", () => {
  it("nothing to show is null, so the header is not drawn at all", () => {
    expect(caseDescription(undefined)).toBeNull();
    expect(caseDescription("")).toBeNull();
    expect(caseDescription("   \n  ")).toBeNull();
    expect(caseDescription(42)).toBeNull();
    expect(caseDescription({ description: "no" })).toBeNull();
  });

  it("collapses the dict's own line breaks -- a header is one line", () => {
    const d = caseDescription("Two  spaces\nand a break.")!;
    expect(d.full).toBe("Two spaces and a break.");
    expect(d.full).not.toContain("\n");
  });

  it("a decimal point does not end a sentence", () => {
    const d = caseDescription("Operates at 1.5 bar and 350 K throughout.")!;
    expect(d.lead).toBe("Operates at 1.5 bar and 350 K throughout.");
    expect(d.hasMore).toBe(false);
  });

  it("a first sentence LONGER than the budget does not become the lead", () => {
    const long = "A".repeat(LEAD_MAX_CHARS + 40) + ". Then more.";
    const d = caseDescription(long)!;
    expect(d.lead.length).toBeLessThanOrEqual(LEAD_MAX_CHARS + 1);
    expect(d.hasMore).toBe(true);
  });

  it("the cut lands on a word boundary even when the budget does not", () => {
    //  THIS TEST EXISTS BECAUSE A SABOTAGE SURVIVED.  Disarming the
    //  word-boundary search left all eleven other assertions green: on the
    //  flagship, the hard cut at LEAD_MAX_CHARS happens to land on a space,
    //  so the guard was never exercised by the only fixture that reached it.
    //  A guard whose one case satisfies it is a guard nothing tests.
    //  Here the budget deliberately falls INSIDE the second word.
    const head = "A".repeat(100);
    const d = caseDescription(head + " " + "B".repeat(60))!;
    const shown = d.lead.replace(/…$/, "");
    expect(shown).toBe(head);            // cut back to the boundary
    expect(shown).not.toContain("B");    // never mid-word
  });

  it("one unbroken word longer than the budget still yields a lead", () => {
    //  No space to fall back on: cutting hard beats showing nothing.
    const d = caseDescription("x".repeat(LEAD_MAX_CHARS + 50))!;
    expect(d.lead.length).toBeGreaterThan(0);
    expect(d.hasMore).toBe(true);
  });
});

describe("the invariant the header depends on", () => {
  it("hasMore is exactly 'the lead is not the whole thing'", () => {
    for (const t of [FLAGSHIP, "Short.", "A".repeat(200), "One. Two. Three."]) {
      const d = caseDescription(t)!;
      expect(d.hasMore).toBe(d.lead !== d.full);
    }
  });
});
