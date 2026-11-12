# NaOH-water to 80 wt %: the Olsson-Jernqvist-Aly correlations as an electrolyte model

DEV.md 4c C377 (b), 2026-11-12.  The record is
`data/standards/parameters/OlssonNaOH/NaOH-water.dat`; the equations are
`src/thermo/electrolyte/OlssonNaOH.{H,cpp}`; the routing (handover to
Pitzer, Gibbs-Duhem gamma, the joined L_phi, the announcements) is
`src/thermo/activityCoefficient/ElectrolyteActivity.cpp`; the theory is
Theory Guide `sec:olsson-naoh`.

## 1. The source and how it was read

J. Olsson, A. Jernqvist and G. Aly, *Thermophysical Properties of Aqueous
NaOH-H2O Solutions at High Concentrations*, Int. J. Thermophys. 18(3)
(1997) 779-793 (15 pages), local copy
`~/Choupo-Literature/Articles/Electrolytes/olsson1997-naoh-water-thermophysical-properties-high-concentrations.pdf`.

The PDF is a scan with a poor text layer (Table II's `l_P1` reads `/el`,
Table IV's `k_rho1` reads `-2513[.[64248`).  Every equation and every
coefficient was read from the PAGE IMAGES:

* whole pages at 150 dpi (`pdftoppm -r 150 -png`, files `p-01.png` ...
  `p-15.png`), read once;
* each coefficient table again at 300 dpi, cropped to the table
  (`h5-05.png` Table II, `h7-07.png` Table IV, `h9-09.png` Table VI and
  Eqs. 12-16, `h12-12.png` Eqs. 17-21 and Table IX);
* the two readings compared digit by digit: they agree everywhere; the
  text layer, read third, agrees wherever it is legible.

The images are not committed (they are a copy of the article).

Variables as the paper defines them (nomenclature pp. 792-793): `x` is the
mass fraction of WATER [kg water/kg solution]; `t` [degC]; `P` [kPa];
`H` [kJ/kg solution]; `rho` [kg/m3]; `mu` [cP].

### 1.1 Reading table -- implemented (vapour pressure, enthalpy)

| quantity | equation(s) | page | table | image read | form |
|---|---|---|---|---|---|
| vapour pressure | (1), (2) | 782 | -- | p-04 | `ln P = a + b/(c+t)` rewritten linear: `a1 + a2 t + a3 ln P = t ln P`, so `ln P = (a1 + a2 t)/(t - a3)` |
| a1, a2, a3 | (3)-(5) | 782 | II (p. 783) | p-04, p-05, h5-05 | power series in `ln x`, degrees 8, 10, 10 |
| VP window | -- | 783 | III | p-05 | five T bands, x_min 0.582 / 0.500 / 0.353 / 0.300 / 0.200 |
| VP accuracy | -- | 784 | -- | p-06 | 512 data; mean abs/rel error 2.01 kPa, 2.07 %; bubble point 0.48 K, 0.13 % |
| enthalpy | (12) | 787 | -- | p-09, h9-09 | `H = c1 + c2 t + c3 t^2 + c4 t^3`; c1 is H at 0 degC |
| c1 | (13) | 787 | VI | p-09, h9-09 | rational: `(k0 + k2 x + k4 x^2 + k6 x^3)/(1 + k1 x + k3 x^2 + k5 x^3 + k7 x^4)` |
| c2, c3, c4 | (14)-(16) | 787 | VI | p-09, h9-09 | polynomials in x, degrees 8, 7, 7; the `n` column printed as `... E-5` |
| enthalpy reference | -- | 786 | -- | p-08 | liquid water at 0 degC; NaOH infinitely diluted at 20 degC |
| H window | -- | 788 | VII | p-10 | eleven T bands, 0-204 degC, x_min 0.780 ... 0.220 |
| H accuracy | -- | 788-789 | -- | p-10, p-11 | 901 data; mean 0.32 kJ/kg, 0.08 %; max 2.15 kJ/kg, 1.24 % |
| H data | -- | 786, 789 | V | p-08, p-11 | measured H for x 0.20-0.52 (Wilson & McCabe 1942, Bertetti & McCabe 1936); above x 0.52 from measured Cp (Bertetti & McCabe, Ackermann); Cp for 100-200 degC at x 0.5-0.9 EXTRAPOLATED |

The coefficient values are in the record, each list with its table and
page; they are not repeated here.

### 1.2 Transcribed for the C378 study, NOT implemented (density, viscosity)

Withdrawn from this slice by the coordinator (2026-11-12): how density,
viscosity and surface tension are organised is decided by the C378 study
first.  The paper's correlations are kept here as evidence, read the same
way (150 dpi page, 300 dpi crop, twice; they agree).

**Density** -- Eqs. (6)-(9), pp. 784-785, Table IV (p. 785, `h7-07.png`):

    rho = b1 + b2 t + b3 t^2                                   [kg/m3]   (6)
    b_j = c_j0 + c_j1 x^(1/2) + c_j2 x + c_j3 x^(3/2) + c_j4 x^2 + c_j5 x^(5/2)   (7)-(9)

| i | k_rho,i (b1) | l_rho,i (b2) | m_rho,i (b3) |
|---|---|---|---|
| 0 | 5007.2279636 | -64.786269079 | 0.24436776978 |
| 1 | -25131.164248 | 525.34360564 | -1.9737722344 |
| 2 | 74107.692582 | -1608.4471903 | 6.04601497138 |
| 3 | -104657.48684 | 2350.9753235 | -8.9090614947 |
| 4 | 69821.773186 | -1660.9035108 | 6.37146769397 |
| 5 | -18145.911810 | 457.64374355 | -1.7816083111 |

Window (Table III, p. 783): x >= 0.800 for 0-10 degC; 0.700, 10-20; 0.500,
20-60; 0.400, 60-70; 0.300, 70-150; 0.200, 150-200.  Accuracy (pp.
785-786): 156 data, all Krey (1972); mean 0.48 kg/m3, 0.04 %; max 2.41
kg/m3, 0.23 %.  Check: x = 1, 20 degC gives 997.6 kg/m3 (water 998.2);
50 wt %, 20 degC gives 1522.9 kg/m3.

**Viscosity** -- Eqs. (17)-(21), p. 790, Table IX (p. 790, `h12-12.png`):

    ln(mu_solution/mu_water) = d1 + d2 t^0.5 + d3 t                       (17)
    d1 = sum_{i=1..4} k_mu,i (1-x)^i ; d2 = sum_{i=1..5} l_mu,i (1-x)^i ;
    d3 = sum_{i=1..5} m_mu,i (1-x)^i                                       (18)-(20)
    mu_water = exp(n_mu0 + n_mu1 t + n_mu2 t^1.5 + n_mu3 t^2.5 + n_mu4 t^3)  [cP]  (21)

| i | k_mu,i | l_mu,i | m_mu,i | n_mu,i |
|---|---|---|---|---|
| 0 | -- | -- | -- | 0.5868156 |
| 1 | -6.1420727 | 2.3171396 | -0.1152143 | -0.0398182 |
| 2 | 124.64849 | -23.153644 | 1.0543467 | 0.00247793 |
| 3 | -247.08170 | 49.267937 | -2.3693277 | -4.9427E-6 |
| 4 | 147.73585 | -36.970260 | 2.0099091 | 1.48701E-7 |
| 5 | -- | 6.5882887 | -0.5257284 | -- |

Window (Table VII, p. 788): no correlation below 20 degC (p. 789);
x >= 0.60 for 20-30 degC; 0.55, 30-50; 0.45, 50-70; 0.30, 70-150; 0.20,
150-200.  Data (Table VIII, p. 790): Mashovets 1970, Baron 1967, Krings
1948, plus extrapolated points.  Accuracy (pp. 791-792): mean 0.17 cP,
2.13 %; max 5.6 cP, 12.2 %.  Check: water at 20 degC 1.004 cP (1.002);
50 wt % at 25 degC 50.5 cP.

## 2. What was checked against the transcription before any use

The paper prints no table of computed values, so there is no check value of
its own to reproduce.  What was checked: every correlation reduces to water
at x = 1 (P(1, 100 C) = 101.57 kPa against 101.325; H(1,100) = 419.6 and
H(1,0) = -3.5 kJ/kg, a difference of 423.1 against the steam table's 419.1;
the record loader REFUSES the record when
P(1,100 C) or H(1,100 C) - H(1,0 C) is more than 1 % off water), and the
paper's own figures (Fig. 5 enthalpy, p. 788) were read against the
evaluated surface (200 C at x 0.2-0.5 ~ 850-1200 kJ/kg; 0 C at x 0.8-1 ~ 0;
both match the plotted curves).

## 3. The conversion to the package's L_phi

`Phi(m,t) = M_s [H(x,t) - x H(1,t)] / (1-x)` is the apparent molar enthalpy
of NaOH relative to its infinite dilution at 20 C (the paper's reference,
p. 786).  The package prices the salt as `hfAq + Hinf_pkg(T) + L_phi`, with
`Hinf_pkg(T) = cpAvg(T)(T - 298.15)` (Criss-Cobble).  So

    L_phi(m,T) = Phi(m,t) - [Hinf_pkg(T) - Hinf_pkg(293.15)] + delta

and the package's solution enthalpy has exactly the paper's temperature
dependence (the Criss-Cobble leg cancels; no heat capacity counted twice).
delta = +341 J/mol, fixed once at 25 C so that L_phi(6 mol/kg) equals the
Parker-fitted Pitzer value there.

A first version JOINED at 6 mol/kg with the Pitzer L_phi at every T
(`L = L_P(6,T) + Phi(m,t) - Phi(6,t)`): it reproduced Parker at 25 C but put
the solution enthalpy 13 kJ/kg low at 20 wt %/60 C and 65 kJ/kg low at
50 wt %/89.5 C against both the paper and Geankoplis's printed chart values,
because it imported the Pitzer pair's temperature extrapolation.  Measured,
and replaced.

## 4. The handover to Pitzer, and the seam

Dilute solution is where the correlations are weakest: the vapour-pressure
error (2.01 kPa mean) is the size of the whole lowering, and near x = 1 the
correlation's ln a_w swings with T (at x = 0.99: -0.0089 at 20 C, -0.0124 at
60 C, -0.0067 at 150 C, where an ideal 0.25 mol/kg solution is ~ -0.0084 at
every T).  So below 4 mol/kg the model is the Na-OH Pitzer pair, above 6 the
correlation, smooth-step blend between (ln a_w and L_phi each).

