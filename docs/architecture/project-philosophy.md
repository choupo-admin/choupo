# Project philosophy — the binding principles

> **AUTHORITY: LEVEL 1.**  This document, with
> [`CHOUPO-CONSTITUTION.md`](CHOUPO-CONSTITUTION.md),
> [`global-invariants.md`](global-invariants.md) and
> [`module-boundaries.md`](module-boundaries.md), is the constitutional layer.
> Authority map: [`README.md`](README.md).
>
> Ratified 2026-08-04.  It exists because the binding "never" rules lived in
> `CLAUDE.md`, which the authority index classes as level 4 — "derived
> DESCRIPTION of the contract, never its definition".  A level-4 document
> cannot define policy that binds the project, so either the index was wrong or
> `CLAUDE.md` was.  **The index is right; `CLAUDE.md` is an operational guide.**
> The rules moved here.  `CLAUDE.md` now references them and defines none.

---

## 1. What Choupo is for

An *educational* process simulator whose differentiator is **transparency and
customisation**, not breadth.  Every judgement below follows from that and from
nothing else:

1. **Pedagogical clarity** — can a student read the code and understand?
2. **Source transparency** — no hidden magic, no macros, no autogeneration.
3. **Licence purity** — see the CODE / DOCS / DATA split in `CLAUDE.md` §10.

The value is academic and reputational.  A change that improves an industrial
metric while reducing what a student can see is a change this project does not
want.

## 2. Numerical honesty — the anti-crutch principle

*Settled 2026-05-30.  The stance the project is named for.*

Every solver aid — an initial guess, a tear estimate, a bound — is
**first-class, explicit in the dict, and the student's to own**.  The solver
**announces** what it does to converge and never disguises it.

- Auto-initialisation is allowed but honest: propagate the *feeds* through the
  topology, never a magic universal constant.
- Bounds are optional aids that **report aloud when they bind**.
- The universal solve-everything solver is rejected; that is the
  equation-oriented dream, deferred in the roadmap and named as deferred.

> *All models are wrong, some are useful.*  The failure mode this principle
> exists to prevent is not a wrong number — it is a **right-looking number with
> no visible provenance**.

### 2a. Declare → verify → refuse

The operational form of the same principle, and the shape of nearly every
contract in this project:

- the **case DECLARES** what it wants (model, convention, tear, chemistry);
- the **engine VERIFIES** the declaration against what it can actually do;
- a violation is **REFUSED BY NAME, with a remedy** — never defaulted, never
  silently substituted, never warned-and-continued where the answer would be
  wrong.

A warning that lets a wrong answer through with exit code 0 is the failure this
project treats most seriously, because it is the one a user cannot detect.

## 3. The arity doctrine

**A derived fact has exactly one home.**  A second home is not redundancy, it is
a divergence with a delay fuse: the copies agree until the day they do not, and
nothing detects the day.

Corollaries, each paid for at least once:

- *Trees never store derivatives.*  A value computable from declared data is
  computed, not stored beside them.
- A generated number (a corpus count, a version stamp, a coverage tally) has a
  generator and a staleness gate — never a hand-maintained copy, **including in
  documentation**.
- When two doctrines collide over where a shared fact lives, see
  [`module-boundaries.md`](module-boundaries.md) §4: the shared logic goes to
  the lowest **neutral** layer that can own its concepts without acquiring
  upward dependencies.

## 4. Things this project will NEVER do

*Moved verbatim from `CLAUDE.md` §10, which may no longer define them.*

- **Never** suggest a Python rewrite or wrapper.
- **Never** add macro magic for self-registration (RTS-style macros).
- **Never** import a heavy CFD framework, or any heavy dependency.
- **Never** joke about "$N in tokens replacing commercial software" — it reads
  as a flippant signal about work that is neither.
- **Never** skip alignment when proposing architecture changes: make a
  proposal, wait for confirmation, then code.
- **Never name a commercial competitor in the USER-FACING MANUALS** (settled
  2026-07-03).  This covers everything a user reads: the `docs/` guides,
  tutorial `controlDict` / `flowsheetDict` header comments and `description`
  strings, the tutorials catalogue, and GUI-visible copy.  Describe the
  *concept* generically instead — "commercial process simulators", "a detailed
  exchanger-rating tool", "the standard industrial design workflow".  Do not
  carry a competitor trademark attribution in a manual's front matter: if the
  mark is never used, none is owed.  Source comments and commit messages are
  developer-facing, not manuals — a passing reference there is tolerated,
  though the generic phrasing is preferred there too.
  Enforced by `check_doctrine` (the `competitors` surface).

## 5. Decisions that are CLOSED

Reopening one of these costs the project more than any gain it could produce.
Each was argued, decided, and is enforced somewhere.

| Decision | Settled |
|---|---|
| C++17, no external libraries (no Boost/Eigen/Sundials — hand-rolled Newton, Gauss, RK4, Michelsen) | founding |
| Make + custom rules; no CMake | founding |
| Explicit factory registration; no auto-registration | founding |
| File-first case layout: dictionaries everywhere, never YAML/JSON/TOML | founding |
| One binary per PROBLEM CLASS, never per numerical strategy | founding |
| GPL-3.0-or-later; no CLA, no copyright assignment, no commercial dual-licence, no closed modules | 2026-06-18 |
| Brand casing: `CHOUPO` (brand surfaces) / `Choupo` (prose) / `choupo` (code) | 2026-06-04 |
| `components/` stays physically FLAT; exact-name resolution, no startup directory walk | 2026-06-07 |
| The GUI is a runner and visualiser, **not** an editor | 2026-05-16 |
| Property estimation is a CURATION-time resolution problem, not a runtime one | 2026-06-05 |
| The repository is English (US) in every artifact | 2026-08-04 |

The full rationale for each lives in `CLAUDE.md` §10 and in the design records
indexed by [`decision-records.md`](decision-records.md).  This table is the
list; those are the arguments.

## 6. How this document is amended

By the architect, explicitly, in a commit that says so.  A contradiction
discovered between this document and the code is resolved in one of two ways
and no third:

- the implementation is wrong and is corrected; or
- the principle is revised **here first**, with the reason recorded.

Architectural truth is never permitted to emerge from the code by accident.
