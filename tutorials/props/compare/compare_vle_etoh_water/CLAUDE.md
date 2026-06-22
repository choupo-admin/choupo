# CLAUDE.md -- Choupo case: props/compare_vle_etoh_water

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

## Intent (this case) -- keep this updated as the project develops
- **Goal:** The canonical "SEE, then DECIDE" props case. Ethanol/water T-x-y at
  1 atm with two model curves (ideal Raoult vs NRTL) overlaid on the measured
  VLE data, so the student picks the model from evidence, not from a badge.
- **Decisions + why:** NRTL for ethanol-water because the ideal (Raoult) model
  draws a smooth lens with no azeotrope, while the run shows the real
  minimum-boiling azeotrope at x ~ 0.88 ethanol / T ~ 351.3 K (~78.1 C);
  the experimental points fall on the NRTL curve, not the ideal one.
- **Pending / in curation:** none -- the three model scans (ideal, NRTL,
  UNIFAC) and the experimental overlay all run; the lesson is the overlay.
