# cracking01_ethane_sundaram_froment

Steam cracking of ethane with the molecular scheme of Sundaram & Froment
(1977), against the pilot-plant product distribution of Froment, Van de Steene
& Van Damme (1976).  Backlog C456 slice 1.

## What it reproduces

* Model: Sundaram & Froment, Chem. Eng. Sci. 32 (1977) 601, Model III of
  ethane cracking: Table 1 (the five reactions and their rate equations, p. 603),
  Table 3 (A and E, p. 604), the K_C1 and K_C5 values under Table 1 (p. 603).
  Froment et al., Ind. Eng. Chem. Process Des. Dev. 15 (1976) 495, Table XII
  repeats the same five reactions (E_1 is 65 210 there, 65 20 in Table 3: the
  Table 3 value is used; the difference is 0.01 kcal/mol).
* Witness: Froment et al. 1976, Table VIII, "Pilot plant" column: ethane
  cracked at P_t = 1.55 atm abs, steam dilution 0.4 kg/kg, reference
  temperature T_R = 840 C, conversion 59.1 %: yields (wt %) H2 3.71, CH4 2.99,
  C2H4 48.7, C2H6 39.0, C3H6 1.05, C4H6 0.99.

## How the pilot is represented (and what is NOT represented)

The authors reduced the pilot data "to isothermality by the equivalent reactor
volume concept" at a reference temperature.  This case is that isothermal
reactor: T = T_R = 840 C, constant P = 1.55 atm (the outlet pressure Table VIII
lists; the real coil's pressure profile is not reproduced), pure ethane plus
steam (the pilot feed was 98.6-99.9 wt % ethane; the 0.1-1.4 % ethylene
impurity is neglected).  The volume is the one thing NOT published for Table
VIII (the equivalent volume of that run), so it is chosen so the engine's
conversion equals the published 59.1 %, and the comparison is of the PRODUCT
DISTRIBUTION AT EQUAL CONVERSION, which is how the paper plots it (Figures 4-10:
yield against conversion, "the influence of temperature is negligible").  The
scheme's own conversion-versus-volume prediction is therefore not tested here.

**The `pfr` re-prices its volumetric flow along the bed** (`F_i/Q`, Q = F_t v(T,P,z) at
each RK4 stage from the equation of state, C461), and this cracking makes 40 % more moles
(6.0 to 8.4 kmol/h).  The case is ONE `pfr`.  Until C461 the pfr held Q at the feed value,
so a single pfr ran about 15 % too fast and overshot every secondary yield, and the case was
twenty `pfr` segments in series as a workaround (volume 14.896 L).  The exact integration
needs 15.004 L for the published 59.1 % conversion.  A declared temperature and pressure
profile, which the industrial coil of Froment et al. needs, is still not built.

The paper's reversible steps (1) and (5) use K_C printed at 775, 800 and 825 C
only; the reverse legs are `k_forward / K_C` with K_C from a van't Hoff fit of
the three printed values (residual < 2e-4 in ln K; the fitted reaction enthalpy,
134.9 kJ/mol for ethane dehydrogenation, agrees with the thermochemical value).
It is used at 840 C, 15 K outside the printed range.

## The band, DECLARED BEFORE THE FIRST RUN

Relative deviation of the engine's outlet yield (wt % of the hydrocarbon fed,
steam excluded) from Table VIII's pilot value, at conversion 59.1 %:

| species | published | band | engine | deviation | verdict |
|---|---|---|---|---|---|
| C2H4 | 48.7 | 3 % | 49.69 | +2.0 % | inside |
| H2   | 3.71 | 6 % | 3.77  | +1.6 % | inside |
| C2H6 | 39.0 | 3 % | 40.90 | +4.9 % | not comparable: see below |
| CH4  | 2.99 | 15 % | 2.12 | -29 % | OUTSIDE |
| C3H6 | 1.05 | 35 % | 0.43 | -59 % | OUTSIDE |
| C4H6 | 0.99 | 35 % | 1.91 | +93 % | OUTSIDE |

Ethane: the table's own conversion (59.1 %) implies 40.9 wt % unconverted
ethane; it prints 39.0 (and the industrial column 39.27 at 59.87 %, against
40.13).  A conversion defined on something other than the ethane fed (a feed
impurity, the recycle) would explain it; the paper does not say.  The case is
sized to the conversion, so it matches 59.1 % and not 39.0.

## What could not be reproduced, and what was checked before saying so

The scheme as printed, integrated by an independent Python code with the exact
gas expansion (not the engine), gives the same three misses: CH4 2.11, C3H6 0.43,
C4H6 1.90 wt % at 59.1 %.  So the engine implements the scheme faithfully and the
misses are the scheme's at this isothermal reduction: all three come from the
chain C2H4 + C2H6 -> C3H6 + CH4, C3H6 -> C2H2 + CH4, C2H2 + C2H4 -> C4H6, whose
methane cannot reach the table's 3 wt % without producing far more butadiene
(a mass count: CH4 yield implies 0.21 mol per 100 g, the chain gives at most
about 0.14 mol at the published butadiene).  Every constant was read back at its
page: k_1..k_8 reproduce the paper's own Table 2 values at 800 C (k1 2.4160,
k5 29.8083, k6 4.0638e3 against 2.44, 29.8, 3.9e3 from Table 3; k8 30.7 against
34.9, the Arrhenius fit), and the K_C5 enthalpy agrees with the thermochemical
value (about 125 kJ/mol).  The paper's industrial coil (95 m, 0.108 m i.d.,
680 to 835 C, 2.99 to 1.9 atm, its simulation 48.00 / 3.75 / 3.45 wt % C2H4 / H2 /
CH4 against the plant's 48.68 / 3.71 / 3.35) was also integrated by that
independent code with its four printed temperatures interpolated: 47.5-48.0 /
3.76-3.81 / 3.85-3.98 wt % and 5.6 wt % butadiene against the plant's 1.12, so
the discrepancy in the butadiene branch is not an artefact of the isothermal
reduction.  The industrial coil is not a case here: the `pfr` has no declared
temperature or pressure profile.

## Hand check

k_1(1113.15 K) = 4.652e13 exp(-65 200 / (1.987 x 1113.15)) = 7.34 s^-1 (the
`k_eth_dehydro` KPI prints 7.36 with R = 8.3145/4184).  With Q_in = 98.3 L/s
the residence time of 14.9 L is 0.15 s at the inlet flow, k_1 tau = 1.1: a
first-order conversion of 67 % before the reverse reaction and the expansion
take it to 59 %.

## Gate

`bin/curate/check_cracking_yields.py` holds (A) the engine against an
independent integration of the same scheme, typed from the paper in the gate,
(B) the two yields inside their declared band, the three misses pinned at their
measured distance, and (C) a sabotage (k6 x 1000, a litre read as a cubic
metre).
