# evidence/ — COSMO surface evidence records (LVPP), private staging tier

Written 2026-07-24 by `agent:cosmo`.  Envelope: [`../RECORD_SPEC.md`](../RECORD_SPEC.md).
Source tree: `../_sources/lvpp_sigma/` (github `lvpp/sigma`, MIT, DOI 10.5281/zenodo.3613785;
Ferrarini et al., *AIChE J.* **64** (2018) 3443).  Nothing under `_sources/` was modified,
and **no segment table was copied** — every record POINTS at its `.cosmo` file.

## Ruling being implemented (advisor, accepted)

Raw LVPP COSMO output must **NOT** be converted into a `cosmoSAC2002` set.  Cavity
**area**, **volume** *and* the **sigma profile** all depend on the QM protocol, the surface
definition, the sigma-averaging convention and the model parametrization.  Until a named
**`LVPP`** set is generated **and validated** on a diverse panel — area conservation,
profile normalisation, sigma moments, then published properties — with a **matching runtime
variant**, the deployable profile stays **FLAGGED** and the raw `.cosmo` is kept as EVIDENCE.

Therefore every record below carries `status flagged;` and a `note` forbidding a paste into a
component `cosmo` block or a `variant cosmoSAC2002` tag.

## Two findings the curator must know

**1 — UNIT ERROR in the staging CSV.**  `_sources/lvpp_area_volume.csv` labels its columns
`area_A2` / `volume_A3`, but the `$cosmo_data` `area=` / `volume=` fields of a `.cosmo` file
are in **ATOMIC UNITS** (bohr² / bohr³).  Proof, verified on all 35 staged compounds: the sum
of the `$segment_information` areas — which the file itself labels `[A2]` — equals
`area_raw × 0.28002852` to within 0.001 Å².  Example: n-propanol prints `area= 403.86`, whose
physical value is **113.09 Å²**, not 403.86 Å².  Each record stores the physical Å²/Å³ value
**and** the raw a.u. value, with the conversion shown.  *The CSV column headers are wrong —
do not consume that file without the correction.*

**2 — the incompatibility is measurable.**  Ethylene is present in both databases:
LVPP gives 76.78 Å² / 59.49 Å³, the shipped VT-2005 `cosmoSAC2002` set in
`data/standards/components/ethylene.dat` gives 72.38 Å² / 53.93 Å³ — **+6.1 % area,
+10.3 % volume**.  That alone disqualifies a mixed paste, before the sigma profile is
even discussed.

## Records written — 33

