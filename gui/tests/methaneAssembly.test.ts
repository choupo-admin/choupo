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
  methaneAssembly.test -- the `methane-assembly` EduTool ("Assemble methane
  combustion").

  WHAT IT HOLDS:
    * the registry entry, its shelf and the path it sits in;
    * the chain data the page draws equals the library: every reaction of a
      stage is a record whose `sets {}` carries the label, and every case lists
      exactly the reactions of its rungs and asks the sets the page names;
    * on the ENGINE'S OWN output (the seven shipped cases run natively by the
      global setup): each claim the lesson makes about a rung (no ignition
      without a methyl step, the ignition far too early without the ethane
      route, the delay on the measurement with it, the heat in the CO step)
      is true of the run;
    * the sensitivity the engine pinned: the branching of CH3 with oxygen and
      the recombination of two CH3 head it, with opposite signs;
    * the recorded comparison table equals its source scans and its summary
      numbers say what the lesson says;
    * every `file:line` the lesson cites, held to the text it claims;
    * the page opens without starting a run.

  WHAT IT DOES NOT HOLD: the browser run of the cases (the WASM binary is not
  built in the test environment); the page's draw of the plots.
\*---------------------------------------------------------------------------*/

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  CHAIN, PETERSEN, POINTS, SENSITIVITY_WITNESS, STAGES, addedBy, equationOf, finalAmounts, finalT,
  ratioStats, reactionsUpTo, sensitivityRows, shippedPoint, stageOfReaction, tauOfLog,
} from "../src/case/methaneAssembly.js";
import type { TrajectoryData } from "../src/adapters/SolverAdapter.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHANE_LIMITS, METHANE_STEPS, METHANE_TASK } from "../src/ui/methods/methaneAssemblyLesson.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import { MethaneAssemblyTool } from "../src/ui/methods/MethaneAssemblyTool.js";
import { METHOD_PATHS, METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { witnessOutput } from "./witnessRead.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const COMB = "tutorials";

function parseTrajectory(csv: string): TrajectoryData {
  const lines = csv.trim().split("\n");
  const head = lines[0]!.split(",");
  const rows = lines.slice(1).map((l) => l.split(",").map(Number));
  const vars: { [k: string]: number[] } = {};
  head.slice(1).forEach((h, j) => { vars[h] = rows.map((r) => r[j + 1]!); });
  return { t: rows.map((r) => r[0]!), vars };
}
const run = (witness: string) => ({
  traj: parseTrajectory(witnessOutput(`${COMB}/${witness}`, "trajectory.csv")),
  log: witnessOutput(`${COMB}/${witness}`, "log.choupoBatch"),
});
const rung = (i: number) => {
  const r = run(STAGES[i]!.witness);
  return { tau: tauOfLog(r.log), T: finalT(r.traj)!, n: finalAmounts(r.traj), traj: r.traj };
};
const MEASURED = PETERSEN.measured_us * 1e-6;

describe("methane-assembly: registry and path", () => {
  it("is live on the Reaction engineering shelf, anchored in the gas kinetics chapter", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "methane-assembly");
    expect(t?.status).toBe("live");
    expect(t?.discipline).toBe("Reaction engineering");
    expect(t?.theory).toBe("ch:gas-kinetics");
    expect(t?.origins).toEqual(["engine", "reference", "assumption"]);
  });
  it("sits after the rate-constant page in the reaction engineering path", () => {
    const p = METHOD_PATHS.find((x) => x.id === "reaction-engineering");
    const ids = p!.steps.map((s) => s.tool);
    expect(ids.indexOf("methane-assembly")).toBe(ids.indexOf("how-do-we-know-k") + 1);
  });
});

