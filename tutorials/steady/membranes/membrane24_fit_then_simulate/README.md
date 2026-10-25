# membrane24 -- fit the membrane, then simulate the stage, in ONE case

**The question.** A researcher has measured the rejections of his membrane
in the laboratory.  Can he fit a pore model to them, judge the fit against
data it never saw, and then use the fitted membrane in a process -- without
the data, the fit and the process drifting apart?

**Two modes, one case.** This case carries BOTH a `system/propsDict`
(Properties & data mode) and a `system/flowsheetDict` (Process mode) over
one `constant/`:

    runCase tutorials/steady/membranes/membrane24_fit_then_simulate props   # the fit
    runCase tutorials/steady/membranes/membrane24_fit_then_simulate         # the stage

**The fit.** NF270's DSPM-DE pore -- its radius r_p and fixed charge X_d --
fitted to Fernandez de Labastida & Yaroshchuk's (Membranes 11 (2021) 272,
CC BY 4.0) measured intrinsic rejections of NaCl and MgCl2; Na2SO4 and MgSO4
held out.  Result: r_p = 0.675 +- 0.034 nm, X_d = -10.5 +- 4.1 mol/m3,
held-out AAD 0.93 points of rejection, verdict **validated** against a band
of 10 points declared before the fit.  Read the propsDict header for how
the partition was chosen: other partitions were measured first and do NOT
identify the pore, and the sulfates are an easy test.

**The record.** The fit writes `constant/assets/NF270_FdL2021.dat`: the
fitted values, their uncertainty, the verdict, and the fingerprints of the
datasets, of the fit block and of the base record.

**The stage.** One vessel of three generic 8-inch elements reads that
record.  It first CHECKS the fingerprints: change one measured rejection in
`constant/experimental/`, and the stage refuses to run, naming the dataset
and telling you to run the Properties mode again -- a stale fit is never
used in silence.
