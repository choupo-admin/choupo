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
  openMolecularToolsLesson -- "From molecules to properties: the open tools",
  held to what it claims about itself:

    * every card says what the program computes, its licence and the document
      the licence was read from, an https page, how to try it with no
      installation, an example marked ran or not run, where it meets Choupo
      and a thesis idea; the six questions each have at least one card;
    * every file:line the page names about Choupo is read back against the
      tree, every case it names exists, every Theory Guide label it names is
      defined, and the RRHO tool and records the page names as Choupo's exist
      in this tree (so the sentence stays true, or this test says to rewrite it);
    * the page is registered, on the shelf of property data, with a Theory
      Guide destination that exists, and its reference list is drawn;
    * the steps keep the C277 text budget;
    * the rendered page draws every card, every question, every step and the
      chain, and prints no NaN or "undefined".

  WHAT THIS CANNOT PROVE: that a licence or a description still reads, today,
  as it did on 2026-11-22, or that an example still runs with newer versions
  of its program.  The page prints the date and the versions; re-reading is a
  person's work.  The `ran` status was set by running each block, once,
  by hand, in a scratch environment; no test here re-runs a Python program.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  CITATIONS, OT_CARDS, OT_CASES, OT_CHAIN, OT_GROUPS, OT_LABELS, OT_LIMITS, OT_STEPS,
} from "../src/ui/methods/openMolecularToolsLesson.js";
import { OpenMolecularToolsTool } from "../src/ui/methods/OpenMolecularToolsTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const ROOT = new URL("../../", import.meta.url);
const lines = (rel: string): string[] =>
  readFileSync(new URL(rel, ROOT), "utf-8").split("\n");
const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

