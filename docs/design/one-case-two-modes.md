# One case, two modes — a membrane fitted in Properties mode, simulated in Process mode

*2026-10-25.  DEV.md §4c C149 (the membrane characterisation fit) and C152
(one case, two modes), built together on `6bae57224`.  Vítor's words for
C152: "o caso que se prepare para estimar parâmetros pode depois expandir
para a simulação do processo ... o ideal era os dados experimentais e o
ajuste estarem auto contidos no caso do processo final!" and "Eu posso abrir
o caso em modo de simulação de processo ou em modo de trabalhar com as
propriedades e ajustes e data sets experimentais!".*

## 1. What a researcher could not do

`fitParameters` fitted PAIR parameters (a bubble point, an isotherm) with a
held-out verdict.  Nothing estimated a MEMBRANE: the DSPM-DE pore (r_p, X_d,
A_k/dx, eps_p), an SDEM or solution-diffusion permeance, a constant
rejection.  A researcher with a lab sheet of fluxes and rejections had a
bench that could PREDICT them (`poreTransport`) and no way to fit them --
and, had he fitted them by hand, no way to carry the result into a process
case without copying numbers into a record that would then say nothing
about where they came from.

## 2. The membrane residual (C149)

`fitParameters` gains `residual { kind membrane; ... }`:

```
{
    name      fit_NF270_FdL2021;
    type      fitParameters;
    parameters
    (
        { path poreModel.poreRadius;     initial 6.0e-10;  min 3.0e-10;  max 3.0e-9; }
        { path poreModel.chargeDensity;  initial -20;      min -3000;    max 3000;   }
    );
    evidence
    (
        { dataset "constant/experimental/fdl2021_NaCl.dat";   role fit; }
        { dataset "constant/experimental/fdl2021_MgCl2.dat";  role fit; }
        { dataset "constant/experimental/fdl2021_Na2SO4.dat"; role validation; }
        { dataset "constant/experimental/fdl2021_MgSO4.dat";  role validation; }
    );
    acceptance { maxAAD 10 percent; origin "..."; }
    residual
    {
        kind        membrane;
        model       DSPM-DE;          // | SDEM | solutionDiffusion | constantRejection
        membrane    NF270_dspmde;     // the BASE record: the fixed values
        rejection   intrinsic;        // | observed -- no default
        weighting   absolute;         // | sigma
        transportParameters { poreSolver { ... } hindrance ...; activity ...; }
        k_film      10;               // | massTransfer { ... }
        polarisation { suctionCorrection ...; ionCoupling ...; }
    }
    output { record "constant/assets/NF270_FdL2021.dat"; }
}
```

* **A parameter is a PATH into the base record** (`poreModel.poreRadius`,
  `poreModel.chargeDensity`, `poreModel.porosityOverThickness`,
  `poreModel.poreDielectric`, `A_w`, `permeabilities.<solute>`) or into the
  law's own block (`transportParameters.rejection.<solute>`) -- the bubble
  fit's grammar, one level over.  What is not listed keeps the base record's
  value.  `initial`/`min`/`max` are in the FIELD's raw convention and may not
  carry a unit (the record's mol/m3 is not the engine's kmol/m3; a converted
  number would be a factor 1000 off with no symptom).  Positive fields are
  fitted in ln-space; a bound is a box for the iteration and a FINDING at the
  optimum (an active bound refuses the record).
* **One dataset row is one operating point**, evaluated as the units
  evaluate the law: the same TransportModel factory, `transportParameters {}`
  reader and polarisation builder (`membrane::buildPolarisation`, the
  module's), the record rebuilt from the base record's own file with the free
  values set.  A row IMPOSES `Jv` (only DSPM-DE honours an imposed flux, as on
  the bench) or `dP` (the law closes J_w = A_w (dP - dpi), and `Jv_measured`
  may be fitted).  Feed as `feed { <component> <c> mol/m3; }` or `c_<x>`
  columns; `T` held constant or a column; measured `R_<component or ion>`,
  `sigma_<column>` for `weighting sigma;`.  A column the residual does not
  read REFUSES -- an ignored column is a measurement the author believes was
  fitted.  The one dataset reader is `EvidencePartition::loadTable`, beside
  `loadColumns` (same grammar, same unit conversion).
* **Rows are evaluated in SERIES**, each with its own law instance so each
  row's pore is warm-started from its own previous solve (a pore of another
  feed is not a start).  Parallel rows would need threads the engine does not
  use; the series run is deterministic, which the record's byte-identity
  (section 4) depends on.
