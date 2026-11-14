# Several laws for one property, tables, and how a case chooses (C398)

Kind: PROPOSAL, with measurement.  Status: OPEN -- written 2026-11-14 for the
architect's ruling; nothing built, no engine, data, case or golden changed.
SECOND HEAD (same day): the architect's eleven rulings R1-R11 and the reading
of the toolbox this project's dictionaries descend from are folded in
(section 5.5c, which prevails over the rest of section 5 where they differ); the review of
the whole tree against the ruled design is planned in
[`property-layout-review-plan.md`](property-layout-review-plan.md).
Asked by Vítor: *"A água não pode ter vários modelos com parâmetros para gamas
de temperatura?!  Que se passa aqui?!  ... temos de resolver esta confusão once
and for all!"*, under his standing rule that thermophysical properties are
declared in the case's property dictionary and at the levels that replace it,
nowhere else (DEV.md 4c C397), and his requirement of the same day: *"tem de
haver a possibilidade de descartar os métodos sistemáticos e inserir dados à
bruta sob a forma de tabela"*.

## THE RULING (2026-11-14; it PREVAILS over every section below)

C398 is ruled (DEV.md 4c, block "C398, RULED", after the reviewing session's
three reports `docs/reviews/2026-11-14-several-laws-design-record/`,
`docs/reviews/2026-11-14-openfoam-property-architecture/` and
`docs/reviews/2026-11-14-property-dictionary-architecture/`, and Vítor's rule
"as far as possible, PRESERVE WHAT IS ALREADY GOOD IN CHOUPO; where a
difference is only a matter of style, it is not worth changing").  Where the
body disagrees, the body is marked SUPERSEDED and this section holds.

1. **ONE ENTRY POINT.**  A case's property dictionary keeps its blocks as
   they are (they ARE the case's system) and may add `variants {}`: named
   variants that state only what differs and derive DIRECTLY from the file's
   own system (one base: no chain, no cycle).  A unit and a property
   operation select one by name, `thermo <name>;`.  Today's inline `thermo {
   }` fragments keep reading, as unnamed variants.  The retired words
   `package`, `packages`, `derivedFrom` and `propertyPackage` of the third
   head are NOT used.
2. **THE ATOM OF REPLACEMENT** is the PROPERTY block inside `transport` and
   `volumetric`; `equilibrium` and `caloric` are replaced as today (a variant
   that changes them is a model boundary, announced as one).  The reviewer
   measured that no shipped case moves.
3. **A SECTOR KEEPS ITS OWN DICTIONARY** (the plant-and-sectors contract is
   preserved); a sector's dictionary may hold variants of its own.  The third
   head's "a sector folder carries no definitions" and its proposed changes to
   the settled contracts' sentences are WITHDRAWN.
4. **RECORDS ARE NOT RESHAPED.**  Several named laws go INSIDE the existing
   property block, one marked preferred, each with its window and source;
   the old one-law shape reads unchanged; no new schema version, no renamed
   key, no key with one possible value (those are lines of the resolved VIEW,
   not keys of six hundred dictionaries); no `convention` field until a
   second convention exists.
5. **A LAW IS CHOSEN ONCE, PRINTED, NEVER SWITCHED.**  Several ranges are one
   piecewise law whose joint is held on VALUE only (a slope jump of a few per
   cent at a two-range heat capacity's joint is a fact of the published fits:
   the reviewer counted 31 of the 43 NASA9 records above 1 %); a table is a
   type, with hard ends, a declared interpolation, units per column and a
   source; no clamp; a bounded, reasoned extension is the only way out of a
   table's domain.
6. **DIFFUSIVITY.**  An entry names `solute` and `solvent` in a list, its
   kind and its conditions; the variant declares the quantity it returns and
   the composition model (in the property dictionary, not in the film); a
   zero interaction of a mixing rule must be DECLARED with its reason.
7. **THE RESOLVED VIEW** has two columns, where the choice was made and where
   the data came from; and A GATE FROM THE FIRST SLICE: for one state and one
   variant, the column and a property operation receive the same values.
8. **BINDING ON THE BUILDER, from the review**: SL-04 (whoever lets a
   property block omit its model word deletes the three factory defaults in
   the same change); SL-01/02/03 (the proof that slice (a) moves no number
   covers conductivity, vapour pressure and heat capacities over every sealed
   copy, and four legacy words are NOT pins of a record law); SL-05 (which
   ideal-gas law is injected into a liquid one is decided explicitly); SL-09
   (34 misfiled provenance entries live in sealed copies too).  SL-07: 24
   molecular pair records and 89 electrolyte pairs were regressed with the
   present vapour-pressure law, so WATER'S PREFERRED LAW IS NOT FLIPPED IN
   THIS CAMPAIGN; the reference law enters the record as a named alternative
   a case may pin, and the flip waits for a refitting campaign of its own,
   decided separately.

**ADDENDUM TO THE RULING (DEV.md 4c "C398, RULED, ADDENDUM"; from the
reviewer's report `docs/reviews/2026-11-14-openfoam-property-architecture/REPORT.md`
sections 9-10 and `docs/reviews/2026-11-14-property-dictionary-architecture/REPORT.md`
section 5).**

* **A1. The target shape of the liquid transport laws** is the shape vapour
  pressure and the heat capacities already have: a per-COMPONENT law object
  built from the record (Component.cpp:543, :780-790), not a per-package
  model that reaches into every record for a sub-block of its own name
  (LiquidViscosityModel.H:88).  The package-level word becomes the MIXING RULE
  only, consuming the pure values.  A legacy case word reads as "this mixing
  rule plus a pin of that law for every constituent", with the four
  exceptions of review row SL-03 stated: `SatoRiedel` and `BrockBird` are
  predictive (no record law to pin), `StoredCorrelation` falls back per
  component to Brock-Bird (StoredCorrelation.cpp:46-56), and the words are
  case-insensitive aliases.  THE REASON: with one law object per component,
  methanol (Andrade/Vogel), 2-propanol (five-constant form only) and water
  (Andrade/Vogel) can be priced in one mixture; today no single word prices
  them (section 2: `Vogel` refuses 2-propanol, `chemsepEq101` refuses water).
* **A2. The heat-capacity table moves into slice (c)**, after the
  liquid-viscosity table: integrated ONCE at construction, so h and s follow
  from it exactly as from a polynomial; it must cover 298.15 K (or the
  reference temperature of the datum it is anchored to), else it is refused.
  Besides the interface `Cp`, `H(T, Tref)`, `S(T, Tref)` of
  HeatCapacityModel.H:58-66 it needs: (i) a HARD domain, which that interface
  does not carry (the existing laws only announce their windows, e.g.
  PolynomialCp.cpp:163), so the table throws the typed `PropertyDomainError`
  of the kernel; (ii) the units-and-columns reader shared with the other
  tables (src/core/Formula, PD-02); (iii) its registration word in
  `HeatCapacityModel::registerBuiltins` (HeatCapacityModel.cpp:65-91); (iv) the
  cumulative integrals of Cp and Cp/T at the nodes, exact for the declared
  interpolant; (v) the first use limited to the LIQUID and SOLID heat
  capacities -- an ideal-gas table enters formation, Gibbs and equilibrium
  constants and waits for its own check.
* **A3. What a record may hold, per phase**: the table below goes into the
  record as its rule, and the gate `check_record_primitives` (built in slice
  (b)) holds it: a derived quantity typed in a record is refused; a
  redundant one is accepted only as a CHECK, compared and announced, never a
  second source.  (From the reviewer's 9.4.)

  | primitive (stored once) | derived (never typed) | a CHECK if also typed (announced, never a source) |
  |---|---|---|
  | formation enthalpy and entropy in the natural phase | h, s, g of every phase; a reaction's heat and K | a typed `dH_rxn` (already a cross-checked override) |
  | ideal-gas Cp(T) and liquid Cp(T), each one law (or one named law preferred) | the sensible legs; the slope of the latent heat | -- |
  | the latent heat at ONE temperature (`HvapTb`) | the latent heat at T | Watson's curve where a liquid Cp exists |
  | vapour pressure p_sat(T) | d ln p / dT for the Newtons | Clausius-Clapeyron's latent heat against the derived one; the curve's boiling point against `Tb` |
  | the liquid volume law (`Vliq`, `VliqT`) | the pressure term of the liquid enthalpy | -- |

* **A4. A unit's block may not carry a property once the slot exists**:
  `liquidViscosity` inside `packing {}` (DistillationColumn.cpp:5574-5575,
  RateBasedSegment.cpp:233-234) and its siblings (section 3) are refused
  with the line to write in the property dictionary; scheduled with the
  unit-block families.  The rate-based column asks the property dictionary for
  liquid diffusivity, viscosity, conductivity and density, and its own
  Wilke-Chang instance (RateBasedSegment.cpp:263, :400-407) goes: a
  PREREQUISITE of the three-component slice, after (d).

**ORDER OF SLICES (ruled).**  (a) per-property replacement in `transport`,
named variants, the resolved view, the gate of point 7 -- no number moves;
(b) named laws in records, the old shape read, windows announced for every law
that has none; (c) the table type, liquid viscosity first; (d) directed
diffusion entries and the declared quantity; (e) the packing as a record; then
the unit blocks that hold property values (section 3) one family at a time,
the literal defaults becoming refusals LAST since they move goldens; then,
outside this layout, the reaction checks of C399 (an element balance at load,
the rate constant's dimension).  The rate-based column resumes after (e).
The plan: [`property-layout-review-plan.md`](property-layout-review-plan.md).

## The review rows, answered

| row | what the record now says, or why not |
|---|---|
| SL-01 | Accepted (ruling 8): the bench that proves slice (a) moves no number is extended to liquid conductivity, vapour pressure and the heat capacities, and runs over every sealed copy, not the catalogue only (365 of 371 water dictionaries read sealed copies). |
| SL-02 | Accepted: the byte-identity list of 5.4 also covers the model words written at operation level in five property dictionaries (Vogel 7, Andrade 3, StoredCorrelation 23, BrockBird 15, chemsepEq16 6, SatoRiedel 1). |
| SL-03 | Accepted: SatoRiedel and BrockBird are predictive and StoredCorrelation falls back per component to Brock-Bird (StoredCorrelation.cpp:46-56), so these legacy words are NOT pins of a record law of that name; 5.4's "a word = a pin of all" holds only for Andrade, Vogel and the two five-constant forms, case-insensitively. |
| SL-04 | Accepted (ruling 8): relaxing the missing-word refusal (ThermoPackageBuilder.cpp:2176) and deleting the three factory defaults (Andrade, StoredCorrelation, SatoRiedel) happen in ONE change. |
| SL-05 | Accepted (ruling 8): injected facts (Tc, Pc, omega, Tb into the vapour-pressure block, Component.cpp:531-542; the ideal-gas block into a liquid one for RowlinsonBondi, :775-779; a salt's liquidHeatCapacity read by the builder, ThermoPackageBuilder.cpp:765-766; `pureFluids` above a transport word) are decided per case of several laws: the PREFERRED ideal-gas law is the one injected unless the case pins another, printed. |
| SL-06 | Accepted for the printout: a joint's slope jump is reported as the jump in d ln Cp / d ln T (well conditioned where the slope is near zero); the joint is HELD on value only (ruling 5). |
| SL-07 | Accepted, and it changes the plan (ruling 8): no flip of water's preferred law in this campaign; 5.7 and the review plan are amended. |
| SL-08 | Corrected in 1.2: water.dat:296 is inside `cosmo{}`; the one entry inside `pcsaft{}` is propane.dat:149. |
| SL-09 | Added in 1.2: 34 more misfiled entries sit in sealed copies in 31 cases (30 in water's copy); the slice that moves the 74 moves these too, and its gate reads sealed copies. |
| OF-01 | Accepted as the target (addendum A1): every pure-component law becomes a per-component object built from the record (the vapour-pressure and heat-capacity shape, Component.cpp:543, :780-790); the package-level word for viscosity, conductivity and surface tension becomes the MIXING RULE only (with the legacy reading of 5.4 for old cases). |
| OF-02 | Accepted: a heat-capacity table is a `HeatCapacityModel` (Cp, H, S pure virtual, HeatCapacityModel.H:58-66) with its two integrals built at construction; it moves into slice (c) after the liquid-viscosity table (addendum A2), with the condition that 298.15 K is inside its domain and the needs listed there. |
| OF-03 | Accepted (addendum A3): the table is in THE RULING and the gate `check_record_primitives` is built in slice (b). |
| PD-01 | Accepted: the column's liquid viscosity, liquid diffusivity and liquid density are decided in the property dictionary (slices (a), (d) and the unit-block family of the column); today the run says so only afterwards. |
| PD-02 | Accepted: the one-dimensional table reader with units in src/core/Formula (used by rate laws) is the starting point of the table type of slice (c), not a second reader. |

Bound by [`thermophysical-property-routes.md`](thermophysical-property-routes.md)
(the twelve rules of its first section, its three amendment blocks and the
answers TR-01..21; "the kernel" and "rule N" below mean that page),
[`density-pilot-plan.md`](density-pilot-plan.md) (what was built for liquid
density) and [`what-water-dat-does-not-say.md`](what-water-dat-does-not-say.md)
(the water inventory of 2026-09-27, whose numbers are re-measured here).

Method.  Tree: `origin/main` at 83384f58c; every `file:line` is on it.
Counts by scripts kept outside the tree (`/tmp/claude-1000/c398/`:
`count_records.py`, `misplaced_prov.py`, `count_cases.py`,
`count_unit_keys.py`, `nasa9_joint.py`, `interp_psat.py`); runs by this tree's
`choupoProps` (built `make -j2 all`) on five scratch cases generated by
`make_water_cases.py` and read by `extract_water.py`.  No suite was run.  Other
systems are described by what they are; the comparative study that names them
is the private study of 2026-11 and stays outside the tree.

## 0. For a phone

* **RULED 2026-11-14: read THE RULING at the top first; it prevails over
  every bullet below.**

* **What the record holds today.**  ONE law per property for vapour pressure
  and the heat capacities (a `model` word in the block); for liquid viscosity
  and liquid conductivity a block of NAMED sub-blocks, one per form; surface
  tension one bare form.  5 of 402 viscosity records hold two forms
  (`andrade` + `vogel`), and in 2 of those (methanol, toluene) the "Vogel"
  form is the Andrade law with C = 0: two names, one law.
* **How a case chooses today.**  Vapour pressure and heat capacities: it does
  not, except by replacing the component record (a case-local copy or overlay)
  or by `pureFluids` for water.  Liquid viscosity and conductivity: ONE word,
  `transport { liquid { viscosity { model Vogel; } } }`, picks the SAME named
  sub-block in every record and REFUSES a record that lacks it -- the engine
  never mixes forms (the outside report that it does is false; measured below).
* **Water, measured** against IAPWS-IF97 (density, cp, p_sat) and IAPWS R12-08
  (viscosity): the record's Antoine is -0.07 % at 273 K, +2.5 % at 373 K,
  **+11 % at 473 K, +18 % at 573 K**; its liquid cp (a constant) -0.7 % ..
  **-26 % at 573 K, -56 % at 640 K**; Vogel viscosity within 2 % to 473 K,
  +9 % at 573 K, +43 % at 640 K; the liquid DENSITY is already the IAPWS-95
  reference equation on every route (the density pilot), within 0.006 %.
  358 shipped cases price water's vapour pressure on that Antoine.
* **Proposal in one line.**  A record may hold SEVERAL named laws for one
  property, each with its window (soft and hard), source and evidence, ONE of
  them named preferred; a law that covers ranges is ONE `piecewise` law with
  declared joints, never two laws switched by state; a `table` is a law like
  any other, in a record or declared by the case; the choice is made once at
  assembly, printed per unit and constituent, and leaving a window is an
  announced extrapolation (soft) or a refusal that names the alternative that
  covers the state (hard) -- never a silent change of law.
* **First slice moves no number**: the record reader learns the new shape and
  reads every existing block as a one-law list; the run prints which law each
  constituent took and where the state sat in its window; 74 provenance blocks
  that a curation tool filed inside the wrong block are moved home.
* **Rule, three decisions for the architect**: (1) the case may PIN a
  constituent's law or table in the property's own block (this narrows C397
  point 5, deliberately, because the owner's table requirement needs it);
  (2) water's preferred vapour-pressure law becomes the IAPWS equation, with
  the re-seal list; (3) the first table property is liquid viscosity, the
  second vapour pressure; heat-capacity and latent-heat tables wait.
* **Third head (5.5d).**  All packages are DEFINED and named in the case's one
  property dictionary; a package derives from one base and declares only its
  changes, the atom being the PROPERTY block (an `equilibrium` slot); process,
  sector, unit and props operation SELECT a package by name
  (`propertyPackage columnThermo;`); the 8 unit fragments, 5 sector
  dictionaries and 21 props fragments read on as anonymous derived packages
  until migrated; `sameAs` dropped; laws carry stable identifiers; a
  measurement checks or IS the method; a diffusivity states its kind and
  its multicomponent rule; the resolved view shows the thermodynamic route
  and separates where a choice was made from where the data came from.
  Acceptance test: section 10.
* **Second head (5.5c).**  The architect's rulings R1-R11, checked against the
  toolbox the dictionaries descend from and against the tree: ten followed;
  one amended (a table's `clamp` is refused even in a case, because a clamped
  table has a zero slope outside and no bound on its error; a bounded `extend`
  replaces it); one measured exception the rulings must reach (18 component
  overlays merge leaves, against the atomic-block rule).  New: a block-level
  `sameAs` reference between scopes, printed and sealed by hash; an effective
  dictionary per scope with every default used; a gate that passes the 227
  dictionary-shaped examples of docs/ai through the reader.

## 1. The record as it is (measurement A)

### 1.1 Blocks, readers, windows

| block (key in a component record) | records (of 696) | forms found | how the reader picks | one law or several | window field | outside the window | per-law provenance |
|---|---|---|---|---|---|---|---|
| `vaporPressure` | 543 | `model Antoine` 510, `AmbroseWalton` 32, `Wagner` 1 | the block's `model` word, `VaporPressureModel::New` (VaporPressureModel.cpp:61-79; registered :189-202); built once in `Component::readFromDict` (Component.cpp:524-551) | one | `Trange (lo hi)` in 511 | SOFT: announced once per model instance (VaporPressureModel.cpp:89-186), formula returned; ln P continued linearly in 1/T only beyond Tc or below the form's singular point (VaporPressureModel.H:127-134, VaporPressureModel.cpp:221-307; Antoine.H:61) | per property only: `provenance { vaporPressure {...} }` in 504 (Component.cpp:984-1010 reads one entry per property name) |
| `idealGasHeatCapacity` | 592 | numbered five-constant form (`chemsepCp16`) 355, `polynomial` 194, `NASA9` 43 | `model` word, `HeatCapacityModel::New` (HeatCapacityModel.cpp:65-91) | one; NASA9 is internally PIECEWISE (two ranges joined at `Tcommon`, NASA9Cp.cpp:66-69) | `Trange` 549 (NASA9: `Tlow Tcommon Thigh`) | SOFT, announced: PolynomialCp.cpp:163, ChemSepCp16.cpp:90-106, NASA9Cp.cpp:71-82 | per property, 123 |
| `liquidHeatCapacity` | 516 | five-constant form 335, `polynomial` 181 | as above (Component.cpp:762-781) | one | `Trange` 514, of which `Trange unknown;` 10 (announced at construction, PolynomialCp.cpp:91-120) | SOFT, announced | per property, 82 |
| `solidHeatCapacity` | 16 | `polynomial` 15, `NASA7` 1 | as above | one; NASA7 piecewise | `Trange` 15 | polynomial announced; **NASA7 has no window check at all** (NASA7Cp.cpp:38-52 reads `Tlow/Thigh`, nothing compares a T against them) | per property, 12 |
| `liquidViscosity` | 402 | sub-blocks: `chemsepEq101` 396, `andrade`+`vogel` 5, `andrade` 1 | the CASE's word picks the sub-block of that name in EVERY record (Andrade.cpp:42-53, Vogel.cpp:43-60, ChemSepVisc101.cpp:40-71); a record without it refuses, naming the forms it has (ChemSepVisc101.cpp:49-68) | several named forms, never chosen per record | `Tmin Tmax` inside the sub-block, 396 | five-constant form: SOFT, announced (ChemSepVisc101.cpp:82-95); **Andrade and Vogel: no window field and no check** | per property, 40 top-level -- one entry cannot say which of two forms it describes |
| `liquidThermalConductivity` | 381 | sub-block `chemsepEq16` 381 | as viscosity (ChemSepCond16.cpp:42-64; registered LiquidConductivityModel.cpp:68-70 with `SatoRiedel`, which reads no record block) | one form today | `Tmin Tmax`, 381 | SOFT, announced (ChemSepCond16.cpp:72-83) | per property, 26 |
| `surfaceTension` | 88 | bare `A B Tc n Tmin Tmax` | read only by `StoredCorrelation` (StoredCorrelation.cpp:44-82); a record without the block falls back to Brock-Bird, announced (:49-56) | one | `Tmin Tmax`, 88 | SOFT, announced (:71-82); refused at T >= the block's Tc (:63-67) | per property, 42 top-level |
| `Vliq` (+ `VliqT`) | 531 (22) | scalar | the density kernel's record leaves (density-pilot-plan.md section 1) | -- | -- | hard T < Tc | not per value |
| gas viscosity, gas conductivity, latent heat | 0 | -- | predictive models over Tc/Pc/omega/MW (Chung, Eucken, TransportModel.cpp:63-66, ThermalConductivityModel.cpp:68-71); the latent heat is Watson on Tc/Tb/HvapTb (Component.cpp:1400) | -- | -- | -- | -- |

Records holding more than one form of one property, per property
(`count_records.py`): liquid viscosity 5 (benzene, ethanol, methanol, toluene,
water: `andrade` + `vogel`), every other block 0.  The reader never picks
between them: the case's word does, for all components at once.

So the answer to "can water have several models with parameters for
temperature ranges" is, today: **for liquid viscosity, yes in form and no in
use** (the record holds two named forms; the case's one word picks the same
form for every component); **for vapour pressure and the heat capacities,
no** (one `model` per block); and the only laws that DO cover two temperature
ranges are the NASA7/NASA9 heat capacities, which are one law with a joint.

### 1.2 Findings in the record layer

1. **Two names, one law.**  `methanol.dat` and `toluene.dat` carry
   `vogel { A; B; C 0.0; }` with the same A and B as their `andrade`: a case
   that selects Vogel to get "the better three-parameter fit" gets Andrade
   for those two components and nothing says so.  (benzene, ethanol and water
   carry genuine three-parameter fits; NH3 carries Andrade only.)
2. **Windows that are not checked**: Andrade, Vogel and NASA7 read no window
   or never compare against it -- rule 7 is violated there today.  Of the
   others, every window is SOFT: nothing in the record layer refuses.
3. **74 provenance entries filed inside the wrong block.**  `transport_fit.py`
   inserts a property's provenance entry before the LAST closing brace of the
   file (bin/curate/transport_fit.py:561-565, the same at :766-770), assuming
   `provenance {}` is the last block.  Where `cosmo {}` or `pcsaft {}` follows
   it, the entry lands there: surface tension inside `cosmo{}` in 45 records,
   liquid viscosity in 18, liquid conductivity in 10, surface tension inside
   `pcsaft{}` in 1 (propane.dat:149; water.dat:296 is one of the `cosmo{}`
   ones -- corrected after review row SL-08).  And 34 more sit in SEALED copies
   in 31 cases, 30 of them in water's copy (review row SL-09).  The provenance reader never sees
   them (Component.cpp:984 reads the top-level block only), and the COSMO
   reader takes each as a parameter SET named `surfaceTension` etc. with
   default model and no profile (Component.cpp:1100-1135).  Nothing numeric
   reads them; the evidence and the fit grades of those fits are invisible to
   the run.  Fixed in slice 0 below.
4. **Water's laws.**  vapour pressure Antoine `Trange (273 373)`
   (water.dat:86-91), liquid cp the constant 75.5 J/(mol K) `Trange (273 373)`
   (:100-105), viscosity `andrade` and `vogel` with no window (:179-183),
   conductivity the five-constant form fitted to IAPWS R15-11 on 273-573 K
   (:200-212, provenance :238-248), surface tension fitted on 249.9-353.15 K
   (:214-222).  The header's statements (lines 3-17) are TRUE as measured
   below, except one word: "replacing this block is RESERVED for Vitor" is
   superseded by CLAUDE.md rule 00 (the architect decides, with the moved-row
   list written).

## 2. How a case chooses today (measurement B)

Over the 600 shipped `constant/thermoPhysPropDict`: top-level keys
`equilibrium` 572, `transport` 86, `caloric` 37, `aqueousProperties` 28,
`approximations` 13, `pureFluids` 12 (all `water { method IF97; }`),
`inherits` 5, `volumetric` 1.  Selectors written:

| property | the key that selects (case level) | written in | what the word means | a record's own form honoured? |
|---|---|---|---|---|
| vapour pressure | none; `pureFluids { water { method IF97 \| Helmholtz; } }` replaces the record's curve for that component (ThermoPackage.cpp:146-153 through SaturationCurves) | 12 cases | -- | the record's one law is THE law; a case changes it only by a case-local record or overlay (Database.cpp:444-466; one case does: `evaporator10_naoh_triple_effect` carries water on `Wagner`) |
| ideal-gas / liquid / solid cp | none (`caloric {}` declares routes per phase, not the law) | -- | -- | yes, the one law |
| gas viscosity / conductivity / diffusivity | `transport { vapour { viscosity { model W; } ... } }` | Chung 61, ChapmanEnskog 1; Eucken 24, modifiedEucken 1; Fuller 32 | a predictive model for all components; no record law exists | n/a |
| liquid viscosity | `transport { liquid { viscosity { model W; mixingRule R; interaction (...); } } }` (ThermoPackage.cpp:495-543) | Vogel 20, Andrade 2; `mixingRule` written in 0 cases (default GrunbergNissan, C331) | BOTH: the word selects the PURE-component sub-block of that name in every record (ThermoPackage.cpp:2187-2189), `mixingRule` the mixture rule (LiquidViscosityMixingRule.cpp:256-257) | no: overridden by the word, refused when absent |
| liquid conductivity | `transport { liquid { thermalConductivity { model W; mixingRule R; } } }` | SatoRiedel 5 | as viscosity | as viscosity |
| liquid diffusivity | `transport { liquid { diffusivity { model WilkeChang; } } }` | 0 at case level | one model | reads `associationFactor` and the viscosity |
| surface tension | `transport { interface { surfaceTension { model W; mixingRule R; } } }` | BrockBird 29 | `StoredCorrelation` reads the record's block; BrockBird ignores it | only under `StoredCorrelation` |
| liquid density | none needed: the kernel resolves by facts; `volumetric { liquid { measured {...} } }` marks a measurement (Measured.cpp:95-106) | 1 case | -- | yes (record leaves), and the reference equation wins by fact for water, CO2, CH4, N2 |

**Measured, the refusal (scratch case `generic_eq101`):** `model chemsepEq101;`
with water -> *"component 'water' has a liquidViscosity block but no
`chemsepEq101 { A; B; C; D; E; }` sub-block.  It declares: andrade, vogel --
select one of those instead"*.  So a case with methanol (Andrade/Vogel),
isopropanol (five-constant form only) and water cannot be priced by any one
word today: `Vogel` refuses isopropanol, `chemsepEq101` refuses methanol and
water.  The engine does not mix forms silently; it cannot mix them at all.
And `pureFluids { water { method Helmholtz; equation IAPWS95; } }` makes the
liquid viscosity REFUSE (*"this pure-fluid kernel does not ship a transport
release"*, scratch case `iapws95`) rather than fall back to the record.

**Precedence of records** (Database.cpp:420-466): an inline or case-local file
beats the standards, which beat `data/local/`; a case-local file without
`overlayOf` REPLACES the record key by key at top level (a whole
`vaporPressure` block), with `overlayOf` it deep-merges the declared leaves.
In a sealed case (353 of the 371 water cases) every record IS case-local.

**The levels that replace the case's dictionary** (the multi-level structure):

| level | how | what may be repeated | what "replaces" means | shipped |
|---|---|---|---|---|
| unit | `thermo {}` in the unit's block (Flowsheet.cpp:2100-2160, ThermoOverride.H:30-58) | `equilibrium`, `caloric`, `volumetric`, `transport`, `pureFluids` | `equilibrium`: per slot (liquid / vapour / aqueous / EoS), or whole if the formulation changes; the other four: the whole block; components stay global; announced (`[thermo-override]`) | 7 flowsheets, 8 blocks, ALL `equilibrium` only (acetonePlant, hda, basis01, perUnitThermo01 x2, flash20, crystalliser09) plus 1 nested unit (esterification2sector SEPARATION/flash) |
| sector / owning node | its own `constant/thermoPhysPropDict` with `inherits` (Flowsheet.cpp:815-830) | a complete system resolved through `inherits` | the node's effective system | 5 sector dictionaries, one plant (lithiumBrinePlant: FINISHING, BRINE, CARBONATION, HOTAIR, EXTRACTION), each restating `equilibrium` and a component subset |
| property operation | `thermo {}` in a props op (PropertyOperation.cpp:136-171) | the same fragment keys | as the unit | 21 propsDicts; the comparison cases use it to put two laws side by side (`compare_visc_liquid_water`: Andrade in one op, Vogel in the next) |

No shipped unit or sector replaces a transport block today.  The banner a unit
prints (Flowsheet.cpp:1114-1128) lists the override's keys and one `model`
word; it does not say which law each constituent took.

## 3. Values and models outside the property dictionary (measurement C)

From the units' readers (keys looked up in an `operation {}` or pass block)
and from the slice-0 declarations (PropertySourceDeclarations.cpp:33-89, the
`declared` class) and the liquid-property ratchet
(bin/curate/liquid_property_ratchet_debt.tsv, 44 pinned sites in 36 files).
Shipped cases counted by key in `system/` dicts (`count_unit_keys.py`; a key
match, read back by hand: the Williams-Otto `mu` is a molar flow, not a
viscosity, and is excluded).

| where (file:line) | key | property | shipped cases writing it | destination proposed |
|---|---|---|---|---|
| DistillationColumn.cpp:5072-5073 (tray efficiency), :5574-5575 (packing) ; RateBasedSegment.cpp:233-234 | `liquidViscosity` | liquid viscosity, a VALUE | 15 distillation cases (packing01-04, ratebased01-04, trayEfficiency01-03 and the Yanagi family) | a measurement (or table) of the case in `transport.liquid.viscosity` (C397 point 2) |
| SprayDryer.cpp:126-131, :397-424 | `liquidViscosity`, `surfaceTension`; default 1e-3 Pa s and 0.072 N/m | values + literal defaults | 1 (apalutamide01, declared "ASSUMED") | measurement / table of the case; the two literals become refusals |
| Pipe.cpp:266-268, :278-279, :330-360, :481-483 | `viscosity`, `gasViscosity`, `surfaceTension` | liquid and gas viscosity, surface tension | 1 (pipe02) | as above; gas viscosity to `transport.vapour.viscosity` |
| SpiralWoundModule.cpp:320-321, :341, :348 ; RatedTestInversion.cpp:224-225 | `rho_feed`, `viscosity`, `diffusivity` | density, viscosity, solute diffusivity | about 12 membrane cases + swro01 | density to the kernel (already the path for most); viscosity and diffusivity to `transport.liquid` (diffusivity names solute and medium, TR-13) |
| SpiralWoundModule.cpp:634-640 ; BatchDiafilter.cpp:103-110 | `osmotic { model vanHoff \| Pitzer; Cphi ...; }` | a THERMODYNAMIC MODEL (water activity) and its parameters inside a unit | 4 (membrane06, diafilter01-03) | the osmotic pressure is a property of the solution: `equilibrium.aqueous` (the activity model the case already declares); a unit-level override goes through `thermo {}` |
| BatchDiafilter.cpp:145-159 | `rho` | density | 3 | the kernel |
| FixedBedAdsorber.cpp:224-225, :576 | `muGas`, `solidHeatCapacity` | gas viscosity; the adsorbent's cp | 1 ; 6 | gas viscosity to `transport.vapour`; the adsorbent's cp belongs to its ASSET record (a solid's property, not the fluid package's) |
| PFR.cpp:1946-1953 | `coolant { cp; }` | a utility fluid's cp | 1 (pfr05) | already exclusive with `utility` (a utility record); keep as the declared utility property, or require the utility record |
| BellDelaware.cpp:193-196 | `rho mu lambda cp` | a bench's fluid properties | props benches only | stays: a bench states its fluid by hypothesis; printed as declared |
| TrayHydraulics.cpp:164 | `hydraulics { sigma; }` | surface tension | 1 (aceticAcid02_plant) | `transport.interface.surfaceTension` measurement / table |
| PipeHeaderSize.cpp:176-199 ; CleanUtilitiesPass.cpp:126-127, :324 | `viscosity`; `air { density heatCapacity }`, `fluid { density }` | post-processing fluid properties | 4 (the tablet plants) | air and clean-utility fluids are UTILITY records (data/standards/utilities); the pass names the utility |
| CatalystBedSize.cpp, Catalyst.cpp, Screen.cpp, RatedMachineSize.cpp | `catalystBulkDensity`, `rho_bulk`, `rho_particle`, `bulkDensity`, `trueDensity` | solid / bulk densities of a material | several | NOT thermophysical properties of a fluid: asset or material records; out of C397's scope |
| C++ correlations built in a unit: DistillationColumn.cpp:5175-5189, :5586-5627 ; RateBasedSegment.cpp:263, :400-401 | Wilke-Chang constructed in the unit | liquid diffusivity | every rate/efficiency case | `transport.liquid.diffusivity` with the composition rule beside it (C397 point 3) |
| Atomizer.H:86 | `muGas = 1.8e-5` literal | gas viscosity | spray dryers | the package's gas viscosity |
| SaturatedVapour.cpp:150-158 | the record's constant `Vliq` in the Poynting factor | liquid volume | every gamma-phi case with Poynting | stays a record leaf; announced when a case declares a density table (section 6.5) |

The liquid-density literals (the ratchet's `literal` and `vliq` classes) are
the density kernel's own migration and are not repeated here.

## 4. Water in numbers (measurement D)

Runs: `choupoProps` `propertyPoint` on pure water at the T and P below (P above
IF97's p_sat so the state is liquid), on four routes of this tree: the generic
record route (Antoine; Vogel or Andrade viscosity), `pureFluids { water {
method IF97; } }`, and `method Helmholtz; equation IAPWS95;`; the reference is
the same tree's IF97 kernel (`steamTables` at the same T and P: p_sat, rho, cp;
verified against the release's tables on every run) and IAPWS R12-08 on the
IF97 route for viscosity (at the saturated liquid, the route's convention).
Liquid cp of the record is its one coefficient, 75.5 J/(mol K), compared with
IF97's cp x 18.015.

| T (K) | P | p_sat IF97 | Antoine (record) | IAPWS-95 route | rho IF97 (kg/m3) | rho generic route | cp IF97 J/(mol K) | record cp 75.5 | mu R12-08 (mPa s) | Vogel | Andrade |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 273.16 | 0.1 MPa | 611.66 Pa | -0.07 % | -0.0004 % | 999.84 | -0.000 % | 76.01 | -0.7 % | 1.791 | -2.0 % | -12.2 % |
| 298.15 | 0.1 MPa | 3169.7 Pa | -0.09 % | +0.006 % | 997.05 | -0.000 % | 75.34 | +0.2 % | 0.890 | -0.0 % | +1.9 % |
| 323.15 | 0.1 MPa | 12351 Pa | +0.23 % | +0.006 % | 988.05 | -0.001 % | 75.29 | +0.3 % | 0.547 | -0.3 % | +4.1 % |
| 373.15 | 0.2 MPa | 101418 Pa | +2.47 % | +0.000 % | 958.40 | -0.001 % | 75.96 | -0.6 % | 0.282 | +0.1 % | -4.1 % |
| 473.15 | 2 MPa | 1.5547 MPa | **+10.95 %** | +0.017 % | 865.01 | -0.001 % | 80.91 | -6.7 % | 0.135 | +2.2 % | -27.4 % |
| 573.15 | 10 MPa | 8.5877 MPa | **+18.10 %** | +0.002 % | 715.29 | -0.000 % | 102.35 | **-26.2 %** | 0.0859 | +9.2 % | -41.3 % |
| 640.00 | 25 MPa | 20.266 MPa | **+18.20 %** (23.95 MPa, above the critical pressure) | -0.004 % | 557.95 | +0.006 % | 171.23 | **-55.9 %** | 0.0552 | +43.2 % | -34.3 % |

Every law the tree can evaluate for water today, with its window:

| property | law | where | window stated | evidence |
|---|---|---|---|---|
| vapour pressure | Antoine | water.dat:86-91 | 273-373 K, soft | the header's measurement (SR1-86): +2.47 % at 373.15 K, and the table above |
| | Wagner (SR1-86 Eq. 1) | opt-in by case-local record; shipped only in evaporator10 | 273.16-647.096 K | 1.1e-7 against SR1-86 Table 1 (what-water-dat-does-not-say.md section 3.2) |
| | IF97 region 4 | `pureFluids { water { method IF97; } }` (12 cases) | 273.15-647.096 K | the release's verification tables |
| | IAPWS-95 | `method Helmholtz; equation IAPWS95;` | the record's | its own checks; -0.004..+0.017 % against IF97 above |
| liquid density | IAPWS-95 by fact (reference-equation leaf), IF97 when selected, record `Vliq` routes | density kernel | hard: liquid branch, T < Tc | within 0.006 % of IF97 above |
| liquid cp | constant 75.5 | water.dat:100-105 | 273-373 K, soft | the table above: -26 % at 573 K |
| | IF97 / IAPWS-95 | pure-fluid route (h, s, cp of the pure fluid) | as the formulation | the formulation's |
| liquid viscosity | Andrade, Vogel | water.dat:179-183 | NONE stated, none checked | the table above |
| | IAPWS R12-08 | IF97 route only | the release's | verified on every run (IAPWSTransport) |
| liquid conductivity | five-constant form fitted to R15-11 | water.dat:200-212 | 273.16-573.15 K, soft | RMS 0.14 %, max 0.64 % (its provenance) |
| | IAPWS R15-11 | IF97 route | the release's | verified on every run |
| surface tension | stored fit | water.dat:214-222 | 249.9-353.15 K, soft | AAD 0.54 %, max 2.7 % in sample (provenance misplaced, finding 3) |
| | IAPWS R1-76 | IF97 route | saturation line | the release's |
| latent heat | Watson on Tc/Tb/HvapTb | Component.cpp:1400 | none | +1.33 % at 298 K, -2.65 % at 523 K (what-water-dat-does-not-say.md) |

Two more facts from the same runs.  The extrapolation of Antoine above 373 K
was announced ONCE, at 373.15 K; the excursions to 640 K (+18 %, a vapour
pressure above the critical pressure) produced no further line, because the
latch is per model instance (VaporPressureModel.cpp:91, :108-109) -- the
first excursion silences the larger ones.  And the density row shows what the
pilot already achieved for one property: the best method won by FACT, with no
case declaration and no golden moved.

Water's vapour pressure in the corpus: **371 shipped cases** name water; **358**
price its vapour pressure on that Antoine (353 sealed copies under
`constant/components/`, 5 on the catalogue), 12 on IF97, 1 on Wagner
(`count_cases.py`).  The flip was measured once on a 102-case sample at
741b759aa: 38 cases moved, 268 rows, `column05_reactive_methylacetate` stopped
converging (what-water-dat-does-not-say.md section 4).  That measurement is
two months old and must be retaken on staged copies before any flip; nothing
was re-recorded here.

## 5. The proposal

### 5.1 A record may carry several laws for one property

(Ruling points 4 and 8: the laws go inside the existing block and the old
shape reads unchanged, as below; but in the water example `preferred` stays
on the present law in this campaign and `SR1` is a named alternative.)

Grammar (load-checked against the corpus form of water.dat, the `cosmo {}`
named-set precedent and the existing viscosity sub-blocks; rule 1 of the
record skill is kept because the laws are METHODS of one quantity, of which
exactly one is the record's value -- the preferred -- and the others are
named, never summed or averaged):

```
vaporPressure
{
    preferred   SR1;                           // the record's one value of this property
    SR1
    {
        model         Wagner;
        reducing      { T 647.096 K;  P 22.064 MPa; }
        exponents     (1 1.5 3 3.5 4 7.5);
        coefficients  (-7.85951783 1.84408259 -11.7866497 22.6807411 -15.9618719 1.80122502);
        window        { soft (273.16 647.096); hard (273.16 647.096); }   // K
        provenance    { origin literature; citation "IAPWS SR1-86(1992), Eq. 1"; uncertainty "1e-7 vs its Table 1"; }
    }
    antoine
    {
        model         Antoine;
        coefficients  (5.40221 1838.675 -31.737);
        window        { soft (273 313); hard (250 373); }
        provenance    { origin literature; citation "..."; uncertainty "+2.47 % at 373.15 K vs SR1-86"; }
    }
}
```

* Each law: `model`, its coefficients, `window { soft; hard; }`, its own
  `provenance` (origin, citation, uncertainty, evidence) -- per LAW, which the
  per-property provenance of today (Component.cpp:984) cannot express.
* `preferred` is required when there are two or more laws and absent when
  there is one (the amplifier rule: with one law there is no other value).
* The OLD shapes are read unchanged: a block with a `model` word is a one-law
  list whose law is unnamed and preferred; `Trange` is its soft window; the
  viscosity and conductivity blocks of named sub-blocks are lists of laws
  named by their form, with no `preferred` (section 5.4 says what that means).
* How it fits the kernel: a law of a record is a METHOD (rule 2); the
  record's preferred law is "a record's law" in rule 4's order; its window is
  rule 7's domain; its provenance is rule 11's evidence.

### 5.2 The choice, once, and what happens at the edge

**"Applicable" is a fact of the DATA, never of the state.**  At assembly, per
(world, component, property), the law is: the case's pin if any (5.3), else
the record's preferred.  The state never takes part: the density pilot already
resolves per constituent set at the first request and freezes it for the run
"never by T, P or the amounts" (docs/ai/thermophysical-properties.md section
3b), and the same rule is adopted here, moved to assembly (TR-15).  The order
of a list of laws is NEVER a switching policy.

**At the edge**, at every evaluation (rule 7):
* inside the soft window: the value; the run's table counts where the state
  sat (lowest and highest T seen, accepted states only, TR-04);
* between soft and hard: an announced extrapolation, once per law and site,
  stamped trial or accepted (the PO-02 rule of VaporPressureModel.cpp:96-109),
  and the LARGEST accepted excursion is what the table reports -- not the
  first, which is what hides the 640 K case today;
* beyond hard: a typed domain error (`PropertyDomainError`), rejectable by a
  solver in transit; at a converged state the run fails with the remedy,
  which the engine COMPUTES and names: *"vapour pressure of water: law
  `antoine` refuses T = 473.15 K (hard window 250-373 K); law `SR1` of the
  same record covers it -- pin it, or extend the law"*.  It names; it never
  switches.

**Several ranges are ONE law.**  The owner's "several models with parameters
for temperature ranges" is written as `model piecewise;` with its pieces and
its joints declared:

```
liquidHeatCapacity
{
    model   piecewise;
    pieces
    (
        { upTo 373.15 K;  law { model polynomial; coefficients (...); } }
        {                 law { model polynomial; coefficients (...); } }
    )
    joints  { value continuous; slope announced; }
    window  { soft (273.16 600); hard (273.16 640); }
    provenance { origin regressed; citation "..."; }
}
```

The branch the state falls in is evaluated; the law is chosen once.  NASA7 and
NASA9 are already this (NASA9Cp.cpp:66-69, H and S integrated across the
joint, :128-131).  Measured over the 43 NASA9 records (`nasa9_joint.py`): the
value of Cp is continuous at `Tcommon` to the printed precision in all 43; the
SLOPE is not constrained (median jump 2.6 % of the low-side slope).  That is
the right contract and the gate proposed for every piecewise law:

| property | continuity required at a joint, checked by a curation gate | why |
|---|---|---|
| heat capacities | value (C0), relative 1e-6 | the energy balance differentiates H; Cp C0 makes H C1, which is what a Newton on T sees |
| vapour pressure (SUPERSEDED by the ruling, point 5: every joint is held on VALUE only; the slope jump is printed as d ln y / d ln T) | value AND slope of ln P against 1/T (C1) | bubble/dew Newtons use d ln P / dT directly; the engine already demands C1 of its own continuation (VaporPressureModel.cpp:221-266) |
| transport properties, surface tension | value (C0) | read at converged states or in outer loops; a slope jump is announced in the law's printout |

**Two laws switched by state: rejected.**  It breaks rule 4, the switch point
is undeclared and unchecked (a jump of 2.5 % in p_sat, the two water laws'
difference at 373 K, is a discontinuous residual on which a bubble-point
Newton can chatter), and the run could not say which law produced a converged
number without the state.  A piecewise law has the same physics, a declared
joint and a gate.  Not measured on a flash across a joint, because no law in
the tree today switches by state and a joint with C1 has nothing to show.

### 5.3 The case chooses by an explicit act, beside the property

The outside reading (input 3) is right: an exception belongs beside the
property it changes.  One shape for every property block; the author writes
only exceptions, the run prints every choice:

```
transport
{
    liquid
    {
        viscosity
        {
            mixingRule   GrunbergNissan;           // the mixture: how pures combine (C331, unchanged)
            constituents                             // per pure, only what departs from the records
            {
                water     { law vogel;  reason "the record prefers its five-constant fit; vogel is within 2 % of R12-08 to 473 K"; }
                glycerol  { table glycerolMu;  replaces { law chemsepEq101; }  reason "our supplier's lot, measured"; }
            }
            measured                                 // a measurement or table of one constituent SET
            {
                brine20Mu { use method;  replaces { method composite; }  reason "..."; }
            }
        }
    }
}
```

(Since 5.5d these blocks sit in a named package of the case's one property
dictionary; a sector or unit selects the package and defines nothing.)
The homes, one per property, all of them blocks a unit's `thermo {}` may
already replace (ThermoOverride.H:93-97) and a sector's dictionary may carry:

| property | block |
|---|---|
| liquid density | `volumetric.liquid` (as built: `measured`, Measured.cpp:95-106) |
| liquid / gas viscosity, conductivity, diffusivity; surface tension | `transport.liquid.<p>`, `transport.vapour.<p>`, `transport.interface.surfaceTension` |
| vapour pressure | `equilibrium.liquid.vaporPressure` (the liquid's reference fugacity is where p_sat enters; a unit replaces `equilibrium.liquid` per slot) |
| heat capacities | `caloric.<phase>.heatCapacity` |

**This narrows C397 point 5 on purpose.**  C397 declined "a per-component model
selector written in the case" until it had gone through the record rules; this
record is that passage.  What is adopted is narrower than what was declined:
the case cannot invent a law, only NAME a law that the record carries or a
table that the case supplies with its source; each pin carries a `reason`;
the run prints the preferred law it displaced and, where both are valid, both
values and the deviation (rule 5).  Without it the owner's table requirement
cannot be met for a pure component.

**One resolved view** (input 1).  The run prints, per unit and per
constituent and property: the level whose block was used (case / sector /
unit / op), the law or table, its window and where the accepted states sat,
and what that level replaced -- generated from the resolver, extending the
slice-0 table (PropertySourceLog) and the unit banner (Flowsheet.cpp:1114-1128),
and the app shows the same rows.  `bin/choupo-lint` lists every level at which
a property block is declared.

### 5.4 The one-word selectors of `transport {}`: zero numbers moved

Today's `model Vogel;` means "pin the `vogel` form of every constituent" and
refuses a constituent without it.  That reading is KEPT, word for word, as the
meaning of the legacy key: a `model` word in a liquid property block = a pin
of the law of that name for every constituent, with today's refusal.  The new
reading applies only when the block has no `model` word: each constituent
takes its record's preferred law, mixed by `mixingRule`.  The 22 shipped cases
that write a liquid viscosity word therefore read exactly as before, and a
record without `preferred` (all 402 today) keeps refusing to be priced without
a word, as today.

Proof, before the reader changes: the characterisation bench of TR-16 --
every component record x every registered law, old call against new, bit for
bit, recorded on main first; then the 22 Vogel/Andrade cases, the 5 SatoRiedel
cases, the 29 BrockBird cases and `transportBench` byte-identical in their
results.  Only after that does the catalogue gain `preferred` words, record by
record, each with the cases it moves listed.

### 5.5 The method `table` (the owner's requirement)

**What it is.**  A property given as points for a stated SYSTEM -- a pure
component, or one mixture at a stated composition -- against stated
independent variables, T first.  A method like any other: in a record as a
LAW (`model table;`), so a curated table lives in the catalogue with its
source; or declared by the case in the property's own block, by name, the
points in a file of the case.  The pilot's measurement file
(`constant/experiments/<name>.dat`: `provenance`, `system`, `property`,
`columns` with units, `data`, `uncertainty`, `box`) is the format; a table is
that file with more than one point and an interpolant.  One point stays the
pilot's `measured` (constant in its box).

**Interpolants** (declared; the default named in the run):

| word | interpolates | default for | what a solver sees |
|---|---|---|---|
| `linear` | y against T | cp, conductivity, surface tension, density | value continuous, slope jumps at every node |
| `linearLog` | ln y against 1/T | vapour pressure, liquid viscosity | value continuous, slope of ln y jumps at nodes; exact for an Antoine-like curve between nodes |
| `monotoneCubic` | Fritsch-Carlson in the same variables as the default | -- | C1, monotone between nodes, no overshoot |

Measured on water's saturation curve (`interp_psat.py`, SR1-86 points 300-600 K):
at 10 K spacing the worst mid-point error is **3.5 %** for linear-in-P,
**0.064 %** for `linearLog`, 0.031 % for `monotoneCubic`; at 25 K spacing
19.6 %, 0.38 % and 0.18 %.  The chord slope of ln P jumps -4.8 % across a node
at 10 K spacing (-11.6 % at 25 K): a bubble-point Newton converging next to a
node sees two slopes, and since the function is continuous and monotone it
still converges, but its quadratic rate is lost there.  Linear in P is not
offered for a vapour pressure.

**Rules** (rules 4, 5, 7, 8, 10 applied):
1. The domain is the first and last point and it is HARD (rule 7, TR-01): no
   extrapolation, ever.  Outside: a domain error naming the table, the state
   and the remedy (*"table glycerolMu covers 283.15-353.15 K; T = 371.2 K is
   outside: extend the table, or pin a law"*).  Inside: the table row prints
   the bracket the accepted states fell in.
2. It displaces a catalogue method only by an explicit act (`replaces`,
   rule 4); both values and the deviation are printed wherever both are
   valid; beyond the catalogue method's stated uncertainty the disagreement is
   a counted finding (rule 5).
3. Every column carries its unit and is converted and dimension-checked as a
   dictionary scalar is; `provenance` with a source is mandatory; abscissae
   strictly monotonic (equal or decreasing refused); at least 4 points for
   `linear` and `linearLog` and 5 for `monotoneCubic` (two points are a
   correlation: write the law); a non-positive ordinate refused for the log
   interpolants.
4. Second variable: NOT in the first slice.  A mixture table is at ONE stated
   composition (its `box` in composition, as the pilot's measurement), so a
   stream at another composition is outside the hard domain.  P or a
   composition coordinate as a second axis is a 2-D table (bilinear on a
   rectangular grid, with the same hard edges): about the cost of the
   solution-law forms of the pilot, decided when a case needs it.

Worked example, a pure component (case-declared):

```
// constant/experiments/glycerolMu.dat
provenance  { source measured; citation "..."; doi "..."; }
system      ( glycerol );
property    liquidViscosity;
columns     ( { name T; unit K; } { name mu; unit Pa.s; } );
data        ( 283.15 3.90  293.15 1.41  303.15 0.612  313.15 0.284  323.15 0.142  333.15 0.0813  353.15 0.0317 );
uncertainty 2 %;
```
```
// constant/thermoPhysPropDict
transport { liquid { viscosity
{
    constituents { glycerol { table glycerolMu; interpolation linearLog; replaces { law chemsepEq101; } reason "the lot we process"; } }
} } }
```

Worked example, a mixture at fixed composition:

```
// constant/experiments/brine20Mu.dat
provenance  { source measured; citation "..."; }
system      ( NaCl water );
property    liquidViscosity;
solvent     water;
columns     ( { name T; unit K; } { name mu; unit mPa.s; } );
composition { w[NaCl] 0.200; }
data        ( 293.15 1.56  303.15 1.26  313.15 1.04  323.15 0.88  333.15 0.76 );
uncertainty 1.5 %;
box         { w[NaCl] ( 0.199 0.201 ); P ( 50e3 1500e3 ); }
```
```
transport { liquid { viscosity
{
    measured { brine20Mu { use method; interpolation linearLog; replaces { method composite; } reason "our brine"; } }
} } }
```

(The numbers in the two examples illustrate the grammar; they are not
curated and carry no claim.)

The same table as a LAW of a record, inline (a few points) or by file, under
the one shape of 5.1 (a law = a type word and that type's data):

```
liquidViscosity
{
    preferred   iapwsPoints;
    iapwsPoints
    {
        model          table;
        interpolation  linearLog;
        columns        ( { name T; unit K; } { name mu; unit Pa.s; } );
        data           ( 273.16 1.791e-3  298.15 0.890e-3  323.15 0.547e-3  373.15 0.282e-3  473.15 0.135e-3 );
        //  or:  file "tables/water-liquidViscosity.dat";   (a file beside the record, same columns)
        provenance     { origin literature; citation "IAPWS R12-08, evaluated at the saturated liquid"; }
    }
    vogel { model Vogel; A -10.5366; B 541.4; C 144.0; window { soft (273 473); hard (273 573); } provenance { ... } }
}
```

For a record's table the window IS the first and last abscissa, hard, and is
not written (a field with one possible value is not a setting).

**Properties that are not independent** (input 5): what the engine derives,
what it keeps, where it must announce.

| tabulated | derived from the table, printed as derived | kept from elsewhere | announced inconsistency |
|---|---|---|---|
| vapour pressure | d ln P / dT, used by bubble/dew Newtons; the table's normal boiling point | the latent heat stays Watson (Component.cpp:1400) and the liquid enthalpy keeps its 298.15 K bridge (Component.cpp:1223-1229) -- the one enthalpy base untouched | at every node, Clausius-Clapeyron's -R d ln P / d(1/T) (ideal gas, liquid volume neglected, both said) beside the Watson latent heat; and the table's boiling point beside the record's `Tb`; beyond a stated tolerance, a finding |
| liquid cp | the liquid enthalpy's sensible leg, integrated exactly over the interpolant (piecewise-linear integrates in closed form; so does its entropy, a ln T + b T per segment) | the formation datum and the 298.15 K bridge (h_formation, Component.cpp:1186-1260): ONE enthalpy base | the table must contain 298.15 K in its hard domain, or the liquid enthalpy cannot be formed and the method refuses by name |
| liquid density | the density only | the Poynting factor keeps the record's constant `Vliq` (SaturatedVapour.cpp:150-158) | the run prints the Poynting volume beside the table's volume at T, with the deviation |

**Refused in the first slices, and why:** heat capacities (they enter every
enthalpy and entropy through the datum; a hole in a table becomes a hole in an
energy balance); the latent heat (no record block exists, and the engine
carries two latent heats already -- the surface's and Watson's,
what-water-dat-does-not-say.md item 3 -- a third would be decided with them);
ideal-gas cp (formation integrals, Gibbs, equilibrium constants); any 2-D
table.  **First property: liquid viscosity** (no other property is derived
from it, every consumer reads it at a state, and 15 shipped cases already carry
a measured value in the wrong place); **second: vapour pressure**, with the
derived-and-announced column above.

### 5.5b The stylistic ancestor, read on this point

At the owner's request the open CFD toolbox whose dictionary style this
project follows (OpenFOAM, development line) was read on 2026-11-14 at
`src/thermophysicalModels/thermophysicalProperties/liquidProperties/liquid/liquid.H`,
`src/OpenFOAM/primitives/functions/Function1/Table/Table.H` and `Table.C`,
`src/OpenFOAM/primitives/functions/Function2/UniformTable2/UniformTable2.H`
and `UniformTable2.C`, `src/thermophysicalModels/specie/thermo/hTabulated/hTabulatedThermo.H`,
`src/thermophysicalModels/specie/transport/tabulated/tabulatedTransport.H`
and `src/thermophysicalModels/specie/equationOfState/rhoTabulated/rhoTabulated.H`.

| what it does | read at | taken / not |
|---|---|---|
| A liquid holds ONE run-time selected function of T per property (`rho_ pv_ hl_ Cp_ h_ Cpg_ B_ mu_ mug_ kappa_ kappag_ sigma_ D_`, each an `autoPtr<Function1<scalar>>`), and a scalar `hf_` | liquid.H | TAKEN as the organising idea: a property block is a function of a selectable TYPE with that type's data, and a table is one type among the correlations (5.1, 5.5).  What it changes here: the bare surface-tension block and the `model`-word blocks become the same shape as the named viscosity sub-blocks -- one shape, several named instances, one preferred.  NOT taken: one function per property and no alternatives; here the record may hold several, because the case must be able to name the one it uses |
| The generic table: points inline or from a file (native or CSV); `interpolationScheme` (default `linear`, Table.C); `outOfBounds` with `clamp`, `zero`, `repeat`, `error`, `warn`, DEFAULT `clamp` (Table.C, `lookupOrDefault("outOfBounds", ... clamp)`) | Table.H, Table.C | TAKEN: inline or file, declared interpolation with a named default.  REJECTED: a default (or any option) that clamps, zeroes or repeats -- a state outside a case's table is a refusal with its remedy (rule 7, TR-01) |
| Tabulated thermo, transport and equation of state for a pure species: UNIFORM 2-D tables against (p, T), `low (p T); high (p T); values m n (...)`, bilinear; outside the range a FATAL error (`checkRange`, UniformTable2.C), not a clamp | UniformTable2.H/.C, hTabulatedThermo.H, tabulatedTransport.H | TAKEN for a later slice (2-D tables, 5.5 rule 4), and its refusal outside the range is the same rule as here.  (The architect's first reading said "clamp" for these; the source says the 2-D tables refuse and only the 1-D generic table clamps by default) |
| The tabulated energy table is the SENSIBLE part, beside scalar formation data `hf`, `sf` | hTabulatedThermo.H | consistent with the one enthalpy base: a tabulated cp or sensible enthalpy here would be the sensible leg only, beside the record's formation datum (5.5, the dependent-properties table) |
| Tabulated density derives NO thermodynamic contribution ("not sufficiently accurate", h, Cp, e, Cv not implemented) and must be paired with tabulated energy and cp | rhoTabulated.H | TAKEN as the precedent for "derive nothing from a table unless the derivation is announced": here the slope of a tabulated vapour pressure is used only by the Newtons that need d ln P / dT, and the latent heat it implies is PRINTED beside Watson, never substituted (5.5); a tabulated density does not enter Poynting |

No source is required by the toolbox for a table; here a table without a
source is refused.

### 5.5c What is taken from the toolbox this project's dictionaries descend from, and what is not (the architect's rulings R1-R11)

The open CFD toolbox whose dictionary style this project follows (OpenFOAM,
development line, commit fed424ace4) was read in full on the property,
mixture, reaction, diffusion and dictionary questions; the reading notes and a
synthesis table per theme are private (the private study of 2026-11).  The
files that carry each point are named below by their path in that tree
("TM/" = `src/thermophysicalModels/`).  Each ruling is marked FOLLOWED,
AMENDED or CONTRADICTED with the measurement.

| # | ruling (short) | the toolbox | Choupo today (measured) | verdict here |
|---|---|---|---|---|
| R1 | one shape for every property block: a type word and that type's data, plus window (soft, hard), source, several NAMED laws with one preferred; a table is a type; an unknown type lists the types valid for THAT property | one function object per property, `{ type <word>; ... }` (`src/OpenFOAM/primitives/functions/Function1/Function1/Function1New.C`; `TM/thermophysicalProperties/liquidProperties/liquid/liquid.H`, 13 slots), no window, no provenance, no alternatives | three shapes (section 1.1); each property has its own factory, so a factory's list is already per property (VaporPressureModel.cpp:61-72) | FOLLOWED: 5.1 is this shape.  Grammar consequence: the bare `surfaceTension { A; B; Tc; n; }` and the `model`-word blocks become named laws `{ model <type>; ... }`, read unchanged as one-law lists (5.4) |
| R2 | tables inline or by file (the house's experiments format and CSV with explicit column indices), `units` per column with a dimension check, strictly increasing abscissa, declared interpolation, out of range REFUSED by default; an explicit `outOfBounds clamp;` allowed only as a declared, announced approximation in a CASE | inline `values` or `file` (`foam`, `csv` with integer `columns`), `units ([x] [y])`, strictly increasing x, `outOfBounds error warn clamp zero repeat` with DEFAULT `clamp` (`src/OpenFOAM/primitives/functions/Function1/Table/Table.C`, the `lookupOrDefault("outOfBounds", ..., clamp)`); its 2-D `uniformTable` is FATAL outside (`.../Function2/UniformTable2/UniformTable2.C`) | no table; the pilot's one-point file (Measured.cpp:95-106) | AMENDED on one point.  Everything else FOLLOWED (5.5 plus a CSV reader with `columns (i j)` and `nHeaderLine`).  `clamp` is REFUSED even in a case: a clamped table returns the end value with a ZERO slope outside (the toolbox's linear weights hold the end sample), so a bubble-point Newton on a clamped vapour pressure sees d ln P / dT = 0 and its step is undefined; and a clamp has no bound on its error.  The house already has the bounded form: a measurement's box wider than its uncertainty is a hypothesis with a reason (the kernel's third amendment block, point 3).  A case that needs a table beyond its points declares the LAW that carries it, or a bounded `extend { upTo <T>; reason; }` that is a hard box, printed with the excursion -- never an unbounded clamp |
| R3 | a missing property is a named absence that fails at first use with property, constituent and remedy; never a default number | `none` function fails by name at first use (`.../Function1/None/None.C`); the generic liquid turns a short-form entry into `none` silently (`liquid.C`) | literal defaults in ONE home, `liquidSource` (src/core/PropertySourceLog.H:111-195): 1000 kg/m3 as `diluteCarrierDensity` (ElectrodialysisStack.cpp:348, EDCell.cpp:159), `rhoFeedDefault` (SpiralWoundModule.cpp:320, RatedTestInversion.cpp:224), `batchDiafilterRhoDefault`, `dropletDensityFallback` (SprayDryer.cpp:595-613); 1e-3 Pa s `waterViscosityKnob` (SprayDryer.cpp:126); 0.072 N/m `waterSurfaceTensionFallback` (SprayDryer.cpp:396, :424); 1.6e-9 m2/s `soluteDiffusivityLegacy` (SpiralWoundModule); 1e-6 m2/s `waterKinematicViscosity` (ElectrodialysisStack.cpp:391, :442; BatchElectrodialysis.cpp:336); and outside that home 1.8e-5 Pa s for a gas (Atomizer.H:86); `pumpHeadDensityFallback` is defined and no longer used (the pilot made it a refusal) | FOLLOWED; the list above is the debt it closes (review plan, class F) |
| R4 | nothing thermodynamic derived silently from a table; a two-range law is one object with a common temperature, plus the continuity gate the toolbox lacks | tabulated density derives nothing and must be paired with tabulated energy and cp (`TM/specie/equationOfState/rhoTabulated/rhoTabulated.H`); `janaf` one object, ordering checks only, no continuity check (`TM/specie/thermo/janaf/janafThermo.C`); `hIcoTabulated` integrates a cp table exactly to h and s | NASA7/NASA9 one object; NASA9 C0 at its joint in all 43 records, slope free (5.2) | FOLLOWED (5.2, 5.5's dependent-properties table) |
| R5 | mixing rules named per property in the property dictionary; each pure-law type declares which mixing it supports, refused by name otherwise; no averaging of non-linear coefficients | one mixture word fixes every rule; coefficient mixing averages non-linear parameters (`sutherland` As, Ts; `hPower` n0, Tref: `TM/specie/thermo/hPower`); `noCoefficientMixing(Type)` refuses a model at compile time (`TM/specie/specie/specie.H`) | per liquid property `mixingRule` (C331; LiquidViscosityMixingRule.cpp:256-257, LiquidConductivityMixingRule.cpp:227-229, SurfaceTensionMixingRule.cpp:333-334); pure VALUES are mixed, never coefficients (ThermoPackage.cpp:2187-2189); no pure-law type declares its supported rules | FOLLOWED; new: each law type carries `mixes ( logMoleAverage GrunbergNissan )`-style support in its C++ registration (not in data: the rule is a property of the type, the amplifier rule), checked at assembly |
| R6 | packages are declared in the scope that uses them; sharing is an explicit, named, visible reference resolved at read time and printed with its origin; no silent inheritance; atomic block replacement (no key-by-key merge); the reference's grammar and what `seal` does with it; a per-scope effective dictionary including every default used | each region / phase / cloud reads its own file; no central registry; six text idioms for sharing (symlinks, `#include`, a case parameter file, `${file!key}` splice, a setup tool copying a material library, a relative include between scopes); default duplicate policy `merge` (`src/OpenFOAM/db/dictionary/entry/entryIO.C`) | unit `thermo {}` fragments replace whole blocks, `equilibrium` per slot (ThermoOverride.H:30-58); a sector dictionary `inherits "<path>"` (5 shipped, one plant); a key twice in a file is refused (Dictionary.cpp:558-575); BUT a case-local component record with `overlayOf` deep-merges its leaves (Database.cpp:450-461), and 18 shipped records use it | FOLLOWED, with one measured exception the ruling must reach: the record overlay IS a key-by-key merge.  Proposed: an overlay replaces whole top-level blocks of the record (a property's laws block, never a coefficient inside it); the 18 records are converted in the review (class B), each checked byte-identical in its run.  The reference, below |
| R7 | pair-keyed quantities: unordered key, both spellings accepted, duplicate refused, missing pair refused with no default, no self pairs; values typed (a constant, a named estimation method with its inputs, a table); the remainder of a Maxwell-Stefan film DECLARED, the film refuses without it; per-side film models, an absent side announced as "resistance neglected" | `D { A-B ...; }`, both orders, a WARNING when both are given, FATAL when neither, self pairs required for the code's numerics, values Function2(p, T) (`src/ThermophysicalTransportModels/fluid/laminar/Fickian/Fickian.C`, `.../MaxwellStefan/MaxwellStefan.C`); MS refuses without `defaultSpecie`; sided interface models skip an absent side silently | Wilke-Chang constructed inside the column (DistillationColumn.cpp:5175-5189, 5586-5627; RateBasedSegment.cpp:263, 400-401); gas diffusivity one model for all; MS film decided, not built | FOLLOWED; "both spellings accepted" means EITHER is accepted and BOTH together is a duplicate, refused (stricter than the toolbox's warning).  Grammar (SUPERSEDED by the ruling, point 6: entries are a list naming `solute` and `solvent`): `transport { vapour { diffusivity { pairs { water-ethanol { model Fuller; } N2-O2 { value 2.0e-5 m2/s; source "..."; } } remainder N2; } } }` |
| R8 | for the whole-tree review: rate-constant dimension from the declared orders checked at load; an element balance of every declared reaction at load; the reaction echoed as read; a reversible law with orders other than stoichiometry announced unless consistent | `kDimensions` from the orders (`TM/specie/reaction/reaction/reactionI.H`); element balance only in the CHEMKIN converter; runtime mass check for reversible reactions only, 0.1 kg/kmol (`.../Reversible/Reversible_reaction.C`); fractional reverse orders accepted silently | NO per-reaction element balance at load (grep of src/thermo/reaction and the reactors: only the Gibbs reactor reads `elements`, GibbsReactor.cpp:225-234, and that is its model); the boundary element closure after a steady run (ElementBalanceReport.cpp, gate check_element_balance) catches it later; a reversible law with non-mass-action orders is already REFUSED (Reaction.cpp:186-237) | FOLLOWED; the last point is already stricter than asked (refused, not announced); review plan class H |
| R9 | units on table axes; a defaults printout driven by the lookups; a renamed key read under its old name WITH an announcement; duplicate key refused; a tool that lists valid models in context | `units ([x] [y])`; `#print` lists `/* defaults */` from a shadow dictionary the lookups fill (`.../dictionary/printDictionary/printDictionary.C`); `lookupBackwardsCompatible` silent unless both present; no unread-key detection | duplicate key refused (Dictionary.cpp:558-575); the unread-key audit exists (DictAudit.cpp:129-156) and runs on unit operation blocks (Flowsheet.cpp:1202-1204), props ops (choupoProps main.cpp:847-848), layoutDict and postDict (choupoSolve main.cpp:875, 1506, 1567) -- NOT on the property dictionary or the component records; no record of defaults in `lookup*OrDefault` (Dictionary.H:111-135); old key names accepted case by case (ScalingScan.cpp:170-173) | FOLLOWED; two gaps measured: the property dictionary and the records escape the unread-key audit, and defaults are not recorded |
| R10 | NOT taken: silent clamp or extrapolation, debug-only checks, compiled code in dictionaries, template-nested type words, key-by-key merge, placeholder data, a restricted-licence databank, documentation that drifts from the reader | all present in the toolbox (clamp default; `...::debug &&` checks in `TM/specie/thermo/janaf/janafThermoI.H`; `#calc`, `coded`; `Reversible<FallOff<Arrhenius,Troe>>`; `merge`; urea's 1.0 N/m surface tension; `etc/thermoData/thermoData`'s commercial ban) | -- | FOLLOWED |
| R11 | a gate that passes every dictionary example printed in the guides and docs/ai through the real reader | headers' examples drift from their readers in about twenty places across the reading | NO such gate exists (bin/curate searched); docs/ai holds 227 fenced blocks shaped like a dictionary (`count_review.py`) | FOLLOWED: `check_dict_examples` (review plan, class I): each fenced block tagged by its grammar (a property dictionary, a fragment, a component record, a unit block) is parsed by the engine's own Dictionary reader and validated by the reader of that grammar in a no-solve mode (the `choupo-lint` seam); a block that is deliberately partial carries a tag; the blocks that fail today are pinned and may only shrink |

