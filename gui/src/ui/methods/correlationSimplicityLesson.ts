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
  correlationSimplicityLesson -- the text of "Why engineering correlations
  are simple: from dimensional analysis to master and slave scales" (DEV.md
  4c C119).

  THE ARGUMENT IS VITOR'S, and the scope he approved on 2026-10-20: the
  Buckingham Pi theorem only REDUCES the number of variables -- f = Phi(Re,
  eps/D) is still an arbitrary function -- and the gain that matters, few
  variables AND a very simple equation that fits to a design tolerance, comes
  from somewhere else: from asymptotic regimes in which a group drops out or
  enters as a power, from the separation of scales in which fast effects
  follow slow ones, and (the sobering third) from the narrow range and the
  generous tolerance of the correlation itself.  FIVE pages, the examples
  FRICTION and NUSSELT only, SYNTHETIC data: the engine's own correlations
  are the truth the page fits, and the page says so.

  EVERY ENGINE CLAIM CARRIES THE LINE IT WAS READ AT, and
  tests/correlationSimplicityLesson.test.ts holds each citation to the source
  text it names.  Every number the page shows is either read from the
  witness's sweep CSVs (tutorials/props/hydraulics/moody02_correlation_sweeps)
  or computed on the page by a formula written on it.  The primary sources
  are named by TITLE only; no table is copied from any of them.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const SIMPLICITY_STEPS: readonly LessonStep[] = [
  // ---- Page 1: dimensional analysis ------------------------------------------
  {
    n: 1,
    title: "How many groups: the Pi theorem",
    body: "Choose the variables a problem depends on -- for the pressure drop "
      + "in a straight pipe, the pressure gradient, the density, the "
      + "viscosity, the mean velocity, the diameter and the wall roughness.  "
      + "Write each one's dimensions as a column of exponents of mass, length, "
      + "time and temperature: that table is the dimensional matrix.  Its "
      + "rank is the number of independent dimensions the variables really "
      + "carry, and the Pi theorem says that any physically meaningful "
      + "relation among the n variables can be rewritten as a relation among "
      + "n - r dimensionless groups.  For the pipe, six variables span three "
      + "dimensions (temperature does not appear), so three groups remain.  "
      + "Tick and untick variables below and watch the rank and the count "
      + "move: adding the gravitational acceleration adds a group (a Froude "
      + "number) that a full horizontal pipe does not need, and adding a "
      + "temperature adds a dimension and so adds no group at all.  The "
      + "theorem is due to Buckingham (On physically similar systems; "
      + "illustrations of the use of dimensional equations).",
    formula: String.raw`N_\Pi = n - r`,
    where: [
      { sym: "N_\\Pi", means: "the number of independent dimensionless groups", unit: "-" },
      { sym: "n", means: "the number of variables chosen", unit: "-" },
      { sym: "r", means: "the rank of the dimensional matrix", unit: "-" },
    ],
    note: "The count is only as good as the list.  A variable left out is not "
      + "detected by the method; a variable put in that does not matter only "
      + "adds a group the data will show to be irrelevant.",
  },
  {
    n: 2,
    title: "Which groups: the null space of the dimensional matrix",
    body: "A product of powers of the variables is dimensionless exactly when "
      + "its exponents, multiplied by the dimensional matrix, give zero in "
      + "every row: the exponent vectors of the groups are the null space of "
      + "the matrix.  The matrix method arranges this so it can be done by "
      + "hand (the arrangement is the one in Zlokarnik's Scale-up in Chemical "
      + "Engineering): put r of the variables -- the core, or repeating "
      + "variables -- in the first columns, reduce those columns to the "
      + "identity by row operations, and read each remaining variable's group "
      + "off its own column of the reduced matrix.  The page does exactly "
      + "that, in exact rational arithmetic, so an exponent is 2 and never "
      + "1.9999999999999998; it clears the denominators so no group is "
      + "written with a fractional power, and it checks that every group's "
      + "dimensions sum to zero.  With the core density, velocity and "
      + "diameter, the pipe gives the friction factor's group (without its "
      + "conventional 2), the INVERSE of the Reynolds number -- a group's "
      + "inverse is as good a group, as the next step shows -- and the "
      + "relative roughness.  For convection in a pipe, the core "
      + "conductivity, density, viscosity and diameter gives the Nusselt, "
      + "Reynolds and Prandtl numbers.",
    formula: String.raw`A\,k = 0, \qquad \Pi = \prod_j x_j^{\,k_j}`,
    where: [
      { sym: "A", means: "the dimensional matrix: one row per base dimension "
        + "(M, L, T, Theta), one column per variable, holding exponents", unit: "-" },
      { sym: "k", means: "an exponent vector in the null space of A", unit: "-" },
      { sym: "\\Pi", means: "the dimensionless group that vector defines", unit: "-" },
      { sym: "x_j", means: "the j-th chosen variable", unit: "its own" },
      { sym: "k_j", means: "the exponent of the j-th variable in the group", unit: "-" },
    ],
  },
  {
    n: 3,
    title: "The groups are not unique",
    body: "The null space is a space, not a list: any product of powers of "
      + "groups is again a group, and a different core reduces the same "
      + "matrix to a different, equally valid basis.  Switch the core below.  "
      + "Viscosity, velocity and diameter turn the pressure-drop group into "
      + "the friction factor times the Reynolds number -- the Poiseuille "
      + "number, which is the constant 64 in laminar flow -- and density, "
      + "viscosity and diameter turn it into f Re squared, a group in which "
      + "the velocity appears only once, through Re, which is the natural "
      + "group when the pressure drop is given and the flow is the unknown.  "
      + "Nothing in the method prefers one basis; convenience, tradition and "
      + "the question being asked do.  Nor does the method supply the "
      + "numbers that conventionally ride with a group: the 2 in the "
      + "definition of the Darcy friction factor is a convention -- it makes "
      + "f a pressure drop per dynamic head per diameter of pipe -- and a "
      + "group multiplied by any constant is still a group.  For the "
      + "convection problem, swapping viscosity for velocity in the core "
      + "gives the Peclet number Re Pr in place of Pr; density, heat "
      + "capacity, velocity and conductivity give the Stanton number Nu/(Re "
      + "Pr) in place of the Nusselt number; and conductivity, viscosity, "
      + "heat capacity and diameter are refused as a core, because the "
      + "Prandtl number can be built from them alone, so their columns are "
      + "not independent.",
    formula: String.raw`\Pi_1' = \Pi_1\,\Pi_2^{\,m}, \qquad f = \frac{(\Delta p/L)\,D}{\rho u^2/2}, \qquad \mathrm{Re} = \frac{\rho u D}{\mu}`,
    where: [
      { sym: "\\Pi_1", means: "a group of the basis (here the pressure-drop group)", unit: "-" },
      { sym: "\\Pi_2", means: "another group of the basis (here Re)", unit: "-" },
      { sym: "\\Pi_1'", means: "the replacement group, as valid as the one it replaces", unit: "-" },
      { sym: "m", means: "any exponent, positive or negative", unit: "-" },
      { sym: "f", means: "the Darcy friction factor", unit: "-" },
      { sym: "\\Delta p/L", means: "the pressure drop per unit length of pipe", unit: "Pa/m" },
      { sym: "\\Delta p", means: "the pressure drop over the length L", unit: "Pa" },
      { sym: "L", means: "the length of pipe", unit: "m" },
      { sym: "D", means: "the pipe diameter", unit: "m" },
      { sym: "\\rho", means: "the fluid density", unit: "kg/m³" },
      { sym: "u", means: "the mean velocity", unit: "m/s" },
      { sym: "\\mathrm{Re}", means: "the Reynolds number", unit: "-" },
      { sym: "\\mu", means: "the dynamic viscosity", unit: "Pa·s" },
    ],
  },

  // ---- Page 2: what Pi gives, and what it does not -----------------------------
  {
    n: 4,
    title: "What the theorem gives: fewer variables",
    body: "Six variables have become three groups, and the friction factor "
      + "is a function of two.  That is a real gain, and it is the gain of "
      + "an experimenter: with ten levels per variable, the five independent "
      + "dimensional inputs need ten to the fifth runs to map, and the two "
      + "groups need ten squared.  It is also why one Moody chart serves "
      + "water, oil and air in pipes of every size: two pipes at the same Re "
      + "and the same relative roughness have the same f, which is what "
      + "physical similarity means.",
    formula: String.raw`f = \Phi\!\left(\mathrm{Re}, \frac{\varepsilon}{D}\right)`,
    where: [
      { sym: "\\Phi", means: "the function the groups are related by -- unknown", unit: "-" },
      { sym: "\\varepsilon", means: "the wall roughness height", unit: "m" },
    ],
  },
  {
    n: 5,
    title: "What it does not give: the shape of the function",
    body: "The theorem says which arguments Phi has.  It says nothing at all "
      + "about Phi itself.  The curve drawn below beside the engine's "
      + "Colebrook curve is INVENTED -- the engine's own friction factor "
      + "multiplied by a ripple of chosen amplitude and frequency -- and it is "
      + "exactly as admissible to dimensional analysis as the real one: it "
      + "depends on Re and on eps/D and on nothing else.  So is a curve with "
      + "a thousand ripples per decade, or with an infinity of frequencies "
      + "superposed.  Reducing six variables to three groups could, in "
      + "principle, have done nothing but move an arbitrary function from "
      + "one set of arguments to another.  That real correlations are "
      + "SMOOTH, and over long stretches nearly STRAIGHT on logarithmic axes, "
      + "is a fact about the physics, not about the dimensions -- and the "
      + "next three pages are about where that fact comes from.",
    formula: String.raw`\Phi_\mathrm{w}(\mathrm{Re}) = \Phi(\mathrm{Re})\left[1 + a\,\sin\!\left(2\pi k\,\frac{\ln \mathrm{Re}}{\ln 10}\right)\right]`,
    where: [
      { sym: "\\Phi_\\mathrm{w}", means: "an invented friction law, the engine's curve with a ripple laid on it", unit: "-" },
      { sym: "a", means: "the ripple's relative amplitude, chosen by you", unit: "-" },
      { sym: "\\pi", means: "the number pi", unit: "-" },
      { sym: "k", means: "the ripple's frequency, in oscillations per decade of Re, chosen by you", unit: "1/decade" },
    ],
    note: "The engine's curve under the ripple is Colebrook at the roughness "
      + "you pick, read from the witness's sweep; only the ripple is "
      + "computed on the page.",
  },

  // ---- Page 3: asymptotic regimes and similarity ----------------------------------
  {
    n: 6,
    title: "Laminar flow: a group drops out, the other enters as a power",
    body: "Below Re of about 2300 the flow is laminar and the momentum "
      + "equation can be solved exactly for a straight pipe (the "
      + "Hagen-Poiseuille profile).  The answer is f = 64/Re: the roughness "
      + "has vanished from the problem altogether, and the Reynolds number "
      + "enters as a single power, minus one.  On the logarithmic plane this "
      + "is a straight line of slope -1, and the local slope plotted below "
      + "reads -1 to the last digit on every laminar point, because the "
      + "engine evaluates the exact law there "
      + "(FrictionFactorCorrelation.cpp:47).  The simplicity is not a fit: "
      + "it is the solution.",
    formula: String.raw`f = \frac{64}{\mathrm{Re}}`,
  },
  {
    n: 7,
    title: "Fully rough flow: complete similarity in Re",
    body: "At high Re in a rough pipe the friction factor stops depending on "
      + "Re and depends on eps/D alone: the curves of the Moody plane go "
      + "flat, and the local slope goes to zero.  The viscous sublayer has "
      + "become thinner than the roughness elements, the drag is the form "
      + "drag of the roughness, and viscosity -- the only place Re came "
      + "from -- no longer matters.  In Barenblatt's terms (Scaling, "
      + "Self-Similarity, and Intermediate Asymptotics) the group has "
      + "dropped out of the function: complete similarity.  Colebrook's "
      + "equation, iterated by the engine at "
      + "FrictionFactorCorrelation.cpp:173, carries this limit inside it: as "
      + "Re grows the 2.51/(Re sqrt f) term vanishes and what remains is the "
      + "closed form the engine verifies its iteration against "
      + "(FrictionFactorCorrelation.cpp:200).",
    formula: String.raw`\frac{1}{\sqrt{f}} = -\frac{2}{\ln 10}\,\ln\!\left(\frac{\varepsilon/D}{3.7} + \frac{2.51}{\mathrm{Re}\sqrt{f}}\right) \;\longrightarrow\; -\frac{2}{\ln 10}\,\ln\frac{\varepsilon/D}{3.7}`,
    where: [
      { sym: "\\varepsilon/D", means: "the relative roughness", unit: "-" },
    ],
  },
  {
    n: 8,
    title: "Smooth turbulent flow: incomplete similarity",
    body: "In a smooth pipe the roughness has dropped out but Re has not, and "
      + "f is not a pure power of Re either.  Blasius' f = 0.316 Re^(-1/4) "
      + "(FrictionFactorCorrelation.cpp:92) describes it from about 4000 to "
      + "1e5, and the local slope of Colebrook's smooth curve shows why it "
      + "stops there: the slope is close to -1/4 around Re = 1e4 and drifts "
      + "steadily toward zero as Re grows.  A group whose influence neither "
      + "vanishes nor settles on one fixed power is what Barenblatt calls "
      + "incomplete similarity: over a limited range the curve can be "
      + "written as a power law, but the exponent is not fixed by "
      + "dimensional analysis and is not the same on the next range.  Read "
      + "the table of local slopes below the plot, roughness by roughness: "
      + "-1 in laminar flow, a drifting value on the smooth curve, a value "
      + "falling to zero on every rough curve as it goes flat.",
    formula: String.raw`n_\mathrm{loc} = \frac{\mathrm{d}\ln f}{\mathrm{d}\ln \mathrm{Re}}`,
    where: [
      { sym: "n_\\mathrm{loc}", means: "the local logarithmic slope: the exponent "
        + "a power law would need to match the curve at that point", unit: "-" },
    ],
    note: "The slope is a central difference on the engine's grid of 20 points "
      + "per decade, taken only between points of the same regime: across "
      + "Re = 2300 the correlation switches law, and a difference across the "
      + "switch would measure the switch.",
  },

  // ---- Page 4: master and slave ----------------------------------------------------
  {
    n: 9,
    title: "Two time scales: the slaving principle",
    body: "Take the two-variable model Haken uses to introduce the slaving "
      + "principle (Synergetics), written here with unit coupling "
      + "coefficients.  The variable x grows slowly at the rate eps; the "
      + "variable y is damped quickly at the rate gamma and is driven by x. "
      + " When gamma is much larger than eps, y relaxes long before x has "
      + "changed, so at every moment y sits where its own equation puts it "
      + "for the current x: it is SLAVED to x.  Setting dy/dt to zero gives "
      + "y as a function of x, and substituting it leaves one equation in "
      + "the master variable alone.  Two variables have become one, but not "
      + "by dimensional analysis: by the separation of their time scales.  "
      + "The reduced equation is a Bernoulli equation and has a closed form, "
      + "which the page draws beside the full system integrated numerically.",
    formula: String.raw`\frac{\mathrm{d}x}{\mathrm{d}t} = \varepsilon x - x y, \qquad \frac{\mathrm{d}y}{\mathrm{d}t} = -\gamma y + x^2`,
    where: [
      { sym: "x", means: "the master variable: slow, unstable at the origin", unit: "-" },
      { sym: "\\varepsilon", means: "the growth rate of the master -- not the "
        + "roughness of pages 1 to 3", unit: "1/time" },
      { sym: "y", means: "the slave variable: fast, damped", unit: "-" },
      { sym: "t", means: "time, in units of 1/eps", unit: "-" },
      { sym: "\\gamma", means: "the damping rate of the slave", unit: "1/time" },
    ],
    derivation: [
      { step: "The slave relaxes on the time scale 1/gamma; if gamma >> eps it "
          + "follows x, so its time derivative is negligible:",
        eq: String.raw`\frac{\mathrm{d}y}{\mathrm{d}t} \approx 0 \;\Rightarrow\; y \approx \frac{x^2}{\gamma}` },
      { step: "Substitute into the master equation:",
        eq: String.raw`\frac{\mathrm{d}x}{\mathrm{d}t} = \varepsilon x - \frac{x^3}{\gamma}` },
      { step: "Both systems share the fixed point: dx/dt = 0 with x nonzero "
          + "gives y = eps, and dy/dt = 0 then gives x squared = eps gamma:",
        eq: String.raw`x^* = \sqrt{\varepsilon\gamma}, \qquad y^* = \varepsilon` },
      { step: "The reduced equation is linear in x squared, and solves to:",
        eq: String.raw`x(t)^2 = \frac{\varepsilon\gamma\,x_0^2\,\exp(2\varepsilon t)}{\varepsilon\gamma + x_0^2\left[\exp(2\varepsilon t) - 1\right]}` },
    ],
    note: "Both equations of the full system are integrated by classical "
      + "fourth-order Runge-Kutta on the page, with a step that resolves "
      + "1/gamma; the reduced curve is the closed form above, evaluated.",
  },
  {
    n: 10,
    title: "When the separation is lost",
    body: "Linearise the full system about its fixed point and the two rates "
      + "of return appear as the roots of a quadratic.  When gamma is much "
      + "larger than eps one root is close to -2 eps -- the master's own "
      + "rate, which is exactly what the reduced equation gives (its slope "
      + "at x* is eps - 3 eps) -- and the other is close to -gamma, the "
      + "slave's, which the reduction throws away.  Move the slider toward "
      + "small gamma/eps: the error of the reduced trajectory grows, and "
      + "below gamma = 8 eps the roots become complex and the full system "
      + "OVERSHOOTS and oscillates on its way to x* -- a motion a single "
      + "first-order equation cannot make at all.  The reduction was never "
      + "exact; it was accurate in proportion to the separation of scales.",
    formula: String.raw`\lambda^2 + \gamma\,\lambda + 2\varepsilon\gamma = 0 \;\Rightarrow\; \lambda_{1,2} = \frac{-\gamma \pm \sqrt{\gamma^2 - 8\varepsilon\gamma}}{2} \approx -2\varepsilon,\; -\gamma \quad (\gamma \gg \varepsilon)`,
    where: [
      { sym: "\\lambda", means: "a rate of return to the fixed point (an eigenvalue of the linearised system)", unit: "1/time" },
      { sym: "\\lambda_{1,2}", means: "the two eigenvalues", unit: "1/time" },
    ],
  },
  {
    n: 11,
    title: "The engineering form: a boundary layer slaved to the outer flow",
    body: "Prandtl's boundary layer (On fluid motion with very small "
      + "friction) is the same idea in a flow.  Along a flat plate at zero "
      + "pressure gradient the thin layer next to the wall has no freedom of "
      + "its own: its thickness and its profile are set, point by point, by "
      + "the slow outer flow, and the fine structure follows the large one.  "
      + "Balancing inertia against viscosity across the layer gives its "
      + "thickness; balancing convection against conduction in the thinner "
      + "thermal layer inside it (for Prandtl numbers of order one and "
      + "above) gives the Pr^(1/3); and the Nusselt number is the length "
      + "over the thermal-layer thickness.  The exponents 1/2 and 1/3 are "
      + "consequences of the slaving, not fitted numbers.  The coefficient "
      + "0.332 is not: it comes from the similarity solution of the layer "
      + "equations (Blasius, Boundary layers in fluids with little friction; "
      + "Pohlhausen, Heat exchange between solid bodies and fluids with "
      + "small friction and small heat conduction).  This is the LAMINAR, "
      + "EXTERNAL, flat-plate regime, uniform wall temperature, Pr above "
      + "about 0.6, below transition -- and the engine carries no flat-plate "
      + "correlation, so it is told here and not run.  Contrast the turbulent "
      + "pipe: Dittus-Boelter's Nu = 0.023 Re^0.8 Pr^0.4 "
      + "(DittusBoelter.H:63) is a fitted law.  Turbulence spreads energy "
      + "over a continuum of scales with no clean gap between master and "
      + "slave, so no such argument fixes 0.8, and page 5 shows that it is "
      + "itself only a local slope.",
    formula: String.raw`\mathrm{Nu}_x = \frac{h x}{k} = 0.332\,\mathrm{Re}_x^{1/2}\,\mathrm{Pr}^{1/3} \qquad\text{vs}\qquad \mathrm{Nu} = 0.023\,\mathrm{Re}^{0.8}\,\mathrm{Pr}^{0.4}`,
    where: [
      { sym: "\\mathrm{Nu}_x", means: "the local Nusselt number at distance x from the leading edge", unit: "-" },
      { sym: "x", means: "here, the distance from the plate's leading edge", unit: "m" },
      { sym: "h", means: "the local film heat-transfer coefficient", unit: "W/(m²·K)" },
      { sym: "k", means: "the fluid thermal conductivity", unit: "W/(m·K)" },
      { sym: "\\mathrm{Re}_x", means: "the Reynolds number on the distance from the leading edge, U x/nu", unit: "-" },
      { sym: "\\mathrm{Pr}", means: "the Prandtl number, c_p mu/k", unit: "-" },
      { sym: "\\mathrm{Nu}", means: "the Nusselt number of a pipe, h D/k", unit: "-" },
      { sym: "U", means: "the outer-flow velocity", unit: "m/s" },
      { sym: "\\nu", means: "the kinematic viscosity, mu/rho", unit: "m²/s" },
      { sym: "\\delta", means: "the velocity boundary-layer thickness", unit: "m" },
      { sym: "\\delta_T", means: "the thermal boundary-layer thickness", unit: "m" },
      { sym: "\\alpha", means: "the thermal diffusivity, k/(rho c_p)", unit: "m²/s" },
    ],
    derivation: [
      { step: "Inertia against viscosity across a layer of thickness delta:",
        eq: String.raw`\frac{U^2}{x} \sim \nu\,\frac{U}{\delta^2} \;\Rightarrow\; \frac{\delta}{x} \sim \mathrm{Re}_x^{-1/2}` },
      { step: "For Pr of order one or more the thermal layer lies inside the "
          + "velocity layer, where the velocity is about U delta_T/delta; "
          + "convection against conduction there:",
        eq: String.raw`\frac{U\,\delta_T/\delta}{x} \sim \frac{\alpha}{\delta_T^2} \;\Rightarrow\; \left(\frac{\delta_T}{\delta}\right)^3 \sim \frac{\alpha}{\nu}\,\frac{\nu x}{U\delta^2} \sim \mathrm{Pr}^{-1}` },
      { step: "The wall flux is k Delta T/delta_T, so:",
        eq: String.raw`\mathrm{Nu}_x \sim \frac{x}{\delta_T} \sim \mathrm{Re}_x^{1/2}\,\mathrm{Pr}^{1/3}` },
    ],
  },

  // ---- Page 5: correlations in practice ---------------------------------------------
  {
    n: 12,
    title: "Over one decade, anything smooth is a power law",
    body: "The third reason is the sobering one.  Fit a straight line to "
      + "ln y against ln Re over one decade of the engine's own curve -- "
      + "Colebrook for a smooth pipe, or Gnielinski's Nusselt number -- and "
      + "read how well it fits: to about one percent or better.  Then move "
      + "the decade and read the exponent drift.  A smooth function whose "
      + "local slope changes slowly is, over a short enough range, a power "
      + "law, whatever its physics; the error grows with the square of the "
      + "range and with how fast the slope drifts.  Add the tolerance a "
      + "design accepts -- plus or minus 20 to 30 percent is ordinary for a "
      + "heat-transfer coefficient -- and one power law covers several "
      + "decades.  Part of a correlation's simplicity is the narrowness of "
      + "the range it was fitted over and the width of the tolerance it is "
      + "used with, and an honest correlation states both.",
    formula: String.raw`y \approx C\,\mathrm{Re}^{m}, \qquad \frac{\left|\Delta y\right|}{y} \approx \frac{1}{2}\left|\frac{\mathrm{d}n_\mathrm{loc}}{\mathrm{d}\ln \mathrm{Re}}\right|\left(\Delta \ln \mathrm{Re}\right)^2`,
    where: [
      { sym: "y", means: "the quantity correlated (f or Nu) -- here the engine's curve", unit: "-" },
      { sym: "C", means: "the fitted coefficient", unit: "-" },
      { sym: "m", means: "the fitted exponent", unit: "-" },
      { sym: "\\Delta y", means: "the error of the power law at a distance Delta ln Re from the point it is tangent to", unit: "-" },
      { sym: "\\Delta \\ln \\mathrm{Re}", means: "that distance, in natural-log units (one decade is ln 10, about 2.3)", unit: "-" },
    ],
    derivation: [
      { step: "Expand ln y about a point ln Re_0 in a Taylor series; the first "
          + "two terms are a power law with exponent n_loc:",
        eq: String.raw`\ln y = \ln y_0 + n_\mathrm{loc}\,\Delta \ln \mathrm{Re} + \frac{1}{2}\,\frac{\mathrm{d}n_\mathrm{loc}}{\mathrm{d}\ln \mathrm{Re}}\left(\Delta \ln \mathrm{Re}\right)^2 + \dots` },
      { step: "The third term is the power law's error, in logarithmic units, "
          + "which for small values is the relative error." },
    ],
    note: "The fit is ordinary least squares on (ln Re, ln y) over the 21 grid "
      + "points of the decade -- it starts on a grid point and ends ten times "
      + "further on -- computed on the page, and only on points inside the "
      + "correlation's own window; the curve fitted is the engine's, read "
      + "from the witness's sweep.",
  },
  {
    n: 13,
    title: "Blending the asymptotes: Churchill and Usagi",
    body: "If the simple laws live in the asymptotic regimes, a correlation "
      + "for the whole range can be built by joining them.  Churchill and "
      + "Usagi (A general expression for the correlation of rates of "
      + "transfer and other phenomena) proposed one form for the join: raise "
      + "each asymptote to a power n, add, and take the n-th root.  The "
      + "larger asymptote wins far from the crossover, both count near it, "
      + "and the exponent n sets how sharp the corner is.  The engine's "
      + "Churchill friction factor (FrictionFactorCorrelation.cpp:315-317) "
      + "is this form with n = 12, joining the laminar law to a turbulent "
      + "branch; and the turbulent branch is itself a blend, with exponent "
      + "16 on sqrt(8/f), of a turbulent term and a transition term "
      + "(FrictionFactorCorrelation.cpp:288-290).  The witness publishes "
      + "both pieces (FrictionFactorCorrelation.cpp:356-359), and the page "
      + "recomputes the blend from them: at n = 12 it reproduces the "
      + "engine's f to round-off, which is the check that the reading of the "
      + "equation is right.  Change n to see what the exponent does.",
    formula: String.raw`y = \left(y_1^{\,n} + y_2^{\,n}\right)^{1/n}, \qquad f = \left[\left(\frac{64}{\mathrm{Re}}\right)^{12} + f_\mathrm{t}^{\,12}\right]^{1/12}, \qquad \sqrt{\frac{8}{f_\mathrm{t}}} = \left(a^{16} + b^{16}\right)^{1/16}`,
    where: [
      { sym: "y_1", means: "one asymptote (here the laminar law)", unit: "-" },
      { sym: "y_2", means: "the other asymptote (here the turbulent branch)", unit: "-" },
      { sym: "f_\\mathrm{t}", means: "Churchill's turbulent branch, 8 (A+B)^(-1/8) in the engine's own symbols", unit: "-" },
      { sym: "a", means: "the turbulent term, -2.457 ln[(7/Re)^0.9 + 0.27 eps/D]; the engine's A is a^16", unit: "-" },
      { sym: "b", means: "the transition term, 37530/Re; the engine's B is b^16", unit: "-" },
      { sym: "n", means: "the blending exponent: large n, a sharp corner", unit: "-" },
    ],
  },
  {
    n: 14,
    title: "The transition zone: where no mechanism dominates",
    body: "Between Re of about 2300 and 4000 neither asymptote holds.  The "
      + "flow is intermittent -- turbulent puffs travel through laminar "
      + "flow -- and depends on how the pipe was entered and how disturbed "
      + "the inlet is, so the friction factor is not even a single-valued "
      + "function of Re there.  No regime is a master, there is no "
      + "asymptote to stand on, and the correlations stop agreeing: below "
      + "2300 three of them substitute the laminar law, between the two "
      + "limits they are evaluated outside the band they were fitted to "
      + "(the engine names that band at FrictionFactorCorrelation.cpp:52-53 "
      + "and flags Colebrook's and Haaland's points in it; Blasius's are not "
      + "flagged there, although the window it declares starts at 4000, and "
      + "the table shows the flag exactly as the engine publishes it), and "
      + "Churchill's blend draws a smooth "
      + "line through a region where the physics offers none.  The Nusselt "
      + "correlations behave the same way: Dittus-Boelter below 1e4 is "
      + "outside its window, and there its gap to Gnielinski opens fastest -- "
      + "from a few percent near Re = 1e4 to tens of percent at 2000, in less "
      + "than a decade.  (They part again at high Re, more slowly: a fixed "
      + "exponent 0.8 cannot follow a curve whose local slope drifts, which "
      + "is the previous step's point.)  The plot and the table read the "
      + "spread the engine's curves span at each point.  Where no mechanism "
      + "dominates, no simple correlation is "
      + "trustworthy, and a design that sits in the transition is one that "
      + "should be moved out of it.",
    formula: String.raw`s = \frac{y_\mathrm{max} - y_\mathrm{min}}{y_\mathrm{min}}`,
    where: [
      { sym: "s", means: "the spread of the correlations at one Re", unit: "-" },
      { sym: "y_\\mathrm{max}", means: "the largest of the correlations' answers there", unit: "-" },
      { sym: "y_\\mathrm{min}", means: "the smallest", unit: "-" },
    ],
  },
];

