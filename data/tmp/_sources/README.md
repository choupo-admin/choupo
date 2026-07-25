# data/tmp/_sources — bulk open databases (shared resource for the storm)

## lvpp_sigma/  (COSMO-SAC sigma-profile database, LVPP)
Cloned from github.com/lvpp/sigma (open; cite DOI:10.5281/zenodo.3613785 +
Ferrarini et al., AIChE J. 2018).  release_v25/ = 2500+ molecules as `.cosmo`
files (NWChem b3lyp-d2svpd): each has `$cosmo_data` (area, volume) + full
`$segment_information` (per-segment x,y,z, charge, area) — the raw input for the
Mullins sigma-averaging.

- `lvpp_area_volume.csv` — cavity AREA + VOLUME already extracted for the
  candidates present (REAL, directly usable in each cosmo{} block).
- **51-point sigma-profile generation** (segments -> binned profile): must use
  the SAME averaging convention as Choupo's shipped VT-2005 profiles (Mullins
  IECR 2006 / NIST usnistgov/COSMOSAC), VALIDATED by reprocessing a compound
  present in BOTH LVPP and Choupo's VT2005 set and matching the profile — do NOT
  ship profiles from a different/unvalidated averaging (glass-box: no subtly
  wrong numbers).  This is a curation step, flagged for careful execution.

Legal: private/gitignored tier; individual values are facts, cited to primary.

## CORRECTION (2026-07-24, caught by the COSMO evidence audit)
`lvpp_area_volume.csv` originally labelled its area/volume columns as A^2 / A^3.
**They were atomic units (bohr^2 / bohr^3)** — the `.cosmo` `$cosmo_data` block is
in a.u.  Physical area = raw x 0.28002852 (verified: the sum of the
`$segment_information` areas, which the file itself labels [A2], matches).
Anything that consumed the old CSV as Angstrom was off by ~3.57x.  The CSV now
carries BOTH the converted A^2/A^3 and the raw a.u. values.
Two rows are IDENTITY-UNVERIFIED and must not be used: `fructose` (furanose file
vs pyranose candidate) and `xylose` (open-chain tautomer vs pyranose).
Authoritative per-compound values now live in `data/tmp/evidence/lvpp-<name>/metadata.dat`.
