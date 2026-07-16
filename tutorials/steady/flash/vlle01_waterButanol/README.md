# vlle01_waterButanol — the real water/1-butanol liquid-liquid split (cited UNIQUAC)

## What the student expects

Water + 1-butanol (n-butanol) is *the* textbook partially-miscible binary.
Below the bubble point it splits into two coexisting liquids: a **water-rich**
phase carrying only a couple of mol % butanol, and a **butanol-rich** phase
holding roughly half water. So a flash of a feed *inside the miscibility gap*
should give two liquids — and here it does.

## Run it

```bash
runCase tutorials/steady/flash/vlle01_waterButanol
```

At **320 K, 1.013 bar** (well below the bubble point, so no vapour) a feed of
80 mol % water / 20 mol % butanol splits into:

| phase        | x_water | x_butanol | what it is        |
|--------------|---------|-----------|-------------------|
| `waterRich`  | 0.9830  | **0.0170**| ~1.7 mol % butanol in water |
| `butanolRich`| 0.5388  | 0.4612    | ~53.9 mol % water in butanol |

with split fraction β ≈ 0.41 into the butanol-rich phase. The solver reports
the Michelsen TPD instability (`tm_min ≈ −0.45`, *unstable = YES*) and then a
direct Gibbs-energy minimisation that lands the two compositions.

## Predicted vs. Winkelman et al. (2009), Figs 1–2

| quantity                              | this case (320 K) | Winkelman Figs 1–2 |
|---------------------------------------|-------------------|--------------------|
| butanol in the water-rich phase       | **1.70 mol %**    | ~1.7 mol % (min ~0.017 near 310–330 K, Fig. 1) |
| water in the butanol-rich phase       | **53.9 mol %**    | ~54 mol % (Fig. 2)  |

An independent re-implementation of the UNIQUAC γ (fresh code, isoactivity
Newton) reproduces the engine's split to 4 decimals across 298–350 K, confirming
the parameters are entered correctly. The agreement with the published figures
is essentially exact — the UNIQUAC fit is doing its job.

## The parameters (full provenance — no fabrication)

`constant/propertyDict` carries the **LLE-specific UNIQUAC** for
water/1-butanol, cited per value:

- **Primary source:** J.G.M. Winkelman, G.N. Kraai, H.J. Heeres, *"Binary,
  ternary and quaternary liquid-liquid equilibria in 1-butanol, oleic acid,
  water and n-heptane mixtures"*, **Fluid Phase Equilibria 284 (2009) 71–79**,
  doi:10.1016/j.fluid.2009.06.013.
- **Binary interaction parameters — their Table 2 (p.73)**, binary
  1-butanol(1)/water(3), valid **273–363 K**, with the quadratic temperature
  correlation `A_ij(T) = a_ij + b_ij·T + c_ij·T²` (their Eq. 10) and
  `τ_ij = exp(−A_ij/T)` (their Eq. 7):
  - `A_1,3` (butanol→water): a = 155.31, b = 1.0822, 10⁴·c = −43.711
  - `A_3,1` (water→butanol): a = −579.36, b = 2.7517, 10⁴·c = −6.7700
- **Structural r, q — their Table 1 (p.72)** (value Magnussen et al.):
  1-butanol r = 3.9243, q = 3.668; water r = 0.9200, q = 1.400.

The same numbers, fully provenanced, live in
`data/standards/parameters/UNIQUAC/nButanol-water.dat`; they are repeated
inline so the case is self-contained (Choupo credo).

### The full temperature dependence is preserved

Choupo's UNIQUAC engine evaluates the **complete** `A_ij(T) = a + b·T + c·T²`
form — the quadratic `c·T²` term was added to the model for this case (it had
previously supported only `a + b·T`). This is **not optional rounding**: at
320 K, `c·T² ≈ −450 K`, the same order of magnitude as `a = 155.31`, so dropping
the quadratic term would mis-place the gap. No T-dependence is silently lost.

## Why the feed sits at 20 mol % butanol, not 50 %

The two binodal points at 320 K are both **below** x_butanol = 0.46, so an
*equimolar* feed (z_butanol = 0.5) is **outside** the two-phase envelope on the
butanol-rich side — it would be a single butanol-rich liquid. By the lever rule
a feed splits into two liquids only if `0.017 < z_butanol < 0.46`. We pick
z_butanol = 0.20, squarely inside.

## What this case demonstrates

- A **genuine, cited liquid-liquid miscibility gap** — reproduced from a primary
  source, not invented numbers (Choupo credo: sourced-and-cited, never
  hand-tuned).
- The `IsothermalFlash` **LL branch**: Michelsen TPD stability test → direct
  Gibbs-energy minimisation (multi-start Nelder-Mead) for the two compositions.
- **Honest phase labelling**: the output streams are named by their actual
  composition (`waterRich` / `butanolRich`), with the `alphaRich`/`betaRich`
  hints steering which liquid lands in which slot — fixing the earlier version's
  `aqueous`/`organic` slot-name confusion.
- The **lever-rule / two-phase-envelope** reasoning a student must do to place a
  feed inside the gap.

## Historical note (the honest-failure predecessor)

An earlier version of this case carried only a **DECHEMA VLE-fit NRTL** set.
Being a *vapour-liquid* fit, it has **no** miscibility gap, so the flash found a
single liquid — and the case was kept as an honest "VLE-fit-misses-LLE" lesson,
explicitly *pending* a cited LLE parameter set. Winkelman et al. (2009) **is**
that cited LLE set, so the case now shows the real split. The VLE-blind NRTL
lesson lives on in `data/standards/parameters/NRTL/nButanol-water.dat`'s
provenance, and the companion scan below still teaches the predictive-UNIFAC
failure mode.

## Companion case

`tutorials/props/scan/binary01_lle_water_nbutanol` shows the *same* split from
the property side: a `g_mix(x)` scan with this **cited Winkelman UNIQUAC** set
goes non-convex and reports the two binodal points.
