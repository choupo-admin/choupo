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

  it("only `process` is solid", () => {
    for (const d of DASH_KINDS) {
      if (d.kind === "process") expect(d.dash).toBeNull();
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

describe("the ambiguous patterns are RECORDED, not papered over", () => {
  it("empty and recipe share 4 4, and only colour separates them", () => {
    expect(dashSpec("empty").dash).toBe(dashSpec("recipe").dash);
    expect(dashSpec("recipe").colour).toBeTruthy();
    expect(dashSpec("empty").colour).toBeUndefined();
  });

  it("utility and duty share 6 3, and only colour separates them", () => {
    expect(dashSpec("utility").dash).toBe(dashSpec("duty").dash);
    expect(dashSpec("duty").colour).toBeTruthy();
    expect(dashSpec("utility").colour).toBeUndefined();
  });

  it("a kind with no fixed colour must not claim one -- the wire keeps its phase", () => {
    for (const k of ["tear", "utility", "empty", "process"] as DashKind[]) {
      expect(dashSpec(k).colour).toBeUndefined();
    }
  });
});

describe("the style the canvas spreads", () => {
  it("carries the pattern, and opacity only when it is not 1", () => {
    expect(dashStyle("tear")).toEqual({ strokeDasharray: "10 5" });
    expect(dashStyle("empty")).toEqual({ strokeDasharray: "4 4", opacity: 0.55 });
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

  it("every row can be drawn: a label, a meaning and a pattern", () => {
    for (const r of legendDashes(DASH_KINDS.map((d) => d.kind))) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.meaning.length).toBeGreaterThan(0);
      expect(r.dash).toBeTruthy();
    }
  });
});
