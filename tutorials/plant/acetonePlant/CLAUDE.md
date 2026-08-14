# CLAUDE.md -- Choupo case: plant/acetonePlant

Programme record:
[`docs/design/acetone-ipa-reference-case.md`](../../../docs/design/acetone-ipa-reference-case.md).
Build history and the findings that got here:
[`docs/design/acetone-plant-closure-state.md`](../../../docs/design/acetone-plant-closure-state.md).
Siblings, each isolating one unit on Luyben's OWN published inlet:
`props/compare/acetone01_ipa_water_azeotrope`,
`steady/reactors/acetone02_luyben_reactor`,
`steady/flowsheets/acetone03_luyben_reaction_section`,
`props/compare/acetone04_acetone_water_vle`,
`steady/absorption/acetone05_luyben_absorber`,
`steady/distillation/acetone06_luyben_column_C1`,
`steady/distillation/acetone07_luyben_column_C2`.

## Intent (this case) -- keep this updated as the project develops

- **Goal:** Luyben's Figure 1 **closed**, with the isopropanol recycle, and the
  result compared with his published stream table without hiding a difference.

- **What it claims:** his TOPOLOGY and his EQUIPMENT SPECIFICATIONS solved on
  the thermodynamics Choupo actually has. **It does not claim to reproduce his
  stream table**, and the seven siblings measured, in advance, exactly why it
  cannot. The gap IS the deliverable.

- **What it is not:** a validation. Every number in Luyben's table is the
  output of *his* Aspen/UNIQUAC simulation, not a measurement. This is a
  comparison with a published reference.

### The converged plant, against Luyben's Figure 1 (2026-08-13)

Wegstein on one tear, **3 iterations**, |r| 2.847 → 2.13e-2 → 1.785e-4.
Global mass closure 100.000 %, worst element closure 0.0000 %.

| stream | Luyben | Choupo | |
|---|---|---|---|
| **acetone product**, kmol/h | **32.25** | **27.46** | **−14.9 %** |
| acetone product, x_acetone | 0.999 | **0.9727** | fails spec |
| acetone product, x_water | 0.001 | 0.0269 | 27× |
| **water product**, kmol/h | 34.67 | 36.94 | +6.5 % |
| water product, x_water | 0.999 | **0.9852** | −1.4 % |
| water product, x_isopropanol | — | **0.0147** | raw material lost |
| IPA recycle, x_isopropanol | 0.6500 | **0.4991** | −23 % |
| IPA recycle, x_acetone | 0.0007 | **0.1395** | **199×** |
| offgas acetone, kmol/h | 2.52 (7.2 % loss) | **7.18 (21 %)** | 2.8× |
| reactor in, kmol/h | 57.83 | 57.84 | (not independent) |
| reactor out, kmol/h | 92.6 | 91.81 | −0.9 % |
| C1 condenser, MW | 1.045 | 0.849 | −18.7 % |
| C1 reboiler, MW | 1.217 | 0.882 | −27.5 % |
| C2 condenser, MW | 0.1193 | 0.116 | −2.8 % |
| C2 reboiler, MW | 0.1204 | 0.125 | +4.0 % |

**The plant makes 85 % of his acetone at a purity that misses his spec, and
loses three times as much of it out of the top.** Nothing was tuned to get
there.

### Where the error comes from -- the whole point of building it in seven steps

Each number above traces to a measurement made *before* the unit that carries
it existed. That is why the plant is informative rather than merely wrong:

1. **UNIFAC invents an acetone/water azeotrope at x 0.978** where Luyben's
   UNIQUAC has none (`acetone04`, measured before any column). It is 0.044 K
   deep and it caps C1 at 0.9727 — a spurious feature costing purity the paper
   does not lose.
2. **UNIFAC misplaces the real IPA/water azeotrope**, 0.590 against 0.673
   (`acetone01`). It caps C2's overhead, so the recycle returns wetter.
3. **The two ceilings compound through the recycle.** A wetter recycle carries
   less isopropanol; less isopropanol makes less acetone; C1 receives 26.6
   instead of 32.25 kmol/h of it. The closed loop is where these stop being two
   findings and become one production figure.
4. **The separator sends 2.9× too much acetone to the vapour** (`acetone03`)
   and **the absorber recovers a sixth of what the paper does** (`acetone05`),
   so the offgas loss is 21 % against his 7.2 %.
