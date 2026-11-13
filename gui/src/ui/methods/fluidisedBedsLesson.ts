/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  fluidisedBedsLesson — the lesson text of the `fluidised-beds` EduTool: a
  bed of particles and a gas; at what velocity does it fluidise, what regime
  will it be in, how much does it expand, and how much gas bypasses the
  particles?

  Every number the page shows is its own arithmetic
  (gui/src/case/fluidisedBeds.ts): Choupo's engine has no fluidised bed.
  The design record says what was measured, what is proposed for the engine
  and which published constants are still to be checked against their
  sources: docs/design/fluidised-bed-hydrodynamics.md.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const FLUID_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "From a packed bed to a fluidised one",
    body: "Blow a gas up through a bed of particles resting on a perforated plate.  At low "
      + "velocity the bed stays put and the gas loses pressure squeezing through the gaps, "
      + "more the faster it goes: that is Ergun's equation, a viscous term proportional to "
      + "the velocity and an inertial term proportional to its square.  The bed is held "
      + "down by its own weight, less the buoyancy of the gas.  When the pressure drop "
      + "across the bed equals that weight per unit of cross-section, the gas carries the "
      + "particles: they lift apart, the bed behaves like a liquid, and blowing harder no "
      + "longer raises the pressure drop -- the extra gas has nothing more to hold up.  "
      + "The velocity at which this happens is the MINIMUM FLUIDISATION VELOCITY, u_mf.  "
      + "The page finds it as the root of the gap between Ergun's line and the weight "
      + "line, by bisection on a bracket that always holds (the gap is negative at zero "
      + "velocity and grows without limit), and prints the quadratic formula's answer "
      + "beside it as a check.  Beside both it prints Wen and Yu's correlation, which "
      + "replaces the voidage terms by two fitted constants so that u_mf can be "
      + "estimated without knowing the voidage at all.",
    derivation: [
      { step: "A force balance on the bed at the point of fluidisation, per unit of "
          + "cross-section: the pressure drop carries the particles' weight less their "
          + "buoyancy.  The particles fill a fraction 1 − ε_mf of the bed:",
        eq: String.raw`\frac{\Delta P}{L_\mathrm{mf}} = (1 - \varepsilon_\mathrm{mf})\,(\rho_p - \rho_g)\, g` },
      { step: "Ergun's pressure gradient through a packed bed of spheres of diameter d_p, at "
          + "superficial velocity u:",
        eq: String.raw`\frac{\Delta P}{L} = 150\,\frac{(1-\varepsilon)^2}{\varepsilon^3}\,\frac{\mu\, u}{d_p^2} + 1.75\,\frac{1-\varepsilon}{\varepsilon^3}\,\frac{\rho_g\, u^2}{d_p}` },
      { step: "Setting the two equal at ε = ε_mf and multiplying by ρ_g d_p³/(μ²(1 − ε_mf)) "
          + "gives one equation between two dimensionless groups:",
        eq: String.raw`\frac{1.75}{\varepsilon_\mathrm{mf}^3}\,\mathrm{Re}_\mathrm{mf}^2 + \frac{150\,(1-\varepsilon_\mathrm{mf})}{\varepsilon_\mathrm{mf}^3}\,\mathrm{Re}_\mathrm{mf} = \mathrm{Ar}` },
      { step: "That is a quadratic in Re_mf.  Wen and Yu wrote its positive root with the "
          + "two voidage coefficients replaced by constants fitted to many beds:",
        eq: String.raw`\mathrm{Re}_\mathrm{mf} = \sqrt{C_1^2 + C_2\,\mathrm{Ar}} - C_1, \qquad C_1 = 33.7,\; C_2 = 0.0408` },
    ],
    formula: String.raw`\begin{aligned} \mathrm{Ar} &= \frac{g\, d_p^3\, \rho_g\, (\rho_p - \rho_g)}{\mu^2} \\ \mathrm{Re}_\mathrm{mf} &= \frac{\rho_g\, u_\mathrm{mf}\, d_p}{\mu} \end{aligned}`,
    where: [
      { sym: "\\Delta P", means: "pressure drop across the bed", unit: "Pa" },
      { sym: "L", means: "height of the packed bed", unit: "m" },
      { sym: "L_\\mathrm{mf}", means: "height of the bed at minimum fluidisation", unit: "m" },
      { sym: "\\varepsilon", means: "voidage of the bed: the volume fraction of gas between the particles" },
      { sym: "\\varepsilon_\\mathrm{mf}", means: "voidage at minimum fluidisation" },
      { sym: "\\rho_p", means: "particle density, pores included", unit: "kg/m³" },
      { sym: "\\rho_g", means: "gas density", unit: "kg/m³" },
      { sym: "g", means: "acceleration of gravity, 9.80665", unit: "m/s²" },
      { sym: "\\mu", means: "gas viscosity", unit: "Pa s" },
      { sym: "u", means: "superficial gas velocity: the volumetric flow over the empty cross-section", unit: "m/s" },
      { sym: "u_\\mathrm{mf}", means: "minimum fluidisation velocity", unit: "m/s" },
      { sym: "d_p", means: "particle diameter (a sphere)", unit: "m" },
      { sym: "\\mathrm{Ar}", means: "Archimedes number: buoyant weight against viscous forces, independent of u" },
      { sym: "\\mathrm{Re}_\\mathrm{mf}", means: "particle Reynolds number at minimum fluidisation" },
      { sym: "C_1", means: "Wen and Yu's first constant" },
      { sym: "C_2", means: "Wen and Yu's second constant" },
    ],
    note: "Compare C_2 with the quadratic above: C_2 = ε_mf³/1.75 for a sphere, which "
      + "fixes ε_mf at (1.75 × 0.0408)^(1/3) = 0.415.  So the correlation is Ergun at one "
      + "voidage, and its C_1 then matches no sphere: the fit absorbed a shape factor.  "
      + "That is why the two answers on the page disagree, and by how much depends mainly "
      + "on the voidage you declare -- ε³ sits in both of Ergun's terms.  Wen and Yu's "
      + "own statement of its accuracy is not reproduced here: it has not been checked "
      + "against their paper (design record).",
  },
  {
    n: 2,
    title: "What kind of powder: Geldart's groups",
    body: "Not every powder fluidises the same way, and two numbers sort most of them: the "
      + "particle size and the density difference between particle and gas.  Geldart "
      + "drew the map on log axes and named four groups.  Fine, light powders (group C) "
      + "are cohesive: the forces between particles beat the drag, the gas opens channels "
      + "and the bed does not fluidise properly.  Slightly larger ones (group A) expand "
      + "smoothly with no bubbles above u_mf and only bubble at a higher velocity.  Sand-"
      + "like powders (group B) bubble as soon as they fluidise.  Large or dense particles "
      + "(group D) make big, slow bubbles and can spout.  The boundaries on this page are "
      + "STRAIGHT LINES ON LOG AXES that the page uses as an APPROXIMATION of the published "
      + "map; the map itself is not traced, and the C/A boundary is in reality a band.",
    formula: String.raw`\begin{aligned} \text{C:}&\;\; \Delta\rho\, d^2 < 1600 \\ \text{A:}&\;\; \Delta\rho\, d < 225 \\ \text{B:}&\;\; \Delta\rho\, d^2 < 10^6 \\ \text{D:}&\;\; \text{otherwise} \end{aligned}`,
    where: [
      { sym: "\\Delta\\rho", means: "density difference ρ_p − ρ_g, in g/cm³ for these lines", unit: "g/cm³" },
      { sym: "d", means: "mean particle diameter, in micrometres for these lines", unit: "µm" },
    ],
    note: "The three numbers are the page's approximation and are marked unchecked in the "
      + "design record: they are tested in order (C first), and a point near a line is a "
      + "powder whose behaviour a test in the laboratory decides, not a line on a chart.",
  },
  {
    n: 3,
    title: "The velocities that bound the regime",
    body: "Raise the gas velocity from zero and the bed passes through a sequence of "
      + "regimes.  Below u_mf it is a FIXED BED.  For a group A powder there is then a "
      + "window of smooth, bubble-free expansion up to the MINIMUM BUBBLING VELOCITY u_mb; "
      + "Abrahamsen and Geldart's correlation for it is empirical and dimensional (SI "
      + "units only).  For B and D powders bubbling starts at u_mf.  Faster still, the "
      + "bubbles break up and the bed becomes TURBULENT; faster again, the particles are "
      + "carried out of the top as fast as they are fed, and the bed is in FAST "
      + "FLUIDISATION or PNEUMATIC TRANSPORT -- which of the two depends on how fast "
      + "solids are returned, a number this page does not take.  The page places those "
      + "two onsets with Bi and Grace's correlations in Ar.  The single particle's "
      + "TERMINAL VELOCITY u_t is the speed at which drag balances its weight less "
      + "buoyancy: a particle in gas faster than u_t is carried up.  The page solves the "
      + "drag balance by bisection on the Reynolds number with Schiller and Naumann's drag "
      + "coefficient, the law the engine's pneumatic conveyor uses, which becomes Stokes' "
      + "law at low Re and a constant 0.44 above Re = 1000.",
    derivation: [
      { step: "The forces on one sphere falling at its terminal velocity: drag equals "
          + "weight less buoyancy:",
        eq: String.raw`\tfrac{1}{2}\, \rho_g\, u_t^2\, C_D\, \frac{\pi d_p^2}{4} = \frac{\pi d_p^3}{6}\,(\rho_p - \rho_g)\, g` },
      { step: "Multiplied by ρ_g d_p²/μ², u_t disappears into the Reynolds number and the "
          + "right-hand side becomes the Archimedes number; C_D Re² rises steadily with Re, "
          + "so there is one root and a bracket always holds it:",
        eq: String.raw`C_D(\mathrm{Re}_t)\, \mathrm{Re}_t^2 = \tfrac{4}{3}\,\mathrm{Ar}, \qquad \mathrm{Re}_t = \frac{\rho_g\, u_t\, d_p}{\mu}` },
      { step: "Schiller and Naumann's drag coefficient; at small Re it tends to 24/Re, which "
          + "is Stokes' law:",
        eq: String.raw`C_D = \frac{24}{\mathrm{Re}}\left(1 + 0.15\,\mathrm{Re}^{0.687}\right) \;\; (\mathrm{Re} < 1000), \qquad C_D = 0.44 \;\; (\mathrm{Re} \ge 1000)` },
      { step: "Stokes' law, the limit, printed beside the page's answer:",
        eq: String.raw`u_\mathrm{Stokes} = \frac{g\, d_p^2\,(\rho_p - \rho_g)}{18\,\mu}` },
      { step: "Abrahamsen and Geldart's minimum bubbling velocity for a group A powder with "
          + "a mass fraction F of fines below 45 µm (SI units):",
        eq: String.raw`u_\mathrm{mb} = 2.07\, e^{0.716 F}\, \frac{d_p\, \rho_g^{0.06}}{\mu^{0.347}}` },
      { step: "Bi and Grace's onsets of the turbulent regime and of significant entrainment, "
          + "as Reynolds numbers built on u_c and u_se:",
        eq: String.raw`\mathrm{Re}_c = 1.24\,\mathrm{Ar}^{0.45}, \qquad \mathrm{Re}_\mathrm{se} = 1.53\,\mathrm{Ar}^{0.5}` },
    ],
    formula: String.raw`\frac{u}{u_\mathrm{mf}}`,
    where: [
      { sym: "u_t", means: "terminal velocity of a single particle", unit: "m/s" },
      { sym: "C_D", means: "drag coefficient of a sphere" },
      { sym: "\\pi", means: "the ratio of a circle's circumference to its diameter" },
      { sym: "C_D(\\mathrm{Re}_t)", means: "the drag coefficient at the terminal Reynolds number" },
      { sym: "\\mathrm{Re}_t", means: "particle Reynolds number at the terminal velocity" },
      { sym: "\\mathrm{Re}", means: "particle Reynolds number ρ_g u d_p/μ" },
      { sym: "u_\\mathrm{Stokes}", means: "terminal velocity by Stokes' law", unit: "m/s" },
      { sym: "u_\\mathrm{mb}", means: "minimum bubbling velocity (group A)", unit: "m/s" },
      { sym: "e", means: "the base of natural logarithms" },
      { sym: "F", means: "mass fraction of fines below 45 µm" },
      { sym: "\\mathrm{Re}_c", means: "Reynolds number at the onset of turbulent fluidisation, ρ_g u_c d_p/μ" },
      { sym: "\\mathrm{Re}_\\mathrm{se}", means: "Reynolds number at the onset of significant entrainment, ρ_g u_se d_p/μ" },
      { sym: "u", means: "the superficial velocity you operate at", unit: "m/s" },
      { sym: "u_\\mathrm{mf}", means: "minimum fluidisation velocity, from step 1", unit: "m/s" },
    ],
    note: "A bed is usually run at a few times u_mf and well below u_t of the particles it "
      + "is meant to keep.  Every constant in this step (Schiller-Naumann's, Abrahamsen "
      + "and Geldart's, Bi and Grace's, the Stokes and Newton limits of the regimes) is "
      + "marked unchecked in the design record; an Ar outside the range the page takes "
      + "for Bi and Grace is flagged on the page, never clipped.",
  },
  {
    n: 4,
    title: "Bubbles, expansion and the gas that bypasses",
    body: "Above minimum bubbling, the simplest picture -- the TWO-PHASE idea -- says the "
      + "emulsion of particles and gas stays at minimum fluidisation, and every bit of gas "
      + "beyond u_mf rises through the bed as BUBBLES.  A bubble is nearly free of "
      + "particles.  Around a fast bubble the gas circulates in a thin CLOUD; behind it "
      + "a WAKE drags particles up; the rest of the bed is the EMULSION.  Gas reaches the "
      + "particles only by leaving the bubble into its cloud, so bubble gas that crosses "
      + "the bed without exchanging has BYPASSED the solid.  Bubbles grow as they rise "
      + "(they coalesce), a big bubble rises faster and has less surface per volume, so "
      + "growth lets more gas through untouched.  The page sizes the bubbles with Mori and "
      + "Wen's correlation along the height, expands the bed by the bubble volume, and "
      + "integrates the bubble-to-cloud exchange of Kunii and Levenspiel up the bed -- "
      + "once with the bubbles growing and once frozen at their size at the distributor, "
      + "to show what growth costs.  The REACTOR consequence, in words: a catalyst in a "
      + "fluidised bed converts less than the same mass of catalyst in a plug-flow packed "
      + "bed, because part of the gas never meets it.  The page does not build the reactor "
      + "model.",
    derivation: [
      { step: "Two-phase idea: the excess gas rises as bubbles, each at the rise velocity of "
          + "a single bubble plus the excess flow; the bubbles occupy a fraction δ of the bed:",
        eq: String.raw`u_b = u - u_\mathrm{mf} + 0.711\sqrt{g\, d_b}, \qquad \delta = \frac{u - u_\mathrm{mf}}{u_b}` },
      { step: "The particles do not change: the emulsion keeps the voidage of minimum "
          + "fluidisation, and the bed expands by the volume of the bubbles:",
        eq: String.raw`(1 - \varepsilon_\mathrm{mf})\, L_\mathrm{mf} = (1-\bar{\delta})(1-\varepsilon_\mathrm{mf})\, H \;\Rightarrow\; H = \frac{L_\mathrm{mf}}{1-\bar{\delta}}` },
      { step: "Mori and Wen's bubble diameter at a height h above a perforated plate with n_d "
          + "orifices, published in centimetres and seconds (the page converts):",
        eq: String.raw`d_b = d_\mathrm{bm} - (d_\mathrm{bm} - d_\mathrm{b0})\, e^{-0.3 h/D_t}, \quad d_\mathrm{bm} = 0.652\,\left[A_t (u - u_\mathrm{mf})\right]^{0.4}, \quad d_\mathrm{b0} = 0.347\left[\frac{A_t (u - u_\mathrm{mf})}{n_d}\right]^{0.4}` },
      { step: "Kunii and Levenspiel's exchange coefficient between bubble and cloud, per "
          + "unit bubble volume (cgs units); the fraction Y of the bubble gas not yet "
          + "exchanged falls along the rise:",
        eq: String.raw`K_\mathrm{bc} = 4.5\,\frac{u_\mathrm{mf}}{d_b} + 5.85\,\frac{D^{1/2} g^{1/4}}{d_b^{5/4}}, \qquad \frac{\mathrm{d}Y}{\mathrm{d}h} = -\frac{K_\mathrm{bc}}{u_b}\, Y` },
    ],
    formula: String.raw`\psi = \frac{u - u_\mathrm{mf}}{u}\, \exp\!\left(-\int_0^H \frac{K_\mathrm{bc}}{u_b}\,\mathrm{d}h\right)`,
    where: [
      { sym: "u_b", means: "rise velocity of the bubbles in the bed", unit: "m/s" },
      { sym: "u", means: "superficial gas velocity", unit: "m/s" },
      { sym: "u_\\mathrm{mf}", means: "minimum fluidisation velocity", unit: "m/s" },
      { sym: "g", means: "acceleration of gravity", unit: "m/s²" },
      { sym: "d_b", means: "bubble diameter at height h", unit: "m (cm in the correlations)" },
      { sym: "\\delta", means: "volume fraction of the bed occupied by bubbles" },
      { sym: "\\bar{\\delta}", means: "δ averaged over the expanded bed" },
      { sym: "\\varepsilon_\\mathrm{mf}", means: "voidage at minimum fluidisation (of the emulsion)" },
      { sym: "L_\\mathrm{mf}", means: "bed height at minimum fluidisation", unit: "m" },
      { sym: "H", means: "expanded bed height", unit: "m" },
      { sym: "h", means: "height above the distributor", unit: "m" },
      { sym: "D_t", means: "bed diameter", unit: "m" },
      { sym: "d_\\mathrm{bm}", means: "the largest bubble the bed allows (all bubbles coalesced)", unit: "cm" },
      { sym: "d_\\mathrm{b0}", means: "bubble diameter just above the distributor", unit: "cm" },
      { sym: "A_t", means: "cross-section of the bed", unit: "cm²" },
      { sym: "n_d", means: "number of orifices in the distributor plate" },
      { sym: "K_\\mathrm{bc}", means: "bubble-to-cloud gas exchange coefficient, per bubble volume", unit: "1/s" },
      { sym: "D", means: "molecular diffusivity of the gas", unit: "cm²/s in the correlation" },
      { sym: "Y", means: "fraction of the gas that entered a bubble still in it, unexchanged" },
      { sym: "\\mathrm{d}Y/\\mathrm{d}h", means: "rate at which that fraction falls with height", unit: "1/m" },
      { sym: "\\mathrm{d}Y", means: "change of that fraction" },
      { sym: "\\mathrm{d}h", means: "a small rise in height", unit: "m" },
      { sym: "\\psi", means: "fraction of ALL the gas that crosses the bed without leaving its bubble" },
      { sym: "\\exp", means: "the exponential function" },
    ],
    note: "The exponent is the number of times the bubble gas is renewed on its way up.  "
      + "Small bubbles in a shallow bed of fine powder renew it many times and ψ is "
      + "negligible; large bubbles in a deep bed renew it only a few times and a "
      + "noticeable share of the gas never meets the solid.  Counting the cloud as contact "
      + "with the emulsion is an approximation of this page; the constants 0.711, 0.652, "
      + "0.347, 0.3, 4.5 and 5.85 are marked unchecked in the design record.",
    leadsTo: {
      tool: "levenspiel", toolLabel: "Reactor sizing (Levenspiel)",
      stepTitle: "The plot that turns a rate into a volume",
      body: "The plug-flow reactor a fluidised bed falls short of: how its volume follows "
        + "from the rate, and why mixing and bypassing cost conversion.",
    },
  },
  {
    n: 5,
    title: "Elutriation, and where the fines go",
    body: "A real powder is a spread of sizes.  Every size class has its own terminal "
      + "velocity, and at a given gas velocity the classes whose u_t is below it can be "
      + "carried out of the top of the bed: they are ELUTRIATED.  The page lists the "
      + "classes of a size distribution you type, each with its u_t from step 3, marks "
      + "those the gas can carry, and finds the CUT DIAMETER where u_t = u.  What is "
      + "carried out does not settle back by itself; it goes to a cyclone, which spins "
      + "the gas and returns the particles it catches to the bed.  The engine has the "
      + "cyclone (unit `cyclone`, with several published efficiency models, worked in "
      + "tutorials/steady/gas-solid/cyclone01_dust_removal).  The page does not compute "
      + "an elutriation RATE: that needs the rate constants of an entrainment "
      + "correlation and the height of the freeboard above the bed, neither of which is "
      + "on this page.",
    formula: String.raw`u_t(d_\mathrm{cut}) = u`,
    where: [
      { sym: "u_t", means: "terminal velocity of a particle of a given size", unit: "m/s" },
      { sym: "u_t(d_\\mathrm{cut})", means: "the terminal velocity of the cut size" },
      { sym: "d_\\mathrm{cut}", means: "the largest particle the gas can carry out", unit: "m" },
      { sym: "u", means: "superficial gas velocity", unit: "m/s" },
    ],
    note: "A particle smaller than the cut size CAN leave; whether it does depends on the "
      + "freeboard, on how it is thrown up by the bursting bubbles, and on the time it "
      + "spends in the gas above the bed.  The table answers which classes are at risk, "
      + "not how fast they go.",
  },
  {
    n: 6,
    title: "Limits, and where to go next",
    body: "Everything on the page rests on smooth, spherical particles in one gas, at one "
      + "temperature, in a bed whose particles are of nearly one size (unless the size "
      + "table of step 5 is used).  The wall, the distributor's own pressure drop and "
      + "the jets at its orifices are not modelled.  Every correlation on the page is "
      + "empirical, and each is only as good as the beds it was fitted to.  The engine "
      + "has no fluidised bed at all: no minimum fluidisation, no expansion, no bubbles.  "
      + "The other way to hold particles in a gas is not to move them at all: a fixed bed.",
    leadsTo: {
      tool: "breakthrough", toolLabel: "Adsorption breakthrough",
      stepTitle: "A bed has no steady state",
      body: "A packed bed of adsorbent, held still below u_mf: the same particles used as a "
        + "fixed contactor, and why it never reaches a steady state.",
    },
  },
];

