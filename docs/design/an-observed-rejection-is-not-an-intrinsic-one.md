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
"stabilized salt rejection > 97.0 %" at 2,000 ppm MgSO4, 4.8 bar, 25 C,
15 % recovery.  The wall is richer than the feed twice over: the film
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
record's teaching-case A_w the engine's permeate at the rated test is 14.5
m3/d against the sheet's 9.5 (recovery 22.9 % against 15 %), so the
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

membrane25: the same NF270-4040 element twice, fed 2,000 ppm MgSO4 at 8 bar.

| | R_int | c_m/c_b at the rated test | R_obs at 8 bar | permeate MgSO4 |
|---|---|---|---|---|
| derived | 0.98331 | 1.593 | 0.94426 | 111 ppm |
| naive (0.97 typed) | 0.97 | -- | 0.90065 | 199 ppm |

The naive element passes 1.81x the salt; at the sheet's own test it reports
94.6 %, not 97.0 %.

## 4. What the gate holds

The derived R_int typed back as a NUMBER and re-run at the rated test
reproduces 0.97 to 1e-7.  R_int > R_obs with `c_m/c_b > 1`.  With the film
switched off (k_film 10 m/s) the derived R_int still exceeds 0.97, and the
remaining gap is the bulk concentration along a constant-R channel with no
film, held to its closed form `R_obs = 1 - (1 - (1 - r)^(1 - R))/r` to 1e-5
at 800 stations and falling first-order from 200 (the march is first order).
So R_int and R_obs are EQUAL only in the limit of no film AND vanishing
recovery -- a refinement of "equal when polarisation is switched off",
measured: at the probe's 29.5 % recovery the bulk term alone is 0.0046.

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

**Found on the way, not changed.**  Slice 1 reads the NF270-4040 sheet's
"70 psi applied" as an ABSOLUTE 4.8 bar.  Applied pressures in a data sheet
are normally gauge (5.8 bar absolute); the record does not say, so the run
now announces the reading -- declaring `pressureBasis feedGauge;` on the
record is a curation act on the sheet's wording and would move membrane25's
goldens.

Gate `bin/curate/check_rated_tests.py` (single == list of one on
membrane15/16/25; a HYPOTHETICAL fixture record built in a temporary
directory for everything else -- no manufacturer's test is invented in
data/standards).

## 7. Not done

The functional classes and the shortlist tool are C189 slices (3)-(5).  The SW30HR-380
record's NaCl test is not inverted by any witness.  A constant R_int stays
constant away from the test.  The membrane records' A_w is not corrected.