**The named reference (R6), through the record rules.**  (Also: the ruling's
variants replace it.)  SUPERSEDED by
5.5d (P1 d): `sameAs` is DROPPED, absorbed by derivation from a named base;
kept below as the record of what was weighed.  Today `inherits
"<path>";` takes a whole system by position.  Added: a BLOCK whose only
content is a reference takes that block, whole, from another scope:

```
// sectors/BRINE/constant/thermoPhysPropDict
recordType    thermophysicalPropertySystem;
schemaVersion 2;
inherits      "../../../constant";          // unchanged: the system, by path
transport     { sameAs "../../../constant"; reason "the brine's transport is the plant's"; }
```

* `sameAs` names a scope (a `constant/` directory); the block of the same name
  in that scope's effective dictionary is taken whole, never merged; a block
  with `sameAs` and any other key is refused (atomic).  `reason` is required.
* Resolved at read time, printed once per scope: `[property] sector BRINE:
  transport sameAs ../../../constant (plant), sha256 <8 hex>`.
* `seal` keeps the line and records the referenced block's hash in the
  manifest beside the scope's own; a sector opened alone resolves the path
  on disk exactly as `inherits` does today (the drill-in contract holds); a
  changed referenced block is a seal drift, reported by the existing drift
  report.  Cost: one reader branch, one manifest field, one line in the run
  header.
