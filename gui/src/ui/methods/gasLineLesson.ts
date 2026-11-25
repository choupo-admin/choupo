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
  The lesson of "How far can a gas line go?" (C506): the compressible
  isothermal gas line of the engine's `pipe` unit.  Prose here quotes no
  number of the run; the numbers on the page are the arithmetic of gasLine.ts
  at the inputs of tutorials/steady/hydraulics/pipe09_isothermal_gas_line,
  held by gasLine.test.ts to that case's golden.

  EVERY CLAIM WAS READ in src/unitOperations/hydraulics/Pipe.cpp (function
  Pipe::solveGasLine):
    * c = P1 / rho1 and Re = G D / mu, the same at every section: 857, 859;
    * the choking pressure G sqrt(c) and the isothermal Mach number there:
      884-885; the inlet already choked: 886-888;
    * (f L/D)_max and L_max: 891-892; a line longer than that: 893-897;
    * the mean-density shortcut P2^2 = P1^2 - c G^2 K: 904; its error
      (P2mean - P2)/P2: 925;
    * the 40 % flag level: 928-932 (a flag, said so in the source comment 927);
    * a sloped line and a gas with no viscosity data are stopped by name:
      835-841; the sentence that adiabatic and Joule-Thomson effects are left
      out, and that Z is held at its inlet value: 942.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";
export type { LessonStep, SymbolGloss };

