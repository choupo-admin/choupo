# membrane26 -- a membrane chosen by what it does

**The question.** A brackish water (3 g/L NaCl, 2 g/L MgSO4) must lose its
sulphate and may keep its sodium chloride.  Which membrane?  Before a
product, a student chooses a FUNCTION.

**The choice.** `module NF_DIVALENT_SELECTIVE;` names a functional CLASS --
`data/standards/assets/NF_DIVALENT_SELECTIVE.dat`, `kind membraneClass` --
one of six (NF_OPEN, NF_DIVALENT_SELECTIVE, NF_TIGHT, BWRO_HIGH_FLUX,
BWRO_HIGH_REJECTION, SWRO).  A class is an ILLUSTRATIVE teaching profile,
not a product and not a measurement: an OBSERVED rejection per salt at its
own reference test (here NaCl 30 % and MgSO4 95 %, each the middle of the
class's screening window), a water permeance, and the generic element it
is deployed in (Generic-4040, by reference).  The run says so:
`[illustrative] module 'NF_DIVALENT_SELECTIVE': a FUNCTIONAL CLASS, not a
product ...`, on stdout, on stderr and in the end-of-run caveat block.

**What the engine derives.** `transport constantRejection;` takes the
INTRINSIC rejection (against the wall); the class states the OBSERVED one
(against the feed).  `rejection { NaCl fromRatedTest; MgSO4 fromRatedTest; }`
runs this element at the class's reference test and inverts it
(DEV.md 4c C189 slice 1): R_int(NaCl) = 0.37566, R_int(MgSO4) = 0.96342.

**The answer.** Three elements at 7 bar: recovery 32.45 %, the permeate at
2140 ppm NaCl and 107 ppm MgSO4 (85 ppm as sulphate).

**What a student should change.** The class (`NF_OPEN`, `NF_TIGHT`); the
pressure and the number of elements; the class's own assumptions, by copying
the record into `constant/assets/` and moving a rejection inside its band
(typing a number for a rated salt in the case is refused -- the intrinsic
value is derived); then a product (`module NF270-4040;`).

**Not a validation.** No number here is measured.  Gate:
`bin/curate/check_membrane_classes.py`.  Record:
`docs/design/an-observed-rejection-is-not-an-intrinsic-one.md` section 8.