export const FLUID_LIMITS: readonly LessonLimit[] = [
  {
    id: "spheres",
    title: "Smooth spheres.",
    body: "Ergun's equation, the drag law and the terminal velocity are written for "
      + "spheres; a real particle needs a shape factor that this page does not take.",
  },
  {
    id: "one-gas",
    title: "One gas, isothermal, declared.",
    body: "The gas density is the ideal-gas law at the T, P and molar mass you type, and "
      + "its viscosity is typed; the bed is at one temperature throughout.",
  },
  {
    id: "narrow-psd",
    title: "A narrow size distribution.",
    body: "Steps 1 to 4 use one particle diameter.  A wide distribution fluidises "
      + "differently (the fines lubricate, the coarse settle); only step 5 uses sizes.",
  },
  {
    id: "no-wall",
    title: "No wall, no distributor.",
    body: "Wall friction, slugging in a narrow column, the distributor's own pressure drop "
      + "and the jets above its orifices are not modelled.",
  },
  {
    id: "empirical",
    title: "Every correlation is empirical.",
    body: "Wen-Yu, Geldart's boundaries, Abrahamsen-Geldart, Bi-Grace, Mori-Wen and the "
      + "bubble-cloud exchange were each fitted to particular beds.  Their published "
      + "accuracies are not quoted here because they have not been checked against the "
      + "papers; an input outside a range the page knows for a correlation is flagged, "
      + "never clipped.",
  },
  {
    id: "no-engine",
    title: "This page's arithmetic, not the engine's.",
    body: "Choupo's engine has no fluidised-bed model.  It has Ergun's fixed-bed pressure "
      + "drop (in the plug-flow reactor), a single particle's terminal velocity (in the "
      + "pneumatic conveyor) and the cyclone; this page writes the first two in the same "
      + "form and computes everything else in the browser.",
  },
];