export const GAS_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A gas speeds up as it loses pressure",
    body: "A liquid in a pipe keeps its density, so the speed is the same "
      + "everywhere and the pressure falls in a straight line.  A gas does "
      + "not: as the pressure falls the gas expands, the same mass flux "
      + "must pass a section, so the speed rises, and friction grows with "
      + "the square of the speed.  The fall of pressure steepens along "
      + "the line.  The engine's pipe takes the temperature as constant "
      + "(the wall supplies whatever heat that takes), the gas as obeying "
      + "P/\\(\\rho\\) = c with c fixed, and the friction factor as the "
      + "same at every section, because the Reynolds number G D/\\(\\mu\\) "
      + "has the mass flux G, which cannot change in a pipe of constant "
      + "area, and a viscosity that depends on temperature only "
      + "(Pipe.cpp:857, Pipe.cpp:859).  Integrating the differential "
      + "balance gives one equation, implicit in the outlet pressure.  "
      + "The page solves it by inverting it at each position x, to draw "
      + "the whole profile.",
    formula: String.raw`P_1^2 - P_2^2 = c\,G^2\left[\frac{f\,L}{D} + 2\ln\frac{P_1}{P_2}\right] \qquad c = \frac{P_1}{\rho_1} = \frac{Z\,R\,T}{M}`,
    where: [
      { sym: "P_1", means: "The pressure at the inlet of the line.", unit: "Pa" },
      { sym: "P_2", means: "The pressure at the outlet of the line (the "
        + "unknown).", unit: "Pa" },
      { sym: "c", means: "The ratio of pressure to density, the same all "
        + "along an isothermal line (Pipe.cpp:857); its square root is the "
        + "isothermal speed of sound.", unit: "m2/s2" },
      { sym: "G", means: "The mass flux, the mass flow over the pipe's "
        + "cross-section: constant along a pipe of constant area.",
        unit: "kg/(m2 s)" },
      { sym: "f", means: "The Darcy friction factor from the same "
        + "correlation as the liquid pipe (Churchill), evaluated once.",
        unit: "-" },
      { sym: "L", means: "The length of the line.", unit: "m" },
      { sym: "D", means: "The internal diameter of the pipe.", unit: "m" },
      { sym: "\\rho_1", means: "The gas density at the inlet.", unit: "kg/m3" },
      { sym: "Z", means: "The compressibility factor at the inlet, held "
        + "constant along the line (Pipe.cpp:942); 1 for the ideal gas.",
        unit: "-" },
      { sym: "R", means: "The universal gas constant.", unit: "J/(mol K)" },
      { sym: "T", means: "The temperature, held constant along the line.",
        unit: "K" },
      { sym: "M", means: "The molar mass of the gas.", unit: "kg/mol" },
      { sym: "P", means: "The pressure at a section of the line.", unit: "Pa" },
      { sym: "\\rho", means: "The gas density at a section, P/c.", unit: "kg/m3" },
      { sym: "u", means: "The speed of the gas at a section, G c / P.", unit: "m/s" },
      { sym: "x", means: "The distance from the inlet along the line.", unit: "m" },
    ],
    derivation: [
      { step: "Write the mechanical-energy balance on a slice of pipe, with Darcy friction, dividing the slice by its density.",
        eq: String.raw`\frac{\mathrm{d}P}{\rho} + u\,\mathrm{d}u + \frac{f}{2D}\,u^2\,\mathrm{d}x = 0` },
      { step: "Put in the isothermal gas, density P/c and speed u = G c / P, and multiply by P squared over c squared.",
        eq: String.raw`\frac{P}{c}\,\mathrm{d}P - \frac{G^2}{P}\,\mathrm{d}P + \frac{f\,G^2}{2D}\,\mathrm{d}x = 0` },
      { step: "Integrate from the inlet to a position x.",
        eq: String.raw`P_1^2 - P^2 = c\,G^2\left[\frac{f\,x}{D} + 2\ln\frac{P_1}{P}\right]` },
    ],
    note: "The logarithm is the gas accelerating.  It is the only difference "
      + "between this equation and the one written with an average density.  "
      + "The page's pipe carries no fittings, so the sum of their loss "
      + "coefficients, which the engine adds to f L/D, is zero here.",
  },
  {
    n: 2,
    title: "Why the mean-density shortcut fails",
    body: "A common shortcut treats the gas as a liquid of the arithmetic-"
      + "mean density.  Written out, it is the exact equation with the "
      + "logarithm dropped (Pipe.cpp:904).  The logarithm is small while the "
      + "pressure falls by only a little, and the shortcut is then good.  "
      + "As the line lengthens the pressure falls further, the gas "
      + "accelerates more, and the term the shortcut ignores grows; its "
      + "error grows without bound as the line nears the limit of step 3.  "
      + "The engine prints both outlet pressures and the error of the "
      + "shortcut (Pipe.cpp:925), so a student sees where it stops "
      + "being safe.  The engine also raises a flag when the pressure falls "
      + "by more than 40 % of the inlet pressure (Pipe.cpp:928).  That "
      + "level is the engine's own choice of where the isothermal assumption "
      + "starts to look weak, not a bound derived from the equations; the "
      + "page marks it as such.",
    formula: String.raw`P_{2,m}^2 = P_1^2 - c\,G^2\,\frac{f\,L}{D} \qquad \varepsilon_P = \frac{P_{2,m} - P_2}{P_2}`,
    where: [
      { sym: "P_{2,m}", means: "The outlet pressure by the mean-density "
        + "shortcut.", unit: "Pa" },
      { sym: "\\varepsilon_P", means: "The relative error of the shortcut's "
        + "outlet pressure against the exact one (Pipe.cpp:925); positive "
        + "when the shortcut gives a pressure that is too high.", unit: "-" },
    ],
    note: "The error of the pressure drop is a different number from the "
      + "error of the outlet pressure: a small error in the outlet "
      + "pressure of a line that has lost most of its pressure is a large "
      + "error in the drop.  The table on the page prints both.",
  },
  {
    n: 3,
    title: "Choking: the longest line a flow can use",
    body: "Solve the differential form for the gradient: it has the "
      + "factor P/c - G squared over P in its denominator, which vanishes "
      + "at P equal to G times the square root of c.  The gradient grows "
      + "without limit there: that pressure is the choking pressure "
      + "(Pipe.cpp:884).  At it, the speed equals the square root of c, so "
      + "the isothermal Mach number, the speed over the root of c, is 1.  "
      + "A subsonic isothermal flow cannot cross that pressure.  Setting the "
      + "outlet at it in the exact equation gives the longest line the inlet "
      + "state can carry (Pipe.cpp:891-892).  The engine stops a line longer "
      + "than that, and says so by name, with the advice to shorten the "
      + "line, enlarge the diameter or lower the flow (Pipe.cpp:893-897); "
      + "an inlet already at the limit is stopped the same way "
      + "(Pipe.cpp:886-888).  The isothermal limit is not the adiabatic "
      + "one: the speed of sound of an adiabatic gas is larger by the "
      + "square root of the heat-capacity ratio, so the isothermal Mach "
      + "number 1 is the adiabatic Mach number 1 over the root of that ratio "
      + "(0.845 for a diatomic ideal gas, a number the page assumes: the "
      + "engine does not use the ratio).",
    formula: String.raw`P_\mathrm{ch} = G\sqrt{c} \qquad \mathrm{Ma}_T = \frac{u}{\sqrt{c}} = \frac{P_\mathrm{ch}}{P} \qquad \left(\frac{f\,L}{D}\right)_\mathrm{max} = \frac{P_1^2 - P_\mathrm{ch}^2}{c\,G^2} - 2\ln\frac{P_1}{P_\mathrm{ch}}`,
    where: [
      { sym: "P_\\mathrm{ch}", means: "The choking pressure: the pressure "
        + "at which the isothermal Mach number is 1 (Pipe.cpp:884).",
        unit: "Pa" },
      { sym: "\\mathrm{Ma}_T", means: "The isothermal Mach number, the "
        + "speed over the square root of c; 1 at the choking pressure.",
        unit: "-" },
    ],
    note: "What the model leaves out is what a real choked line would do: "
      + "it chokes at its exit, and the state upstream is then set by the "
      + "exit.  The equation holds only below its limit, and the page says "
      + "where the limit is.",
  },
];

