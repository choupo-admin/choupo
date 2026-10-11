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
  "Então acho que podes por isso num edutool de segurança".

  WHAT IS QUOTED AND WHAT IS NOT.  A quotation on this page is verbatim
  from a source that was READ for it, and is held to that source's wording
  by tests/processSafety.test.ts (the SOURCES list below carries the exact
  strings).  Three sources were read in full or in the passage quoted:

    * The Flixborough Disaster: Report of the Court of Inquiry (Department
      of Employment, HMSO, London 1975), the copy IChemE hosts; paragraphs
      1, 6, 29, 40, 62, 203 and 209 are quoted.
    * IChemE Lessons Learned Database, "Methyl Isocyanate Storage Tank
      Runaway Reaction" (Bhopal, 3 December 1984), incident summary Rev. 2.
    * E. Broughton, "The Bhopal disaster and its aftermath: a review",
      Environmental Health 4:6 (2005), open access (CC BY).

  John Gall's lines are PARAPHRASED and the page says so: the book
  (Systemantics, 1975; the 1977 Quadrangle edition is the one libraries
  hold) could not be read for this page, and its wording circulates in
  several forms.  Kletz's "What you don't have, can't leak" is quoted as the
  TITLE of his 1978 paper (Chemistry and Industry, 6 May 1978), which is a
  bibliographic fact; his argument about Bhopal is paraphrased.  Kletz's
  inherently-safer principles are named as the chapter headings of Kletz &
  Amyotte, Process Plants: A Handbook for Inherently Safer Design (2nd ed.,
  CRC Press 2010), from the library record; their definitions are ours.
  Stoessel's criticality classes are taken from the table a 2025 open-access
  paper prints citing his book (Molecules 30 (2025) 2939, Table 11); the
  book itself was not read, and the page says that too.

  ENGINE CLAIMS carry the file and line they were read at.
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
  { id: "kletz-1978",
    cite: "T. Kletz, Chemistry and Industry, 6 May 1978 (the paper's title)",
    text: "What you don't have, can't leak" },
];

