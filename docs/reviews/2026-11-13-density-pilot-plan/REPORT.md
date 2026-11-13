# Review by measurement: the density pilot plan (C378), before any code

Reviewed: `docs/design/density-pilot-plan.md` on branch `c378-pilot-plan`
(c48786fd31), with the thresholds note and the routes record it is bound by.
Nothing of the plan is built, so the pilot itself was not run.  What was run:
today's engine (main acac66a7d4, native build, without the door) on scratch
copies of the 32 cases the plan reaches and of 126 cases that contain water;
and independent arithmetic in Python (standard library) for the plan's own
numbers.  Requested by nobody: the reviewing session pulled it because the
plan's first code step was pushed the same night, and a threshold written
before a run can only be checked before the run.  The rows are on an unbuilt
plan and do not count against the pull limit.

## 1. Verdict

The plan is mostly safe to code.  Its reach count, the two defects it says go
first, every hand number for the NaOH law and for the measured point, and
about fifty of its fifty-five `file:line` citations reproduce.  No shipped
case would print a wrong number or be refused by a rule as written: there is
no S1.

Four things should change BEFORE the demonstrations are run, because each is
a threshold or a check that would give the wrong verdict:

* **PP-01.**  The liquid-branch rule refuses two of D1's own twelve anchors.
  The saturated rows are printed with a rounded pressure (750 Pa at 276.0 K,
  863 Pa at 278.0 K), and at that pressure the temperature is 1.05 mK and
  8.07 mK above the reference equation's saturation temperature, so the rule
  "T <= T_sat(P) + 1 mK, else a domain error" refuses them.  The plan does not
  say the harness asks the saturated anchors at p_sat(T).  Table
  `item5_d1.tsv`.
* **PP-02.**  The method the pilot intends probably FAILS its own D2
  threshold at 323.15 K.  The thresholds were set from a floor computed with
  MEASURED pure ethanol; the pilot's ethanol leaf is the anchored Rackett
  volume.  From the per-isotherm baseline on main (2.943 % today at 323.15 K,
  every point low) and the effect of the one leaf that changes (water), the
  intended method scores about 2.46 % against the 2.0 % threshold (bounds 1.50
  to 2.92 % over any composition grid); pooled over the two isotherms about
  2.11 %; against the second laboratory about 2.31 % for 2.3 %.  Table
  `item5_d2.tsv`, its last lines.
* **PP-03.**  D2's numbers cannot fail a mass-fraction average of the two
  pure densities: it moves every point TOWARD the measurement (the ideal
  mixture is low everywhere; the average is higher everywhere) and scores
  better than the correct rule.  A mole fraction read as a mass fraction
  passes at 298.15 K.  So D2 is a statement about accuracy and proves nothing
  about the mixing rule that was coded.
* **PP-04.**  No stated check proves that the pump and the CSTR USE the
  kernel's value for `idealMixing` or `solutionLaw`.  The behavioural witness
  exercises the `measured` method only (its three invariants hold
  algebraically, so a unit that reads the kernel only for `measured` and keeps
  its own sum otherwise passes it); D1 asserts "units equal the kernel" for
  the one-constituent water set; D2 and D3 are scored on the kernel, not on
  the units.

What can wait is in rows PP-05 to PP-15 (section 3).

## 2. What was measured, item by item

