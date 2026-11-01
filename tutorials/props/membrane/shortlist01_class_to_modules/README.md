# shortlist01 -- from a membrane class to the commercial elements that do it

**The question.** membrane26 chose a membrane by what it DOES
(`NF_DIVALENT_SELECTIVE`: hold sulphate, let sodium chloride through).  Which
products in the catalogue do that -- at MY pressure, MY temperature, MY feed
and MY recovery, not at the data sheet's?

**The op.** `membraneShortlist` (DEV.md 4c C189 slice 5).  It does two
things and nothing else.

1. *Hard filters*, on each module record: the membrane is of the class's type
   (NF here), the record carries ONE rated test of the asked solute, that
   test's rated rejection lies inside the class's band, the declared limits
   (`P_max`, `T_max`, `pH`) hold at the student's feed.  A limit the record
   does not state is not a filter (`n/s`).
2. *Re-rating*: every survivor is re-run with the film and spacer of the
   `operation` block, its intrinsic rejection DERIVED from its OWN rated test
   (slice 1), at the student's conditions, with the feed flow found so ONE
   element delivers the recovery asked.  The limits that need the run (feed
   flow, pressure drop) then filter again.

**What it will not do.** Score, weight or rank.  Every criterion is printed
side by side (permeate flow, observed rejection, permeate concentration,
flux, P/flux, hydraulic energy per m3, feed flow, pressure drop, margins to
each limit), the candidates in alphabetical order of their names, and what
matters most is the student's decision.  A record's commercial-relation
fields (`partner`, `dataVerifiedBy`) are never read: the gate proves it.

**What to expect here.** `tiers ( standards case )` keeps the golden
independent of one machine's private `data/local/assets/` records (the
importer's home); drop the line and an imported catalogue joins the table,
each of its records announced `[local] UNVERIFIED`.  Of the shipped records
NF270-4040 passes; SW30HR-380 is excluded (an RO membrane, rated on NaCl);
the Generic elements are excluded (they carry no rated test).

**Read it with care.** The re-rating is the transport law of a lumped salt
with its intrinsic rejection fixed at the sheet's ONE test -- a model's
reading of a data sheet away from its test, not a guarantee of the product.

Gate: `bin/curate/check_membrane_shortlist.py`.  Record:
`docs/design/a-shortlist-has-no-score.md`.
