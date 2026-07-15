# polycaprolactonePlant — a poly(caprolactone) production PLANT

A full **process**, not a single reactor: a molten AB-type hydroxy-acid monomer
is polycondensed to **polycaprolactone** in a PFR, the **water condensate** is
stripped off in a devolatiliser, and a small condensate-recovery **recycle**
closes the loop. The plant reports the polymer's chain statistics
(**Mn / Mw / PDI**); the README then shows how to take that **same repeat unit**
into `choupoProps` and estimate the polymer's **physical properties** (Tg via
Yang 2020, density via Van Krevelen). That closes the pedagogical loop:

> **process → molar mass → properties.**

Reuses the step-growth machinery of
[`tutorials/steady/reactors/pfr_polyesterification`](../../steady/reactors/pfr_polyesterification)
(the `polymer { mode stepGrowth; M0; }` block, the same reaction, the same three
illustrative components), here wired into a plant.

---

## The flowsheet (flat, `choupoSolve`)

```
  freshMonomer ──┐
                 │
              [Mixer] ──► [Reactor:PFR] ──► [Devolatiliser:flash] ──► polymerMelt  (PRODUCT)
                 ▲          polymer{}            (volatile water        (non-volatile melt;
                 │          Mn/Mw/PDI             condensate overhead)    carries Mn/Mw/PDI)
                 │                                     │
                 │                                     ▼ overhead (the water condensate)
                 │                                 [Recovery:splitter]
                 └──── condensateRecycle ◄───────────┤
                          (the TEAR)                 └──────► condensate  (PURGE: water out)
```

| Unit | Type | What it does |
|---|---|---|
| `Mixer` | `mixer` | combines fresh monomer + the recycle; **isothermal** (declares the controlled reactor-feed T = 450 K) |
| `Reactor` | `pfr` | step-growth polycondensation; the `polymer{}` block emits **p, Xn, Xw, Mn, Mw, PDI** + the Flory–Schulz distribution |
| `Devolatiliser` | `isothermalFlash` (470 K, 0.15 bar) | strips the **volatile water condensate** overhead from the **non-volatile polymer melt** bottoms |
| `Recovery` | `splitter` | 15 % of the condensate is recycled (exercises the loop), 85 % purged |

**Streams:** `freshMonomer` (in) → `reactorFeed` → `reactorOut` → `polymerMelt`
(product) + `overhead` → `condensateRecycle` (tear) + `condensate` (purge).

**Recycle:** `condensateRecycle` is the tear — declared in `tearStreams`, solved
by **Newton-on-tears** (`recycleSolver Newton`). It is BOTH a `Mixer` input AND a
`Recovery` output (the proven flat reactor–separator–recycle pattern of
`process03_recycle` / `hda`). It converges in **1 Newton iteration**.

### Why this topology (the honest engineering)

* **Le Chatelier is the rationale.** Polycondensation is an equilibrium
  `~OH + ~COOH ⇌ ~ester~ + H₂O`; chain growth is driven by **removing the water**.
  The devolatiliser does that — at 470 K / 0.15 bar water (Tb 373 K) is ~100×
  more volatile than everything else, so it flashes off almost completely while
  the polymer melt and the little unreacted monomer stay in the bottoms.
* **Honest model note (glass-box).** The shipped illustrative kinetics are
  pseudo-first-order and **irreversible** in the monomer, so water is *not* in the
  rate law and conversion is set purely by the Damköhler number `kτ`. The
  devolatiliser still does its real job (separating condensate from melt). To make
  Le Chatelier a literal rate effect, set `reversible true;` on the reaction (the
  PFR then closes `k_rev = k/Kc` from the formation data) — left OFF here to keep
  the case deterministic and aligned with the reference reactor.
* **Why not a "monomer recycle"?** With these volatilities water is ~100× more
  volatile than the monomer, so a single flash overhead is essentially pure water
  — there is no clean monomer stream to recover. Recovering monomer would need a
  second separation; the honest single-flash plant removes water and keeps the
  (small) unreacted monomer in the melt.

---

## The KPI block the plant produces

Run it:

```bash
runCase tutorials/plant/polycaprolactonePlant
```

At the converged steady state (V_R = 0.20 m³, T = 450 K):

```
  p   (conversion of limiting group)  = 0.9789
  Xn  = 1/(1-p)                       = 47.4
  Xw  = (1+p)/(1-p)                   = 93.8
  Mn  = M0/(1-p)   (M0 = 114.14)      = 5409 kg/kmol
  Mw  = M0(1+p)/(1-p)                 = 10703 kg/kmol
  PDI = Mw/Mn = 1+p                   = 1.979   (-> 2 as p -> 1)
```

Plus the flows:

```
  polymerMelt  F = 0.957 kmol/h   (98 % pclRepeat — the polymer product)
  condensate   F = 1.024 kmol/h   (95 % water — the condensate removed)
```

