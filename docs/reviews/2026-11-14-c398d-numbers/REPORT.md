# Review: C398 slice (d) + A4, numbers and sources

Date 2026-11-14.  Subject: `origin/c398/slice-d-diffusion` at bb4e8f00b.
Rows DF-01..DF-12 in docs/reviews/LEDGER.tsv (reviewer branch
`review/c398d-numbers`, 0a1cfa75a).

Verdict: the numbers hold; it can land once two S2 rows are fixed.  All four
composition rules match Poling symbol by symbol, the Anderson-Babb identity
is exact, every migrated and non-migrated case run is byte-identical in
numbers, and the props operation gives the column's value at the same
state.  The defects are about sources and validity, not arithmetic: 2 S2,
4 S3, 6 S4.

## What was run

The branch and a baseline (679eebd28, scratch worktree, removed), each
`make -j4`; no suite.  28 cases run on both builds, each on its own tree's
case version, every output file compared after path and hash normalisation:
the 16 migrated cases and column01/06/09/10/11/14/15, totalReflux01,
acetone06, sensitivity01_column_reflux, plant/acetonePlant, props psychro02.
Read: Poling 5th ed. pp. 11.21-11.37 and Table 11-5; Taylor & Kooijman 2014
p. 108 (rendered); Pelkonen 2001 Table 3; Schulz 2018 Table 1; Yanagi &
Sakata 1982 Table II.

## What holds (measured)

1. Rules: the code agrees with Poling 11-10.2, 11-10.4, 11-10.5 and the
   Anderson-Babb form at p. 11.34 (weights, pure-solvent vs mixture
   viscosity, AB/BA direction).  Wilke-Chang in the mixture viscosity equals
   D0 mu_solvent / mu term for term; one ratebased01 call captured in gdb (T
   346.66067 K, x_pX 0.239325) returns 3.762188395799629e-09, equal to the
   hand formula to every digit.
2. The removed "Vignes" KPI evaluated D10^x0 D01^x1 with both values in the
   mixture viscosity (679eebd28, RateBasedSegment.cpp:443-450): that is
   Leffler-Cullinan.  The builder is right.
3. Witness: all six Wilke-Chang values reproduce by hand to 4-5 digits from
   the record values; the 288 K variant 4.69110e-09; Poling Table 11-5 gives
   1.26e-5 cm2/s for methanol (solute) in water at 288 K; Pelkonen MIW9 55.47
   C, 960 mbar, 0.8175 / 0.1357; association factors 2.6 (water) and 1.9
   (methanol) are Poling's.
4. Viscosity files: 3.91e-4 Pa s at 74 C / 0.54; 5.39e-4 at 43 C / 0.49;
   0.37 and 0.23 mPa s at 34 and 165 kPa, all transcribed correctly; the
   states each bed visits fall inside its box.
5. Byte identity: no number differs in the 28 cases; what differs is the
   listed labels, property fingerprints, the `[properties]` view, the class
   of the declared consumers (now `kernel`) and the removed KPI.  The 40
   golden rows are labels; 4 KPI rows removed.  `SatoRiedel/Li` is the same
   call (`ThermoPackage::thermalConductivityLiquid`) before and after.
6. Units: m2/s 1, cm2/s 1e-4, mPa.s 1e-3.
7. Column vs props operation at the ratebased01 segment state:
   3.7621883958e-09 both; the operation normalises the composition; no
   diverging state found.

## Rows

* **DF-01 (S2)**: Wilke-Chang is applied with water as the solute,
  silently; Poling p. 11.22 says the method "should not be used when water
  is the solute".  The witness golden pins water in methanol 8.98735e-09
  and in 2-propanol 3.61608e-09; the binaryEffective Vignes value puts the
  exponent 0.946 on D0(water in methanol); any aqueous column would take it
  through ThermoPackage.cpp:3454-3473.
