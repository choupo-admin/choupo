# CLAUDE.md -- Choupo case: steady/process04_research_workflow

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
- **Goal:** <what this case is for>
- **Decisions + why:** <e.g. NRTL for ethanol-water because ideal misses the azeotrope>
- **Pending / in curation:** <what is still open>
