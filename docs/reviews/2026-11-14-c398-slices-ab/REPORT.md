# The property layout, slices (a) and (b), reviewed by measurement

Date: 2026-11-14.  Asked by the coordinator on the board (its messages
of 12:00 and 15:30 by its clock): read slice (a) `c398/slice-a-variants`
at 886256df03 and slice (b) `c398/slice-b-named-laws` at 85d3a8a377
before either lands.  Two reviewers dispatched by the reviewing session
measured them on clean builds of those commits against main's engine
(71203dc590, whose `src/` equals main's); the reviewing session
reproduced four findings itself (marked "reproduced").  No tracked file
was modified; every probe ran on copies of cases outside the tree; no
suite was run.  Findings in `findings.tsv` (SA-01..07, SB-01..05).

## 0. Verdict

Neither slice moves a number on what it was asked to keep: 24 cases of
slice (a) and 49 of slice (b), chosen against them, are identical to
main in every number (slice (a): stdout, stderr and every written file;
slice (b): the result JSON and every report).  The grammar table of
slice (a) refuses no name any of the 1874 property dictionaries, 15 unit
fragments or 5720 operation fragments writes.  Slice (b)'s witness
reproduces to 12 digits from the records by an independent script.

Two findings should hold the landing, one per slice:
* **SB-01**: a vapour-pressure pin is ignored by the reactive
  electrolyte engine while the view says it was applied (a number that
  is not the one the view claims);
* **SA-01**: the three time-integrated binaries ignore a selected
  variant without a word (a choice the author made and the engine did
  not honour, in silence).

The rest are false lines in the resolved view and missing sentences,
listed with their cases.

## 1. Slice (a), `c398/slice-a-variants` at 886256df03

### Should hold the landing

* **SA-01 (S2, reproduced).  `choupoBatch` ignores `thermo <name>;`
  in silence.**  Copy of `batch17_dilute_ergun_limit`; the case's
  property dictionary gains
  `variants { ce { transport { vapour { viscosity { model ChapmanEnskog; } } } } }`
  and the unit `ergun` gains `thermo ce;`.  Exit 0, output identical to
  the unmodified case once clock lines are removed, and no line names
  the variant.  A unit's `thermo` is read nowhere under
  `src/dynamicDriver/`, `choupoBatch/main.cpp` or
  `unitOperations/batch|dynamic`.  This predates the slice
  (`thermo { bogus 1; }` is accepted by main's batch binary too), but
  the selection inherits the silence and no document says so.
  `choupoCtrl` and `choupoSemiContinuous` share that driver; not run.

### False or misleading lines in the view

* **SA-02 (S3).  Inherited blocks attributed to the sector file.**
  Copy of `lithiumBrinePlant`: the root dictionary gains a vapour
  viscosity, the CARBONATION sector a variant `v1`, the precipitator
  `thermo v1;`.  The view prints `vapour viscosity ... CHOICE system of
  sectors/CARBONATION/constant/thermoPhysPropDict`; the sector file
  declares no `transport`, the block came from the root through
  `inherits`.  `Flowsheet::printFragmentView` never sets
  `Choice::localFile` or `inherited`.
* **SA-03 (S3, reproduced).  The source of a pair is wrong.**
  `model5_nrtl_flash`, unmodified: the view prints
  `pair ethanol-water: inline (inline), provenance inline`; the
  builder's own line in the same run says
  `binary pair ethanol-water --- data/standards/parameters/NRTL/ethanol-water.dat`.
  The view echoes `ThermoResolutionLog`, and the result JSON's
  `thermoResolution` carries the same wrong value (older than the
  slice; the view now presents it as the pair's source).
* **SA-04 (S4).**  `K-value world: gammaPhi` printed for the
  gammaGamma EXTRACTION sector (`vleWorld_` defaults to that word in
  `ThermoPackage.H`); on `perUnitThermo01` the turbine changes only the
  vapour fugacity model and the view attributes the whole `equilibrium`
  row, the liquid's `ideal` included, to the inline block; a sector's
  view says "selected by: the units of this sector that name no thermo
  of their own" and never lists them; the property binary prints no
  view for an inline operation `thermo {}`, which the commit message
  says it does.

### Refusals and silences

* **SA-05 (S3).**  A sector unit naming a ROOT variant (`thermo rv;`,
  `rv` defined in the case's dictionary) is refused with "its
  constant/thermoPhysPropDict declares no `variants {}` block", which is
  false for the case's own file; the sentence should name the sector
  file and say variants are not inherited.
* **SA-06 (S4).**  An empty variant selected by a unit runs with no view
  and no "selected by" (`thermoFor`'s `declaresWorld` is false); the
  property binary prints a view for the same variant.
* **SA-07 (S4).**  A variant that changes only a property's
  `mixingRule` fails with the generic "missing entry 'model'": nothing
  says the property block is replaced whole and must restate its model.

### The coordinator's five questions

1. **Byte identity: holds.**  The builder's method is not in the tree
   (the commit message says only "identical once the [properties] lines
   are removed").  No line other than the view begins with
   `[properties] ` on either tree and the view writes to stdout only, so
   that filter cannot hide anything else.  Own comparison, 24 cases,
   both trees, fresh copies, stdout, stderr and every written file,
   normalising only the commit hash and the tree path: identical, except
   wall-clock timestamps in two batch logs.  Sample: the seven cases
   with unit fragments (`perUnitThermo01`, `flash20`, `acetonePlant`,
   `hda`, `basis01`, `crystalliser09`, `esterification2sector`),
   `lithiumBrinePlant`, eight property cases with operation-level
   fragments, eight cases with a `transport {}` block.
2. **The grammar table: holds.**  Own parser over 1874 dictionaries
   (the builder's 1873 and the witness), 15 unit and 5720 operation
   fragments; 87 dictionaries and 147 operation fragments carry
   `transport`; none writes a refused name; three of the least usual
   run with exit 0 on the slice.
3. **The view on a sector case and a fragment case: does not hold**
   (SA-02, SA-03, SA-04).
4. **The gate: holds for what it claims.**  Its arms (c) and (d) catch a
   selection lost in either binary or both (unit 8.8856e-4 Pa s,
   variant 8.8856e-4, system 9.06542e-4) and it compares a pipe against
   a property operation.  It has no sector arm.  Probes on its witness:
   a misspelt or undefined name refused in both binaries with the
   declared names; `components` or `volumetric` in a variant refused;
   `thermo <name>;` beside an inline block refused; `equilibrium` in a
   variant accepted and audited by the model-boundary ledger; a property
   the system lacks accepted; a sector variant works; an unused one is
   announced.  `choupo-lint` and `choupo-init0` refuse an unknown name.
   On a sealed case the importer mirrors the records a variant reads.
5. **The 68 unread keys: the list is recorded nowhere** the reviewer
   could find, and reproducing it needs an engine edit (request R1).
   Read instead from the readers: `fugacityRoute` and `root` under
   `equilibrium.liquid|vapour` (10 cases) and `caloric.<phase>.root` are
   read by nothing (a contradicting word is accepted; no number moves,
   one route exists); every other key sampled is read by another reader
   (the reasons, `energyBasis`, `compositionBasis`, the solvent and
   solute words, `volatiles`, `maxMassFraction`, the route words,
   `source`, `activeComponents`, `phases`, `referenceBasis`).  None is a
   defect that would move a number.

### Requests for slice (a) (the reviewer edits nothing)

* R1. A switch that runs the unread-key audit over the whole resolved
  property dictionary and prints its lines, so the 68 can be reproduced.
* R2. `printFragmentView` sets the local file and the inheritance for a
  sector base; check: SA-02 prints "the parent system, through
  `inherits`".
* R3. The time-integrated driver refuses or announces a unit's `thermo`.
* R4. Check `fugacityRoute` and `root` against what runs, as the
  caloric route words already are.
* R5. The view's pair source from the builder's record path.

## Slice (b), `c398/slice-b-named-laws` at 85d3a8a377

Measured on a clean build of that commit against main's engine
(71203dc590, whose `src/` equals main's).  Reproduced by the reviewing
session: SB-01 and SB-03 (marked).

### Gating

* **SB-01 (S2, reproduced).  A vapour-pressure pin is IGNORED by the
  reactive electrolyte engine while the resolved view says it was
  applied.**  The pin is applied after `buildV2Dispatch`
  (`ThermoPackageBuilder.cpp:1997`) to the package's own components
  (`ThermoPackage.cpp:3069`); `ReactiveVLE` takes a nonreactive
  volatile's vapour pressure from its own `db.loadComponent` copy
  (`ThermoPackageBuilder.cpp:1247`, captured at `:1303-1304`), which the
  pin never reaches.  Minimal case: a copy of
  `flash12_nh3_acetic_ethanol_reactive` whose case-local `ethanol.dat`
  holds `antoine` (preferred) and `doubled` (A + log10 2).
  `doubled` marked preferred: `p_ethanol_atm` = **0.0267482774966**;
  `doubled` PINNED in `equilibrium.vaporPressure`: **0.0133741386148**,
  identical to the unpinned run -- while the view prints
  "ethanol: law `doubled` (Antoine), case pin".  The molecular paths are
  consistent: a water vapour-pressure pin and an isopropanol ideal-gas
  heat-capacity pin (RowlinsonBondi re-injected) give 0 differing
  numbers between pin and preferred over 520 changing numbers each
  (copies of `acetone06`).
* **SB-02 (S2).  SL-05 is half closed: a salt's liquid heat capacity
  cannot take the new grammar.**  `ThermoPackageBuilder.cpp:767-768`
  hands the raw salt block to `setLiquidCp`.  A copy of
  `crystalliser11` whose case-local `KCl.dat` writes
  `liquidHeatCapacity { preferred proxy; proxy {...}; double {...}; }`
  refuses (exit 2) with `Dictionary 'liquidHeatCapacity': missing word
  entry 'model'` -- a parser message where a sentence is owed, and a
  pin can never reach a salt.  RowlinsonBondi's injection IS fixed.
* **SB-03 (S3, reproduced).  A hard-domain refusal never names the law
  that covers the state.**  `throwOutsideDomain` puts the remedy in
  `PropertyDomainError::remedy`, and no run-time printer reads it.
  Water with `vogel` `domain (273 335)` and `andrade` covering 330-373 K,
  at 343.15 K: "liquid viscosity of water: law `vogel` (vogel) refuses
  T = 343.15 K, outside its hard window 273-335 K" -- no mention of
  `andrade`, which the ruling (5.2 of the record) requires.
* **SB-04 (S3).  The view promises an announcement that never happens.**
  The view reads `Tmin`/`Tmax` generically and prints "soft 273-320 K
  (announced outside)"; Vogel and Andrade never read those keys, so at
  325 K nothing is announced.  Keys a law's type does not read are
  accepted in silence.
* **SB-05 (S4, latent).**  `pinLaw` does not reset the 298.15 K datum
  bridge cache (`bridgeResolved_`, `Component.cpp:1438/1508`); harmless
  today only because nothing resolves the bridge before the pin.

### The four questions

1. **The 45 differing runs: holds.**  Own runner, tracked files only,
   49 cases chosen against the slice (sigma-profile and PC-SAFT cases;
   operation-level Vogel/Andrade/SatoRiedel words; columns 09, 10, 17
   and `ratebased01`; electrodialysis; hydraulics; membranes; solids;
   sealed water and NaOH cases; the RowlinsonBondi cases `acetone06/07`;
   crystalliser10; flash01/10/12/13/20).  Numeric differences in the
   result JSON: **0 in 49**.  The only differing numeric tokens anywhere:
   timestamps, the count of unverified records, paths, the commit hash.
2. **Pins applied after assembly: does not hold** (SB-01, SB-02).
   Readers checked: the reactive engine's copy (pin ignored); the salt's
   liquid Cp (block refused); the datum bridge (consistent today, SB-05);
   RowlinsonBondi and the molecular K-values and enthalpies (follow the
   pin).  NOT checked: the per-unit `thermo {}` path (`thermoFor`), the
   pure-fluid kernels, the package audit's timing.
3. **NaOH: the enthalpy half is right, the entropy half over-claimed.**
   `NaOH.dat:29` stores Hf_298 = -425600, exactly
   sum hfAq (Na -240120, OH -229990) - dissolutionEnthalpy (-44510): a
   derivative stored as data, read by nothing; pinning it as debt
   (`check_record_primitives`, PINNED_DERIVED) rather than deleting it is
   defensible.  Its S_298 is NOT derivable from the stored facts (no
   dissolution entropy is stored; the contract names the enthalpy only),
   so calling it a second home is over-claimed.  `check_ion_pins` passes
   because it reads only `standardThermochemistry`, and it carries its
   own NaOH anchor, -425610, a third home 10 J/mol from the record.
4. **The `tolerance` in `check {}`.**  Water's check value 0.6064610 is
   an evaluation of the conductivity formulation by code already in the
   tree: a derived number stored in a record, which the gate could
   compute.  The tolerance 0.005 is the fit's accuracy at that state, a
   second home of the provenance `uncertainty` (RMS 0.14 %, max 0.64 %),
   and is TIGHTER than that stated maximum: the same correct law checked
   at 273.16 K would fail.  The gate catches a wrong logarithm base or a
   wrong coefficient unit (read with log10 the law gives 1.974), but on 1
   law of 2540; the 2539 pinned pass by construction.  Proposal: a check
   value is a PUBLISHED number with its source, transcription tolerance
   only; a fit's residual stays in provenance; where the reference is a
   formulation the tree evaluates, the gate evaluates it and nothing is
   stored.

### Binding rows

SL-01 closed (bench rows for vapour pressure 1073, heat capacity and
enthalpy 3219 each, conductivity 2146, and 5655 sealed rows; the
cross-engine run was not repeated).  SL-02 closed in the sample (3 of
the 5 property dictionaries with operation-level words, identical
numbers).  SL-03 closed (StoredCorrelation with water's block removed
falls back to Brock-Bird, announced; sigma 0.0245862 against 0.0360334
under BrockBird for all three; the view calls it "its one law",
inexact).  SL-04 closed (a word-less viscosity block with no record
block refuses by name; a word-less surface-tension block takes each
record's law, sigma 0.0240930; no vapour viscosity: the key is omitted
with the remedy and a declared property refuses; the factory defaults
are deleted).  SL-05 half closed (SB-02).  SL-09 closed (sealed copies
migrated; `check_provenance_home` reads tutorials and curation copies,
OK over 4712 records).

### Other

`purelaws01`: an independent script from the records' coefficients
(Vogel, the five-constant form, Andrade; log-mole average, G = 0)
reproduces its six goldens to 12 digits (0.00110212717208 Pa s at
293.15 K).  Two laws without `preferred` refuse at first evaluation
naming the laws; `preferred` naming a missing law refuses with the list.
Text: `purelaws01`'s header says "Not sealed" and its manifest says
`sealed true;`; water's check comment refers to a residual "above" that
no line states.

### Requests (the reviewer edits nothing)

1. Read the reactive engine's vapour pressure from the package's
   pinned component, or apply pins inside the builders before
   `cfg.psatOf` is captured; print check: the `flash12` pair above gives
   one `p_ethanol_atm`.
2. Route a salt's `liquidHeatCapacity` through `Component::recordLaws` /
   `pinLaw`.
3. Print `PropertyDomainError::remedy` wherever `what()` is printed.
4. Reset `bridgeResolved_` in `pinLaw`.
5. Announce a soft window only for the law types that read one, and
   refuse a key a law's type does not read.

## 2. Not done

No suite, no `--fast`, `--scope` or `--gui`; `choupoCtrl` and
`choupoSemiContinuous` not run with a variant; the per-unit `thermo {}`
path, the pure-fluid kernels and the package audit's timing not read
for slice (b)'s pins; the property-route bench's cross-engine run not
repeated.
