# Choupo domain glossary

> **AUTHORITY: LEVEL 1** for the terms marked **CANONICAL** and **BANNED**.
> Authority map: [`README.md`](README.md).  Ratified 2026-08-05.
>
> Terms marked **DECISION QUESTION** are *not* ratified.  They are drafted,
> argued, and given a recommendation, and they wait for Vítor.  They are here
> rather than in a deferred backlog because the rest of the glossary is usable
> without them, and holding the whole document for a handful of contested words
> would be the failure this layer exists to prevent.

---

## 1. What this is, and what it is not

This is the vocabulary Choupo uses **in the tree**: in dictionaries, in
refusal messages, in identifiers, in documentation.  It exists because the
project's contracts are written in prose, and a contract whose words drift is
not a contract.

Every entry below is drawn from a **recorded correction** — a place where the
project used a word one way, found it wrong, and said so.  Nothing here is
invented for completeness.  Where no correction exists, no entry exists: a
glossary that defines terms nobody has misused is padding, and padding is how
a glossary stops being read.

**It is not a textbook.**  It does not define *distillation* or *fugacity*.
It defines only where Choupo's usage is (a) narrower than the field's,
(b) a coinage, or (c) a deliberate departure that a reader must know about.

**A note on 24765.**  ISO/IEC/IEEE 24765 (SEVOCAB) is the published vocabulary
for software and systems engineering, and
[`architecture-description.md`](architecture-description.md) §9 committed to
consulting it "so no term is coined against an established meaning".  That
consultation surfaced exactly one collision with an established meaning, and
it is the sharpest entry in §5 (G2).  The consultation is working knowledge,
not a licensed copy — the same caveat as the 42010 assessment, and it is
recorded in §6 as an action.

**Checking the draft against the tree changed it twice**, which is the
argument for doing that rather than writing from memory: one ban turned out to
be enforced in practice and worth saying so, and one turned out to be
*stricter than what was settled* and contradicted by the engine and by level-1
architecture text (G7).  A glossary written from recollection would have
legislated the second.

## 2. How to read an entry

| mark | meaning |
|---|---|
| **CANONICAL** | this is the word; it binds documentation, identifiers and refusal text |
| **BANNED** | do not write this; the canonical replacement is named |
| **DECISION QUESTION** | drafted and argued, awaiting a ruling; the recommendation is stated |

---

## 3. Banned wordings and their canonical replacements

These are decided.  Each was in the tree, each was removed, and each has a
gate or a settled note behind it.

| banned | canonical | why |
|---|---|---|
| **"true species"** | **species**, or the concrete category — **aqueous species** / **gas species** / **solid species** (`recordType modelSpecies`) | "true" invites the reading *these are the real chemicals*, when the code means only *the species the equilibrium solver works in*.  A student reads a philosophical claim that nobody intended.  Both bases are models. |
| **"true basis"** | **aqueous-species basis** | same defect at the level of the basis. |
| **"apparent"** | *(nothing — it is CORRECT)* | listed here because the earlier blanket rule condemned it by accident.  It has a precise meaning in electrolyte thermodynamics and is an accepted architectural term.  See §3a. |
| **"optimal" (of a heat-exchange match)** | **thermodynamically admissible candidate** | the pinch pass enumerates matches that violate no thermodynamic bound.  It does not rank them, cost them, or rewrite the network.  Calling a candidate optimal claims an optimisation nobody ran.  Gate-enforced. |
| **`final/`** (a state directory) | **`converged/`** | the name is a contract: the directory is written only when the solver converged, and a non-converged recycle now exits 1 without writing it.  "Final" would be true of a failed run too. |
| **`ReferenceRung`** (as a type) | *(nothing — do not build one)* | the reference basis is a **consequence** of the declared formulation (the one-knob rule), never an independent selector.  The name appears in old notes as a planned type and was never built. |
| **"promote" (of a GUI component)** | **activate** | *promote* is reserved for the manual disk step in curation. |

