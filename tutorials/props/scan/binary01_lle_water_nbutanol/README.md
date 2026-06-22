# binary01_lle_water_nbutanol — predictive UNIFAC misses the LLE gap (honest-failure tutorial)

## The promise vs. the prediction

Water + 1-butanol (n-butanol) is *the* classic partially-miscible binary. At
25 °C it splits into a water-rich liquid (~2 mol % butanol) and a butanol-rich
liquid (~50 mol % butanol). So a `g_mix(x_water)` scan "should" show a clearly
**non-convex** region: two binodal points sharing a **common tangent**, which a
student reads the split straight off.

Run it:

```bash
runCase tutorials/props/scan/binary01_lle_water_nbutanol
```

and the curve in `binaryLle.csv` is a **single smooth convex well — no common
tangent, zero binodal points**. The operation says so aloud:

```
[binaryLLE] single liquid at 298.15 K, 1 bar: the chosen activity model
predicts MISCIBILITY (no liquid-liquid split) -- the g_mix curve stays convex.
```

## Why — and why we leave it that way

This scan uses **predictive UNIFAC** (Fredenslund–Jones–Prausnitz group
contribution): γ is built from the components' functional groups
(`water`; `nButanol` = 1×CH3 + 3×CH2 + 1×OH), with **no fitted binary
parameters**. Predictive UNIFAC with the standard *VLE* group-interaction table
**does not reproduce the water/1-butanol miscibility gap** — its `g^E` is not
strong enough to make `g_mix(x)` non-convex here. (This is a known limitation;
a separate **UNIFAC-LLE** parameter table, Magnussen, Rasmussen & Fredenslund,
*Ind. Eng. Chem. Process Des. Dev.* **20** (1981) 331, was published precisely
because the VLE table mis-predicts liquid-liquid equilibria.)

The Choupo credo is absolute: **sourced-and-cited, or honest-failure-as-lesson —
nothing in between.** We do **not** swap in invented numbers to manufacture a
gap. Predictive UNIFAC's convex curve, plus the engine's loud "no split" report,
*is* the lesson: a predictive group method can completely miss a real
miscibility gap, and the only honest cure is data — an LLE-specific fit.

## How a student would make the gap appear

Replace the predictive UNIFAC phases with an **LLE-regressed** activity model
(NRTL or UNIQUAC) whose parameters were fitted to mutual-solubility / tie-line
data, each cited per value — e.g.

- DECHEMA Chemistry Data Series, **Vol. V** ("Liquid–Liquid Equilibrium Data
  Collection", J. M. Sørensen & W. Arlt, 1979–1980), water/1-butanol; or
- Winkelman, Kraai & Heeres, *Fluid Phase Equilibria* **284** (2009) 71–79
  (UNIQUAC fit to the binary mutual solubilities); or
- the UNIFAC-LLE table (Magnussen et al. 1981) if a predictive route is wanted.

With such a set the `g_mix(x)` curve goes non-convex and the scan emits the two
binodal points. A correctly-splitting variant is intentionally **not** shipped
with fabricated parameters; it awaits a curated, per-value-cited LLE set.

> ⚠️ Note (also flagged in the operation): the water-rich binodal sits very near
> the flash's `1e-4` simplex floor, so even a *correct* LLE model resolves that
> branch only coarsely on this grid — a separate numerical caveat from the
> modelling failure above.

## Self-containment

Per the Choupo "cases are self-contained" credo, this case vendors its own
component data in `constant/components/` (`water.dat`, `nButanol.dat`,
byte-copied from `data/standards/` with the UNIFAC `groups{}` block UNIFAC reads,
each carrying its source + sha256 header). The scan runs unchanged with the
standard catalogue hidden.

## Companion case

`tutorials/steady/flash/vlle01_waterButanol` shows the *same* lesson from the
flash side: a **published DECHEMA VLE-fit NRTL** set that also carries no LL gap,
so the VLLE flash finds vapour + a single liquid (no liquid-liquid split).
