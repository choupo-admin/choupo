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
  The shortcut-distillation lesson, as DATA, for the same reason the McCabe and
  Kremser ones are: prose is the part of a tool that rots with nothing failing,
  and an argument held as data can be asserted to still run end to end.

  THE ARGUMENT, in the order the classical method builds it.  Fenske and
  Underwood are the two LIMITS of the same column the McCabe staircase walks --
  the staircase against the 45-degree line, and the pinch -- so each of them is
  a picture the reader has already drawn by hand.  Gilliland is the third
  thing, and it is a different KIND of thing: a curve fitted through data, not
  a consequence of an assumption.  That distinction is the honesty point this
  page exists to make, and it is why step 4 says it in its body, its formula
  block and its note rather than once in a footnote.

  NO NUMBER FROM THIS SEPARATION IS QUOTED HERE.  The badges, the plot and the
  footer carry the run's own values; a number copied into prose is a second
  home for a derived fact, and it drifts.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

export const FUG_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The same question as McCabe-Thiele, answered without drawing",
    body: "McCabe-Thiele answers \"how many stages?\" by drawing: two operating "
      + "lines, a q-line, and a staircase stepped off between the operating "
      + "line and the equilibrium curve.  It is exact for the assumptions it "
      + "makes, and it is a BINARY construction — two components, one "
      + "diagram.  The shortcut answers the same question in closed form, and "
      + "it survives more than two components by reducing the mixture to two "
      + "of them: the LIGHT KEY, the least volatile species you want mostly in "
      + "the distillate, and the HEAVY KEY, the most volatile one you want "
      + "mostly in the bottoms.  Everything else is priced by its volatility "
      + "relative to the heavy key, and the separation is specified by the two "
      + "key RECOVERIES.",
    formula: "α_i,HK = K_i / K_HK          keys: LK (light) and HK (heavy)\n"
      + "recoveryLK, recoveryHK — both the fraction of that key's FEED that\n"
      + "leaves in the DISTILLATE (so a sharp split is a high LK and a low HK)",
    where: [
      { sym: "α_i,HK", means: "The RELATIVE VOLATILITY of component i referred "
        + "to the heavy key: K_i/K_HK.  The heavy key's own value is exactly "
        + "1 by construction, and the light key's is the larger of the two.  "
        + "It is evaluated ONCE, at the feed bubble point, and held constant "
        + "for the whole column — see step 2 for why that matters.",
        unit: "dimensionless" },
      { sym: "K_i", means: "The equilibrium ratio y_i/x_i of component i from "
        + "the case's DECLARED thermodynamics — the very same K the flash and "
        + "the rigorous column use, but asked for at a single state instead "
        + "of stage by stage.", unit: "dimensionless" },
      { sym: "K_HK", means: "The heavy key's equilibrium ratio at that same "
        + "state — the denominator that turns every K into a relative "
        + "volatility.  A non-volatile heavy key has no volatility to be "
        + "relative to, and is refused.", unit: "dimensionless" },
      { sym: "LK", means: "The LIGHT KEY: the more volatile of the two "
        + "components whose split you are specifying.  Choosing the keys is "
        + "YOUR design decision, not the method's.", unit: "—" },
      { sym: "HK", means: "The HEAVY KEY: the less volatile of the pair.  "
        + "Everything lighter than LK goes essentially overhead and "
        + "everything heavier than HK essentially down; the method only "
        + "really decides about the keys.", unit: "—" },
      { sym: "recoveryLK", means: "The fraction of the light key's FEED that "
        + "leaves in the DISTILLATE.", unit: "dimensionless" },
      { sym: "recoveryHK", means: "The fraction of the heavy key's feed that "
        + "leaves in the distillate — note the same basis, which is why a "
        + "sharp split is a HIGH light-key recovery and a LOW heavy-key one.",
        unit: "dimensionless" },
    ],
    note: "The two ends of the answer are pictures you already know.  Total "
      + "reflux is the staircase stepped off against the 45° line, because "
      + "with no product withdrawn both operating lines collapse onto it; "
      + "minimum reflux is the pinch, where the operating line touches the "
      + "equilibrium curve and an extra step buys nothing.  Fenske and "
      + "Underwood are those two drawings done as algebra.",
  },
  {
    n: 2,
    title: "Fenske: the fewest stages the separation can ever take",
    body: "At total reflux nothing leaves the column, so every stage buys a "
      + "full factor of the relative volatility and the overall separation "
      + "factor is α raised to the stage count.  Ask for the separation the "
      + "two key recoveries define, and solve for the count.  That is Fenske, "
      + "and what it returns is a LIMIT rather than a design: no column can "
      + "do this separation in fewer stages, and no column can be operated "
      + "there, because a column at total reflux makes no product.  On the "
      + "N(R) plot below it is the horizontal asymptote.",
    formula: "N_min = ln[ (x_LK/x_HK)_D · (x_HK/x_LK)_B ] / ln α_LK,HK\n"
      + "        (the same product grouped by component: "
      + "(x_D/x_B)_LK · (x_B/x_D)_HK )",
    where: [
      { sym: "N_min", means: "The stage count at TOTAL REFLUX: the fewest "
        + "equilibrium stages that could ever achieve this separation.  It is "
        + "a LIMIT, not a design — a column at total reflux makes no product "
        + "at all.  It is not an integer, and the engine keeps it as a real "
        + "number.", unit: "equilibrium stages" },
      { sym: "x_LK", means: "Mole fraction of the LIGHT KEY in a named "
        + "product stream — per mole of THAT stream, so x_LK,D and x_LK,B are "
        + "different numbers wearing the same symbol.  The subscript is doing "
        + "the work; read it every time.", unit: "dimensionless" },
      { sym: "x_HK", means: "Mole fraction of the HEAVY KEY in a named "
        + "product stream, on the same per-stream basis.",
        unit: "dimensionless" },
      { sym: "α_LK,HK", means: "The light key's relative volatility referred "
        + "to the heavy key — the single number Fenske divides by.  The "
        + "engine refuses a value not greater than 1, because that means the "
        + "keys have been assigned the wrong way round.",
        unit: "dimensionless" },
      { sym: "x_D", means: "A composition in the DISTILLATE — per mole of "
        + "distillate.  In this method it is DERIVED from the Fenske "
        + "distribution rather than declared.", unit: "dimensionless" },
      { sym: "x_B", means: "A composition in the BOTTOMS, per mole of "
        + "bottoms, derived the same way from the same distribution.",
        unit: "dimensionless" },
      { sym: "D", means: "The DISTILLATE stream (as a subscript) and its "
        + "molar flow (in Kirkbride below).  Note the direction of the "
        + "arithmetic in this method: D and B are OUTPUTS of the key "
        + "recoveries, not specifications you set.", unit: "kmol/s" },
      { sym: "B", means: "The BOTTOMS stream and its molar flow — the sum "
        + "over all components of what Fenske sends down.", unit: "kmol/s" },
    ],
    note: "α is CONSTANT here — that is an assumption, not a fact.  A real "
      + "column is colder at the top than at the bottom and its α varies over "
      + "that span; the formula needs one number.  Textbooks write α_avg and "
      + "usually mean a geometric mean of the top and bottom values; Choupo "
      + "freezes one α at the FEED BUBBLE POINT and publishes it in the badge "
      + "above the plot.  Different choices, same assumption: a single number "
      + "standing in for something that varies.",
  },
  {
    n: 3,
    title: "Underwood: the reflux below which no column is tall enough",
    body: "Lower the reflux and somewhere in the column a pinch appears — a "
      + "zone where the operating and equilibrium lines touch, where adding "
      + "stages changes nothing.  The reflux at which that first happens is "
      + "R_min, and below it the separation is unreachable at any height.  "
      + "Underwood locates it in two steps: find the root θ of a feed-quality "
      + "equation, then sum a second series over the distillate to get R_min.  "
      + "q is the same feed quality as McCabe-Thiele's q-line.  On the plot it "
      + "is the vertical asymptote.",
    formula: "Σ_i  α_i z_i / (α_i − θ)  =  1 − q          →  θ\n"
      + "R_min + 1  =  Σ_i  α_i x_D,i / (α_i − θ)",
    where: [
      { sym: "Σ_i", means: "The sum runs over EVERY component in the case, all "
        + "n of them — not just the two keys.  That is precisely why the "
        + "shortcut survives a multicomponent feed: the keys fix the "
        + "separation, but every non-key still contributes its own term, and "
        + "its own pole where α_i equals θ.", unit: "none" },
      { sym: "z_i", means: "FEED mole fraction of component i, per mole of "
        + "total feed, normalised to sum to 1 whatever the author typed.",
        unit: "dimensionless" },
      { sym: "θ", means: "UNDERWOOD'S ROOT — the one quantity in the whole "
        + "method that has to be SOLVED for rather than evaluated.  The "
        + "left-hand sum has a vertical asymptote at every component "
        + "volatility, so it crosses many times and most crossings are "
        + "meaningless; the root that fixes the minimum reflux is the one "
        + "trapped BETWEEN THE TWO KEY VOLATILITIES.",
        unit: "dimensionless (it is a relative volatility)" },
      { sym: "q", means: "The FEED QUALITY: how much of the feed arrives as "
        + "liquid.  q = 1 is a saturated liquid, q = 0 a saturated vapour, "
        + "and in the textbook q outside [0,1] is a subcooled liquid or a "
        + "superheated vapour.  CHOUPO TAKES q = 1 − vf FROM THE FEED "
        + "STREAM's vapour fraction, so those outside values are not "
        + "expressible here: a feed declared with no `vf` is q = 1, and the "
        + "feed's declared TEMPERATURE enters only as the bubble-point "
        + "solver's initial guess, nowhere else in the method.",
        unit: "dimensionless" },
      { sym: "R_min", means: "The MINIMUM REFLUX RATIO — the reflux below "
        + "which the separation is unreachable at ANY column height, because "
        + "a pinch has appeared.  The sum gives R_min + 1, and the −1 is what "
        + "makes it a ratio of reflux to distillate.", unit: "dimensionless" },
      { sym: "x_D", means: "The DISTILLATE composition.  Note it is DERIVED "
        + "from the Fenske distribution rather than declared — so it is the "
        + "composition the column would have at TOTAL reflux, being used here "
        + "at minimum reflux.  That is one of the method's approximations.",
        unit: "dimensionless" },
    ],
    note: "PICKING THE RIGHT ROOT is the fiddly part, and it is the step that "
      + "quietly goes wrong.  The left-hand sum has a vertical asymptote at "
      + "EVERY component volatility α_i, so it crosses 1 − q many times and "
      + "most of those crossings mean nothing.  The one that fixes the minimum "
      + "reflux is the root trapped BETWEEN THE TWO KEY VOLATILITIES, "
      + "θ ∈ (α_HK, α_LK) — which is (1, α_LK) when volatilities are referred "
      + "to the heavy key.  While NO component's α lies strictly between the "
      + "keys, that branch runs monotonically from −∞ to +∞, so it crosses "
      + "exactly once and a bisection bracketed by the two key α's cannot "
      + "jump to a neighbouring branch.  A DISTRIBUTED NON-KEY breaks exactly "
      + "that condition: its α puts a pole inside the bracket and the root "
      + "moves to another sub-interval.  Choupo does not implement the "
      + "one-root-per-adjacent-pair extension that case needs — it REFUSES, "
      + "naming the offending components and their α's, rather than returning "
      + "the bracket midpoint as a plausible R_min with nothing behind it; a "
      + "rigorous column (`model simultaneous;`) has no such restriction.  "
      + "A root from any "
      + "other branch returns a number that is not R_min, and nothing about it "
      + "looks wrong.  Underwood's derivation also assumes constant molar "
      + "overflow — equal molar latent heats, so V and L do not change from "
      + "stage to stage.",
  },
  {
    n: 4,
    title: "Gilliland: a correlation fitted to data, not a derivation",
    body: "Fenske and Underwood give the two ends of the N(R) curve.  "
      + "Gilliland fills in everything between them, and it is worth being "
      + "blunt about what it is: an algebraic curve FITTED THROUGH A SCATTER "
      + "of plant and simulation points, later put into a closed form a "
      + "computer can evaluate.  Nothing about it is deduced from a material "
      + "balance or an "
      + "equilibrium relation.  It is written in two coordinates that put "
      + "minimum reflux at X = 0 and total reflux at X = 1, so that the two "
      + "derived limits sit at the ends of the fit by construction.",
    formula: "X = (R − R_min) / (R + 1)        Y = (N − N_min) / (N + 1)\n"
      + "Y = 1 − exp[ ((1 + 54.4 X) / (11 + 117.2 X)) · (X − 1) / √X ]\n"
      + "                                       (the usual closed form)",
    where: [
      { sym: "R", means: "The OPERATING reflux ratio, L/D — liquid returned "
        + "to the top per mole of distillate drawn.  It is an INPUT here, "
        + "read from the case; this method never forms the internal liquid "
        + "and vapour flows that would make it physical.  R is the corpus's "
        + "most overloaded letter: it is also the gas constant, the heat "
        + "removal curve in the reactor-stability page, and (as R_f) the "
        + "retention factor in adsorption.", unit: "dimensionless" },
      { sym: "X", means: "GILLILAND'S ABSCISSA — a reduced coordinate built "
        + "only so that minimum reflux lands at 0 and total reflux at 1.  It "
        + "is a position along a fitted curve, NOT a composition, and it has "
        + "nothing to do with the X of the absorption or drying pages.",
        unit: "dimensionless" },
      { sym: "Y", means: "GILLILAND'S ORDINATE — the second reduced "
        + "coordinate, read off the fitted curve at the current X and then "
        + "inverted for N.  It is a fraction of the way from the total-reflux "
        + "limit toward an infinitely tall column; it is not the humidity "
        + "ratio or the mole ratio that share the letter elsewhere.",
        unit: "dimensionless" },
      { sym: "N", means: "The theoretical STAGE COUNT at the operating "
        + "reflux — the answer this page exists to produce.  EQUILIBRIUM "
        + "stages, not trays, and not an integer.  Its accuracy is the "
        + "correlation's, not the thermodynamics'.", unit: "stages" },
    ],
    note: "This is the single most important thing on the page.  The two ENDS "
      + "of the N(R) curve are as good as their assumptions — they are what "
      + "constant α and constant molar overflow IMPLY.  Everything between "
      + "them is as good as a correlation, and it carries the scatter of the "
      + "points it was fitted to.  Those are different kinds of statement, and "
      + "they are why the disagreement with a rigorous column is not the same "
      + "size everywhere along the curve: near total reflux Gilliland barely "
      + "acts (X → 1, Y → 0) and what is left is Fenske alone.",
  },
  {
    n: 5,
    title: "What the shortcut buys, and what it cannot tell you",
    body: "What it buys is a FIRST SIZE, in closed form, before any column "
      + "exists: N_min, R_min, the stage count at your chosen reflux, the "
      + "product splits and a feed stage — seconds of arithmetic against a "
      + "rigorous column that has to be built and then solved.  That is why "
      + "the shortcut is where the number you type into a rigorous column's "
      + "stage count comes from.  What it cannot tell you is almost "
      + "everything else.  There are no composition or temperature PROFILES "
      + "in it — it returns a count, not a column, so there is no stage to "
      + "inspect and no place to see where the separation is actually "
      + "happening.  The feed stage comes from Kirkbride, which is another "
      + "empirical fit, not a derivation.  And with α held constant, α can "
      + "never equal one, so no azeotrope is representable at all: point a "
      + "shortcut column at ethanol/water and it will return a stage count, "
      + "and that count will be an answer to a system that does not exist.",
    formula: "Kirkbride (feed stage, empirical):\n"
      + "N_rect / N_strip = [ (z_HK/z_LK) · (x_LK,B / x_HK,D)² · (B/D) ]^0.206",
    where: [
      { sym: "N_rect", means: "The number of stages ABOVE the feed — the "
        + "rectifying section.", unit: "stages" },
      { sym: "N_strip", means: "The number of stages BELOW the feed — the "
        + "stripping section.  Kirkbride gives only their RATIO, so the total "
        + "N from Gilliland has to be split by it; the feed stage is the one "
        + "number on this page with no theoretical derivation behind it at "
        + "all.", unit: "stages" },
      { sym: "z_HK", means: "Heavy-key mole fraction in the FEED.",
        unit: "dimensionless" },
      { sym: "z_LK", means: "Light-key mole fraction in the feed.",
        unit: "dimensionless" },
    ],
    note: "So use it the way it was meant: the shortcut designs, the rigorous "
      + "column verifies.  The comparison drawn above is that sentence with "
      + "numbers attached — the same feed, the same declared thermodynamics, "
      + "the same reflux, the same distillate rate and the same product "
      + "specification, put to both columns.  The gap between the two stage "
      + "counts is not a constant along the reflux axis, and this page does "
      + "not attribute it to one cause: Gilliland's fit carries scatter, and "
      + "the frozen α is wrong by a different amount at every reflux.  Those "
      + "two have not been separated on this separation.",
  },
];

