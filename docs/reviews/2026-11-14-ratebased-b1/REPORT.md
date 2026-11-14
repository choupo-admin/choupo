# Review by measurement: slice B1 of the rate-based column (`model rateBased;`)

Date: 2026-11-14.  Asked by the coordinator (board).  Reviewed on main at
71203dc590, on a native build of that commit.  No tracked file was
modified (the owner's order): every case ran on a scratch copy, and what
would need an edit is section 6, as requests.  Findings: `findings.tsv`
(RB-01 .. RB-15).  Scripts and outputs: this folder.

## 1. Verdict

**No wrong published number.**  Everything recomputed from the published
profiles agrees with the engine to 1e-11: the HETP and the relative
volatility behind it, the summed interfacial transfer, the height of a
transfer unit and the liquid film's share at mid-bed, and an independent
re-implementation of the packing correlation's two film heights.  The
gate exits 0, the order of convergence is 2.00, and no decision flips
when the last bit of `pow`, `exp` or `log` is moved.

**One finding a designer would meet** (RB-01): a reboiler composition
with one component at zero runs to exit 0 and publishes a meaningless
HETP or NaN.

**What the slice's checks can and cannot see** (RB-02 to RB-05): stated
below, because the claims "verified" and "held to its limit" read
stronger than what was measured.

## 2. The three numbers asked for, recomputed by hand

From the published profile and KPIs and the cases' own vapour-pressure
coefficients (`recompute.py`, output `recompute_sweep.txt`), at the
golden's sweep point.

| case | HETP, m (engine = by hand) | summed transfer of the light component, kmol/s | mid-bed H_OG, m / liquid film's share |
|---|---|---|---|
| ratebased01 | 0.1597934341 | 0.0068332724 | 0.1567825748 / 0.178251 |
| ratebased02 | 0.1291687477 | 0.0040947128 | 0.1233613547 / 0.144606 |
| ratebased03 | 0.1834142814 | 0.0069784161 | 0.1816521759 / 0.070615 |
| ratebased04 | 0.1602491130 | 0.0041133551 | 0.1559367812 / 0.067073 |

Largest relative difference over the twelve: 2e-11.  The reviewing
session recomputed the first HETP itself from the golden's three KPIs:
2.2 ln(1.24117969735) / ln[(0.858424720529/0.141575279471) /
(0.236416101133/0.763583898867)] = 0.15979343409.

The relative volatility is the geometric mean of its values at the top
and below the bed (`RateBasedSegment.cpp:751`), reproduced from the
vapour-pressure coefficients to 3e-12.  The packing correlation's H_G
and H_L at mid-bed were rebuilt independently (`rbf_seg50.py`): -6.6e-12
and +3.8e-12.

## 3. The finding that gates a design use (RB-01)

| scratch copy of ratebased01, sweep removed | exit | published |
|---|---|---|
| as shipped (`pXylene 0.2; oXylene 0.80;`) | 0 | HETP 0.1555825 m |
| `pXylene 0.0; oXylene 1.0;` | 0 | HETP 0.0127579629 m, from a reflux composition of 3.4e-27; closure "verified" |
| `pXylene 1.0; oXylene 0.0;` | 0 | HETP NaN ("-nan m" printed, `null` in the result); the discretisation estimate NaN |

Both degenerate rows reproduced by the reviewing session.  The 1 %
discretisation refusal is written `estimate > limit`, which is false for
NaN.  The transfer-unit bed of the first delivery publishes NaN in the
same two cases, so half of this is older than the slice.

## 4. What the checks see

- **The first law** (RB-02).  The reboiler duty is the remainder and is
  labelled so; the "verified" comes from a second route, the reboiler's
  own envelope.  Summed over the bed, that check reduces to the sum of
  the interface energy row: any film heat-transfer terms that satisfy
  the row close it.  It can fail on an unsolved row or an inconsistent
  pricing; it cannot fail on wrong interface physics.  The reviewer's
  own estimate of the condenser duty of the first case: -438.30 kW
  against -437.94 kW.
- **The limit** (RB-03, RB-04).  The rate model in its limit and the
  transfer-unit bed call the same correlation and property functions at
  matching states, so their agreement (0.0025 to 0.016 %, falling
  4.03, 4.02, 4.01, 4.00 per doubling from 25 to 800 segments) proves
  the reduction and the wiring.  The gate's tolerance on it is about 1 %.
- **The measured points.**  They exist only as tables in a design
  record, digitised from a figure; no case file and no gate arm holds
  them.  The reviewer's sweeps reproduce the guide's mean signed errors
  (-14.4, -23.3, -4.2, -8.0 % for the rate model).  The two models
  differ by 0.1 % or less on these cases, against 2 to 4 % of reading
  uncertainty: these cases cannot tell them apart, and nothing in the
  tree can.
- **The non-ideal liquid** (RB-05).  The gate's arm uses two molecules
  with identical groups: every activity coefficient is 1.

## 5. The heat/mass analogy, measured as far as a case can reach it

The vapour film uses the Chilton-Colburn form and the liquid film the
penetration form (`RateBasedSegment.cpp:441-453`); at mid-bed of the
first case 23.6 and 956 W/m2K.  No case key scales them.  By replacing
the conductivity models on scratch copies:

| change | HETP, relative | effect elsewhere |
|---|---|---|
| liquid coefficient x 10 | +2.6e-6 | the liquid-interface temperature difference x 0.13; the flux ratio widens to 0.937 to 1.039 |
| liquid coefficient / 10 | -1.5e-5 | that difference x 10 |
| vapour coefficient x 1.165 | +6.4e-5 | the vapour-interface difference -13.8 % |

The composition profile and the HETP barely depend on the analogy on
these cases; the temperatures and the flux ratio do.  The vapour is
hotter than the interface at every segment, by at most 0.40, 0.59, 0.42
and 0.57 K on the four cases.

## 6. Requests (edits this session may not make)

1. A declared, announced scale on the two film heat-transfer
   coefficients, and the four cases at 0.1 and 10 for each phase.
2. The first-law check's stated blind spot extended to the content of
   the film energy terms.
3. `!(estimate <= limit)` at `:849`; a reboiler composition with a zero
   component, and any non-finite HETP, refused by name.
4. `height <= 0`, `P <= 0` and a non-integer `segments` refused by name.
5. The liquid thermal conductivity named in the property-sources table.
6. The header's refusal rule and the comment at `:309` corrected.
7. The enthalpy probe at the reboiler's own state instead of 350 K.
8. The gate: a tolerance for the limit sized from the measured
   second-order coefficient; a non-ideal case whose activity
   coefficients differ from 1, with a KPI required to move.
9. A tool that regenerates the guide's table against the measurement and
   states its load.

## 7. Refusals and robustness

Refused by name: three components, a reflux ratio, trays, an
equation-of-state vapour, fewer than ten segments, no packing block, a
partial condenser, a flooding load.  Order of convergence 2.00 (HETP at
25, 50, 100, 200, 400, 800 segments: 0.1555158806 to 0.1555868597).
With every third `pow`, every third or seventh `exp`, or every third
`log` result moved by one unit in the last place: exit 0, converged, the
largest KPI move 4.9e-11 relative.

## 8. What was NOT reviewed

The WebAssembly build and anything in a browser; the page of the web app
that was corrected with this slice; the second packing correlation's
internals; the gate's self-test arm (it needs a source edit).

## 9. Answer (2026-11-14, branch c329/b1-review-rows)

Every defect reproduced on a scratch copy before it was touched; before and
after below.  Reproducers: the probes of the review, rerun on this build.

| row | status | before | after |
|---|---|---|---|
| RB-01 | fixed, both beds | `pXylene 0`: HETP 0.0127579629 m at exit 0, closure verified; `oXylene 0`: HETP `-nan`, exit 0 (rate-based AND the transfer-unit `totalReflux` bed: `-nan` in both) | exit 2 on all four runs: "totalReflux.composition has oXylene at 0.000000: a binary packed bed needs BOTH components present at the reboiler (a pure fluid has no relative volatility and no HETP).  Give each a positive mole fraction."  A non-finite HETP or discretisation estimate is also refused by name before it is published; the shipped cases are byte-identical (ratebased01 HETP 0.15558249 before and after) |
| RB-02 | fixed by honest label | closure "verified", blind-to line named only the duty split | the closure's `blindTo` and `check` text now say that, summed over the bed, it is an identity of the three energy rows (the reference latent heat times the sum of the interface row): it fails on an unsolved row or an inconsistent enthalpy pricing, never on wrong film energy terms; the Theory Guide says the same.  An independent check of the film terms does not exist in the tree (no second route to the interface heat); none was invented |
| RB-03 | reported | see the sentence below | guide text (limit agreement) now states what the agreement proves |
| RB-04 | fixed | tolerance r_max^2/2 = 0.83 to 1.74 % against differences of 0.0025 to 0.016 % | tolerance 0.01 r_max^2 = 0.0165 to 0.0348 %; 0.01 is 2.2 times the worst measured coefficient (differences are 0.0019, 0.0046, 0.0015, 0.0034 of r_max^2); margin per case 5.4, 2.2, 6.6, 2.9; the gate prints it |
| RB-05 | fixed | p-/o-xylene UNIFAC: gamma = 1 exactly, all KPIs equal to the ideal run within 1e-10 | p-xylene + ethylbenzene, UNIFAC gamma(pXylene, EB) = 0.9745, 0.9980 at x = 0.2/0.8 (0.9911, 0.9892 at 0.5; 0.9997, 0.9702 at 0.9; 320 K); the same pair run ideal is the control and the gate requires alpha to move by > 1 % and HETP by > 0.05 %: measured alpha -2.76 %, HETP +0.140 % |
| RB-06 | fixed | liquid conductivity absent from the table | `liquidThermalConductivity`, source `package.liquidThermalConductivity`, printed per column and pinned by one appended golden row on each of ratebased01-04; no number moved (diff of the four goldens ignoring whitespace: four added `source` rows and nothing else) |
| RB-07 | fixed | header: r_max^2/12 | header says: the estimate is the Richardson one, |HETP(M) - HETP(M/2)|/3, measured on the bed; not a rule on r |
| RB-08 | fixed | height 0: "non-finite Jacobian column 0"; negative height: "Newton did not converge" / flooding; negative P: an equation-of-state message; `segments 10.7` truncated to 10 at exit 0 | each refused before the solve, by name: "`packing { height }` must be positive; read 0.000000 m", "...read -2.200000 m", "the top pressure `P` must be positive; read -10000.000000 Pa", "`segments` must be a whole number; read 10.700000"; also diameter and F-factor; four gate arms |
| RB-09 | fixed (moved, not removed) | probe at 350 K raised the caveat lines at a state no segment visits | the probe's job (turn a record with no formation enthalpy into a refusal with a remedy) is kept and it now asks at the reboiler's own bubble point; the ratebased02 caveat names 311.6 K, the real bottom of the bed.  The two extrapolation lines remain, truthfully: the bed (307.8 to 314.5 K) does leave one component's heat-capacity range |
| RB-10 | reported | `feed F1;` stripped, exit 0 | not fixable inside the column: the key is stripped in `buildAugmentedDict` (src/unitOperations/flowsheet/UnitInputs.cpp:116), shared by every unit; the unit never sees it.  The dead refusal in RateBasedSegment.cpp now carries a comment saying so.  Remedy needs the flowsheet layer (a unit that takes no feed must refuse a wired input) |
| RB-11 | fixed | comment: exact for "the only phases this slice accepts" | comment says exact for an ideal-gas vapour and an ideal-solution liquid, and that a non-ideal liquid is accepted with its partial molar enthalpies read off the mixture |
| RB-12 | reported | | the guide's table is now captioned (equal reboiler load) and states the equal-bed-mean-load figure; proposed DEV.md sentence below |
| RB-13 | reported, comment not changed | | WilkeChang.cpp is under src/thermo/, in another slice's territory: not edited.  The comment to correct is there (:48 says the record's volume is at Tb; these records give 298 K).  The Theory Guide now states the limitation: 7.6 % lower diffusivity and +0.72 % H_OG at mid-bed of ratebased01 with the boiling-point volume, shared with the transfer-unit bed |
| RB-14 | fixed | guide table had no stated load, no tool | the guide states the load, (F_top + F_bottom)/2, and names `docs/reviews/2026-11-14-ratebased-b1/measured.py`, the reviewer's script that parses the digitised points from the design record and reproduces the table (not rerun here; it reads the two sweeps) |
| RB-15 | fixed | the report: "this plant declares no duty", Q_heat 0, residual_pct unavailable, for a feedless column exchanging about 410 kW each way | src/reporting/EnergyBalanceReport.cpp: a `distillationColumn` with no process stream and duty items is a boundary exchanger, not a sink (its duties are added to the plant boundary and to the exchanged-energy scale): ratebased01 now publishes residual_denom_kW 819.896, residual_pct 0, available true, Q_heat 0 (the net).  Reach: only a distillation column with no process stream; 19 cases of the scope and `--fast` unchanged.  Note the 0 % is the identity of RB-02 again (feedless plant: residual = net duty) and is not more evidence than that |

