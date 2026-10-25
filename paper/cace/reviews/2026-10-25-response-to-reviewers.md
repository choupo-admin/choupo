# Response to the external review of 2026-10-21 (draft, revision 2)

DRAFT for the authors (DEV.md 4c C126).  The review is
`2026-10-21-external-review.md` beside this file; the revised manuscript is
`../main.tex` (built `../main.pdf`) with a new supplement
`../supplement.tex`.  Section numbers below are those of revision 2.  Every
engine number quoted was read from a run on branch
`claude/c126-papers-revision` (based on origin/main `c11d0354a`,
2026-10-25); the commands are in the supplement, S1.

We thank the reviewer for a careful and demanding reading.  We followed the
recommended order: freeze and correct the central cases, redo the benchmark
as controlled exercises, strengthen nanofiltration and curation, then
rewrite the introduction.

## 1. Scientific contribution against the state of the art

*Changed (Section 1).*  The introduction now compares four classes of
open tool (IDAES, DWSIM, CoolProp/Cantera, Choupo) on each of the six
observables (new Table 1), says which observables already exist elsewhere
-- IDAES exposes its equations better than any compiled simulator, CoolProp
attaches references to its fluids -- and restates the contribution as the
*enforcement* of the six where inputs are read and their *verification
across a corpus*, not any individual feature.

*Open.*  The cells of Table 1 are the authors' reading of each tool's
documentation; cells we could not settle say "not established".  Every cell
is to be checked against the tools' current releases before submission
(TODO in the source).

## 2. The Cavett case

*Changed (Section 5.2, Figure 3, Table 4).*  The 88 % mixer imbalance was a
defect in Choupo's adiabatic mixer (its outlet was published in the phase
of its dominant inlet and its temperature computed on a different enthalpy
surface from the one the balance report prices).  It is fixed in the engine
(commit `4c8a5097a`).  Re-run on this tree: Newton converges in 7
iterations to ‖r‖ = 5.39e-9; mass closes to 100.0000 %, every element to
0.0011 %, and the first law to **+0.0019 kW of 396 325 kW exchanged**
(it was −549 319 kW, 88.02 %); both mixers close to 0.0000 kW and the mixed
streams now flash (269.7 and 273.6 K).  The earlier result is kept as the
example of defect detection.
Figure 3 now draws the Cavett flowsheet itself: four drums, two mixers,
the two torn streams and the three recycles (one liquid, two vapours --
revision 1 said "three vapour recycles", which was wrong).
Section 3.1 now defines **numerical convergence**, **physical consistency**
and **acceptance** separately; Table 4 answers the three for Cavett.  Yes,
`converged/` means numerical convergence only, and the text says so and
shows how the default balance report exposes an inconsistent converged run.

*Not changed.*  Acceptance for Cavett rests on a published solution
(FLOWTRAN, Rosen & Pauls 1977), not on a measurement; no measurement exists.

## 3. The benchmark is not a controlled comparison

*Changed (Section 5.4, Tables 5-7; supplement S2-S4).*  The comparison is now
two exercises.

**Exercise 1, same equations (case E).**  A new variant of the reforming
case, `benchmarks/dwsim/reforming01_methane_steam_pfr/variants/
sampleKinetics`, writes the reference sample's own stored rate expressions
(atm, its rounded pre-exponentials, its own equilibrium correlations, its
two truncated denominators) into Choupo, so both programs integrate the same
rate laws over the same reactor.  Doing it exposed a defect *on Choupo's
side*: the case's 400 RK4 steps were not grid-converged (the 1 % H2 inlet
makes the first millimetres stiff), leaving the conversion 0.85 % short of
its limit -- more than the gap it had been compared on.  The case now uses
25 600 steps (Table 5, grid study).  Result: with identical rate laws,
CH4 conversion **0.7578 against the stored 0.7532 (+0.61 %)**, CO2
−3.0 %, water −1.7 %.  The 584 Pa Ergun drop the case does not reproduce
was measured *not* to explain it (0.7581 at the mean pressure).  The
reference's integration (20 stored volume increments) is consistent with a
lower conversion but is not established from the file; the text says so.
The duty (466.4 against 1221.8 kW) does not depend on the rate laws.

