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
  The radiation of a pool fire, and the distance it sets, as LESSON TEXT
  (commission C83, 2026-10-17).  Vitor: "Faz essa EduTool da radiacao do
  incendio de poca, se achares importante".  The outline is DEV.md 4c C83's
  six parts, in that order.

  WHAT WAS READ AND WHAT WAS NOT, said once here and again on the page, in
  POOL_SOURCES.  The public-domain sources (US Bureau of Mines, US EPA, HUD's
  regulation, NIST and NBS reports) were read in full where used.  Two
  journal papers were read for the equations they print (Shokri & Beyler;
  Crocker & Napier), and nothing beyond an equation and its constants is
  taken from them.  The primary sources of three correlations -- Thomas
  (1963), Mudan & Croce (an SFPE Handbook chapter), Burgess, Strasser &
  Grumer (1961) -- were NOT read, and each says through which read source it
  was reached.  No per-fuel table of a no-grant handbook is used: the page
  calibrates k-beta on a public-domain NIST measurement instead.

  NOTHING IS QUOTED.  No sentence of any source is reproduced in quotation
  marks, and the test refuses a quotation mark in the steps.

  EVERY CORRELATION carries the file and line it is COMPUTED at (poolFire.ts)
  and every engine claim the file and line it was READ at; the test holds
  each citation to the line it names.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** Every source the page leans on, with what was taken from it, how it was
 *  reached, and its licence status.  Drawn at the foot of the page. */
export interface PoolFireSource { id: string; cite: string; used: string }

