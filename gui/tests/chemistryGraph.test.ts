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
  chemistryGraph -- the READER of data/standards/routes/ and the three views'
  arithmetic (DEV.md 4c C191 A), held to hand calculations.

    (a) the reader parses every record: no refusal, the counts the gate
        measures (157 substances, 168 routes, 18 sources, 7 + 4 roots), no
        substance's formula/CAS/molar mass copied (they come from the
        catalogue record or the engine's element table);
    (b) THREE WORKED PRODUCTS, each against arithmetic written out here from
        the molar masses of the component records:
          PVC          kg ethylene and chlorine per kg PVC through VCM and EDC
          phenol       the Hock route, and the acetone it forces
          methanol     CO2 + 3 H2, and the H2 behind it by electrolysis;
    (c) the forced co-products, the hydrogen per carbon, the downstream
        closure and the tree-of-2050 grouping;
    (d) the honesty census: every yield band is `assumed`, only the IEA's
        energy figures are `literature`, three cumene routes link no case.

  WHAT THIS CANNOT PROVE: that a yield band is true of its route (it is the
  curator's estimate, and says so), or that the route list is complete.
\*---------------------------------------------------------------------------*/

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CHEMISTRY_GRAPH as G, formulaMass, parseAtomicWeights, parseFormula }
  from "../src/case/chemistryGraph.js";
import {
  census, defaultRoute, depthTree, downstream, forcedCoProducts, h2PerCarbon,
  routeInputs, rootRoutes, routesForcing, routesTo, stopReason,
} from "../src/case/chemistryGraphMath.js";

//  THE COUNTS ARE READ FROM THE RECORD TEXT, NOT TYPED HERE: a count pinned in
//  this file would go stale the day the curator adds a route.  The text is
//  counted with plain patterns that share nothing with the reader under test,
//  so a record the reader silently dropped shows as a difference.
const DIR = new URL("../../data/standards/routes/", import.meta.url);
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".dat")).sort();
const TEXT = Object.fromEntries(FILES.map((f) => [f, readFileSync(new URL(f, DIR), "utf-8")]));
const ROUTE_TEXT = FILES.filter((f) => f !== "graph.dat").map((f) => TEXT[f]!).join("\n");
const HEADER = TEXT["graph.dat"]!;
const strip = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const count = (t: string, re: RegExp): number => (strip(t).match(re) ?? []).length;
const between = (t: string, from: string): string => {
  const a = strip(t).indexOf(from);
  const rest = strip(t).slice(a);
  return rest.slice(0, rest.indexOf("\n);"));
};

const close = (a: number, b: number, rel = 1e-9): void => {
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));
};
const need = (d: ReturnType<typeof depthTree>, s: string) =>
  d.totals.find((t) => t.substance === s)!.need;

