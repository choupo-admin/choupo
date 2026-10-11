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
  same day on a second opinion Vitor relayed (DEV.md 4c C60, REVIEW
  2026-10-11): twelve points, each re-checked against a source READ for it,
  and the ones that could not be checked say so on the page.

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

  NOT read, and the page says so where it leans on them: Stoessel's book
  itself; John Gall's Systemantics (his lines are PARAPHRASED -- the book
  could not be read and its wording circulates in several forms); Kletz &
  Amyotte's handbook (its five headings are named from the library record,
  the definitions are ours); Golikova et al., J. Therm. Anal. Calorim. 139
  (2020) 1301, the calorimetry of the liquid esterification the review
  pointed at (located, not readable from here -- so no measured value is
  quoted).  Kletz's "What you don't have, can't leak" is quoted as the
  TITLE of his 1978 paper, a bibliographic fact.

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
      + "switch.  Removing a hazard removes the need to rely on a layer; "
      + "adding a layer adds a system.  That is why the order in which a "
      + "designer asks the questions matters: first whether the hazard can "
      + "be removed or made smaller, and only then how to protect against "
      + "what remains.  This is not an argument against protection layers.  "
      + "Once the hazard has been made as small as the process allows, "
      + "independent protection layers are still needed for the hazard that "
      + "remains; in the words of Amyotte, Khan and Kletz (2009), \"the "
      + "hierarchy of controls does not invalidate the usefulness of "
      + "engineered and procedural safety measures\".  What the order "
      + "changes is how much rests on them.",
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
      + "uses (Gygax; Stoessel, Thermal Safety of Chemical Processes, 2008) "
      + "asks one question first: what if, at time t, the cooling fails?  "
      + "From then on the vessel is adiabatic, and whatever reactant is in "
      + "it and has not yet reacted -- the ACCUMULATION -- reacts and heats "
      + "the mass, to a temperature T_cf.  The largest T_cf over every "
      + "instant at which the failure could happen is the maximum "
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
        + "the whole batch receives", unit: "mol" },
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
      + "reaction comes from the species' formation data (printed in the run "
      + "log as [reaction heat]) and the heat capacities from each "
      + "component record's own molar Cp, so it does NOT hold c_p constant. "
      + " The estimate's masses are the run's own amounts times the "
      + "records' molar masses.  Nothing in the formula above is typed into "
      + "the page.",
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
      + "cannot.  T_D24 is not a decomposition onset, and not the onset a "
      + "DSC trace shows: it is the temperature at which the adiabatic time "
      + "to maximum rate, TMR_ad, of the SECONDARY decomposition is 24 hours "
      + "(Sheng et al., Molecules 30 (2025) 2939, section 3.3, citing "
      + "Stoessel).  Started there with no cooling, the decomposition would "
      + "take a day to run away; started hotter, less.  It is derived from "
      + "the decomposition's kinetics -- the heat it releases and how fast "
      + "that rate grows with temperature -- usually measured by "
      + "differential scanning calorimetry (DSC) and adiabatic calorimetry "
      + "(ARC), through an approximation of the form below.  No record in "
      + "Choupo carries decomposition kinetics, so on this page T_D24 is an "
      + "ASSUMPTION you set, labelled as one.  The MTT is the engine's: the "
      + "bubble point of the reactor contents at the failure instant, from a "
      + "choupoProps run of the bubble01 witness on the reactor case's own "
      + "thermodynamics -- an ideal liquid, so a real mixture that forms "
      + "azeotropes would boil lower.  Beside it the page shows the cruder "
      + "PROXY it once used, the lowest normal boiling point among the "
      + "components: a number of the right size, not the boiling point of "
      + "the reaction mass.",
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
    body: "Stoessel orders the four temperatures and reads off one of five "
      + "classes.  The table below is the one an open-access 2025 paper "
      + "prints citing his book (Molecules 30 (2025) 2939, Table 11); the "
      + "book itself was not read for this page.  The last column is our "
      + "reading of what each ordering implies, not a quotation, and not a "
      + "verdict on any real process.  The class is a statement about ORDER, "
      + "which is why it is useful early: you need four temperatures, not a "
      + "full runaway model.",
    formula: String.raw`T_\mathrm{p} \le \mathrm{MTSR} < \mathrm{MTT} < T_\mathrm{D24} \;\Rightarrow\; \text{class 1}`,
    where: [
      { sym: "\\mathrm{MTT}", means: "the maximum temperature for "
        + "technical reasons; here, the boiling point of the reaction mass",
        unit: "K" },
      { sym: "T_\\mathrm{D24}", means: "the temperature at which the "
        + "adiabatic time to maximum rate of the secondary decomposition is "
        + "24 h", unit: "K" },
    ],
  },
  {
    n: 8,
    title: "The batch: all of the reactant, from the start",
    body: "The batch witness charges the whole reaction -- equimolar acetic "
      + "acid and ethanol, the esterification of the batch02 tutorial -- "
      + "at T_p = 330 K and holds it there.  The accumulation starts at 1: "
      + "a cooling failure in the first minute releases the whole adiabatic "
      + "rise, so the batch's MTSR is its T_cf at t = 0.  As the batch "
      + "converts, X_ac falls, and so does T_cf.  "
      + "Move the failure time and the engine re-runs: the recipe line "
      + "`setParameter reactor adiabatic 1` takes the jacket away at that "
      + "instant (src/unitOperations/batch/BatchReactor.cpp:585-651) and "
      + "the reactor integrates its temperature from there.  Put the "
      + "engine's T_cf beside the estimate: the mass of a batch does not "
      + "change, so the estimate is T_p + X_ac ΔT_ad, and the two differ by "
      + "a fraction of a kelvin, because the specific heat of the mass "
      + "changes as reactants become products and the formula holds it "
      + "fixed.",
  },
  {
    n: 9,
    title: "Semi-batch: limit what is there by dosing it",
    body: "The semi-batch witness runs the same reaction with the same "
      + "totals at the same T_p, but only the acid is charged.  The ethanol "
      + "is dosed in sixteen portions, one every 15 minutes.  At any moment "
      + "the reactor holds only what it has been given and has not yet "
      + "converted, so the accumulation stays small, T_cf stays low, "
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
      + "largest, and falls several kelvin short of the engine; keep it and "
      + "the estimate follows the engine to about a kelvin, and the worst "
      + "instant -- the semi-batch's MTSR -- moves to the early-middle of the "
      + "dosing, where the accumulation is already large and the mass still "
      + "small.  The knob starts there.  What is left of the gap is the "
      + "specific heat: early on the vessel holds mostly acetic acid, whose "
      + "specific heat is lower than the final mixture's.",
  },
  {
    n: 10,
    title: "The interlock is a system too",
    body: "The MTSR scenario takes the accumulation at the failure instant "
      + "-- the reactant already fed and not yet converted -- which assumes "
      + "the dosing STOPS when the cooling does.  In a plant that is an "
      + "interlock: a temperature or a cooling-flow signal, a logic solver "
      + "and a valve on the feed.  In the witness it is one recipe line, "
      + "written as what it achieves -- what is left in the dosing tank is "
      + "moved to a vessel nothing is ever dosed from.  Switch it off and "
      + "run the failure again: the pump goes on dosing into an adiabatic "
      + "reactor, every portion reacts as it arrives at a temperature where "
      + "the reaction is fast, and the temperature climbs toward the "
      + "batch's -- the earlier the failure, the closer, because more of the "
      + "feed is still to come.  That is no longer the textbook scenario "
      + "but a COMPOUND one, a cooling failure AND a feed-stop failure, and "
      + "what the engine reports for it is the maximum temperature after "
      + "both: it extends the MTSR scenario, it is not an MTSR.  The "
      + "inherently safer version of the same idea limits the dose "
      + "PHYSICALLY -- a dosing vessel that holds no more than the reactor "
      + "can safely accumulate, a pump that cannot deliver faster -- so "
      + "that safety no longer depends on the interlock.  The interlock is "
      + "not thrown away: measures are ranked, inherent first, then passive "
      + "engineered, then active engineered, then procedural (the order "
      + "Amyotte, Khan and Kletz give, from most to least effective), and a "
      + "good active layer stays where it is.  Gall would recognise the "
      + "choice: a protection that has to act, or a hazard that is not "
      + "there to act on.  For the continuous reactor's half of this picture "
      + "(heat generated against heat removed, and why a cooled CSTR can "
      + "have three steady states), see the Van Heerden page.",
  },
  // ---- Lesson 2: inherent safety against economics -----------------------
  {
    n: 11,
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
      + "four times as much ammonia in the recycle stream, because the "
      + "chiller condenses less of it at the lower pressure.  Equipment is "
      + "sized on those flows.  So the engine cannot conclude that the "
      + "lower-pressure design is safer overall: it shows a real "
      + "attenuation of the pressure hazard, and beside it larger "
      + "circulating flows and a larger ammonia recycle -- at a lower gross "
      + "margin.  The inventory, and with it the total risk, needs the "
      + "equipment sizing of both designs, which is the next stage's work.  "
      + "Flixborough's 94 % unconverted cyclohexane illustrates the same "
      + "trade: a low conversion per pass is paid for in material "
      + "circulating.",
  },
];

