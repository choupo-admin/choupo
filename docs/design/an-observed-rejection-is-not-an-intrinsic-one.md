# An observed rejection is not an intrinsic one

*DEV.md 4c C189, slice 1 -- 2026-10-31.  Witness
`tutorials/steady/membranes/membrane25_rated_test_inversion_nf270_4040`;
gate `bin/curate/check_rejection_inversion.py`; one home
`src/unitOperations/membrane/RatedTestInversion.{H,cpp}`.*

## 1. The defect

`transport constantRejection;` (C148) takes a constant INTRINSIC rejection
per solute, `R_int = 1 - c_p/c_m`, measured against the WALL (Geraldes &
Afonso, J. Membr. Sci. 300 (2007) 20, Eq. 1, R an input).  A data sheet
quotes an OBSERVED one, `1 - c_p/c_feed` -- the NF270-4040 sheet's
"stabilized salt rejection > 97.0 %" at 2,000 ppm MgSO4, an applied 70 psi
(4.8 bar gauge, 5.81 bar absolute -- section 6), 25 C, 15 % recovery.  The wall is richer than the feed twice over: the film
polarises it (`c_m/c_b > 1`) and the bulk concentrates along the leaf as
the water leaves.  A student who types the sheet's 0.97 as R_int therefore
gets a permeate saltier than the sheet measured, at exit 0, with nothing
saying so.  The two numbers share a symbol and a unit and differ only in
the reference concentration -- the kind of difference no reader sees.

## 2. The decision

A case may ask for the intrinsic rejection to be DERIVED:

```
transport  constantRejection;
transportParameters
{
    rejection { MgSO4 fromRatedTest; }
    source    "...";
}
```

`fromRatedTest` is the one word the `rejection {}` block accepts in place of
a number.  The unit (a `spiralWoundModule` with `module <name>;`) runs ITS
OWN module at the record's `ratedTest {}` and solves, by a bracketed 1-D
search, for the R_int whose predicted observed rejection equals the
sheet's.  Every other solute keeps its declared number; only the rated
solute can be derived.

**The probe is the module itself.**  `SpiralWoundModule::solve` on a deep
copy of the unit's own dict, so the film correlation, the spacer, the leaf,
the osmotic model and the friction are the case's.  One element in one
vessel (a sheet rates one element); no `scaling {}` audit; its console is
silenced and its advisories are filed as TRIAL ones (`core/Advisory.H`).

**The rated feed.**  Water + the rated solute at `feedMassFraction`, closed
on the module's own `rho_feed`; feed pressure the rated P, permeate the
case's `P_permeate`; temperature the rated T; volumetric feed
`permeateFlow / recovery`.  **Why that feed flow.**  The feed flow fixes the
crossflow and so the film coefficient, which is what the polarisation
depends on; the sheet's permeate and recovery together give the feed the
element was tested at.  Matching the sheet's recovery instead would need a
feed the sheet never ran, scaled by however far the membrane record's A_w
is from the element's.  The cost is stated, not hidden: with the NF270
record's teaching-case A_w the engine's permeate at the rated test is 18.9
m3/d against the sheet's 9.5 (recovery 29.8 % against 15 %, at the gauge
reading of section 6; 14.5 m3/d and 22.9 % when slice 1 read the 4.8 bar as
absolute), so the
polarisation the inversion corrects for is the engine's, and both numbers
are printed.  It is also the rule `check_membrane_modules` arm (f) runs the
rated test with.

**The solve.**  The predicted observed rejection rises monotonically with
R_int; Illinois regula falsi on [0, 1] to `|R_obs - R_sheet| <= 1e-10`.  The
residual and the probe count are printed and in the advisory, never pinned
(a golden on a number at the last digit pins the compiler).

**Announced and published.**  A `[ratedTest]` line on stdout and on stderr,
an accepted `provenance` advisory, the law's banner marking the R as
derived, and five KPIs: `R_int_fromRatedTest_<s>`, `ratedTest_R_obs_<s>`,
`ratedTest_cm_over_cb_<s>` (channel average), `ratedTest_recovery`,
`ratedTest_permeateFlow`.

