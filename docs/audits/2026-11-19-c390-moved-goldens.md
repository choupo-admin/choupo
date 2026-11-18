# C390: the pressure term of the generic liquid enthalpy -- moved goldens

What changed: the liquid leg of `H_stream_formation` / `S_stream_formation` on a
package that does not price its liquid on the equation of state gains, per
component, `INT_{psat(T)}^{P} v (1 - alpha T) dP` (entropy `-INT (dv/dT) dP`);
the pump solves the stream balance `H(T_out, P_out) = H(T_in, P_in) + w_real`.
Before it, the ammonia reference equation (Gao et al. 2023) was curated (a
separate commit): it moved NO golden row of the 31 ammonia steady/plant cases
(scope run, 36 PASS / 0 FAIL, before the term existed).

## The datum offset every liquid carries (explains the `H_feeds` rows)

The term is measured from the component's own saturated liquid, and the
formation-datum liquid is the saturated liquid at 1 atm-ish.  A feed at
298.15 K and 1 bar sits P - psat = 100000 - 3170 Pa above its saturation
pressure, so its enthalpy gains `v (1 - alpha T) (P - psat)` = 1.8068e-5 x
(1 - 2.573e-4 x 298.15) x 96830 = 1.61 J/mol (the review predicted 1.75
J/mol for water).  At 10 mol/s that is +0.0161 kW (pump01/02), at 55.5 mol/s
+0.0894 kW (liquidDensity01).  Every moved `H_feeds_kW` / `H_products_kW` row
below carries this and the effect of the pump itself.

## pump01_water  (re-recorded)

| row | before | after | why |
|---|---|---|---|
| `kpi pump01 T_out`, `stream out T` | 299.077152 K | 299.219103 K | only ~80 of the 200 J/mol heat the liquid now; the other ~120 J/mol (`v (1-aT) dP` = 120.03 J/mol, hand calculation in `c390_pump_handcheck.py`) is stored as pressure.  The old closed form had treated the useful part as `eta w` = 130 J/mol and lost it. |
| `kpi pump01 dT` | 0.927152 K | 1.069103 K | same.  Independent check: the IAPWS-95 enthalpy balance (the independent Python implementation of the reference equation) gives 1.071478 K; the engine is 0.222 % below it. |
| `boundary global H_feeds_kW` | -2864.01591733 | -2863.99976314 | +0.0161 kW: the datum offset above |
| `boundary global H_products_kW` | -2863.31591733 | -2861.99976314 | +1.3162 kW = the 1.3 kW of useful work now carried (+ the 0.0161 offset) |
| `boundary global residual_kW` | 1.3 | 9.1e-13 | the open first law is closed |
| `boundary global noBoundary`, `residual_denom_kW` | (absent) | false, 2 | rows the golden writer now emits; appended |

## pump02_pressure_spec  (re-recorded)

`T_out`, `stream out T`: 298.523701 -> 298.578585 K; `dT` 0.373701 -> 0.428585 K;
`H_feeds_kW` -2864.01591733 -> -2863.99976314 (the datum offset);
`H_products_kW` -2863.73377302 -> -2863.19363652 (+0.5400 kW: the useful work
0.5240 kW now carried + the offset); `residual_kW` 0.523982 -> -4.5e-13.  New rows
as above.

## liquidDensity01_water, liquidDensity02_waterEthanol  (re-recorded)

Every row of these two goldens is rewritten, because the golden writer
right-pads the value column to the longest value and the new values are
longer; the VALUES that did not move are identical to the digit.  Moved:

| row | 01 before -> after | 02 before -> after | why |
|---|---|---|---|
| `stream product T`, `stream pumped T`, `P1 T_out`, `R1 T`, `R1 T_out` | 298.170513 -> 298.174194 | 298.178514 -> 298.196458 | pump discharge T on the stream balance |
| `P1 dT` | 0.0205128 -> 0.0241939 | 0.0285143 -> 0.0464584 | same; the IAPWS-95 route gives 0.024238 K for 01 (engine -0.18 %) |
| `R1 k_absentAcid` | 1.741733e-06 -> 1.742167e-06 | 1.742676e-06 -> 1.744792e-06 | the rate constant of the reactor evaluated at the (slightly warmer) feed temperature |
| `R1 tau_s` | 997.131976 -> 997.131030 | 888.292693 -> 888.278282 | the reactor's volumetric flow at the warmer feed |
| `boundary global H_feeds_kW` | -15897.951248 -> -15897.861577 | -11357.799746 -> -11357.721628 | datum offset (+0.0897 / +0.0781 kW) |
| `boundary global H_products_kW` | -15897.865280 -> -15897.575017 | -11357.703251 -> -11357.399978 | the offset + the useful work now carried (+0.2008 / +0.2252 kW) |
| `boundary global residual_kW` | 0.200592 -> -6.2e-11 | 0.225155 -> 1.3e-09 | first law closed |
| `boundary global noBoundary`, `residual_denom_kW` | (absent) | appended | |

