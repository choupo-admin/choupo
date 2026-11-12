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
  The chromatography lesson, as DATA.

  The breakthrough page feeds a bed a STEP and watches the front; this page
  feeds the same kind of bed a short PULSE and watches each solute come out
  as a peak.  When it comes out, how wide it is, whether two peaks are
  apart, and what happens when you push more through: preparative
  chromatography, with the dispersions and the Gaussians.

  The linear pulse is run by the ENGINE (choupoBatch, fixedBedAdsorber, a
  case the page writes; FixedBedAdsorber.H holds the equations).  The closed
  forms, the plate model, the van Deemter curve, the resolution and the cut
  arithmetic are the PAGE's, and so is the integration of the overloaded
  (Langmuir) column: gui/src/case/chromatography.ts.  The design record is
  docs/design/chromatography-peaks-and-resolution.md.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const CHROM_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A pulse instead of a step: each solute travels at its own speed",
    body: "Take the packed bed of the breakthrough page and, instead of "
      + "feeding it a solute for good, inject a short slug of it and then go "
      + "back to pure carrier.  The slug moves down the bed as a band.  A "
      + "molecule spends part of its time in the moving fluid and part of it "
      + "held on the solid, and it only advances while it is in the fluid; "
      + "so a band moves slower than the fluid by the ratio of the time it "
      + "spends there.  Two solutes held differently by the solid travel at "
      + "two different speeds and come out at two different times.  That is "
      + "the whole idea of chromatography, and for a dilute solute -- where "
      + "the isotherm is a straight line -- the time each one comes out is a "
      + "mass balance.",
    derivation: [
      { step: "On a straight isotherm the solid holds K_c moles per kilogram "
          + "for every mole per cubic metre in the fluid beside it.  Per cubic "
          + "metre of bed, the fluid holds the voids' share and the solid "
          + "holds the rest:",
        eq: String.raw`\varepsilon\, c \;\;[\text{in the fluid}] \;+\; \rho_b K_c\, c \;\;[\text{on the solid}] \;=\; \varepsilon\, c\,(1 + k')` },
      { step: "A molecule is in the fluid for a fraction 1/(1 + k') of the "
          + "time, so the band moves at that fraction of the interstitial "
          + "velocity, and it takes this long to cross a bed of length L:",
        eq: String.raw`t_R \;=\; \frac{L}{v/(1+k')} \;=\; t_0\,(1 + k'), \qquad t_0 = \frac{L}{v} = \frac{\varepsilon L}{u}` },
    ],
    formula: String.raw`k' = \frac{\rho_b K_c}{\varepsilon} = \frac{1-\varepsilon}{\varepsilon}\, K, \qquad t_R = t_0\,(1+k')`,
    where: [
      { sym: "\\varepsilon", means: "the void fraction between the particles: "
        + "the share of the bed's volume the mobile fluid flows through.  The "
        + "particles' own pores are counted with the solid (the stationary "
        + "phase) here, which is the engine's convention" },
      { sym: "c", means: "concentration of the solute in the moving fluid",
        unit: "mol/m³" },
      { sym: "\\rho_b", means: "bulk density of the packing: kilograms of "
        + "adsorbent per cubic metre of BED", unit: "kg/m³" },
      { sym: "K_c", means: "slope of the isotherm at low concentration, "
        + "dq*/dc: cubic metres of fluid whose solute one kilogram of "
        + "adsorbent holds at equilibrium.  For the gas bed it is the Henry "
        + "constant H written per bar, times RT/10⁵", unit: "m³/kg" },
      { sym: "k'", means: "the retention (capacity) factor: moles held on "
        + "the solid over moles in the fluid, in the same slice of bed" },
      { sym: "t_R", means: "retention time: when the centre (the first "
        + "moment) of a peak leaves the bed", unit: "s" },
      { sym: "L", means: "length of the bed", unit: "m" },
      { sym: "v", means: "interstitial velocity of the fluid, u/ε",
        unit: "m/s" },
      { sym: "t_0", means: "the dead time: how long a molecule the solid "
        + "does not hold takes to cross the bed", unit: "s" },
      { sym: "u", means: "superficial velocity: volumetric flow over the "
        + "empty cross-section", unit: "m/s" },
      { sym: "K", means: "the same isotherm slope on a volume basis: moles "
        + "per cubic metre of PARTICLE over moles per cubic metre of fluid, "
        + "K = ρ_p K_c with ρ_p = ρ_b/(1−ε) the particle density" },
    ],
    note: "The engine prints this before it runs, as the retention factor "
      + "R_f = ε + ρ_b q*/c_in and the stoichiometric time t_st = (L/u) R_f "
      + "of a step; for a straight isotherm R_f = ε(1 + k') and t_st is t_R. "
      + "A rectangular injection of length t_inj leaves its centre t_inj/2 "
      + "later, which is why the page adds that half to every first moment.",
    leadsTo: {
      tool: "breakthrough", toolLabel: "Adsorption breakthrough",
      stepTitle: "A bed has no steady state — it has a life",
      body: "The same bed fed a step: the front arrives at the stoichiometric "
        + "time, the integral of a pulse is a step, and the same retention "
        + "factor sets both.",
    },
  },
  {
    n: 2,
    title: "Why a peak looks like a Gaussian, and how wide it is",
    body: "Martin and Synge's picture: cut the column into N equal slices, "
      + "and treat each slice as a well-mixed plate in which the fluid and "
      + "the solid are at equilibrium.  A pulse that enters the first plate "
      + "leaves the last one as the sum of N independent waiting times, each "
      + "with the same mean.  A sum of many independent waits is, by the "
      + "central limit theorem, close to a Gaussian -- which is why a peak "
      + "from a good column looks like one.  The width follows from the "
      + "variances adding: N plates give a variance N times that of one, "
      + "and a relative spread that falls as one over the square root of N.  "
      + "The plate count is not a physical object; it is a way of reporting "
      + "how wide a peak is for its retention time.",
    derivation: [
      { step: "One plate holding a fraction 1/N of the column's capacity "
          + "empties exponentially with mean t_R/N; N of them in series give "
          + "the gamma (Erlang) density, of mean t_R and variance t_R²/N:",
        eq: String.raw`\frac{c(t)}{m} = \left(\frac{N}{t_R}\right)^{N} \frac{t^{N-1}}{\Gamma(N)} \exp\!\left(-\frac{N t}{t_R}\right)` },
      { step: "For large N that density tends to the normal one with the "
          + "same mean and variance:",
        eq: String.raw`\frac{c(t)}{m} \approx \frac{1}{\sigma_t\sqrt{2\pi}} \exp\!\left(-\frac{(t-t_R)^2}{2\sigma_t^2}\right)` },
    ],
    formula: String.raw`\sigma_t = \frac{t_R}{\sqrt{N}}, \qquad H = \frac{L}{N} = L\,\frac{\sigma_t^2}{t_R^2}, \qquad c_\mathrm{max} = \frac{m}{\sigma_t\sqrt{2\pi}}`,
    where: [
      { sym: "N", means: "the number of theoretical plates of the column for "
        + "this solute: (t_R/σ_t)²" },
      { sym: "m", means: "the area under the outlet peak, ∫c dt: the amount "
        + "injected over the volumetric flow, the same for every N",
        unit: "mol·s/m³" },
      { sym: "t", means: "time since the injection", unit: "s" },
      { sym: "\\Gamma", means: "the gamma function; Γ(N) = (N−1)! for a "
        + "whole N" },
      { sym: "\\sigma_t", means: "standard deviation of the peak in time: "
        + "the square root of its second central moment", unit: "s" },
      { sym: "\\pi", means: "the number π" },
      { sym: "H", means: "the height equivalent to a theoretical plate "
        + "(HETP): column length per plate", unit: "m" },
      { sym: "c_\\mathrm{max}", means: "height of the peak", unit: "mol/m³" },
    ],
    note: "The area of a peak does not depend on N -- what goes in comes out "
      + "-- so a narrower peak is a taller one: its height grows as √N/t_R. "
      + "A few plates give a visibly skewed peak, early and tailing; the "
      + "page draws the exact plate-model peak beside the Gaussian of the "
      + "same mean and variance, and says how far apart they are.",
  },
  {
    n: 3,
    title: "Where the width comes from: the van Deemter curve",
    body: "Three things spread a band, and they add.  Flow round the "
      + "particles takes different molecules on different paths (eddy "
      + "dispersion): a length of the order of a particle diameter, the same "
      + "at any velocity.  Molecules diffuse along the column while they wait "
      + "(axial molecular diffusion): the slower the flow, the longer they "
      + "wait, so this term falls with velocity.  And the solid never quite "
      + "catches up with the fluid beside it (mass-transfer resistance): the "
      + "faster the flow, the further the fluid runs ahead, so this term "
      + "grows with velocity.  A fall and a rise make a minimum: there is a "
      + "velocity at which a column gives the most plates per metre.",
    derivation: [
      { step: "The engine's bed lumps the first two into one axial dispersion "
          + "coefficient (on its superficial basis, D_ax = ε D_L) and the "
          + "third into the linear-driving-force constant k.  Write the "
          + "interstitial dispersion as a molecular part and a flow part:",
        eq: String.raw`D_L = \gamma\, D_m + \lambda\, d_p\, v` },
      { step: "The second moment of a pulse through a long column with that "
          + "dispersion and that uptake (design record, section 2; a Laplace "
          + "transform of the bed equations) gives a plate height that is a "
          + "sum of the two mechanisms:",
        eq: String.raw`H = L\,\frac{\sigma_t^2}{t_R^2} = \frac{2 D_L}{v} + \frac{2 k'}{k\,(1+k')^2}\, v` },
      { step: "Substitute D_L and collect the three terms:",
        eq: String.raw`H = 2\lambda d_p + \frac{2\gamma D_m}{v} + \frac{2k'}{k(1+k')^2}\, v, \qquad A = 2\lambda d_p,\;\; B = 2\gamma D_m,\;\; C = \frac{2k'}{k(1+k')^2}` },
    ],
    formula: String.raw`H = A + \frac{B}{v} + C\,v, \qquad v_\mathrm{opt} = \sqrt{\frac{B}{C}}, \qquad H_\mathrm{min} = A + 2\sqrt{BC}`,
    where: [
      { sym: "D_\\mathrm{ax}", means: "the axial dispersion coefficient the "
        + "engine's bed declares, on the superficial basis (its equations "
        + "carry D_ax ∂²c/∂z²)", unit: "m²/s" },
      { sym: "D_L", means: "the axial dispersion coefficient on the "
        + "interstitial basis, D_ax/ε", unit: "m²/s" },
      { sym: "\\gamma", means: "obstruction (tortuosity) factor of the "
        + "packing for axial diffusion; the page takes 0.7, a usual value "
        + "for a packed bed" },
      { sym: "D_m", means: "molecular diffusivity of the solute in the "
        + "mobile phase", unit: "m²/s" },
      { sym: "\\lambda", means: "eddy-dispersion factor; the page takes 0.5, "
        + "the value that makes a particle Péclet number v d_p/D_L of 2 at "
        + "high velocity" },
      { sym: "d_p", means: "particle diameter", unit: "m" },
      { sym: "k", means: "the linear-driving-force constant of the uptake, "
        + "dq/dt = k (q* − q), the engine's kLDF", unit: "1/s" },
      { sym: "A", means: "the eddy-dispersion term, independent of "
        + "velocity", unit: "m" },
      { sym: "B", means: "the axial-diffusion coefficient: B/v falls with "
        + "velocity", unit: "m²/s" },
      { sym: "C", means: "the mass-transfer coefficient: C v grows with "
        + "velocity", unit: "s" },
      { sym: "v_\\mathrm{opt}", means: "the interstitial velocity of the "
        + "smallest plate height", unit: "m/s" },
      { sym: "H_\\mathrm{min}", means: "that smallest plate height", unit: "m" },
    ],
    note: "The engine solves the bed on a grid of cells with a first-order "
      + "upwind scheme, and that scheme spreads a band by itself: each cell "
      + "behaves like one more well-mixed plate, adding a plate height of one "
      + "cell, Δz.  The page lists that share separately beside the "
      + "physical ones, so the engine's peaks can be compared with theory "
      + "honestly; its own integrator uses a second-order scheme whose share "
      + "is much smaller.  The particle-level terms of the original van "
      + "Deemter paper (film and intraparticle diffusion) are lumped here "
      + "into k, as the engine lumps them.",
  },
  {
    n: 4,
    title: "Two solutes: selectivity, resolution, and where to cut",
    body: "Two peaks are separated when their centres are further apart "
      + "than their widths.  The distance between centres is set by how "
      + "differently the solid holds the two (the selectivity α); the widths "
      + "by the plate count.  The resolution puts the two into one number, "
      + "and the fundamental resolution equation shows which knob moves it: "
      + "the plate count only as its square root (four times the column for "
      + "twice the resolution), the selectivity through (α−1)/α, which is "
      + "why a better stationary phase beats a longer column, and the "
      + "retention through k'/(1+k'), which stops paying once k' is a few.  "
      + "R_s = 1.5 is the usual mark of baseline resolution: for two equal "
      + "Gaussians it puts the centres six standard deviations apart, and a "
      + "cut midway leaves about 0.13 % of each peak on the wrong side.  To collect two products you "
      + "cut the outlet in time: what leaves before the cut is the first "
      + "product, what leaves after is the second, and the page integrates "
      + "both peaks over each fraction for its purity and recovery.",
    formula: String.raw`\alpha = \frac{k'_2}{k'_1}, \qquad R_s = \frac{t_{R,2}-t_{R,1}}{2(\sigma_1+\sigma_2)} \;\approx\; \frac{\sqrt{N}}{4}\,\frac{\alpha-1}{\alpha}\,\frac{k'_2}{1+k'_2}`,
    where: [
      { sym: "\\alpha", means: "the selectivity: the ratio of the two "
        + "retention factors, later peak over earlier, so α > 1" },
      { sym: "k'_1", means: "retention factor of the earlier peak" },
      { sym: "k'_2", means: "retention factor of the later peak" },
      { sym: "R_s", means: "the resolution of the pair: base widths taken "
        + "as 4σ, so R_s = 1 means the two bases just touch" },
      { sym: "t_{R,1}", means: "retention time of the earlier peak", unit: "s" },
      { sym: "t_{R,2}", means: "retention time of the later peak", unit: "s" },
      { sym: "\\sigma_1", means: "standard deviation of the earlier peak", unit: "s" },
      { sym: "\\sigma_2", means: "standard deviation of the later peak", unit: "s" },
    ],
    note: "The fundamental form assumes both peaks have the same plate count "
      + "and nearly the same width; the page shows it beside the exact "
      + "expression, so the size of that approximation is on the page.  "
      + "Purity of a fraction is the moles of its product over all the moles "
      + "in it; recovery is the moles of its product in it over all that was "
      + "injected.",
  },
  {
    n: 5,
    title: "Loading more: what makes it preparative",
    body: "An analytical column injects so little that the isotherm is a "
      + "straight line and every peak is a Gaussian whose shape does not "
      + "depend on how much was injected.  A preparative column is there to "
      + "make product, so it is loaded until the isotherm bends.  On a "
      + "Langmuir isotherm the solid holds relatively less at high "
      + "concentration, so a concentrated part of the band is held less and "
      + "travels faster than a dilute part.  The top of the peak overtakes "
      + "its front, which sharpens into a near-shock, and leaves the dilute "
      + "rear behind as a long tail; the whole peak comes out earlier as the "
      + "load grows, and leans forward like a right triangle.  Two solutes "
      + "loaded together also compete for the same sites: the later one "
      + "pushes the earlier one ahead of it.  No closed form gives these "
      + "shapes, so the page integrates the bed.",
    formula: String.raw`q^*_i = \frac{q_s\, b_i\, c_i}{1 + \sum_j b_j c_j}, \qquad b_i = \frac{K_{c,i}}{q_s}, \qquad \frac{\mathrm{d}q^*_i}{\mathrm{d}c_i} < K_{c,i} \text{ when } c > 0`,
    where: [
      { sym: "q^*_i", means: "loading of solute i at equilibrium with the "
        + "fluid beside it", unit: "mol/kg" },
      { sym: "q_s", means: "the saturation capacity of the adsorbent, the "
        + "same for both solutes here (the competitive Langmuir model's own "
        + "requirement for consistency)", unit: "mol/kg" },
      { sym: "b_i", means: "Langmuir affinity of solute i", unit: "m³/mol" },
      { sym: "c_i", means: "concentration of solute i in the fluid",
        unit: "mol/m³" },
      { sym: "b_j", means: "affinity of each solute j competing for the "
        + "sites", unit: "m³/mol" },
      { sym: "c_j", means: "concentration of each solute j", unit: "mol/m³" },
      { sym: "K_{c,i}", means: "the low-concentration slope of solute i's "
        + "isotherm, the same K_c as step 1", unit: "m³/kg" },
    ],
    note: "The loading is measured by b_2 c_inj, the affinity of the later "
      + "solute times the injected concentration: about 0.01 is analytical, "
      + "near 1 the isotherm is far from straight.  The page's integration "
      + "uses the same two bed equations as the engine, with the Langmuir "
      + "q* in place of the straight line, on a second-order finite-volume "
      + "grid; the panel shows its mass balance and lets you check it on a "
      + "grid twice as fine.  The same equations describe a liquid column, "
      + "where holding the velocity constant is a good assumption; for the "
      + "gas bed of steps 1 to 4 at this load it is not (see the limits).",
  },
  {
    n: 6,
    title: "The trade: how much you purify, and at what purity",
    body: "Loading more puts more product on the column per injection, but "
      + "the bands widen and run into each other, so a purity target "
      + "forces the cuts inwards and more of each product goes to the middle "
      + "fraction that is neither.  The page sweeps the load at the "
      + "injection length you chose and, for each, finds the latest cut "
      + "that keeps the first product at the target purity and the earliest "
      + "that keeps the second there; it reports how much of each is "
      + "recovered per injection.  The amount recovered first rises with "
      + "the load and then stops rising -- or falls -- once the overlap eats "
      + "it; where that happens depends on the column, the selectivity and "
      + "the target, and the table shows it for yours.",
    note: "The page does not pick a best load.  Which one is best depends on "
      + "what an injection, the solvent or carrier, the middle fraction and "
      + "the column cost, none of which is on this page.",
  },
];

