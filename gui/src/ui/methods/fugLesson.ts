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
      + "makes, and it is a binary construction — two components, one "
      + "diagram.  The shortcut answers the same question in closed form, and "
      + "it survives more than two components by reducing the mixture to two "
      + "of them: the light key, the least volatile species you want mostly in "
      + "the distillate, and the heavy key, the most volatile one you want "
      + "mostly in the bottoms.  Everything else is priced by its volatility "
      + "relative to the heavy key, and the separation is specified by the two "
      + "key recoveries.",
    formula: String.raw`\begin{aligned}
\alpha_{i,\mathrm{HK}} &= \frac{K_i}{K_\mathrm{HK}} &\qquad& \text{keys: LK (light) and HK (heavy)}\\[6pt]
&\mathrm{recoveryLK},\ \mathrm{recoveryHK}: \text{ both the fraction of that key's feed}\\
&\text{that leaves in the distillate, so a sharp split is a high LK and a low HK}
\end{aligned}`,
    where: [
      { sym: "\\alpha_{i,\\mathrm{HK}}",
        means: "The relative volatility of component i referred "
        + "to the heavy key: K_i/K_HK.  The heavy key's own value is exactly "
        + "1 by construction, and the light key's is the larger of the two.  "
        + "It is evaluated once, at the feed bubble point, and held constant "
        + "for the whole column — see step 2 for why that matters.",
        unit: "dimensionless" },
      { sym: "K_i", means: "The equilibrium ratio y_i/x_i of component i from "
        + "the case's declared thermodynamics — the very same K the flash and "
        + "the rigorous column use, but asked for at a single state instead "
        + "of stage by stage.", unit: "dimensionless" },
      { sym: "K_\\mathrm{HK}",
        means: "The heavy key's equilibrium ratio at that same "
        + "state — the denominator that turns every K into a relative "
        + "volatility.  A non-volatile heavy key has no volatility to be "
        + "relative to, and is refused.", unit: "dimensionless" },
      { sym: "\\mathrm{LK}",
        means: "The light key: the more volatile of the two "
        + "components whose split you are specifying.  Choosing the keys is "
        + "your design decision, not the method's.", unit: "—" },
      { sym: "\\mathrm{HK}",
        means: "The heavy key: the less volatile of the pair.  "
        + "Everything lighter than LK goes essentially overhead and "
        + "everything heavier than HK essentially down; the method only "
        + "really decides about the keys.", unit: "—" },
      { sym: "\\mathrm{recoveryLK}",
        means: "The fraction of the light key's feed that "
        + "leaves in the distillate.", unit: "dimensionless" },
      { sym: "\\mathrm{recoveryHK}",
        means: "The fraction of the heavy key's feed that "
        + "leaves in the distillate — note the same basis, which is why a "
        + "sharp split is a high light-key recovery and a low heavy-key one.",
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
      + "and what it returns is a limit rather than a design: no column can "
      + "do this separation in fewer stages, and no column can be operated "
      + "there, because a column at total reflux makes no product.  On the "
      + "N(R) plot above it is the horizontal asymptote.",
    formula: String.raw`\begin{aligned}
N_\mathrm{min} &= \frac{\ln\!\left[ \left(\dfrac{x_\mathrm{LK}}{x_\mathrm{HK}}\right)_{\!D} \left(\dfrac{x_\mathrm{HK}}{x_\mathrm{LK}}\right)_{\!B} \right]}{\ln \alpha_\mathrm{LK,HK}}\\[6pt]
&\quad \text{(the same product grouped by component: } \left(\tfrac{x_D}{x_B}\right)_\mathrm{LK} \left(\tfrac{x_B}{x_D}\right)_\mathrm{HK} )
\end{aligned}`,
    where: [
      { sym: "N_\\mathrm{min}",
        means: "The stage count at total reflux: the fewest "
        + "equilibrium stages that could ever achieve this separation.  It is "
        + "a limit, not a design — a column at total reflux makes no product "
        + "at all.  It is not an integer, and the engine keeps it as a real "
        + "number.", unit: "equilibrium stages" },
      { sym: "x_\\mathrm{LK}",
        means: "Mole fraction of the light key in a named "
        + "product stream — per mole of that stream, so x_LK,D and x_LK,B are "
        + "different numbers wearing the same symbol.  The subscript is doing "
        + "the work; read it every time.", unit: "dimensionless" },
      { sym: "x_\\mathrm{HK}",
        means: "Mole fraction of the heavy key in a named "
        + "product stream, on the same per-stream basis.",
        unit: "dimensionless" },
      { sym: "\\alpha_\\mathrm{LK,HK}",
        means: "The light key's relative volatility referred "
        + "to the heavy key — the single number Fenske divides by.  The "
        + "engine refuses a value not greater than 1, because that means the "
        + "keys have been assigned the wrong way round.",
        unit: "dimensionless" },
      { sym: "x_D", means: "A composition in the distillate — per mole of "
        + "distillate.  In this method it is derived from the Fenske "
        + "distribution rather than declared.", unit: "dimensionless" },
      { sym: "x_B", means: "A composition in the bottoms, per mole of "
        + "bottoms, derived the same way from the same distribution.",
        unit: "dimensionless" },
      { sym: "D", means: "The distillate stream (as a subscript) and its "
        + "molar flow (in Kirkbride below).  Note the direction of the "
        + "arithmetic in this method: D and B are outputs of the key "
        + "recoveries, not specifications you set.", unit: "kmol/s" },
      { sym: "B", means: "The bottoms stream and its molar flow — the sum "
        + "over all components of what Fenske sends down.", unit: "kmol/s" },
    ],
    note: "α is constant here — that is an assumption, not a fact.  A real "
      + "column is colder at the top than at the bottom and its α varies over "
      + "that span; the formula needs one number.  Textbooks write α_avg and "
      + "usually mean a geometric mean of the top and bottom values; Choupo "
      + "freezes one α at the feed bubble point and publishes it in the badge "
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
    formula: String.raw`\begin{aligned}
\sum_i \frac{\alpha_i z_i}{\alpha_i - \theta} &= 1 - q \quad \longrightarrow \quad \theta\\[4pt]
R_\mathrm{min} + 1 &= \sum_i \frac{\alpha_i\, x_{D,i}}{\alpha_i - \theta}
\end{aligned}`,
    where: [
      { sym: "\\alpha_i",
        means: "component i's relative volatility against the heavy key: the same "
        + "quantity as α with the subscripts i and HK, written short" },
      { sym: "x_{D,i}",
        means: "mole fraction of component i in the distillate" },
      { sym: "\\sum_i",
        means: "The sum runs over every component in the case, all "
        + "n of them — not just the two keys.  That is precisely why the "
        + "shortcut survives a multicomponent feed: the keys fix the "
        + "separation, but every non-key still contributes its own term, and "
        + "its own pole where α_i equals θ.", unit: "none" },
      { sym: "z_i", means: "Feed mole fraction of component i, per mole of "
        + "total feed, normalised to sum to 1 whatever the author typed.",
        unit: "dimensionless" },
      { sym: "\\theta",
        means: "Underwood's root — the one quantity in the whole "
        + "method that has to be solved for rather than evaluated.  The "
        + "left-hand sum has a vertical asymptote at every component "
        + "volatility, so it crosses many times and most crossings are "
        + "meaningless; the root that fixes the minimum reflux is the one "
        + "trapped between the two key volatilities.",
        unit: "dimensionless (it is a relative volatility)" },
      { sym: "q", means: "The feed quality: how much of the feed arrives as "
        + "liquid.  q = 1 is a saturated liquid, q = 0 a saturated vapour, "
        + "and in the textbook q outside [0,1] is a subcooled liquid or a "
        + "superheated vapour.  Choupo takes q = 1 − vf, where vf is the "
        + "feed's vapour fraction resolved at its own declared T and P: an "
        + "authored feed with no “vf” is flashed there, a pinned one keeps "
        + "its declaration, a produced stream keeps its producer's answer.  "
        + "A vapour fraction lies in [0, 1], so a subcooled (q > 1) or "
        + "superheated (q < 0) feed is not expressible here; and the feed's "
        + "declared temperature enters the method twice — through q, and as "
        + "the initial guess of the bubble-point solve that fixes every α.",
        unit: "dimensionless" },
      { sym: "R_\\mathrm{min}",
        means: "The minimum reflux ratio — the reflux below "
        + "which the separation is unreachable at any column height, because "
        + "a pinch has appeared.  The sum gives R_min + 1, and the −1 is what "
        + "makes it a ratio of reflux to distillate.", unit: "dimensionless" },
      { sym: "x_D", means: "The distillate composition.  Note it is derived "
        + "from the Fenske distribution rather than declared — so it is the "
        + "composition the column would have at total reflux, being used here "
        + "at minimum reflux.  That is one of the method's approximations.",
        unit: "dimensionless" },
    ],
    note: "Picking the right root is the fiddly part, and it is the step that "
      + "quietly goes wrong.  The left-hand sum has a vertical asymptote at "
      + "every component volatility α_i, so it crosses 1 − q many times and "
      + "most of those crossings mean nothing.  The one that fixes the minimum "
      + "reflux is the root trapped between the two key volatilities, "
      + "θ ∈ (α_HK, α_LK) — which is (1, α_LK) when volatilities are referred "
      + "to the heavy key.  While no component's α lies strictly between the "
      + "keys, that branch runs monotonically from −∞ to +∞, so it crosses "
      + "exactly once and a bisection bracketed by the two key α's cannot "
      + "jump to a neighbouring branch.  A distributed non-key breaks exactly "
      + "that condition: its α puts a pole inside the bracket and the root "
      + "moves to another sub-interval.  Choupo does not implement the "
      + "one-root-per-adjacent-pair extension that case needs — it refuses, "
      + "naming the offending components and their α's, rather than returning "
      + "the bracket midpoint as a plausible R_min with nothing behind it; a "
      + "rigorous column (“model simultaneous;”) has no such restriction.  "
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
      + "blunt about what it is: an algebraic curve fitted through a scatter "
      + "of points that were themselves calculated -- stepwise plate-to-plate "
      + "(Lewis-Matheson) results, not plant measurements (Gilliland 1940, "
      + "p. 1221) -- later put into a closed form a "
      + "computer can evaluate.  Nothing about it is deduced from a material "
      + "balance or an "
      + "equilibrium relation.  It is written in two coordinates that put "
      + "minimum reflux at X = 0 and total reflux at X = 1, so that the two "
      + "derived limits sit at the ends of the fit by construction.",
    formula: String.raw`\begin{aligned}
X &= \frac{R - R_\mathrm{min}}{R + 1} &\qquad Y &= \frac{N - N_\mathrm{min}}{N + 1}\\[4pt]
Y &= 1 - \exp\!\left[ \frac{1 + 54.4\,X}{11 + 117.2\,X} \cdot \frac{X - 1}{\sqrt{X}} \right] &\qquad& \text{(the usual closed form)}
\end{aligned}`,
    where: [
      { sym: "R", means: "The operating reflux ratio, L/D — liquid returned "
        + "to the top per mole of distillate drawn.  It is an input here, "
        + "read from the case; this method never forms the internal liquid "
        + "and vapour flows that would make it physical.  R is the corpus's "
        + "most overloaded letter: it is also the gas constant, the heat "
        + "removal curve in the reactor-stability page, and (as R_f) the "
        + "retention factor in adsorption.", unit: "dimensionless" },
      { sym: "X", means: "Gilliland's abscissa — a reduced coordinate built "
        + "only so that minimum reflux lands at 0 and total reflux at 1.  It "
        + "is a position along a fitted curve, not a composition, and it has "
        + "nothing to do with the X of the absorption or drying pages.",
        unit: "dimensionless" },
      { sym: "Y", means: "Gilliland's ordinate — the second reduced "
        + "coordinate, read off the fitted curve at the current X and then "
        + "inverted for N.  It is a fraction of the way from the total-reflux "
        + "limit toward an infinitely tall column; it is not the humidity "
        + "ratio or the mole ratio that share the letter elsewhere.",
        unit: "dimensionless" },
      { sym: "N", means: "The theoretical stage count at the operating "
        + "reflux — the answer this page exists to produce.  Equilibrium "
        + "stages, not trays, and not an integer.  Its accuracy is the "
        + "correlation's, not the thermodynamics'.", unit: "stages" },
    ],
    note: "This is the single most important thing on the page.  The two ends "
      + "of the N(R) curve are as good as their assumptions — they are what "
      + "constant α and constant molar overflow imply.  Everything between "
      + "them is as good as a correlation, and it carries the scatter of the "
      + "points it was fitted to.  Those are different kinds of statement, and "
      + "they are why the disagreement with a rigorous column is not the same "
      + "size everywhere along the curve: near total reflux Gilliland barely "
      + "acts (X → 1, Y → 0) and what is left is Fenske alone.",
  },
  {
    n: 5,
    title: "What the shortcut buys, and what it cannot tell you",
    body: "What it buys is a first size, in closed form, before any column "
      + "exists: N_min, R_min, the stage count at your chosen reflux, the "
      + "product splits and a feed stage — seconds of arithmetic against a "
      + "rigorous column that has to be built and then solved.  That is why "
      + "the shortcut is where the number you type into a rigorous column's "
      + "stage count comes from.  What it cannot tell you is almost "
      + "everything else.  There are no composition or temperature profiles "
      + "in it — it returns a count, not a column, so there is no stage to "
      + "inspect and no place to see where the separation is actually "
      + "happening.  The feed stage comes from Kirkbride, which is another "
      + "empirical fit, not a derivation.  And with α held constant, α can "
      + "never cross one — an azeotrope is exactly where α passes through one "
      + "as the composition changes — so no azeotrope is representable at "
      + "all: point a "
      + "shortcut column at ethanol/water and it will return a stage count, "
      + "and that count will be an answer to a system that does not exist.",
    formula: String.raw`\begin{aligned}
&\text{Kirkbride (feed stage, empirical):}\\[4pt]
&\frac{N_\mathrm{rect}}{N_\mathrm{strip}} = \left[ \frac{z_\mathrm{HK}}{z_\mathrm{LK}} \left( \frac{x_\mathrm{LK,B}}{x_\mathrm{HK,D}} \right)^{\!2} \frac{B}{D} \right]^{0.206}
\end{aligned}`,
    where: [
      { sym: "x_\\mathrm{LK,B}",
        means: "mole fraction of the light key in the bottoms" },
      { sym: "x_\\mathrm{HK,D}",
        means: "mole fraction of the heavy key in the distillate" },
      { sym: "N_\\mathrm{rect}",
        means: "The number of stages above the feed — the "
        + "rectifying section.", unit: "stages" },
      { sym: "N_\\mathrm{strip}",
        means: "The number of stages below the feed — the "
        + "stripping section.  Kirkbride gives only their ratio, so the total "
        + "N from Gilliland has to be split by it; the feed stage is the one "
        + "number on this page with no theoretical derivation behind it at "
        + "all.", unit: "stages" },
      { sym: "z_\\mathrm{HK}", means: "Heavy-key mole fraction in the feed.",
        unit: "dimensionless" },
      { sym: "z_\\mathrm{LK}", means: "Light-key mole fraction in the feed.",
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
      + "α can never cross one, and an azeotrope is a point where α passes "
      + "through one with composition, so no azeotrope is representable at "
      + "all.",
  },
  {
    id: "one-near-ideal-witness",
    title: "One near-ideal witness, and one stage convention.",
    body: "The rigorous comparison on this page is made on benzene/toluene "
      + "with ideal γ and an ideal-gas vapour, a pair whose α changes little "
      + "over the column, so an α frozen at the feed bubble point is close "
      + "to the column's own there.  The agreement it shows is a fact about "
      + "that pair: it says nothing about how the shortcut fares on a "
      + "strongly non-ideal mixture.  And when two stage counts are compared "
      + "digit by digit, the counting convention matters: Fenske counts "
      + "every equilibrium contact between the two product compositions, so "
      + "with a total condenser the partial reboiler is one of them; the "
      + "rigorous column here also counts its partial reboiler as its last "
      + "stage and does not count a total condenser "
      + "(DistillationColumn.H:40-47).",
  },
  {
    id: "constant-molar-overflow",
    title: "Constant molar overflow.",
    body: "Underwood's derivation assumes equal molar latent heats, so the "
      + "internal vapour and liquid flows do not change from stage to stage. "
      + "It is the same assumption Choupo's two CMO column models make "
      + "(“model WangHenke;”, a bubble-point iteration run here at constant "
      + "molar overflow, and “model simultaneous;”); “fullMESH” is where it "
      + "is dropped.",
  },
  {
    id: "gilliland-is-a-fit",
    title: "The middle of the curve is a correlation, not a derivation.",
    body: "Fenske and Underwood are consequences of the assumptions above. "
      + "The closed form of Gilliland is a curve fitted through stepwise "
      + "plate-to-plate calculations (not plant data), and it carries their "
      + "scatter with it. Reading a stage "
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
    title: "N counts equilibrium stages, not trays.",
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
