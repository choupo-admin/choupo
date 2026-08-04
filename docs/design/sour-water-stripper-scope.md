# Sour-water stripper — a distillation column under speciation (scope)

**Status: SCOPE, awaiting Vítor's alignment.  No code is authorised by this
document.**  Requested 2026-08-04 ("podemos fazer o caso 1?"); this states
what the case is, what the engine must gain, what can be validated WITHOUT
the primary source, and the one thing only Vítor can supply.

---

## 1. Why this case

Every distillation tutorial in the corpus runs `gammaPhi` — a molecular
world.  A sour-water stripper is the case where that is not enough: the
volatility of NH₃ and CO₂ is set by a chemistry the column itself moves.
Strip CO₂ from the top and the liquid's pH rises; the rising pH converts
NH₄⁺ back to free NH₃, which then strips.  **The separation and the
speciation are the same problem**, and a molecular K-value cannot express
it.  It is also the sharpest possible teaching contrast: the same feed,
the same trays, and an answer no `gammaPhi` column can produce.

It sits directly on the work of 2026-08-03: `basis01_two_unit_chain`
already runs exactly this chemistry (NH₃ + CO₂ + water, the `ammonia` and
`carbonate` networks at once) through the reactive flash.

## 2. The primary anchor — and the problem with it

The canonical source is **Edwards, T. J., Maurer, G., Newman, J. &
Prausnitz, J. M., "Vapor-liquid equilibria in multicomponent aqueous
solutions of volatile weak electrolytes", AIChE J. 24(6): 966–976 (1978)**
— model AND data for NH₃/CO₂/H₂S/SO₂/HCN in water.  Existence and
citation verified 2026-08-04.

**It cannot be obtained from this environment.**  The session's network
policy permits search but denies document fetching: `escholarship.org`
(the LBL report copy) and the other candidate hosts return 403 at the
gateway.  The AIChE original is paywalled regardless.

So the numbers must come from Vítor (IST access) or from another machine.
**This does not block the engine work** — §4 is anchored on internal
identities that need no paper — but it does mean the case ships in two
stages, and the second is a curation act, not a coding one.

## 3. What the engine must gain

The seam is exact and small to state.  The column asks, per stage:

    K[j] = thermo.Kvec(T[j], P, x[j], x[j]);        // molecular K-values

and the reactive path lives elsewhere entirely:

    ReactiveVLE::solve(T_K, P_Pa, F, z, ...) -> ReactiveVLEResult

`Kvec` has no reactive branch.  A stage under speciation therefore has no
equilibrium to ask for.

**Proposed: EFFECTIVE APPARENT K-VALUES PER STAGE.**  At each stage
evaluation, run the reactive flash at that stage's (T, P, z) and read back
K_i = y_i / x_i on the APPARENT component basis.  Feed those into the
existing MESH.

Why this shape and not a species-variable MESH:

* it keeps the apparent components as the state, which is the settled
  doctrine (CLAUDE.md, the two-bases rule) — the speciation is internal to
  the stage exactly as it is internal to a flash;
* it reuses the reactive solver rather than writing a second one, so the
  column and the flash cannot disagree about the same chemistry;
* the per-stage speciation block is then carriable by the machinery built
  on 2026-08-03 (`origin`, `solvedAtT`, `equilibriumValidHere`), so each
  tray can REPORT its ion profile and its pH honestly.

What it costs, stated plainly: one reactive flash per stage per outer
iteration.  A 10-stage column at ~6 Newton iterations is ~60 reactive
flashes — seconds, not minutes, but an order of magnitude above a
molecular column, and the case header must say so rather than let a
student wonder.

What it is NOT: it is not a rigorous species-basis MESH.  The Jacobian
sees apparent components; the chemistry is re-solved inside each residual
evaluation (the same nested posture the two-liquid flash already uses).
That must be DECLARED in the case and in `PinchPass`-style method
hypotheses on the class, never implied.

## 4. What can be validated WITHOUT the paper

Three internal anchors, each strong enough to catch a real error:

1. **THE ONE-STAGE IDENTITY.**  A column of a single equilibrium stage,
   total reboiler, no reflux, must reproduce the reactive FLASH at the
   same (T, P, z) to machine precision.  Two independent code paths, one
   answer — this is the anchor that catches a wrong K-value definition,
   and it needs no literature at all.
2. **CONSERVATION PER TRAY AND OVERALL.**  Element closure and charge
   closure on every stage's liquid, and across the column boundary.  The
   gates for both already exist.
