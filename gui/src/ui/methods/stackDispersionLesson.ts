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
  The stack-dispersion lesson (DEV.md 4c C247; Vitor, 2026-11-08: the design
  of chimneys, Gaussian equations with dispersion coefficients and the famous
  tables as a function of the weather, day or night).

  WHAT WAS READ AND WHAT WAS NOT is said in STACK_SOURCES and again in
  STACK_LIMITS, source by source.  In short: the urban sigma set and the
  good-engineering-practice formula were READ in a printed table and in the
  regulation; the rural sigma set, Turner's class table and Briggs' plume-rise
  constants were written from the standard tabulation and NO source printing
  them could be read for this page.  The page says so rather than printing
  them as fact.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export interface StackSource {
  id: string; cite: string; used: string; read: "read" | "partly" | "not read";
}

export const STACK_SOURCES: readonly StackSource[] = [
  { id: "turner-1970", read: "read",
    cite: "D. B. Turner, Workbook of Atmospheric Dispersion Estimates, US EPA "
      + "Office of Air Programs Publication AP-26 (1970); the PHS 999-AP-26 "
      + "edition of 1967 is its predecessor",
    used: "READ: the key to the stability categories (wind speed, insolation, "
      + "night cloud), Table 3-1, p. 6, in the archive.org scan of the 1967 "
      + "PHS 999-AP-26 edition, whose table is the one on this page; the same "
      + "key is Table 4.1, p. 28, of Hanna, Briggs & Hosker (1982).  Its "
      + "footnotes: D for overcast day or night; strong sun is a solar "
      + "altitude above 60 degrees with clear sky, slight 15 to 35 degrees; "
      + "night is from 1 h before sunset to 1 h after sunrise.  The 1970 "
      + "edition itself was not seen.  US government work, public domain." },
  { id: "pasquill-1961", read: "not read",
    cite: "F. Pasquill, The estimation of the dispersion of windborne material, "
      + "Meteorological Magazine 90 (1961) 33-49",
    used: "the origin of the six classes A to F.  Not read; reached through "
      + "Turner." },
  { id: "briggs-1973", read: "read",
    cite: "G. A. Briggs, Diffusion Estimation for Small Emissions, ATDL "
      + "Contribution File 79 (1973); tabulated in S. R. Hanna, G. A. Briggs, "
      + "R. P. Hosker, Handbook on Atmospheric Diffusion, DOE/TIC-11223 (1982)",
    used: "READ: the sigma-y and sigma-z fits, both the open-country and the "
      + "urban set, in Table 4.5, p. 30, of the handbook (a printed copy of "
      + "Briggs' table; the 1973 report itself was not seen), and the urban "
      + "set again in US EPA, ISC3 User's Guide Vol. II (EPA-454/B-95-003b), "
      + "Tables 1-3 and 1-4, p. 1-19.  One disagreement: the handbook prints "
      + "0.00015 in the urban E-F sigma-z, ISC3 prints 0.0015; the page uses "
      + "0.0015 (0.00015 would give 506 m at 10 km, more than twelve times "
      + "the open-country class F, so the handbook figure is probably a "
      + "misprint, which is a judgement, not a reading)." },
  { id: "briggs-rise", read: "read",
    cite: "G. A. Briggs, Plume Rise, USAEC Critical Review Series TID-25075 "
      + "(1969); Plume rise predictions, in Lectures on Air Pollution and "
      + "Environmental Impact Analyses, AMS (1975)",
    used: "READ, in their ISC3 form (US EPA, ISC3 User's Guide Vol. II, "
      + "EPA-454/B-95-003b): the buoyancy flux, Eq. 1-8, p. 1-6; the two "
      + "final-rise laws, 21.425 and 38.71 with the split at 55 m4/s3, Eqs. "
      + "1-14 and 1-15, p. 1-8; the stable-air law with the constant 2.6, "
      + "Eq. 1-20, p. 1-9, with the default gradients 0.020 K/m (E) and "
      + "0.035 K/m (F), p. 1-9; the stable law also in Hanna et al. Eq. 2.19, "
      + "p. 14.  The originals of 1969 and 1975 were not seen.  ISC3 also "
      + "tests momentum against buoyancy and uses the momentum rise when it "
      + "wins; this page does not." },
  { id: "cfr-51-100", read: "read",
    cite: "40 CFR 51.100(ii), good engineering practice stack height (US EPA; "
      + "eCFR text)",
    used: "READ: GEP is the greater of 65 m above the base of the stack and, "
      + "for other stacks, Hg = H + 1.5 L, H the height of the nearby "
      + "structure and L its lesser dimension, height or projected width.  "
      + "The page computes the second clause only and names the first." },
];