* (REVERSED by 5.5d P1, for the small-change defect stated there.)  A central
  file of NAMED packages that scopes import by name was weighed and
  not proposed: it is the shape in which "which numbers did this unit use?"
  has no local answer, and the toolbox, after its renamings, has no such
  registry either.

**The effective dictionary per scope (R6, R9).**  `bin/choupo-lint --effective
<case> [--scope <sector|unit>]` prints the property dictionary each scope
actually used: every block with the level it came from (case, sector,
`sameAs`, unit fragment), every law resolved per constituent (5.3), and every
default a lookup applied, generated by the lookups themselves (each
`lookup*OrDefault` records `key value` into a per-dictionary shadow, the
mechanism the DictAudit already uses for keys read).  The same rows go into
the result record so the app shows them.

**Amendments to sections 5.1-5.7 that follow from R1-R11.**  (a) 5.5 rule 1:
`clamp` is refused, the bounded `extend` above is the only way past a table's
end.  (b) 5.5 adds the CSV reader (`format csv; nHeaderLine n; columns (i j);
units ([K] [Pa.s]);`).  (c) 5.3's pins and 5.5's tables are the "exceptions
beside the property" of R6; the shared form is `sameAs`.  (d) every law type
declares the mixing rules it supports (R5).  (e) the pair grammar of R7 is the
form for diffusivities and, later, interface models.  (f) slice 0 of section 6
adds the unread-key audit on the property dictionary and the records, and the
defaults shadow.

