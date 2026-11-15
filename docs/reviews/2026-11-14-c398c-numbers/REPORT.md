# Review: C398 slice (c), numbers and sources

Date 2026-11-14.  Subject: `c398/slice-c-tables` at 1492dba57.  Rows
TB-01..TB-05 in docs/reviews/LEDGER.tsv (reviewer branch
`review/c398c-numbers`, 6b20a84bf).

Verdict: the slice holds on its numbers and its sources.  Every
interpolated value, extension chord and closed-form integral recomputed
independently agrees with the code to round-off; the 22 tabulated values,
their units, the primary named for each column and the sha256 match the
handbook page; 33 of 35 cases chosen by the reviewer are byte-identical and
the other two differ only as claimed.  One S2 (an advisory's excursion
figure understated) and one S3 (needs a malformed record); neither moves a
number in a shipped case.

## What was run

`make -j6 all` at 1492dba57; a baseline of 679eebd28 (`git archive`) built
in scratch.  An independent Python reference (mpmath, 30 digits; the
Fritsch-Carlson slopes, the four interpolants, the chords and the quadrature
written by the reviewer), compared with a small C++ driver linked to the
slice's library calling PropertyTable directly: 5 test tables x 4
interpolations (non-uniform spacing, a flat segment, non-monotone data, a
steep segment, two points) at knots, at w = 1e-9 / 0.13 / 0.5 / 0.77 /
1-1e-9, at +-1e-7 K past the ends, inside the extension, exactly at
downTo/upTo, and 1e-6 K beyond; 400 random tables for monotonicity and
overshoot (200 points per segment), 400 for C1.  Witnesses table01 and
table03; check_transport_correlations with one sabotage (restored, then
`make all`); a byte comparison of 35 cases.

## What holds (measured)

1. Interpolations: worst relative error 2e-16 (linear), 9e-16 (logLinear),
   1e-13 (logReciprocal, next to a knot), 5e-16 (monotoneCubic).
   logReciprocal is ln y linear in 1/T in the code and in
   sec:record-law-table.  monotoneCubic: 0 monotonicity violations, 0
   overshoots on the random tables; C1 by construction (shared final slopes
   at a node).
2. End rule: nothing threw inside the extension; everything threw 1e-6 K
   past it; exactly at downTo/upTo the value is returned.  Inside the
   extension the value is the end segment's chord in the interpolation's own
   variables (for monotoneCubic the linear chord, not the cubic); the
   integrals there match the chord integrated.
3. Integrals: I1 to <= 2e-16 relative; I2 to <= 2e-15 (linear) and 2e-10
   (the steep table, TB-03).  On the CRC water Cp table both to <= 1e-12
   absolute.  The builder's claim reproduced: linear dH(298.15 -> 353.15) =
   +3.66667 J/mol = h^2 C'' L / 12; monotoneCubic +0.101042; at 25 K spacing
   21.917 and 4.246 J/mol.  Entropy (not claimed): linear +0.0112884
   J/(mol K), monotoneCubic +0.000338.
4. Units: mPa.s 1e-3, uPa.s 1e-6, J/g/K 1e3 J/(kg K), J/mol/K 1.0.  The
   per-mass conversion uses the record's MW (Component.cpp:323, read before
   buildCp_); 4.1963 x 18.015 = 75.5963445 equals the golden.  No mechanism
   lets a case override MW.
5. Sources, against printed page 6-3 (PDF page 349) of the CRC Handbook
   82nd ed., text and rendered image: all 11 viscosity values (uPa s) and 11
   Cp values (J/g K) match; viscosity is the page's ref. 3, Sengers & Watson,
   J. Phys. Chem. Ref. Data 15, 1291 (1986); Cp is ref. 2, Marsh (ed.) 1987;
   100 kPa and IPTS-68 stated on the page; the sha256 equals the PDF's.
6. Witness numbers: table02 dH(80 C) = -7.43864 J/mol and dS = -0.0236375,
   matching the goldens; Cp at 278.15 / 298.15 / 308.15 / 353.15 K to every
   printed digit.  table01: the logReciprocal values at 5 and 25 C match;
   the extended value at 110 C is 2.53951131709e-4 Pa s (a chord linear in T
   would give 2.52500e-4, so the 1/T form is implemented); the refused scan
   gives n_failures 1.
7. Byte identity on 35 cases chosen by the reviewer (16 props incl.
   transport01/02 and ammoniaRate01; steady flash01, column01, column03,
   trayEfficiency02, cstr02, ammoniaReactor04, hx02, heatExchanger03,
   pump01, liquidDensity01-06, greenAmmonia03; batch02, still01; ctrl01):
   logs identical apart from the banner commit, every output file
   byte-identical; transport01/02 differ only by the new bench entry
   (dev_table 9.0e-16, n_arithmetic_anchors 8 -> 9).  Rate-law tables: the
   arithmetic in Table1D is the same expression as before; a probe copy of
   ammoniaRate01 on, next to, between and outside the knots gave identical
   logs on both binaries, refusal text included.
8. The transport gate's old hole was real (chemsepEq16 passed on the next
   entry's year); a sabotage removing Andrade's years now FAILS by name.

## Rows

