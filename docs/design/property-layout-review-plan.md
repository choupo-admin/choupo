# The review of the whole tree against the ruled property layout (C398): inventory and slices

Kind: PLAN.  Status: OPEN -- rewritten 2026-11-14 to the RULING of C398
(DEV.md 4c, block "C398, RULED"; the top section of
[`several-laws-per-property.md`](several-laws-per-property.md)), which it
follows in its order of slices.  No slice is started; nothing in the engine,
data, cases, goldens, guides or the app was changed.

Method.  Tree: `origin/main` at 83384f58c merged into the design branch
(2f74f878b); every count below was taken on it by a script kept outside the
tree, `/tmp/claude-1000/c398/` (`count_records.py`, `misplaced_prov.py`,
`count_cases.py`, `count_unit_keys.py`, `count_review.py`, `pair_dups.py`), or
read from the reviewing session's reports
(`docs/reviews/2026-11-14-several-laws-design-record/`), which the row names.
A count is the state on that date; each slice retakes its own before it
starts.

## 0. For a phone

* Slices (a) to (e) move NO number: per-property replacement in `transport`
  with named variants, the resolved view and the same-values gate; named laws
  in records with the old shape read; the table type; directed diffusion
  entries; the packing as a record.
* Then the unit blocks that hold property values, ONE FAMILY at a time; the
  literal defaults become refusals LAST, because that is the step that moves
  goldens (up to 32, 26 and 13 cases carry a default's tag).
* The rate-based column's own property sites go after (d), before the
  three-component slice (addendum A4).
* Then, outside this layout, the reaction checks of C399.
* WATER'S VAPOUR-PRESSURE FLIP IS NOT IN THIS PLAN (ruling 8, review row
  SL-07): it is a separate refitting campaign that needs its own decision
  (section 3).

## 1. The inventory (measured 2026-11-14)

"Conforms" is the ruled design: a case's property dictionary keeps its blocks
and may add `variants {}` deriving directly from its own system; a unit and a
property operation select a variant with `thermo <name>;`; the atom of
replacement is the property block inside `transport` and `volumetric`; a
sector keeps its own dictionary; records keep their shape and gain named laws
inside the existing block, one preferred, each with window and source; no key
with one possible value; no literal default.

