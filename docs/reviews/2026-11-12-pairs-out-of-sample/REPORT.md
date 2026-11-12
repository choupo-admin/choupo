# Review 2026-11-12: the catalogue pairs, out of sample

**Question.** Do the catalogue's binary pairs (NRTL, UNIQUAC, Wilson) predict
measurements they were NOT fitted to?

Measured at commit `84557436e`.  Data: the NIST/TRC ThermoML archive mirror
(11 923 files, 2 unreadable), joined to the catalogue by InChIKey.  Nothing
was fitted and no measured point is stored in this directory.  Re-run:
`run_all.sh <archive dir> [workdir]`; it was run twice from empty work
directories and every table came out byte-identical.  No article was read
back against the archive.

The commander of the review reproduced, apart from the reviewer: the kernel
verification (table byte-identical) and findings PO-01 and PO-02 (same
numbers).

## 1. Summary

**Kernels (VERIFIED).**  NRTL, Wilson and UNIQUAC written independently from
the published equations (`oos_lib.py`) agree with the engine's activity
coefficients to 4.9e-12 in ln gamma (570 values per model, both
infinite-dilution ends included).  The engine's multicomponent bubble
temperature agrees with an independent solver to 1.6e-5 K.
`verify_kernels.py` needs no archive and exits 1 above 1e-9: it can become a
gate as it stands.

**(A) Infinite-dilution activity coefficients.**  The archive holds 9 501
binary blocks of this property; 542 are usable with both compounds in the
catalogue (467 unordered pairs).  Only 12 of those pairs have a catalogue
record: 18 records (NRTL 10, UNIQUAC 5, Wilson 3), 142 points from 11
articles outside each record's evidence.

| | points | median factor in gamma | p90 factor |
|---|---|---|---|
| inside the record's validity span | 57 | 1.13 | 1.42 |
| scatter between laboratories (noise floor) | 57 comparisons | 1.11 | 1.29 |
| outside the span | 85 | 1.80 | 2.77 |
| parameters swapped ij/ji (negative control), in span | 57 | 2.21 | -- |

Inside the span the records are at the noise floor, but 51 of those 57
points belong to four aqueous records that did not come from the bubble-point
fitting pipeline.  The pipeline's records were tested on 54 points (median
factor 1.87, p90 2.78), almost all BELOW the span, and they under-predict the
activity coefficient of a dilute alcohol in a hydrocarbon or an aromatic by
about a factor of two in all three models.

**(B) Ternary vapour-liquid equilibrium.**  31 blocks have all three binary
pairs on file in one model (55 block-model combinations).

| | median | p90 | swapped (negative control) |
|---|---|---|---|
| isobaric bubble temperature | 0.24 K | 0.99 K | 0.68 K |
| isothermal bubble pressure | 0.97 % | 4.5 % | 2.9 % |
| largest vapour mole-fraction error, isobaric | 0.011 | 0.094 | |
| largest vapour mole-fraction error, isothermal | 0.004 | 0.007 | |

Caveat that limits the claim: in 50 of the 55 combinations the ternary comes
from the same article as a binary series in a record's evidence.  The 5
strictly independent ones (3 systems) give 0.35 K and 0.88 %.

**Does the in-sample grade predict the out-of-sample error?**  Not between
`clean` and `warning`; partly for `severe` (`grade_table.tsv`).  Ternary
bubble temperature by the worst pair's grade: clean 0.25 K, warning 0.19 K,
severe 0.45 K.  Bubble pressure shows no separation.  At infinite dilution
the clean records miss by a median factor 2.02 (6 records) and the warning
ones by 1.64 (5 records), both tested out of span and on small samples.

## 2. Method

* **Engine route.**  gamma from `choupoProps activityCoefficients` with the
  solute at zero; bubble T and y from `propertyScan1D` (`T_bubble`,
  `y_eq_<c>`); bubble P as the sum of x gamma Psat with the engine's own
  gamma and Psat (the frame the records were fitted in: ideal-gas vapour).
* **Selection (A).**  9 501 blocks; a compound not in the catalogue removes
  8 803; finite concentration 152; gas-phase 4; 542 accepted.  A point is
  independent when its DOI is not among the record's evidence DOIs.  The
  three Popken UNIQUAC sets were fitted to infinite-dilution data, so
  methylAcetate-water is listed but is NOT independent.
* **Selection (B).**  7 347 three-compound blocks; 5 170 have a compound not
  in the catalogue; 2 122 have no model holding all three pairs; 17 are not
  VLE; 3 are LLE or VLLE; 2 excluded as archive defects (section 5); 31
  accepted.
