# Binary interaction parameters --- naming and format

## Folder layout

One subfolder per activity-coefficient model:

```
binaryPairs/
├── NRTL/        (shipped)
├── Wilson/      (shipped)
└── UNIQUAC/     (shipped -- canonical DECHEMA binaries, imported from ChemSep)
```

The UNIQUAC set was imported from the ChemSep database (Artistic-2.0) via
`bin/curate/chemsep_to_choupo.py` and promoted after review; each file keeps the
raw cal/mol `source{}` block alongside the converted `parameters{}` (see any
file's `provenance`).  The model name in the folder must match the dict `model`
keyword inside each file.

## Naming convention

Each file holds the interaction parameters for one component pair:

```
<c1>-<c2>.dat
```

where `c1` and `c2` are component names **in alphabetical order** (so
`ethanol-water`, not `water-ethanol`).  The simulator normalises the
order when looking up a file.

Variants of the same pair carry a tag suffix:

```
<c1>-<c2>.dat                       (canonical / active)
<c1>-<c2>.<tag>.dat                  (variant, ignored unless explicitly referenced)
```

**The unsuffixed file is the canonical set the simulator loads.** Tagged
files are dormant alternatives kept for history or comparison.

Typical tags:

| Tag | Meaning |
|---|---|
| `PPO5`           | Poling, Prausnitz, O'Connell 5th ed. |
| `dechema-vol-1`  | DECHEMA VLE Data Collection Vol I |
| `myLab-2026-05`  | own laboratory fit, dated |
| `vendor-default` | a vendor's default parameters (for comparison) |

Tags are free-form lowercase-hyphenated; the **provenance block inside
the file is the truth**, the tag is only a filename hint.

## File format

Every file is an Choupo dict with three blocks:

```
components  ( <c1>  <c2> );        // alphabetical
model       NRTL;                   // matches enclosing folder

parameters
{
    // model-specific entries (e.g., a_ij, b_ij, a_ji, b_ji, alpha for NRTL)
}

provenance
{
    origin        literature | regressed | predictive | estimated | assumed | placeholder;
    source        "<optional raw source label / dataset id>";   // TEXT, never a class
    citation      "<primary reference>";
    method        "<how the values were produced>";             // e.g. "Levenberg-Marquardt"
    methodVersion "<stable method/table id>";                   // for deterministic estimates
    fitData       "<path to CSV>";          // if regressed; else "<not refit>"
    fitDate       "YYYY-MM-DD" | "<literature, ca. YYYY>";
    chi2          <number> | "<not reported>";
    nDataPoints   <number>;
    confidenceIntervals { <param> <stderr>; … }   // optional
    validity { temperature { min <T> K; max <T> K; } note "..."; }
    promotedDespite { identifiable 0; reason "..."; by "..."; date "YYYY-MM-DD"; }  // ONLY on an overridden promotion
    author        "<who curated or fitted>";
    notes         "<free text>";
}
```

**`origin` is the TYPED provenance class** — ranking, resolution priority and
every badge/policy read it.  The canonical classes:

* **`literature`** — measured values from a cited primary source.
* **`regressed`** — fitted to experimental data inside Choupo's fit workflow
  (`fitData`/`chi2`/`confidenceIntervals` populated).
* **`predictive`** — a MODEL's prediction transcribed as a value (a
  UNIFAC-derived surrogate).  Announced on every run that consumes it.
* **`estimated`** — group contribution from the substance's own structure.
* **`assumed`** — an engineering assumption the curator owns (e.g. null
  coefficients = ideality).
* **`placeholder`** — a stub awaiting real values; loudly flagged.

`source` and `citation` are TEXT — a source label and the primary reference —
never a second origin class.  A curated (standards) pair file MUST declare
`origin`; the engine refuses it otherwise.  `promotedDespite` is the auditable
record of a human promoting past a diagnostic: all four fields are required,
and every run that consumes such a pair repeats the warning.

This metadata is the difference between this database and an opaque
proprietary one. Every consumer can audit every number.

## Adding a new pair

For a new component pair under NRTL:

```bash
# 1. Verify the file does not already exist (alphabetical order)
ls data/standards/binaryPairs/NRTL/ | grep -i benzene
ls data/standards/binaryPairs/NRTL/ | grep -i methanol

# 2. Make the directory writable (it is read-only by default)
chmod +w data/standards/binaryPairs/NRTL/

# 3. Create the file (use an existing one as template)
cp data/standards/binaryPairs/NRTL/ethanol-water.dat \
   data/standards/binaryPairs/NRTL/benzene-methanol.dat

# 4. Edit components, parameters, provenance
$EDITOR data/standards/binaryPairs/NRTL/benzene-methanol.dat

# 5. Restore read-only
chmod -w data/standards/binaryPairs/NRTL/benzene-methanol.dat
chmod -w data/standards/binaryPairs/NRTL/

# 6. Commit
git add data/standards/binaryPairs/NRTL/benzene-methanol.dat
git commit -m "Add NRTL benzene-methanol from DECHEMA Vol I Part 2a, p. 234"
```
