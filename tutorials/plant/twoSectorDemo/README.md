# twoSectorDemo — a self-contained, distributable Choupo case

A TWO-SECTOR plant that carries **everything it needs inside the folder** —
nothing from outside except the Choupo engine. Zip it, send it to a
collaborator, they unzip + build + run.

> **Run the SECTORS, not the umbrella.** The top-level
> `tutorials/plant/twoSectorDemo` has no `connections` (the sectors are not
> wired into one plant), so running it prints *"nothing to simulate — curation
> phase"* and exits cleanly. The runnable cases are the two sub-sectors,
> **`SECTOR_R`** and **`SECTOR_S`**, each of which builds its own custom unit op
> and converges on its own (see *Build + run* below).

## What's inside (all case-local)
- **10 components** — `constant/components/compA..compJ.dat` (synthetic).
- **10 NRTL binary pairs** — `constant/parameters/NRTL/*.dat`.
- **5 reactions** — `constant/reactions`.
- **2 custom unit operations, compiled from source in the case:**
  - `SECTOR_R/code/StoichReactor` — a specified-conversion reactor.
  - `SECTOR_S/code/SharpSplitColumn` — a sharp-split distillation (2 outlets).
- Shared thermo (`constant/thermoPackage`) cascades DOWN to both sectors.

## Build + run (each sector runs on its own)
```
bin/buildCode tutorials/plant/twoSectorDemo/SECTOR_R   # compiles StoichReactor
runCase       tutorials/plant/twoSectorDemo/SECTOR_R
bin/buildCode tutorials/plant/twoSectorDemo/SECTOR_S   # compiles SharpSplitColumn
runCase       tutorials/plant/twoSectorDemo/SECTOR_S
```
`buildCode` links the sector's `code/` against the Choupo library into a
per-case binary — the FLOWTRAN model: standard library + your own blocks,
linked at build time. Glass-box: the g++ command is printed, no runtime magic.

## Distribute
Zip the folder (the compiled `code/.build/` and any logs are NOT needed — the
collaborator rebuilds with `buildCode`):
```
zip -r twoSectorDemo.zip tutorials/plant/twoSectorDemo \
    -x '*/code/.build/*' '*/log.*' '*/reports/*'
```

## Honest notes
- The chemistry is **synthetic** (a structure demo, not a validated process).
- `compA/compB/compC` happen to share names with the standard VLLE-audit
  components, so the engine prints a `[overlay]` notice when this case shadows
  them — that is the no-silent-crutch honesty working, not an error.
- The custom ops are **black-box** (algebraic), so they run regardless of the
  thermo; the 10 pairs are curated data for the props bench / activity-using
  ops, not evaluated by these two ops.
