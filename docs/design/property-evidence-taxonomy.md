# Evidence taxonomy for property records

> **KIND: ADR · STATUS: CONTRACT DECIDED 2026-08-10 · AUTHORITY: LEVEL 2
> (binds the current thermophysical-properties consolidation).**
> Directive from Vítor, 2026-08-10.  **No implementation is authorised by
> this record.**  It fixes the vocabulary and the refusal doctrine now,
> because every record the consolidation touches will otherwise have to be
> re-tagged later.

---

## 1. The invariant

> **downloaded is not curated · fitted is not measured · generated is not
> authoritative**

Three sentences, one property: **how a number came to exist is part of what
it means**, and a record that does not say cannot be reasoned about. This is
not new doctrine — it is the existing `[local] UNVERIFIED`, `[estimate]`,
`[unreviewed]` announcements generalised into one vocabulary, and made
machine-readable so the solver can act on it instead of only printing it.

## 2. The tags

Every property value carries an **`origin`**, exactly one of:

| `origin` | meaning | additionally required |
|---|---|---|
| `curatedMeasured` | a measured value, reviewed into the standard catalogue against its primary | primary citation (author/journal/DOI or equivalent) |
| `importedMeasured` | a measured value taken from an external compilation, NOT yet reviewed | source dataset identity + DOI/accession; the compiler is NOT the primary |
| `fitted` | a parameter regressed against data | method, the dataset fitted, and the fit residual |
| `estimated` | produced by a correlation/group method with no data for THIS substance | the method (Joback, Lee-Kesler, …) |

and a **`reviewStatus`** ∈ `reviewed` · `interim` · `candidate`, orthogonal
to `origin`: the first says *what kind of thing this is*, the second says
*who has vouched for it*. They are separate because a measured value can be
unreviewed and an estimate can be deliberately accepted — collapsing them
would make one of those inexpressible.

## 3. The refusal doctrine — declare → verify → refuse

**The solver refuses an unreviewed candidate record unless the case
explicitly opts in.** The opt-in is a declaration in the case, not a flag on
the command line and not an environment variable: what a run is allowed to
consume is a property of the case, so it belongs where the case is read and
travels with it into the seal.

This is the existing posture (`approximations { … }` authorises a delimited
approximation; an authorisation may not shadow a declared model) applied to
data rather than models. The consequence worth stating: **a fresh candidate
record cannot silently become truth by being used.**

## 4. The missing-component workflow

A flowsheet naming an absent component must not dead-end in an error, and
must not be rescued silently either:

1. the engine refuses, naming the component **and reporting that candidate
   external data exists** (or does not);
2. `choupoProps acquire <component>` builds a **candidate** record;
3. that record states, per property, what was **found** / **estimated** /
   **missing** / **validated**;
4. it enters at `reviewStatus candidate` — usable only under §3's explicit
   opt-in, and promoted to `reviewed` only by a human curation act.

**Never a silent error; never silent promotion to curated truth.**

## 5. Alternatives considered, and why they were rejected

**(a) One `trusted` boolean.** Rejected: it cannot distinguish "measured but
nobody checked it" from "estimated and we know it", and those demand
different remedies — review versus measurement. A boolean forces the two
into one bucket and the remedy becomes unguessable.

**(b) Trust by LOCATION — `standards/` is true, `local/` is not.** Rejected:
that is today's rule, and it is why the audits kept finding unsourced values
INSIDE `standards/`. Location is an administrative fact; evidence is a
property of the value. (The two tiers stay — they answer a different
question, namely what is public.)

**(c) A numeric confidence/uncertainty score.** Rejected as the PRIMARY tag:
a single number invites arithmetic that is not justified (combining scores
across a chain), and it hides the categorical distinction that actually
drives the refusal. Measurement uncertainty remains a separate, per-value
datum where the primary reports one — it is evidence, not a substitute for
the taxonomy.

**(d) Tag only at import.** Rejected: `fitted` is produced INSIDE CHOUPO by
`fitBinaryPair`, and an untagged fitted parameter is exactly the "fitted is
not measured" failure. The taxonomy must cover values the engine itself
mints.

## 6. Consequences

* Every curated record gains two required fields; unfielded records become a
  migration list, not a silent legacy.
* The solver gains a refusal path that today does not exist, and cases that
  want candidate data must say so — some existing cases will have to
  declare an opt-in they currently get for free.
* `origin` is precisely the `evidence` leaf-tag of ADR
  `numerical-provenance-contract.md` §2: the two records are one design, and
  neither is implementable alone.
* **Enables** the machine-enforced fit/held-out split of the ThermoML pilot
  (roadmap): a dataset that fitted a parameter is recorded IN that
  parameter, so re-using it as validation is detectable rather than a matter
  of discipline.

## 7. Status

Contract decided. Implementation UNAUTHORISED. `choupoProps acquire` is
named here, not designed here.
