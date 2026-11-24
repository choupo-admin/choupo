# Verify the verifier: the closures recomputed outside the engine (C491 step 0)

Date 2026-11-24.  A MEASUREMENT, not a gate.  Tool:
`bin/curate/measure_independent_closure.py` (not wired into `bin/runTests`).

## What the gates read

`check_mass_closure.py` (band 0.5 %), `check_element_closure.py` (band 0.01 %)
and `check_element_balance.py` read `reports/balances/massBalance.csv` and
`elementBalance.csv`, which `src/reporting/MassBalanceReport.cpp` and
`ElementBalanceReport.cpp` write.  The streams, MW and atoms those reports use
come from the engine's own `Topology.H` (the flattened solver topology,
feeds = consumed and not produced, observer units excluded), `componentMassFlow`
(`streams/StreamMass.H`) and `elementalCompositionOf` (`thermo/ElementComposition`).
`check_mass_closure.py` says so on purpose: "read from the engine, never
recomputed here".  So every gate checks the engine's number against a band; none
recomputes it.  `check_energy_closure.py` is the same shape for energy.

## The rule (fixed before anything was run)

A. The first ten entries of `tutorials/FASTSET`, in file order, that are under
   `tutorials/steady/`, run with `choupoSolve`, and whose engine-reported
   topology has at least two units (the row count of
   `reports/balances/massBalance_byUnit.csv`).  Skipped by that rule:
   `aceticAcid01_gibbsReactor` (1 unit); the walk stopped at the tenth qualifying case.
B. The two plants under `tutorials/plant/` with the most stream files in `0/`
   (internalStates excluded): `greenAmmonia03_basicDesign` and
   `greenAmmoniaPEQ_baseCase`, 28 each, no tie to break.

## The method

For each case, after `choupoSolve <case>`: read only `converged/**/<stream>`
(`componentMolarFlows`, kmol/h), `system/flowsheetDict` (flat `units(...)`, or a
sectored plant's `connections{}`: feed = `to` only, product = `from` only,
internal = both, plus every stream file inside a sector), and the component
records (nearest `constant/components` up the tree over
`data/standards/{components,species}` and `data/local`; fields `MW` and
`formula`).  Formulas are parsed by the script's own grammar.  Nothing is
imported from the engine.  Energy is NOT recomputed: an enthalpy needs the
property package.

**Agree** means: mass closure within 1e-4 percentage points of the engine's
printed value, mass totals within 1e-6 relative, per-element totals within 1e-5
relative and element closure within 5e-4 points (the CSV prints 4 decimals), and
the same element set.  Why: the engine works from memory, the script from a
10-digit file, so true agreement is about 1e-7 relative; the tolerance is 5000x
tighter than the mass gate's band and 100x tighter than the element gate's.

Sensitivity of the tool itself (scratch copies, not committed): changing one
purge flow (N2 257.19 to 258.19) gave DISAGREE on mass and N; deleting a plant
product stream gave NOT JUDGED naming the stream; a wrong NH3 MW in a case-local
record gave DISAGREE (108.59 % against 99.9971 %).  The comparison is not vacuous.

## Result

12 cases: **12 AGREE, 0 DISAGREE, 0 NOT JUDGED.**

