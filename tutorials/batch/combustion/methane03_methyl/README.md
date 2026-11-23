# methane03_methyl -- + the methyl step: the branching opens, the ignition is far too early

Twelve more records: CH3 with O2 (a chain branching), O, HO2 and H, and CH3O to formaldehyde.  The mixture ignites, at a small fraction of the measured delay, and the carbon stops at formaldehyde.  A mechanism can ignite for the wrong reasons.

Run it:

```
runCase tutorials/batch/combustion/methane03_methyl
```

The ladder is methane01 to methane06 (the same vessel and start, only the reaction sets differ), and methane07 adds the sensitivity.  The EduTool `methane-assembly` ("Assemble methane combustion") runs them in the browser.  The constants of the carbon records are ONE mechanism's values (Miller and Bowman 1989, Appendix A), not evaluated constants; the shock-tube point is Petersen, Davidson and Hanson, J. Propulsion and Power 15 (1999) 82-91.  Reverse rates come from equilibrium.
