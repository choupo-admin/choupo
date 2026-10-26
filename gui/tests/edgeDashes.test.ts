/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * The flowsheet's dash vocabulary.
 *
 * These exist because the canvas is a React component and this repository has
 * NO render harness (vitest runs `environment: "node"`, no jsdom): a decision
 * left inside `FlowCanvas`'s useMemo is invisible to every test here.  The
 * vocabulary was moved out precisely so that it could be held to something.
 */
import { describe, it, expect } from "vitest";
import {
  DASH_KINDS, dashSpec, dashKindOf, dashStyle, legendDashes,
  type DashKind,
} from "../src/case/edgeDashes";

describe("the table is the one home", () => {
  it("every kind is listed exactly once and resolves", () => {
    const kinds = DASH_KINDS.map((d) => d.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const k of kinds) expect(dashSpec(k).kind).toBe(k);
  });

  it("an unknown kind THROWS rather than drawing as an ordinary pipe", () => {
    //  The silent default is what this project refuses everywhere else: a
    //  fact nobody taught the table must not be painted as "process".
    expect(() => dashSpec("nonsense" as DashKind)).toThrow(/no spec/);
  });

  it("a solid wire is `process`, or a recycle carrying its cut MARK (C41)", () => {
    for (const d of DASH_KINDS) {
      if (d.kind === "process") expect(d.dash).toBeNull();
      else if (d.kind === "tear") { expect(d.dash).toBeNull(); expect(d.mark).toBe("cut"); }
      else expect(typeof d.dash).toBe("string");
    }
  });
});

describe("precedence -- an edge can be several things at once", () => {
  it("a tear that carries nothing is a TEAR, not an empty pipe", () => {
    expect(dashKindOf({ isTear: true, isEmpty: true })).toBe("tear");
  });

  it("a heat link outranks everything", () => {
    expect(dashKindOf({ isEnergy: true, isTear: true, isUtility: true }))
      .toBe("energy");
  });

  it("a utility that is also a tear reads as the tear", () => {
    //  ammonia03's `hotEffluent` is exactly this shape: a declared tear on a
    //  heat link.  Which fact wins used to depend on the order two spreads
    //  appeared in inside the canvas.
    expect(dashKindOf({ isUtility: true, isTear: true })).toBe("tear");
  });

  it("nothing declared is process material", () => {
    expect(dashKindOf({})).toBe("process");
  });
});

describe("no kind is told apart by colour alone (C168 ruling (d))", () => {
  it("every dashed kind has a pattern of its OWN", () => {
    //  It used to record two shared strokes (empty/recipe `4 4`,
    //  utility/duty `6 3`) separated only by colour; ruling (d) took the
    //  decision the module had left open.
    const dashed = DASH_KINDS.filter((d) => d.dash !== null);
    expect(new Set(dashed.map((d) => d.dash)).size).toBe(dashed.length);
  });

  it("the patterns differ in SHAPE, not by a gap a pixel longer", () => {
    //  `6 4` against `6 3` was distinct as a string and identical to an
    //  eye: no two dashed kinds may have the same number of segments AND
    //  first dash within 2 px of each other.
    const dashed = DASH_KINDS.filter((d) => d.dash !== null).map((d) => d.dash!.split(" ").map(Number));
    for (let i = 0; i < dashed.length; i++)
      for (let j = i + 1; j < dashed.length; j++) {
        const a = dashed[i]!, b = dashed[j]!;
        const close = a.length === b.length && Math.abs(a[0]! - b[0]!) <= 2 && Math.abs(a[1]! - b[1]!) <= 2;
        expect(close).toBe(false);
      }
  });

  it("a kind with no fixed colour must not claim one -- the wire keeps its phase", () => {
    for (const k of ["tear", "utility", "empty", "process"] as DashKind[]) {
      expect(dashSpec(k).colour).toBeUndefined();
    }
  });
});

describe("the style the canvas spreads", () => {
  it("carries the pattern, and opacity only when it is not 1", () => {
    //  A recycle is a pipe: solid, with the cut MARKED on it (C41).
    expect(dashStyle("tear")).toEqual({});
    expect(dashSpec("tear").mark).toBe("cut");
    expect(dashStyle("empty")).toEqual({ strokeDasharray: "3 6", opacity: 0.55 });
    expect(dashStyle("process")).toEqual({});
  });
});

describe("the legend lists what is PRESENT, like the phase legend beside it", () => {
  it("a plant with no utilities gets no utility row", () => {
    const rows = legendDashes(["tear", "energy"]);
    expect(rows.map((r) => r.kind)).toEqual(["energy", "tear"]);
  });

  it("solid process wires are never explained -- that is the default", () => {
    expect(legendDashes(["process"])).toHaveLength(0);
    expect(legendDashes(["process", "tear"]).map((r) => r.kind)).toEqual(["tear"]);
  });

  it("rows come out in table order whatever order they arrive in", () => {
    const rows = legendDashes(["empty", "utility", "energy"]);
    expect(rows.map((r) => r.kind)).toEqual(["energy", "utility", "empty"]);
  });

  it("nothing dashed, nothing said", () => {
    expect(legendDashes([])).toHaveLength(0);
  });

  it("every row can be drawn: a label, a meaning and a pattern OR a mark", () => {
    for (const r of legendDashes(DASH_KINDS.map((d) => d.kind))) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.meaning.length).toBeGreaterThan(0);
      expect(Boolean(r.dash) || r.mark === "cut").toBe(true);
    }
  });
});
