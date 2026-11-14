# The design record "several laws per property", attacked on its four points

Date: 2026-11-14.  Subject: `docs/design/several-laws-per-property.md` on
`design/several-laws-per-property` at 10f8a39f5, and the coordinator's
four questions on the board (05:10).  Measured by a reviewer the
reviewing session dispatched, on a clean built tree at 71203dc590 whose
`src/` and `data/standards/` equal the record's base; two of its
corrections were reproduced by the reviewing session (marked).  No
tracked file modified, nothing built, no suite run.  Scripts (standard
library only) in `scripts/`; findings in `findings.tsv` (SL-01..SL-09).
The second opinion on the layout itself is
`../2026-11-14-openfoam-property-architecture/REPORT.md`.

## (a) "A legacy model word reads as a pin of that law for every constituent, so no golden moves"

Holds for what it literally covers; the proof it names is not enough.

* Holds: for the 20 Vogel and 2 Andrade case-level words the engine
  already picks the same-named sub-block in every constituent with x > 0
  and refuses a record without it (`ThermoPackage.cpp:2186-2188`,
  `Andrade.cpp:42-53`, `Vogel.cpp:43-57`, `ChemSepVisc101.cpp:41-98`).
  Control, water + ethanol under Vogel: 9.4376e-4 Pa s at 300 K,
  6.4481e-4 at 320 K.
* SL-01.  The characterisation bench of TR-16
  (`PropertyRouteBench.cpp:390-516`) sweeps liquid viscosity, surface
  tension, liquid diffusivity and density, on CATALOGUE records only.  It
  has no liquid conductivity, no vapour pressure, no heat capacity, and
  it never sees a sealed copy (365 of the 371 dictionaries that name
  water carry their own records).  Slice 0 re-reads all of those.
* SL-02.  Section 5.4's list of cases misses the words written at
  operation level inside five property dictionaries: Vogel 7, Andrade 3,
  StoredCorrelation 23, BrockBird 15, chemsepEq16 6, SatoRiedel 1.
* SL-03.  Four kinds of word are NOT "a pin of the law of that name":
  SatoRiedel and BrockBird are predictive and name no record law;
  StoredCorrelation means "the record's block, else Brock-Bird for that
  component, announced" (`StoredCorrelation.cpp:46-56`), so for surface
  tension the engine DOES mix forms per component today; and the words
  are case-insensitive aliases, so word to sub-block is a table, not an
  identity.
* SL-04.  Hidden defaults a re-reader can disturb.  Vogel's C defaults
  to 0 (`Vogel.cpp:56`); the five-constant form's C, D, E default to 0
  (`ChemSepVisc101.cpp:97-99`); NASA7's window defaults to 200/1000/3500 K
  (`NASA7Cp.cpp:47-49`).  With NO word the factories default to Andrade,
  StoredCorrelation and SatoRiedel; no case reaches those defaults today
  only because `ThermoPackageBuilder.cpp:2176` calls
  `entryValue("model")`, which throws (measured: a viscosity block
  without a word gives "missing entry 'model'", exit 1).  The record's
  new reading ("no word: each constituent's preferred law") lives exactly
  at that line: whoever relaxes it must delete the three factory defaults
  in the same change, or a word-less block silently becomes Andrade.
