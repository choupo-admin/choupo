# The silent backfill closed -- what moved (2026-11-19, branch build/last-backfill)

Rule (architect's decision): `overlayOf` takes the keys it lacks from the catalogue,
each announced once per run with its source; `variationOf` / `distinctFrom` take
nothing; an undeclared local homonym is refused by name in every mode.

## Census of shipped case-local records with a catalogue homonym and no declaration

Method: every `constant/**/*.dat` under `tutorials/` and `data/curation/` that has a
file of the same relative path under `data/standards/`, minus sealed cases and held
copies (read alone already).  211 homonyms: 137 `variationOf`, 48 `overlayOf`,
24 `distinctFrom`, **2 undeclared**.

| record | compared key by key | true declaration | action |
|---|---|---|---|
| `steady/crystallisation/overlay02_nacl_calorimetric/constant/components/water.dat` | every key it carries equals the catalogue's (it only LACKS 20 blocks the catalogue has, which were silently backfilled) | identical in every value the engine reads | deleted; the case reads the catalogue record (it had no manifest, so no pin) |
| `props/solvents/solvent03_polystyrene_observed/constant/components/polystyrene.dat` | a sample: Hansen solute G centre and radius (Table 4.1 row G) over the commodity grade | `overlayOf polystyrene;` + `variationReason` (the sentence solvent02 already carries) | declared |

## solvent03: ten Hansen triples move to the catalogue

The ten `overlayOf` solvent records (benzene, cyclohexane, diethylEther, ethanol,
ethylAcetate, methanol, methylEthylKetone, nButanol, nitroethane, toluene) carried
only a Hansen triple the catalogue lacked: a fact of the molecule (Hansen 1967 thesis
Table 2.1 rows 57, 63, 23, 3, 35, 1, 30, 5, 40, 58).  Each triple and its provenance
block (origin, method, reviewStatus interim, notes) was copied byte for byte into the
catalogue record, with the thesis citation added; the local copies are deleted.
`bin/choupo-import --repin components/<name>.dat` re-pinned the manifests that pin
these records (170 manifests touched; only the one hash line of each changes).

## Goldens

| case | row | before | after | why |
|---|---|---|---|---|
| props/molecular/solubility01_hildebrand_ladder | `diag solubilityParameter_0 n_hansen` | 2 | 6 | its system names cyclohexane, benzene, toluene and ethanol, whose catalogue records now carry a triple, so the lesson's Hansen table lists six substances instead of two (water has none: one is announced absent). The sum-rule row (1.3547 %) is the same value, because it is the worst of the two rows that were already there |

solvent01/02/03 and overlay02: byte-identical against their goldens (the solvent
triples are read from the catalogue exactly as from the deleted overlays).

## Gates that probed with undeclared copies

Their fixtures wrote a catalogue record into a probe case (so did
`case_records.materialise`, which fed ~250 gates).  Each copy is now written as a
declared `variationOf` (`case_records.as_variation` / `copy_variation`), or
`distinctFrom` where the fixture is another species (CH3Cl under methane's name).
Two probes tested exactly this defect and now test it for real: a record with a line
deleted used to be supplied again by the catalogue (check_solubility_parameter).

Gates edited to declare their probe copies (all re-run, non-strict, as `bin/runTests` runs them):
case_records (materialise, `as_variation`, `copy_variation`, `declare_homonyms`),
check_alpha_function, check_density_pilot, check_dynamic_cstr_level, check_element_balance,
check_estimated_species_announced, check_hansen_teas (its list of catalogue triples is now read
from the catalogue), check_liquid_diffusivity_declaration, check_ratebased_segment,
check_record_law_pins, check_rowlinson_bondi, check_seal_verdict, check_solid_property_refusals,
check_solubility_parameter, check_srk_h2n2_aad (its H2 record is truthfully an `overlayOf`),
check_unit_acceptance, check_v2_refusals, check_vliq_datum, check_vlle_fallback,
check_volume_translation, check_volumetric_rung1, check_water_one_home, check_shadow_identity
(two arms that expected an announcement now expect the refusal; new BACKFILL arms).

Gates that still fail in this tree and were NOT caused by this change (each fails for a reason
that names something else): check_ed_batch (three-ion probe refused for a missing Mg liquid
volume; ed03 vs batch-rig digits), check_fit_then_simulate (a comment in a dataset makes the
fit stale), check_membrane_classes (`abs:1e-08` tolerance not read by bin/choupo-import),
check_review_status (cavett01 8 interim mirrors, 7 printed), check_spray_dryer_solvents and
check_transport_correlations (sprayDryer01_sugar now refused first by the viscosity door),
check_density_pilot PA-03 and check_pure_fluid_phase_asked (pass non-strict; refused STRICT
for an unpinned Helmholtz record, as the gates always ran without CHOUPO_PINS).