export const GAS_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "isothermal",
    title: "Isothermal, by assumption.",
    body: "The engine holds the temperature at the inlet value along the whole "
      + "line, as the engine's own result block says: \"adiabatic and "
      + "Joule-Thomson effects are not modelled\" (Pipe.cpp:942).  A real "
      + "gas that expands cools, and a real wall supplies only part of "
      + "the heat that would hold T.  The faster the gas, the weaker the "
      + "assumption, which is what the 40 % flag stands for.",
  },
  {
    id: "flag-level",
    title: "The 40 % flag is the engine's choice.",
    body: "Pipe.cpp:928 raises the advisory when the pressure falls by more "
      + "than 0.4 of the inlet pressure.  The source comment calls it a "
      + "flag level and not a derived bound (Pipe.cpp:927).  The page draws "
      + "it where the engine prints it, and claims nothing for it.",
  },
  {
    id: "compressibility-held",
    title: "Z is held at its inlet value.",
    body: "c is the inlet ratio P/\\(\\rho\\) and is used all along the line "
      + "(Pipe.cpp:857, 942).  For a gas near its ideal-gas range that "
      + "is a good model; at a high pressure Z varies along the line and "
      + "the page does not follow it.  The page also holds the gas viscosity "
      + "at the case's value, which is the engine's own for this "
      + "temperature (a function of T only).",
  },
  {
    id: "horizontal",
    title: "A horizontal line.",
    body: "The engine stops a sloped line by name (Pipe.cpp:835-836): the "
      + "elevation head of a gas of varying density is not in the equation.  "
      + "The same goes for a gas with no viscosity data in the property "
      + "dictionary (Pipe.cpp:839-840): Re needs one, and it is never typed "
      + "into the pipe.",
  },
  {
    id: "one-diameter-no-fittings",
    title: "One diameter, no fittings, one gas.",
    body: "The page fixes the case's nitrogen, pressure, temperature, "
      + "diameter and roughness and moves only the flow and the length.  "
      + "The engine adds the loss coefficients of fittings to f L/D "
      + "(Pipe.cpp:893-894); the page has none.  A change in diameter "
      + "along the line, a branch or a compressor is another unit.",
  },
  {
    id: "beyond-choking",
    title: "Past the limit, the page says nothing.",
    body: "Where the engine stops the run, the chart stops too.  A real line "
      + "longer than L_max chokes at its exit and its upstream pressure is "
      + "set there: that is a different problem from this equation.",
  },
];

