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
  gmpLayoutLesson -- the text of "The GMP interior of a tablet plant: rooms,
  air and the ways through them" (DEV.md 4c C101).

  THE OUTLINE IS VITOR'S, approved 2026-10-19 ("Avanca como achares melhor
  e eu depois dou feedback no final") and recorded in DEV.md 4c C101: eight
  parts -- the cleanliness grades, the pressure cascade, the airlocks,
  gowning, containment, the unidirectional flows, solvents and ATEX, escape
  -- in that order, and a closing part on what the model does not do.

  EVERY ENGINE CLAIM CARRIES THE LINE IT WAS READ AT, and
  tests/gmpLayoutLesson.test.ts holds each citation to the source text it
  names.  The engine half is src/postProcessing/layout/BuildingLayout.cpp
  (the reader and every rule) and src/core/AdvisorySummary.H (the caveat
  block's heading).

  NO NUMBER HERE IS A STANDARD'S, with one exception that is named: the
  10 Pa guidance value of EU GMP Annex 1 para 4.14, which the teaching
  building declares as its step with that source.  Every other pressure,
  grade, distance and room is an AUTHOR-SET ASSUMPTION of the teaching
  building, labelled so.  What was READ, and how: EU GMP Annex 1 (the
  Commission's PDF of 22 August 2022, C(2022) 5938 final: section 1, paras
  4.4 and 4.12 to 4.14, and the glossary entry for an airlock), reused under
  the Commission's document-reuse policy (Decision 2011/833/EU) with the
  source acknowledged; and Directive 1999/92/EC, Annex I (EUR-Lex), for the
  zone definitions.  Both are PARAPHRASED.  EudraLex Part I Chapters 3 and 5
  (the non-sterile basis, added on the C150 review), the ISPE Baseline Guides and the
  WHO HVAC guideline are named by title only and marked NOT READ.  Nothing
  is quoted: the test refuses a quotation mark in the steps.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** Every source the page names, with what was taken from it and how it was
 *  reached.  Drawn at the foot of the page. */
export interface GmpSource { id: string; cite: string; used: string }

export const GMP_SOURCES: readonly GmpSource[] = [
  { id: "annex1",
    cite: "European Commission, EudraLex Volume 4, EU Guidelines for Good "
      + "Manufacturing Practice, Annex 1: Manufacture of Sterile Medicinal "
      + "Products, C(2022) 5938 final, 22 August 2022",
    used: "read: section 1 (scope), paras 4.4 (the four grades), 4.12 "
      + "(airlocks, personnel and material, changing in stages), 4.13 (doors "
      + "not opened together), 4.14 (the 10 Pa guidance value and the "
      + "positively or negatively pressurised airlocks of containment) and "
      + "the glossary entry for an airlock; paraphrased in steps 1 to 5.  "
      + "Reused under the Commission's document-reuse policy (Commission "
      + "Decision 2011/833/EU), the source acknowledged here." },
  { id: "atex-1999-92",
    cite: "Directive 1999/92/EC of the European Parliament and of the Council "
      + "of 16 December 1999 on minimum requirements for improving the safety "
      + "and health protection of workers potentially at risk from explosive "
      + "atmospheres, Annex I (EUR-Lex, CELEX 31999L0092)",
    used: "read: the definitions of the gas zones 0, 1 and 2 and the dust "
      + "zones 20, 21 and 22 by how often and how long an explosive "
      + "atmosphere is present, and its note that a layer of dust counts as "
      + "a source; paraphrased in step 11." },
  { id: "eudralex-ch3-ch5",
    cite: "European Commission, EudraLex Volume 4, EU Guidelines for Good "
      + "Manufacturing Practice, Part I, Chapter 3 (Premises and Equipment) "
      + "and Chapter 5 (Production)",
    used: "named as the GMP basis of a NON-sterile plant: premises, and the "
      + "prevention of cross-contamination by a risk assessment of product "
      + "and containment (step 1).  NOT READ for this page; no rule or "
      + "number on it comes from them." },
  { id: "ispe-osd",
    cite: "ISPE Baseline Guide, Volume 2: Oral Solid Dosage Forms",
    used: "named as the industry's design guide for a tablet plant.  NOT "
      + "READ; no number or rule on this page comes from it, and its tables "
      + "grant no redistribution." },
  { id: "ispe-risk",
    cite: "ISPE Baseline Guide, Volume 7: Risk-Based Manufacture of "
      + "Pharmaceutical Products",
    used: "named as the guide to containment by exposure band.  NOT READ." },
  { id: "who-hvac",
    cite: "World Health Organization, Good manufacturing practices: "
      + "guidelines on heating, ventilation and air-conditioning systems for "
      + "non-sterile pharmaceutical products",
    used: "named as the guide to the air systems behind the grades of a "
      + "non-sterile plant.  NOT READ." },
  { id: "record",
    cite: "Choupo design record, A GMP interior is declared and checked "
      + "(docs/design/a-gmp-interior-is-declared-and-checked.md)",
    used: "read in full: the grammar of the building block, the decisions "
      + "taken on stated defaults, what is refused and what is announced, "
      + "and what is not checked." },
];

export const GMP_LAYOUT_STEPS: readonly LessonStep[] = [
  // ---- Part 1: cleanliness grades --------------------------------------------
  {
    n: 1,
    title: "A tablet plant is laid out inside a building",
    body: "A chemical plant is laid out on a plot; a pharmaceutical plant is "
      + "laid out inside a building, and the questions change.  Where an item "
      + "stands matters less than which ROOM it stands in, how clean that room "
      + "is kept, which way the air moves through its doors, and who and what "
      + "walks through it.  The cleanliness of a room is its GRADE.  The "
      + "European GMP guideline for sterile products, Annex 1, names four: "
      + "grade A, the critical zone where the product is open to the air during "
      + "the riskiest operations; grade B, the room around a grade A zone; and "
      + "grades C and D, cleanrooms for the less critical stages.  A tablet is "
      + "not a sterile product, and Annex 1 is written for sterile products -- "
      + "but its own scope says that some of its principles, among them the "
      + "design of premises, the classification of cleanrooms and gowning, may "
      + "be used for products that are not sterile.  So an oral-solid-dose "
      + "plant may borrow the vocabulary by DECLARATION.  In this example the "
      + "rooms where the product is open are declared grade D by analogy, and "
      + "the rest controlled, not classified (CNC), the industry's word for a "
      + "room with no grade -- the example's choice, justified in its case, "
      + "not a requirement for every oral-solid-dose plant.  For a product "
      + "that is not sterile the GMP basis is the general guide itself -- its "
      + "chapters on premises (3) and production (5), with the prevention of "
      + "cross-contamination and a quality risk assessment of the product and "
      + "its containment -- and which grade, if any, a room gets is that "
      + "assessment's answer, not a value looked up.",
    formula: String.raw`r(\text{A}) = 4,\; r(\text{B}) = 3,\; r(\text{C}) = 2,\; r(\text{D}) = 1,\; r(\text{CNC}) = 0,\; r(\text{outside}) = -1`,
    where: [
      { sym: "r", means: "the cleanliness rank the engine gives a grade: the "
        + "higher, the cleaner" },
    ],
    note: "The grades are paraphrased from Annex 1 para 4.4 and its scope from "
      + "section 1.  The ranks: src/postProcessing/layout/BuildingLayout.cpp:"
      + "120-127.  A room's grade is one of the five words, read at "
      + "BuildingLayout.cpp:440; any other word is refused.",
  },
  {
    n: 2,
    title: "What Choupo reads: rooms, openings and flows, all declared",
    body: "A case declares its building in system/layoutDict as a building "
      + "block: the floors, each room as a box on a floor with its grade and "
      + "its pressure, every opening between two spaces (a door on one floor, "
      + "a stair or a lift between two), and the three flows -- personnel, "
      + "material, waste -- as the list of rooms each passes through.  An "
      + "airlock is not a kind of door: it is a ROOM with a role (personnel "
      + "airlock, material airlock, or gowning room) and a regime, because it "
      + "has a floor, a grade and a pressure of its own.  The engine then does "
      + "two different things, and the difference is the first lesson of the "
      + "page.  A building that CANNOT EXIST -- two rooms sharing a volume, a "
      + "door between rooms with no common wall, a door between two floors -- "
      + "is REFUSED: the run stops and names the defect.  A building that "
      + "exists but BREAKS A RULE is ANNOUNCED: the run finishes, and the "
      + "finding is printed on the error stream, again in the caveat block at "
      + "the end under PLANT LAYOUT, and in the result the page draws.  The "
      + "teaching building below, seventeen rooms on two floors, raises no "
      + "finding as designed; every exercise changes one declaration and shows "
      + "what the engine says.  Try the first: raise the compression room to "
      + "grade C, and see what one cleaner room asks of its neighbours.",
    note: "An airlock's role and regime: BuildingLayout.cpp:436-438 and "
      + "BuildingLayout.cpp:441-442.  Two rooms sharing a volume refused: "
      + "BuildingLayout.cpp:538-542.  Every announcement goes to the error "
      + "stream and the advisory log in one call, BuildingLayout.cpp:80-83; "
      + "the caveat block's heading for that log is "
      + "src/core/AdvisorySummary.H:117.",
  },

  // ---- Part 2: the pressure cascade ------------------------------------------
  {
    n: 3,
    title: "The pressure cascade: air flows from clean to less clean",
    body: "A door is never perfectly tight and is opened many times a shift, "
      + "so the design aims for the air through it to move the RIGHT way: out "
      + "of the cleaner room, into the less clean one.  That is done by "
      + "holding the cleaner room at a higher pressure, which sets the "
      + "direction of the leakage through a CLOSED door.  It does not "
      + "guarantee that nothing crosses: an open door, the wake of a person "
      + "or a trolley, turbulence and a failed extract fan carry air and "
      + "particles both ways, which is why doors are interlocked, flows "
      + "are monitored and alarmed, and a static pressure difference is "
      + "one control among several.  Annex 1 gives a guidance value of "
      + "at least 10 Pa between adjacent rooms of different grades; the "
      + "teaching building declares that value as its step, with that source "
      + "(a choice of the example, for its grade D rooms), "
      + "and the engine checks every pressure against the step the case "
      + "declared -- a case that declares none is refused, because no step is "
      + "shipped.  Pressures are declared as a commissioning sheet writes "
      + "them, each room against another room or against outside, and the "
      + "engine adds them up along that chain to one pressure per room.  Then, "
      + "for every door between two rooms of different grade, the cleaner one "
      + "must be higher by the step.  A door between a CNC room and outside is "
      + "not asked: nothing graded is at stake.",
    formula: String.raw`p_i = p_{\mathrm{ref}(i)} + \Delta p_i, \qquad p_\mathrm{clean} - p_\mathrm{less} \ge \Delta p_\mathrm{min}`,
    where: [
      { sym: "p_i", means: "room i's pressure above outside, as the engine "
        + "resolves it", unit: "Pa" },
      { sym: "p_{\\mathrm{ref}(i)}", means: "the pressure of the room room i is "
        + "declared against (relativeTo); zero for outside", unit: "Pa" },
      { sym: "\\Delta p_i", means: "the difference room i declares against it "
        + "(pressure)", unit: "Pa" },
      { sym: "p_\\mathrm{clean}", means: "the pressure of the cleaner of two "
        + "connected rooms", unit: "Pa" },
      { sym: "p_\\mathrm{less}", means: "the pressure of the less clean one",
        unit: "Pa" },
      { sym: "\\Delta p_\\mathrm{min}", means: "the step the case declares "
        + "(cascade minimumStep)", unit: "Pa" },
    ],
    note: "The 10 Pa guidance value is Annex 1 para 4.14.  An undeclared step "
      + "refused: BuildingLayout.cpp:375-378; the chain added up: "
      + "BuildingLayout.cpp:518; a CNC room against outside not asked: "
      + "BuildingLayout.cpp:820; the comparison and the finding: "
      + "BuildingLayout.cpp:822-823.",
  },
  {
    n: 4,
    title: "Turn the coating room's pressure down and watch two rules part",
    body: "In the teaching building the coating room (grade D, 25 Pa) opens "
      + "onto packaging (CNC, 5 Pa) through a cascade airlock at 15 Pa.  Lower "
      + "the coating room's pressure in the exercise below.  At 16 Pa nothing "
      + "is said: the room is still 11 Pa above packaging, and the airlock "
      + "still lies between its neighbours.  At 15 Pa the cascade itself holds "
      + "-- exactly 10 Pa -- but the AIRLOCK rule fires: an airlock at the same "
      + "pressure as the room it should step down from is no step.  At 12 Pa "
      + "both fire.  Two rules, one number: the cascade asks how much higher "
      + "the cleaner room is, the airlock rule asks whether the airlock is "
      + "really between its two sides.  Type any value and read which one "
      + "the engine names.",
  },

  // ---- Part 3: airlocks ----------------------------------------------------------
  {
    n: 5,
    title: "Three airlocks: a step, a bubble and a sink",
    body: "Annex 1 asks for an airlock wherever people or material move "
      + "between grades, separate ones for personnel and material where "
      + "possible, with doors that are not opened together; its glossary calls "
      + "an airlock an enclosed space with interlocked doors that keeps the "
      + "pressure difference between its neighbours.  What an airlock DOES is "
      + "set by its pressure, and the case declares which of three it is.  A "
      + "CASCADE airlock lies between its two sides, one more step down the "
      + "cascade.  A BUBBLE airlock is higher than both sides by the step, so "
      + "air leaves it through both doors and air from either side is pushed "
      + "back.  A SINK airlock is lower than both by the step, so air enters "
      + "it through both doors and is exhausted, and what is in the air on "
      + "one side is drawn away from the other.  Both REDUCE what crosses "
      + "with the doors closed; neither proves that nothing does (step 3).  "
      + "The engine does not take "
      + "the word on trust: it checks the declared regime against the "
      + "declared pressures.  Try it below -- declare the sink airlock into "
      + "the spray-drying suite a bubble, without changing its pressure, and "
      + "then a cascade.",
    formula: String.raw`\text{bubble: } p_\mathrm{AL} - \max_j p_j \ge \Delta p_\mathrm{min}, \qquad \text{sink: } \min_j p_j - p_\mathrm{AL} \ge \Delta p_\mathrm{min}, \qquad \text{cascade: } \min_j p_j < p_\mathrm{AL} < \max_j p_j`,
    where: [
      { sym: "p_\\mathrm{AL}", means: "the airlock's pressure above outside",
        unit: "Pa" },
      { sym: "j", means: "one of the spaces the room or airlock opens on, "
        + "through a door, a stair or a lift" },
      { sym: "p_j", means: "the pressure of space j above outside (outside "
        + "itself counts as zero)", unit: "Pa" },
    ],
    note: "Paraphrased from Annex 1 paras 4.12 and 4.13 and the glossary.  The "
      + "bubble: BuildingLayout.cpp:860; the sink: BuildingLayout.cpp:865; the "
      + "cascade airlock strictly between: BuildingLayout.cpp:872-873; and "
      + "the cascade asked of its two sides across it: "
      + "BuildingLayout.cpp:878-881.  A door to an airlock is left out of the "
      + "direct cascade check, BuildingLayout.cpp:834, because the airlock "
      + "rule speaks for it.",
  },
  {
    n: 6,
    title: "Why the airlock of a contained room is a sink",
    body: "The spray-drying suite of the teaching building is CONTAINED (part "
      + "5): its powder must stay in.  Its airlocks are sinks, at 5 Pa, and the "
      + "suite itself is at 15 Pa -- ABOVE its airlocks.  That is not a "
      + "mistake, and the engine does not announce it: air leaves the suite "
      + "into each sink and is exhausted there, while air from the dispensary "
      + "(or, on the far side, the blending room) enters the same sink from "
      + "its other door, so the design intent is that the suite's air does "
      + "not reach the dispensary -- an intent the pressures support with "
      + "the doors closed, not a demonstration.  A sink is lower than the contained room by design, "
      + "and the engine exempts a sink from the rule that a contained room must "
      + "be negative to its neighbours.  Declare the same airlock a bubble and "
      + "the exemption goes with the word: the suite must now be below it by "
      + "the step, and it is above it.  Declare it a cascade and the engine "
      + "says more: a cascade passes the room's air on to the next room, which "
      + "is exactly what a contained room must not do.",
    note: "The sink's exemption: BuildingLayout.cpp:916; the cascade airlock "
      + "on a contained room announced: BuildingLayout.cpp:911-912.",
  },

  // ---- Part 4: gowning ------------------------------------------------------------
  {
    n: 7,
    title: "Gowning: people change for the grade they enter",
    body: "People are the largest source of particles in a clean room, so "
      + "they change their clothes on the way in -- in a gowning room, which "
      + "is a personnel airlock where garments change.  Annex 1 describes "
      + "personnel airlocks as stages of increasing cleanliness, and asks that "
      + "the last stage be, at rest, of the grade of the room it leads to.  "
      + "The engine walks every personnel flow room by room and keeps one "
      + "number: the grade the person is gowned for, which is the grade of the "
      + "last gowning room passed.  Stepping outside, or into a CNC room, "
      + "un-gowns.  Entering a graded room cleaner than the gown is announced.  "
      + "Two exercises: declare the gowning room CNC (the garments are now "
      + "for CNC), or send the operators round it.",
    formula: String.raw`r_\mathrm{room} \le g`,
    where: [
      { sym: "r_\\mathrm{room}", means: "the rank of a graded room the person "
        + "enters (step 1's r)" },
      { sym: "g", means: "the rank of the last gowning room passed since the "
        + "flow last left outside or a CNC room; minus one when none" },
    ],
    note: "Paraphrased from Annex 1 para 4.12 and its item (i).  Outside "
      + "un-gowns at BuildingLayout.cpp:981, a gowning room sets the gown at "
      + "BuildingLayout.cpp:983, a CNC room un-gowns at BuildingLayout.cpp:986, "
      + "and the entry is announced at BuildingLayout.cpp:987-988.",
  },

  // ---- Part 5: containment ----------------------------------------------------------
  {
    n: 8,
    title: "Containment of a potent ingredient: the cascade turned round",
    body: "Some active ingredients are potent enough that the dust of a few "
      + "milligrams is a hazard to the people who breathe it.  How potent a "
      + "substance is, for this purpose, is a band set from its toxicology -- "
      + "the occupational exposure band -- which the supplier's safety data "
      + "sheet and the company's industrial hygienists provide.  Choupo does "
      + "not know it.  The case says a room is CONTAINED, with its reason, and "
      + "the engine then asks two things of that room.  It is NEGATIVE to its "
      + "neighbours by the step, so the air moves in and the dust stays in -- "
      + "the cascade turned round, which is why Annex 1 para 4.14 allows the "
      + "pressures to be modified for hazardous materials.  And it opens only "
      + "on another contained room or through a bubble or sink airlock, never "
      + "directly onto a corridor.  Here the cascade and the containment pull "
      + "in opposite directions: the corridor wants to be clean and higher, "
      + "the suite wants to be lower; the airlock is how a design reconciles "
      + "them.  Try declaring the dispensary contained, or opening a door "
      + "from the spray-drying suite onto the corridor.",
    formula: String.raw`p_j - p_\mathrm{c} \ge \Delta p_\mathrm{min} \quad \text{for every neighbour } j \text{ that is not a sink airlock}`,
    where: [
      { sym: "p_\\mathrm{c}", means: "the contained room's pressure above "
        + "outside", unit: "Pa" },
    ],
    note: "The containment word: BuildingLayout.cpp:454-455.  A contained "
      + "room opening directly on a space that is neither contained nor an "
      + "airlock: BuildingLayout.cpp:906-907; the pressure rule: "
      + "BuildingLayout.cpp:918-919.  The cascade is not asked between a "
      + "contained room and a room that is not, BuildingLayout.cpp:816, "
      + "because the two rules would contradict each other there.",
  },

  // ---- Part 6: unidirectional flows ------------------------------------------------------
  {
    n: 9,
    title: "Three flows, one way each, kept apart",
    body: "Three things move through a tablet plant.  PEOPLE come in from the "
      + "street, gown and go to work.  MATERIAL comes in raw and leaves "
      + "packed, one way, never back through a room it has left -- a room it "
      + "returned to would hold clean and less clean product together.  WASTE "
      + "leaves by its own route.  The engine reads each flow as the list of "
      + "spaces it passes through and checks it against the rules this "
      + "example's building declares -- the one-way material rule is a way "
      + "of organising THIS plant, not a GMP requirement for every one: "
      + "campaigns, closed systems and separation in time can justify "
      + "another arrangement, and each needs its own analysis.  Every step must cross a "
      + "declared door, stair or lift; people must use personnel airlocks and "
      + "material and waste material airlocks; a material flow must never "
      + "enter a room twice; and a room that a personnel flow and the material "
      + "flow both pass THROUGH is a crossing, as is a room the waste and the "
      + "material both pass through.  The first and last rooms of a flow are "
      + "where it starts and ends -- the room an operator works in -- so "
      + "meeting there is the work, not a crossing.  Where two flows must "
      + "share a room (one corridor in a small plant), the case declares the "
      + "room shared and says why (closed containers, separation in time by "
      + "procedure); the engine requires the reason.  Try sending the rejects "
      + "out through the product train, or the operators through the blending "
      + "room.",
    note: "A step through a wall: BuildingLayout.cpp:938-941; the wrong "
      + "airlock: BuildingLayout.cpp:952-956; a material flow entering a room "
      + "twice: BuildingLayout.cpp:968-969; the rooms a flow passes THROUGH: "
      + "BuildingLayout.cpp:1002-1007; the crossing: BuildingLayout.cpp:1019-1020; "
      + "waste meeting material: BuildingLayout.cpp:1026; a shared room needs "
      + "its reason: BuildingLayout.cpp:779.",
  },
  {
    n: 10,
    title: "A legal route is not a good one",
    body: "The third flow exercise sends the product from the dispensary "
      + "down the corridor to blending, skipping the spray-drying suite.  "
      + "Every door it uses exists, so there is no flow through a wall; but "
      + "the corridor is the operators' way to the presses and the rejects' "
      + "way out, and the engine now finds both flows meeting the product "
      + "there.  A single central corridor that carries everything is the "
      + "textbook objection to a small plant's layout, and the answer is a "
      + "separate material route -- or, where the plant is too small for one, "
      + "a shared declaration with a reason someone will have to defend.",
  },

  // ---- Part 7: solvents and ATEX ----------------------------------------------------------
  {
    n: 11,
    title: "Solvents and ATEX: why the spray-drying suite is a room of its own",
    body: "An amorphous solid dispersion -- the drug dissolved in a polymer so "
      + "that it stays amorphous and dissolves well -- is often made by spray "
      + "drying a solution in an organic solvent.  The suite where the solvent "
      + "evaporates is then a HAZARDOUS AREA.  The European workplace directive "
      + "on explosive atmospheres classifies a place by how often and how "
      + "long an explosive atmosphere is present: for a gas or vapour, zone 0 "
      + "where it is present continuously, for long periods or frequently; "
      + "zone 1 where it is likely occasionally in normal operation; zone 2 "
      + "where it is not likely in normal operation and short-lived if it "
      + "occurs; and zones 20, 21 and 22 the same for a cloud of combustible "
      + "dust -- which a dryer's powder can be, and the directive counts a "
      + "layer of dust as a source too.  So the suite is its own room, "
      + "zoned, and kept away from IGNITION SOURCES such as switchgear and "
      + "motors that are not rated for the zone.  A room is not a zone because "
      + "a solvent is in it: a classification starts from each source of "
      + "release, its grade (how often and how long it releases), the "
      + "ventilation and its availability, and from those sets the zone and "
      + "its extent -- a study this page does not do, so the zone of each "
      + "room is an INPUT the case declares.  The case declares the zone "
      + "of each room with its source, which rooms are ignition sources with "
      + "the reason, and the separation between them; the engine announces "
      + "an ATEX room that IS an ignition room, opens on one through a door, "
      + "or stands closer to one than the separation, measured as the clear "
      + "distance between the two room volumes -- a geometric check of the "
      + "declaration, which does not show that an ignition source is "
      + "protected against.  It also announces a "
      + "building that has both and declares no separation at all, rather "
      + "than pass it.  In the teaching building the electrical room above "
      + "the lobby is about 7.3 m from the suite; raise the separation past "
      + "that, or remove it.",
    formula: String.raw`s = \sqrt{g_x^2 + g_y^2 + g_z^2} \ge s_\mathrm{ATEX}`,
    where: [
      { sym: "s", means: "the clear distance between the two room volumes "
        + "(zero when they touch)", unit: "m" },
      { sym: "g_x", means: "the gap between the two rooms along x (zero if "
        + "their x ranges overlap)", unit: "m" },
      { sym: "g_y", means: "the same along y", unit: "m" },
      { sym: "g_z", means: "the same in height", unit: "m" },
      { sym: "s_\\mathrm{ATEX}", means: "the separation the case declares "
        + "(atexSeparation distance)", unit: "m" },
    ],
    note: "The zone definitions are paraphrased from Directive 1999/92/EC, "
      + "Annex I.  A zone is one of the six numbers, BuildingLayout.cpp:456-466; "
      + "an ignition room declares its reason, BuildingLayout.cpp:471.  The "
      + "clear distance: BuildingLayout.cpp:197-204.  No separation declared: "
      + "BuildingLayout.cpp:1043-1044; one room both: BuildingLayout.cpp:1055-1056; "
      + "a door between them: BuildingLayout.cpp:1060-1061; too close: "
      + "BuildingLayout.cpp:1068-1070.",
  },
  {
    n: 12,
    title: "What the zone does not tell the engine",
    body: "A real solvent suite is also built to survive what it is zoned "
      + "against: the dryer and its ducts carry explosion venting or "
      + "suppression, a room that vents does so to an OUTSIDE wall, the "
      + "electrical equipment inside is certified for the zone, and the "
      + "extent of each zone comes from a classification study of every "
      + "release.  Choupo checks none of that.  It checks only the rooms "
      + "the case declared as hazardous against the rooms the case declared "
      + "as ignition sources, at the distance the case declared.  Whether "
      + "the suite has an exterior wall to vent through, or whether the "
      + "zone is right, is the student's to show.",
  },

  // ---- Part 8: escape --------------------------------------------------------------------
  {
    n: 13,
    title: "Escape: a lift is not an exit",
    body: "Every room must have a way out to the open air through doors and "
      + "stairs.  A lift is not one: in a fire it is the one way down nobody "
      + "may use.  The engine walks the openings from outside inwards, "
      + "leaving lifts out, and announces every room it cannot reach -- a "
      + "geometric check that a way out exists, not a certification of "
      + "evacuation (no travel distance, exit width or exit count).  In "
      + "the teaching building the electrical room upstairs is reached by a "
      + "stair; turn it into a lift and the room has no escape.  Then turn it "
      + "into a door instead, and see the other half of step 2: a door "
      + "between two floors is not a building at all, and the engine refuses "
      + "it outright.",
    note: "Lifts left out of the walk: BuildingLayout.cpp:1090; the room with "
      + "no way out announced: BuildingLayout.cpp:1098.  A door between two "
      + "floors refused: BuildingLayout.cpp:616-619.  Travel distance to an "
      + "exit, door widths and the number of exits are not checked.",
  },

  // ---- The real witness -------------------------------------------------------------------
  {
    n: 14,
    title: "Now read a real one",
    body: "The teaching building is small on purpose: every rule holds, and "
      + "each exercise breaks one.  The corpus carries a whole oral-solid-dose "
      + "plant with its building declared, the apalutamide tablet case written "
      + "for a student project group: dozens of rooms on two floors, "
      + "contained suites, flows of all three kinds, a shared room with its "
      + "reason.  Open it, read its building block from top to bottom, and "
      + "for each room ask the questions of this page: what grade, against "
      + "what pressure, through which airlock, who walks through it, and "
      + "where its air goes.  Then read the findings the engine raises on it "
      + "-- and every value the case says is an author-set assumption for "
      + "the group to replace.",
  },
];

/** What this page, and the engine under it, does not do. */
export const GMP_LAYOUT_LIMITS: readonly LessonLimit[] = [
  { id: "hvac", title: "No air: no air changes, no HVAC, no filters",
    body: "A grade is a word the case declares; nothing computes the air "
      + "changes, the supply and extract flows that hold each pressure, the "
      + "filter classes, or the air-handling units behind them, and nothing "
      + "checks the particle or microbial limits of a grade." },
  { id: "doors", title: "No door positions or widths",
    body: "A door is an opening between two rooms that share a wall; where on "
      + "the wall it is, how wide it is, which way it swings and whether it "
      + "is interlocked are not in the grammar.  Corridor widths are not "
      + "checked either." },
  { id: "travel", title: "No travel distances",
    body: "Escape is reachability through doors and stairs: the length of "
      + "the route to an exit, and the number of exits a room needs, are not "
      + "checked." },
  { id: "recovery", title: "No room recovery times or pressure dynamics",
    body: "Every pressure is a declared steady value.  What happens while a "
      + "door is open, how fast a room recovers its grade after a "
      + "disturbance, and the alarms on a pressure difference are not "
      + "modelled." },
  { id: "penetrations", title: "No pipes or ducts through walls",
    body: "A pipe or a duct crossing a room's wall, and how it is sealed, is "
      + "not checked." },
  { id: "judgement", title: "Nothing judges whether a declaration is right",
    body: "The engine checks the building against the grades, pressures, "
      + "zones and distances the case declared.  It does not say whether a "
      + "room should be grade D, whether 10 Pa is enough, whether a powder "
      + "needs containment, or whether a zone is the right one: those are "
      + "the project's risk assessment, defended with a source.  A building "
      + "that raises no finding obeys the rules of this example; it is not "
      + "shown to be GMP-compliant, contained, or safe from ignition." },
];