Seam, correlation minus Pitzer:

| t (C) | d ln a_w at 4 | at 6 mol/kg | d L_phi at 4 | at 6 mol/kg (J/mol) |
|---|---|---|---|---|
| 25 | 0.0056 | 0.0000 | 110 | 0 |
| 60 | 0.0071 | 0.0004 | 2341 | 2719 |
| 100 | 0.0123 | 0.0037 | 6075 | 6891 |
| 150 | 0.0196 | 0.0059 | 9468 | 10790 |
| 200 | 0.0251 | 0.0029 | 6855 | 8663 |

The L_phi seam is the Pitzer pair's: its T-slots are fitted to 25 C heats
of dilution only.  Evidence that the correlation is the right side: the
Geankoplis chart (Fig. 32.4-3, McCabe 1935) at 20 wt % reads 129 / 234 /
341 / 441 / 540 kJ/kg at 37.8 / 65.6 / 93.3 / 121.1 / 148.9 C (+-5, read
off the 400-dpi page image at x = 0.20 where the isotherms are separated)
against the correlation's 131 / 234 / 336 / 440 / 544; and at 10 wt % (2.8
mol/kg, the pure-Pitzer region) the package's chart-datum enthalpy falls
-4 / -12 / -25 / -41 kJ/kg below the correlation at 60 / 100 / 150 / 200 C.
(evaporator08, on the Pitzer model at 2 -> 5.2 mol/kg and 25 -> 107 C, is
in that region: a finding for the Pitzer pair, not changed here.)

