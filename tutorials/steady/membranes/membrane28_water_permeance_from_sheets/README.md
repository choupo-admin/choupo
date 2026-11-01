# membrane28 -- the water permeance a data sheet implies

**The question.** At their own rated tests the engine gave 2.16x the
NF270-4040 sheet's permeate and 2.08x the SW30HR-380 sheet's (the C189
slice-2 finding).  Whose number is wrong?

**The answer.** The membrane records'.  `NF270` and `SW30HR` carry an A_w that
is a FIT to a teaching case (`provenance fittedToCase;`: 36 and 3.6
L/m2/h/bar), while a data sheet measures THE ELEMENT's permeate at a stated
pressure.  Two facts sharing a symbol.  The inversion that turns the sheet's
observed rejection into the intrinsic one (membrane25) is not at fault, and
neither is the active area.

**The decision.** `waterPermeance fromRatedTest;` in the unit's operation,
beside `rejection { <salt> fromRatedTest; }` (which it needs), runs the
module at the record's rated test and finds, TOGETHER, the A_w that
reproduces the sheet's permeate and the R_int that reproduces its observed
rejection (the two are coupled through the wall concentration and the osmotic
pressure, so the solves alternate until A_w is stationary).  The membrane
records are NOT edited: their fit still serves the cases it was fitted to.

**What the run prints.**

| element | record A_w | derived A_w | R_int | sheet's permeate |
|---|---|---|---|---|
| NF270-4040 (MgSO4) | 36 | 14.88 | 0.979347 | 9.5 m3/d at 15 %, reproduced to 5e-15 |
| SW30HR-380 (NaCl) | 3.6 | 1.318 | 0.997398 | 26 m3/d at 8 %, reproduced to 2e-15 |

(A_w in L/m2/h/bar; KPIs `A_w_fromRatedTest_LMH_per_bar`,
`A_w_record_LMH_per_bar`.)  The derived value is a MODEL parameter of the
element as this film model reads it, not a manufacturer's number.

**Not a validation.** One test per element fixes one A_w and one R_int; away
from the test a constant R_int stays constant (the real one rises with flux).
Gate: `bin/curate/check_rated_tests.py` arm (h) -- an independent run with
both values typed reproduces each sheet to 1e-7.  The shortlist
(`tutorials/props/membrane/shortlist01_class_to_modules`) re-rates every
candidate with this derivation.