3. **THE PHYSICS DIRECTION.**  Stripping CO₂ must RAISE the liquid pH down
   the column, and the free-NH₃ fraction must rise with it.  A column that
   strips ammonia while its pH falls is wrong in a way no residual would
   show.  Pinned as a monotonicity check, not a number.

## 5. What only the paper can give

The quantitative anchor: the paper's own computed/measured partial
pressures for the NH₃–CO₂–H₂O system at stated molalities and
temperatures, golden-locked digit for digit — the pattern the
external-reference battery already follows (`cavett01`, the Williams-Otto
four).  Until then the case is honest but self-referential, and its header
must say exactly that rather than imply a validation it does not have.

**What I need from Vítor:** the paper's Table(s) for NH₃–CO₂–H₂O — the
Henry's constants, the chemical equilibrium constants and their
temperature dependence, the interaction parameters, and at least one
worked VLE point with its total and partial pressures.  Pasted as text is
enough; I will not need the PDF.

## 6. Staging

* **S1** — the effective-K seam: `Kvec` gains a reactive branch (or the
  column gains a `stageEquilibrium` that dispatches), with the ONE-STAGE
  IDENTITY as its witness.  No new case yet.
  **DONE 2026-08-04** — `ThermoPackage::stageK(T, P, zStage, x, y)` is the
  one entry a tray asks for equilibrium: it forwards to `Kvec` for a
  molecular package (all twelve column tutorials byte-identical) and runs
  the reactive flash for a reacting one, reading back the effective
  apparent K = y/x.  The witness is
  `tutorials/steady/distillation/column12_stage_is_a_flash`, gated by
  `bin/curate/check_stage_identity.py` — see §6a for what the witness
  turned into and why.
* **S2** — the stripper case: a real multi-stage sour-water column, the
  per-tray speciation reported, conservation + direction gated.
* **S3** — the literature anchor, once the tables exist: goldens locked on
  the paper's numbers, provenance of every value in the case header.
* **S4 (deferred, named)** — H₂S as the third volatile weak electrolyte.
  The paper covers it; the corpus has no H₂S network records, so it is a
  curation slice of its own and must not ride along silently.

## 6a. The one-stage identity, as built (2026-08-04)

§4 asked for "a column of a single equilibrium stage, total reboiler, no
reflux".  **The engine cannot express one, and that is not a defect to
work around by force.**  Both methods build a cascade with a total
condenser above and a partial reboiler below: Wang-Henke requires
`feedStage < nStages`, the simultaneous MESH requires `feedStage >= 2`,
and at zero reflux the top stage is starved of liquid, so the smallest
honest column is two real stages.  Bending the column to fit the test
would have been the wrong repair — the test exists to check the column,
not the reverse.

The claim was therefore restated in a form the engine states naturally,
and it is the SAME claim: **an equilibrium stage is a flash of its own two
products.**

    feed -> [15-stage MESH column] -> distillate, bottoms
                                   -> stageLiquid, stageVapour   (stage 5)
    stageLiquid + stageVapour -> [mixer] -> stageMix
    stageMix -> [adiabatic flash] -> checkLiquid, checkVapour

Both phases are drawn off ONE stage as real streams, recombined, and
re-flashed adiabatically at the same pressure.  Nothing may happen: the
same temperature, the same two compositions, and a vapour fraction equal
to the draw ratio.  None of those numbers is authored — both sides are
computed, by different code, and the gate compares them.  Because the
flash is ADIABATIC, its outlet temperature is solved from an energy
balance rather than declared, so the identity is an ENERGY statement as
well as an equilibrium one.

Two things worth carrying forward:

* **The tolerance is ~1e-7 relative, not machine precision**, and the
  reason is in the log: the adiabatic flash's outer Newton stops at an
  energy residual of ~2.5e-4 J/mol out of 5.4e+4.  That is the limit of
  the check, not of the physics.  The gate sits at 1e-6.
* **Building it found a real bug.**  `adiabaticFlash` priced every inlet
  as a sub-cooled liquid regardless of its vapour fraction — invisible,
  because the flash still converges, just to the wrong temperature, and
  because no case in the corpus had ever fed it a two-phase stream.  It
  now reads the feed's `vf`, on the stream's own enthalpy surface.

The molecular case is the CONTROL: the identity must hold on a system
nobody doubts before the same construction is trusted on one where the
K-values come out of a chemistry.  The reacting twin is S2's first piece.

