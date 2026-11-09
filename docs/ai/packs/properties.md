# Pack: properties -- a component or a binary pair Choupo does not have

budget: 1500 words (~2400 tokens)

Read this pack when the design needs a component, a binary pair or a vapour
pressure that the catalogue lacks, or when the student gives you measured
data. Choupo's catalogue is SMALL ON PURPOSE: each record is a number somebody
measured and checked, with its source. Most pairs are missing and that is
normal. Binary: `choupoProps` (a case with `application choupoProps;` and
`system/propsDict`). The regression is done by Choupo's engine, never by you:
you only PREPARE the case. Grammar sources: `docs/ai/patterns.md` section 4 (fit)
and section 13 (estimate); worked case `tutorials/props/curation/curate04_nrtl_methanol_water`.

## 1. The order, always

1. LOOK: what does Choupo have? `componentLookup` (one component, by name or CAS)
   and `pairLookup` (a pair) print an evidence card: curated, regressed, estimate or
   none. Examples: `tutorials/props/molecular/componentLookup01_catalogue_ladder`,
   `pairLookup01_catalogue_ladder`.
   ```
   { name p1; type pairLookup;  components ( acetone cyclohexane ); }
   { name c1; type componentLookup; component ethanol; }
   ```
2. If the student gave measured data (a table, a paper), FIT it (section 3). If the
   data are already in the conversation, do NOT ask for them again.
3. No data: a labelled ESTIMATE. A pair: `activityModel { model UNIFAC; }`, and say
   to the student it is an estimate from group contributions. A component:
   `estimateComponent` from its groups (patterns.md section 13), flagged an estimate.
4. Never a number from memory, never a database value without a licence. "I do not
   know it" is an answer.

## 2. What the student must bring

For a binary pair: a table of liquid mole fraction x, temperature T and, if the paper
has it, vapour mole fraction y, at one stated pressure (or several), with the
citation. A second table from ANOTHER article or run, kept apart, is the held-out
set: it is how Choupo tells the student whether the pair predicts or only fits.
Without a held-out set the verdict is `validationRefused`, which is honest, not a
failure. Interior points only: the two pure-component end points measure the vapour
pressure record, not the pair.

## 3. The minimum fit case

Layout (a plain case folder, `application choupoProps;` in `system/controlDict`):

```
system/controlDict   system/propsDict   constant/thermoPhysPropDict
constant/experiments/<A>-<B>-fit.dat   constant/experiments/<A>-<B>-heldout.dat
```

