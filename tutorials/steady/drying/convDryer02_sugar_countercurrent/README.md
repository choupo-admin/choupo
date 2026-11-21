# convDryer02_sugar_countercurrent -- counter-current convective dryer

The counter-current arrangement alone, on the same half-feed and air as
`convDryer01_sugar_curve` and `convDryer03_sugar_crossflow` (see the latter's
README for the three side by side).  Model: Mujumdar 2006 s.3.6.2.2, Eq.
3.12-3.21 with the counter-current sign; two-point problem solved by shooting.
Theory Guide `sec:dryer-flow-arrangements`.

## Hand check (before the run)

Overall water balance: S (X_in - X_out) = G (Y_out - Y_in) with S = 0.4754
kg/s, G = 3.153 kg/s, Y_in = 0.0127.  The driest solid meets the freshest air,
so X_out approaches the equilibrium moisture of the inlet air (0.0012 kg/kg);
the book says counter-current "permits a very low final moisture content" (van
't Land p. 42).  Band: X_out between 0.0012 and 0.010; Y_out = Y_in + S (0.2 -
X_out)/G, i.e. 0.041-0.043.

## Result

X_out = 0.00474 (equal to convDryer01's counter-current unit on the same data),
Y_out = 0.04214, air out 353.3 K, solid out 315.7 K.  Gate
`check_dryer_arrangements` re-derives the profile's rate law and water balance
outside the unit.
