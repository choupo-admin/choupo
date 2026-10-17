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
  plantLayoutLesson -- the text of "Plant layout: where each item stands, and
  why" (DEV.md 4c C75, slice 2).

  THE OUTLINE IS VITOR'S, approved 2026-10-17 ("Aprovo, acrescenta o vento
  dominante e as zonas ATEX") and recorded verbatim in DEV.md 4c C75: (1) why
  layout matters; (2) separation distances, and why Choupo ships no table;
  (3) a guided exercise from the draft; (4) the trade-offs; (5) what the
  model does not do; plus the prevailing wind and the hazardous-area zones.
  The parts below follow it in that order, with wind and zones as their own
  part between the exercise and the trade-offs, because the exercise's last
  moves are about them.

  EVERY ENGINE CLAIM CARRIES THE LINE IT WAS READ AT, and
  tests/plantLayoutLesson.test.ts holds each citation to the source text it
  names.  The engine half is src/postProcessing/layout/PlantLayout.cpp (the
  check and the draft) and src/core/AdvisorySummary.H (the caveat block's
  heading).

  NO NUMBER HERE IS A STANDARD'S.  Every distance, zone extent and angle on
  this page is either the ENGINE'S (a size its sizer published, a distance it
  measured) or an AUTHOR-SET ASSUMPTION of the witness case, labelled so.  The
  published spacing and area-classification documents were NOT read and are
  named bibliographically only (LAYOUT_SOURCES says so per source); the
  zone DEFINITIONS are paraphrased from Directive 1999/92/EC, Annex I, which
  was read (EU law, freely available).  Nothing is quoted: the test refuses a
  quotation mark in the steps.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** Every source the page names, with what was taken from it and how it was
 *  reached.  Drawn at the foot of the page. */
export interface LayoutSource { id: string; cite: string; used: string }

export const LAYOUT_SOURCES: readonly LayoutSource[] = [
  { id: "ccps",
    cite: "Center for Chemical Process Safety (CCPS), Guidelines for Facility "
      + "Siting and Layout (AIChE, 2003)",
    used: "named as one of the published sources of spacing tables.  NOT "
      + "READ; no number on this page comes from it." },
  { id: "gap",
    cite: "Global Asset Protection Services, GAP.2.5.2, Oil and Chemical "
      + "Plant Layout and Spacing (an insurer's guideline)",
    used: "named as one of the published sources of spacing tables.  NOT "
      + "READ; no number on this page comes from it." },
  { id: "mecklenburgh",
    cite: "J. C. Mecklenburgh (ed.), Process Plant Layout (George Godwin for "
      + "the Institution of Chemical Engineers, 1985)",
    used: "named as the classic textbook on the subject.  NOT READ; no number "
      + "on this page comes from it." },
  { id: "iec-60079-10-1",
    cite: "IEC 60079-10-1, Explosive atmospheres -- Part 10-1: Classification "
      + "of areas -- Explosive gas atmospheres",
    used: "named as the international standard that sizes a zone from a "
      + "release.  NOT READ; its extent method and figures are not on this "
      + "page." },
  { id: "ei-15",
    cite: "Energy Institute, Model Code of Safe Practice Part 15: Area "
      + "classification for installations handling flammable fluids (EI 15)",
    used: "named as the code most UK and many European sites classify by.  "
      + "NOT READ." },
  { id: "api-rp-505",
    cite: "API RP 505, Recommended Practice for Classification of Locations "
      + "for Electrical Installations at Petroleum Facilities Classified as "
      + "Class I, Zone 0, Zone 1, and Zone 2",
    used: "named as the American practice that uses the same zone vocabulary.  "
      + "NOT READ." },
  { id: "atex-1999-92",
    cite: "Directive 1999/92/EC of the European Parliament and of the Council "
      + "of 16 December 1999 on minimum requirements for improving the safety "
      + "and health protection of workers potentially at risk from explosive "
      + "atmospheres, Annex I (EUR-Lex, CELEX 31999L0092)",
    used: "read: the definitions of zones 0, 1 and 2 by how often and how long "
      + "an explosive gas atmosphere is present, paraphrased in step 10." },
  { id: "record",
    cite: "Choupo design record, A plant layout is declared, checked and "
      + "drafted (docs/design/a-plant-layout-is-declared-and-checked.md)",
    used: "read in full: the grammar of system/layoutDict, the footprint rule, "
      + "what is refused and what is announced, and the draft tool." },
];

