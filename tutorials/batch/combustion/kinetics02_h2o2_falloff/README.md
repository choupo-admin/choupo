# kinetics02_h2o2_falloff — the fall-off experiment

An isothermal closed vessel (1000 K, **30 bar**, 1 litre) holds N₂ and a trace of
H₂O₂ (1e-10 mole fraction).  The reaction **H₂O₂ + M = 2 OH + M** (R15 of the Ó
Conaire et al. 2004 mechanism) is a Troe fall-off: its first-order constant lies
between the low-pressure limit k₀[M] and the high-pressure limit k∞, and the
reduced pressure P_r = k₀[M]/k∞ is the coordinate of the curve.  At these
conditions P_r ≈ 0.67, near the middle.

Run it:

```bash
runCase tutorials/batch/combustion/kinetics02_h2o2_falloff
```

and plot `bomb.n_H2O2` in `trajectory.csv` on a log axis: a straight line of
slope −k.  The Lindemann blend k_L = k∞ P_r/(1 + P_r) is too sharp; the engine
multiplies it by Troe's broadening factor F (Gilbert, Luther and Troe 1983,
Eqs. 6.3 to 6.7), so k = k_L F with F < 1.  The seed is small so that the OH the
decomposition makes does not attack the H₂O₂ (OH + H₂O₂ = H₂O + HO₂), which
would add a chain contribution to the decay: at a seed of 1e-5 the decay reads
about 1.8 times too fast (measured natively at 1000 K, 1 and 30 bar).

The EduTool **How do we know k?** reruns this cell at other pressures and
temperatures and draws the measured k beside the record's Lindemann and Troe
laws.  Its sibling case is `kinetics01_oh_decay`, where the same page measures
a bimolecular rate constant.

The case declares `jacobian finiteDifference;` on purpose; the reason is in the
header of `system/flowsheetDict`.
