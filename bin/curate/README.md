# Electrolyte catalogue importer (reproducible curation)

Regenerates `data/standards/electrolyte/{ions.dat,pairs.dat}` from the
**USGS PHREEQC `pitzer.dat`** (public domain). Deterministic; no hand-typed values.

```bash
curl -sSL https://raw.githubusercontent.com/usgs-coupled/phreeqc3/master/database/pitzer.dat -o /tmp/pitzer.dat
cd /tmp && python3 parse_pitzer.py    # -> ions.tsv, pairs_final.tsv
python3 gen_catalogue.py              # -> data/standards/electrolyte/{ions.dat,pairs.dat}
python3 validate_salts.py             # self-check: python kernel == C++ op (bit-for-bit)
```

- `parse_pitzer.py`   — parse the PHREEQC PITZER blocks (B0/B1/B2/C0) + master species.
- `gen_catalogue.py`  — emit the Choupo `.dat` catalogue (dict-safe names, MW corrected, provenance).
- `validate_salts.py` — python replica of the Pitzer kernel, used to build VALIDATION.md.

See `data/standards/parameters/electrolyte/PROVENANCE.md` for the licence manifest and
`docs/electrolyte-architecture.md` for the (deferred) ElectrolyteModel build spec.

## Overlay provenance index / datum-drift scan

```bash
bin/curate/overlay_index.py                 # scan data/standards + tutorials
bin/curate/overlay_index.py --drift-only    # only the disagreeing datums
bin/curate/overlay_index.py --md OVERLAY_INDEX.md
```

Read-only, repo-wide complement to the engine's per-RUN provenance (the
`[overlay]` line + the PairResolution log in the GUI).  Groups every `.dat`
overlay (case-local and per-unit `constant/...`) by the datum it carries and
**flags the groups whose numeric values disagree** — datum drift, the failure
mode the per-unit-folder flexibility invites.  Invents no new scheme: reads the
same files + their `provenance.source`.  Exit code 1 on drift (gates a curation
review).  NOT wired into `runTests` (some drift is intentional — e.g. the
`compA/compB/compC` artificial test fixtures).

## PHREEQC validation oracle (independent cross-check)

```bash
bin/curate/phreeqc_oracle.py                                  # the 3 shipped cases
bin/curate/phreeqc_oracle.py tutorials/props/electrolyte/pitzer_seawater_verify
bin/curate/phreeqc_oracle.py --markdown <case>               # print a VALIDATION.md block
```

Cross-checks the Choupo electrolyte stack against **native USGS PHREEQC**
(public domain): for each `speciate` op it translates the propsDict water
analysis to a PHREEQC `SOLUTION` block, runs PHREEQC on the **model-matched
database** (`pitzer.dat` for `activityModel pitzer`, `phreeqc.dat` for
`davies`), and tabulates Choupo vs PHREEQC per quantity (`SI_<mineral>`, `pH`,
`gamma_<ion>`, `I`) with PASS/FLAG against a stated tolerance.

Model-pairing caveats are **announced, not hidden**:
- `pitzer` → `pitzer.dat` is the **same HMW virial basis** Choupo imported →
  saturation indices are a *tight* cross-check; but pitzer.dat prints
  single-ion γ on the **MacInnes** scale (different single-ion convention) → γ
  is reported **FYI**, not gated.
- `davies` → `phreeqc.dat` defaults to **WATEQ-Debye-Hückel** (same *family* as
  Davies, not identical) → looser SI tolerance.
- Sulfate minerals (gypsum/anhydrite) under Pitzer FLAG by a documented
  **paired-vs-unpaired-SO₄** artifact: pitzer.dat keeps SO₄ fully dissociated
  (pure HMW), Choupo runs HMW *on top of* an ion-pairing speciation network.
  Carbonate (calcite) — the gate pin — is robust and agrees.

It is a **curation tool, NOT a build dependency**: `bin/runTests` never calls
it.  On a machine without PHREEQC it exits with a clear install-or-set message
(`CHOUPO_PHREEQC` / `CHOUPO_PHREEQC_DB` env overrides).  Writes nothing — the
`--markdown` block is *printed*; promoting it into `VALIDATION.md` is a human
curation act.