* SL-05.  Record facts are injected into law dictionaries: Tc, Pc, omega,
  Tb into the vapour-pressure block (`Component.cpp:531-542`); the WHOLE
  ideal-gas heat-capacity block into the liquid one for RowlinsonBondi
  (`Component.cpp:775-779`, `RowlinsonBondi.cpp:61-69`; three case-local
  records use it).  Once the ideal-gas block can hold several laws, which
  one is injected is a choice the record does not make.  A second reader
  of a record block exists (`ThermoPackageBuilder.cpp:765-766` reads a
  salt's `liquidHeatCapacity` directly).  And `pureFluids` wins over the
  word for a pure phase (`ThermoPackage.cpp:2165/2195/2244`): seven cases
  declare both `pureFluids` and BrockBird, and the transport row of the
  record's 5.6 omits it.

What would make (a) proved: the bench extended to the five properties
slice 0 re-reads, run over every sealed copy as well as the catalogue,
and the operation-level words added to the byte-identity list.

## (b) The joint rule of a piecewise law

Holds for heat capacities.  The vapour-pressure rule cannot be decided
from the tree.

* The only two-range laws in the catalogue are 43 NASA9 ideal-gas heat
  capacities and graphite's NASA7 solid one.  No vapour-pressure record
  has two ranges.
* Value at the common temperature: at most 1.2e-8 relative; all 44 pass
  the proposed 1e-6.
* Slope (NASA9): median jump 2.62 % (the record's number reproduces); 31
  of 43 above 1 %, 18 above 5 %, 12 above 10 %; the largest is ozone at
  +237 %; graphite -32 %.  **A slope jump of a few per cent is a fact of
  the published fits, not a defect**: value continuity alone is the right
  contract for a heat capacity.
* SL-06.  A relative slope is ill-conditioned for species whose slope is
  near zero (atoms); if the jump is to be PRINTED, use d ln Cp / d ln T
  (median jump 5.4e-3).

## (c) Staging water's vapour-pressure flip

The counts hold and the proposed order is supported; one coupling is
missing.

* `water.dat:86-91`: Antoine (5.40221 1838.675 -31.737), `Trange (273 373)`.
* 371 dictionaries name water: 358 Antoine (one coefficient set
  throughout), 12 IF97, 1 Wagner.  Four of the 358 are the sector
  dictionaries of one plant, so the distinct cases are 354, of which 343
  have a golden.  ("353 sealed" in the record counts copies.)
* By dependence on water's vapour pressure, read from the dictionaries
  and not run (`water_family.tsv`, 62 families):

  | class | with a golden | without |
  |---|---|---|
  | an equilibrium or evaporation unit | 100 | 5 |
  | a vapour-liquid property operation | 35 | 2 |
  | a vapour only declared (the energy report resolves every unpinned authored stream through equilibrium, so these read it too) | 179 | 8 |
  | none | 29 | 0 |

* The 2026-09 sample is recorded in
  `docs/design/what-water-dat-does-not-say.md` section 4 and in the
  register: one property flipped on 102 cases chosen by family, against a
  control; 62 pass, 38 fail, 268 rows in 37 cases, one column not
  converging; its 4.1 explains every move family by family.  That
  supports the record's order: one property first, then re-seal family
  by family.
* SL-07.  Omitted by the record: the stored water PAIRS were regressed
  on that Antoine.  24 molecular water pair records carry `fittedInCase`
  (NRTL 15, Wilson 7, UNIQUAC 2), and all 14 sealed water copies checked
  in their fitting cases are Antoine; 89 electrolyte pairs (Pitzer 44,
  eNRTL 45) were fitted in their own cases.  A pair fitted with one
  vapour pressure and used with another is a different model: the
  fitting cases need their own stage and a ruling on refitting BEFORE
  the cases that consume those pairs are re-sealed.

## (d) The 74 misplaced provenance entries

The count holds; "nothing numeric reads them" holds for shipped cases;
two corrections.

* Recount, own script (`scripts/misplaced.py`, `misplaced.tsv`): 74
  entries in 55 records: surface tension 45, liquid viscosity 18, liquid
  conductivity 10 inside `cosmo {}`, and 1 inside `pcsaft {}`.
* SL-08 (reproduced by the reviewing session).  The record places the
  `pcsaft` one at `water.dat:296`; that line is inside `cosmo {}`.  The
  one inside `pcsaft {}` is `propane.dat:149`.
* Readers: provenance `Component.cpp:984-1010`; the phantom reader is
  the sigma-profile set reader, `Component.cpp:1100-1135`; the `pcsaft`
  phantom is read by nobody.
* Effect, measured: a phantom makes a SECOND set, so the model without
  `source` refuses.  1-propanol + 1,1-dichloroethane: no `source` ->
  refused, "carries several COSMO sets ( LVPP-HFTZVP-2018 surfaceTension )";
  with the source named -> runs, gamma(1-propanol) = 1.3677 at x = 0.25;
  a control record without a phantom runs on its lone set.  31 catalogue
  records carry one real set plus a phantom (`phantom_list.tsv`).  The
  three shipped cases of that model all name `source` and read
  phantom-free copies: **no shipped number depends on a phantom**.
* SL-09.  Not in the record: 34 more phantoms sit in SEALED copies in 31
  cases, 30 of them in water's copy.  Slice 0's move of the catalogue
  entries does not reach them until each case is re-imported; the gate
  proposed for slice 0 ("no property provenance inside another block")
  will fail on them or must say it reads the catalogue only.

## Other statements of the record that do not reproduce

* 5.6 says heat capacities refuse a missing datum.  A missing liquid
  heat capacity takes an announced Watson-slope fallback
  (`Component.cpp:1560-1575`) and a missing solid one an announced
  fallback to the liquid (`:1205-1229`); the cited lines 514-522 are the
  vapour-pressure refusal.
* `ThermoOverride.H:93-97` is the forbidden-key refusal; the list of
  replaceable blocks is at `:101-106`.  A unit's `transport` replaces the
  case's WHOLE transport block.
* "21 propsDicts" with an operation-level `thermo {}`: 9 files, 65 blocks.
* Provenance counts off by one: vapour pressure 505 (504), ideal-gas heat
  capacity 124 (123), liquid heat capacity 83 (82).  Every other count of
  its 1.1 reproduces exactly.

## Not done

No golden was run and no staged flip retaken.  Whether published
two-range vapour-pressure fits meet a slope-continuity rule cannot be
measured from the tree.  The dependence classes of (c) are a reading of
dictionaries, least certain in the third class.
