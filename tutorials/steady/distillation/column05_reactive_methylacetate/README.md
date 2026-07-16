# Reactive distillation: methyl acetate synthesis — vs Pöpken et al. (2001)

The `simultaneous` MESH column with an **equilibrium reaction on the catalytic
stages** (rigorous column rung 4), compared to a published experiment.

## The reaction

```
methanol + acetic acid  ⇌  methyl acetate + water        (Σν = 0)
```

Mole-conserving, so the CMO internal-flow profile is untouched. Each catalytic
stage carries one extra unknown — the molar extent ξ_j — closed by the
activity-based equilibrium residual `Σ_i ν_i ln(γ_i x_i) = ln K_a(T)`, with
γ_i from the liquid activity model and **K_a(T) by van't Hoff**:
`K_a(T) = K_a(298)·exp(−Δh°_r/R·(1/T − 1/298.15))`. Converged by homotopy
(solve non-reactive, then switch the reaction on).

## The validation reference

> **T. Pöpken, S. Steinigeweg & J. Gmehling**, *"Synthesis and Hydrolysis of
> Methyl Acetate by Reactive Distillation\ldots"*, **Ind. Eng. Chem. Res. 40
> (2001) 1566.** Run **S-1**: N = 25, reactive stages 11–19, HOAc fed above /
> MeOH below the zone, reflux 2.1, P ≈ 1.017 bar. Measured endpoints, cited, in
> `constant/experimental/methyl_acetate_RD_profile.csv`.

The equilibrium constant and thermodynamics are from the companion paper
**Pöpken, Götze & Gmehling, Ind. Eng. Chem. Res. 39 (2000) 2601**:
K_a(298) ≈ 38.7, Δh°_r ≈ −5.67 kJ/mol → **K_a ≈ 29 in the reactive zone (~65 °C)**.

## Result and the honest reading

| quantity | **Choupo (equilibrium)** | **Pöpken S-1 (measured)** |
|---|---|---|
| methanol/HOAc conversion | **96.1 %** | 87.6 % |
| x_D (methyl acetate) | ≈ 0.99 | 0.877 |
| x_B (water) | 0.888 | 0.824 |
| T_top | 330 K | ≈ 328 K |

This is **not** a tight match, and the reason is physically important: with the
**correct equilibrium K_a (≈29)** the model gives the **equilibrium ceiling**
(96 %), and it correctly **brackets the measurement from above**. The measured
87.6 % is *below* the equilibrium because the real column is **kinetically
limited** — the paper's recommended model is an adsorption-based finite *rate*
(per gram of catalyst), not equilibrium. An earlier run with an (incorrect, too
low) K_a = 5.2 gave 90.7 %, a closer *number* but for the wrong reason; using a
wrong constant to fake agreement would be dishonest.

**So the path to a bit-tight match is the kinetic rate model, not the thermo.**

## What this added to the standard catalogue (the curation)

The Pöpken (2000) parameters were promoted to the standard, by the data doctrine
(intrinsic → component; pair-dependent → `parameters/<MODEL>/`):

- **`methylAcetate`** component (Antoine, NIST/DDB), with its UNIQUAC **r/q**;
- **UNIQUAC r/q** added to methanol / acetic acid / water (`uniquac { r; q; }`),
  now read intrinsically by the engine (`injectUniquacRQ`, mirroring the UNIFAC
  groups) — they live once in the component, never re-declared per case;
- the three **new** UNIQUAC binary pairs (MeOH–MeOAc, HOAc–MeOAc, MeOAc–water)
  in `data/standards/parameters/UNIQUAC/`.

(The three pairs that already existed from DECHEMA stay standard; the Pöpken
values for them differ and are recorded in `Literature/popken2000_params.md`.)

## Honest scope / TODOs

- This case runs on **predictive UNIFAC**. The exact Pöpken **UNIQUAC** set is
  now in the catalogue, but the *reactive* MESH does not yet converge with it:
  UNIQUAC's `ln(x)` returns NaN for x ≤ 0 and the Newton steps cross the boundary
  — the robust fix (step-limiting to keep x > 0, or log-composition unknowns) is
  a solver upgrade, not a parameter change. The non-reactive UNIQUAC column
  converges cleanly.
- **Kinetic (rate-based) reactive distillation** — the model that would actually
  reproduce 87.6 % — is the next rung (the rate interfaces exist: `Reaction::
  modifiedArrheniusRate`, the adsorption denominator).
- Acetic-acid **vapour dimerisation** (the paper's Nothnagel model) is not
  carried; the vapour is ideal here.
