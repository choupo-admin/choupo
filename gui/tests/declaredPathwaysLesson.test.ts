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
  The declared-pathways lesson (commission C11): what it must say, what it
  must decline to say, and the tool's one piece of arithmetic.

  The engine runs in a browser; nothing here runs it.  What a unit test CAN
  hold is the page's claims against the witness it names -- the witness file
  is read from the tree, so a lesson that described a different reaction
  list than the case declares fails here -- and the override paths the
  sliders write, which must land on the slots the witness declares.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PATHWAYS_LIMITS, PATHWAYS_STEPS,
} from "../src/ui/methods/declaredPathwaysLesson.js";
import {
  DECLARED_REACTIONS, DT_KNOB, PATHWAY_COLUMNS, PATHWAYS_WITNESS,
  T_KNOB, pathwaysOverrides, sideOf,
} from "../src/ui/methods/DeclaredPathwaysTool.js";
import { applyDictOverride } from "../src/case/methodRun.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const read = (rel: string): string =>
  readFileSync(new URL(`../../tutorials/${PATHWAYS_WITNESS}/${rel}`,
    import.meta.url), "utf-8");

const FLOWSHEET = read("system/flowsheetDict");
const FEED = read("0/feed");
const REACTIONS = read("constant/reactions");

/** Line breaks are LAYOUT; asserting through them makes a re-wrap look like
 *  a changed claim. */
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();

const step = (n: number) => PATHWAYS_STEPS.find((s) => s.n === n)!;
const all = (n: number): string => {
  const s = step(n);
  return prose([s.title, s.body, s.note ?? "",
    ...(s.derivation ?? []).map((d) => d.step)].join(" "));
};

