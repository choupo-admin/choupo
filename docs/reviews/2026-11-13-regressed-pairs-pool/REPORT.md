# Review by measurement: the thread pool of the regressed-pairs gate

Date: 2026-11-13.  Asked by the coordinator (board, R5).  Reviewed:
`bin/curate/check_regressed_pairs.py` on main as changed by f848b006d4,
on a native build of d783c6c236 (the gate, `src/` and the pair
catalogue had not moved since).  Findings: `findings.tsv` (RP-01 ..
RP-09).  Scripts: this folder (`run_gate.sh` runs the gate in one form
and keeps its log; `subset_gate.py` calls the gate's own `main()` over a
subset of records; `enumerate.py` counts shared cases).

The review was stopped before its full-gate sabotages by an order of the
owner: this session modifies no tracked file, not even temporarily.
What was already measured is reported; the rest is section 5, as
requests.

## 1. Verdict

**No finding where the pooled gate prints OK on a failing record, and no
race or nondeterminism in any run.**  The serial and the pooled form
produce the same bytes.  One real weakness, in how a failure of a SHARED
case is reported (RP-01), and one property of the gate that is older
than the pool (RP-09).

## 2. Determinism

The whole gate on the unmodified tree:

| run | workers | exit | wall, s | output |
|---|---|---|---|---|
| pooled | default (2 on this 4-processor machine) | 0 | 1256.9 (includes first downloads) | the claim line, 57 065 bytes |
| serial | 1 | 0 | 1884.9 | byte-identical to the pooled run (`cmp`) |

Both: 859 records reproduced, 790 held to one liquid, 95 vapour
pressures, the same tallies.  Neither left a temporary directory;
`git status` stayed empty.

Repetitions, on a subset run through the gate's own code (28 catalogue
records, the two records that share a case, 6 vapour-pressure records;
`subset_summary.txt`):

| series | runs | output | wall, s |
|---|---|---|---|
| 1 worker | 3 | one md5 | 68.8 / 70.3 / 70.3 |
| default | 3 | the same | 36.4 / 38.2 / 37.0 |
| 16 workers | 3 | the same | 31.0 / 30.3 / 30.3 |
| default, machine loaded | 2 | the same | 36.3 / 36.8 |
| 16 workers, machine loaded | 2 | the same | 33.0 / 33.5 |

Thirteen outputs byte-identical before any sorting: the order of the
per-record lines is stable in the pooled form.

## 3. The shared state

Read end to end (the table is in the reviewer's hand-back; in short):

- The two caches (fetched cases, runs) are guarded per key, the lock
  held across the whole fetch or run.  No lock is taken while another is
  held, so no deadlock.
- The tallies are updated under one lock or on the main thread only.
- No `chdir` anywhere on the gate's path; children get their directory.
- Helper modules are imported on the main thread before each pool.
- Workers print nothing on the normal path; the claim line is printed
  once, at the end.
- ONE case is named by two records (adjacent in the list); they share
  one fetch and one run.
- NOT guarded, safe today by a count and not by construction: the
  per-case directory of the vapour-pressure arm (95 records, 0 shared
  cases), and an in-process fetch on one path (RP-05; 80 records, none
  of their cases shared).

## 4. Failures already measured (on the subset)

Three edits applied together, three runs each with 1, default and 16
workers: all nine exit 1 with one md5, and against the clean output
exactly these lines are added, each under its own record's name, and no
other line moves:

- a pair record's `b_ij` moved in its seventh digit: "the record has
  drifted from its evidence";
- the two records sharing one case, each with its own altered `aad_pct`:
  two lines, one per record;
- a component's Antoine coefficient: five lines of the vapour-pressure
  arm.

A failure planted in the shared case itself (so that its run raises),
five runs each with 1, default and 16 workers: all fifteen end in a
traceback naming the real cause, exit 1, no claim line.

## 5. Requests: what was not run

Each on a clean tree, the gate run three times with
`CHOUPO_GATE_JOBS=1` and three times with it unset, the file restored
after.  Both forms must exit 1, print `check_regressed_pairs: FAILED`,
and add exactly the lines named to the clean output.

1. `data/standards/parameters/NRTL/1122Tetrachloroethane-1Hexanol.dat`:
   `b_ij -359.16528436` to `-359.26528436`.  One line under that record:
   "`b_ij` = -359.26528436 in the record, -359.16528436 from its case".
2. `data/standards/components/1122Tetrachloroethane.dat`: the first
   Antoine coefficient `4.239650499` to `4.249650499`.  Five lines of
   arm (i) under that component.
3. The two records that share a case
   (`curate12_nrtl_ethanol_cyclohexane` and
   `vlle04_two_liquids_decanter`, each
   `constant/parameters/NRTL/cyclohexane-ethanol.dat`): `aad_pct
   0.093962` to `0.093999` in one and `0.094111` in the other.  Two
   lines, each under its own record.
4. Arm (f): one catalogue record's validity span widened into a range
   where it splits the liquid.  The split line under that record, in
   both forms.  Choosing the record needs a scan.
5. Two more full pooled runs, one with 16 workers, two more serial:
   byte-identical to the first.
6. For RP-09: remove the `fittedInCase` line of one catalogue pair
   record.  Expected by reading: the gate still prints OK, with 858
   where it printed 859.

## 6. What was NOT reviewed

- Per-case durations against the gate's 900 s limit, now that every
  child runs on one thread.
- A real timeout or a signal in a child.
- The later change that lets the gate answer REUSED when its inputs have
  not moved.