* **DF-02 (S2, pre-existing, now relied on)**: the Theory Guide's boxed
  Wilke-Chang (theoryGuide.tex:14873-14877) prints 7.4e-12 with "mu_B in
  Pa s"; that coefficient is for mPa s, so a hand calculation is 1000 times
  too large (1.3846e-06 vs the engine's correct 1.38462e-09 m2/s for
  methanol in water at 288 K; WilkeChang.cpp:47, :61-63).  The new section
  derives the Anderson-Babb identity from it (:14979).
* **DF-03 (S3)**: V_A is the record's 25 C Vliq, not the normal-boiling-
  point volume of Poling's Eq. 11-9.1; stdout never says which; the JSON
  says "defines at the normal boiling point".  With the engine's densities
  at Tb the six values are high by +3.9 % (methanol solute), +6.1 %
  (2-propanol), +2.4 % (water); methanol in water at 288 K is +9.9 %
  against Poling's measured value where his own Wilke-Chang is +5.4 %.
* **DF-04 (S3)**: "measured" labels values that are not measurements
  (Schulz Table 1: "representative values ... as employed in this study";
  Yanagi Table II: averages footnoted to Lenoir & Sakata 1978 and Zuiderweg
  1969): the `measured.<name>` label, "the case's measurement", the guide
  section title, the tray cases' "MEASURED INPUTS" headers.  The .dat
  headers are honest.
* **DF-05 (S3)**: the source label is empty when the liquid conductivity
  block names no model (`liquidConductivityMethod()`,
  ThermoPackage.cpp:3490-3494); `"sourceId": ""`, "selects ()".  The four
  shipped rate-based cases name a model.
* **DF-06 (S4)**: the witness uses Pelkonen's TTop (the reflux
  temperature) with the liquid sampled at 1.790 m, whose bubble point is
  339.18 K, 10.6 K above the 328.62 K used; the case still calls these
  values "at the top of the column".
* **DF-07 (S4)**: the Table 11-5 row is on printed p. 11.31, not 11.30.
* **DF-08 (S4)**: Taylor & Kooijman Eq. 3.33 as printed is a sum (a
  misprint of the logarithmic average); the code uses the product (Poling
  11-10.4) but the citation does not note the misprint.
* **DF-09 (S4)**: 2-propanol's default phi = 1.0 is Poling's value for an
  unassociated solvent; with ethanol's 1.5 the values in 2-propanol would
  be 1.22 times larger.
* **DF-10 (S4)**: the assumed/literature origin of each viscosity value is
  computed but printed nowhere (only density's prints,
  DensityResolver.cpp:617).
* **DF-11 (S4, informational)**: Schulz Table 1 prints the authors' liquid
  diffusivity 3.57e-9 and 2.36e-9; the engine at the same states gives
  3.78269e-09 (+6.0 %) and 2.49732e-09 (+5.8 %); no row compares them.
* **DF-12 (S4)**: the box is sized to the states the bed visits, not to the
  value (packing04: 0.539 mPa s stated at 316 K held down to 280.3 K); the
  reason is printed and the number unchanged from before the slice.

## What could not be reached

The original Anderson & Babb 1961 and Leffler & Cullinan 1970 papers (not
in the literature folder); an aqueous binary column to show DF-01 inside a
column; the browser and WASM.

(Written into the tree by the coordinator from the reviewer's hand-back:
the harness refuses report files written by a subagent.)

## Round 2 (2026-11-15): `origin/c398/slice-d-diffusion` at 54d8e1037

Verdict: the earlier rows are fixed but it should not land yet.  Of
DF-01..12, ten fixed, DF-04 partly (the `measured { }` keyword kept, as
ruled), DF-12 not addressed (ruled kept as is).  New: DF-15 (S2), DF-13 and
DF-14 (S3), DF-16 (S4).  No stream, balance or duty moved anywhere.

Run: the head and 679eebd28 built (`make -j4`); 13 cases on both
(aceticAcid02_plant and 12 of the earlier 28), result JSON compared leaf by
leaf; Poling pp. 11.22, 11.29-11.31, 11.37-11.38, 12.3-12.8 read.