export const SIMPLICITY_LIMITS: readonly LessonLimit[] = [
  {
    id: "synthetic",
    title: "No measurement enters this page",
    body: "Every curve is a correlation the engine evaluates, used as the "
      + "truth a power law is fitted to.  That is the exercise: it shows how "
      + "simple a curve looks over a narrow range.  It says nothing about how "
      + "well any correlation matches a laboratory, which is a different "
      + "question and needs measured data.",
  },
  {
    id: "variables",
    title: "Dimensional analysis checks dimensions, not the list",
    body: "The method finds the groups of the variables it is given.  A "
      + "variable the problem depends on and the list omits is not detected, "
      + "and two variables with the same dimensions (a diameter and a "
      + "roughness) are told apart only by the person who chose them.",
  },
  {
    id: "toy",
    title: "Haken's model is a two-variable caricature",
    body: "It shows the mechanism of slaving with nothing else in the way.  A "
      + "turbulent flow has no clean gap between a few slow modes and many "
      + "fast ones, which is why its exponents are fitted and drift.",
  },
  {
    id: "flatplate",
    title: "The flat-plate law is told, not run",
    body: "The engine carries no external-flow correlation, so the laminar "
      + "flat-plate Nusselt number on page 4 is a formula on the page with "
      + "its derivation by scaling; nothing evaluates it.",
  },
  {
    id: "scope",
    title: "Fully developed, constant-property pipe flow only",
    body: "The sweeps are the correlations as functions of Re and Pr (and "
      + "eps/D).  Entrance lengths, the wall-to-bulk viscosity correction "
      + "and non-circular ducts are not in them.  Kern's correlation in the "
      + "Nusselt sweep is a SHELL-side law whose Reynolds number is built on "
      + "the crossflow velocity and the equivalent diameter; it is not "
      + "drawn here.",
  },
];
