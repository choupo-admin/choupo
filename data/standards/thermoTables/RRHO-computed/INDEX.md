# RRHO-computed species table

Ideal-gas records COMPUTED from molecular constants by
`bin/curate/rrho_thermo.py` (rigid rotor + harmonic oscillator + electronic
levels), inputs in `bin/curate/rrho_species.json`, each anchored to a cited
enthalpy of formation.  A case reads them with
`speciesTables ( NASA-TP-2002-211556 RRHO-computed );`.  Written by the tool,
held equal to its output by `bin/curate/check_rrho_thermo.py`.

## written

- NNH
- CH2CO
- 1CH2
- H2CN
- HOCN
- HCNO
- HCCOH
- C3H2
- C4H3