| record | compound | CAS | formula | source file | area / A2 | volume / A3 | segments |
|---|---|---|---|---|---|---|---|
| `lvpp-lactose` | lactose | 63-42-3 | C12H22O11 | `LACTOSE.cosmo` | 316.88 | 380.71 | 2097 |
| `lvpp-mannitol` | mannitol | 69-65-8 | C6H14O6 | `MANNITOL.cosmo` | 211.66 | 219.79 | 1493 |
| `lvpp-erythritol` | erythritol | 149-32-6 | C4H10O4 | `ERYTHRITOL.cosmo` | 157.57 | 151.33 | 1077 |
| `lvpp-glycine` | glycine | 56-40-6 | C2H5NO2 | `GLYCINE.cosmo` | 110.50 | 95.09 | 692 |
| `lvpp-alanine` | alanine | 56-41-7 | C3H7NO2 | `ALANINE.cosmo` | 131.46 | 119.36 | 867 |
| `lvpp-serine` | serine | 56-45-1 | C3H7NO3 | `SERINE.cosmo` | 140.60 | 130.38 | 935 |
| `lvpp-valine` | valine | 72-18-4 | C5H11NO2 | `VALINE.cosmo` | 159.38 | 160.08 | 1089 |
| `lvpp-glutamicAcid` | glutamicAcid | 56-86-0 | C5H9NO4 | `GLUTAMIC_ACID.cosmo` | 185.42 | 180.02 | 1210 |
| `lvpp-lysine` | lysine | 56-87-1 | C6H14N2O2 | `LYSINE.cosmo` | 206.11 | 202.93 | 1469 |
| `lvpp-urea` | urea | 57-13-6 | CH4N2O | `UREA.cosmo` | 99.82 | 81.52 | 631 |
| `lvpp-acrylamide` | acrylamide | 79-06-1 | C3H5NO | `ACRYLAMIDE.cosmo` | 115.88 | 101.88 | 713 |
| `lvpp-caffeine` | caffeine | 58-08-2 | C8H10N4O2 | `CAFFEINE.cosmo` | 222.31 | 235.34 | 1351 |
| `lvpp-carbamazepine` | carbamazepine | 298-46-4 | C15H12N2O | `CARBAMAZEPINE.cosmo` | 259.51 | 294.73 | 1543 |
| `lvpp-ibuprofen` | ibuprofen | 15687-27-1 | C13H18O2 | `IBUPROFEN.cosmo` | 269.75 | 290.19 | 1820 |
| `lvpp-diclofenac` | diclofenac | 15307-86-5 | C14H11Cl2NO2 | `DICLOFENAC.cosmo` | 295.34 | 338.56 | 1696 |
| `lvpp-naproxen` | naproxen | 22204-53-1 | C14H14O3 | `NAPROXEN.cosmo` | 277.60 | 299.36 | 1762 |
| `lvpp-ketoprofen` | ketoprofen | 22071-15-4 | C16H14O3 | `KETOPROFEN.cosmo` | 293.10 | 328.68 | 1809 |
| `lvpp-atenolol` | atenolol | 29122-68-7 | C14H22N2O3 | `ATENOLOL.cosmo` | 332.60 | 362.74 | 2212 |
| `lvpp-bisphenolA` | bisphenolA | 80-05-7 | C15H16O2 | `BISPHENOL_A.cosmo` | 267.31 | 302.36 | 1650 |
| `lvpp-estradiol` | estradiol | 50-28-2 | C18H24O2 | `ESTRADIOL.cosmo` | 296.85 | 349.55 | 2025 |
| `lvpp-estriol` | estriol | 50-27-1 | C18H24O3 | `ESTRIOL.cosmo` | 307.91 | 362.31 | 2106 |
| `lvpp-estrone` | estrone | 53-16-7 | C18H22O2 | `ESTRONE.cosmo` | 302.36 | 350.93 | 2000 |
| `lvpp-testosterone` | testosterone | 58-22-0 | C19H28O2 | `TESTOSTERONE.cosmo` | 311.73 | 382.57 | 2127 |
| `lvpp-progesterone` | progesterone | 57-83-0 | C21H30O2 | `PROGESTERONE.cosmo` | 331.58 | 411.12 | 2248 |
| `lvpp-glyphosate` | glyphosate | 1071-83-6 | C3H8NO5P | `GLYPHOSATE.cosmo` | 192.84 | 185.41 | 1250 |
| `lvpp-limonene` | limonene | 5989-27-5 | C10H16 | `LIMONENE.cosmo` | 202.87 | 210.51 | 1433 |
| `lvpp-alphaPinene` | alphaPinene | 80-56-8 | C10H16 | `ALPHA-PINENE.cosmo` | 191.62 | 202.69 | 1365 |
| `lvpp-furfurylAlcohol` | furfurylAlcohol | 98-00-0 | C5H6O2 | `FURFURYL_ALCOHOL.cosmo` | 140.24 | 130.92 | 860 |
| `lvpp-levulinicAcid` | levulinicAcid | 123-76-2 | C5H8O3 | `LEVULINIC_ACID.cosmo` | 160.62 | 152.37 | 1057 |
| `lvpp-nPropanol` | nPropanol | 71-23-8 | C3H8O | `N-PROPANOL.cosmo` | 113.09 | 97.15 | 813 |
| `lvpp-phenylalanine` | phenylalanine | 63-91-2 | C9H11NO2 | `L-PHENYLALANINE.cosmo` | 213.02 | 220.85 | 1351 |
| `lvpp-PFBA` | PFBA | 375-22-4 | C4HF7O2 | `HEPTAFLUOROBUTANOIC_ACID.cosmo` | 171.48 | 173.59 | 1058 |
| `lvpp-gammaValerolactone` | gammaValerolactone | 108-29-2 | C5H8O2 | `G-VALEROLACTONE.cosmo` | 141.59 | 132.67 | 921 |

