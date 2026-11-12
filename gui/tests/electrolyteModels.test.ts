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
  electrolyteModels -- the "Choosing an electrolyte activity model" EduTool:
  its cases, its readers and its arithmetic, held to hand values and to the
  files of the tree.

  No engine runs here (there is none in node): the readers are fed text in
  the exact shape the engine writes (a one-row CSV from electrolyteActivity,
  a species CSV and diagnostics from speciate), copied from a native run of
  this tree.  What the engine answers for each salt is in
  docs/design/choosing-an-electrolyte-model.md, measured natively.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  EM_REFUSAL_SALT, EM_SALTS, awFromPhi, chooseModel, csvRow, daviesMolalities, debyeHuckelLimit,
  deviation, emDaviesCaseFiles, emFile, emMolalities, emOpName, emPackageCaseFiles, emTag,
  heldOutByCuration, ionicStrength, osmoticPressureBar, readDaviesRun, readPackageRun, saltById,
  type ChoiceAnswers, type RunLike,
} from "../src/case/electrolyteModels.js";
import { inSampleAgainst, measuredTable, pairRecord } from "../src/ui/methods/electrolyteModelsData.js";
import { EM_CITATIONS, EM_STEPS } from "../src/ui/methods/electrolyteModelsLesson.js";
import { ElectrolyteModelsTool, tableCite } from "../src/ui/methods/ElectrolyteModelsTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const repo = (rel: string): string => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const NaCl = saltById("NaCl"), KCl = saltById("KCl"), CaCl2 = saltById("CaCl2"), Na2SO4 = saltById("Na2SO4");

describe("the page's arithmetic, against hand values", () => {
  it("ionic strength of 1-1, 2-1 and 1-2 salts", () => {
    expect(ionicStrength(NaCl, 1)).toBe(1);
    expect(ionicStrength(CaCl2, 1)).toBe(3);
    expect(ionicStrength(Na2SO4, 1)).toBe(3);
  });

  it("the Debye-Hückel limit with A_phi = 0.3915", () => {
    //  NaCl, 0.1 mol/kg: ln gamma = -3 x 0.3915 x sqrt(0.1) = -0.371408...
    const a = debyeHuckelLimit(NaCl, 0.1);
    expect(a.gamma).toBeCloseTo(0.6897614187, 9);
    expect(a.phi).toBeCloseTo(0.8761968296, 9);
    //  CaCl2, 0.1 mol/kg: I = 0.3, |z+ z-| = 2.
    expect(debyeHuckelLimit(CaCl2, 0.1).gamma).toBeCloseTo(0.2762082172, 9);
  });

  it("the osmotic pressure from a measured osmotic coefficient (NaCl, 1 mol/kg, phi 0.936)", () => {
    //  ln a_w = -2 x 1 x 0.018015 x 0.936 = -0.03372408
    //  Pi = 8.314462618 x 298.15 / 1.807e-5 x 0.03372408 Pa = 46.2648 bar
    const aw = awFromPhi(NaCl, 1, 0.936);
    expect(Math.log(aw)).toBeCloseTo(-0.03372408, 12);
    expect(osmoticPressureBar(aw)).toBeCloseTo(46.26483, 4);
    //  phi = 1 is van 't Hoff: Pi = nu m M_w R T / V_w.
    expect(osmoticPressureBar(awFromPhi(NaCl, 1, 1)))
      .toBeCloseTo(2 * 0.018015 * 8.314462618 * 298.15 / 1.807e-5 / 1e5, 9);
  });
});

