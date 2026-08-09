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
- **The doctrine covers DECISIONS, not only values** *(extended 2026-08-05)*.
  A rule about what an absent input means — a default, a fallback, a
  substitution — is a derived fact about the contract, and copies of it drift
  exactly as numbers do.

### 3a. Why the extension was needed

It was not reasoned to; it was measured.  The silent-fallback audit found
eight cases, and **four of them had a correct sibling already in the tree** —
the same question answered properly a few lines or a few files away.  The
sharpest pair sits two lines apart in one function: the *reverse* reaction
order defaults meaningfully, to the product stoichiometry that detailed
balance requires, while the *forward* order defaulted to a silent `0` — which
drops a reactant out of its own rate law.

That is not two bugs.  It is one decision — *what does an absent `order`
mean?* — living in five places (`RateLaw` and the four reactors), and the
copies diverging as each was improved separately.

The tree even recorded the moment the diagnosis was made and the wrong remedy
applied.  A comment in `BatchReactor.cpp` explained that requiring the key in
the batch vessel alone made the same shared reaction library legal in a CSTR
and illegal there — so the requirement was **dropped**, making the loose
reading uniform instead of the strict one.  The inconsistency was real and it
was resolved downward.  With one home, the asymmetry that forced the retreat
does not exist.

Corollary, stated so it is checkable: **when the same question is answered in
more than one place, the answers are not two implementations — they are one
decision with a second home**, and the fix is to give it a single one, not to
make the copies agree.

### 3b. Two founding decisions are asserted, not argued

Stated here because silence would read as agreement, and because this section
is where a reader looks for the reasoning behind a CLOSED decision.

**Make + custom rules, no CMake** and **file-first dictionaries, never
YAML/JSON/TOML** are recorded as settled and are nowhere reasoned — not in
`CLAUDE.md`, not in `docs/design/`, not here.  They may well be right; the
point is that a reader who was not present cannot tell why, and *"it was
decided"* is not an argument.

The other three founding decisions ARE argued, contrary to what the decision
index first claimed: C++17-without-external-libraries in the licence policy
and the COSMO reversal, explicit factories in `CLAUDE.md` §5 (pedagogical
clarity, the static-init order fiasco, pattern consistency), and one-binary-
per-problem-class at least as to its boundary.

Correcting that overcount is itself the lesson: the index measured the corpus
once and then remembered its answer.  See
[`decision-records.md`](decision-records.md) §4.

## 4. Things this project will NEVER do

*Moved verbatim from `CLAUDE.md` §10, which may no longer define them.*

- **Never** suggest a Python rewrite or wrapper.
- **Never** add macro magic for self-registration (RTS-style macros).
- **Never** import a heavy CFD framework, or any heavy dependency.
- **Never** joke about "$N in tokens replacing commercial software" — it reads
  as a flippant signal about work that is neither.
- **Never** skip alignment when proposing architecture changes: make a
  proposal, wait for confirmation, then code.  **Amended 2026-08-08 (Vítor,
  [`queue-ruling-2026-08-08.md`](../design/queue-ruling-2026-08-08.md) C1):**
  an item classified DELEGATE-WITH-DEFAULT may ship immediately once the
  default is stated and the decision recorded, provided it is reversible,
  gate/regression-guarded, and non-constitutional.  Reserved to Vítor
  regardless: licence, authorship, trademarks, new data curation, public
  compatibility commitments, and the fundamental thermo/case-format
  architecture.  Silence is NOT a decision mechanism — an item needing an
  objection window was misclassified and is CONSTITUTIONAL; and if
  implementation reveals a delegated item crosses a reserved boundary, stop
  and escalate (this clause fired on its first day: the D1 Wilson item).
  **Companion rule, same day:** low external-validation coverage is NOT
  architectural incompleteness; settled architecture reopens only on the
  conditions in
  [`verification-and-validation.md`](verification-and-validation.md) §6.
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

## 5a. WHEN THE ARCHITECTURE IS CONSOLIDATED (ruled by Vítor, 2026-08-09)

**This is a project-management constraint as much as an architectural one.**
It exists because roughly eight weeks went into "finishing the last 10 %" of
the architecture and there was always another 10 % — because every newly
discovered defect was read as evidence that the architecture was still
incomplete.  That reading is wrong, and it is now banned.

**THE CRITERION.**

> The architecture is consolidated when new failures can be fixed by
> implementing, extending or validating existing abstractions **without**
> introducing a new architectural boundary, a duplicated source of truth, or
> a special-case path.

**THE OPERATIONAL STOPPING RULE.**

> Three consecutive substantial slices that fit inside the existing
> architecture without reopening a Level-1 or Level-2 boundary are evidence
> that the architecture is FROZEN.

**AFTER THAT POINT, A NEW FINDING DEFAULTS TO ONE OF FIVE CATEGORIES** — and
"architectural incompleteness" is NOT among them:

    bug · missing implementation · data gap · validation gap ·
    documentation gap

**REOPENING THE ARCHITECTURE** requires concrete evidence that a required
PHYSICAL CAPABILITY cannot be represented within the existing boundaries
without one of:

* duplicated machinery or a duplicated source of truth;
* a special-case path;
* a silent fallback;
* a contradiction between existing architectural contracts;
* or an essential physical state the current abstractions genuinely cannot
  represent.

**A disagreement with experiment, a missing model, a missing property datum,
a missing unit-operation branch, or a bug does NOT by itself reopen the
architecture.**  Say which of the five categories it is, and fix it there.

### 5a.1 The evidence that the condition is already met

Vítor's own reading of the 2026-08-09 work, recorded because the stopping
rule is an evidentiary test and this is the evidence:

* the TP/enthalpy incoherence was resolved by ENFORCING one existing stream
  meaning — no new boundary;
* SLE fitted inside the existing solid-equilibrium architecture with no
  freezer-specific solver;
* the seal machinery found a missing dependency THROUGH the existing
  provenance architecture;
* the model-boundary ledger found the same phenomenon in a second case
  (flash20, 42.86 kW) without a special-case repair;
* A1/A2 fit the already-declared inlet-analysis / reconciliation separation.

*"Those are not examples of new architecture being invented.  They are
examples of the existing architecture being exercised and completed."*

### 5a.2 The mode change

After A2 ships: **for at least two weeks of project work, assume the
architecture is consolidated and do not initiate architecture redesign
unless a finding explicitly passes the reopening test above.**  The focus
moves OUTWARD — implement capabilities already implied by the architecture;
external scientific validation; improve and promote the strongest tutorials;
strengthen a small number of plant/showcase cases; fix bugs; close
data/provenance gaps.

If during that period no required capability demonstrates that a genuinely
new architectural boundary is necessary, the project **stops describing the
architecture as "90 % complete"**.  It is CONSOLIDATED, and the remaining
work is engineering, science, validation and product development —
categories that will never reach a meaningful 100 %.

### 5a.3 Why this is not gated

A text search cannot tell a live claim from a recorded one — the lesson the
prose-staleness attempts already paid for three times.  This rule binds
JUDGEMENT, and the honest enforcement is that every reported finding names
its category.  A finding claimed as architectural must show which of the
five reopening conditions it meets, in the same breath.

## 6. How this document is amended

By the architect, explicitly, in a commit that says so.  A contradiction
discovered between this document and the code is resolved in one of two ways
and no third:

- the implementation is wrong and is corrected; or
- the principle is revised **here first**, with the reason recorded.

Architectural truth is never permitted to emerge from the code by accident.