## 7. Decision requested

Approve the effective-K shape (§3) and the two-stage delivery (engine now,
literature anchor when the tables arrive) — or amend.  If the shape is
approved I start at S1, whose witness needs nothing that is not already in
the repository.

---

## Appendix A — the primary source, transcribed (2026-08-04)

Vítor supplied the paper.  Everything below is transcribed from **Edwards,
T. J., Maurer, G., Newman, J. & Prausnitz, J. M., "Vapor-liquid equilibria
in multicomponent aqueous solutions of volatile weak electrolytes", AIChE
J. 24(6): 966–976 (1978)**, and captured here so the work does not depend
on holding the PDF again.

> **WHAT THIS APPENDIX FAILED TO CAPTURE, and the rule that follows.**
> It transcribed every TABLE and only *labelled* the EQUATIONS —
> "(8) Pitzer truncation for ln γ_i*" is a caption, not a model.  When the
> hosted container reverted on 2026-08-04 and took the PDF with it, the
> parameters survived and the thing that consumes them did not, which
> stopped the implementation dead.
>
> **A transcription is not done until the equations are written out.**
> Parameters without their functional form are unusable, and they are
> unusable in the most expensive way: they *look* like a complete record.
> When Eqs 8–10 and 20–24 are re-read they go in here in full — symbols
> defined, constants explicit, the Debye–Hückel term and the B_ij(I) form
> written rather than named.  Each table keeps its own number so a curated
record can cite it exactly.

### The model, in the paper's own equations

    (5)   y_a φ_a P = m_a γ_a* H^(P)                     molecular solute VLE
    (6)   (1-y_a) φ_w P = a_w P_w^s φ_w^s exp[v̄_w(P-P_w^s)/RT]     solvent
    (7)   ln K = A1/T + A2 ln T + A3 T + A4              dissociation, molality
    (8)   Pitzer truncation for ln γ_i*  (ion-ion, molecule-ion, molecule-molecule)
    (9)   I = ½ Σ z_j² m_j
    (10)  ln a_w from Gibbs-Duhem
    (11)  ln H^(P) = ln H^(Pw_s) + v̄_a^∞ (P - P_w^s)/RT   Krichevsky-Kasarnovsky
    (13)  ln H = B1/T + B2 ln T + B3 T + B4              H in kg·atm/mol, T in K
    (14)  β⁰_aa = E + F/T
    (20)  carbamate  NH3 + HCO3- ⇌ NH2COO- + H2O:  ln K = -8.6 + 2900/T  (20–60 °C)
    (21)  unlike molecules:  β⁰_ij = ½(β⁰_ii + β⁰_jj)
    (24)  β⁽¹⁾ = 0.018 + 3.06 β⁰

### THE EQUATIONS, in full (transcribed 2026-08-04, second pass)

Written out rather than named, per the rule above.  `w` = water, `a` =
molecular solute, `i,j,k` = solute species (molecular or ionic), `m` in
**mol per kg of WATER**, `z` = charge.

**(8) Activity coefficient of a solute species — the Pitzer truncation**
(Pitzer 1973; Pitzer & Kim 1974):

    ln γ_i* = − A_φ z_i² [ √I/(1 + 1.2√I) + (2/1.2) ln(1 + 1.2√I) ]

              + 2 Σ_{j≠w} m_j { β_ij⁽⁰⁾ + (β_ij⁽¹⁾/(2I))
                                · [ 1 − (1 + 2√I) exp(−2√I) ] }

              − (z_i²/(4I²)) Σ_{j≠w} Σ_{k≠w} m_j m_k β_jk⁽¹⁾
                                · { 1 − (1 + 2√I + 2I) exp(−2√I) }

**(9)**  `I = ½ Σ_j z_j² m_j`

**The three rules the paper states around Eq 8, each load-bearing:**
* if `i` OR `j` is a MOLECULAR species, keep `β_ij⁽⁰⁾` but set
  **`β_ij⁽¹⁾ = 0`** — "because experimental data are inadequate";
* for ions `i,j` of **LIKE charge**, `β_ij⁽⁰⁾ = β_ij⁽¹⁾ = 0` (Brønsted
  1922/1923: like charges do not approach);
* `m` MUST be molal (mol/kg water) for Eqs 8 and 9 as written.

