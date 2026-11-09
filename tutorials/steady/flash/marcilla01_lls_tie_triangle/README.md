# marcilla01_lls_tie_triangle — anchor contact with a published LLS state

**PRIMARY:** A. Marcilla, F. Ruíz, M. M. Olaya, *Fluid Phase Equilibria*
**105** (1995) 71–91, DOI 10.1016/0378-3812(94)02595-R.
Water–ethanol–1-butanol–NaCl at 25.0 ± 0.1 °C.  Anchor values staged in
[`docs/design/solid-migration-witness-data.md`](../../../../docs/design/solid-migration-witness-data.md) §2
(reviewStatus interim; this case cites the primary).

## The experiment this case charges

The feed is the paper's own **Table 10A row 4** initial mixture — a
published experimental charge, not an invented one (wt%):

| water | ethanol | 1-butanol | NaCl |
|---|---|---|---|
| 36.04 | 10.01 | 22.49 | 31.46 |

That charge produced the paper's **Table 10B row 4 tie-triangle** — three
phases simultaneously at equilibrium (wt%):

| phase | water | ethanol | 1-butanol | NaCl |
|---|---|---|---|---|
| aqueous | 70.13 | 4.92 | 1.45 | 23.50 |
| organic | 13.39 | 21.93 | 64.12 | 0.56 |
| solid | — | — | — | 100 |

(The lever-rule check on the paper's own numbers closes to Σλ = 1.010.)

## What the model side is, stated before the comparison

Davies ions on water-referenced molality + UNIFAC molecular backbone (the
corpus table — the **VLE** parameterisation of Hansen et al. 1991) + halite
complementarity through the solid-equilibrium service + a declared WET
organic (water is a member; its cross-liquid equality carries the ionic
a_w factor).

## What reproduces, and what does not

**Reproduced:** the saturated brine + solid halite coexistence.  The run
converges with solid NaCl present and a single fluid liquid; Davies is
announced out of its validity band (I ≈ 3.6 mol/kg against a ~0.5 band),
so the predicted saturation is *indicative* — the model holds ~3.6 mol/kg
against Pinho & Macedo's measured 6.14, and that gap is Davies', reported.

**NOT reproduced — the finding this case exists to record:** the paper's
organic (butanol-rich) liquid does not form.  Under the corpus UNIFAC
table, water/1-butanol is **fully miscible** at 25 °C: the binary g_mix
curve stays convex (independently confirmed with a `propertyScanBinary`
sweep over the same table), so the engine's Gibbs decision — correctly —
reports one liquid where the paper measures two.  Nothing was tuned to
hide or shrink this disagreement.

This is a **model/data gap, not a machinery gap**: the wet-organic split
(equality of activity with the ionic a_w factor, the split⇄speciation
joint fixed point, Gibbs-decides seeding) is built and takes the decision
on the real surface.  Three named remedies, sharpest first:

1. **Serve UNIQUAC on the reactive molecular backbone** (engine slice, no
   new data): the corpus *already carries* a fitted water/1-butanol
   UNIQUAC pair that opens this gap — inline in
   `tutorials/steady/flash/vlle01_waterButanol`, where the molecular
   gammaGamma path splits exactly this binary.  That serves the paper's
   **ternary** W/B/NaCl LLS invariant (Table 4B: aqueous 73.14/0.72/26.14
   · organic 7.53/92.28/0.19 · solid NaCl) with in-tree data; the
   quaternary tie-triangles additionally need ethanol pairs.
2. A **UNIFAC-LLE** parameter set (Magnussen, Rasmussen & Fredenslund,
   *Ind. Eng. Chem. Process Des. Dev.* **20** (1981) 331 — the
   parameterisation created precisely because the VLE table misses
   binodals) — a curation act, reserved to the maintainer.
3. Fitted NRTL pairs for water/1-butanol and ethanol/1-butanol — also
   curation.

The gate (`bin/curate/check_marcilla_lls.py`) pins this verdict **in both
directions**: it fails if the brine/solid half stops reproducing, and it
also fails the day the model side starts splitting water/1-butanol —
because that day this case must be upgraded to witness the full
tie-triangle instead of the finding.

## Named gaps beside the finding

* Davies prices every neutral solute at γ = 1, so the salting-out of the
  alcohols — the effect Marcilla measured deliberately — is invisible to
  the ionic leg.
* No NaCl in the organic (the anchor's 0.56 wt%): ion partitioning into a
  low-permittivity solvent is a declared refusal.
* The energy balance reports UNAVAILABLE: the apparent salt has no
  elements-datum enthalpy route in this world (named diagnostic, mass and
  element balances close at 100.000 % / 0.0000 %).
