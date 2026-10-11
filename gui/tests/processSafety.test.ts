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
  The process-safety EduTool (C60), held to the tree.

  What it holds, block by block:
    * the shelf and the registry entry;
    * the recipe lines the page moves: every override set is applied to the
      REAL witness and the result read back, so a reordered recipe or a
      renamed key fails here rather than on a student's screen running the
      wrong question;
    * the dosing schedule the page copies (16 portions, 900 s apart, the
      default failure 50 s after the last) against the witness's own dict;
    * the five criticality classes, one ordering each;
    * the MTT: the proxy against the component records it reads, the
      bubble-point witness's overrides read back, its shipped composition
      against batch26's own trajectory, and its golden against the proxy;
    * Stoessel's mass correction on the witnesses' own trajectories: 1 for
      the batch, and the semi-batch's worst instant where DEFAULT_PORTION
      says, not at the end of the dosing;
    * the engine claims the lesson cites by file:line, and the
      reaction-heat limitation recomputed from the records it names;
    * the quotations: each appears in a step, and nothing else in the steps
      is set in quotation marks unless the list carries it;
    * the run outputs: the readers on the engine's own trajectory files, the
      goldens the page's numbers come from, and the ammonia lesson's "about
      four times as much ammonia in the recycle stream" against the two
      loops' converged recycle streams;
    * the wordings the 2026-10-11 review retired, refused wherever the page
      could carry them again.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { TrajectoryData } from "../src/adapters/SolverAdapter.js";
import { methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  BATCH_TF_MAX_S, CLASS_MEANING, DEFAULT_PORTION, FAIL_AFTER_PORTION_S,
  PORTIONS, PORTION_SPACING_S, SAFETY_WITNESS_BATCH, SAFETY_WITNESS_BUBBLE,
  SAFETY_WITNESS_NH3_150, SAFETY_WITNESS_NH3_50, SAFETY_WITNESS_SEMI, SPECIES,
  accumulation, at, batchOverrides, bubbleOverrides, criticalityClass,
  failTimeAfterPortion, massRatio, readFailure, reactorComposition,
  recordBoilingPoints, recordMolarMasses, semiOverrides,
} from "../src/ui/methods/processSafety.js";
import {
  SAFETY_LIMITS, SAFETY_QUOTES, SAFETY_STEPS,
} from "../src/ui/methods/processSafetyLesson.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_DISCIPLINES, METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { witnessOutput } from "./witnessRead.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const FLOW = "system/flowsheetDict";

/** The numbers of every `key <n>;` line in a dict, in file order. */
function values(text: string, key: string): number[] {
  const re = new RegExp(`^[ \\t]*${key}[ \\t]+([-+0-9.eE]+)[ \\t]*;`, "gm");
  return [...text.matchAll(re)].map((m) => Number(m[1]));
}

function flowsheetOf(witness: string, o: ReturnType<typeof batchOverrides>): string {
  const cf = methodCase(witness, o);
  const body = cf.rawFiles?.[FLOW];
  if (body === undefined) throw new Error(`${witness}: no ${FLOW}`);
  return body;
}

/** trajectory.csv -> TrajectoryData, the shape the adapter hands the page. */
function parseTrajectory(csv: string): TrajectoryData {
  const lines = csv.trim().split("\n");
  const head = lines[0]!.split(",");
  const rows = lines.slice(1).map((l) => l.split(",").map(Number));
  const vars: { [k: string]: number[] } = {};
  head.slice(1).forEach((h, j) => { vars[h] = rows.map((r) => r[j + 1]!); });
  return { t: rows.map((r) => r[0]!), vars };
}

function golden(caseDir: string, unit: string, key: string): number {
  const m = new RegExp(`^kpi\\s+${unit}\\s+${key}\\s+([-+0-9.eE]+)`, "m")
    .exec(tree(`${caseDir}/expected`));
  if (!m) throw new Error(`${caseDir}: no golden ${unit}.${key}`);
  return Number(m[1]);
}

/** kmol/h of one species in a converged stream file. */
function convergedFlow(text: string, comp: string): number {
  const m = new RegExp(`^\\s*${comp}\\s+([-+0-9.eE]+)\\s+kmol/h;`, "m").exec(text);
  if (!m) throw new Error(`no ${comp} in a converged stream`);
  return Number(m[1]);
}