* **The statistic the band judges** is the mean over held-out terms of
  |R_model - R_measured| x 100 -- rejection PERCENTAGE POINTS -- and
  100 |dJ|/J for a flux term.  A relative error of a rejection near zero would
  be meaningless; `maxAAD 10 percent;` reads "within 10 points".
* **The discipline is fitParameters'**: the frozen evidence partition, the
  band declared before the fit, identifiability (condition number of the
  relative-scaled Jacobian, correlations, per-parameter sensitivity),
  standard errors from the Gauss-Newton Hessian with the delta method, the
  verdict from `CurationDossier::verdictOf`.  The fit's published `fitPoints`
  table (point, Jv_mps, measured, model, residual, set, quantity, heldOut,
  dP_Pa) earns the generic parity, residuals and parameter-table views
  (C147/C149) plus its own: every measured quantity of every dataset against
  J_v, data as markers and the fitted law as lines.
* **A fit with no free parameter is a PREDICTION** (the same grammar, every
  row evaluated and scored, nothing written).
* The small dense algebra the bubble and isotherm fits use (Gauss-Jordan,
  the damped step, Jacobi eigenvalues, Student t) is exported once
  (`propertyOps/FitAlgebra.H`, defined in FitParameters.cpp) rather than
  copied into the new translation unit.

## 3. The witness fit, and how its partition was chosen

`tutorials/steady/membranes/membrane24_fit_then_simulate`.  Data:
Fernández de Labastida & Yaroshchuk, Membranes 11 (2021) 272 (CC BY 4.0),
NF270 in a rotating-disk cell at 20 C, four dominant salts at 0.01 mol/L,
intrinsic rejections at seven fluxes each -- the symbols of their Figures
1a-4a that `bin/curate/digitise_fdl2021.py` had already read for
membrane12, re-expressed by `bin/curate/export_fdl2021_rejections.py`.
Fitted: the two chlorides.  Held out: the two sulfates.

| | value | 95 % half-width |
|---|---|---|
| r_p | 0.67476 nm | 0.034 nm |
| X_d | -10.525 mol/m3 | 4.10 mol/m3 |
| correlation(r_p, X_d) | -0.962 | |
| condition number | 28.8 | |
| in-sample AAD (14 points) | 2.66 points | |
| held-out AAD (14 points) | 0.93 points | |
| verdict (band 10 points) | **validated** | |

**The partition was chosen after measuring others**, and the case says so in
its own header because it weakens the claim:

* fit NaCl + MgSO4: r_p runs to its upper bound (3 nm, X_d -404): a
  Donnan-only pore, the two not separable; held-out AAD 16 points;
* fit NaCl + Na2SO4: correlation(r_p, X_d) = -1.0000, not identifiable;
* r_p, X_d and A_k/dx (or eps_p) free on any pair: |correlation| >= 0.99;
* fit NaCl + MgCl2: identifiable (the witness).

So the verdict is that of a partition chosen for identifiability, not one
fixed blind, and the held-out sulfates sit at R 0.977-0.997, where a tight
pore of almost any charge predicts them closely -- a weak test of X_d (on
the gate's SYNTHETIC data, generated at 0.62 nm and -25 mol/m3, a by-hand
sabotage that left the fit at its start, 0.50 nm and -5, still predicted the
held-out sulfates within 0.002 points).  A blind partition is a separate study.

**The evidence identity, and why the datasets carry no DOI.**
EvidencePartition R3 refuses a DOI shared across roles: a DOI is read as the
identity of a piece of evidence.  That is right for a held-out STUDY, and
these four datasets are four SERIES of one study.  Declaring the DOI would
make the partition impossible; leaving it off makes the claim the narrower
one, "held out within one study", which each dataset's `identity` line and
the case header state.  The run announces the missing DOI.  Whether evidence
identity should become (doi, series) is put to Vítor (section 9).

## 4. The record (C152)

`output { record "constant/assets/<file>.dat"; name ...; }` writes a membrane
record in the catalogue's own grammar (the fields `Membrane::readFromDict`
reads, `provenance fittedToCase; fittedAgainst <case>;` as the catalogue
says it), and a `fit {}` block:

