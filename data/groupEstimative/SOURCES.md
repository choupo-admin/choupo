# data/groupEstimative/ — provenance & licence manifest

All records here are MACHINE-ESTIMATED, not measured. Cite the PRIMARY method
per value; do not treat this tier as reference data.

## compounds.csv (28823 rows)

### Identity
- Source: the `chemicals` library (Caleb Bell) identifiers database —
  PubChem/CAS-derived public data. Keyed by InChIKey.
- `name`, `CAS`, `formula`, `InChIKey`, `charge` are facts.

### Molecular groups (`unifac`, `modfac`, `psrk`)
- Source: DDBST published group assignments bundled in `thermo`
  (`DDBST UNIFAC assignments.tsv`), keyed by InChIKey. Subgroup numbering is
  the standard published UNIFAC/Dortmund/PSRK scheme (e.g. OH = 14) — this is
  DIFFERENT from other tools' internal numbering.
- Group interaction physics itself lives ONCE in
  data/standards/unifac/interactions.dat (main-group matrix); it is not
  duplicated per compound.

### Estimated properties
- Anchors (Tb, Tc, Pc, Vc, Tm, Cp_ig coeffs, dHf_ig, dGf_ig, Hvap(Tb), Hfus):
  **Joback & Reid, Chem. Eng. Commun. 57 (1987) 233** — group contribution.
  The SAME groups that give VLE also give the formation datum (dHf/dGf are
  group sums), so identity, groups, and thermochemistry are mutually
  consistent by construction.
- omega: **Lee-Kesler** corresponding states from the estimated (Tb,Tc,Pc).
- Reference basis for dHf/dGf: ideal-gas, elements datum (JANAF convention) —
  the same rung Choupo's `gibbsFormation { phase gas; }` block uses.
- Typical AAD (diverse validation set): Tb ~10%, Tc ~11%, Pc ~11%; worse for
  small molecules and hydrogen-bonders (evidence: the method-comparison run).

### Derived classifications (nothing hand-authored)
- `stability`: RDKit radical-electron screen + a curated allowlist of stable
  inorganic radicals (NO, NO2, NO3, O2, ClO2, ClO, ...). Everything else with
  unpaired electrons is flagged `reactiveIntermediate` (kinetics-only).
- `thermo_class`, `models_supported`, `unifac_vocab_ok`: pure views over
  (charge, stability, groups, and Choupo's groups.dat vocabulary).

## Tooling & licences
- `chemicals`, `thermo` — MIT. `rdkit` — BSD-3. All permissive.
- Choupo policy honoured: the METHODS (Joback, Lee-Kesler, UNIFAC group
  assignment) are published and free to compute locally; experimental
  databank VALUES are NOT redistributed here — only estimates + identity.
  Excluded regardless: NonCommercial and no-grant sources.

## What is NOT here
- No Tc/Pc/etc. copied from any experimental databank.
- No ions, salts, or electrolyte species (the DDBST harvest is neutral
  molecules); those arrive from other sources with their own (eNRTL/Pitzer)
  models.
- Reproduce: the venv + `gen_*.py` scripts (chemicals/thermo/rdkit).