* **TB-01 (S2)**: the end-of-run "largest excursion" is tracked per
  PropertyTable object (PropertyTable.cpp:347-357) but
  AdvisoryLog::restate (Advisory.H:294) keeps the last statement per locus;
  when a second package builds the same table the run reports the later,
  smaller excursion and the first excursion is announced again.  A table01
  copy with a second extended point at 376.15 K after 383.15 K reports
  "largest excursion 3 K" when the run went 10 K past.  The guide's "the
  largest is restated" is false with more than one package.
* **TB-02 (S3)**: a per-mass Cp table on a record with MW <= 0 is used
  unconverted, as J/(mol K), silently (PropertyTable.cpp:115-124 reached
  from Component.cpp:1806 without a guard).  table02 with `MW 0;` exits 0,
  Cp_liquid = 4196.3.
* **TB-03 (S4)**: I2 loses digits by cancellation in the synthetic division
  (PropertyTable.cpp:389-393) on a short steep monotoneCubic segment (2e-10
  relative); shipped tables unaffected (<= 1e-14).
* **TB-04 (S4)**: MODELS in check_transport_correlations.py:244 omits
  `table`; the gate checks none of that entry's lines and says "all 11"
  while the bench prints 12; dev_table pinned in no golden.
* **TB-05 (S4)**: table01's reason (thermoPhysPropDict:74) calls 110 C at
  2 bar "superheated liquid"; Psat(110 C) = 143.24 kPa (CRC 82nd ed. p.
  6-8), so the state is subcooled.

Not a row: on unequal spacing the inner slope is the plain mean of the two
secants, not spacing-weighted; monotone and C1 still, and described
truthfully.

## What could not be reached

No full sweep and no `--gui`; no solid-Cp table case; `bin/runTests --only`
refuses on a detached HEAD, so the transport gate was run directly.

(Written into the tree by the coordinator from the reviewer's hand-back:
the harness refuses report files written by a subagent.)

## Round 2 (2026-11-15): `c398/slice-c-tables` at 5834961cf

Verdict: TB-01..05 all fixed (substance in 46f44e163); every new or moved
golden recomputed by hand from the case files matches; the TG-08 amendment
holds; 20 cases chosen by the reviewer byte-identical to 679eebd28.  One
new row, TB-06 (S4, wording).  Ledger: `review/c398c-numbers-r2` at
9fd4d61fe.

* TB-01: two packages, 10 K then 3 K past the table: "largest excursion 10 K,
  to T = 383.150000 K", announced once; held per locus; two variants
  extending one file share a locus and the message names the one that reached
  the maximum.
* TB-02: `MW 0` and `MW -18.015` exit 1 naming the per-mass column and M.
* TB-03: I2 by a series when |s/x0| <= 0.5: 1.7e-16 / 2.8e-16 against
  50-digit quadrature; no step at the switch-over (+-1e-9, +-1e-12, three
  tables); worst 5e-16.
* TB-04: `table` in MODELS, "all 12"; dev_table 9.02243745198e-16 pinned at
  abs 1e-12 in transport01/02.  TB-05: the reason corrected (Psat 143.24 kPa
  at 110 C, 198.48 kPa at 120 C).

| case and quantity | golden | recomputed |
|---|---|---|
| table01 muPastEnd_extended, 378.15 K | 2.67329451942e-4 | 2.67329451942e-4 |
| table02 Cp at 375.15 K | 75.9887112 | 75.9887112 |
| table02 dH h80_table -> h375_extended | 1667.150525 | 1667.15052532 J/mol |
| table02 dS same span | 4.5794696112 | 4.57946961257 J/(mol K) |
| table05 A.P1 at 300 K, 11 points | 8.55699332114e-4 | 8.55699332114e-4 Pa s |
| table05 B.P1 at 300 K, 6 points | 8.59872616902e-4 | 8.59872616902e-4 Pa s |

(The H and S goldens compare 2 bar with 1 bar and match the integrals alone
because the generic liquid enthalpy has no pressure term, C390.)

* TG-08: y <= 0 refused under linear, monotoneCubic, integrated linear and
  logLinear; 1e-300 accepted; table02 with a point at -4.1806 J/g/K refused.
* Byte identity, 20 cases (ammoniaRate01, liquidDensity01-06, hda,
  cavett01_recycle_train, batch02_adiabatic, still02, ctrl02,
  column02_simultaneous, pipe01_water_line, cstr07_lhhw, sprayDryer01_sugar,
  flash20_pcsaft, membrane01_RO, coolingTower01_merkel,
  compare_visc_liquid_ammonia), both binaries in one directory: exit codes
  match, every output file identical, only the citation line's commit stamp
  differs.
* **TB-06 (S4)**: the refusal of a value <= 0 (PropertyTable.cpp:225) prints
  the value after unit conversion ("as -4180.6", J/(kg K)), a number not in
  the file.

## Round 3 (2026-11-15): ed65dbb0f

The builder fixed TB-06, TG-03, TG-17..21 in one commit; each new gate arm
was shown failing on its own sabotage.  TG-18 is held by the source: no run
reaching the rethrow could be built (the route `select` calls throws only
the above-Tc refusal).  Accepted by the coordinator without a third
review round; landed after `--fast` 87/0 and `--gui` 49/0 on the merged
tree.
