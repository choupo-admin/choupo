# polarisation01 -- the paper's own case study, row by row

**The question.** Three ions -- Na+, Cl- and a trivalent dye -- are
nanofiltered in a stirred cell.  The dye is rejected almost completely, the
chloride barely.  How much does each pile up at the membrane wall?

**The lesson.** Geraldes & Afonso, J. Membr. Sci. 300 (2007) 20-27
(doi:10.1016/j.memsci.2007.04.025), answer it with four algebraic equations
per operating point and NO film thickness: the cell's conventional
correlation `Sh_i = 0.23 Re^0.567 Sc_i^0.33` on each ion's OWN diffusivity,
the suction correction `Xi_i = phi_i + (1 + 0.26 phi_i^1.4)^-1.7`, and one
electrical potential gradient at the interface fixed by electroneutrality
at the wall.  The `polarisationIndex` bench prints, for each of the ten
rows of the paper's Table 1 (data of Bowen & Mohammad, AIChE J. 44 (1998)
1799), the per-ion k, phi, Xi, wall concentration, polarisation index
Gamma_i = (C_m - C_b)/C_b and the field xi -- the open symbols of the
paper's Fig. 7.  The dye (slowest, most rejected) polarises most; Na+ is
dragged after it by the field; Cl- sits BELOW its bulk concentration
(negative Gamma), which the film model applied ion by ion cannot produce.

**Headline numbers** (Gamma): row 1 (dye 4, Cl 5.2 mol/m3) dye +0.504,
Na +0.310, Cl -0.137; row 10 (dye 37, Cl 87.3) dye +0.273, Na +0.120,
Cl -0.074.  Re = 26906 against the paper's 26907.

**What is measured and what is not.** C_b, C_p and J_v are the table's; Na+
is derived by electroneutrality as the table's footnote says (`closeBy Na;`).
Every Gamma is a PREDICTION from those inputs, the ions' D and the
correlation; nothing is fitted.  The paper's filled symbols (an extended
Nernst-Planck integration in the dye's film) are not reproduced.  The dye
is a case-local species (`constant/species/dye.dat`, z = -3, D = 0.36e-9
from the paper's footnote); the sources do not identify the compound, so
its MW is a flagged nominal placeholder that nothing here reads.

**The gate.** `check_polarisation_coupling` re-solves Eqs. 25-28 in Python
from this case's own data file and holds every Gamma AND xi to 1e-8, holds
a single salt to the paper's closed form Eq. 20, and holds the
`filmTheory` + `none` policy to the classical film model to round-off.