export const SAFETY_STEPS: readonly LessonStep[] = [
  // ---- Part 0: the thesis -------------------------------------------------
  {
    n: 1,
    title: "Two engineers who said the same thing",
    body: "John Gall was a paediatrician who wrote, in Systemantics (1975), "
      + "a short book of laws about how systems behave.  In paraphrase -- "
      + "the book could not be checked for this page, and its lines "
      + "circulate in several wordings -- three of them: a system built to "
      + "fail safely, when it fails, tends to fail by not failing safely; a "
      + "complex system can fail in more ways than anyone can list; and a "
      + "system pushes back against whoever tries to change it.  A fourth, "
      + "usually called Gall's law: a complex system that works is found to "
      + "have grown out of a simple system that worked.  Trevor Kletz was an "
      + "ICI chemist who turned to plant safety; his autobiography is titled "
      + "By Accident ... a Life Preventing Them in Industry (2000).  His 1978 "
      + "paper is titled \"What you don't have, can't leak\".  The two say "
      + "one thing from two sides.  Every protective layer -- an alarm, an "
      + "interlock, a scrubber, a relief valve -- is itself a system, with "
      + "its own ways of failing, its own maintenance, its own bypass "
      + "switch.  Removing a hazard removes the need for the layer; adding "
      + "a layer adds a system.  That is why the order in which a designer "
      + "asks the questions matters: first whether the hazard can be "
      + "removed or made smaller, and only then how to protect against "
      + "what remains.",
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
      + "the workshop floor\" (para. 62).  Its first lesson: \"The disaster "
      + "was caused by the introduction into a well designed and "
      + "constructed plant of a modification which destroyed its "
      + "integrity.\" (para. 209).  Two more things in the same report "
      + "belong to this page.  The fluid leaving the reactors was about 94 % "
      + "cyclohexane (para. 29): a few per cent converted per pass, so a "
      + "large hot inventory under pressure was circulating to make a small "
      + "product flow -- lesson 2 meets the same arithmetic.  And the Court "
      + "itself weighed protection against prevention: of devices that "
      + "would cut off or dump an escaping inventory, \"in others the added "
      + "complexity might induce more dangers than it eliminated\", and "
      + "\"there might be a better return (with regard to safety) from "
      + "expenditure on making the original plant safer than by providing "
      + "elaborate safety systems to deal with potential inadequacies\" "
      + "(para. 203).  That is Kletz's thesis, in a court's words, in 1975.  "
      + "The same report notes that the automatic nitrogen purge guarding "
      + "the oxidation could be defeated from behind the control panel: "
      + "\"This automatic safety device could, however, be simply and "
      + "effectively over-ridden\" (para. 40).",
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
      + "alarm had been disconnected with the refrigeration, and the water "
      + "spray was ineffective.  Every one of those layers "
      + "existed, and none of them worked that night -- the first of Gall's "
      + "lines above, at the scale of a city.  The same summary names the other route: "
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
      + "route to the same insecticide that makes no MIC.  ATTENUATION: use the hazard in "
      + "a milder form -- lower pressure, lower temperature, diluted, "
      + "refrigerated.  LIMITATION OF EFFECTS: design so that a failure does "
      + "less -- smaller pipes, slower additions, a layout that keeps people "
      + "away.  SIMPLIFICATION: fewer things to go wrong, and those that do "
      + "go wrong visibly.  None of these is a layer that can be switched "
      + "off.  The rest of this page applies two of them with the engine "
      + "running: limiting what a batch reactor holds by dosing it "
      + "(lesson 1), and attenuating an ammonia loop by lowering its "
      + "pressure (lesson 2) -- where the principles turn out to pull in "
      + "different directions.",
  },
  // ---- Lesson 1: the cooling-failure scenario ----------------------------
  {
    n: 5,
    title: "Lesson 1: what if the cooling fails?",
    body: "An exothermic reaction runs at a process temperature T_p, held "
      + "there by a jacket that removes the heat as fast as the reaction "
      + "makes it.  The thermal-safety methodology the chemical industry "
      + "uses (Stoessel, Thermal Safety of Chemical Processes, 2008) asks one "
      + "question first: at the worst moment, the cooling fails.  From then "
      + "on the vessel is adiabatic, and whatever reactant has not yet "
      + "reacted -- the ACCUMULATION -- reacts and heats the mass.  The "
      + "temperature it reaches is the maximum temperature of the synthesis "
      + "reaction, MTSR.  If the whole charge reacted adiabatically from "
      + "T_p, the mass would rise by the adiabatic temperature rise; a "
      + "fraction X_ac of the charge left unreacted gives that fraction of "
      + "the rise.",
    formula: String.raw`\Delta T_\mathrm{ad} = \frac{(-\Delta H_\mathrm{r})\, n_\mathrm{A,0}}{\sum_i n_i\, c_{p,i}}, \qquad \mathrm{MTSR} = T_\mathrm{p} + X_\mathrm{ac}\, \Delta T_\mathrm{ad}`,
    where: [
      { sym: "\\Delta T_\\mathrm{ad}", means: "the adiabatic temperature "
        + "rise of the whole charge reacting from T_p", unit: "K" },
      { sym: "\\Delta H_\\mathrm{r}", means: "the heat of reaction per "
        + "mole of the limiting reactant (negative: exothermic)",
        unit: "J/mol" },
      { sym: "n_\\mathrm{A,0}", means: "the moles of the limiting "
        + "reactant in the whole batch", unit: "mol" },
      { sym: "n_i", means: "the moles of species i in the reaction mass",
        unit: "mol" },
      { sym: "c_{p,i}", means: "the molar heat capacity of species i in the "
        + "liquid", unit: "J/(mol K)" },
      { sym: "\\mathrm{MTSR}", means: "the maximum temperature of the "
        + "synthesis reaction, reached if the cooling fails", unit: "K" },
      { sym: "T_\\mathrm{p}", means: "the process temperature, where "
        + "the jacket holds the reactor", unit: "K" },
      { sym: "X_\\mathrm{ac}", means: "the accumulation: the fraction "
        + "of the batch's limiting reactant present and unreacted at the "
        + "moment of failure", unit: "–" },
    ],
    note: "On this page the engine computes the adiabatic rise itself, by "
      + "running the batch witness with the failure at t = 0: its heat of "
      + "reaction comes from the species' formation data (printed in the run "
      + "log as [reaction heat]) and its heat capacities from the component "
      + "records.  Nothing in the formula above is typed into the page.",
  },
  {
    n: 6,
    title: "Two limits: the boiling point and the decomposition",
    body: "The MTSR means nothing alone; it is compared with two other "
      + "temperatures.  MTT, the maximum temperature for technical reasons, "
      + "is usually the boiling point of the reaction mass in an open "
      + "vessel (or the temperature at which a closed one reaches its relief "
      + "pressure): if the runaway reaches it, the mass boils, which removes "
      + "heat if the vapour can get away and raises the pressure if it "
      + "cannot.  T_D24 is the temperature at which a SECONDARY "
      + "decomposition, starting adiabatically, would take 24 hours to reach "
      + "its maximum rate: below it there is time to act, above it there is "
      + "less.  It is measured, by adiabatic calorimetry or by a "
      + "differential scanning calorimeter with a kinetic model; it is not "
      + "something a simulator derives.  On this page the MTT defaults to "
      + "the lowest normal boiling point among the witness's own component "
      + "records -- a declared choice, not a bubble point the engine solved "
      + "-- and T_D24 is an ASSUMPTION you set, because no record here "
      + "carries one.",
  },
  {
    n: 7,
    title: "The five criticality classes",
    body: "Stoessel orders the four temperatures and reads off one of five "
      + "classes.  The table below is the one an open-access 2025 paper "
      + "prints citing his book (Molecules 30 (2025) 2939, Table 11); the "
      + "book itself was not read for this page.  The last column is our "
      + "reading of what each ordering implies, not a quotation.  The class "
      + "is a statement about ORDER, which is why it is useful early: you "
      + "need four temperatures, not a full runaway model.",
    formula: String.raw`T_\mathrm{p} \le \mathrm{MTSR} < \mathrm{MTT} < T_\mathrm{D24} \;\Rightarrow\; \text{class 1}`,
    where: [
      { sym: "\\mathrm{MTT}", means: "the maximum temperature for "
        + "technical reasons; here, a boiling point", unit: "K" },
      { sym: "T_\\mathrm{D24}", means: "the temperature at which an "
        + "adiabatic decomposition takes 24 h to reach its maximum rate",
        unit: "K" },
    ],
  },
  {
    n: 8,
    title: "The batch: all of the reactant, from the start",
    body: "The batch witness charges the whole reaction -- equimolar acetic "
      + "acid and ethanol, the esterification of the batch02 tutorial -- "
      + "at T_p = 330 K and holds it there.  The accumulation starts at 1: "
      + "a cooling failure in the first minute releases the whole adiabatic "
      + "rise.  As the batch converts, X_ac falls, and so does the MTSR.  "
      + "Move the failure time and the engine re-runs: the recipe line "
      + "`setParameter reactor adiabatic 1` takes the jacket away at that "
      + "instant (src/unitOperations/batch/BatchReactor.cpp:585-651) and "
      + "the reactor integrates its temperature from there.  Put the "
      + "engine's MTSR beside the estimate T_p + X_ac dT_ad: they differ by "
      + "a fraction of a kelvin, because the heat capacity of the mass "
      + "changes as reactants become products and the hand formula holds it "
      + "fixed.",
  },
  {
    n: 9,
    title: "Semi-batch: limit what is there by dosing it",
    body: "The semi-batch witness runs the same reaction with the same "
      + "totals at the same T_p, but only the acid is charged.  The ethanol "
      + "is dosed in sixteen portions, one every 15 minutes.  At any moment "
      + "the reactor holds only what it has been given and has not yet "
      + "converted, so the accumulation stays small, the MTSR stays low, "
      + "and the peak cooling duty the jacket must supply falls with it -- "
      + "the engine's utility ledger reports both peaks.  This is "
      + "intensification applied to time rather than to a vessel.  Two "
      + "things the curves show that the slogan does not.  The lever is "
      + "the dosing rate against the reaction rate: dose faster than the "
      + "reaction consumes and the vessel fills with unreacted reactant, "
      + "which is a batch again.  And early in the dosing the same "
      + "accumulation heats a smaller mass, so the engine's MTSR there sits "
      + "above the estimate built on the full batch's dT_ad -- an estimate "
      + "made on the final mass must allow for that, and the run shows why.",
  },
  {
    n: 10,
    title: "The interlock is a system too",
    body: "The semi-batch estimate assumes the dosing STOPS when the cooling "
      + "does.  In a plant that is an interlock: a temperature or a "
      + "cooling-flow signal, a logic solver and a valve on the feed.  In "
      + "the witness it is one recipe line, written as what it achieves -- "
      + "what is left in the dosing tank is moved to a vessel nothing is "
      + "ever dosed from.  Switch it off and run the failure again: the "
      + "pump goes on dosing into an adiabatic reactor, every portion "
      + "reacts as it arrives at a temperature where the reaction is fast, "
      + "and the MTSR climbs toward the batch's -- the earlier the failure, "
      + "the closer, because more of the feed is still to come.  The "
      + "inherently safer version of the same idea limits the dose "
      + "PHYSICALLY -- a dosing vessel that holds no more than the reactor "
      + "can safely accumulate, a pump that cannot deliver faster -- so "
      + "that there is nothing to interlock.  Gall would recognise the "
      + "choice: a protection that has to act, or a hazard that is not "
      + "there.  For the continuous reactor's half of this picture (heat "
      + "generated against heat removed, and why a cooled CSTR can have "
      + "three steady states), see the Van Heerden page.",
  },
  // ---- Lesson 2: inherent safety against economics -----------------------
  {
    n: 11,
    title: "Lesson 2: attenuate the ammonia loop",
    body: "The green-ammonia feasibility cases make the same ammonia at "
      + "150 bar and at 50 bar -- the second is the lower-pressure "
      + "synthesis new catalysts are being tested for.  Lower pressure is "
      + "ATTENUATION: every flange, every vessel and every compressor stage "
      + "holds the gas at a third of the pressure.  The engine runs both "
      + "loops on this page.  Equilibrium is less favourable at 50 bar, so "
      + "less hydrogen is converted per pass; to make the same product the "
      + "loop circulates more gas, and the economics pass reports the gross "
      + "margin after raw materials and utilities for both.",
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
      + "and effluent in the run.",
  },
  {
    n: 12,
    title: "What the engine can say about the inventory, and what it cannot",
    body: "Whether the 50 bar loop is SAFER is a question about the "
      + "inventory -- how much hydrogen and ammonia the loop holds, and how "
      + "much energy the compressed gas stores -- and an inventory is a "
      + "flow times a residence time, or a pressure times a volume.  The "
      + "feasibility cases size no vessel: they are duty-only studies "
      + "(stage 2 of a staged design, see Front-End Loading), so no volume "
      + "exists to multiply, and this page invents none.  What the engine "
      + "does say is what the loop CIRCULATES: at 50 bar it moves more gas "
      + "through the converter, more hydrogen round the recycle, and about "
      + "four times as much ammonia back to the converter, because the "
      + "chiller condenses less of it at the lower pressure.  Equipment is "
      + "sized on those flows.  So attenuation here did not shrink the "
      + "hazard; it changed its shape -- lower pressure, more material "
      + "moving -- and it cost gross margin as well.  Whether the inventory "
      + "rises or falls needs the equipment volumes of both designs, which "
      + "is the next stage's work.  Flixborough's 94 % unconverted cyclohexane "
      + "was the same trade seen from the other side: a low conversion per "
      + "pass is paid for in material circulating.",
  },
];

