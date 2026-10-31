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
  Process safety, as LESSON TEXT (commission C60, 2026-10-11).  Vitor:
  "Então acho que podes por isso num edutool de segurança".  Corrected the
  same day on two second opinions Vitor relayed (DEV.md 4c C60, REVIEW and
  SECOND REVIEW 2026-10-11): twelve points, then seven, each re-checked
  against a source READ for it, and the ones that could not be checked say
  so on the page.  The second review replaced the reaction: the witnesses
  now run a FICTITIOUS reaction whose records are coherent by construction,
  instead of a real esterification whose acetic-acid record carries a known
  inconsistency (that record is its own item in DEV.md C60).

  WHAT IS QUOTED AND WHAT IS NOT.  A quotation on this page is verbatim
  from a source that was READ for it, and is held to that source's wording
  by tests/processSafety.test.ts (the SAFETY_QUOTES list below carries the
  exact strings).  Sources read in full or in the passage used:

    * The Flixborough Disaster: Report of the Court of Inquiry (Department
      of Employment, HMSO, London 1975), the copy IChemE hosts; paragraphs
      1, 28, 29, 40, 62, 203 and 209 are used.
    * IChemE Lessons Learned Database, "Methyl Isocyanate Storage Tank
      Runaway Reaction" (Bhopal, 3 December 1984), incident summary Rev. 2.
    * E. Broughton, "The Bhopal disaster and its aftermath: a review",
      Environmental Health 4:6 (2005), open access (CC BY).
    * P.R. Amyotte, F.I. Khan and T.A. Kletz, "Inherently safer design
      activities over the past decade", IChemE Symposium Series 155
      (Hazards XXI, 2009), the section on the hierarchy of controls.
    * Y. Sheng et al., "Thermal Risk Evaluation of the Fluorobenzotriazolone
      Nitration Process", Molecules 30 (2025) 2939 (open access): the
      criticality table (Table 11), the definition of T_D24 and the TMR_ad
      approximation (section 3.3), all citing Stoessel.
    * L. Chen et al., "Tcf and MTSR of Toluene Nitration in Mixed Acid",
      Chem. Eng. Trans. 48 (2016) 601-606 (open access): equations (1)-(4),
      Stoessel's semi-batch cooling-failure temperature with the mass
      correction, cited there to Stoessel 2008.
    * Who Gall and Kletz were (second review, point 7): John Gall
      (1925-2014) was an American paediatrician (his Wikipedia entry and
      the author notes of Systemantics); his four laws are quoted
      VERBATIM, with their chapters, from J. Gall, The Systems Bible (the
      third edition of Systemantics), General Systemantics Press, 2002,
      read for this page on 2026-10-26 from Vitor's own copy (page numbers
      are not cited: the copy read carries none that can be trusted);
      Trevor Kletz (1922-2013)
      graduated in chemistry in 1944 and joined ICI as a research chemist,
      later managed plants, and in 1968 became ICI's first technical
      safety adviser (his Wikipedia entry; the IChemE and trade-press
      obituaries of November 2013 agree).  Neither was an engineer by
      training, which is why the page no longer calls them "two
      engineers".

  NOT read, and the page says so where it leans on them: Stoessel's book
  itself; Kletz &
  Amyotte's handbook (its five headings are named from the library record,
  the definitions are ours).  Kletz's "What you don't have, can't leak" is
  quoted as the TITLE of his 1978 paper, a bibliographic fact.

  CODE PATHS, BINARIES AND RECIPE LINES live in SAFETY_TECH_NOTES, drawn
  in a collapsed technical note, not in the lesson's prose (second review,
  point 7); engine claims there carry the file and line they were read at.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";


/** Every verbatim quotation the page prints, with where it comes from.  The
 *  test holds each `text` to the page (it must appear in a step) and the
 *  page to this list (a quotation mark around anything else is a defect). */
export interface SafetySource { id: string; cite: string; text: string }

export const SAFETY_QUOTES: readonly SafetySource[] = [
  { id: "flix-1",
    cite: "Flixborough Court of Inquiry (HMSO 1975), para. 1",
    text: "virtually demolished by an explosion of warlike dimensions" },
  { id: "flix-209",
    cite: "Flixborough Court of Inquiry (HMSO 1975), para. 209",
    text: "The disaster was caused by the introduction into a well designed "
      + "and constructed plant of a modification which destroyed its "
      + "integrity." },
  { id: "flix-62",
    cite: "Flixborough Court of Inquiry (HMSO 1975), para. 62",
    text: "no drawing of the pipe was made, other than in chalk on the "
      + "workshop floor" },
  { id: "flix-40",
    cite: "Flixborough Court of Inquiry (HMSO 1975), para. 40",
    text: "This automatic safety device could, however, be simply and "
      + "effectively over-ridden" },
  { id: "flix-203a",
    cite: "Flixborough Court of Inquiry (HMSO 1975), para. 203",
    text: "in others the added complexity might induce more dangers than it "
      + "eliminated" },
  { id: "flix-203b",
    cite: "Flixborough Court of Inquiry (HMSO 1975), para. 203",
    text: "there might be a better return (with regard to safety) from "
      + "expenditure on making the original plant safer than by providing "
      + "elaborate safety systems to deal with potential inadequacies" },
  { id: "bhopal-ichemE",
    cite: "IChemE Lessons Learned Database, Bhopal incident summary, Rev. 2",
    text: "The refrigeration system, vent gas scrubber and flare stack were "
      + "not in service" },
  { id: "bhopal-isd",
    cite: "IChemE Lessons Learned Database, Bhopal incident summary, Rev. 2",
    text: "Failure to apply inherently safer design principles (eliminate "
      + "MIC storage, substitute stainless steel vent headers)" },
  { id: "gall-ch14-ways",
    cite: "J. Gall, The Systems Bible (3rd ed. of Systemantics, 2002), ch. 14",
    text: "A SYSTEM CAN FAIL IN AN INFINITE NUMBER OF WAYS" },
  { id: "gall-ch14-failsafe",
    cite: "J. Gall, The Systems Bible (3rd ed. of Systemantics, 2002), ch. 14",
    text: "WHEN A FAIL-SAFE SYSTEM FAILS, IT FAILS BY FAILING TO FAIL SAFE" },
  { id: "gall-ch4-kicks",
    cite: "J. Gall, The Systems Bible (3rd ed. of Systemantics, 2002), ch. 4",
    text: "THE SYSTEM ALWAYS KICKS BACK" },
  { id: "gall-ch11-law",
    cite: "J. Gall, The Systems Bible (3rd ed. of Systemantics, 2002), ch. 11",
    text: "A COMPLEX SYSTEM THAT WORKS IS INVARIABLY FOUND TO HAVE EVOLVED "
      + "FROM A SIMPLE SYSTEM THAT WORKED." },
  { id: "kletz-1978",
    cite: "T. Kletz, Chemistry and Industry, 6 May 1978 (the paper's title)",
    text: "What you don't have, can't leak" },
  { id: "amyotte-2009",
    cite: "Amyotte, Khan & Kletz, IChemE Symp. Ser. 155 (Hazards XXI, 2009), "
      + "Hierarchy of controls",
    text: "the hierarchy of controls does not invalidate the usefulness of "
      + "engineered and procedural safety measures" },
];