export const PLANT_LAYOUT_STEPS: readonly LessonStep[] = [
  // ---- Part 1: why layout matters -------------------------------------------
  {
    n: 1,
    title: "A plot plan is a set of decisions about distance",
    body: "Once every item of a flowsheet has a size, it still has to stand "
      + "somewhere, and where it stands decides three things the flowsheet "
      + "cannot see.  SAFETY: a fire or an explosion at one item heats, "
      + "overpressures or throws fragments at its neighbours, and a neighbour "
      + "that fails in turn releases more -- the domino effect.  Distance is "
      + "the protection that needs no instrument and no operator.  COST: "
      + "every metre between two connected items is a metre of pipe, with its "
      + "supports, its insulation and its pressure drop, so a spread-out plant "
      + "is a more expensive one to build and to pump through.  OPERATION AND "
      + "MAINTENANCE: an operator must reach every valve and instrument, a "
      + "crane must reach every heavy item, and a removable tube bundle must "
      + "be pulled out of its shell along its own axis, which needs a clear "
      + "space at least as long as the bundle in front of the channel head.  "
      + "These three pull in different directions, and a layout is the "
      + "compromise between them, made explicit.",
  },
  {
    n: 2,
    title: "What Choupo knows about an item: its own size, or one you declare",
    body: "A layout in Choupo places the SIZED items of a run -- the items of "
      + "the design sheets the sizing pass writes -- on a plot plan declared "
      + "in system/layoutDict.  The size of each item is never typed twice: "
      + "where its sizer published a diameter and a length (a vessel's D and "
      + "H, a designed shell-and-tube's shell diameter and tube length, a "
      + "spray dryer's chamber) the item is a CYLINDER of that size, standing "
      + "or lying along the axis you declare.  Where the sizer published no "
      + "such pair -- a compressor publishes a power, a rated exchanger an "
      + "area -- no size is invented: you declare a box, footprint { length; "
      + "width; height; }, and the engine refuses a box declared on an item "
      + "that already has its own size, because one item has one size.  A "
      + "tray stack, a catalyst charge and a relief valve live inside or on "
      + "another item and are never placed on their own.",
    formula: String.raw`d_x = d_y = D, \qquad d_z = H`,
    where: [
      { sym: "d_x", means: "the item's extent along the plan's x axis "
        + "(east)", unit: "m" },
      { sym: "d_y", means: "its extent along the plan's y axis (the plan's "
        + "north)", unit: "m" },
      { sym: "d_z", means: "its height above its base", unit: "m" },
      { sym: "D", means: "the diameter its sizer published", unit: "m" },
      { sym: "H", means: "the length its sizer published (the height of a "
        + "standing vessel)", unit: "m" },
    ],
    note: "The extents of a standing cylinder, as the engine sets them: "
      + "src/postProcessing/layout/PlantLayout.cpp:381.  The pairs it reads a "
      + "size from are listed at PlantLayout.cpp:198-201, keyed on the KEYS a "
      + "sizer published, never on its kind word; the items never placed on "
      + "their own at PlantLayout.cpp:209; the box declared on an item with "
      + "its own size refused at PlantLayout.cpp:1165; and an item with no size "
      + "and no declared box refused, with no size invented, at "
      + "PlantLayout.cpp:1177.",
  },

  // ---- Part 2: separation distances ---------------------------------------
  {
    n: 3,
    title: "A separation distance, and the word that says how it is measured",
    body: "A separation distance is the least distance a layout must keep "
      + "between two items, chosen so that a fire, an explosion or a release "
      + "at one does not take the other with it, and so that people and "
      + "machines can get between them.  A table of distances means nothing "
      + "until it says what it measures: between the CENTRES of the two items, "
      + "or between their nearest EDGES.  For two large vessels the two "
      + "readings differ by the sum of their radii, which can be metres.  So "
      + "Choupo refuses a separation table that does not say which -- measure "
      + "edgeToEdge; or measure centreToCentre; -- rather than guess.  For "
      + "two standing cylinders the two distances are the ones below; for "
      + "boxes, and for a box beside a cylinder, the engine measures the plan "
      + "gap between the two shapes in the same way.",
    formula: String.raw`s_\mathrm{c} = \sqrt{(x_a - x_b)^2 + (y_a - y_b)^2}, \qquad s_\mathrm{e} = s_\mathrm{c} - \frac{D_a}{2} - \frac{D_b}{2}`,
    where: [
      { sym: "s_\\mathrm{c}", means: "the distance between the two plan "
        + "centres (centre to centre)", unit: "m" },
      { sym: "x_a", means: "the plan x of item a's centre", unit: "m" },
      { sym: "x_b", means: "the plan x of item b's centre", unit: "m" },
      { sym: "y_a", means: "the plan y of item a's centre", unit: "m" },
      { sym: "y_b", means: "the plan y of item b's centre", unit: "m" },
      { sym: "s_\\mathrm{e}", means: "the clear distance between the two "
        + "footprints (edge to edge); negative when they overlap",
        unit: "m" },
      { sym: "D_a", means: "the diameter of item a", unit: "m" },
      { sym: "D_b", means: "the diameter of item b", unit: "m" },
    ],
    note: "The edge-to-edge distance of two standing cylinders: "
      + "src/postProcessing/layout/PlantLayout.cpp:137.  Which of the two the "
      + "check uses is read from the table's measure word at "
      + "PlantLayout.cpp:1297-1299, and a table that does not declare one is "
      + "refused at PlantLayout.cpp:265.",
  },
  {
    n: 4,
    title: "Why the distance depends on what the two items are",
    body: "A fired heater is an open flame; a compressor is a machine whose "
      + "seals leak a little in normal running; a large storage tank is an "
      + "inventory that can burn for hours; a control room is full of people.  "
      + "The distance two items need depends on what each can do to the other, "
      + "so a separation table is keyed on PAIRS OF KINDS, not on items: "
      + "vessel to vessel, compressor to vessel, building to compressor.  In "
      + "Choupo the kind of a sized item is its design sheet's own equipment "
      + "word (vessel, compressor, shellTubeHX ...), never one you type, and a "
      + "non-process item -- a control room, a flare, a workshop -- declares "
      + "its own.  Every pair of placed items whose kinds the table names is "
      + "checked.  One pair of kinds has one distance: a pair declared twice "
      + "is refused, because which of two numbers wins would be an accident "
      + "of order.  And a rule naming a kind no placed item carries is "
      + "announced, because it checks nothing.",
    formula: String.raw`s \ge s_\mathrm{min}(k_a, k_b)`,
    where: [
      { sym: "s", means: "the distance between items a and b, measured the "
        + "way the table declares", unit: "m" },
      { sym: "s_\\mathrm{min}", means: "the distance the case declares "
        + "between the two kinds", unit: "m" },
      { sym: "k_a", means: "the kind of item a (its design sheet's "
        + "equipment word, or the kind a non-process item declares)" },
      { sym: "k_b", means: "the kind of item b" },
    ],
    note: "The kind is read from the design sheet at "
      + "src/postProcessing/layout/PlantLayout.cpp:1158; a pair of kinds "
      + "declared twice is refused at PlantLayout.cpp:308; a pair closer than "
      + "its distance is ANNOUNCED, not refused, at PlantLayout.cpp:1301.",
  },
  {
    n: 5,
    title: "Who publishes the distances, and why Choupo ships none",
    body: "Separation tables are published by the process-safety and "
      + "insurance communities: the Center for Chemical Process Safety's "
      + "guideline on facility siting and layout, the insurers' guideline "
      + "GAP.2.5.2 on oil and chemical plant layout and spacing, and "
      + "Mecklenburgh's Process Plant Layout are the usual references, and "
      + "a client often specifies its own.  None of them grants the right to "
      + "copy its tables into an open-source program, so Choupo ships no "
      + "spacing table and no default distance: every distance is the CASE'S "
      + "declaration, and every table carries a source and a reason the "
      + "engine refuses to run without.  That is also the honest position for "
      + "a student: a number copied from a table is a number someone else "
      + "chose for another plant, and you must be able to say which table, "
      + "which edition, and why it applies to yours.  The witness this page "
      + "runs says, in its own file, that its distances are round numbers "
      + "chosen for the exercise and taken from no standard.  Read them as "
      + "that, and never as guidance.",
  },

  // ---- Part 3: the exercise -------------------------------------------------
  {
    n: 6,
    title: "Start from a draft: bin/choupo-layout --draft",
    body: "You do not have to start from a blank plan.  On your own machine, "
      + "bin/choupo-layout --draft <case> solves the case with its sizing pass "
      + "and writes a DRAFT system/layoutDict: the placeable items in the "
      + "order the flowsheet declares its units (a valid flow order), on one "
      + "line at grade, each at the smallest x that keeps a clear gap to its "
      + "neighbour equal to the larger plan extent of the two -- a drafting "
      + "spacing for access, said to be one, never a safety distance -- and "
      + "every separation the case already declares.  Items with no size of "
      + "their own are listed, commented out, for you to place with a box you "
      + "can defend.  It writes NO separation table, wind or zone for you: "
      + "those are yours.  It refuses to overwrite an existing layoutDict "
      + "unless you pass --force, and with --force it carries your tables, "
      + "wind, boxes and hazards into the new draft.  Then it checks the draft "
      + "it wrote, so the proposal is proved to parse and to hold.  The draft "
      + "is a starting point, not a design: a straight line of items is "
      + "rarely what a plant looks like.  (The browser cannot run this "
      + "command-line step; the exercise below starts from the witness's own "
      + "file, which was started with the draft tool and then moved by hand.)",
    formula: String.raw`x_i = x_{i-1} + \frac{w_{i-1}}{2} + g + \frac{w_i}{2}, \qquad g = \max(\text{plan extents of both})`,
    where: [
      { sym: "x_i", means: "the plan x the draft gives item i", unit: "m" },
      { sym: "x_{i-1}", means: "the plan x of the item placed before it",
        unit: "m" },
      { sym: "w_{i-1}", means: "the earlier item's extent along x",
        unit: "m" },
      { sym: "w_i", means: "item i's extent along x", unit: "m" },
      { sym: "g", means: "the drafting gap: the largest of the two items' "
        + "plan extents", unit: "m" },
    ],
    note: "The draft's gap and position: "
      + "src/postProcessing/layout/PlantLayout.cpp:1679-1680, then pushed out "
      + "further by every declared separation and rounded UP to the "
      + "centimetre the file prints (PlantLayout.cpp:1695), so a printed "
      + "position never sits closer than the rule it was placed by.",
  },
  {
    n: 7,
    title: "Read the announcement, then move the item until it goes",
    body: "Run the witness as shipped (move 1 in the bench below).  The "
      + "let-down drum stands 1.886 m from the separator, edge to edge, "
      + "against the 4 m the case declares between two vessels.  The engine "
      + "does not stop: it ANNOUNCES the shortfall, with both distances, on "
      + "the run's error stream, again in the caveat block at the end of the "
      + "run under PLANT LAYOUT, and in the result the page draws.  That is "
      + "deliberate.  A short distance is still a layout -- a draft whose "
      + "shortfall you must see and then either fix or defend -- and refusing "
      + "it would hide the very picture that shows the problem.  Now move the "
      + "drum east until the announcement goes (move 2).  The condition is the "
      + "one below, with the separator's and the drum's own diameters.  Then "
      + "push it the other way, into the separator (move 3): two footprints "
      + "that overlap on the plan and in height are not a layout at all, and "
      + "THAT is refused -- the run stops, exit 2, and names both items and "
      + "the overlap.  Two items whose heights do not meet may share a plan "
      + "position (a pipe bridge over a pump, say); only a true collision is "
      + "refused.",
    formula: String.raw`x_\mathrm{drum} \ge x_\mathrm{sep} + \frac{D_\mathrm{sep}}{2} + \frac{D_\mathrm{drum}}{2} + s_\mathrm{min}`,
    where: [
      { sym: "x_\\mathrm{drum}", means: "the let-down drum's plan x (the two "
        + "stand on one line of y)", unit: "m" },
      { sym: "x_\\mathrm{sep}", means: "the separator's plan x", unit: "m" },
      { sym: "D_\\mathrm{sep}", means: "the separator's diameter, from its "
        + "own sizing", unit: "m" },
      { sym: "D_\\mathrm{drum}", means: "the drum's diameter, from its own "
        + "sizing", unit: "m" },
    ],
    note: "Every announcement goes to two homes in one call, the error "
      + "stream and the advisory log that the caveat block and the result "
      + "replay: src/postProcessing/layout/PlantLayout.cpp:81-82; the block's "
      + "heading is src/core/AdvisorySummary.H:117.  The overlap refusal: "
      + "PlantLayout.cpp:1218-1219.  On the witness the condition puts the drum "
      + "at x of about 61.61 m or more; the bench's x = 62 m clears it.",
  },
  {
    n: 8,
    title: "The same 4 m, two different rules",
    body: "Switch the table's measure word to centre to centre (move 4) and "
      + "nothing else.  The same pair is now 3.5 m apart, still short of the "
      + "same 4 m -- but the rule has changed under the number.  Between a "
      + "separator 2.6 m across and a drum 0.6 m across, 4 m centre to centre "
      + "leaves about 2.4 m of clear ground; 4 m edge to edge needs about "
      + "5.6 m between the centres.  When you copy a distance from any table, "
      + "copy the word that says how it was measured with it, or you have "
      + "copied a different rule.",
    formula: String.raw`s_\mathrm{e} = s_\mathrm{c} - \frac{D_a + D_b}{2}`,
  },

  // ---- Part 4: the wind and the zones ----------------------------------------
  {
    n: 9,
    title: "The prevailing wind: keep ignition sources upwind of releases",
    body: "Gas that leaks drifts with the wind.  On most sites the wind blows "
      + "from some directions far more often than from others, and the "
      + "classical rule follows: put the things that can ignite a cloud -- "
      + "fired heaters, flares, control rooms and workshops with ordinary "
      + "electrical equipment, roads with vehicles -- UPWIND of the things "
      + "that can release one.  Choupo checks that rule in the simplest form "
      + "that can be stated, and every number in it is the case's own: the "
      + "wind blows FROM a declared true bearing, the plan's north points at "
      + "a declared true bearing, and an ignition source is announced when "
      + "the bearing from a release source's centre to its centre lies within "
      + "a declared half-angle of the downwind direction AND the two centres "
      + "are within a declared reach.  Which items are release sources and "
      + "which are ignition sources is declared too, each with its reason; "
      + "the engine never guesses that a building is an ignition source.  "
      + "Every angle must carry its unit (225 deg), because a bare number "
      + "would be read as radians.  Try it: turn the wind round to blow from "
      + "the north-east (move 5) and the control room, which nobody moved, "
      + "is now downwind of both compressors.  A layout is only right for the "
      + "wind of the site it stands on.",
    formula: String.raw`\beta = \beta_\mathrm{plan} + \theta_\mathrm{N}, \qquad \left| \beta - (\theta_\mathrm{from} + 180\,\text{deg}) \right| \le \alpha \quad\text{and}\quad s_\mathrm{c} \le R`,
    where: [
      { sym: "\\beta", means: "the true bearing from the release source's "
        + "centre to the ignition source's", unit: "deg" },
      { sym: "\\beta_\\mathrm{plan}", means: "the same bearing on the plan, "
        + "clockwise from the plan's +y", unit: "deg" },
      { sym: "\\theta_\\mathrm{N}", means: "the true bearing of the plan's +y "
        + "axis (planNorth)", unit: "deg" },
      { sym: "\\theta_\\mathrm{from}", means: "the true bearing the wind "
        + "blows FROM (from); the wind blows toward this plus 180 deg",
        unit: "deg" },
      { sym: "\\alpha", means: "the declared half-angle of the downwind "
        + "sector (halfAngle)", unit: "deg" },
      { sym: "R", means: "the declared reach: beyond it the pair is not "
        + "checked (reach)", unit: "m" },
    ],
    note: "The downwind direction: src/postProcessing/layout/"
      + "PlantLayout.cpp:1385; the true bearing and the angle off downwind, "
      + "taken on the circle between -180 and 180 deg: PlantLayout.cpp:1395-1398; "
      + "the reach: PlantLayout.cpp:1394.  An angle with no unit is refused at "
      + "PlantLayout.cpp:106, and an item's ignition declaration is read at "
      + "PlantLayout.cpp:221.  This is a SECTOR test, not a dispersion model: "
      + "it knows nothing of the gas's density, the release rate or the "
      + "weather, and a real wind rose has more than one direction.",
  },
  {
    n: 10,
    title: "Hazardous-area zones (ATEX): where an ignition source may not be",
    body: "Around a release point -- a flange, a pump seal, a vent, a drain -- "
      + "area classification divides the space by how likely an explosive gas "
      + "atmosphere is to be there.  In the vocabulary of IEC 60079-10-1, "
      + "which the European ATEX workplace directive (1999/92/EC) uses too: "
      + "ZONE 0, where it is present continuously, for long periods or "
      + "frequently; ZONE 1, where it is likely to occur occasionally in "
      + "normal operation; ZONE 2, where it is not likely in normal operation "
      + "and, if it does occur, lasts only a short time.  Electrical equipment "
      + "in a zone must be of a type certified for that zone, and open "
      + "flames and uncertified equipment belong outside every zone -- which "
      + "is why the witness treats its control room, full of ordinary "
      + "electrical equipment, as an ignition source.  HOW FAR a zone extends depends on the grade and "
      + "rate of the release, the ventilation and the gas, and is worked out "
      + "by the methods of IEC 60079-10-1, the Energy Institute's EI 15 or "
      + "API RP 505.  None of them grants the right to copy its extent tables, "
      + "so none is transcribed here: the case DECLARES each release source's "
      + "zones as envelopes, and says where the numbers came from.  The engine "
      + "then checks one thing -- that no declared ignition source is inside a "
      + "declared envelope -- and announces it when one is.  The envelope is a "
      + "vertical cylinder about the release item's plan centre, of the "
      + "declared radius, from the item's base up to the declared height.  Put "
      + "the control room beside the compressors (move 6 sends it north-east, "
      + "move 7 beside the make-up compressor) and watch which rules fire.",
    formula: String.raw`d_\mathrm{axis} < r_\mathrm{z} \quad\text{and}\quad \min(z_\mathrm{ig} + h_\mathrm{ig},\, z_\mathrm{rel} + h_\mathrm{z}) > \max(z_\mathrm{ig},\, z_\mathrm{rel})`,
    where: [
      { sym: "d_\\mathrm{axis}", means: "the plan distance from the release "
        + "item's centre to the nearest point of the ignition source's "
        + "footprint (zero if the centre is inside it)", unit: "m" },
      { sym: "r_\\mathrm{z}", means: "the zone's declared radius", unit: "m" },
      { sym: "z_\\mathrm{ig}", means: "the ignition source's base elevation",
        unit: "m" },
      { sym: "h_\\mathrm{ig}", means: "the ignition source's height",
        unit: "m" },
      { sym: "z_\\mathrm{rel}", means: "the release item's base elevation",
        unit: "m" },
      { sym: "h_\\mathrm{z}", means: "the zone's declared height above that "
        + "base", unit: "m" },
    ],
    note: "The envelope test: src/postProcessing/layout/PlantLayout.cpp:1361-1364, "
      + "with the plan distance from a point to a footprint at "
      + "PlantLayout.cpp:161.  The engine does not classify anything and does "
      + "not ask whether the equipment inside a zone is certified for it: it "
      + "checks the items YOU declared as ignition sources against the "
      + "envelopes YOU declared.  A zone number that is not 0, 1 or 2 is "
      + "refused.",
  },

  // ---- Part 5: the trade-offs ----------------------------------------------
  {
    n: 11,
    title: "Tight saves pipe; spread buys distance and access",
    body: "Packing everything close together shortens every pipe, every cable "
      + "and every walk, shrinks the plot the plant needs and lowers the "
      + "pressure drop the pumps and compressors pay for -- and it breaks "
      + "separation distances, puts ignition sources inside zones and leaves "
      + "no room to lift, pull or reach anything.  Spreading everything out "
      + "does the opposite, and costs pipe, land and pumping.  The layout "
      + "designer's job is to find where each item can stand so that every "
      + "distance holds with the least pipe, and flow order is the first "
      + "guide: items that exchange large or hazardous flows want to be "
      + "neighbours.  Access is part of the same trade, and the grammar can "
      + "keep it: declare the space a tube bundle is pulled into as a "
      + "non-process box beside its exchanger (kind accessSpace; with its "
      + "footprint), and the engine's overlap rule then refuses anything that "
      + "stands in it.  On the witness, a pull space east of the feed-effluent "
      + "exchanger is refused -- the water cooler stands end to end with it, "
      + "on the same line -- and one to the west is accepted.  The PIPE side "
      + "of the trade is now on the page as a LENGTH: the engine routes every "
      + "stream it can reach -- up from the top of its source to a lane of a "
      + "pipe rack, along the rack, down to the top of its target, a mixer or "
      + "a splitter drawn as a junction on the rack -- and publishes each "
      + "pipe's length and their total in the pipe register under the 3D "
      + "view, so moving an item away from its neighbours shows, in metres, "
      + "what the distance costs in pipe.  WHAT THE PAGE CANNOT SHOW YET: a "
      + "pipe's pressure drop and its cost.  The length is the quantity both "
      + "will be computed from; neither is computed today, so the piping "
      + "side of the trade-off is drawn in distances and pipe metres, not in "
      + "money.  The LAND side is on the page as an AREA: the engine publishes "
      + "the plot area -- the envelope of every placed footprint, every routed "
      + "pipe and every declared sector area, grown by the margin the case "
      + "declares for its roads, fence and access -- and the share of it the "
      + "footprints themselves cover, under the 3D view; spreading the plant "
      + "out shows there in square metres.  Where the case also declares a "
      + "land price, the economic appraisal prices that area as land (bought "
      + "at the start of construction, recovered at the end of the project), "
      + "so the same move then shows in money too.",
    note: "The route and its length: src/postProcessing/layout/PlantLayout.cpp:"
      + "803-819 (up to the lane, along it, down to the target) and "
      + "PlantLayout.cpp:824 (the length is the polyline's own).  "
      + "The rack the case declares, or the engine's stated default, which it "
      + "announces: PlantLayout.cpp:828.  The plot: the envelope grown by the "
      + "margin and its area, PlantLayout.cpp:923-925; the footprints' own "
      + "area, PlantLayout.cpp:928; an undeclared margin announced, "
      + "PlantLayout.cpp:992.",
  },
];