export const STACK_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A stack does not remove the gas: it chooses where it is diluted",
    body: "A stack lets the wind and the turbulence of the air mix the gas "
      + "with clean air before it comes down. Nothing is destroyed: the same "
      + "mass per second leaves the stack and, far enough away, passes "
      + "through the plume. What the stack changes is how much air that "
      + "mass is spread through when it reaches the ground, and how far from "
      + "the fence that happens. A taller stack lifts the plume, so the "
      + "air has more distance to mix it before it touches the ground. The "
      + "rest of this page makes that sentence quantitative, in the order a "
      + "designer meets the questions: the shape of the plume, the weather, "
      + "how fast the plume spreads, how high it rises, where the ground "
      + "concentration peaks, and how tall the stack must be.",
  },
  {
    n: 2,
    title: "The Gaussian plume, and why the ground makes an image",
    body: "For a continuous source in a steady wind, the concentration across "
      + "the plume is a bell curve in the crosswind and the vertical "
      + "directions, with widths that grow downwind. The bell's height is "
      + "fixed by one requirement: all the mass per second Q must pass "
      + "through every plane across the wind. The ground does not absorb "
      + "the gas (on this page): it sends it back up. A source at height H "
      + "alone would let gas leak through the ground, so we add an image "
      + "source of the same strength at depth H below it. The pair is "
      + "symmetric about the ground, so no gas crosses it, and above the "
      + "ground the pair obeys the same equation as the real plume.",
    derivation: [
      { step: "The mass per second that the wind carries through a plane "
          + "across the wind is Q. With a bell curve in y and in z about the "
          + "centre line, that fixes the factor in front.",
        eq: String.raw`\iint u\,C\,\mathrm{d}y\,\mathrm{d}z=Q\;\Rightarrow\;C=\frac{Q}{2\pi\,u\,\sigma_y\,\sigma_z}\,e^{-y^{2}/2\sigma_y^{2}}\,e^{-(z-H)^{2}/2\sigma_z^{2}}` },
      { step: "At the ground there must be no flow of gas: the slope of C in "
          + "z is zero at z = 0. The single bell has slope C H over the "
          + "square of the width there, not zero, so it fails.",
        eq: String.raw`\left.\frac{\partial C}{\partial z}\right|_{z=0}=0` },
      { step: "Add an image source of equal strength at height minus H. "
          + "Swapping z for minus z swaps the two terms, so the sum is even "
          + "in z and its slope at the ground is zero without further work.",
        eq: String.raw`C=\frac{Q}{2\pi\,u\,\sigma_y\,\sigma_z}\,e^{-y^{2}/2\sigma_y^{2}}\left[e^{-(z-H)^{2}/2\sigma_z^{2}}+e^{-(z+H)^{2}/2\sigma_z^{2}}\right]` },
      { step: "At z = 0 the two exponentials are equal, so the ground "
          + "concentration on the centre line is twice the free-air value at "
          + "that height.",
        eq: String.raw`C(x,0,0)=\frac{Q}{\pi\,u\,\sigma_y\,\sigma_z}\,e^{-H^{2}/2\sigma_z^{2}}` },
    ],
    formula: String.raw`C(x,y,z)=\frac{Q}{2\pi\,u\,\sigma_y\,\sigma_z}\,e^{-y^{2}/2\sigma_y^{2}}\left[e^{-(z-H)^{2}/2\sigma_z^{2}}+e^{-(z+H)^{2}/2\sigma_z^{2}}\right]`,
    where: [
      { sym: "C", means: "concentration of the emitted species in the air", unit: "g/m3" },
      { sym: "x", means: "distance downwind of the stack", unit: "m" },
      { sym: "y", means: "distance across the wind from the plume centre line", unit: "m" },
      { sym: "z", means: "height above the ground", unit: "m" },
      { sym: "Q", means: "emission rate of the species, mass per second", unit: "g/s" },
      { sym: "u", means: "wind speed, taken as the 10 m surface wind at every height", unit: "m/s" },
      { sym: "\\sigma_y", means: "crosswind spread of the plume at distance x, the standard deviation of the bell", unit: "m" },
      { sym: "\\sigma_z", means: "vertical spread of the plume at distance x", unit: "m" },
      { sym: "H", means: "effective height of the plume centre line above the ground: the stack height plus the plume rise", unit: "m" },
      { sym: "\\pi", means: "the ratio of a circle's circumference to its diameter, 3.14159" },
      { sym: "e", means: "the base of natural logarithms, 2.71828" },
    ],
  },
  {
    n: 3,
    title: "The weather in one letter: Pasquill's stability classes",
    body: "How fast a plume spreads depends on how turbulent the air is, and "
      + "that depends on two things a designer can look up: how strongly the "
      + "sun heats the ground by day or how clear the sky is at night, and "
      + "how hard the wind blows. Pasquill grouped the combinations into six "
      + "classes, A (very unstable, a sunny afternoon with a light wind: "
      + "strong vertical mixing) to F (very stable, a clear night with a "
      + "light wind: the air hardly mixes vertically), D being neutral "
      + "(overcast or windy). Turner's key to the categories is the table on "
      + "this page: pick day or night, the sun or the cloud, and the wind, "
      + "and the cell lights up. A cell with two letters, A-B, means between "
      + "the two, and the page then lets every figure use both. The cell is "
      + "empty at night with the wind below 2 m/s, because the table gives "
      + "no class there; choose a class by hand if you need one. The table "
      + "on this page was checked against Turner's Table 3-1: see the "
      + "sources.",
  },
  {
    n: 4,
    title: "How fast the plume spreads: Briggs' fits to the Pasquill-Gifford curves",
    body: "Pasquill and Gifford measured how the widths grow with distance for "
      + "each class and drew them as curves. Briggs fitted one formula to "
      + "them, with three numbers per class and per direction, for open "
      + "country and for towns (a town's roughness mixes the air more, so "
      + "its curves spread faster, especially in stable air). The fits were "
      + "made for distances of about 100 m to 10 km, and the page draws "
      + "nothing outside that window as a result. A stable class has a "
      + "small vertical spread, so its plume stays narrow and its footprint "
      + "is far away; an unstable class has a large one, so it reaches the "
      + "ground near the stack.",
    formula: String.raw`\sigma=i\,x\,(1+a\,x)^{b}`,
    where: [
      { sym: "\\sigma", means: "either spread, sigma-y or sigma-z, at distance x", unit: "m" },
      { sym: "i", means: "initial slope of the curve, set by class and direction", unit: "m/m" },
      { sym: "a", means: "distance scale of the bend of the curve, set by class and direction", unit: "1/m" },
      { sym: "b", means: "exponent of the bend, 1/2, -1/2, -1 or 0, set by class and direction" },
    ],
  },
  {
    n: 5,
    title: "How high the plume rises: Briggs' buoyancy flux",
    body: "Hot gas leaves the stack lighter than the air around it and keeps "
      + "rising after it leaves. The strength of that push is the buoyancy "
      + "flux, built from the exit velocity, the diameter and how much "
      + "hotter the gas is. Briggs gave the final rise in neutral and "
      + "unstable air in two regimes, split at a flux of 55 m4/s3, and in "
      + "stable air a third law, because stable air resists the rise by its "
      + "own stratification. The effective height is the stack plus the "
      + "rise, and it is the effective height that goes into the plume "
      + "equation. A stack with no buoyancy, a cold jet, gets no rise from "
      + "this law: a cold jet rises by its momentum, which the page does not "
      + "build. All the rise is taken at once, at the stack, which flatters "
      + "the near field a little: see the limits. The constants in the "
      + "three laws were read in the EPA's ISC3 user's guide (see the "
      + "sources).",
    formula: String.raw`F=\frac{g\,v_s\,d^{2}\,(T_s-T_a)}{4\,T_s}`,
    derivation: [
      { step: "Neutral and unstable air, A to D, flux below 55 m4/s3:",
        eq: String.raw`\Delta h=\frac{21.425\,F^{3/4}}{u}` },
      { step: "Neutral and unstable air, flux of 55 m4/s3 or more:",
        eq: String.raw`\Delta h=\frac{38.71\,F^{3/5}}{u}` },
      { step: "Stable air, E and F, with the stability parameter s made of "
          + "the potential-temperature gradient:",
        eq: String.raw`\Delta h=2.6\left(\frac{F}{u\,s}\right)^{1/3},\qquad s=\frac{g\,\Gamma}{T_a}` },
      { step: "The effective height that enters the plume equation:",
        eq: String.raw`H=h_s+\Delta h` },
    ],
    where: [
      { sym: "F", means: "buoyancy flux of the stack gas", unit: "m4/s3" },
      { sym: "g", means: "gravitational acceleration, 9.80665", unit: "m/s2" },
      { sym: "v_s", means: "exit velocity of the gas at the top of the stack", unit: "m/s" },
      { sym: "d", means: "inside diameter of the stack top", unit: "m" },
      { sym: "T_s", means: "temperature of the gas at the stack exit", unit: "K" },
      { sym: "T_a", means: "ambient air temperature", unit: "K" },
      { sym: "\\Delta h", means: "final plume rise above the stack top", unit: "m" },
      { sym: "s", means: "stability parameter of the air", unit: "1/s2" },
      { sym: "\\Gamma", means: "potential-temperature gradient assumed for the class, 0.02 K/m for E and 0.035 K/m for F", unit: "K/m" },
      { sym: "h_s", means: "physical height of the stack", unit: "m" },
    ],
  },
  {
    n: 6,
    title: "Where the ground sees most, and why a taller stack lowers it",
    body: "Close to the stack the plume is still aloft and the ground sees "
      + "nothing; far away it is spread so thin that the ground sees little; "
      + "in between there is a maximum. If the plume's width ratio is "
      + "roughly constant, calculus finds it: the maximum is where the "
      + "vertical spread is the stack height over the root of two, and its "
      + "value falls as the inverse square of the effective height. That is "
      + "why a taller stack helps so much: double the height and the peak "
      + "falls to a quarter, before counting the extra rise. The page finds "
      + "the real maximum, with the real fits, by search, and marks it on "
      + "the figure; the formula is the hand check and the intuition. The "
      + "stability class moves the peak: in unstable air the spread is large "
      + "and the peak is high and close; in stable air it is lower and far, "
      + "often beyond 10 km, where the page marks it as lying outside the "
      + "window of the fits. So the bad case depends on where you stand: "
      + "close to the stack it is the sunny afternoon; far away it is the "
      + "calm clear night, whose narrow plume has not yet come down near "
      + "the stack and arrives, little diluted, at a distance. The figure "
      + "of the ground concentration with the six classes drawn shows that "
      + "the curves cross.",
    derivation: [
      { step: "Let the width ratio be constant, sigma-y equal to kappa times "
          + "sigma-z. The ground concentration on the centre line becomes a "
          + "function of the vertical spread alone.",
        eq: String.raw`C(x,0,0)=\frac{Q}{\pi\,u\,\kappa}\,\frac{1}{\sigma_z^{2}}\,e^{-H^{2}/2\sigma_z^{2}}` },
      { step: "Set the derivative with respect to the square of sigma-z to "
          + "zero. With w the square of sigma-z, the derivative of the "
          + "factor w to the minus one times the exponential of minus "
          + "H squared over 2 w is that factor times the bracket of minus "
          + "one plus H squared over 2 w, over w. It vanishes when:",
        eq: String.raw`\sigma_z=\frac{H}{\sqrt{2}}` },
      { step: "Put that spread back: the factor one over sigma-z squared is "
          + "two over H squared and the exponential is one over e.",
        eq: String.raw`C_{\max}=\frac{2\,Q}{\pi\,e\,u\,H^{2}}\,\frac{\sigma_z}{\sigma_y}` },
    ],
    formula: String.raw`C_{\max}=\frac{2\,Q}{\pi\,e\,u\,H^{2}}\,\frac{\sigma_z}{\sigma_y}`,
    where: [
      { sym: "C_{\\max}", means: "largest ground-level concentration on the centre line", unit: "g/m3" },
      { sym: "\\kappa", means: "ratio of sigma-y to sigma-z, taken as constant for the hand check" },
    ],
  },
  {
    n: 7,
    title: "The design question, inverted: the least stack height for a limit",
    body: "The designer is given a limit value for the ground concentration, "
      + "and asks for the shortest stack that keeps the maximum under it. "
      + "The maximum falls as the stack grows, at every distance, so the "
      + "search is a bisection: try a height, find the worst maximum, move "
      + "up or down. The weather is not one condition but whatever the "
      + "picker allows, so the page searches over every class the picker "
      + "gives and keeps the worst. The limit is yours: type the number, "
      + "its source and its date. The page compiles in no limit value and "
      + "no regulation, because limits change and differ by place, by "
      + "species and by averaging time, and a number printed here would "
      + "go stale unseen. A second constraint is regulatory: a stack "
      + "lower than the good-engineering-practice height may be drawn down "
      + "into the wake of a nearby building, where the plume is mixed to "
      + "the ground at once. The page reads that rule as the height of the "
      + "building plus one and a half times the lesser of its height and "
      + "width, and recommends the larger of the two heights. The rule "
      + "also has a 65 m clause that the page names and does not compute.",
    formula: String.raw`C_{\max}\!\left(h_s+\Delta h\right)=C_{\mathrm{lim}},\qquad h_{\mathrm{GEP}}=H_b+1.5\,L,\quad L=\min\left(H_b,\,W_b\right)`,
    where: [
      { sym: "C_{\\mathrm{lim}}", means: "limit value you declare for the ground concentration, with its source and date", unit: "g/m3" },
      { sym: "h_{\\mathrm{GEP}}", means: "good-engineering-practice stack height, from the formula clause", unit: "m" },
      { sym: "H_b", means: "height of the nearby building", unit: "m" },
      { sym: "W_b", means: "projected width of the nearby building", unit: "m" },
      { sym: "L", means: "the lesser dimension of the building, its height or its width", unit: "m" },
    ],
  },
  {
    n: 8,
    title: "The engine half: the flue gas of a real combustor, read, not recomputed",
    body: "Choupo has no fired-unit type with a stack as a sized item: its "
      + "combustors are Gibbs reactors, and a stack, with its diameter and "
      + "height, is not yet an item of the plant. So the engine half does "
      + "the honest thing available. It runs the methane burner at 1800 K "
      + "(gibbs06_thermal_nox), reads the outlet stream, flueGas, and takes "
      + "its flow, its temperature, its pressure and the mole fraction of "
      + "NO from the result. The page only converts units: the emission "
      + "rate of NO, and, for a stack diameter you set and a temperature "
      + "the gas cools to, the exit velocity and with it the buoyancy flux. "
      + "That burner is a laboratory-scale case (about 10 kmol/h of flue "
      + "gas), so the page offers a scale-up by a number of identical "
      + "trains on one stack, which is yours, not the engine's. The "
      + "temperature of the stream is the burner outlet; what the gas "
      + "cools to before the stack is not in the plant, so the stack-gas "
      + "temperature is also yours. The dispersion that follows is the "
      + "page's own arithmetic, the same as the toy above it.",
    formula: String.raw`Q=n_t\,\Phi\,x_{\mathrm{NO}}\,M_{\mathrm{NO}},\qquad V_g=\frac{n_t\,\Phi\,R\,T_s}{P},\qquad v_s=\frac{4\,V_g}{\pi\,d^{2}}`,
    where: [
      { sym: "n_t", means: "number of identical burner trains sharing the stack, your declared scale-up" },
      { sym: "\\Phi", means: "molar flow of the engine's flueGas stream, as the engine reports it", unit: "mol/s" },
      { sym: "x_{\\mathrm{NO}}", means: "mole fraction of NO in that stream, read from the result" },
      { sym: "M_{\\mathrm{NO}}", means: "molar mass of NO, read from the catalogue record", unit: "g/mol" },
      { sym: "V_g", means: "volume flow of the flue gas at the stack temperature, as an ideal gas", unit: "m3/s" },
      { sym: "R", means: "gas constant, 8.314 J/(mol K)" },
      { sym: "P", means: "pressure of the stream, read from the result", unit: "Pa" },
    ],
  },
];

