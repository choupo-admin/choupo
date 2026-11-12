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
  The residue-curve-map lesson, as DATA.

  The ternary sequel of the batch still (rayleigh): the same balance, three
  components instead of two, so the pot no longer walks along a line but
  along a curve in a triangle -- and the curves, the points where they start
  and end, and the lines that separate them are what decide which products a
  column can make from a given feed.

  Every equilibrium number on the page is the ENGINE's (choupoProps,
  propertyPoint: T_bubble and y_eq at each grid composition).  The
  integration, the singular points, their types, the boundaries and the
  lever rule are the PAGE's arithmetic over that field, in
  gui/src/case/residueCurves.ts, and the design record says how:
  docs/design/residue-curve-maps.md.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const RCM_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A residue curve is the pot of a simple still, followed in time",
    body: "Charge a pot with a liquid of three components and boil it with no "
      + "column and no reflux, taking the vapour away as it forms.  The "
      + "vapour is richer in whatever boils more easily, so the liquid left "
      + "behind -- the residue -- changes composition as it shrinks.  Plot "
      + "that composition on the triangle as the batch runs: the path it "
      + "traces is a residue curve.  It is the batch still of the Rayleigh "
      + "page with one more component, and the balance is the same one.",
    derivation: [
      { step: "Over an instant, W moles in the pot lose dW (a negative "
          + "number) as vapour of composition y*, in equilibrium with the "
          + "liquid x.  A balance on component i:",
        eq: String.raw`\mathrm{d}(W x_i) = y_i^{*}\,\mathrm{d}W` },
      { step: "Expand the left-hand side and collect the terms in dW:",
        eq: String.raw`W\,\mathrm{d}x_i = (y_i^{*} - x_i)\,\mathrm{d}W` },
      { step: "Measure progress by how much of the charge has boiled off, "
          + "a warped time that only ever grows:",
        eq: String.raw`\mathrm{d}\xi = -\frac{\mathrm{d}W}{W}, \qquad \xi = \ln\frac{W_0}{W}` },
    ],
    formula: String.raw`\frac{\mathrm{d}x_i}{\mathrm{d}\xi} = x_i - y_i^{*}(x), \qquad i = 1, 2, 3`,
    where: [
      { sym: "W", means: "moles of liquid in the pot", unit: "mol" },
      { sym: "W_0", means: "moles charged at the start", unit: "mol" },
      { sym: "x_i", means: "mole fraction of component i in the pot liquid" },
      { sym: "y_i^{*}", means: "mole fraction of i in the vapour in "
        + "equilibrium with that liquid, at the bubble temperature and the "
        + "pressure of the still -- the star marks equilibrium" },
      { sym: "\\xi", means: "the warped time: the logarithm of the charge "
        + "over what is left in the pot; it starts at 0 and grows as the "
        + "pot empties" },
      { sym: "x", means: "the whole liquid composition (x_1, x_2, x_3), "
        + "which y* depends on" },
      { sym: "i", means: "which of the three components" },
    ],
    note: "Only two of the three equations are independent, because the "
      + "fractions sum to one; the page integrates x_1 and x_2 and takes x_3 "
      + "as the rest.  Integrating forwards in ξ runs the still; "
      + "integrating backwards asks where a liquid would have to have "
      + "started to boil down to this one.",
    leadsTo: {
      tool: "rayleigh", toolLabel: "Batch still (Rayleigh)",
      stepTitle: "The Rayleigh equation is a material balance over one instant",
      body: "The binary version of the same balance, where the path is a "
        + "line and its length can be read off one integral.",
    },
  },
  {
    n: 2,
    title: "The boiling temperature rises along every residue curve",
    body: "The vapour takes away what boils easily, so the residue gets "
      + "heavier and its bubble temperature climbs.  That is true at every "
      + "point of every curve, and it is the single most useful fact on the "
      + "page: an arrow on a residue curve always points towards a higher "
      + "boiling temperature, and a curve can never come back to a "
      + "temperature it has already passed.  Two curves therefore cannot "
      + "cross either: at a crossing point the pot would have two different "
      + "vapours in equilibrium with one liquid.",
    formula: String.raw`\frac{\mathrm{d}T_\mathrm{b}}{\mathrm{d}\xi} \ge 0`,
    where: [
      { sym: "T_\\mathrm{b}", means: "the bubble temperature of the pot "
        + "liquid at the pressure of the still", unit: "K" },
    ],
    note: "The page checks this on its own drawing: it reports the largest "
      + "fall in boiling temperature it found between two consecutive points "
      + "of any drawn curve.  That number is not zero only because the page "
      + "interpolates the engine's temperatures linearly inside each grid "
      + "cell, which makes the temperature surface slightly creased.",
  },
  {
    n: 3,
    title: "Where the curves start and end: pure components and azeotropes",
    body: "A residue curve stops moving where the vapour has the same "
      + "composition as the liquid.  That happens at the three pure "
      + "components, and at every azeotrope -- a binary one on an edge of "
      + "the triangle, or a ternary one inside it.  These are the singular "
      + "points, and each is one of three kinds.  An UNSTABLE NODE is "
      + "where curves begin: it boils lower than everything around it (the "
      + "lightest point of its neighbourhood).  A STABLE NODE is where "
      + "curves end: it boils higher than everything around it.  A SADDLE "
      + "boils higher than its neighbours in some directions and lower in "
      + "others, so curves approach it and turn away.",
    formula: String.raw`x^{\star} = y^{*}(x^{\star}), \qquad J = \frac{\partial (x - y^{*})}{\partial x}\Big|_{x^{\star}}`,
    where: [
      { sym: "x^{\\star}", means: "a singular point: a liquid composition "
        + "whose equilibrium vapour has the same composition" },
      { sym: "y^{*}", means: "the equilibrium vapour composition, as a "
        + "function of the liquid composition x" },
      { sym: "J", means: "the 2-by-2 matrix of derivatives of x - y* with "
        + "respect to x_1 and x_2 at that point: two positive eigenvalues "
        + "make an unstable node, two negative a stable node, one of each a "
        + "saddle" },
    ],
    note: "The page reads the type twice and shows both readings: once from "
      + "the boiling temperatures on a small ring around the point (all "
      + "higher, all lower, or mixed), and once from the eigenvalues of J "
      + "by finite differences.  Where the two readings disagree, the grid "
      + "is too coarse for that point -- refine it.",
  },
  {
    n: 4,
    title: "Distillation boundaries cut the triangle into regions",
    body: "Out of every saddle that sits on an edge or inside the triangle, "
      + "a special residue curve runs across the triangle: a separatrix, "
      + "also called a simple distillation boundary.  Curves on one side "
      + "start and end at one pair of nodes; curves on the other side at "
      + "another pair.  Each set of curves that shares its start and its end "
      + "is a distillation region.  A map with no boundary is one region, "
      + "and every liquid in it boils down to the same heavy end.",
    note: "The page draws each boundary by starting a hair off the saddle "
      + "along the direction of J that points into the triangle and "
      + "integrating forwards where the boiling temperature rises along that "
      + "direction and backwards where it falls.  The edges of the triangle "
      + "are residue curves too: a binary mixture stays binary in a still.",
  },
  {
    n: 5,
    title: "What a simple column can make from a feed: the lever rule",
    body: "A column with one feed, a distillate and a bottoms obeys an "
      + "overall material balance, so the three compositions lie on one "
      + "straight line in the triangle, with the feed between the two "
      + "products.  The rule of thumb that makes residue curve maps useful "
      + "is that the distillate and the bottoms lie, approximately, in the "
      + "same region as the feed.  The two limiting splits follow: the DIRECT "
      + "split takes the region's unstable node as distillate and pushes "
      + "the bottoms to where the line leaves the region; the INDIRECT split "
      + "takes the region's stable node as bottoms.",
    formula: String.raw`F = D + B, \qquad F x_F = D x_D + B x_B \;\Rightarrow\; \frac{D}{F} = \frac{\lvert x_F - x_B \rvert}{\lvert x_D - x_B \rvert}`,
    where: [
      { sym: "F", means: "feed flow", unit: "mol/s" },
      { sym: "D", means: "distillate flow", unit: "mol/s" },
      { sym: "B", means: "bottoms flow", unit: "mol/s" },
      { sym: "x_F", means: "feed composition, a point in the triangle" },
      { sym: "x_D", means: "distillate composition" },
      { sym: "x_B", means: "bottoms composition" },
    ],
    note: "Why only approximately.  A column's liquid profile at total "
      + "reflux follows a distillation line, which is close to a residue "
      + "curve but not the same curve; at finite reflux the profile moves "
      + "further.  And a boundary is CURVED, while the mass-balance line is "
      + "straight: where a boundary bows towards the feed, a line can "
      + "cross it, and a column can deliver products on both sides of it.  "
      + "This page draws the straight line and the curved boundary and does "
      + "not solve the column.",
  },
  {
    n: 6,
    title: "Crossing a boundary, or never meeting one",
    body: "A boundary is a wall only for a simple column on a fixed mixture.  "
      + "Four ways around it.  A HEAVY ENTRAINER fed near the top of the "
      + "column (extractive distillation) can be chosen so that it adds no "
      + "boundary at all: the glycol preset is such a map -- one region, the "
      + "entrainer the stable node, and the water leaves with it.  A "
      + "HETEROGENEOUS entrainer splits into two liquids, and a decanter "
      + "carries the composition across the boundary along a tie line; that "
      + "needs the liquid-liquid split, which this page does not compute.  "
      + "PRESSURE moves azeotropes, and sometimes makes one disappear; the "
      + "pressure control on this page reruns the engine so you can watch "
      + "the points move.  And MIXING a recycle into the feed moves the feed "
      + "point to the other side of a curved boundary.",
  },
];

