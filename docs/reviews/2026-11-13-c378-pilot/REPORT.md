# Review by measurement: the liquid-density pilot (`c378-pilot`)

Date: 2026-11-13.  Reviewed: `c378-pilot` at its final head f08f9b061e,
before it landed, on native builds of that commit.  Three reviewers, one
angle each; the third (blast radius and gates) is section 6.  Findings:
`findings.tsv` (PA-01 .. PA-19 the contract and the code, PB-01 .. PB-09
the numbers, PC-01 .. PC-16 the blast radius and the gates).  Scripts:
`contract/`, `numbers/` and `blast/`; each takes
`<repo-root> <scratch-dir>` and writes only under the scratch directory.

## 1. Verdict

- **No wrong number was found in what the pilot publishes.**  Some thirty
  pump and reactor quantities were recomputed from an implementation of
  the reference equation written from the catalogue's own coefficient
  record (it reproduces the release's printed tables to 3e-9); every one
  equals the density the run records to 1e-12.  No factor of a thousand,
  no dropped component; every moved golden row that was read carries a
  stated reason (section 3).
- **Two findings block landing** (PA-01, PA-02), and four more are
  silent or wrong outcomes inside the new resolver (PA-03, PA-04, PA-05)
  or on main (PA-09).  Section 2.
- **One finding is a debt the pilot makes visible** (PB-01): its own two
  water demonstrations open on a first-law alarm.

## 2. The findings that gate the batch

Each line gives the minimal case and the two numbers.  "Mine" means the
reviewing session reproduced it itself on a build of f08f9b061e.

| id | minimal case | observed | expected | reproduced |
|---|---|---|---|---|
| PA-01 | `git archive HEAD tutorials/steady/thermo/liquidDensity03_NaOH`, extracted and run | exit 2, "No solution record covers this set" | exit 0, tau 1212.699 s | mine |
| PA-02 | liquidDensity06's files; feed water 3474 + NaCl 126 kg/h; `massWithoutVolume { components ( NaCl ); maxMassFraction 0.05; }`; a measurement `brine35 { use method; replaces { method idealMixing; } }` | never returns (killed at 40 s) | a result; with `use check;` it exits 0 in a second | mine |
| PA-05 | liquidDensity04 with the measurement's column renamed `w[NaHO]` | exit 0, tau 1212.70 s, no line names the measurement | 1213.80 s, or a refusal naming the unmatched measurement | mine |
| PA-04 | liquidDensity02 plus `massWithoutVolume` for ethanol | density unchanged, 0 log lines about the declaration, pump dT 0.0427 K, closure 44.88 % | one reading of the declaration: dT 0.0285 K and closure 30.00 % if it is ignored, or the density changed and said | mine |
| PA-03 | liquidDensity05 plus `massWithoutVolume` for CO2, with the reactor given its own `thermo {}` of another formulation | exit 2, "resolved to ... earlier in this run and to ... now" | exit 0: a per-unit world has its own resolution | reviewer, twice |
| PA-09 | any stream declaring T and `vaporFraction` and no P (on main too) | P = 0 reaches the units; water plus ethanol exits 0 with the pump publishing P_in 0 | a refusal naming the missing pressure | reviewer, twice |
| PB-01 | liquidDensity01 as shipped | pump "30.000000 % closure" | with a pure-fluid method on a copy: -4.6e-12 kW | mine |

PA-01 in one sentence: `.gitignore:90` is `**/solution/`, so the sealed
mirror both manifests name at their line 91 is not in the branch; the
builder's scope run passed because its tree still held the ignored file.
Two gates are blind to it: the pilot's own gate ends in a traceback
instead of a failure line, and the sealed-corpus gate passes with a
manifest naming a record that is not on disk.

PA-02 in one sentence: `DensityResolver.cpp:398` holds the resolver's
mutex across the construction of the measurement, which evaluates the
method it replaces, which notes the hypothesis' use under the same mutex
(`:438`).

## 3. The numbers

`numbers/recompute_units.txt` holds the full table.  A sample:

| case | quantity | engine | recomputed |
|---|---|---|---|
| liquidDensity01 | density at the pump / residence time | 997.047039 / 997.131976 | 997.047039 / 997.131976 |
| liquidDensity02 | density at the pump / at the reactor | 888.276943 / 888.292693 | 888.276943 / 888.292693 |
| liquidDensity03 | residence time, s | 1212.69913516 | 1212.699135 |
| rankine02 feed pump | shaft work, W | 179.885 | 179.886 |
| process03_recycle | feed density at 356.07 K | 848.877203 | 848.877203 |
| ChemicalPlantTutorial fermentor | residence time, s | 2461.91152 | 2461.91152 |
| the autocatalytic root of `check_reactor_limits` | conversion | 0.8788 | 0.878805 |

What the numbers do NOT establish: that the Rackett leaf's temperature
shape is right.  PB-04: no check in git sees it, and the largest move of
the pilot (the 350 K esterification reactors, -7.1 % in residence time)
is almost all that shape.  The accuracy scores of the second and third
demonstrations need mirror data that is not in git and were not re-run.

## 4. The rest, by kind

- **Declared and silently unused or unread** (PA-06, PA-12, PA-17): keys
  accepted in silence inside the new blocks; four records the resolver
  builds and nothing reads; a box judgement that re-evaluates the
  replaced method at states the run never visits.
- **Said and not done** (PA-07, PA-08, PA-10, PA-13, PA-15, PA-16,
  PA-18, PB-02, PB-03): no refusal prints its remedy; the remedy one
  refusal names cannot be written; a rejected trial never says why; the
  "same liquid, two numbers" line does not print; the settled contract
  and the plan describe a kernel that is not the one built; a header's
  residence time and a label's "pressure not applied" contradict the run.
- **Windows** (PA-14, PB-05): the reference equation's lower temperature
  limit is not honoured; water's extrapolated vapour-pressure fit lies
  above the reference line from about 311 K, so between the two lines the
  kernel answers a compressed liquid in silence where the package says
  vapour.
- **A gate** (PA-11): the entry-callers gate misses an unqualified call.

## 5. What was NOT reviewed (by these two reviewers)

- The accuracy scores against the measured series (data not in git).
- A recycle whose iterate overshoots a property domain; only a design
  specification was built for that.
- The time-integrated binaries (no pump or reactor of this kind there),
  the WebAssembly build, the web app.
- A full corpus run.  A build of main for a before/after comparison (the
  moved golden rows were read instead).
- The gate edits of the last commit beyond one literal.

## 6. Blast radius and gates (the third reviewer)

Rows PC-01 .. PC-16 (PC-08 is PB-01 again and has no row of its own).

**The pilot's headline claim holds.**  `--scope` over 43 cases with no
pump and no CSTR (the steady fast-set entries, batch, control, unsteady,
two plants and four props families): 48 PASS, 0 FAIL, conservation gates
included; nothing moved.  Over every case with a pump or a CSTR plus the
six demonstrations: 41 PASS, 0 FAIL, with the missing caustic record
placed by hand (without it the two caustic cases fail: PA-01).  No pin
was loosened by the last commit; one was tightened.

**Two more rows gate the batch.**  Both reproduced by the reviewing
session on a build of f08f9b061e.

| id | minimal case | observed | expected |
|---|---|---|---|
| PC-03 | liquidDensity02 run with every 3rd (or 7th) `pow` result moved by one unit in the last place (`blast/ulp_probe.py`) | exit 2, "check value NOT reproduced -- Table 7, T = 300 K, rho = 996.556 kg/m3" | exit 0, as with no result moved and with every 2nd or 5th |
| PC-02 | cstr01_first_order with `water 0.2 kmol/h;` added to `0/feed`, sealed as shipped and with the manifest removed (`blast/latent_seal_demo.sh`) | sealed 855.33 kg/m3, unsealed 856.65 kg/m3, nothing announced | one density, or a line saying the sealed case has no copy of the reference record |

PC-03 is the same kind of defect as the closure of an absent species
(review CI-00): a decision that flips on the last bit of a library
function.  The check compares a liquid's pressure at a given density to
nine printed digits; clean, it passes with a margin of 3.8e-10 relative.
Another compiler or math library can be on the other side of that margin,
and since the pilot the record is loaded by every pump and reactor whose
liquid holds water.

**A red test** (PC-04): the web app's van Heerden lesson still quotes
cstr08's steady states from before the re-record; its test fails, so the
web-app run of the branch cannot pass.

**What the gates do not hold** (PC-05, by-hand sabotages: edit, build,
run, restore, build):

| sabotage | caught? |
|---|---|
| the pump head from a density perturbed by 2e-5, the molar volume untouched | no |
| the reactor's molar volume from a density perturbed by 1e-7 | yes (the wiring arm and the rate-expression gate; the goldens at 1e-4 did not see it) |
| the reference leaf's volume perturbed by 2e-6 | no (the route bench answers NO SUBJECT on this machine) |
| the resolver ignoring reference records | yes |
| ideal mixing perturbed only for three or more constituents | no |
| the pressure-advisory threshold raised from 2 MPa to 6 or 2000 MPa | no |
| a new caller of the entry through an alias or a using-declaration | no |

The four survivors, applied together with the opposite sign, also pass
everything.

**Seals** (PC-02, PC-10, PC-14): beyond PC-02, a sealed case still reads
the installation catalogue for solution records and utilities (on main
too); with the catalogue hidden two plants refuse and two cases change
their utility allocation.  Sealed and unsealed twins agree on the twelve
cases that carry a copy of the water record.

**Not reviewed by this reviewer:** `check_gate_selftest` (read, not run);
a full sweep; `--gui` as a suite; accuracy against measurements.

## 7. Addendum (2026-11-14): how close every load-time check is to its edge

PC-03 found one check of the water record (the pressure at 300 K and
996.556 kg/m3) that a single last bit can fail.  Measured afterwards for
all four reference records, with no file modified: the verification case
`tutorials/props/thermo/refEoS01_iapws95_verification` run as it is on a
build of main, and every printed check paired with its record's own
`digits` and `printedScale` (`blast/reference_check_margins.py`, output
`blast/reference_check_margins.txt`).  The share is |computed -
published| over the half unit of the last printed digit the check
allows; 1.000 fails.

| record | checks | closest to failing | share used | margin, relative to the value |
|---|---|---|---|---|
| water (IAPWS-95) | 68 paired | p at 500 K, 1084.564 kg/m3: published 700000405, computed 700000405.495 | 0.990 | 7.1e-12 |
| water | | rhoV on saturation at 275 K | 0.992 | 7.3e-12 |
| carbon dioxide | 67 | cpV on saturation at 220 K | 0.977 | 1.2e-7 |
| nitrogen | 67 | wV on saturation at 100 K | 0.999 | 1.6e-7 |
| methane | 74 | rhoV on saturation at 150 K | 0.993 | 2.0e-7 |

What it says:

- **Water has two checks closer to the edge than the one PC-03
  reproduced**: a margin of 7e-12 relative is about thirty times
  machine precision, and a pressure at a liquid density amplifies
  round-off by roughly the ratio of rho R T to p.  Another compiler or
  math library can fail them on a correct record.
- The other three records print fewer digits (four to six), so their
  margins are in the 1e-7 range: far from round-off.  Their shares near
  1.000 (nitrogen 0.999) are a statement about the transcription and the
  rounding of the printed tables, not about the platform.
- PC-03's remedy should therefore be judged on the water record's
  nine-digit checks as a family, not on the one row.
