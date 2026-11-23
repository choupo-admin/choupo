# methane01_h2o2_core -- the hydrogen and oxygen core ALONE, on a methane mixture

The vessel holds methane, oxygen and nitrogen behind a reflected shock (Petersen, Davidson and Hanson 1999, Table 1 mixture 2, the point of Table 2 page 86: 1244 K, 114.4 atm, measured delay 254 us).  The only reactions are the 21 records of the OConaire2004 set, none of which names a carbon species: the methane is a spectator, the temperature does not move, and the engine prints no ignition delay.  A mechanism is not a mixture.

Run it:

```
runCase tutorials/batch/combustion/methane01_h2o2_core
```

The ladder is methane01 to methane06 (the same vessel and start, only the reaction sets differ), and methane07 adds the sensitivity.  The EduTool `methane-assembly` ("Assemble methane combustion") runs them in the browser.  The constants of the carbon records are ONE mechanism's values (Miller and Bowman 1989, Appendix A), not evaluated constants; the shock-tube point is Petersen, Davidson and Hanson, J. Propulsion and Power 15 (1999) 82-91.  Reverse rates come from equilibrium.