export const SAFETY_STEPS: readonly LessonStep[] = [
  // ---- Part 0: the thesis -------------------------------------------------
  {
    n: 1,
    title: "A paediatrician and a chemist who said the same thing",
    body: "John Gall was a paediatrician who wrote Systemantics (first "
      + "published 1975; its third edition is The Systems Bible, 2002), a "
      + "short book of laws about how systems behave, set in his own "
      + "capitals.  Three of them: \"A SYSTEM CAN FAIL IN AN INFINITE NUMBER "
      + "OF WAYS\" and \"WHEN A FAIL-SAFE SYSTEM FAILS, IT FAILS BY FAILING "
      + "TO FAIL SAFE\" (ch. 14), and \"THE SYSTEM ALWAYS KICKS BACK\" "
      + "(ch. 4, which he calls Le Chatelier's Principle).  A fourth, usually "
      + "called Gall's law (ch. 11): \"A COMPLEX SYSTEM THAT WORKS IS "
      + "INVARIABLY FOUND TO HAVE EVOLVED FROM A SIMPLE SYSTEM THAT "
      + "WORKED.\"  Trevor Kletz was a "
      + "chemist: he joined ICI as a research chemist in 1944, managed "
      + "plants, and from 1968 was its first technical safety adviser; his "
      + "autobiography is titled By Accident ... a Life Preventing Them in "
      + "Industry (2000).  His 1978 paper is titled \"What you don't have, "
      + "can't leak\".  The two say one thing from two sides.  Every "
      + "protective layer -- an alarm, an interlock, a scrubber, a relief "
      + "valve -- is itself a system, with its own ways of failing, its own "
      + "maintenance, its own bypass switch.  Removing a hazard removes the "
      + "need to rely on a layer; adding a layer adds a system.  That is why "
      + "the order in which a designer asks the questions matters: first "
      + "whether the hazard can be removed or made smaller, and only then "
      + "how to protect against what remains.  This is not an argument "
      + "against protection layers.  Once the hazard has been made as small "
      + "as the process allows, independent protection layers are still "
      + "needed for the hazard that remains; in the words of Amyotte, Khan "
      + "and Kletz (2009), \"the hierarchy of controls does not invalidate "
      + "the usefulness of engineered and procedural safety measures\".  "
      + "What the order changes is how much rests on them.",
  },
  {
    n: 2,
    title: "Flixborough, 1974: a temporary modification",
    body: "On Saturday 1 June 1974 the Nypro works at Flixborough were "
      + "\"virtually demolished by an explosion of warlike dimensions\"; 28 "
      + "people on the site were killed and 36 injured (Court of Inquiry, "
      + "para. 1).  Cyclohexane was oxidised with air in a train of six "
      + "reactors at about 8.8 kg/cm2 and 155 °C (para. 28).  A crack had "
      + "been found in reactor 5; it was taken out and a 20-inch bypass pipe "
      + "joined reactors 4 and 6 through the existing bellows.  The Court "
      + "found that no calculations were done for the pipe or the bellows "
      + "and that \"no drawing of the pipe was made, other than in chalk on "
      + "the workshop floor\" (para. 62).  Its first lesson names the cause: "
      + "\"The disaster was caused by the introduction into a well designed "
      + "and constructed plant of a modification which destroyed its "
      + "integrity.\" (para. 209).  Two more things in the same report "
      + "belong to this page, and neither is the cause.  The fluid leaving "
      + "the reactors was still about 94 % cyclohexane (para. 29): a few per "
      + "cent was converted per pass, so a large inventory of hot "
      + "cyclohexane under pressure circulated to make a small product flow. "
      + " That illustrates INVENTORY -- how much hazardous material a design "
      + "holds, which is what Kletz asks a designer to reduce first -- and "
      + "lesson 2 meets the same arithmetic.  And the Court itself weighed "
      + "protection against prevention: of devices that would cut off or "
      + "dump an escaping inventory, \"in others the added complexity might "
      + "induce more dangers than it eliminated\", and \"there might be a "
      + "better return (with regard to safety) from expenditure on making "
      + "the original plant safer than by providing elaborate safety "
      + "systems to deal with potential inadequacies\" (para. 203).  That is "
      + "Kletz's thesis, in a court's words, in 1975.  The same report notes "
      + "that the automatic nitrogen purge guarding the oxidation could be "
      + "defeated from behind the control panel: \"This automatic safety "
      + "device could, however, be simply and effectively over-ridden\" "
      + "(para. 40).",
  },
  {
    n: 3,
    title: "Bhopal, 1984: the layers that existed on paper",
    body: "In the night of 2 to 3 December 1984, water entered a tank of "
      + "methyl isocyanate (MIC) at the Union Carbide plant in Bhopal, and "
      + "the exothermic reaction that followed ran away until toxic vapour "
      + "left through the relief system (IChemE incident summary).  "
      + "Broughton's review (2005) puts about forty tons of MIC in the tank "
      + "and the immediate deaths at an estimated 3,800, with far higher "
      + "estimates beside them; the IChemE summary gives a toll of 15,248 "
      + "based on agreed compensation claims.  The two accounts of how the "
      + "water got in differ (a faulty valve during pipe washing in "
      + "Broughton; routine water flushing of the vent headers among the "
      + "IChemE summary's critical factors); they agree on the state of the "
      + "protection.  "
      + "The IChemE summary: \"The refrigeration system, vent gas scrubber "
      + "and flare stack were not in service\"; the tank's high-temperature "
      + "alarm had been disconnected with the refrigeration, and the "
      + "emergency water spray was ineffective.  Broughton adds that the "
      + "scrubber had been turned off three weeks before, the refrigeration "
      + "unit drained of its coolant for use elsewhere, and the flare out of "
      + "action for three months.  Multiple protection layers existed in the "
      + "design; that night they were out of service, disconnected or "
      + "ineffective.  A layer that has to be kept working is a system with "
      + "its own ways of failing -- Gall's point, at the scale of a city.  "
      + "The same summary names the other route: "
      + "\"Failure to apply inherently safer design principles (eliminate "
      + "MIC storage, substitute stainless steel vent headers)\".  MIC was "
      + "an intermediate, not a product; Kletz's argument, in paraphrase, "
      + "was that storing it was a convenience, and that MIC made and used "
      + "at once would have limited the worst leak to what a pipe holds.  "
      + "The summary also records a route to the same insecticide that "
      + "makes no MIC at all.  Lesson 1 starts from the same physics: a "
      + "vessel whose cooling is gone, with reactant inside it.",
  },
  {
    n: 4,
    title: "The inherently safer principles",
    body: "Kletz and Amyotte organise inherently safer design under five "
      + "headings, in this order (Process Plants: A Handbook for Inherently "
      + "Safer Design, 2nd ed., 2010; the definitions here are ours).  "
      + "INTENSIFICATION: hold less of the hazardous material -- a smaller "
      + "inventory, a smaller vessel, an intermediate used as it is made.  "
      + "SUBSTITUTION: use a less hazardous material or route -- the "
      + "route to the same insecticide that makes no MIC.  ATTENUATION: use "
      + "the hazard in a milder form -- a process that RUNS at a lower "
      + "pressure or temperature, a diluted material.  LIMITATION OF "
      + "EFFECTS: design so that a failure does less -- smaller pipes, a "
      + "vessel that holds only what can safely react, a layout that keeps "
      + "people away.  SIMPLIFICATION: fewer things to go wrong, and those "
      + "that do go wrong visibly.  What these have in common is that, once "
      + "built, they do not depend on a system that has to keep working: a "
      + "vessel built smaller stays smaller.  That is why a material kept "
      + "cold by REFRIGERATION is not on the list, though it is colder: the "
      + "low temperature is held by an active system that must keep running "
      + "-- and at Bhopal the refrigeration had been switched off and its "
      + "coolant drained.  An interlock, a scrubber and a refrigeration unit "
      + "can each be switched off; a smaller inventory cannot.  The rest of "
      + "this page applies two of the headings with the engine running: "
      + "limiting what a batch reactor holds by dosing it (lesson 1), and "
      + "attenuating an ammonia loop by lowering its pressure (lesson 2) -- "
      + "where the principles turn out to pull in different directions.",
  },
  // ---- Lesson 1: the cooling-failure scenario ----------------------------
  {
    n: 5,
    title: "Lesson 1: what if the cooling fails?",
    body: "An exothermic reaction runs at a process temperature T_p, held "
      + "there by a jacket that removes the heat as fast as the reaction "
      + "makes it.  The thermal-safety methodology the chemical industry "
      + "uses (Gygax; Stoessel, Thermal Safety of Chemical Processes, 2008) "
      + "asks one question first: what if, at time t, the cooling fails?  "
      + "From then on the vessel is adiabatic, and whatever reactant is in "
      + "it and has not yet reacted -- the ACCUMULATION -- reacts and heats "
      + "the mass, to a temperature T_cf.  The largest T_cf over the "
      + "instants at which the failure could happen is the maximum "
      + "temperature of the synthesis reaction, MTSR.  If the whole charge "
      + "reacted adiabatically, the mass would rise by the adiabatic "
      + "temperature rise; a fraction X_ac of the charge left unreacted "
      + "gives that fraction of the heat.  In a semi-batch reactor that heat "
      + "lands in LESS material than the rise was defined on -- the vessel "
      + "has not yet received everything -- so the same heat raises the "
      + "temperature further.  Stoessel's semi-batch form scales the rise "
      + "by the ratio of the final mass to the mass present at the failure "
      + "instant (as reproduced by Chen et al., Chem. Eng. Trans. 48 (2016) "
      + "601, eq. 1, citing Stoessel 2008; the book itself was not read).  "
      + "For a batch, whose mass does not change, M(t) = M_f and it reduces "
      + "to the familiar MTSR = T_p + X_ac ΔT_ad, the accumulation taken at "
      + "the failure instant.",
    formula: String.raw`\Delta T_\mathrm{ad} = \frac{(-\Delta H_\mathrm{r})\, n_\mathrm{A}}{M_\mathrm{f}\, c_p}, \qquad T_\mathrm{cf}(t) = T_\mathrm{p} + X_\mathrm{ac}(t)\, \Delta T_\mathrm{ad}\, \frac{M_\mathrm{f}}{M(t)}, \qquad \mathrm{MTSR} = \max_t T_\mathrm{cf}(t)`,
    where: [
      { sym: "\\Delta T_\\mathrm{ad}", means: "the adiabatic temperature "
        + "rise of the whole charge reacting from T_p, on the final mass",
        unit: "K" },
      { sym: "\\Delta H_\\mathrm{r}", means: "the heat of reaction per "
        + "mole of the limiting reactant (negative: exothermic)",
        unit: "J/mol" },
      { sym: "n_\\mathrm{A}", means: "the moles of the limiting reactant "
        + "the whole batch receives (reactant B on this page)", unit: "mol" },
      { sym: "M_\\mathrm{f}", means: "the final mass of the reaction mass: "
        + "everything the batch is given", unit: "kg" },
      { sym: "c_p", means: "the specific heat capacity of the reaction "
        + "mass, which this form takes to be the same at every instant",
        unit: "J/(kg K)" },
      { sym: "T_\\mathrm{cf}", means: "the temperature reached if the "
        + "cooling fails at t and the accumulated reactant reacts "
        + "adiabatically", unit: "K" },
      { sym: "t", means: "the instant at which the cooling fails",
        unit: "s" },
      { sym: "T_\\mathrm{p}", means: "the process temperature, where "
        + "the jacket holds the reactor", unit: "K" },
      { sym: "X_\\mathrm{ac}", means: "the accumulation: the fraction "
        + "of all the limiting reactant the batch will receive that is in "
        + "the vessel, unreacted, at t", unit: "–" },
      { sym: "M", means: "the mass in the vessel at t (M_f in a batch)",
        unit: "kg" },
      { sym: "\\mathrm{MTSR}", means: "the maximum temperature of the "
        + "synthesis reaction: the largest T_cf over the instants the "
        + "failure could happen", unit: "K" },
    ],
    note: "On this page the engine computes the adiabatic rise itself, by "
      + "running the batch witness with the failure at t = 0: its heat of "
      + "reaction comes from the records' formation data (the run log "
      + "prints it as [reaction heat]) and its heat capacities from each "
      + "component record's own constant molar Cp.  The estimate's masses "
      + "are the run's own amounts times the records' molar masses.  "
      + "Nothing in the formula above is typed into the page.",
  },
  {
    n: 6,
    title: "Two limits: the boiling point and T_D24",
    body: "The MTSR means nothing alone; it is compared with two other "
      + "temperatures.  MTT, the maximum temperature for technical reasons, "
      + "is usually the boiling point of the reaction mass in an open "
      + "vessel (or the temperature at which a closed one reaches its relief "
      + "pressure): if the runaway reaches it, the mass boils, which removes "
      + "heat if the vapour can get away and raises the pressure if it "
      + "cannot.  It is one technical limit among others -- a vessel's "
      + "design temperature, the temperature at which a dissolved gas is "
      + "released or a product degrades -- and the one to compare with is "
      + "whichever comes first.  T_D24 is not a decomposition onset, and "
      + "not the onset a DSC trace shows: it is the temperature at which "
      + "the adiabatic time to maximum rate, TMR_ad, of the SECONDARY "
      + "decomposition is 24 hours (Sheng et al., Molecules 30 (2025) 2939, "
      + "section 3.3, citing Stoessel).  Started there with no cooling, the "
      + "decomposition would take a day to run away; started hotter, less.  "
      + "It is derived from the decomposition's kinetics -- the heat it "
      + "releases and how fast that rate grows with temperature -- usually "
      + "measured by differential scanning calorimetry (DSC) and adiabatic "
      + "calorimetry (ARC), through an approximation of the form below.  "
      + "On this page the MTT is the engine's: the bubble point of the "
      + "reactor contents at the failure instant, computed at the reactor's "
      + "pressure, 1.013 bar.  Beside it the page offers a cruder PROXY, the "
      + "lowest normal boiling point among the components: a number of the "
      + "right size, not the boiling point of the reaction mass.  T_D24 is "
      + "an ASSUMPTION you set (step 8 says why).",
    formula: String.raw`\mathrm{TMR}_\mathrm{ad} \approx \frac{c_p\, R\, T_0^2}{q_0\, E}`,
    where: [
      { sym: "\\mathrm{TMR}_\\mathrm{ad}", means: "the adiabatic time to "
        + "maximum rate of the secondary decomposition, started at T_0",
        unit: "s" },
      { sym: "R", means: "the gas constant", unit: "J/(mol K)" },
      { sym: "T_0", means: "the temperature the decomposition starts "
        + "from", unit: "K" },
      { sym: "q_0", means: "the decomposition's heat-release rate per kg "
        + "at T_0", unit: "W/kg" },
      { sym: "E", means: "its apparent activation energy", unit: "J/mol" },
    ],
    note: "T_D24 is the T_0 at which TMR_ad = 24 h.  The approximation is "
      + "the one Sheng et al. write in their section 3.3; what they then "
      + "read T_D24 from is the TMR_ad(T) curve their adiabatic calorimetry "
      + "gave.",
  },
  {
    n: 7,
    title: "The five criticality classes",
    body: "Stoessel orders the four temperatures -- T_p, the MTSR, the MTT "
      + "and T_D24 -- and reads off one of five classes.  The table below "
      + "is the one an open-access 2025 paper prints citing his book "
      + "(Molecules 30 (2025) 2939, Table 11); the book itself was not read "
      + "for this page.  The last column is our reading of what each "
      + "ordering implies, not a quotation, and not a verdict on any real "
      + "process.  The class is a statement about ORDER, which is why it is "
      + "useful early: you need four temperatures, not a full runaway "
      + "model.",
  },
  {
    n: 8,
    title: "Before the runs: what this reactor is, and what it leaves out",
    body: "Everything that follows runs on a reaction that does not exist.  "
      + "A + B -> P, in an inert solvent S, is FICTITIOUS: its four "
      + "substances are records written for this page, and every number in "
      + "them -- molar masses, vapour pressures, heat capacities, the heat "
      + "of reaction, the rate constants -- is an author-set teaching "
      + "assumption, chosen so the lesson can show what it has to show and "
      + "made COHERENT by construction: each boiling point and latent heat "
      + "follows from its own vapour-pressure equation, the heat of "
      + "reaction (-60 kJ per mol of B) follows from the records' own "
      + "formation data and does not change with temperature, and mass is "
      + "conserved.  (An earlier version ran a real esterification, one of "
      + "whose records priced the liquid on two different vapours and so "
      + "made the heat of reaction several times too large; a runaway "
      + "lesson must not run on a known inconsistency.)  Five things to "
      + "hold in mind while reading the runs.  The reactor has NO VAPOUR "
      + "PHASE: it is a closed liquid, so past the boiling point it goes on "
      + "heating where a real open vessel would boil and a closed one would "
      + "pressurise -- temperatures above the MTT are the hypothetical the "
      + "methodology defines the MTSR on, not a prediction of what a vessel "
      + "does.  T_D24 is ASSUMED: nothing here models a decomposition, so "
      + "its value is yours to set.  The liquid is declared IDEAL "
      + "(Raoult's law), so it has no azeotrope and its bubble point lies "
      + "between the boiling points of the substances in it.  Each "
      + "component's heat capacity is a CONSTANT, while the MIXTURE's "
      + "specific heat changes with composition: the reaction itself does "
      + "not change it here (the product's heat capacity was set to the sum "
      + "of the reactants'), but dosing does, because the semi-batch vessel "
      + "holds a different mixture at every instant.  And the bubble point "
      + "is computed at 1.013 bar, the reactor's pressure.",
  },
  {
    n: 9,
    title: "The batch: all of the reactant, from the start",
    body: "The batch witness charges the whole reaction -- 5 mol of A, 5 mol "
      + "of B and 15 mol of the solvent -- at T_p = 330 K and holds it "
      + "there.  The accumulation starts at 1: a cooling failure in the "
      + "first instant releases the whole adiabatic rise, so the batch's "
      + "MTSR is its T_cf at t = 0.  As the batch converts, X_ac falls, and "
      + "so does T_cf.  Move the failure time and the engine re-runs with "
      + "the jacket taken away at that instant.  Put the engine's T_cf "
      + "beside the estimate: the mass of a batch does not change, so the "
      + "estimate is T_p + X_ac ΔT_ad, and here the two agree to the "
      + "integration error -- because the reaction leaves the heat capacity "
      + "of the charge unchanged, which is exactly what the formula "
      + "assumes.  In a real reaction mass they part by the change in "
      + "specific heat; on this page that difference appears only in the "
      + "semi-batch.",
  },
  {
    n: 10,
    title: "Semi-batch: limit what is there by dosing it",
    body: "The semi-batch witness runs the same reaction with the same "
      + "totals at the same T_p, but only A and the solvent are charged.  "
      + "B is dosed in sixteen portions, one every 15 minutes.  At any "
      + "moment the reactor holds only what it has been given and has not "
      + "yet converted, so the accumulation stays small, T_cf stays low, "
      + "and the peak cooling duty the jacket must supply falls with it -- "
      + "the engine's utility ledger reports both peaks.  This is "
      + "intensification applied to time rather than to a vessel.  Two "
      + "things the curves show that the slogan does not.  The lever is "
      + "the dosing rate against the reaction rate: dose faster than the "
      + "reaction consumes and the vessel fills with unreacted reactant, "
      + "which is a batch again.  And early in the dosing the same "
      + "accumulation heats a smaller mass, which is what the factor "
      + "M_f/M(t) is for.  Leave it out and the estimate puts the worst "
      + "instant at the end of the dosing, where the accumulation is "
      + "largest; keep it and the worst instant -- the semi-batch's MTSR -- "
      + "moves to the early-middle of the dosing, where the accumulation is "
      + "already near its plateau and the mass still small.  The knob "
      + "starts there.  What is left of the gap between the estimate and "
      + "the engine is the mixture's specific heat, which the formula holds "
      + "fixed: early on the vessel holds mostly A and the solvent, whose "
      + "specific heat per kilogram differs a little from the final "
      + "mixture's.",
  },
  {
    n: 11,
    title: "Which instant, and which maximum",
    body: "The MTSR is a maximum over the instants at which the cooling "
      + "could fail, and with discrete doses those instants are not alike: "
      + "the accumulation JUMPS at each portion and decays between them, so "
      + "the worst instant is right AFTER a portion, and an instant just "
      + "before the next one is the least bad.  The bench lets you put the "
      + "failure just before or just after a portion and see the jump.  It "
      + "keeps three numbers apart.  (a) The scenario you chose: one "
      + "failure instant, one engine run, one T_cf.  (b) The largest value "
      + "of the estimate T_p + X_ac ΔT_ad M_f/M(t), evaluated on the "
      + "engine's normal-operation run at every row the run writes -- every "
      + "50 s, which includes each portion's own instant, because the row "
      + "there is written after the transfer.  (c) The largest T_cf the "
      + "ENGINE reached among the failure instants it was asked about: one "
      + "second after each of the sixteen portions, and one second before "
      + "each for contrast, one run each, when you ask for them.  Neither "
      + "(b) nor (c) is a maximum over every instant; both are maxima over a "
      + "stated sample, and the post-portion instants are the ones worth "
      + "sampling because between portions the accumulation only decays.  "
      + "For the batch the search is short: the accumulation falls from the "
      + "first instant, so the MTSR is the failure at t = 0, which the "
      + "engine runs.",
  },
  {
    n: 12,
    title: "The class of a scenario, the class of the process",
    body: "A class orders four temperatures, so it depends on which T_cf is "
      + "put in the MTSR slot.  The class shown beside the scenario you "
      + "chose answers what happens if the cooling fails THEN; it is not the "
      + "class of the process.  The class of the PROCESS takes the maximum "
      + "-- the engine-confirmed one where the search has been run, the "
      + "estimate's until then, and the page says which.  The MTT moves "
      + "too: here the bubble point of what the reactor holds rises as the "
      + "light reactants become the heavy product, so the margin that "
      + "matters is MTT(t) - T_cf(t) at each instant, and the table below "
      + "lists it at the instants searched.  Early in the batch the runaway "
      + "overshoots a low boiling point; later it stays under a higher one; "
      + "the classes along the run need not be the class of the maximum, "
      + "and with the default T_D24 several of them appear in one batch.",
  },
  {
    n: 13,
    title: "The interlock is a system too",
    body: "The MTSR scenario takes the accumulation at the failure instant "
      + "-- the reactant already fed and not yet converted -- which assumes "
      + "the dosing STOPS when the cooling does.  In a plant that is an "
      + "interlock: a temperature or a cooling-flow signal, a logic solver "
      + "and a valve on the feed.  Switch it off and run the failure again: "
      + "the pump goes on dosing into an adiabatic reactor, every portion "
      + "reacts as it arrives at a temperature where the reaction is fast, "
      + "and the temperature climbs toward the batch's -- the earlier the "
      + "failure, the closer, because more of the feed is still to come.  "
      + "That is no longer the textbook scenario but a COMPOUND one, a "
      + "cooling failure AND a feed-stop failure, and what the engine "
      + "reports for it is the maximum temperature after both: it extends "
      + "the MTSR scenario, it is not an MTSR.  Now take the worst feed "
      + "failure -- a valve left open, a pump run away -- and the WHOLE "
      + "dosing tank enters at once.  The engine ends where the pump left "
      + "running ends, only sooner: a pump that can deliver only so fast "
      + "limits the RATE at which the feed enters, not the TOTAL that can "
      + "enter, and with all of B waiting in the tank that total is the "
      + "batch's.  What makes safety no longer depend on the interlock is "
      + "to bound the TOTAL: a dosing vessel -- or a batch-wise charge -- "
      + "whose WHOLE content, added to what has already accumulated, keeps "
      + "T_cf below the limits.  The bench below runs both: the witness "
      + "whose tank holds all of B, and the same reactor with a day tank "
      + "that holds a quarter, refilled from storage only when it is empty.  "
      + "One thing is left, and it is said rather than hidden: the refill "
      + "is a discrete, deliberate act, taken when the day tank is empty "
      + "and the reactor's state is known -- a procedure, or an interlock of "
      + "its own.  Nor is the dosing interlock thrown away: measures are "
      + "ranked, inherent first, then passive engineered, then active "
      + "engineered, then procedural (the order Amyotte, Khan and Kletz "
      + "give, from most to least effective), and a good active layer stays "
      + "where it is.  Gall would recognise the choice: a protection that "
      + "has to act, or a hazard that is not there to act on.  For the "
      + "continuous reactor's half of this picture (heat generated against "
      + "heat removed, and why a cooled CSTR can have three steady states), "
      + "see the Van Heerden page.",
  },
  // ---- Lesson 2: inherent safety against economics -----------------------
  {
    n: 14,
    title: "Lesson 2: attenuate the ammonia loop",
    body: "The green-ammonia feasibility cases make the same ammonia from "
      + "the same feeds at a 150 bar loop and at a 50 bar loop -- the second "
      + "is the lower-pressure synthesis new catalysts are being tested for. "
      + " Lower pressure is ATTENUATION: the synthesis loop and its "
      + "high-pressure equipment -- converter, separator, recycle "
      + "compressor, the make-up compressor's discharge -- operate at "
      + "substantially lower pressure (the hydrogen and nitrogen arrive at "
      + "the same pressures in both).  The engine runs both loops on this "
      + "page.  Two things change between them, not one: the converter runs "
      + "at 150 bar and 733 K in one, at 50 bar and 673 K in the other, "
      + "each 5 K short of equilibrium.  The lower temperature favours "
      + "ammonia at equilibrium and the lower pressure works against it; "
      + "the per-pass conversion the engine reports is the net of both "
      + "through the cases' approach-to-equilibrium model, not the effect "
      + "of pressure alone.  It comes out lower at 50 bar, so to make the "
      + "same product the loop circulates more gas, and the economics pass "
      + "reports the gross margin after raw materials and utilities for "
      + "both.",
    formula: String.raw`X_\mathrm{H_2}^\mathrm{pass} = \frac{3}{2}\,\frac{F_\mathrm{NH_3}^\mathrm{out} - F_\mathrm{NH_3}^\mathrm{in}}{F_\mathrm{H_2}^\mathrm{in}}`,
    where: [
      { sym: "X_\\mathrm{H_2}^\\mathrm{pass}", means: "the fraction of "
        + "the hydrogen fed to the converter that is converted in one pass",
        unit: "–" },
      { sym: "F_\\mathrm{NH_3}^\\mathrm{out}", means: "the ammonia flow "
        + "leaving the converter", unit: "kmol/h" },
      { sym: "F_\\mathrm{NH_3}^\\mathrm{in}", means: "the ammonia flow "
        + "entering the converter (the recycle carries some)",
        unit: "kmol/h" },
      { sym: "F_\\mathrm{H_2}^\\mathrm{in}", means: "the hydrogen flow "
        + "entering the converter", unit: "kmol/h" },
    ],
    note: "N2 + 3 H2 -> 2 NH3: three moles of hydrogen for two of ammonia, "
      + "hence the 3/2.  Every flow is read from the converter's own feed "
      + "and effluent in the run, and the converter's pressure and "
      + "temperature from its own KPIs.",
  },
  {
    n: 15,
    title: "What the engine can say about the inventory, and what it cannot",
    body: "Whether the 50 bar loop is SAFER is a question about the "
      + "inventory -- how many moles of hydrogen and ammonia the loop holds, "
      + "and how much energy the compressed gas stores.  For a gas the "
      + "amount held in a volume V is n = PV/(ZRT): at a third of the "
      + "pressure the same volume holds about a third of the moles -- but "
      + "the lower-pressure loop needs more volume.  The engine gives one "
      + "concrete piece of that: the VOLUMETRIC flow of the converter "
      + "feed, Q = F Z R T / P, from each loop's molar flow, temperature "
      + "and pressure and the engine's own compressibility factor Z at "
      + "that state.  The ratio of the two is a product of four factors -- "
      + "more moles, a lower temperature, a third of the pressure, a Z "
      + "nearer 1 -- and the table below multiplies them out: the 50 bar "
      + "converter must pass about four times the volume of gas per hour.  "
      + "What that proves: equipment sized on the volumetric flow of that "
      + "gas -- the converter, its exchangers, the recycle compressor's "
      + "suction -- is larger at 50 bar.  What it does not prove: that the "
      + "loop HOLDS more.  That needs the volumes of the vessels and pipes "
      + "and the time the gas spends in them, which these duty-only studies "
      + "(stage 2 of a staged design, see Front-End Loading) do not size, "
      + "so no inventory is computed and this page invents none.  Nor is "
      + "the inventory the whole of the risk: the total risk also depends "
      + "on the release scenarios, on how often each one happens, on the "
      + "protections in place and on who is exposed, and for how long.  So "
      + "the engine cannot conclude that the lower-pressure design is safer "
      + "overall: it shows a real attenuation of the pressure, and beside "
      + "it larger circulating flows, a larger volume of gas to handle and "
      + "about four times as much ammonia in the recycle stream, because "
      + "the chiller condenses less of it at the lower pressure -- at a "
      + "lower gross margin.  Flixborough's 94 % unconverted cyclohexane "
      + "illustrates the same trade: a low conversion per pass is paid for "
      + "in material circulating.",
    formula: String.raw`Q = \frac{F\, Z\, R\, T}{P}, \qquad \frac{Q_{50}}{Q_{150}} = \frac{F_{50}}{F_{150}}\,\frac{Z_{50}}{Z_{150}}\,\frac{T_{50}}{T_{150}}\,\frac{P_{150}}{P_{50}}`,
    where: [
      { sym: "Q", means: "the volumetric flow of the converter feed at its "
        + "own temperature and pressure", unit: "m^3/h" },
      { sym: "F", means: "its molar flow", unit: "kmol/h" },
      { sym: "Z", means: "its compressibility factor at that state (the "
        + "engine's, on the loop gas's own equation of state)", unit: "–" },
      { sym: "T", means: "its temperature", unit: "K" },
      { sym: "P", means: "its pressure", unit: "Pa" },
      { sym: "Q_{50}", means: "Q of the 50 bar loop (subscripts 50 and "
        + "150 name the loop each quantity belongs to)", unit: "m^3/h" },
      { sym: "Q_{150}", means: "Q of the 150 bar loop", unit: "m^3/h" },
      { sym: "F_{50}", means: "F of the 50 bar loop", unit: "kmol/h" },
      { sym: "F_{150}", means: "F of the 150 bar loop", unit: "kmol/h" },
      { sym: "Z_{50}", means: "Z of the 50 bar loop's converter feed",
        unit: "–" },
      { sym: "Z_{150}", means: "Z of the 150 bar loop's converter feed",
        unit: "–" },
      { sym: "T_{50}", means: "T of the 50 bar loop's converter feed",
        unit: "K" },
      { sym: "T_{150}", means: "T of the 150 bar loop's converter feed",
        unit: "K" },
      { sym: "P_{150}", means: "P of the 150 bar loop's converter feed",
        unit: "Pa" },
      { sym: "P_{50}", means: "P of the 50 bar loop's converter feed",
        unit: "Pa" },
    ],
    note: "R is the gas constant (step 6).  The molar flows, temperatures "
      + "and pressures are the converter feeds of the two loop runs; Z is "
      + "from a property run at each feed's own state.  The ideal-gas "
      + "estimate (Z = 1) is shown beside it.",
  },
];

