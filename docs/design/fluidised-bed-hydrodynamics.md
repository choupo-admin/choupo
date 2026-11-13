# Fluidised beds: minimum fluidisation, regimes and bubbles (the `fluidised-beds` EduTool)

Written 2026-11-12 with the page.  The student's task, in one sentence:
*"I have a bed of particles and a gas; at what velocity does it fluidise, what
regime will it be in, how much does it expand, and how much gas bypasses the
particles?"*  Scope approved by the project owner; the page sits on the
"Separations & phase equilibria" shelf beside `breakthrough`, `lub-scaleup`
and `chromatography`, the other bed pages.

Files: `gui/src/case/fluidisedBeds.ts` (the arithmetic),
`gui/src/ui/methods/FluidisedBedsTool.tsx` (the page),
`gui/src/ui/methods/fluidisedBedsLesson.ts` (the lesson text),
`gui/tests/fluidisedBeds.test.ts` (the checks).  Theory Guide
`sec:fluidised-bed`; EduTools Guide `sec:edu-fluidised-beds`.

## 1. What the page asks of the engine: nothing, and why

Measured in this tree before the page was written:

* No unit operation computes a minimum fluidisation velocity, a bed
  expansion, a bubble size or a regime.  A search of `src/` for "fluidis" /
  "fluidiz" in every `.H` and `.cpp` finds ONE file,
  `src/unitOperations/separation/PSA.cpp`, and the hit is its statement that
  it has none ("No hydraulics: no Ergun dP, velocity, fluidisation, ...").
  The test `the lesson > says the engine has no fluidised bed` repeats the
  search and fails the day a second file mentions it, so the sentence on the
  page cannot outlive the fact.
* The engine HAS Ergun's packed-bed gradient, in the plug-flow reactor's
  opt-in pressure drop (`PFR::ergunTerms`, `src/unitOperations/reactor/PFR.cpp`,
  the two terms `150.0 * (1.0 - e) * (1.0 - e) * mu / (e * e * e * h.dp * h.dp)`
  and `1.75 * (1.0 - e) * rho / (e * e * e * h.dp)`).
* It HAS a single particle's terminal velocity, in the pneumatic conveyor
  (`terminalVelocity` in `src/unitOperations/hydraulics/PneumaticConveyor.cpp`,
  Schiller-Naumann drag with a switch to 0.44 at Re = 1000), and the cyclone
  (`src/unitOperations/separation/Cyclone.cpp`) that catches what a bed throws
  out.

The page writes those two laws in the SAME form (the test holds the engine's
source to the searched fragments, never to line numbers), so a student who
later reads the engine meets the page's arithmetic.  Everything else is the
page's own, badge `page`.

**The gas properties.**  The engine's package could supply a gas density and
viscosity at T and P, but only through a property run per change of T or P,
which in the browser means a WASM run per keystroke and here, with no
emscripten, a Playwright stub to test it.  The page keeps the declared route:
density from the ideal-gas law at the T, P and molar mass the student picks
(page arithmetic), viscosity typed (badge `assumption`, default 18 µPa s,
"a typical value for air near room temperature").  No engine run, so no
stale-answer guard is needed and none was written.

## 2. What the page computes

1. **Packed to fluidised.**  Ergun's gradient at `eps_mf`, the weight line
   `(1 - eps_mf)(rho_p - rho_g) g`, and `u_mf` as the root of their gap by
   BISECTION on `[0, u_hi]` (`u_hi` grown by doubling until the gap is
   positive; the gap is `-W` at zero and grows without bound), to a bracket of
   1e-15 relative.  The quadratic formula (in its non-cancelling form
   `2W/(a + sqrt(a^2 + 4bW))`) is printed beside it.  Wen and Yu's
   `Re_mf = sqrt(C1^2 + C2 Ar) - C1` is printed with the percentage
   difference.  The derivation on the page shows that `C2 = eps^3/1.75` for a
   sphere, which fixes `eps = 0.415`; at that voidage Ergun's `C1` would be
   25.1, not 33.7, so the fit absorbed a shape factor.  This is the page's own
   derivation and holds by algebra (tested).  The pressure-drop plot draws
   Ergun below `u_mf` and the weight per area above it.
2. **Geldart's groups.**  Classified on three straight lines on log axes of
   `d` (µm) and `Delta rho` (g/cm3): C/A `Delta rho d^2 = 1600`, A/B
   `Delta rho d = 225`, B/D `Delta rho d^2 = 1e6`, tested in that order.
   These are the page's APPROXIMATION of the published map and are labelled so
   on the page; the figure was not traced.  One plain sentence per group.
