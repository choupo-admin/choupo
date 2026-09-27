# A catalyst bed is sized by its kinetics, and its charge is priced only from what the case declares

*Commission C2 (DEV.md 4c), decided 2026-09-26 by the commander on Vítor's
"a decisão é tua".  Shipped the same day.  Level 3 under
[`the-specification-sheet-a-project-is-audited-from.md`](the-specification-sheet-a-project-is-audited-from.md);
the 1:N shape is [`one-unit-five-items-the-column-gets-a-size.md`](one-unit-five-items-the-column-gets-a-size.md)'s.*

## 1. What was asked, and what was measured before anything was written

Vítor asked (2026-09-21, "os alunos precisam urgentemente disso") for a design
module and a cost for the ammonia converter.  `ammonia03_quench_converter`
had already answered half of it honestly: its three equilibrium beds are
declared in the postDict and REFUSED by name on every run, because *a
catalyst volume is a kinetic result* and an equilibrium bed has no length
scale.  Stage D of the staged sequence (`ammoniaStaged04_kinetic`, built
2026-09-26) dissolved that blocker: its converter is a `pfr` on the Dyson &
Simon (1968) rate law whose `V_R` a `designSpec` SOLVES against the
effluent's approach to equilibrium.  The bed volume is an engine output, and
a sizer can read it.

Three things were measured before the first line of the sizer, and one of
them stopped the slice:

* **`SizingPass` dispatches on the postDict entry's `type` word**
  (`SizingPass.cpp`, `EquipmentSize::New(u->lookupWord("type"))`), not on
  the unit's declared type.  So registering a `pfr` sizer reaches no case
  that does not ask for it: of the 15 corpus postDicts none names `type pfr`,
  and of the 7 `pfr` cases none carried a postDict.  Blast radius: zero.
* **`PFR` publishes `V_R`** on both its paths (`PFR.cpp` 625 and 1088), and
  its multi-reaction path publishes no `P`, so `VesselSize` -- which reads
  `kpi("P")` -- could not have served it as-is.
* **The post-processing chain did NOT run on a `designSpec`'s representative
  pass.**  Measured on a scratch copy of stage D with a postDict added: the
  run header printed `postDict: loaded -- post-processing active` and then
  no sizing table, no cost, no `design/` tree, exit 0.  `main.cpp` handed the
  dict to the driver (`setPostDict`) and `DesignSpec.cpp` never read it; the
  chain was built only in the single-pass `else` branch, while the
  design-sheet writer and the reports DID run on the representative pass --
  so a sized-looking run wrote sheets from a result nothing had sized.  The
  case's own `outerDict` header and DEV.md had both recorded this as a fact
  about the engine.  The brief said stop and report; the slice stopped.

## 2. The three decisions, taken by the commander on stated defaults

**D1 -- the chain runs on the designSpec's representative pass** (philosophy
§4, DELEGATE-WITH-DEFAULT: a declared file the run header announces as
active must be honoured or refused, never silently ignored; zero corpus
cases carry both a designSpec and a postDict, so no golden moves; Vítor can
reverse it).  Four lines in `DesignSpec.cpp` before `setFinalResult`,
mirroring `OptimizationDriver`'s replay at the optimum -- in the DRIVER,
because `OptimizationDriver` has already run its chain on `finalResult` when
`main.cpp` sees it and a generic call in the representative branch would run
it twice.  With it, two neighbours were fixed in the same commit:

* **The banner is true for the driver actually loaded.**
  `OuterDriver::postDictPolicy()` is PURE VIRTUAL -- every driver states in
  its own words what it does with the file, and `main.cpp` prints that
  sentence after `postDict: loaded --`.  Measured and written, per driver:

  | driver | `postDict:` line |
  |---|---|
  | none (single pass) | `loaded — post-processing chain applied once, on the single pass` |
  | `designSpec` | `applied on the REPRESENTATIVE pass (the replay at the design point), before the reports` |
  | `optimization` | `applied per evaluation AND on the REPRESENTATIVE pass (the replay at the optimum), before the reports` |
  | `sweep` | `applied per CONVERGED sweep point (console table silenced, KPIs land in each point's result); there is no representative pass` |
  | `paretoSweep` | `applied by the optimisation solved at each Pareto point (per evaluation and at that point's optimum); there is no single representative pass` |
  | `gridSweep` | `NOT applied by the `gridSweep` driver -- no grid point runs the sizing/costing chain, so a response naming a cost or economics KPI is unreachable here` |

  A pure virtual rather than a base default, because a default of "not
  applied" lets a driver that does run the chain inherit a false sentence in
  silence, and a default of "applied" is the defect this replaces.  The
  driver is now constructed BEFORE the run header (construction reads the
  outerDict and nothing else); its simulator and dicts are handed over where
  they always were.
