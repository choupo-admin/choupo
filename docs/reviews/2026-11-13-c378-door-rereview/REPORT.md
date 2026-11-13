# Re-review by measurement: the door branch after its fixes (C378 slice 0)

Reviewed: branch `c378-slice0` at a067ea80ba, the head the coordinator says
answers the fourteen rows DR-01..DR-14 of
`docs/reviews/2026-11-13-c378-door-review/` (taken at f6c01ac421).  Method:
each row's own reproducer re-run on the new head (the same case, the same
probe, the same sabotage, by hand, restored and rebuilt); then three checks of
the fix as a whole.  Pulled by the reviewing session before the landing; the
rows are on a working branch and do not count against the pull limit.

## 1. Verdict

Eleven of the fourteen rows are FIXED, two are PARTLY fixed (DR-11, DR-12) and
one is fixed with its symptom moved (DR-06).  The slice still moves no number.

**One new finding should be settled before the landing: DX-01 (S1), a false
printed source of the kind DR-01 was.**  A spiral-wound module whose feed is
declared in ions prints its liquid diffusivity as "each ion's diffusivity from
its species record, scaled to temperature by Stokes-Einstein" whatever the
case declares.  When the case declares no liquid-viscosity model the SAME RUN
says, in its log and in its caveat block, that the D0 are "NOT
temperature-corrected".  Reproduced by the reviewer and again by the commander
on `membrane14_polarisation_multiionic` (log line 52 against the table's line
163 of one run); also on membrane17 and membrane21.  The site is
`src/unitOperations/membrane/SpiralWoundModule.cpp:887-889`: the tag
`speciesRecordD0` is recorded without asking whether the factor was applied.
It predates the fixes; the first review missed it.

The other new rows (DX-02..DX-06) are gate and naming gaps that can be
recorded as debt or fixed after the landing.

## 2. The fourteen rows (`rereview.tsv`)

| row | first | now | the line of evidence |
|---|---|---|---|
| DR-01 | S1 | FIXED | the viscosity prints the viscosity release on the IF97 density, the surface tension its own release, the density the pure-fluid formulation; the Helmholtz route says it ships no viscosity and the run stops with the existing refusal |
| DR-02 | S2 | FIXED | the condenser prints no surface-tension line; the result lists it as declared and not used |
| DR-03 | S1 | FIXED | the steady stack prints "liquid kinematic viscosity 1e-06 m2/s, a constant of the unit" or the kernel route; the batch rig prints its own line; the bare /1000.0 goes through the named carrier density |
| DR-04 | S2 | FIXED | the quasi-steady case prints its table and carries the block |
| DR-05 | S2 | FIXED | the crystalliser names NaCl and its share of the liquor |
| DR-06 | S2 | FIXED, moved | one line per tank; the consumer is now a message string (DX-05) |
| DR-07 | S2 | FIXED | the pipe and the column print "the value the case declares" |
| DR-08 | S2 | FIXED as ruled | "[constant] RO took a constant 1000.00 kg/m3 while Booster computed 1031.94 .. 1032.01, HPpump computed 1030.94 (whether they price the same liquid is not checked here)" |
| DR-09 | S2 | FIXED for the 18 | every one of the eighteen probe lines fails the ratchet; eight of ten NEW spellings pass it (DX-02) |
| DR-10 | S3 | FIXED | "the solvent's 25 C molar volume alone" |
| DR-11 | S2 | PARTLY | both first sabotages are caught; a site that keeps a tag's id and supplies other words is caught by nothing (DX-03) |
| DR-12 | S3 | PARTLY | condenser, boiler, the batch rig and the batch diafilter are declared; nothing under the two dynamic binaries is (DX-06) |
| DR-13 | S3 | FIXED | the electrodialysis division, the laboratory-analysis density and the pellet diffusivity are recorded; the Williams-Otto plant is printed under its type name (DX-04) |
| DR-14 | S3 | FIXED | the phrase is gone from both labels |

## 3. The fix as a whole

**No number moved.**  `bin/runTests --scope` over 23 cases (the first review's
14 among them): PASS 28 / FAIL 0, the conservation gates included; the route
bench OK (4975 blocks, no disagreement between the door and the old call); the
source-witness gate OK.  The sources-pinned gate fails as designed at this
stage (no `expected` carries a source row yet: 94 rows unpinned, none
disagreeing).  Table `notmoved.tsv`.

**The table read as a student would** on the three cases named by the
coordinator: every line now names a value, a state and a source; the "same
liquid, two numbers" line of the acetic-acid plant is still there (785.12
against 787.27 kg/m3), as intended; the pressure exchanger still prints a
molar volume that cannot be compared with a density by eye (ruled out of
scope).  No false line on those three.

**The ratchet** (`ratchet_probe18.tsv`, `ratchet_probe_new.tsv`): 18 of 18
old probes caught.  Of ten new spellings two are caught; the eight that pass
are listed in DX-02.  The one that matters most is a liquid density asked
with a phase VARIABLE (`thermo.density(T, P, z, ph)`), because several units
already write their vapour branch that way.

**The sabotages** (`sabotage.tsv`): the first review's two are caught, each
twice.  A new one of the same family is not: a site that records an existing
tag's id with another route's words passes every gate, and the feed pump of
the Rankine case then prints "scaled to temperature by Rackett" beside its
25 C value.

## 4. New rows (`findings.tsv`)

| id | sev. | statement |
|---|---|---|
| DX-01 | S1 | the spiral-wound module prints "scaled to temperature by Stokes-Einstein" for ion diffusivities the same run says are not temperature-corrected |
| DX-02 | S2 | the ratchet misses eight of ten new bypass spellings |
| DX-03 | S2 | the WORDS of a site's tag are held by no gate (the gates hold the id) |
| DX-04 | S3 | the Williams-Otto plant is recorded under its type, not the case's unit name |
| DX-05 | S3 | variable-volume vessels are recorded under a message string |
| DX-06 | S3 | the dynamic driver declares nothing, so the mismatch check never runs there |

## 5. Not examined

The GUI and the guides; the documents changed by the fix commits; the gate
self-test harness (its sabotages were applied by hand instead); a case that
runs the pellet diffusivity in a liquid, or a Helmholtz case that consumes
density only (neither exists in the corpus); byte identity with main; the
spray dryer's printed surface tension of an aqueous feed (older than the
slice, a property-model question).
