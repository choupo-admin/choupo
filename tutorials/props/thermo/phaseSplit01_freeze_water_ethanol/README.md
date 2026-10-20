# phaseSplit01_freeze_water_ethanol — the phase split of one liquor, cooled from 0 to −20 °C

```
runCase tutorials/props/thermo/phaseSplit01_freeze_water_ethanol
```

**What this witnesses (DEV.md 4c C118 stage 1, 2026-10-20):** the
`phaseSplitScan` props operation.  At a FIXED overall composition (90/10
water/ethanol, moles) it sweeps temperature at fixed pressure and, at every
grid point, solves the full phase split through the ONE flash home —
`IsothermalFlash::solveCore`, the `isothermalFlash` unit's own solver, with
the options the unit's own reader parses — under the case's own sealed
records.  The `constant/` tree is flash21's, copied verbatim: the same
water, the same ethanol, the same curated NRTL pair, the same C3
`phases ( liquor liquid; ice solid crystallizing )` declaration.  Nothing is
re-derived, which is why the point at 258.15 K **is** flash21's answer
(`check_phase_split_scan` arm (a) holds it to flash21's golden; its arms also
hold single points on copies of flash16 and flash19 to those units' pH and
V/F).

**What a student watches.**  One isothermal flash per kelvin, 273.15 → 253.15 K:

| T [K] | ice (mol/mol feed) | liquor | x_ethanol in the liquor | γ_w·x_w | exp(−ΔG_fus/RT) |
|---|---|---|---|---|---|
| 273.15 | 0 | 1.000 | 0.100 | 0.9169 | 0.9999 |
| 265.15 | 0 | 1.000 | 0.100 | 0.9162 | 0.9232 |
| 264.15 | 0.0320 | 0.968 | 0.1033 | 0.913721 | 0.913721 |
| 258.15 | 0.4760 | 0.524 | 0.1908 | 0.857434 | 0.857434 |
| 253.15 | 0.6321 | 0.368 | 0.2718 | 0.811317 | 0.811317 |

Above the liquor's freezing point the feed is one liquid and the declared
crystal stays subsaturated: the water activity γ_w·x_w (0.917) lies BELOW
the saturation value exp(−ΔG_fus/RT) the crystal would need (1 at the triple
point, falling as T falls).  Between 265.15 and 264.15 K the two cross and
**ice APPEARS** — announced by the run between the two grid values it lies
between, recorded as an `appeared` event in the result block, pinned as
`diag first_ice`.  From there down the liquor concentrates exactly along the
freezing-point-depression identity

    γ_w · x_w  =  exp(−ΔH_fus (1 − T/T_t) / (R T)),   ΔH_fus = 6008 J/mol, T_t = 273.16 K

with every quantity from `water.dat`'s own data — published at every point
as `a_water` beside `aEq_water`, equal to 1e-10 wherever ice is present, and
recomputed independently by the gate from the record.  By −20 °C 63 % of the
feed is ice and the liquor is 27 mol% ethanol.

**What is published.**  `freeze.csv` (T first, then `solved`, `nPhases`, the
amount of each phase — `L1`, `ice` — their compositions, the flash's own
`a_water` / `aEq_water` / `solidFraction`) and the top-level result block
`phaseSplitScans` (points, the event, the record-level announcements at the
first point that raised each, what is not modelled).  Every number in the
block is a CSV cell or a diagnostic, so the `csv` and `diag` golden kinds pin
all of it: the golden carries the diagnostics and ten authored CSV cells
(rows 9, 15, 20).

**Honest gaps, stated (the run says them too):**
* No nucleation, no supercooling — every point is the equilibrium ceiling.
* No ethanol solid and no eutectic: no record declares one, so in this model
  the liquor never solidifies completely.  A solid exists here only where a
  record declares it — a crystal needs the component's `Hfus` and triple
  point (`sucrose.dat` has NO `Hfus`: it decomposes before melting, so an
  excipient like it cannot crystallise until it carries a solubility solid
  like halite's `solidPhases {}`), a precipitate needs a `chemistryDict`
  solid its component owns.
* Ice is pure (no solute inclusion); ΔG_fus omits the liquid/solid
  heat-capacity term (announced, |T − T_t| up to 20 K here).
* Both Antoine fits are extrapolated below 273 K (announced at 272.15 K, the
  first point below their window; the extrapolation CANCELS in the SLE
  identity, both phases sharing one Psat); the NRTL pair is used below its
  298–373 K span (announced at the first point).
* No number here is anchored to a measured freezing point — a STRUCTURAL
  witness, like flash21.  A published-curve anchor is a separate act.
