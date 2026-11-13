# density_pilot -- validation data and a measured baseline for the liquid-density pilot (C378)

Kind: EVIDENCE (no engine code, no record under `data/standards/`).  It exists
so that the PASS thresholds of the pilot of
[`docs/design/thermophysical-property-routes.md`](../../../../docs/design/thermophysical-property-routes.md)
section 4.2 can be written on numbers BEFORE the pilot runs.  The reading of
these numbers, the proposed thresholds and the objections are in
[`docs/design/density-pilot-thresholds.md`](../../../../docs/design/density-pilot-thresholds.md).

## Why a batch directory and not a case's `constant/experiments`

A case's `constant/experiments/<file>.dat` (`tutorials/props/compare/*`) binds
ONE dataset to ONE case that plots or fits it.  A batch under
`data/curation/batches/<name>/` (`species_c373`, `mixing_c331`) holds the
EVIDENCE of a curation act together with the script that regenerates it.
Here five demonstrations share nine measured sets before any pilot case
exists, and the thresholds are written against the data, so the data come
first and belong to the act, not to a case.  When a pilot case is built it
takes the points it needs into its own `constant/experiments` (a case carries
its own data), citing the same article.

## Provenance and the licence reading

* D1 values are the densities PRINTED in Wagner & Pruss (2002), J. Phys. Chem.
  Ref. Data 31, 387-535, Tables 13.1 and 13.2 (table and journal page on every
  row), read from the PDF in the literature folder.
* D2-D5 values were read from the ThermoML mirror (`thirdParty/thermoml/`, the
  user's own gitignored copy, a FINDING AID).  Every file names the ARTICLE
  (authors, title, journal, DOI), never the archive, and carries
  `transcribedNotCheckedAgainstArticle`: the values were not yet read from the
  article itself (`thirdParty/thermoml/README.md`).  The measurements belong to
  their articles.
* RULED (architect): `thirdParty/thermoml/README.md` reserves BULK import, so
  the per-point files are NOT in git (`.gitignore` of this directory names
  them).  Anyone holding the mirror regenerates them byte for byte with
  `scripts/build_data.py` (D2-D5) and `scripts/extract_iapws95_table.py` (D1,
  from the article's PDF).  What is in git: the scripts, the baseline SUMMARY
  tables (statistics, not points), `d1_anchors.tsv` (12 printed values of the
  water article, table and page each) and `d3b_point.tsv` (ONE cited point,
  the D3b demonstration's "user measurement").

## Files

Regenerated, not in git (article; points; T; P; stated U):

| file | article (DOI) | points | T / P / U |
|---|---|---|---|
| `d1_water_iapws95.tsv` | Wagner & Pruss 2002, Tables 13.1/13.2 (printed values) | 187 | 273.16-375 K, 0.0006-100 MPa |
| `d2_waterEthanol_pecar2005.tsv` | 10.1016/j.fluid.2004.11.019 | 810 | 298.15-348.15 K, 0.1-40 MPa, 0.2-0.9 kg/m3 |
| `d2b_waterEthanol_rehmanAnsari2008.tsv` | 10.1021/je800150h | 108 | 268-323 K, 101 kPa, 2.8-4.6 kg/m3 |
| `d3a_naoh_galindoLuna2019.tsv` | 10.1021/acs.jced.9b00536 | 186 | 303-353 K, 0.1 MPa, 2.0-2.2 kg/m3 |
| `d3b_naoh_hnedkovsky2007.tsv` | 10.1021/je700265d | 116 | 323-573 K, 2-10 MPa, 1.5-2.7 kg/m3 |
| `d4a_co2water_hebach2004.tsv` | 10.1021/je034260i | 205 | 281-333 K, 1.1-30.7 MPa, ~3 kg/m3 |
| `d4b_co2water_mcbrideWright2015.tsv` | 10.1021/je5009125 | 98 | 275-449 K, 15-101 MPa, 0.6-0.8 kg/m3 |
| `d4c_co2water_efika2016.tsv` | 10.1016/j.jct.2015.06.034 | 273 | 293-450 K, 0.2-64 MPa, 2-10 kg/m3 |
| `d5a_...saturated...tsv`, `d5b_...unsaturated...tsv` | 10.1021/je020173z | 21 + 53 | 298.15, 313.15 K, 101 kPa |
| `baseline/` per-point tables | derived from the above | | |

In git:

| file | what |
|---|---|
| `d1_anchors.tsv`, `d3b_point.tsv` | the 12 printed anchors and the one cited point |
| `baseline/*summary*`, `data_summary.tsv`, `consumers_pump_route.txt`, `probes.txt`, `d3_olsson_pressure_estimate.tsv` | what today's engine (commit a2b744c46) gives, statistics only |
| `scripts/` | readers, the correlation, the engine runner; every number in the note is reproducible |

## Reproduce

```
export CHOUPO_HOME=<this tree>  CHOUPO_BIN=<choupoProps>  CHOUPO_SOLVE=<choupoSolve>  CHOUPO_SCRATCH=<writable dir>
python3 -I scripts/build_data.py                         # needs the ThermoML mirror
python3 -I scripts/extract_iapws95_table.py <wagner2002-iapws95.pdf> > d1_water_iapws95.tsv
python3 -I scripts/baseline_d1.py > baseline/d1_water.tsv
python3 -I scripts/baseline_d2.py ; python3 -I scripts/cross_check_d2.py > baseline/d2_crosscheck.tsv
python3 -I scripts/olsson_density.py ; python3 -I scripts/olsson_pressure_check.py
python3 -I scripts/baseline_d4.py ; python3 -I scripts/baseline_consumers.py > baseline/consumers_pump_route.txt
python3 -I scripts/baseline_probes.py > baseline/probes.txt
python3 -I scripts/summarise_data.py > baseline/data_summary.tsv
```

The engine runs use scratch copies built by `scripts/engine_rho.py` from the
shipped component records and `tutorials/steady/rotating/pump01_water`; no
shipped case is edited.