export const SAFETY_LIMITS: readonly LessonLimit[] = [
  { id: "witness",
    title: "The esterification is a teaching witness, not data",
    body: "The reaction is a pedagogical thermal-safety witness: neither its "
      + "kinetics nor its thermal excursion are data for real acetic acid / "
      + "ethanol esterification.  The Arrhenius constants are a test "
      + "reaction (the witnesses' constant/reactions says so), so the times "
      + "on this page are not those of any real esterification; the liquid "
      + "heat capacities are constant; and the heat of reaction is too "
      + "large, for the reason the next note gives." },
  { id: "reaction-heat",
    title: "Why the heat of reaction is too large: one record, two vapours",
    body: "The run log prints the liquid heat of reaction as -25.95 kJ per "
      + "mol of ethanol at 330 K ([reaction heat]).  The engine prices a "
      + "liquid from its ideal-gas formation datum minus a heat of "
      + "vaporisation scaled from the normal boiling point by Watson's rule "
      + "(src/thermo/Component.cpp:1134, through Hvap_latent at :1294).  "
      + "For acetic acid those two numbers describe two different vapours. "
      + " The record's formation datum, dHf_298 = -432.25 kJ/mol, is the "
      + "MONOMER ideal gas; its HvapTb = 24.39 kJ/mol is the vaporisation to "
      + "the real vapour, which is largely DIMERISED -- far below ethanol's "
      + "38.56 kJ/mol for a liquid boiling 40 K higher "
      + "(tutorials/batch/reactor/batch26_cooling_failure/constant/"
      + "components/aceticAcid.dat:25 and :31).  The tree's own record of "
      + "the vapour dimerisation (data/standards/chemistry/"
      + "aceticAcid-dissolution.dat, Chao & Zwolinski 1978, K and dH read "
      + "from the primary) says the saturated vapour at 25 °C holds about "
      + "four-fifths of its acid as dimers, and taking them apart costs "
      + "about 26 kJ per mole of acid: the engine's liquid acetic acid sits "
      + "that much too high in enthalpy.  Put it back and the same records "
      + "give a liquid heat of reaction near zero -- of the order of a "
      + "kilojoule per mole on this back-of-envelope estimate, which is not "
      + "a measurement.  The liquid "
      + "reaction has been measured calorimetrically (Golikova et al., J. "
      + "Therm. Anal. Calorim. 139 (2020) 1301, at 313.15 K); that paper "
      + "could not be read for this page, so no measured value is quoted.  "
      + "So the temperature rises on this page are several times what "
      + "these same records would give with the dimer priced -- which keeps "
      + "the witness a vivid teaching runaway and makes it no model of a "
      + "real one.  The record is not changed here: "
      + "which vapour it speaks for, and whether the dimer is priced, is a "
      + "curation decision that moves every liquid-phase use of acetic acid "
      + "in the corpus." },
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
    title: "The MTT is an ideal bubble point at the failure instant",
    body: "The bubble point is solved on the reactor case's declared "
      + "thermodynamics, an ideal liquid: ethyl acetate, ethanol and water "
      + "form azeotropes that boil lower, which an ideal model cannot show. "
      + " And it is taken at the composition of the failure instant; as the "
      + "runaway converts the mass, the composition, and so the boiling "
      + "point, moves." },
  { id: "td24",
    title: "No decomposition data",
    body: "No record in Choupo carries decomposition kinetics, and nothing "
      + "here models a secondary reaction.  T_D24 is your assumption, and "
      + "its default is a round number for the exercise, not a property of "
      + "this mixture." },
  { id: "volume",
    title: "The dosed reactor does not grow",
    body: "A batchReactor holds its declared volume while a charge adds "
      + "liquid.  The rate here is first order in ethanol and zero order in "
      + "the acid, so the extent rate k n_EtOH does not depend on V and no "
      + "number on this page moves; a law with another concentration "
      + "dependence would be wrong in a dosed vessel.  The mass correction "
      + "of the estimate uses the MASS the vessel holds, which the engine "
      + "does carry." },
  { id: "loop-inventory",
    title: "No inventory for the ammonia loop",
    body: "The feasibility cases size no equipment, so the loop's hydrogen "
      + "and ammonia inventories and the energy stored in the compressed gas "
      + "are not computed.  The flows are; the inventory needs volumes." },
  { id: "classes",
    title: "The classes are a screen, not a design",
    body: "A criticality class says how the four temperatures are ordered.  "
      + "The measures each class calls for -- emergency cooling, quench, "
      + "relief sizing, process modification -- are the designer's, and need "
      + "the reaction's own calorimetry." },
];
