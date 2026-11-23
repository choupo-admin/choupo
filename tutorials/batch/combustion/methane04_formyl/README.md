# methane04_formyl -- + formaldehyde, HCO and CH2 to CO

Eighteen more records take formaldehyde through HCO to carbon monoxide and oxidise the CH2 of the methyl step.  The ignition delay hardly moves (it was decided by the branching) and the final temperature rises.

Run it:

```
runCase tutorials/batch/combustion/methane04_formyl
```

The ladder is methane01 to methane06 (the same vessel and start, only the reaction sets differ), and methane07 adds the sensitivity.  The EduTool `methane-assembly` ("Assemble methane combustion") runs them in the browser.  The constants of the carbon records are ONE mechanism's values (Miller and Bowman 1989, Appendix A), not evaluated constants; the shock-tube point is Petersen, Davidson and Hanson, J. Propulsion and Power 15 (1999) 82-91.  Reverse rates come from equilibrium.
