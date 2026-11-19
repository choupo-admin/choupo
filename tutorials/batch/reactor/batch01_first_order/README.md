# batch01_first_order — the same reaction, with time on the axis

18.5 mol of an equimolar ethanol / acetic-acid charge (about a litre) is
held at 350 K in a closed vessel for 600 s and the Fischer esterification
runs — the kinetics of `cstr01`, now integrated in time by RK4 at 1 s
steps.  The golden: ethanol falls from **9.25 mol to 1.083 mol**<!--golden: kpi reactor n_ethanol_final *1000-->
(**X = 88.3 %**<!--golden: kpi reactor n_ethanol_final *-10810.8108 +100-->), 8.167 mol<!--golden: kpi reactor n_ethylAcetate_final *1000--> of ethyl acetate made, and the jacket has
removed only **17.18 kJ**<!--golden: kpi campaign energy_Q_ledger_kJ *-1--> to hold the temperature — exactly
−2.10 kJ/mol of reaction at 350 K, the elements-datum heat every reactor
in Choupo prices on.  The liquid esterification is only mildly
exothermic (calorimetry: about −3 to −4 kJ/mol), so the jacket duty here
is small, not the cooling load an exotherm of tens of kJ/mol would need.

## The lesson

1. **`choupoBatch`, not `choupoSolve`.**  A batch vessel has no steady
   state; the case declares `endTime 600; deltaT 1.0; writeInterval 30;`
   in `controlDict` and the engine integrates dn/dt = ν r V.  The
   **Log** tab prints a snapshot every 30 s: four inventories and T.
2. **First order means an exponential, and you can check it.**  With k
   = 3.575e-3 s⁻¹ at 350 K (the same Arrhenius pair as `cstr01`),
   n(600 s) = 9.25·e^(−2.145) = 1.083 mol<!--golden: kpi reactor n_ethanol_final *1000-->.  The table is that curve,
   sampled.
3. **The campaign ledger closes at machine precision.**  `[campaign]
   mass balance … closure 4.5e-16`, `energy balance: dH_vessels =
   −17.18 kJ<!--golden: kpi campaign energy_dH_vessels_kJ *-1--> … = Q_ledger −17.18 kJ, closure 0` — every joule the
   jacket took is a state difference on the charge, never a quadrature,
   which is why the closure is zero and not merely small.
4. **A CSTR at the same τ does worse.**  600 s here gives 88 %; the
   continuous reactor at τ = 288 s gave 51 %<!--golden: @steady/reactors/cstr01_first_order kpi reactor X_limiting *100--> and a PFR 64 %<!--golden: @steady/reactors/pfr01_first_order kpi reactor X_limiting *100-->.  Three
   reactors, one rate law, three answers — the batch one is the upper
   envelope, because nothing leaves early.

## What to try

Set `T_setpoint 370 K;`: k roughly triples, the exponential steepens,
and the ledger's Q follows the extent (small, because the reaction is
only mildly exothermic).  Then `batch02_adiabatic` removes the jacket, and T
becomes one more state on the trajectory.
