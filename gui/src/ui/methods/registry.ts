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
  registry — the EduTools (classical method constructions) tool registry, and
  the one home of "which tool is open".

  It lives in its OWN module (2026-08-16): once the permanent 252px tool rail
  was ruled out in favour of a top-bar dropdown, the registry gained a SECOND
  reader — the workspace body (MethodsWorkspace.tsx) and the menu bar
  (MenuBar.tsx) both need it.
  MethodsWorkspace reaches Plotly at module scope, so a MenuBar that imported
  the registry FROM it would drag the plotting bundle into the menu bar (and
  out of the node test runner's reach).  One registry, one selection, two
  readers — never a second hand-written tool list in the menu.

  The SELECTION is module state rather than component state because the menu
  that sets it and the workspace that renders it are siblings, mounted
  independently (the workspace is lazy, and the menu exists before it).  A
  React-external store with useSyncExternalStore keeps them in step without
  the tool id having to become global application state: it is a property of
  this workspace, and it stays here.

  The deep link `?workspace=methods&tool=<id>` is a CONTRACT (gui-credo §4:
  the address bar is a shareable bookmark of what is on screen).  It keeps the
  `methods` key even though the workspace is now LABELLED EduTools — a URL
  already in a student's notes must not stop working because a caption changed.
\*---------------------------------------------------------------------------*/

import { useSyncExternalStore } from "react";
import { guideUrl } from "../../help/guideLinks.js";

export type MethodToolId =
  | "mccabe" | "fug" | "psychro" | "kremser" | "pinch-composite" | "entu"
  | "pump-system" | "breakthrough" | "merkel" | "rayleigh" | "levenspiel"
  | "vanheerden" | "drying" | "hunter-nash" | "column-control" | "thiele"
  | "what-is-temperature" | "flash-operating-line" | "bjerrum"
  | "thermometer-trust" | "property-trust" | "what-is-entropy"
  | "what-is-exergy" | "property-origins" | "four-ways-mixture"
  | "cosmo-sac-theory" | "local-composition" | "unifac-theory"
  | "pcsaft-theory" | "ponchon-savarit" | "claus-gibbs"
  | "sour-water" | "rules-of-thumb";

/** WHAT KIND OF TOOL THIS IS, and the field exists to keep a boundary legible
 *  rather than to switch behaviour.
 *
 *  The settled placement criterion is *method-construction -> EduTools;
 *  property-surface -> Explorer*, and it does real work: it settled the g_mix
 *  tangent into Explore and moved McCabe-Thiele out of it.  A SELECTION aid is
 *  NEITHER — it does not construct an answer from a diagram and it does not
 *  show what a substance is; it helps a reader choose between defensible
 *  alternatives.  Forcing it into `construction` to avoid adding a kind would
 *  be the criterion bent by the first case that does not fit it, which is how a
 *  boundary stops meaning anything (heuristics-as-a-third-kind, 1 and 7).
 *
 *  It lives inside EduTools and does NOT get a third top-level surface: one
 *  building for one tenant is how a shell acquires rooms nobody visits. */
//  ONE HOME for the kinds, and the TYPE is derived from it rather than the
//  other way round.  A test used to carry its own literal list
//  (`["construction", "selection"]`) and therefore had to be edited every time
//  a kind was added -- a second home for a fact this file owns, which failed
//  the day `notes` arrived.  Reading this array cannot drift from it.
export const METHOD_TOOL_KINDS = ["construction", "selection", "notes"] as const;

export type MethodToolKind = typeof METHOD_TOOL_KINDS[number];

//  ONE HOME for the disciplines, in DISPLAY ORDER -- the curriculum shelf a
//  student scans, not a fact about the code (the props-ops-reference rule:
//  grouping is editorial and lives once).  23 tools had outgrown a flat
//  list (owner, 2026-08-30).  The type is derived from the array, so a new
//  tool MUST declare its discipline or it does not compile -- no "Other"
//  bucket, because an unshelved tool here is a decision dodged, not a
//  discovery surfaced.
export const METHOD_DISCIPLINES = [
  "Thermodynamics",
  "Separations & phase equilibria",
  "Heat transfer & energy",
  "Reaction engineering",
  "Hydraulics & control",
] as const;

export type MethodDiscipline = typeof METHOD_DISCIPLINES[number];

export interface MethodTool {
  id: MethodToolId;
  label: string;
  kind: MethodToolKind;
  /** The curriculum shelf this tool sits on (grouped pickers, landing). */
  discipline: MethodDiscipline;
  status: "live" | "planned";
  /** One line: what this construction teaches. */
  teaches: string;
  /** Theory Guide named destination (hyperref destlabel), when one exists. */
  theory?: string;
  /** Planned entries: the engine output that will feed the tool. */
  fedBy?: string;
}

// ---- The method-tool registry ----------------------------------------------
// One entry per classical construction.  `status: "planned"` entries are
// VISIBLE but disabled — the menu is the roadmap, stated rather than implied —
// and each names the engine output that will feed it (zero physics in TS is
// the standing rule for a planned tool exactly as for a live one).
//
// `theory` must name a REAL `\label{...}` in docs/theoryGuide.tex: the
// preamble sets destlabel=true, so each label becomes a PDF named destination
// the viewer can jump to.  An anchor the guide does not define opens the PDF
// at page 1 with no error — tests/methodTheoryAnchors.test.ts is the gate that
// makes that failure loud (it caught `sec:mccabe-tray-efficiency`, an anchor
// that never existed in any build of the guide).

export const METHOD_TOOLS: MethodTool[] = [
  //  THE FIRST TOOL OF THE NOTES KIND (2026-08-27).  It constructs nothing and
  //  helps choose nothing: it is a chapter you scroll, with the engine running
  //  inside it.  The owner's ask was for support material across several
  //  courses, and the first subject is the one he named as still bothering him
  //  after a career of teaching it -- what a temperature actually is.
  //
  //  NOT A NEW WORKSPACE, deliberately.  `kind` is an axis this registry
  //  already has (`selection` was added the same way on 2026-08-18), the
  //  landing page already renders the registry, and the deep link already
  //  works.  A third plane would have been a bigger system before the small
  //  one had been shown to teach anybody anything -- which is the wrong order,
  //  and the owner named the rule: Gall's law, simple first.
  {
    //  REARCHITECTED 2026-08-29 on the owner's pedagogical ruling: one page,
    //  one durable mental model, 10-15 minutes.  The boiling-point ladder
    //  moved to `property-trust`; the gas thermometer, ITS-90's own fixed
    //  points and the Chang/epistemology material moved to the deep dive
    //  `thermometer-trust`; the Newton-iteration analogy was deleted.
    id: "what-is-temperature", label: "What is a temperature?",
    discipline: "Thermodynamics",
    kind: "notes", status: "live",
    teaches: "That a temperature reading is the END OF A MEASUREMENT CHAIN, "
      + "not a number nature printed on the system: STATE, T, scale, sensor, "
      + "signal, model and calibration, then a reported value with an "
      + "uncertainty.  The quantity T, the unit K and the practical scale "
      + "T90 are three different things; no instrument observes temperature "
      + "itself; and decimal places are not uncertainty.",
    theory: "ch:foundations",
  },
  {
    //  ONE page, ONE mental model (the temperature page's ruling, applied to
    //  the next hard concept): an entropy value is a LEDGER.  Built AFTER
    //  the engine trace (docs/design/entropy-glass-box-trace.md) so every
    //  ledger line cites the code computing it; the live centre runs the
    //  entropy01_air_ledger witness and RE-ADDS the engine's own published
    //  lines in front of the reader.
    id: "what-is-entropy", label: "What is entropy?",
    discipline: "Thermodynamics",
    kind: "notes", status: "live",
    teaches: "That an entropy value in a simulator is a LEDGER: a measured "
      + "third-law datum (s_298), a temperature line (integral Cp/T), a "
      + "pressure line (-R ln P/P0), a mixing line (-R sum y ln y) and a "
      + "model line (S_residual) -- each computed in one named place.  Why "
      + "separation has a price floor (T times the mixing line), how an "
      + "isentropic machine spends entropy (dS_gen), and which lines cancel "
      + "when two states are compared.",
    theory: "ch:foundations",
  },
  {
    //  THE SEQUEL the entropy ledger buys: exergy is the PRICE TAG -- what
    //  a state is worth in work, against a DECLARED environment.  The live
    //  centre runs exergy01_air_dead_state and re-adds the engine's two
    //  published legs (dh and T0*ds); the structural zero at the dead state
    //  is on screen.  Built the day the `exergy` bench op landed, so every
    //  claim has an engine surface to cite (the citation-first rule).
    id: "what-is-exergy", label: "What is exergy?",
    discipline: "Thermodynamics",
    kind: "notes", status: "live",
    teaches: "That energy is conserved but USEFULNESS is not: PHYSICAL flow "
      + "exergy prices a state in work, b_ph = (h - h0) - T0*(s - s0), "
      + "against a restricted dead state the case DECLARES (the engine "
      + "refuses to choose your environment; chemical exergy is refused, "
      + "never silently zeroed).  Why the two LEGS re-add on screen, why "
      + "b_ph at the restricted dead state is zero identically, why b is "
      + "datum-independent but NOT model-independent, and Gouy-Stodola: "
      + "every dS_gen an adiabatic machine publishes costs T0 times itself "
      + "in exergy destroyed.",
    theory: "ch:foundations",
  },
  {
    //  THE DEEP DIVE behind the page above, for the reader who wants the
    //  metrology and the epistemology after the engineering -- split out so
    //  nobody has to cross the philosophy of science to learn to interrogate
    //  a Pt100.
    id: "thermometer-trust", label: "How do we know a thermometer is right?",
    discipline: "Thermodynamics",
    kind: "notes", status: "live",
    teaches: "That a thermometer is never right by itself -- it is right the "
      + "way a witness is credible: agreeing with itself (Regnault's "
      + "comparability), agreeing with others (convergence), and being "
      + "cross-examined.  ITS-90's own fixed points, the gas thermometer "
      + "solved live by the engine, why platinum's melting point cannot "
      + "carry a tenth of a degree, and Hasok Chang's four circles.",
    theory: "ch:foundations",
  },
  {
    //  THE STEP BEFORE the trust page: before a reader can judge whether a
    //  record lies, they must know which KIND of number they are holding.
    //  Requested by the owner (2026-08-31): the estimation methods and the
    //  data each component carries, presented to students.  The live centre
    //  runs the Joback estimation of acetone beside the case's own cited
    //  reference values, so the method's error is on screen, computed on
    //  the page from the engine's published numbers.
    id: "property-origins",
    label: "Where do properties come from? (estimation, Joback)",
    discipline: "Thermodynamics",
    kind: "notes", status: "live",
    teaches: "That every number in a component's data file has a PROVENANCE "
      + "-- measured, fitted, or estimated -- and the reflex question to ask "
      + "of each: measured by whom, fitted over what window, estimated from "
      + "which groups at what typical error.  The anatomy of a .dat file by "
      + "what CONSUMES each field, and the standing rule that estimation is "
      + "a curation-time act, never a runtime one.",
    theory: "ch:foundations",
  },
  {
    //  THE PROPERTY-DATA LESSON that used to sit inside the temperature
    //  page, teaching the right words in the wrong place: the ladder's
    //  subject is not what a temperature is, it is when a database can be
    //  believed.
    id: "property-trust", label: "When a property database lies to you",
    discipline: "Thermodynamics",
    kind: "notes", status: "live",
    teaches: "Never trust a thermophysical record merely because it exists: "
      + "test its internal consistency and read its declared validity.  "
      + "Thirteen records cross-examined against themselves, live -- water's "
      + "own file disagrees with itself by 0.70 K, and a predictive glycerol "
      + "correlation that asked to be validated misses by a factor of 19.",
    theory: "ch:foundations",
  },
  {
    //  THE MODELS LESSON the owner asked for by name (2026-08-31: "o COSMO,
    //  PC-SAFT etc tem de ser bem apresentados aos alunos").  One ladder --
    //  what did each model KNOW about the pair -- over one binary
    //  (ethanol/water), graded live against measured data by the engine's
    //  own validation block; PC-SAFT and COSMO-SAC carry their honest
    //  cards (the twin-flash cost; the synthetic-surrogate licence
    //  posture) instead of rows an AAD table could not defend.
    id: "four-ways-mixture",
    //  THE MODELS ARE IN THE LABEL, not only in `teaches`.  "Four ways to
    //  price a mixture" is a good title and a bad index entry: a reader
    //  looking for PC-SAFT scanned the Thermodynamics shelf, saw no model
    //  named anywhere in it, and concluded the models were not taught.
    //  They were, on this page and the next one up.
    label: "Four ways to price a mixture (NRTL · UNIFAC · COSMO-SAC · PC-SAFT)",
    discipline: "Thermodynamics",
    kind: "notes", status: "live",
    teaches: "That every mixture model answers one question -- what did it "
      + "KNOW about this pair before it priced it: nothing (ideal), the "
      + "pair's own measured data (Wilson/NRTL), the groups (UNIFAC), the "
      + "quantum charge surface (COSMO-SAC), or molecular theory with "
      + "association (PC-SAFT).  The engine grades four of them against "
      + "12 measured ethanol/water points live; a fit wins where its "
      + "evidence was taken and loses where it was not, and the "
      + "predictive rungs buy reach at a price the page shows in kelvin.",
    theory: "ch:pcsaft",
  },
  {
    //  THE FIRST PAGE UNDER THE TEXTBOOK RULING (credo §10, 2026-08-31).
    //  It sits beside the comparison rather than inside it: `four-ways`
    //  answers "which rung, and what did it know", this answers "where does
    //  the number come from".  Growing the derivation inside a card would
    //  have made one page answer two questions badly.
    id: "cosmo-sac-theory",
    label: "COSMO-SAC, derived (σ-profiles → activity coefficient)",
    discipline: "Thermodynamics",
    kind: "notes", status: "live",
    teaches: "The full derivation of COSMO-SAC 2002 as the engine runs it: "
      + "the quantum charge surface, the σ-profile, the misfit and "
      + "hydrogen-bond exchange energy, the IMPLICIT segment activity "
      + "coefficient solved as a damped fixed point, the residual as a "
      + "move between environments, and Staverman-Guggenheim for size.  "
      + "Every equation cited to the line of CosmoSac.cpp that runs it, "
      + "every constant quoted with its units, every assumption named "
      + "where it is made — and the licence honesty that the shipped "
      + "σ-profiles are synthetic teaching surrogates.",
    //  THE GUIDE SECTION WAS WRITTEN FOR THIS PAGE, not pointed at.
    //  COSMO-SAC had NO theory anchor at all -- every other model on the
    //  comparison page has one (ch:pcsaft and the rest) and this one did
    //  not, which is why the first draft here invented `ch:cosmosac` and
    //  methodTheoryAnchors refused it: the viewer would have opened the PDF
    //  at page 1 and said nothing.  Two tests then made the contract
    //  explicit -- a live tool MUST name a section -- so the credo §10
    //  worry about two homes is settled by the project's own rule rather
    //  than by preference: both exist, and they are checked against each
    //  other.  The guide carries the formal statement, this page carries
    //  the taught one; equations \eqref{eq:cosmo-dw} and
    //  \eqref{eq:cosmo-gamma} are the same two the steps below derive.
    theory: "ch:cosmosac",
  },
  {
    //  ONE PAGE, THREE MODELS -- and that is the pedagogy, not a shortcut.
    //  Wilson, NRTL and UNIQUAC share a trunk (local composition, Boltzmann
    //  weighting); three pages would repeat it three times and bury what
    //  actually separates them, which is what each is willing to pay for.
    id: "local-composition",
    label: "Local composition, derived (Wilson · NRTL · UNIQUAC)",
    discipline: "Thermodynamics",
    kind: "notes", status: "live",
    teaches: "That Wilson, NRTL and UNIQUAC are one idea carried three "
      + "distances -- a molecule's neighbourhood is not the bulk "
      + "composition -- and that each exists because of something the "
      + "previous one could not do: Wilson STRUCTURALLY cannot produce a "
      + "liquid-liquid split, NRTL buys that with a third parameter, "
      + "UNIQUAC separates size from energy and opens the door UNIFAC "
      + "walks through.  Every equation cited to the engine line that runs "
      + "it, every assumption named where it is made -- including the one "
      + "no textbook can teach, that a pair with no parameters does not "
      + "fail but runs at tau = 0, exactly ideal, announced and refused "
      + "unless the case authorised it.",
    theory: "ch:activity",
  },
  {
    //  READ AFTER `local-composition`, and the page says so in its first
    //  sentence: UNIFAC is UNIQUAC's residual evaluated on groups, so
    //  re-deriving the lattice a third time would teach that they are
    //  unrelated.  Points at sec:unifac, which already exists -- checked
    //  before writing the field, after the COSMO-SAC draft invented one.
    id: "unifac-theory",
    label: "UNIFAC, derived (a pair nobody has measured)",
    discipline: "Thermodynamics",
    kind: "notes", status: "live",
    teaches: "That UNIFAC is not a new theory but UNIQUAC's residual term "
      + "moved one level down, from molecules to their groups: r and q "
      + "assembled from group counts, a liquid treated as a solution OF "
      + "GROUPS, one interaction number per ordered main-group pair, and "
      + "the pure-minus-mixture subtraction that makes a group activity "
      + "into an activity coefficient.  And that its ideal fallback is a "
      + "DIFFERENT failure from NRTL's despite identical arithmetic -- "
      + "NRTL's gap is nobody fitted your pair and closes with data, "
      + "UNIFAC's is a hole in the published table and does not.",
    theory: "sec:unifac",
  },
  {
    //  THE FIRST EQUATION OF STATE on this shelf, and the page opens on
    //  that difference rather than on a formula: the other four build an
    //  excess Gibbs energy and cannot say what a density is.
    id: "pcsaft-theory",
    label: "PC-SAFT, derived (chains, dispersion, association)",
    discipline: "Thermodynamics",
    kind: "notes", status: "live",
    teaches: "That PC-SAFT builds a residual HELMHOLTZ energy from named "
      + "contributions -- hard chain, dispersion, association -- so one "
      + "surface yields both phases and their densities, which no activity "
      + "model on this shelf can express.  The temperature-dependent "
      + "segment diameter, the four zeta moments, the perturbation series "
      + "in packing fraction, van der Waals one-fluid mixing with k_ij as "
      + "a CORRECTION rather than the whole interaction, and Wertheim "
      + "TPT1's site-fraction fixed point.  And the lesson this repository "
      + "paid for: the association SCHEME is part of the fit -- water "
      + "curated as 4C instead of the paper's 2B passed a pure-density "
      + "anchor by coincidence while the mixture flash collapsed.",
    theory: "ch:pcsaft",
  },
  {
    //  BESIDE McCABE, NOT INSTEAD OF IT.  McCabe-Thiele spends constant
    //  molar overflow to get straight operating lines, and until this page
    //  that assumption could only be BELIEVED -- nothing let a reader see
    //  what it costs.  Ordered by the owner, 2026-08-31.
    id: "ponchon-savarit",
    label: "Ponchon-Savarit, derived (the enthalpy diagram)",
    discipline: "Separations & phase equilibria",
    kind: "notes", status: "live",
    teaches: "That putting ENTHALPY on the vertical axis turns the energy "
      + "balance into a point on the diagram: the difference point, whose "
      + "enthalpy is a net flow over a flow and belongs to no stream, and "
      + "from which every operating line is a ray.  The lever rule then "
      + "reads the internal reflux off the page with a ruler, total reflux "
      + "is the difference point at infinity, and minimum reflux is a ray "
      + "coinciding with a tie line.  Above all: constant molar overflow is "
      + "exactly the claim that the two enthalpy curves are parallel "
      + "straight lines, so how far they are from that IS how wrong "
      + "McCabe-Thiele is for your system.",
    theory: "ch:ponchon",
  },
  {
    //  THE FIRST PROCESS PAGE on this shelf, and it earns the place because
    //  its lesson only exists BETWEEN two units: the same twelve species
    //  minimised twice, 900 K apart, and the sulfur allotrope flips.  A
    //  one-unit page could not show it, which is why it is not a method
    //  page with a worked example.
    id: "claus-gibbs",
    label: "The allotrope nobody declared (a Claus plant)",
    discipline: "Reaction engineering",
    kind: "notes", status: "live",
    teaches: "That a Claus stoichiometry CANNOT be written by hand, because "
      + "'3/x S_x' contains an unknown that is itself an equilibrium -- and "
      + "that the way out is to stop specifying reactions: declare the "
      + "atoms and the candidate species and minimise G subject to A n = b, "
      + "which collapses N unknowns into one element potential per ELEMENT "
      + "plus a total.  That an adiabatic temperature is a RESULT of the "
      + "air rate, not a specification.  That the 2 : 1 H2S : SO2 every "
      + "Claus plant is controlled to falls out of a minimisation never "
      + "told about it, while the furnace's 1.04 is explained by the "
      + "hydrogen on the same line.  And that a species with no formation "
      + "data has no Gibbs energy and cannot play at all -- which is why "
      + "the case writes two components of its own, one new and one an "
      + "overlay filling a gap the catalogue record honestly declares.",
    theory: "ch:gibbs-reactor",
  },
  {
    //  THE PAIR IS THE POINT.  Read beside `claus-gibbs`: that page
    //  minimises a Gibbs energy over ideal gases with no solvent and no
    //  charge; this one solves an aqueous equilibrium where the same sulfur
    //  wears three names and the pH decides which.  A student who meets only
    //  one of them learns that "the model" is whichever one they met.
    //
    //  It does NOT claim the two streams join, and its last box says so --
    //  a rich-amine acid gas is not a sour-water overhead, and the tidy
    //  story would be worth less than the distinction.
    id: "sour-water",
    label: "The same sulfur, one unit earlier (sour water)",
    discipline: "Separations & phase equilibria",
    kind: "notes", status: "live",
    teaches: "That a dissolved acid gas is not one substance: H2S(aq), HS- "
      + "and S2- coexist and the pH decides the split, so a stream carries "
      + "BOTH bases -- the apparent components that close the mass balance "
      + "and a declared speciation of the liquid.  That the equilibrium is a "
      + "small Newton (mass action, master balances, electroneutrality when "
      + "the pH is solved) whose K's move with temperature by van't Hoff on "
      + "each record's own enthalpy.  That a reactive TRAY is just that "
      + "flash, reached through one K-value entry point, so the column's "
      + "Jacobian never sees an ion.  And the prediction a reader gets "
      + "wrong: stripping the acid gas makes the pH FALL, because the "
      + "ammonia leaves too and the sulfide does not follow the carbonate "
      + "out.",
    theory: "ch:speciation",
  },
  {
    //  ASKED FOR by the owner the same evening he could not find the Design
    //  Guide in the Help menu -- and the two are one problem: that guide IS
    //  the rules-of-thumb reference and was unreachable from the app.
    //
    //  The page carries NO rule text, deliberately.  Transcribing heuristics
    //  into TypeScript would be a second home for numbers a student acts on,
    //  several beside named safety standards; the index is DERIVED and every
    //  row deep-links into the guide's own chapter.  What it adds is a filter
    //  across all sixty titles at once and the guide's framing kept in front
    //  of the reader.
    id: "rules-of-thumb",
    label: "Rules of thumb (what equipment do I even pick?)",
    discipline: "Heat transfer & energy",
    kind: "notes", status: "live",
    teaches: "Where to start when the problem stops being 'solve this flash' "
      + "and becomes 'what equipment do I even choose?' -- twenty-six "
      + "chapters of process-design heuristics, from flowsheet structure and "
      + "reactor type through separation trains, membranes, solids, "
      + "exchangers and pinch to hydraulics, relief and cost, each one click "
      + "from the chapter that states it.  And the posture that makes a "
      + "heuristic useful rather than dangerous: a rule is a starting bet, "
      + "not a verdict, this simulator is glass-box so you can falsify it in "
      + "an afternoon, and anything that could touch safety follows the "
      + "named standard instead.",
    theory: "ch:gibbs-reactor",
  },
  {
    //  FIRST among the constructions, deliberately.  Until this existed the
    //  list went from "what is a temperature" straight to McCabe-Thiele, so a
    //  student met the STAIRCASE before ever meeting one STEP -- which is how
    //  people end up able to draw the construction without being able to say
    //  what either line means.
    id: "flash-operating-line", label: "Flash (operating line)",
    discipline: "Separations & phase equilibria",
    kind: "construction", status: "live",
    teaches: "The single equilibrium stage, and the two curves that decide "
      + "it: the material balance is a straight line that PIVOTS about the "
      + "feed on the diagonal with slope -L/V, and where it cuts the "
      + "equilibrium curve is the flash. Every other construction in this "
      + "list is this step repeated, moved to other axes, or integrated.",
    theory: "ch:flash",
  },
  {
    //  THE OWNER ASKED FOR THIS ONE BY NAME, and for a reason that is the
    //  tool's whole subject: speciation against pH in a single-family
    //  electrolyte is the diagram he has always found magical.  What makes it
    //  worth a page rather than a picture is that Choupo DECLINES to draw it
    //  the way a book does.  A book puts pH on the axis and substitutes it
    //  into the mass-action expressions; the engine will accept a given pH
    //  too, but doing so DROPS the electroneutrality row and the points stop
    //  being solutions anybody could make.  The witness declares `pH solve;`,
    //  so every point had to be a beaker and the abscissa came back out of
    //  charge.  The diagram is the same; the lesson is not.
    id: "bjerrum", label: "Speciation vs pH (Bjerrum)",
    discipline: "Thermodynamics",
    kind: "construction", status: "live",
    teaches: "That the pH axis of a speciation diagram is a RESULT, not a "
      + "knob: 44 separate equilibrium calculations, each a real neutral "
      + "mixture, each landing wherever its own charge balance puts it -- and "
      + "the two crossovers arriving on the two pK's without either having "
      + "been an input. Also the two things the hand-drawn version cannot "
      + "show: the three fractions do not sum to one, because the titrant is "
      + "not a spectator, and the crossovers sit below the thermodynamic pK "
      + "because the engine works in activities.",
    theory: "ch:electrolytes",
  },
  {
    id: "mccabe", label: "Distillation (McCabe-Thiele)",
    discipline: "Separations & phase equilibria", kind: "construction", status: "live",
    teaches: "Operating lines, the q-line and the staircase: how reflux R and feed quality q set the number of ideal stages.",
    theory: "ch:distillation",
  },
  //  THE CAPABILITY WAS ALREADY IN THE SIMULATOR (2026-08-19).  `shortcutColumn`
  //  has computed Fenske, Underwood and the Molokanov form of Gilliland since
  //  long before this registry existed; what was missing was the LENS — the
  //  student who types 22 into a rigorous column's `nStages` had nowhere to see
  //  where that first number comes from.  So this entry adds no physics: both
  //  curves it draws are engine runs of bundled tutorials
  //  (shortcut01_benzene_toluene and column02_simultaneous), one solve per
  //  point, and the juxtaposition it exists for — the shortcut's stage count
  //  beside the rigorous column's — is two engine answers to one question, tied
  //  together by the protocol written out in case/fugShortcut.ts.
  //
  //  THE LABEL IS SHORT BECAUSE THE ROW HAS A WIDTH BUDGET, and this entry
  //  spent it.  A tool tab's menu row LEADS with `Tool: <label>` and the row is
  //  a wrapping Group; MenuBar.tsx measured that budget at 390 px and named the
  //  longest label it was sized for ("Ignition / extinction (Van Heerden)",
  //  242 px of text).  This entry first read "Distillation shortcut
  //  (Fenske-Underwood-Gilliland)" -- half as long again -- and checkGui found
  //  exactly the failure that comment predicts: the row wrapped, `Help` landed
  //  under the caption and came back COVERED at 390x844.  So the menu carries
  //  the engine's own alias (`shortcutColumn`, alias `FUG`) and the three names
  //  are spelled out one line below, in `teaches`, where there is room for
  //  them.  Do not lengthen it back without re-running bin/checkGui.
  {
    id: "fug", label: "Distillation shortcut (FUG)",
    discipline: "Separations & phase equilibria",
    kind: "construction", status: "live",
    teaches: "Where the first number you type into a rigorous column comes "
      + "from: total reflux fixes N_min, minimum reflux fixes R_min, and "
      + "Gilliland — a fit, not a derivation — interpolates N(R) between those "
      + "two asymptotes, with the rigorous MESH column's own stage count for "
      + "the same separation drawn beside it.",
    theory: "ch:fug",
  },
  {
    id: "psychro", label: "Psychrometric chart",
    discipline: "Heat transfer & energy", kind: "construction", status: "live",
    teaches: "The humid-gas state map: saturation, relative-humidity and adiabatic-saturation / wet-bulb lines locate every drying and conditioning path.",
    theory: "ch:drying",
  },
  {
    id: "kremser", label: "Absorption (Kremser)",
    discipline: "Separations & phase equilibria", kind: "construction", status: "live",
    teaches: "The absorption factor A = L/(mV): how solute recovery scales with stage count when both lines are straight — judged against the engine's stagewise recovery.",
    theory: "ch:absorber",
  },
  {
    id: "pinch-composite", label: "Pinch composite curves",
    discipline: "Heat transfer & energy", kind: "construction", status: "live",
    teaches: "Hot and cold composite curves: the pinch splits the problem and fixes Q_H,min / Q_C,min before any exchanger is drawn — the in-view cascade cross-checked against the engine's targets.",
    theory: "ch:pinch",
  },
  {
    id: "entu", label: "Heat exchanger (ε-NTU)",
    discipline: "Heat transfer & energy", kind: "construction", status: "live",
    teaches: "Effectiveness vs NTU at a capacity ratio: why counter-current wins and when extra area stops paying — the run's exchanger placed on its own curve.",
    theory: "ch:hx-entu",
  },
  {
    id: "pump-system", label: "Pump vs system curve",
    discipline: "Hydraulics & control", kind: "construction", status: "live",
    teaches: "The operating point is an intersection: the pump model's rise falling with flow against the pipe system's demand rising with it — crossed where the engine's own columns cross.",
    theory: "ch:rotating",
  },
  {
    id: "merkel", label: "Cooling tower (Merkel)",
    discipline: "Heat transfer & energy", kind: "construction", status: "live",
    teaches: "Merkel's one diagram: saturated-air enthalpy above, the operating line below, and the shaded gap between them is the driving force the packing must buy.",
    theory: "ch:coolingTower",
  },
  {
    id: "rayleigh", label: "Batch still (Rayleigh)",
    discipline: "Separations & phase equilibria", kind: "construction", status: "live",
    teaches: "The graphical Rayleigh integration: the area under 1/(y*−x) between the charge and the pot IS ln(W0/W) — drawn from the engine's own equilibrium curve, judged against the engine's rigorous still.",
    theory: "ch:rayleigh",
  },
  {
    id: "levenspiel", label: "Reactor sizing (Levenspiel)",
    discipline: "Reaction engineering", kind: "construction", status: "live",
    teaches: "One chart, two areas: the PFR's integral under 1/(−r) against the CSTR's rectangle at the outlet rate — why a CSTR needs more volume for the same conversion under positive-order kinetics.",
    theory: "ch:pfr",
  },
  {
    id: "vanheerden", label: "Ignition / extinction (Van Heerden)",
    discipline: "Reaction engineering", kind: "construction", status: "live",
    teaches: "Heat generated against heat removed: a straight line can cut a sigmoid three times, so the same reactor with the same feed has three steady states — and the middle one is the state no start-up procedure can hold.",
    theory: "ch:cstr",
  },
  {
    id: "drying", label: "Drying curve (batch tray)",
    discipline: "Heat transfer & energy", kind: "construction", status: "live",
    teaches: "The two classical drying plots: X against time, and the rate against moisture — where the critical moisture is VISIBLE as the corner at which a flat rate starts to fall toward the isotherm's equilibrium.",
    theory: "ch:drying",
  },
  {
    id: "breakthrough", label: "Adsorption breakthrough",
    discipline: "Separations & phase equilibria", kind: "construction", status: "live",
    teaches: "The S-shaped breakthrough curve: the mass-transfer zone consumes bed capacity long before the bed saturates — the ideal square wave drawn at the engine's stoichiometric time.",
    theory: "ch:adsorption",
  },
  //  MOUNTED 2026-08-19.  This entry arrived deliberately `planned` with the
  //  mount written out below it, because the host's dispatch was a hand-written
  //  `tool === "…" ? <X/>` chain whose FALLBACK was the breakthrough tool:
  //  flipping the status before the mount landed would have published a page
  //  captioned Hunter-Nash drawing an adsorption breakthrough curve.  Both are
  //  now done — MethodsWorkspace lazy-imports TieTriangleTool and dispatches on
  //  the id — and the fallback itself REFUSES BY NAME, so the trap that made
  //  the caution necessary is closed for every tool after this one.
  {
    id: "hunter-nash", label: "Extraction (Hunter-Nash)",
    discipline: "Separations & phase equilibria", kind: "construction", status: "live",
    teaches: "One point rules the whole column: the difference point Δ = F − E₁ = R_j − E_{j+1} lies on every operating line, so the triangle alternates tie-lines with lines through Δ — and the rigorous cascade's own stages are laid on it as the test.",
    theory: "sec:hunter-nash",
    fedBy: "ui/methods/TieTriangleTool.tsx over "
      + "case/hunterNash.ts.  Its engine feeds already exist and are verified — "
      + "propertyScanTernary `mode lle` (x1,x2,x3,region,kind,tieline_id) from "
      + "tutorials/props/scan/ternary03_lle_water_ethanol_benzene, and the "
      + "extractor's stage profile (xE_<comp>/xR_<comp>) plus its terminal-flow "
      + "KPIs from tutorials/steady/absorption/extract01_ethanol_water_benzene.  "
      + "What is missing is the host dispatch in MethodsWorkspace.tsx (see the "
      + "comment above this entry), not an engine output.",
  },
  //  THE ENGINE SHIPPED FIRST AND NOTHING DREW IT (2026-08-19).  The
  //  `thielePellet` property operation solved the pellet BVP and published the
  //  intraparticle field on the live site for a day with no tool in this
  //  registry able to render it — a computed answer nobody could see.  This
  //  entry arrives LIVE and MOUNTED in the same change: the dispatch in
  //  MethodsWorkspace refuses an unmounted id by name now, so a `planned`
  //  placeholder here would have helped nobody.
  {
    id: "thiele", label: "Catalyst pellet (Thiele modulus)",
    discipline: "Reaction engineering", kind: "construction",
    status: "live",
    teaches: "The concentration field INSIDE one pellet: turn the rate "
      + "constant and watch it go from nearly flat — the whole pellet working "
      + "— to a boundary layer hugging the surface over a dead core, with the "
      + "effectiveness factor beside it as the consequence, and the closed "
      + "form drawn over the numerical answer so the method is watched being "
      + "checked.",
    theory: "ch:thiele",
  },
  //  THE FIRST TOOL OF THE SELECTION KIND (heuristics-as-a-third-kind, ruled
  //  2026-08-18).  It constructs nothing and shows no property surface: it
  //  helps a reader CHOOSE a control structure among the several defensible
  //  ways of doing it, which is the difficulty the owner reported.  Its
  //  content is curated records under data/standards/heuristics/ — zero
  //  heuristics in TypeScript, the standing "zero physics in TS" rule applied
  //  to guidance.
  {
    id: "column-control", label: "Column control (structure & instruments)",
    discipline: "Hydraulics & control",
    kind: "selection", status: "live",
    teaches: "Five valves, five inventories, two left for composition: the cross-section shows which measurement drives which valve, the cited authorities disagree in the open, and the sensor tray is computed from the column's own profile — the slope criterion and the sensitivity criterion, which pick different trays.",
    theory: "sec:column-control",
  },
];

/** The workspace's own caption.  The URL key stays `methods` (deep-link
 *  contract); this is the word a student reads. */
export const EDUTOOLS_LABEL = "EduTools";

/** The one-paragraph blurb: what this plane is, and where the OTHER half of
 *  the material lives.  Rendered in the dropdown's footer. */
export const EDUTOOLS_BLURB =
  "Classical graphical methods, constructed over curves the engine computes — "
  + "the method's answer beside the engine's.  Property surfaces (T-x-y, γ, Psat) "
  + "live in Explore; the split criterion: method-construction → EduTools, "
  + "property-surface → Explore.";

/** The Theory Guide deep link for a tool's named destination.
 *
 *  BASE-AWARE.  Every other PDF link in the GUI already builds on
 *  `import.meta.env.BASE_URL` (helpMap.helpUrl, modelDocs, the Help menu);
 *  this one used to hardcode a leading "/", so under a deployed base (the
 *  landing serves the app at /app) it pointed outside the app and 404'd —
 *  which a browser answers by downloading or erroring, never by jumping to a
 *  section. */
export const theoryUrl = (dest: string): string =>
  guideUrl("theoryGuide", dest);

/** Boot tool from the URL: `?workspace=methods&tool=<id>` (the contract), or
 *  the legacy Explorer deep-link `?explore=mccabe` WITHOUT a `&key=` stash
 *  (with a key it is the analyzer pop-out tab, which AppShell routes first). */
export function bootTool(): MethodToolId {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search);
    if (q.get("explore") === "mccabe" && !q.has("key")) return "mccabe";
    const t = q.get("tool");
    if (METHOD_TOOLS.some((m) => m.id === t && m.status === "live"))
      return t as MethodToolId;
  }
  return "mccabe";
}

// ---- The selection (one home, two readers) ---------------------------------

let activeTool: MethodToolId = bootTool();
const listeners = new Set<() => void>();

export function getActiveMethodTool(): MethodToolId {
  return activeTool;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Select a tool.  Also writes the deep link back into the URL
 *  (history.replaceState — no history spam), so the address bar stays a
 *  shareable bookmark of what is on screen; bootTool() reads it back.  The
 *  legacy `?explore=mccabe` param is dropped on the way (it would otherwise
 *  out-vote `tool=` on the next boot). */
export function setActiveMethodTool(id: MethodToolId): void {
  activeTool = id;
  if (typeof window !== "undefined"
    && typeof window.history?.replaceState === "function") {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("workspace", "methods");
      url.searchParams.set("tool", id);
      url.searchParams.delete("explore");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch { /* opaque URL / blocked history — the selection alone is fine */ }
  }
  for (const fn of listeners) fn();
}

/** The active tool as React state, for any component that renders it (the
 *  workspace body and the top-bar dropdown's check mark). */
export function useActiveMethodTool(): MethodToolId {
  return useSyncExternalStore(subscribe, getActiveMethodTool, getActiveMethodTool);
}