`check_energy_closure`: the four cases leave KNOWN_OPEN (all close at 0.0000 %).

## The ammonia family (measured, NOT re-recorded)

`bin/runTests --scope` on the 32 steady/plant cases that name ammonia (plus
column14), with the term built and each manifest re-pinned: 14 of the 32
(plus the gates) hold; 18 cases carry moved rows.  They are listed here with the
count of moved rows and the one physical cause; no row was re-recorded, because
a per-row explanation of ~370 rows, and of the cases outside this family that
the term also reaches (below), is the architect's sweep to take, not a slice's.

| case | rows moved | what moves, and why |
|---|---|---|
| greenAmmoniaPEQ_baseCase | 103 | the reference plant: let-down flash, chiller, storage flash duties and the economics rows that read them |
| greenAmmonia02_feasibility150bar / 50bar | 51 / 28 | same units |
| letdown01_ammonia_flashing | 46 | the valve warms the compressed liquid: `LetdownGas.T`, `ThrottledHP.T` 253.014 -> 255.034 K (+2.02 K; the sign is the physical one, a liquid with alpha T < 1 warms when throttled); flash gas F 0.04073 -> 0.04738; K-values of the drum move with T |
| economics03_startup_years, ammonia02_full_plant | 39 / 27 | `letdown.Q_kW` +13.80 -> -226.26 kW (the isothermal let-down flash changes sign; the review's prototype on the Rackett slope gave -225.06, ammonia's own reference equation -226.26, 0.5 % apart), `separator.Q_kW` -38345.6 -> -38081.9, so NPV 15.777 -> 15.937 M EUR (+1.0 %, the review's +1.02 %), IRR, payback; the `letdown.heating.steamLP` utility rows are MISSING (the unit no longer needs heating steam) |
| ammoniaReactor01..04, ammonia01_synthesis_loop, ammonia03_quench_converter | 13 each (12 for the converter) | same let-down and separator duties (`letdown.Q_kW` +13.53 -> -222.91 kW in ammoniaReactor01) and their utilities |
| column14_klemola_c4_splitter | 16 | reboiler 9766.9 -> 9761.1 kW (-0.06 %), condenser -10158.0 -> -10151.8; the compressed (6.6 bar) liquid carries the term; the n-butane minor key 8.112e-5 -> 8.148e-5 (+0.4 %); within the review's 4e-4..7e-4 |
| column13, stripper01_sour_water, stripper02_sour_water_h2s | 6 / 5 / 5 | reboiler duty -0.012 % (stripper01: 75.4947 -> 75.4854 kW) |
| absorber01_NH3_water, stripper01_NH3_water | 1 / 1 | `boundary.global.residual_kW` -27.9838 -> -27.9771 (band 0.0028): the liquid streams' term |

`check_energy_closure` also flags three plants (ammonia02_full_plant,
economics03_startup_years, ammonia03_quench_converter): their `waterCooler`
publishes `H_closure_gap_kW` = -0.0001 / +0.0001 kW on a duty of 57 400 kW
(2e-9 relative), just above the gate's 1e-4 kW threshold.  It is the heat
exchanger's outlet-search tolerance meeting the (slightly) different enthalpy
surface, not a model gap; NOT pinned, reported to the architect.

## The reach beyond the ammonia family (measured on a sample, then stopped)

Every liquid priced above its own `psat(T)` now carries the term, including a
liquid at 1 bar (the 1.6 J/mol datum offset above), and the pricing asks the
property kernel for the component's liquid volume, which consults every record
in `parameters/Helmholtz/`.  A plain run of the first 87 non-props golden cases
(sorted by path: batch, ctrl, plant, the first steady folders) measured:
29 % announce the term, 41 % CONSUME a Helmholtz record their manifest does not
pin (the run says `drifted`; under CHOUPO_PINS=refuse it refuses).  The reach is
therefore a large part of the corpus (of 433 non-props golden cases, 346 steady, 161
declare a pressure of 2 bar or more); every re-pin and every moved row of it
belongs to a full sweep the architect decides.  This slice stopped at the
measurement, as its brief said to.  What the sweep will meet beyond the rows:

- every manifest that pins the Helmholtz records needs the `Gao2023` line (78 do);
  any case that newly consumes them needs `bin/choupo-import --pin <case>`;
  recommended: pin the Helmholtz directory as a `relevant:` set like the Henry
  directory, so that a new reference equation does not touch 500 manifests;
- speed: letdown01 0.05 s -> 0.4-1 s, greenAmmonia03 about 2 min -> 7 min (the first
  build of the term, before the grid, ran more than 80 minutes without finishing);
  the reference-equation volume is interpolated on a 1 K grid per
  (component, P), see `ThermoPackage::liquidPressureLeg`.
