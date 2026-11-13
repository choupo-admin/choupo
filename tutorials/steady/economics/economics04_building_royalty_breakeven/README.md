# economics04_building_royalty_breakeven

The four economic extensions of the plant-design (PIF) reports, in one small
plant: a building cost from the GMP rooms' areas, the two break-evens, a
royalty inside a declared patent window, and the working capital by three
methods.

The plant is `sprayDryer07_design` (one sized spray dryer, 100 kg/h of a
40 wt% sugar liquor) standing in the 17-room, two-floor oral-solid-dose block
of `system/layoutDict`.  The dryer is costed and the `economics {}` block of
`system/postDict` declares, each opt-in and each with its own source and
reason:

* `buildings` -- area = the sum of every declared room's floor area (a lower
  bound: walls and corridors not listed as rooms are not counted); grade D
  rooms are priced apart from the rest.  The building is an installed
  facility: 1.18 x C_BM enters the FCI, nothing enters the site-factor base,
  and it is depreciated with the plant.
* `breakEven` -- the operating break-even x = F / (R - V) with the fixed and
  variable costs it used printed, and the NPV break-even (the production
  fraction at which NPV = 0, found by pricing the same appraisal again).
  They differ, and the run says why.
  `price ( powder )` adds a third answer: the powder's minimum selling price
  (NPV = 0 with every other price held; 15.44 EUR/kg against the declared 20).
* `royalty` -- 3 % of sales for operating years 1-6 of the 10; nothing after
  the patent window.  A royalty with no declared window is refused.
* `workingCapitalMethods` -- 10 % of sales and 20 % of the fixed capital beside
  the 15 % of FCI the appraisal uses; the spread is printed.

Every price, rate and fraction is an author-set teaching round number, not a
datum.  `bin/curate/check_economic_extensions.py` recomputes each published
number from the case's declarations.
