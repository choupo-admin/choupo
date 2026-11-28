# flashSpec03_vapour_fraction_edges: the edges of the (P,VF) and (T,VF) search

`choupoProps` on IAPWS-IF97 water, asking the vapour-fraction flash for states
at the floor and the top of the package's temperature domain.  The package
declares that domain (`PureFluidModel::temperatureDomain`, IF97 water
273.15 to 1073.15 K) and the search window is cut to it: a trial state is
never priced where the package refuses, and the finite difference turns
one-sided near a bound, as in (P,H) and (P,S) (`flashSpec02_window_edges`).

## The lesson

1. A pure stream is answered on its saturation curve, 0.01 K above the floor.
2. A mixture's search root 2e-5 K above the floor needs the one-sided
   difference; a held T outside the domain is refused by name, with the
   domain, instead of "the band is not crossed".

## What to try

Set `T 250 K` in `mixFloorTVF`: the run is refused naming the domain.