export const POOL_SOURCES: readonly PoolFireSource[] = [
  { id: "usbm-b680",
    cite: "J. M. Kuchta, Investigation of Fire and Explosion Accidents in the "
      + "Chemical, Mining, and Fuel-Related Industries -- A Manual, US Bureau "
      + "of Mines Bulletin 680 (1986)",
    used: "READ (US government work, public domain): Table 21, the linear "
      + "burning rate at infinite diameter and the fraction radiated, after "
      + "Burgess and Zabetakis (methanol 0.17 cm/min and 17 %); Eq. 74, the "
      + "Burgess expression for that rate; Appendix A, methanol's net heat "
      + "of combustion (159 kcal/mol); Table 45, the radiation thresholds "
      + "after Lawson and Hird (pain after a short time at 0.1 cal/(s cm2))." },
  { id: "burgess-1961",
    cite: "D. S. Burgess, A. Strasser, J. Grumer, Diffusive burning of liquid "
      + "fuels in open trays, Fire Research Abstracts and Reviews 3 (1961) "
      + "177; D. S. Burgess, M. G. Zabetakis, Fire and Explosion Hazards "
      + "Associated with Liquefied Natural Gas, US Bureau of Mines RI 6099 "
      + "(1962)",
    used: "the burning-rate correlation m''_inf = 0.001 dHc/dHg.  NOT READ: "
      + "no copy could be reached.  The correlation came through three read "
      + "sources that print it: the EPA guidance (Eq. D-23), Shokri and "
      + "Beyler (Eq. 5) and Bulletin 680 (Eq. 74)." },
  { id: "epa-rmp",
    cite: "US EPA, Risk Management Program Guidance for Offsite Consequence "
      + "Analysis, Appendix D (EPA 550-B-99-009, April 1999); and the rule it "
      + "serves, 40 CFR 68.22(a)(2)(ii)",
    used: "READ (US government work, public domain): the point-source model "
      + "(Eq. D-22), the burning-rate correlation with its constant 0.0010 "
      + "(Eq. D-23), the endpoint of 5 kW/m2 for 40 s and its reading as "
      + "second-degree burns, the thermal dose t q^(4/3) (Eq. D-33), and the "
      + "guidance's own assumptions (a radiated fraction of 0.4 and a "
      + "transmissivity of 1)." },
  { id: "hud-24cfr51",
    cite: "24 CFR 51.203, Safety standards (HUD, Siting of HUD-assisted "
      + "projects near hazardous operations)",
    used: "READ (a US regulation, public domain; through the Legal "
      + "Information Institute's copy of the eCFR text): 10,000 Btu/(h ft2) "
      + "for buildings and 450 Btu/(h ft2) for outdoor, unprotected areas of "
      + "congregation; converted to SI here." },
  { id: "nistir-6546",
    cite: "K. B. McGrattan, H. R. Baum, A. Hamins, Thermal Radiation from "
      + "Large Pool Fires, NISTIR 6546 (NIST, 2000)",
    used: "READ (US government work, public domain): the point-source and "
      + "solid-flame models and why the first is conservative near a fire, "
      + "the energy balance of the flame's side (Eq. 2: the radiated power "
      + "equals perimeter times height times emissive power), smoke "
      + "obscuration, and a transmissivity of 1 as the conservative choice." },
  { id: "nist-tn2082",
    cite: "R. Falkenstein-Smith, K. Sung, J. Chen, K. Harris, A. Hamins, The "
      + "Structure of Medium-Scale Pool Fires, NIST Technical Note 2082 "
      + "(2020), doi:10.6028/NIST.TN.2082",
    used: "READ (US government work, public domain): Table 1, the mean flame "
      + "heights of 30 cm methanol and acetone fires (36.4 and 91.5 cm), and "
      + "Table 5, the averages of the measured burning flux (13.2 and "
      + "18.3 g/(m2 s)) and radiative fraction (0.20 and 0.27) of the studies "
      + "it compiles.  Its heats of combustion were NOT used: it takes them "
      + "from a handbook, and this page derives its own from the catalogue." },
  { id: "nist-tn2083",
    cite: "K. Sung, J. Chen, M. Bundy, M. Fernandez, A. Hamins, The Thermal "
      + "Character of a 1 m Methanol Pool Fire, NIST Technical Note 2083 "
      + "(2020), doi:10.6028/NIST.TN.2083",
    used: "READ (US government work, public domain): a 1.00 m pan burning "
      + "12.8 g/s, a radiative fraction of 0.22 and a mean flame height of "
      + "1.10 m -- held back as the check of the curve calibrated at 30 cm." },
  { id: "nbsir-88-3755",
    cite: "D. W. Stroup, Naval Fire Fighting Trainers -- Thermal Radiation "
      + "Effects Associated with the 19F4 FFT, NBSIR 88-3755 (NBS, 1988)",
    used: "READ (US government work, public domain): the solid-flame "
      + "procedure (flux = transmissivity times view factor times emissive "
      + "power), Heskestad's flame height (Eq. 11) and the range of "
      + "Q^(2/5)/D, 7 to 700, it was tested over, and the vertical-cylinder "
      + "view factors it attributes to Raj and Kalelkar and to Sparrow.  Its "
      + "typesetting of those view factors drops two square roots, so the "
      + "page uses Shokri and Beyler's printing, and the test checks that "
      + "printing against a numerical integration of the definition." },
  { id: "shokri-beyler-1989",
    cite: "M. Shokri, C. L. Beyler, Radiation from large pool fires, Journal "
      + "of Fire Protection Engineering 1 (1989) 141-150",
    used: "READ (a copyrighted journal paper; equations cited, no table "
      + "reproduced): the burning flux m'' = m''_inf (1 - exp(-k beta D)) "
      + "(Eq. 4), the asymptote 0.001 dHc/dHg (Eq. 5), Heskestad's height "
      + "(Eq. 3), the view factor to a vertical target (Eq. 6b), and Mudan and "
      + "Croce's emissive power with its constants and its stated scope -- "
      + "gasoline, kerosene and JP-4 flames (Eq. 10).  Their own fit of the "
      + "emissive power (Eq. 9) is named and not used." },
  { id: "mudan-croce",
    cite: "K. S. Mudan, P. A. Croce, Fire hazard calculations for large open "
      + "hydrocarbon fires, SFPE Handbook of Fire Protection Engineering, "
      + "1st ed. (NFPA, 1988), section 2 chapter 4; K. S. Mudan, Thermal "
      + "radiation hazards from hydrocarbon pool fires, Progress in Energy "
      + "and Combustion Science 10 (1984) 59-80",
    used: "the smoke-obscured emissive power E = 140 exp(-0.12 D) + "
      + "20 (1 - exp(-0.12 D)) kW/m2.  NOT READ: the handbook grants no "
      + "redistribution and no copy of either was read; the form and the "
      + "constants came through Shokri and Beyler (Eq. 10)." },
  { id: "thomas-1963",
    cite: "P. H. Thomas, The size of flames from natural fires, Ninth "
      + "Symposium (International) on Combustion (Academic Press, 1963) "
      + "844-859",
    used: "the mean flame length L/D = 42 (m''/(rho_a sqrt(g D)))^0.61.  NOT "
      + "READ: reached through Crocker and Napier (Eq. 2), below." },
  { id: "crocker-napier-1986",
    cite: "W. P. Crocker, D. H. Napier, Thermal radiation hazards of liquid "
      + "pool fires and tank fires, IChemE Symposium Series No. 97 (1986)",
    used: "READ (a copyrighted symposium paper; one equation cited): "
      + "Thomas's flame-length correlation, its constants 42 and 0.61 and its "
      + "symbols." },
  { id: "heskestad-1983",
    cite: "G. Heskestad, Luminous heights of turbulent diffusion flames, Fire "
      + "Safety Journal 5 (1983) 103-108",
    used: "L = 0.23 Q^(2/5) - 1.02 D.  NOT READ: reached through NBSIR "
      + "88-3755 (Eq. 11) and Shokri and Beyler (Eq. 3)." },
  { id: "catalogue",
    cite: "The Choupo component catalogue, data/standards/components/"
      + "<name>.dat, and the engine's Component.cpp",
    used: "every property of a substance on this page: the formula, molar "
      + "mass, normal boiling point, critical temperature, latent heat at the "
      + "boiling point, liquid molar volume, liquid heat capacity and "
      + "ideal-gas formation enthalpy of the fuel, and the formation "
      + "enthalpies of O2, CO2 and H2O.  The Watson latent heat and the "
      + "gas-to-liquid crossing are the engine's own rules." },
  { id: "layout-case",
    cite: "tutorials/plant/aceticAcid02_plant/system/layoutDict",
    used: "its separation table, read from the file: the kinds, the distances, "
      + "the measure word and its own statement that the distances are "
      + "author-set assumptions taken from no published spacing table." },
];