/** WHAT THE PAGE RUNS, for the reader who wants to reproduce it: the
 *  witnesses, the binaries, the recipe lines moved and the engine lines
 *  the scenario rests on, each read at the line given.  Drawn in a
 *  collapsed technical note, never in the lesson's prose (second review,
 *  point 7). */
export const SAFETY_TECH_NOTES: readonly LessonLimit[] = [
  { id: "batch-runs",
    title: "The cooling-failure runs",
    body: "tutorials/batch/reactor/batch26_cooling_failure (the batch) and "
      + "tutorials/batch/reactor/batch27_semibatch_dosing (the semi-batch), "
      + "run in your browser by choupoBatch (WASM).  The page moves only "
      + "their recipe lines: the failure time, `value 0|1` on the event "
      + "`setParameter reactor adiabatic`, and the feed event that follows "
      + "it (`to heldFeed; fraction 1;` the interlock holds the feed, "
      + "`fraction 0;` it fails, `to reactor; fraction 1;` the whole tank "
      + "enters).  The cooling failure is the batchReactor's own branch for "
      + "that key (src/unitOperations/batch/BatchReactor.cpp:611-677): from "
      + "the event the reactor is integrated by the same adiabatic energy "
      + "balance `mode adiabatic` uses, from the temperature it was held at.  "
      + "A dose charged into a hot reactor is mixed by enthalpy equality "
      + "(src/unitOperations/batch/BatchUnitOperation.cpp:236-274).  A "
      + "failure is placed one second after (or before) a portion, never "
      + "on it: two events at one instant would be ordered by the driver's "
      + "sort." },
  { id: "tank-runs",
    title: "The dosing-vessel runs",
    body: "tutorials/batch/reactor/batch28_dosing_vessel_limit is batch27 "
      + "with a day tank holding a quarter of B, refilled from storage at "
      + "3150, 6750 and 10350 s.  Its failure scenario is three events at "
      + "one instant: the cooling failure, the whole day tank into the "
      + "reactor, and what is left in storage set aside (no refill after a "
      + "failure).  The page runs it, and batch27 with its whole tank "
      + "entering, one second after the first portion and one second after "
      + "each refill -- the instants at which the vessel connected to the "
      + "reactor is fullest." },
  { id: "bubble-runs",
    title: "The bubble points",
    body: "tutorials/props/thermo/bubble01_reaction_mass_boiling_point, run "
      + "by choupoProps (WASM): one propertyPoint with `properties ( "
      + "T_bubble )` at 1.013 bar, on a copy of batch26's sealed constant/, "
      + "with its four composition lines rewritten to the reactor's mole "
      + "fractions at the instant in question, read from the engine's "
      + "normal-operation trajectory (just before a portion: the row at the "
      + "portion's instant minus what that transfer moved)." },
  { id: "loop-runs",
    title: "The ammonia loops",
    body: "tutorials/plant/greenAmmonia02_feasibility150bar and "
      + "greenAmmonia02_feasibility50bar, unchanged, run by choupoSolve (WASM).  "
      + "The flows are the converter feed (PreheatedFeed), its effluent "
      + "(HotEffluent), the Recycle and the ProductNH3 stream of each run; "
      + "the gross margin is the economics pass's grossMargin_RM_UT KPI.  "
      + "Z is from tutorials/props/safety/relief01_ammonia_loop_gas (the "
      + "overpressure page's witness, whose two operations carry each "
      + "loop's converter-feed composition), run by choupoProps with its "
      + "temperatures and pressures rewritten to each feed's own." },
];