```
fit
{
    origin            fitted;
    method            "fitParameters, residual kind membrane, model DSPM-DE: ...";
    fittedInCase      membrane24_fit_then_simulate;
    operation         fit_NF270_FdL2021;
    propsDict         "system/propsDict";
    fitBlockSha256    "...";      // the operation's own entry, canonical
    baseRecord        NF270_dspmde;
    baseRecordSha256  "...";      // the base record, canonical
    recordSha256      "...";      // THIS record without fit {}, canonical
    datasets ( { role fit; dataset "..."; sha256 "..."; } ... );
    verdict           validated;
    acceptance        { maxAADPoints 10; origin "..."; }
    heldOut           { measurements 14; AADPoints 0.925798; }
    inSample          { measurements 14; AADPoints 2.66345; chi2Reduced ...; }
    identifiability   { conditionNumber 28.7505; maxAbsCorrelation 0.962078; }
    values { poreModel { poreRadius { origin fitted; stderr ...; ci95 ...; unit "m"; } ... } }
    correlation ( { a poreModel.poreRadius; b poreModel.chargeDensity; r -0.962078; } );
}
```

* **Fitted values are rounded to 6 significant figures and the verdict and
  every published number are re-evaluated AT the rounded values**, so the
  record is exactly what was judged.  Nothing time-dependent is written, so
  an unchanged case rewrites the same bytes -- the record is tracked, and a
  test run must not dirty the tree.
* **Fingerprints are canonical** (`core/DictCanonical`, the seal's own
  surface): a comment or a re-aligned column does not make a fit stale; a
  moved number, a new row, a changed band, free parameter or law does.
  `fitBlockSha256` has ONE home (`membraneFit::fitBlockSha256`), which
  re-reads system/propsDict from disk on both sides, so the writer and the
  verifier cannot hash two parses of one block.
