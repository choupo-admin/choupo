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
  exploreTheoryAnchors — the Explore workspace's Theory Guide links.

  WHY THIS FILE EXISTS (2026-08-18).  The GUI has TWO homes for "which section
  of the manual does this picture belong to": the EduTools registry, where each
  tool carries a `theory` field, and Explore's `theoryAnchor()`, a switch over
  the plot kind.  `methodTheoryAnchors.test.ts` gated the first.  NOTHING gated
  the second — a guard built for one of two homes, which is the shape of defect
  this project calls the arity sin, here in the machinery rather than in the
  data.

  And the second home had the defect.  `binaryLle` — the g_mix + common-tangent
  lens — had no `case` of its own, so it fell through to the property-scan
  default, and on the workspace's boot property (`Psat`) that default returns
  `ch:vap`.  The Theory button over a LIQUID-LIQUID diagram opened the
  VAPOUR-PRESSURE chapter.  Nothing was broken in the way a broken link is
  broken: the viewer opened, a chapter appeared, and only a reader who already
  knew the subject could tell it was the wrong one.

  THE FAILURE THIS GATE WAS WRITTEN AGAINST.  A gate that has never been shown
  to fail is not trusted here, so it was run against the tree as it stood.
  Copied verbatim from `npx vitest run tests/exploreTheoryAnchors.test.ts`,
  2026-08-18, before either fix:

    ❯ tests/exploreTheoryAnchors.test.ts  (34 tests | 2 failed) 23ms

    ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

     FAIL  tests/exploreTheoryAnchors.test.ts > Explore theoryAnchor() — every
     plot kind lands where it says > binaryLle has a case of its own: its
     anchor does not move with the property
    AssertionError: binaryLle resolves to MORE THAN ONE guide section depending
    on the selected property — ch:vap, ch:heat, ch:fugacity, ch:viscosity,
    ch:thermal-cond.  That is the signature of a kind with no `case` in
    theoryAnchor(): it is falling through to the property-scan default, and
    lands somewhere plausible rather than somewhere right.: expected 5 to be 1
    // Object.is equality

    - Expected
    + Received

    - 1
    + 5

     ❯ tests/exploreTheoryAnchors.test.ts:236:10

    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

     FAIL  tests/exploreTheoryAnchors.test.ts > Explore theoryAnchor() — every
     plot kind lands where it says > binaryLle resolves to \label{ch:lle-gibbs},
     for every property
    AssertionError: binaryLle is declared to open ch:lle-gibbs, but
    theoryAnchor("binaryLle", "Psat") returns "ch:vap" — the reader is sent to
    a different section of the guide than the one this lens is about: expected
    'ch:vap' to be 'ch:lle-gibbs' // Object.is equality

    - Expected
    + Received

    - ch:lle-gibbs
    + ch:vap

     ❯ tests/exploreTheoryAnchors.test.ts:244:69

    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

     Test Files  1 failed (1)
          Tests  2 failed | 32 passed (34)

  Two arms fired, and the pair is the point: the second says the destination is
  WRONG, the first says WHY — the anchor moved with the property, which only a
  kind with no `case` can do.  Line numbers refer to this file as it stood at
  that run; the assertions are unchanged, this header is longer.

  WHAT THIS GATE CLAIMS.  For EVERY member of `PLOT_KINDS` — the whole space,
  not the kinds somebody remembered — `theoryAnchor()` resolves to a
  `\label{...}` that `docs/theoryGuide.tex` actually defines, AND resolves to
  the section this file declares for that kind.  The declared table below is an
  INDEPENDENT oracle: it is written here, from what each lens draws, and never
  imported from the code it audits.

  A kind that has no chapter of its own must say so HERE, explicitly, as
  `PROPERTY_DISPATCH` — one kind qualifies (`scan`, where the property IS the
  subject) and its whole property space is checked instead.  Anything else
  reaching the switch's `default:` is caught by the invariance arm: an anchor
  that MOVES when the property moves is a kind with no case, and that is
  precisely how `ch:vap` came to be printed over an LLE diagram.

  WHAT IT DELIBERATELY DOES NOT CLAIM:
    * that a section is well WRITTEN, or that its content matches the lens.
      `ch:lle-gibbs` existing says the destination is real, not that the
      common-tangent construction is explained there;
    * it reads the .tex SOURCE, not the built PDF — a label added to source and
      absent from a stale `gui/public/docs/theoryGuide.pdf` still lands the
      reader at page 1, and no test in this suite can see that.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { PLOT_KINDS, type PlotKind } from "../src/case/exploreViews.js";