* **Controls.**  Positive: NRTL ethanol-water (literature set), median factor
  1.08 in span.  Negative: each record's ij and ji parameters swapped; 17 of
  18 records and 40 of 55 ternary combinations get worse (the exceptions are
  near-ideal systems).  Noise floor: the same quantity measured by two
  laboratories, 57 comparisons over 21 systems, mostly alcohols in water.

## 3. Results in detail

Per record and per block: `pairs.tsv`, `ternaries.tsv`, `articles.tsv`.

* Every infinite-dilution row worse than a factor 1.6 is a bubble-temperature
  pipeline record (alpha 0.30, a = 0) of an alcohol with a hydrocarbon or an
  aromatic, tested 45 to 100 K below its span.  Worst: nHeptane + nButanol
  NRTL, factor 2.34.
* For the water pairs the measured activity coefficient at infinite dilution
  RISES with temperature between 273 and 358 K, while a record of the b/T
  form makes it fall.
* Worst ternaries: dimethyl sulfoxide + ethyl acetate + n-propyl acetate
  (NRTL, 5.87 K) and diisopropyl ether + isopropanol +
  N,N-dimethylacetamide (NRTL, 5.02 K); both out of span.

## 4. Findings

None is S1.  Each was reproduced twice by the reviewer and once more by the
commander.  Ledger rows: `docs/reviews/LEDGER.tsv`.

* **PO-01 (S2).**  An activity coefficient at infinite dilution computed
  outside a pair's validity span is published with no announcement: the span
  guard skips a component at exactly zero composition
  (`src/thermo/PairAudit.H`, the `x[s.i] > 0.0 && x[s.j] > 0.0` test, a
  deliberate choice stated in the comment above it).  Reproducer: nButanol +
  nHeptane, NRTL, `activityCoefficients` at 303.15 K, composition {nButanol
  0; nHeptane 1}: gamma 9.4268, nothing announced; with nButanol at 1e-9 the
  same number comes with the `[pair-span]` line (span 349 to 386.85 K).  The
  out-of-span points of this review miss by a median factor 1.80.  The
  comment's reason holds for a flowsheet stream; it does not hold for an
  operation whose SUBJECT is the infinite-dilution value.
* **PO-02 (S2).**  A bubble-point solve announces, with status `accepted`,
  span and vapour-pressure extrapolations made at its STARTING GUESS (the
  mole-weighted boiling point) and not at its answer.  Reproducer: ethanol +
  ethylene glycol + water, NRTL, `propertyScan1D T_bubble` at 101 300 Pa,
  x = (0.078, 0.169, 0.753): the run announces ethanol-water "used at
  T = 387.9 K, above its span (298 373 K)" and three vapour pressures
  extrapolated at 387.9 K, while the published bubble temperature is
  365.34 K, inside every span.  The advisory frame that marks a search's
  intermediate states as `trial` does not cover this solve.
* **PO-03 (S3).**  The three UNIQUAC records from Popken (2000) declare no
  validity span, so no use of them is ever announced at any temperature
  (checked at 500 K).

## 5. Archive defects met (they touch no catalogue record)

* One ternary block has its pressure entered as 10 264.2 kPa at atmospheric
  boiling temperatures (10.1016/j.fluid.2012.12.022, block 12).
* One ternary block of a 2017 article repeats 37 of 42 rows of a 2010
  article under different compounds (10.1021/acs.jced.6b00905 block 17 and
  10.1021/je100776x block 13).
* One block (1-pentanol + isopropanol + n-butanol) looks as if its liquid
  compositions were labelled the wrong way round; not confirmed.

A future tool that reads ternary blocks needs rules for these.

## 6. What this review does NOT show

* Infinite dilution reaches 10 of 558 NRTL, 5 of 220 UNIQUAC and 3 of 524
  Wilson records; 85 of the 142 points are out of span.
* 50 of 55 ternary combinations share a laboratory with a binary in the
  evidence, so the ternary result is mostly a consistency check, not an
  independent validation.
* Not tested: liquid-liquid equilibrium, activity coefficients at finite
  concentration, excess enthalpies, pressures above 110 kPa.
* The ternary bubble points depend on the catalogue's vapour-pressure
  records as well as on the pairs.
* No model is ranked and nothing was re-fitted.

## 7. For the maturity matrix

Proposed evidence rows are in `evidence.tsv`: VERIFIED for the three
activity-model kernels (independent recomputation, `verify_kernels.py`);
VALIDATED, with the limits of section 6, for the records touched (NRTL 80, of
which 17 on strictly independent evidence; UNIQUAC 28, of which 8; Wilson 46,
of which 6).