* **`recordSha256` covers the record's own values**: a hand-edited fitted
  number is refused as surely as a moved dataset ("a fitted value is the
  fit's, not a hand's"; to try a value of one's own, write a separate record).
* Refused: a path under data/standards/ (`records::refuseStandardsWrite`),
  any path but `constant/assets/<name>.dat` (the one home the registry
  reads), a record named like its base, a prediction (nothing fitted), a free
  parameter in `transportParameters` (a law's block is not a record's), and a
  fit that did not EARN a record (not converged, an active bound, not
  identifiable).  After writing, the fit re-registers the record
  (`MembraneRegistry::registerFile`), so a later operation of the same run
  reads it.

## 5. Process mode reads it, and refuses a stale one

`MembraneRegistry::byName` -- the one door every unit uses -- checks a record
that carries `fit {}` the first time it is asked for
(`membraneFit::verifyFresh`): every dataset, the fit block, the base record
and the record's own values.  A stale one REFUSES, naming the input that
moved, both fingerprints and the remedy (`runCase <case> props`, which
re-fits and rewrites the record).  A fresh one is ANNOUNCED once, on the
console and as a `provenance` advisory: `[fitted] membrane 'NF270_FdL2021' is
a FITTED record: operation 'fit_NF270_FdL2021' of case ... wrote it,
held-out verdict validated; its fingerprints match ...` -- the link from the
unit to the fit that wrote it.  `byNameUnverified` exists for ONE caller, the
fit reading its BASE record: the remedy a stale refusal names must not itself
be refused.

**Not fingerprinted, said plainly:** the thermophysical package -- the
species records whose ion radii and diffusivities the pore reads -- and the
engine.  A changed ion radius moves the fit and is NOT caught.

The witness stage: one vessel of three Generic-8040 elements, NaCl 10 +
MgSO4 1 mol/m3, 12 m3/h at 3 bar, 20 C: recovery 41.8 %, J_v 12.5 um/s
(inside the fit's 6-56 um/s), R_obs NaCl 45.4 %, MgSO4 76.1 %.  The fitted
record carries the pore and NOT A_w (the data impose J_v); the stage's A_w is
NF270_dspmde's archetype value, marked so in the record, and the mixture is
an extrapolation in composition with a constant charge.

## 6. One case, two modes

A case may carry `system/flowsheetDict` AND `system/propsDict` over one
`constant/` (OpenFOAM's posture: blockMesh, a solver and postProcess are
runs on one case, not three cases).

* `controlDict.application` is the DEFAULT mode; `runCase <case> props` /
  `runCase <case> process` runs the other (process = the application when it
  is a flowsheet binary, else choupoSolve).  A mode whose dict the case does
  not carry refuses by name, an unknown mode word refuses, a case-local
  `code/` refuses a non-default mode (buildCode compiles against the default
  only).  A single-dict case is unchanged; the word is optional everywhere.
* Information flows ONE WAY: Properties mode writes records into constant/,
  Process mode reads them.
* **The goldens: `expected` for the default mode, `expected.<mode>` for the
  other** (`expected.props` / `expected.process`).  Why this layout: every
  tool that reads `expected` -- the check loop, the gates that sweep goldens,
  the case manifest's hasGolden, the GUI -- goes on meaning "the case's
  default run" with no change, and the second file is named by the SAME word
  `runCase <case> <mode>` takes, so the pair cannot be confused.
* `bin/runTests` checks a two-mode case in BOTH modes, the default FIRST
  (a Properties run may read what the process run wrote -- ctrl17 -- or write
  what it reads), labelled `<case>[<mode>]`; `--record` writes both.  Only
  the default run feeds the single-pass cache the post-loop gates read.
* **ctrl17_step_reaction_curve was already a two-mode case** (choupoCtrl +
  the choupoProps identification over its trajectory), and its own comment
  said "until a case runs both halves under the harness" its identification
  was pinned by nothing but `check_reaction_curve`.  It now runs both halves:
  `ctrl17_step_reaction_curve[props]` passes as smoke + NaN guard.  No
  `expected.props` was recorded for it -- no existing case's golden was
  touched by this slice -- and recording one is the obvious next step.
* `generated/caseManifest.json` records `modes` and `defaultMode` for a
  two-mode case (membrane24, ctrl17).

## 7. What is NOT done

* The SDEM, solutionDiffusion and constantRejection residuals share the
  evaluation loop and are refused/accepted by the same reader, but no case
  fits them on real data; the gate fires the solutionDiffusion imposed-Jv
  refusal only.  A constantRejection or transportParameters fit cannot write a
  record (the numbers are the law's block).
* The thermophysical package is not fingerprinted (section 5).
* The GUI mode switch and the map of both stages (C151's).
* No `expected.props` for ctrl17 (section 6).

## 8. The gate, and the sabotages

`bin/curate/check_fit_then_simulate.py` (wired into bin/runTests beside the
membrane-modules gate): (a) zero-noise data the props BENCH generated at
r_p 0.62 nm, X_d -25 are fitted back from (0.50 nm, -5) to 1e-5, chi2
< 1e-12, validated; (b) the witness's Properties mode rewrites its record
byte-identically, its FITTED values are the published ones at 6 figures and
the published ones are themselves 6-figure numbers; (c) Process mode names
the fit and the stage's banner shows the record's pore; (d) a moved dataset
number, fit block, base record and hand-edited value each refuse with the
remedy, a comment does not, a missing propsDict refuses, the remedy works;
(e) runCase runs both modes and refuses a missing mode and an unknown word;
(f) six grammar refusals.

By hand (engine edited, rebuilt, gate run, restored and rebuilt):

| | sabotage | caught by |
|---|---|---|
| S1 | `MembraneRegistry::byName` skips the freshness check | (c) no `[fitted]` line; (d) every refusal arm |
| S2 | the verifier hashes a dataset's raw bytes, not its canonical parse | (c) the witness itself refuses (writer and verifier disagree); (d) the comment arm; (e) |
| S3 | the verdict taken at the unrounded values (rounding skipped) | (b) the record's bytes change; (b) the published values are not 6-figure numbers |
| S4 | the Jacobian's sign flipped | (a) recovery, chi2 and held-out AAD; (b) the record's bytes change |

## 9. Owed to Vítor

* **Evidence identity within one study.**  R3 reads a DOI as the identity of
  a piece of evidence; holding out a series of the same study is then
  impossible unless the DOI is dropped, which this case does and says.  A
  (doi, series) identity would let a dataset keep its DOI and still be held
  out within its study -- a change to EvidencePartition, his.
* **The partition was chosen for identifiability** (section 3): whether the
  witness should instead fit all four salts and claim no validation, or keep
  this one with its caveat, is a pedagogical choice.
