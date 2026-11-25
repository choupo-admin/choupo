# Robustness of the steady corpus to moved feeds (2026-11-25)

What was run: the 316 steady cases (of 384) whose feed states the proofs tool can read, on a build
of the batch of 2026-11-25 (d5a72c0e59, before the landing), each with its FEEDS moved as a student
would move them, one change at a time: flow x0.8 and x1.25, T -10 K and +10 K, P x0.9 and x1.1, the
first component x1.1 and x0.7.  2844 rows: 316 unchanged base runs, 66 where the change did not apply
(a feed given by phases), 2462 moved.  Judged on the exit code and the published streams: a crash (signal), a result
with a non-finite, negative or impossible number at exit 0 (the mass, element and energy
closures of each run are the engine's own guard: a broken one exits 1), an exit without a reason.

Result: 0 crashes, 0 impossible results, 0 exits without a reason.  The table below is
the count; a REFUSED run printed an ERROR line; NOTCONV ended with the engine's own not-converged
verdict and exit 1.  The 300 s cap was hit by greenAmmonia03 (its own base run was over it too while
the machine was loaded and paused) and by the PEQ once; neither is a finding by itself.

pert	NOCHANGE	NOTCONV	OK	REFUSED	TIMEOUT
base	0	0	313	0	3
F080	0	6	301	7	2
F125	0	4	304	5	3
Tm10	0	1	283	30	2
Tp10	0	5	287	20	4
P090	0	1	310	2	3
P110	0	1	311	1	3
x1p10	33	1	273	7	2
x1m30	33	9	257	14	3

Not converged, by case and change:

- acetone06_luyben_column_C1 (F080)
- column08_radfrac_multidraw (F080)
- column22_wide_boiling_retry (F080)
- membrane21_two_stage_nf_array (F080)
- optim06_integer_stages (F080)
- optim07_mads_mixed_column (F080)
- circuit01_herbstFuerstenau_closedCircuit (F125)
- column20_mtbe_kinetic_mesh (F125)
- column21_design_curve_ethanol_water (F125)
- membrane22_two_stage_nf_array_dspmde (F125)
- membrane22_two_stage_nf_array_dspmde (P090)
- membrane18_nf_feed_and_bleed (P110)
- membrane22_two_stage_nf_array_dspmde (Tm10)
- evaporator05_counter_current (Tp10)
- membrane22_two_stage_nf_array_dspmde (Tp10)
- optim04_membrane_recovery_scaling (Tp10)
- optim08_bayesian_membrane (Tp10)
- stripper02_sour_water_h2s (Tp10)
- acetone06_luyben_column_C1 (x1m30)
- column21_design_curve_ethanol_water (x1m30)
- designSpec01_triple_equal_areas (x1m30)
- membrane21_two_stage_nf_array (x1m30)
- optim04_membrane_recovery_scaling (x1m30)
- optim06_integer_stages (x1m30)
- optim07_mads_mixed_column (x1m30)
- optim08_bayesian_membrane (x1m30)
- pfr05_cooled_multitubular (x1m30)
- membrane22_two_stage_nf_array_dspmde (x1p10)

NOT checked: correctness of any number; a case with no readable feed (68); batch, dynamic and control cases; changes of more than one feed at a time; changes larger than the ones named. NOT checked either: whether an outlet is hotter or colder than the stream that heats or cools it, whether a phase runs out, the second law, or any move of the geometry -- external review 5 (C531) found such answers at exit 0 the same day.