/** What this page, and the engine under it, does not do. */
export const PLANT_LAYOUT_LIMITS: readonly LessonLimit[] = [
  { id: "pipes", title: "Pipe lengths, but no pipe cost or pressure drop",
    body: "The engine routes and measures the pipe between two items (the "
      + "design record, section 11), but nothing sizes its diameter, computes "
      + "its pressure drop or prices it, so the piping's cost is not on any "
      + "page yet (the LAND the layout occupies is: its plot area is published, "
      + "and the economic appraisal prices it when the case declares a land "
      + "price).  Nor does it check whether a route passes through an item, or "
      + "draw the piping inside a unit that realises several items." },
  { id: "structures", title: "No structures or floors",
    body: "Elevation is declared and checked for collisions, but nothing "
      + "models a steel structure, a floor of a multi-level unit or whether an "
      + "item is supported; the pipe rack is a routing line at a declared "
      + "height, not a structure." },
  { id: "drainage", title: "No drainage, kerbs or bunds",
    body: "Where a spill runs, how the ground slopes, and how a tank's bund "
      + "contains its inventory are not modelled." },
  { id: "access", title: "Access is checked only where you declare it",
    body: "Roads, escape routes, crane positions and maintenance spaces are "
      + "not checked unless you declare them, for example as a non-process "
      + "box the overlap rule then keeps clear." },
  { id: "rotation", title: "Two plan axes only",
    body: "An item stands vertical or lies along x or along y; rotation by an "
      + "arbitrary angle is not in the grammar." },
  { id: "numbers", title: "Nothing judges whether a number is sensible",
    body: "The engine checks the distances, wind and zones you declared; it "
      + "does not say whether they are the right ones for your plant.  That is "
      + "yours to defend, with a source, by design." },
  { id: "physics", title: "No consequence modelling",
    body: "The wind test is a sector, not a dispersion model, and a zone is an "
      + "envelope you declare, not one the engine computes from a release.  "
      + "Fire radiation, blast overpressure and toxic exposure are not "
      + "modelled." },
];