export const GAS_QUIZ: readonly QuizQuestion[] = [
  {
    id: "why-curve", steps: [1],
    q: "A gas flows through a long pipe at a steady mass flow. Why does the pressure fall more steeply near the outlet than near the inlet?",
    options: [
      "The gas expands as the pressure falls, so its speed rises, and friction grows with the square of the speed",
      "The pipe is rougher near the outlet",
      "The friction factor grows along the line",
      "The mass flux grows along the line",
    ],
    correct: 0,
    feedback: "The mass flux is the same at every section of a pipe of "
      + "constant area, and the friction factor too, because Re = G D / mu "
      + "does not change; what changes is the density, falling with the "
      + "pressure, so the speed u = G / rho rises and friction per metre "
      + "with it (step 1).",
  },
  {
    id: "what-the-log-is", steps: [1, 2],
    q: "What does the logarithmic term of the exact equation stand for, and what does the mean-density shortcut do with it?",
    options: [
      "It is the acceleration of the gas; the shortcut drops it",
      "It is the friction; the shortcut keeps it and drops the pressure",
      "It is the elevation head; the shortcut keeps it",
      "It is the heat supplied by the wall; the shortcut doubles it",
    ],
    correct: 0,
    feedback: "The term comes from the u du part of the balance, the kinetic "
      + "energy gained as the gas speeds up.  The shortcut is the exact "
      + "equation without it (steps 1 and 2).",
  },
  {
    id: "shortcut-fails-when", steps: [2],
    q: "When is the mean-density shortcut accurate for the outlet pressure?",
    options: [
      "When the relative pressure drop is small",
      "When the line is long",
      "When the gas is heavier than air",
      "Always, because the density is the mean of the two ends",
    ],
    correct: 0,
    feedback: "The ignored logarithm is small while P_1/P_2 is near 1.  "
      + "Its error grows without bound as the line nears the limit of "
      + "step 3 (step 2).",
  },
  {
    id: "flag-meaning", steps: [2],
    q: "The engine raises an advisory when the pressure falls by more than 40 % of the inlet pressure. What is that level?",
    options: [
      "The engine's own flag level, not a bound derived from the equations",
      "The pressure at which the gas chokes",
      "The pressure at which the shortcut becomes exact",
      "The limit of the friction factor correlation",
    ],
    correct: 0,
    feedback: "The source says it is a flag, not a derived bound: the isothermal "
      + "assumption looks weaker as the speeds rise, and 40 % is where the "
      + "engine chose to say so (step 2).",
  },
  {
    id: "choking", steps: [3],
    q: "A line of the engine's pipe is lengthened until its outlet pressure reaches G sqrt(c). What happens to the pressure gradient there, and what does the engine do beyond it?",
    options: [
      "It grows without bound; the engine stops a longer line and names the longest one",
      "It falls to zero; the engine continues with a lower flow",
      "It stays finite; the engine switches to the shortcut",
      "It reverses sign; the engine prints a negative drop",
    ],
    correct: 0,
    feedback: "The denominator P/c - G^2/P of the gradient vanishes at "
      + "P = G sqrt(c), where the isothermal Mach number is 1.  The steady "
      + "equation cannot be solved for a longer line, and the engine says "
      + "so by name with L_max (step 3).",
  },
  {
    id: "mach-adiabatic", steps: [3],
    q: "At the isothermal choking pressure the isothermal Mach number is 1. What is the corresponding Mach number measured with the adiabatic speed of sound, for a gas of heat-capacity ratio gamma?",
    options: [
      "1 divided by the square root of gamma",
      "The square root of gamma",
      "Exactly 1 as well",
      "Gamma",
    ],
    correct: 0,
    feedback: "The adiabatic speed of sound is sqrt(gamma c), larger than "
      + "sqrt(c) by sqrt(gamma), so u / sqrt(gamma c) = 1 / sqrt(gamma) "
      + "when u = sqrt(c): 0.845 for gamma = 1.4 (step 3).",
  },
];
