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
>
> **Membrane module records have a narrower rule (2026-11-01, DEV.md 4c
> C189 slice 4).**  `bin/choupo-import-membranes` writes `kind
> membraneModule` records transcribed from a manufacturer catalogue into
> `data/local/assets/` -- never here.  That precedence line does NOT apply
> to them: `MembraneModuleRegistry` scans `data/standards/assets/` and a
> case's own `constant/assets/`, and does not read `data/local/assets/` at
> all (measured in `src/thermo/membrane/MembraneModuleRegistry.cpp`).  An
> imported record reaches a run by being copied into the case's
> `constant/assets/` with the membrane declared beside it (`module <name>;
> membrane <NF|RO record>;`), and reaches this tree only by a human reading
> the cited data sheet and writing the curated record (the NF270-4040 /
> SW30HR-380 shape).  Every imported record says `reviewStatus
> unverified;` and names the file, sheet and row each value came from.

## ⛔ Read-only — do not modify in place

Files under `data/standards/` are intentionally **write-protected**.
The simulator never writes here, and parameter-estimation runs deposit
results inside the case directory (see below).

To **alter** a standards file requires deliberate human ceremony:

```bash
# 1. Make the file writable
chmod +w data/standards/parameters/NRTL/ethanol-water.dat

# 2. Edit (or copy in a new version)
$EDITOR data/standards/parameters/NRTL/ethanol-water.dat

# 3. Restore read-only
chmod -w data/standards/parameters/NRTL/ethanol-water.dat

# 4. Commit with justification in the message
git add data/standards/parameters/NRTL/ethanol-water.dat
git commit -m "Update NRTL ethanol-water: refit against in-house 2026-05 VLE"
```

This deliberate friction is the point: standards should change rarely,
visibly, and with a documented reason.

## Layout

```
data/standards/                     one folder = one KIND of thing (M1-M5, 2026-07-16)
├── README.md  CATALOGUE.dat        this file + the frozen release id
├── components/   <name>.dat        UNIFIED substance records, FLAT by exact name
│                                   (identity + Antoine/Cp/Tc/omega + dissociatesTo/
│                                    speciesMap + solidPhases{} + crystal + cosmo/groups)
├── species/      aqueous.dat       ONE catalogue of aqueous model species (ion, charge,
│                                   MW, aqueousThermo) -- never fed to a flowsheet
├── chemistry/    <name>.dat        REAL equilibria, FLAT; recordType = the family
│                                   (aqueousSpeciation | gasLiquidEquilibrium |
│                                    ionExchangeEquilibrium), logK25 + dH + analytic(T)
├── methods/      <name>.dat        method declarations, FLAT; filename == selector name
│                                   (<family>.<name> in the dict); kind = consumer
├── parameters/   <MODEL>/...       interaction params by PAIR + group tables:
│                                   NRTL/ UNIQUAC/ Wilson/ Henry/ Pitzer/{pairs,theta,
│                                   psi,lambda,zeta} eNRTL/ SRK/ adsorption/ UNIFAC/
│                                   Joback.dat vanKrevelen.dat Yang2020.dat solution/
├── assets/       <name>.dat        physical kit, FLAT; kind = consumer (RO|NF|IEM|
│                                   constructionMaterial|adsorbent|ionExchangeResin|
│                                   membraneModule|membraneClass|feedSpacer|edStack); a
│                                   membraneModule carries its sheet's standard
│                                   test(s) as `ratedTest {}` or, several, each
│                                   as stated, `ratedTests ( {..} {..} );` --
│                                   grammar in docs/ai/unit-ops.md
├── mixtures/ · utilities/          predefined mixtures · plant utility services
└── (a case declares its system in constant/thermoPhysPropDict; sealing with
   bin/choupo-import mirrors the closure into the case's constant/ under a
   sha256 constant/propertyManifest, making the case runtime-self-contained)
```

## How cases override standards

A case may declare local overrides at:

```
<case>/constant/components/<name>.dat
<case>/constant/parameters/<model>/<c1>-<c2>.dat
```

These take precedence over standards.  (An override makes that RECORD
case-local; the case as a whole is runtime-self-contained only when SEALED
with `bin/choupo-import`.)

Parameter estimation runs write proposals next to the override file
with a date-tagged suffix:

```
<case>/constant/parameters/NRTL/ethanol-water.dat              ← active
<case>/constant/parameters/NRTL/ethanol-water.fit-2026-05-16.dat ← proposal
```

The active file is **only** the unsuffixed one; tagged variants are
dormant. To promote a fit, the user does `mv` manually.