### 3a. The rule, in its objective form (ruled by Vítor, 2026-08-05)

The doctrine used to read *"do not use apparent/true"* — one sentence over two
words that fail differently.  That made it **unenforceable**, because
`CLAUDE.md` itself, the level-1 architecture and the engine's own comments all
use *apparent* as a term of art.  A gate could not be written against a rule
its own constitution broke.

The ruling narrows it, and the narrowed form is checkable:

> ***apparent*** **is an accepted architectural term.**  ***true*** **is
> deprecated in user-facing architecture and documentation.  Use *species* —
> or the concrete category: *aqueous species*, *gas species*, *solid
> species*.**

Why the halves are not symmetric:

- **apparent** carries a precise, established meaning in electrolyte
  thermodynamics — apparent components versus species — and Choupo already
  uses it at the architectural level.  It claims nothing about reality; it
  says *as it appears in the flowsheet*.
- **true** means, internally, *the species the equilibrium solver works in*.
  What a reader takes from it is *these are the real chemicals*.  The gap
  between those two is the whole defect, and it lands on students first.

**This is what made the wording gate possible.**  Before the ruling, an
enforcement pass had to decide whether *apparent* was a violation or the
vocabulary, and no honest gate can be written on that.  `check_glossary_bans`
exists because the rule became objective.

## 4. Canonical definitions

### 4.1 Substance and basis

**Component** — CANONICAL.  A substance the **flowsheet** carries: what a
stream's `componentMolarFlows` names, what a case declares, what the solver's
state vector holds.  Typed `ComponentId`, with no implicit conversion to
anything else.

**Species** — CANONICAL.  A substance a **model** works in: an ion, a
complex, a derived neutral.  Typed `SpeciesId`.  The crossing from component
to species goes **only** through a declared stoichiometric bridge
(`aqueousMapping`, or `dissociatesTo` converted at load) — **never through
name identity**, which is the whole point of the typing.

> In general chemical-engineering usage these two words are interchangeable.
> In Choupo they are not, and the distinction is enforced by the type system.
> See G4.

**The two bases** — CANONICAL.  Where the package can resolve ions, a stream
carries **both**: the flowsheet basis (the components, which *are* the state)
and the aqueous-species basis (a `speciation {}` block that decomposes the
liquid).  Neither is more real; the reader verifies `m = A n` against the
same declared bridges the writer used.

**Apparent** — CANONICAL, and **not banned** — see G7, which is the finding
that writing this glossary produced.  It is the engine's own word for a
quantity expressed per component while the model worked per species: "the
effective apparent K", "the apparent basis is never disturbed".  *Flowsheet
basis* is the preferred term in new prose; *apparent basis* is in active use
and is not a defect.

### 4.2 Provenance and data

**Primary** — CANONICAL.  The publication where a value first appeared, with
authors, volume and year.  A journal article, a monograph, a standards body's
own tables.

**Access route** — CANONICAL.  Where a value was *read*.  An aggregator
(a handbook, a web database) is an access route and is cited after a `via`.
**Where you read a number is not where it came from**, and the gate
`check_source_licence` enforces exactly that distinction: the same aggregator
name is compliant after `via` and a violation as the subject of a `source:`
field.

**Estimate** — CANONICAL, and narrow.  A value produced by a correlation or a
group-contribution method rather than by measurement.  An estimate is labelled
as one at its home.  An estimate presented as a measurement is the failure
invariant I3 exists to catch.

**Curation** — CANONICAL.  The act of putting a value into the tree, with its
provenance and its validity window.  Curation is a **human** act reviewed by a
human; the engine refuses to write under `data/standards/`.

**Resolver** — CANONICAL, and **reserved for curation-time estimation** of a
*value*.  The runtime never resolves a value.

