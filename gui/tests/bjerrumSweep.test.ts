/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  bjerrumSweep — the species-distribution lens's reshape and its log reads.

  WHAT THIS GATE CLAIMS.  The lens computes no physics, so what can go wrong is
  BOOKKEEPING, and each arm below pins one piece of it:

    * the pH grid has ONE home and the dict the engine runs is built from it,
      so the row labels and the operations cannot drift apart;
    * a blocked sweep reassembles by GLOBAL index — the op names and the output
      filenames carry it, and a block that starts at 12 must not write the
      file the first block already wrote;
    * the charge residual is READ, and read PER POINT.  Its fixtures are
      verbatim `choupoProps` output (run 2026-08-19), including the two spellings
      the solver uses for the two meanings of that number: an imposed pH is a
      net charge, a solved pH is a residual.  Only the first is picked up —
      labelling a solved run's round-off as "the implicit titrant" would be a
      lie the reader could not check;
    * a species missing from one point leaves an EMPTY cell, never a zero.

  WHAT IT DELIBERATELY DOES NOT CLAIM.  Nothing here checks that the molalities
  are right — they are the engine's, and this module never touches them.  Nor
  does it check that the log format is stable: it is not a contract, which is
  exactly why `parseChargeResiduals` returns null instead of guessing, and why
  the view drops the titrant curve rather than drawing a partial one.  The real
  fix is an engine one (publish the residual as a diagnostic) and is reported
  as a gap, not worked around here.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";

import {
  BJERRUM_FAMILIES, bjerrumChunks, bjerrumEngineNotes, bjerrumOutput, bjerrumPhGrid,
  familyById, mergeBjerrumCsvs, parseChargeResiduals, parseRefusalPoint,
} from "../src/case/bjerrumSweep.js";
import { synthesizeExploreCase } from "../src/case/exploreSynth.js";
import { fromJson, serialize } from "../src/dict/index.js";
import { theoryAnchor } from "../src/case/exploreTheory.js";
import { PLOT_KINDS, viewsFor } from "../src/case/exploreViews.js";
import type { ComponentMeta } from "../src/case/catalogue.js";

/** A verbatim `speciate` species table (choupoProps, 2026-08-19: 2 mmol/kg
 *  HCO3 + 2 mmol/kg Na at 25 °C, pH imposed at 8). */
const TABLE_PH8 = `species,molality,activity,gamma
HCO3,1.94645000e-03,1.85000000e-03,9.51707000e-01
Na,1.99900000e-03,1.90000000e-03,9.51707000e-01
H,1.05074000e-08,1.00000000e-08,9.51707000e-01
CO2aq,4.16656000e-05,4.16656000e-05,1.00000000e+00
CO3,1.05860000e-05,8.68000000e-06,8.20378000e-01
`;

/** The same feed at pH 4 — CO2aq now dominant, and NaHCO3aq does not appear
 *  (a species the network did not report at this point). */
const TABLE_PH4 = `species,molality,activity,gamma
HCO3,9.18103000e-06,8.85000000e-06,9.64066000e-01
Na,1.99974000e-03,1.92800000e-03,9.64066000e-01
H,1.03727000e-04,1.00000000e-04,9.64066000e-01
CO2aq,1.99081000e-03,1.99081000e-03,1.00000000e+00
CO3,4.80364000e-12,4.14000000e-12,8.63829000e-01
NaHCO3aq,2.54665000e-07,2.54665000e-07,1.00000000e+00
`;

