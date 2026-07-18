# binary01_lle_water_nbutanol — the water/1-butanol miscibility gap, read off g_mix (cited UNIQUAC)

## The promise and the prediction

Water + 1-butanol (n-butanol) is *the* classic partially-miscible binary. At
25 °C it splits into a water-rich liquid (~2 mol % butanol) and a butanol-rich
liquid (~50 mol % butanol). A `g_mix(x_water)` scan should therefore show a
clearly **non-convex** region: two binodal points sharing a **common tangent**,
which a student reads the split straight off.

## Run it

```bash
runCase tutorials/props/scan/binary01_lle_water_nbutanol
```

and `binaryLle.csv` is a `g_mix(x1)` curve that **goes non-convex**, plus the
**two binodal points** the liquid-liquid flash locates on it:

```
[binaryLLE] two liquid phases at 298.15 K, 1 bar: x1 = 0.980747 | 0.510186
```

| binodal branch | x_water | x_butanol | what it is |
|----------------|---------|-----------|------------|
| water-rich     | 0.9807  | **0.0193**| ~1.9 mol % butanol in water |
| butanol-rich   | 0.5102  | 0.4898    | ~49 mol % butanol (51 mol % water) |

## Predicted vs. Winkelman et al. (2009), Figs 1–2

| quantity                         | this scan (298 K) | Winkelman Figs 1–2 |
|----------------------------------|-------------------|--------------------|
| butanol in the water-rich phase  | **1.93 mol %**    | ~1.9 mol % (Fig. 1) |
| water in the butanol-rich phase  | **51.0 mol %**    | ~51 mol % (Fig. 2)  |

The agreement is essentially exact: the cited UNIQUAC fit reproduces the
published mutual solubilities.

## The parameters (full provenance — no fabrication)

This scan uses the **LLE-specific UNIQUAC** of

- J.G.M. Winkelman, G.N. Kraai, H.J. Heeres, *"Binary, ternary and quaternary
  liquid-liquid equilibria in 1-butanol, oleic acid, water and n-heptane
  mixtures"*, **Fluid Phase Equilibria 284 (2009) 71–79**,
  doi:10.1016/j.fluid.2009.06.013.

cited per value:

- **Interaction parameters — their Table 2 (p.73)**, binary
  1-butanol(1)/water(3), valid 273–363 K, with the quadratic temperature
  correlation `A_ij(T) = a + b·T + c·T²` (Eq. 10), `τ_ij = exp(−A_ij/T)` (Eq. 7):
  - `A_1,3` (butanol→water): a = 155.31, b = 1.0822, 10⁴·c = −43.711
  - `A_3,1` (water→butanol): a = −579.36, b = 2.7517, 10⁴·c = −6.7700
- **Structural r, q — their Table 1 (p.72)**: 1-butanol r = 3.9243, q = 3.668;
  water r = 0.9200, q = 1.400.

The same numbers live, fully provenanced, in
`data/standards/parameters/UNIQUAC/nButanol-water.dat`. The engine evaluates
the full `a + b·T + c·T²` temperature dependence (the quadratic `c·T²` term is
essential — at 320 K it is ~−450 K, comparable to `a`).

## Why the flash feed is 20 mol % butanol, not 50 %

The LL flash needs a feed *inside* the gap. For water/1-butanol the binodal is
**asymmetric** — both branches sit below 50 mol % butanol — so an *equimolar*
feed is OUTSIDE the gap and would be a single butanol-rich liquid. The op takes
an optional `feed { water 0.80; }` (20 mol % butanol), squarely inside, and the
flash then resolves both binodal points. The `g_mix(x1)` curve itself is swept
across the full interior either way; only the flash that *finds* the tie-line
needs an in-gap feed.

## What changed from the honest-failure predecessor

An earlier version of this scan used **predictive UNIFAC** (γ from the
components' groups, no fitted pair). Predictive UNIFAC with the standard *VLE*
group-interaction table does **not** reproduce the water/1-butanol gap — its
`g^E` is too weak to make `g_mix(x)` non-convex — so the scan was a single
convex well that reported "no split", kept as an honest lesson *pending* a cited
LLE set. Winkelman et al. (2009) **is** that cited set, so the scan now shows
the real common tangent. (The predictive-UNIFAC-misses-LLE failure mode is a
genuine, separate lesson — UNIFAC-LLE tables, Magnussen et al. 1981, were
published precisely because the VLE table mis-predicts LLE.)

## Self-containment

Per the Choupo "cases are self-contained" credo, this case vendors its own
component data in `constant/components/` (`water.dat`, `nButanol.dat`,
byte-copied from `data/standards/` with a source + sha256 header). UNIQUAC needs
only the structural r,q (carried inline in `constant/thermoPhysPropDict`) plus the
pure-component data here; the scan runs unchanged with the standard catalogue
hidden.

## Companion case

`tutorials/steady/flash/vlle01_waterButanol` shows the *same* split from the
flash side: a `phaseSet LL` IsothermalFlash with this cited Winkelman UNIQUAC
set resolves the water-rich and butanol-rich liquids directly.
