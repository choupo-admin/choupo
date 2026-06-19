# CLAUDE.md -- Choupo case: plant/esterification2sector

You are helping AUTHOR this Choupo **case** (the dicts under `system/` +
`constant/`), NOT editing the C++ engine.  The repo-root CLAUDE.md is about the
engine; HERE your job is this case.

## Orient yourself
- Authoring rules -- dict syntax, **UNITS ARE MANDATORY**, the unit-op catalogue,
  patterns, pitfalls: run `bin/llmctx` from the repo root (or read `docs/ai/`).
- The case's live state IS these dicts + the last run's results + the Decision
  Ledger.  Read them -- they are the source of truth (don't restate them here).

## How to work
- The **user decides, you enact**.  Never pick a model for them -- they choose
  from the evidence (the Props comparisons); you write the dict.
- Every dimensional value carries a **unit** (e.g. `Ea 50.2 kJ/mol`, `T 353 K`).
- **Promotion** = write the chosen model + fitted parameters into `constant/`
  (the unit op reads it).  Say what you changed; the change is a visible dict diff.

## Intent (this case) -- keep updated as the project develops
- **Goal:** a two-sector fractal plant (REACTION + SEPARATION) to exercise the
  unified props/thermo + per-sector `constant/`.  Esterification
  AcOH + EtOH -> EtOAc + H2O, then a flash split.
- **Sectors (THERMO REGIONS), each one unit op:**
  - `REACTION` -- a CSTR (`reactor`); kinetics curated in `REACTION/constant/`.
  - `SEPARATION` -- an isothermal flash; ethyl-acetate–water NRTL pair is
    particular to this sector; ethanol-water inherited from the standard library.
- **Decisions + why (defended by the Props evidence):**
  - SEPARATION VLE: **NRTL** -- the x-y comparison shows ideal has NO azeotrope
    (its curve never meets y=x), NRTL/Wilson meet it at x ~ 0.88.
  - REACTION kinetics: **2nd order** -- single-isotherm fit R^2 0.9994 (order 1
    only 0.973); multi-T Arrhenius gives **Ea ~ 50.2 kJ/mol, k0 ~ 2.7e4**.
- **Pending / in curation:**
  - The plant is UNWIRED (curation phase): `system/flowsheetDict` has `children`
    but the connections are commented out.  Wire them to simulate.
  - **Disconnect to resolve:** `REACTION/constant/reactions` still carries the
    PLACEHOLDER `A 1.0e8; Ea 7.0e4` and pseudo-1st-order, NOT the fitted
    2nd-order / Ea 50.2 kJ/mol.  Promote the fit (the user's call on the mapping).