export const POOL_STEPS: readonly LessonStep[] = [
  // ---- Part 1: why a distance -----------------------------------------------
  {
    n: 1,
    title: "Radiation falls with distance, and harm has a threshold",
    body: "A burning pool releases most of its heat in the hot gases of its "
      + "plume, and a part -- a fifth to a third for the fires on this page -- "
      + "as thermal radiation, in every direction.  A person or a building "
      + "nearby receives a share of that radiation that falls quickly with "
      + "distance: from a small source, with the square of the distance.  "
      + "Harm, on the other hand, starts at a level: below some flux a "
      + "person can stand for minutes, above it the skin burns in seconds; "
      + "below another a timber wall survives, above it the wall ignites.  "
      + "So the question a separation distance answers is a distance: where "
      + "does the flux fall to the level that a given target can bear?  This "
      + "page builds the flux from the fuel up -- how fast the pool burns, "
      + "how tall the flame is, how much it radiates -- by two published "
      + "models, then asks where each falls to four published thresholds, "
      + "and compares the answer with the separation a layout case declares.  "
      + "Nothing here is a consequence analysis of a real plant: every "
      + "number is a lesson number, and every simplification is named in "
      + "Part 6.",
    formula: String.raw`q \propto \frac{1}{x^2}, \qquad q\left(x_\mathrm{t}\right) = q_\mathrm{t}`,
    where: [
      { sym: "q", means: "the radiant heat flux a target receives",
        unit: "W/m2" },
      { sym: "x", means: "the target's distance from the fire", unit: "m" },
      { sym: "x_\\mathrm{t}", means: "the distance at which the flux falls "
        + "to the threshold", unit: "m" },
      { sym: "q_\\mathrm{t}", means: "a threshold flux: the level a given "
        + "target can bear", unit: "W/m2" },
    ],
  },

  // ---- Part 2: the pool ----------------------------------------------------------
  {
    n: 2,
    title: "The heat of combustion, from the catalogue's formation enthalpies",
    body: "How much heat a kilogram of fuel gives is not typed on this page: "
      + "it is Hess's law on the formation enthalpies the engine's catalogue "
      + "carries for the fuel and for its products.  The fuel C_aH_bO_c burns "
      + "to a CO2 and b/2 H2O and takes a + b/4 - c/2 O2.  With the water "
      + "left as VAPOUR the result is the lower heating value, the one fire "
      + "work uses, because the water leaves a flame as steam.  The "
      + "catalogue's formation enthalpies are those of the ideal GAS, so the "
      + "sum is the heat of burning the fuel's vapour; a pool burns a LIQUID "
      + "that must first be vaporised, so the latent heat at 25 C is taken "
      + "off -- by Watson's rule from the record's own boiling point, "
      + "critical temperature and latent heat at the boiling point, which is "
      + "exactly the crossing the engine takes when it prices a gas-datum "
      + "species as a liquid.  For methanol the catalogue gives 676.2 kJ/mol "
      + "for the vapour and 638.2 kJ/mol, 19.92 MJ/kg, for the liquid; the "
      + "Bureau of Mines bulletin that this page also uses lists 159 kcal/mol "
      + "(665 kJ/mol) for the vapour, 1.6 % lower: two independent routes "
      + "that agree to under 2 %.",
    formula: String.raw`\Delta H_\mathrm{c}^\mathrm{vap} = \Delta H_\mathrm{f}^\mathrm{fuel} + \nu_{\ce{O2}}\,\Delta H_\mathrm{f}^{\ce{O2}} - a\,\Delta H_\mathrm{f}^{\ce{CO2}} - \frac{b}{2}\,\Delta H_\mathrm{f}^{\ce{H2O}}, \qquad \nu_{\ce{O2}} = a + \frac{b}{4} - \frac{c}{2}`,
    where: [
      { sym: "\\Delta H_\\mathrm{c}", means: "the lower heating value: the "
        + "heat released per mole burnt, water leaving as vapour, at "
        + "298.15 K (the superscript says whether the fuel is vapour or "
        + "liquid)", unit: "J/mol" },
      { sym: "\\Delta H_\\mathrm{f}", means: "a formation enthalpy at "
        + "298.15 K, ideal gas, of the species in the superscript, as its "
        + "catalogue record declares it (O2 is an element: zero)",
        unit: "J/mol" },
      { sym: "\\nu_{\\ce{O2}}", means: "the moles of O2 one mole of fuel "
        + "takes", unit: "–" },
      { sym: "a", means: "carbon atoms in the fuel molecule", unit: "–" },
      { sym: "b", means: "hydrogen atoms in the fuel molecule", unit: "–" },
      { sym: "c", means: "oxygen atoms in the fuel molecule", unit: "–" },
      { sym: "\\Delta H_\\mathrm{v}", means: "the latent heat of "
        + "vaporisation at the temperature in brackets", unit: "J/mol" },
      { sym: "\\Delta H_\\mathrm{v,b}", means: "the latent heat at the "
        + "normal boiling point, as the record declares it", unit: "J/mol" },
      { sym: "T", means: "a temperature", unit: "K" },
      { sym: "T_\\mathrm{c}", means: "the critical temperature, from the "
        + "record", unit: "K" },
      { sym: "T_\\mathrm{b}", means: "the normal boiling point, from the "
        + "record", unit: "K" },
      { sym: "T_0", means: "the ambient temperature, 298.15 K on this page",
        unit: "K" },
      { sym: "\\Delta h_\\mathrm{c}", means: "the lower heating value of the "
        + "LIQUID per kilogram", unit: "J/kg" },
      { sym: "M", means: "the molar mass, from the record", unit: "kg/mol" },
    ],
    derivation: [
      { step: "The latent heat at T, from the record's value at the normal "
          + "boiling point (Watson, the engine's exponent 0.38):",
        eq: String.raw`\Delta H_\mathrm{v}(T) = \Delta H_\mathrm{v,b}\left(\frac{T_\mathrm{c} - T}{T_\mathrm{c} - T_\mathrm{b}}\right)^{0.38}` },
      { step: "The liquid burns less heat out than its vapour by the latent "
          + "heat at the reference temperature:",
        eq: String.raw`\Delta H_\mathrm{c}^\mathrm{liq} = \Delta H_\mathrm{c}^\mathrm{vap} - \Delta H_\mathrm{v}\left(T_0\right)` },
      { step: "And per kilogram, by the record's molar mass:",
        eq: String.raw`\Delta h_\mathrm{c} = \frac{\Delta H_\mathrm{c}^\mathrm{liq}}{M}` },
    ],
    note: "Computed at gui/src/ui/methods/poolFire.ts:242 (lhvVapour), "
      + "poolFire.ts:250 (watsonHvap) and poolFire.ts:258 (lhvLiquid).  The "
      + "rules are the engine's: Watson at src/thermo/Component.cpp:1334-1342 "
      + "(Component::Hvap_latent), and the gas-to-liquid crossing at "
      + "Component.cpp:1181-1182.  The page's Watson reproduces the "
      + "24 520.52 J/mol the engine prints for acetone at 394.11 K in the "
      + "relief02 witness's pinned golden, to the last digit.",
  },
  {
    n: 3,
    title: "How fast the pool burns: the Burgess correlation, and one measurement",
    body: "A pool burns as fast as the flame can feed heat back to its "
      + "surface to evaporate it.  Burgess, Strasser and Grumer at the US "
      + "Bureau of Mines found that the burning rate of a large pool scales "
      + "with the ratio of what a kilogram gives when it burns to what it "
      + "costs to evaporate it from ambient: the heat of combustion over the "
      + "heat to warm the liquid to its boiling point and vaporise it.  The "
      + "constant is 0.001 kg/(m2 s).  That is the asymptote of a LARGE pool, "
      + "where the flame is optically thick.  A small pool burns slower, "
      + "because its thin flame radiates less back to the surface, and the "
      + "approach to the asymptote is written as an exponential in the "
      + "diameter, with a product k beta that is a property of the fuel's "
      + "flame.  Tables of k beta exist, but the one everybody quotes is in a "
      + "handbook that grants no right to copy it, so this page does what a "
      + "student can check: it takes ONE public-domain measurement -- the "
      + "30 cm pan fires NIST compiles -- and solves for the k beta that "
      + "makes the curve pass through it.  Then it holds the curve against a "
      + "measurement it did NOT use: NIST's 1 m methanol fire burns 16.3 "
      + "g/(m2 s), and the curve calibrated at 30 cm predicts 16.5.  For "
      + "methanol the Bureau of Mines bulletin gives a second asymptote, from "
      + "Burgess's own data, of 0.17 cm/min, which is 22.3 g/(m2 s) at the "
      + "catalogue's liquid density: the correlation's 16.6 is the lower of "
      + "two published estimates, and the bench shows both.",
    formula: String.raw`\dot{m}^{\prime\prime} = \dot{m}_\infty^{\prime\prime}\left(1 - \exp\left(-k\beta D\right)\right)`,
    where: [
      { sym: "\\dot{m}^{\\prime\\prime}", means: "the mass burning flux: "
        + "liquid burnt per unit pool area and time", unit: "kg/(m2 s)" },
      { sym: "\\dot{m}_\\infty^{\\prime\\prime}", means: "its limit for a "
        + "very large pool", unit: "kg/(m2 s)" },
      { sym: "k", means: "the extinction coefficient of the flame gases; "
        + "only the product k beta is ever fitted", unit: "1/m" },
      { sym: "\\beta", means: "a mean-beam-length factor that turns the "
        + "pool diameter into the flame's path length", unit: "–" },
      { sym: "D", means: "the pool diameter", unit: "m" },
      { sym: "C_\\mathrm{B}", means: "the Burgess constant, 0.001",
        unit: "kg/(m2 s)" },
      { sym: "\\Delta h_\\mathrm{g}", means: "the heat to warm a kilogram "
        + "of the liquid from ambient to its boiling point and vaporise it "
        + "there", unit: "J/kg" },
      { sym: "C_{p,\\mathrm{L}}", means: "the liquid's molar heat capacity, "
        + "the record's constant", unit: "J/(mol K)" },
      { sym: "D_\\mathrm{m}", means: "the diameter of the measured pool",
        unit: "m" },
      { sym: "\\dot{m}_\\mathrm{m}^{\\prime\\prime}", means: "its measured "
        + "burning flux", unit: "kg/(m2 s)" },
    ],
    derivation: [
      { step: "The asymptote, from the heat of combustion over the heat of "
          + "gasification (the Burgess correlation, as the EPA guidance and "
          + "Shokri and Beyler print it):",
        eq: String.raw`\dot{m}_\infty^{\prime\prime} = C_\mathrm{B}\,\frac{\Delta h_\mathrm{c}}{\Delta h_\mathrm{g}}` },
      { step: "The heat to gasify a kilogram from ambient, from the record's "
          + "latent heat and liquid heat capacity:",
        eq: String.raw`\Delta h_\mathrm{g} = \frac{\Delta H_\mathrm{v,b} + C_{p,\mathrm{L}}\left(T_\mathrm{b} - T_0\right)}{M}` },
      { step: "And k beta from one measured pool, by inverting the "
          + "exponential:",
        eq: String.raw`k\beta = -\frac{1}{D_\mathrm{m}}\ln\left(1 - \frac{\dot{m}_\mathrm{m}^{\prime\prime}}{\dot{m}_\infty^{\prime\prime}}\right)` },
    ],
    note: "Computed at poolFire.ts:269 (gasificationHeat), poolFire.ts:274 "
      + "(burgessMinf), poolFire.ts:289 (burningFlux) and poolFire.ts:295 "
      + "(kBetaFromMeasurement).  The liquid heat capacity is the record's "
      + "own constant, and its validity window ends near the boiling point; "
      + "the record's liquid molar volume is at 25 C, so the density is the "
      + "liquid's at 25 C.",
  },
  {
    n: 4,
    title: "The heat the fire releases",
    body: "The fire releases the heat of combustion of what it burns: the "
      + "burning flux times the pool area times the heat of combustion per "
      + "kilogram.  Two things are hidden in that product.  It assumes the "
      + "combustion is complete -- true for methanol and acetone in a pan "
      + "(NIST found no measurable CO), less true for a large, sooty "
      + "hydrocarbon fire.  And it is the heat of burning the LIQUID: the "
      + "flame burns vapour and returns part of its heat to the pool to make "
      + "more, and that part goes round inside the fire rather than out of "
      + "it.  NIST's 1 m methanol fire released 256 kW by oxygen-consumption "
      + "calorimetry; this page computes 258 kW from the catalogue and the "
      + "curve of step 3.",
    formula: String.raw`\dot{Q} = \dot{m}^{\prime\prime}\,\frac{\pi D^2}{4}\,\Delta h_\mathrm{c}`,
    where: [
      { sym: "\\dot{Q}", means: "the heat release rate of the fire",
        unit: "W" },
      { sym: "\\pi", means: "the circle constant: the pool is round",
        unit: "–" },
    ],
    note: "Computed at poolFire.ts:301 (heatRelease).",
  },

  // ---- Part 3: the flame -----------------------------------------------------------
  {
    n: 5,
    title: "How tall the flame is: two correlations, one measurement",
    body: "To radiate, the flame needs a size, and the simplest shape that "
      + "works is a cylinder standing on the pool, as wide as the pool and "
      + "as tall as the mean visible flame.  Thomas correlated the height of "
      + "flames over burning wood cribs with the burning flux made "
      + "dimensionless by the air density and the speed a body falling "
      + "through the diameter would reach; Heskestad correlated it with the "
      + "heat release rate alone, from pool fires and burners alike.  "
      + "They do not agree, and measurement decides between them here: NIST "
      + "measured a mean flame height of 1.10 m over its 1 m methanol pan, "
      + "and 0.364 m and 0.915 m over 30 cm methanol and acetone pans.  "
      + "Heskestad gives 1.10 m for the 1 m fire; Thomas gives 1.55 m.  At "
      + "30 cm Heskestad gives 0.44 m against a measured 0.36 m, inside the "
      + "plus-or-minus 0.16 m by which that flame's height scatters.  A "
      + "methanol flame is nearly invisible and short for its heat, and a "
      + "wood-crib correlation over-predicts it.  Each correlation also has a "
      + "domain: Heskestad's was tested for Q^(2/5)/D between 7 and 700 "
      + "kW^(2/5)/m, and a wide methanol pool falls below it -- at 40 m its "
      + "height goes to zero, which is the correlation failing, not the "
      + "flame vanishing.  The bench lets you take either, shows both, and "
      + "says when Heskestad is outside the range it was tested on.",
    formula: String.raw`\frac{L}{D} = 42\left(\frac{\dot{m}^{\prime\prime}}{\rho_\mathrm{a}\sqrt{g D}}\right)^{0.61}`,
    where: [
      { sym: "L", means: "the mean flame height: the cylinder's height",
        unit: "m" },
      { sym: "\\rho_\\mathrm{a}", means: "the density of the ambient air",
        unit: "kg/m3" },
      { sym: "g", means: "the acceleration of gravity, 9.80665", unit: "m/s2" },
      { sym: "P_0", means: "the ambient pressure, 101 325 Pa", unit: "Pa" },
      { sym: "M_\\mathrm{a}", means: "the molar mass of air, from the air "
        + "record", unit: "kg/mol" },
      { sym: "R", means: "the molar gas constant, 8.314 J/(mol K)",
        unit: "J/(mol K)" },
    ],
    derivation: [
      { step: "Heskestad's height, with the heat release in kW:",
        eq: String.raw`L = 0.23\,\dot{Q}^{2/5} - 1.02\,D` },
      { step: "The air density, an ideal gas at the page's ambient state and "
          + "the air record's molar mass:",
        eq: String.raw`\rho_\mathrm{a} = \frac{P_0\,M_\mathrm{a}}{R\,T_0}` },
    ],
    note: "Computed at poolFire.ts:308 (airDensity), poolFire.ts:313 "
      + "(thomasHeight), poolFire.ts:318 (heskestadHeight) and "
      + "poolFire.ts:327 (heskestadGroup, with the tested range NBSIR "
      + "88-3755 states).  Thomas's constants are the ones Crocker and "
      + "Napier print; the 1963 paper was not read.",
  },
  {
    n: 6,
    title: "How brightly the flame's surface radiates, and the smoke that hides it",
    body: "A solid flame needs an emissive power: the radiant flux leaving each "
      + "square metre of the cylinder's side.  Two routes give one, and they "
      + "can disagree by a factor of ten.  The first is energy: the side of "
      + "the cylinder must send out the fraction of the heat release that is "
      + "radiated -- NIST measured 0.22 for its 1 m methanol fire, and its "
      + "compilation gives 0.27 for 30 cm acetone -- so the emissive power is that power over the "
      + "side's area, and it depends on the flame height chosen in step 5.  "
      + "The second is Mudan and Croce's correlation for SOOTY hydrocarbon "
      + "flames: a clear flame radiates up to 140 kW/m2, but a large fire "
      + "makes black smoke that hides most of its luminous surface, so the "
      + "emissive power falls with the diameter towards the 20 kW/m2 of the "
      + "smoke.  Its own scope is gasoline, kerosene and JP-4.  Methanol "
      + "burns with an almost invisible blue flame and makes no soot: at "
      + "1 m the energy route gives 12 to 16 kW/m2, by the flame height you "
      + "take, where Mudan and Croce would give 126 -- the correlation used outside its scope, and the "
      + "bench lets you see what that does to every distance.  Shokri and "
      + "Beyler, fitting the fluxes measured around the large fires they "
      + "reviewed, found effective emissive powers well below Mudan and "
      + "Croce's; the choice of this one "
      + "number moves a separation distance more than any other.",
    formula: String.raw`\chi_\mathrm{r}\,\dot{Q} = \pi D L E`,
    where: [
      { sym: "\\chi_\\mathrm{r}", means: "the radiative fraction: the part "
        + "of the heat release that leaves the fire as radiation",
        unit: "–" },
      { sym: "E", means: "the surface emissive power of the flame's side",
        unit: "W/m2" },
      { sym: "E_\\mathrm{max}", means: "Mudan and Croce's emissive power of "
        + "a clear luminous flame, 140", unit: "kW/m2" },
      { sym: "E_\\mathrm{s}", means: "their emissive power of the smoke, 20",
        unit: "kW/m2" },
      { sym: "s", means: "their extinction coefficient of the smoke "
        + "screen, 0.12", unit: "1/m" },
    ],
    derivation: [
      { step: "Mudan and Croce's smoke-obscured emissive power, for sooty "
          + "hydrocarbon flames:",
        eq: String.raw`E = E_\mathrm{max}\exp\left(-sD\right) + E_\mathrm{s}\left(1 - \exp\left(-sD\right)\right)` },
    ],
    note: "Computed at poolFire.ts:334 (mudanSEP) and poolFire.ts:341 "
      + "(energySEP).  The energy route is NISTIR 6546's Eq. 2 for a round "
      + "fire, the radiated power equal to perimeter times height times "
      + "emissive power; no radiation leaves through the cylinder's top or "
      + "bottom in this model.",
  },

  // ---- Part 4: the receiver ----------------------------------------------------------
  {
    n: 7,
    title: "The receiver, model 1: a point that radiates equally in all directions",
    body: "The simplest receiver model forgets the flame's shape: the "
      + "radiated power leaves one point, half way up the flame, equally in "
      + "every direction, and spreads over a sphere.  It needs only the heat "
      + "release and the radiative fraction -- which is why regulators use it "
      + "(the EPA's offsite consequence guidance is this equation, with a "
      + "radiative fraction of 0.4 assumed for every substance and a "
      + "transmissivity of 1).  It is meant for the far field, where the "
      + "flame really is small compared with the distance.  Near the fire it "
      + "is wrong in a direction that depends on the flame's shape, which "
      + "step 10 works out: it puts the whole power at one point, so beside a "
      + "tall, narrow flame it over-predicts, and beside a squat, wide one it "
      + "under-predicts.",
    formula: String.raw`q = \frac{\tau\,\chi_\mathrm{r}\,\dot{Q}}{4\pi r^2}, \qquad r^2 = x^2 + \left(\frac{L}{2} - z\right)^2`,
    where: [
      { sym: "\\tau", means: "the atmospheric transmissivity: the part of "
        + "the radiation the air lets through (step 9)", unit: "–" },
      { sym: "r", means: "the distance from the point, half way up the "
        + "flame, to the receiver", unit: "m" },
      { sym: "z", means: "the receiver's height above the ground", unit: "m" },
    ],
    note: "Computed at poolFire.ts:355 (pointSourceFlux); x is measured from "
      + "the pool's AXIS here, and from its edge in the tables.",
  },
  {
    n: 8,
    title: "The receiver, model 2: the flame's side seen through a view factor",
    body: "The solid-flame model keeps the cylinder.  A receiver sees the "
      + "flame's side under some solid angle, and the fraction of the "
      + "emitted radiation that reaches it is the VIEW FACTOR, a pure "
      + "geometric number between 0 and 1 that depends on where the receiver "
      + "is and how it faces.  For a vertical receiver -- a wall, a person "
      + "standing -- level with the base of a vertical cylinder and facing "
      + "its axis, the view factor has the closed form below.  A receiver at "
      + "a height z above the ground cuts the flame into the part above it "
      + "and the part below, each a cylinder whose base is level with the "
      + "receiver, and the two view factors add.  The page holds the closed "
      + "form, in its test, against a numerical integration of the view "
      + "factor's definition over the cylinder's side: two routes that share "
      + "nothing.",
    formula: String.raw`q = \tau\,F\,E`,
    where: [
      { sym: "F", means: "the view factor from the flame's side to the "
        + "receiver", unit: "–" },
      { sym: "F_\\mathrm{V}", means: "the view factor from a cylinder whose "
        + "base is level with a vertical receiver facing it", unit: "–" },
      { sym: "S", means: "the receiver's distance from the axis over the "
        + "pool radius", unit: "–" },
      { sym: "h", means: "the cylinder's height over the pool radius",
        unit: "–" },
      { sym: "A", means: "an auxiliary group of S and h", unit: "–" },
      { sym: "H", means: "the height of the part of the flame on one side "
        + "of the receiver's level", unit: "m" },
    ],
    derivation: [
      { step: "Shokri and Beyler's Eq. 6b, the view factor to a vertical "
          + "target:",
        eq: String.raw`F_\mathrm{V} = \frac{1}{\pi S}\tan^{-1}\frac{h}{\sqrt{S^2 - 1}} - \frac{h}{\pi S}\tan^{-1}\sqrt{\frac{S - 1}{S + 1}} + \frac{A\,h}{\pi S\sqrt{A^2 - 1}}\tan^{-1}\sqrt{\frac{(A + 1)(S - 1)}{(A - 1)(S + 1)}}` },
      { step: "with the dimensionless distance and height:",
        eq: String.raw`S = \frac{2x}{D}, \qquad h = \frac{2H}{D}, \qquad A = \frac{h^2 + S^2 + 1}{2S}` },
      { step: "and, for a receiver between the ground and the flame's top, "
          + "the part above it plus the part below:",
        eq: String.raw`F = F_\mathrm{V}\left(H = L - z\right) + F_\mathrm{V}\left(H = z\right)` },
    ],
    note: "Computed at poolFire.ts:364 (cylinderViewFactor), poolFire.ts:379 "
      + "(flameViewFactor, which also handles a receiver above the flame) "
      + "and poolFire.ts:391 (solidFlameFlux).",
  },
  {
    n: 9,
    title: "The air between: transmissivity taken as 1",
    body: "Water vapour and carbon dioxide in the air absorb part of a "
      + "fire's infrared radiation, more on a humid day and over a longer "
      + "path, so a real receiver gets a fraction tau of what the model "
      + "sends.  Published models of tau exist, and none of them was read "
      + "for this page; the EPA guidance, NISTIR 6546 and the NBS report "
      + "this page uses all take tau = 1 as the conservative choice, and so "
      + "does this page: every flux here is an upper bound on what the air "
      + "would let through.  On the distances that matter for a layout -- "
      + "tens of metres -- the reduction is modest; over hundreds of metres "
      + "it is not.",
    formula: String.raw`\tau = 1`,
  },
  {
    n: 10,
    title: "The two models side by side: apart near the fire, the same law far away",
    body: "Near the fire the two models disagree, and how they disagree "
      + "depends on the flame's shape.  Against the flame's side, a "
      + "receiver half way up sees nearly all of the cylinder and gets "
      + "almost E; the point source gives its power spread over a sphere "
      + "of the pool's radius.  With the energy route for E, the ratio of "
      + "the two at the flame's surface is the flame's height over the "
      + "pool's diameter (the derivation below): a tall flame (L > D, a "
      + "small pool or a sooty fuel) makes the point source the higher of "
      + "the two, a squat one (L < D, a wide methanol pool) makes it the "
      + "lower.  Far away both fall as one over the distance squared, and "
      + "the ratio tends to a constant: four over pi times the ratio of the "
      + "radiative fractions the two models carry.  With the energy route "
      + "both carry the same fraction, and the solid flame ends 4/pi = 1.27 "
      + "times the point source -- so the point source is NOT an upper bound "
      + "far away either, at an equal radiated fraction: a cylinder that "
      + "radiates only from its side sends more sideways than a sphere of "
      + "the same power, which sends part of it up and down.  This is why "
      + "the EPA guidance pairs the point source with a generous fraction, "
      + "0.4, rather than a measured one.  With Mudan and Croce's emissive "
      + "power the far-field ratio also carries how much more -- or less -- "
      + "power that correlation implies than the radiative fraction does, "
      + "and the bench prints it.",
    formula: String.raw`\frac{q_\mathrm{solid}}{q_\mathrm{point}} \to \frac{4}{\pi}\,\frac{\chi_E}{\chi_\mathrm{r}}, \qquad \chi_E = \frac{\pi D L E}{\dot{Q}}`,
    where: [
      { sym: "q_\\mathrm{solid}", means: "the solid-flame flux", unit: "W/m2" },
      { sym: "q_\\mathrm{point}", means: "the point-source flux",
        unit: "W/m2" },
      { sym: "\\chi_E", means: "the radiative fraction the solid flame's "
        + "emissive power implies", unit: "–" },
    ],
    derivation: [
      { step: "At the flame's surface, half way up (each half of the "
          + "cylinder fills half the view, so F tends to 1; tau = 1; "
          + "emissive power by the energy route):",
        eq: String.raw`q_\mathrm{solid} \to E = \frac{\chi_\mathrm{r}\,\dot{Q}}{\pi D L}, \qquad q_\mathrm{point} \to \frac{\chi_\mathrm{r}\,\dot{Q}}{\pi D^2}, \qquad \frac{q_\mathrm{point}}{q_\mathrm{solid}} \to \frac{L}{D}` },
      { step: "Far away, the cylinder's side is a small patch of projected "
          + "area D L seen square-on, radiating E/pi per steradian:",
        eq: String.raw`F \to \frac{D L}{\pi x^2}, \qquad q_\mathrm{solid} \to \frac{\tau E D L}{\pi x^2} = \frac{\tau\,\chi_E\,\dot{Q}}{\pi^2 x^2}` },
      { step: "while the point source spreads its power over a sphere:",
        eq: String.raw`q_\mathrm{point} \to \frac{\tau\,\chi_\mathrm{r}\,\dot{Q}}{4\pi x^2}` },
    ],
    note: "The test holds this limit: at a thousand diameters the ratio of "
      + "the two functions the bench draws equals 4/pi times the ratio of "
      + "the fractions, to 0.1 %.",
  },

  // ---- Part 5: thresholds and the distance to each -------------------------------------------
  {
    n: 11,
    title: "Thresholds, and the distance to each",
    body: "A threshold is only as good as the statement of what it means, "
      + "and the four on this page are taken from public-domain sources that "
      + "say it.  450 Btu/(h ft2), 1.42 kW/m2, is the US Department of "
      + "Housing and Urban Development's limit for outdoor, unprotected "
      + "places where people gather near a hazard, with no exposure time "
      + "attached.  0.1 cal/(s cm2), 4.18 kW/m2, is where, in the Bureau of "
      + "Mines bulletin after Lawson and Hird, people feel pain after a short "
      + "time -- read there also as about the threshold for second-degree "
      + "burns over minutes.  5 kW/m2 for 40 seconds is the EPA's endpoint "
      + "for a fire in an offsite consequence analysis, the dose its "
      + "guidance associates with second-degree burns, assuming a person "
      + "escapes within 40 s.  10 000 Btu/(h ft2), 31.5 kW/m2, is HUD's "
      + "limit for a building.  Notice that a flux without a TIME is "
      + "incomplete for a person: harm follows a dose, which the EPA guidance "
      + "takes as time times the flux to the four-thirds, so halving the "
      + "flux buys 2.5 times as long for the same dose, not twice.  For each "
      + "threshold the page finds the distance at which each model's flux falls to it; the "
      + "point source has the closed form below, the solid flame is solved "
      + "numerically.  And a threshold above the flux at the flame's own "
      + "surface is NEVER reached outside the fire.  With a dim methanol "
      + "flame, or with Mudan and Croce's smoke-averaged power for a very "
      + "wide pool (towards 20 kW/m2), that happens to the building limit, "
      + "and NISTIR 6546 warns against reading it as permission to build "
      + "anywhere: a real smoky fire has luminous patches far brighter than "
      + "its average, and an average spread over the whole flame "
      + "under-predicts the flux close to it.  So a distance to a threshold "
      + "is NOT a line between safe and harmed.  Inside it, a person who "
      + "turns away and leaves within seconds may be unhurt; beyond it, one "
      + "who cannot leave may still be burned, because the dose keeps "
      + "growing with time at any flux; clothing, shelter and the way out "
      + "change both; and the building limit says nothing about people at "
      + "all.  The bench therefore shows, beside every distance, the "
      + "exposure its source attaches, and beside the flux at your receiver "
      + "the time at which the EPA's dose would be reached there — both "
      + "recomputed whenever you move a knob.",
    formula: String.raw`x_\mathrm{t} = \sqrt{\frac{\tau\,\chi_\mathrm{r}\,\dot{Q}}{4\pi q_\mathrm{t}} - \left(\frac{L}{2} - z\right)^2}`,
    derivation: [
      { step: "The thermal dose the EPA guidance uses for a person, and the "
          + "dose of its endpoint:",
        eq: String.raw`t_\mathrm{e}\,q^{4/3} = 40 \times 5000^{4/3} \approx 3.42 \times 10^{6}` },
    ],
    where: [
      { sym: "t_\\mathrm{e}", means: "the exposure time", unit: "s" },
    ],
    note: "The exposure time beside the receiver's flux is computed at "
      + "poolFire.ts:457 (epaDoseTime, the dose rule above solved for t).  "
      + "Computed at poolFire.ts:467 (distanceTo, a bisection on the flux, "
      + "which falls with distance outside the pool for both models).  The "
      + "thresholds and their conversions: poolFire.ts THRESHOLDS.",
  },
  {
    n: 12,
    title: "What a layout case declares, beside what the fire says",
    body: "The plant-layout page shows a case declaring separation distances "
      + "between kinds of equipment, with a source and a reason, and says "
      + "that Choupo ships no spacing table because the published ones grant "
      + "no right to copy them.  Here is where such numbers come from.  The "
      + "case this page reads is the acetic-acid plant, the one that carries "
      + "methanol, and its table declares, edge to edge, 4 m between two "
      + "vessels and 30 m between a building and a vessel -- and says in its "
      + "own file that these are author-set assumptions taken from no "
      + "published table.  The bench puts your pool at a vessel's place and "
      + "asks what flux reaches those distances from its edge, by both "
      + "models, and how far each threshold reaches.  A prescriptive table "
      + "answers once, for a class of equipment; this calculation answers for "
      + "one fire, with every assumption visible -- and changes when any "
      + "one of them does.  What the bench prints is a CONSEQUENCE, in "
      + "still air, of one pool on burning rates calibrated on pans a metre "
      + "or less across and extrapolated beyond them: it neither confirms "
      + "nor refutes the case's table, and no distance on it is a certified "
      + "siting distance.  A flux threshold means something only with the "
      + "receiver it is for, the exposure time and the standard it comes "
      + "from (step 11); a siting decision adds the frequency of the fire "
      + "(step 13).",
    formula: String.raw`s_\mathrm{e} = x - \frac{D}{2}`,
    where: [
      { sym: "s_\\mathrm{e}", means: "the distance from the pool's EDGE, the way the "
        + "layout case measures (edgeToEdge)", unit: "m" },
    ],
    note: "The table is read from tutorials/plant/aceticAcid02_plant/system/"
      + "layoutDict at poolFire.ts:492 (readSeparation); nothing of it is "
      + "typed on this page.",
  },

  // ---- Part 6: limits ----------------------------------------------------------------
  {
    n: 13,
    title: "What the page leaves out: wind, smoke, terrain, and why a QRA",
    body: "Wind tilts the flame towards the receivers downwind and drags it "
      + "along the ground beyond the pool, which raises the view factor "
      + "downwind and lowers it upwind; correlations for the tilt and the "
      + "drag exist and are not on this page, so every distance here is a "
      + "still-air distance, and a receiver downwind of a real fire gets "
      + "more.  The smoke of a large sooty fire is treated as a uniform "
      + "screen in Mudan and Croce's correlation, while a real one opens and "
      + "closes and lets luminous bursts through.  Terrain, bunds, walls and "
      + "neighbouring equipment shade the receiver or reflect onto it, and a "
      + "spill that is not contained spreads to a diameter the page does not "
      + "predict -- you choose it.  And a distance from one fire is not a "
      + "layout decision by itself.  A prescriptive spacing table encodes, "
      + "once and for a class of equipment, the judgement of many such "
      + "calculations and of experience; a quantitative risk assessment "
      + "(QRA) instead adds the FREQUENCY of each fire to its consequence and "
      + "asks whether the risk to each person is tolerable.  This page "
      + "teaches the consequence half of that, for one scenario.",
  },
];