| item | measured | result |
|---|---|---|
| 1 reach | all 32 cases run; today's density derived from each pump's head and each CSTR's residence time; the "anchored leaves" column recomputed independently for the rows the plan quotes | 32 cases, 37 units, 27 away from 25 C, 4 ion cases with 8 pump units, 10 with water in a mixture: all reproduce; so do -0.27, +0.46, -7.85, -5.33, -7.64, +1.51 % and rankine02's -10.3 %.  Three cells differ in their last digits (PP-07).  `item1_reach.tsv`, `item1_consequences.txt` |
| 2 the two defects | rankine02's condensate asked of today's engine at P, P(1+1e-6), P(1-1e-6); cstr02's ideal-gas flow against the flow its CSTR prints | 4.45 / 893.99 / 4.45 kg/m3 and a factor of 186.25: both reproduce.  `item2_rankine02.txt`, `item2_cstr02.txt` |
| 3 a second saturation curve | T_sat(P) of the water record's own vapour-pressure fit against the reference equation, 0.007 to 100 bar; 126 water cases searched for pure-water liquids near saturation | the brief's hypothesis is NOT supported from 0.07 bar up: the record's T_sat is BELOW the reference's (-0.66 K at 1 bar, -12 K at 100 bar; the record's header already states that its fit is poor above 313 K), so such a stream is subcooled for the reference and is priced.  Below about 0.065 bar it is the other way (+3 to +18 mK) and a record-saturated condensate would be refused; none exists in the sample (PP-05).  `item3_*.tsv` |
| 4 dust and the set | every pump and CSTR inlet at convergence; the recycle cases at every tear iteration; the outer drivers | no constituent below 1e-12 anywhere; the only one below 1e-6 is a boron species with a leaf; no set changes between tear iterations or between passes.  The hypothesis of spurious refusals from numerical dust is NOT supported on the shipped cases.  `item4_*.tsv` |
| 5 the thresholds | each scored threshold recomputed for the intended method and for wrong ones | D1 and D3 separate every gross error (D3 by the triangle inequality on the law's own 0.055 % and 0.12 %); D2 does not (PP-02, PP-03).  `item5_*.tsv` |
| 6 hand numbers | the 18 coefficients evaluated; the measured point's table; the box's sensitivities | all reproduce (997.608, 1522.923, 1212.699, 1196.164 kg/m3; Q, tau, W, head; -0.517 kg/m3/K and 1084 kg/m3).  `item6_hand_numbers.txt` |
| 7 the witness | algebra | the invariants hold; the witness cannot see PP-04; its negative control works on main only because main ignores an unknown block in silence (PP-11) |
| 8 citations | about 55 line ranges read on the plan's branch | correct but for two "density" consumers that are viscosity calls (PP-10) and one prefix cited one site early.  `item8_citations.txt` |

Limits of items 3 and 5, stated by the reviewer: the per-point D2 and D3
measurement files are not in the tree, so D2's verdicts are a transfer from
the baseline summary on main plus a labelled proxy curve (calibrated to the
baseline's own 1.762 % at 298.15 K), and D3's are bounds.  The proxy is not a
measurement.

## 3. Findings (`findings.tsv`, 15 rows: 4 S2, 11 S3)

| id | sev. | statement |
|---|---|---|
| PP-01 | S2 | the 1 mK rule refuses two of D1's twelve anchors at their printed pressure; today's pure-fluid route returns the vapour at three of them |
| PP-02 | S2 | the intended method probably fails D2 at 323.15 K (about 2.46 % for 2.0 %): the floor assumed measured ethanol, the leaf is anchored Rackett |
| PP-03 | S2 | a mass-fraction average passes D2 and beats the correct rule |
| PP-04 | S2 | no check proves the two units use the kernel for `idealMixing` or `solutionLaw` |
| PP-05 | S3 | below about 0.065 bar a condensate saturated by the record's curve is refused (later slices; none in the corpus sample) |
| PP-06 | S3 | consequence (a) quotes three percentages with the sign convention inverted |
| PP-07 | S3 | three reach-table cells differ in their last digits; one row omits its 300 K case |
| PP-08 | S3 | today's code holds two tests of "present" (x > 0 and 1e-12) |
| PP-09 | S3 | D1's anchors do not separate the two water formulations at 0.001 % |
| PP-10 | S3 | two lines cited as density consumers are viscosity calls |
| PP-11 | S3 | the witness's negative control relies on main ignoring an unknown block |
| PP-12 | S3 | a step of -0.06 to -0.11 % (+0.23 % at 0 C) between the sets {water} and {NaOH, water} as NaOH tends to zero; D3b's recycle seed is unstated |
| PP-13 | S3 | a declared `massWithoutVolume` ranks below a reference equation chosen by fact, so it cannot cover a dissolved gas above its critical temperature that is not a declared Henry solute (later slices) |
| PP-14 | S3 | D3 has no state that probes the domain error |
| PP-15 | S3 | "scored at 298.15 and 323.15 K" does not say per isotherm or pooled |

## 4. What the review suggests, briefly

For PP-01: ask the saturated anchors at p_sat(T) of the method itself, or
widen the rule's window to the rounding of a printed pressure and say so.
For PP-02: decide the D2 threshold again knowing which ethanol leaf the pilot
uses, before the run, or score D2 with the leaf the floor assumed.  For PP-03
and PP-04: one case in which the units' printed flow and residence time are
compared with the kernel's value for a MIXTURE on `idealMixing` and for the
NaOH law (the witness's own trick, a second artificial leaf value, would do
it), and one D2 state far enough from the pure ends that a mass-fraction
average differs from volume additivity by more than the threshold's margin.

## 5. Not examined

The pilot itself; D2 and D3 against their per-point measurements; D4 and D5
numbers; the user-operation case (its `code/` is not built here); the
time-integrated binaries; the sizing-pass consumers by stream; cases that
contain no water; sections 7 and 11 of the plan beyond their cited lines.
