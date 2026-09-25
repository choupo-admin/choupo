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
  leastSquaresRun — the witness is reachable, the knobs land on real dict
  scalars, and the two CSV readers refuse a header they do not know.

  WHAT THIS FILE CAN HOLD, AND WHAT IT CANNOT.  It can hold everything that is
  a fact about THIS repository: that the case is in the bundled corpus, that
  each knob's default is the value the case declares (so the page opens on the
  shipped run), that `methodCase` assembles with the knobs applied, and that
  the readers parse the exact shapes `fitParameters` writes.  It cannot run
  the engine — no WASM here — so nothing below asserts a number the fit
  produces.

  THE NUMBERS THE PAGE QUOTES IN PROSE ARE PINNED AGAINST THE CASE'S OWN
  GOLDEN, in numericsLessons.test.ts, for the reason that file already gives
  about the other three pages: a lesson must not teach against its own engine.
  Here the golden is `tutorials/props/curation/<case>/expected`, which is the
  engine's self-recorded answer and the one artefact in the tree that can
  contradict a sentence on the page.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { LS_LIMITS, LS_STEPS } from "../src/ui/methods/leastSquaresLesson.js";

import {
  LS_BAND_DEFAULT_PCT, LS_FIT_LOG, LS_LAMBDA0_DEFAULT_EXP,
  LS_MAXITER_DEFAULT, LS_OP, LS_PARITY, LS_PROPS_FILE, LS_WITNESS,
  dampingMove, evidenceLines, lambda0Of, lsOverrides, readFitHistory,
  readParity,
} from "../src/ui/methods/leastSquaresRun.js";
import { applyDictOverride, methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";

// ---- The witness ------------------------------------------------------------

describe("the witness the page runs", () => {
  const entry = tutorialByName(LS_WITNESS);
  const files = entry?.files.rawFiles;

  it("is in the bundled corpus, so the browser can run it", () => {
    expect(entry, `${LS_WITNESS} is not bundled — the page would have no `
      + "engine to draw").toBeTruthy();
    expect(files).toBeTruthy();
  });

  it("is a choupoProps case (the binary the page asks for)", () => {
    expect(entry!.application).toBe("choupoProps");
  });

  it("carries NO unsupported-in-browser reason", () => {
    //  The one thing that would silently make this page a dead panel: the
    //  catalogue marks a case the browser solver cannot run, and this one
    //  must not be marked.
    expect(entry!.unsupportedReason).toBeUndefined();
  });

  it("ships the two datasets the partition freezes, in constant/", () => {
    //  A sub-directory under constant/ — the shape the catalogue's
    //  unsupported list was once written for.  It IS bundled, and the worker
    //  mkdir-p's it into MEMFS, which is what makes this witness runnable.
    const paths = Object.keys(files!);
    const evidence = paths.filter((p) => p.startsWith("constant/experiments/"));
    expect(evidence.length, "the fit and held-out datasets must both be "
      + "bundled or the run cannot read its own evidence").toBe(2);
  });

  it("declares the operation the page reads, with an evidence partition "
    + "and an acceptance band", () => {
    const props = files![LS_PROPS_FILE]!;
    expect(props).toContain(`name        ${LS_OP};`);
    expect(props).toContain("type        fitParameters;");
    expect(props).toMatch(/role\s+fit;/);
    expect(props).toMatch(/role\s+validation;/);
    expect(props).toMatch(/acceptance\s*\n?\s*\{/);
    expect(props).toMatch(/origin\s+"/);
  });

  it("names the two CSVs the page draws", () => {
    const props = files![LS_PROPS_FILE]!;
    expect(props).toContain(`fit_log    ${LS_FIT_LOG};`);
    expect(props).toContain(`parity     ${LS_PARITY};`);
  });
});

// ---- The knobs --------------------------------------------------------------

describe("the knobs write real declared scalars", () => {
  const files = tutorialByName(LS_WITNESS)!.files.rawFiles!;
  const props = files[LS_PROPS_FILE]!;

  it("each default is the value the case declares", () => {
    //  A default that drifted from the dict means the FIRST render silently
    //  answers a different question from the one the case ships.
    expect(props).toMatch(
      new RegExp(`^\\s*maxAAD\\s+${LS_BAND_DEFAULT_PCT}\\s+percent;`, "m"));
    expect(props).toMatch(
      new RegExp(`^\\s*maxIter\\s+${LS_MAXITER_DEFAULT};`, "m"));
    //  lambda0 is declared as 1.0e-3 and the knob carries the EXPONENT.
    const m = /^\s*lambda0\s+([-+0-9.eE]+);/m.exec(props);
    expect(m, "the case must declare lambda0 for the damping knob to write")
      .toBeTruthy();
    expect(Math.log10(Number(m![1]))).toBeCloseTo(LS_LAMBDA0_DEFAULT_EXP, 12);
  });

  it("lambda0Of takes the power, and nothing else does", () => {
    expect(lambda0Of(-3)).toBeCloseTo(1e-3, 15);
    expect(lambda0Of(0)).toBe(1);
    expect(lambda0Of(4)).toBeCloseTo(1e4, 9);
  });

  it("every override lands, with the unit the dict declares", () => {
    for (const o of lsOverrides(0.08, -1, 40))
      expect(() => applyDictOverride(props, o)).not.toThrow();
  });

  it("a band written in the wrong unit REFUSES rather than being 100x out", () => {
    //  The declared slot says `percent`; writing a fraction there would be a
    //  plausible number and wrong by two orders of magnitude.
    expect(() => applyDictOverride(props, {
      file: LS_PROPS_FILE, key: "maxAAD", value: 0.001, unit: "",
    })).toThrow(/percent/);
  });

  it("the band is rounded before it is written", () => {
    //  A slider stepping by 0.01 reaches 0.060000000000000005, and a dict
    //  carrying that reads as a number somebody measured.
    const band = lsOverrides(0.02 + 0.01 * 4, -3, 60)[0]!;
    expect("value" in band && band.value).toBe(0.06);
  });

  it("methodCase assembles the case with the knobs applied", () => {
    expect(methodCase(LS_WITNESS, lsOverrides(0.05, -5, 25))).toBeTruthy();
  });
});

// ---- The prose, against the engine's own recorded answer --------------------

describe("every number the lesson quotes is the engine's", () => {
  //  THE GOLDEN IS THE ONE ARTEFACT IN THE TREE THAT CAN CONTRADICT THE PAGE.
  //  `tutorials/.../expected` is committed, is written by `bin/runTests
  //  --record` from a real run, and is what the suite compares every future
  //  run against -- so a sentence checked against it cannot quietly go false
  //  while the engine still passes its own regression.  A number this page
  //  states that the golden does not carry was removed from the prose rather
  //  than left unpinned; what the page needs beyond this lives in the live
  //  panels, drawn from the run in front of the reader.
  const expected = readFileSync(new URL(
    "../../tutorials/props/curation/curate02_vle_heldout_ethanol_water/expected",
    import.meta.url), "utf-8");

  const diagOf = (key: string): number => {
    const m = new RegExp(`^diag\\s+${LS_OP}\\s+${key}\\s+(\\S+)`, "m")
      .exec(expected);
    expect(m, `the golden carries no diag row '${key}'`).toBeTruthy();
    return Number(m![1]);
  };
  const text = [...LS_STEPS.map((s) => [s.title, s.body, s.note ?? "",
    ...(s.derivation ?? []).map((d) => d.step),
    ...(s.where ?? []).map((g) => g.means)].join("\n")),
  ...LS_LIMITS.map((l) => `${l.title}\n${l.body}`)].join("\n");

  it("the fitted and held-out counts the page states are the run's", () => {
    expect(diagOf("n_data")).toBe(8);
    expect(diagOf("n_heldout")).toBe(3);
    expect(diagOf("n_params")).toBe(4);
    expect(diagOf("dof")).toBe(4);
    expect(text).toMatch(/eight measured|eight points/i);
    expect(text).toMatch(/three on this page|three points|three withheld/i);
    expect(text).toMatch(/four NRTL|four of them|four fitted/i);
  });

  it("Student's t at these degrees of freedom is the value quoted", () => {
    expect(diagOf("t_crit95")).toBe(2.776);
    expect(text).toContain("2.776");
    //  ... and the page's reason for quoting it: 1.96 is the large-sample
    //  limit and this fit has four degrees of freedom.
    expect(text).toContain("1.96");
  });

  it("the condition number and the correlation are as the page describes", () => {
    const cond = diagOf("cond_JtJ");
    expect(cond).toBeGreaterThan(3e11);
    expect(cond).toBeLessThan(5e11);
    expect(text).toMatch(/4e11/);
    //  "to within a ten-thousandth of perfectly"
    expect(1 - diagOf("max_abs_corr")).toBeLessThan(1e-4);
    expect(text).toMatch(/ten-thousandth/);
    //  and the two thresholds the engine's own verdict uses
    expect(text).toContain("1e8");
    expect(text).toContain("0.999");
    expect(diagOf("identifiable")).toBe(0);
    expect(diagOf("well_conditioned")).toBe(0);
  });

  it("the run is `validated` AND not identifiable, which is the page's point",
    () => {
      expect(expected).toMatch(
        new RegExp(`^verdict\\s+${LS_OP}\\s+verdict\\s+validated\\s`, "m"));
      expect(diagOf("identifiable")).toBe(0);
      expect(text).toMatch(/validated/);
      expect(text).toMatch(/not individually identifiable|NOT individually/i);
    });

  it("the held-out deviation really is inside the band the case declares", () => {
    const props = tutorialByName(LS_WITNESS)!.files.rawFiles![LS_PROPS_FILE]!;
    const band = Number(/^\s*maxAAD\s+([0-9.eE+-]+)\s+percent;/m
      .exec(props)![1]);
    expect(diagOf("aad_heldout_pct")).toBeLessThanOrEqual(band);
    //  The page says the margin is a factor, not an order of magnitude; that
    //  claim is checked here rather than asserted on the page.
    expect(band / diagOf("aad_heldout_pct")).toBeLessThan(3);
  });

  it("the band's own size in kelvin is the one the page quotes", () => {
    //  "0.1 % of a ~356 K bubble temperature is about 0.36 K".
    const aadPct = diagOf("aad_heldout_pct");
    const aadK = diagOf("aad_heldout_K");
    const T = 100 * aadK / aadPct;          // the mean held-out temperature
    expect(T).toBeGreaterThan(350);
    expect(T).toBeLessThan(360);
    expect(0.001 * T).toBeGreaterThan(0.34);
    expect(0.001 * T).toBeLessThan(0.38);
    expect(text).toMatch(/0\.36 K/);
  });

  it("the search-bound argument quotes the bounds the case declares", () => {
    const props = tutorialByName(LS_WITNESS)!.files.rawFiles![LS_PROPS_FILE]!;
    expect(props).toMatch(/a_ij;\s+initial\s+\S+\s+min\s+-15;\s+max\s+15;/);
    expect(props).toMatch(/b_ij;\s+initial\s+\S+\s+min\s+-5000;\s+max\s+5000;/);
    expect(text).toContain("15");
    expect(text).toContain("5000");
  });
});

// ---- The readers ------------------------------------------------------------

const HISTORY = [
  "iter,chi2,lambda,a.a_ij,a.b_ij",
  "0,39.7825,0.001,-0.8009,246.18",
  "1,38.0211,0.0007,-1.25007,53.764",
  "2,1.06777,0.00049,-1.13085,91.9819",
].join("\n");

const PARITY = [
  "x_1,P_Pa,T_exp,T_model,residual",
  "0.05,101325,361.95,361.949,-0.00120197",
  "0.1,101325,359.95,359.914,-0.0356463",
].join("\n");

describe("readFitHistory", () => {
  it("reads the engine's iteration log, parameters included", () => {
    const r = readFitHistory(HISTORY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read.paramPaths).toEqual(["a.a_ij", "a.b_ij"]);
    expect(r.read.rows).toHaveLength(3);
    expect(r.read.rows[0]!.chi2).toBeCloseTo(39.7825, 10);
    expect(r.read.rows[2]!.lambda).toBeCloseTo(0.00049, 12);
    expect(r.read.rows[1]!.params).toEqual([-1.25007, 53.764]);
  });

  it("refuses a header that is not a fit history, and names it", () => {
    const r = readFitHistory("x_1,P_Pa,T_exp\n0.05,101325,361.95");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toContain("iter,chi2,lambda");
  });

  it("refuses a log with the lead columns and no parameter", () => {
    const r = readFitHistory("iter,chi2,lambda\n0,1,1e-3");
    expect(r.ok).toBe(false);
  });

  it("skips a short row rather than padding it with a zero", () => {
    //  Padding would put a parameter trajectory on screen the engine never
    //  produced.
    const r = readFitHistory(HISTORY + "\n3,0.9,1e-4,-1.1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read.rows).toHaveLength(3);
  });

  it("refuses an empty file", () => {
    expect(readFitHistory("").ok).toBe(false);
    expect(readFitHistory("iter,chi2,lambda,p").ok).toBe(false);
  });
});

describe("readParity", () => {
  it("reads the fitted points and their residuals", () => {
    const r = readParity(PARITY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read).toHaveLength(2);
    expect(r.read[0]!.x1).toBeCloseTo(0.05, 12);
    expect(r.read[0]!.T_model).toBeCloseTo(361.949, 10);
    expect(r.read[1]!.residual).toBeCloseTo(-0.0356463, 12);
  });

  it("keeps a row whose bubble point did not converge, as a NaN", () => {
    //  The engine writes nan there; shortening the table instead would hide
    //  that a point failed.
    const r = readParity(PARITY + "\n0.3,101325,357.3,nan,nan");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read).toHaveLength(3);
    expect(Number.isNaN(r.read[2]!.T_model)).toBe(true);
  });

  it("refuses a header that is not a parity table, and names it", () => {
    const r = readParity("iter,chi2,lambda\n0,1,1e-3");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toContain("x_1,P_Pa,T_exp,T_model,residual");
  });
});

describe("dampingMove — the engine's own decision, read off its own ratio", () => {
  it("names the three factors the engine uses", () => {
    expect(dampingMove(1e-3, 7e-4)).toMatch(/ACCEPTED/);
    expect(dampingMove(3.91e-7, 9.77e-7)).toMatch(/REJECTED/);
    expect(dampingMove(1e-3, 1e-2)).toMatch(/SINGULAR/);
  });

  it("catches the step the old chi2-based rule got WRONG", () => {
    //  The shipped run's last row: lambda 9.55e-5 -> 6.68e-5 is an ACCEPTED
    //  step, and the printed chi2 does not change at the CSV's six
    //  significant figures.  A rule that read the objective called it "no
    //  change"; the ratio cannot.
    expect(dampingMove(9.55e-5, 6.68e-5)).toMatch(/ACCEPTED/);
  });

  it("reports an unrecognised move as itself rather than guessing", () => {
    expect(dampingMove(1e-3, 1.3e-3)).toMatch(/none of the three factors/);
  });

  it("refuses a non-positive damping instead of dividing by it", () => {
    expect(dampingMove(0, 1e-3)).toMatch(/not a positive number/);
    expect(dampingMove(1e-3, 0)).toMatch(/not a positive number/);
  });
});

describe("evidenceLines", () => {
  const LOG = [
    "Thermo package:    2 components, EoS = idealGas",
    "  [evidence] fitParameters(T_bubble): partition declared before fitting"
      + " (fingerprint 697a886d6caee2ac)",
    "      FIT         constant/experiments/etoh-water-101kPa-fit.dat"
      + "   provenance measured",
    "      HELD-OUT    constant/experiments/etoh-water-101kPa-heldout.dat"
      + "   provenance measured",
    "      [independence] 2 dataset(s) declare no DOI -- they cannot take"
      + " part in the cross-role identity check.",
    "  LM:  maxIter 60   tol 0.0000   fdStep 0.0010   lambda0 0.0010",
  ].join("\n");

  it("picks the partition's own announcement out of the run log", () => {
    const got = evidenceLines(LOG);
    expect(got).toHaveLength(4);
    expect(got[0]).toContain("partition declared before fitting");
    expect(got[1]).toContain("FIT");
    expect(got[2]).toContain("HELD-OUT");
    expect(got[3]).toContain("[independence]");
  });

  it("returns nothing when there is no log, rather than inventing one", () => {
    expect(evidenceLines(null)).toEqual([]);
    expect(evidenceLines("nothing to see here")).toEqual([]);
  });
});
