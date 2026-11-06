# CLAUDE.md -- Choupo case: steady/column19_mtbe_reactive_mesh

You are helping AUTHOR this Choupo **case** (the dicts under `system/` +
`constant/`), NOT editing the C++ engine.  The repo-root CLAUDE.md is about the
engine; HERE your job is this case.

## Orient yourself
- Authoring rules -- dict syntax, **UNITS ARE MANDATORY**, the unit-op catalogue,
  patterns, pitfalls: **run `bin/llmctx`** in the repo (it concatenates docs/ai/ -- dict syntax,
  the case-authoring guide; local + offline).  Deeper theory/user
  manuals: a Choupo repo's `docs/*.pdf` (`find / -name theoryGuide.pdf 2>/dev/null`)
  or the Choupo site's `/docs/`.
- The case's live state IS these dicts + the last run's results + the Decision
  Ledger.  Read them -- they are the source of truth (don't restate them here).

## How to work
- The **user decides, you enact**.  Never pick a model for them -- they choose
  from the evidence (the Props comparisons); you write the dict.
- Every dimensional value carries a **unit** (e.g. `Ea 50.2 kJ/mol`, `T 353 K`).
- **Promotion** = write the chosen model + fitted parameters into `constant/`
  (the unit op reads it).  Say what you changed; the change is a visible dict diff.

## Intent (this case) -- keep this updated as the project develops
- **Goal:** the witness that the rigorous (`fullMESH`) column carries a reaction
  that CHANGES THE NUMBER OF MOLES (methanol + isobutene <=> MTBE, Sum nu = -1),
  specified by `bottomsRate` + `boilupRatio`.
- **Decisions + why:** K_a(T) is the literature Eq. 15 of Izquierdo et al. 1992
  written as `lnKa` (never a number read off a simulator's result); isobutene's
  formation enthalpy is a case-local overlay from a measured heat of combustion
  (the catalogue's is a Joback estimate); no heat-of-reaction term is added to the
  stage energy rows (the elements datum already holds it).
- **Pending / in curation:** nothing is validated against a measurement of an MTBE
  column; the components' records are mostly `interim`.
