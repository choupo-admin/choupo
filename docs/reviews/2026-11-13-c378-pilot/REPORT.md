# Review by measurement: the liquid-density pilot (`c378-pilot`)

Date: 2026-11-13.  Reviewed: `c378-pilot` at its final head f08f9b061e,
before it landed, on native builds of that commit.  Three reviewers, one
angle each; two have handed back and are reported here, the third (blast
radius and gates) is section 6, still to come.  Findings:
`findings.tsv` (PA-01 .. PA-19 the contract and the code, PB-01 .. PB-09
the numbers).  Scripts: `contract/` and `numbers/`; each takes
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

## 6. Blast radius and gates

To come: the third reviewer is still measuring.
