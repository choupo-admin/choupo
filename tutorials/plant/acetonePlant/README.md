# acetonePlant — a published process, closed, and its error accounted for

Acetone from 2-propanol: the flowsheet of W. L. Luyben, *Design and Control of
the Acetone Process via Dehydrogenation of 2-Propanol*, Ind. Eng. Chem. Res.
**50** (2011) 1206, his Figure 1 end to end — fresh feed and isopropanol
recycle into a mixer, a vaporiser to 389 K, a conversion reactor at **623 K
and 90 % per-pass conversion**, a separator chilled to 318 K, an absorber
washing the offgas with 20 kmol/h of water, a vent, and two columns: **C1**
(66 stages, feed 54, R 2.78) making the acetone product and **C2** (19 stages,
feed 16, R 0.849) returning the isopropanol.  Nine units, one cycle, and the
cycle is declared: `system/solverDict` cuts it at `ipaRecycle` and closes it
with Wegstein.

Everything on the first path so far arrives here at once — an equilibrium, a
model choice, a many-stage unit, a method that has to be chosen, a reaction,
a graph, a recycle.  And one thing more, which is why this case is last.

**It does not reproduce Luyben's stream table, and that is the deliverable.**
Seven sibling cases (`acetone01` to `acetone07`) each measured ONE unit on
Luyben's own published inlet *before* this plant existed, so every difference
below was predicted rather than discovered.  Nothing was tuned to close a gap.

| quantity | Luyben | this plant |
|---|---|---|
| acetone product, kmol/h | 32.25 | 27.46 |
| isopropanol recycle, x_isopropanol | 0.650 | 0.4991 |
| water product, x_water | 0.999 | 0.9852 |
| reactor inlet, kmol/h | 57.83 | 57.84 |
| vaporiser duty, kW | 757.7 | 763.10 |
| separator duty, kW | 899.3 | 966.99 |

That first row is **85 %** of his acetone, and the case's own `CLAUDE.md`
records the product at 0.9727 mole fraction acetone against his 0.999 spec.

## The lesson

1. **The error has an address, and it was written down first.**  UNIFAC
   invents an acetone/water azeotrope at x 0.978 where Luyben's UNIQUAC has
   none (`acetone04`), which caps C1; UNIFAC also misplaces the real
   isopropanol/water azeotrope at x 0.590 against 0.673 (`acetone01`), which
   caps C2.  Both ceilings were measured on isolated units before either
   column was built, and the golden shows them arriving: `C2 x_D_LK` is
   **0.499124702623**, and a wetter recycle carries less isopropanol, which
   makes less acetone, which is the production figure in the table.  A plant
   whose disagreement you can name unit by unit is worth more than one that
   agrees for reasons nobody checked.
2. **Two thermodynamic worlds, and the boundary is priced.**  Handed the
   plant's global UNIFAC package the `absorber` REFUSES by name: it solves
   Kremser, Kremser reads Henry's law, and an activity model carries no answer
   it can use.  So that unit alone carries an inline `thermo {}` block — water
   the solvent on the pure-liquid rung, acetone the solute on the Henry rung —
   declared where the model boundary is and announced when the run crosses it.
   The block is inline in `system/flowsheetDict` rather than in a file of its
   own for exactly that reason.  The model-boundary ledger then prices the
   crossing independently and writes its verdict to
   `reports/balances/energyBalance_byUnit.csv`: raw imbalance
   **−11.2496 kW**, declared boundary step **0.0000 kW**, remaining
   **−11.2496 kW**, and in the report's own words *the step is NOT
   credited*.  Read the report for it, not the `expected` file: that row
   is held by `check_model_boundary_ledger`, and this case's golden
   carries no row kind that can read it.  Changing the liquid activity model changes
   K-values, not the enthalpy datum, so there is nothing to credit at this
   boundary — and the residual that remains belongs to the absorber's own
   lumped-Cp energy model, which the case's `CLAUDE.md` traces and does not
   excuse.
3. **A declared approximation was not locally contained.**  `constant/thermoPhysPropDict`
   authorises hydrogen to run at gamma = 1, by name and with its reason: no
   UNIFAC group for hydrogen exists, and inventing one would be fabrication.
   The stated stake was small — a liquid mole fraction of 2e-4.  Three units
   downstream that residue diverges the rigorous MESH in C1, which is why
   there is a `vent` flash in this flowsheet that is not in his Figure 1.  It
   is an explicit unit, not a deletion, so what leaves with the hydrogen is
   computed: the golden pins `vent V_over_F` at **0.00201400452928**.  This is
   the clearest thing the plant has to teach.
4. **The tear seed is a guess, and the plant walks away from it.**  `0/` here
   is authored and committed, one file per stream, and `0/ipaRecycle` is
   seeded with **Luyben's own published recycle composition** — 3.822 kmol/h
   isopropanol, 0.004116 acetone, 2.053884 water in 5.88 kmol/h, which is x
   0.650 and 0.0007 exactly as his table reports.  The converged answer is x
   0.4991.  The seed is the author's, visible, and owned; the solver moved off
   it and said so.  (Where a case ships no `0/`, `bin/choupo-init0`
   materialises one from the authored inlets and the tear seed.)
5. **A specification that survives a recycle is not the same as a rate.**  C1
   asks for `distillateRecovery { component acetone; fraction 0.97; }` rather
   than Luyben's 32.25 kmol/h, because the acetone reaching C1 shrinks on
   every turn of the loop: a rate that is feasible on the first pass is
   infeasible on the third, and the flowsheet would then fail on arithmetic
   instead of physics.  The golden confirms the spec was met —
   `C1 recovery_acetone 0.969999992418` — in three outer searches.  C2 keeps
   his rate, because its feed is not starved the same way.
6. **The plant still closes.**  Global mass closure at 100 %, and the
   plant-boundary first law pinned at `H_feeds_kW` **−5862.58875482**,
   `Q_boundary_kW` **632.174396749**, `H_products_kW` **−5236.98782168**, a
   residual of **6.57346360643 kW**.  A disagreement with a paper and a
   violation of conservation are different things, and this case is careful to
   be only the first.

## What to try

Read the case's own `CLAUDE.md` first: it carries the full comparison against
Luyben's Figure 1, the five traced sources of error, and a *Pending* list that
names the one change which would move every row — fitted UNIQUAC or NRTL pairs
for the three binaries, which is the honest way to close the gap and is a
curation job rather than a code job.  The build history is
`docs/design/acetone-plant-closure-state.md`; the programme is
`docs/design/acetone-ipa-reference-case.md`.

Then go back one unit at a time.  Open the seven siblings —
`acetone01` through `acetone07` — and watch each of them make its prediction
on Luyben's published inlet, before this plant ever ran.  That is the method
this path exists to teach: a simulation is a claim, and a claim is worth what
you can say about its error.

From here the corpus is the reference rather than the route.  `listCases`
lists all of it, `docs/tutorials-catalogue.md` says what each case
demonstrates, and `docs/userGuide.tex` and `docs/theoryGuide.tex` are where
the grammar and the equations live.
