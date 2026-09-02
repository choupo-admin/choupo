# batch01_first_order — the same reaction, with time on the axis

18.5 mol of an equimolar ethanol / acetic-acid charge (about a litre) is
held at 350 K in a closed vessel for 600 s and the Fischer esterification
runs — the kinetics of `cstr01`, now integrated in time by RK4 at 1 s
steps.  The golden: ethanol falls from **9.25 mol to 1.083 mol**
(**X = 88.3 %**), 8.167 mol of ethyl acetate made, and the jacket has
removed **210.15 kJ** to hold the temperature — exactly
−25.73 kJ/mol of reaction, the elements-datum heat every reactor in
Choupo prices on.

## The lesson

1. **`choupoBatch`, not `choupoSolve`.**  A batch vessel has no steady
   state; the case declares `endTime 600; deltaT 1.0; writeInterval 30;`
   in `controlDict` and the engine integrates dn/dt = ν r V.  The
   **Log** tab prints a snapshot every 30 s: four inventories and T.
2. **First order means an exponential, and you can check it.**  With k
   = 3.575e-3 s⁻¹ at 350 K (the same Arrhenius pair as `cstr01`),
   n(600 s) = 9.25·e^(−2.145) = 1.083 mol.  The table is that curve,
   sampled.
3. **The campaign ledger closes at machine precision.**  `[campaign]
   mass balance … closure 4.5e-16`, `energy balance: dH_vessels =
   −210.15 kJ … = Q_ledger −210.15 kJ, closure 0` — every joule the
   jacket took is a state difference on the charge, never a quadrature,
   which is why the closure is zero and not merely small.
4. **A CSTR at the same τ does worse.**  600 s here gives 88 %; the
   continuous reactor at τ = 310 s gave 53 % and a PFR 67 %.  Three
   reactors, one rate law, three answers — the batch one is the upper
   envelope, because nothing leaves early.

## What to try

Set `T_setpoint 370 K;`: k roughly triples, the exponential steepens,
and the ledger's Q grows with the extent.  Then `batch02_adiabatic`
removes the jacket, and T becomes one more state on the trajectory.
