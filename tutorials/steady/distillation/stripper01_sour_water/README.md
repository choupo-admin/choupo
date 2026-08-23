# stripper01_sour_water — the separation and the speciation are one problem

Eight reactive trays over a sour water (2.5 mol% NH₃, 1 mol% CO₂), feed on
tray 2, reflux 0.5, distillate 5 of 100 kmol/h.  Converges in 9 MESH Newton
iterations; the overhead carries 33.4 mol% NH₃ at 355 K, the bottoms leave at
99.1 % water.  This is S2 of the sour-water programme
(`docs/design/sour-water-stripper-scope.md` §6d) — the case the effective
stage K (`ThermoPackage::stageK`) was built *for*, after `column13` proved
the machinery on an identity rig.

## The lesson

A molecular column cannot express this separation.  The volatility of NH₃
is set by a chemistry the column itself moves:

1. **CO₂ strips first** — it is the more volatile solute, and the carbonate
   loading of the liquid falls tray by tray, across an order of magnitude
   (0.52 → 0.024 mol CO₂-species per mol NH₃-species).
2. **The falling carbonate frees the ammonia.**  The CO₂ a liquid still
   carries is what holds its ammonia protonated as NH₄⁺; as it leaves, the
   pH climbs (8.46 → 8.80 below the top tray) and the free-ammonia fraction
   rises 0.802 → 0.947 — strictly, with no exception, on every tray.
3. **The freed ammonia then strips.**  The whole cascade is visible in
   `reports/unitOperations/tower/profile.csv`: per-tray pH, ionic strength
   and every species molality, engine-owned.

**The surge — the mechanism's own signature.**  Free ammonia is not merely
stripped; it is *produced* by the deprotonation the falling carbonate
allows.  Just below the feed the production outruns the stripping:
`m_NH3aq` **rises** from 1.316 (tray 2, the feed tray) to 1.424 (tray 3)
and only then falls strictly to the reboiler (0.464).  A first instinct
would be to exempt this from the "everything is stripped downward" check;
instead it is pinned as its own claim (`check_tray_chemistry` T5), because
hiding a mechanism's signature to make a monotonicity check pass would be
the check defeating its subject.  Sabotage-verified: move the feed to
tray 5 and T5 alone fires.

The top tray sits ~7 K colder than tray 2, so its pH reads higher for the
temperature of its own K_w — comparing pH across that jump compares two
water dissociations, which is why the pH claim starts at tray 2.

## What building it found (both fixed at the cause, in the engine)

* **The MESH initial ramp vs the two-phase band.**  An 8-stage linear T
  ramp visits temperatures a 4-stage ramp never did — including Tf + 15 K,
  *above* the feed's two-phase band, where the reactive Newton has no
  interior V/F and stalled before the first iteration printed.  `stageK`
  now catches the typed `ReactiveVLE::NonConvergence` and prices such a
  trial *incipient* over the hypothetical speciated liquid (announced
  once) — the same K_i = (p_i^eq/P)/x_i its subsaturated branch always
  used, so the K surface is continuous across the band.  A converged stage
  sits at saturation, where the constructions agree: the aid shapes the
  path, never the answer.
* **The per-tray chemistry report flashed a liquid pinned to its own
  bubble point.**  The MESH's residual (Σy = 1) places every converged
  tray liquid exactly at its bubble point — the two-phase flash's
  degenerate corner — and at reflux 0.5 five trays of eight printed NaN
  for chemistry the package resolves easily.  The report now asks the
  right question (`speciateReactiveAsLiquid`); NaN is reserved for a tray
  whose speciation itself fails.

## What this case declares

* `model simultaneous;` — the rigorous MESH whose per-stage equilibrium is
  one reactive flash per stage per residual evaluation.  Nested, not a
  species-basis MESH: the Jacobian sees apparent components only.
* Sealed (`bin/choupo-import`): the sealed copy reproduces its golden with
  the catalogue hidden (24 rows).

## Running it

```bash
runCase tutorials/steady/distillation/stripper01_sour_water
bin/curate/check_tray_chemistry.py     # both witnesses: T1-T4 + the T5 surge
```