> The word appears at runtime in exactly one place, `src/thermo/RecordResolver`,
> and that is not a violation: it resolves a **record's location** under the
> sealing contract, not a value by estimation.  The reservation is on the
> object, not the verb — recorded here so the next reader does not file it as
> a defect, and so nobody widens it by analogy.

**Builder** — CANONICAL.  The runtime step that loads and assembles a declared
property package (`ThermoPackageBuilder`).  It **never estimates**.  If a
datum is missing, the builder refuses and names the curation remedy.

**Standards / local** — CANONICAL, and the only two data tiers.
`data/standards/` is curated and public; `data/local/` is private and
gitignored.  A `local` consumption is announced `[local] UNVERIFIED`.  There
is no public middle tier — the old `proposed/` was retired precisely because a
public lower-trust tier is how third-party values get redistributed.

### 4.3 Case, flowsheet and state

**Case** — CANONICAL.  A directory: `system/`, `constant/`, `0/`, and a
`.cho` marker.  A single isolated unit is a case whose `flowsheetDict` has
length 1.  There is no "standalone" mode.

**Unit** (unit operation) — CANONICAL.  A node in the flowsheet graph, with a
`type`, an optional `model`, and an `operation` block.  A unit is **not** a
piece of equipment: equipment is a post-processing realisation
(`designDict` → `design/`), and one unit may become several.

**World** — CANONICAL (a Choupo coinage).  The thermodynamic context a unit
computes in: its resolved property package, which may be the global one or a
per-unit `thermo {}` override.  A flowsheet may run units in different worlds
on one global component set.  See G3.

**Model boundary** — CANONICAL.  The seam between two worlds.  It is **not a
physical device**, so there is no real ΔT to absorb: `H` is the conserved
truth, `T` is the model-dependent readout, and the default is hold-T /
let-H-jump so the discontinuity is visible rather than hidden in a T-nudge.

**Tear** — CANONICAL, and it means a **declared cut of a real cycle**.  It is
not a place to inject a guess into an acyclic graph, and it is not a lagged
stream (deliberate lag is a separate, unbuilt feature).  A declared tear that
closes no cycle is refused by name.

**Seal** — CANONICAL.  A case's self-containment claim: its property records
are mirrored into `constant/` and pinned by hash, and the runtime is forbidden
the installation catalogue.  Since the computational migration the claim is
over the **parsed content**, so formatting drift is *cosmetic* (announced,
verdict intact) and a moved value is *damage* (refused).

> **The seal must not change the physics.**  A sealed case that runs is not a
> sealed case that agrees; the importer compares the staged run against the
> case's own golden, because "running is not agreeing" cost a silently
> different model once already.

### 4.4 Method and evidence

**Declare → verify → refuse** — CANONICAL.  The case declares its intent, the
engine verifies the declaration against what it can compute, and a violation
is **refused by name with a remedy**.  A refusal that says only "invalid" is
not a refusal in this sense.

**Refusal** — CANONICAL.  A hard stop that (a) names the specific violation,
(b) names the remedy, and (c) does not fall back to something that would
produce a number.  A warning is not a refusal.

**Silent fallback** — CANONICAL, and the thing the project hunts.  Any path
where a missing or invalid input produces a *number* instead of a refusal or
an announcement.  Invariant I5.

**Arity doctrine** — CANONICAL.  A derived fact has **exactly one home**;
*trees never store derivatives*.  Extended 2026-08-05 from values to
**decisions**: a decision taken in two places drifts exactly as a number does.

**Announcement** — CANONICAL.  A run-time statement of something the engine
did that the case did not literally ask for: an approximation applied, a bound
that bound, a range extrapolated, an estimate consumed, a projection onto the
simplex.  Announcements are the alternative to silence, not to refusal.

**Consolidated** — CANONICAL, and it is a **three-part test**, not an opinion.
A block is consolidated only when (1) the contract is written, (2) the engine
refuses violators by name with a remedy, **and** (3) a case *fires* that
refusal.  A block with (1) and (2) only is **described, not consolidated**.