describe("process-safety: the shelf and the registry entry", () => {
  it("sits on its own 'Process safety' shelf, live, as notes", () => {
    expect(METHOD_DISCIPLINES).toContain("Process safety");
    const t = METHOD_TOOLS.find((m) => m.id === "process-safety");
    expect(t?.discipline).toBe("Process safety");
    expect(t?.kind).toBe("notes");
    expect(t?.status).toBe("live");
  });
  it("names witnesses the bundled corpus carries", () => {
    for (const w of [SAFETY_WITNESS_BATCH, SAFETY_WITNESS_SEMI,
      SAFETY_WITNESS_NH3_150, SAFETY_WITNESS_NH3_50])
      expect(tutorialByName(w), w).toBeDefined();
  });
});

describe("process-safety: the recipe lines the page moves", () => {
  it("batch: normal operation keeps the jacket (value 0), a failure moves the time", () => {
    expect(values(flowsheetOf(SAFETY_WITNESS_BATCH, batchOverrides(null)), "value"))
      .toEqual([0]);
    const f = flowsheetOf(SAFETY_WITNESS_BATCH, batchOverrides(1260));
    expect(values(f, "time")).toEqual([1260]);
    expect(values(f, "value")).toEqual([1]);
  });
  it("the batch witness ships the failure at 600 s, inside the knob's range", () => {
    const shipped = tree(`tutorials/${SAFETY_WITNESS_BATCH}/${FLOW}`);
    expect(values(shipped, "time")).toEqual([600]);
    expect(600).toBeLessThanOrEqual(BATCH_TF_MAX_S);
  });
  it("semi-batch: the two safety events move together and the portions stay", () => {
    const shipped = tree(`tutorials/${SAFETY_WITNESS_SEMI}/${FLOW}`);
    const f = flowsheetOf(SAFETY_WITNESS_SEMI, semiOverrides(5, false));
    const t = values(f, "time");
    expect(t.slice(0, 2)).toEqual([failTimeAfterPortion(5), failTimeAfterPortion(5)]);
    expect(t.slice(2)).toEqual(values(shipped, "time").slice(2));
    expect(values(f, "value")).toEqual([1]);
    expect(values(f, "fraction")[0]).toBe(0);
    expect(values(f, "fraction").slice(1)).toEqual(values(shipped, "fraction").slice(1));
    const n = flowsheetOf(SAFETY_WITNESS_SEMI, semiOverrides(null, true));
    expect(values(n, "value")).toEqual([0]);
    expect(values(n, "fraction")[0]).toBe(0);
  });
  it("the page's copy of the dosing schedule is the dict's", () => {
    const shipped = tree(`tutorials/${SAFETY_WITNESS_SEMI}/${FLOW}`);
    const portionTimes = values(shipped, "time").slice(2);
    expect(portionTimes).toHaveLength(PORTIONS);
    portionTimes.forEach((t, k) => expect(t).toBe(k * PORTION_SPACING_S));
    //  Every portion is 1/16 of the ethanol: fraction 1/(16-k) of the rest.
    values(shipped, "fraction").slice(1).forEach((f, k) =>
      expect(f).toBeCloseTo(1 / (PORTIONS - k), 10));
    //  The shipped failure is 50 s after the LAST portion, never on one.
    expect(values(shipped, "time").slice(0, 2))
      .toEqual([failTimeAfterPortion(PORTIONS), failTimeAfterPortion(PORTIONS)]);
    expect(FAIL_AFTER_PORTION_S % PORTION_SPACING_S).not.toBe(0);
  });
});

describe("process-safety: the criticality classes", () => {
  //  Tp = 300 throughout; one ordering per class (Molecules 30 (2025) 2939,
  //  Table 11, citing Stoessel 2008).
  it.each([
    [320, 350, 400, 1], [320, 400, 350, 2], [360, 350, 400, 3],
    [420, 350, 400, 4], [420, 450, 400, 5], [380, 450, 350, 5],
  ] as const)("MTSR %d, MTT %d, T_D24 %d -> class %d", (mtsr, mtt, td24, cls) => {
    expect(criticalityClass(300, mtsr, mtt, td24).cls).toBe(cls);
  });
  it("refuses a class when the process already runs above a limit", () => {
    expect(criticalityClass(360, 380, 350, 400).cls).toBeNull();
  });
});