export const RCM_LIMITS: readonly LessonLimit[] = [
  {
    id: "one-liquid",
    title: "One liquid everywhere: no liquid-liquid split is drawn.",
    body: "Every bubble point the engine returns here is computed for a "
      + "single liquid.  Where the liquid would split into two, the true "
      + "map is different (a heterogeneous azeotrope, a three-phase line) "
      + "and this page is wrong there.  The page asks the engine's own "
      + "liquid-liquid flash, over the whole triangle, at the LOWEST bubble "
      + "temperature of the map, whether any composition splits, and says "
      + "what it found.  That is one temperature, not a proof for the whole "
      + "map.",
  },
  {
    id: "no-column",
    title: "No column is solved.",
    body: "The splits drawn are the limiting splits the rule of thumb "
      + "allows, from the map's geometry alone.  Whether a real column "
      + "reaches them, at which reflux and with how many stages, is a column "
      + "calculation this page does not make.",
  },
  {
    id: "total-reflux",
    title: "Residue curves stand in for column profiles.",
    body: "A residue curve is the path of a batch still.  A column profile "
      + "at total reflux is a distillation line, which is close to it and "
      + "not equal to it; at finite reflux the profile differs more.",
  },
  {
    id: "grid",
    title: "The map is as fine as the grid.",
    body: "The engine is asked about the compositions of a triangular grid "
      + "and the page interpolates linearly between them.  An azeotrope is "
      + "located to about one grid cell, and to a twentieth of a cell after "
      + "the refinement run.  An azeotrope within one cell of a pure "
      + "component is not found at all, and two singular points closer than "
      + "a cell may be read as one.",
  },
  {
    id: "pairs",
    title: "The map is only as good as the pair parameters.",
    body: "Each preset uses the catalogue's NRTL pairs, and many of them are "
      + "regressions to one laboratory's data over a narrow temperature "
      + "range, used here well outside it.  The engine says so for every pair "
      + "it extrapolates; the page shows those sentences.  An azeotrope that "
      + "appears or disappears in the model may not do so in the plant.",
  },
  {
    id: "ideal-vapour",
    title: "Ideal-gas vapour, catalogue vapour pressures.",
    body: "The vapour is an ideal gas and the pure-component vapour "
      + "pressures are the catalogue's correlations; at the higher pressures "
      + "of the pressure control, both are used outside the ranges they were "
      + "fitted on, which the engine announces.",
  },
];

