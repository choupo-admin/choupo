# pipe06 -- turbulent non-Newtonian flow by a DECLARED method (Dodge & Metzner)

Re_MR = 28925, far past the laminar line (2100): the pipe runs only because the case declares
`turbulent { method DodgeMetzner; }` (eqs. 3.70-3.73, window 2900-36000, n' 0.36-1).  n' and m'
are taken at the prevailing wall stress from the laminar relation of the flow curve.  The numbers
(f_Fanning 0.004590, tau_w 20.654 Pa, dP 82.6 kPa) were recomputed independently.  The book's
own warning is printed: the turbulent methods differ by up to +-50 % (p. 150-151).  pipe07 is the
same case with no method declared: refused by name.

Run: `runCase tutorials/steady/hydraulics/pipe06_turbulent_dodge_metzner`.
