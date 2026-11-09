# Full-MESH validation — Naphtali & Sandholm (1971), Problem 2

Reproduces the ideal-hydrocarbon distillation of **Naphtali & Sandholm,
"Multicomponent Separation Calculations by Linearization", AIChE Journal 17(1),
148–153 (1971)** — DOI [10.1002/aic.690170130](https://doi.org/10.1002/aic.690170130)
— the paper that introduced the very full-MESH method Choupo's `model fullMESH`
implements.

## The problem (paper, Problem 2)

n-butane / isopentane / n-pentane, **20 plates**, liquid feed (T = 30 °F = 272.04 K,
500 mol of each) on **plate 10**, **reflux ratio 1000**, 80 % of the feed recovered
in the bottoms (B = 1200). A liquid sidestream on plate 1 (the condenser) takes
30 % of the reflux.

**Equivalent spec used here.** The distillate (≈1) and the condenser sidestream
(≈299) leave the *total* condenser with the **same composition**, so they are
combined into ONE top product of **300** with reflux `R = L₁/300 = 996.68/300 =
3.3223`. This gives identical internal flows (`L₁ = 996.68`, `V₂ = 1296.68`),
hence the identical column — without needing a condenser side draw.

## Result — the validation

Converges in **3 full-MESH Newton iterations** (seeded from the CMO profile).

**Products** | paper | Choupo
---|---|---
top product (300) | 99.97 % n-C₄ | **99.99 % n-C₄**
bottoms n-C₄ / i-C₅ / n-C₅ | 200.1 / 499.9 / 500.0 | **200 / 500 / 500**
B | 1200 | 1200

**Temperature profile** (K) — all 20 stages, |Δ| ≤ 1.8 K:

| stage | 1 | 5 | 8 | 10 | 14 | 17 | 20 |
|---|---|---|---|---|---|---|---|
| paper | 272.0 | 272.2 | 276.4 | 286.5 | 286.7 | 288.4 | 298.2 |
| Choupo | 272.8 | 273.0 | 276.2 | 285.1 | 285.3 | 286.8 | 296.6 |

The profile **shape** — the flat n-butane-rich top, the sharp rise across the feed
zone, the pentane-plateau, the reboiler climb — matches stage-by-stage. The ~1–2 K
residual is **thermo**, not method: Choupo uses fitted Antoine vapour pressures,
the paper used the K-value tables in Brown's *Unit Operations* (1950).

## Why this case, and not the paper's other two

The paper's Problem 3 (n-hexane/ethanol) is **azeotropic** and hyper-sensitive to
the activity model — Choupo's NRTL gives the correct *real* azeotrope (331.8 K) but
the paper's 1971 Van Laar fit behaves differently, so it validates the method
poorly. Problem 1 is an *absorber* (no condenser/reboiler). The **ideal hydrocarbon**
Problem 2 isolates the full-MESH machinery from thermo-matching noise — which is
exactly what a method validation should do.

## Provenance

`nButane` (n-butane) already existed but lacked a `liquidHeatCapacity` (needed for
the full-MESH liquid enthalpy); it was completed from the CoolProp 7.2.0 saturated-
liquid fit — see `data/standards/components/nButane.dat`.
