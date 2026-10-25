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
  materialsLesson -- the text of "Materials of construction, seals and
  gaskets" (DEV.md 4c C84, commissioned by Vitor on 2026-10-17: "sem aço
  carbono não havia engenharia química ... uma forma pareto de explicar
  quais os materiais mais usados ... e como se escolhem.  Uma secção de
  metalurgia seria importante").  The six parts follow the outline stated to
  him the same day and are not widened: why materials decide a plant; the
  Pareto; metallurgy; how to choose; seals and gaskets; what Choupo does
  with a material.

  WHAT THIS PAGE DOES NOT CARRY, deliberately.  No corrosion-rate table, no
  allowable-stress table, no hydrogen-service curve and no elastomer
  compatibility chart: the binding numbers live in documents that grant no
  redistribution (the corrosion data surveys, ASME Section II Part D, API RP
  941, manufacturers' charts), and the page NAMES them as where those
  numbers live, marked NOT READ.  The few numbers the prose does carry are
  of three kinds, and each is said where it is used: the engine's own
  arithmetic and records (cited by file:line, held by the test), worked
  arithmetic on nominal compositions a reader can redo, and physical
  constants of iron found in any materials text.

  THE PARETO IS A TEACHING ORDERING.  Nothing on this page is a measured
  market share, and the page says so: no licence-clean source for one was
  found, and a share invented to look precise would be the falsely-sourced
  number this project refuses to ship.

  NO TRADE NAME.  Alloys are named by composition and UNS number, polymers by
  their generic or ASTM D1418 family names (NBR, EPDM, FKM, FFKM, PTFE, PFA).

  Engine claims carry the file and line they were read at; the test holds
  every one of them to the statement it names.  Nothing is quoted: the test
  refuses a quotation mark in the text.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** Every source the page names, with what was taken from it and how it was
 *  reached.  Drawn at the foot of the page. */
export interface MaterialsSource { id: string; cite: string; used: string }

export const MATERIALS_SOURCES: readonly MaterialsSource[] = [
  { id: "loginow",
    cite: "A. W. Loginow, Stress Corrosion Cracking of Steel in Liquefied "
      + "Ammonia Service -- A Recapitulation, Materials Performance (December "
      + "1986), reprinted in the National Board Bulletin (January 1989)",
    used: "read, through a fetch-and-summarise of the National Board's web "
      + "reprint rather than the printed article: air (oxygen, even a few ppm) "
      + "as the primary cause, the 1962 recommendation of at least 0.2 per "
      + "cent water as an inhibitor, cracking concentrated in as-welded "
      + "heat-affected zones and repairs, post-weld heat treatment after any "
      + "welding, lower-strength steels being more resistant, and wet "
      + "fluorescent magnetic-particle inspection.  Paraphrased in step 17." },
  { id: "loginow-phelps",
    cite: "A. W. Loginow and E. H. Phelps, Stress-corrosion cracking of steels "
      + "in agricultural ammonia, Corrosion 18 (1962)",
    used: "the original 1962 study the recapitulation summarises.  NOT READ; "
      + "named because it is the primary work." },
  { id: "csb-tesoro",
    cite: "U.S. Chemical Safety and Hazard Investigation Board, Tesoro "
      + "Anacortes Refinery Fatal Explosion and Fire, final investigation "
      + "report (1 May 2014)",
    used: "the investigation's web page was read: 2 April 2010, seven "
      + "employees killed, a nearly forty-year-old heat exchanger that failed "
      + "during a maintenance operation; the attribution to high temperature "
      + "hydrogen attack is the CSB's own headline on that page.  The report "
      + "itself NOT READ.  A US Government work." },
  { id: "api-941",
    cite: "API RP 941, Steels for Hydrogen Service at Elevated Temperatures "
      + "and Pressures in Petroleum Refineries and Petrochemical Plants",
    used: "named as where the industry's operating-limit curves for hydrogen "
      + "service live.  NOT READ; no curve or number from it is on this page, "
      + "and Choupo does not transcribe it." },
  { id: "asme-iid",
    cite: "ASME Boiler and Pressure Vessel Code, Section II Part D (material "
      + "properties) and Section VIII Division 1 (pressure vessels)",
    used: "named as where allowable stresses as a function of temperature, "
      + "minimum design metal temperatures and the shell-thickness rule live.  "
      + "NOT READ; the shell-thickness formula on this page is the one the "
      + "engine runs, which its own header says was transcribed from Turton "
      + "et al., App. A." },
  { id: "turton",
    cite: "R. Turton et al., Analysis, Synthesis and Design of Chemical "
      + "Processes, 4th ed., Appendix A",
    used: "named as the source of the bare-module form and of the F_M the "
      + "SS304 and SS316 records cite.  NOT READ for this page; every number "
      + "shown from it is read from the engine (src/postProcessing/costing/"
      + "Turton.cpp) or from a record." },
  { id: "corrosion-data",
    cite: "The corrosion data surveys published by AMPP (formerly NACE "
      + "International), and ISO 15156 / NACE MR0175 for sour service",
    used: "named as where measured corrosion rates by alloy and medium, and "
      + "the hardness limits for wet hydrogen sulphide service, live.  NOT "
      + "READ; no rate or limit from them is on this page." },
  { id: "api-682",
    cite: "API 682, Pumps -- Shaft Sealing Systems for Centrifugal and Rotary "
      + "Pumps",
    used: "named as the standard that numbers the seal flush and barrier "
      + "arrangements the page describes generically.  NOT READ; no plan "
      + "number is used." },
  { id: "astm-a240",
    cite: "ASTM A240 (stainless plate) and the Unified Numbering System for "
      + "metals and alloys (SAE/ASTM)",
    used: "named as where the binding composition ranges of each grade live.  "
      + "NOT READ; the compositions in steps 3 and 4 are nominal, rounded and "
      + "labelled so." },
  { id: "callister",
    cite: "W. D. Callister and D. G. Rethwisch, Materials Science and "
      + "Engineering: An Introduction (any recent edition)",
    used: "named as a standard text for the crystal structures and the "
      + "iron-carbon diagram of steps 8 and 9.  NOT READ for this page; the "
      + "constants used there (912 and 1538 degrees C, 0.022, 0.76 and 2.14 "
      + "per cent carbon) are the iron-carbon diagram's own and appear in "
      + "every such text." },
  { id: "iiw-ce",
    cite: "The International Institute of Welding carbon equivalent "
      + "(after Dearden and O'Neill, 1940)",
    used: "the formula of step 12, in its common published form.  The "
      + "original paper NOT READ; the threshold beside it is stated as a "
      + "rule of thumb, not a code limit." },
  { id: "records",
    cite: "Choupo's own records data/standards/assets/carbonSteel.dat, "
      + "SS304.dat, SS316.dat, aluminium.dat",
    used: "read: the numbers each record declares and what its own header "
      + "says about where they came from (step 22 and the bench)." },
  { id: "peq-postdict",
    cite: "tutorials/plant/greenAmmoniaPEQ_baseCase/system/postDict",
    used: "read: the case's own material rule and what it does not check "
      + "(steps 10, 16 and 22)." },
];

export const MATERIALS_STEPS: readonly LessonStep[] = [
  // ---- Part 1: why materials decide a plant ------------------------------
  {
    n: 1,
    title: "A plant is a set of containers that must not fail",
    body: "Every vessel, pipe, exchanger and pump casing in a chemical plant "
      + "holds something that would rather be somewhere else: a gas at 200 "
      + "bar, a liquid above its boiling point, an acid, a toxic.  Whether it "
      + "stays inside is decided by the material of the wall, in four ways "
      + "at once.  Corrosion: the fluid eats the wall, slowly and evenly, or "
      + "quickly and in one spot.  Strength at temperature: the wall must "
      + "carry the pressure at the temperature it actually sees, and steel "
      + "that is strong at 20 degrees C is weaker at 500.  Toughness: the "
      + "wall must bend before it breaks, and some steels lose that "
      + "property in the cold.  Cost: equipment is bought by the kilogram, "
      + "and the same vessel in a nickel alloy can cost several times what it "
      + "costs in carbon steel.  A wrong choice shows up as a leak, a "
      + "crack or a budget, and in the worst case as all three.  This is "
      + "why the material of every item is chosen early, during the front "
      + "end of a design, and written on the equipment list beside its size.",
    leadsTo: {
      tool: "front-end-loading",
      toolLabel: "Front-End Loading: how industry stages a design",
      stepTitle: "the stages of a design",
      body: "When in a design the material of each item is fixed, and at "
        + "what fidelity it is costed, is the subject of the Front-End "
        + "Loading page.",
    },
  },

  // ---- Part 2: the Pareto -------------------------------------------------
  {
    n: 2,
    title: "The Pareto: carbon steel first, and why",
    body: "What follows is a TEACHING ORDERING -- the order in which an "
      + "engineer reaches for materials -- and not a measured market share: "
      + "no licence-clean source for one was found, and this page will not "
      + "invent one.  First, by a wide margin, comes carbon steel: iron with "
      + "a few tenths of a per cent of carbon and about one per cent of "
      + "manganese.  Four reasons make it the default against which every "
      + "other material must justify its premium.  It is CHEAP, the cheapest "
      + "strong metal there is.  It is STRONG and DUCTILE at ambient "
      + "temperature: it yields and bends long before it breaks, which is "
      + "what lets a code design a vessel on a calculated stress.  It is "
      + "WELDABLE, so a vessel can be built from rolled plate.  And it is "
      + "AVAILABLE in every form a plant needs -- plate, seamless pipe, "
      + "forgings, flanges, fittings, bolts -- from many mills, with decades "
      + "of codes, inspection practice and failure history behind it.  Its "
      + "weaknesses define everything else on this list: it rusts in water "
      + "and moist air, so a wall is made thicker than strength needs (the "
      + "corrosion allowance, step 14); it becomes brittle in the cold (step "
      + "10); it loses strength and creeps when hot (step 11); and hot "
      + "hydrogen attacks it (step 16).  Every other family below exists "
      + "because one of those weaknesses bit.  Put bluntly: without "
      + "carbon steel there would have been no chemical engineering.",
  },
  {
    n: 3,
    title: "Austenitic stainless steel: 304 and 316",
    body: "Add at least about 10.5 per cent chromium to steel and a film of "
      + "chromium oxide a few nanometres thick forms on its surface by "
      + "itself; it is impervious, and if scratched it re-forms wherever "
      + "oxygen reaches the metal.  That film -- PASSIVITY -- is what makes a "
      + "steel stainless.  Add about 8 per cent nickel as well and the "
      + "crystal structure stays face-centred cubic down to room temperature "
      + "(step 8): this is AUSTENITIC stainless, the second family on the "
      + "list and the workhorse wherever carbon steel would corrode or "
      + "contaminate a product.  The grade 304 (UNS S30400, nominally 18 "
      + "per cent chromium and 8 per cent nickel) is the general one.  The "
      + "grade 316 (UNS S31600) adds about 2 per cent molybdenum, which "
      + "makes the film far harder to break down locally where chlorides "
      + "are present -- the pitting that ruins stainless steel in brines, "
      + "seawater and many process streams.  An empirical index ranks the "
      + "alloys for that resistance, and it is worth computing once.",
    formula: String.raw`\mathrm{PREN} = w_\mathrm{Cr} + 3.3\, w_\mathrm{Mo} + 16\, w_\mathrm{N}`,
    where: [
      { sym: "\\mathrm{PREN}", means: "the pitting resistance equivalent "
        + "number: a ranking index, not a corrosion rate", unit: "-" },
      { sym: "w_\\mathrm{Cr}", means: "the chromium content of the alloy, "
        + "per cent by mass", unit: "wt %" },
      { sym: "w_\\mathrm{Mo}", means: "the molybdenum content, per cent by "
        + "mass", unit: "wt %" },
      { sym: "w_\\mathrm{N}", means: "the nitrogen content, per cent by mass",
        unit: "wt %" },
    ],
    note: "On nominal, rounded compositions (the binding ranges are in the "
      + "material specification): 304 with 18 Cr, 0 Mo and 0.05 N gives "
      + "18 + 0 + 0.8, about 19; 316 with 17 Cr, 2.1 Mo and 0.05 N gives "
      + "17 + 6.9 + 0.8, about 25; a 22 Cr duplex with 3 Mo and 0.17 N gives "
      + "22 + 9.9 + 2.7, about 35.  The coefficient on nitrogen differs "
      + "between sources (16 is the common one, and some write 30); the "
      + "index orders alloys against one another and says nothing about how "
      + "fast any of them corrodes in your fluid.",
  },
  {
    n: 4,
    title: "When 316 is not enough: duplex, nickel alloys, titanium",
    body: "DUPLEX stainless steels (for example UNS S32205, nominally 22 per "
      + "cent chromium, 5 nickel, 3 molybdenum) are roughly half austenite "
      + "and half ferrite.  The ferrite gives them about twice the yield "
      + "strength of 316, so walls are thinner, and far better resistance "
      + "to chloride stress-corrosion cracking (step 15); their limits are "
      + "a narrower temperature window and more demanding welding.  NICKEL "
      + "ALLOYS are the next step up in price and in resistance: a "
      + "nickel-molybdenum-chromium alloy such as UNS N10276 for hot "
      + "chloride solutions and many reducing acids; a nickel-chromium-"
      + "molybdenum alloy such as UNS N06625 for strength and corrosion "
      + "together; a nickel-copper alloy such as UNS N04400 in hydrofluoric "
      + "acid and seawater.  TITANIUM (commercially pure, UNS R50400) is "
      + "nearly immune to seawater and to oxidising chloride solutions, "
      + "which is why it is the tube of choice in seawater coolers and in "
      + "wet chlorine; it is attacked by reducing acids and it can ignite in "
      + "DRY chlorine, so the same metal is the answer in one chlorine "
      + "service and a hazard in the next.  Each of these is bought only "
      + "when a cheaper material has been shown to fail.",
  },
  {
    n: 5,
    title: "Copper alloys in exchangers, aluminium in the cold",
    body: "COPPER ALLOYS conduct heat well and resist marine fouling, which "
      + "is why copper-nickel (90/10, UNS C70600) and brasses have long been "
      + "used for tubes in cooling-water exchangers and condensers.  One "
      + "rule overrides that: copper alloys crack under stress in the "
      + "presence of ammonia, so an ammonia plant keeps copper and brass "
      + "out of every wetted part.  ALUMINIUM is light, conducts heat "
      + "superbly and -- because its crystal is face-centred cubic (step "
      + "10) -- stays tough down to the temperature of liquid nitrogen and "
      + "below.  That is its niche in chemical plants: cryogenic service, "
      + "such as the brazed plate-fin exchangers of air separation and gas "
      + "liquefaction, beside austenitic stainless and nickel steels.  It is "
      + "weak at high temperature and is attacked by alkalis and by "
      + "mercury, which is why a gas plant removes even traces of mercury "
      + "upstream of its aluminium exchangers.",
  },
  {
    n: 6,
    title: "Non-metallics, linings and refractories",
    body: "Some fluids defeat every affordable metal, and then the answer is "
      + "a metal shell that carries the pressure with something else on "
      + "the inside that carries the chemistry.  FLUOROPOLYMER LININGS (PTFE, "
      + "PFA) resist almost every chemical, but they soften with "
      + "temperature, gases slowly permeate them, and a lining can collapse "
      + "under vacuum if it is not bonded or vented.  GLASS-LINED STEEL is "
      + "the classic batch reactor of fine chemicals and pharmaceuticals: "
      + "glass resists acids, but is damaged by hot alkalis, by thermal "
      + "shock and by a dropped tool.  FIBRE-REINFORCED PLASTIC (FRP) tanks, "
      + "pipes and scrubbers serve hydrochloric acid, hypochlorite and "
      + "brines at modest temperature.  IMPERVIOUS GRAPHITE makes heat "
      + "exchangers for hot hydrochloric and sulphuric acids.  REFRACTORIES "
      + "-- firebrick and castable ceramic linings -- do the same job for "
      + "temperature: in a furnace, a reformer or a sulphur-recovery reactor "
      + "the lining keeps the steel shell cool enough to keep its strength, "
      + "so the shell carries the pressure and the lining carries the heat.  "
      + "The pattern is general: separate the job of holding pressure from "
      + "the job of resisting the fluid, and give each to the cheapest "
      + "material that can do it.  CLAD plate -- a few millimetres of "
      + "stainless or nickel alloy bonded to a carbon-steel backing -- is "
      + "the same idea in metal.",
  },
  {
    n: 7,
    title: "The Pareto, drawn",
    body: "The table below puts the families in the order this "
      + "page has met them, with what each is first chosen for and what "
      + "defeats it.  Its first four rows are a ladder: an engineer starts "
      + "with carbon steel and climbs through the stainless steels to the "
      + "nickel alloys only as far as the fluid, the temperature and the "
      + "pressure force them to, because each rung costs more.  The rows "
      + "below are not further rungs but answers to different problems -- "
      + "seawater, heat transfer, the cold, a fluid no metal resists, a "
      + "flame -- and some of them are cheaper than stainless.  It "
      + "is a teaching ordering: the share of each family in a real plant's "
      + "tonnage varies with the industry, and no number for it is given "
      + "here.",
  },

  // ---- Part 3: metallurgy -------------------------------------------------
  {
    n: 8,
    title: "Crystal structure: ferrite and austenite",
    body: "A metal is a crystal, and the arrangement of its atoms decides "
      + "much of how it behaves.  Pure iron at room temperature is "
      + "BODY-CENTRED CUBIC (BCC): an atom at each corner of a cube and one "
      + "in the middle.  This is FERRITE, alpha iron.  Heated above 912 "
      + "degrees C it rearranges into FACE-CENTRED CUBIC (FCC): an atom at "
      + "each corner and one in the middle of each face -- AUSTENITE, gamma "
      + "iron -- and it changes back to BCC (delta iron) just below its "
      + "melting point of 1538 degrees C.  Alloying moves those boundaries: "
      + "nickel, manganese and nitrogen widen the austenite field, enough "
      + "nickel keeps steel FCC down to room temperature and below, and that "
      + "is what an austenitic stainless steel is; chromium and molybdenum "
      + "favour ferrite, and a duplex steel is balanced to hold the two in "
      + "roughly equal parts.  The difference matters for one reason above "
      + "all: an FCC crystal has many closely packed planes along which "
      + "atoms can slide, a BCC crystal has fewer and needs thermal energy "
      + "to use them, and that difference returns in step 10.",
  },
  {
    n: 9,
    title: "Carbon in iron: the iron-carbon diagram",
    body: "Carbon atoms are small enough to sit in the gaps between iron "
      + "atoms, and how many fit depends on the crystal.  Ferrite dissolves "
      + "almost none -- at most about 0.022 per cent by mass, at 727 "
      + "degrees C -- while austenite dissolves up to about 2.14 per cent.  "
      + "So when a steel cools from the austenite field the carbon that "
      + "ferrite cannot hold comes out as iron carbide, cementite, Fe3C.  At "
      + "0.76 per cent carbon (the eutectoid) the whole of the austenite "
      + "turns at 727 degrees C into PEARLITE, fine alternating plates of "
      + "ferrite and cementite.  A pressure-vessel plate carries a few "
      + "tenths of a per cent of carbon and is mostly soft ferrite with "
      + "some pearlite: strong enough, ductile, weldable.  More carbon "
      + "makes a steel stronger and harder, and if it is cooled FAST from "
      + "austenite the carbon has no time to leave and is trapped in a hard, "
      + "brittle structure, MARTENSITE -- which is a tool steel's virtue and "
      + "a welded vessel's danger (step 12).  This is the level at which a "
      + "chemical engineer needs the iron-carbon diagram: carbon content "
      + "trades strength against weldability and toughness, and the cooling "
      + "rate decides which structure you get.",
  },
  {
    n: 10,
    title: "Why carbon steel breaks in the cold and stainless does not",
    body: "Pull a ferritic steel bar at room temperature and it stretches, "
      + "necks and tears slowly, absorbing a great deal of energy.  Do the "
      + "same below its DUCTILE-BRITTLE TRANSITION and it snaps like glass, "
      + "with a flat crystalline fracture and almost no energy absorbed.  "
      + "The reason is the crystal of step 8.  In BCC iron the stress needed "
      + "to make atoms slip rises steeply as the temperature falls, while "
      + "the stress needed to split the crystal along a plane (cleavage) "
      + "hardly changes; below the transition the steel cleaves before it "
      + "can yield.  An FCC metal -- austenitic stainless, aluminium, "
      + "copper, nickel -- slips easily at any temperature and has no such "
      + "transition.  The impact test (a notched bar struck by a pendulum, "
      + "the absorbed energy plotted against temperature) is how the "
      + "transition is measured, and pressure-vessel codes set for each "
      + "carbon steel a minimum design metal temperature, with impact "
      + "testing below it; impact-tested carbon steels serve well below 0 "
      + "degrees C.  The green-ammonia base case shows the consequence of "
      + "a record that carries no such field: its postDict "
      + "(tutorials/plant/greenAmmoniaPEQ_baseCase/system/postDict:179-183) "
      + "puts SS304 on every item that goes below 0 degrees C, because "
      + "austenitic stainless keeps its toughness there and the generic "
      + "carbon-steel record states no minimum design temperature -- a "
      + "conservative rule, taken because the data to do better is not in "
      + "the tree.",
  },
  {
    n: 11,
    title: "Creep: strength that leaks away with time",
    body: "Hot enough, a metal under a constant load stretches slowly and "
      + "never stops: CREEP.  It becomes important at roughly four tenths of "
      + "the absolute melting temperature, a ratio worth computing.  Above "
      + "that temperature an allowable stress is no longer set by the "
      + "strength measured in a short test but by the stress the metal "
      + "survives for the design life without rupturing, and the code "
      + "tables of allowable stress fall steeply with temperature for that "
      + "reason.  Carbon steel reaches that range in fired heaters, "
      + "reformers and hot reactors; chromium-molybdenum steels "
      + "(for example 1.25 Cr-0.5 Mo and 2.25 Cr-1 Mo) take over there, and "
      + "austenitic stainless and nickel alloys above them.",
    formula: String.raw`T_\mathrm{h} = \frac{T}{T_\mathrm{m}}`,
    where: [
      { sym: "T_\\mathrm{h}", means: "the homologous temperature: the "
        + "service temperature as a fraction of the melting temperature",
        unit: "-" },
      { sym: "T", means: "the metal's service temperature", unit: "K" },
      { sym: "T_\\mathrm{m}", means: "the metal's melting temperature (for "
        + "iron 1811 K, 1538 degrees C)", unit: "K" },
    ],
    derivation: [
      { step: "Put creep's rough threshold, four tenths, into the ratio for "
        + "iron and solve for the service temperature.",
        eq: String.raw`T_\mathrm{h} \approx 0.4 \;\Rightarrow\; T \approx 0.4 \times 1811\ \text{K} \approx 724\ \text{K} \approx 451\ {}^{\circ}\text{C}` },
    ],
    note: "Four tenths is a rule of thumb that locates the range, not a "
      + "design limit; where creep governs a given steel is in the code's "
      + "own allowable-stress tables.",
  },
  {
    n: 12,
    title: "Welding and the heat-affected zone",
    body: "A weld is a small casting made inside a large plate.  The metal "
      + "beside it -- the HEAT-AFFECTED ZONE (HAZ) -- is heated into the "
      + "austenite field and then cooled fast by the cold plate around it, "
      + "which is exactly the recipe for martensite in step 9.  A hard, "
      + "brittle HAZ, with hydrogen from moisture in the welding consumables "
      + "and the residual stress the weld leaves as it shrinks, is how "
      + "steels crack hours after welding (cold cracking).  Weldability is "
      + "therefore judged from the composition, with one number that weighs "
      + "each alloying element by how much it promotes a hard HAZ.  The "
      + "remedies are a low carbon equivalent, low-hydrogen consumables, "
      + "PREHEAT (to slow the cooling) and POST-WELD HEAT TREATMENT (PWHT): "
      + "heating the finished vessel to temper the HAZ and relax the "
      + "residual stress, which is required by the codes above a thickness "
      + "and is a standard defence where carbon steel cracks under stress "
      + "in a fluid -- caustic, amines, and the ammonia of step 17.",
    formula: String.raw`\mathrm{CE} = w_\mathrm{C} + \frac{w_\mathrm{Mn}}{6} + \frac{w_\mathrm{Cr} + w_\mathrm{Mo} + w_\mathrm{V}}{5} + \frac{w_\mathrm{Ni} + w_\mathrm{Cu}}{15}`,
    where: [
      { sym: "\\mathrm{CE}", means: "the carbon equivalent (the International "
        + "Institute of Welding form)", unit: "wt %" },
      { sym: "w_\\mathrm{C}", means: "the carbon content", unit: "wt %" },
      { sym: "w_\\mathrm{Mn}", means: "the manganese content", unit: "wt %" },
      { sym: "w_\\mathrm{V}", means: "the vanadium content", unit: "wt %" },
      { sym: "w_\\mathrm{Ni}", means: "the nickel content", unit: "wt %" },
      { sym: "w_\\mathrm{Cu}", means: "the copper content", unit: "wt %" },
    ],
    note: "A plate with 0.20 per cent carbon and 1.0 per cent manganese and "
      + "nothing else gives 0.20 + 1.0/6 = 0.37.  A common rule of thumb is "
      + "that a carbon equivalent below about 0.4 welds without special "
      + "precautions and that higher values call for preheat; the binding "
      + "rule depends on the thickness, the process and the code.",
  },
  {
    n: 13,
    title: "Sensitisation, the L grades, and why passivity can fail",
    body: "Austenitic stainless has its own welding trap.  Held between "
      + "roughly 450 and 850 degrees C -- which the HAZ of every weld passes "
      + "through -- the carbon in 304 combines with chromium into chromium "
      + "carbides along the grain boundaries.  The metal right beside each "
      + "boundary is left with too little chromium to stay passive, and in "
      + "an acid it corrodes along the boundaries while the grains survive: "
      + "SENSITISATION, also called weld decay.  Two remedies, both by "
      + "composition: the L GRADES (304L, UNS S30403, and 316L, UNS S31603) "
      + "hold carbon below 0.03 per cent so there is too little to form the "
      + "carbides, and the STABILISED grades (321 and 347) add titanium or "
      + "niobium, which take the carbon first.  Passivity itself can fail "
      + "in other ways, and knowing them is knowing stainless: it needs "
      + "oxygen to heal, so in a REDUCING acid or a stagnant crevice "
      + "starved of oxygen the film is not repaired; and chloride ions "
      + "break it down locally, so the attack concentrates in a pit or a "
      + "crack instead of spreading evenly.  A stainless steel either "
      + "barely corrodes or fails in one spot, and the second is the more "
      + "dangerous because a wall thickness measurement cannot see it.",
  },

  // ---- Part 4: how to choose ----------------------------------------------
  {
    n: 14,
    title: "Corrosion rate, corrosion allowance and the wall",
    body: "Where a metal corrodes evenly, the design pays for the loss in "
      + "advance.  A corrosion rate -- millimetres per year, from coupon "
      + "tests in the process fluid, plant experience or the published "
      + "corrosion data surveys (where those binding numbers live; none is "
      + "copied here) -- times the design life is the CORROSION ALLOWANCE, "
      + "and it is added to the thickness that the pressure demands.  The "
      + "thickness that the pressure demands follows from one force balance, "
      + "and this is the formula the engine runs on every vessel it sizes "
      + "(src/postProcessing/sizing/VesselMechanics.cpp:33-34).  Two "
      + "consequences are worth seeing in it.  The allowance is added, not "
      + "multiplied: on a low-pressure vessel it can be most of the wall.  "
      + "And the material enters through S alone: a material with half the "
      + "allowable stress needs about twice the pressure wall.  An allowance "
      + "only works for EVEN corrosion; pitting, cracking and intergranular "
      + "attack (steps 13 and 15) are not paid for by extra metal and must "
      + "be avoided by the choice of material.",
    formula: String.raw`c_\mathrm{a} = r\, t_\mathrm{life}, \qquad t = \frac{P\, D}{2\, S\, E - 1.2\, P} + c_\mathrm{a}`,
    where: [
      { sym: "c_\\mathrm{a}", means: "the corrosion allowance: metal added "
        + "to be eaten (the engine's corrosionAllow; 3 mm when a case "
        + "declares none, announced)", unit: "m" },
      { sym: "r", means: "the uniform corrosion rate in the service", unit: "m/yr" },
      { sym: "t_\\mathrm{life}", means: "the design life", unit: "yr" },
      { sym: "t", means: "the shell wall thickness", unit: "m" },
      { sym: "P", means: "the design pressure, gauge (the case's "
        + "pressureDesign)", unit: "Pa" },
      { sym: "D", means: "the shell diameter", unit: "m" },
      { sym: "S", means: "the allowable stress of the material at the design "
        + "temperature, which a pressure code derives from the yield and "
        + "tensile strengths at that temperature with its own factors.  In "
        + "Choupo it is the record's sigma_y, ONE number at every temperature "
        + "and, despite the symbol, not a yield strength (step 22)",
        unit: "Pa" },
      { sym: "E", means: "the joint efficiency of the welds (1 for a fully "
        + "radiographed joint; the engine's jointEfficiency)", unit: "-" },
      { sym: "\\sigma_\\theta", means: "the hoop (circumferential) stress in "
        + "the wall", unit: "Pa" },
      { sym: "L", means: "a length of shell, which cancels", unit: "m" },
    ],
    derivation: [
      { step: "Cut a length L of shell along its axis and balance the forces "
        + "on one half: the pressure acting on the projected area D L against "
        + "the hoop stress in the two cut walls.",
        eq: String.raw`2\, \sigma_\theta\, t\, L = P\, D\, L \;\Rightarrow\; \sigma_\theta = \frac{P\, D}{2\, t}` },
      { step: "Let the hoop stress reach the allowable stress, reduced by the "
        + "efficiency of the longitudinal weld, and solve for the thickness.",
        eq: String.raw`t = \frac{P\, D}{2\, S\, E}` },
      { step: "The pressure-vessel code keeps the inside diameter and adds a "
        + "term that corrects the thin-wall assumption; with D the inside "
        + "diameter it reads as the engine writes it.",
        eq: String.raw`t = \frac{P\, D}{2\, S\, E - 1.2\, P}` },
      { step: "Then pay for the corrosion in advance.",
        eq: String.raw`t = \frac{P\, D}{2\, S\, E - 1.2\, P} + r\, t_\mathrm{life}` },
    ],
    note: "In this implementation the wall is a TEACHING ESTIMATE: S does not "
      + "fall with temperature, so a wall computed for a hot or a cold "
      + "vessel is the formula's response to the record, not a mechanical "
      + "design at its service temperature.  "
      + "A rate of 0.1 mm per year over 20 years is an allowance of 2 mm.  "
      + "The 3 mm the engine assumes when a case is silent "
      + "(src/postProcessing/sizing/DesignDefaults.cpp:46) is announced on "
      + "every run that uses it and listed on the design sheet as assumed.",
  },
  {
    n: 15,
    title: "The temperature window, and the mechanisms that crack",
    body: "Every material has a temperature WINDOW.  Its lower edge is "
      + "toughness (step 10); its upper edge is strength and creep (step "
      + "11), scaling in air, and attack by hot gases.  Within the window "
      + "the mechanisms that cause sudden failures in chemical plants are "
      + "not the even corrosion an allowance pays for, but a few localised "
      + "ones.  CHLORIDE STRESS-CORROSION CRACKING of austenitic stainless "
      + "needs three things at once -- tensile stress (residual from welding "
      + "is enough), chlorides, and a temperature above roughly 60 degrees "
      + "C -- and then cracks a wall through in months; it is classically "
      + "found under wet insulation, where rainwater leaches chlorides onto "
      + "hot pipe.  The remedies are a duplex or a nickel alloy, or keeping "
      + "one of the three away.  PITTING AND CREVICE CORROSION are the "
      + "local breakdown of passivity of step 13, ranked by the PREN of "
      + "step 3.  HYDROGEN EMBRITTLEMENT: atomic hydrogen, made at a "
      + "corroding surface -- above all in wet hydrogen sulphide -- enters a "
      + "high-strength steel and makes it crack under stress at room "
      + "temperature; sour-service standards limit the hardness of steels "
      + "and welds for that reason (ISO 15156 / NACE MR0175, named and not "
      + "read).",
  },
  {
    n: 16,
    title: "High temperature hydrogen attack",
    body: "Hot hydrogen at high pressure does something different, and it "
      + "matters to every ammonia, methanol, hydrotreating and refinery "
      + "plant.  Hydrogen diffuses into carbon steel and reacts with the "
      + "carbide of step 9 to make methane.  Methane molecules are too large "
      + "to diffuse out; they collect at grain boundaries as bubbles under "
      + "high pressure, link into fissures, and leave behind a steel stripped "
      + "of carbon and weakened -- HIGH TEMPERATURE HYDROGEN ATTACK (HTHA).  "
      + "It gives no warning a thickness gauge can read.  Alloying with "
      + "chromium and molybdenum forms carbides that hydrogen cannot reduce, "
      + "which is why Cr-Mo steels and stainless are used in hot hydrogen.  "
      + "The industry's operating limits for each steel, curves of hydrogen "
      + "partial pressure against temperature, are published in API RP 941; "
      + "Choupo does not transcribe them and this page shows none.  On 2 "
      + "April 2010 a nearly forty-year-old heat exchanger failed at the "
      + "Tesoro refinery in Anacortes, Washington, killing seven employees, "
      + "and the US Chemical Safety Board attributed the failure to HTHA.  "
      + "The green-ammonia base case says plainly that its records carry no "
      + "hydrogen-service limit and that whether carbon steel resists "
      + "hydrogen at its partial pressures and temperatures is NOT checked "
      + "(tutorials/plant/greenAmmoniaPEQ_baseCase/system/postDict:183-187).",
    formula: String.raw`\ce{Fe3C + 2H2 -> 3Fe + CH4}`,
  },
  {
    n: 17,
    title: "Ammonia stress-corrosion cracking of carbon steel",
    body: "The ammonia projects meet one more mechanism.  Carbon and "
      + "low-alloy steels in liquid anhydrous ammonia -- storage spheres, "
      + "transport tanks, the agricultural nurse tanks where the problem "
      + "was first seen -- crack under stress.  Loginow's recapitulation of "
      + "three decades of field and laboratory experience (read for this "
      + "page; Materials Performance, 1986) identifies AIR as the primary "
      + "cause: even a few parts per million of oxygen in the ammonia is "
      + "enough.  WATER inhibits it: the 1962 recommendation of Loginow and "
      + "Phelps was that ammonia should carry at least 0.2 per cent water, "
      + "and the article stresses that the water must be present all the "
      + "time, because ammonia that condenses on cool steel in the vapour "
      + "space carries less water and more oxygen than the liquid.  The "
      + "cracks concentrate in as-welded heat-affected zones and repair "
      + "welds; susceptibility rises with stress and with the strength of "
      + "the steel.  So the classic mitigations are the ones this page has "
      + "already built: exclude air (purge new vessels, discharge "
      + "non-condensables), keep the water in, POST-WELD HEAT TREAT after "
      + "any welding (step 12), prefer lower-strength steels, and inspect "
      + "periodically -- wet fluorescent magnetic-particle testing is the "
      + "method the article names as most sensitive.  Choupo's records hold "
      + "none of this: a record has no field for a water content or an "
      + "oxygen limit, and it is the designer's question, not the "
      + "simulator's.",
  },
  {
    n: 18,
    title: "Cost: the material factor, and what it multiplies",
    body: "A material is finally chosen against its price, and in a "
      + "bare-module estimate the material enters as one factor on part of "
      + "the purchased cost (src/postProcessing/costing/Turton.cpp:719-721).  "
      + "Two things in the form are easy to miss.  F_M multiplies only the "
      + "B_2 part: the installation that B_1 stands for -- foundations, "
      + "piping, instruments, labour -- costs the same whatever the shell is "
      + "made of.  And the material enters TWICE: through F_M, and through "
      + "the pressure factor, which for a vessel is the engine's own wall "
      + "formula over a reference thickness (Turton.cpp:323-328), so a "
      + "weaker material raises F_P as well.  The cheapest material is the "
      + "one whose total cost over the plant's life is lowest, which can be "
      + "a dearer alloy installed once rather than carbon steel replaced "
      + "twice; the engine prices what is bought, not what is replaced.",
    formula: String.raw`C_\mathrm{BM} = C_p\,(B_1 + B_2\, F_M\, F_P), \qquad F_P = \max\!\left(\frac{t_P + 0.00315}{0.0063},\; 1\right), \qquad t_P = \frac{P_\mathrm{g}\, D}{2\,(S - 0.6\, P_\mathrm{g})}`,
    where: [
      { sym: "C_\\mathrm{BM}", means: "the bare-module cost of the item",
        unit: "EUR" },
      { sym: "C_p", means: "the purchased cost of the item in carbon steel "
        + "at ambient pressure, from the size correlation", unit: "EUR" },
      { sym: "B_1", means: "the bare-module constant that does not scale "
        + "with material or pressure", unit: "-" },
      { sym: "B_2", means: "the bare-module constant that does", unit: "-" },
      { sym: "F_M", means: "the material factor, read from the material "
        + "record (carbon steel = 1)", unit: "-" },
      { sym: "F_P", means: "the pressure factor", unit: "-" },
      { sym: "t_P", means: "the wall the pressure factor computes, without "
        + "corrosion allowance or joint efficiency", unit: "m" },
      { sym: "P_\\mathrm{g}", means: "the gauge pressure the costing uses: "
        + "the case's pressureDesign, read as gauge (Turton.cpp:667)",
        unit: "bar" },
    ],
    note: "0.00315 m and 0.0063 m are the reference corrosion allowance and "
      + "the reference minimum thickness of the textbook correlation, as "
      + "the engine writes them at Turton.cpp:328; S and P_g are in the same "
      + "unit there (bar).  The wall on the design sheet and the wall inside "
      + "F_P are different numbers on purpose: one is the shell the case "
      + "declared, the other the correlation's own reference.",
  },

  // ---- Part 5: seals and gaskets ------------------------------------------
  {
    n: 19,
    title: "Where a plant actually leaks: joints and shafts",
    body: "A welded wall rarely leaks.  A plant leaks at its JOINTS -- "
      + "every flange, every valve stem, every pump shaft -- because there "
      + "two parts that can move against each other must be made to seal.  "
      + "A GASKET is a softer element squeezed between two flanges by the "
      + "bolts: it must flow into the roughness of the flange faces, stay "
      + "tight as the flanges rotate under pressure and as the joint heats "
      + "and cools, and not creep away from the bolt load over the years.  "
      + "The common families: compressed fibre sheet for utilities; PTFE "
      + "sheet, filled or expanded to resist the cold flow of plain PTFE, "
      + "where chemical resistance matters; FLEXIBLE GRAPHITE for high "
      + "temperature and broad chemical resistance (it oxidises in hot air, "
      + "so it is often protected inside a metal construction); "
      + "SPIRAL-WOUND gaskets -- a V-shaped metal strip wound with a "
      + "graphite or PTFE filler, held by inner and outer rings -- the "
      + "standard for process flanges at higher pressures and temperatures; "
      + "and solid METAL RING-TYPE JOINTS, seated in machined grooves, for "
      + "the highest pressures.  A gasket is chosen by the fluid, the "
      + "temperature, the pressure class and the flange facing together, "
      + "and its metal parts must suit the fluid just as the vessel's do.",
  },
  {
    n: 20,
    title: "Packing and the mechanical seal",
    body: "A shaft that turns or a stem that moves cannot be gasketed.  The "
      + "oldest answer is PACKING: rings of braided graphite or PTFE yarn "
      + "compressed around the shaft by a gland.  On a pump shaft packing "
      + "must leak a little to stay cool and lubricated, which is "
      + "acceptable for water and not for a hydrocarbon or a toxic.  The "
      + "MECHANICAL SEAL replaced it in process pumps: two flat, lapped "
      + "rings, one turning with the shaft and one fixed in the housing, "
      + "pressed together by springs and by the fluid's own pressure, "
      + "running on a liquid film about a micrometre thick.  The faces are "
      + "a pair: commonly a hard silicon carbide against a softer "
      + "carbon-graphite, which forgives a brief dry run; or silicon carbide "
      + "or tungsten carbide against itself where the fluid carries "
      + "abrasive solids.  Small elastomer or PTFE rings seal the faces to "
      + "the shaft and the housing (the SECONDARY seals of step 21).  The "
      + "ARRANGEMENT follows from the hazard.  A SINGLE seal for benign "
      + "fluids.  A DUAL seal for hazardous ones: in the PRESSURISED form "
      + "(often called double) a clean barrier fluid between two seals is "
      + "held above the process pressure, so any leak is barrier fluid "
      + "going into the process and nothing goes out; in the UNPRESSURISED "
      + "form (often called tandem) a buffer fluid at low pressure sits "
      + "between them and the outer seal is a backup that catches what the "
      + "inner one lets by.  Around the seal, auxiliary piping cools and "
      + "cleans it: a flush from the pump's own discharge or from a clean "
      + "external source, a quench of steam or water on the atmospheric "
      + "side, a barrier or buffer system.  These arrangements are numbered "
      + "as plans in API 682 (named, not read).  Where no leak at all is "
      + "acceptable, the seal is removed altogether: a magnetic-drive or a "
      + "canned-motor pump has no shaft passing through the casing.",
  },
  {
    n: 21,
    title: "Elastomers and chemical compatibility",
    body: "The secondary seals of a mechanical seal, the O-rings of valves "
      + "and the linings of hoses are ELASTOMERS, and each family resists "
      + "some fluids and is destroyed by others.  NBR (nitrile) resists "
      + "mineral oils and many hydrocarbons and is cheap, but ages in ozone "
      + "and swells in ketones.  EPDM (ethylene-propylene) resists water, "
      + "steam, alkalis and ketones, and swells badly in hydrocarbon oils.  "
      + "FKM (fluorocarbon) resists hydrocarbons and many acids up to about "
      + "200 degrees C, but standard grades are attacked by amines, by "
      + "ammonia and by ketones.  FFKM (perfluoroelastomer) resists almost "
      + "everything, at many times the price.  COMPATIBILITY is therefore a "
      + "property of the PAIR -- this elastomer in this fluid at this "
      + "temperature and concentration -- and it is read from the "
      + "manufacturers' compatibility charts and confirmed by immersion "
      + "tests, never assumed from the family name; none of those charts "
      + "is reproduced here.  One more mechanism belongs to high-pressure "
      + "gas service such as the ammonia loop: gas dissolves in the "
      + "elastomer at pressure and, when the pressure falls quickly, comes "
      + "out faster than it can diffuse away and blisters or splits the "
      + "ring from inside (rapid gas decompression), so such services "
      + "specify grades rated for it.",
  },

  // ---- Part 6: what Choupo does with a material --------------------------
  {
    n: 22,
    title: "What Choupo does with a material",
    body: "A case names a material per sized item, as one word in its "
      + "system/postDict -- `material SS316;` -- and the engine reads that "
      + "record from data/standards/assets/ (only records declaring `kind "
      + "constructionMaterial`).  Each field has a reader, and some have "
      + "none.  The record's sigma_y is used as the ALLOWABLE stress S of "
      + "step 14 (src/postProcessing/sizing/VesselMechanics.cpp:30), "
      + "although its name says yield strength: the header of the material "
      + "type calls it the allowable stress (src/materials/Material.H:55), "
      + "and carbonSteel's 140 MPa is labelled as an allowable at 250 degrees "
      + "C.  The density gives the shell's weight, which the design sheet "
      + "publishes; the vessel's cost correlation, though, is sized on its "
      + "VOLUME (the size key V_R, src/postProcessing/costing/Turton.cpp:80), "
      + "so the weight -- and the density with it -- moves no euro.  F_M "
      + "multiplies the cost "
      + "(src/postProcessing/costing/Turton.cpp:719-721), and sigma_y "
      + "enters the cost again through F_P.  maxP is compared with the "
      + "design pressure by the vessel sizers "
      + "(src/postProcessing/sizing/MaterialLimits.cpp:41), and maxT, read "
      + "by the loader (src/materials/MaterialRegistry.cpp:58), with the "
      + "hottest stream on each sized item's ports "
      + "(src/postProcessing/sizing/MaterialLimits.cpp:56-57) -- Choupo has "
      + "no design temperature, so that is a lower bound on what the metal "
      + "sees.  Both WARN and go on: nothing is refused, and no wall changes, "
      + "because a record holds ONE allowable stress for every temperature.  "
      + "A careful case applies the temperature rule itself: the "
      + "green-ammonia base case puts SS316 wherever the process side "
      + "exceeds the carbon-steel record's maxT "
      + "(tutorials/plant/greenAmmoniaPEQ_baseCase/system/postDict:179-180) "
      + "-- the author's rule, which the engine now checks and announces "
      + "when broken, and does not choose for anyone.  "
      + "And no record carries "
      + "a corrosion rate, a minimum design temperature, a hydrogen-service "
      + "limit or a compatibility with any fluid.  What is sourced is said "
      + "by each record: carbonSteel's own header calls its six numbers "
      + "UNSOURCED design assertions (AP6, 2026-08-05); SS304's and SS316's "
      + "F_M cite Turton's Appendix A and the rest of their numbers say "
      + "primary re-citation pending; aluminium's F_M is of the same "
      + "lineage and pending re-citation too.  So the engine does with a "
      + "material exactly two things -- it sizes the wall and it prices the "
      + "metal -- and the choosing, which is everything else on this page, "
      + "stays the engineer's.",
    formula: String.raw`m = \rho\, \pi\, D\, H\, t`,
    where: [
      { sym: "m", means: "the mass of the cylindrical shell, without heads "
        + "(the engine's weight)", unit: "kg" },
      { sym: "\\pi", means: "the circle constant", unit: "-" },
      { sym: "\\rho", means: "the density from the material record",
        unit: "kg/m3" },
      { sym: "H", means: "the shell height (the engine's H = (L/D) D)",
        unit: "m" },
    ],
    note: "The weight is VesselMechanics.cpp:35 exactly: the cylinder alone, "
      + "no heads, no nozzles.",
  },
  {
    n: 23,
    title: "On the bench: one vessel, every material the records carry",
    body: "The bench below re-runs a case of the corpus in your browser, "
      + "ammoniaReactor03_equilibriumApproach -- an ammonia synthesis loop "
      + "at 200 bar whose postDict sizes three vessels -- with ONE vessel's "
      + "material word changed, once for each construction-material record "
      + "in the tree.  Everything in its table is what the engine published "
      + "for that vessel: the wall, the weight, F_M, F_P and the cost, with "
      + "every warning it raised, verbatim.  Things to look for.  SS304 "
      + "and SS316 give the SAME wall, because both records declare the same "
      + "sigma_y; only the price differs, through F_M.  Aluminium needs a "
      + "thicker wall, because its allowable stress is lower, yet the "
      + "shell weighs less, because its density is about a third of "
      + "steel's -- and the weight changes no price, because a vessel is "
      + "costed on its volume.  At 220 bar every record's maxP is exceeded "
      + "and the engine says so -- and prices the vessel anyway, aluminium "
      + "included, at a wall more than a quarter of a metre thick that no "
      + "one would build; that the price comes out below SS316's is the "
      + "correlation extrapolated, not a recommendation.  Carbon steel is "
      + "the cheapest choice on every vessel, which is step 2 in numbers.  "
      + "And put aluminium "
      + "on the 700 K catalyst vessel: its record declares a maxT of 500 K, "
      + "and the engine says so in a second warning -- and then sizes and "
      + "prices the vessel on the same allowable stress it would use at room "
      + "temperature.  A warning is not a design: that is the lesson of "
      + "step 22, made visible.",
  },
];

export const MATERIALS_LIMITS: readonly LessonLimit[] = [
  { id: "no-corrosion",
    title: "No corrosion model",
    body: "The engine never computes a corrosion rate.  The allowance is a "
      + "number the case declares (or the announced 3 mm default), and "
      + "localised mechanisms -- pitting, cracking, hydrogen attack -- are "
      + "not represented at all." },
  { id: "one-stress",
    title: "One allowable stress for every temperature",
    body: "A record holds a single sigma_y, used as the allowable stress.  "
      + "Every wall on the bench and on a design sheet is therefore a "
      + "teaching estimate: it is not a mechanical design wherever the "
      + "service temperature differs from the one that stress belongs to.  "
      + "Real allowable stresses fall "
      + "with temperature and, in the creep range, with design life; the "
      + "engine sizes a 700 K vessel on the same stress as a 300 K one.  "
      + "maxT is compared with the hottest port and announced, never applied "
      + "to the stress, and no minimum design temperature exists in any "
      + "record." },
  { id: "one-factor",
    title: "One material factor for every kind of item",
    body: "The record carries one F_M, used for whatever item names it.  "
      + "The textbook the factors come from tabulates them by kind of "
      + "equipment and by solid versus clad construction; the records have "
      + "no field for either, and clad plate cannot be declared." },
  { id: "gauge-margin",
    title: "One pressure, read as gauge, and how a case must write it",
    body: "The wall and the pressure factor both read the case's "
      + "pressureDesign as a GAUGE pressure "
      + "(src/postProcessing/sizing/VesselMechanics.H:58-60, "
      + "VesselMechanics.cpp:29 and src/postProcessing/costing/"
      + "Turton.cpp:661-667).  The plant cases that once derived it as 1.1 "
      + "times an ABSOLUTE stream pressure -- one bar of their margin the "
      + "atmosphere -- derive it on the GAUGE operating pressure by the "
      + "Design Guide's preliminary rule since the C150 review; a case you "
      + "write must do the same.  And the exchanger pressure factor is a polynomial its "
      + "source states up to 140 bar g; an ammonia loop's exchangers sit "
      + "above that, and the engine evaluates it there and says so on the "
      + "costing line, F_P EXTRAPOLATED (src/postProcessing/costing/"
      + "Turton.cpp:706-715) -- a cost outside its correlation, not refused." },
  { id: "four-records",
    title: "Four records, most of them unsourced",
    body: "Only carbon steel, SS304, SS316 and aluminium are in the tree; no "
      + "duplex, nickel alloy, titanium, copper alloy or non-metallic has a "
      + "record, so the families of Part 2 beyond these cannot be costed.  "
      + "carbonSteel's numbers are unsourced design assertions by its own "
      + "header, and only two F_M values cite a source." },
  { id: "no-seals",
    title: "No seals, gaskets or elastomers",
    body: "Nothing in the engine models a flange, a gasket, a packing or a "
      + "mechanical seal, and no record says which elastomer suits which "
      + "fluid.  Part 5 is description, with nothing run behind it." },
];

/** The rows of the Pareto table drawn beside step 7.  A TEACHING ORDERING
 *  (the page says so): no row carries a number. */
export interface ParetoRow { family: string; firstFor: string; defeatedBy: string }

export const PARETO_ROWS: readonly ParetoRow[] = [
  { family: "carbon steel",
    firstFor: "the default: cheap, strong, weldable, available in every form",
    defeatedBy: "corrosion in water and acids, cold (brittleness), heat "
      + "(creep), hot hydrogen" },
  { family: "austenitic stainless (304/304L, 316/316L)",
    firstFor: "corrosion carbon steel cannot stand, product purity, the cold",
    defeatedBy: "chlorides (pitting, stress-corrosion cracking), reducing "
      + "acids, sensitisation" },
  { family: "duplex stainless",
    firstFor: "chlorides with strength: thinner walls, resistance to cracking",
    defeatedBy: "a narrower temperature window, demanding welding" },
  { family: "nickel alloys",
    firstFor: "hot chlorides, reducing acids, hydrofluoric acid",
    defeatedBy: "price" },
  { family: "titanium",
    firstFor: "seawater, oxidising chloride solutions, wet chlorine",
    defeatedBy: "reducing acids; it can ignite in dry chlorine" },
  { family: "copper alloys",
    firstFor: "cooling-water and condenser tubes",
    defeatedBy: "ammonia (stress-corrosion cracking)" },
  { family: "aluminium (and nickel steels, austenitics)",
    firstFor: "cryogenic service",
    defeatedBy: "heat, alkalis, mercury" },
  { family: "linings and non-metallics (PTFE/PFA, glass, FRP, graphite)",
    firstFor: "fluids no affordable metal resists",
    defeatedBy: "temperature, vacuum, thermal and mechanical shock" },
  { family: "refractories",
    firstFor: "keeping a steel shell cool in furnaces and hot reactors",
    defeatedBy: "spalling, erosion; they carry no pressure" },
];