* DF-01 fixed: refused with the p. 11.22 sentence (verbatim); explicit entry
  prints "OUTSIDE THE METHOD'S STATED SCOPE"; water by CAS 7732-18-5 or the
  aqueous solvent's name.  Table 11-5's water solutes are only in acetone,
  ethanol, n-butanol and ethyl acetate.
* DF-02 fixed: 7.4e-12 (2.6 x 18.015)^0.5 x 288 / (1.13983 x 40.7^0.6) =
  1.3846e-09, the engine's value; the four rule values recompute (CB 8.6966,
  AB 8.6253, Vignes = LC 8.5550, e-9 m2/s).
* DF-03 fixed: V_A 40.7 / 76.8258 / 18.07 cm3/mol at 298.15 K printed and
  used.
* DF-05..11 fixed; DF-11's attribution measured (with the engine's Tb
  volumes D falls 7.6 % to about 3.50e-9, -2.1 % from Schulz).
* aceticAcid02_plant: 93 numeric leaves changed, all the lights column's
  hydraulics and what derives from them; direction and size match Fair's
  sigma^0.2; the left-out fraction 1.07e-4 is CO + dimethyl ether on stage
  1; Brock-Bird by hand at 404.14 K gives 24.16 mN/m (engine minimum 24.14)
  on a liquid 99.87 % acetic acid.
* **DF-13 (S3)**: Poling p. 11.38, Example 11-8 (citing Lee & Li 1991, not
  read) gives D0 at 313.13 K: water in methanol 2.67e-5 cm2/s, methanol in
  water 2.10e-5; the engine's Wilke-Chang there gives 7.14048e-09 m2/s
  (+167 %) and 2.63194e-09 (+25 %).  The witness's "Table 11-5 lists none"
  is true of the table, not the book.
* **DF-14 (S3)**: theoryGuide.tex:15008-15009 says AB "is never" CB
  "unless mu is the mole average": false both ways (AB - CB =
  x1 x2 (mu2 - mu1)(D012 - D021)/mu); on the witness AB 8.6050e-9 vs CB
  8.6966e-9.
* **DF-15 (S2)**: aceticAcid02 uses Brock-Bird on a liquid 99.3-99.9 %
  acetic acid; Poling p. 12.3 says the method is for nonpolar liquids; Table
  12-1: Brock-Bird +53 % for acetic acid, +101 % for methanol at 293 K.  The
  record's own fitted law (aceticAcid.dat) gives 27.53 mN/m at 293 K vs
  Poling's measured 27.59, and 16.30 at 404 K vs Brock-Bird's 24.16 (+48 %);
  the replaced 0.019 was within 8 % of that law at Tb; on the fitted law the
  diameter would be about 0.342 m, so 0.337 -> 0.329 went the wrong way.
  Nothing warns about the scope.
* **DF-16 (S4)**: the surface-tension source line gives the density's reason
  ("no liquid volume") instead of "no liquid surface above Tc".

Byte identity on 12 cases: no numeric leaf changed, no written file differs.
Ledger: `review/c398d-numbers` at 2e4682f17.

## Round 3 and landing (2026-11-15)

The builder answered DF-13..16 and DG-11..14 (778359946) and DF-15 by the
records' own surface-tension laws, the four sealed copies adopted
(03ec03f02; aceticAcid02 lights column D 0.337 / 0.329 / 0.342 m at
679eebd28 / round 2 / round 3); the legacy `diffusivity { model ...; }`
reader deleted (C402).  Accepted by the coordinator without a third review
round.  Merged with slice (c) by the builder (0e99b3b99, the reader adapter
replaced by (c)'s), then held on the integration tree by `--fast` 87/0 and
ONE FULL SWEEP over (c)+(d): 2240 PASS / 1 FAIL (the decision index missing
the C329 B2 record, a docs gate; fixed) / 9 EXPECTED-FAIL.
