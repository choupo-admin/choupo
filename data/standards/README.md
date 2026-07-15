# `data/standards/` — Curated, read-only reference data

This directory holds the **canonical reference data** the simulator
loads by default when a case does not provide local overrides. Files
here are **literature values curated by Vitor Geraldes** with
explicit provenance metadata in each file.

> **VERIFIED tier only.** Everything in `data/standards/` is human-curated and
> trusted. UNVERIFIED, machine-ingested or estimated data does **not** live here
> — it lives in the sibling **[`../local/`](../local/)** tree, a *gitignored,
> private* working tier the runtime reads when present (loud `[local] UNVERIFIED`
> warning at load). The public `proposed/` tier was retired 2026-07-13. Resolution
> precedence is `inline / case-local / snapshot > standards > local > idealDefault`,
> so a verified entry here always shadows a same-named `local` one (local only fills
> gaps). Keep this tree clean: if a file here is an estimate or carries a
> licence-encumbered value, it is in the wrong tier.

## ⛔ Read-only — do not modify in place

Files under `data/standards/` are intentionally **write-protected**.
The simulator never writes here, and parameter-estimation runs deposit
results inside the case directory (see below).

To **alter** a standards file requires deliberate human ceremony:

```bash
# 1. Make the file writable
chmod +w data/standards/binaryPairs/NRTL/ethanol-water.dat

# 2. Edit (or copy in a new version)
$EDITOR data/standards/binaryPairs/NRTL/ethanol-water.dat

# 3. Restore read-only
chmod -w data/standards/binaryPairs/NRTL/ethanol-water.dat

# 4. Commit with justification in the message
git add data/standards/binaryPairs/NRTL/ethanol-water.dat
git commit -m "Update NRTL ethanol-water: refit against in-house 2026-05 VLE"
```

This deliberate friction is the point: standards should change rarely,
visibly, and with a documented reason.

## Layout

```
data/standards/
├── README.md                       (this file)
├── components/                     pure-component property files
│   └── <name>.dat                  Antoine, Cp, Tc, ω, …
└── binaryPairs/                    interaction parameters per activity model
    ├── README.md                   naming + format conventions
    ├── NRTL/
    │   └── <c1>-<c2>.dat
    ├── Wilson/
    │   └── <c1>-<c2>.dat
    └── UNIQUAC/
        └── <c1>-<c2>.dat
```

## How cases override standards

A case may declare local overrides at:

```
<case>/constant/components/<name>.dat
<case>/constant/binaryPairs/<model>/<c1>-<c2>.dat
```

These take precedence over standards.  The case is **self-contained
and reproducible** if the override file is present.

Parameter estimation runs write proposals next to the override file
with a date-tagged suffix:

```
<case>/constant/binaryPairs/NRTL/ethanol-water.dat              ← active
<case>/constant/binaryPairs/NRTL/ethanol-water.fit-2026-05-16.dat ← proposal
```

The active file is **only** the unsuffixed one; tagged variants are
dormant. To promote a fit, the user does `mv` manually.