The PFR also emits the **Flory–Schulz weight distribution** `w(x)` (peaking near
x ≈ Xn) as an axial profile the GUI can plot.

---

## Closing the loop: from Mn/PDI to ρ and Tg

The plant gave you the **chain statistics from the kinetics**. The next question a
materials engineer asks is: *what is this polymer like* — its glass transition,
its density? Those come from the **repeat-unit groups**, not the chain length.
The sub-case [`properties/`](properties/) does exactly this on the **same**
repeat unit `pclRepeat` (`M0 = 114.14`, the very number the reactor used for
`Mn = M0/(1-p)`):

```bash
runCase tutorials/plant/polycaprolactonePlant/properties
```

### (A) Glass transition Tg — Yang 2020 (runnable)

The PCL repeat unit `-[O-(CH2)5-CO]-` decomposes into Yang main-chain groups:

```
  O    x1 :  MW 16   Yg -14.718
  CH2  x5 :  MW 14   Yg   4.026  (each)
  CO   x1 :  MW 28   Yg   4.370
  ----------------------------------------
  M0      = 16 + 5·14 + 28          = 114    g/mol   (= the reactor's M0!)
  Yg(inf) = -14.718 + 5·4.026 + 4.370 = 9.782 (1e3 g·K/mol)
  Tg(inf) = 9.782·1e3 / 114         = 85.8 K
```

The exact `choupoProps` invocation (in [`properties/system/propsDict`](properties/system/propsDict)):

```
operations
(
    {
        name        pclRepeat_Tg_yang2020;
        type        estimateComponent;
        model       Yang2020;                 // POLYMER-group estimator (Tg, CC-BY)
        component   pclRepeat;
        groups
        (
            { group O;   count 1; }           // ester / chain oxygen
            { group CH2; count 5; }           // the five methylenes
            { group CO;  count 1; }           // carbonyl
        );
        reference { source "polycaprolactone Tg ~ 213 K (textbook)"; Tg 213.0; }
        output  { proposal auto; }
    }
);
```

**The honest teaching point (see, then decide).** Measured PCL Tg ≈ 213 K
(−60 °C); the additive estimate gives 85.8 K — a large under-estimate the console
prints as **−59.7 %** against the anchor. An additive main-chain scheme is weak
for a flexible aliphatic polyester. That is *not a bug*: it is the model telling
the truth about itself (Box: *all models are wrong, some are useful*). The same
machinery reproduces the paper's Fig 6 values **exactly** for PVC / poly(vinyl-
pyridine) / etc. — you learn **where a group-contribution method earns trust and
where it does not.** `M0 = 114` is an exact mass-balance fact and is goldened;
`Tg` is shown but deliberately **not** goldened as validated physics.

> Source: Yang et al., *ACS Omega* **5** (2020) 19655, doi:10.1021/acsomega.0c04499 — CC-BY 4.0.

### (B) Density — Van Krevelen (the honest limitation)

The natural sibling estimate (density via Bondi van der Waals volumes) is the
[`VanKrevelen` model](../../props/estimate/vanKrevelen01_polystyrene_density):

```
  M0  = Σ nᵢ·MWᵢ        repeat-unit molar mass
  Vw  = Σ nᵢ·Vwᵢ        van der Waals volume (Bondi 1964)
  V   = k·Vw            molar volume (k = packing factor, announced)
  ρ   = M0 / V          density
```

**It is NOT runnable on PCL with the shipped data, and the case says so out loud.**
The Slice-1 Van Krevelen group set ships only hydrocarbon + chloro groups
(`CH3 CH2 CH C ACH AC CHCl CH2Cl`) — it has **no ester `-O-` / `-CO-` group**, so
the repeat unit `-[O-(CH2)5-CO]-` cannot be decomposed. Asking for it would
**hard-error** with `unknown polymer group 'O'` — the estimator refuses to invent
a value (no silent zero, no laundering). The honest path: density needs the ester
groups *curated* into `data/standards/parameters/vanKrevelen.dat` first. The worked,
runnable Van Krevelen **density** example is the pure-hydrocarbon repeat unit in
[`tutorials/props/estimate/vanKrevelen01_polystyrene_density`](../../props/estimate/vanKrevelen01_polystyrene_density).

---

## Provenance

* **The chain-statistics math is exact and standard** (Flory, *Principles of
  Polymer Chemistry*, 1953; Odian, *Principles of Polymerization*, 4th ed.;
  Fogler, *Elements of Chemical Reaction Engineering*, 5th ed.).
* **The component properties are ILLUSTRATIVE** (clearly labelled in each `.dat`)
  — plausible round numbers for a teaching case, not curated literature values;
  the Arrhenius rate is illustrative (tuned for a teachable `p`). Curate before
  any quantitative use.
* **Yang 2020 Tg parameters** are redistributable (CC-BY 4.0), cited per group;
  the **Bondi 1964** Vw values used by Van Krevelen are the primary per value
  (derived via the UNIFAC R_k Choupo already ships, not the copyright book table).
