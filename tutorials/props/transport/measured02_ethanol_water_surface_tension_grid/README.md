# measured02 -- the surface tension of aqueous ethanol from a measured grid

The same grammar as measured01, on the interface block (DEV.md 4c C421 slice
(8)): `transport { interface { surfaceTension { measured { ... } } } }`.

* The record, `constant/experiments/razaEthanolWaterSurfaceTension.dat`: 10
  rows, two temperatures (298, 313 K) by five ethanol mass fractions (0 to
  0.20).  `kind measured`.  Source: Raza, Hallett, Liu, He & Afzal, J. Chem.
  Eng. Data 64 (2019) 5049-5056, doi:10.1021/acs.jced.9b00026, transcribed
  exactly as the NIST ThermoML Archive gives it (ring tensiometer).
* `interpolation ( linear monotoneCubic )`: a chord along T (two values), the
  Fritsch-Carlson monotone cubic along w[ethanol], which follows the steep
  fall of sigma near pure water (72 to 55 mN/m in the first 5 %).
* Support T 298-313 K, w 0-0.20; authorised box T 293-318 K, w 0-0.22.

Run: `runCase tutorials/props/transport/measured02_ethanol_water_surface_tension_grid`.
