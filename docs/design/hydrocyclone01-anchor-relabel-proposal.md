# hydrocyclone01: relabelling its two `anchor` rows (proposal for the laptop)

Date: 2026-11-13.  Finding SC-01 of the solids classification and separation
review (2026-11-12).  Status: PROPOSED.  The `expected` file of an existing
case is re-recorded only on the laptop, after the list of moved rows has been
shown to Vítor (CLAUDE.md section 10, "A GOLDEN RE-RECORD IS A CLAIM"), so the
branch that wrote this file changed the case's header text, the Tutorials
Guide, the Theory Guide, the catalogue and the design record, and left
`tutorials/steady/solids/hydrocyclone01_quartz_willsTable91/expected`
untouched.

## 1. What is wrong with the two rows

```
kpi     cyclone                underflow_dilution 0.34               1.5e-2   anchor
kpi     cyclone                d50_um           177.5              1e-2     anchor
```

The claim word `anchor` makes `bin/runTests` print "2 anchor(s) agree with
the cited primary".  Neither number is independent of the case's inputs:

* `underflow_dilution`: the declared water split R_f = 0.39 is Wills's own
  `65.2 x 0.34 / (100 x 0.57)` (p. 215), computed FROM this 0.34 and the
  book's U/F.  The engine's 0.33903727 is that arithmetic run backwards
  (`R_f x 0.57 / (U/F)`), moved only by the pan gap below.
* `d50_um`: the declared corrected curve is column 8 corrected by R_f, so
  the actual partition of the 148-209 um class is
  `0.39 + 0.61 x 0.1803 = 0.49998` by construction; d50 is that class's
  representative size (176.012 um, geometric mean, against the book's
  arithmetic 177.5).

Both rows are an IDENTITY CHECK that the bookkeeping (Kelsall's eq. 9.15
forward, the water split, the ln-x interpolation of the crossing) is the
book's.  Under the matrix rule (an anchor is a comparison with a measured
dataset the inputs did not read) they must not count as validation.

## 2. What the case does compute

`solidsTo_underflow` = SUM a_k w_k = 0.655680129 (already a plain golden
row), against 0.65204 from the book's own column 8 summed over the same
feed (0.652 printed).  Its +0.56 % is the cost of writing the -74 um class's
negative corrected recovery (-0.0295) as 0.  It is computed, not typed in,
but it is still not a prediction: every input is the table's.  There is no
number in this case that could serve as an anchor.

## 3. Proposed rows

Replace the two `anchor` rows by plain self-recorded rows at the engine's
current values (measured on this branch, `choupoSolve`, 2026-11-13), with the
usual tolerance, and no claim word:

```
kpi     cyclone                underflow_dilution 0.33903727174    1e-4
kpi     cyclone                d50_um           176.012254259      1e-4
```

and rewrite the comment block above them so that its table reads

```
#      quantity                    Wills    Choupo     gap       what it is
#      underflow dilution (w/s)    0.34     0.33904    -0.3 %    the book's INPUT read back (R_f was computed from it)
#      d50 (actual curve), um      177.5    176.01     -0.8 %    the book's INPUT read back (the curve makes 148-209 um 0.49998)
#      solids to underflow U/F     0.652    0.65568    +0.56 %   computed: the zeroed -74 um class, measured
#      overflow dilution (w/s)     1.00     1.00982    +1.0 %    follows from U/F
#
#  IN SAMPLE: both declared inputs come from Table 9.1, so this case is a
#  reconstruction.  Its rows are self-recorded goldens; none is an anchor.
```

Moved rows, with their reason: two rows change VALUE (0.34 -> 0.33903727,
177.5 -> 176.012254) because they stop being cited values and become
self-recorded ones; no engine number moves.  The visible effect is that the
case's PASS line reads "(checked vs reference)" without "2 anchor(s) agree
with the cited primary".

## 4. The alternative, not recommended

Keep the rows as they are and rely on the header text.  Rejected: the PASS
line is what a reader of the suite sees, and it would go on saying that two
anchors agree with a primary when they return their own inputs.
