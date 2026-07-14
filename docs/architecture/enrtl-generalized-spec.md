# Generalized eNRTL (Chen & Song 2004) — implementation spec + validation golden

> Working reference for implementing `ENRTLGeneralized` (segment-based mixed-solvent
> electrolyte NRTL) in Choupo, glass-box, no external libraries. Two primary
> sources, both in `Literature/` (cite per value):
> - **Model + parameters:** Chen, C.-C. & Song, Y., *AIChE J* **50**(8):1928–1941 (2004). DOI 10.1002/aic.10151.
> - **Validation golden:** Esteso, González-Díaz, Hernández-Luis & Fernández-Mérida, *J. Solution Chem.* **18**(3):277–288 (1989).

## The model (equation map — full algebra in the paper)
- `G*ex = G*ex,lc (segment NRTL, short-range) + G*ex,PDH (unsymmetric Pitzer-Debye-Hückel, long-range)` [+ Born if aqueous ref; + Flory-Huggins optional]. Eqs 1–4.
- **Segment NRTL** local composition, component→segment: Eqs 7/11; **segment activity coefficients** (the code kernel) = **Eqs A1 (molecular m), A2 (cation c), A3 (anion a)**; component assembly from segments Eq 43 with unsymmetric ∞-dilution normalization.
- **Binary→ternary mixing rules** Eqs 24–41 (build `α_cm, τ_cm, G_mc,ac`… from the adjustable pairs; α fixed, τ adjusted).
- **Reference state:** unsymmetric (∞-dilution). Two choices: **aqueous** (Eqs 45–48, then Born Eqs 66–68) OR **mixed-solvent** (Eqs 49–54, NO Born). *For the Esteso golden use the MIXED-SOLVENT reference (Table 7 was fit that way; matches Esteso's per-solvent anchor) → Born term not needed.*
- **PDH long-range** Eqs 55–60 (cgs-esu units: `ρ=14.9`, `Q_e=4.80298e-10 esu`, `k=1.38054e-16 erg/K`, `A_φ` Eq 57 with solvent `d_s, ε_s, M_s`; mixed-solvent averaging Eqs 61–65).
- **Mean ionic, molal scale:** `ln γ*± = (ν_c ln γ*_c + ν_a ln γ*_a)/ν` (Eq 69); molal conversion `ln γ*±,m = ln γ*± − ln(1 + ν m M_s/1000)` (Eq 74).
- **Segment concept:** alcohol = X·(–C₂H₄, hydrophobic) + Z·(–OH, hydrophilic) (Eq 75). Ion–OH attractive, ion–C₂H₄ repulsive.
- Ambiguities to watch (from the extraction): use `x_j = n_j/Σn_i` (Eq 14) operationally; `Y_a,Y_c` and `M_s,d_s,ε_s` are held constant during differentiation; keep pair-subscript direction; do not silently SI-convert the PDH/Born cgs factors.

## Parameters for the target case: NaCl / water–ethanol (all α = 0.2 for ion pairs, 0.3 for solvent/segment)

**Table 7 — Water–Ethanol–NaCl, ethanol as oligomer (fit to Esteso 1989):**
`C₂H₄–Na⁺Cl⁻ τ = 15.526` · `Na⁺Cl⁻–C₂H₄ = 0.759` · `OH–Na⁺Cl⁻ = 8.886` (= Table 2 aqueous) · `Na⁺Cl⁻–OH = −4.549` (= Table 2 aqueous).

**Table 4 — ethanol segments:** `X = 1.811` (C₂H₄), `Z = 0.609` (OH). Segment binary (water–hexane LLE): `C₂H₄–OH τ = 6.562`, `OH–C₂H₄ = 3.364`, α = 0.3. Water = 0:1.

**Table 2 — aqueous NaCl (fit Robinson & Stokes 1970), α=0.2:** `H₂O–Na⁺Cl⁻ = 8.886`, `Na⁺Cl⁻–H₂O = −4.549`. (Aqueous single-salt limit golden.)

**Table 1 — solvent props:** dielectric `ε = A + B(1/T − 1/C)`: water A=78.52 B=31989.4 C=298.15; ethanol A=24.1113 B=12601.6 C=298.15. Water–ethanol NRTL `τ=a+b/T` α=0.3: a_ij=3.622 a_ji=−0.922 b_ij=−636.726 b_ji=284.286 (i=water, j=ethanol). Born radii (Å): Na⁺ 1.680, Cl⁻ 1.937.

## Build order (each phase validated before the next)
1. Segment bookkeeping (`r_{i,I}, C_i, x_j, X_j`) + mixing rules (Eqs 24–41) + segment γ (A1–A3) + component assembly (Eq 43). **Gate:** aqueous single-salt NaCl limit vs Choupo's validated Pitzer / Robinson–Stokes.
2. PDH (Eqs 55–60). **Gate:** full aqueous γ±(m) of NaCl.
3. Ethanol segment decomposition + mixed-solvent reference (Eqs 49–54). **Gate:** γ± NaCl in water–ethanol vs Esteso (below).
4. (Born Eqs 66–68 — only if an aqueous-reference case is ever needed.)

## Validation golden — Esteso 1989 Table I: γ± (stoichiometric mean ionic, molal scale) of NaCl in ethanol–water at 25.00 °C
Per-solvent reference (γ±→1 as m→0 in that solvent); anchor molality `m_R` and `(γ±)_R` per composition. Data are figure-only in Chen & Song — THIS is the numeric source. No pure-water (0 wt%) table (Fig 1 aqueous curve from Pitzer & Mayorga).

### 20 wt% EtOH (m_R=0.09987, γ±_R=0.723) — `m  γ±`
0.004014 0.919 · 0.004499 0.918 · 0.005000 0.913 · 0.006003 0.906 · 0.007006 0.894 · 0.009002 0.883 · 0.01030 0.875 · 0.01894 0.844 · 0.02999 0.818 · 0.04005 0.788 · 0.04997 0.776 · 0.06002 0.759 · 0.07005 0.753 · 0.08302 0.731 · 0.08994 0.726 · 0.09987 0.723 · 0.1005 0.730 · 0.1999 0.668 · 0.3023 0.646 · 0.3997 0.617 · 0.4999 0.610 · 0.5972 0.592 · 0.9021 0.582 · 1.002 0.570 · 1.179 0.574 · 1.401 0.562 · 1.600 0.574 · 2.000 0.580

### 40 wt% EtOH (m_R=0.09988, γ±_R=0.648)
0.002999 0.908 · 0.003996 0.894 · 0.005001 0.887 · 0.007000 0.866 · 0.008958 0.853 · 0.01997 0.804 · 0.03055 0.768 · 0.04000 0.737 · 0.05001 0.716 · 0.06000 0.699 · 0.07001 0.691 · 0.07998 0.674 · 0.09003 0.665 · 0.09988 0.648 · 0.1998 0.600 · 0.2996 0.563 · 0.4001 0.538 · 0.5002 0.518 · 0.6016 0.508 · 0.8001 0.490 · 0.8998 0.481 · 1.000 0.479 · 1.210 0.464 · 1.400 0.468 · 1.498 0.465

### 60 wt% EtOH (m_R=0.1000, γ±_R=0.566)
0.004001 0.863 · 0.005000 0.850 · 0.006001 0.832 · 0.007000 0.821 · 0.007997 0.808 · 0.02000 0.726 · 0.03000 0.684 · 0.04000 0.659 · 0.05000 0.635 · 0.06000 0.618 · 0.06999 0.601 · 0.08001 0.589 · 0.09001 0.575 · 0.1000 0.566 · 0.2000 0.492 · 0.3000 0.456 · 0.4000 0.429 · 0.5000 0.415 · 0.5997 0.399 · 0.7000 0.392 · 0.7999 0.382 · 0.9000 0.377 · 0.9996 0.375 · 1.027 0.368

### 70 wt% EtOH (m_R=0.1000, γ±_R=0.500)
0.01000 0.754 · 0.02000 0.685 · 0.03000 0.642 · 0.04000 0.600 · 0.04998 0.578 · 0.06000 0.554 · 0.07000 0.541 · 0.08000 0.528 · 0.09000 0.516 · 0.1000 0.500 · 0.1889 0.438 · 0.2499 0.413 · 0.3000 0.396 · 0.3500 0.387 · 0.3997 0.372 · 0.4500 0.367 · 0.5044 0.356

### 80 wt% EtOH (m_R=0.1000, γ±_R=0.411)
0.003001 0.791 · 0.004000 0.764 · 0.005000 0.745 · 0.006000 0.720 · 0.007000 0.705 · 0.008002 0.691 · 0.008999 0.674 · 0.01000 0.659 · 0.03999 0.503 · 0.04999 0.472 · 0.06001 0.466 · 0.07000 0.455 · 0.08001 0.437 · 0.08999 0.427 · 0.1000 0.411

### 90 wt% EtOH (m_R=0.01005, γ±_R=0.609)
0.003500 0.739 · 0.003998 0.719 · 0.004501 0.704 · 0.005000 0.695 · 0.005931 0.674 · 0.006998 0.651 · 0.008047 0.640 · 0.008771 0.626 · 0.01005 0.609 · 0.02000 0.531 · 0.02501 0.501 · 0.03000 0.483 · 0.03500 0.464 · 0.03999 0.448

Solvent properties per composition (Esteso Table II — for the PDH `A_φ`, if cross-checking): 20% D=67.0 d₀=0.96639 A_φ=0.4878 · 40% 55.0 0.93148 0.6434 · 60% 43.4 0.88699 0.8962 · 70% 38.0 0.86340 1.079 · 80% 32.8 0.83911 1.327 · 90% 28.1 0.81362 1.647.

Note: Esteso also fits Pitzer β⁰/β¹/Cφ per composition (his Table IV) — but 80/90 wt% "lack physical meaning" (his warning); use only as a secondary cross-check, not a golden.
