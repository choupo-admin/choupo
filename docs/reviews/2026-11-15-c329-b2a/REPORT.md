# Review: C329 slice B2a, the ternary liquid properties

Date 2026-11-15.  Subject: `origin/c329/b2a-ternary-properties` at
b879aceff.  Rows B2-01..B2-07 in docs/reviews/LEDGER.tsv (reviewer branch
worktree-agent-a0ef66534ee0f37ce, efe8c6f73).  First review of a change to
the shared package: one reviewer on the session's strongest model.

Verdict: the physics holds; every number right; binary exactness
byte-identical on 90 cases.  Back for one S2 and three S3 rows, none moving a
number of the witness.

## What was run

b879aceff and main e8a053144 built in separate trees; Kooijman & Taylor
1991 read as page images (pp. 1217-1221), Taylor & Krishna 1993 pp. 61,
91-92, 126-127 through a libdjvulibre reader; an independent Python NRTL,
Eq. 23, [B], numerical Gamma and the Table IV discrepancy; 90 existing cases
(every case naming a diffusivity, rate-based, pellet, spiral-wound or D_L)
compared on both builds, stdout and every output file; edge, permutation and
refusal probes; 8 sabotages.  No full sweep.

## What holds (measured)

* Eqs. 4, 6-8, 18-23 against the code symbol by symbol (D0_ij is i dilute
  in j raised to x_j; the third factor (D0_ik D0_jk)^(x_k/2); B_ii and B_ij as
  Eqs. 7-8; Gamma with component n taking the change; [D] = [B]^-1 [Gamma]).
* Table I transcribed correctly; Wilke Eq. 6.1.14 and Example 6.1.1 (50.99,
  16.944) confirmed.
* The witness recomputed independently: 0.0782 / 0.0924 / 0.0639 against
  Table IV's 0.0763 / 0.0916 / 0.0611; the Fick and Gamma goldens match to
  every printed digit; Gamma at 0.70/0.15/0.15 within 0.0019 of the book
  (the step is not the cause, B2-05 is).
* Binary exactness: all 90 cases byte-identical after normalising the stamp
  and paths.  Edges x_k = 0, 1e-15, 1e-300 identical; 1e-9 differs by about
  1e-9 relative.  Permutation invariant.  Every refusal by its words.
* Docs: the Theory section matches the code; anchors and PDF present; no
  commercial simulator named.

## Rows

* **B2-01 (S2)**: on a phiPhi package Gamma and the Fick matrix come from the
  ideal activity placeholder (LiquidDiffusionMatrix.cpp:55-56); a copy of
  ppr78Kij01 at 220 K / 100 bar prints Gamma 1,0,0,1 at exit 0, unannounced.
* **B2-02 (S3)**: D_G_effective_<c> with c the only component present is
  Wilke's 0/0 (WilkeReduction.H:64): exit 0, the key printed with no value;
  the key exercised by no case or gate.
* **B2-03 (S3)**: the door's new `component` argument
  (LiquidPropertyDoor.cpp:107-109, :174) has no caller and no test.
* **B2-04 (S3)**: the run does not print which component takes the change
  or the derivative step, though the header says it does; "taken as 1" is
  printed beside Gamma_11 = 0.689 with no sentence relating them.
* **B2-05 (S4)**: Taylor & Krishna Example 3.3.1 (p. 61) prints tau_21 =
  0.76432 where the paper prints 0.74632; with 0.76432 Gamma reproduces the
  book's printed matrix to every digit.
* **B2-06 (S4)**: the books' form is asymmetric; its score is 0.1002 (i<j
  filled and copied), 0.0852 (j first), 0.0886 (own row); the printed and
  pinned 0.1002 should name its convention.
* **B2-07 (S4)**: x formatted with std::to_string (LiquidDiffusionMatrix.cpp:40).

## Sabotage table

| # | sabotage | caught by | result |
|---|---|---|---|
| 1 | Eq. 23's third term in the books' form | gate 5a-5c; golden | caught |
| 2 | Wilke without (1 - x_i) | gate 5a, 5d, 5f; golden | caught |
| 3 | Gamma forced to identity | gate 5b, 5c; golden | caught |
| 4 | Fick matrix transposed | gate 5b; golden | caught |
| 5 | D_G_effective using the liquid pairs | nothing | NOT CAUGHT (B2-02) |
| 6 | the door's component index off by one | nothing | NOT CAUGHT (B2-03) |
| 7 | Gamma without the last component taking the change | gate 5b; golden | caught |
| 8 | B_ii without the x_i/D_in term | gate 5b; golden | caught |

(Written into the tree by the coordinator from the reviewer's report.)

## Round 2 and landing (2026-11-15): 2df2b6e5d

All seven rows answered; the two uncaught sabotages (5, 6) are now caught.
B2-05 changed the witness: with the book's tau_21 = 0.76432 the engine
reproduces the paper's Table IV row to its four digits; the paper's printed
0.74632 is kept as a pinned variant.  Landed on --fast 87/0 on the merged
tree, the builder's --scope 26/0 and --gui 49/0, and the 90-case byte
identity.