### 5.5d Named packages in the one property dictionary (third head; the architect's rulings P1-P7)

**SUPERSEDED IN PART by the ruling at the top.**  The words `packages {}`,
`derivedFrom` and `propertyPackage` are replaced by `variants {}` (deriving
directly from the file's own system) and `thermo <name>;`; the atom is the
property block inside `transport` and `volumetric` only (`equilibrium` and
`caloric` as today); P1(a) -- a sector without definitions, and the changed
sentences of the settled contracts -- is WITHDRAWN: a sector keeps its own
dictionary.  P2, P3, P4, P6 and P7 stand; P5 stands with entries naming
`solute` and `solvent` in a list.  The text below is kept as the record of
what was proposed.

A second outside reading showed a defect the proposal above did not survive:
in its worked example, changing ONE law of water's viscosity and adding ONE
diffusivity table for the column made the unit copy almost the whole
`transport` block, because a level replaces whole blocks.  Whole-block
replacement per level fails the small-change test and scatters choices.  The
architect REVERSED his reading of 5.5c's R6 ("a central file of named
packages ... not proposed") for that reason.  This section prevails over 5.3,
5.5c (R6 and the `sameAs` reference) and section 7 point 1 where they differ.

**P1 -- every package is defined and named in the case's one
`constant/thermoPhysPropDict`.**  FOLLOWED.

* The top-level blocks ARE the package `default`; further packages sit in a
  `packages {}` block, each `derivedFrom` exactly one base (`default` or
  another named package) and declaring only its changes.  Resolution makes
  every package COMPLETE before any calculation (each is built by the one
  builder, `ThermoPackageBuilder::build`, at assembly); a cycle, an unknown
  base and an incompatible choice are refused by name, the cycle with its
  chain (the `inherits` reader already refuses a cycle, PropertyContext.H:138-140).
* THE ATOM IS THE PROPERTY BLOCK, never a leaf: `transport.<phase>.<property>`
  (for example `transport.liquid.viscosity`), `volumetric.<phase>`,
  `caloric.<phase>`, `pureFluids.<component>`, and for `equilibrium` the SLOT
  (`liquid`, `vapour`, `aqueous`, `equationOfState`, `liquidPhases`), the
  whole `equilibrium` only when the `formulation` changes -- the rule the unit
  override already applies (ThermoOverride.H:52-60).  MEASURED, two atoms in
  the tree today: a unit fragment replaces `equilibrium` per slot and
  `transport` whole (ThermoOverride.H:52-60), while a sector's `inherits`
  replaces `equilibrium`, `caloric`, `transport`, `pureFluids` and
  `aqueousProperties` whole (PropertyContext.H:66-70, `v2AtomicBlock`).
  The ruled atom unifies them.
* Process, sector and unit SELECT a package by name, `propertyPackage
  columnThermo;` (the existing per-unit key is the fragment `thermo {}`; the
  name `propertyPackage` is new and is the only selection word); a unit that
  names none takes its sector's selection, a sector that names none takes
  `default`.  The multi-level contract survives as a hierarchy of SELECTION,
  not of definition.
* (a) WITHDRAWN by the ruling (point 3).  DRILL-IN.  A sector's folder carries no property definitions; opened
  and run alone it resolves its `propertyPackage` names against the nearest
  ancestor `constant/thermoPhysPropDict` (the walk-up the flowsheet already
  does for pair homes, Flowsheet.cpp:775-830).  `seal` or an export of a
  sector alone MATERIALISES the packages it selects: the exported
  `constant/thermoPhysPropDict` holds each one resolved and complete, flat (no
  `derivedFrom`), stamped with the source case and the hash of the resolved
  text.  The settled contracts' sentences that change:
  - "Per-unit `thermo {}` REPLACES models, keeps components global
    (`thermoFor`)." becomes: "A unit SELECTS a named package of the case's
    property dictionary (`propertyPackage <name>;`); components stay global."
  - "A unit's `constant/` is its local-data HOME (measured props, kinetics,
    PSD accumulate there), inheriting the case `thermoPhysPropDict` via the
    cascade until something local lands" becomes: "A unit's `constant/` is
    its local-data HOME (measured points, kinetics, PSD); the PACKAGE that
    prices it is defined in the case's property dictionary and selected by
    name; a measurement filed in the unit's `constant/experiments/` is
    referenced from that package."
  - "The inheritance cascade must be LOUD (per-unit `thermo: inherited
    (global)` vs `LOCAL override -- ...`)" becomes: "The selection must be
    LOUD: per unit, the package it took, the level that selected it and the
    derivation chain."
  - "`system/` (HOW) and `constant/` (WITH WHAT) sit at every level of the
    case" stays: data (records, experiments, kinetics) still sit at every
    level; only the property DEFINITIONS move to one file.
* (b) BACKWARD COMPATIBILITY, measured.  The 8 unit `thermo {}` blocks in 7
  flowsheets plus 1 nested unit (all `equilibrium` only), the 5 sector
  dictionaries of lithiumBrinePlant (`inherits` plus a full `equilibrium`;
  their own `components` lists have no effect, because the flowsheet replaces
  them by the global list, Flowsheet.cpp:2147 and :2180) and the 21
  props-operation fragments (applied through the same merge,
  PropertyOperation.cpp:136-171) keep reading as ANONYMOUS DERIVED PACKAGES
  with TODAY'S semantics of their own reader (fragment or `inherits`),
  announced as such; byte-identical by construction because the same merge
  functions run.  A slice of the review plan migrates each to a named package
  and proves its results unchanged case by case.
* (c) choupoProps operations select the same names (`propertyPackage
  columnThermo;` in an operation of `system/propsDict`), so a check and the
  column price with one package.
* (d) `sameAs` (5.5c) is DROPPED: derivation from a named base absorbs it.

**P2 -- responsibilities per file.**  FOLLOWED.  The fifteen kinds of
section 3, each with its destination:

| kind (section 3) | destination |
|---|---|
| column `liquidViscosity` | an experiment file, referenced from `transport.liquid.viscosity` of the column's package |
| spray dryer viscosity, surface tension, 1e-3 and 0.072 defaults | the package (experiment files or laws); the defaults become refusals |
| pipe `viscosity`, `gasViscosity`, `surfaceTension` | the package |
| spiral-wound `rho_feed`, `viscosity`, `diffusivity` | the package (`volumetric.liquid`, `transport.liquid.*`) |
| `osmotic { model; Cphi }` | the package's `equilibrium.aqueous` slot (Pitzer parameters in pair records) |
| diafilter `rho` | `volumetric.liquid` of the package |
| adsorber `muGas`; `solidHeatCapacity` | the package's `transport.vapour.viscosity`; the adsorbent's asset record |
| PFR coolant `cp` | the utility record the coolant names |
| Bell-Delaware bench `rho mu lambda cp` | the bench's own declared fluid (a props operation on a package) |
| tray `hydraulics.sigma` | `transport.interface.surfaceTension` |
| post-processing air/fluid density, heat capacity, header viscosity | utility records |
| catalyst, screen, tablet densities | asset or material records |
| Wilke-Chang built in the column | `transport.liquid.diffusivity` with its composition rule (P5) |
| Atomizer gas viscosity 1.8e-5 | the package's gas viscosity |
| Poynting's constant `Vliq` | stays the component record's datum (announced beside a density table, 5.5) |

flowsheetDict keeps topology, operation, equipment, the film model and the
package reference; propsDict the requested calculations on the same packages;
`seal` keeps every record a selected package needs.

**P3 -- a stable identifier per law; mixing rules name what they consume.**
FOLLOWED.  A law's name inside its property block (5.1: `SR1`, `antoine`,
`vogel`) is its identifier, unique in the block and never reused for another
fit; a case pin names it (`water { law vogel; }`).  Case exceptions sit beside
the property in the package.  A mixing rule names its parameters, their home
and the missing-datum behaviour.  Grunberg-Nissan, written out:

```
// constant/thermoPhysPropDict, inside a package
transport { liquid { viscosity
{
    mixingRule   GrunbergNissan;                      [EXISTS]
    pairs        GrunbergNissan;                      [PROPOSED] parameters/GrunbergNissan/<i>-<j>.dat, unordered key
    neutral      { pairs ( methanol-isopropanol ); reason "no measured mixture viscosity; G = 0 assumed"; }   [PROPOSED]
} } }
// data/standards/parameters/GrunbergNissan/isopropanol-water.dat     [PROPOSED home]
i isopropanol; j water;
form  GijTx;                       // G_ij(T,x) = A + B/T + (C + D/T)(x_i - x_j)  (Poling 5ed eq. 9-13.1, as coded)
A ...; B ... K; C ...; D ... K;
window { soft (283.15 353.15); hard (273.15 363.15); }
provenance { origin regressed; ... }
```

Today the rows sit INLINE in the case (`interaction ( { i; j; A B C D; Tmin;
Tmax; source; } )`, LiquidViscosityMixingRule.cpp:106-134); a pair is matched
in either order and the FIRST match wins, so both spellings together are not
refused (:178-185); a missing pair mixes with G = 0, announced
(:186-193).  Ruled: a missing pair is a refusal naming the pair, unless the
package declares it `neutral` with a reason; both spellings together are a
duplicate, refused.  No shipped case writes `interaction` for viscosity today
(grep); the props case `mixing01_water_acetone` is the one user.

**P4 -- a measurement either checks or IS the method.**  FOLLOWED.  `use check`
evaluates and prints; `use method` computes.  "Replaces inside its box" is
struck: it would be a state-dependent switch.  Two semantics only, fixed
before resolution: (i) the table or point IS the selected method, outside its
domain a refusal or the bounded `extend` of 5.5c; (ii) a declared
`piecewise` composite (5.2) with a table in one interval and a law in another,
its junction conditions stated and gate-checked.  MEASURED: the density
pilot's `measured` already refuses outside its box and never hands over
(Measured.cpp:343-353: "A marked measurement is the set's method and is never
extrapolated nor handed over to another"); its `replaces { method ...; }`
names the catalogue method it displaces (an explicit act, rule 4), not an
interval.

**P5 -- a diffusivity datum states its kind.**  FOLLOWED, with what was read.
Read for this section: Taylor & Kooijman (2014), *Mass Transfer in
Distillation*, ch. 3 of *Distillation: Fundamentals and Principles*, pp.
108-110 (in the owner's literature folder).  From it: the Fick D and the
Maxwell-Stefan Ð of a binary are related through the thermodynamic factor,
Ð = D/Γ (Eq. 3.31); at infinite dilution Γ -> 1 and the two are equal;
concentrated binaries combine the two infinite-dilution values, linearly
(Caldwell-Babb, Eq. 3.32) or logarithmically (Vignes, Eq. 3.33); the Fick
matrix is [D] = [B]^-1 [Γ] (Eq. 3.34), an assumption "used throughout the
literature"; for ideal gases [Γ] = I (Eq. 3.35); in multicomponent liquids
the Vignes rule is generalised (Eqs. 3.38-3.40) with limiting diffusivities
for which the authors suggest the Kooijman-Taylor form (Eq. 3.41) as "among
the least unsatisfactory".  The paper on measured multicomponent liquid
diffusion coefficients that the outside reading named is NOT in hand and is
not cited.

* A datum declares: `kind` (`fick`, `maxwellStefan`, `self`,
  `infiniteDilution`), `phase`, the ORDERED pair where direction matters (ruled form: `solute` and
  `solvent` named in a list entry)
  (`solute`, `solvent` for an infinite-dilution value), composition, T, P or
  a pressure hypothesis, and the reference frame where it matters.
* A binary datum used in a multicomponent medium needs a NAMED rule with the
  data it requires: `CaldwellBabb` or `Vignes` for a binary (both need the
  two infinite-dilution values), `VignesKooijmanTaylor` for more than two
  (needs every pair's infinite-dilution values, Eqs. 3.38-3.41).  MEASURED:
  today the column builds its own liquid D from two Wilke-Chang
  infinite-dilution values with the LINEAR rule (Eq. 3.32) and prints Vignes
  beside it, never used (RateBasedSegment.cpp:400-407); the move puts that
  rule, by name, in the package (P2).
* THE CONTRACT BETWEEN PACKAGE AND FILM.  For the vapour: the package returns
  the binary Maxwell-Stefan Ð_ij of every pair (ideal gas, [Γ] = I) for the
  Maxwell-Stefan film, and an effective D_i,m by a named rule for the
  effective film; both films are kept (standing decision).  For the liquid:
  the package returns an effective D_i by the named rule; the film takes Γ =
  1 and announces it (standing decision).  If a liquid Maxwell-Stefan film is
  ever built, the package returns Ð_ij and the film applies [Γ] from
  `thermodynamicFactor { from equilibrium.liquid; }`, a key that names the
  phase and the formulation whose activity model differentiates.

**P6 -- the resolved view shows the thermodynamic route.**  FOLLOWED.  Per
package: the formulation and each slot's model; the reference state and the
energy datum (`elementsDatum`); per constituent the Cp laws taken (identifier,
window) for each phase; the liquid enthalpy route (formation datum, the 298.15
K latent-heat bridge, Component.cpp:1186-1260); which mixing or non-ideality
terms enter enthalpy, entropy and Gibbs (excess from the activity model,
departures from an equation of state); the density of BOTH phases and the
method of each.  Pieces that exist: the builder's assembly lines, the
`thermoResolution` block of the result (ResultEmitter.cpp:1218-1220, pair
provenance only), the liquid-property table (PropertySourceLog).

**P7 -- where the choice was made, apart from where the data came from.**
FOLLOWED.  Every row of the report carries two columns: CHOICE (package,
derivation line `columnThermo <- default`, the file and line of the
declaration) and DATA (record file, law identifier, experiment file).  The
outside reading's example attributed a table to `process` choices that the
unit's block had replaced; this record's examples carry no such attribution,
and the rule that prevents it is the two-column split: a choice is attributed
to the package that resolved it, never to the level that selected the
package.  A mixture's validity may depend on T, P and composition: a solution
law's and a measurement's domain already do (density-pilot-plan.md section
1, `domain ( { T; w[water]; } )`).

### 5.6 The decision table, per property (input 2)

| level | question | liquid density (BUILT, pilot) | liquid viscosity, conductivity, surface tension | vapour pressure, heat capacities |
|---|---|---|---|---|
| 1. the mixture | a measurement or table of THIS set (constituents, T, P, composition stated)? | `measured` with a hard box | `measured` (table) | n/a (pure properties) |
| 2. | a direct law of exactly this set? | pure fluid / reference equation for one constituent; a solution record for two or more | a solution record (none exists yet) | -- |
| 3. composite | which mixing rule? | additive volumes, fixed | `mixingRule` (GrunbergNissan, Li, Butler default; C331) | -- |
| 4. each pure | which law? | the record's volume route (no case pin except `pureFluids`) | the case's pin, else the record's preferred, else (legacy) the block's `model` word | the case's pin, else the record's preferred; `pureFluids` above both for its component |
| 5. missing datum | estimate or refusal? | `bareRackett` estimate taken AUTOMATICALLY as a tier-4 leaf (DensityLeaf.cpp:70, :110, :122); `massWithoutVolume` only declared | refusal naming the datum; an estimate only by the case's acceptance (rule 11) | refusal (Component.cpp:514-522 already) |

Where the built pilot already follows it: levels 1-3 exactly, the choice
frozen per set, the passed-over methods printed.  Where it does not: the
estimate at level 5 is taken without the case's acceptance (rule 11's
`acceptedEstimate` was deferred), the resolution happens at the first request
rather than at assembly, and a pure's law cannot be pinned except through
`pureFluids`.  None of the three moves a number when corrected in the order
of section 6.

### 5.7 Water

* SUPERSEDED by the ruling (point 8, review row SL-07): water's preferred
  vapour-pressure law is NOT changed in this campaign (24 molecular and 89
  electrolyte pair records were regressed on the present law); `SR1` enters
  the record as a NAMED ALTERNATIVE a case may pin, and the flip is a separate
  refitting campaign with its own decision.  The bullet below is the record of
  what was proposed.
* **Vapour pressure: `SR1` (the Wagner form of IAPWS SR1-86) becomes the
  preferred law of water.dat**; Antoine stays as the named law `antoine` with
  its soft window narrowed to 273-313 K (where the header measured it within
  0.1 %) and a hard window 250-373 K.  Effect: none on any shipped case until
  it is re-sealed; then every water VLE case moves (38 of 102 in the old
  sample, 268 rows, one non-convergence).  Order: fix
  `column05_reactive_methylacetate`'s convergence first; retake the staged
  measurement over all 358 cases; the architect rules on the written list;
  re-seal family by family.
* **Liquid density**: nothing to do (IAPWS-95 by fact; within 0.006 %).
* **Liquid viscosity**: `vogel` preferred, with a soft window 273-473 K
  (within 2.2 % of R12-08) and hard 273-573 K; `andrade` kept, soft 283-373 K.
  The 22 cases with a `model` word do not move (5.4).
* **Liquid cp**: the constant is wrong by 26 % at 573 K and no better law is in
  the record; a `piecewise` polynomial regressed from IF97 on 273-640 K is
  curation work (`heatCapacityFit` exists), moves every hot-water energy
  balance, and comes after vapour pressure.
* Migration order by property: vapour pressure, viscosity, liquid cp, then
  surface tension's window (its fit stops at 353 K).

## 6. Build order (each slice with its check; the first moves no number)

SUPERSEDED by the ORDER OF SLICES in the ruling at the top and by the review
plan; the table below is the record of the earlier proposal.

| slice | content | check |
|---|---|---|
| 0 | the record reader accepts `preferred`, named laws, `window { soft; hard; }`, per-law provenance; every existing block read as a one-law list; the table prints per unit / constituent / property the law, its window and the largest accepted excursion; Andrade, Vogel and NASA7 gain an ANNOUNCED window check (no refusal); the 74 misplaced provenance entries moved to the top-level block and `transport_fit.py:561-565, :766-770` fixed | characterisation bench bit for bit (TR-16); goldens byte-identical except added advisory rows, listed before landing; a gate that no property provenance sits inside another block |
| 1 | `table` for liquid viscosity, pure component and fixed-composition mixture, `linearLog` default, hard edges; the column's and the spray dryer's `liquidViscosity` keys become measurements (C397) | the 15 distillation cases and apalutamide01 unchanged by construction (a one-point measurement is the same number); a table case built from IAPWS R12-08 points held to the IF97 route within the interpolation error measured above |
| 2 | case pins (`constituents { X { law L; reason; } }`) for liquid transport and surface tension; the legacy `model` word as a pin of all | the 22 + 5 + 29 cases byte-identical (5.4) |
| 3 | `preferred` words in the catalogue for liquid viscosity, record by record | each commit lists the cases it moves |
| 4 | `piecewise` and its curation gate (continuity per property, 5.2) | NASA7/NASA9 read through it bit for bit |
| 5 | vapour pressure: pins, tables, `equilibrium.liquid.vaporPressure`; water's `SR1` preferred | the staged re-measurement over 358 cases; the architect's ruling on the list |
| 6 | liquid cp: piecewise water law; tables with the 298.15 K condition | energy closures of every case it moves |

## 7. The four outside points, judged

1. (REVERSED by 5.5d P1: the architect now rules named packages in the one
   dictionary, for the small-change defect.)  **All packages named centrally, a sector or unit only referencing one --
   AMENDED.**  The multi-level layout is a settled contract: a sector is
   openable and runnable alone and carries its own dictionary (the 5
   lithiumBrinePlant sectors do, through `inherits`), and the drill-in
   depends on it.  Measured: 8 unit blocks (all `equilibrium`), 5 sector
   dictionaries, 21 op-level fragments; none replaces a transport block.  The
   concern is right and is met by the resolved view and the lint (5.3).
   Central named packages could coexist with self-contained sectors if a
   sector's dictionary were GENERATED from a named reference at seal time;
   the cost is a seal step, a drift gate and a second home for the same text,
   which the contract avoids by `inherits`.  Not proposed now.
2. **The flat precedence line mixes things that work together -- ACCEPTED**,
   as a statement problem: section 5.6 is the per-property table with levels,
   and it was checked against the built pilot.
3. **Exceptions beside the property -- ACCEPTED**, with one correction of
   fact: the pilot has no `measurements {}` block.  Its mark is
   `volumetric { liquid { measured { <name> { use method; replaces {...};
   reason; } } } }` (Measured.cpp:95-106), ALREADY beside the property, with
   the points in `constant/experiments/`, and ONE shipped case uses it
   (`liquidDensity04_NaOHpoint`).  Nothing has to move; the same shape is
   extended to every property (5.3).  `approximations {}` (13 cases) stays a
   separate block: a hypothesis is a statement about the case, not a choice
   of method.
4. **"First applicable" and "chosen once" made precise -- ACCEPTED entirely**:
   5.2 (applicability by data facts; one preferred law; `piecewise` as one law;
   the order of a list never a switching policy; soft / hard behaviour and
   the computed remedy).

## 8. Rejected alternatives

* Two laws switched by state (5.2): a discontinuous residual and a choice the
  run cannot state without the state.
* Choosing among a record's laws by "the widest validated window" or "the best
  evidence" at run time: the state range of a run is not known at assembly,
  and a rule computed at assembly from windows is a hidden ranked default; the
  record says which law it prefers and the curator answers for it.
* Extrapolating a case's table: TR-01 forbids it; the pilot's measurement box
  is hard for the same reason.
* Interpreting a `model` word as "the record's form if present, else the
  preferred": it moves numbers silently for records with several forms and
  makes the word mean two things.
* A per-component model selector of free words (C397 point 5 as declined):
  only names the record carries, or tables with sources, may be pinned.
* Linear interpolation in P for a vapour pressure: 3.5 % at 10 K spacing.
* Moving the 74 misplaced provenance entries by deleting them: their
  evidence lists are the only record of where the fits came from.

## 9. What is NOT decided here

* The latent heat as a record property (no block exists; two surfaces carry
  two values) -- with the liquid cp slice.
* 2-D tables and solution records for viscosity (no case needs one yet).
* Whether `acceptedEstimate` lands before slice 3 (the density pilot's
  automatic `bareRackett` leaf is the first site it would change, and it
  moves numbers).
* The tolerance at which the Clausius-Clapeyron / Watson comparison of a
  tabulated vapour pressure becomes a counted finding.
* What could not be measured: the behaviour of a flash or column across a
  declared joint (no law in the tree switches inside a run's range); the
  goldens a water vapour-pressure flip moves on today's tree (needs a staged
  sweep, which this slice may not run).

## 10. Acceptance test (in the ruled grammar)

The case: the Pelkonen ternary (methanol, 2-propanol, water; total reflux,
atmospheric pressure, Sulzer BX packing: Pelkonen et al. 2001, Chem. Eng.
Process. 40, 235-243, Tables 3-5), as the C329 ternary slice will build it.
The CASE does not exist yet [PROPOSED]; the numbers illustrate the grammar and
carry no claim.  It passes when ONE property dictionary holds its system and
one variant `column` with exactly two changes, the column selects the variant
in one line, a property operation checks with the same variant, the gate of
ruling 7 holds (the column and the operation receive the same values at one
state), and both runs print the resolved view below.

```
// constant/thermoPhysPropDict -- the one entry point
recordType    thermophysicalPropertySystem;                          [EXISTS]
schemaVersion 2;                                                     [EXISTS]
components    ( methanol isopropanol water );                        [EXISTS]
equilibrium                                                          [EXISTS]
{
    formulation gammaPhi;                                            [EXISTS]
    liquid { activityModel { model NRTL; } standardState pureLiquid; }   [EXISTS]
    vapour { fugacityModel idealGas; }                               [EXISTS]
}
transport                                                            [EXISTS]
{
    vapour { viscosity { model Chung; } diffusivity { model Fuller; } }  [EXISTS]
    liquid
    {
        viscosity   { mixingRule GrunbergNissan; }                   [EXISTS key; a word-less block, reading each record's
                                                                       preferred law, is PROPOSED and needs SL-04's deletion]
        diffusivity { model WilkeChang; }                            [EXISTS]
    }
    interface { surfaceTension { model BrockBird; } }                [EXISTS]
}
variants                                                             [PROPOSED]
{
    column                                                           [PROPOSED]
    {
        transport
        {
            liquid
            {
                viscosity                    // atom: transport.liquid.viscosity, replaced whole
                {
                    mixingRule  GrunbergNissan;                      [EXISTS]
                    interaction ( { i isopropanol; j water; A ...; B ...; C ...; D ...;
                                    Tmin 283.15 K; Tmax 353.15 K; source "..."; } )   [EXISTS]
                    zero        ( { i methanol; j isopropanol; reason "no measured mixture viscosity"; }
                                  { i methanol; j water; reason "..."; } )             [PROPOSED]
                    law         ( { component water; law vogel; reason "within 2 % of IAPWS R12-08 to 473 K"; } )   [PROPOSED]
                }
                diffusivity                  // atom: transport.liquid.diffusivity, replaced whole
                {
                    model       WilkeChang;                          [EXISTS]
                    returns     effective;                           [PROPOSED]
                    composition VignesKooijmanTaylor;                [PROPOSED]
                    entries     ( { solute methanol; solvent water; kind infiniteDilution;
                                    table methanolInWater; interpolation linearLog;
                                    reason "measured infinite-dilution values"; } )   [PROPOSED]
                }
            }
        }
    }
}

// constant/experiments/methanolInWater.dat              [EXISTS format, the pilot's]
provenance  { source measured; citation "..."; }                    [EXISTS]
system      ( methanol water );                                     [EXISTS]
property    liquidDiffusivity;                                      [PROPOSED value of an EXISTS key]
columns     ( { name T; unit K; } { name D; unit m2/s; } );         [EXISTS]
data        ( 298.15 1.56e-9  313.15 2.10e-9  333.15 2.95e-9  353.15 3.90e-9 );   [EXISTS]
uncertainty 5 %;                                                    [EXISTS]

// system/flowsheetDict, the one selection line
units ( { name column; type distillationColumn; model rateBased;    [EXISTS]
          thermo column;                                            [PROPOSED form of the EXISTS key `thermo`]
          operation { ... } } );                                    [EXISTS]

// system/propsDict, the check with the same variant
operations ( { name muCheck; type propertyScan1D;                   [EXISTS]
               thermo column;                                       [PROPOSED form of the EXISTS key `thermo`]
               vary { variable T; from 330 K; to 370 K; n 9; }      [EXISTS]
               state { P 1 atm; composition { methanol 0.3; isopropanol 0.3; water 0.4; } }   [EXISTS]
               properties ( viscosity_liquid diffusivity_liquid ); } );   [EXISTS]
```

(`zero` and `law` are the proposed keys for a declared zero interaction
(ruling 6) and a pinned record law; their final spelling goes through the
record rules when slice (a) is built.  The Grunberg-Nissan rows stay where the
tree has them today, inline in the property block; moving them to pair
records is not part of the ruling.)

The resolved view both runs print [PROPOSED], two columns (ruling 7):

| what | CHOICE: where it was made | DATA: where it came from |
|---|---|---|
| route | system (constant/thermoPhysPropDict: equilibrium) | gammaPhi, NRTL pairs from parameters/NRTL/...; energy `elementsDatum`; liquid h = Hf298(gas) - Hvap(298.15) + integral of the records' liquid Cp laws |
| density, both phases | system (no volumetric block) | liquid by ideal mixing of the records' volumes; vapour ideal gas |
| transport.liquid.viscosity | variant `column` (thermoPhysPropDict line N), selected by unit `column` (flowsheetDict line K) and operation `muCheck` (propsDict line J) | water: water.dat law `vogel` [soft 273-473 K]; methanol, isopropanol: their records' laws; Grunberg-Nissan: isopropanol-water row (source ...); methanol-isopropanol and methanol-water declared zero, with reasons |
| transport.liquid.diffusivity | variant `column` (line M) | methanol in water: experiments/methanolInWater.dat (table, linearLog, hard 298.15-353.15 K); other pairs Wilke-Chang; composition rule Vignes-Kooijman-Taylor (Taylor & Kooijman 2014, Eqs. 3.38-3.41); returned: effective liquid D; liquid film Gamma = 1, announced |
| every other property | system | the records' preferred laws |
| gate (ruling 7) | -- | the column's and `muCheck`'s liquid viscosity and diffusivity at (350 K, 1 atm, the stated composition): identical |
