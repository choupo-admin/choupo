# The thermodynamic hierarchy — the organizing principle

*2026-06-11. The answer to "what hierarchy attacks everything from a flash to a
NaOH antisolvent crystalliser with reaction and heats of mixing — without
hacks?" Companion to [`property-architecture.md`](property-architecture.md)
(curation contract) and [`electrolyte-enthalpy-spec.md`](electrolyte-enthalpy-spec.md).*

## One sentence

**One Gibbs-energy surface per phase, on declared reference states; every
property is a derivative of it; estimation only fills constants; and the trees
never store derivatives.**

## The three planes (never mix them)

| Plane | Contains | Lives in |
|---|---|---|
| **A — DATA** | reference states per species, model parameters, measured anchors | `data/standards/` + case `constant/` |
| **B — MODELS** | one generating function per phase + reference/transport correlations | `src/thermo/` (the factories) |
| **C — DERIVATIVES & ALGORITHMS** | γ, K, Ksp, a_w, H, L_φ, ΔG_rxn; Rachford-Rice, bubble/dew, Gibbs-min | `ThermoPackage` methods + `src/solver/` |

**The test that kills slop:** if a tree node is *computable from another node*,
it does not belong in the tree. `Kvalues`, `flash`, `waterActivity`,
`excessEnthalpy` as data/model folders are filed OUTPUTS — the Aspen sin.

## Plane A — data, organized by REFERENCE STATE

Inside each flat `components/<name>.dat` (per-value provenance attached):

- `identity` — name, formula, CAS, MW
- ideal-gas reference — Hf°, Gf°, S°, Cp_ig(T)
- pure-liquid reference (SYMMETRIC) — Psat/Antoine (= the reference fugacity
  f°(T), not a separate "property family"), Vliq, Hvap, Cp_liq
- solid reference — Hf°s, Cp_s, ρ_p + **forms** (anhydrate / hydrates /
  polymorphs — e.g. NaOH·H₂O is a DISTINCT solid phase with its own Hf°s)
- aqueous infinite-dilution reference (ASYMMETRIC, ions) — Hf°aq, Gf°aq, Cp°aq
  (CODATA/NBS; the tier the electrolyte-enthalpy build adds)
- measured anchors — solubility(T), dissolutionEnthalpy
- transport data — μ(T), k(T) (kinetic branch)

Pair parameter catalogues sit WITH their model: `parameters/<MODEL>/`,
`unifac/`, `henry/`, `electrolyte/`.  The calorimetric T-dependence of a pair
(`tau { a b }`, `dβ/dT`) lives **with the pair**, never in an "excess/" folder
— excess enthalpy is the ∂T of the SAME parameters.

## Plane B — models: one generating function per phase

- **vapour**: EoS — idealGas ✓ · SRK ✓ · PR ✓ (· virial/PRSV/CPA ☐)
- **liquid, molecular**: Gᴱ symmetric — ideal ✓ · Wilson ✓ · NRTL ✓ · UNIFAC ✓
  (· UNIQUAC/Dortmund ☐)
- **liquid, electrolyte**: Gᵉˣ asymmetric (molality) — Pitzer ✓ · eNRTL ✓
  (· Debye-Hückel/Davies/Bromley as teaching rungs ☐)
- **solid**: pure-phase μ(T) per declared form
- reference correlations: Antoine ✓ AmbroseWalton ✓ (Wagner/LeeKesler ☐) ·
  Rackett ✓ (COSTALD ☐) · Cp polynomial ✓ (Shomate/NASA7 ☐) · surface tension ☐
- transport (kinetic branch, own taxonomy): gas/liquid-dilute/liquid-mixture/
  **electrolyte** (Nernst-Einstein/Hartley ☐) / **porous** (Knudsen ☐)
  diffusivity; viscosity + conductivity with mixing rules ✓

## Plane C — everything else is calculus

- ∂/∂n → μᵢ, γᵢ, φᵢ, K, Ksp, a_w → flash, columns, crystallisers, BPE
- ∂/∂T → H (Gibbs-Helmholtz) → **molecular Hᴱ** ✓ (ActivityModel, gated) and
  **electrolyte L_φ** ✓ (kernel `Lphi`, Parker-fitted for NaOH, gated) →
  evaporator duty ✓, crystallisation heat via L̄₂=L_φ+m∂L_φ/∂m ✓, differential
  Ksp(T) ✓ — all shipped 2026-06-11, each behind `calorimetricFit`
- ∂²/∂T² → Cp, Cpᴱ
- Σνᵢμᵢ → ΔG_rxn, K(T) → reactive systems (the Gibbs reactor IS min G)
- μ̃ᵢ = μᵢ + zᵢFφ → electrochemistry (future: one extra term, not a new family)

Algorithms (Rachford-Rice, bubble/dew, Wegstein/Newton, Gibbs-min) are solver
code; γ-φ vs φ-φ are assembly frameworks taught in the theory guide.

## The acceptance case (Vítor, 2026-06-11)

*A flowsheet with a chemical reaction, NaOH-water crystallisation, ethanol
antisolvent addition, and heats of mixing — no hacks.* Everything must come
out of the hierarchy:

| Piece | Source in the hierarchy | Status |
|---|---|---|
| reaction ΔH | elements datum + Σνμ | ✓ shipped |
| NaOH aqueous activity / Ksp | Pitzer/eNRTL (Na-OH pair: Appelo 2014 ✓ in catalogue) | ✓ |
| antisolvent drowning-out | eNRTL mixed-solvent ∂n | ✓ shipped (NaCl-ethanol arc) |
| **heat of dilution (salt)** | L_φ = −RT²∂(gᵉˣ/RT)/∂T, calorimetric refit + gate | **building** (slices 1-5) |
| **heat of mixing (water-ethanol)** | molecular Hᴱ = ∂T of NRTL with τ(a+b/T) refit | **planned** (slice 1b/2b) |
| solid form (NaOH·H₂O hydrate) | solid reference `forms` | planned (slice 2) |
| ion reference (Na⁺, OH⁻ Hf°aq) | aqueous-∞ tier, CODATA/NBS | planned (slice 2) |

The case ships only when each row is green — each as a derivative of its
surface, none as a bolted-on number.

## Consolidation note (2026-06-11)

The `derived {}` grammar words live in ONE header
(`src/propertyOps/DerivedClosures.H`: `leeKeslerOmega`, `rackettVliq`;
Ambrose-Walton shared with the runtime via the registered model); the
Gibbs-Helmholtz L_φ lives ON the Pitzer kernel (`PitzerSingleSalt::Lphi`),
delegated to by the props op; the curation fit (`bin/curate/fit_lphi_pitzer.py`)
replicates it deliberately (cross-checked bit-for-bit).  One identity per
surface, one home per correlation.