describe("methane-assembly: the chain data is the library, and the cases list it", () => {
  it("every reaction of every stage is a library record that carries its label in the stage's set", () => {
    for (const c of CHAIN) {
      expect(c.reactions.length, c.id).toBeGreaterThan(0);
      for (const r of c.reactions) {
        const f = `data/standards/kinetics/${r.record}/${c.sets.includes("OConaire2004") ? "OConaire2004" : "MillerBowman1989"}.dat`;
        expect(existsSync(new URL(`../../${f}`, import.meta.url)), f).toBe(true);
        const txt = tree(f);
        const sets = /^sets\s*\{([^}]*)\}/m.exec(txt)![1]!;
        const ok = c.sets.some((s) => new RegExp(`\\b${s}\\s+${r.label};`).test(sets));
        expect(ok, `${r.record}: ${sets}`).toBe(true);
        expect(txt).toMatch(new RegExp(`^\\s*page\\s+${r.page};`, "m"));
      }
    }
  });
  it("a stage's reactions are exactly the records of its set (no record of the set is left out)", () => {
    const dir = "data/standards/kinetics";
    for (const c of CHAIN) {
      for (const s of c.sets) {
        //  a reaction is a folder, a source a file in it: every record of the library, whatever its source
        const members = readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })
          .filter((d) => d.isDirectory() && d.name !== "sets")
          .flatMap((d) => readdirSync(new URL(`../../${dir}/${d.name}`, import.meta.url))
            .filter((f) => f.endsWith(".dat")).map((f) => `${d.name}/${f}`))
          .flatMap((f) => {
            const m = /^sets\s*\{([^}]*)\}/m.exec(tree(`${dir}/${f}`));
            const hit = m ? [...m[1]!.matchAll(/(\w+)\s+(\w+);/g)].find((x) => x[1] === s) : undefined;
            return hit ? [hit[2]!] : [];
          });
        expect(members.sort(), s).toEqual(c.reactions.map((r) => r.label).sort());
      }
    }
  });
  it("each case asks the sets of its rung and lists exactly the reactions up to it", () => {
    for (const s of STAGES) {
      const reactions = tree(`${COMB}/${s.witness}/constant/reactions`);
      const asked = /reactionSets\s*\(([^)]*)\)/.exec(reactions)![1]!.trim().split(/\s+/);
      expect(asked, s.witness).toEqual([...s.sets]);
      const flow = tree(`${COMB}/${s.witness}/system/flowsheetDict`);
      const listed = /reactions\s*\(([^)]*)\)/.exec(flow)![1]!.trim().split(/\s+/);
      expect(listed.sort(), s.witness).toEqual(reactionsUpTo(s.id).map((r) => r.label).sort());
    }
    const sens = tree(`${COMB}/${SENSITIVITY_WITNESS}/system/flowsheetDict`);
    expect(sens).toContain("sensitivity");
    const listed = /reactions\s*\(([^)]*)\)/.exec(sens.replace(/sensitivity\s*\{[^}]*\}/, ""))![1]!.trim().split(/\s+/);
    expect(listed.sort()).toEqual(reactionsUpTo("ethane").map((r) => r.label).sort());
  });
  it("every case starts from the Petersen point of the page", () => {
    for (const w of [...STAGES.map((s) => s.witness), SENSITIVITY_WITNESS]) {
      const v = tree(`${COMB}/${w}/0/internalStates/vessel`);
      expect(v).toMatch(new RegExp(`\\bT\\s+${PETERSEN.T_K} K;`));
      expect(v).toMatch(new RegExp(`\\bP\\s+${PETERSEN.P_atm} atm;`));
    }
  });
  it("every witness is in the bundled corpus under its name, with its start and its reactions (the page runs it by that name)", () => {
    for (const w of [...STAGES.map((s) => s.witness), SENSITIVITY_WITNESS]) {
      const f = tutorialByName(w)?.files.rawFiles;
      expect(f, w).toBeDefined();
      expect(f!["0/internalStates/vessel"], w).toContain("holdup");
      expect(f!["constant/reactions"], w).toContain("reactionSets");
    }
  });
  it("labels and equations resolve", () => {
    expect(equationOf("A8")).toBe("CH3 + O2 = CH3O + O");
    expect(equationOf("A1")).toBe("2CH3(+M) = C2H6(+M)");
    expect(stageOfReaction("A1")).toBe("ethane");
    expect(stageOfReaction("R1_H_O2_O_OH")).toBe("core");
    expect(addedBy("attack").map((r) => r.label)).toEqual(["A3", "A4", "A5", "A5a", "A6"]);
  });
});