import { theoryAnchor } from "../src/case/exploreTheory.js";

const here = dirname(fileURLToPath(import.meta.url));
const THEORY_TEX = resolve(here, "../../docs/theoryGuide.tex");
const EXPLORE_TSX = resolve(here, "../src/ui/ExploreWorkspace.tsx");

const tex: string | null =
  existsSync(THEORY_TEX) ? readFileSync(THEORY_TEX, "utf8") : null;

const labelExists = (anchor: string): boolean =>
  new RegExp(`\\\\label\\{${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`)
    .test(tex ?? "");

/** The one kind whose destination legitimately depends on the property. */
const PROPERTY_DISPATCH = Symbol("property-dispatch");

/** Every property the Explore property-scan can be sitting on.  Written here
 *  rather than imported: ExploreWorkspace.tsx keeps these private, and a probe
 *  list that came from the auditee would agree with it by construction.  A
 *  property added there and missing here is caught by the coverage arm. */
const PROBE_PROPERTIES = [
  "Psat", "Cp_liquid",                                        // PURE_PROPS
  "Z", "v_molar", "Cp_ig", "H_real", "S_real",                // MIXTURE_PROPS
  "viscosity_liquid", "viscosity_gas",                        // TRANSPORT_PROPS
  "thermal_conductivity_liquid", "thermal_conductivity",
];

/** WHERE EACH LENS BELONGS, declared from what it draws. */
const DECLARED: Record<PlotKind, string | typeof PROPERTY_DISPATCH> = {
  // A property scan is ABOUT its property, so the property picks the section.
  scan: PROPERTY_DISPATCH,
  txy: "ch:flash",            // binary boiling envelope — bubble/dew
  flash: "ch:flash",          // tie-line through the feed + the lever rule
  gamma: "ch:activity",       // γ(x) from the activity model
  // g_mix(x) with the two coexisting liquids joined by their common tangent:
  // liquid-liquid equilibrium by Gibbs minimisation, one dimension below the
  // ternary lens that already points here.
  binaryLle: "ch:lle-gibbs",
  ternary: "sec:ternary",     // ternary boiling-temperature surface
  ternaryLle: "ch:lle-gibbs", // ternary solubility / tie-lines
  phase: "ch:vap",            // pure P–T saturation curve
  scaling: "ch:electrolytes", // SI vs recovery — ionic strength and activity
  steam: "ch:vap",            // IF97 saturation line
  gibbsmap: "sec:gibbs-maps", // equilibrium maps over T × P
  // Species distribution vs pH: the mass-action network of ch:speciation swept
  // along its GIVEN-pH closure.  Inside that section, sec:bjerrum is the
  // subsection written for this diagram — the crossings, the slopes, and the
  // pitfall that an imposed pH is an undeclared titrant.  Deliberately NOT
  // ch:electrolytes: that chapter is the activity model the network calls, one
  // rung below the distribution the picture is about.
  bjerrum: "sec:bjerrum",
};

/** The property-scan's own dispatch, declared independently of the switch. */
const DECLARED_SCAN: Record<string, string> = {
  Psat: "ch:vap",
  Cp_liquid: "ch:heat",
  Cp_ig: "ch:heat",
  viscosity_liquid: "ch:viscosity",
  viscosity_gas: "ch:viscosity",
  thermal_conductivity_liquid: "ch:thermal-cond",
  thermal_conductivity: "ch:thermal-cond",
  Z: "ch:fugacity",
  v_molar: "ch:fugacity",
  H_real: "ch:fugacity",
  S_real: "ch:fugacity",
};

