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
    source        literature | fit | estimated;
    citation      "<text reference>";       // if literature
    fitData       "<path to CSV>";          // if fit; else "<not refit>"
    fitDate       "YYYY-MM-DD" | "<literature, ca. YYYY>";
    algorithm     "Levenberg-Marquardt" | "Nelder-Mead" | "<not reported>";
    chi2          <number> | "<not reported>";
    nDataPoints   <number>;
    confidenceIntervals { <param> <stderr>; … }   // optional
    validityRange { Tmin <K>; Tmax <K>; }
    author        "<who curated or fitted>";
    notes         "<free text>";
}
```

The `source` field distinguishes three categories:

* **`literature`** --- values copied from a textbook or DECHEMA volume,
  with explicit citation.  `fitData` is `"<not refit>"`.
* **`fit`** --- values regressed against experimental data within
  Choupo's parameter-estimation workflow.  `fitData` points to
  the CSV used; `chi2` and `confidenceIntervals` are populated.
* **`estimated`** --- values from a group-contribution method (UNIFAC
  prediction, etc.).  No experimental anchor.

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