export const STACK_QUIZ: readonly QuizQuestion[] = [
  {
    id: "taller",
    q: "Why does a taller stack lower the ground concentration?",
    options: [
      "The gas is cleaner when it leaves a taller stack",
      "The plume centre is farther above the ground, so the ground is farther out in the bell curve and the plume has more distance to spread before it comes down",
      "The wind is stronger higher up and carries the gas away",
      "The ground absorbs more gas from a taller stack",
    ],
    correct: 1,
    feedback: "Nothing about the gas changes. The exponent H squared over twice "
      + "sigma-z squared grows with the height, and the peak falls roughly as "
      + "one over H squared.",
    steps: [1, 6],
  },
  {
    id: "double",
    q: "With a constant width ratio and no change in the rise, the effective height doubles. What happens to the largest ground concentration?",
    options: ["It halves", "It falls to a quarter", "It falls to an eighth", "It does not change"],
    correct: 1,
    feedback: "C max is proportional to one over H squared, so doubling H "
      + "divides it by four.",
    steps: [6],
  },
  {
    id: "image",
    q: "What does the image source do?",
    options: [
      "It adds a second chimney",
      "It makes the ground reflect the plume, so the ground centre-line value is twice the free-air value at that height",
      "It removes the gas that touches the ground",
      "It doubles the emission rate",
    ],
    correct: 1,
    feedback: "The image is the way to make no gas cross the ground. At the "
      + "ground the two terms are equal, so the ground value is twice the "
      + "single one. The emission rate is not changed.",
    steps: [2],
  },
  {
    id: "night",
    q: "Why can a calm clear night be the worst case far from an elevated stack, while a sunny afternoon is the worst case close to it?",
    options: [
      "The night wind is stronger",
      "Stable air spreads the plume slowly, so it stays aloft close in and arrives little diluted far away; unstable air mixes it down near the stack",
      "The sun makes the gas hotter",
      "Because the stack is shorter at night",
    ],
    correct: 1,
    feedback: "Stable classes have small vertical spread, so their ground "
      + "footprint is far and, far away, their curve is above the unstable "
      + "ones. Unstable classes mix the plume down near the stack, and "
      + "their maximum is high and close. The figure with six curves shows "
      + "them cross.",
    steps: [3, 4, 6],
  },
  {
    id: "classes",
    q: "Why does the design search every class the picker allows rather than the class of the moment?",
    options: [
      "To make the stack taller for no reason",
      "Because the weather changes through the day and the year, and the stack must meet the limit in the worst condition the table allows",
      "Because the table is wrong",
      "Because the classes are averaged",
    ],
    correct: 1,
    feedback: "A stack is built once and the weather is not. The worst "
      + "of the allowed classes sets the height; the figures colour the "
      + "chosen class so you can see which one that is.",
    steps: [3, 7],
  },
  {
    id: "gep",
    q: "A stack meets the limit but is lower than the good-engineering-practice height next to a tall building. What is the concern?",
    options: [
      "None: the limit is met",
      "The plume may be drawn into the building's wake and brought to the ground close by, which the plume equation does not model",
      "The stack will fall over",
      "The limit is too low",
    ],
    correct: 1,
    feedback: "The Gaussian plume has no building wake. The rule keeps the "
      + "stack above the wake as a stated, separate requirement, and the "
      + "recommended height is the larger of the two.",
    steps: [7],
  },
];

