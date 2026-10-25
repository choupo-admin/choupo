# membrane24 -- fit the membrane, then simulate the stage, in ONE case

**The question.** A researcher has measured the rejections of his membrane
in the laboratory.  Can he fit a pore model to them, judge the fit against
data it never saw, and then use the fitted membrane in a process -- without
the data, the fit and the process drifting apart?

**This case is the template for that.**  Copy it, replace the measured
files with yours, and run it.  The section "Use it with your own data"
below says which file is which.  The page that explains the models, what
goes in and what comes out is `docs/ai/membrane-research.md`.

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

In the browser (www.choupo.org/app, "Browse tutorials" -> steady ->
membranes) the switch "Process | Properties & data" beside the menus is the
same choice.  In Properties & data the view's own **Run properties** button
runs the fit; in Process the top **Run** runs the stage.

---

## Use it with your own data -- step by step

**0. Get your own copy.**  In the browser: *File -> Download case (.zip)*,
unzip, edit the files with any text editor, zip the folder again and open
it with *File -> Open Case from .zip* (or *Open Case folder*).  On a
machine with Choupo built: copy the directory.

**Where the browser stops today (DEV.md 4c C157, measured on the live site
2026-10-25).**  The download, the edit, the re-opening, the Process-mode
refusal of the stale fit and the re-fit in Properties & data all work in
the browser, and the re-fit prints its parameters and its verdict.  But the
record the re-fit WRITES is not yet carried back into the opened case, so
the Process mode goes on refusing it as stale.  To run the stage on YOUR
fit, run the two modes with a local build (`runCase <case> props`, then
`runCase <case>`).

**1. Your measurements: one file per series in `constant/experimental/`.**
A series is one feed (one composition, one temperature) measured at several
operating points.  Replace the four `fdl2021_*.dat` files with yours, in the
same grammar -- copy one of them and change it:

    property     membrane.rejection;
    membrane     NF270;                       // a label for the reader
    provenance { source measured; citation "..."; licence ...; }   // yours
    T            293.15 K;                    // or a `T` column
    feed         { NaCl 10 mol/m3; }          // or `c_<component>` columns, mol/m3
    columns      ( { name Jv; unit m/s; } { name R_NaCl; unit -; } );
    data         ( 8.239e-06 0.431139  ... );

* Each ROW is one operating point.  It IMPOSES either the permeate flux
  (`Jv`, m/s -- honoured by DSPM-DE only) or the transmembrane pressure
  (`dP`, then the law closes J_v = A_w (dP - dpi), and you may add a
  measured flux column `Jv_measured`, m/s).
* Measured columns: `R_<x>`, a rejection as a FRACTION (0.43, not 43 %), of a
  feed component (`R_NaCl`) or of an ion the law reports (`R_Na`, `R_SO4`
  under DSPM-DE).  An optional `sigma_<column>` gives the per-point
  uncertainty, read under `weighting sigma;`.
* A column the fit does not read is REFUSED by name -- an ignored column is
  a measurement you would believe was fitted.
* Intrinsic or observed: these data are intrinsic (the authors corrected
  them for polarisation), so the fit sets `rejection intrinsic;` and no film
  (`k_film 10`).  If yours are OBSERVED rejections, set `rejection observed;`
  and declare the film your cell gives (`k_film <m/s>` or a `massTransfer {}`
  block, as the units read it).

**2. Your solutes must have records.**  This case is SEALED (its
`constant/propertyManifest` says `sealed true;`): it runs only from the
records in its own `constant/`.  A salt that is not already in
`constant/components/` needs its component record there, and each of its
ions its species record in `constant/species/` -- copy them from
`data/standards/components/` and `data/standards/species/`.  DSPM-DE needs
every ion's `radius` and `D0`: today the hydrated radius is curated for Na,
K, Ca, Mg, H, OH, Cl and SO4 only, and D0 for those and for the common
water-treatment ions (NO3, HCO3, CO3, F, Br, NH4, Li, Sr, Ba, the
phosphates, FeII, MnII).  An ion without the datum is refused by name.

**3. Which series fit and which judge: `system/propsDict`, `evidence`.**
Each dataset is listed with `role fit;` or `role validation;`.  Decide the
partition BEFORE you look at the result, and keep at least one series out of
the fit: the held-out series is the only evidence that the fitted membrane
predicts something it was not tuned to.

**4. What is fitted, and the band: `parameters`, `acceptance`.**
`parameters` lists the free values as paths into the base record
(`poreModel.poreRadius`, `poreModel.chargeDensity`,
`poreModel.porosityOverThickness`, `poreModel.poreDielectric`, `A_w`,
`permeabilities.<solute>`) with an initial value and bounds in the field's
own SI convention; everything not listed keeps the base record's value.
`acceptance { maxAAD 10 percent; origin "..."; }` is the band the held-out
series must meet, in points of rejection, declared before the fit.

**5. The base record and the record the fit writes.**  `residual {
membrane NF270_dspmde; }` names the BASE record in `constant/assets/` --
the fixed values.  Use your membrane's record (copy
`constant/assets/NF270_dspmde.dat`, rename it, change `name`).
`output { record "constant/assets/NF270_FdL2021.dat"; }` is the file the
fit WRITES; rename it for your membrane.

**6. Run Properties mode.**  Read in the log (and in the Props view): the
fitted values with their 95 % half-widths, the parameter correlations and
the condition number (identifiability), the held-out AAD and the verdict.

**7. The unit that reads the record: `system/flowsheetDict`.**  The
`spiralWoundModule` `Stage` names the record by `membrane NF270_FdL2021;`
-- change it to your record's name -- and runs the same law
(`transport DSPM-DE;`).  Set your process there: the feed in `0/feed`, the
module (`module Generic-8040;`, a record in `constant/assets/`), elements,
vessels, pressures.

**8. Run Process mode.**  The stage announces the record as `[fitted]` with
its verdict.  Change any dataset, the fit block or the base record, and it
refuses until you re-fit (step 6).  Not fingerprinted: the ion radii and
D0 of `constant/species/` -- a change there does not make the record
stale, so re-fit yourself after one.

## What the verdict means

| verdict | meaning |
|---|---|
| `validated` | the held-out series were predicted within the band you declared |
| `notValidated` | they were not: the fitted membrane does not predict them within the band |
| `heldOutPerformed` | series were held out but no band was declared, so nothing was judged |
| `validationRefused` | nothing was held out (or the held-out pass could not run): no claim |
| `notClaimed` | the evidence carries no fit/validation partition |

A parameter that ends ON a bound is named as unidentifiable and the record
is refused.  `validated` means *within your band on your held-out series* --
not that the membrane is right outside the conditions you measured.  This
case's own band (10 points) is an engineering criterion for a teaching
characterisation, not a measurement uncertainty.