export const POOL_LIMITS: readonly LessonLimit[] = [
  { id: "not-a-design",
    title: "Nothing here is a consequence analysis",
    body: "Every pool diameter, distance and choice on this page is a lesson's. "
      + " A consequence analysis of a real plant follows the standard its "
      + "client or regulator specifies, with that standard's models and "
      + "data, and is reviewed independently." },
  { id: "fuels",
    title: "Two fuels, because only two could be calibrated",
    body: "Methanol and acetone are offered because the corpus' plants carry "
      + "them and a public-domain NIST measurement exists for each to "
      + "calibrate k beta.  A per-fuel table of k beta and of the asymptotic "
      + "burning rate exists in a handbook that grants no right to copy it, "
      + "and is not used.  Acetone's calibration rests on one 30 cm "
      + "measurement and is checked against nothing larger." },
  { id: "chi-constant",
    title: "The radiative fraction is held constant",
    body: "The measured fractions are for pans of 0.3 and 1 m.  For a large "
      + "sooty fire the fraction falls with the diameter as smoke hides the "
      + "flame (NISTIR 6546), and for acetone it may well; the bench lets "
      + "you move it, and does not move it for you." },
  { id: "no-wind",
    title: "Still air, no wind tilt, no flame drag",
    body: "Every flux is for a vertical flame in still air (step 13)." },
  { id: "tau",
    title: "Transmissivity 1",
    body: "No atmospheric absorption: every flux is an upper bound on that "
      + "count (step 9)." },
  { id: "vertical-receiver",
    title: "A vertical receiver facing the fire",
    body: "The solid-flame view factor is the one to a vertical surface "
      + "facing the flame's axis.  A roof, a horizontal target or a surface "
      + "turned away receives less; the maximum over all orientations is "
      + "larger and is not computed." },
  { id: "no-engine",
    title: "The engine does not model fire radiation",
    body: "The catalogue supplies the fuel's properties and the engine's own "
      + "Watson rule is reproduced; the fire model is this page's "
      + "arithmetic, and no flowsheet case, layout check or report computes "
      + "a fire's radiation." },
];
