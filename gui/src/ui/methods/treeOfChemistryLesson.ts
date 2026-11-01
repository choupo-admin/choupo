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
  The tree of chemistry, as DATA (commission C191 A).  The lesson derives
  what the page computes; the page computes it from the records in
  data/standards/routes/ and nothing else.

  WHERE THE CITATIONS GO.  Almost everything this page states describes DATA,
  not the engine, so its authority is a record and a route name: the Hock
  cleavage is `hockCleavage` in routes/olefins.dat, the cracker slate is
  `naphthaSteamCracking` in routes/feedstocks.dat, methanol from CO2 is
  `CO2toMethanol` in routes/transition.dat.  The atomic weights are
  src/thermo/AtomicWeights.cpp, which the reader parses (src/case/
  chemistryGraph.ts), and the stoichiometric arithmetic is
  src/case/chemistryGraphMath.ts.  The worked numbers on the page are NOT in
  this file: the page computes them from the records, and
  tests/treeOfChemistry.test.ts holds each to hand arithmetic.

  EVERY YIELD BAND IN THE RECORDS IS THE CURATOR'S ESTIMATE (`origin
  assumed`, each with its reason).  The page says so on its first screen and
  draws each band as one; step 9 is where the lesson says what that means
  and what would change it.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const TREE_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A hundred products, eleven roots",
    body: "The commodity chemicals look like a forest of unrelated "
      + "products and are one tree. Almost every one of them is made from "
      + "another one, and following the arrows backwards ends at the same "
      + "small set: seven organic roots (ethylene, propylene, the C4 "
      + "olefins, benzene, toluene, the xylenes, and synthesis gas with "
      + "methanol as its first derivative) and four inorganic ones (ammonia, "
      + "sulfuric acid, chlorine with caustic soda, and the nitric and "
      + "phosphoric acids). This page draws that tree as ONE directed graph "
      + "whose nodes are substances and whose edges are named production "
      + "routes, each with its balanced stoichiometry, a yield band and a "
      + "citation, and lets you read it three ways: DEPTH (pick a product, "
      + "walk back to its roots, with the mass of every input on every "
      + "edge), CONVERGENCE (pick a root and see what hangs from it, and "
      + "what a route makes whether anyone wants it or not), and the TREE OF "
      + "2050 (for each root, the incumbent route beside the transition "
      + "routes). The message the three views carry is one sentence: the "
      + "sustainable transition replaces the ROOTS, not the leaves.",
  },
  {
    n: 2,
    title: "A route is a balanced equation",
    body: "An edge of the graph is not a vague arrow, it is a chemical "
      + "equation that balances atom by atom. Write the reactants with a "
      + "negative stoichiometric number and the products with a positive "
      + "one, and the equation is the statement that every element is "
      + "conserved. Every reaction in the records is checked this way by "
      + "the gate bin/curate/check_chemistry_graph.py before it reaches "
      + "the page; the two equations its author got wrong while building "
      + "the graph (a phenol hydrogenation one H2 short, a yield written on "
      + "the wrong element) were found by that gate and not by a reader. "
      + "The `target` of a route is the substance it is built to make. "
      + "Everything else on the right-hand side is a forced co-product, and "
      + "no record lists one: it is whatever the equation leaves over.",
    formula: String.raw`\sum_{i}\nu_i\,n_{e,i}=0\qquad\text{for every element } e`,
    where: [
      { sym: "\\nu_i", means: "stoichiometric number of species i in the route: negative for a reactant, positive for a product" },
      { sym: "n_{e,i}", means: "atoms of element e in one molecule (or repeat unit) of species i" },
      { sym: "e", means: "an element, C or H or Cl or any other, summed over separately" },
      { sym: "i", means: "index over the species of the route" },
    ],
    derivation: [
      { step: "Take one pass of the reaction as written. Species i then "
          + "changes by nu_i moles, and each mole of it carries n(e,i) atoms "
          + "of element e." },
      { step: "Atoms of an element are neither made nor destroyed, so the "
          + "net change in atoms of e over all species is zero.",
        eq: String.raw`\sum_i \nu_i\,n_{e,i}=0` },
    ],
  },
  {
    n: 3,
    title: "Mass of each input per kilogram of product",
    body: "What a student wants from a route is not moles but kilograms: how "
      + "much of each input goes into one kilogram of what the route is "
      + "built for. Per mole of target the equation consumes |nu_i|/nu_t "
      + "moles of input i; multiplying by molar masses gives kilograms, "
      + "which is a fixed number for the route, its STOICHIOMETRIC floor. "
      + "A real plant needs more, because part of the feed is lost to "
      + "other products: dividing by the route's yield y (the fraction of "
      + "the basis element that ends up in the target) gives the mass the "
      + "route needs. The yield is not a single number in the records, it "
      + "is a band, so the answer is a band too: a larger yield means "
      + "less input, so the band's ends swap. The molar masses are read "
      + "from the component records (and from the engine's atomic-weight "
      + "table for a substance with no record); nothing is typed into the "
      + "page. For a separation the feed per kilogram is 1/y on a mass "
      + "basis, and for a process yield it is 1/s, where s is the target's "
      + "share of the slate.",
    formula: String.raw`m_i=\frac{|\nu_i|\,M_i}{\nu_t\,M_t\,y}\qquad m_i\in\Big[\frac{b_i}{y_\mathrm{hi}},\ \frac{b_i}{y_\mathrm{lo}}\Big]`,
    where: [
      { sym: "m_i", means: "mass of input i consumed per kilogram of the route's target", unit: "kg/kg" },
      { sym: "M_i", means: "molar mass of input i, read from its component record", unit: "kg/kmol" },
      { sym: "\\nu_t", means: "stoichiometric number of the target (a positive number)" },
      { sym: "M_t", means: "molar mass of the target", unit: "kg/kmol" },
      { sym: "y", means: "the route's yield: the fraction of the basis element in the feed that ends up in the target, 0 < y <= 1" },
      { sym: "b_i", means: "the stoichiometric floor |nu_i| M_i / (nu_t M_t), the same ratio at y = 1", unit: "kg/kg" },
      { sym: "y_\\mathrm{lo}", means: "the lower end of the curator's yield band" },
      { sym: "y_\\mathrm{hi}", means: "the upper end of the curator's yield band" },
    ],
    derivation: [
      { step: "Moles of input i per mole of target, at the stoichiometry:",
        eq: String.raw`\frac{|\nu_i|}{\nu_t}` },
      { step: "Convert both to kilograms with the molar masses; this is the "
          + "floor, b(i):",
        eq: String.raw`b_i=\frac{|\nu_i|\,M_i}{\nu_t\,M_t}` },
      { step: "Only the fraction y of the feed's basis element becomes "
          + "target, so the feed needed is the floor divided by y:",
        eq: String.raw`m_i=\frac{b_i}{y}` },
      { step: "With y anywhere in its band, the least input is at the "
          + "highest yield and the most at the lowest:",
        eq: String.raw`\frac{b_i}{y_\mathrm{hi}}\le m_i\le\frac{b_i}{y_\mathrm{lo}}` },
    ],
  },
  {
    n: 4,
    title: "Along a chain the bands multiply",
    body: "A product is rarely one route from its root; it is a chain. PVC "
      + "comes from vinyl chloride, which comes from dichloroethane, which "
      + "comes from ethylene and chlorine: three routes, three yields. The "
      + "kilograms of ethylene per kilogram of PVC are the product of the "
      + "three per-kilogram ratios, and the band of the answer is the "
      + "product of the three bands, lower ends together and upper ends "
      + "together. Where a substance can be made by more than one route, "
      + "you choose one, and the page shows which alternatives exist; "
      + "where two branches ask for the same raw material their needs add. "
      + "The walk stops at a root member or at a feedstock no route in the "
      + "graph makes, and it stops on a loop: the balanced vinyl chloride "
      + "plant feeds the HCl its cracker releases back to the oxychlorination "
      + "step, and the record marks that route as a declared cycle.",
    formula: String.raw`m_\mathrm{raw}=\sum_{\text{branches}}\ \prod_{k\in\text{path}}\frac{b_k}{y_k}`,
    where: [
      { sym: "m_\\mathrm{raw}", means: "kilograms of a raw material (a root member or feedstock) per kilogram of the picked product", unit: "kg/kg" },
      { sym: "b_k", means: "the stoichiometric floor of the raw material on route k, as in step 3", unit: "kg/kg" },
      { sym: "y_k", means: "the yield band of route k" },
      { sym: "k", means: "index over the routes on one path from the product to the raw material" },
    ],
  },
  {
    n: 5,
    title: "Forced co-production",
    body: "The target is what a route is built for; the rest of its "
      + "right-hand side is made whether the market wants it or not. The "
      + "cumene route to phenol is the textbook case. The Hock cleavage of "
      + "cumene hydroperoxide gives one mole of phenol and one mole of "
      + "acetone, and no operating condition changes that ratio, so "
      + "the acetone supply is set by the phenol demand and not by the "
      + "demand for acetone. For a reaction the co-product mass per "
      + "kilogram of target follows the stoichiometry and does not depend "
      + "on the yield band, because the yield says how much feed is lost to "
      + "side products, not at what ratio the pair forms. A steam cracker "
      + "is the same idea without an equation: its feed has no molecular "
      + "formula, so the record states a slate, the kilograms of each "
      + "product per kilogram of naphtha, and the co-products of ethylene "
      + "per kilogram of ethylene are the ratio of two slate shares, which "
      + "is again a band.",
    formula: String.raw`c_j=\frac{\nu_j\,M_j}{\nu_t\,M_t}\qquad c_j=\frac{s_j}{s_t}\ \text{(a slate)}`,
    where: [
      { sym: "c_j", means: "mass of co-product j forced per kilogram of the target", unit: "kg/kg" },
      { sym: "\\nu_j", means: "stoichiometric number of co-product j (positive)" },
      { sym: "M_j", means: "molar mass of co-product j", unit: "kg/kmol" },
      { sym: "s_j", means: "mass of co-product j per kilogram of feed in the process-yield slate", unit: "kg/kg feed" },
      { sym: "s_t", means: "the same for the target", unit: "kg/kg feed" },
    ],
  },
  {
    n: 6,
    title: "Convergence: what hangs from a root",
    body: "Run the graph forwards from a root and it fans out: ethylene "
      + "alone is the starting point of the polyethylene, the PVC, the "
      + "polystyrene, the polyester, the vinyl acetate and a large part of "
      + "the oxygenates. That is why the roots matter more than any one "
      + "product, and why the same root appears in so many unrelated "
      + "plants. The forward view lists, for the root or substance you "
      + "pick, every route that consumes it, every substance reachable from "
      + "it along the target arrows (nearest first), and the products at "
      + "the leaves that nothing else consumes. It is a map of dependence, "
      + "not a forecast of demand: the graph does not carry production "
      + "volumes except the five figures the IEA publishes, each shown "
      + "with its source.",
  },
  {
    n: 7,
    title: "Hydrogen per carbon, the currency of the transition",
    body: "Replacing a root means making the same molecule from different "
      + "atoms. Fossil methanol is made from carbon monoxide and hydrogen "
      + "that came from methane; the transition route makes it from carbon "
      + "dioxide and hydrogen that came from electrolysed water. What the "
      + "two have in common is that every step in the carbon chain is "
      + "counted in hydrogen per carbon atom of the target: how many "
      + "moles of H2 the equation consumes for each carbon atom it "
      + "builds. It is derived from the stoichiometry and never stored: "
      + "CO2 to methanol takes three, CO2 to methane four, the reverse "
      + "water-gas shift one. A negative value means the step releases "
      + "hydrogen (toluene from methanol), and a step that carries no H2 "
      + "term shows none, because its hydrogen entered upstream, inside "
      + "the methanol it consumes.",
    formula: String.raw`\eta_\mathrm{H}=\frac{-\nu_\mathrm{H2}}{\nu_t\,n_\mathrm{C}}`,
    where: [
      { sym: "\\eta_\\mathrm{H}", means: "moles of H2 consumed per carbon atom of the target", unit: "mol H2 per mol C" },
      { sym: "\\nu_\\mathrm{H2}", means: "stoichiometric number of H2 in the route (negative when H2 is a reactant)" },
      { sym: "\\nu_t", means: "stoichiometric number of the target (positive)" },
      { sym: "n_\\mathrm{C}", means: "carbon atoms in one molecule of the target, from its formula in the component record" },
    ],
  },
  {
    n: 8,
    title: "The transition replaces the roots, not the leaves",
    body: "Take ammonia. The Haber-Bosch edge, nitrogen plus three "
      + "hydrogen to two ammonia, is written once in the records, because "
      + "green ammonia is the same reaction. What changes is where the "
      + "hydrogen comes from: the water-gas shift behind a methane "
      + "reformer in the incumbent plant, water electrolysis in the "
      + "transition one. The same is true of methanol, of the ethylene "
      + "that bio-ethanol or methanol-to-olefins can supply, and of the "
      + "aromatics lignin can supply. Everything downstream of a root, "
      + "the PVC, the polyester, the fertiliser, does not change a single "
      + "edge when the root is replaced. That is the reason to read the "
      + "tree from the roots: a transition plan that has to rebuild the "
      + "hundred leaves is not a plan, and the graph shows it does not "
      + "have to. Where a source states an energy intensity for a route "
      + "the page shows it with its origin word; where none was read back, "
      + "it says so rather than showing a number.",
  },
  {
    n: 9,
    title: "What the numbers are, and are not",
    body: "Every yield band and every slate share in the records is the "
      + "curator's estimate of the route as the standard references teach "
      + "it, and is marked so (origin assumed, with the reason in the "
      + "record). None was read back against a table on a page: the two "
      + "publishers' sites that hold the reviews refused the fetch, and "
      + "inventing a locus would turn an unsourced number into a falsely "
      + "sourced one. The only figures read from a source are the IEA's "
      + "production volumes and four ammonia energy intensities, each with "
      + "its page. So the masses on this page are the right order of "
      + "magnitude and the right ratios (the stoichiometry is checked "
      + "atom by atom), and their bands are what a curator believes a "
      + "plant does, not what a plant measured. A route that has a "
      + "Choupo case links to it, so that you can simulate what the map "
      + "only draws; a route with no case says 'no case yet'.",
  },
];

export const TREE_LIMITS: readonly LessonLimit[] = [
  { id: "bands", title: "Every yield band is an estimate",
    body: "All of the yield and slate bands are the curator's, marked "
      + "assumed with a reason. The page draws them as bands for that "
      + "reason; it does not claim any is a measurement, and the stoichiometric "
      + "floor is the only part of a mass that does not depend on them." },
  { id: "complete", title: "The graph is a selection, not an inventory",
    body: "The records hold the commodity chains a course on the chemical "
      + "industry names. Fischer-Tropsch beyond one representative edge, "
      + "specialty chemistry, the higher glycols, titanium dioxide, "
      + "polyurethane as a polymer and many others are not in it, and a "
      + "check cannot see a route that is missing." },
  { id: "co-product-credit", title: "No co-product credit",
    body: "The mass of an input per kilogram of product counts only the "
      + "route's own feed. The HCl a vinyl chloride cracker releases and "
      + "the oxychlorination step consumes is not netted against the "
      + "chlorine, and a forced co-product is listed, never sold or "
      + "credited." },
  { id: "not-economics", title: "A map, not a forecast or a cost",
    body: "The graph carries no prices, no capacities (the IEA's five "
      + "volumes excepted) and no environmental inventory. Which route "
      + "wins is a question of economics and location that this page "
      + "does not answer; the tool 'Screening routes to a product' and the "
      + "Choupo cases linked from the routes are where it is asked." },
  { id: "energy", title: "Energy and CO2 intensities exist for a few routes",
    body: "Only some routes carry an energy figure, and of those only the "
      + "four ammonia intensities are read from a source. The others are "
      + "the curator's, and the page shows the origin word beside each." },
];

export const TREE_QUIZ: readonly QuizQuestion[] = [
  {
    id: "forced-acetone",
    q: "In the Hock process, what fixes the mass of acetone made per kilogram of phenol?",
    options: [
      "The market demand for acetone",
      "The stoichiometry of the cleavage, one mole of acetone for each mole of phenol",
      "The yield band of the cumene oxidation",
      "The size of the cracker that supplied the propylene",
    ],
    correct: 1,
    feedback: "The cleavage makes phenol and acetone in a one-to-one molar "
      + "ratio, so the mass ratio is the ratio of the molar masses, about "
      + "0.62 kg of acetone per kg of phenol. That is why phenol demand "
      + "sets the acetone supply. The yield bands change how much cumene is "
      + "needed, not this ratio.",
    steps: [5],
    origins: ["page"],
  },
  {
    id: "bands-multiply",
    q: "A product is made by a chain of three routes, each with a yield band. How does the band of raw material per kilogram of product behave?",
    options: [
      "The three bands are added",
      "The three bands are multiplied, lower ends together and upper ends together",
      "Only the yield of the last route matters",
      "The bands cancel because losses are recycled",
    ],
    correct: 1,
    feedback: "Each route needs the floor divided by its own yield, and the "
      + "routes are in series, so the ratios multiply. The least raw "
      + "material needs every yield at its top, the most needs every one at "
      + "its bottom, which is why the page shows a band and never a point.",
    steps: [3, 4],
  },
  {
    id: "h2-per-carbon",
    q: "A route consumes three moles of H2 for each mole of CO2 converted to one mole of methanol. What is its hydrogen per carbon?",
    options: ["1", "2", "3", "4"],
    correct: 2,
    feedback: "Minus the stoichiometric number of H2 (-(-3)) divided by the "
      + "target's stoichiometric number (1) and its one carbon atom is 3. "
      + "The same arithmetic gives 4 for CO2 to methane and 1 for the "
      + "reverse water-gas shift.",
    steps: [7],
    origins: ["page"],
  },
  {
    id: "what-moves",
    q: "When ammonia is made from electrolytic hydrogen, which part of the graph changes?",
    options: [
      "Every product downstream of ammonia",
      "The Haber-Bosch stoichiometry",
      "The route that feeds the hydrogen into the ammonia edge",
      "Nothing, green ammonia is a different substance",
    ],
    correct: 2,
    feedback: "The ammonia edge is written once, because the reaction is "
      + "the same. What is replaced is the feeder, water electrolysis in "
      + "place of the shift behind a reformer. The leaves do not move, "
      + "which is the point of reading the tree from the roots.",
    steps: [8],
  },
  {
    id: "assumed-bands",
    q: "What does the label 'assumed' on a yield band mean on this page?",
    options: [
      "The band was measured on a plant and then rounded",
      "The band is the curator's estimate, with a stated reason, not read back against a published table",
      "The band is the stoichiometric floor",
      "The band was computed by the Choupo engine",
    ],
    correct: 1,
    feedback: "Every yield band in the records is the curator's estimate of "
      + "the route as the standard references teach it. Only the IEA "
      + "volumes and four ammonia intensities are read from a source. The "
      + "stoichiometry, by contrast, is checked atom by atom.",
    steps: [3, 9],
  },
];
