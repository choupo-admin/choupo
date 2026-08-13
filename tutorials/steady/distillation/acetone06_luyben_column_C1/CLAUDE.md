# CLAUDE.md -- Choupo case: steady/acetone06_luyben_column_C1

Programme record:
[`docs/design/acetone-ipa-reference-case.md`](../../../../docs/design/acetone-ipa-reference-case.md).
Siblings: `props/compare/acetone01_ipa_water_azeotrope`,
`steady/reactors/acetone02_luyben_reactor`,
`steady/flowsheets/acetone03_luyben_reaction_section`,
`props/compare/acetone04_acetone_water_vle` (**the prediction this case
tests**), `steady/absorption/acetone05_luyben_absorber`.

## Intent (this case) -- keep this updated as the project develops

- **Goal:** run column C1 of Luyben's Figure 1 -- 66 stages, feed 54, reflux
  ratio 2.78, distillate 32.25 kmol/h at 1 atm -- and find out whether it can
  make his **99.9 mol % acetone** product on the thermodynamics Choupo
  actually has.

- **Why it is not just another column.** `acetone04` measured the acetone/water
  VLE *before* this column existed and wrote down, in advance, what the column
  would do: predictive UNIFAC puts a minimum-boiling azeotrope at
  x_acetone ≈ 0.978 where Luyben's UNIQUAC has only a pinch, so *"a column C1
  built on this thermodynamics should be expected to asymptote near 97.9 % and
  fail his spec"*. This case is the test of that sentence. It could not be
  retrofitted: it was committed before the column was written.

### What it found, measured 2026-08-13

**1. THE PREDICTION HOLDS.**

The column converges cleanly — rigorous MESH, **16 Newton iterations,
‖F‖ = 2.4e-11** — and the acetone product comes out at

> **x_acetone = 0.97312**,  against Luyben's spec of **0.999**.

It fails the spec, in the predicted direction, by the predicted mechanism, and
it lands just under the predicted ceiling. The profile shows the ceiling is
real and not a shortage of stages: over the top **40** rectifying stages
x_acetone moves from 0.9722 to 0.9507 — **0.022 in 40 stages** — while the
bottom twelve move it from 0.15 to 0.97. The rectifying section is pinched
against the azeotrope, and more of it would buy almost nothing.

The 0.6 points between the achieved 0.9731 and the azeotrope's 0.978 are the
distance the column has left to run at *this* reflux and *this* stage count.
Both readings matter and they say different things: **0.978 is unreachable-past,
0.9731 is what Luyben's own design gets you.** Neither is 0.999.

**And reflux does not buy the difference.** Raising the reflux ratio from 2.78
to **40** — fourteen times the energy through the column — moves the product
from 0.97312 to **0.97781** and leaves it 0.021 short of the spec. The top 40
rectifying stages then move x by 0.0034 instead of 0.0204: the extra reflux
pushes the profile *harder against* the azeotrope rather than through it,
which is what a ceiling means. This was measured while sabotage-testing
`check_azeotrope_ceiling` and is kept because it answers the first question
anyone asks of an off-spec column.

**2. THE COST IS NOT ONLY AN OFF-SPEC PRODUCT — IT IS ACETONE IN THE WATER.**

The distillate rate is fixed at Luyben's 32.25 kmol/h. Acetone that cannot go
overhead has nowhere to go but down:

| | Choupo (UNIFAC) | Luyben (UNIQUAC) | |
|---|---|---|---|
| acetone product, x_acetone | **0.97312** | 0.999 | fails spec |
| acetone product, x_water | 0.02688 | 0.001 | **27×** |
| bottoms B1, x_acetone | **0.02138** | 0.0001 | **214×** |
| bottoms B1, x_isopropanol | 0.09497 | 0.0951 | −0.1 % |
| bottoms B1, x_water | 0.88365 | 0.9048 | −2.3 % |
| B1 flow (kmol/h) | 40.578 | 40.56 | +0.04 % |
| acetone recovered overhead | **97.31 %** | 99.9 % | |
| T top (K) | 329.376 | — | acetone bp 329.4 |
| T bottom (K) | **353.61** | 370 | **−16.4 K** |
| condenser duty (MW) | 0.9977 | 1.045 | −4.5 % |
| reboiler duty (MW) | 1.0305 | 1.217 | **−15.3 %** |

**2.7 % of the feed acetone leaves in the water product** (0.868 kmol/h against
his 0.004). In a plant that number is not a rounding error — it is product
loss *and* a contaminated water stream, and it comes entirely from a feature
that lives in the fourth decimal place of a γ.

Note which rows agree and which do not, because the pattern is informative:
the **isopropanol** in the bottoms lands within 0.1 % of the paper, and the
bottoms **flow** within 0.04 %. The separation Choupo gets right is the one
the azeotrope does not touch; the flow agreement is forced by the mass balance
once D is specified, and is not independent evidence of anything.

