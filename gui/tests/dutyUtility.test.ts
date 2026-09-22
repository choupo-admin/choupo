/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * What the duty stub says about who serves a duty.
 *
 * The real witness is the flagship's N2Cooler, whose card read
 * `DUTY (carried: its own process streams (heatExchanger))` -- a sentence in
 * a slot sized for `steamLP`, which is what Vítor was looking at.
 */
import { describe, it, expect } from "vitest";
import { dutyUtilityLabel } from "../src/case/dutyUtility";

//  Verbatim from the engine (UtilityAllocationReport.cpp builds it as
//  "(carried: " + carriedBy + ")").
const CARRIED_PROSE = "(carried: its own process streams (heatExchanger))";

describe("the card Vítor was looking at", () => {
  const d = dutyUtilityLabel(
    { utility: CARRIED_PROSE, allocated: false, carried: true })!;

  it("says ONE WORD", () => {
    expect(d.word).toBe("carried");
    expect(d.word).not.toContain("(");
    expect(d.word.split(" ").length).toBe(1);
  });

  it("keeps the whole sentence, for the tooltip", () => {
    expect(d.detail).toBe(CARRIED_PROSE);
  });

  it("decides from the TYPED flag, never by reading the prose", () => {
    //  Same typed facts, prose reworded: the word must not move.  Parsing
    //  "(carried:" off a string would be a second home for a fact the engine
    //  already states, and it would break the day the sentence changes.
    const r = dutyUtilityLabel(
      { utility: "met by a heat link from LOOP.Converter", carried: true })!;
    expect(r.word).toBe("carried");
    expect(r.detail).toBe("met by a heat link from LOOP.Converter");
  });
});

describe("an allocated duty shows its utility WHOLE", () => {
  it("a catalogue name is not a sentence and is not folded", () => {
    const d = dutyUtilityLabel(
      { utility: "steamLP", allocated: true, carried: false })!;
    expect(d.word).toBe("steamLP");
    expect(d.detail).toBeNull();
    expect(d.kind).toBe("allocated");
  });

  it("allocated with no name still says so rather than going blank", () => {
    const d = dutyUtilityLabel({ utility: "", allocated: true })!;
    expect(d.word).toBe("allocated");
  });
});

describe("unserved is its own answer", () => {
  it("says the word and keeps the reason", () => {
    const d = dutyUtilityLabel(
      { utility: "(none adequate)", allocated: false, carried: false })!;
    expect(d.word).toBe("unserved");
    expect(d.detail).toBe("(none adequate)");
    expect(d.kind).toBe("unserved");
  });
});

describe("what it refuses to invent", () => {
  it("a result written BEFORE the typed flag does not get a guess", () => {
    //  `carried` absent: carried and unserved are indistinguishable from
    //  here, and this is exactly the pair the engine added the flag to tell
    //  apart.  Saying either would invent the one fact the label carries.
    const d = dutyUtilityLabel({ utility: CARRIED_PROSE, allocated: false })!;
    expect(d.kind).toBe("unknown");
    expect(d.word).toBe("not allocated");
    expect(d.word).not.toBe("carried");
    expect(d.word).not.toBe("unserved");
    expect(d.detail).toBe(CARRIED_PROSE);
  });

  it("nothing to say is null, so no utility line is drawn at all", () => {
    expect(dutyUtilityLabel(undefined)).toBeNull();
    expect(dutyUtilityLabel(undefined, "")).toBeNull();
    expect(dutyUtilityLabel(undefined, "   ")).toBeNull();
  });

  it("before a run, the DECLARED utility is what there is to show", () => {
    const d = dutyUtilityLabel(undefined, "steamMP")!;
    expect(d.word).toBe("steamMP");
    expect(d.kind).toBe("declared");
    expect(d.detail).toBeNull();
  });

  it("a run REPLACES the declared name -- it does not fall back to it", () => {
    //  The allocation is the answer; the declaration was the question.
    const d = dutyUtilityLabel(
      { utility: CARRIED_PROSE, allocated: false, carried: true }, "steamMP")!;
    expect(d.word).toBe("carried");
  });
});

describe("the invariant the card depends on", () => {
  it("the word is never a sentence, on any input", () => {
    const rows = [
      { utility: CARRIED_PROSE, carried: true },
      { utility: "(none adequate)", carried: false },
      { utility: CARRIED_PROSE },
      { utility: "steamLP", allocated: true },
    ];
    for (const r of rows) {
      const d = dutyUtilityLabel(r)!;
      expect(d.word.length).toBeLessThanOrEqual(16);
      expect(d.word).not.toContain("(");
    }
  });
});