describe("the measured points are the tree's", () => {
  //  An independent reading of each file, written here and not shared with
  //  the page's parser: every number in the data block, in order.
  const independent = (rel: string): number[] => {
    const t = repo(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const block = t.slice(t.indexOf("data"));
    return block.slice(block.indexOf("(") + 1, block.indexOf(")")).trim().split(/\s+/).map(Number);
  };
  for (const s of EM_SALTS) {
    it(`${s.id}: every row the page draws is a row of the file, and every row of the file is drawn`, () => {
      const t = measuredTable(s);
      expect(t.file).toBe(`data/curation/electrolytes/${s.cation}-${s.anion}/constant/experiments/${s.cation}-${s.anion}.dat`);
      const flat = t.rows.flatMap((r) => [r.m, r.gamma, r.phi]);
      expect(flat).toEqual(independent(t.file));
      expect(t.rows.length).toBeGreaterThan(10);
      expect(t.doi).toMatch(/^10\.1063\//);
      expect(t.source.length).toBeGreaterThan(20);
    });
  }

  it("cites each table by its authors, year and table", () => {
    expect(tableCite(measuredTable(NaCl))).toBe("Hamer and Wu (1972), Table 16");
    expect(tableCite(measuredTable(CaCl2))).toBe("Goldberg and Nuttall (1978), Table 20");
    expect(tableCite(measuredTable(Na2SO4))).toMatch(/^Goldberg \(1981\), the Na2SO4 table/);
  });

  it("every model is asked AT every measured molality, never interpolated there", () => {
    for (const s of EM_SALTS) {
      const t = measuredTable(s);
      const ms = emMolalities(t);
      for (const r of t.rows) expect(ms).toContain(r.m);
      expect(ms[0]).toBe(0.001);
      expect([...ms].sort((a, b) => a - b)).toEqual(ms);
    }
  });

  it("the held-out rule is the curation case's: index % 4 == 3, never the first or the last", () => {
    expect(repo("src/propertyOps/ElectrolyteFit.H")).toMatch(/index % N == k -- never the first\s+or the last row/);
    const t = measuredTable(CaCl2);
    const held = t.rows.filter((r) => heldOutByCuration(t, r)).map((r) => r.index);
    expect(held).toEqual([3, 7, 11]);
    expect(repo("data/curation/electrolytes/Ca-Cl/system/propsDict")).toMatch(/heldOut\s+\{ every 4; offset 3; \}/);
  });
});

describe("the tables against the printed sources (checked by eye against the works, 2026-11-12)", () => {
  it("NaCl rows equal Hamer and Wu 1972 Table 16 (p. 1067): m, gamma, phi", () => {
    const t = measuredTable(NaCl);
    const row = (m: number) => t.rows.find((r) => r.m === m)!;
    expect([row(0.1).gamma, row(0.1).phi]).toEqual([0.779, 0.933]);
    expect([row(1).gamma, row(1).phi]).toEqual([0.657, 0.936]);
    expect([row(2).gamma, row(2).phi]).toEqual([0.668, 0.984]);
    expect([row(6).gamma, row(6).phi]).toEqual([0.986, 1.27]);
  });
  it("Na2SO4 and CaCl2 rows equal Goldberg 1981 (p. 695) and Goldberg and Nuttall 1978 (Table 20)", () => {
    const n = measuredTable(Na2SO4).rows.find((r) => r.m === 0.1)!;
    expect([n.gamma, n.phi]).toEqual([0.4457, 0.7869]);
    const c = measuredTable(CaCl2).rows.find((r) => r.m === 2)!;
    expect([c.gamma, c.phi]).toEqual([0.7842, 1.3754]);
  });
  it("Davies at I = 0.5 for NaCl, by hand with 0.3 I (Plummer and Busenberg 1982 eq 17): 0.7332, +7.67 % on 0.681", () => {
    const g = Math.pow(10, -0.51 * (Math.sqrt(0.5) / (1 + Math.sqrt(0.5)) - 0.3 * 0.5));
    expect(g).toBeCloseTo(0.73325, 4);
    expect(100 * (g / 0.681 - 1)).toBeCloseTo(7.67, 2);
  });
  it("the lesson's Pitzer B carries the beta(2) term the CaCl2 and MgSO4 records use", () => {
    const eq = JSON.stringify(EM_STEPS.map((x) => (x.derivation ?? []).map((d) => d.eq)));
    expect(eq).toContain("beta^{(2)}");
  });
});

describe("in-sample or not is read from each record's own source line", () => {
  it("eNRTL: KCl, CaCl2 and Na2SO4 were regressed to these tables; NaCl was not", () => {
    const v = (s: typeof NaCl) => inSampleAgainst(pairRecord(s, "eNRTL"), measuredTable(s));
    expect(v(NaCl).inSample).toBe(false);
    expect(v(KCl)).toMatchObject({ inSample: true, heldOutRows: false });
    expect(v(CaCl2)).toMatchObject({ inSample: true, heldOutRows: true });
    expect(v(Na2SO4)).toMatchObject({ inSample: true, heldOutRows: true });
  });

  it("a record not regressed here still says its error is the quality of a fit", () => {
    expect(inSampleAgainst(pairRecord(NaCl, "Pitzer"), measuredTable(NaCl)).why).toContain("quality of a fit");
  });

  it("Pitzer: none of the four records names these tables", () => {
    for (const s of EM_SALTS)
      expect(inSampleAgainst(pairRecord(s, "Pitzer"), measuredTable(s)).inSample).toBe(false);
  });

  it("MgSO4: a Pitzer record exists, an eNRTL record does not", () => {
    expect(pairRecord(EM_REFUSAL_SALT, "Pitzer")?.file)
      .toBe("data/standards/parameters/Pitzer/pairs/Mg-SO4.dat");
    expect(pairRecord(EM_REFUSAL_SALT, "eNRTL")).toBeNull();
  });
});

describe("the cases the page writes", () => {
  it("Pitzer and eNRTL: the package a unit declares, one electrolyteActivity per molality", () => {
    const ms = [0.1, 0.5];
    for (const model of ["Pitzer", "eNRTL"] as const) {
      const f = emPackageCaseFiles(KCl, model, ms);
      expect(f["constant/thermoPhysPropDict"]).toContain("formulation electrolyteGammaPhi;");
      expect(f["constant/thermoPhysPropDict"]).toContain(`activityModel { model ${model}; }`);
      expect(f["constant/thermoPhysPropDict"]).toContain("components    ( water KCl );");
      const ops = f["system/propsDict"]!.match(/type electrolyteActivity;/g) ?? [];
      expect(ops.length).toBe(2);
      expect(f["system/propsDict"]).toContain(`name ${emOpName(emTag(KCl, model), 1)};`);
      expect(f["system/propsDict"]).toContain("molality { from 0.5; to 0.5; n 2; }");
      expect(f["system/controlDict"]).toContain("application   choupoProps;");
    }
  });

  it("Davies: free ions restrict the network; with pairs, the catalogue's network", () => {
    const free = emDaviesCaseFiles(Na2SO4, [0.2], false)["system/propsDict"]!;
    const pairs = emDaviesCaseFiles(Na2SO4, [0.2], true)["system/propsDict"]!;
    expect(free).toContain("networkScope restricted; network ( water-dissociation );");
    expect(free).toContain("analyticalTotals { Na 0.4 mol/kg; SO4 0.2 mol/kg; }");
    expect(pairs).not.toContain("networkScope");
    expect(pairs).toContain("activityModel davies;");
    expect(daviesMolalities(Na2SO4, [0.1, 0.6, 0.7]).length).toBe(2);   // I = 0.3, 1.8 kept; 2.1 not
  });
});

// The shapes the engine writes, from a native run of this tree.
const PKG_CSV_KCl_1 = "m,gamma_pm,phi,a_w\n1.00000000e+00,6.04880000e-01,8.99300000e-01,9.68100000e-01\n"
  + "1.00000000e+00,6.04880000e-01,8.99300000e-01,9.68100000e-01\n";

describe("reading the engine's answers, and not another question's", () => {
  it("reads a package CSV row", () => {
    expect(csvRow(PKG_CSV_KCl_1)).toEqual({ m: 1, gamma_pm: 0.60488, phi: 0.8993, a_w: 0.9681 });
    const run: RunLike = { csvFiles: { [emFile(emTag(KCl, "Pitzer"), 0)]: PKG_CSV_KCl_1 } };
    expect(readPackageRun(run, KCl, "Pitzer", [1])).toEqual([{ m: 1, gamma: 0.60488, phi: 0.8993, aw: 0.9681 }]);
  });

  it("a run that finishes after the salt changed is not read for the new salt (the race)", () => {
    //  A KCl answer still in flight when the student picks NaCl: its files are
    //  named for KCl, the NaCl reader looks up NaCl names, and finds nothing.
    const kclRun: RunLike = { csvFiles: { [emFile(emTag(KCl, "Pitzer"), 0)]: PKG_CSV_KCl_1 } };
    expect(readPackageRun(kclRun, NaCl, "Pitzer", [1])).toEqual([]);
    //  nor read as the other model, nor at a molality it was not asked.
    expect(readPackageRun(kclRun, KCl, "eNRTL", [1])).toEqual([]);
    expect(readPackageRun(kclRun, KCl, "Pitzer", [2])).toEqual([]);
    const dav: RunLike = { operationResults: [{ name: emOpName(emTag(KCl, "Davies"), 0),
      diagnostics: { aw: 0.9646, gamma_pm_K_Cl: 0.79 } }] };
    expect(readDaviesRun(dav, NaCl, [1], false)).toEqual([]);
    expect(readDaviesRun(dav, KCl, [1], false)).toHaveLength(1);
  });

  it("Davies with ion pairs: the stoichiometric mean from the free activities", () => {
    const tag = emTag(Na2SO4, "DaviesPairs");
    const m = 0.2;
    //  Free Na 0.35 mol/kg at activity 0.25, free SO4 0.15 at activity 0.05.
    const csv = "species,molality,activity,gamma\nNa,0.35,0.25,0.714\nSO4,0.15,0.05,0.333\n"
      + "NaSO4,0.05,0.04,0.8\nH,1e-7,1e-7,0.7\n";
    const run: RunLike = {
      operationResults: [{ name: emOpName(tag, 0), diagnostics: { aw: 0.99, gamma_pm_Na_SO4: 0.4 } }],
      csvFiles: { [emFile(tag, 0)]: csv },
    };
    const [p] = readDaviesRun(run, Na2SO4, [m], true);
    //  ((0.25^2 x 0.05) / ((0.4)^2 x 0.2))^(1/3)
    expect(p!.gamma).toBeCloseTo(Math.cbrt((0.0625 * 0.05) / (0.16 * 0.2)), 12);
    expect(p!.phi).toBeCloseTo(-Math.log(0.99) / (0.018015 * 3 * 0.2), 12);
  });

  it("deviations are taken only where the model was asked at the measured molality", () => {
    const t = measuredTable(NaCl);
    const r0 = t.rows[0]!;
    const d = deviation([{ m: r0.m, gamma: r0.gamma * 1.01, phi: r0.phi, aw: 1 }], t, "gamma");
    expect(d).toMatchObject({ n: 1 });
    expect(d!.aadPct).toBeCloseTo(1, 10);
  });
});

describe("the choice", () => {
  const base: ChoiceAnswers = { ionicStrength: "0.1to0.5", severalSalts: false, otherSolvent: false, acidGases: false };
  it("asks in the order that decides", () => {
    expect(chooseModel({ ...base, acidGases: true, severalSalts: true }).model).toBe("edwardsPitzer");
    expect(chooseModel({ ...base, otherSolvent: true, severalSalts: true }).model).toBe("eNRTL");
    expect(chooseModel({ ...base, severalSalts: true }).model).toBe("pitzerHMW");
    expect(chooseModel({ ...base, ionicStrength: "below0.1" }).model).toBe("davies");
    expect(chooseModel(base).model).toBe("pitzer");
    expect(chooseModel({ ...base, ionicStrength: "above0.5" }).model).toBe("pitzer");
  });
  it("points to EduTools that exist", () => {
    for (const a of [{ ...base, acidGases: true }, { ...base, severalSalts: true }]) {
      const t = chooseModel(a).seeTool!;
      expect(METHOD_TOOLS.find((x) => x.id === t)?.status).toBe("live");
    }
  });
  it("never ranks without a number: no 'best' in a verdict", () => {
    for (const a of [base, { ...base, acidGases: true }, { ...base, otherSolvent: true },
      { ...base, severalSalts: true }, { ...base, ionicStrength: "below0.1" as const }])
      for (const b of chooseModel(a).because) expect(b).not.toMatch(/\bbest\b/i);
  });
});

describe("the lesson", () => {
  it("every cited line still says what it is cited for", () => {
    for (const c of EM_CITATIONS) {
      const line = repo(c.file).split("\n")[c.line - 1] ?? "";
      expect(line, `${c.file}:${c.line}`).toContain(c.contains);
    }
  });
  it("has six steps, in order", () => {
    expect(EM_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("is registered live, on the shelf of its neighbour salt-mixing, with a real theory anchor", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "electrolyte-models")!;
    const sm = METHOD_TOOLS.find((x) => x.id === "salt-mixing")!;
    expect(t.status).toBe("live");
    expect(t.discipline).toBe(sm.discipline);
    expect(repo("docs/theoryGuide.tex")).toContain(`\\label{${t.theory}}`);
  });
  it("renders its lesson and controls before any run", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(ElectrolyteModelsTool)));
    expect(html).toContain("Choosing an electrolyte activity model");
    expect(html).toContain("Every model starts from the same term");
    expect(html).toContain("limiting law plot");
    expect(html).toContain("Hamer and Wu (1972)");
  });
});
