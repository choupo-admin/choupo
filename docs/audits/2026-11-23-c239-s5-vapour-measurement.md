# C239 slice S5: the ideal-vapour columns measured against SRK (2026-11-23)

Measurement only.  No tutorial file, no golden and no source file was touched;
every run below was made on a scratch copy outside the repository.  It settles
the question the column vapour audit
([`2026-11-07-column-vapour-audit.md`](2026-11-07-column-vapour-audit.md), §2 and
slice S5) left open for the cases whose vapour is `idealGas`: does the real
vapour move a duty by more than 1 %?  Its output decides S6 (header sentence
only) against S7 (switch the case to SRK).

## Method

* Binary: `choupoSolve` of the primary checkout, built 2026-11-23 14:51, the
  run banner prints commit `250029f1ab` (the primary checkout's `git rev-parse`
  could not be read from a worktree-isolated session; the banner is the
  binary's own statement).  No build was made.  Run with `CHOUPO_HOME` set to
  the primary checkout.
* Each case was copied whole to `/tmp/claude-0/c239s5/{ideal,srk}/<case>/`
  (without touching `expected`, which the solver does not read).  The `ideal`
  copy is the case unmodified: its duties equal the shipped goldens (column01
  `Q_reboiler_kW` 679.408 and acetonePlant C1 `Q_condenser_kW` -989.159 against
  `expected`), so the baseline is the shipped run.
* The one edit to the `srk` copy, in `constant/thermoPhysPropDict`, first
  occurrence only:

  ```
  vapour { fugacityModel idealGas; }   ->   vapour { fugacityModel SRK; }
  ```

  The grammar is the one column19 and column20 ship (`equilibrium { formulation
  gammaPhi; liquid {...} vapour { fugacityModel SRK; } }`); neither declares
  `binaryInteractions`, and the run announces `no binaryInteractions declared --
  all binary pairs run kij = 0`, so the SRK runs here are the undressed cubic,
  as in column19.  Column08's dict (a `phiPhi`-style `fugacityRoute` /
  `caloric` block) is a different, fuller declaration and was NOT copied: the
  audit's S1-S4 cases that are 1-bar gamma-phi use the short form.  In
  acetonePlant only the main `equilibrium` block was edited; the
  `henryAbsorber` variant keeps its `idealGas` (the absorber's own model).
  The full `caloric` block is therefore the default one.
* Binary run once per case and variant, one at a time.  Read from the
  result block of each run: `x_D_LK` and `x_B_HK` (the columns' key
  compositions: light key in the distillate, heavy key in the bottoms), `T_top`
  and `T_bottom` (stage 1 and the reboiler stage), `Q_condenser_kW` and
  `Q_reboiler_kW`, `converged`, the mass, element and energy closures.
  Reflux ratio, stage count, feed and D/B are the case's own and are
  unchanged: the specification is held and the SRK vapour changes the
  separation it produces.

## Result

Duties are compared as magnitudes (the condenser duty is negative).  The
decision column is the larger of the two duty moves.

| case | binary data | x_D key (ideal -> SRK) | x_B key (ideal -> SRK) | T_top K | T_bot K | Q_c kW (ideal -> SRK) | Q_r kW (ideal -> SRK) | |dQ_c| / |dQ_r| % | converged, closures | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| column01_benzene_toluene (R 2, 15 st) | Raoult | benzene 0.95102 -> 0.94096 (-1.06 %; impurity +20.5 %) | toluene 0.95102 -> 0.94096 (-1.06 %) | 355.69 -> 356.14 (+0.45) | 381.51 -> 381.13 (-0.39) | 1315.09 -> 1308.03 | 679.41 -> 675.75 | 0.54 / 0.54 | yes (41 -> 32 iterations); mass 100.000 %, elements 0.0000 %, energy 0 | S6 (0.54 < 1) |
| column03_azeotrope_mesh (16 st) | NRTL | ethanol 0.81003 -> 0.80787 (-0.27 %) | water 0.87001 -> 0.86929 (-0.08 %) | 351.44 -> 351.42 (-0.01) | 357.99 -> 358.00 (+0.01) | 996.58 -> 992.51 | 1000.33 -> 996.26 | 0.41 / 0.41 | yes (4 -> 4); mass 100.000 %, elements 0.0000 %, energy 0 | S6 (0.41 < 1) |
| column17_exchanger_design | Raoult | as column01 (same column) | as column01 | 355.69 -> 356.14 | 381.51 -> 381.13 | 1315.09 -> 1308.03 | 679.41 -> 675.75 | 0.54 / 0.54 | yes; closures as column01 | S6 (0.54 < 1) |
| column18_partial_condenser | Raoult | benzene 0.95102 -> 0.94096 (-1.06 %) | toluene 0.95102 -> 0.94096 (-1.06 %) | 355.69 -> 356.14 | 381.51 -> 381.13 | 888.42 -> 884.70 | 691.10 -> 688.43 | 0.42 / 0.39 | yes (41 -> 32); closures as column01 | S6 (0.42 < 1) |
| acetone06_luyben_column_C1 (66 st, R 2.78) | UNIFAC | acetone 0.97358 -> 0.97280 (-0.08 %); water 0.02642 -> 0.02720 (+3 %) | water 0.88402 -> 0.88339 (-0.07 %) | 329.38 -> 329.37 (-0.01) | 353.83 -> 353.80 (-0.03) | 1008.11 -> 1001.17 | 1041.06 -> 1034.10 | 0.69 / 0.67 | yes (18 -> 19); mass 100.000 %, elements 0.0000 %, energy 1e-13 % | S6 (0.69 < 1) |
| acetonePlant, unit C1 (whole plant run) | UNIFAC | acetone 0.97255 -> 0.97106 (-0.15 %); H2 0.00108 -> 0.00182 | water 0.89946 -> 0.89981 (+0.04 %) | 329.35 -> 329.32 (-0.03) | 354.05 -> 354.15 (+0.10) | 989.16 -> 978.32 | 987.38 -> 976.06 | 1.10 / 1.15 | yes (20 -> 21; recycle converged); mass 100.000 %, elements 0.0000 %, energy residual 0.233 % -> 0.238 % | rule triggered by the letter, see below |

Notes on the table:

* `x_D_LK` and `x_B_HK` in the acetone cases are the KPI's light key in the
  distillate and heavy key in the bottoms (isopropanol and water,
  respectively); the isopropanol in the distillate is 5e-10 -> 1.7e-9, a trace
  that triples and is meaningless to the product.  The table gives the
  product's acetone and water instead, from the stream table.
* column17 is column01's column plus the exchanger design: the separation and
  duties are identical, so the same 0.54 %.  The audit's expectation that
  column17/18 were "the candidates" because they price the condenser duty
  directly is not borne out: both are under 1 %.
* The distillate stream temperature (354.25 -> 354.47 K in column01) is the
  condenser outlet; `T_top` above is stage 1.

## Verdicts

Rule (audit §2): S7 is triggered for a case when a duty moves by more than 1 %.

* **column01, column03, column17, column18, acetone06: S6, the header
  sentence only.**  The deciding numbers are 0.54, 0.41, 0.54, 0.42 and 0.69 %
  (the larger duty of each).  No temperature moves by more than 0.45 K.  Every
  SRK run converged, with mass, element and energy closures unchanged.
* **acetonePlant C1: the rule fires by its letter (|Q_r| -1.15 %, |Q_c| -1.10 %)
  and S7 is triggered for that case, but the number is not the column's
  vapour alone.**  The whole plant ran on SRK, so C1's feed changed: the hydrogen
  K in the flash (K_H2 287 -> 175) and the vent moved the recycle, F1 carries
  H2 0.00188 -> 0.00307 and the distillate rate fell 0.72 % on the recovery
  specification (`recovery_acetone` held at 0.970).  Normalised by the column
  feed rate the duties move 0.74 % (Q_c) and 0.79 % (Q_r); per mole of
  distillate 0.38 % and 0.43 %.  The standalone C1 of acetone06 on its own feed
  moves 0.69 %.  Read: the column's own vapour effect is under 1 %, the 1.1 %
  is the plant-wide effect of changing a vapour model on the flash drum and
  recycle.  Applying the rule as written means S7 for acetonePlant; the
  architect decides whether a plant whose figure is dominated by the
  non-column units belongs to S7 or to the plant's own slice.
* The audit's S7 candidate list (column17/18/heatlink) is empty on this
  evidence, except for the plant.  heatlink01/02 were not measured here (not
  in the S5 list); they run column01's package, so their column duties would be
  expected to move as column01's 0.5 %.

## One thing the measurement found beyond the rule

The key compositions move more than the duties on the benzene/toluene column:
at fixed reflux ratio and stage count the SRK vapour lowers the purity of both
products by 1.06 % relative (0.951 -> 0.941; the impurity rises by 20.5 %).
That is larger than any duty move and is the effect an S6 header sentence on the
1-atm family should state: "ideal vapour: the products' purity at the same
reflux and stages is about 1 point high against SRK, duties about 0.5 %".  The
audit's phrase "alpha shifts ~1.5 %, cancels in K" holds for the temperature
profile and the duties (T_top +0.45 K at most) but the staging is sensitive to it
in column01's high-purity regime.  Not acted on here.

## The IPA record

The audit's open question (acetone06/07: Joback 525.94 / 50.586 / 0.571 versus
a refuter's ChemSep 508.3 / 47.62 / 0.665) is settled by reading the case-local
file: `tutorials/steady/distillation/acetone06_luyben_column_C1/constant/components/isopropanol.dat`
is a GROUP-ESTIMATE record, header "UNVERIFIED", `Tc 525.94; Pc 50.586; omega
0.5711; Tb 359.98` all `[origin=predictive method=joback]` /
`lee-kesler`, vapour pressure `AmbroseWalton` from those, liquid Cp
`RowlinsonBondi`, `variationOf isopropanol`.  It shadows the catalogue record
(`data/standards/components/isopropanol.dat`: ChemSep v8.3, Tc 508.3, Pc 47.62,
omega 0.665, Tb 355.39).  `tutorials/plant/acetonePlant/constant/components/isopropanol.dat`
carries the same Joback numbers.  So the finding was right for the cases as
shipped and the refuter's numbers are the catalogue's, not what runs.  Effect
under SRK: isopropanol is 5 mol % of the C1 feed, all of it leaves in the
bottoms, and the measured duty move is 0.69 % with this record; the Tc 17 K
and omega 0.09 difference to the catalogue was not separately run (a swap of
the record would change the golden, which this slice does not do).

## What did not converge or surprised

* Nothing failed to converge; every run exited 0 and reports `converged true`.
  SRK made column01/17/18 converge in fewer Wang-Henke iterations (41 -> 32),
  acetone06 and the plant in one more.
* acetonePlant's global energy residual is 0.23 % on both vapours (11.2 kW
  ideal, 11.4 kW SRK): pre-existing, not introduced here, and not part of this
  slice.
* acetonePlant SRK took 31 s against 2.4 s ideal.
* No pseudo-root or critical-point warning appeared in any SRK log; the only
  announcement the vapour change added is the kij = 0 line.

Scratch outputs (logs and case copies) are in `/tmp/claude-0/c239s5/` and are
not in the repository.
