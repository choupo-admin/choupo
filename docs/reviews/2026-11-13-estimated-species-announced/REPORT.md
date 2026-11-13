# Review by measurement: an estimated species datum announced on use (C376)

Reviewed: branch `c376-estimated-announced` at 0fcddd884d (one commit on main
56ccdb41ce), which makes the engine announce an aqueous-species formation
datum that is not a measurement when a run consumes it.  The rule it answers
(DEV.md, C376): before any energy or entropy balance prices a species through
such data, the engine reads the record's per-value provenance and announces an
estimate at the point of use.  Pulled by the reviewing session because the
branch is in the night's batch; the rows are on a working branch and do not
count against the pull limit.

## 1. Verdict

**The road the branch covers is covered.**  The only place in the engine that
reads a species' `hfAq` or `cpAq` as a value is the salt's aqueous ion
reference; it announces once per run, names the species, the datum, the
record's word and its method, and the entry reaches the caveat block and the
result of the reported pass (also under a design specification with 17
passes).  A measured value prints nothing.  **Nothing shipped consumes an
estimated species datum today** (39 cases run, none prints the announcement;
12 goldens pass).  There is no S1 and nothing here should stop the landing.

**One reader is not covered (ES-01, S2), and it is a stored derivative.**
Four chemistry records (the two dissociation steps of glutaric and of malonic
acid) store a reaction enthalpy that their own source line gives as "the
printed formation enthalpy of the anion minus that of the acid"; one value of
each pair is marked estimated in its species record.  The speciation solver
moves log K with that enthalpy away from 25 C, and the run says nothing:
measured on a scratch case at 353.15 K, log K moves from -4.34 to -4.355
(first step of glutaric acid), -9.76 to -9.840 (second), -8.55 to -8.679
(malonic, second), with no announcement and "nothing raised" in the caveat
block.  The derived number lost the mark of its estimated input.  No shipped
case reaches these records today.

**The gate cannot fail for three of the four announced words or for the
`cpAq` road (ES-02, S2)**, and a word that means an estimate can escape the
function (ES-03, S2).

## 2. What was measured

| item | measured | result |
|---|---|---|
| readers (`readers.tsv`) | every read of `hfAq`, `sAq`, `cpAq` in the source followed to a run | `hfAq`: one reader of the value, announced; `cpAq`: announced on the constant tier only, which is the only tier that uses it; `sAq`: read by nothing; the van't Hoff enthalpy of four chemistry records: not announced (ES-01) |
| shipped cases (`shipped_case_sweep.tsv`) | the 14 catalogue species with an estimated value (all organic-acid species of one evaluation); 39 cases run | none prints the new announcement; the witness prints one line |
| the announcement | the witness, a 12-point scan, a 17-pass design specification on a scratch copy | one line per (species, datum) per run; in the caveat block and the result of the reported pass; fires at package assembly, so a run with no energy balance is also told (ES-04) |
| the vocabulary (`vocabulary.tsv`) | each word in a scratch record | announced: the words for estimated, predictive, assumed, placeholder and their variants; silent, correctly: the measured, literature, derived and regressed words; ESCAPES: the word "calculated" (accepted by the census gate, unknown to the engine's vocabulary) and unknown words in a case-local record (ES-03); none is used in the catalogue today |
| the gate (`gate_sabotage.tsv`) | two sabotages of the brief and one of the reviewer's, by hand, restored and rebuilt | removing the call, or returning early on the estimated word: FAIL, twice each; returning early on the other three words and disabling the `cpAq` call: the gate still passes (ES-02) |
| no number moved (`runtests_sample.txt`) | the witness and 11 electrolyte cases against their goldens | 12 PASS, 0 FAIL |

## 3. Findings (`findings.tsv`)

| id | sev. | statement |
|---|---|---|
| ES-01 | S2 | the van't Hoff enthalpy of four chemistry records is derived from an estimated formation enthalpy and consumed in silence |
| ES-02 | S2 | the gate cannot fail for three of the four announced words or for the `cpAq` road |
| ES-03 | S2 | "calculated" and unknown case-local words escape the announcement, with no notice that the word was not recognised |
| ES-04 | S3 | announced at assembly, not at consumption: it over-announces, it never silences |
| ES-05 | S3 | a per-value provenance block placed at record level instead of inside the thermo block is ignored in silence (seen once) |

## 4. A remark on ES-01

It is the shape the project calls a second home for a derived number: the
reaction enthalpy is stored in the chemistry record AND follows from the two
species records, and only one of the two homes knows that an input is an
estimate.  Two remedies are possible and the choice is the architect's: the
chemistry record carries the mark of its inputs (and the solver announces it),
or the enthalpy is not stored and is formed from the species records when the
package is built, through the function that already announces.

## 5. Not examined

The three time-integrated binaries (by code reading they use the same
assembly); whether a shipped reactive flash or column prices a duty through
the ES-01 enthalpy; whether the record-form gate refuses the misplaced block
of ES-05; the GUI and the guide text.
