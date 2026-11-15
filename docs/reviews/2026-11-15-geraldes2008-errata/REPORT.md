# Errata: Geraldes & Alves (2008), J. Membr. Sci. 321, 172-182

Date 2026-11-15.  Asked by the paper's first author, who knew that two or
three printed equations were wrong and suspected the membrane-surface
equilibrium.  Read by a reviewer against three references: the NanoFiltran
Fortran the paper describes (the program that ran), Choupo's DSPM-DE
implementation, and the physics (dimensions, limits, the paper's own
numbers).  Every finding below is proved by a number or by dimensions; the
evidence script is kept in the session scratchpad (nf-errata/errata.py).

## Main errors

**Eq. 33, the linearised equilibrium at the permeate surface** (the author's
hint, confirmed).  As printed:
`[g*_N] c_N - [Phi e*] c_p + [g*_p c*_p a Phi e*] psi_N - [g*_p c*_p a Phi e*] psi_p = +[g*_p c*_p Phi e* a (psi*_p - psi*_N)]`,
with a = z_i F/RT and e* = exp(a (psi*_p - psi*_N)).  As it should be (the
Newton linearisation of Eq. 9, and what NANOFILTRAN.F lines 498-512 code):
`[g*_N] c_N - [g*_p Phi Phi_B e*] c_p + [g*_p c*_p a Phi Phi_B e*] psi_N - [g*_p c*_p a Phi Phi_B e*] psi_p = -[g*_p c*_p Phi Phi_B e* a (psi*_p - psi*_N)]`.
Three defects: Phi_B (the dielectric factor) missing from every bracket
(the feed-side Eq. 24 has it), g*_p missing from the c_p coefficient, and the
right-hand side with the wrong sign.  Proof by fixed point: a converged
iterate must satisfy its own linearisation; on the paper's Table 2 case the
printed form leaves (LHS - RHS)/(g_N c_N) = -11.9 (Na+), -48.9 (Mg2+),
+12.8 (Cl-), the corrected form 6e-4, 1.2e-3, -6e-4 (Eq. 9's own residue).
The code was right: a typesetting error.

**Eq. 16, the hindered-diffusion factor K_d (Dechadilok-Deen)**: the lambda^6
term is printed -1.10115 lambda^6; it is +1.10115 lambda^6.  The polynomial
must vanish at lambda = 1 (printed: H(1) = -2.2023; corrected: 0); against the
paper's own text (K_d 0.228 for Na+, 0.00608 for Mg2+) the printed form gives
0.156 and -63.25 (a negative diffusivity), the corrected 0.2279 and 0.00609;
at lambda = 0.95 the corrected form meets Eq. 17.  The Fortran uses the
correct sign.

**Eqs. 12-13, the Davies activity coefficient** (already recorded in
Choupo): Eq. 13's constant is the log10 Debye-Huckel constant (it contains
1/ln 10) while Eq. 12 writes ln gamma with it, so ln gamma is 2.303 times too
small; the Fortran follows the print, and Table 2 carries the factor (Na+
moves 10.7 % with ln 10 restored).  Also: Eq. 13 evaluated in SI gives A =
0.0161 (mol/m3)^-1/2; the nomenclature's I in mol/L needs the factor
sqrt(1000) (A = 0.510), which the print omits.

## Smaller defects (residual definitions and a table; no solution changes)

* Eq. 38: the migration term prints (c_{j+1} - c_j); it is (c_{j+1} + c_j), as
  in Eq. 21 and the code.
* Eq. 39: prints sum_i (z_i c_ij - c_X); it is |c_X + sum_i z_i c_ij|, as in
  Eq. 19 and the code.
* Eq. 40: prints exp(-DeltaW/RT) with DeltaW per ion in J; it is kT (Eq. 11),
  or RT with a molar DeltaW, as the code does.
* Table 1's variable count prints (Nc+1)(N+2)(Nc+1); it is (Nc+1)(N+2).
  Eq. 23 has a capital Z_Nc.

## Where Choupo stands

Choupo follows the correct form everywhere: it solves Eq. 9 directly by
Newton in ln c with Phi_S Phi_B and the activity ratio on c_p
(src/unitOperations/membrane/transport/PoreNernstPlanck.cpp:353-356, the
partition at DSPM_DE.cpp:648-655), uses +1.10115 (DSPM_DE.cpp:137, the Theory
Guide, check_pore_partition, check_pore_solver) and log10 x ln 10 for Davies.
No Choupo text transcribes a wrong printed form.  NOT RESOLVED: Dechadilok &
Deen (2006) is not in the literature folder, so Eqs. 16-18 were judged by
H(1) = 0, continuity at lambda = 0.95 and the paper's own values.
