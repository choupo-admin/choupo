# eNRTL — VALIDATED + WIRED + RUNNABLE (2026-06-08)

DONE: `activityModel { model eNRTL; }` is a runnable option (one word from `pitzer`).
Kernel ENRTLSingleSalt.H validated: gamma_pm AAD 1.8 %, osmotic phi AAD 1.4 % vs NaCl
(Hamer&Wu/Robinson&Stokes), bit-for-bit vs the python. Case: evaporator07_nacl_enrtl
(BPE 5.37 K via eNRTL a_w). Catalogue: data/standards/electrolyte/enrtl.dat.
NEXT: more salts in enrtl.dat; the MIXED-SOLVENT case (eNRTL's real differentiator).


CRACKED. The single-salt aqueous eNRTL (Chen-Song-Evans) is implemented and validated:
- `enrtl_validated.py` — python prototype, AAD 1.8% vs Hamer & Wu NaCl gamma_pm (0.1-6 mol/kg).
- `src/thermo/electrolyte/ENRTLSingleSalt.H` — the C++ kernel, matches the python BIT-FOR-BIT
  (max |C++-python| = 5e-5) and validates AAD 1.8%.

The two bugs the disciplined python-then-C++ validation caught:
1. Missing the mole-fraction -> molality SCALE CONVERSION (gamma_m = gamma_x / (1+0.001*Mw*nu*m)).
2. Hand-simplified local-composition sums were wrong; the FAITHFUL array-based lc (IDAES Eqns
   26/27 over species {m,c,a}) is correct.

Params (cited): water-NaCl tau=(8.885,-4.549), alpha=0.2 (Chen & Evans, AIChE J. 32 (1986) 444).
A_DH=2.9127 (mole-fraction basis, water 25 C, IDAES Eqn 61). rho=14.9.

## Remaining to make it RUNNABLE (mechanical, mirrors pitzer):
1. data/standards/electrolyte/enrtl.dat — tau/alpha per salt (cited).
2. ENRTLSingleSalt: add waterActivity(m) + osmotic(m) (port the python MOLECULE lc branch,
   Eqn 25) so the evaporator (BPE) / crystalliser can use eNRTL too -- gamma_pm alone is done.
3. Register "eNRTL" in the ActivityModel factory + ElectrolyteActivity eNRTL mode (reads enrtl.dat).
4. Golden-master a gamma_pm case + (later) the mixed-solvent case (eNRTL's real differentiator).

eNRTL's value vs Pitzer: Pitzer is better for high-conc AQUEOUS (0.17% vs 1.8%); eNRTL is THE
model for salt in a NON-ideal molecular solvent (acetone/ethanol/water + salt) -- the case Pitzer
and plain NRTL both cannot do.
