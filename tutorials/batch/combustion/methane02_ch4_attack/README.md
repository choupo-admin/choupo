# methane02_ch4_attack -- + the attack on methane: CH3 appears and has nowhere to go

The same vessel with five records of Miller and Bowman 1989 Appendix A (reactions 3, 4, 5, 5a, 6: CH4 attacked by O2, H, OH, O and HO2) added to the core.  A trace of CH3 appears and nothing consumes it: the temperature barely moves and there is no ignition.

Run it:

```
runCase tutorials/batch/combustion/methane02_ch4_attack
```

The ladder is methane01 to methane06 (the same vessel and start, only the reaction sets differ), and methane07 adds the sensitivity.  The EduTool `methane-assembly` ("Assemble methane combustion") runs them in the browser.  The constants of the carbon records are ONE mechanism's values (Miller and Bowman 1989, Appendix A), not evaluated constants; the shock-tube point is Petersen, Davidson and Hanson, J. Propulsion and Power 15 (1999) 82-91.  Reverse rates come from equilibrium.
