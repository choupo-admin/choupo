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

**TRANSCRIPTION AMBIGUITY, FLAGGED NOT ASSUMED.**  Table 6's header gives
the VALIDITY range in °C while the rest of the paper (Eqs 7, 13, 14 and
Table 3's own header) uses T in kelvin.  The polynomials give different
values under the two readings, so the case must not guess: the intended
scale is settled by reproducing Table 7 (below), which is the point of
having a numeric anchor at all.

### Table 7 — THE ANCHOR.  NH3–CO2–H2O at 100 °C
Experimental data from Otsuka et al. (1960); columns I and II are the
paper's own predictions (II re-estimates three β⁰ by Eq 21 as noted).

    total molality      predicted molecular m      y in vapour
    NH3    CO2          I(NH3)  I(CO2)  II(NH3) II(CO2)   exp NH3  I     II
    2.90   1.45         1.245   0.014   1.225   0.015     0.066   0.123 0.140
                                                exp CO2 0.506  I 0.494  II 0.481
      ionic strength    I 1.50          II 1.55
      pressure, atm     exp 3.15        I 2.51   II 2.53

    3.71   1.14         2.279   0.0056  2.263   0.0065    0.274   0.293 0.310
                                                exp CO2 0.202  I 0.230  II 0.242
      ionic strength    I 1.26          II 1.24
      pressure, atm     exp 2.08        I 1.98   II 2.10

    4.30   0.907        3.087   0.0030  3.077   0.0038    0.355   0.407 0.419
                                                exp CO2 0.095  I 0.116  II 0.135
      ionic strength    I 1.01          II 0.98
      pressure, atm     exp 2.00        I 1.97   II 2.10

    II differs from I by:  β⁰(NH3,NH4+) = ½β⁰(NH4+,NH4+) + ½β⁰(CO2,NH4+)
                                        - ½β⁰(CO2,CO2) = 0.051
                           β⁰(NH3,HCO3-) = β⁰(CO2,HSO3-) = -0.03
                           β⁰(CO2,CO3=)  = β⁰(CO2,SO3=)  =  0.068

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