export const FUG_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "constant-alpha",
    title: "Constant relative volatility — an assumption, not a property.",
    body: "One α_LK,HK for the whole column, frozen at the feed bubble point. "
      + "A real column runs colder at the top than at the bottom and its α "
      + "varies over that span; none of that variation is in these numbers. "
      + "The hard consequence is not inaccuracy but expressiveness: a constant "
      + "α can never equal one, so no azeotrope is representable at all.",
  },
  {
    id: "constant-molar-overflow",
    title: "Constant molar overflow.",
    body: "Underwood's derivation assumes equal molar latent heats, so the "
      + "internal vapour and liquid flows do not change from stage to stage. "
      + "It is the same assumption the Wang-Henke and simultaneous column "
      + "models make; fullMESH is where it is dropped.",
  },
  {
    id: "gilliland-is-a-fit",
    title: "The middle of the curve is a correlation, not a derivation.",
    body: "Fenske and Underwood are consequences of the assumptions above. "
      + "The closed form of Gilliland is a curve fitted through plant and "
      + "simulation data, and it carries that scatter with it. Reading a stage "
      + "count off it is reading a fit, which is a different kind of claim "
      + "from reading a limit.",
  },
  {
    id: "kirkbride-feed-stage",
    title: "The feed stage is an empirical split too.",
    body: "Kirkbride divides the stages between rectifying and stripping "
      + "sections through a power-law correlation with an exponent of 0.206. "
      + "It is a fit of the same kind as Gilliland's, and it locates the feed "
      + "to a fraction of a column rather than to a tray.",
  },
  {
    id: "stage-count-not-a-design",
    title: "A stage count, not a design.",
    body: "No diameter, no tray spacing, no downcomer, no flooding margin, no "
      + "hydraulics and no capital cost. Sizing is a separate pass over a "
      + "column that already exists, and nothing here does it.",
  },
  {
    id: "equilibrium-stages",
    title: "N counts EQUILIBRIUM stages, not trays.",
    body: "Every stage is taken to leave its two streams in exact equilibrium. "
      + "Real trays do not, which is what a Murphree efficiency exists to "
      + "carry; converting N into real trays needs that efficiency and is not "
      + "part of the shortcut.",
  },
  {
    id: "no-profiles",
    title: "There is no profile to read.",
    body: "The shortcut returns counts and splits, not a stage-by-stage "
      + "composition or temperature profile. If you need to see where the "
      + "separation happens, where a pinch sits, or what a side draw would "
      + "do, that needs a column model that solves the stages — which is the "
      + "rigorous ladder drawn beside the curve here.",
  },
];