describe("the reader parses every record", () => {
  it("has no refusal, and reads as many records as the files hold", () => {
    expect(G.refusals).toEqual([]);
    expect(G.substances.length).toBe(count(between(HEADER, "substances\n("), /^\s*\{ name /gm));
    expect(G.sources.length).toBe(count(between(HEADER, "sources\n("), /^\s{4}\{\s*$/gm));
    expect(G.routes.length).toBe(count(ROUTE_TEXT, /^\s+name\s+\w+;\s*\n\s+kind\s+/gm));
    for (const kind of ["reaction", "separation", "processYield"])
      expect(G.routes.filter((r) => r.kind === kind).length, kind)
        .toBe(count(ROUTE_TEXT, new RegExp(`^\\s+kind\\s+${kind};`, "gm")));
    expect(G.routes.filter((r) => r.era === "transition").length)
      .toBe(count(ROUTE_TEXT, /^\s+era\s+transition;/gm));
    expect(G.routes.length).toBeGreaterThan(100);       // a collapsed scan would pass the line above
    expect(G.substances.length).toBeGreaterThan(100);
  });

  it("holds the architect's message: seven organic roots, four inorganic", () => {
    expect(G.roots.length).toBe(11);
    expect(G.roots.filter((r) => r.group === "organic").length).toBe(7);
    expect(G.roots.filter((r) => r.group === "inorganic").length).toBe(4);
  });

  it("gives every substance a molar mass (a lumped cut excepted) from its one home", () => {
    for (const s of G.substances) {
      if (s.kind === "lumped") {
        expect(s.molarMass, s.name).toBeNull();
        continue;
      }
      expect(s.molarMass, s.name).toBeGreaterThan(0);
      //  a record without an MW (gypsum) is summed from its own formula
      if (!s.component) expect(s.massFrom, s.name).toBe("formula");
    }
    //  read from the component record, not typed here:
    expect(G.byName.get("PVC")!.molarMass).toBe(62.5);
    expect(G.byName.get("ethylene")!.molarMass).toBe(28.054);
    expect(G.byName.get("ethylene")!.cas).toBe("74-85-1");
    //  and a node with no record takes the mass of its formula over the
    //  engine's own element table (urea: CH4N2O).
    const w = G.weights;
    close(G.byName.get("urea")!.molarMass!,
      w.get("C")! + 4 * w.get("H")! + 2 * w.get("N")! + w.get("O")!);
  });

  it("parses the engine's grammar, parentheses nested, comments dropped", () => {
    expect(parseFormula("Ca5(PO4)3F")).toEqual({ Ca: 5, P: 3, O: 12, F: 1 });
    expect(parseFormula("(NH4)2SO4")).toEqual({ N: 2, H: 8, S: 1, O: 4 });
    expect(parseFormula("C2H3Cl (-[CH2-CHCl]-)")).toEqual({ C: 2, H: 3, Cl: 1 });
    expect(parseFormula("CaSO4:2H2O")).toEqual({ Ca: 1, S: 1, O: 6, H: 4 });
    expect(parseFormula("C2H(")).toBeNull();
    const w = parseAtomicWeights('{ "H", 1.008 }, { "O", 15.999 }');
    close(formulaMass("H2O", w)!, 18.015);
    expect(formulaMass("XeO", w)).toBeNull();
  });

  it("every route's cases directory is named, never invented", () => {
    const c = census(G);
    const named = [...strip(ROUTE_TEXT).matchAll(/^\s+cases\s*\(([^)]*)\)/gm)]
      .flatMap((m) => [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!));
    expect(G.routes.reduce((n, r) => n + r.cases.length, 0)).toBe(named.length);
    expect(c.casesLinked).toBe(new Set(named).size);
    expect(routesTo(G, "cumene").map((r) => r.cases)).toEqual([[]]);
    expect(G.routeByName.get("cumeneAutoxidation")!.cases).toEqual([]);
    expect(G.routeByName.get("hockCleavage")!.cases).toEqual([]);
  });
});

describe("worked product 1: PVC from ethylene and chlorine", () => {
  const d = depthTree(G, "PVC", {});
  it("walks PVC <- VCM <- EDC <- ethylene + Cl2 and stops at the roots", () => {
    expect(d.top.route!.name).toBe("vinylChloridePolymerisation");
    const vcm = d.top.children[0]!;
    expect(vcm.substance).toBe("vinylChloride");
    expect(vcm.route!.name).toBe("EDCcracking");
    const edc = vcm.children[0]!;
    expect(edc.substance).toBe("Dichloroethane");
    expect(edc.route!.name).toBe("ethyleneDirectChlorination");
    expect(edc.children.map((c) => [c.substance, c.stop]))
      .toEqual([["ethylene", "root"], ["Cl2", "root"]]);
  });

  it("matches the hand arithmetic, as a BAND (ethylene and chlorine per kg PVC)", () => {
    //  The molar masses are the component records' (kg/kmol); the yields are
    //  the three routes' bands: polymerisation 0.85-0.95, EDC cracking
    //  0.95-0.99, direct chlorination 0.97-0.99.  The masses telescope.
    const M = { ethylene: 28.054, Cl2: 70.906, PVC: 62.5 };
    const yLo = 0.85 * 0.95 * 0.97, yHi = 0.95 * 0.99 * 0.99;
    const eth = need(d, "ethylene"), cl = need(d, "Cl2");
    close(eth.lo, (M.ethylene / M.PVC) / yHi);
    close(eth.hi, (M.ethylene / M.PVC) / yLo);
    close(cl.lo, (M.Cl2 / M.PVC) / yHi);
    close(cl.hi, (M.Cl2 / M.PVC) / yLo);
    //  rounded, so a reader can check by hand: 0.449 / 0.931 and 0.449 / 0.783
    expect(eth.lo).toBeCloseTo(0.4821, 3);
    expect(eth.hi).toBeCloseTo(0.5731, 3);
    expect(cl.lo).toBeCloseTo(1.2185, 3);
    expect(cl.hi).toBeCloseTo(1.4484, 3);
    //  the stoichiometric floor: one ethylene and one chlorine per repeat unit
    expect(eth.lo).toBeGreaterThan(M.ethylene / M.PVC);
  });

  it("puts the band on every edge, and the carbon it carries", () => {
    const edcEdge = d.top.children[0]!.edge!;           // VCM per kg PVC
    close(edcEdge.kgPerKgTarget.lo, (62.49822 / 62.5) / 0.95);
    close(edcEdge.kgPerKgTarget.hi, (62.49822 / 62.5) / 0.85);
    const ethEdge = d.nodes.find((n) => n.substance === "ethylene")!.edge!;
    close(ethEdge.kgPerKgTarget.lo, (28.054 / 98.959) / 0.99);
    //  ethylene is 2 x 12.011 / 28.054 carbon by mass
    close(ethEdge.carbonKgPerKgTarget.lo / ethEdge.kgPerKgTarget.lo, 2 * 12.011 / 28.054);
  });

  it("the balanced plant is a choice, with the HCl loop marked as a cycle", () => {
    expect(G.routeByName.get("ethyleneOxychlorination")!.cycle).toMatch(/balanced VCM plant/);
    const bal = depthTree(G, "PVC", { Dichloroethane: "ethyleneOxychlorination" });
    const edc = bal.nodes.find((n) => n.substance === "Dichloroethane")!;
    expect(edc.route!.name).toBe("ethyleneOxychlorination");
    //  HCl is then made from H2 + Cl2 here (no loop is invented), and O2 is a feedstock
    expect(bal.totals.map((t) => t.substance).sort())
      .toEqual(["Cl2", "H2", "O2", "ethylene"]);
  });
});

describe("worked product 2: phenol and the acetone it forces", () => {
  const d = depthTree(G, "phenol", {});
  it("reaches benzene and propylene through cumene", () => {
    expect(d.top.route!.name).toBe("hockCleavage");
    expect(d.nodes.map((n) => n.substance))
      .toEqual(["phenol", "cumeneHydroperoxide", "cumene", "benzene", "propylene", "O2"]);
    expect(stopReason(G, "benzene")).toBe("root");
    expect(stopReason(G, "O2")).toBe("feedstock");
  });

  it("matches the hand arithmetic for benzene per kg phenol", () => {
    const yLo = 0.95 * 0.93 * 0.97, yHi = 0.98 * 0.97 * 0.99;   // Hock, oxidation, alkylation
    const b = need(d, "benzene");
    close(b.lo, (78.114 / 94.11124) / yHi);
    close(b.hi, (78.114 / 94.11124) / yLo);
    expect(b.lo).toBeCloseTo(0.8820, 3);
    expect(b.hi).toBeCloseTo(0.9686, 3);
    const p = need(d, "propylene");
    close(p.lo, (42.081 / 94.11124) / yHi);
  });

  it("forces 0.617 kg acetone per kg phenol, at the stoichiometric ratio, with no band", () => {
    const co = forcedCoProducts(G, G.routeByName.get("hockCleavage")!);
    expect(co.map((c) => c.component)).toEqual(["acetone"]);
    close(co[0]!.kgPerKgTarget.lo, 58.08 / 94.11124);
    expect(co[0]!.kgPerKgTarget.lo).toBe(co[0]!.kgPerKgTarget.hi);
    expect(co[0]!.kgPerKgTarget.lo).toBeCloseTo(0.6171, 4);
    //  acetone is a product of the tree only by being FORCED here, and the
    //  graph also builds it on purpose (isopropanol), so it has both kinds.
    expect(routesForcing(G, "acetone").map((r) => r.name)).toContain("hockCleavage");
    expect(routesTo(G, "acetone").map((r) => r.name)).toContain("isopropanolDehydrogenation");
  });
});

describe("worked product 3: methanol from CO2 and H2 (a transition path)", () => {
  const choice = { methanol: "CO2toMethanol", H2: "waterElectrolysis" };
  const d = depthTree(G, "methanol", choice);
  it("takes the CO2 route at methanol and electrolysis at H2", () => {
    expect(d.top.route!.name).toBe("CO2toMethanol");
    const h2 = d.nodes.find((n) => n.substance === "H2")!;
    expect(h2.route!.name).toBe("waterElectrolysis");
    expect(d.totals.map((t) => t.substance).sort()).toEqual(["CO2", "water"]);
    //  the incumbent default, with no choices, stops at the root's own members
    const inc = depthTree(G, "methanol", {});
    expect(inc.top.route!.name).toBe("methanolSynthesis");
    expect(inc.totals.map((t) => t.substance).sort()).toEqual(["CO", "H2"]);
  });

  it("matches the hand arithmetic: 1.37 t CO2 and 0.19 t H2 per t methanol at full yield", () => {
    const y = { lo: 0.9, hi: 0.97 };
    close(need(d, "CO2").lo, (44.01 / 32.042) / y.hi);
    close(need(d, "CO2").hi, (44.01 / 32.042) / y.lo);
    const h2 = d.nodes.find((n) => n.substance === "H2")!;
    close(h2.need.lo, (3 * 2.016 / 32.042) / y.hi);
    close(h2.need.hi, (3 * 2.016 / 32.042) / y.lo);
    expect(44.01 / 32.042).toBeCloseTo(1.3735, 4);
    expect(3 * 2.016 / 32.042).toBeCloseTo(0.1888, 4);
    //  water behind the H2: 2 H2O -> 2 H2 + O2, yield band 0.99-1
    const w = need(d, "water");
    close(w.lo, (3 * 2.016 / 32.042) / y.hi * (2 * 18.015 / (2 * 2.016)) / 1);
    close(w.hi, (3 * 2.016 / 32.042) / y.lo * (2 * 18.015 / (2 * 2.016)) / 0.99);
  });

  it("derives H2 per carbon from the stoichiometry, never stores it", () => {
    const h2c = (n: string): number | null => h2PerCarbon(G, G.routeByName.get(n)!);
    expect(h2c("CO2toMethanol")).toBe(3);
    expect(h2c("CO2methanation")).toBe(4);
    expect(h2c("reverseWaterGasShift")).toBe(1);
    expect(h2c("methanolSynthesis")).toBe(2);
    close(h2c("MTAtoluene")!, -3 / 7);             // releases H2: -(+3) / (1 x 7 C)
    expect(h2c("MTOethylene")).toBe(0);             // no H2 in the step
    expect(h2c("naphthaSteamCracking")).toBeNull(); // a slate has no stoichiometry
  });
});

describe("the convergence view", () => {
  it("lists what a root feeds and what depends on it", () => {
    const d = downstream(G, "ethylene");
    const names = d.reached.map((x) => x.substance);
    expect(names).toContain("PVC");
    expect(names).toContain("nylon66");           // ethylene -> ... -> via benzene? no: via cyclohexane chain
    expect(d.reached.length).toBeGreaterThan(20);
    expect(d.leaves).toContain("PVC");
    expect(d.leaves).not.toContain("ethyleneOxide");
  });

  it("a cracker's slate is forced co-production, stated as a band per kg of ethylene", () => {
    const r = G.routeByName.get("naphthaSteamCracking")!;
    const co = forcedCoProducts(G, r);
    expect(co.map((c) => c.component))
      .toEqual(["propylene", "mixedC4", "pyrolysisGasoline", "H2", "CH4"]);
    const p = co.find((c) => c.component === "propylene")!;
    close(p.kgPerKgTarget.lo, 0.13 / 0.34);
    close(p.kgPerKgTarget.hi, 0.17 / 0.28);
    const feed = routeInputs(G, r)[0]!;
    expect(feed.component).toBe("naphtha");
    close(feed.kgPerKgTarget.lo, 1 / 0.34);
    close(feed.kgPerKgTarget.hi, 1 / 0.28);
  });

  it("a route with a forced co-product is derived from the stoichiometry, never listed", () => {
    const cr = G.routeByName.get("chlorAlkaliElectrolysis")!;
    expect(forcedCoProducts(G, cr).map((c) => c.component).sort()).toEqual(["H2", "NaOH"]);
  });
});

describe("the tree of 2050", () => {
  it("groups routes by the root they produce and by era", () => {
    const syngas = G.roots.find((r) => r.name === "syngas")!;
    const rr = rootRoutes(G, syngas);
    expect(rr.incumbent.map((r) => r.name)).toContain("steamMethaneReforming");
    expect(rr.transition.map((r) => r.name)).toEqual(
      expect.arrayContaining(["waterElectrolysis", "CO2toMethanol", "reverseWaterGasShift"]));
  });

  it("the ammonia edge is written once: only its feeder (H2) is replaced", () => {
    const nh3 = G.roots.find((r) => r.name === "ammonia")!;
    const rr = rootRoutes(G, nh3);
    expect(rr.incumbent.map((r) => r.name)).toEqual(["ammoniaSynthesis"]);
    expect(rr.transition).toEqual([]);
    const h2 = rr.feeders.find((f) => f.reactant === "H2")!;
    expect(h2.transition.map((r) => r.name)).toContain("waterElectrolysis");
    expect(h2.incumbent.map((r) => r.name)).toContain("waterGasShift");
  });

  it("a root with no transition route says so (sulfuric acid)", () => {
    const rr = rootRoutes(G, G.roots.find((r) => r.name === "sulfuricAcid")!);
    expect(rr.transition).toEqual([]);
    expect(rr.feeders).toEqual([]);
  });

  it("every root has its incumbent route or its feeder", () => {
    for (const root of G.roots) {
      const rr = rootRoutes(G, root);
      expect(rr.incumbent.length + rr.transition.length, root.name).toBeGreaterThan(0);
    }
  });

  it("the default route is the first incumbent that closes no cycle", () => {
    expect(defaultRoute(G, "Dichloroethane")!.name).toBe("ethyleneDirectChlorination");
    expect(defaultRoute(G, "ethylene")!.era).toBe("incumbent");
  });
});

describe("the honesty census", () => {
  const c = census(G);
  it("counts the bands: every yield and slate share is assumed", () => {
    expect(c.bands.total).toBe(c.bands.assumed + c.bands.literature);
    expect(c.bands.yieldSlateAssumed).toBe(189);
    for (const r of G.routes) {
      if (r.yield) expect(r.yield.origin, r.name).toBe("assumed");
      for (const s of r.slate) expect(s.origin, `${r.name}/${s.component}`).toBe("assumed");
      for (const e of r.energy) expect(["assumed", "literature"]).toContain(e.origin);
    }
  });
  it("only the four IEA ammonia intensities are literature, each with its locus", () => {
    const lit = G.routes.flatMap((r) => r.energy.filter((e) => e.origin === "literature")
      .map((e) => ({ r: r.name, e })));
    expect(lit.length).toBe(4);
    for (const x of lit) {
      expect(x.r).toBe("ammoniaSynthesis");
      expect(x.e.locus.length).toBeGreaterThan(10);
    }
  });
  it("an assumed band always carries its reason", () => {
    for (const r of G.routes) {
      if (r.yield?.origin === "assumed") expect(r.yield.reason.length, r.name).toBeGreaterThan(10);
      for (const s of r.slate) if (s.origin === "assumed") expect(s.reason.length, r.name).toBeGreaterThan(0);
    }
  });
});