describe("methane-assembly: what the engine says, rung by rung (the lesson's claims)", () => {
  it("rung 1: the core alone leaves methane untouched and never ignites", () => {
    const r = rung(0);
    expect(r.tau).toBeNull();
    expect(Math.abs(r.T - PETERSEN.T_K)).toBeLessThan(1e-3);
    expect(r.n["CH3"] ?? 0).toBe(0);
  });
  it("rung 2: CH3 appears, nothing consumes it, the temperature barely moves, no ignition", () => {
    const r = rung(1);
    expect(r.tau).toBeNull();
    expect(r.n["CH3"]!).toBeGreaterThan(0);
    expect(Math.abs(r.T - PETERSEN.T_K)).toBeLessThan(5);
  });
  it("rung 3: the methyl step ignites far too early, with carbon stopped at formaldehyde", () => {
    const r = rung(2);
    expect(r.tau).not.toBeNull();
    expect(r.tau!).toBeLessThan(MEASURED / 5);
    expect(r.n["HCHO"]!).toBeGreaterThan(0);
    expect(r.n["CO"] ?? 0).toBe(0);
  });
  it("rungs 4 and 5: the delay hardly moves, the CO2 and the final temperature grow", () => {
    const r3 = rung(2), r4 = rung(3), r5 = rung(4);
    for (const r of [r4, r5]) expect(Math.abs(r.tau! / r3.tau! - 1)).toBeLessThan(0.25);
    expect(r4.T).toBeGreaterThan(r3.T);
    expect(r5.T).toBeGreaterThan(r4.T);
    expect(r5.n["CO2"]!).toBeGreaterThan(10 * (r4.n["CO2"] ?? 0));
    expect(r4.n["CO"]!).toBeGreaterThan(0);
  });
  it("rung 6: the ethane route delays the ignition by about an order of magnitude, onto the measurement", () => {
    const r5 = rung(4), r6 = rung(5);
    expect(r6.tau! / r5.tau!).toBeGreaterThan(8);
    expect(r6.tau! / MEASURED).toBeGreaterThan(0.7);
    expect(r6.tau! / MEASURED).toBeLessThan(1.5);
  });
  it("the delay is read from the engine's log line", () => {
    expect(tauOfLog("  Ignition delay, vessel:  tau_ign (max dT/dt) = 2.400e-05 s   (grid resolution 2.000e-06 s)")).toBeCloseTo(2.4e-5, 12);
    expect(tauOfLog("no ignition here")).toBeNull();
  });
  it("the sensitivity case's pinned base delay is the assembled set's, on its interpolated definition", () => {
    const a = rung(5);
    const m = /^kpi\s+vessel\s+sens_tau0\s+(\S+)/m.exec(tree(`${COMB}/${SENSITIVITY_WITNESS}/expected`));
    expect(Math.abs(Number(m![1]) / a.tau! - 1)).toBeLessThan(0.05);
  });
});

describe("methane-assembly: the sensitivity the engine pinned", () => {
  const kpis = (): { [k: string]: number } => {
    const out: { [k: string]: number } = {};
    for (const l of tree(`${COMB}/${SENSITIVITY_WITNESS}/expected`).split("\n")) {
      const m = /^kpi\s+vessel\s+(sens_\S+)\s+(\S+)/.exec(l);
      if (m) out[m[1]!] = Number(m[2]);
    }
    return out;
  };
  it("two methyl reactions head the list with opposite signs: branching with O2 (negative), recombination (positive)", () => {
    const rows = sensitivityRows(kpis());
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows[0]!.label).toBe("A8");
    expect(rows[0]!.S).toBeLessThan(0);
    expect(rows[1]!.label).toBe("A1");
    expect(rows[1]!.S).toBeGreaterThan(0);
    expect(Math.abs(rows[2]!.S)).toBeLessThan(0.5 * Math.abs(rows[1]!.S));
    expect(rows[0]!.equation).toBe("CH3 + O2 = CH3O + O");
  });
});

describe("methane-assembly: the recorded comparison", () => {
  it("the table is the joined scans, row for row", () => {
    const rows = tree("docs/reviews/2026-11-22-methane-lesson/points.tsv").trim().split("\n").slice(1)
      .map((l) => l.split("\t"));
    expect(rows.length).toBe(POINTS.length);
    rows.forEach((c, i) => {
      const p = POINTS[i]!;
      expect([p.mixture, p.P_atm, p.T_K, p.measured_us, p.aramco_us, p.millerBowmanFull_us, p.c1Chain_us, p.assembled_us])
        .toEqual([c[0], ...c.slice(1).map(Number)]);
    });
  });
  it("the measured delays are Table 2 of the paper, as the review read them", () => {
    const t = tree("docs/reviews/2026-11-21-aramcomech-validation/petersen1999_table2.tsv").split("\n")
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("mixture"))
      .map((l) => l.split("\t"));
    for (const p of POINTS) {
      const row = t.find((c) => c[0] === p.mixture && Number(c[2]) === p.P_atm && Number(c[3]) === p.T_K);
      expect(row, `${p.mixture} ${p.P_atm} ${p.T_K}`).toBeDefined();
      expect(Number(row![4])).toBe(p.measured_us);
    }
  });
  it("the case's own point is in the table, and the case's delay is the table's", () => {
    const p = shippedPoint()!;
    expect(p.measured_us).toBe(PETERSEN.measured_us);
    const r6 = rung(5), r5 = rung(4);
    expect(Math.abs(r6.tau! * 1e6 / p.assembled_us - 1)).toBeLessThan(0.03);
    expect(Math.abs(r5.tau! * 1e6 / p.c1Chain_us - 1)).toBeLessThan(0.15);
  });
  it("says what the lesson says: the C1 chain is far too fast, the assembled set follows the whole appendix", () => {
    const c1 = ratioStats(POINTS, "c1Chain_us", "measured_us");
    expect(c1.hi).toBeLessThan(0.4);
    const asm = ratioStats(POINTS, "assembled_us", "millerBowmanFull_us");
    expect(asm.lo).toBeGreaterThan(0.85);
    expect(asm.hi).toBeLessThan(1.35);
    const worst = ratioStats(POINTS, "assembled_us", "measured_us");
    expect(worst.hi).toBeGreaterThan(3);               // too slow where the appendix is too slow
    const full = ratioStats(POINTS, "millerBowmanFull_us", "measured_us");
    expect(full.hi).toBeGreaterThan(3);
    const ar = ratioStats(POINTS, "aramco_us", "measured_us");
    expect(Math.abs(ar.mean - 1)).toBeLessThan(0.1);
    expect(ar.scatter).toBeLessThan(1.2);
  });
  it("the ratio statistic is the geometric mean (a synthetic check)", () => {
    const pts = [
      { ...POINTS[0]!, measured_us: 1, assembled_us: 4 },
      { ...POINTS[0]!, measured_us: 1, assembled_us: 1 },
    ];
    expect(ratioStats(pts, "assembled_us", "measured_us").mean).toBeCloseTo(2, 12);
  });
});

