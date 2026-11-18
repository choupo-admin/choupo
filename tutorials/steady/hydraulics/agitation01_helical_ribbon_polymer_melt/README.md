# agitation01 -- agitation power of a helical ribbon in a polymer melt (Chhabra & Richardson Example 8.5)

`agitatedVessel`: the fluid's flow curve (property dictionary), the impeller's k_s and K_p (an asset
record of kind `impeller`), the unit's gamma_avg = k_s N; the door gives mu_app = 93.68 Pa s,
Re = 6.977, K_p = 494.4 (eq. 8.7), P = 9.833 kW (book 9.84), printed with k_s's and K_p's stated
uncertainties as 6.97 .. 13.86 kW.  The shaft power is the Work item `W_shaft_kW`; the jacket's duty
closes the first law.  The book's H/D = 1.5 is outside eq. 8.7's data (0.88-1.30): run as a declared
hypothesis.  agitation02 (yield stress) and agitation03 (shear-thickening) are the same case refused
by name (R9).

Run: `runCase tutorials/steady/hydraulics/agitation01_helical_ribbon_polymer_melt`.