**A_φ** (paper's own footnote): `A_φ = 2.303 A_γ / 3`, with `A_γ` the
Debye–Hückel parameter tabulated 0–100 °C in Lewis et al. (1961)
Appendix 4.  Above that:

    A_φ = 1.4017e-6 · √(ρ*) / (D* T)^(3/2)

with `ρ*` the density of saturated water [g/cm³] (CRC 1970-71) and `D*`
its dielectric constant (Akerlof & Oshry 1950).

**(10) Water activity, from Gibbs–Duhem:**

    ln a_w = M_w { 2 A_φ I^(3/2)/(1 + 1.2√I)
                   − Σ_{i≠w} Σ_{j≠w} m_i m_j [ β_ij⁽⁰⁾
                                              + β_ij⁽¹⁾ exp(−2√I) ] }
             − M_w Σ_{i≠w} m_i

**Low-dissociation limits** (single weak electrolyte, ions negligible) —
useful as an implementation self-check:

    (8a)  ln γ_a* = 2 β_aa⁽⁰⁾ m_a
    (10a) ln a_w  = [ − β_aa⁽⁰⁾ m_a² − m_a ] M_w

**(11) Henry pressure correction (Krichevsky–Kasarnovsky):**

    ln H^(P) = ln H^(P_w^s) + v̄_a^∞ (P − P_w^s) / (R T)

**(12) The data-reduction form** (how B and β⁰ were fitted; a second
self-check):

    ln( y_a φ_a P / m_a ) − v̄_a^∞ (P − P_w^s)/(R T) = ln H + 2 β_aa⁽⁰⁾ m_a

**(13)** `ln H = B1/T + B2 ln T + B3 T + B4`   [H in kg·atm/mol]
**(14)** `β_aa⁽⁰⁾ = E + F/T`

**Also from Table 1's footnote**, and easy to get wrong:
`K_NH4OH = K_w / K_NH4+` — the ammonium-hydroxide dissociation constant
is *derived* from the ammonium-ion one, not tabulated separately.

### Table 1 — dissociation constants (Eq 7), molality units

    species   A1          A2         A3            A4         valid, °C
    NH3       -3335.7      1.4971    -0.0370566      2.76      0–225
    CO2      -12092.1    -36.7816     0.0          235.482     0–225
    HCO3-    -12431.7    -35.4819     0.0          220.067     0–225
    H2S      -12995.4    -33.5471     0.0          218.599     0–150
    HS-       K = 0.018 Kw                                     0–150
    SO2        -637.396    0.0       -0.0151337     -1.96211   0–50
    HCN       -9945.53     0.0       -0.0495786     26.9191    10–150
    H2O      -13445.9    -22.4773     0.0          140.932     0–225
    HSO3-     K = 1.02e-7                                      18

### Table 2 — partial molar volumes at infinite dilution, cm³/mol

    T,°C     NH3    CO2    H2S    SO2
      0      28.7   32.4   34.8   40.3
     50      30.0   34.0   36.5   42.3
    100      33.9   38.3   41.1   47.6
    150      40.4   45.6   48.8   56.5

### Table 3 — Henry's constants (Eq 13), kg·atm/mol, T in K

    solute   B1          B2         B3           B4          valid, °C
    NH3       -157.552    28.1001   -0.049227    -149.006     0–150
    CO2      -6789.04    -11.4519   -0.010454      94.4914    0–250
    H2S     -13236.8     -55.0551    0.0595651    342.595     0–150
    SO2      -5578.8      -8.76152   0.0           68.418     0–100
    HCN     -49068.8    -241.82      0.315014    1446.005     10–140

### Table 4 — molecule-molecule β⁰_aa = E + F/T

    solute   E, kg/mol    F, (kg/mol)·K
    NH3      -0.0260       12.29
    CO2      -0.4922      149.20        (* 0–100 °C)
    H2S      -0.2106       61.56
    SO2      +0.0275        0
    HCN      -0.8919      278.86

### Table 5 — ion contribution β(0) = β₊(0) + β₋(0), kg/mol

    NH4+  -0.028 · HCO3- -0.049 · CO3= -0.034 · HS- 0.074 · S= 0.007
    HSO3- -0.035 · SO3=  -0.017 · CN-  -0.025 · NH2COO- 0.078
    H+     0.120 · OH-    0.088
    (interaction parameters between ions of LIKE sign are assumed zero)

### Table 6 — molecule-ion (salting-out) β⁰, kg/mol, 0–170 °C
NH3/CO2 subset only — the H2S/SO2/HCN rows are deferred with S4.

    NH3-NH4+     0
    NH3-HCO3-    0.135 - 1.165e-3 T + 2.05e-6 T²
    NH3-CO3=     0.06
    NH3-NH2COO-  0
    NH3-H+       0.015
    NH3-OH-      0.227 - 1.47e-3 T + 2.6e-6 T²
    CO2-NH4+     0.037 - 2.38e-4 T + 3.83e-7 T²
    CO2-HCO3-    0
    CO2-CO3=     0
    CO2-NH2COO-  0.017
    CO2-H+       0.033
    CO2-OH-      0.26 - 1.62e-3 T + 2.89e-6 T²

**THE TEMPERATURE SCALE: KELVIN.  Settled 2026-08-04, arithmetically,
from the paper's own worked number — no longer a flag.**

Table 6's header quotes the VALIDITY range in °C while its polynomials
are written in `T`, and the two readings give different values.  The
paper settles it itself: Table 7's column II states

    β⁰(NH3,NH4+) = ½β⁰(NH3,NH3) + ½β⁰(CO2,NH4+) − ½β⁰(CO2,CO2) = 0.051

at 100 °C.  Evaluating the right-hand side both ways:

    KELVIN  (T = 373.15)  β⁰(CO2-NH4+) = +0.001520  ->  0.0504   ✔
    CELSIUS (T = 100)     β⁰(CO2-NH4+) = +0.017030  ->  0.0582   ✘

against a stated 0.051.  Kelvin lands within rounding; Celsius is out by
ten times that.  **`T` in Table 6 is kelvin, and the °C in its header is
the validity range** — exactly the convention Tables 1 and 3 already use
(formula in K, "Range of validity, °C" as a separate column).

Worth keeping as a method note: the resolution came from an internal
CONSISTENCY relation the paper published alongside its parameters, not
from reproducing the whole table.  A single closed-form identity settled
in one line what a full multisolute solve would have settled ambiguously
— many knobs, one number to match.

### The MULTISOLUTE system (NH3–CO2–H2O): 17 equations, 17 unknowns

Nine species: NH3(molecular), CO2(molecular), NH4+, HCO3−, CO3=, H+,
OH−, NH2COO−, H2O.  Unknowns are `m_i` and `γ_i*` for all but water,
plus `a_w`.

**Five chemical equilibria** (15,16,17a,17b,18a,18b,19 combine to these):

    K1 = a(NH4+)·a(OH−) / (a(NH3)·a(H2O))          NH3  + H2O ⇌ NH4+ + OH−
    K2 = a(H+)·a(HCO3−) / (a(CO2)·a(H2O))          CO2  + H2O ⇌ H+ + HCO3−
    K3 = a(H+)·a(CO3=) / a(HCO3−)                  HCO3− ⇌ H+ + CO3=
    K4 = a(NH3)·a(HCO3−) / (a(NH2COO−)·a(H2O))     the CARBAMATE reaction
    K5 = a(H+)·a(OH−) / a(H2O)                     water

**Two mass balances:**

    total NH3 = m(NH3) + m(NH4+) + m(NH2COO−)
    total CO2 = m(CO2) + m(HCO3−) + m(CO3=) + m(NH2COO−)

**Electroneutrality:**

    m(NH4+) + m(H+) = m(HCO3−) + 2 m(CO3=) + m(NH2COO−) + m(OH−)

**Plus** Eq (8) for eight activity coefficients (one per species except
water) and Eq (10) for `a_w`.  8 + 1 + 5 + 2 + 1 = 17.

**(19)/(20) the carbamate reaction**, `NH3 + HCO3− ⇌ NH2COO− + H2O`:

    ln K = −8.6 + 2900/T                       (20 to 60 °C)

The paper notes the answer is INSENSITIVE to it — decreasing K by a
factor of two changes the Table 7 total pressure by under 2 % — which is
why Eq 20 is used above its stated range without ceremony.  Worth
carrying: it tells us this is not the knob to blame if the anchor misses.

### How the interaction parameters are ESTIMATED (Eqs 21–25)

Only β⁰ for LIKE molecules is measured (Eq 14 / Table 4).  Everything
else is estimated, and the case must say so:

    (21)  unlike molecules:     β⁰_ij = ½ ( β⁰_ii + β⁰_jj )
    (22)  Bromley (1972):       β_+− = β_+ + β_−            [ion-ion]
    (23)  Edwards et al. 1975:  β_(m−i) = β_molecule + β_ion  [molecule-ion]
    (24)  Pitzer & Mayorga:     β⁽¹⁾ = 0.018 + 3.06 β⁰
    (25)  dβ⁰_(m−i)/dT = − ( v̄_a^∞ / (β_w R T) ) · dv̄_i^∞/dT

Eq (24) is what makes the multisolute calculation tractable: β⁽¹⁾ is
never an independent datum, it is a correlation of β⁰.

**Both parameter tables carry the same caveat in the paper's own words**
— "preliminary results subject to change as more and better data become
available" — and Table 5 adds that ion-ion parameters for LIKE-signed
ions are assumed zero.  A case using these must not present them as
measured constants.

### Table 7 — THE ANCHOR.  NH3–CO2–H2O at 100 °C

Experimental data from Otsuka et al. (1960).  Columns **I** and **II** are
the paper's OWN predictions; II re-estimates three β⁰ as footnoted below.
Three points, not one — so a golden can lock a trend, not a coincidence.

| total m(NH3) | total m(CO2) | | m(NH3) mol. | m(CO2) mol. | I | y(NH3) | y(CO2) | P [atm] |
|---|---|---|---|---|---|---|---|---|
| 2.90 | 1.45 | **exp** | — | — | | 0.066 | 0.506 | 3.15 |
| | | **I** | 1.245 | 0.014 | I = 1.50 | 0.123 | 0.494 | 2.51 |
| | | **II** | 1.225 | 0.015 | I = 1.55 | 0.140 | 0.481 | 2.53 |
| 3.71 | 1.14 | **exp** | — | — | | 0.274 | 0.202 | 2.08 |
| | | **I** | 2.279 | 0.0056 | I = 1.26 | 0.293 | 0.230 | 1.98 |
| | | **II** | 2.263 | 0.0065 | I = 1.24 | 0.310 | 0.242 | 2.10 |
| 4.30 | 0.907 | **exp** | — | — | | 0.355 | 0.095 | 2.00 |
| | | **I** | 3.087 | 0.0030 | I = 1.01 | 0.407 | 0.116 | 1.97 |
| | | **II** | 3.077 | 0.0038 | I = 0.98 | 0.419 | 0.135 | 2.10 |

("I =" in the sixth column is the IONIC STRENGTH, mol/kg — the paper
reports it per prediction column.)

**Column II differs from I in exactly three parameters:**

    β⁰(NH3,NH4+)  = ½β⁰(NH3,NH3) + ½β⁰(CO2,NH4+) − ½β⁰(CO2,CO2) = 0.051
    β⁰(NH3,HCO3−) = β⁰(CO2,HSO3−) = −0.03
    β⁰(CO2,CO3=)  = β⁰(CO2,SO3=)  =  0.068

> **A TRANSCRIPTION ERROR, CORRECTED 2026-08-04.**  The first line read
> `½β⁰(NH4+,NH4+)` in this document until the paper was re-read.  It is
> `½β⁰(NH3,NH3)`.  The difference is not cosmetic: β⁰ between LIKE-SIGNED
> ions is zero by Brønsted (Table 5's own footnote), so the wrong version
> evaluates to 0.047 where the paper states 0.051 — and it was the
> relation used to settle the kelvin/Celsius question, so the error would
> have propagated into the temperature scale of every Table 6 parameter.
> Caught only because the check was carried out arithmetically instead of
> being read past.

### What the anchor can and cannot claim — read this before locking a golden

Two DIFFERENT comparisons live in Table 7 and conflating them would be
dishonest:

* **against the paper's PREDICTIONS (columns I/II)** — an exact,
  code-to-code check.  Choupo implementing the same equations with the
  same parameters must land on those numbers.  This is the golden.
* **against the EXPERIMENT** — the paper's own agreement is approximate:
  y_NH3 0.066 measured against 0.123 predicted in the first row is
  roughly a factor of two, and total pressure 3.15 atm against 2.51.  The
  paper says so plainly ("satisfactory agreement with the severely
  limited experimental data now available") and devotes its Table 9 to a
  sensitivity analysis showing the liquid-composition error needed to
  close the gap.  A Choupo case must quote the experiment as CONTEXT, not
  as a target it hits.

That distinction is the case's whole pedagogical value: the student sees
a correlation reproduced exactly and its agreement with reality stated
honestly, which is the opposite of a tool that prints one number.
