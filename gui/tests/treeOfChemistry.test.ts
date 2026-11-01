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
  treeOfChemistry -- the EduTool page (DEV.md 4c C191 A), held to what it says.

  The reader and the arithmetic are in tests/chemistryGraph.test.ts.  Here:

    (a) the registry entry: the shelf, the kind, the origins;
    (b) the HONESTY RULES, on the rendered page: the first screen says every
        band is the curator's estimate, with the census read from the records;
        an assumed band is drawn as one, with its reason; a route with no
        Choupo case says "no case yet" and links nothing; a route with one
        links to a case directory that exists;
    (c) the three views for the worked products, read off the rendered tables;
    (d) the lesson's claims against the records they describe;
    (e) the depth layout.

  WHAT THIS CANNOT PROVE: that the React Flow picture draws what the table
  says (React Flow draws nothing without a measured container, so the
  picture is held by the table beside it), or that a band is true.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { tutorialByName } from "../src/cases/tutorials.js";
import { CHEMISTRY_GRAPH as G } from "../src/case/chemistryGraph.js";
import {
  census, depthTree, downstream, h2PerCarbon, replacement, rootRoutes, routesTo,
} from "../src/case/chemistryGraphMath.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import {
  TREE_LIMITS, TREE_QUIZ, TREE_STEPS,
} from "../src/ui/methods/treeOfChemistryLesson.js";
import {
  ConvergencePanel, DepthPanel, ForcedPanel, TreeOf2050Panel, TreeOfChemistryTool,
  caseNameOf, layoutDepth,
} from "../src/ui/methods/TreeOfChemistryTool.js";

const render = (el: JSX.Element): string =>
  renderToStaticMarkup(createElement(MantineProvider, null, el));
