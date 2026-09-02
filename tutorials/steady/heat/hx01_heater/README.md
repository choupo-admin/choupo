# hx01_heater — a duty in, a temperature out

50/50 ethanol/water (100 kmol/h) at 300 K enters a heater that delivers
**100 kW**.  The dict says how much heat; the energy balance says how hot:
**T_out = 338.34 K**, a 38.3 K rise, and the stream stays liquid
(`vf_out = 0`).

## The lesson

1. **Hardware is declared, results are solved.**  `operation { Q 100.0
   kW; }` is the only number the unit takes.  T_out is *found* — the
   **Log** tab shows a Newton on the outlet temperature closing the
   enthalpy balance H_out = H_in + Q.
2. **3600 J/mol is the whole story in one number.**  Q per mole of feed
   (`Q_per_mol`) divided by the mixture's liquid Cp gives the rise; read
   the Cp's the run used in the **Props** tab and check 38 K by hand.
3. **Somebody has to supply those 100 kW.**  The run's result records
   which catalogue utility was picked to serve the duty at the outlet
   temperature: low-pressure steam, **0.0457 kg/s**, at the catalogue's
   price **4.32 €/h**.  That choice is the same rule every steady report
   uses (`pickForDuty`); the price is a catalogue number, not a market
   one, and `data/standards/utilities/` is where it lives.
4. **Where the stream came from matters.**  The feed is a subcooled
   liquid; heat it far enough and it starts to boil — the heater will say
   so with a vapour fraction, not by refusing.

## What to try

Raise `Q` until `vf_out` leaves zero: the outlet temperature stops
climbing as fast, because the heat is now going into vaporisation.
`phasechange01_partial_condenser` is the same balance run in reverse.
