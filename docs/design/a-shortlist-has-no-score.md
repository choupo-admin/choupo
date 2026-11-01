# A shortlist has no score

*DEV.md 4c C189, slice 5 -- 2026-11-01.  Witnesses
`tutorials/props/membrane/shortlist01_class_to_modules` (the op) and
`tutorials/steady/membranes/membrane28_water_permeance_from_sheets` (the
derivation it rests on); gates `bin/curate/check_membrane_shortlist.py`,
`check_rated_tests.py` arm (h), `check_membrane_classes.py` arm (f); the op in
`src/propertyOps/MembraneShortlist.{H,cpp}`, the probe it shares with the
rated-test inversion in `src/unitOperations/membrane/RatedTestInversion.{H,cpp}`.*

## 1. The question and where it lives

A student who chose a membrane by what it DOES (slice 3: a functional class)
now asks which products do that, at HIS pressure, temperature, feed and
recovery -- not at the data sheet's.  The answer is a props operation,
`membraneShortlist`, in `choupoProps`: it needs no flowsheet (one element, one
solute), it is a comparison of records, and the rated-test inversion it rests
on is already a library function (`RatedTestInversion`), so the op calls the
module exactly as the inversion does.  A `flowsheetDict` unit would have
bought a stream table nobody reads.

## 2. The two steps

1. **Hard filters on the record alone**: the element's membrane is of the
   class's type (NF | RO), the record is a spiral element, it carries ONE rated
   test of the asked solute, the test's rated rejection lies inside the class's
   band (every salt the class rates and the record rates), and the declared
   `limits {}` hold at the student's feed pressure, temperature and (when
   given) pH.  A limit the record does not state is not a filter and prints
   `n/s`.
2. **Re-rating at the student's conditions**: each survivor is run with the
   film, spacer and polarisation of the op's `operation` block at the
   student's pressure, temperature and feed concentration, with the feed flow
   found (a bracketed solve on the module itself) so that ONE element delivers
   the student's recovery.  Two limits that need that run then filter again
   (`feedFlow_max`, `dP_max`) and an element they exclude STILL shows its
   numbers: an exclusion is explained, not hidden.

## 3. What the re-rating stands on: the sheet's permeate

The first draft re-rated with the membrane record's A_w and gave the shipped
candidate a permeate 2.4x the sheet's.  That is the C189 slice-2 finding
(2.16x NF270-4040, 2.08x SW30HR-380), and its cause is now measured, not
supposed.  The membrane records `NF270` and `SW30HR` carry an A_w that is a
FIT to a teaching case (`provenance fittedToCase;`, 36 and 3.6 L/m2/h/bar),
while a data sheet measures THE ELEMENT's permeate at a stated pressure.  The
active area (7.6 and 35 m2 are the sheets'), the pressure basis (gauge, since
320bdc7a8) and the inversion are all right; the typed A_w answers a different
question.  (SW30HR's header also converts its own number wrongly: 1.0e-6 m/s/bar
is 3.6 L/m2/h/bar, the header says 14.  Left as found: a comment, and the
records are not edited -- see below.)

The decision: `waterPermeance fromRatedTest;` in a unit's operation (and the
same function inside the shortlist) finds, TOGETHER, the A_w that reproduces
the sheet's permeate and the R_int that reproduces its observed rejection.  The
two are coupled -- the wall concentration depends on the flux, the osmotic
pressure on the rejection -- so the two bracketed solves alternate until A_w is
stationary (5-6 rounds).  Measured on the two shipped elements:

| element | record A_w | derived A_w | R_int | rated-test permeate |
|---|---|---|---|---|
| NF270-4040, MgSO4 | 36 | 14.88 | 0.979347 | 9.5 m3/d at 15 %, to 5e-15 |
| SW30HR-380, NaCl | 3.6 | 1.318 | 0.997398 | 26 m3/d at 8 %, to 2e-15 |

The derived value is a model parameter of the element as this film model reads
it, not a manufacturer's number, and it is announced with the record's beside
it.  The membrane records are NOT edited: their fit still serves membrane01
and membrane02, and editing a teaching fit to match a sheet would move every
golden that uses it while destroying what the fit was fitted to.  One home:
`deriveWaterPermeance`; a C++ setter (not a dict key) carries the override into
the probes, so no case can type an A_w beside a record that has one.

## 4. No score, no rank, no payer

