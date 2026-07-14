# Pitzer-HMW vs Farelo: NaCl + NH₄Cl common-ion salting-out

A glass-box validation of Choupo's multi-ion Pitzer electrolyte model against the
solubility measurements of **Prof. Fátima Farelo** (Chemical Engineering Dept.,
IST — Técnico Lisboa).

## The experimental reference

> M. Farelo, C. Fernandes & A. Avelino, *"Solubilities for Six Ternary Systems:
> NaCl + NH₄Cl + H₂O, KCl + NH₄Cl + H₂O, NaCl + LiCl + H₂O, KCl + LiCl + H₂O,
> NaCl + AlCl₃ + H₂O, and KCl + AlCl₃ + H₂O at T = (298 to 333) K"*,
> **J. Chem. Eng. Data 50 (2005) 1470–1477.** DOI [10.1021/je050111j](https://doi.org/10.1021/je050111j).

Saturation molalities measured to ±0.0007 mol/kg (visual polythermal /
isothermal methods). The pure-salt anchors at 298.15 K: **NaCl 6.15**, **NH₄Cl
7.35 mol/kg**; the salting-out series (Table 1): NaCl solubility falls 6.15 → 5.5
→ 5.0 → 4.95 as NH₄Cl rises 0 → 0.93 → 1.87 → 2.80 mol/kg.

## What this case tests

The model is **calibrated to only the two pure-salt solubilities** — halite's Ksp
from PHREEQC, sal-ammoniac's Ksp pinned to Farelo's NH₄Cl point. Everything else
is a **prediction**. The NH₄–Cl Pitzer interaction parameters come from the
primary single-electrolyte fit (Pitzer & Mayorga 1973); the catalogue already
carried Na–Cl and K–Cl.

At each of Farelo's **measured** saturation compositions the model's saturation
index
```
SI = log10(a_Na · a_Cl) − logK_halite      (a_i = γ_i m_i, Pitzer-HMW)
```
should be ≈ 0 if the model reproduces the measurement. It is, to **±0.03 log
units**:

| Farelo measured point (298 K) | model SI_halite |
|---|---|
| NaCl 6.15 (pure) | **+0.017** |
| NaCl 5.50 + NH₄Cl 0.93 | **−0.022** |
| NaCl 5.00 + NH₄Cl 1.87 | **−0.028** |
| NH₄Cl 7.35 (pure) → SI_salammoniac | **−0.000** |

The **common-ion (Cl⁻) salting-out** — adding NH₄Cl drives NaCl out of solution —
emerges from the activity coefficients alone, exactly as Farelo measured.

## What this added to the standard catalogue

- `electrolyte/pairs.dat`: the **NH₄–Cl** Pitzer pair (Pitzer & Mayorga 1973; γ±
  validated to <1 % vs Robinson–Stokes to 2 mol/kg).
- `electrolyte/minerals.dat`: the **sal-ammoniac** (NH₄Cl) dissolution Ksp,
  logK₂₅ = 1.236, *calibrated to Farelo's measured 7.35 mol/kg*.

## Notes

- The water activity here is the **rigorous Pitzer-HMW osmotic coefficient** (not
  the φ = 1 dilute approximation) — see the Theory Guide, "The multi-ion osmotic
  coefficient and the water activity".
- The simultaneous **eutonic** point (both salts saturated, ionic strength ≈ 8.6
  mol/kg) is not solved here: the active-set + γ fixed point does not converge at
  that extreme ionic strength (a known limitation, independent of the activity
  model — Davies fails identically). The single-mineral SI validation above is the
  convergent, rigorous comparison.
- The LiCl system from the same paper is handled next door in `farelo_licl_range`
  (the Li–Cl Pitzer pair refitted to saturation + the LiCl·H₂O hydrate Ksp,
  calibrated through the osmotic a_w). The **AlCl₃** systems remain deferred: Al³⁺
  hydrolyses (the paper notes pH < 2.75) and needs an Al³⁺ speciation model Choupo
  does not yet carry.
- The full measured dataset (all six ternaries, 553 points) is tabulated, cited,
  in `constant/experimental/farelo_solubility.csv`.

*A respected IST colleague's dataset, the reference curve for an IST-built
simulator.*