const textOf = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("tree-of-chemistry: the registry entry", () => {
  const t = METHOD_TOOLS.find((m) => m.id === "tree-of-chemistry");
  it("is live on the design & economics shelf, as notes, with its three origins", () => {
    expect(t).toBeTruthy();
    expect(t!.status).toBe("live");
    expect(t!.kind).toBe("notes");
    expect(t!.discipline).toBe("Process design & economics");
    expect(t!.origins).toEqual(["page", "reference", "assumption"]);
    expect(t!.theory).toBe("ch:balances");
  });
  it("says in its teaching line that the transition replaces the roots, not the leaves", () => {
    expect(t!.teaches).toMatch(/replaces the roots, not the leaves/);
    expect(t!.teaches).toMatch(/curator's estimate/);
  });
});

describe("tree-of-chemistry: the guide names the tool", () => {
  it("the EduTools guide has the section, with the tool id and the anchor it declares", () => {
    const tex = readFileSync(new URL("../../docs/eduToolsGuide.tex", import.meta.url), "utf-8");
    expect(tex).toContain("\\label{sec:edu-tree-of-chemistry}");
    expect(tex).toContain("\\code{tool=tree-of-chemistry}");
    const at = tex.indexOf("\\label{sec:edu-tree-of-chemistry}");
    expect(tex.slice(at, at + 200)).toContain("\\declaredanchor{ch:balances}");
    const t = METHOD_TOOLS.find((m) => m.id === "tree-of-chemistry")!;
    const th = readFileSync(new URL("../../docs/theoryGuide.tex", import.meta.url), "utf-8");
    expect(th).toContain(`\\label{${t.theory}}`);
  });
});

describe("tree-of-chemistry: the honesty rules on the rendered page", () => {
  const html = render(createElement(TreeOfChemistryTool));
  const text = textOf(html);
  const c = census(G);

  it("says on the first screen, before the first lesson step, that every band is an estimate", () => {
    const alertAt = text.indexOf("Read the numbers as estimates");
    expect(alertAt).toBeGreaterThan(-1);
    expect(alertAt).toBeLessThan(text.indexOf(TREE_STEPS[0]!.title));
    expect(c.bands.yieldSlateAssumed).toBe(189);          // the gate's "189 of 189"
    expect(text).toContain(`All ${c.bands.yieldSlateAssumed} yield and slate bands`);
    expect(text).toContain("origin assumed");
    expect(text).toContain(`${c.routesWithoutCase} of the ${c.routes} routes link no Choupo case yet`);
    expect(c.bands.literature).toBe(4);
    expect(G.volumes.length).toBe(5);
  });

  it("draws every assumed band as the curator's estimate, never as a bare number", () => {
    expect(html).toContain('data-band-kind="assumed"');
    expect(html).not.toContain('data-band-kind="literature"'.replace("literature", "measured"));
    // every band cell on the default (PVC) view carries the estimate mark
    expect(html.match(/data-band-kind="assumed"/g)!.length).toBeGreaterThan(8);
    expect(html).toContain("est.");
    // and the selected node's detail row writes the reason out in plain text
    const plain = text.replace(/&#x27;/g, "'");
    expect(plain).toContain("the curator's estimate:");
    expect(plain).toContain(G.routeByName.get("vinylChloridePolymerisation")!.yield!.reason);
  });

  it("refuses nothing and prints no NaN or undefined", () => {
    expect(G.refusals).toEqual([]);
    expect(html).not.toContain("data-refusals");
    expect(text).not.toMatch(/\bNaN\b|\bundefined\b|Infinity/);
  });

  it("draws the lesson, the sources with their licences, the quiz and the limits", () => {
    for (const s of TREE_STEPS) expect(text, s.title).toContain(s.title);
    for (const s of G.sources) expect(html).toContain(`data-source="${s.id}"`);
    expect(text).toContain("citedWork");
    expect(text).toContain("ccBy4");
    expect(text).toContain("bibliographicRecord");
    for (const q of TREE_QUIZ) expect(html).toContain(`data-quiz-question="${q.id}"`);
    for (const l of TREE_LIMITS) expect(text).toContain(l.title);
    for (const r of G.roots) expect(html).toContain(`data-root-row="${r.name}"`);
  });
});

describe("tree-of-chemistry: cases are linked when they exist and never invented", () => {
  it("every case a route names is a tutorial the app resolves", () => {
    const missing = G.routes.flatMap((r) => r.cases)
      .filter((c) => tutorialByName(caseNameOf(c)) === undefined);
    expect(missing).toEqual([]);
  });

  it("a route with no case says 'no case yet' and links nothing (phenol: the three cumene routes)", () => {
    const html = render(createElement(DepthPanel, { initialProduct: "phenol" }));
    expect(html).toContain("data-no-case");
    expect(textOf(html)).toContain("no case yet");
    // select the cumene node's route through the page's own detail: hockCleavage has none
    expect(html).not.toContain("data-case-link");
    for (const n of ["benzenePropylation", "cumeneAutoxidation", "hockCleavage"])
      expect(G.routeByName.get(n)!.cases).toEqual([]);
  });

  it("a route with a case links to it as the app's ?case= address", () => {
    const html = render(createElement(DepthPanel, { initialProduct: "methanol" }));
    expect(html).toContain('data-case-link="tutorials/');
    expect(html).toContain("?case=");
    expect(html).toContain("steady%2Freactors%2F");    // the encoded tutorial name
  });
});

describe("view 1, depth: the three worked products on the page", () => {
  it("PVC: ethylene and chlorine per kg, as bands, from the rendered totals", () => {
    const html = render(createElement(DepthPanel, { initialProduct: "PVC" }));
    const t = textOf(html);
    expect(t).toContain("Raw materials per kg of poly(vinyl chloride)");
    //  hand arithmetic (chemistryGraph.test.ts): 0.4821 to 0.5731 and 1.2185 to 1.4484
    expect(t).toMatch(/ethylene root 0\.482 to 0\.573/);
    expect(t).toMatch(/chlorine root 1\.22 to 1\.45/);
    for (const r of ["vinylChloridePolymerisation", "EDCcracking", "ethyleneDirectChlorination"])
      expect(t).toContain(r);
  });

  it("phenol: benzene and propylene through cumene, with the forced acetone listed on the edge", () => {
    const html = render(createElement(DepthPanel, { initialProduct: "phenol" }));
    const t = textOf(html);
    expect(t).toMatch(/benzene root 0\.882 to 0\.969/);
    expect(t).toContain("acetone 0.617");
  });

  it("methanol by CO2 + H2, hydrogen from water", () => {
    const html = render(createElement(DepthPanel, {
      initialProduct: "methanol",
      initialChoices: { methanol: "CO2toMethanol", H2: "waterElectrolysis" } }));
    const t = textOf(html);
    expect(t).toContain("CO2toMethanol");
    expect(t).toContain("waterElectrolysis");
    // 44.01/32.042/y with y in 0.90-0.97: 1.416 to 1.526
    expect(t).toMatch(/carbon dioxide feedstock 1\.42 to 1\.53/);
    // every alternative route to methanol is a button
    for (const r of routesTo(G, "methanol")) expect(html).toContain(`data-alt="${r.name}"`);
  });
});

describe("view 2, convergence and forced co-production", () => {
  it("the cracker's slate: every co-product forced, the target marked, the shares bands", () => {
    const html = render(createElement(ForcedPanel, { initialRoute: "naphthaSteamCracking" }));
    expect(html).toContain('data-output="ethylene"');
    expect(html.match(/data-forced="yes"/g)!.length).toBe(5);
    expect(html.match(/data-forced="no"/g)!.length).toBe(1);
    expect(textOf(html)).toContain("TARGET");
    expect(html).toContain('data-band-kind="assumed"');
  });

  it("the Hock cleavage: the acetone is a point, not a band, and not an estimate", () => {
    const html = render(createElement(ForcedPanel, { initialRoute: "hockCleavage" }));
    expect(html).toContain('data-output="acetone"');
    expect(html).toContain('data-band-kind="stoichiometry"');
    expect(textOf(html)).toContain("0.617");
  });

  it("a root's dependants are counted from the records", () => {
    const html = render(createElement(ConvergencePanel, { initialSubstance: "ethylene" }));
    const d = downstream(G, "ethylene");
    expect(textOf(html)).toContain(`${d.reached.length} substances are reachable from ethylene`);
    // the IEA volume is shown with its source and licence
    const nh3 = render(createElement(ConvergencePanel, { initialSubstance: "NH3" }));
    expect(textOf(nh3)).toMatch(/185 Mt\/yr/);
    expect(textOf(nh3)).toContain("ccBy4");
  });
});

describe("view 3, the tree of 2050", () => {
  it("the overview names, for every root, how it is replaced -- and sulfuric acid is not", () => {
    const html = render(createElement(TreeOf2050Panel));
    for (const r of G.roots) expect(html).toContain(`data-root-replacement="${r.name}"`);
    const how = (name: string): string =>
      replacement(rootRoutes(G, G.roots.find((r) => r.name === name)!));
    expect(how("syngas")).toBe("root");
    expect(how("ethylene")).toBe("root");
    expect(how("ammonia")).toBe("feeder");
    expect(how("sulfuricAcid")).toBe("none");
    expect(html).toContain('data-replacement="none"');
    // benzene is only yielded by the lignin route, which is built for phenol
    expect(how("benzene")).toBe("yield");
  });

  it("the ammonia root shows the unchanged edge and the replaced feeder", () => {
    const html = render(createElement(TreeOf2050Panel, { initialRoot: "ammonia" }));
    expect(html).toContain('data-route-card="ammoniaSynthesis"');
    expect(html).toContain("data-no-transition");
    expect(html).toContain("data-feeders");
    expect(textOf(html)).toContain("waterElectrolysis");
  });

  it("shows hydrogen per carbon from the stoichiometry and the origin of every energy figure", () => {
    const html = render(createElement(TreeOf2050Panel, { initialRoot: "syngas" }));
    expect(html).toContain('data-route-card="CO2toMethanol"');
    expect(html).toContain('data-h2-per-carbon="3"');
    expect(textOf(html)).toContain("H2 per carbon: 3.00 (consumed)");
    // the electrolyser's kWh/kg is the curator's estimate, drawn as one
    expect(html).toMatch(/data-energy-origin="assumed"/);
    const nh3 = render(createElement(TreeOf2050Panel, { initialRoot: "ammonia" }));
    expect(nh3).toMatch(/data-energy-origin="literature"/);
    expect(textOf(nh3)).toContain("read from");
  });
});

describe("the lesson says what the records say", () => {
  const stepText = (n: number): string => TREE_STEPS.find((s) => s.n === n)!.body;

  it("step 1: seven organic roots and four inorganic ones", () => {
    expect(G.roots.filter((r) => r.group === "organic").length).toBe(7);
    expect(G.roots.filter((r) => r.group === "inorganic").length).toBe(4);
    expect(stepText(1)).toContain("seven organic roots");
    expect(stepText(1)).toContain("four inorganic");
  });

  it("step 4: the balanced VCM plant is a declared cycle", () => {
    expect(G.routeByName.get("ethyleneOxychlorination")!.cycle).not.toBeNull();
    expect(stepText(4)).toContain("declared cycle");
  });

  it("step 5: the cleavage forms phenol and acetone one to one, and nothing else", () => {
    const hock = G.routeByName.get("hockCleavage")!;
    expect(hock.stoichiometry.map((t) => [t.component, t.nu]))
      .toEqual([["cumeneHydroperoxide", -1], ["phenol", 1], ["acetone", 1]]);
    expect(stepText(5)).toContain("one mole of phenol and one mole of");
    // the quiz quotes 0.62 kg acetone per kg phenol
    expect(58.08 / 94.11124).toBeCloseTo(0.62, 2);
    expect(TREE_QUIZ.find((q) => q.id === "forced-acetone")!.feedback).toContain("0.62");
  });

  it("step 6: ethylene's dependants include what the step names", () => {
    const names = downstream(G, "ethylene").reached.map((x) => x.substance);
    for (const s of ["polyethylene", "PVC", "polystyrene", "PET", "vinylAcetate"])
      expect(names, s).toContain(s);
  });

  it("step 7: CO2 to methanol 3, CO2 to methane 4, the reverse shift 1; toluene releases H2", () => {
    const h = (n: string): number | null => h2PerCarbon(G, G.routeByName.get(n)!);
    expect([h("CO2toMethanol"), h("CO2methanation"), h("reverseWaterGasShift")]).toEqual([3, 4, 1]);
    expect(h("MTAtoluene")!).toBeLessThan(0);
    expect(stepText(7)).toMatch(/three, CO2 to methane four, the reverse\s+water-gas shift one/);
    expect(TREE_QUIZ.find((q) => q.id === "h2-per-carbon")!.options[2]).toBe("3");
  });

  it("step 8: the ammonia edge is written once", () => {
    expect(routesTo(G, "NH3").map((r) => r.name)).toEqual(["ammoniaSynthesis"]);
    expect(routesTo(G, "H2").some((r) => r.era === "transition")).toBe(true);
  });

  it("step 9: every yield band is assumed; only the IEA's figures are literature", () => {
    const c = census(G);
    expect(c.bands.yieldSlateAssumed).toBe(c.bands.yields + c.bands.slates);
    expect(c.bands.energyAssumed + c.bands.literature).toBe(c.bands.energies);
    for (const r of G.routes) if (r.yield) expect(r.yield.origin).toBe("assumed");
    expect(c.bands.literature).toBe(4);
    expect(stepText(9)).toContain("IEA");
  });
});

describe("the depth layout", () => {
  it("puts the product on the right and its raw materials to the left, every box once", () => {
    const d = depthTree(G, "PVC", {});
    const pos = layoutDepth(d.top);
    expect(Object.keys(pos).length).toBe(d.nodes.length);
    const xTop = pos[d.top.key]!.x;
    for (const n of d.nodes) expect(pos[n.key]!.x).toBeLessThanOrEqual(xTop);
    for (const n of d.nodes)
      for (const ch of n.children) expect(pos[ch.key]!.x).toBeLessThan(pos[n.key]!.x);
    const leaves = d.nodes.filter((n) => n.children.length === 0).map((n) => pos[n.key]!.y);
    expect(new Set(leaves).size).toBe(leaves.length);
  });
});