* **The postDict is audited under an outer driver too.**  `dictAudit` over
  `postDict` sat only in the single-pass branch, so a dead key in any swept
  or design-spec'd case's sizing block read as an active setting.  The
  audit is over KEYS and accumulates reads on the one `DictPtr` across every
  pass, so one audit at the end of the outer branch sees them all.

**D2 -- the catalyst charge is a SECOND ITEM, not a second cost shape hidden
inside the vessel.**  `CatalystBedSize` (registered `pfr`) returns two
`EquipmentSizing` records under one unit, the 1:N shape the column
established and the sheet writer's own header promised:

| item | equipmentType | sized how | costed how |
|---|---|---|---|
| `shell` | `vessel` | a straight cylinder of the bed's own `V_R` at the declared (else announced-default) L/D; ASME thin-wall through `VesselMechanics` at the REQUIRED `pressureDesign` | the EXISTING Guthrie vessel set, exactly as any vessel |
| `catalystCharge` | `catalystCharge` | `m_catalyst = V_R x catalystBulkDensity` when the density is DECLARED; otherwise no mass and the basis says `mass not derivable: catalystBulkDensity not declared` | `price x mass` at the DECLARED `catalystPrice`; absent either input the item is REFUSED BY NAME and the total reads INCOMPLETE |

`Guthrie::cost` gained a branch for `catalystCharge` -- and it is deliberately
not a ninth coefficient set.  No CEPCI rebasing (the price is not a 2001-USD
correlation), no currency conversion (it is declared in the currency the run
totals in), no bare-module or total-module factor and no 1.18 (those install
a fabricated item; a charge is loaded into a vessel that carries its own).
The printed line is where a reader must be able to tell the two shapes
apart, so `correlation` carries its own word and the provenance row prints
the price where the other shapes print K1..K3.  Side by side, from the
witness (the commander asked for these two lines):

```
  unit                      equipment       F_M     F_P     C_purchased   C_bare_mod    C_total_mod
  converter                 catalystCharge  1.00    1.00    262118        262118        262118
  converter                 shell           3.05    16.38   17043         1587547       1873305

  unit                      correlation           size driver S               coefficients                          B1, B2      F_M (material)
  converter/catalystCharge  declared-unit-price   m_catalyst_kg = 17474.5647  price 15 EUR/kg, DECLARED, no index   1.00, 0.00  1.00 (none: catalyst priced per kg)
  converter/shell           log-quadratic         V_R = 6.9898                3.4974, 0.4485, 0.1074                2.25, 1.82  3.05 (SS316)
```

The refusal reuses the ONE home: `CostingPass` collects any exception thrown
by `model->cost()` into `notCosted`, prints `TOTALS (EUR) -- INCOMPLETE`,
names the item and raises the `incomplete-total` advisory -- the mechanism
the trays use.  No second INCOMPLETE flag was built.

**D3 -- the basis says what the pass can know.**  `SizingPass` has no view
of the outer driver's manipulate list, so the shell's basis reads *catalyst
volume V_R read from the unit (rating model); shell = straight cylinder of
that volume at L_over_D* and claims nothing about whether the number was
solved or typed.  No provenance key was added (a second home for a fact the
outerDict already states).  Where it WAS solved, the case's postDict header
says so.

## 3. Where the declared price lives, and why not in `values`

The price is not a SIZE: `EquipmentSizing::values` carry a physical
dimension the dict grammar can spell, `core/Units.cpp` has no `EUR/kg`, and
inventing a currency dimension to fit a table is the wrong end of the
problem.  It is not a `CostBreakdown::factors` entry either, because a
factor is what the MODEL computed and this is what the AUTHOR declared.  So
`EquipmentSizing` gained `costInputs` -- keyed by the designRules word,
consumed by the costing model, republished by it under the same word in its
`factors` so the provenance row and the sheet's `cost {}` block show the
number that priced the item.  It is NOT emitted under the JSON's
`equipment.values`, which the golden `equipment` kind pins as sizes; a
declaration reaching the output is pinned through the cost total it
produces.

