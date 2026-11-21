# flash23_gas_only_oh_quench — a radical never condenses

A hot combustion gas — 80 kmol/h N₂, 19.9 kmol/h water and 0.1 kmol/h of the
hydroxyl radical OH — goes through two isothermal flashes at 1 bar: **1500 K**
(above every dew point: one vapour, V/F = 1<!--golden: kpi hot V_over_F-->) and
**330 K** (water condenses: V/F = 0.967<!--golden: kpi cold V_over_F-->).

## The lesson

1. **OH is not a component.**  A radical exists only inside a gas-phase
   mechanism, so it lives in the gas-species table
   (`data/standards/thermoTables/NASA-TP-2002-211556/OH.dat`) and the case
   asks for it by name: `speciesTables ( NASA-TP-2002-211556 );` in
   `constant/thermoPhysPropDict`.  N₂ and water are components.
2. **Gas-only means a non-condensable.**  The table record says
   `role radical;`.  In every phase split its K is the cap
   `ThermoPackage::kNoLiquidK = 1e12` (the **Log** prints
   `OH  gas-only (non-condensable)  K = 1e12`), so Rachford-Rice keeps all of
   it in the vapour: the offgas carries the whole 0.1 kmol/h and the
   condensate at most 1e-12 of it (here 1e-15).
3. **A state with no vapour is refused.**  The same feed handed to a bubble
   point — the liquid that would hold the whole feed — is refused by name:
   *gas-only species 'OH' ... present in a saturated liquid ..., which has no
   vapour phase to hold it*.  The gate `bin/curate/check_gas_only.py` runs
   that probe.
4. **Until 2026-11-21 the same flash put every OH molecule into the water**
   (2.6 mol % of the condensate): a radical was `role nonvolatile;`, K = 0.

## What it is not

The composition is FROZEN: no reaction runs.  In a real quench OH recombines
in microseconds; that is chemistry, a mechanism's job
(`tutorials/batch/combustion`).  This case asks only where a gas-only species
goes in a phase split.

## Provenance

OH: NASA/TP-2002-211556 (McBride, Zehe & Gordon 2002, public domain), entry
OH, transcribed by `bin/curate/nasa_tp2002_to_choupo.py`.  Water and N₂: the
catalogue's records.  DEV.md 4c C458.
