# Review by reading: the 32 divisions by a floored quantity (CI-00d)

Date: 2026-11-14.  The ratchet `bin/curate/check_floor_scale_ratchet.py`
(on `fix/absent-species-closure`, in the fifth batch) counts 32 sites in
20 files where a quantity is divided by `std::max(x, <literal <=
1e-12>)`, and pins the count without classifying them.  Classified here
by reading only; no file modified, nothing run.  The site list
(`sites.tsv`, 31 single-line sites) was produced with the gate's own
scanner (`list_floored_divisions.py`); the 32nd is the brace form in
`src/dynamicDriver/DynamicDriver.cpp`, read by hand with its two
siblings.

The question per site: (1) can the denominator be EXACTLY zero in a real
case; (2) is the ratio published (KPI, result JSON, golden row) or does
it decide something (convergence, a refusal, a stop); (3) printed or
internal only.

## 1. Verdict

No site was found that publishes an absurd number on a case in the tree
today.  Two are of CI-00's class and latent; six decide something and
can be misled by a true zero; the rest are internal numerics or a
printed percentage whose numerator is zero whenever its denominator is.

## 2. Latent, of CI-00's class (published; the denominator can be exactly zero)

| site | what it publishes | when the denominator is zero | today |
|---|---|---|---|
| `src/unitOperations/batch/FixedBedAdsorber.cpp:3284` | KPI `carrier_makeup_rel` = carrier fabricated / carrier fed | a bed with no flow over the run (`uIntegral` 0) | 17 goldens pin it; every one has flow (values from 3.7e-46 to 0.108); the CI-00 report already named it |
| `src/dynamicDriver/DynamicDriver.cpp:2131` (and the mass and energy siblings near `:2060`, `:2156`) | `element_<X>_closure_rel` and `element_worst_closure_rel` in the time-integrated drivers' balance block | an element present nowhere at start or end, with round-off in the ledger | choupoBatch's campaign closure was fixed by CI-00 (the exact `present == 0.0` test decides); the CI-00 builder reported this copy as still floored, with no verdict depending on it |

Both want CI-00's rule: no ratio where there is no scale; the absolute
residual published instead.

## 3. Decides something, and a true zero can mislead it

| site | decision | what a zero does |
|---|---|---|
| `src/applications/choupoBatch/main.cpp:1254` | the cyclic-steady-state norm: the `untilCSS` stop and the reported verdict | a unit whose state is exactly zero at one boundary and round-off at the next reads as a large change, so the campaign does not stop early (it runs to its cycle count) |
| `src/unitOperations/dynamic/DynamicCSTR.cpp:656` | the steady-state test (floor 1e-12 on each amount) | an absent species with round-off of order 1e-11 keeps the vessel from being declared steady |
| `src/propertyOps/FitParameters.cpp:1031`, `:2133`; `FitParametersMembrane.cpp:866` | the relative-improvement stop of the fits | a fit to exact synthetic data drives chi2 to zero and the relative test cannot be met; the fit stops on its other criteria |
| `src/unitOperations/separation/Extractor.cpp:623` | the column's closure test | zero only with no throughput (a degenerate case) |
| `src/thermo/electrolyte/PitzerHMW.cpp:903`, `:914` | the self-check gate (`verify` returns the larger deviation) | the deviation is round-off over ln gamma (floor 1e-12); a salt whose ln gamma is near zero at a tested molality would read as a large deviation |
| `src/unitOperations/batch/BatchAdsorber.cpp:327` | a declared pressure against the computed one | a vacuum start declared as a small pressure is refused; that is the intended reading |

None of these was measured; each needs a case built to show it, which is
the coordinator's to run if it judges any worth a row.

## 4. Printed only, harmless

`ReactiveVLE.cpp:1333`, `:2154` (the organic share printed; numerator
zero whenever the denominator is), `:1883` (a printed vaporised
fraction), `DistillationColumn.cpp:4479` (a printed conversion; the KPI
beside it is guarded).

## 5. Internal numerics, harmless

`VapourAssociation.H:156`; `ReactiveVLE.cpp:1638`, `:1731` (the floor
cancels), `:2026` (a published ratio over the feed, zero only with no
feed); `Crystalliser.cpp:625` (zero size gives a zero numerator);
`DistillationColumn.cpp:3170`; `IsothermalFlash.cpp:1058` (a reference
fugacity underflowing to zero is approximated by 1e-30 inside a log);
`LiquidLiquidSplit.H:283`, `:318` and `GibbsMethod.cpp:592` (floors on
activity coefficients); `SprayDryer.cpp:1364` (a percentile
interpolation, bounded); `htc/Kern.H:98` (a published constant);
`EquilibriumReactor.cpp:562` (a scaling); `PFR.cpp:916`, `:1015` (zero
only with no flow); `Extractor.cpp:723` (zero only with no feed),
`:797` (a shortcut partition ratio; zero raffinate solute is a complete
extraction).

## 6. What was NOT done

Nothing was run.  The six of section 3 were not reproduced.