**Witness** — CANONICAL.  A case whose purpose is to demonstrate a specific
mechanism.  A **negative witness** demonstrates a refusal.

> **A negative witness that cannot fail is not a witness.**  Sabotage it —
> revert the fix and confirm the witness goes red — or it is testing its own
> structure.  Three phase-speciation refusals passed with the fix reverted,
> which is how the rule was learned.

**Gate** — CANONICAL.  An executable check wired into `bin/runTests` that
fails the suite.  A rule with no gate is a wish; `CLAUDE.md` said so about its
own corpus tally and then broke it, which is why that rule is a gate now.

**Golden** — CANONICAL.  A case's recorded reference KPIs (`expected`).  A
golden is **self-recorded**: it pins today's answer against tomorrow's
regression.  It is not evidence that the answer is right.  See G2.

**External anchor** — CANONICAL.  A published value a case is pinned against
(Williams-Otto, Cavett, the PC-SAFT association sets).  An anchor is evidence
about *correctness*; a golden is evidence about *stability*.  Do not conflate
them, and never blend two primary sources into one anchor.

---

## 5. Decision questions

Each is drafted, argued, and recommended.  None binds until ruled on.

### G1 — Do the banned literature words appear here at all?

`apparent` and `true`, as basis names, are banned in the tree (§3).  They are
also **the field's own words**: the electrolyte thermodynamics literature and
every commercial simulator use them, and a student who reads a paper meets
them on the first page.