Every criterion is published side by side (permeate flow, observed rejection,
permeate concentration, flux, P/flux, hydraulic energy per m3 of permeate, feed
flow, pressure drop, the derived A_w and R_int, and each limit's margin), the
candidates in ALPHABETICAL order of their names.  There is no default score:
a weighted sum is a hidden choice of what matters (the external specification
forbids the "magic score" in its own words), weights belong to the student's
decision, and nothing here has a weight to declare.  The gate holds the
absence at the source (no sort, score, weight or rank in code, comments and
string literals stripped) and by behaviour (a fixture whose best performer is
alphabetically last stays last).

The monetisation architecture of the slice-0 note -- a manufacturer may
sponsor its presence -- is fixed on one condition: a paid position or an
undisclosed exclusion is an unfair commercial practice (Directive 2005/29/EC
Annex I item 11a) and the comparison must stay objective (Directive
2006/114/EC).  So the commercial relation (`partner`, `dataVerifiedBy`) is a
field of the record that NOTHING in the ranking path reads: no reader in
`MembraneModule`, the registry, the inversion or the op mentions either word
(source arm), and adding the block to every record or to one leaves the
printed table and the CSV byte-identical (behavioural arm).

## 5. The data/local tier -- a reversal, with its reason

Slice 4 declined a third registry tier ("a private record reaching every run
by name is the shape `data/local/README.md` warns about").  The shortlist is
the consumer that makes that rule unworkable: a comparison over a catalogue of
N imported elements cannot have N copies pasted into every case.  Decided
(rule 00, with the safeguards the warning asks for):
`MembraneModuleRegistry` reads `data/local/assets` as its LOWEST tier --
local < standards < the case's `constant/assets` -- exactly the precedence
components have had since 2026-07-13; a name present in both tiers takes the
standards record and says `[shadowed]`; a local record that is USED says
`[local] ... UNVERIFIED`; a sealed run (empty data root) never reads the tier;
and the op's `tiers ( standards case local )` lets a witness declare which
tiers are candidates, so its golden does not depend on one machine's private
records.  The importer's report, header and the `data/local` README say so.
An imported element names no membrane (the catalogue states no transport
parameters): the op takes a `carrier` membrane for such records, which supplies
the type (NF | RO) and the starting A_w the derivation then replaces.

## 6. The importer

Asked to seal the class witness, `bin/choupo-import` died on `unknown membrane
module 'Generic-4040'`: a class names its element by reference (`element`) and
the closure did not follow it.  Followed now, together with the spacer the
element names.  A module that reads a feed-spacer record (`feedSpacer`) seals
and reproduces its golden on this tree (membrane28, 12 records); the exact
refusal slice 3 recorded (`unknown feed spacer 'Spacer-28mil' ... builtins not
installed`) did not reproduce, and the only unsealable spacer path found was
the class's.  Arm (f) of `check_membrane_classes` seals both in temp copies.

## 7. REJECTED

* A default weighted score, or weights with defaults, or a sort by any
  criterion (including "best first"): the order is the name's.
* Re-rating with the membrane record's A_w: a permeate 2-3x the sheet's.
* Editing the NF270 / SW30HR records to match their sheets: the fit serves
  other cases; the sheet's number is the element's, derived per use.
* Storing the derived A_w in the module record: a derivative (the tree stores
  none) that goes stale with the film model.
* A `waterPermeance <number>` declaration beside a record that has one: a
  second home for A_w.
* A `flowsheetDict` shortlist unit: no streams to draw.
* Reading `partner` anywhere on the ranking path, even to break ties.
* Letting every machine's `data/local` reach a golden: `tiers` declares the
  candidates.
* Silently skipping a candidate that cannot be re-rated: it is listed with the
  reason.

## 8. What is not done

One solute, one element, a constant intrinsic rejection fixed at the sheet's one
test (a model's reading of a sheet away from its test, not a guarantee of the
product); several solutes or elements in series at once; a `weights` declaration
(it would be the student's, and nothing needs it yet); the GUI table (the CSV
and the diagnostics are the surface); the Theory Guide section for the
derivation (the guides are rebuilt with `make -C docs`, not touched here -- the
Tutorials Guide still says the shortlist is "a later slice" at the membrane26
paragraph).

## 9. Sabotages

By hand, rebuilt, run, restored; the gates patch nothing.

* S1 `MembraneShortlist.cpp`: class-band filter disabled.  CAUGHT by (a): Hyp-C
  passes, and is re-rated though its record excludes it.
* S2 a `stable_sort` by permeate before publishing.  CAUGHT by (c) twice: rows
  out of alphabetical order, and the banned device in the source.
* S3 a reader of `partner` that moves sponsored records first.  CAUGHT by (d)
  twice: the source arm, and the CSV/table no longer byte-identical.
* S4 re-rating at the sheet's pressure instead of the student's.  CAUGHT by (b):
  the independent run gives 12.33 m3/d against the shortlist's 9.5.
* S5 data/local scanned after standards (local wins).  CAUGHT by (f): no
  `[shadowed]`, and NF270-4040 takes the local copy's R_int.
* S6 the A_w override dropped in the probe.  CAUGHT by `check_rated_tests` (h),
  but NOT as predicted: membrane28 then does not run at all (the alternation
  cannot bracket), not a numeric mismatch.
* S7/S8 (`bin/choupo-import`) without `element` in the closure regex: the class
  witness fails to seal; without `feedSpacer` as well: both fail.  CAUGHT by
  `check_membrane_classes` (f).