RB-03, sentence proposed for DEV.md: "The rate-based segment in its limit
`transferUnits` agrees with the transfer-unit bed to 0.0025-0.016 % at 100
segments; that proves the reduction, the wiring and second-order convergence
(both codes call the same correlation and property functions), and is no
evidence about the non-equilibrium model (film energy terms, interface
temperature, non-equimolar fluxes), which the limit switches off."

RB-12, sentence proposed for DEV.md: "The rate-based HETP is +0.03 to +0.19 %
above the transfer-unit bed at equal REBOILER load; at equal bed-mean load
(the abscissa of the comparison with the measurement) the two differ by -0.015
to +0.009 % on the first case, because most of the difference is the vapour
growing 0.9 % up the bed, not interface physics."  The Theory Guide repeats
no unqualified "+0.19 %" any more (the one remaining table is captioned by its
load); no other tracked guide text repeated it.

Gates and checks (this build): `bin/runTests --fast -j3` 87 PASS / 0 FAIL /
5 EXPECTED-FAIL; `--scope` over ratebased01-04, packing01-04,
totalReflux01_c6c7_yanagiRun628 and trayEfficiency01-07 (the other feedless
columns): 19 PASS / 0 FAIL, with energy_closure, element_balance,
energy_boundary_pinned and golden-closure-static PASS (mass and campaign
closure had no subject: none of those cases reports one);
check_ratebased_segment OK (34 s; 12 refusals by name, the non-ideal arm
moves alpha -2.76 %, HETP +0.14 %); check_property_source_witnesses OK after
re-pinning one tag; repoint_lesson_citations OK (500 current); Theory Guide
PDF rebuilt with `make -B theory`.  Goldens: four `source` rows appended, no
value row moved.
