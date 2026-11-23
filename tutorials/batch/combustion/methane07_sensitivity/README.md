# methane07_sensitivity -- the assembled mechanism and the sensitivity of the delay to each rate constant

methane06 with `sensitivity { response tauIgnition; factor 1.1; reactions all; top 8; }`: the engine integrates the vessel once per reaction with that reaction's net rate multiplied and prints S_j = d ln tau / d ln k_j.  Two reactions of the methyl radical head the table with opposite signs: the branching CH3 + O2 = CH3O + O (A8, negative) and the recombination of two CH3 (A1, positive).

Run it:

```
runCase tutorials/batch/combustion/methane07_sensitivity
```

The ladder is methane01 to methane06 (the same vessel and start, only the reaction sets differ), and methane07 adds the sensitivity.  The EduTool `methane-assembly` ("Assemble methane combustion") runs them in the browser.  The constants of the carbon records are ONE mechanism's values (Miller and Bowman 1989, Appendix A), not evaluated constants; the shock-tube point is Petersen, Davidson and Hanson, J. Propulsion and Power 15 (1999) 82-91.  Reverse rates come from equilibrium.