export const SAFETY_LIMITS: readonly LessonLimit[] = [
  { id: "vapour",
    title: "No vapour phase in the batch reactor",
    body: "The batch reactor is a closed liquid.  Above the MTT a real open "
      + "vessel would boil (and cool itself if the vapour can leave), and a "
      + "closed one would pressurise.  The engine's temperature there is the "
      + "hypothetical the methodology defines the MTSR on, not a prediction "
      + "of what the vessel does.  Venting a runaway is the subject of the "
      + "overpressure page beside this one (Designing for overpressure, "
      + "Part 5)." },
  { id: "mtt",
    title: "The MTT is a bubble point at a sampled instant",
    body: "The bubble point is solved on the reactor case's declared "
      + "thermodynamics, an ideal liquid, at 1.013 bar.  It is taken at the "
      + "composition of a failure instant; as the runaway converts the mass "
      + "the composition, and so the boiling point, moves on.  It is one "
      + "technical limit; a real vessel may meet another first." },
  { id: "td24",
    title: "No decomposition data",
    body: "No record in Choupo carries decomposition kinetics, and nothing "
      + "here models a secondary reaction.  T_D24 is your assumption, and "
      + "its default is a round number for the exercise, not a property of "
      + "this mixture -- which does not exist." },
  { id: "search",
    title: "The maxima are over samples",
    body: "The estimate's maximum is over the rows the run writes (every "
      + "50 s); the engine's is over the instants it was asked about.  "
      + "Neither is a maximum over every instant.  The page names the "
      + "instants." },
  { id: "volume",
    title: "The dosed reactor does not grow",
    body: "A batchReactor holds its declared volume while a charge adds "
      + "liquid.  The rate here is first order in B and zero order in A, "
      + "so the extent rate k n_B does not depend on V and no number on "
      + "this page moves; a law with another concentration dependence "
      + "would be wrong in a dosed vessel.  The mass correction of the "
      + "estimate uses the MASS the vessel holds, which the engine does "
      + "carry." },
  { id: "loop-inventory",
    title: "No inventory for the ammonia loop",
    body: "The feasibility cases size no equipment, so the loop's hydrogen "
      + "and ammonia inventories and the energy stored in the compressed gas "
      + "are not computed.  The flows are, and so is the volumetric flow; "
      + "the inventory needs volumes, and the risk needs scenarios, "
      + "frequencies, protections and exposure." },
  { id: "classes",
    title: "The classes are a screen, not a design",
    body: "A criticality class says how the four temperatures are ordered.  "
      + "The measures each class calls for -- emergency cooling, quench, "
      + "relief sizing, process modification -- are the designer's, and need "
      + "the reaction's own calorimetry." },
];