export const CHROM_LIMITS: readonly LessonLimit[] = [
  {
    id: "no-liquid-route",
    title: "Liquid chromatography has no engine route.",
    body: "The engine's fixed bed is a gas-phase unit: its isotherms are "
      + "written on partial pressures and its feed is a gas.  The linear "
      + "pulse the engine runs here is therefore a gas pulse on a synthetic "
      + "linear sorbent.  The overloaded column is the page's own "
      + "integration of the same equations in concentration units, which is "
      + "the form a liquid column takes; nothing on this page is a liquid "
      + "chromatography computed by the engine.",
  },
  {
    id: "constant-velocity",
    title: "The velocity is held constant.",
    body: "Both the engine's bed (in the mode used here) and the page's "
      + "integration hold the fluid velocity constant.  For a dilute gas "
      + "pulse that is a good closure, and the engine books the small "
      + "difference as a named carrier make-up stream.  For a concentrated "
      + "gas pulse it is not: the gas would slow down as the solid takes "
      + "solute up (the sorption effect).  Read step 5 as a liquid column, "
      + "where it holds.",
  },
  {
    id: "isothermal",
    title: "Isothermal.",
    body: "No heat of adsorption warms the band; at high load in a gas this "
      + "would change the isotherm under the peak.",
  },
  {
    id: "competition",
    title: "Competition is the competitive Langmuir model, with one capacity.",
    body: "The overloaded peaks compete through the competitive Langmuir "
      + "isotherm with the same saturation capacity for both solutes; a "
      + "switch turns the competition off so you can see what it does.  Real "
      + "mixtures may follow neither: the displacement and tag-along effects "
      + "seen here are the model's, not a measurement's.",
  },
  {
    id: "lumped-rates",
    title: "One rate constant, one dispersion coefficient.",
    body: "The uptake is a linear driving force with one k per solute, and "
      + "the dispersion one coefficient computed from d_p and D_m with fixed "
      + "factors (γ = 0.7, λ = 0.5).  Film and intraparticle diffusion are "
      + "not resolved separately, and the factors are typical values, not "
      + "fitted to a packing.",
  },
  {
    id: "not-covered",
    title: "Not covered.",
    body: "Gradient elution, extra-column broadening (injector, connections, "
      + "detector), column overload of the detector, temperature "
      + "programming, and the simulated moving bed.  The injection is a "
      + "perfect rectangle at the column inlet.",
  },
];