**Exercise 2, different parameters and models (cases A, B, D).**  Each
conclusion reduced to what the runs show (point 4).  Case B was re-mapped
on this tree (the reference counts its condenser as a stage; Choupo now
counts equilibrium stages, so 40/20 became 39/19 and the feed stages
moved one up) and `compare.py` now aligns stage k with the reference's
Estagio_k: duties −0.67 to +1.46 %, distillates −0.017 and −0.022; the
HP stage profile difference was 0.085 in x and is 0.023 once aligned.
Case D now carries a knock-out drum the sample does not have (a Choupo
compressor refuses liquid in its suction): only the CO2 train is like for
like, and the methanol product (1.3967 against 1.2304 mol/s) mostly
reflects that departure.

**Case C** is no longer compared in the article: the reference column is
adiabatic and cools 13.4 K, Choupo's extractor is isothermal, and
temperature moves the split, so the two programs solve different problems
-- exactly the reviewer's point.  It is in the supplement (S3).

**The audit of the reference's stored files** moved to the supplement (S2),
stated as facts about files, not about the program.

*Open.*  The samples were not re-executed in an identified DWSIM version
(we compare stored states, and say so).  Re-executing them needs the
program on Windows/Mono and is a candidate for the next revision.

## 4. Causal conclusions stronger than the experiments

| claim in revision 1 | revision 2 |
|---|---|
| A: the difference is the EoS, not the valve | reduced: the letdown is sensitive to the thermodynamic parameters by several K; a valve-implementation difference is not excluded (Section 5.4, A) |
| D: closer to equilibrium favours Choupo | withdrawn (D is no longer compared at the reactor) |
| D: one measured volatility decides N_min | reduced: one point is not the column mean Fenske needs; no conclusion drawn (Section 5.4, D) |
| 3.3: azeotrope in the same place, so the design is insensitive | withdrawn; the text says sensitivity depends on the whole column (Section 4.3) |

## 5. Curation acceptance criterion

*Changed (Section 4.2, Eq. 4, Figure 2).*  The rule is stated formally
(b = max U95 + max endpoint vapour-pressure error), and argued: the
uncertainties are the archive's *expanded* (95 %) combined uncertainties,
u = U95/2 (GUM); for a correct model with random error alone the expected
AAD is ≈ 0.4 Ū95, so the first term is already conservative; an endpoint
vapour-pressure error enters a near-ideal bubble temperature as
x1δ1 + x2δ2, bounded by max|δ|; the two are added linearly (worst case),
which makes the rule conservative for a correct model.  Its limits are
stated: the archive's combined uncertainties are taken as given (whether
each article propagated composition and pressure was not checked), other
systematic errors are not modelled, a mean cannot see a few bad points.  The
verdict is therefore also tested with χ² = Σ(r/u)² on every held-out point:
NRTL **1935** on 30 points (95 % quantile 43.8), UNIFAC **31**; noise alone
would give an AAD of 0.037 K.  The verdict does not depend on the rule's
details.
Figure 2 no longer draws the band on individual residuals; the caption
says the criterion applies to the mean.  "UNIFAC saw neither study" is now
"was not fitted to either study in this work", with the caveat that its
group parameters may include this binary.

*Open (TODO B10).*  The two articles of the worked example have not been
read back against the archive's transcription; every run says so.  This is
a curator's act and is owed before submission.

## 6. Nanofiltration: equations and a results figure

*Changed (Section 5.3, Eq. 5, new Figure 4).*  The SDEM equations (fluxes,
virtual electroneutrality, zero current, the permeate closure, the field,
the boundary conditions, the integration direction), the DSPM-DE pore
(extended Nernst-Planck, partitions, 101-node Scharfetter-Gummel
discretisation, solved with the wall and the water flux by one Newton, as
NanoFiltran does), the polarisation model and the operating conditions are
now in the text.

**Verification vs validation are separated.**  Against NanoFiltran (another
code) the pore agrees to 7.9e-7 on 35 problems -- verification.  Against
*measurements*: (a) the DSPM-DE pore fitted to the measured chloride
rejections of Fernández de Labastida & Yaroshchuk (2021) gives r_p
0.675 ± 0.034 nm, X_d −10.5 ± 4.1 mol/m³, and predicts the held-out
sulfates to **0.93 rejection points** (case `membrane24`) -- but on the
transmission scale the prediction is 9-12× too low for Na2SO4 and 49-67×
for MgSO4, which the text states; (b) SDEM with the paper's permeances
reproduces the measured trace-ion transmissions within 7-8 % in the trace
limit, and departs by **20-46 %** at the experiments' own trace
concentration: the permeances were fitted under the trace approximation and
do not transfer to the full model.  Figure 4 shows both, with the measured
symbols, the authors' lines, and Choupo in both limits.