describe("process-safety: the MTT", () => {
  it("the PROXY is the lowest Tb among the witness's component records", () => {
    const raw = tutorialByName(SAFETY_WITNESS_BATCH)?.files.rawFiles;
    const tbs = recordBoilingPoints(raw);
    expect(tbs.length).toBe(4);
    const low = tbs[0]!;
    const rec = tree(`tutorials/${SAFETY_WITNESS_BATCH}/constant/components/${low.component}.dat`);
    expect(Number(/^Tb\s+([0-9.]+)\s*;/m.exec(rec)![1])).toBe(low.Tb);
    for (const t of tbs) expect(t.Tb).toBeGreaterThanOrEqual(low.Tb);
  });
  it("the bubble-point witness runs on the reactor case's own records and thermo", () => {
    //  A copy, not a look-alike: the same sealed records, the same
    //  thermoPhysPropDict.
    const bub = tutorialByName(SAFETY_WITNESS_BUBBLE)?.files.rawFiles;
    const bat = tutorialByName(SAFETY_WITNESS_BATCH)?.files.rawFiles;
    expect(bub).toBeDefined();
    for (const rel of Object.keys(bat!).filter((r) => r.startsWith("constant/")
      && r !== "constant/reactions"))
      expect(bub![rel], rel).toBe(bat![rel]);
  });
  it("its four composition lines are the ones the page rewrites", () => {
    const x = { aceticAcid: 0.1, ethanol: 0.2, ethylAcetate: 0.3, water: 0.4 };
    const body = methodCase(SAFETY_WITNESS_BUBBLE, bubbleOverrides(x))
      .rawFiles?.["system/propsDict"];
    expect(body).toBeDefined();
    for (const sp of SPECIES) expect(values(body!, sp)).toEqual([x[sp]]);
  });
  it("ships batch26's reactor composition at its shipped failure, 600 s", () => {
    const traj = parseTrajectory(witnessOutput(
      `tutorials/${SAFETY_WITNESS_BATCH}`, "trajectory.csv"));
    const x = reactorComposition(traj, 600)!;
    const shipped = tree(`tutorials/${SAFETY_WITNESS_BUBBLE}/system/propsDict`);
    for (const sp of SPECIES)
      expect(values(shipped, sp)[0]).toBeCloseTo(x[sp]!, 6);
  });
  it("its golden bubble point is not the proxy: a mixture does not boil at its lightest component's Tb", () => {
    const m = /^diag\s+reactionMassBubblePoint\s+T_bubble\s+([-+0-9.eE]+)/m
      .exec(tree(`tutorials/${SAFETY_WITNESS_BUBBLE}/expected`));
    expect(m).not.toBeNull();
    const Tbub = Number(m![1]);
    const tbs = recordBoilingPoints(tutorialByName(SAFETY_WITNESS_BATCH)?.files.rawFiles);
    expect(Tbub).toBeGreaterThan(tbs[0]!.Tb + 5);
    expect(Tbub).toBeLessThan(tbs[tbs.length - 1]!.Tb);
  });
});

describe("process-safety: Stoessel's mass correction on the witnesses' own runs", () => {
  const mw = recordMolarMasses(tutorialByName(SAFETY_WITNESS_BATCH)?.files.rawFiles);
  it("reads every species' molar mass from the records", () => {
    for (const sp of SPECIES) expect(mw[sp], sp).toBeGreaterThan(0);
  });
  it("is 1 for the batch, whose mass does not change", () => {
    const traj = parseTrajectory(witnessOutput(
      `tutorials/${SAFETY_WITNESS_BATCH}`, "trajectory.csv"));
    //  To 8 digits: the trajectory file carries 9 significant figures.
    for (const r of massRatio(traj, mw)!.y) expect(r).toBeCloseTo(1, 8);
  });
  it("puts the semi-batch's worst instant where DEFAULT_PORTION says, not at the end", () => {
    //  The shipped run fails after the last portion, so up to then its
    //  trajectory IS normal operation.  T_cf - T_p is X_ac dT_ad M_f/M,
    //  so the argmax over the failure instants does not need dT_ad.
    const traj = parseTrajectory(witnessOutput(
      `tutorials/${SAFETY_WITNESS_SEMI}`, "trajectory.csv"));
    const X = accumulation(traj)!;
    const R = massRatio(traj, mw)!;
    const at_ = (n: number) => failTimeAfterPortion(n);
    const ns = Array.from({ length: PORTIONS }, (_, k) => k + 1);
    const argmax = (f: (n: number) => number) =>
      ns.reduce((b, n) => (f(n) > f(b) ? n : b), 1);
    const corrected = argmax((n) => at(X, at_(n)) * at(R, at_(n)));
    const plain = argmax((n) => at(X, at_(n)));
    expect(corrected).toBe(DEFAULT_PORTION);
    expect(plain).toBeGreaterThan(DEFAULT_PORTION + 6);
    //  The ratio is the whole charge over the first portion's mass at the
    //  start, and 1 once everything is in.
    expect(at(R, at_(1))).toBeGreaterThan(1.5);
    expect(at(R, at_(PORTIONS))).toBeCloseTo(1, 8);
  });
});

