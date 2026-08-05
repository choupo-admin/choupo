# Development governance — how work is done so the architecture survives

> **AUTHORITY: LEVEL 1**, ratified 2026-08-05.  Authority map:
> [`README.md`](README.md).
>
> The other constitutional documents say what the architecture IS.  This one
> says how work may be organised without destroying it.  It exists because the
> project is developed by a small number of humans directing a larger number of
> AI assistants, and that arrangement has failure modes the classical
> literature does not describe.

---

## 1. The finding this document is built on

Over one intensive development day (2026-08-04) every defect found in this
project was an **integration defect, not a production defect**:

| defect | what was wrong |
|---|---|
| the sealing importer did not know a new model's record home | a sealed case silently became a DIFFERENT model — it ran, it converged, nothing refused |
| a new activity model was unregistered | correct, self-tested, and unreachable by any case for a day |
| a curation script failed its own gate | it matched its own docstring; invisible until committed |
| the seal reporter checked the byte hash under a manifest that claims the parsed one | one schema behind the engine it audits |
| three subsystem dependency cycles | measured, unnoticed, undocumented |

**Nobody wrote wrong physics.**  Every unit of production was individually
correct.  What failed, every time, was a CONNECTION: between a new thing and a
distant thing, between a check and the thing it checks, between two subsystems.

This is the single most important fact about how Choupo fails, and every rule
below follows from it.

## 2. The governing asymmetry

> **Production does not parallelise here.  Verification does.**

Parallel production multiplies the integration surface, which is exactly where
this project breaks.  Seven correct slices that do not integrate are worth less
than two that do, because integration debt compounds and the only instrument
that detects it — the corpus — is serial.

Verification has the opposite shape.  The highest-yield finding of the last
month came from asking the **whole corpus one question**: *does every stream
carry both bases?*  Answer: 24 cases resolved ions, 23 had a gap, and the cause
was a guard written in the wrong place.  That question touched no files, needed
no build, could not conflict with any other question, and would have been
asked by nobody in the course of producing anything.

Hence the shape of any assisted-development fleet:

- **many read-only auditors**, each asking the whole corpus a different
  question, in parallel, conflict-free;
- **few producers**, on provably disjoint file sets;
- **one architect**, serial, owning integration and arbitration.

**Nothing merges without the architect's read**, because integration is the
failure mode and a fleet cannot check its own integration.

## 3. The three physical constraints

These are measured properties of this project, not preferences.

1. **The corpus is the bottleneck and it is serial.**  ~408 cases in one
   thread.  Producers needing a green suite queue on it regardless of how many
   there are.  **Never build while a suite runs** — doing so produced 36
   spurious failures in one measured instance, because relinking the shared
   library under a running binary yields exit 127.
2. **The working tree is not durable.**  The checkout has reverted to an older
   snapshot five times in a single session
   ([`environment-recovery.md`](environment-recovery.md)).  Work exists only
   once pushed.  This caps safe parallel work-in-progress far below what
   agent count alone would suggest.
3. **Coherence is the product.**  Choupo's value is not breadth; it is that
   everything is consistent, glass-box, one-home-per-fact.  Parallel production
   is a breadth instrument, and pointing it at a coherence project attacks the
   differentiator.  The comparison project this one takes its shape from
   achieved its consistency through few hands with deep context, not many hands.

## 4. The calibration rule

*Ratified 2026-08-05 after the architect asserted, in the same session as
writing the rule it violates, two claims about published standards he had not
read.*

> **A statement carries its provenance, exactly as a curated value does.
> Verified, or marked unverified BEFORE it is made — never after a reviewer
> catches it.**

The project already enforces this on data: an estimate is never dressed as a
measurement (I3).  The failure was exempting statements ABOUT the project from
the discipline applied to values INSIDE it.

Operationally:

- **Inside the repository** — `src/`, `data/`, `tutorials/`, the corpus — speak
  with authority, because the check can be run.  Run it.
- **Outside it** — standards, literature, dates, anything that cannot be opened
  — state the claim as unverified and name what would verify it.
- A claim that cannot be checked from here is recorded with its source and a
  verification action, not asserted.  See
  [`architecture-description.md`](architecture-description.md) §9 for the
  worked example.

This rule binds every agent and the architect equally.  It is the reason every
audit prompt in this project demands **CONFIRMED and SUSPECTED as separate
sections**: an assistant's confident unverified assertion is more expensive
than its silence, because it is indistinguishable from a measurement.

## 5. Rules for an assisted fleet

1. **Auditors are read-only.**  An agent that both finds and fixes cannot be
   trusted about what it found.
2. **Every finding carries file:line and a quotation.**  A finding that cannot
   be quoted is not a finding.
3. **Every finding states its failure scenario** — the concrete wrong answer a
   user would get, and why they would not notice.  If that scenario cannot be
   constructed, the finding is dropped, however plausible it looks.
4. **CONFIRMED and SUSPECTED are never mixed**, and a short CONFIRMED list
   outranks a long mixed one.
5. **Producers work on disjoint file sets**, declared before they start.  Work
   that touches shared or core files is serial, by the architect.
6. **Coverage is reported, not implied.**  An audit says how much it actually
   inspected, so a clean result cannot be mistaken for a complete sweep.
7. **A fleet finding becomes a contract only through the normal route**:
   written · refused by name · a case that FIRES the refusal.  An audit
   produces evidence, never authority.

## 6. Scaling discipline

Capacity is extended on **evidence, not on optimism**.  A new fleet shape is
trialled bounded and small; if its findings survive verification it scales, and
if they do not, that is reported as the result.  The architect states what he
does not know about a fleet's behaviour BEFORE it is funded, not after.

The first trial under this document: three auditors, three invariants
(I1 arity, I3 provenance, I5 silent fallbacks), read-only, one round.

## 7. Reporting

The architect reports upward at the level of **decisions, findings and risks** —
not activity.  A report says what was decided and on what evidence, what was
found and whether it survived verification, and what is now known to be wrong.
Volume of work is not an achievement; a defect found and closed is.