Every row was identity-checked **against the `.cosmo` file itself**, not against the CSV:
the molecular formula was recomputed from the `$coord_rad` atom list, and the heavy-atom
ring count re-derived from the LVPP `mol/` geometry.  All 33 agree with the candidate
component (CAS as listed in `../components/<name>.candidate.dat`).  The `nSegments`,
`area` and `volume` in the CSV also reproduce the `.cosmo` file exactly for all 35 rows —
the CSV's numbers are right, only its unit labels are wrong.

Records carrying an extra `identityNote` (a sibling record exists, or the synonymy needed
stating): `lvpp-alanine`, `lvpp-alphaPinene`, `lvpp-limonene`, `lvpp-lactose`,
`lvpp-phenylalanine`, `lvpp-PFBA`, `lvpp-gammaValerolactone`, `lvpp-glutamicAcid`,
`lvpp-glycine`.

## UNVERIFIED — 2 rows rejected, no record written

A wrong identity match is worse than a missing record.  These two CSV rows point at a
`.cosmo` file that is **not the same chemical species** as the candidate component, or whose
identity cannot be resolved from the source.  They are listed here and nowhere else.

| CSV row | file pointed at | why rejected |
|---|---|---|
| `fructose` (CAS 57-48-7) | `FRUCTOSE.cosmo` | LVPP ships **three distinct fructose structures**: `FRUCTOSE.cosmo` is the **furanose** (5-membered ring, C₄O), `DFRUCTOSE.cosmo` is the **pyranose** (6-membered ring, C₅O), `KETO_D_FRUCTOSE.cosmo` is the open-chain keto form.  The candidate is crystalline D-fructose (β-D-fructopyranose in the solid); the CSV extracted the furanose.  Areas differ by ~4 % (706.00 / 678.57 / 733.95 bohr²).  Which record is the right identity is **unresolved**. |
| `xylose` (CAS 58-86-6) | `XYLOSE.cosmo` | `XYLOSE.cosmo` is the **open-chain (acyclic aldehyde) tautomer** — 0 rings in the LVPP geometry — while D-xylose is the **pyranose** ring in the solid and predominantly so in water.  LVPP does ship the ring form as `DXYLOSE.cosmo` (604.85 bohr² / 1162.29 bohr³, 6-membered C₅O ring), but that is a different file from the one the CSV extracted.  Wrong tautomer = wrong surface. |

Resolving either is a **curation decision** (pick the anomer/tautomer the case needs, then
re-extract) — deliberately not taken here, and no file under `_sources/` was touched.

## Other observations, for the eventual `LVPP` set

- `D-LIMONENE.cosmo` is a **legacy record** (629 segments, heavy-atom-only coordinate block)
  inconsistent with the full-atom `LIMONENE.cosmo` (1433 segments) used here.  Do not mix
  release-v25 records with legacy ones inside one set.
- `ALPHA-PINENE.cosmo` and `A-PINENE.cosmo` are the same substance under two names, 2.3 %
  apart in area — a **conformer** spread.  A named set must state which conformer it ships,
  because a single gas-phase conformer is itself a modelling choice.
- Amino-acid records are the **neutral gas-phase tautomer**, never the aqueous zwitterion.
  Any aqueous use of these surfaces must say so out loud.
- Nothing here supplies a **sigma profile**.  Generating one means binning the
  `$segment_information` charges with the *same* averaging convention as the target variant —
  that is the validation work the ruling defers, not a transcription.