describe("process-safety: the lesson text", () => {
  const all = prose(SAFETY_STEPS.map((s) => `${s.body} ${s.note ?? ""}`).join(" "));
  it("every quotation in the list appears in a step, verbatim", () => {
    for (const q of SAFETY_QUOTES) expect(all, q.id).toContain(prose(q.text));
  });
  it("nothing else in the steps sits in quotation marks", () => {
    const quoted = [...all.matchAll(/"([^"]+)"/g)].map((m) => prose(m[1]!));
    for (const q of quoted)
      expect(SAFETY_QUOTES.some((s) => prose(s.text) === q),
        `unlisted quotation: "${q}"`).toBe(true);
  });
  it("Gall is paraphrased and the page says so", () => {
    expect(all).toMatch(/In paraphrase/);
    for (const m of all.matchAll(/"([^"]+)"/g))
      expect(/failing to fail|fails? by fail/i.test(m[1]!), m[1]).toBe(false);
  });
  it("every equation parses", () => {
    for (const s of SAFETY_STEPS) if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
  });
  it("the cited engine and record lines say what the reaction-heat note says they say", () => {
    const lim = prose(SAFETY_LIMITS.map((l) => l.body).join(" "));
    const comp = tree("src/thermo/Component.cpp").split("\n");
    const m1 = /Component\.cpp:(\d+), through Hvap_latent at :(\d+)/.exec(lim);
    expect(m1).not.toBeNull();
    expect(comp[Number(m1![1]) - 1]).toContain("return Hf298_ - hvap298() + cpLiqIntegral(T);");
    expect(comp[Number(m1![2]) - 1]).toContain("Hvap_Tb_ * std::pow");
    const m2 = /aceticAcid\.dat:(\d+) and :(\d+)/.exec(lim);
    expect(m2).not.toBeNull();
    const rec = tree(`tutorials/${SAFETY_WITNESS_BATCH}/constant/components/aceticAcid.dat`)
      .split("\n");
    expect(rec[Number(m2![1]) - 1]).toMatch(/^HvapTb\s+24390;/);
    expect(rec[Number(m2![2]) - 1]).toMatch(/dHf_298\s+-432250\.0;/);
  });
  it("the printed liquid heat of reaction is the engine's: the isothermal leg's duty per mole converted", () => {
    //  batch26 is isothermal at 330 K until 600 s; its golden heat of
    //  reaction over that leg, over the ethanol its trajectory converted.
    const traj = parseTrajectory(witnessOutput(
      `tutorials/${SAFETY_WITNESS_BATCH}`, "trajectory.csv"));
    const n0 = traj.vars["reactor.n_ethanol"]![0]!;
    const n600 = at({ t: traj.t, y: traj.vars["reactor.n_ethanol"]! }, 600);
    const E = golden(`tutorials/${SAFETY_WITNESS_BATCH}`, "reactor", "E_reaction_seg0_kJ");
    const perMol = E / ((n0 - n600) * 1000);       // kJ/mol of ethanol
    expect(perMol).toBeCloseTo(-25.95, 2);
    expect(prose(SAFETY_LIMITS.map((l) => l.body).join(" "))).toContain("-25.95 kJ");
  });
  it("the reaction-heat note's arithmetic, recomputed from the records it names", () => {
    //  (1) The liquid heat of reaction at 298 K from the four records:
    //  each liquid is its ideal-gas datum minus the Watson latent heat.
    const rec = (c: string) => tree(
      `tutorials/${SAFETY_WITNESS_BATCH}/constant/components/${c}.dat`);
    const num = (body: string, key: string) =>
      Number(new RegExp(`^\\s*${key}\\s+([-+0-9.eE]+)`, "m").exec(body)![1]);
    const hLiq = (c: string) => {
      const b = rec(c);
      const Tc = num(b, "Tc"), Tb = num(b, "Tb"), Hb = num(b, "HvapTb");
      return num(b, "dHf_298") - Hb * Math.pow((Tc - 298.15) / (Tc - Tb), 0.38);
    };
    const dHliq = (hLiq("ethylAcetate") + hLiq("water")
      - hLiq("aceticAcid") - hLiq("ethanol")) / 1000;
    expect(dHliq).toBeGreaterThan(-28);
    expect(dHliq).toBeLessThan(-24);
    //  (2) The dimers in acetic acid's saturated vapour at 25 C, from the
    //  tree's own dimerisation record and the record's Antoine.
    const chem = tree("data/standards/chemistry/aceticAcid-dissolution.dat");
    const block = chem.slice(chem.indexOf("vapourDimerisation"));
    const logK25 = num(block, "logK25");
    const dHdim = num(block, "dH");
    const ant = /coefficients\s*\(\s*([-0-9.eE]+)\s+([-0-9.eE]+)\s+([-0-9.eE]+)\s*\)/
      .exec(rec("aceticAcid").slice(rec("aceticAcid").indexOf("vaporPressure")))!;
    const Patm = Math.pow(10, Number(ant[1]) - Number(ant[2]) / (298.15 + Number(ant[3])))
      / 1.01325;                                     // bar -> atm
    const K = Math.pow(10, logK25);                  // atm^-1 at 298.15 K
    const pM = (-1 + Math.sqrt(1 + 4 * K * Patm)) / (2 * K);
    const pD = K * pM * pM;
    const share = 2 * pD / (pM + 2 * pD);            // of the acid, as dimers
    const deassoc = share * (-dHdim) / 2 / 1000;     // kJ per mol of acid
    expect(share).toBeGreaterThan(0.78);             // "about four-fifths"
    expect(share).toBeLessThan(0.85);
    expect(deassoc).toBeGreaterThan(24.5);           // "about 26 kJ"
    expect(deassoc).toBeLessThan(27.5);
    //  (3) Priced back in, the same records give a liquid heat near zero.
    expect(Math.abs(dHliq + deassoc)).toBeLessThan(2);
  });
  it("the cited engine lines are the cooling-failure branch", () => {
    const m = /BatchReactor\.cpp:(\d+)-(\d+)/.exec(all);
    expect(m).not.toBeNull();
    const lines = tree("src/unitOperations/batch/BatchReactor.cpp").split("\n");
    const lo = Number(m![1]), hi = Number(m![2]);
    expect(lines[lo - 1]).toContain('key == "adiabatic"');
    expect(lines.slice(lo - 1, hi).join("\n")).toContain("[cooling failure]");
  });
});