describe("methane-assembly: the lesson", () => {
  it("every equation parses", () => {
    for (const s of METHANE_STEPS) {
      if (s.formula) expect(texParses(s.formula), s.title).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq), d.step).toBe(true);
      for (const w of s.where ?? []) expect(texParses(w.sym), w.sym).toBe(true);
    }
  });
  it("cites the engine at lines that say what the lesson claims", () => {
    const all = [...METHANE_STEPS.flatMap((s) => [s.body, s.note ?? ""]),
      ...METHANE_LIMITS.map((l) => l.body)].join("\n")
      + "\n" + tree("gui/src/ui/methods/MethaneAssemblyTool.tsx");
    const cited = new Set([...all.matchAll(/((?:[A-Za-z0-9_]+\/)+[A-Za-z0-9_]+\.(?:cpp|H)):(\d+)(?:-(\d+))?/g)].map((m) => m[0]));
    const CLAIMS: Record<string, string | RegExp> = {
      "src/applications/choupoBatch/main.cpp:2507": "if (d > best) { best = d; tIgn = tr[k].first; }",
      "src/unitOperations/batch/BatchReactor.cpp:926": "else     r.S = (std::log(r.tau) - std::log(sensTau0_)) / lnF;",
      "src/thermo/reaction/KineticsLibrary.cpp:388-389": /reactionSets[\s\S]*lookupWordList\("reactionSets"\)/,
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, lines] = c.split(":") as [string, string];
      const src = tree(file).split("\n");
      const [a, b] = lines.split("-").map(Number);
      const text = b === undefined ? (src[a! - 1] ?? "") : src.slice(a! - 1, b).join("\n");
      if (typeof want === "string") expect(text, c).toContain(want);
      else expect(text, c).toMatch(want);
    }
  });
  it("the engine's delay is the time of the largest temperature rise on the write grid, reported above a 200 K rise", () => {
    const src = tree("src/applications/choupoBatch/main.cpp");
    expect(src).toContain("tr.back().second - tr.front().second) < 200.0");
  });
  it("uses no dash made of hyphens in its own prose", () => {
    const prose = [METHANE_TASK, ...METHANE_STEPS.flatMap((s) => [s.body, s.note ?? "", ...(s.derivation ?? []).map((d) => d.step)]),
      ...METHANE_LIMITS.map((l) => l.body)];
    for (const p of prose) expect(p, p).not.toMatch(/ -- | - /);
  });
});

describe("methane-assembly: the page", () => {
  it("opens on the question and every step, with no run started", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(MethaneAssemblyTool)));
    expect(html).toContain("Assemble methane combustion");
    expect(html).toContain("Start from the hydrogen");
    expect(html).not.toContain("cases done");
    expect(html).not.toContain("integrating the vessel once per reaction");
    for (const s of METHANE_STEPS) expect(html).toContain(s.title.slice(0, 18).replace("'", "&#x27;"));
    expect(html).toContain("run the six rungs");
    expect(html).toContain(`${PETERSEN.T_K} K, ${PETERSEN.P_atm} atm`);
  });
});
