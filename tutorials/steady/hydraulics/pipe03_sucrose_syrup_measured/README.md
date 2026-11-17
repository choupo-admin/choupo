# pipe03 -- a pipe on a measured viscosity table (sucrose syrup)

A steady `pipe` whose Reynolds number needs the syrup's viscosity, and no law of
any record prices it (DEV.md 4c C421 slice (8)).  The case's own table does:
`constant/experiments/nainSucroseWaterViscosity.dat`, 24 rows (six
temperatures, 293.15-318.15 K, by four sucrose mass fractions, 0.05-0.20),
`kind measured`, from Nain, Lather & Sharma, J. Chem. Thermodyn. 58 (2013)
101-109, doi:10.1016/j.jct.2012.11.001 (the NIST ThermoML Archive's rows),
selected by the variant `nainTable` (`thermo nainTable;` on the unit).

The syrup (12.5 mass % sucrose, 301.15 K) lies between rows, so the viscosity
(1.202 mPa s) is the declared interpolation, `( logReciprocal monotoneCubic )`.
The golden master pins the viscosity's `source` as the table
(`stated.nainSucroseWaterViscosity`) and the pressure drop that follows.

Run: `runCase tutorials/steady/hydraulics/pipe03_sucrose_syrup_measured`.
