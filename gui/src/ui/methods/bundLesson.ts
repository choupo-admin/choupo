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
  Secondary containment -- designing a bund -- as LESSON TEXT (commission
  C136, Vitor 2026-10-21, for Saturday: "Regista isto para fazer no Sabado
  porque e muito importante").  His message is the specification; DEV.md 4c
  C136 is its index, items (1)-(11), and the steps below follow it.

  WHAT WAS READ AND WHAT WAS NOT, said once here and again on the page, in
  BUND_SOURCES.  Two documents were READ for this page: the Control of
  Pollution (Oil Storage) (England) Regulations 2001 as made (regulations 2
  and 3, on legislation.gov.uk) and HSE's HSG176, Storage of flammable
  liquids in tanks, second edition 2015 (paragraphs 87, 154-169 and 222, and
  its reference 15).  CIRIA C736, the EU major-accident directive, the EU
  reference document on emissions from storage and the Portuguese decree are
  cited by TITLE, each saying it was not read and that no number on the page
  comes from it.  No compatibility table, no rainfall, no fire-water volume
  and no code clause is invented: every such number on the page is the
  page's own assumption and says so.

  NOTHING IS QUOTED.  No sentence of any source is reproduced in quotation
  marks; the regulation and the guidance are paraphrased with their
  paragraph numbers, and the test refuses a quotation mark in a step, a
  limit or a source.  The one verbatim sentence is Vitor's closing
  reflection (bund.ts, CLOSING_REFLECTION), drawn apart from the steps.

  EVERY ENGINE CLAIM carries the file and line it was READ at
  (BundArithmetic.H, PlantLayout.cpp), and every page computation the line
  of bund.ts it is COMPUTED at; the test holds each citation to the line it
  names.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** A source, with what kind of authority it is -- a LEGAL requirement, a
 *  GUIDANCE document, or an EXAMPLE of practice -- what was taken from it,
 *  and how it was reached.  Item (9) of the commission: the three are told
 *  apart. */
export interface BundSource {
  id: string;
  kind: "legal requirement" | "guidance" | "example";
  cite: string;
  used: string;
}

export const BUND_SOURCES: readonly BundSource[] = [
  { id: "uk-oil-2001", kind: "legal requirement",
    cite: "The Control of Pollution (Oil Storage) (England) Regulations 2001, "
      + "SI 2001/2954",
    used: "READ (UK legislation, the text as made, on legislation.gov.uk; the "
      + "revised text was not compared): regulation 3(2)(a), secondary "
      + "containment of at least 110 % of a single container's capacity, or, "
      + "for several, the greater of 110 % of the largest and 25 % of the "
      + "aggregate; 3(2)(c), a base and walls impermeable to water and oil; "
      + "3(2)(d), no valve, pipe or opening for draining through them; "
      + "3(2)(e), a fill or draw-off pipe through them adequately sealed; "
      + "3(5), drip trays for drums; and regulation 2, its scope -- England, "
      + "oil, and NOT containers of 200 litres or less, containers in a "
      + "building or wholly underground, small domestic stores, premises "
      + "refining oil or distributing it onward, or oil used on a farm." },
  { id: "hse-hsg176", kind: "guidance",
    cite: "Health and Safety Executive, Storage of flammable liquids in tanks, "
      + "HSG176, second edition (HSE Books, 2015)",
    used: "READ (Crown copyright; paraphrased, nothing quoted): paragraph 155 "
      + "(bunds for flammable liquids with a flashpoint of 60 °C or below), 156 "
      + "(the purposes of a bund), 157 (110 % of the largest vessel or 25 % of "
      + "the total, the greater normally the minimum, the space the OTHER "
      + "tanks occupy taken into account), 158 (a smaller bund where the "
      + "liquid is led to a separate impounding basin), 159 (individual "
      + "bunds preferred; intermediate walls), 160 (wall strength; a 225 mm "
      + "brick or block wall over 600 mm high likely to collapse; a means of "
      + "escape), 161 (1 m between tank and wall up to 100 m3, 2 m above), "
      + "162 (the compromise between pool area and wall height), 163-164 "
      + "(liquid tight; penetrations; concrete or other fire-resistant "
      + "material impervious to the liquid stored), 165-167 (surface water; "
      + "a floor sloped away from the tank; a drain left open destroys the "
      + "bund's integrity; the valve closed and preferably locked), 168-169 "
      + "(nothing stored in a bund; vehicles), 87 (flotation) and 222 "
      + "(regular inspection).  Its own back page says following it is not "
      + "compulsory unless specifically stated.  Its reference 15 gives "
      + "CIRIA C736's title." },
  { id: "ciria-c736", kind: "guidance",
    cite: "CIRIA C736, Containment systems for the prevention of pollution: "
      + "secondary, tertiary and other measures for industrial and commercial "
      + "premises (CIRIA, London)",
    used: "NOT READ.  Cited by title, as HSG176 cites it (its reference 15); "
      + "its year, 2014, and its classification of containment are given by "
      + "summaries found while preparing the page, not by a copy read.  No "
      + "number, method or class on this page comes from it." },
  { id: "eu-seveso-iii", kind: "legal requirement",
    cite: "Directive 2012/18/EU of the European Parliament and of the Council "
      + "of 4 July 2012 on the control of major-accident hazards involving "
      + "dangerous substances",
    used: "NOT READ for this page.  Cited for the frame it sets -- the "
      + "prevention of major accidents and the limitation of their "
      + "consequences -- and nothing else: no capacity, height or distance on "
      + "this page is attributed to it." },
  { id: "eu-bref-storage", kind: "guidance",
    cite: "European Commission, European IPPC Bureau, Reference Document on "
      + "Best Available Techniques on Emissions from Storage (July 2006)",
    used: "NOT READ.  Cited by title as the EU's reference on storage "
      + "techniques; nothing on this page comes from it." },
  { id: "pt-dl-150-2015", kind: "legal requirement",
    cite: "Decreto-Lei n.º 150/2015, de 5 de agosto, Diário da República "
      + "n.º 151, Série I (Portugal)",
    used: "NOT READ.  Identified, through secondary sources, as the Portuguese "
      + "transposition of Directive 2012/18/EU; cited for that and nothing "
      + "else.  The page identified no Portuguese rule on the capacity of a "
      + "bund that it could verify, and so states none." },
  { id: "choupo-witnesses", kind: "example",
    cite: "Choupo tutorials: plant/greenAmmoniaPEQ_baseCase and "
      + "plant/ammonia02_full_plant, system/layoutDict",
    used: "A bund round two refrigerated tanks (a 1.1 margin over the "
      + "largest, plus 100 mm of rain) and two impounding areas leading to "
      + "remote pits, each rule declared in the case's own words as an "
      + "author-set assumption, not a transcription of any code.  The "
      + "green-ammonia bund's published volumes are reproduced by this "
      + "page's arithmetic in the gate that holds the two together." },
];

/** The page's one-line statement of what the 110 % / 25 % rule is here. */
export const RULE_IS_AN_EXAMPLE = "The 110 % / 25 % rule is a teaching example: "
  + "a figure from guidance on flammable liquids in tanks and from a "
  + "regulation on oil stores in England, each with its own scope.  It is "
  + "not a universal obligation; the rule that binds a real bund is the one "
  + "its country, its product and its permit set.";

const ENGINE = "src/postProcessing/layout/BundArithmetic.H";

export const BUND_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A barrier that needs no power, no instrument and no operator",
    body: "A chemical plant must be designed not only to work correctly but "
      + "also to limit the consequences when something goes wrong.  The tank "
      + "and its pipes are the PRIMARY containment: they hold the liquid as "
      + "long as nothing fails.  A bund is the SECONDARY containment: an "
      + "impermeable floor and a wall round the tank, which hold the liquid "
      + "where it falls when the primary fails.  A further measure beyond it "
      + "-- a sealed site drainage system, a lagoon -- is sometimes called "
      + "tertiary.  A bund is PASSIVE: it needs no power, no instrument and "
      + "no operator to act at the moment of the spill, which is exactly the "
      + "moment the power, the instruments and the operators may be "
      + "occupied or gone.  HSG176 (paragraph 156) lists what it is for: to "
      + "keep a flammable liquid or its vapour from ignition sources and out "
      + "of the drains, to let the spill be recovered under control, to "
      + "limit the surface of the liquid and so the size of a fire, to stop "
      + "a burning liquid spreading to other plant and people, to hold the "
      + "water used to fight a fire or cool a tank, and to keep land and "
      + "water courses clean.",
  },
  {
    n: 2,
    title: "Where the bund stands among the layers of protection",
    body: "Five kinds of measure stand between a hazard and its consequence. "
      + "PREVENTION stops the initiating event (a sound tank, overfill "
      + "protection, a maintained valve).  DETECTION sees it (a level alarm, "
      + "a leak detector, a round).  ISOLATION stops it growing (a shut-off "
      + "valve, a pump trip).  SECONDARY CONTAINMENT holds what has already "
      + "escaped.  MITIGATION limits what follows (fire-fighting, emergency "
      + "response).  A bund does NOT prevent the initiating event: the tank "
      + "has already failed when the bund begins to work.  What it does is "
      + "stop, or limit, the propagation -- the spill reaching a drain, a "
      + "river, an ignition source or the next tank.  That is why a bund is "
      + "never a reason to neglect the layers before it, and why the layers "
      + "after it assume it holds.",
    leadsTo: {
      tool: "process-safety",
      toolLabel: "Process safety",
      stepTitle: "Bhopal, 1984: the layers that existed on paper",
      body: "A layer that exists on the drawing and not in the plant protects "
        + "nobody: a bund with its drain left open is exactly that.  The "
        + "process-safety page tells the case where every layer was on paper.",
    },
  },
  {
    n: 3,
    title: "Every cubic metre goes somewhere: the balance",
    body: "When a tank fails, its liquid does not disappear: at every instant "
      + "it is still in the tank, standing in the bund, gone over the wall, "
      + "or gone through the drain.  Rain that fell into the bund before the "
      + "spill is in the same pool.  The page integrates the four scenarios "
      + "of Part 5 with this balance as its bookkeeping (bund.ts:462 "
      + "(simulate): every transfer is taken from one store and added to "
      + "another in the same line), and prints the largest imbalance it "
      + "found, which is rounding and nothing else.  A design question then "
      + "becomes a precise one: how large can the last two terms be allowed "
      + "to grow -- and the answer a bund is built to give is zero.",
    formula: String.raw`V_\mathrm{tank}(t) + V_\mathrm{bund}(t) + V_\mathrm{over}(t) + V_\mathrm{drain}(t) = V_0 + V_\mathrm{rain}`,
    where: [
      { sym: String.raw`V_\mathrm{tank}`, means: "the liquid still inside the tank that failed", unit: "m3" },
      { sym: String.raw`V_\mathrm{bund}`, means: "the liquid standing in the bund, the spill and the rain", unit: "m3" },
      { sym: String.raw`V_\mathrm{over}`, means: "the liquid that has left over the wall", unit: "m3" },
      { sym: String.raw`V_\mathrm{drain}`, means: "the liquid that has left through the drain", unit: "m3" },
      { sym: String.raw`V_0`, means: "the liquid the tank held when it failed", unit: "m3" },
      { sym: String.raw`V_\mathrm{rain}`, means: "the rain standing in the bund when the spill began", unit: "m3" },
      { sym: "t", means: "the time since the failure", unit: "h" },
    ],
  },
  {
    n: 4,
    title: "Geometric capacity: the empty box",
    body: "The GEOMETRIC capacity is the volume of the empty box: the floor "
      + "area times the wall height.  It is the number most easily written "
      + "down and the one most easily mistaken for the answer, because "
      + "nothing in it knows that tanks stand in the box.  A floor is rarely "
      + "flat: it falls towards a low collection point (a sump) so that a "
      + "small spill or the rain runs to one place and not round the tanks "
      + "(HSG176 paragraph 165).  If the wall height is measured at the sump "
      + "and the floor rises away from it, the box holds less than A h by "
      + "half the fall times the area -- the page computes that "
      + "(bund.ts:226 (floorVolume)).  Choupo's layout check takes the floor "
      + "flat and at grade (" + ENGINE + ":96 (grossVolume)), so a sloped "
      + "floor is something the page teaches beyond the engine, and says so "
      + "beside every number it moves.",
    formula: String.raw`V_\mathrm{geo} = A\,h_\mathrm{w}, \qquad V_\mathrm{geo} = A\left(h_\mathrm{w} - \frac{\Delta}{2}\right) \;\text{with a floor that rises }\Delta = s\,L\text{ from the sump}`,
    where: [
      { sym: String.raw`V_\mathrm{geo}`, means: "the geometric capacity, the empty box up to the wall top", unit: "m3" },
      { sym: "A", means: "the floor area inside the wall, L times W", unit: "m2" },
      { sym: String.raw`h_\mathrm{w}`, means: "the wall height, above the floor at its lowest point", unit: "m" },
      { sym: String.raw`\Delta`, means: "the fall of the floor across the bund", unit: "m" },
      { sym: "s", means: "the slope of the floor towards the sump", unit: "m/m" },
      { sym: "L", means: "the length of the bund, along the fall", unit: "m" },
      { sym: "W", means: "the width of the bund, across the fall", unit: "m" },
      { sym: "x", means: "the distance from the sump, along L", unit: "m" },
    ],
    derivation: [
      { step: "With the floor at elevation s x above the sump (x measured from it), the liquid depth over a strip of width W at x, once the far end is wet, is the wall's elevation less the floor's.",
        eq: String.raw`V_\mathrm{geo} = W\int_0^{L}\left(h_\mathrm{w} - s\,x\right)\mathrm{d}x = W L\,h_\mathrm{w} - \frac{W s L^2}{2}` },
      { step: "Writing A for W L and Delta for s L gives the second form; with s = 0 it is the first.",
        eq: String.raw`V_\mathrm{geo} = A\left(h_\mathrm{w} - \frac{\Delta}{2}\right)` },
    ],
  },
  {
    n: 5,
    title: "What the tanks take: the displaced volume",
    body: "Every tank in the bund occupies part of the box below the wall "
      + "top, and a spill cannot be where a tank is.  For a standing "
      + "cylinder the volume is its footprint times the part of its height "
      + "that lies below the level -- all of the wall height if the tank is "
      + "taller than the wall, only its own height if it is shorter (then it "
      + "is submerged, and the liquid above its roof is in the bund).  A tank "
      + "raised on legs or saddles leaves the space beneath it free; one on a "
      + "SOLID plinth does not, and the plinth displaces too.  This is "
      + "exactly the engine's rule, " + ENGINE + ":64 (displacedStanding), "
      + "which also carries a lying cylinder's circular segment ("
      + ENGINE + ":73 (displacedLying)) and a box (" + ENGINE
      + ":88 (displacedBox)); the page's twin is bund.ts:69 "
      + "(displacedStanding) and the gate holds the two to the same "
      + "numbers.  In a Choupo layout a solid plinth must be declared into "
      + "the item's footprint height, because the check counts an item's "
      + "envelope from its declared base up.",
    formula: String.raw`V_{\mathrm{d},i}(h) = \frac{\pi D_i^2}{4}\left[\min\left(h,\ z_i + H_i\right) - \max\left(0,\ z_i\right)\right]`,
    where: [
      { sym: String.raw`V_{\mathrm{d},i}`, means: "the volume tank i occupies between the floor and the level h", unit: "m3" },
      { sym: "h", means: "the level, above the floor", unit: "m" },
      { sym: String.raw`\pi`, means: "the ratio of a circle's circumference to its diameter" },
      { sym: "D_i", means: "the diameter of tank i", unit: "m" },
      { sym: "z_i", means: "the elevation of the bottom of tank i's body above the floor (zero on the floor or on a solid plinth counted in its body)", unit: "m" },
      { sym: "H_i", means: "the height of tank i's body", unit: "m" },
      { sym: "i", means: "an index over the tanks in the bund" },
    ],
  },
  {
    n: 6,
    title: "Net volume and useful capacity: whose footprint counts",
    body: "Subtract every tank's displaced volume at the wall top from the "
      + "geometric capacity and you have the NET volume -- what Choupo's "
      + "layout check publishes (src/postProcessing/layout/PlantLayout.cpp:3199) "
      + "and holds against the case's rule.  But think about the tank that "
      + "fails.  If its shell is torn away, its footprint is free; if it "
      + "leaks through a hole, the liquid inside falls until it stands at the "
      + "level outside, and the two are one pool.  Either way the failing "
      + "tank's own footprint is not displacing anything: only the OTHER "
      + "tanks are.  HSG176 paragraph 157 says the same thing in a design "
      + "rule's words -- take account of the space the other tanks occupy -- "
      + "and the derivation below says why.  The USEFUL capacity is therefore "
      + "the free volume with the other tanks deducted, up to the level the "
      + "design allows (the wall top less a freeboard), less whatever already "
      + "stands in the bund.  The engine's net volume deducts the failing "
      + "tank too: it is on the safe side by that tank's footprint times the "
      + "wall height, and the page prints that difference beside both "
      + "numbers (bund.ts:340 (designCheck)).  GEOMETRIC, NET and USEFUL are "
      + "three different numbers, and only the last answers the question a "
      + "spill asks.",
    formula: String.raw`V_\mathrm{net} = A\,h_\mathrm{w} - \sum_i V_{\mathrm{d},i}\left(h_\mathrm{w}\right), \qquad V_\mathrm{use} = V_\mathrm{free}^{(k)}\left(h_\mathrm{w} - f\right) - V_\mathrm{rain}`,
    where: [
      { sym: String.raw`V_\mathrm{net}`, means: "the net volume: the geometric capacity less every tank's displaced volume at the wall top (the engine's)", unit: "m3" },
      { sym: String.raw`V_\mathrm{use}`, means: "the useful capacity for the failure of tank k", unit: "m3" },
      { sym: String.raw`V_\mathrm{free}`, means: "the free volume of the bund below a level, the superscript (k) meaning tank k's own footprint left free", unit: "m3" },
      { sym: "k", means: "the tank that fails -- for a design check, the largest" },
      { sym: "D_k", means: "the diameter of the tank that fails", unit: "m" },
      { sym: "f", means: "the freeboard: the height under the wall top the design keeps empty", unit: "m" },
    ],
    derivation: [
      { step: "Tank k holds V_0 and fails; its inside and the bund come to one level h. The liquid is in two places: inside k's shell (its footprint times h, the shell standing or not) and outside every tank.",
        eq: String.raw`V_0 = \frac{\pi D_k^2}{4}\,h + \left(A - \sum_i \frac{\pi D_i^2}{4}\right)h` },
      { step: "The first term cancels tank k out of the sum: only the other tanks take room.",
        eq: String.raw`h = \frac{V_0}{A - \sum_{i \ne k} \frac{\pi D_i^2}{4}}` },
    ],
  },
  {
    n: 7,
    title: "Freeboard, rain and fire water",
    body: "A bund in the open collects rain, and rain does not leave by "
      + "itself: until it is pumped out or drained under control, it takes "
      + "capacity the spill will need.  Choupo's layout check counts a "
      + "declared rainfall as a depth over the catch area ("
      + ENGINE + ":109 (depthAllowance)), and the page does the same.  "
      + "The depth is the CASE's: the page's exercise uses 50 mm as a round "
      + "author-set number, never as a design rainfall -- that comes from "
      + "the site's own records and the applicable guidance.  A freeboard "
      + "keeps the top of the wall empty, for the things a static volume "
      + "cannot see: the wave a sudden failure throws at the wall, foam, "
      + "wind.  And a bund round a burning tank receives the water used to "
      + "fight the fire and to cool its neighbours (HSG176 paragraph 156 "
      + "counts holding it among a bund's purposes): the page computes no "
      + "fire-water volume, because that depends on the fire-fighting the "
      + "site plans, which nothing here knows.",
    formula: String.raw`V_\mathrm{rain} = d\,A`,
    where: [
      { sym: "d", means: "the depth of rain the bund must be able to hold", unit: "m" },
    ],
  },
  {
    n: 8,
    title: "The 110 % / 25 % rule: a teaching example, its origin and its limits",
    body: "A rule often met in teaching is to hold the larger of 110 % of the "
      + "largest tank and 25 % of all the tanks together.  Its origin, as far "
      + "as this page could trace it in documents it read: HSE's guidance on "
      + "storing flammable liquids in tanks, HSG176 paragraph 157, gives it "
      + "as what is normally regarded as the minimum, with the space of the "
      + "other tanks taken into account -- and that guidance is not "
      + "compulsory unless it says so; and England's Control of Pollution "
      + "(Oil Storage) Regulations 2001, regulation 3(2)(a), make the same "
      + "two figures LAW for the oil stores they cover, which excludes, among "
      + "others, containers of 200 litres or less, containers in a building, "
      + "and premises that refine oil or distribute it onward (regulation 2). "
      + "Read as arithmetic, the 110 % is a margin over the largest tank, one "
      + "tank being expected to fail rather than all, and the 25 % governs "
      + "only when the total exceeds 4.4 times the largest -- many tanks of "
      + "similar size in one bund.  Neither document is a rule for every country, "
      + "every product or every permit, and this page treats the figures as "
      + "an EXAMPLE.  Choupo ships no rule at all: a layoutDict declares its "
      + "own terms, each a fraction of the largest or of the total, with its "
      + "source (" + ENGINE + ":103 (termVolume), " + ENGINE + ":116 "
      + "(requiredVolume)), and the largest term governs.",
    formula: String.raw`V_\mathrm{req} = \max\left(1.10\,V_\mathrm{max},\ 0.25\sum_i V_i\right) + V_\mathrm{rain}`,
    where: [
      { sym: String.raw`V_\mathrm{req}`, means: "the volume the rule requires the bund to hold", unit: "m3" },
      { sym: String.raw`V_\mathrm{max}`, means: "the volume of the largest tank in the bund", unit: "m3" },
      { sym: "V_i", means: "the volume of tank i (its capacity, or what it holds -- the case says which)", unit: "m3" },
    ],
  },
  {
    n: 9,
    title: "The level a spill reaches, and when it overtops",
    body: "A capacity is one number; a spill has a LEVEL, and the level is "
      + "what decides whether the wall holds.  For a volume in the bund the "
      + "page finds the elevation at which the free volume equals it "
      + "(bund.ts:292 (levelOf), a bisection: the free volume only grows "
      + "with the level).  If the volume is more than the free volume at the "
      + "wall top, the level is the wall top and the rest has gone over it: "
      + "OVERTOPPING.  What overtops is no longer contained -- it is on the "
      + "road, in the drain, at the next tank -- and the balance of step 3 "
      + "keeps it, because it is still somewhere.",
    formula: String.raw`V_\mathrm{free}(e) = V_\mathrm{bund}\ \ (e \le h_\mathrm{w}), \qquad V_\mathrm{over} = V_\mathrm{bund} - V_\mathrm{free}\left(h_\mathrm{w}\right)\ \text{when positive}`,
    where: [
      { sym: "e", means: "the elevation of the pool above the sump", unit: "m" },
    ],
  },
  {
    n: 10,
    title: "Four ways a bund is tested",
    body: "A -- a CATASTROPHIC RUPTURE: the shell fails and its contents are "
      + "in the bund at once; the question is only whether they fit.  The "
      + "static balance cannot see the wave a sudden failure throws at the "
      + "wall, which can carry liquid over a wall the volume says is high "
      + "enough; that is one reason a freeboard exists.  B -- a PROGRESSIVE "
      + "LEAK: a hole at the base lets the liquid out at a flow, constant or "
      + "falling; the leak stops when an operator isolates it or when the "
      + "level inside has fallen to the level outside.  The leak's flow is "
      + "the student's declaration, not a model of the hole.  C -- RAIN "
      + "FIRST: water already standing in the bund when the tank fails, so "
      + "a design adequate on a dry day may not be on a wet one.  D -- THE "
      + "DRAIN LEFT OPEN: the bund is still there and is no longer a barrier; "
      + "the spill leaves by the drain at the rate an opening passes under "
      + "the head of the pool, taken here as an orifice (bund.ts:445 "
      + "(drainFlow)).  HSG176 paragraph 166 says a drain left open destroys "
      + "the bund's integrity and asks for a valve kept closed, preferably "
      + "locked; England's oil regulation 3(2)(d) forbids, for the stores it "
      + "covers, any drainage opening through the base or walls at all -- "
      + "the rain is then pumped over the wall.",
    formula: String.raw`Q_\mathrm{d} = C_\mathrm{d}\,\frac{\pi d_\mathrm{o}^2}{4}\sqrt{2\,g\,e}`,
    where: [
      { sym: String.raw`Q_\mathrm{d}`, means: "the flow out of the open drain", unit: "m3/s" },
      { sym: String.raw`C_\mathrm{d}`, means: "the opening's discharge coefficient, the page's assumption (0.61, a sharp-edged orifice's round number)" },
      { sym: String.raw`d_\mathrm{o}`, means: "the diameter of the drain's opening", unit: "m" },
      { sym: "g", means: "the acceleration of gravity", unit: "m/s2" },
    ],
  },
  {
    n: 11,
    title: "Geometry decides: low and wide, or high and narrow",
    body: "The same volume can be held by a low wall round a large floor or "
      + "a high wall round a small one, and the choice is not neutral "
      + "(HSG176 paragraph 162 calls it a compromise).  A LOW wall spreads the "
      + "spill thin over a large surface -- more evaporation, a larger pool "
      + "to burn -- but leaves the tanks ventilated, reachable for "
      + "fire-fighting and easy to walk out of.  A HIGH wall keeps the pool "
      + "small but loads the wall more (the thrust of the liquid grows as "
      + "the square of its depth, the overturning moment as the cube; "
      + "bund.ts:528 (wallLoad)), turns the bund into a pit that can hold "
      + "vapour heavier than air and is harder to escape from (HSG176 "
      + "paragraph 160 asks for a means of escape, and warns that a 225 mm "
      + "brick or block wall over 600 mm high is likely to collapse under a "
      + "major spill), and keeps fire-fighters further away.  A badly "
      + "conceived bund RAISES some risks: tanks standing in the pool that "
      + "would burn beneath them; a common bund where one spill wets every "
      + "tank (HSG176 paragraph 159 prefers individual bunds, or "
      + "intermediate lower walls); an empty tank in a flooded bund lifted "
      + "by the water (paragraph 87 names flotation); a wall too close to a "
      + "tank for a jet from a high hole to fall inside it (paragraph 161 "
      + "recommends 1 m for tanks up to 100 m3 and 2 m above); a drain "
      + "trusted to be closed.  The table after this step holds one volume "
      + "with three walls.",
    formula: String.raw`F = \frac{\rho\,g\,h_\mathrm{w}^2}{2}, \qquad M = \frac{\rho\,g\,h_\mathrm{w}^3}{6}`,
    where: [
      { sym: "F", means: "the thrust of the liquid on one metre of wall, the bund full", unit: "N/m" },
      { sym: "M", means: "its overturning moment about the wall's foot", unit: "N m/m" },
      { sym: String.raw`\rho`, means: "the density of the stored liquid", unit: "kg/m3" },
    ],
  },
  {
    n: 12,
    title: "Flammable liquids: the bund that stops the spread makes the pool",
    body: "For a flammable liquid the bund does two things at once, and they "
      + "pull in opposite directions.  It stops the liquid spreading -- to "
      + "the drains, under other plant, to an ignition source.  And by "
      + "holding it, it makes a POOL whose surface is the bund's free floor: "
      + "the area the liquid evaporates from (the flammable vapour), and the "
      + "area a pool fire would burn over.  Both grow with the surface, so a "
      + "low, wide bund makes a larger cloud and a larger fire than a high, "
      + "narrow one for the same spill, and a fire in a bund heats the tanks "
      + "standing in it.  This page states that qualitatively and computes "
      + "only the surface (bund.ts:275 (poolArea)).  It is NOT a fire or "
      + "dispersion model, and not a certified risk analysis: the "
      + "evaporation rate, the size of the cloud and the radiation of the "
      + "fire are questions of their own.",
    leadsTo: {
      tool: "pool-fire",
      toolLabel: "Pool-fire radiation and the distance it sets",
      stepTitle: "How fast the pool burns: the Burgess correlation, and one measurement",
      body: "A pool burns at a rate per square metre of its surface, so the "
        + "pool the bund makes sets the fire.  The pool-fire page builds that "
        + "rate from the fuel up and carries it to a radiation distance.",
    },
  },
  {
    n: 13,
    title: "Local containment or remote impounding",
    body: "A bund holds the spill WHERE IT FALLS, round the tanks.  The other "
      + "answer is to lead it AWAY: a kerbed, sloped catch area under the "
      + "vessels drains to an impounding basin at a distance, so the pool "
      + "(and any fire on it) forms clear of the vessels, and a deep pit "
      + "holds the volume over a small surface.  HSG176 paragraph 158 "
      + "accepts a smaller bund where the liquid is directed to a separate "
      + "basin.  It suits a liquefied gas stored under pressure, whose cold "
      + "pool must not lie under the vessels that feed it -- which is why "
      + "the ammonia witnesses in Choupo's tutorials use impounding areas, "
      + "and the green-ammonia case's refrigerated tanks a bund.  Choupo's "
      + "layout check sizes an impounding area by its pit "
      + "(src/postProcessing/layout/PlantLayout.cpp:3203) and announces a pit "
      + "inside its own catch area; this page draws a bund and does not size "
      + "a pit.",
  },
  {
    n: 14,
    title: "How a bund is built, and why one fit for one liquid may not be for another",
    body: "A bund is a structure that must stay liquid tight for decades and "
      + "be strong enough on the one day it is full.  It is usually "
      + "reinforced concrete, sometimes masonry for low walls, with the floor "
      + "and walls impervious to the liquid stored -- concrete or another "
      + "fire-resistant material (HSG176 paragraph 164; England's oil "
      + "regulation 3(2)(c) asks for impermeability to water and oil).  Its "
      + "weak points are its JOINTS (between floor and wall, between pours, "
      + "at expansion joints, sealed with a jointing material) and its "
      + "PENETRATIONS: every pipe through a wall is a path out, so pipes go "
      + "over the wall where they can, and where one must pass through, the "
      + "junction is sealed (regulation 3(2)(e)) and its effect on the wall "
      + "assessed (HSG176 paragraph 163).  WHY A BUND FIT FOR WATER OR SOME "
      + "HYDROCARBONS MAY NOT BE FOR AN ACID, A BASE OR A SOLVENT: concrete "
      + "is alkaline and is attacked by acids, a sealant or a lining resists "
      + "some chemicals and swells or dissolves in others, and a crack that "
      + "water seeps through slowly may pass a solvent quickly.  So the "
      + "lining and the joint sealant are chosen for the liquid in THIS "
      + "bund, from the manufacturer's data and the applicable guidance; "
      + "this page carries no compatibility table and invents none.  And a "
      + "barrier nobody looks at is not a barrier: cracks, failed joints, "
      + "debris and standing water are found by regular inspection (HSG176 "
      + "paragraph 222), nothing combustible is kept in a bund (168), and "
      + "vehicles are kept away from its walls (169).",
    leadsTo: {
      tool: "materials",
      toolLabel: "Materials of construction",
      stepTitle: "Non-metallics, linings and refractories",
      body: "Linings and non-metallic materials, and why a material is chosen "
        + "for the chemical it meets, are the materials page's subject.",
    },
  },
  {
    n: 15,
    title: "Exercise 1: three tanks, one bund",
    body: "Three tanks of 20, 15 and 10 m3 stand in one bund.  Choose the "
      + "rule; the bench below computes what it requires (the largest tank, "
      + "or a quarter of the total, the larger), and the wall height at "
      + "which Choupo's layout check, with every footprint deducted, is just "
      + "met.  Then enter your own wall height, area and freeboard: the "
      + "bench gives your bund's geometric, net and useful capacities, "
      + "ruptures the largest tank, and shows where the level stops and how "
      + "much margin is left -- in cubic metres and in centimetres of wall.  "
      + "Move the area and the height and watch what does not change: the "
      + "volume the rule asks for.",
  },
  {
    n: 16,
    title: "Exercise 2: the same bund after rain",
    body: "Now let 50 mm of rain stand in the bund (an author-set number for "
      + "the exercise) before the largest tank fails.  The rain has taken "
      + "the floor area times its depth, and a design that was adequate on "
      + "a dry day may now be short -- by the engine's reading, by the useful "
      + "reading, or by both.  Find the smallest change that restores it: a "
      + "higher wall, a larger floor, or pumping the rain out, which is what "
      + "an operator does and what a design must not assume has been done.",
  },
];

