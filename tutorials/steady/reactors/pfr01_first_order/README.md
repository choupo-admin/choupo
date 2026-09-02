# pfr01_first_order — same volume, same kinetics, more conversion

The reactor of `cstr01` rebuilt as a plug-flow tube: the same 5 litres,
the same 1 kmol/h feed at 350 K, the same Arrhenius pair.  The golden:
**X = 67.02 %** against the CSTR's 52.59 %, at the same **τ = 310.3 s**
and the same **Da = 1.109**.

## The lesson

1. **No back-mixing is the whole difference.**  In the CSTR every
   molecule reacts at the *outlet* concentration, the lowest in the
   vessel.  In the tube the concentration falls along V, so most of the
   volume works at a higher rate.  For first order:
   CSTR X = Da/(1+Da) = 0.526; PFR X = 1 − e^(−Da) = 0.670.  Both from
   the same Da; both in the goldens.
2. **The profile is printed, not just the endpoint.**  `nSteps 100;
   writeInterval 10;` in `operation {}` — the **Log** tab shows the
   axial table, eleven rows from V = 0 to 5e-3 m³, each component's
   molar flow falling or rising along the tube.  The integrator is named
   (`RK4, 100 uniform steps, dV = 5.0e-05 m³`); halve `nSteps` and see
   what moves.
3. **The heat of reaction is a KPI here.**  `dHrxn_kJ_per_mol = −25.73`
   is computed from the species' formation enthalpies (the elements
   datum — the one base every reactor in Choupo prices on), and the
   tube's isothermal duty `Q_kW = −2.40` follows from it and the extent.
4. **Same Da, different X, is the pedagogical point of the pair.**  Put
   the two READMEs side by side; the numbers are the lecture.

## What to try

Set `nSteps 10` and rerun: X barely moves, because RK4 is fourth order
and the profile is smooth.  Then try `pfr04_adiabatic`, where the tube
heats itself and T(V) becomes part of the profile.
