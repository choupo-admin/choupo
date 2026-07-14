# thirdParty/chemsep — ChemSep Database (Artistic License 2.0)

A **third-party property-data source**, kept separate from Choupo's GPL-3.0
code and carrying its own licence + attribution (see `NOTICE`).  It is **not** a
runtime dependency: Choupo's solver never reads from here.  An **offline
curation importer** (`bin/curate/chemsep_to_choupo.py`) converts selected
records into Choupo `.dat` form, staged in `data/proposed/` for human review.

## What goes here (you provide the files)
| File | What | Required for |
|---|---|---|
| `chemsep1.xml` | ChemSep pure-component database | component constants |
| `*.ipd` | binary interaction parameter sets (NRTL / UNIQUAC / Wilson) | binary pairs |
| `pcd/Artistic_license_2_0.txt` | licence text shipped with this exact databank | provenance hygiene |

Get them from the free ChemSep distribution (https://www.chemsep.org/).
**Do not** commit large raw databases unless intended; the
importer reads them from here and writes the curated subset to `data/local/`.

## Workflow (curate → review → promote)
```
1. drop chemsep1.xml (+ *.ipd) into this folder
2. python3 bin/curate/chemsep_to_choupo.py --dry-run --components-only
   python3 bin/curate/chemsep_to_choupo.py --components-only
      -> data/proposed/components/        (NEW component .dat, provenance-tagged)
      -> data/proposed/_chemsep_review/   (COLLISIONS: existing curated file kept)
      -> data/proposed/binaryPairs/{NRTL,UNIQUAC,Wilson}/  (binary pairs)
      -> data/proposed/CHEMSEP-IMPORT.md  (counts + per-record provenance + reports)
3. a human reviews the staged .dat (sets `reviewed true` in provenance)
4. ONLY then promote reviewed files into data/standards/  (a deliberate act)
```

## Rules (enforced by the importer)
- Never writes to `data/standards/`; never overwrites an existing curated file.
- Deduplicates chemical identities by CAS before considering the filename;
  same-name/different-CAS collisions are isolated under `_chemsep_review/`.
- Converts ChemSep critical pressure from Pa to Choupo's catalogue unit (bar)
  and emits an explicit Ambrose-Walton estimate when Tc/Pc/omega are present.
- Emits ONLY values present in the source — missing properties are skipped and
  reported, never fabricated.
- Every value carries `provenance { origin "ChemSep"; license "Artistic-2.0";
  sourceFile; ... reviewed false; }`.
- Unit conversions are reported; any non-trivial edit is marked `modified true`.
- EXCLUDED sources are refused outright: DIPPR, NIST WebBook/SRD, Aspen/HYSYS/
  PRO-II/UniSim databanks, or any record whose licence is unclear.