## 5. Gibbs-Helmholtz consistency (C377 condition 1)

L1 = -R T^2 (d ln a_w/dT)_x from the vapour pressure; the heat of diluting
1 kg NaOH from x to 0.8 is the integral of L1 dW, W = x/(1-x); the same heat
from the enthalpy correlation is Hrel(0.8)/0.2 - Hrel(x)/(1-x).  Gap,
vapour-pressure route minus enthalpy route, kJ per kg of solution at x
(`*`: above the paper's 2.15 kJ/kg maximum enthalpy error; -- outside the
windows of both correlations):

| t (C) | 30 wt % | 40 | 50 | 60 | 70 |
|---|---|---|---|---|---|
| 20 | +3.9* | +9.8* | -- | -- | -- |
| 40 | +1.4 | +6.5* | -0.5 | -- | -- |
| 60 | -0.4 | +4.0* | +1.9 | -7.5* | -- |
| 80 | -1.4 | +2.4* | +4.2* | +1.2 | +4.9* |
| 100 | -1.8 | +1.9 | +6.9* | +9.4* | +17.7* |
| 125 | -1.2 | +3.2* | +12.1* | +20.7* | +34.9* |
| 150 | +0.7 | +7.3* | +20.7* | +35.6* | +56.2* |
| 175 | +4.3* | +15.0* | +34.2* | +56.2* | +84.7* |
| 200 | +9.7* | +27.0* | +54.1* | +84.9* | +123.3* |