3. **The velocities.**  `u_mb` by Abrahamsen and Geldart (group A only; for
   B and D, `u_mb = u_mf`, and a computed `u_mb < u_mf` is raised to `u_mf`),
   `u_t` by bisection on Re of `Cd(Re) Re^2 = (4/3) Ar` with Schiller-Naumann
   (`Cd Re^2` is monotone for that law, with a jump of 0.4 % upward at
   Re = 1000, so the bracket holds one root), the onsets `u_c` and `u_se` by
   Bi and Grace, and `u/u_mf`.  A velocity axis draws fixed bed / particulate
   (A only) / bubbling / turbulent / fast fluidisation or pneumatic
   transport; the page says the last two cannot be told apart without the
   solids circulation rate.
4. **Bubbles.**  The two-phase form: `u_b = u - u_mf + 0.711 sqrt(g d_b)`,
   `delta = (u - u_mf)/u_b`; Mori and Wen's `d_b(h)` above a perforated plate
   (evaluated in cm, s); the expanded height `H = L_mf/(1 - delta_bar)` by
   fixed point on H, `delta_bar` the trapezoid mean over `[0, H]` (400
   intervals); Kunii and Levenspiel's bubble-to-cloud coefficient `K_bc`
   (cgs) and the unexchanged fraction `Y = exp(-int K_bc/u_b dh)`; the bypass
   `psi = ((u - u_mf)/u) Y`, computed twice: with growing bubbles and with
   every bubble frozen at its distributor size.  Davidson's cloud ratio
   `3 (u_mf/eps_mf)/(u_br - u_mf/eps_mf)` for the top bubble.  The cloud is
   counted as contact with the emulsion (the page's approximation, stated).
   A schematic shows bubble, cloud, wake and emulsion; the reactor
   consequence is stated in words and no reactor model is built.
5. **Elutriation.**  `u_t` per size class of a distribution the student
   types; a class is "carried out" when `u > u_t`; the cut diameter
   (`u_t = u`) by bisection on d.  No elutriation rate (that needs an
   entrainment correlation and the freeboard).  Points to the engine's
   `cyclone` unit and `tutorials/steady/gas-solid/cyclone01_dust_removal`;
   there is no cyclone EduTool page to link to.
6. **Limits** and a three-statement exercise (below).

Refusals: a particle not denser than the gas, a voidage outside (0, 1), a
non-positive diameter, viscosity, height, velocity, bed diameter, orifice
count or diffusivity, a fines fraction outside [0, 1], an unreadable size
line (by its number).  Flags (shown, never clipped): Ar outside 2-1e8 for Bi
and Grace; Re_t above 2e5; Mori and Wen's stated ranges.

## 3. The exercise, checked

| statement | what the page computes (air, 1.2 kg/m3, 18 µPa s, rho_p 2600, eps 0.42) | verdict |
|---|---|---|
| "Doubling the particle diameter halves u_mf." | u_mf(2d)/u_mf(d) = 3.9-4.0 at 60 µm, 1.41-1.45 at 10 mm | false: it rises, as d^2 (viscous) towards d^0.5 (inertial) |
| "Once fluidised, blowing harder raises the pressure drop." | identical at 1.01, 2 and 4 u_mf | false in this model |
| "Ten times the pressure leaves u_mf unchanged." | ratio above 0.98 at 60 µm, below 0.4 at 5 mm (density x10, viscosity held) | true for fine, false for coarse |

The bounds in the middle column are what the tests assert.

## 4. Checks (gui/tests/fluidisedBeds.test.ts, 24 tests)

* `u_mf` against a hand calculation written out in the test (d 200 µm,
  rho_p 2600, rho_g 1.2, mu 1.8e-5, eps 0.42: a = 306486.88, b = 82199.546,
  W = 14781.603, u_mf = 0.0476209434 m/s, to 1e-9).
* Ergun at the root equals the weight line to 1e-9 relative, three powders.
* Wen-Yu at the same bed (0.0340537862 m/s), and the implied voidage 0.41486.
* The pressure-drop line against the force balance on the particles
  (`Delta P A = m_p g (1 - rho_g/rho_p)`), to 1e-12, above u_mf; continuity at
  u_mf to 1e-9.
* The terminal velocity: drag equals net weight to 1e-9 relative in the
  Stokes (10 µm), intermediate (200 µm) and Newton (5 mm) regimes; the Stokes
  limit at 5 µm within 1 %.
* Geldart: four hand-picked powders (10 µm/1.5 C, 70 µm/1.5 A, 300 µm/2.6 B,
  2 mm/1.2 D) and each boundary at three densities.
* The regime order, and the group A window.
* Bubbles: `H (1 - delta_bar) = L_mf` to 1e-12; growth bypasses more than
  frozen bubbles; no bubbles at u_mf; Mori-Wen's range flagged.
* Elutriation: the cut diameter satisfies `u_t = u` to 1e-9; classes either
  side of it fall either side.
* The exercise's three claims, as in section 3.
* The lesson: six steps, its two pointers land on real steps of live tools,
  and the engine claims are held to the engine source by searched fragments.
* The page renders every step, the engine statement and the exercise.

## 5. A proposal for the engine (NOT built)

A `fluidisedBed` unit would need, in order of what a student would meet:

1. A hydrodynamic core with no reaction: `u_mf` from Ergun at a DECLARED
   `eps_mf` (no default voidage) with the gas density and viscosity from the
   case's package at the bed's T and P (where the page has to ask the
   student), Wen-Yu printed beside it as a comparison, the regime and
   `u/u_mf` published as KPIs, the bed's pressure drop (weight per area plus a
   declared distributor drop) published so a blower can be sized on it.