describe("process-safety: the engine's own run outputs", () => {
  it("the batch witness: held at T_p until 600 s, then the MTSR its golden pins", () => {
    const traj = parseTrajectory(witnessOutput(
      `tutorials/${SAFETY_WITNESS_BATCH}`, "trajectory.csv"));
    const f = readFailure(traj)!;
    expect(f.T0).toBe(330);
    expect(at({ t: traj.t, y: traj.vars["reactor.T"]! }, 600)).toBe(330);
    expect(f.Tmax).toBeCloseTo(golden(`tutorials/${SAFETY_WITNESS_BATCH}`, "reactor", "T_final"), 3);
    expect(f.stillRising).toBe(false);
    //  The accumulation starts at 1 in a batch.
    expect(accumulation(traj)!.y[0]).toBe(1);
  });
  it("the semi-batch witness: the accumulation is a fraction of the dosed total, and stays small", () => {
    const traj = parseTrajectory(witnessOutput(
      `tutorials/${SAFETY_WITNESS_SEMI}`, "trajectory.csv"));
    const X = accumulation(traj)!;
    //  The first portion (1/16) is in the reactor at t = 0.
    expect(X.y[0]).toBeCloseTo(1 / PORTIONS, 12);
    //  Never more than a quarter of the ethanol unreacted in the reactor.
    expect(Math.max(...X.y)).toBeLessThan(0.25);
    const f = readFailure(traj)!;
    expect(f.Tmax).toBeCloseTo(golden(`tutorials/${SAFETY_WITNESS_SEMI}`, "reactor", "T_final"), 3);
    //  ... and it ends far below the batch's.
    expect(f.Tmax).toBeLessThan(golden(`tutorials/${SAFETY_WITNESS_BATCH}`, "reactor", "T_final") - 40);
  });
  it("the ammonia loops: the gross margins the page reports, and 'about four times' the recycled ammonia", () => {
    const g150 = golden(`tutorials/${SAFETY_WITNESS_NH3_150}`, "economics", "grossMargin_RM_UT");
    const g50 = golden(`tutorials/${SAFETY_WITNESS_NH3_50}`, "economics", "grossMargin_RM_UT");
    expect(g50).toBeLessThan(g150);
    const rec = (w: string) => witnessOutput(`tutorials/${w}`, "converged/Recycle");
    const ratio = convergedFlow(rec(SAFETY_WITNESS_NH3_50), "NH3")
      / convergedFlow(rec(SAFETY_WITNESS_NH3_150), "NH3");
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
    const t = METHOD_TOOLS.find((m) => m.id === "process-safety")!.teaches;
    expect(t).toContain("about four times as much ammonia in the recycle stream");
    expect(prose(SAFETY_STEPS.map((s) => s.body).join(" ")))
      .toContain("about four times as much ammonia in the recycle stream");
    //  Less hydrogen converted per pass at 50 bar, from the converter's own
    //  feed and effluent.
    const pass = (w: string) => {
      const feed = witnessOutput(`tutorials/${w}`, "converged/PreheatedFeed");
      const out = witnessOutput(`tutorials/${w}`, "converged/HotEffluent");
      return 1.5 * (convergedFlow(out, "NH3") - convergedFlow(feed, "NH3"))
        / convergedFlow(feed, "H2");
    };
    expect(pass(SAFETY_WITNESS_NH3_50)).toBeLessThan(pass(SAFETY_WITNESS_NH3_150));
  });
});

