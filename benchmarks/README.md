# Benchmarks

Hard cases from other simulators' **published sample libraries**, reproduced
as Choupo cases and compared against the numbers each simulator publishes.
Ruled 2026-10-20 (DEV.md 4c C123): this tree is the one place in the
repository where another simulator may be NAMED, because a benchmark that
does not say what it is compared with has lost half its value.  It is
**developer-facing**: nothing here is shipped to the site, bundled by the GUI
or `\input` by a manual, and `check_doctrine` holds that (its arm (t)).

## Rules

1. **No file of theirs is copied here.**  Each case is written from the
   problem as published (feeds, units, specifications) in Choupo's own case
   format.  A sample file may carry property parameters from databanks this
   project excludes (a pair table is not freed by its courier's licence --
   DEV.md 4c C16), so every property number in a benchmark case comes from
   Choupo's own catalogue or from a primary source, cited per value.
2. **The reference numbers are cited**: the simulator, its version, the
   sample's name and where it was read, and which numbers were taken.  They
   are facts to compare against, never inputs.
3. **A difference is a finding, not a failure to hide.**  Each case states
   what agrees, what does not and why (a different thermodynamic model, a
   different parameter set, a different specification the problem leaves
   open), measured rather than argued.
4. A benchmark is a Choupo case like any other (`system/`, `constant/`, `0/`)
   plus `reference` (the published numbers, cited) and a README.

## Layout

```
benchmarks/<simulator>/<case>/              one reproduced sample
benchmarks/<simulator>/<case>/variants/<v>/  only the files a variant changes
benchmarks/<simulator>/read_sample.py       reads the FACTS out of a sample file you hold
benchmarks/<simulator>/compare.py           runs the cases, prints them beside `reference`
benchmarks/requests/                        articles to obtain before a case can be built
```

`compare.py` runs every case in a scratch copy (a temporary directory, so
the tree is never written) and needs a native build of this tree
(`make all`).  `read_sample.py` reads a sample file from wherever your own
copy lives -- the file is never copied here (rule 1).

## Not in the regression suite, and no gate holds the comparison

`bin/runTests` walks `tutorials/`, not this tree, so a benchmark is never a
PASS or a FAIL of the suite.  **Stated default (2026-10-20, C123): no gate
holds a benchmark's numbers either.**  A benchmark compares Choupo with
another program's stored state, which may not close (case B's does not), and
the first two cases expose engine defects (case C produces no answer at all
today): a gate pinning those numbers would pin the defects.  What is worth
gating, once case C converges, is that every case here runs to exit 0
without NaN and that a case-local copy of a catalogue record is still a byte
copy (`compare.py` already refuses that one).  Vitor can reverse this.

## Cases

| case | sample | status |
|---|---|---|
| `dwsim/distillation01_methanol_acetone_pressure_swing` | "Extractive Distillation" (no entrainer: pressure-swing, 1 + 6 atm) | runs; compared; findings on both sides |
| `dwsim/extraction01_water_acetone_mibk` | "Liquid-Liquid Extraction" (water/acetone/MIBK, 4 stages) | BLOCKED: Choupo's LL flash misses the splits it needs |

Each case's README carries its comparison table, what agrees, what does not
and why, and the findings on each side.  The next three (Cavett as that
simulator ships it, methanol from CO2, a steam-reforming PFR) wait on the
articles listed in `requests/pr-kij-articles.md` (DEV.md 4c C123).