/** The published azeotropes the page compares against, read from MEASURED
 *  points of the cited articles (located through the NIST/TRC ThermoML
 *  Archive and kept in the corpus as bubble-point evidence files).  The
 *  reading -- linear interpolation between the two measured points where
 *  y - x changes sign, or the lowest measured bubble temperature where the
 *  article's series has no vapour -- is this page's, done once and written
 *  in docs/design/residue-curve-maps.md section 6. */
export interface PublishedAzeotrope {
  pair: readonly [string, string];
  /** Mole fraction of pair[0] at the azeotrope, as read. */
  x: string;
  T_K: string;
  P_kPa: number;
  how: string;
  cite: string;
  doi: string;
}

export const PUBLISHED_AZEOTROPES: readonly PublishedAzeotrope[] = [
  {
    pair: ["ethanol", "water"], x: "0.901 to 0.914", T_K: "351.26", P_kPa: 101.3,
    how: "the lowest measured bubble temperature of the series (the article "
      + "reports no vapour for it); both compositions are reached at 351.26 K",
    cite: "Kamihama, Matsuda, Kurihara, Tochigi, Oba, J. Chem. Eng. Data 57 (2012) 339-344",
    doi: "10.1021/je2008704",
  },
  {
    pair: ["isopropanol", "water"], x: "0.685", T_K: "353.11", P_kPa: 100.0,
    how: "where the measured y - x changes sign, between x = 0.658 and 0.716",
    cite: "Orchillés, Miguel, González-Alfaro, Llopis, Vercher, Martínez-Andreu, "
      + "J. Chem. Thermodyn. 110 (2017) 16-24",
    doi: "10.1016/j.jct.2017.02.005",
  },
  {
    pair: ["methylAcetate", "methanol"], x: "0.668", T_K: "326.79", P_kPa: 101.3,
    how: "where the measured y - x changes sign, between x = 0.647 and 0.737",
    cite: "Zhang, Hu, Zhang, Zhang, Sun, Sun, Li, Fluid Phase Equilib. 401 (2015) 1-8",
    doi: "10.1016/j.fluid.2015.04.018",
  },
  {
    pair: ["acetonitrile", "water"], x: "0.693", T_K: "349.65", P_kPa: 101.3,
    how: "where the measured y - x changes sign, between x = 0.594 and 0.696",
    cite: "Li, Li, Zheng, Peng, Liu, J. Chem. Thermodyn. 138 (2019) 366-373",
    doi: "10.1016/j.jct.2019.07.006",
  },
];
