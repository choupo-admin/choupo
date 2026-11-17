# Door slice E (the property layer, the property-bench tools, two sizers): moved goldens

Branch build/door-e-property-layer-tools.  No golden moved.

The two code changes (SolubilityParameter, HansenMixture: the molar volume is asked of
`ThermoPackage::liquidMolarVolumeOf(i, T)` for every record, not read from the stored
datum when the record states no `VliqT`) change a number only where T differs from the
record's datum temperature (298.15 K) or where Rackett's shape differs from the stored
value; the four cases that run them sit at 298.15 K / Tref 298.15 K:

| case | verdict before (golden of main) | verdict after | moved rows |
|---|---|---|---|
| props/molecular/solubility01_hildebrand_ladder | PASS | PASS | none |
| props/solvents/solvent01_synthetic_mixture | PASS | PASS | none |
| props/solvents/solvent02_polystyrene_hexane_blends | PASS | PASS | none |
| props/solvents/solvent03_polystyrene_observed | PASS | PASS | none |

Every other site of the family is a declared exception (a classification, no code change).