| case | family | feeds/products/internal | mass in / out kg/h (independent) | mass closure % indep. | engine | worst element indep. | engine | verdict |
|---|---|---|---|---|---|---|---|---|
| ed01_nacl_desalination | electrodialysis | 2/2/0 | 652.8346 / 652.8346 | 100.000000 | 100.0000 | Na 100.00000 | O 100.0000 | AGREE |
| ed02_over_limiting_current | electrodialysis | 2/2/0 | 1625.5013 / 1625.5013 | 100.000000 | 100.0000 | Na 100.00000 | O 100.0000 | AGREE |
| ed03_stack_record | electrodialysis | 2/2/0 | 356.1307 / 356.1307 | 100.000000 | 100.0000 | Na 100.00000 | O 100.0000 | AGREE |
| ammoniaReactor01_fixedConversion | reactors | 1/3/5 | 70636.6200 / 70634.9040 | 99.997571 | 99.9976 | N 100.00000 | N 100.0000 | AGREE |
| ammoniaReactor02_equilibrium | reactors | 1/3/5 | 70636.6200 / 70634.7716 | 99.997383 | 99.9974 | Ar 99.99976 | Ar 99.9998 | AGREE |
| ammoniaReactor03_equilibriumApproach | reactors | 1/3/5 | 70636.6200 / 70634.7751 | 99.997388 | 99.9974 | Ar 99.99981 | Ar 99.9998 | AGREE |
| ammoniaReactor04_kineticSizing | reactors | 1/3/6 | 70636.6200 / 70635.0488 | 99.997776 | 99.9978 | Ar 99.99998 | N 100.0000 | AGREE |
| ammoniaRoutes01_screening | reactors | 6/6/0 | 407703.9298 / 407705.3922 | 100.000359 | 100.0004 | N 100.00000 | O 100.0000 | AGREE |
| esterification2sector | flowsheets | 1/2/1 | 5306.0500 / 5306.0500 | 100.000000 | 100.0000 | C 100.00000 | O 100.0000 | AGREE |
| economics01_esterification_dcf | economics | 1/2/2 | 26530.2500 / 26530.2493 | 99.999997 | 100.0000 | C 100.00000 | O 100.0000 | AGREE |
| greenAmmonia03_basicDesign | plant | 2/4/22 | 50071.4244 / 50069.9601 | 99.997076 | 99.9971 | Ar 99.99851 | Ar 99.9985 | AGREE |
| greenAmmoniaPEQ_baseCase | plant | 2/4/22 | 50071.4244 / 50069.9601 | 99.997076 | 99.9971 | Ar 99.99851 | Ar 99.9985 | AGREE |

"Worst element" is the element farthest from 100 %; where every element prints
100.0000 the name is a tie and the two columns may name different elements.
Largest differences over the twelve: closure 4.1e-5 points (ammoniaRoutes01,
the CSV's own 4-decimal rounding), totals 7e-8 relative (ed01, file digits).

## Findings

1. No disagreement.  The engine's mass and element boundary reports equal an
   independent recomputation on 6 families (electrodialysis, reactors with a
   tear loop, sectored esterification, an economics flowsheet, a 6-route flat
   case, two 17-sector plants).  Stream selection, MW use and formula atoms in
   the engine are confirmed for these cases.
2. The independent method also confirms the engine's REAL non-closures:
   ammoniaReactor01..04 at 99.9974-99.9978 %, ammoniaRoutes01 at 100.0004 %,
   the two plants at 99.9971 %.  They are not report artefacts.  (For
   ammoniaReactor01 the converter's 2.4e-5 is its own stoichiometry:
   N2 + 3 H2 = 28.013 + 6.048 = 34.061 against 2 x 17.03 = 34.060 kg/kmol, a
   record-MW inconsistency, inside the band; the others were not traced.)
3. Boundary of the evidence: the sample does not reach solids, carried
   quantities, aqueous speciation or utility-circuit scopes.  The script
   refuses those by name (an unknown stream block, an observer unit, an
   unresolvable or ambiguous state file, a missing MW or formula) rather than
   guess.  Energy closure is untested by this method.  A plant outlet's file is
   looked for in `MAIN/` and in the `from` sector; none was ambiguous here.
4. greenAmmonia03 and PEQ print identical closures (99.997076): same plant,
   same design point, confirmed independently from each case's own files.

## Does this become a gate?

No.  Rule 4e(4): a new gate needs the real defect it would have caught, and this
measurement found none.  The tool stays a measurement script under
`bin/curate/`; rerun it when a report's code changes (MassBalanceReport,
ElementBalanceReport, Topology, StreamMass, ElementComposition) or before
certifying a family with solids, carried masses or speciation.  A cheap next
step, if wanted, is to extend it to those families before deciding anything.