export const BUND_LIMITS: readonly LessonLimit[] = [
  { id: "static", title: "A static volume, not a wave",
    body: "The page balances volumes.  The surge of a catastrophic failure, "
      + "which can carry liquid over a wall the volume says is high enough, "
      + "is not modelled; the freeboard stands for it, and no value is "
      + "suggested for it." },
  { id: "loss", title: "No evaporation, no foam, no fire water",
    body: "Nothing leaves the pool except over the wall and through the "
      + "drain.  Evaporation, the foam a fire-fighting attack adds and the "
      + "fire-fighting water itself are not computed." },
  { id: "flows", title: "The leak's flow is declared; the drain is one orifice",
    body: "Scenario B's flow is the student's input, not a model of a hole "
      + "under a falling head; scenario D's drain is a single opening with a "
      + "single discharge coefficient (0.61, the page's assumption), not a "
      + "valve and its pipe." },
  { id: "geometry", title: "A rectangle, one row of tanks, one slope",
    body: "The bund is a rectangle; the tanks stand in one row along it, "
      + "evenly spaced, and the section is drawn through their centres.  The "
      + "floor falls in one direction to a sump at one end, whose own small "
      + "volume is not counted; a tank on the sloped floor is counted as if "
      + "level at its centre, which is exact once the liquid covers its "
      + "footprint." },
  { id: "engine", title: "What the engine computes, and what only this page does",
    body: "Choupo's layout check (BundArithmetic.H) computes the gross, "
      + "displaced and net volumes with a flat floor at grade, every enclosed "
      + "footprint deducted at the wall top, and the required volume as the "
      + "largest declared term plus the allowances -- the page's engine "
      + "reading is that, number for number.  The sloped floor, the "
      + "freeboard, the useful capacity, the level and the scenarios are the "
      + "page's own." },
  { id: "structure", title: "No structural design",
    body: "The thrust and the moment of the liquid on a wall are printed; "
      + "the wall's design -- its reinforcement, its foundation, its joints, "
      + "its resistance to impact -- is not attempted." },
  { id: "flotation", title: "Flotation is named, not computed",
    body: "An empty tank in a flooded bund is lifted by the water it "
      + "displaces; whether its anchors hold is not checked." },
  { id: "compliance", title: "Not a compliance check",
    body: "No law, code or permit is checked.  The rules on the page are "
      + "examples with their origin; the one that binds a real bund is its "
      + "own country's, product's and permit's." },
];