**3. THE 16 K BOTTOMS GAP IS NOT YET ATTRIBUTED, and this case does not
pretend to attribute it.** Two candidates, and they are separable:

* the 2.1 mol % acetone this column failed to remove, which depresses a
  bubble point strongly; and
* UNIFAC's own isopropanol/water, already measured off by a lot in
  `acetone01` (azeotrope at x 0.590 against a published 0.673).

**The measurement that would separate them** is one bubble point: Luyben's own
B1 composition (IPA 0.0951 / water 0.9048, no acetone) at 1 atm. If it comes
out near 370 K the gap is the acetone; if it comes out near 354 K the gap is
the IPA/water pair. That belongs in `acetone01`, which owns that binary — it
is **named here and not guessed at**.

**4. THE ENERGY IS THE BETTER-BEHAVED HALF, and it is the weakest-founded.**
Condenser −4.5 %, reboiler −15.3 %. Both are computed on an enthalpy that
includes a **Rowlinson-Bondi** liquid heat capacity for isopropanol whose
measured accuracy on hydrogen-bonding molecules is 30–70 % (the record says
so, in the record). IPA is 5 mol % of the feed and 9.5 % of the bottoms, so
that estimate is genuinely in the reboiler duty. **The duties are the numbers
to distrust first here, not the split** — which is the opposite of the
intuition that a converged energy balance is the solid part.

### Decisions + why

- **`model simultaneous` (rigorous MESH), not the corpus-default Wang-Henke.**
  The default is documented as unstable through an azeotrope, which is the
  exact feature under test. Choosing the method that can resolve the feature
  is not tuning; choosing the one that cannot would have hidden it.

- **The feed is Luyben's published F1, not this project's upstream answer.**
  Wiring `acetone03`'s flash liquid and `acetone05`'s absorber bottoms in
  would test three units at once, and `acetone05` already reports recovering a
  sixth of what the paper does. Feeding the published stream isolates the
  column: what it gets wrong here is the column and its thermodynamics.

- **No hydrogen, and the column is declared to sit downstream of Luyben's
  vent.** His C1 vents 0.0130 kmol/h of H2 against the 0.0146 kmol/h that F1
  carries — the vent removes essentially all of it — and Choupo's column has a
  total condenser and no vapour distillate. What that costs is quantified
  rather than waved: the same vent carries **0.0335 kmol/h of acetone**, 0.10 %
  of the product, so not modelling it **flatters this column's recovery by that
  much**. The 97.31 % above should be read as at most 97.2 % against a
  vented column.

  **It was run the other way first**, and that run is why the paragraph exists.
  With H2 in the feed the MESH converged to the *same* distillate (x_acetone
  0.9722 at stage 1, 16 iterations, ‖F‖ 2.4e-11) and then the energy report
  **refused**: hydrogen has no liquid heat capacity, because at 330 K it has no
  liquid. The refusal is right, and it is the honest form of the modelling
  error — a total condenser was quietly asking a permanent gas to leave as a
  liquid. The fix was to state which unit is being modelled, not to invent a
  liquid Cp for hydrogen.

- **No `approximations {}` block, deliberately.** `acetone03` needs one (γ = 1
  for H2, which UNIFAC cannot price). This case carries no hydrogen, so there
  is nothing to authorise, and copying the block across out of habit would have
  read like something being waved through.

- **Hand-written golden rows for the compositions.** `--record` writes stream
  totals and the column's `x_D_LK`/`x_B_HK`, which here are *isopropanol* and
  *water*. The acetone purity — the entire point — was pinned by nothing until
  four rows were added by hand. Same defect class as the `aad`/`closure`/
  `utility` kinds, one layer down.

- **No `anchor` rows.** Luyben's 0.999 is the output of *his* Aspen/UNIQUAC
  simulation, not a measurement. Anchoring against it would claim a validation
  that no experiment supports, and here it would additionally pin a number the
  model disagrees with. The comparison is with **a published reference**, and
  the golden's claim is regression only.

### Announced along the way (the caveat surface did its job)

Three validity advisories, all real and none silent:

* water's vapour pressure evaluated at 386 K, outside its declared window
  (273–373) — the same catalogue limit `acetone01`/`acetone04` measure as a
  0.70 K deficit at the normal boiling point;
* isopropanol and acetone Psat *requested* at 534 K, above both critical
  temperatures. That is the bubble-point bracket reaching, not a state the
  column occupies — but it is announced rather than clipped, which is the
  point.

### Pending / in curation

- the one bubble point that would attribute the 16 K bottoms gap (§3), in
  `acetone01`;
- a **fitted** acetone/water pair, which is what would settle whether the
  azeotrope is real — the whole result above rests on a UNIFAC prediction and
  says so;
- a measured liquid Cp for isopropanol, which would take the duties off a
  correlation known to be poor for alcohols;
- C2, the IPA recycle tear, and the closed plant.