describe("Explore theory anchors — the gate can actually run", () => {
  it("finds docs/theoryGuide.tex", () => {
    //  "A check that cannot run must not pass" (CLAUDE.md §6).  The .tex is
    //  tracked; its absence is a broken checkout, not a condition to skip.
    if (tex == null) throw new Error(`docs/theoryGuide.tex not found at ${THEORY_TEX}`);
    expect(tex.length).toBeGreaterThan(1000);
  });

  it("covers the WHOLE PlotKind space, with nothing left undeclared", () => {
    for (const k of PLOT_KINDS) {
      expect(
        Object.prototype.hasOwnProperty.call(DECLARED, k),
        `plot kind "${k}" has no declared Theory Guide section in this gate — `
        + "declare where its picture belongs, or PROPERTY_DISPATCH if the "
        + "property is the subject.  A kind nobody declares is a kind that "
        + "falls through to a default and lands somewhere plausible.",
      ).toBe(true);
    }
    //  And the other way: a declaration for a kind that no longer exists is a
    //  stale pin, and a stale pin makes the coverage count lie.
    for (const k of Object.keys(DECLARED)) {
      expect((PLOT_KINDS as readonly string[]).includes(k),
        `this gate declares "${k}", which is no longer a PlotKind`).toBe(true);
    }
  });

  it("probes every property the workspace offers", () => {
    //  ExploreWorkspace keeps its property lists private; read them off the
    //  source so a new property cannot slip past the scan arm below.
    const src = readFileSync(EXPLORE_TSX, "utf8");
    const offered: string[] = [];
    for (const name of ["PURE_PROPS", "MIXTURE_PROPS", "TRANSPORT_PROPS"]) {
      const m = src.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
      expect(m, `${name} not found in ExploreWorkspace.tsx — this gate has gone blind`)
        .toBeTruthy();
      for (const q of m![1]!.matchAll(/"([^"]+)"/g)) offered.push(q[1]!);
    }
    expect(offered.length).toBeGreaterThan(8);
    for (const p of offered) {
      expect(PROBE_PROPERTIES, `property "${p}" is offered in Explore but not probed here`)
        .toContain(p);
      expect(Object.prototype.hasOwnProperty.call(DECLARED_SCAN, p),
        `property "${p}" is offered in Explore but this gate does not say which `
        + "section a scan of it belongs to").toBe(true);
    }
  });
});

describe("Explore theoryAnchor() — every plot kind lands where it says", () => {
  for (const kind of PLOT_KINDS) {
    const want = DECLARED[kind];

    if (want === PROPERTY_DISPATCH) {
      for (const [prop, anchor] of Object.entries(DECLARED_SCAN)) {
        it(`${kind}/${prop} resolves to \\label{${anchor}}`, () => {
          expect(theoryAnchor(kind, prop)).toBe(anchor);
          expect(labelExists(anchor),
            `${kind}/${prop} points at #nameddest=${anchor}, which theoryGuide.tex `
            + "does not define — the viewer opens at page 1 and says nothing").toBe(true);
        });
      }
      continue;
    }

    //  NO FALL-THROUGH.  A kind with a `case` of its own answers the same
    //  section whatever property the scan controls happen to be sitting on.
    //  A kind without one inherits the property-scan dispatch, and its answer
    //  fans out across the scan's sections — which is the observable
    //  signature, and the one that caught binaryLle.
    it(`${kind} has a case of its own: its anchor does not move with the property`, () => {
      const seen = new Set(PROBE_PROPERTIES.map((p) => theoryAnchor(kind, p)));
      expect(seen.size,
        `${kind} resolves to MORE THAN ONE guide section depending on the selected `
        + `property — ${[...seen].join(", ")}.  That is the signature of a kind with `
        + "no `case` in theoryAnchor(): it is falling through to the property-scan "
        + "default, and lands somewhere plausible rather than somewhere right.")
        .toBe(1);
    });

    it(`${kind} resolves to \\label{${want}}, for every property`, () => {
      for (const p of PROBE_PROPERTIES) {
        expect(theoryAnchor(kind, p),
          `${kind} is declared to open ${want}, but theoryAnchor("${kind}", "${p}") `
          + `returns "${theoryAnchor(kind, p)}" — the reader is sent to a different `
          + "section of the guide than the one this lens is about").toBe(want);
      }
      expect(labelExists(want),
        `${kind} points at #nameddest=${want}, which theoryGuide.tex does not define `
        + "— the viewer opens at page 1 and says nothing").toBe(true);
    });
  }
});
