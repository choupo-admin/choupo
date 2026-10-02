/*---------------------------------------------------------------------------*\
  limiting-reactant (DEV.md 4c, C30): the lesson's claims, and the one piece
  of arithmetic the tool does -- the closed form of step 3 -- checked against
  the component balances it was derived from and against the numbers step 4
  quotes from the green ammonia case.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  LIMITING_LIMITS, LIMITING_STEPS,
} from "../src/ui/methods/limitingReactantLesson.js";
import { purgeLoop, purgeFromSlider } from "../src/ui/methods/LimitingReactantTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const step = (n: number) => LIMITING_STEPS.find((s) => s.n === n)!;
const all = (n: number): string => {
  const s = step(n);
  return prose([s.title, s.body, s.note ?? "",
    ...(s.derivation ?? []).map((d) => d.step)].join(" "));
};

describe("the lesson", () => {
  it("has six steps, numbered without a gap", () => {
    expect(LIMITING_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("separates the fresh-feed ratio from the reactor-inlet ratio", () => {
    const f = prose(step(1).formula!);
    expect(f).toContain(String.raw`r_\mathrm{f}`);
    expect(f).toContain(String.raw`r_\mathrm{in}`);
    expect(all(2)).toContain("NOT a design variable");
  });

  it("states the closed form and its steady-state bound", () => {
    const f = prose(step(3).formula!);
    expect(f).toContain(String.raw`r_\mathrm{in} &= \nu \left( 1 + \varepsilon\,\frac{D}{p} \right)`);
    expect(f).toContain(String.raw`\varepsilon &\ge -\,\frac{p\,(1 - X)}{D}`);
  });

  it("quotes the ammonia loop as MEASURED, with both runs", () => {
    const s = all(4);
    expect(s).toContain("3.589");
    expect(s).toContain("3.532");
    expect(s).toContain("3.0003");
    expect(s).toContain("4409.559");
  });

  it("gives each heuristic its source, and says what was NOT read", () => {
    const s = all(5);
    expect(s).toContain("US 2,734,906");
    expect(s).toContain("EP 0 873 291 B1");
    expect(s).toContain("was not read back online");
  });

  it("names the four things it does not show", () => {
    expect(LIMITING_LIMITS.map((l) => l.id)).toEqual(
      ["one-reaction", "non-selective-purge", "no-kinetics", "one-witness"]);
  });
});

describe("the purge-loop arithmetic", () => {
  it("returns a stoichiometric inlet for a stoichiometric fresh feed", () => {
    const r = purgeLoop(3, 0, 0.355, 0.002)!;
    expect(r.rIn).toBeCloseTo(3, 12);
  });

  it("closes the B balance: fresh = consumed + purged", () => {
    for (const [eps, X, p] of [[1e-4, 0.355, 0.002], [-1e-3, 0.5, 0.05],
                               [0.02, 0.2, 0.01]] as const) {
      const r = purgeLoop(3, eps, X, p)!;
      const consumed = 3 * X * r.aInPerFresh;
      const fresh = 3 * (1 + eps);
      expect(consumed + r.bLostFraction * fresh).toBeCloseTo(fresh, 12);
    }
  });

  it("reproduces step 4's predicted shift of 0.053 for the ammonia loop", () => {
    const r = purgeLoop(3, 1e-4, 0.355, 0.002)!;
    expect(r.rIn - 3).toBeCloseTo(0.0534, 3);
  });

  it("refuses a fresh feed too short of B for the conversion", () => {
    expect(purgeLoop(3, -0.01, 0.355, 0.002)).toBeNull();
    expect(purgeLoop(3, -1e-4, 0.355, 0.002)).not.toBeNull();
  });

  it("maps the logarithmic purge slider", () => {
    expect(purgeFromSlider(-3)).toBeCloseTo(0.001, 15);
  });
});

describe("the registry entry", () => {
  it("is live, a lesson, on the reaction-engineering shelf", () => {
    const e = METHOD_TOOLS.find((t) => t.id === "limiting-reactant")!;
    expect(e.status).toBe("live");
    expect(e.kind).toBe("notes");
    expect(e.discipline).toBe("Reaction engineering");
  });
});
