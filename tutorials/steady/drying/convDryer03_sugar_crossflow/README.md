# convDryer03_sugar_crossflow -- cross-flow convective dryer

The third arrangement beside `convDryer01_sugar_curve` (co-current) and
`convDryer02_sugar_countercurrent`, on the SAME half-feed and air: 1711.5 kg/h
dry sucrose at X = 0.20 kg/kg and 330 K; 400 kmol/h of air at 420 K, 2 mol %
water; A = 300 m2, k_Y = 0.05 kg/(m2 s), X_c = 0.12, f = Phi^1.5 (all
hypothetical teaching values).

Model: Mujumdar, *Handbook of Industrial Drying* 3rd ed. (2006), s.3.6.2.3.1,
Eq. 3.66-3.78, Fig. 3.8 (printed pp. 65-66). Theory Guide
`sec:dryer-flow-arrangements`.

## Hand check (before the run)

At the inlet X = 0.20 > X_c, so f = 1.  Dry air G = 3.153 kg/s, S = 0.4754
kg/s.  Wet bulb of 420 K air with Y = 0.0127 (Lewis = 1, constant cp): about
316 K, Y* = Y_sat(316 K) about 0.057.  NTU = k_Y A / G = 15/3.153 = 4.76, so
the log-mean form (Eq. 3.73) gives Y_2 - Y_1 = (Y* - Y_1)(1 - e^-4.76) =
0.0444 x 0.9914, i.e. each element's air leaves almost saturated, and
dX/dxi = -G (Y_2 - Y_1)/S = -0.295 kg/kg per unit length.  Hence X_c = 0.12 is
reached at xi = 0.08/0.295 = 0.27 and the constant-rate stretch is the first
27 % of the length.

## Bands (declared before the run)

* X(xi = 0.01) = 0.197 +/- 0.001; X_c crossed at 0.27 +/- 0.01.
* Outlet moisture between the counter-current (0.0047) and co-current (0.0236)
  values -- stated as the result of the equations, not a book claim.
* Exhaust Y from the water balance exactly; exhaust T within 2 K of a
  constant-cp balance.
* The first law closes to 1e-3 kW; X_out equals an independent RK4 of Eq.
  3.66-3.73 to 2e-3 (gate `check_dryer_arrangements`).

## Result

| | co-current | counter-current | cross-flow |
|---|---|---|---|
| X out [kg/kg] | 0.02359 | 0.00474 | 0.00902 |
| Y out [kg/kg dry] | 0.03930 | 0.04214 | 0.04149 |
| T air out [K] | 359.7 | 353.3 | 354.7 |
| T solid out [K] | 316.1 | 315.7 | 315.7 |
| X_c crossed at | 6.4 % | 12.4 % | 27.2 % |

Profiles X(xi), Y(xi), T(xi): in the cross-flow case Y and T are the state of
the air LEAVING the element at xi (Mujumdar Fig. 3.9), not one air stream
flowing along the length.

## Not modelled (refused by name)

Air recirculation; axial dispersion of the solid (Eq. 3.79-3.84); a
two-dimensional bed (s.3.6.2.3.2); a non-uniform air distribution; too little
air for the drying (an element that cannot supply the heat or would
saturate).  The solid's falling-rate warm-up is not modelled in any arrangement.
