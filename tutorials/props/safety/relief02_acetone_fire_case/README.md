# relief02_acetone_fire_case — an acetone drum in a pool fire

```
runCase tutorials/props/safety/relief02_acetone_fire_case
```

The fluid side of a **fire-case** relief valve. A drum of acetone sits in a
pool fire; its valve opens at the set pressure (here the MAWP, 5 barg — a
round number for the lesson) and the pressure climbs to the relieving
pressure with the 21 % fire accumulation, 7.06325 bar absolute. There the
liquid boils, and the fire's heat leaves as vapour.

One `propertyPoint` operation, at the relieving pressure and at the boiling
temperature the same run reports there, asks for the four numbers the relief
load and the gas sizing equation need:

| key | what | from |
|---|---|---|
| `T_bubble` | the relieving temperature | bubble point, ideal liquid + SRK vapour |
| `Hvap_acetone` | the latent heat there | the record's `HvapTb`, Watson to T (`Component::Hvap_latent`) |
| `Z` | the vapour's compressibility factor | SRK vapour root |
| `gamma` | Cp/Cv | the ideal-gas heat capacity |

`Hvap_<comp>` is a property key added for this case (DEV.md 4c C61): it is the
same latent heat the engine subtracts from the ideal-gas enthalpy to price
every liquid, and it refuses at or above the critical temperature.

Why acetone and not toluene: toluene's Antoine record is fitted only from 273
to 380 K, below its own normal boiling point, so every boiling temperature of
a pressurised toluene drum would be an extrapolated vapour pressure. Acetone's
covers 259.16 to 507.60 K.

The sizing is the EduTool's arithmetic: *Designing for overpressure*. Nothing
here is a relief design for a real vessel.