**Identifiability.**  Withdrawn: "per-ion permeances are calibratable from
single-salt tests".  The text now shows that a single salt fixes one linear
combination of the reciprocal ion permeances, that four salts on two
cations and two anions give a rank-4 system only because the valences
differ, and that Choupo's reproduction of the paper's four salt permeances
is a consistency check, not an identification.

## 7. Guarantees too absolute; residuals, tolerances, coverage

*Changed (Section 3.2-3.4, Eqs. 1-3, Table 3).*  "A class of error cannot
come back" is withdrawn: "a check protects the conditions it exercises".
The residual formulas and the normalisation by the energy *exchanged* are
given; the 0.5 % / 1 % / 1 kW thresholds are stated as detection
conventions (with their basis: three orders above a converged tear's
residual) and not accuracy claims.  Table 3 reconciles the coverage over
the 286 steady cases of the 494 (mass: 261 close, 4 closed cycles, 1
announced, 13 no report, 7 non-zero exit; energy: 113 + 71 close, 5 + 7
listed, 70 refused for want of an enthalpy datum, 1, 13, 7 -- the listed
row counts the lists, so the energy column sums to 287; said in a note).
Independent hand checks: an independent bisection of the flash's
Rachford-Rice equation gives V/F = 0.30398357, the engine's; a heater
(100 kW into equimolar ethanol-water) gives T_out = 338.33866 K by hand and
338.3386581 K from the engine, first-law residual 0.000000 kW.  The flash's
zero energy residual is no longer presented as a test of the energy
calculation.

## 8. A single frozen, re-run version

*Changed.*  Every number, figure and table was regenerated on one commit
(the one carrying this manuscript, based on `c11d0354a`).  The essential
commands and the file each number comes from are in the supplement (S1),
not only in LaTeX comments.  Table 5 of revision 1 (case B, measured before
the column corrections) was re-measured.

*Open (Vítor's decision, TODO B4/B6).*  A release tag cut from that
commit and an archived copy with a DOI.

*On the benchmarks in the tests* -- the reviewer is right that Choupo's own
side can be tested without agreeing with the reference.  `compare.py`
already checks, on every run, that each case exits 0, converges, carries no
NaN, closes its own first law, and that its case-local records are still
copies of their one home; making that a check of the regression suite is
planned and stated in Section 5.4.

## 9. Less internal history, more method

*Changed.*  "Gate", "ratchet", "witness", "debt" and internal codes are
gone from the text ("automated check", "listed by name", "test case",
"open defect"); the OpenFOAM table was cut to one paragraph (the trade-mark
statements kept); the GUI figures moved to the supplement (S5);
educational benefits are stated as goals.

## 10. Point corrections

* "Hand-written C++" -> "ordinary C++ ... substantial parts written by AI
  coding agents under the authors' briefs" (Section 2.1), consistent with
  the declaration.
* References [16]/[17] (Rosen & Pauls 1977; Rosen 2005): Rosen & Pauls is
  now complete (Computers & Chemical Engineering 1(1) 11-21,
  doi:10.1016/0098-1354(77)80003-3).  The 2005 CACHE News article is **no
  longer cited**: its full title names a commercial simulator, the
  project's rule forbids naming one, and we agree with the reviewer that a
  shortened title is not acceptable.  **Decision for the authors (TODO
  B11):** cite it in full, or keep it out as now.
* Xu & Froment (1989) and Vanden Bussche & Froment (1996) added in full.
* Every reference with a DOI was checked against Crossref (2026-10-25);
  three author names of the ThermoML paper were corrected; the entries
  that cannot be checked that way carry a TODO.
* Provenance claim reconciled with the four records still pending: the
  text now says "a source and a licence for every value, except four
  listed records" (Section 4.1).
* Figure 1 (architecture) enlarged; the GUI figure moved to the supplement.
* Affiliations, contributions, funding, archive: still TODO (B1-B7).

## Changes outside the manuscript (made for this revision)

* `benchmarks/dwsim/reforming01_methane_steam_pfr`: `nSteps` 400 -> 25 600
  (grid study in the case and README); new variant `sampleKinetics`.
* `benchmarks/dwsim/distillation01_methanol_acetone_pressure_swing`:
  stages re-mapped 40/20 -> 39/19 equilibrium stages, feeds one stage up.
* `benchmarks/dwsim/compare.py`: runs the new variant; aligns B's stage
  profiles with the reference's Estagio_k.
* READMEs of B, C and E updated with the re-measured numbers.
* No engine code and no tutorial golden was changed.
