# esterification2sector — props-foundation test vehicle

A two-sector fractal plant (REACTION + SEPARATION) used to develop the unified
property/thermo-foundation architecture (see the memory memo
`props_unified_architecture_2026_05_31`).  Demonstrates the FRACTAL constant/:
particular data per sector, shared components, partial standard-library reuse.

> **This case is in the CURATION phase — it does not simulate yet.** Neither the
> top-level plant nor the `REACTION` / `SEPARATION` sectors carry `connections`,
> so running any of them prints *"nothing to simulate — curation phase"* and
> exits cleanly. That is by design: you curate the per-sector thermo/kinetics
> first (with `choupoProps`), then WIRE the flowsheet to simulate. The
> `system/flowsheetDict` of each sector shows the commented-out boundary +
> connections to uncomment once curation is done. (For a fully-wired, runnable
> multi-sector example, see `tutorials/plant/ChemicalPlantTutorial`; for runnable
> single sectors with custom unit ops, see `tutorials/plant/twoSectorDemo/SECTOR_R`
> and `.../SECTOR_S`.)

## Status (first slice)
- ✅ Two-sector fractal flowsheet (Feed → REACTION cstr → SEPARATION flash → boundary).
- ✅ **Per-sector kinetics resolve**: the esterification kinetics live in
  `REACTION/constant/reactions` (NOT duplicated to the root) — the first slice
  of the per-node constant/ resolution (engine Item 0).
- ⏳ **Per-sector binary pairs**: `SEPARATION/constant/binaryPairs/NRTL/
  ethylAcetate-water.dat` is the INTENDED particular datum, but per-node pair
  resolution is not wired yet, so the global thermo runs `ideal` for now (the
  next slice wires per-node pairs + flips this to NRTL).
- ⏳ GUI foundation navigator + pair-coverage matrix + fit view: later slices.

ethanol-water would be INHERITED from the standard library; ethylAcetate-water
is PARTICULAR to SEPARATION (to be fitted + promoted).
