# Does the solver grow organically? An outside review of the C427/C430/C431 architecture

Read on main at 3b12a4a321, 2026-11-19, read-only (nothing built, nothing
edited).  Two independent readings, each with its own file:line evidence:
[door.md](door.md) (the liquid-property door) and [units.md](units.md)
(carried quantities and what a new unit costs).

The question was NOT total lines -- src/ code lines grew 171 188 -> 192 873
in the week, which new capabilities explain.  The question was whether a new
capability enters through ONE place.

## Verdict

**Organic where it was designed to be:**
- A new property MODEL is one place (`LiquidViscosityModel.cpp:80-105`,
  `DensityMethod.cpp:64-85`).
- The units' liquid-property bypasses went from 82 to 0.  The 13 left are
  pinned bench reads in `propertyOps/`, and the gate's list matches reality.
- Carried kinds are an explicit factory (`Carried.cpp:490-498`).  Mixer and
  splitter call the kind's laws and know no kind.
- The door migration deleted real duplicates (+469/-423 in src/).

**Still spreading:**
1. **Two density doors.** `evaluate(Property::density)` goes to
   `ThermoPackage::density` (ideal mixing of record volumes), while
   `density(Request)` goes to the resolver (measured densities, solution
   laws).  In swro01 the pumps use `solutionLaw.NaCl-water` and five
   tanks/filters on the same water price 98.9 % of the mass
   (`densityPricedFraction 0.988868`).
2. **Liquid heat capacity is outside the door and every gate.**  It is read
   at 18 sites in 11 files.  `SprayDryer.cpp:540,546` and
   `EvaporativeDryer.cpp:150` fall back to a 75.4 water constant, and there
   are four different missing-datum policies.
3. **Type-name tables outside factories** (about 34 comparisons, 6 static
   sets).
   - **Confirmed defect:** the agitated vessel publishes `W_shaft` like a
     pump (`AgitatedVessel.cpp:258`), but `UtilityAllocationReport.cpp:490`
     bills electricity only to `pump`/`compressor` by name.  The agitator's
     power is never charged.
   - **Stale list:** `EconomicsPass.cpp:3250`'s particulate list omits seven
     units that `acceptance()` already declares as carrying a size
     distribution.
4. **The size distribution has two homes.**  It lives in `ProcessStream::psd`
   and in the carried list.  Seven units parse the `solids {}` block
   themselves, and `Carried.cpp:602` tests the kind by name.
5. **Lesson citations by file:line freeze the layout.**
   - `ThermoPackageRheology.cpp` exists to keep line numbers.
   - Code is crammed onto existing lines (`ThermoPackage.cpp:2275`).
   - a0cffcf534 moved 330 lines of `Pipe.cpp` so the citations hold.
   - The agitator and pipe slice touched 23 files: 9 of its own, 1
     registration, 13 elsewhere.

## Cheapest fixes, in order of reach

1. **One density door.**  Route `evaluate(density)` through the resolver
   and fold `pricedDensity` into it.  swro01 rows move, so the list goes to
   Vitor first.
2. **Replace type tables with what units declare.**
   - Bill electricity on the `W_shaft` energy item, not on the type name.
   - Derive the particulate list from `acceptance()`.
   - Make property sources a unit virtual.
3. **Liquid Cp as a door property**, with one missing-datum policy.  The
   ratchet catches direct `cpLiquid().Cp(` and the 75.4 literal.
4. **Finish the size distribution:** one reader in `Carried.cpp`, the whole
   attribute map serialised.
5. **Anchor lesson citations to marker comments**, not line numbers.  This
   is pedagogical scope and Vitor's call.