5. **The recycle carries 14 mol % acetone** against his 0.07 %. This is the
   one number no sibling predicted: acetone that C1 could not take overhead
   goes down into B1, and C2 sends part of it back up. **A composition error in
   one column became a material loop in the plant.**

### Decisions + why

- **`distillateRecovery` on C1, not a rate.** A rate is the wrong
  specification inside a recycle: the acetone reaching C1 shrinks on every
  turn, so a number feasible on the first pass is infeasible on the third and
  the flowsheet fails on arithmetic rather than physics. The recovery (0.97 of
  the acetone in the feed) is what the design actually fixes. C2 keeps
  Luyben's rate because its feed is not starved the same way.
- **Wegstein, not Newton, on the tear.** Newton's Jacobian perturbs the tear
  five times per iteration and each perturbation triggers a full recovery
  search — a nested cost that was still grinding after eleven minutes at 200 %
  CPU. Wegstein needs one search per pass and converged in three. The choice
  is stated in `system/solverDict` with its reason; it is a solver aid and the
  doctrine makes those the student's to see.
- **Two thermodynamic worlds.** The absorber REFUSES the global
  gammaPhi/UNIFAC package by name — Kremser reads Henry's law — so it carries
  its own `thermo {}` (water solvent on Raoult, acetone solute on Henry). The
  run announces the boundary. This is the settled heterogeneous-thermo
  architecture on a published flowsheet rather than on a demonstration.
- **An explicit vent ahead of C1.** Luyben's C1 has a partial condenser and a
  vent; Choupo's column has a total condenser. Hydrogen at 6.8e-4 in the flash
  liquid *diverges* the rigorous MESH (measured: |F| 6.2e+12 after 3
  iterations, against 2.2e-14 for the same feed without it). The vent removes
  it as a flash, so what leaves with the hydrogen is computed rather than
  assumed — 0.142 kmol/h, comparable to his 0.0465 kmol/h vent.
- **No `anchor` rows.** For the fourth time and the same reason: his numbers
  are his model's output. The golden's claim is regression only.

### Announced along the way

Water's vapour pressure at 389 K, outside its declared 273–373 window; the
hydrogen liquid leg on the announced Watson-slope fallback; the H2 gamma = 1
authorisation; the absorber's model-boundary override. All in the run's own
caveat surface.

### Pending / in curation

- **fitted UNIQUAC or NRTL pairs** for the three binaries — the one change
  that would move every row above, and the honest way to close the gap;
- a curated `isopropanol` (the lake estimate boils 4.5 K high);
- an energy-balance comparison against his vaporiser and HX duties, which
  needs the model-boundary ledger read across the absorber's world;
- water's 0.70 K Antoine deficit, shared with `acetone01` and `acetone04`.


## The absorber's -11.25 kW is the energy MODEL, not the model boundary (2026-08-14)

The absorber carries the plant's only per-unit `thermo {}` override, so its
enthalpy step was the obvious suspect for the -11.2496 kW the energy report
attributes to it.  It is not.  The model-boundary auditor prices all four of
its streams in both worlds and the step is **zero on every one**: changing the
liquid activity model (UNIFAC -> diluteSolution/Henry) changes K-values, not
the enthalpy datum, so at this boundary there is nothing to credit.

The residual is the absorber's own energy balance -- a lumped-Cp textbook
model (liquid Cp = the solvent's alone, vapour Cp = the feed gas at feed
composition, both constant across the column, source = heat of absorption)
whose converged temperature profile does not conserve canonical enthalpy.  The
proof is that a standalone absorber with **no model boundary at all** shows
the same thing: `absorber01_NH3_water` carries +82.93 kW, `stripper01_NH3_water`
-19.87 kW.

None of that was visible before this date: every one of those units read `n/a`
in the ledger, because the model-boundary audit only ran on units declaring a
duty and all three are adiabatic.  The unit now ANNOUNCES the approximation
(the choupoCtrl dynamicCSTR posture), the size stays where the report already
publishes it, and NO number in this plant moved.

Still open, and deliberately: whether the lumped-Cp balance should be replaced
by a canonical enthalpy formulation.  That would move the temperature profile,
hence the K-values, hence every product composition in this plant and in every
other absorber case -- it is a physics change, not a reporting one.
