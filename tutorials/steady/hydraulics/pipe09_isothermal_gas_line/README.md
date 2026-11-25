# pipe09_isothermal_gas_line -- a gas in a pipe: the compressible isothermal line (C506)

The same `pipe` unit as `pipe01_water_line`, fed a GAS.  An all-vapour inlet
(V/F = 1; here `phase gas;` declares it) takes the steady, horizontal,
constant-area, **isothermal** compressible equation instead of the liquid's
incompressible Darcy-Weisbach arithmetic (Theory Guide, section
*An isothermal gas line*, label `sec:pipe-gasline`).

Nitrogen, 45 kmol/h (0.3502 kg/s), 8 bar and 300 K, through 300 m of 50 mm
commercial-steel pipe (eps = 46 um), Churchill friction, ideal gas (Z = 1), gas
viscosity from the Chung model of the property dictionary (17.84 uPa s).

## The two solutions

With `c = P1/rho1 = Z R T / M` (89 042 m2/s2), the mass flux `G = mdot/A` (178.34 kg/m2/s)
and one friction factor (Re = G D / mu = 4.997e5 is the same at every section, because the
viscosity depends on T only; f = 0.019993):

* **Exact:**  `P1^2 - P2^2 = c G^2 [ f L/D + sum K + 2 ln(P1/P2) ]`, solved for P2 by a
  bracketed Newton (3 steps).  **P2 = 5.46010 bar** (dP = 2.5399 bar, 31.7 % of P1).
* **Mean density:** `P2^2 = P1^2 - c G^2 [ f L/D + sum K ]` (the gas treated as a liquid at
  the arithmetic-mean density).  **P2 = 5.47988 bar** (dP = 2.5201 bar).

The shortcut's dP is 0.78 % low here; the run prints both and their difference.  The
difference is the acceleration of the gas, the `2 ln(P1/P2)` term.  Hand-run table
(`bin/curate/gasline_reference.py`, the same inputs, only L changed):

| L / m | P2 exact / bar | P2 mean-density / bar | dP error of the shortcut | dP / P1 |
|---:|---:|---:|---:|---:|
| 10 | 7.9286 | 7.9289 | -0.45 % | 0.9 % |
| 100 | 7.2540 | 7.2578 | -0.51 % | 9.3 % |
| 300 (this case) | 5.4601 | 5.4799 | -0.78 % | 31.7 % |
| 500 | 2.5970 | 2.7169 | -2.22 % | 67.5 % |
| 540 | 1.3596 | 1.6889 | -4.96 % | 83.0 % |
| 548 | 0.8025 | 1.3951 | -8.23 % | 90.0 % |

## The window

The pressure gradient grows without bound as P -> G sqrt(c): the isothermal Mach number
`u / sqrt(c)` reaches 1.  For this inlet that pressure is 0.532 bar and the longest line
that carries the flow is **L_max = 549.1 m**; a longer one is REFUSED by name (try L 600).
Also REFUSED by name: an inlet already beyond the limit, `dz != 0` (the line is horizontal),
and a gas with no viscosity model in the property dictionary.  **Adiabatic and Joule-Thomson
effects are not modelled**: the wall is assumed to hold T constant.  A drop above 40 % of the
inlet pressure raises a `validity` advisory (a flag level, not a derived bound).

## Evidence

* An independent hand computation, `bin/curate/gasline_reference.py` (ideal-gas density,
  Churchill coded there, plain bisection; the viscosity is its one input), equals the engine:
  P2 exact 546010.18302 Pa, P2 mean-density 547987.711445 Pa, L_max 549.132019304 m, to 12
  digits.
* A fourth-order Runge-Kutta integration of the differential equation
  `dP/dL = -(f G^2 / 2D) / (P/c - G^2/P)` over the 300 m gives 546010.183020 Pa, i.e. it
  equals the closed form to 1e-11 (the closed form is not assumed).
* For a vanishing drop both tend to the incompressible Darcy law at the inlet density:
  at 0.01 kg/s (dP/P1 about 3e-4) the exact dP is within 1.7e-4 of it.
* **No published worked example is reproduced.**  The textbook form (Coulson & Richardson,
  Vol. 1, compressible-flow chapter) could not be read from a primary page in the session that
  wrote this case, and a number remembered is not a source; the case therefore claims the
  derivation and the two independent computations above, not agreement with a book.

## Run

    runCase tutorials/steady/hydraulics/pipe09_isothermal_gas_line

Try: `L 548 m` (the shortcut's error grows to 8 %), `L 600 m` (refused: choked), `D 0.1 m`.
