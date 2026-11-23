# methane05_c1_chain -- + CO to CO2: the whole C1 chain

Four more records turn CO into CO2, where most of the heat is released.  The C1 chain is complete, from CH4 to CO2, and the delay is still far too short.

Run it:

```
runCase tutorials/batch/combustion/methane05_c1_chain
```

The ladder is methane01 to methane06 (the same vessel and start, only the reaction sets differ), and methane07 adds the sensitivity.  The EduTool `methane-assembly` ("Assemble methane combustion") runs them in the browser.  The constants of the carbon records are ONE mechanism's values (Miller and Bowman 1989, Appendix A), not evaluated constants; the shock-tube point is Petersen, Davidson and Hanson, J. Propulsion and Power 15 (1999) 82-91.  Reverse rates come from equilibrium.
