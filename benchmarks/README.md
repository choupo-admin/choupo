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
benchmarks/<simulator>/<case>/    one reproduced sample
```

Status: the folder exists; the first cases are being chosen (DEV.md 4c C123).
