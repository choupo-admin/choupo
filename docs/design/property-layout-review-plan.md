# The review of the whole tree against the ruled property layout (C398): inventory and slices

Kind: PLAN.  Status: OPEN -- written 2026-11-14, to be executed only after the
architect rules on [`several-laws-per-property.md`](several-laws-per-property.md)
(its section 5.5c, rulings R1-R11, and 5.5d, rulings P1-P7: all packages
defined and named in the case's one property dictionary, selected by name).  No slice is started; nothing in the
engine, data, cases, goldens, guides or the app was changed.

Method.  Tree: `origin/main` at 83384f58c merged into the design branch
(2f74f878b); every count below was taken on it by a script kept outside the
tree, `/tmp/claude-1000/c398/` (`count_records.py`, `misplaced_prov.py`,
`count_cases.py`, `count_unit_keys.py`, `count_review.py`, `pair_dups.py`);
each class names its script.  A count is the state on that date; each slice
retakes its own before it starts.

## 0. For a phone

* Ten classes (J added by the third head: definitions below the case that become named packages), from the component records to the guide pages.  The ones that
  move NO number: converting the record shape (slice R1), the provenance
  repair, the unread-key audit, the pair grammar, the effective-dictionary
  view, the docs-example gate.  The ones that MOVE numbers: water's preferred
  vapour pressure (in the 2026-09 sample 38 of 102 water cases failed: 37 moved rows, one stopped converging), turning
  the eight literal defaults into refusals where a case relied on them (up to
  32 + 26 + 13 cases carry the default's tag in their goldens), and any
  record whose preferred law changes.
* Order: the named-package reader and its migration first (P0, P1, no number), then what makes the later slices safe (the reader and the
  printout), then the classes that move nothing, then one property at a time
  with its re-recorded list written in the commit.

## 1. The inventory

"Conforms" is the ruled design: one shape per property block (a type word and
its data, soft and hard window, per-law provenance, named laws with one
preferred: R1); values and models of properties only in the property
dictionary and the levels that replace it (C397); shared blocks by `sameAs`
(R6); pair quantities by an unordered key (R7); no literal default (R3).

| class | what | count today (script) | conforms when | moves a number? |
|---|---|---|---|---|
| A | component records, by property block | 696 records (`count_records.py`): `vaporPressure` 543 (Antoine 510, AmbroseWalton 32, Wagner 1; `Trange` 511); `idealGasHeatCapacity` 592 (five-constant form 355, polynomial 194, NASA9 43); `liquidHeatCapacity` 516 (`Trange unknown` 10); `solidHeatCapacity` 16; `liquidViscosity` 402 (five-constant 396, two named forms 5, Andrade only 1); `liquidThermalConductivity` 381; `surfaceTension` 88 (bare form); provenance entries misplaced inside `cosmo{}` / `pcsaft{}`: 74 (`misplaced_prov.py`) | every block is a law list in the R1 shape; windows soft and hard; provenance per law; the 74 entries in the top-level block; the two "Vogel" forms that are Andrade with C = 0 (methanol, toluene) renamed or removed | NO for the shape and the provenance move (the old form is read as a one-law list; proved by the characterisation bench of the kernel's TR-16, bit for bit); YES where a preferred law or a hard window is chosen (per record, listed) |
| B | pair and parameter records; component overlays | `data/standards/parameters/`: NRTL 793, Wilson 790, Henry 486, UNIQUAC 374, Pitzer 182, eNRTL 48, EdwardsPitzer 34, solution 12, adsorption 6 (+ 9 nested), Helmholtz 4, UNIFAC 2, SRK 1, OlssonNaOH 1 (`count_review.py`); both spellings of one pair present: 0, self pairs: 0 (`pair_dups.py`); case-local component records 2314 in 595 cases, of which `overlayOf` leaf-merging overlays 18 | pair keys unordered, duplicates refused at load (already true on disk); an overlay replaces whole top-level blocks only (R6) | NO (the 18 overlays converted to whole-block replacements, each case byte-identical) |
| C | asset records | 33 (`count_review.py`): feedSpacer 6, membraneModule 7, membraneClass 6, constructionMaterial 4, adsorbent 3, edStack 2, NF 2, RO 1, IEM 1, ionExchangeResin 1 | a solid's or a device's property (an adsorbent's heat capacity, a catalyst's densities) lives in its asset record, not in a unit block (class E) | NO when the value moved is the one the case declared |
| D | case property dictionaries, at each level | 600 `constant/thermoPhysPropDict` (`count_cases.py`): top-level keys `equilibrium` 572, `transport` 86, `caloric` 37, `aqueousProperties` 28, `approximations` 13, `pureFluids` 12, `inherits` 5, `volumetric` 1; selectors: liquid viscosity Vogel 20, Andrade 2; gas viscosity Chung 61, ChapmanEnskog 1; Eucken 24, modifiedEucken 1; Fuller 32; SatoRiedel 5; BrockBird 29; `mixingRule` written 0.  Below the case: 5 sector dictionaries (one plant), 8 unit `thermo {}` blocks in 7 flowsheets + 1 nested unit (all `equilibrium` only), 21 props-operation fragments | the effective dictionary per scope printed (R6); a legacy `model` word read as a pin of all constituents (design 5.4); no transport block replaced below the case today, so `sameAs` has no shipped user until one needs it | NO |
| E | unit and pass blocks holding a property value or model | from the readers (design section 3) and `count_unit_keys.py`: column `liquidViscosity` 15 cases (DistillationColumn.cpp:5072-5073, 5574-5575; RateBasedSegment.cpp:233-234); spray dryer `liquidViscosity`/`surfaceTension` 1 (SprayDryer.cpp:126, 397); pipe `viscosity`/`gasViscosity`/`surfaceTension` 1 (Pipe.cpp:266-360, 481); spiral-wound and rated test `rho_feed`/`viscosity`/`diffusivity`: 17 / 9 / 1 files (SpiralWoundModule.cpp:320-348; RatedTestInversion.cpp:224); `osmotic { model; Cphi }` 4 (SpiralWoundModule.cpp:634-640; BatchDiafilter.cpp:103-110); diafilter `rho` 3 (BatchDiafilter.cpp:145); adsorber `muGas` 1 and `solidHeatCapacity` 6 (FixedBedAdsorber.cpp:224, 576); PFR coolant `cp` 1 (PFR.cpp:1946-1953); tray `hydraulics.sigma` 1 (TrayHydraulics.cpp:164); post-processing `density`/`heatCapacity`/`viscosity` 4 / 3 / 1 (CleanUtilitiesPass.cpp:126-127, 324; PipeHeaderSize.cpp:176-199) | each value becomes a measurement or table of the case in the property's own block (C397 point 2); a solid's value goes to its asset record; a utility fluid's to its utility record; the osmotic model to the aqueous activity model the case declares | NO when the same number is carried (a one-point measurement returns it); YES where the kernel replaces a constant (listed per case) |
| F | C++ sites pricing a property themselves; literal defaults | liquid-property ratchet debt 80 sites in 36 files (`bin/curate/liquid_property_ratchet_debt.tsv`, summed by `count_review.py`); literal defaults in one home, `liquidSource` (src/core/PropertySourceLog.H:111-195): 1000 kg/m3 x 4, 1e-3 Pa s, 0.072 N/m, 1.6e-9 m2/s, 1e-6 m2/s, and outside it 1.8e-5 Pa s (Atomizer.H:86); the gas and interface properties have no ratchet yet; cases whose goldens carry a default's tag: `default.rhoFeed1000` 32, `default.water1e-3` 26, `constant.diluteCarrier` 13, `default.legacy1.6e-9` 3, `constant.waterKinematic1e-6` 3, `fallback.water0.072` 2 (grep of tutorials) | the ratchet at zero; each literal default a named absence (R3); a ratchet for vapour and interface properties | YES for every case that relied on a default and receives a kernel value; NO for one that declares the same number |
| G | reaction records | 100 case `constant/reactions` files with 245 `stoichiometry` blocks (`count_review.py`); 233 aqueous chemistry records (equilibria, not rates) | at load: an element balance of every declared reaction; the rate constant's dimension from the declared orders; the reaction echoed as one line (R8); non-mass-action reversible orders are already refused (Reaction.cpp:186-237) | NO for a balanced reaction; a refusal for an unbalanced one (none expected; the boundary element closure holds on every steady case) |
| H | EduTool pages and guide sections stating the old layout | hits of `liquidViscosity {`, `andrade {`, `vogel {`, `model Vogel/Andrade/chemsepEq101`, `Trange` (`count_review.py`): Theory/Tutorials guide sources 7 files, 27 hits; docs/ai 6 files, 20 hits; app sources (`gui/src`) 4 files, 7 hits | each states the ruled layout, in the same slice as the engine change it describes (rule 4d) | NO (text); the lesson tests that cite `file:line` move with the engine |
| J | property definitions below the case, to become named packages (design 5.5d P1) | unit `thermo {}` fragments: 8 blocks in 7 flowsheets + 1 nested unit, all `equilibrium` only; sector dictionaries with `inherits`: 5 (lithiumBrinePlant), each a full `equilibrium` (their `components` lists have no effect: Flowsheet.cpp:2147, :2180); props-operation `thermo {}` fragments: 21 propsDicts (`count_cases.py`, grep); Grunberg-Nissan `interaction` rows inline: 1 props case (`mixing01_water_acetone`) | every definition in the case's one dictionary as a named package derived from one base; every level SELECTS by `propertyPackage <name>;`; a sector folder carries no definitions | NO: the anonymous readings keep their own merge semantics until migrated, and each migration is proved byte-identical per case |
| I | dictionary examples printed in docs/ai and the guides | 227 fenced blocks in docs/ai shaped like a dictionary (`count_review.py`); no gate parses them today | `check_dict_examples` passes each through the engine's reader of its grammar (design 5.5c, R11); failures pinned and shrinking | NO |

## 2. Slices, in order, with the validation each needs

| slice | content | classes | numbers | validation |
|---|---|---|---|---|
| P0 | the named-package reader: `packages {}`, `derivedFrom`, the property-block atom, `propertyPackage` selection in flowsheet, sector and props operation; the anonymous readings of class J kept with their semantics and announced; the resolved view per package (route, densities of both phases, CHOICE and DATA columns) | D, J | none | the characterisation bench (every shipped case's resolved packages, old reader against new, identical); `--fast`; the 7 + 1 + 5 + 21 cases of class J byte-identical |
| P1 | migration of class J to named packages: the 8 unit blocks, the 5 sector dictionaries (sector folders emptied of definitions; `seal` and sector export materialise the resolved packages), the 21 props fragments; Grunberg-Nissan rows to pair records | J, B | none | each migrated case byte-identical in its results; a sector of lithiumBrinePlant opened and run alone before and after, identical |
| R0 | the printout and the audits: the effective dictionary per scope with defaults (`choupo-lint --effective`), the defaults shadow in `lookup*OrDefault`, the unread-key audit extended to the property dictionary and the records | D, I (the gate, with its pinned list) | none (advisories may add rows, listed before landing) | build; `--fast`; the gates that read the touched files; one witness per binary for the printout |
| R1 | the record reader learns the R1 shape and reads the old one as one-law lists; the 74 provenance entries moved and `transport_fit.py` fixed; the windows of Andrade, Vogel, NASA7 announced | A | none | the characterisation bench recorded on main first, then bit for bit; `--fast`; full sweep only if the bench shows a path every case reaches has changed (it should not) |
| R2 | pair grammar for diffusivities; the column's own Wilke-Chang moved behind it (the same rule, so the same number) | D, E, F | none | the 15 distillation cases and the 8 rate-based/transfer-unit cases byte-identical; the ratchet lowered by the sites removed |
| R3 | component overlays as whole-block replacements | B | none | the 18 cases byte-identical |
| R4 | unit-block values moved into the property dictionary as measurements (column, spray dryer, pipe, membranes, diafilter, tray, adsorber gas viscosity); solid and utility values to their asset and utility records; the osmotic model to the aqueous package | C, E | none where the same number is carried | each touched case byte-identical in its values; `--scope` over membranes, distillation, drying, hydraulics, adsorbers |
| R5 | the literal defaults become refusals, case by case declaring a value or a model | F | YES: up to 32 + 26 + 13 + 3 + 3 + 2 cases (overlapping); each declared at its old number moves none, each moved to the kernel moves its rows | per case; the re-recorded list in the commit with the reason per row; conservation gates on every moved case |
| R6 | `table` for liquid viscosity, then vapour pressure (design 5.5) | A, D | none for existing cases | new witnesses with thresholds written before they run; `--fast` |
| R7 | water's preferred vapour pressure (design 5.7), after column05's convergence is fixed | A (water) | YES: the 2026-09 sample moved 37 of 102 water cases (268 rows) and stopped one; the population is 358 cases | staged re-measurement over all 358 first; the architect's ruling on the written list; family by family re-seal; a full sweep (a path every water VLE case reaches) with its written reason |
| R8 | reactions: element balance, rate-constant dimension, one-line echo | G | none expected | every reactive case runs; a sabotage (one hydrogen removed) refused at load |
| R9 | guides, docs/ai and lessons rewritten to the ruled layout; the docs-example gate's pinned list driven to zero | H, I | none | the gate at zero; the guides rebuilt and read back; `--gui` for the lessons |

No slice above is started by this record.  Each one, when dispatched, carries
the four documentation criteria of rule 4d and retakes its own counts.