describe("the declared-pathways lesson", () => {
  it("has five steps, numbered without a gap", () => {
    expect(PATHWAYS_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("sets SPECIES against REACTIONS, the two questions of step 1", () => {
    const s = all(1);
    expect(s).toContain("A Gibbs reactor is told SPECIES");
    expect(s).toContain("An equilibrium reactor is told REACTIONS");
    const f = prose(step(1).formula!);
    expect(f).toContain(String.raw`A\,n = b`);
    expect(f).toContain(String.raw`n = n_0 + \nu^{\top}\xi`);
  });

  it("counts the independent reactions from the witness's own species", () => {
    //  R = N - rank(A): six species over three elements, three reactions,
    //  and the witness's `complete` reactor must declare exactly three.
    expect(prose(step(2).formula!)).toContain("6 - 3 = 3");
    const complete = FLOWSHEET.match(
      /name\s+complete;[\s\S]*?reactions\s*\(([^)]*)\)/);
    expect(complete?.[1]?.trim().split(/\s+/)).toEqual(
      ["methanolSynthesis", "waterGasShift", "methanation"]);
  });

  it("names the exclusion the witness actually makes", () => {
    //  The lesson says methanation is left off; the case must leave it off.
    const declared = FLOWSHEET.match(
      /name\s+declared;[\s\S]*?reactions\s*\(([^)]*)\)/);
    expect(declared?.[1]?.trim().split(/\s+/)).toEqual(
      [...DECLARED_REACTIONS]);
    expect(all(3)).toContain("leaves METHANATION off its list");
    //  and the three library entries it names exist, balanced as the header
    //  says (C, H, O by atom count).
    for (const r of ["methanolSynthesis", "waterGasShift", "methanation"])
      expect(REACTIONS).toMatch(new RegExp(`^${r}\\b`, "m"));
  });

  it("says the premise is the student's and cites no catalyst", () => {
    expect(all(3)).toContain("Experience supplies it; the engine cannot "
      + "check it and does not try");
    const l = PATHWAYS_LIMITS.find((x) => x.id === "premise-not-cited")!;
    expect(prose(l.body)).toContain("does not claim one");
  });

  it("states the bound: the declared answer is a CONSTRAINED minimum", () => {
    expect(all(3)).toContain("CONSTRAINED minimum of the same G");
    expect(prose(step(3).formula!)).toContain(String.raw`\ge`);
  });

  it("gives the approach its per-reaction sign, and says which way it runs", () => {
    const s = all(4);
    expect(s).toContain("MAGNITUDE");
    expect(s).toContain("the ENGINE assigns the direction to each declared "
      + "reaction separately");
    expect(s).toContain("runs BACKWARD");
    expect(s).toContain("TemperatureApproach.H:87");
    expect(s).toContain("READ PER REACTION, NOT JOINTLY");
  });

  it("gives every equation a where-list", () => {
    for (const s of PATHWAYS_STEPS)
      if (s.formula)
        expect(s.where?.length, `step ${s.n} has a formula and no glosses`)
          .toBeGreaterThan(0);
  });
});

describe("what the page declines to claim", () => {
  it("names the witness that could NOT be built, with the reason", () => {
    const carbon = PATHWAYS_LIMITS.find((x) => x.id === "carbon-not-buildable")!;
    expect(prose(carbon.body)).toContain("no solid-carbon record");
  });

  it("gives the ammonia example the reaction lists its witness declares", () => {
    //  Built 2026-09-27 once the reactor solved on ln n: the page names the
    //  witness, and the witness must declare what the page says it declares.
    const l = PATHWAYS_LIMITS.find((x) => x.id === "ammonia-oxidation")!;
    const body = prose(l.body);
    expect(body).toContain("equil03_ammonia_oxidation_declared_pathways");
    expect(body).toContain("ln K = 121.5");
    expect(body).toContain("cites no catalyst");
    expect(body).not.toContain("not yet diagnosed");
    const fs = readFileSync(new URL("../../tutorials/steady/reactors/"
      + "equil03_ammonia_oxidation_declared_pathways/system/flowsheetDict",
      import.meta.url), "utf-8");
    const list = (unit: string) => fs.match(new RegExp(
      `name\\s+${unit};[\\s\\S]*?reactions\\s*\\(([^)]*)\\)`))?.[1]
      ?.trim().split(/\s+/);
    expect(list("declared")).toEqual(["ammoniaToNO"]);
    expect(list("complete")).toEqual(["ammoniaToNO", "ammoniaToN2"]);
  });

  it("says no ΔT on the page is calibrated", () => {
    const l = PATHWAYS_LIMITS.find(
      (x) => x.id === "no-number-here-is-calibrated")!;
    expect(prose(l.body)).toContain("no measurement anywhere in this tool");
  });
});

describe("the sliders land on the witness's own slots", () => {
  it("writes all three reactor temperatures, the feed's, and the approach", () => {
    //  Applied to the REAL witness text: a slider that silently missed its
    //  slot would run the engine on the wrong question.  methodRun throws on
    //  a missing key, a duplicate without an occurrence, and a unit mismatch.
    let fs = FLOWSHEET;
    let feed = FEED;
    for (const o of pathwaysOverrides(575, 15)) {
      if (o.file === "system/flowsheetDict") fs = applyDictOverride(fs, o);
      else if (o.file === "0/feed") feed = applyDictOverride(feed, o);
      else throw new Error(`unexpected file ${o.file}`);
    }
    expect(fs.match(/^\s*T\s+575 K;/gm)?.length).toBe(3);
    expect(fs).not.toMatch(/^\s*T\s+525 K;/m);
    expect(fs).toMatch(/^\s*temperatureApproach\s+15;/m);
    expect(feed).toMatch(/^T\s+575 K;/m);
  });

  it("offers no negative magnitude, because the engine refuses one", () => {
    expect(DT_KNOB.min).toBe(0);
    expect(DT_KNOB.label).toMatch(/MAGNITUDE/);
  });

  it("bounds the temperature where every column was measured to run", () => {
    expect([T_KNOB.min, T_KNOB.max]).toEqual([525, 625]);
  });
});

describe("the tool's one piece of arithmetic", () => {
  it("reads which side of T a K was taken on, and nothing else", () => {
    //  The engine's own published pair at 525 K with a 20 K approach.
    expect(sideOf(545, 525)).toBe("above");
    expect(sideOf(505, 525)).toBe("below");
    expect(sideOf(525, 525)).toBe("at");
    expect(sideOf(null, 525)).toBeNull();
  });

  it("reads three columns, one per reactor the witness declares", () => {
    for (const c of PATHWAY_COLUMNS)
      expect(FLOWSHEET).toMatch(new RegExp(`name\\s+${c.unit};[\\s\\S]*?`
        + `outputs\\s*\\(\\s*${c.stream}\\s*\\)`));
  });
});

describe("the registry entry", () => {
  it("is live, shelved under reaction engineering, and names both knobs", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "declared-pathways")!;
    expect(e.status).toBe("live");
    expect(e.discipline).toBe("Reaction engineering");
    expect(e.kind).toBe("notes");
    expect(prose(e.teaches)).toContain("PER REACTION");
    expect(prose(e.teaches)).toContain("constrained minimum");
  });
});