2. Particle data from the case's `sizeGrid` / PSD (the same grid the
   cyclone and the classifiers use), so elutriation can be class by class and
   the carried-out stream can be wired to the existing `cyclone`.
3. Only then a reactor: Kunii-Levenspiel's bubbling-bed model for a
   first-order reaction on the existing reaction factory, with the bubble
   size from a declared correlation, every constant announced as the engine
   announces its other correlations, and the bypass published.
4. Not proposed: circulating beds, entrainment rates, heat transfer to
   immersed surfaces.  Each is its own decision.

Every correlation would need its constants read back against the paper
before it entered `src/` (section 6 is the list).

## 6. To check against the source

Every equation, constant and number below that comes from a published work
was written from the published form as remembered, not read in the work.
Status `unchecked` means exactly that.  DOIs were resolved on Crossref on
2026-11-12 (authors, title, container, volume, issue, pages, year); the book
was checked in a catalogue (Open Library ISBN 0409902330).  The reviewing
session holds Kunii and Levenspiel (2nd ed.), Geldart (1973) and Wen and Yu
(1966); the rest were not available to the author.

| # | what the page uses | source | status |
|---|---|---|---|
| 1 | Ergun: 150 (1-eps)^2 mu u/(eps^3 d^2) + 1.75 (1-eps) rho u^2/(eps^3 d), spheres | Ergun (1952), Chem. Eng. Prog. 48, 89 (no DOI; not verified in a catalogue); same form as `PFR::ergunTerms` | unchecked against the paper; matches the engine (tested) |
| 2 | weight line (1-eps_mf)(rho_p-rho_g) g at fluidisation | force balance (derived) | derived, holds |
| 3 | Ar and Re_mf quadratic, eq. on the page | derived from 1 and 2 | derived, holds |
| 4 | Wen-Yu constants C1 = 33.7, C2 = 0.0408 | Wen and Yu (1966), AIChE J. 12, 610, doi 10.1002/aic.690120343 | unchecked |
| 5 | the accuracy Wen and Yu quote for their correlation | same | not quoted on the page; unchecked |
| 6 | the range of Re_mf / Ar over which Wen-Yu was fitted | same | not used on the page; unchecked |
| 7 | C2 fixes eps = (1.75 C2)^(1/3) = 0.415 for a sphere | derived from 3 and 4 | derived, holds |
| 8 | Geldart groups C, A, B, D and their behaviour (one sentence each) | Geldart (1973), Powder Technol. 7, 285, doi 10.1016/0032-5910(73)80037-3 | unchecked |
| 9 | the axes of the map: mean particle size against (rho_p - rho_g) | same | unchecked |
| 10 | A/B boundary as Delta rho d = 225 (µm, g/cm3) | the page's approximation of the published map | unchecked |
| 11 | B/D boundary as Delta rho d^2 = 1e6 (µm, g/cm3) | the page's approximation | unchecked |
| 12 | C/A boundary as Delta rho d^2 = 1600 (µm, g/cm3), and that the published C/A boundary is a band | the page's approximation | unchecked |
| 13 | u_mb = 2.07 exp(0.716 F) d rho_g^0.06/mu^0.347 (SI), F the mass fraction below 45 µm, group A only | Abrahamsen and Geldart (1980), Powder Technol. 26, 35, doi 10.1016/0032-5910(80)85005-4 | unchecked (constants, exponents, the 45 µm cut and the units) |
| 14 | Schiller-Naumann Cd = 24/Re (1 + 0.15 Re^0.687), 0.44 above Re = 1000 | Schiller and Naumann (1933), Z. Ver. Dtsch. Ing. (no DOI; not verified); same form as the engine's `dragCoeff` | unchecked against the source; matches the engine (tested) |
| 15 | Stokes regime below Re = 0.3; Newton regime 1000 to 2e5; drag crisis above | textbook conventions | unchecked |
| 16 | Bi-Grace Re_c = 1.24 Ar^0.45, Re_se = 1.53 Ar^0.5, and the Ar range 2 to 1e8 the page flags against | Bi and Grace (1995), Int. J. Multiphase Flow 21, 1229, doi 10.1016/0301-9322(95)00037-X | unchecked (the attribution of these two forms to this paper is itself unchecked) |
| 17 | the regime sequence fixed / particulate / bubbling / turbulent / fast or transport | Kunii and Levenspiel (1991), ch. 1-3 (chapter titles seen on Crossref) | unchecked |
| 18 | two-phase idea: the gas beyond u_mf rises as bubbles, delta = (u - u_mf)/u_b | Kunii and Levenspiel (1991); the page's simple form | unchecked (which variant the book prefers) |
| 19 | u_br = 0.711 sqrt(g d_b), u_b = u - u_mf + u_br | Davidson and Harrison (1963), Fluidised Particles (not verified in a catalogue); as used by Kunii and Levenspiel | unchecked |
| 20 | Mori-Wen d_bm = 0.652 [A_t(u-u_mf)]^0.4, d_b0 = 0.347 [A_t(u-u_mf)/n_d]^0.4, d_b = d_bm - (d_bm - d_b0) exp(-0.3 h/D_t), cm and s | Mori and Wen (1975), AIChE J. 21, 109, doi 10.1002/aic.690210114 | unchecked |
| 21 | Mori-Wen ranges flagged: D_t 0.3-1.3 m, u_mf 0.5-20 cm/s, d_p 60-450 µm, u - u_mf up to 48 cm/s | same | unchecked |
| 22 | K_bc = 4.5 u_mf/d_b + 5.85 D^0.5 g^0.25/d_b^1.25 (cgs) | Kunii and Levenspiel (1991) | unchecked |
| 23 | Davidson cloud ratio 3 (u_mf/eps_mf)/(u_br - u_mf/eps_mf), fast bubbles only | Davidson and Harrison (1963) via Kunii and Levenspiel | unchecked |
| 24 | bubble / cloud / wake / emulsion picture; lower conversion than plug flow because of bypass | Kunii and Levenspiel (1991) | unchecked (stated in words, no number) |
| 25 | counting the cloud as contact with the emulsion | the page's approximation | stated on the page |
| 26 | H = L_mf/(1 - delta_bar), emulsion at eps_mf | derived (particle volume conserved) | derived, holds (tested to 1e-12) |
| 27 | a size class is carried out when u > u_t | the page's criterion (no freeboard, no rate) | stated on the page |
| 28 | "18 µPa s is a typical value for air near room temperature" | the page's assumption | unchecked |
| 29 | molar masses 28.96, 28.01, 44.01, 4.003 g/mol | standard atomic weights (air a mean) | unchecked here |

No table, figure or data set from any of these works is reproduced: every
number on the page is the page's own example, and the Geldart map is the
page's straight lines, labelled as an approximation.

## 7. Engine findings met (reported, not fixed)

* `PneumaticConveyor.cpp` `terminalVelocity` iterates the drag balance by
  plain substitution from Stokes' velocity with a 1e-6 tolerance and 60
  passes, and returns its last iterate without saying whether it converged.
  The page brackets the same balance in Re instead.  Not measured whether the
  substitution fails for any corpus case; reported as a shape to look at.
* The Schiller-Naumann law the engine uses jumps by about 0.4 % at Re = 1000
  (0.438 below, 0.44 above).  Harmless for the engine; noted because a root
  that lands on the jump satisfies the balance only to that 0.4 %.

## 8. Not done

A reactor model, an elutriation rate and the freeboard, heat transfer, a
distributor design, wall effects and slugging, non-spherical particles, wide
size distributions in steps 1 to 4, circulating beds, and any engine unit.
