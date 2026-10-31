# membrane25 -- a data sheet's rejection is OBSERVED, not intrinsic

**The question.** The NF270-4040 data sheet says "stabilized salt rejection
> 97.0 %" (2,000 ppm MgSO4, an applied 70 psi (4.8 bar), 25 C, 15 %
recovery).  An applied pressure on a data sheet is GAUGE unless the sheet
says otherwise, so the record declares `pressureBasis feedGauge;` and the
test runs at 4.8 + 1.01325 = 5.81 bar absolute.
`transport constantRejection;` asks for an intrinsic rejection R_int.  Can
the student type 0.97?

**No, and this case shows by how much.**  The sheet's number is OBSERVED,
`1 - c_p/c_feed`; the law's R_int is measured against the WALL,
`1 - c_p/c_m`.  The wall is richer than the feed twice over: the film
polarises it (c_m/c_b > 1), and the bulk concentrates along the leaf as the
water leaves.  So 0.97 typed as R_int passes MORE salt than the sheet
measured.

**What the case does.** Two copies of the same element, fed the same
2,000 ppm MgSO4 at 8 bar absolute:

    NFderived   rejection { MgSO4 fromRatedTest; }
    NFnaive     rejection { MgSO4 0.97; }

`fromRatedTest` makes the engine run THIS element (its record, its spacer
channel, its Schock & Miquel film, its osmotic model) at the sheet's rated
test -- one element, the sheet's solute at its mass fraction, its P and T,
the case's permeate pressure, and the feed the sheet's figures imply
(permeate / recovery = 9.5 / 0.15 = 63.3 m3/d) -- and solve, by a bracketed
1-D search, for the R_int whose predicted observed rejection is 0.97.  The
run says so on stdout, on stderr and in the caveat block:

    [ratedTest] R_int(MgSO4) = 0.986415 DERIVED from the rated test of module
    'NF270-4040': observed 97 % at 2000 ppm, 5.81 bar (permeate 1 bar), ...;
    the module predicts c_m/c_b = 1.8742 (channel average), recovery 29.83 %
    and permeate 18.89 m3/d there; bracketed solve residual ... after 5 probe(s)

**What the student sees.**

| | R_int | R_obs at 8 bar | permeate MgSO4 |
|---|---|---|---|
| NFderived | 0.98641 (derived) | 0.95453 | 91 ppm |
| NFnaive | 0.97 (pasted) | 0.90065 | 199 ppm (2.18x) |

and the naive element, run at the sheet's own test, would report 93.4 %
instead of the 97.0 % the sheet measured (the gate runs it).

**Why the feed flow is the sheet's.** The feed flow fixes the crossflow,
and so the film coefficient -- the number the polarisation depends on.
`permeate / recovery` is the feed the element was tested at.  The NF270
record's A_w is a fit to a teaching case and gives 18.9 m3/d at the rated
test against the sheet's 9.5, so the engine's recovery there is 29.8 %, not
15 %: the hydrodynamics are the test's, the flux is the record's, and both
are printed rather than reconciled by moving the feed.

**What it refuses.** No `module` record; a record with no `ratedTest {}`; a
solute other than the rated one; a case declared ion by ion (a salt's
rejection says nothing about how it splits between the ions -- that is
SDEM's or DSPM-DE's job); a rated rejection the film model cannot reach; the
word on a unit with no module record (the batch diafilter).

**What is not modelled.** A constant R_int stays constant away from the
test (a real one rises with the flux).  The record's A_w is not corrected
(see `docs/design/a-module-is-a-record.md` section 5).  The single MgSO4
diffusivity of the film (0.85e-9 m2/s) is declared, not measured.

Gate: `bin/curate/check_rejection_inversion.py`.  Record:
`docs/design/an-observed-rejection-is-not-an-intrinsic-one.md`.