export const STACK_LIMITS: readonly LessonLimit[] = [
  {
    id: "two-halves",
    title: "The page has two halves, and the dispersion is in neither of them the engine's.",
    body: "The toy half takes its emission rate from a slider. The engine half "
      + "reads the flue gas stream of a Gibbs reactor and converts its units. "
      + "In both, the dispersion, the classes, the rise and the search are "
      + "this page's own arithmetic: the engine has no dispersion model, and "
      + "a stack as a sized item of the plant does not exist yet.",
  },
  {
    id: "unread",
    title: "Which coefficients were read, and where.",
    body: "Every coefficient was checked against a printed US government "
      + "document: both sigma sets in the Handbook on Atmospheric Diffusion "
      + "(Table 4.5), the urban set and the plume-rise constants and "
      + "stable-air gradients in the EPA's ISC3 user's guide, Turner's table "
      + "of classes in his workbook (Table 3-1) and the good-engineering-"
      + "practice formula in the regulation. The originals of Briggs (1969, "
      + "1973, 1975) and Pasquill (1961) were not seen. One printed "
      + "disagreement is on the page: the handbook's urban E-F sigma-z, "
      + "0.00015, against ISC3's 0.0015 which the page uses. The sources "
      + "list gives the page of each.",
  },
  {
    id: "window",
    title: "The fits hold for about 100 m to 10 km.",
    body: "The page evaluates the maximum inside that window only. A maximum "
      + "at the window's edge is flagged: the true maximum lies outside, and "
      + "for stable air and a tall stack it usually does.",
  },
  {
    id: "flat",
    title: "Flat, open ground, no building wake beyond one rule, no chemistry.",
    body: "No terrain, no hill the plume can meet, no shore, no building wake "
      + "except the good-engineering-practice height as a separate "
      + "constraint, no deposition, no washout and no chemistry in the "
      + "plume (the NO of a flue gas turns into NO2 in the air, which this "
      + "page does not follow).",
  },
  {
    id: "wind",
    title: "One wind speed, at 10 m, at every height; the rise is taken at once.",
    body: "The wind at the plume height is stronger than at 10 m, which "
      + "would dilute more and lower the rise; the page does not apply a "
      + "wind profile. The final rise is placed at the stack, where in "
      + "truth the plume climbs over a few hundred metres, so the very near "
      + "field is flattered.",
  },
  {
    id: "cold-jet",
    title: "A cold jet's momentum rise is not built.",
    body: "With no temperature excess the buoyancy flux is zero and the page "
      + "gives no rise. A real jet still rises by its momentum; no source "
      + "for that law was read, so it is not offered.",
  },
  {
    id: "averaging",
    title: "No averaging-time correction.",
    body: "The fits describe a plume averaged over about ten minutes to an "
      + "hour. A limit stated over a different averaging time, an hour or "
      + "a year, cannot be compared with the page's number without a "
      + "correction the page does not carry.",
  },
  {
    id: "limit",
    title: "The limit value is yours.",
    body: "The page compiles in no limit and no regulation. You type the "
      + "number, its source and its date, and the page repeats them beside "
      + "the answer. A good-engineering-practice height is a regulatory "
      + "definition of a stack height credit, not a guarantee that a plume "
      + "clears a building.",
  },
  {
    id: "not-a-permit",
    title: "A lesson, not a permit calculation.",
    body: "An air-quality assessment follows the model its regulator names, "
      + "with its meteorology, terrain and background, and is reviewed. "
      + "This page teaches why the answer has the shape it has.",
  },
];