| class | what | count today (script) | conforms when | moves a number? |
|---|---|---|---|---|
| A | component records, by property block | 696 records (`count_records.py`): `vaporPressure` 543 (Antoine 510, AmbroseWalton 32, Wagner 1; `Trange` 511); `idealGasHeatCapacity` 592 (five-constant form 355, polynomial 194, NASA9 43); `liquidHeatCapacity` 516 (`Trange unknown` 10); `solidHeatCapacity` 16; `liquidViscosity` 402 (five-constant 396, two named forms 5, Andrade only 1); `liquidThermalConductivity` 381; `surfaceTension` 88; misfiled provenance entries 74 in the catalogue (`misplaced_prov.py`) plus 34 in sealed copies in 31 cases, 30 of them in water's copy (review row SL-09) | named laws inside the existing block, one preferred, each with window and source; the 108 misfiled entries in the top-level block; the two "Vogel" forms that are Andrade with C = 0 (methanol, toluene) renamed or removed; windows announced for every law that has none (Andrade, Vogel, NASA7) | NO (the old shape reads unchanged; proved over every sealed copy and for conductivity, vapour pressure and heat capacities too: SL-01) |
| B | pair and parameter records; component overlays | NRTL 793, Wilson 790, Henry 486, UNIQUAC 374, Pitzer 182, eNRTL 48, EdwardsPitzer 34, solution 12, adsorption 6 (+ 9 nested), Helmholtz 4, UNIFAC 2, SRK 1, OlssonNaOH 1 (`count_review.py`); both spellings of one pair: 0; self pairs: 0 (`pair_dups.py`); case-local component records 2314 in 595 cases, of which `overlayOf` overlays 18; water pairs regressed on the present vapour-pressure law: 24 molecular (NRTL 15, Wilson 7, UNIQUAC 2) and 89 electrolyte (SL-07) | unchanged by this layout (pairs already keyed and unique on disk); the 113 regressed water pairs mark the boundary of the water campaign (section 3) | NO |
| C | asset and utility records | 33 assets (feedSpacer 6, membraneModule 7, membraneClass 6, constructionMaterial 4, adsorbent 3, edStack 2, NF 2, RO 1, IEM 1, ionExchangeResin 1); 10 utilities | a solid's or a device's property (an adsorbent's heat capacity, a catalyst's densities) and a utility fluid's live in their records, not in a unit block | NO when the value moved is the one the case declared |
| D | case property dictionaries and the inline fragments | 600 `constant/thermoPhysPropDict` (`count_cases.py`): `equilibrium` 572, `transport` 86, `caloric` 37, `aqueousProperties` 28, `approximations` 13, `pureFluids` 12, `inherits` 5, `volumetric` 1; selectors: liquid viscosity Vogel 20, Andrade 2; Chung 61, ChapmanEnskog 1; Eucken 24, modifiedEucken 1; Fuller 32; SatoRiedel 5; BrockBird 29; `mixingRule` 0; plus operation-level model words in five property dictionaries (Vogel 7, Andrade 3, StoredCorrelation 23, BrockBird 15, chemsepEq16 6, SatoRiedel 1: SL-02).  Inline fragments: unit `thermo {}` 8 blocks in 7 flowsheets + 1 nested unit (all `equilibrium`); sector dictionaries 5 (lithiumBrinePlant, kept as they are); props-operation `thermo {}` fragments 21 propsDicts | named variants where a case needs one; the inline fragments read as unnamed variants; the resolved view printed per unit and operation | NO (reviewer: no shipped case moves under the per-property atom) |
| E | unit and pass blocks holding a property value or model | column `liquidViscosity` 15 cases; spray dryer viscosity and surface tension 1; pipe 1; spiral-wound and rated test `rho_feed` / `viscosity` / `diffusivity` 17 / 9 / 1 files; `osmotic { model; Cphi }` 4; diafilter `rho` 3; adsorber `muGas` 1 and `solidHeatCapacity` 6; PFR coolant `cp` 1; tray `hydraulics.sigma` 1; post-processing `density` / `heatCapacity` / `viscosity` 4 / 3 / 1 (`count_unit_keys.py`; file:line in the design's section 3) | each value a measurement or table referenced from the property block (C397 point 2); solids and utilities to their records; the osmotic model to the aqueous activity model the case declares | NO when the same number is carried; YES where the kernel replaces a constant (listed per case) |
| F | C++ sites pricing a property; literal defaults | ratchet debt 80 sites in 36 files (`bin/curate/liquid_property_ratchet_debt.tsv`); literal defaults in one home, `liquidSource` (src/core/PropertySourceLog.H:111-195): 1000 kg/m3 x 4, 1e-3 Pa s, 0.072 N/m, 1.6e-9 m2/s, 1e-6 m2/s, plus 1.8e-5 Pa s outside it (Atomizer.H:86); cases whose goldens carry a default's tag: `default.rhoFeed1000` 32, `default.water1e-3` 26, `constant.diluteCarrier` 13, `default.legacy1.6e-9` 3, `constant.waterKinematic1e-6` 3, `fallback.water0.072` 2 (grep) | the ratchet at zero; every literal default a named absence | YES for each case that relied on a default and receives a kernel value |
| G | reaction records (outside this layout, C399) | 100 case `constant/reactions` files, 245 `stoichiometry` blocks; 233 aqueous chemistry records | an element balance of every declared reaction at load; the rate constant's dimension from the declared orders | NO for a balanced reaction (the boundary element closure holds on every steady case) |
| H | guide, docs/ai and app pages stating the old layout | guide sources 7 files / 27 hits, docs/ai 6 / 20, app sources 4 / 7 (`count_review.py`) | each states the ruled layout, in the slice that changes the engine (rule 4d) | NO |
| I | dictionary examples printed in docs/ai | 227 dictionary-shaped fenced blocks; no gate parses them | a gate passes each through the engine's reader of its grammar; failures pinned and shrinking | NO |

## 2. Slices, in the ruled order

| slice | content | classes | numbers | validation |
|---|---|---|---|---|
| (a) | per-property replacement inside `transport` (and `volumetric`); `variants {}` deriving directly from the file's system; `thermo <name>;` in a unit and a property operation; inline fragments read as unnamed variants; the resolved view in two columns (choice, data); THE GATE: for one state and one variant the column and a property operation receive the same values; the unread-key audit and the defaults record on the property dictionary | D, I | none | the characterisation bench over every sealed copy, extended to conductivity, vapour pressure and heat capacities (SL-01) and to the operation-level words (SL-02); `--fast`; the 7 + 1 + 5 + 21 cases with fragments byte-identical |
| (b) | the per-component law object for the liquid transport laws, the package word becoming the mixing rule, a legacy word read as mixing rule plus a pin of that law for every constituent except the four of SL-03 (addendum A1); the gate `check_record_primitives` on the primitive / derived / check table (A3); named laws inside the existing record blocks, one preferred, window and source each; the old shape read; windows announced for Andrade, Vogel, NASA7; the 108 misfiled provenance entries moved (catalogue and sealed copies) and `transport_fit.py` fixed; the injected-law choice made explicit (SL-05); a word-less block allowed ONLY together with deleting the three factory defaults (SL-04); the four predictive or falling-back words not read as pins (SL-03); piecewise joints held on value, the slope jump printed as d ln y / d ln T (SL-06); IAPWS SR1-86 entered in water.dat as a named alternative, NOT preferred | A | none | the same bench, bit for bit; a gate that no provenance entry sits inside another block, over sealed copies too |
| (c) | the table type (units per column, strictly increasing abscissa, declared interpolation, hard ends, no clamp, a bounded reasoned extension), starting from the reader in src/core/Formula (PD-02); liquid viscosity first; then the heat-capacity table (addendum A2: liquid and solid first, integrated once at construction, covering 298.15 K or refused, a hard domain the present interface lacks) | A, D | none for existing cases | new witnesses with thresholds written before they run |
| (d) | directed diffusion entries (`solute`, `solvent` in a list, kind, conditions) and the declared returned quantity and composition model; the column's own Wilke-Chang moved behind them (the same rule, so the same number) | D, E, F | none | the 15 distillation and the rate-based cases byte-identical; the ratchet lowered |
| (e) | the packing as a record (C329) | C | none | the packed-bed cases byte-identical |
| rate-based prerequisite (after (d)) | the rate-based column asks the property dictionary for liquid diffusivity, viscosity, conductivity and density; its own Wilke-Chang instance goes; `liquidViscosity` in `packing {}` refused with the line to write (addendum A4) -- before the three-component slice | E, F | none (the same numbers, moved) | the 8 rate-based and transfer-unit packed cases byte-identical |
| families | the unit blocks of class E, one family per slice, each block that carries a property REFUSED once its slot exists, with the line to write in the property dictionary (addendum A4): distillation (with PD-01: the column's viscosity, diffusivity and density decided in the property dictionary), membranes, drying, hydraulics, adsorbers, batch membranes, post-processing; solids and utilities to their records; the osmotic model to the aqueous package | C, E | none where the same number is carried | per family `--scope`; each touched case byte-identical in its values |
| defaults (LAST) | the literal defaults of class F become refusals, case by case declaring a value or a model | F | YES: up to 32 + 26 + 13 + 3 + 3 + 2 cases (overlapping) | the re-recorded list in the commit with a reason per row; conservation gates on every moved case |
| reactions (C399, outside the layout) | element balance of every declared reaction at load; the rate constant's dimension from the declared orders | G | none expected | every reactive case runs; one sabotage (a hydrogen removed) refused at load |
| guides | guides, docs/ai and lessons to the ruled layout, slice by slice; the docs-example gate driven to zero | H, I | none | the gate; the guides rebuilt and read back; `--gui` for the lessons |

The rate-based column resumes after (e).

## 3. Not in this plan: water's vapour-pressure flip

A separate campaign with its own decision (ruling 8, review row SL-07).  The
record keeps its present Antoine law as preferred; slice (b) adds the IAPWS
SR1-86 law as a named alternative a case may pin.  The flip needs, in order:
a refitting stage for the 24 molecular water pairs regressed in a case
(NRTL 15, Wilson 7, UNIQUAC 2) and a ruling on the 89 electrolyte pairs; the
convergence of `column05_reactive_methylacetate` on the new law; a staged
re-measurement over the 358 cases that price water on Antoine (the 2026-09
sample failed 38 of 102: 37 with moved rows, one stopped converging); and then
a family-by-family re-seal with its list written.
