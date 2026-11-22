# kinetics01_oh_decay — the cell of a flash-photolysis experiment

An isothermal closed vessel (1000 K, 1 bar, 1 litre) holds an H₂/N₂ bath
(H₂ mole fraction 0.01) and a **trace of OH (1e-6) made at t = 0**: the radical
a flash would leave.  The whole Ó Conaire et al. 2004 H₂/O₂ mechanism is
switched on (the `constant/reactions` of `ignition01_h2o2`), so the OH can do
everything the mechanism lets it do.

Run it:

```bash
runCase tutorials/batch/combustion/kinetics01_oh_decay
```

and plot `trajectory.csv` (`bomb.n_OH` against t) on a log axis.  With H₂ in a
large excess the OH decays by **OH + H₂ = H₂O + H** alone, as a first-order
law: ln n_OH is a straight line of slope −k′, with k′ = k·c_H₂, the
**pseudo-first-order constant** of the experimenter's method.  Dividing k′ by
the H₂ concentration c = x P / (R T) gives k, which the run's own log
announces (`[kinetics] A: 2.16e+08 cm3/mol/s -> 216000 (SI ...)`, the law the
engine evaluates, k = A Tᵇ exp(−Ea/RT), b = 1.51).

`rateOfProduction` prints, at 5 µs, which reactions make and destroy each
species.  With the trace seed the table says OH is removed by R3 alone; raise
the OH seed (0/internalStates/bomb) and the secondary chemistry that
contaminates a measured decay appears in it by name.

The EduTool **How do we know k?** (EduTools, Reaction engineering) runs this
case under other temperatures, H₂ concentrations and seeds, fits k′, k and the
Arrhenius line from the signal, and compares each recovered k with the
engine's.  Its sibling case is `kinetics02_h2o2_falloff`.

The case declares `jacobian finiteDifference;` on purpose; the reason is in the
header of `system/flowsheetDict`.
