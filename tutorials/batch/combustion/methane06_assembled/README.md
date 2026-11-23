# methane06_assembled -- + two CH3 make ethane: the assembled mechanism

Seven records of the ethane route (2CH3(+M) = C2H6(+M) with its Troe fall-off, and the attack on ethane) join the chain.  At this pressure the recombination of two methyl radicals dominates, the ignition delay grows by about an order of magnitude, and it lands near the measurement.  This is the set MillerBowman1989 (46 of the 235 reactions of Appendix A) beside the 21 of the OConaire2004 core.

Run it:

```
runCase tutorials/batch/combustion/methane06_assembled
```

The ladder is methane01 to methane06 (the same vessel and start, only the reaction sets differ), and methane07 adds the sensitivity.  The EduTool `methane-assembly` ("Assemble methane combustion") runs them in the browser.  The constants of the carbon records are ONE mechanism's values (Miller and Bowman 1989, Appendix A), not evaluated constants; the shock-tube point is Petersen, Davidson and Hanson, J. Propulsion and Power 15 (1999) 82-91.  Reverse rates come from equilibrium.
