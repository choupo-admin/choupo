# pfr_polyesterification — step-growth chain statistics in a PFR

A molten **AB-type hydroxy-acid monomer** (6-hydroxyhexanoic acid) self-
condenses to **polycaprolactone** in a plug-flow reactor, releasing one water
per ester bond:

```
n HO-(CH2)5-COOH  ->  H-[O-(CH2)5-CO]n-OH  +  (n-1) H2O
```

As the monomer conversion `p` climbs along the reactor, the **Carothers
relation** makes the average chain length rise steeply and the **polydispersity
approach 2** — the most-probable (Flory–Schulz) distribution.

## What it shows (glass-box)

The reactor prints each formula beside its value:

```
  p   (conversion of limiting group)  = 0.981
  Xn  = 1/(1-p)                        = 53.8
  Mn  = M0/(1-p)                       = 6144 kg/kmol
  PDI = Mw/Mn = 1+p                    = 1.98   (-> 2 as p -> 1)
```

and emits the **Flory–Schulz distribution** as a profile (`chainLength` vs
`n_x`, `w_x`) so the GUI plots it: `n(x)=(1−p)p^(x−1)` decays monotonically,
`w(x)=x(1−p)²p^(x−1)` peaks near `x≈Xn`.

## Try this

Run a `sweep` over `operation.V_R` (reactor volume → residence time → `p`) and
watch **`PDI` climb toward 2**, **`Xn` and `Mn` shoot up**, and the weight
distribution broaden. The whole Carothers/Flory story in one glass-box run.

## The `polymer{}` block (opt-in)

```
polymer
{
    mode            stepGrowth;
    M0              [1 0 0 0 -1] 114.14;   // repeat-unit molar mass [kg/kmol]
    distribution    true;
    maxChainLength  60;
}
```

Lives inside the reaction. Absent ⇒ the reactor behaves as an ordinary PFR.
`p` is taken from the reactor's own conversion of `limitingReactant` (single
source of truth). The distribution + `PDI = 1+p` are valid because a PFR has a
**uniform residence time**; on a CSTR the residence-time distribution broadens
both, so the distribution is gated to PFR/batch only.

## Provenance

- **The chain-statistics math is exact** and standard: P.J. Flory,
  *Principles of Polymer Chemistry*, Cornell Univ. Press (1953), Ch. VIII–IX
  (the most-probable distribution and `PDI = 1+p`); G. Odian, *Principles of
  Polymerization*, 4th ed., Ch. 2; H.S. Fogler, *Elements of Chemical Reaction
  Engineering*, 5th ed., §9.
- **The monomer/repeat component properties are ILLUSTRATIVE** (clearly
  labelled in each `.dat`) — plausible round numbers for a teaching case, not
  curated literature values. The Arrhenius rate is illustrative, tuned so
  `Da = kτ ≈ 4` gives `p ≈ 0.98`. Curate these before any quantitative use.