export const SAFETY_LIMITS: readonly LessonLimit[] = [
  { id: "kinetics",
    title: "The kinetics are illustrative",
    body: "The esterification's Arrhenius constants are a pedagogical test "
      + "reaction (the witnesses' constant/reactions says so), so the times "
      + "on this page are not those of any real esterification.  The heat of "
      + "reaction is the engine's, from formation data; the liquid heat "
      + "capacities are constant." },
  { id: "vapour",
    title: "No vapour phase in the batch reactor",
    body: "The batch reactor is a closed liquid.  Above the MTT a real open "
      + "vessel would boil (and cool itself if the vapour can leave), and a "
      + "closed one would pressurise.  The engine's temperature there is the "
      + "hypothetical the methodology defines the MTSR on, not a prediction "
      + "of what the vessel does.  Venting a runaway is the subject of the "
      + "overpressure page planned beside this one." },
  { id: "td24",
    title: "No decomposition data",
    body: "No record in Choupo carries a decomposition onset, and nothing "
      + "here models a secondary reaction.  T_D24 is your assumption." },
  { id: "volume",
    title: "The dosed reactor does not grow",
    body: "A batchReactor holds its declared volume while a charge adds "
      + "liquid.  The rate here is first order in ethanol and zero order in "
      + "the acid, so the extent rate k n_EtOH does not depend on V and no "
      + "number on this page moves; a law with another concentration "
      + "dependence would be wrong in a dosed vessel." },
  { id: "loop-inventory",
    title: "No inventory for the ammonia loop",
    body: "The feasibility cases size no equipment, so the loop's hydrogen "
      + "and ammonia inventories and the energy stored in the compressed gas "
      + "are not computed.  The flows are; the inventory needs volumes." },
  { id: "classes",
    title: "The classes are a screen, not a design",
    body: "A criticality class says how the four temperatures are ordered.  "
      + "The measures each class calls for -- emergency cooling, quench, "
      + "relief sizing, redesign -- are the designer's, and need the "
      + "reaction's own calorimetry." },
];