The charge carries NO construction material (the sheet renders `(not
stated)`, the JSON an empty string) and `CostingPass` no longer looks an
empty word up in the material registry -- a registry lookup on the empty
word would have refused the item for the wrong reason.

## 4. The witness

`tutorials/plant/ammoniaStaged04_kinetic` gains `system/postDict`: the
converter as `type pfr` with `pressureDesign 220` (the 200 bar loop plus a
10 % margin, as stages C, ammonia02 and ammonia03 declare), `L_over_D 6.0`,
and **two AUTHOR-SET ASSUMPTIONS declared in those words** --
`catalystBulkDensity 2500 kg/m3` and `catalystPrice 15 EUR/kg`.  No primary
source was retrieved for either, and none was invented: a citation dressed
on a round number converts *unsourced* into *falsely sourced*, which no
reader and no gate can detect.  The separator and let-down drum are sized as
stage C sizes them.  `corrosionAllow` and `jointEfficiency` stay undeclared,
so the shell's sheet shows `assumed ( corrosionAllow jointEfficiency )` --
the difference between a number the case chose and one the engine chose.

The bed the engine sized (6.9898 m3, solved) costs 1.87 MEUR installed as a
220 bar SS316 shell and 0.26 MEUR of catalyst at the declared price; the
separator, at 43 m3 and 220 bar, dominates the loop at 15.4 MEUR -- which is
stage C's finding repeated, with the converter now a solved volume rather
than a space-velocity assumption.  NOT sized, said in the postDict: the
preheater (a `phaseChanger` with no exchanger geometry), the mixer, the
splitter, and everything stage C's topology omits (no compressors, no
interchanger).  The pellet effectiveness factor stays UNPRICED.

## 5. Gate

`check_design_sheet` arm (n): the shell's `V_R` equals the unit's own KPI to
the sheet's printed precision; the charge's mass is recomputed from V_R and
the declared density; its purchased cost is recomputed as price x mass and
equals bare- and total-module (no index, no F_BM) while the shell's
total-module EXCEEDS its purchased cost (the two shapes told apart on the
numbers); the provenance row names `declared-unit-price` and `DECLARED`; a
copy without `catalystPrice` refuses the charge by name, keeps the shell
costed and marks the total INCOMPLETE naming the item; a copy without
`catalystBulkDensity` publishes no mass, says `mass not derivable`, and
refuses at cost time naming the density.  Five by-hand sabotages, recorded in
the gate's docstring.  `check_equipment_pinned` requires the witness's new
`equipment` rows -- see §7.

## 6. Bury the absence

Every sentence whose truth depended on the chain NOT running under an outer
driver, or on no reactor sizer existing, was settled against the code in the
same commit: stage D's `outerDict` header and README (§1, §2, §6), DEV.md's
C8 note, `how-a-process-design-is-staged.md`'s capability table ("A reactor
SIZER: No"), `docs/ai/case-layout.md` (the postDict is not "steady
single-pass only"), the tutorials catalogue (which also still carried the
−22 274.7 kW separator finding the README records as closed).
`ammonia03_quench_converter`'s postDict header STAYS TRUE -- its beds run to
full equilibrium and have no volume to read -- and now points at stage D for
the bed that does.

## 7. NOT done, said plainly

* **The golden rows are NOT recorded.**  A golden re-record is a claim and
  the claim is the list (CLAUDE.md §10): the 41 `equipment` rows the witness
  now publishes were generated with the suite's own emitter and handed to
  the commander for Vítor; until they are appended, `check_equipment_pinned`
  names `ammoniaStaged04_kinetic` as publishing rows no golden pins.  That
  is the gate working.
* **No number in the charge is validated.**  The density and the price are
  assumptions and the case says so; a vendor data sheet and a quotation
  replace them.
* **No catalyst record in the catalogue.**  The charge's `material` is
  empty on purpose; a `kind catalyst` asset record (bulk density, particle
  size, price band with a source) is a curation act, Vítor's, and would make
  `catalystBulkDensity` a record fact rather than a case declaration.
* **The shell is the bed's envelope**: no head space, distributor, support
  grid or internals, no quench manifold.  The basis says so.
* **The equilibrium beds of `ammonia03` still cannot be sized**, and that
  header is still right.