Dataset file (one per set; `curate04`'s `constant/experiments/*.dat` are the model):

```
property     binaryVLE.T_bubble;
system       ( methanol water );
pressure     101.32 kPa;
provenance { source measured; citation "Author (year). Journal. doi:..."; doi "..."; }
columns ( { name x[methanol]; unit -; } { name T_bubble; unit K; } { name y_eq_methanol; unit -; } );
data ( 0.10 360.15 0.439   0.34 350.12 0.687   0.59 344.58 0.836 );
```

`x[<first component>]` is the liquid mole fraction of the FIRST component of
`system`; keep the order identical everywhere. The role (fit or validation) is NOT
in the file: the operation declares it.

`constant/thermoPhysPropDict`: the package of the two components (`components ( A B );`,
`equilibrium { formulation gammaPhi; liquid { activityModel { model NRTL;
binaryParameters { A-B { i A; j B; a_ij 0; b_ij 0; a_ji 0; b_ji 0; alpha 0.30; } } }
standardState pureLiquid; } vapour { fugacityModel idealGas; } }`), exactly as in
curate04. Starting values: ZERO (ideal mixing) or a stated placeholder, never a
guessed "typical" value. (A flash run on a typed guess prints `[unreviewed] pair`:
the engine announces every pair no one reviewed.)

`system/propsDict`, skeleton:

```
operations
(
    {
        name fit_nrtl;  type fitParameters;
        parameters
        (
            { path equilibrium.liquid.activityModel.binaryParameters.A-B.b_ij; initial 0; min -3000; max 3000; }
            { path equilibrium.liquid.activityModel.binaryParameters.A-B.b_ji; initial 0; min -3000; max 3000; }
        );
        evidence
        (
            { dataset "constant/experiments/A-B-fit.dat";     role fit; }
            { dataset "constant/experiments/A-B-heldout.dat"; role validation; }
        );
        acceptance { maxAAD 0.5 percent; origin "declared BEFORE the fit: why this band"; }
        residual   { kind T_bubble; components ( A B ); weighting uncertainty; }
        options    { maxIter 80; tolerance 1.0e-8; fdStep 1.0e-4; lambda0 1.0e-3; }
        output     { fit_log fit_history.csv; parity parity.csv; proposal A-B.proposal.dat; }
    }
);
```

* `weighting uncertainty;` needs a per-point `uncertainty` block in the dataset
  (curate04 has one); without uncertainties use the unweighted default and say so.
* Two parameters (`b_ij`, `b_ji`, with `a_ij = a_ji = 0`) are what bubble
  temperatures over a modest range identify. Freeing four makes the engine say
  `NOT individually identifiable`: read that line to the student.
* The `acceptance` band is chosen BEFORE running, with its reason; do not tune it
  after the verdict. Ask the student, or state your rule.

RESULT: the run prints the fitted values and a VERDICT; the fitted pair is written as a
`proposal` record, at the path named in `proposal` inside the case (`proposal auto;`
writes `constant/parameters/NRTL/<A>-<B>.fit-<date>.dat`). To use it, copy its values
into the project's own `binaryParameters` (the flash then announces
`[unreviewed] pair`: that is correct, a human has not reviewed it) and keep the
dataset citation in DESIGN.md. The engine refuses to write under `data/standards/`.

The student opens the fitting case in the app (File, Open Case from .zip) and runs it;
you cannot run it for them. If you could not run it, say what you expect to see.

## 4. What the verdict means (one line each)

* `validated`: held-out points were predicted inside the band declared before the fit.
* `notValidated`: the held-out test was done and the band was missed: a result, not an error.
* `validationRefused`: no independent evidence remained, so the fit is in-sample only.
* (`heldOutPerformed`: held-out points tested but no band declared: no pass/fail claim.)

`validated` means inside the declared band, never "best model".

## 5. Check the data and the phases

* `vleConsistency` (Herington area test and Gibbs-Duhem residual on x-y-T data) tells
  whether the DATA are thermodynamically consistent before anyone fits them:
  `{ name c1; type vleConsistency; component A; partner B; state { P 1.01325 bar; }
  dataset "constant/experiments/A-B-fit.dat"; output { file consistency.csv; } }`.
* `hConsistency` is not a data test: it checks that Choupo's own enthalpy surface obeys
  its identities for named components (`tutorials/props/thermoTest/h_surface_identity`).
* THE PHASE-SPLIT WARNING. A pair can validate on bubble temperatures and still
  predict TWO liquids. Then a VLE flash REFUSES. That is the model telling the truth
  about the pair, not a failure: say so to the student. Check stability with a
  phase-split scan (`type phaseSplitScan;`, example
  `tutorials/props/thermo/phaseSplit01_freeze_water_ethanol`) or an LLE flash, and
  if the system is partially miscible, ask for LLE data (tie lines) and fit with
  `kind T_bubble+LLE` (patterns.md section 4; witness
  `tutorials/props/curation/curate13_synthetic_lle_butanol_water`).

## 6. Other fits

`vaporPressureFit` (a pure component's vapour pressure from measured points) and
`heatCapacityFit` follow the same evidence and verdict grammar; see
`tutorials/props/curation` and patterns.md section 13.

## 7. The archive, on a computer with the repository

`bin/choupo-thermoml` downloads the NIST ThermoML archive to the student's own
computer and searches it (`sync`, `vle-search A B --geometry bubbleT`, `extract-vle`);
it produces dataset files in the layout above. The browser app never opens a
connection, so a browser-only student brings the paper or the table instead.