describe("bjerrumPhGrid — one home for the sweep's abscissa", () => {
  it("spans the range inclusively", () => {
    expect(bjerrumPhGrid(2, 12, 6)).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it("never returns a single point (a 1-point grid has no dict spelling)", () => {
    //  A block of one cannot be written as from/to/n without duplicating its
    //  own endpoint, which is why bjerrumChunks refuses to make one.
    expect(bjerrumPhGrid(7, 7, 1).length).toBe(2);
  });

  it("is what the synthesized operations actually carry", () => {
    //  THE ARITY ARM.  The row labels of the merged table and the pH each
    //  operation imposes must come from the same call — a second grid built
    //  beside this one would agree until somebody edited one of them.
    const grid = bjerrumPhGrid(3, 11, 5);
    const files = synthesizeExploreCase({
      components: ["water"], properties: [],
      axis: { variable: "T", from: 0, to: 1, n: 2 },
      state: { composition: { water: 1 } },
      bjerrum: { master: "HCO3", total: 2e-3, pHfrom: 3, pHto: 11, n: 5, T: 298.15 },
    });
    const text = serialize(fromJson(files.propsDict!));
    for (const pH of grid) expect(text).toContain(`pH    ${pH};`);
  });
});

describe("the synthesized sweep is a plain speciate operation list", () => {
  const build = (over: Record<string, unknown> = {}) => serialize(fromJson(
    synthesizeExploreCase({
      components: ["water"], properties: [],
      axis: { variable: "T", from: 0, to: 1, n: 2 },
      state: { composition: { water: 1 } },
      bjerrum: { master: "HCO3", total: 2e-3, pHfrom: 4, pHto: 10, n: 4,
                 T: 298.15, ...over } as never,
    }).propsDict!));

  it("imposes the pH as a NUMBER — never the word `solve`", () => {
    //  The whole lesson of this lens lives in that difference.  `pH solve;`
    //  would make the abscissa an output and the diagram meaningless.
    const text = build();
    expect(text).not.toContain("pH    solve");
    expect((text.match(/type\s+speciate;/g) ?? []).length).toBe(4);
  });

  it("declares the mandatory bases the engine refuses without", () => {
    const text = build({ atmosphere: { gas: "CO2", pAtm: 4.2e-4 } });
    expect(text).toContain("mol/kg");     // a water analysis must state its basis
    expect(text).toContain("atm");        // a partial pressure must state its own
  });

  it("omits `atmosphere` entirely for a closed system", () => {
    expect(build()).not.toContain("atmosphere");
  });

  it("writes the counter-ion as a second totals entry, and omits it at zero", () => {
    //  It is a declared total and nothing else — no stoichiometry crosses into
    //  the dict.  Zero means the reader declared a bare master ion, which is a
    //  statement, so nothing is written rather than a `Na 0 mol/kg;` line the
    //  engine would have to interpret.
    const withNa = build({ counter: { species: "Na", total: 2e-3 } });
    expect(withNa).toMatch(/Na\s+0?\.?002 mol\/kg;|Na\s+0.002 mol\/kg;/);
    expect(build({ counter: { species: "Na", total: 0 } })).not.toContain("Na ");
  });

  it("carries the aqueous surface, not a VLE formulation", () => {
    //  The speciation stack reads `aqueousProperties`; a gammaPhi block here
    //  would be a vapour phase invented for an aqueous evaluation.
    const pkg = serialize(fromJson(synthesizeExploreCase({
      components: ["water"], properties: [],
      axis: { variable: "T", from: 0, to: 1, n: 2 },
      state: { composition: { water: 1 } },
      bjerrum: { master: "HCO3", total: 2e-3, pHfrom: 4, pHto: 10, n: 4, T: 298.15 },
    }).thermoPackage!));
    expect(pkg).toContain("aqueousProperties");
    expect(pkg).not.toContain("gammaPhi");
  });

  it("keeps verbosity at 2 — the residual and the K(T) routes print only there", () => {
    const ctl = serialize(fromJson(synthesizeExploreCase({
      components: ["water"], properties: [],
      axis: { variable: "T", from: 0, to: 1, n: 2 },
      state: { composition: { water: 1 } },
      bjerrum: { master: "HCO3", total: 2e-3, pHfrom: 4, pHto: 10, n: 4, T: 298.15 },
    }).controlDict!));
    expect(ctl).toMatch(/verbosity\s+2;/);
  });
});

describe("bjerrumChunks + the global index — a blocked sweep reassembles", () => {
  it("covers every point exactly once, contiguously", () => {
    for (const n of [4, 7, 20, 41, 60]) {
      const blocks = bjerrumChunks(n);
      expect(blocks[0]!.lo).toBe(0);
      expect(blocks[blocks.length - 1]!.hi).toBe(n);
      for (let b = 1; b < blocks.length; ++b)
        expect(blocks[b]!.lo).toBe(blocks[b - 1]!.hi);
    }
  });

  it("never makes a block of one point", () => {
    for (const n of [4, 5, 6, 7, 9, 13, 41])
      for (const blk of bjerrumChunks(n))
        expect(blk.hi - blk.lo).toBeGreaterThanOrEqual(2);
  });

  it("names files and operations by the GLOBAL index", () => {
    //  Two blocks writing bjerrum-000.csv would silently lose half the sweep:
    //  each block runs in its own MEMFS and the merge keys on the filename.
    const text = serialize(fromJson(synthesizeExploreCase({
      components: ["water"], properties: [],
      axis: { variable: "T", from: 0, to: 1, n: 2 },
      state: { composition: { water: 1 } },
      bjerrum: { master: "HCO3", total: 2e-3, pHfrom: 8, pHto: 12, n: 3,
                 T: 298.15, indexFrom: 12 },
    }).propsDict!));
    expect(text).toContain(bjerrumOutput(12));
    expect(text).toContain(bjerrumOutput(14));
    expect(text).not.toContain(bjerrumOutput(0));
    expect(text).toContain("pt012");
  });
});

describe("mergeBjerrumCsvs — long species tables become one wide scan", () => {
  const merged = mergeBjerrumCsvs([
    { pH: 4, csv: TABLE_PH4, netCharge: 0.991 },
    { pH: 8, csv: TABLE_PH8, netCharge: 0.00757 },
  ]);
  const lines = merged.trim().split("\n");
  const header = lines[0]!.split(",");

  it("puts pH first and every reported species after it", () => {
    expect(header[0]).toBe("pH");
    for (const sp of ["HCO3", "Na", "H", "CO2aq", "CO3", "NaHCO3aq"])
      expect(header).toContain(sp);
  });

  it("copies the engine's molality verbatim — no normalisation, no fractions", () => {
    //  Dividing by a family total would need to know WHICH species belong to
    //  the family, which is stoichiometry the chemistry records already own.
    const row8 = lines[2]!.split(",");
    expect(row8[header.indexOf("CO2aq")]).toBe("4.16656000e-05");
  });

  it("leaves an EMPTY cell where a species was not reported, never a zero", () => {
    //  "absent" and "too small to matter" are different claims and a zero on a
    //  log axis is not even plottable.
    const row8 = lines[2]!.split(",");
    expect(row8[header.indexOf("NaHCO3aq")]).toBe("");
  });

  it("appends netCharge only when EVERY point carried one", () => {
    expect(header).toContain("netCharge");
    const partial = mergeBjerrumCsvs([
      { pH: 4, csv: TABLE_PH4, netCharge: 0.991 },
      { pH: 8, csv: TABLE_PH8, netCharge: null },
    ]);
    expect(partial.trim().split("\n")[0]).not.toContain("netCharge");
  });

  it("returns empty rather than a header-only table when nothing came back", () => {
    expect(mergeBjerrumCsvs([])).toBe("");
  });
});

describe("parseChargeResiduals — the titrant is READ, per point", () => {
  //  Verbatim choupoProps output (2026-08-19), trimmed to the lines that matter.
  const LOG = `
>>>  Operation [0]:  pt000   (type = speciate)
  speciation: 1 master total(s) + pH 4.00 (given), T = 298.15 K
  charge balance on the answer: sum z_i m_i / sum |z_i| m_i = 9.91e-01  (pH GIVEN -- this is the net charge the analysis carries)
speciate: 7 species -> bjerrum-000.csv, 3 mineral SI value(s)
>>>  Operation [1]:  pt001   (type = speciate)
  speciation: 1 master total(s) + pH 8.00 (given), T = 298.15 K
  charge balance on the answer: sum z_i m_i / sum |z_i| m_i = -7.57e-03  (pH GIVEN -- this is the net charge the analysis carries)
speciate: 7 species -> bjerrum-001.csv, 3 mineral SI value(s)
`;

  it("reads one value per operation, in operation order", () => {
    expect(parseChargeResiduals(LOG, 2)).toEqual([0.991, -0.00757]);
  });

  it("returns null for a point whose line is absent — never a zero", () => {
    //  A zero would be read as "the solution balances", which is the OPPOSITE
    //  of "the number was not found".
    expect(parseChargeResiduals(LOG, 4)).toEqual([0.991, -0.00757, null, null]);
  });

  it("ignores the SOLVED-pH spelling of the same line", () => {
    //  Under `pH solve;` the number means the residual of an equation that WAS
    //  imposed, and belongs at round-off.  Drawing it as "the implicit titrant"
    //  would relabel round-off as chemistry.
    const solved = `
>>>  Operation [0]:  pt000   (type = speciate)
  charge balance on the answer: sum z_i m_i / sum |z_i| m_i = 3.30e-17  (electroneutrality IMPOSED -- this is the residual of the row)
`;
    expect(parseChargeResiduals(solved, 1)).toEqual([null]);
  });

  it("survives a log with no operation banners at all", () => {
    expect(parseChargeResiduals("", 3)).toEqual([null, null, null]);
  });
});

describe("parseRefusalPoint — a refused band names itself", () => {
  const LOG = `
>>>  Operation [12]:  pt012   (type = speciate)
  speciation: 1 master total(s) + pH 13.00 (given), T = 373.15 K
  aqueous activity: Davies (A = 0.6002) -- trustworthy to I ~ 0.5 mol/kg, indicative beyond
*** choupoProps fatal error: speciation: ionic-strength fixed point did not converge in 60 passes (I = 2.319376 mol/kg)
`;

  it("reports the pH the engine was working on, and its own sentence", () => {
    const r = parseRefusalPoint(LOG);
    expect(r?.pH).toBe(13);
    expect(r?.message).toContain("did not converge");
  });

  it("is null for a run that finished — a refusal must not be invented", () => {
    expect(parseRefusalPoint("  speciation: 1 master total(s) + pH 7.00 (given), T = 298.15 K\n"))
      .toBeNull();
  });
});

describe("bjerrumEngineNotes — the honesty surface, once each", () => {
  //  The sweep runs N operations at ONE temperature, so every one of these
  //  lines is printed N times.  Verbatim choupoProps output (2026-08-19).
  const LOG = `
>>>  Operation [0]:  pt000   (type = speciate)
  [chemistry] closure over the curated network: 4 equilibria activated, 58 unreachable from this feed
  aqueous activity: Davies (A = 0.6002) -- trustworthy to I ~ 0.5 mol/kg, indicative beyond; a_w from phi = 1 (dilute approximation)
  OPEN to CO2(g): a(CO2aq) PINNED by Henry, log10 a = log10 K_H(T) + log10 p = -1.108 + (-3.377)  [p = 4.200e-04 atm]
  -- the HCO3 mole balance is REPLACED by the pin: its total is a solved OUTCOME (the \`totals\` entry = initial guess only)
  K(T) analytic (PHREEQC log_k(T), anchored on logK25): OH
  K(T) van't Hoff (constant dH): H2PO4 H3PO4aq HPO4
  [advisory] Davies activity at I = 0.70 mol/kg -- beyond its ~0.5 mol/kg trust range; speciation and SI are INDICATIVE (use Pitzer for quantitative work)
  speciation: pH scale = free H+ activity, Davies charge-symmetric single-ion convention  -- the GIVEN pH is READ on this scale; a meter reading is NBS
>>>  Operation [1]:  pt001   (type = speciate)
  [chemistry] closure over the curated network: 4 equilibria activated, 58 unreachable from this feed
  aqueous activity: Davies (A = 0.6002) -- trustworthy to I ~ 0.5 mol/kg, indicative beyond; a_w from phi = 1 (dilute approximation)
  K(T) analytic (PHREEQC log_k(T), anchored on logK25): OH
`;
  const notes = bjerrumEngineNotes(LOG);

  it("keeps the validity announcements the 0-100 C range exists to show", () => {
    expect(notes.some((n) => n.startsWith("K(T) analytic"))).toBe(true);
    expect(notes.some((n) => n.startsWith("K(T) van't Hoff"))).toBe(true);
    expect(notes.some((n) => n.startsWith("[advisory]"))).toBe(true);
    expect(notes.some((n) => n.startsWith("aqueous activity:"))).toBe(true);
  });

  it("keeps the statement that an imposed pH is read on the MODEL's scale", () => {
    //  Not the meter's.  A reader comparing this diagram to a pH probe needs
    //  to be told which scale the number on the axis lives on.
    expect(notes.some((n) => n.includes("pH scale = free H+ activity"))).toBe(true);
  });

  it("keeps the Henry pin AND what it replaced", () => {
    expect(notes.some((n) => n.startsWith("OPEN to CO2(g)"))).toBe(true);
    expect(notes.some((n) => n.includes("REPLACED by the pin"))).toBe(true);
  });

  it("says each line once — the sweep repeats them per point", () => {
    expect(new Set(notes).size).toBe(notes.length);
    expect(notes.filter((n) => n.startsWith("K(T) analytic")).length).toBe(1);
  });

  it("reports nothing for a silent run rather than a reassuring nothing", () => {
    expect(bjerrumEngineNotes(">>>  Operation [0]:  pt000   (type = speciate)\n")).toEqual([]);
  });
});

describe("the lens's own wiring", () => {
  const cat: ComponentMeta[] = [
    { name: "water", vleAble: true } as ComponentMeta,
    { name: "NaCl", isElectrolyte: true } as ComponentMeta,
    { name: "ethanol", vleAble: true } as ComponentMeta,
  ];
  const noUnifac = { } as never;

  it("is a declared PlotKind, so the theory-anchor gate sees it", () => {
    expect((PLOT_KINDS as readonly string[])).toContain("bjerrum");
    expect(theoryAnchor("bjerrum", "Psat")).toBe("sec:bjerrum");
  });

  it("is offered for water alone and for water + a salt", () => {
    //  The corpus's own carbonate cases declare `components ( water )`; the
    //  family is a master ion of the network, not a flowsheet component.
    expect(viewsFor(["water"], cat, noUnifac).has("bjerrum")).toBe(true);
    expect(viewsFor(["water", "NaCl"], cat, noUnifac).has("bjerrum")).toBe(true);
  });

  it("is NOT offered without water, nor for an aqueous-organic pair", () => {
    //  The speciation stack is aqueous-only and refuses a non-water solvent by
    //  name; offering the lens there would promise a diagram it cannot draw.
    expect(viewsFor(["ethanol"], cat, noUnifac).has("bjerrum")).toBe(false);
    expect(viewsFor(["water", "ethanol"], cat, noUnifac).has("bjerrum")).toBe(false);
  });

  it("names a master ion for every family, and defaults to a real one", () => {
    for (const f of BJERRUM_FAMILIES) {
      expect(f.master.length).toBeGreaterThan(0);
      expect(familyById(f.id)).toBe(f);
      //  A counter-ion default that neutralises nothing is worse than none:
      //  it would look like a declared salt and behave like a bare ion.
      if (f.counter) {
        expect(f.counter.perMaster).toBeGreaterThan(0);
        expect(f.counter.salt.length).toBeGreaterThan(0);
      }
    }
    //  An unknown id must fall back rather than throw — the lens reads its
    //  family from React state that a future rename could outlive.
    expect(familyById("no-such-family")).toBe(BJERRUM_FAMILIES[0]);
  });
});
