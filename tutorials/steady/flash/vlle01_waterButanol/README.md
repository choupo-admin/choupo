# vlle01_waterButanol — when a VLE fit misses the LLE gap (honest-failure tutorial)

## What the student expects

Water + 1-butanol (n-butanol) is *the* textbook partially-miscible binary.
At 25 °C the two coexisting liquid phases are roughly

| phase        | mole fraction butanol | (≈ mass fraction)        |
|--------------|-----------------------|--------------------------|
| water-rich   | ~0.019 (≈ 2 mol %)    | ~7 wt % butanol in water |
| butanol-rich | ~0.50  (≈ 50 mol %)   | ~20 wt % water in butanol |

(Literature mutual solubilities: n-butanol in water ≈ 6.5–7 wt %, water in
n-butanol ≈ 20–22 wt % near room temperature.) At ≈ 92–93 °C and 1 atm the
mixture forms a **hetero-azeotrope** — a vapour over two liquids. So a flash of
an equimolar feed at 373 K, 1.013 bar "should" give **V + L_aqueous +
L_organic**.

## What this case actually predicts — and why

Run it:

```bash
runCase tutorials/steady/flash/vlle01_waterButanol
```

The result is **two phases: vapour + a *single* liquid** (`V/F ≈ 0.80`), with
the `organic` output stream empty (`F = 0`) and the surviving liquid sitting in
the `aqueous` slot at **80 mol % butanol** — i.e. it is the *butanol-rich*
liquid, not an aqueous phase at all. The solver says so aloud:

```
Regime: two-phase (VL, VLLE attempt found one L β ≈ 0)
```

There is **no liquid-liquid split**. The `aqueous` / `organic` names are just
fixed output slots (the VLLE contract always emits three streams so the
topology is stable); here only one liquid exists, so its label is a slot name,
not a phase identity.

This is **not a Choupo bug**. It is the single most important practical lesson
in activity-coefficient modelling:

> **VLE-regressed binary parameters do not, in general, reproduce LLE.**

The NRTL parameters in `constant/thermoPackage` are a *real, published*
**vapour-liquid** fit. Sweep the temperature and you find they predict
**complete miscibility at every temperature** — the molar Gibbs energy of mixing
has one convex well, no common tangent, no gap. A set that reproduces the VLE
can be completely blind to the miscibility gap, because the two data types
constrain different regions of `g^E(x, T)`.

## The parameters (full provenance — no fabrication)

`constant/thermoPackage` carries the **DECHEMA VLE-fit NRTL** for water/n-butanol,
cited per value:

- **Primary source:** DECHEMA Chemistry Data Series, Vol. I (Vapor–Liquid
  Equilibrium Data Collection), **Part 1a, p. 336** (Gmehling, Onken et al.),
  water/n-butanol record.
- **As compiled in:** the ChemSep database (H. Kooijman & R. Taylor,
  Artistic-2.0), file `nrtl.ipd`, record `7732-18-5 / 71-36-3`:
  `A(water→nBuOH) = 2633.6951 cal/mol`, `A(nBuOH→water) = 504.0381 cal/mol`,
  `α = 0.4447`.
- **Conversion (exact, no fit):** `b_ij[K] = A_ij[cal/mol] / R`,
  `R = 1.98720 cal/mol/K` →
  `b(nBuOH→water) = 253.642 K`, `b(water→nBuOH) = 1325.33 K`.

The same numbers, with the raw cal/mol kept for audit, live in
`data/standards/binaryPairs/NRTL/nButanol-water.dat`.

We **deliberately keep these cited-but-LLE-blind parameters** rather than invent
numbers to manufacture a gap. The Choupo credo is absolute: *sourced-and-cited,
or honest-failure-as-lesson — nothing in between.* Faking a gap with tuned
numbers (the previous version of this case did exactly that) is precisely what
this repository refuses to do.

## How a student would make the gap appear (the real fix)

To actually predict the split you need **LLE-specific** interaction parameters,
regressed against mutual-solubility / tie-line data — e.g. from

- DECHEMA Chemistry Data Series, **Vol. V** ("Liquid–Liquid Equilibrium Data
  Collection", J. M. Sørensen & W. Arlt, 1979–1980), water/1-butanol system; or
- a peer-reviewed LLE correlation (e.g. Winkelman, Kraai & Heeres,
  *Fluid Phase Equilibria* **284** (2009) 71–79, who report a UNIQUAC fit to the
  binary mutual solubilities).

Drop such a set into `constant/thermoPackage` (with its own per-value citation)
and the VLLE flash will find the genuine `V + L_aqueous + L_organic`
three-phase split. A correctly-splitting tutorial awaits a curated,
per-value-cited LLE parameter set in the standard catalogue — it is intentionally
**not** shipped with invented numbers.

## Companion case

`tutorials/props/scan/binary01_lle_water_nbutanol` shows the *same* lesson from
the property side: a predictive **UNIFAC** `g_mix(x)` scan that stays convex and
reports "no liquid-liquid split" for this binary.
