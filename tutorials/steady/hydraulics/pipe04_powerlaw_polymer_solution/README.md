# pipe04 -- a power-law polymer solution in a pipe (Chhabra & Richardson Example 3.1)

The liquid declares its FLOW CURVE in the property dictionary (door form 3, C421 (7)): rows of
kind `adopted` generated from the example's `tau = 3 gamma^0.5`, read through a derived power-law
fit (printed, nothing stored).  The pipe finds the wall shear stress that carries the flow from the
curve itself (eq. 3.46), asks the door for the apparent viscosity there, and reports the
Metzner-Reed Reynolds number (216: laminar).  -dP = 110.13 kPa against the book's 110 kPa;
V = 1.316 m/s against 1.32 m/s; the closed form (eq. 3.12) gives the same 110.13 kPa.

Run: `runCase tutorials/steady/hydraulics/pipe04_powerlaw_polymer_solution`.
