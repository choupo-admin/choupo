# `true/aqueous/` — true AQUEOUS SPECIES (charged **and** neutral)

Despite the folder name, this holds **all** true aqueous species the
speciation / electrolyte models work with — not only charged ions. The `charge`
field in each record distinguishes them:

```
Na      charge +1        Cl      charge -1
HCO3    charge -1        CO3     charge -2
H3BO3   charge  0        H4SiO4  charge  0        CO2aq   charge 0        NH3aq   charge 0
```

Neutral aqueous species (`H3BO3`, `H4SiO4`, `CO2aq`, `NH3aq`, …) are **valid true
species**: they participate in speciation / dissociation equilibria, e.g.

```
H3BO3 + H2O  <=>  B(OH)4- + H+
H4SiO4       <=>  H+ + H3SiO4-
```

**Do not remove neutral species.** The folder name `ions/` is historically
narrow; renamed from the historically-narrow `true/ions/` on 2026-06-30 (it holds neutral species too). `charge` is the discriminator, not folder membership.

## Provenance convention for this folder (ratified 2026-07-04)

A `modelSpecies` record's citation home is the **in-record `source "…"` field**
(e.g. `Na.dat`: `"Wagman 1982; radius+D0 Nightingale 1959 (lambda0 50.1)"` —
Wagman et al., NBS Tables, J. Phys. Chem. Ref. Data 11 Suppl. 2 (1982) for
`hfAq`/`sAq`/`cpAq`; Nightingale, J. Phys. Chem. 63 (1959) 1381 for
`radius`/`D0`). These records are small single-record files; the
`recordType modelSpecies` line + the `source` field **are** the accepted
header/citation style for this surface — a per-file `/*--- Choupo ---*/`
banner box is **not** required and is added only where a record needs a
file-specific narrative (the Felmy & Weare borate set `B3O3OH4`/`B4O5OH4`/
`CaBOH4`/`MgBOH4`, the derived-MW records `MgOH`/`Mnp3`).

Identity-only records (name + ion + charge, no thermo block) must still state
their **species lineage** (which speciation model summons them) — in the
`source` field or a header box; identity/charge alone is not exempt from
citation.