describe("open-molecular-tools: the cards", () => {
  it("carries the programs of the approved scope, and the two Choupo cards", () => {
    expect(OT_CARDS.map((c) => c.id).sort()).toEqual([
      "cantera", "cassandra", "choupo-gc", "clapeyron", "coolprop", "cosmosac-choupo",
      "gomc", "opencosmo", "psi4", "pyscf", "raspa", "rdkit", "thermo", "ugropy", "xtb"]);
  });
  it("every card has every field the task asks for", () => {
    for (const c of OT_CARDS) {
      for (const f of ["computes", "licenceHow", "noInstall", "meets", "thesis"] as const)
        expect(c[f].trim().length, `${c.id}.${f}`).toBeGreaterThan(30);
      expect(c.licence.trim().length, c.id).toBeGreaterThan(2);
      expect(c.url, c.id).toMatch(/^https?:\/\//);
      expect(c.code.install.trim().length, `${c.id} install`).toBeGreaterThan(5);
      expect(c.code.evidence.trim().length, `${c.id} evidence`).toBeGreaterThan(30);
    }
  });
  it("every program's licence is one of the identifiers read, or says it was not verified", () => {
    const ok = /^(Apache-2\.0|LGPL-3\.0|MIT|BSD-3-Clause|GPL-3\.0|GPL-3\.0-or-later|licence not verified)/;
    for (const c of OT_CARDS) expect(c.licence, c.id).toMatch(ok);
  });
  it("every card sits in a group, and every question has a card", () => {
    const groups = new Set(OT_GROUPS.map((g) => g.id));
    for (const c of OT_CARDS) expect(groups.has(c.group), c.id).toBe(true);
    for (const g of OT_GROUPS)
      expect(OT_CARDS.some((c) => c.group === g.id), g.id).toBe(true);
  });
  it("an example that says ran has code or a case to run; one that says not run says why", () => {
    for (const c of OT_CARDS) {
      if (c.code.status === "ran")
        expect(c.code.lines.length > 0 || /^runCase /.test(c.code.install), c.id).toBe(true);
      if (c.code.status === "not run")
        expect(c.code.evidence, c.id).toMatch(/not executed|no pasteable|no example was run/);
    }
  });
  it("a Python example is real code: balanced brackets and no placeholder", () => {
    for (const c of OT_CARDS.filter((x) => x.code.language === "python")) {
      const src = c.code.lines.join("\n");
      for (const [o, cl] of [["(", ")"], ["[", "]"], ["{", "}"]] as const)
        expect(src.split(o).length, `${c.id} ${o}`).toBe(src.split(cl).length);
      expect(src, c.id).not.toMatch(/\.\.\.|TODO|<[a-z]+>/);
    }
  });
  it("the two programs that need a restricted program beside them say so", () => {
    const oc = OT_CARDS.find((c) => c.id === "opencosmo")!;
    expect(oc.code.evidence).toMatch(/not open source/);
    const cs = OT_CARDS.find((c) => c.id === "cosmosac-choupo")!;
    expect(cs.licenceHow).toMatch(/narrower licence than its code/);
    expect(cs.licenceHow).toMatch(/non-commercial/);
  });
  it("openCOSMO-RS names the licence disagreement it found", () => {
    const oc = OT_CARDS.find((c) => c.id === "opencosmo")!;
    expect(oc.licenceHow).toMatch(/GPL v2\.0/);
    expect(oc.licenceHow).toMatch(/LGPL/);
  });
  it("no card names a closed process simulator or a commercial property program", () => {
    const all = JSON.stringify(OT_CARDS) + JSON.stringify(OT_STEPS);
    expect(all).not.toMatch(/COSMOtherm|DMol3|BioVia|TURBOMOLE|Gaussian/i);
    expect(all.match(/ORCA/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(all).not.toMatch(/\b(aspen|hysys|dwsim|gproms|chemcad|prosim|unisim|promax)\b/i);
  });
});

describe("open-molecular-tools: what the page says about Choupo is true", () => {
  it("every file:line it names is in the tree and says what it is cited for", () => {
    expect(CITATIONS.length).toBeGreaterThanOrEqual(10);
    for (const c of CITATIONS) {
      const at = lines(c.file)[c.line - 1] ?? "";
      expect(at, `${c.file}:${c.line} should contain "${c.contains}"`).toContain(c.contains);
    }
  });
  it("every case it names exists", () => {
    for (const d of OT_CASES) {
      expect(existsSync(new URL(`${d}/system/controlDict`, ROOT)), d).toBe(true);
    }
  });
  it("every case written in a card is among the named cases", () => {
    const prose = OT_CARDS.map((c) => `${c.code.install} ${c.code.evidence} ${c.meets} ${c.computes}`).join("\n");
    const found = [...prose.matchAll(/tutorials\/[\w/]+/g)].map((m) => m[0]);
    expect(found.length).toBeGreaterThanOrEqual(2);
    for (const f of found) expect(OT_CASES, f).toContain(f);
  });
  it("every Theory Guide label it names is defined", () => {
    const tex = readFileSync(new URL("docs/theoryGuide.tex", ROOT), "utf-8");
    for (const l of OT_LABELS) expect(tex, l).toContain(`\\label{${l}}`);
    const prose = OT_CARDS.map((c) => c.meets).join("\n");
    for (const m of prose.matchAll(/\b((?:sec|ch):[\w-]+)/g))
      expect(OT_LABELS, m[1]).toContain(m[1]);
  });
  it("the RRHO tool and records the page names exist in this tree", () => {
    const p = OT_CARDS.find((c) => c.id === "psi4")!;
    expect(p.thesis).toMatch(/bin\/curate\/rrho_thermo\.py, does it for nine species/);
    expect(existsSync(new URL("bin/curate/rrho_thermo.py", ROOT))).toBe(true);
    expect(existsSync(new URL("data/standards/thermoTables/RRHO-computed/", ROOT))).toBe(true);
  });
  it("ethanol's catalogue groups are the ones ugropy's example prints", () => {
    const rec = lines("data/standards/components/ethanol.dat");
    const u = OT_CARDS.find((c) => c.id === "ugropy")!;
    expect(rec[102]).toMatch(/CH3.*CH2.*OH/);
    expect(u.code.evidence).toContain("{'CH3': 1, 'CH2': 1, 'OH': 1}");
    expect(rec[103]).toContain("OH_p");
    expect(u.code.evidence).toContain("'OH (P)'");
  });
  it("the xtb card's entropy gap is the arithmetic of its two numbers", () => {
    const x = OT_CARDS.find((c) => c.id === "xtb")!;
    expect(x.code.evidence).toContain("269.3 J/(mol K)");
    expect(x.meets).toContain("281.620");
    expect(281.620 - 269.3).toBeCloseTo(12.3, 1);
    expect(x.meets).toContain("12 J/(mol K)");
  });
  it("the water entropies printed by the two quantum cards are within 0.5 % of each other", () => {
    const a = Number(/S = ([\d.]+) J\/\(mol K\) for water/.exec(
      OT_CARDS.find((c) => c.id === "pyscf")!.code.evidence)![1]);
    const b = Number(/S = ([\d.]+) J\/\(mol K\) at 298\.15 K/.exec(
      OT_CARDS.find((c) => c.id === "psi4")!.code.evidence)![1]);
    expect(Math.abs(a - b) / b).toBeLessThan(0.005);
  });
});

describe("open-molecular-tools: the registry and the references", () => {
  const tool = METHOD_TOOLS.find((m) => m.id === "open-molecular-tools");
  it("is a live notes page on the property-data shelf with a real Theory Guide label", () => {
    expect(tool).toBeTruthy();
    expect(tool!.kind).toBe("notes");
    expect(tool!.status).toBe("live");
    expect(tool!.discipline).toBe("Property data & parameters");
    expect(OT_LABELS).toContain(tool!.theory);
    expect(tool!.origins).toEqual(["reference"]);
  });
  it("its blurb is twelve words or fewer", () => {
    expect(words(tool!.blurb)).toBeLessThanOrEqual(12);
  });
  it("its reference list covers every program that has a paper", () => {
    const refs = JSON.parse(readFileSync(
      new URL("gui/src/ui/methods/lessonReferences.json", ROOT), "utf-8"))
      .lessons["open-molecular-tools"];
    expect(refs.pageSources).toBe("The cards");
    const text = refs.references.map((r: { text: string }) => r.text).join("\n");
    for (const needle of ["PySCF", "PSI4", "GFN2-xTB", "COSMO-SAC", "COSMO-RS", "UNIFAC",
      "Perturbed-Chain", "Clapeyron", "Cassandra", "GOMC", "RASPA", "CoolProp",
      "thermo", "ugropy", "RDKit", "Cantera", "quantum-chemistry program"])
      expect(text, needle).toContain(needle);
  });
});

describe("open-molecular-tools: the text budget", () => {
  it("each step keeps at most 60 words in its body and 40 in its note", () => {
    for (const s of OT_STEPS) {
      expect(words(s.body), `step ${s.n} body`).toBeLessThanOrEqual(60);
      if (s.note) expect(words(s.note), `step ${s.n} note`).toBeLessThanOrEqual(40);
    }
    expect(OT_LIMITS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("open-molecular-tools: the rendered page", () => {
  const html = renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(OpenMolecularToolsTool)));
  it("draws every card with its code, its meeting point and its thesis", () => {
    for (const c of OT_CARDS) {
      expect(html, c.id).toContain(`data-ot-card="${c.id}"`);
      expect(html, `${c.id} code`).toContain(`data-ot-code="${c.id}"`);
      expect(html, `${c.id} thesis`).toContain(`data-ot-thesis="${c.id}"`);
    }
  });
  it("draws every question, every chain box and every step", () => {
    for (const g of OT_GROUPS) expect(html, g.id).toContain(`data-ot-group="${g.id}"`);
    for (const b of OT_CHAIN) expect(html, b.id).toContain(`data-ot-chain-box="${b.id}"`);
    for (const s of OT_STEPS) expect(html, `step ${s.n}`).toContain(s.title);
  });
  it("prints the example lines of a card", () => {
    expect(html).toContain("from ugropy import Groups");
    expect(html).toContain("ran 2026-11-22");
    expect(html).toContain("not run");
  });
  it("draws the references and prints no NaN and no undefined", () => {
    expect(html).toContain("data-lesson-references");
    expect(html).not.toMatch(/NaN|undefined/);
  });
});