**Refused by name**, never a silent fallback to the observed value: no
module record; a record with no `ratedTest`; a solute other than the rated
one; a solute that is not a component of the case; a case declared ION BY
ION (read from each component's own single-species `aqueousMapping`, not
from the package's aqueous chemistry, which an ideal package does not
configure); a rated rejection the film model cannot reach (it must lie
strictly between the predicted observed rejections at R_int = 0 and 1); and
the word on a unit that holds no module record (the batch diafilter, through
the law's own refusal).  A `ratedTest {}` missing a field is refused where
the record is read (all or nothing, `MembraneModule.cpp`).

## 3. The witness

membrane25: the same NF270-4040 element twice, fed 2,000 ppm MgSO4 at 8 bar
absolute; the rated test read as GAUGE (section 6), 5.81 bar absolute.

| | R_int | c_m/c_b at the rated test | R_obs at 8 bar | permeate MgSO4 |
|---|---|---|---|---|
| derived | 0.98641 | 1.874 | 0.95453 | 91 ppm |
| naive (0.97 typed) | 0.97 | -- | 0.90065 | 199 ppm |

The naive element passes 2.18x the salt; at the sheet's own test it reports
93.4 %, not 97.0 %.  (Slice 1 read the 4.8 bar as absolute: R_int 0.98331,
c_m/c_b 1.593, R_obs 0.94426, 111 ppm, 1.81x, 94.6 %.)

## 4. What the gate holds

The derived R_int typed back as a NUMBER and re-run at the rated test
reproduces 0.97 to 1e-7.  R_int > R_obs with `c_m/c_b > 1`.  With the film
switched off (k_film 10 m/s) the derived R_int still exceeds 0.97, and the
remaining gap is the bulk concentration along a constant-R channel with no
film, held to its closed form `R_obs = 1 - (1 - (1 - r)^(1 - R))/r` to 1e-5
at 800 stations and falling first-order from 200 (the march is first order).
So R_int and R_obs are EQUAL only in the limit of no film AND vanishing
recovery -- a refinement of "equal when polarisation is switched off",
measured: at the probe's 29.5 % recovery the bulk term alone is 0.0046
(slice 1's absolute reading; at the gauge reading the film-off probe runs
at 39.3 % recovery and derives R_int 0.976239).

## 5. Rejected alternatives

* **Using the observed value as R_int with an announcement.**  An
  announcement of a known-wrong number is still a wrong number; the
  inversion exists and costs five module solves.
* **Matching the sheet's recovery by moving the feed flow.**  It would put
  the film at a crossflow the element was never tested at, to hide an A_w
  mismatch that belongs to the membrane record (a curation act, Vítor's).
* **A closed-form film correction (`R_int` from `R_obs` and `exp(J/k)`)
  instead of running the module.**  A second home for the film, the leaf
  and the concentration profile, which would disagree with the module the
  first time any of them changed.
* **Splitting the salt's rejection between its ions.**  A salt test is one
  number for a neutral salt; the split is a model (SDEM's zero-current
  field, DSPM-DE's pore), not a datum.

## 6. Several rated tests (slice 2, 2026-10-31)

A data sheet may quote several standard tests -- an NaCl and an MgSO4
test, a typical and a minimum value, a second pressure.  They are
different operating points or different KINDS of number, so the record
keeps each as stated and nothing averages them:

```
ratedTests
(
    { id naclStd;  solute NaCl;  feedMassFraction 2.0e-3; P 4.8 bar; T 298.15 K;
      recovery 0.15; permeateFlow 9.5 m3/d; rejection 0.50; }
    { id mgso4Typ; solute MgSO4; ... rejection 0.97; rejectionValueType typical;
      pressureBasis feedGauge; pH 7; permeateFlowBasis sameTest;
      source "Form No. ..., Rev. ..., date"; }
);
```

**One home.**  `ratedTest {}` is read as a list of one (every shipped
record unchanged, byte-identical runs, held by the gate); a record
declaring both forms is refused.  The seven numbers stay required (all or
nothing); the optional facts are `id`, `rejectionValueType`
(`typical|minimum|maximum|approximate|range`, a range written `rejection
( lo hi );`), `pressureBasis` (`feedAbsolute|feedGauge|netDriving`), `pH`,
`permeateFlowBasis` (`sameTest|separateTest`), `soluteBasis` (the formula
the sheet states the solute AS -- boron as B) and a per-test `source`.  An
unknown key or word refuses (a misspelt key would otherwise leave its fact
silently absent).  Ids are unique, and two tests of one solute must each
carry one.

**Absent stays absent.**  The print lists every test (`Rated test <id>:`)
with exactly the optional facts it declares.  The inversion reads the
facts it needs and, where the record is silent, ANNOUNCES the reading it
takes (one `[ratedTest]` line, stdout + stderr + a provenance advisory):
the rejection inverted as stated, the pressure read as the absolute feed
pressure (slice 1's reading), the permeate flow assumed from the same test.
membrane25's record states none of the three, so its run now says so; no
number moved.  A `minimum`/`maximum` makes R_int a bound, said; a gauge
pressure is made absolute with the standard atmosphere, said.  REFUSED,
because each leaves the probe without the number it needs: a range (which
end is a decision about the element), a net driving pressure (the osmotic
pressure the sheet assumed is not stated), a permeate flow from a separate
test (the feed, and so the film, would be guessed), a solute stated as
another formula (no conversion here).

**Which test.**  `rejection { <s> fromRatedTest; }` takes the one test of
`<s>`; with two it refuses naming their ids, and the case writes `<s> (
fromRatedTest <id> );` -- a word list, because a dictionary value is one
token.  An unknown id, or an id naming another solute's test, refuses.
With two derived solutes in one unit (two tests), `ratedTest_recovery` and
`ratedTest_permeateFlow` take the solute's suffix; one keeps slice 1's keys.

**Found on the way, and decided.**  Slice 1 read the NF270-4040 sheet's
"applied pressure 70 psi (4.8 bar)" as an ABSOLUTE 4.8 bar.  DECIDED
(DEV.md 4c C189, rule 00): a data sheet's applied pressure is GAUGE (psig)
unless the sheet says otherwise.  The NF270-4040 and SW30HR-380 records
declare `pressureBasis feedGauge;` in their rated test, each quoting the
sheet's own words for the pressure ("applied pressure 70 psi (4.8 bar)";
"800 psi (55 bar)", neither saying absolute), and the probe runs at 5.81
and 56.0 bar absolute.  membrane15 and membrane25 were re-imported against
the records; membrane25's NFderived rows moved (R_int 0.98331 -> 0.98641,
the rated test's c_m/c_b 1.593 -> 1.874) and were re-recorded with the
list.  membrane16 keeps its pre-C146 seal: re-sealing it would move its film and
friction, held for Vítor since C146 (`a-stage-of-spiral-elements.md` 4),
and the attempt on 2026-10-31 was refused by the importer anyway -- its
staged run reported `FeedSpacerRegistry: unknown feed spacer
'Spacer-28mil' ... the builtins were not installed`.  membrane16 inverts
nothing, so none of its numbers depends on the pressure basis.

Gate `bin/curate/check_rated_tests.py` (single == list of one on
membrane15/16/25; a HYPOTHETICAL fixture record built in a temporary
directory for everything else -- no manufacturer's test is invented in
data/standards).

## 7. Not done

The functional classes are section 8 (slice 3); the import/QA tool and the
shortlist are C189 slices (4)-(5).  The SW30HR-380
record's NaCl test is not inverted by any witness.  A constant R_int stays
constant away from the test.  The membrane records' A_w is not corrected.

## 8. A membrane chosen by what it does (slice 3, 2026-10-31)

*Witness `tutorials/steady/membranes/membrane26_class_sulphate_removal`;
gate `bin/curate/check_membrane_classes.py`.*

A student designing a sulphate removal knows what the membrane must DO
before he knows which product to buy.  DECIDED (DEV.md 4c C189, rule 00):
six functional classes, ILLUSTRATIVE teaching assumptions, their intrinsic
rejections derived by section 2, never typed; chosen in the case's
dictionary.

**The grammar.**  A class is a record of its own kind, `kind
membraneClass;`, in `data/standards/assets/`, named where an element is
named: `module NF_DIVALENT_SELECTIVE;`.  Why a kind of its own and not a
`membraneModule`: a class is BOTH halves the tree keeps apart -- a
transport fact (its `A_w`, which a module record must not carry) and a
hardware fact (the element, the reference tests) -- and one file read by
two readers, each taking only its own facts, keeps the student's choice
one word.  `MembraneRegistry` reads its transport half (`membraneType NF |
RO`, `A_w`; `permeabilities`, `poreModel` and `fit` refused);
`MembraneModuleRegistry` reads the rest and, after every tier is loaded,
ADOPTS the named generic element's geometry and estimates (`element
Generic-4040;` -- an element that names a membrane, a flat cell or another
class refuses).  Why `module` and not a new key: a class stands in for an
element in the one slot a case has for one; a second key would be a
second door to that slot.  A class keeps its element: the observed
rejections were stated on it, so the inversion's probe runs on the same
geometry the case runs.

**The record.**

```
name           NF_DIVALENT_SELECTIVE;
kind           membraneClass;
membraneType   NF;
reviewStatus   illustrative;
description    "...";   application "...";
element        Generic-4040;
A_w            2.78e-6 m/s/bar;
ratedTests ( { id naclRef; solute NaCl; ... rejection 0.30; rejectionValueType typical;
               pressureBasis feedGauge; permeateFlowBasis sameTest; source "..."; }
             { id mgso4Ref; solute MgSO4; ... rejection 0.95; ... } );
bands { NaCl { min 0.10; max 0.50; }  MgSO4 { min 0.90; max 1.0; }  source "..."; }
provenance { source "..."; A_w { origin assumed; method "..."; } }
```

`reviewStatus illustrative;` is the ONE review word a class takes, and its
one home is `MembraneModule::classReviewStatus()`; anything else (a
`reviewed`, which no measurement backs) refuses.  No `manufacturer`,
`model`, `modelNumber` or `partNumber`: refused.  The reference test uses
slice 2's grammar with every optional fact the inversion reads DECLARED,
so nothing about a class's own test is read one way and announced.  A
class states ONE test per salt.  `bands {}` is parsed: every rated salt
has a band, every stated value lies inside it.

**The values, and why.**  Each observed rejection is the MIDDLE of the
external specification's screening window (section 3 there: "example
screening windows -- NOT universal guarantees"); a lower-bounded window
("> 90 %") is read as [lower, 100 %].  The middle is a choice and is
recorded as one.  The water permeance is a curator's round teaching value
(no source states one), chosen so the class element delivers about its
stated reference permeate at the reference test; the run prints the
engine's figure beside it (within 7 % for all six).

| class | type | reference test | stated R_obs | band | A_w (L m-2 h-1 bar-1) | derived R_int |
|---|---|---|---|---|---|---|
| NF_OPEN | NF | 2000 ppm NaCl, 4.8 bar g, 15 % | NaCl 0.15 | 0-0.30 | 15 | 0.200795 |
| NF_DIVALENT_SELECTIVE | NF | 2000 ppm, 4.8 bar g, 15 % | NaCl 0.30, MgSO4 0.95 | 0.10-0.50, 0.90-1 | 10 | 0.375655, 0.963425 |
| NF_TIGHT | NF | 2000 ppm NaCl, 4.8 bar g, 15 % | NaCl 0.70 | 0.50-0.90 | 7 | 0.758303 |
| BWRO_HIGH_FLUX | RO | 2000 ppm NaCl, 15.5 bar g, 15 % | NaCl 0.975 | 0.95-1 | 5 | 0.982132 |
| BWRO_HIGH_REJECTION | RO | 2000 ppm NaCl, 15.5 bar g, 15 % | NaCl 0.995 | 0.99-1 | 3 | 0.996398 |
| SWRO | RO | 32000 ppm NaCl, 55 bar g, 8 % | NaCl 0.9975 | 0.995-1 | 1.1 | 0.997889 |

(Derived R_int on Generic-4040 with the witness's film: Schock & Miquel on
the element's spacer, the Geraldes & Afonso suction correction, one
diffusivity 1.2e-9 m2/s, 20 stations.  A case with another film derives
its own -- which is the point.)

**What the engine does with a class.**  Announces it on every run
(`[illustrative] module '<class>': a FUNCTIONAL CLASS, not a product ...`,
stdout, stderr and a provenance advisory into the caveat block), and marks
its tests "(illustrative class reference)" where a module's say "(data
sheet)".  REFUSES by name: a transport law other than `constantRejection`
(a class has no B_s, no per-ion permeance, no pore -- the remedy names
`constantRejection` with `fromRatedTest`, or a membrane record that
carries the data); a number typed for a salt the class rates (the remedy:
`fromRatedTest`, or copy the class into `constant/assets/` and change its
reference rejection); a class named as a bare `membrane` beside another
element (chosen as a whole); an unknown class (the registered list).  A
salt the class does NOT rate keeps a typed R with its source -- a class
says nothing about it.

**The probe.**  The inversion's probe types the trial R_int of a rated salt
-- exactly what a case may not -- so it is marked as the probe by a C++
flag (`SpiralWoundModule::markRatedTestProbe`), never a dict key no case
could be stopped from writing.  And a probe left another rated salt's
`fromRatedTest` in place, which made it invert that salt too, nested; that
salt is absent from the probe's feed, so a placeholder number stands in.

**REJECTED.**  A class as a `kind membraneModule` record carrying an `A_w`
(a module knows nothing about transport); a class as a membrane record
named beside `module Generic-4040;` (the reference tests would sit on a
membrane, and nothing would bind the class to the element it was stated
on); two records per class (the student's one choice split across two
homes); a band's END as the value; letting SDEM or DSPM-DE run a class on
invented ion data.

**Not done.**  A class in a different element size (it keeps
Generic-4040; a per-size reference permeate or a flux-based reference test
would be needed); the batch diafilter does not refuse a class named as its
`membrane`; `bin/choupo-import` does not know a class's element reference
(the witness is not sealed); the shortlist from a class to products
(slice 5).

## 9. Slice 4 (2026-11-01): the catalogue import writes the private tier, and the engine does not read it from there

**What.**  `bin/choupo-import-membranes` turns a working catalogue
spreadsheet (one sheet of elements, one of data-sheet tests, one of the
workbook's own assumptions, one of derived SI columns) into `kind
membraneModule` records in the slice-2 grammar under `data/local/assets/`,
plus an import report.  Gate `check_membrane_import` on a SYNTHETIC
catalogue, never the private file.

**The rules, each one an arm of the gate.**  Counts are READ BACK from the
files, never taken from the loop that wrote them.  A second run changes no
byte and no mtime and says so.  Two rows stating one test are BOTH written,
each citing its row, and listed -- as a duplicate when the values agree, as a
contradiction when they do not; nothing is averaged and nothing is chosen.
Two element rows that map to one record name with different values are
neither written (two revisions are two records; the input is asked to rename
one).  A pressure basis the input does not state is OMITTED, never assumed:
the engine already announces the absence where the inversion needs a reading
(slice 2), so the tool has nothing to add but the list.  An element without
an active area or a spacer thickness is NOT written and listed with what is
missing; `--assume-spacer-mil N` is the one opt-in and is written as an
announced estimate naming the flag.  A rated test missing any of its seven
numbers, a rejection stated as a range whose ends the input does not carry,
a brochure "reference value" with no test conditions: rejected by name.  The
derived columns (flux, velocities, Schock-Miquel diameter, mean
concentrations) are never imported -- the tree never stores a derivative --
and are cross-checked against the originals.  A field that reads like copied
catalogue prose is dropped and said.  `--out` under `data/standards`
refuses; the rule's one home is `records::refuseStandardsWrite` and the
Python mirrors its two tests, not its wording.

**Measured, not assumed, and it changed the design.**
`MembraneModuleRegistry::loadFrom` scans `data/standards/assets` and every
case-local `constant/assets`; it does NOT scan `data/local/assets`.  The
README's precedence line (`standards > local`) is the component loader's and
the pair readers'.  So an imported record is USED by copying it into the
case's `constant/assets/` with the membrane declared beside it (`module
<name>; membrane <NF|RO record>;` -- an imported element names no membrane,
like Generic-4040, because a catalogue states no transport parameters), and
the record's header, the report and both READMEs say so.  Teaching the
registry a third tier was not taken: it is an engine change, and a private
record reaching every run by name is the shape `data/local/README.md` warns
about for the ThermoML cache.

**What the real workbook holds (the private file; numbers here are the
report's, not the tree's).**  Five manufacturers, 145 elements, 84 test rows;
87 elements carry no active area and 98 no spacer thickness, so 13 records
are written by default (DuPont 6, LG 6, Hydranautics 1; the Toray rows carry
a spacer and no area, the Hydranautics index rows neither); 13 rated tests
(NaCl 11, MgSO4 2), every one with its pressure basis unstated; 71 test rows
rejected, 65 of them because their element was not written and 6 because
they are brochure reference values (boron, silica) with no conditions.  The
NF270-4040 row reproduces the shipped record's test to the digit (97 %
minimum, 2000 mg/L, 4.8 bar, 25 C, 15 %, 2500 gpd) but states no spacer, so
the shipped record's announced 28 mil estimate is exactly what the tool
refuses to invent.  Run on the imported NF270-400/34 through a membrane25
copy, the slice-1 inversion gives R_int(MgSO4) = 0.983347 from the sheet's
97 % minimum, with the engine announcing the unstated basis read as absolute.

**REJECTED.**  Filling a missing spacer from a sibling element (the shipped
NF270-4040 does it BY HAND, with a note; a tool doing it silently is the
2026-09-04 dryer shape); averaging a duplicate; a `pressureBasis unknown`
word (the grammar has no such word, and absence IS the engine's
representation of "not stated"); writing a record for an element with no
geometry (it could not load, and a record the engine refuses is a tool
defect); a third registry tier in the engine (above).

**Not done.**  The other three files the external specification names are
not on the laptop; the tool takes any path and reports an absent one as
"not imported".  A `membraneClass` is not imported (a class is a teaching
record, never a catalogue row).  Limits (P_max, T_max, pH) are not in this
workbook's columns and are not written.  The shortlist (slice 5) needs from
these records: the geometry, every rated test with its `rejectionValueType`
and its stated or unstated basis, the manufacturer and the sheet quality
word -- all present -- and a membrane transport record per element, which
no catalogue states and which the shortlist must take from the class (slice
3) or the inversion (slice 1).
