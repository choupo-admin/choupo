# Review by measurement: a closure of 41 246 936 for a species the bed never held

Date: 2026-11-13.  Subject: the coordinator's item CI-00.  On the hosted
runner (run 43394009239, job `full`, branch `ci/green` at 211bc365ec)
`batch25_blowdown_thermal` published `kpi bed mass_closure_CO2` =
41246936.3538 where the golden holds 0.  Findings: `findings.tsv`
(CI-00a .. CI-00d).  Every local number below was produced twice,
byte-identically, by `probe.sh` on a native build of 560a955bab, whose
`FixedBedAdsorber.cpp`, `src/solver/` and `choupoBatch/main.cpp` are
identical to main at dd8b08bf51 (`git diff --stat`, empty).

## 1. The formula

`FixedBedAdsorber.cpp:3237-3239` (the KPI) and `:3096-3102` (the same
expression again, for the trajectory column):

    mass_closure_<species> = |mIn + hold0 - holdup - mOut|
                             / max(mIn + hold0, 1e-30)

The case is a pure helium bed.  It declares no carbon dioxide in the feed
or in the initial gas, and a zero rate constant for it, so `mIn + hold0`
is exactly 0 and the denominator is the floor.  The runner's number is
therefore a residual of 41246936.3538 x 1e-30 = 4.12e-23 mol of carbon
dioxide, divided by 1e-30.

That residual is small against every scale the unit itself declares.  By
the unit's own tolerance formulas (`:763-769`, evaluated by hand here, not
printed by the run): the absolute tolerance on this species' gas
concentration is 1e-9 x 1e-3 x c_total = 4.0e-11 mol/m3, which is
8.1e-14 mol over the bed's gas volume; the tolerance on its two ledger rows
is about 1.2e-8 mol if the span in that formula is the run's 600 s.

## 2. What the runner's log says

- The runner compiles with g++ 15.2.0 against glibc 2.43; the goldens were
  recorded with g++ 13.3.0 against glibc 2.39 (the log's own
  `[golden bands]` line).
- Only that one row of the case failed there.  The rows `n_CO2_final` and
  `qbar_CO2_final` (golden 0) passed, because a golden of 0 is compared
  absolutely at 1e-4.
- The campaign-ledger gate failed on the same case: the run published
  `material.external.dn.CO2` for `bed->(external_boundary)`.  So on the
  runner carbon dioxide left through the outlet.

## 3. Reproduced locally

Nothing here reproduced the runner's value by changing inputs: 23
perturbed values of T, u and Dax, and five settings of the C library's
processor-specific math variants, all publish exactly 0.

It is reproduced by imitating another math library.  `ulp_shim.c` is a
preload library that moves every N-th result of one function by one unit
in the last place.  The run calls `pow` 980 993 times and `exp` 49 352
times.  `perturbation_table.tsv`, in short:

| every N-th `pow` moved | exit | `mass_closure_CO2` | residual (mol) | campaign element closure (C, O) |
|---|---|---|---|---|
| none | 0 | 0 | 0 | not published |
| 1 or 2 (every call, or every second) | 0 | 0 | 0 | not published |
| 3 | **1** | 7.03e11 | 7.0e-19 | 7.0e-7, **1.4e-6** |
| 7 | 0 | 9.64e10 | 9.6e-20 | 9.6e-8, 1.9e-7 |
| 101 | 0 | 6.37e10 | 6.4e-20 | 6.4e-8, 1.3e-7 |
| 1009 | 0 | 2.31e10 | 2.3e-20 | 2.3e-8, 4.6e-8 |
| 10007 | 0 | 7.79e5 | 7.8e-25 | 7.8e-13, 1.6e-12 |
| 99991 or 500009 | 0 | 0 | 0 | not published |

Moving `exp` (four patterns) changes nothing.

So one last bit, in some of the `pow` results, is enough for the bed to
hold carbon dioxide at round-off level, and the KPI then publishes
between 8e5 and 7e11.  The runner's 4.1e7 is inside that range.

## 4. The run that fails

With every third `pow` moved the run exits 1 and prints
`worst element 1.405314e-06  <-- LEAK: reported NON-CONVERGED`.  The
campaign's element closure (`choupoBatch/main.cpp:1844-1845`) is

    r = |aF - a0| / max({ a0, aF, 1e-15 })        (amounts in kmol)

Carbon and oxygen enter the balance only through the round-off carbon
dioxide (the test `present == 0.0` at `:1817` no longer skips it), their
totals are below the floor, and 7.0e-19 mol of carbon dioxide reads as
1.4e-6 for oxygen, above the tolerance of 1e-6 (`:1886`).  A correct
run is then reported as not converged.  This was NOT observed on the
runner; it is one of the nine local patterns.

## 5. The mechanism, as far as it was established

- The pressure-driven bed integrates every component as a state
  (`:1609-1712`).  For a species at exactly zero with a zero feed every
  term of its own rows is exactly zero, on any platform.
- The unit's own comment (`:696-701`) says how such a species still
  moves: the integrator's linear solve pivots by magnitude, and a row
  that out-pivots a zero species' row mixes round-off into it.  The energy
  rows were scaled on 2026-11-09 so that this does not happen on the
  recording platform.
- Established here: the outcome depends on single last bits of `pow`.
  NOT established: which pivot changes, and whether the runner's
  difference comes from its math library or from its compiler.

## 6. What the engine should publish

Three candidates, in the order this review would take them.  The choice
is the coordinator's and the owner's.

1. **No ratio where there is no scale.**  The project's rule of
   2026-09-08 for the energy boundary is "the numerical floor is not a
   scale; absent a scale the absolute number stands and the ratio is
   unavailable".  Applied here: when the species has no material in play
   by declaration (the test the unit already makes at `:3199`:
   `cIn_[a] > 0.0 || feedSwitched_[a]`, with `hold0_[a] > 0`), publish no
   `mass_closure_<species>`, in the KPI and in the trajectory column, and
   publish the residual in mol.  The golden row
   `kpi bed mass_closure_CO2 0` of batch25 would then be removed.
2. **The same for the campaign's element closure.**  An element whose
   total is below the floor has no relative closure; its absolute
   residual can be printed, and it should not decide the verdict.
3. **Remove the source.**  A species the case never feeds and never holds
   has the exact solution zero.  If its rows are not integrated, or are
   held at zero and the run says so once, both ratios stop meeting
   round-off for this reason, and the campaign's `present == 0.0` test
   means what it was written to mean.  A recipe that later feeds the
   species must still work (`feedSwitched_`).

Candidate 3 alone would make this case stable and leave two floors in
place that act as scales; candidates 1 and 2 alone would leave the bed
exporting round-off of a species it does not contain, which the
campaign-ledger gate reads as a new published quantity.

## 7. What was NOT done

- No engine change.  No golden touched.
- The runner was not reproduced bit for bit, and its compiler was not
  used here.
- The other fixed-bed cases were not probed with the shim.
- `:3181` forms `carrier_makeup_rel` the same way
  (`/ max(fedTot, 1e-30)`); it was not exercised.  29 expressions under
  `src/` divide by `std::max(<quantity>, 1e-30)`; they were counted, not
  classified.