The question is not whether to un-ban them.  It is whether this glossary
should carry them as **external synonyms with a mapping** ("the literature's
*apparent* is our flowsheet basis"), or stay silent so the words do not
appear in the tree at all.

> **Recommendation: carry the mapping, in this file only.**  Banning a word
> *inside* the tree is a coherence decision; pretending the field does not use
> it is a pedagogical failure, and the students are the primary stakeholder.
> The mapping already appears in §3's "why" column — this question is whether
> that is deliberate or an oversight.  I hold it is deliberate, but the ruling
> is the lecturer's.

### G2 — `runTests` is called a *validation* corpus.  It is mostly verification.

This is the one collision with established vocabulary, and it touches a
credibility claim rather than only a name.  In 24765 and in NASA-STD-7009 the
two words are distinct and load-bearing:

- **verification** — are the equations solved right?
- **validation** — are they the right equations, against reality?

`bin/runTests` compares almost every case against a **self-recorded golden**.
That is regression, and regression is verification: it proves the answer has
not moved, and says nothing about whether it was ever right.  Only a small set
of cases is genuinely validating — the ones pinned on published external
anchors.

Yet [`architecture-description.md`](architecture-description.md) §1 calls the
corpus "the validation corpus" and V7 is named "Validation / credibility".

> **DECIDED 2026-08-05 (delegated by Vítor).  The recommendation below is
> adopted, and the corpus is renamed.**  `bin/runTests` is the **verification
> and regression corpus**, and it contains a small, NAMED validation subset.
> The reason the stricter reading wins: 421 PASS proves the answers have not
> moved from what Choupo itself recorded.  It proves nothing about whether
> NF270's glucose permeability, carbon steel's density or any other physical
> datum is right — and calling the whole thing "validation" invites exactly
> that inference from the reader most likely to check it.
>
> Recorded in full: [`verification-and-validation.md`](verification-and-validation.md).
>
> *Original recommendation, adopted in PRINCIPLE and sharpened in wording.*
> It proposed "a **regression and validation corpus**"; what was adopted is
> stricter — **the verification and regression corpus, with a named validation
> subset** — because "regression and validation" still reads as though the two
> were comparable halves, and they are not: the validation subset is seven
> cases out of several hundred.  The principle below is what carried:
>
> **split the name, do not redefine the word.**  Call the
> corpus what it is, and mark each
> case as verified-against-golden or validated-against-anchor, which the tree
> already distinguishes in substance.  Redefining *validation* locally would
> be coining against an established meaning in the exact standard the project
> committed to consulting, and it would inflate the credibility claim in front
> of the reviewer most likely to check it.
>
> **This one has a cost**: it renames a viewpoint and touches the manifest, so
> it is a ruling, not an edit.

### G3 — *World*: keep the coinage?

*World* is not in the literature.  The literature's phrase is roughly
"per-unit property package context", which is accurate and unusable in a
refusal message.

> **Recommendation: keep it, and define it once (as §4.3 does).**  A coinage
> that is short, taught, and defined in exactly one place costs a reader one
> lookup.  The alternative costs every refusal message six words.  Flagged
> because a coinage should be a decision, not an accident.

### G4 — Does *component* vs *species* bind outside the electrolyte path?

The distinction is enforced by the type system and it is real.  But a
molecular case has one basis, and there the words are genuinely
interchangeable in the field's usage — so a molecular tutorial that says
"species" is not wrong in any way a student could detect.

> **Recommendation: bind the distinction everywhere, and say why.**  A word
> that means one thing in half the corpus is the drift this glossary exists to
> stop.  But the ruling matters because it implies a sweep of the molecular
> tutorials' prose, which is work.

### G5 — *KPI*

A management term, in an engineering tool, for what a textbook calls a
*result quantity* or a *performance measure*.  It is load-bearing in the code
(`kpis()`, the golden comparison, the sensitivity and costing chain), so
renaming is not free.

> **Recommendation: keep it, and stop treating it as neutral.**  It is a
> Choupo term of art meaning "a scalar result a unit publishes for comparison,
> sweeping, sizing or costing" — which is narrower than the business usage and
> should be defined as such if kept.

### G6 — *Model*, used three ways

The bare word currently means: the dictionary `model` slot (a sub-model
selector, `model simultaneous;`), a thermodynamic model (NRTL, PC-SAFT), and —
in the NASA-7009 sense the credibility section invokes — the entire
simulation.

> **Recommendation: the dict slot keeps the bare word** (it is a keyword, it
> is everywhere, and it is unambiguous *in a dictionary*).  Prose should say
> **thermodynamic model** and **simulation** for the other two.  Cheap to
> state, and it removes the only ambiguity that can mislead in a
> credibility discussion.

### G7 — RULED 2026-08-05: ban *true*, keep *apparent*

Approved by Vítor with the wording now in **§3a**, which is the binding text.
The finding that produced it: `CLAUDE.md` banned both halves in one sentence
and then used *apparent* four sections later, as did `IsothermalFlash.cpp`,
`ReactiveVLE.H`, `ThermoPackageBuilder.cpp` and
`stream-state-architecture.md` in capitals.  A rule the constitution breaks is
a wish; this one is now a gate.

---

## 6. Actions

| id | action |
|---|---|
| **G0** | Rule on G1–G6.  Until then those entries are drafts and must not be cited as binding.  ~~G7~~ RULED 2026-08-05 (§3a). |
| **GA1** | Consult a licensed copy of ISO/IEC/IEEE 24765 and re-check §4 for coinages against established meanings.  This pass was working knowledge; it found one collision (G2) and cannot claim it found all of them. |
| **GA2** | ~~Gate the banned wordings~~ DONE 2026-08-05: `check_glossary_bans` enforces §3 across live documents and the engine, with a stated exemption list (a document that *states* a ban must be able to quote it). |

**GA2 is the honest limit of this document today**, and the number is worse
than it sounds.  Of the six banned wordings, exactly **one** — *optimal* — is
enforced by a gate (`check_pinch_p2`).  One more, `converged/`, cannot drift
because the engine knows no other directory name, which is structural
enforcement rather than a check.  **The remaining four rely on a reader
remembering**, and remembering is the mechanism this project has watched fail
repeatedly.  A glossary that only *states* its bans is a contract without a
refusal — described, not consolidated, by the project's own criterion.