The pointwise relative partial enthalpy of water agrees well at 30 wt % and
below up to 150 C (within 1-5 kJ/kg of water) and parts above 40 wt % at high
T -- where the paper built H from extrapolated heat capacities (p. 786).
Nothing adjusted.  The model announces the gap at the state a consumer
publishes (`lphiConsistencyGap`, evaporator line + advisory; bench column).

## 6. Validation (C377 b part 5)

L_phi at 25 C vs Parker NSRDS-NBS 2 Table XIV A (independent calorimetry):

| m | model (J/mol) | Parker (cal -> J/mol) | dev |
|---|---|---|---|
| 6 | 711 | 674 (161 cal) | +5.5 % (the Pitzer value, by construction of delta) |
| 10 | 3861 | 3778 (903 cal) | +2.2 % |
| 15 | 9787 | 9581 (2290 cal) | +2.1 % |
| 20 | 15707 | 15573 (3722 cal) | +0.9 % |

Solution enthalpy, chart datum (kJ/kg): Geankoplis Example 32.4-3 prints
h_F = 214 (20 wt %, 60 C) and h_L = 505 (50 wt %, 89.5 C); model 214.5 and
511.7; correlation alone 213.3 and 507.6.

Boiling points vs Geankoplis's Duhring chart (Examples 32.4-2 and 32.4-3):
30 wt % at 25.6 kPa: book 79.5 C (rise 13.9 K), correlation 81.0 C (15.6 K
over its own water); 50 wt % at 11.7 kPa: book 89.5 C (40.6 K), correlation
90.8 C (42.0 K).

Pitzer overlap (both models at the same m, T): see the seam table, Sec. 4.

## 7. Water above 373 K (C377 condition 3) -- what is missing

The electrolyte package cannot reach the catalogue water's reference
equation today, and it is not a small exact change:
* `pureFluids { water { method IF97; } }` is wired natively only for
  `gammaPhi`: `ThermoPackageBuilder::v2NativeFormulation` returns false for
  any other formulation that declares `pureFluids`, and the non-native
  dispatch refuses it by name ("transport/pureFluids on formulation ... is
  not wired natively").
* Wiring it is not enough: the pure-fluid route prices a phase that is
  effectively pure water on IF97's OWN datum (`H_liquid_formation`,
  `Hvapour`, `pureFluidRoute`), "which cancels in h_out - h_in for a
  pure-water case", while the electrolyte branch prices the liquor's water
  on the ELEMENTS datum (`speciesPhaseEnthalpy`).  An evaporator has both
  (liquor in, pure vapour and condensate out), so the first law would carry
  the datum offset.  What is needed: the IF97 surface re-referenced to the
  elements datum at 298.15 K, used for the pure-water streams AND for the
  solvent leg of the electrolyte branch, with Psat from the same surface.
* What a case CAN reach by data alone: the `Wagner` vapour-pressure model
  (IAPWS SR1-86, opt-in in the case's own water record,
  docs/design/what-water-dat-does-not-say.md Sec. 3.2) fixes Psat; nothing
  fixes the liquid Cp (constant 75.5 J/mol/K to 373 K; -6.7 % at 473 K),
  which is what the bench shows as -13 ... -26 kJ/kg at 200 C.

## 8. A props-bench finding (reported, not fixed)

`propertyPoint` with an electrolyte package dies on "Component 'NaOH':
h_pure_ig(T) needs a standardThermochemistry block" even when only a
liquid density or viscosity is asked for: `PropertyPoint::run`
(src/propertyOps/PropertyPoint.cpp:70-72) computes the ideal-gas base set
`H_ig`, `S_ig`, `Cp_ig` (and the EoS residual block after it) for the whole
composition UNCONDITIONALLY, before the declared property list is read; a
salt that has only the aqueous-ion route (no ideal-gas formation datum)
throws in `Component::h_pure_ig` (src/thermo/Component.cpp:1603).  The
keys `rho_liquid_<comp>` and `mu_L` are served by `PropertyEvaluator`
(src/propertyOps/PropertyEvaluator.cpp:250 and :284), never reached.