describe("process-safety: the 2026-10-11 review's corrections stay made", () => {
  const page = prose([
    ...SAFETY_STEPS.flatMap((s) => [s.title, s.body, s.note ?? "",
      ...(s.where ?? []).map((w) => w.means)]),
    ...SAFETY_LIMITS.map((l) => `${l.title} ${l.body}`),
    ...Object.values(CLASS_MEANING),
    METHOD_TOOLS.find((m) => m.id === "process-safety")!.teaches,
    tree("gui/src/ui/methods/ProcessSafetyTool.tsx"),
  ].join(" "));
  it.each([
    "four times the ammonia",
    "so that there is nothing to interlock",
    "Every one of those layers existed",
    "every flange, every vessel",
    "attenuation here did not shrink the hazard",
    "nothing in the physics stops",
    "must be redesigned",
    "never held for long at the MTT",
    "The kinetics are illustrative",
  ])("refuses the retired wording %j", (w) => {
    expect(page).not.toContain(w);
  });
  it("T_D24 is never called a decomposition onset (only said not to be one)", () => {
    for (const m of page.matchAll(/(.{0,12})decomposition onset/g))
      expect(m[1], m[0]).toMatch(/not a $/);
  });
  it("the textbook MTSR carries the mass correction, and reduces for a batch", () => {
    const s5 = SAFETY_STEPS.find((s) => s.n === 5)!;
    expect(s5.formula).toContain(String.raw`\frac{M_\mathrm{f}}{M(t)}`);
    expect(s5.formula).toContain(String.raw`\mathrm{MTSR} = \max_t T_\mathrm{cf}(t)`);
    expect(prose(s5.body)).toContain("MTSR = T_p + X_ac ΔT_ad");
  });
  it("the interlock-failed case is named as compound, not as an MTSR", () => {
    const s10 = prose(SAFETY_STEPS.find((s) => s.n === 10)!.body);
    expect(s10).toContain("COMPOUND");
    expect(s10).toContain("it is not an MTSR");
    expect(s10).toContain("safety no longer depends on the interlock");
  });
  it("the thesis keeps the protection layers for the hazard that remains", () => {
    expect(prose(SAFETY_STEPS.find((s) => s.n === 1)!.body))
      .toContain("independent protection layers are still needed for the hazard that remains");
  });
  it("the ammonia lesson names BOTH changes, from the cases' own converter KPIs", () => {
    const T150 = golden(`tutorials/${SAFETY_WITNESS_NH3_150}`, "Converter", "T");
    const T50 = golden(`tutorials/${SAFETY_WITNESS_NH3_50}`, "Converter", "T");
    const s11 = prose(SAFETY_STEPS.find((s) => s.n === 11)!.body);
    expect(s11).toContain(`150 bar and ${Math.round(T150)} K`);
    expect(s11).toContain(`50 bar and ${Math.round(T50)} K`);
    expect(s11).toContain("not the effect of pressure alone");
    expect(prose(SAFETY_STEPS.find((s) => s.n === 12)!.body))
      .toContain("the engine cannot conclude that the lower-pressure design is safer overall");
  });
});
