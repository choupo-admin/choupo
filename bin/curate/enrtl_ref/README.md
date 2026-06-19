# eNRTL reference material (for the focused build)

The classical organization is DONE: eNRTL is just the next `activityModel` option
(slot ready). What remains is implementing the model PHYSICS correctly + validating.

## Sourced (public domain / open source)
- `enrtl.py`, `enrtl_reference_states.py` — IDAES (US DOE, open-source, VALIDATED)
  eNRTL implementation. The authoritative, unambiguous equation source:
  ionic strength (Eqn 62), X/Y mixing (21,36,37), A_DH (61), PDH lnγ (69,70),
  alpha/tau/G (23,38-43), local lnγ `log_gamma_lc` (25,26,27), symmetric vs
  unsymmetric reference state (ndIdn 71/75).
  Retrieved: raw.githubusercontent.com/IDAES/idaes-pse/main/idaes/models/properties/modular_properties/eos/
- Params (facts, citable): water–NaCl τ=(8.885, −4.549), α=0.2 (Chen & Evans,
  AIChE J. 32 (1986) 444); the Chen-Evans aqueous single-electrolyte table.
- Validation data: Hamer & Wu, JPCRD 1 (1972) — the SAME γ± used for Pitzer.

## `enrtl_proto.py` — FAILS VALIDATION (do not trust). Bugs to fix vs IDAES:
1. A_DH = 2.91 but should be ~2.34–2.40 (Eqn 61 constants / the missing 4π term;
   check units of v, eps, and the prefactor against IDAES rule_A_DH exactly).
2. Local-composition term + symmetric-reference subtraction mis-mapped (giving
   huge positive lnγ). Re-derive tau[c,m]/tau[m,c]/tau[c,a] species indexing and
   the ndIdn (Eqn 75) PDH reference term LINE BY LINE from IDAES; do not shortcut.
3. Validate gamma_pm vs Hamer & Wu to <~1–2% in python FIRST, then port to a C++
   `eNRTL` ActivityModel option reading τ/α from data/standards/electrolyte/enrtl.dat.

NOT shipped: wrong physics is worse than no model (no-silent-crutch / no-shortcut).
