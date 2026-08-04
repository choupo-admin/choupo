# Choupo architecture description — the 42010 manifest

> **AUTHORITY: LEVEL 1**, ratified 2026-08-04.  Authority map:
> [`README.md`](README.md).
>
> This document identifies WHAT constitutes Choupo's architecture description
> and organises it in the concepts and vocabulary of **ISO/IEC/IEEE
> 42010:2022** (*Software, systems and enterprise — Architecture description*).
>
> **It does NOT claim conformance.**  42010 defines explicit conformance
> requirements; a document map is evidence toward them, never conformance by
> itself.  The clause-by-clause assessment is a SEPARATE artefact —
> [`conformance-42010.md`](conformance-42010.md) — and it is evidence, not
> policy.  This separation is the project's own consolidation criterion
> (contract written · violation refused by name · a case that FIRES the
> refusal) applied to documentation: a manifest that asserted conformance
> because it exists would be a structure test that passes with the fix
> reverted.

---

## 1. Architecture entity and scope

**Entity:** Choupo — an open-source, glass-box chemical process simulator
(C++17, no external libraries), together with its data catalogue, its case
corpus and its documentation set.

**In scope:** the four solver binaries and their shared engine
(`src/`), the curated data tree (`data/standards/`), the case format, the
validation corpus (`tutorials/` + `bin/runTests`), and the documentation
layers.

**Out of scope:** the web GUI's internal component architecture (`gui/`, its
own design record), the landing site, and third-party data under
`thirdParty/`.

## 2. Stakeholders and concerns

| stakeholder | concerns |
|---|---|
| **Student** | Can I see what the solver did?  Is a number's origin visible?  Is an approximation announced or hidden? |
| **Course lecturer** | Does a case demonstrate the intended mechanism?  Is a teaching model labelled as such? |
| **Researcher extending it** | Where do I add a model?  What may my new code depend on?  What will refuse me and why? |
| **Curator (data)** | Where does a datum live?  What is its provenance and validity?  What is derived and must not be stored? |
| **Maintainer / architect** | Is architectural intent recoverable after a year?  Which decisions are closed?  What erodes if unwatched? |
| **AI agent working on the codebase** | Which documents bind?  Which are description?  What may I not relitigate? |
| **Reviewer / citer (JOSS)** | Is the architecture described in a recognised form?  Are claims of credibility evidenced? |

The sixth is unusual and deliberate: this project is developed with AI
assistance, so *recoverable architectural context* is a first-class concern,
not a documentation nicety.  It is the reason the constitutional layer exists.

## 3. Viewpoints and the views that realise them

| viewpoint | frames the concerns of | governing view(s) |
|---|---|---|
| **V1 Principles** | all | [`project-philosophy.md`](project-philosophy.md) |
| **V2 Invariants** | maintainer, agent, reviewer | [`global-invariants.md`](global-invariants.md) |
| **V3 Module / dependency** | researcher, maintainer, agent | [`module-boundaries.md`](module-boundaries.md) |
| **V4 Case and state** | student, lecturer, researcher | [`CHOUPO-CONSTITUTION.md`](CHOUPO-CONSTITUTION.md) §1–3, [`stream-state-architecture.md`](stream-state-architecture.md) |
| **V5 Property / thermodynamic** | curator, researcher | [`property-architecture.md`](property-architecture.md), [`electrolyte-data-architecture.md`](electrolyte-data-architecture.md) |
| **V6 Solver behaviour** | student, researcher | [`CHOUPO-CONSTITUTION.md`](CHOUPO-CONSTITUTION.md) §6, philosophy §2 |
| **V7 Validation / credibility** | lecturer, reviewer, maintainer | [`consolidation-map.md`](consolidation-map.md), `bin/runTests` + the gate corpus |
| **V8 Decisions and rationale** | maintainer, agent | **`decision-records.md` — NOT YET WRITTEN** (gap, §7) |

## 4. Model kinds and notation

| model kind | notation | where |
|---|---|---|
| Layered dependency model | measured include graph + an ASCII band diagram | V3 |
| Three-layer pipeline model | Mermaid `flowchart` | [`consolidation-map.md`](consolidation-map.md) |
| Contract-status model | table: contract · refusal · firing case · date | V2, V7 |
| Case-structure model | annotated directory tree | V4 |
| Data-home model | prose taxonomy over `data/standards/` | V5 |

Conventions: dictionaries are the file format everywhere; British-influenced
technical English (US spelling per the language rule); a *refusal* always names
the violation and states a remedy.

## 5. Architecture decisions and rationale

42010:2022 requires that architecture decisions and their rationale be
recorded.  Choupo records them in three places today, and that plurality is
itself the gap named in §7:

- **Closed decisions**, as a list — [`project-philosophy.md`](project-philosophy.md) §5;
- **Design records with rejected alternatives** — `docs/design/*.md`
  (23 documents, of which 2 are ADR-shaped and 1 is named `*-adr.md`);
- **In-line settlements** — `CLAUDE.md` §5/§10, marked *do NOT relitigate*.

## 6. Correspondences and consistency rules

*This is the clause that earns the mapping.*  A correspondence is a declared
relationship between views, with a rule for when they agree.  Declaring them
turns three known problems from folklore into stated inconsistencies.

| # | correspondence | rule | status |
|---|---|---|---|
| **C1** | V3 ↔ the source | the layering in `module-boundaries.md` §1 shall match the measured include graph | **INCONSISTENT** — 4 upward edges, 3 cycles (I17, I18) |
| **C2** | V2 ↔ V7 | every invariant shall have an engine refusal and a case that fires it | **INCONSISTENT** — I17, I18, I19 have neither |
| **C3** | V7 ↔ the corpus | a contract with no firing case is marked *described, not consolidated* | consistent (the map marks them) |
| **C4** | any view ↔ a generated artefact | a generated number has a generator and a staleness gate, never a copy | consistent (4 gates) |
| **C5** | V1 §5 ↔ V8 | every CLOSED decision shall point to the record that argued it | **UNVERIFIABLE** — V8 does not exist |
| **C6** | V4/V5/V6 ↔ the guides | every path and case name in an AI-facing doc shall resolve | consistent (`check_doc_references`, 234 paths) |

Three of six are inconsistent or unverifiable, and they are stated here rather
than in a footnote.  A correspondence set that reported six greens on a
codebase with three violated invariants would be a negative witness that cannot
fail.

## 7. Known gaps in this description

1. **V8 has no view.**  There is no ADR index, no consistent ADR format, no
   numbering.  C5 is unverifiable until there is.  *This is the next artefact.*
2. **C1 and C2 are inconsistent by construction**, because the invariants they
   check were ratified the same day the violations were measured.  Removal
   conditions: [`module-boundaries.md`](module-boundaries.md) §8, debts D1–D5.
3. **No architecture-viewpoint catalogue** in the 42010 sense (viewpoints are
   defined inline in §3 rather than as reusable specifications).  Acceptable
   for a single-system description; recorded so it is not mistaken for an
   oversight.

## 8. What conformance would and would not buy

42010 governs the **form of an architecture description**.  It certifies
nothing about whether the architecture is sound, and nothing about whether the
code implements it — C1 above is the proof, since the description can be
well-formed while stating that the code violates it.

Reading conformance as a quality claim would be the same category error as
reading a green regression suite as correct physics.  Stated here because a
reviewer will test the boundary, and it is cheaper to draw it than to defend
it.

## 9. Related standards

**Simulation credibility.**  Choupo's per-value provenance, validity
announcements and refusal discipline correspond closely to the credibility
factors of **NASA-STD-7009** (*Standard for Models and Simulations*) —
input pedigree, uncertainty characterisation, results robustness.

> **CITATION UNVERIFIED.**  A revision letter of **B**, approved
> **2024-03-05**, with an implementation handbook **NASA-HDBK-7009B** approved
> **2026-02-03**, was supplied by an external reviewer.  Attempts to fetch
> `standards.nasa.gov` and `ntrs.nasa.gov` from this environment returned HTTP
> 403.  **These details are recorded on secondhand authority and MUST be
> verified against the primary document before any publication cites them** —
> the project's own rule is one primary source per value, and a standard's
> revision letter is a value.

Related but **not adopted as process**, with reasons:

- **ISO/IEC/IEEE 12207** (life-cycle processes) — deliberately generic and
  explicitly tailorable; adopting it would nonetheless be disproportionate for
  a project of this size and governance.  *(An earlier draft of this section
  claimed 12207 is written only for large contractual organisations.  That was
  imprecise and is withdrawn; the conclusion is unchanged, the reasoning is
  corrected.)*
- **ISO/IEC/IEEE 29119** (software testing) — the gate corpus has NOT been
  formally compared against it.  *(An earlier draft claimed the corpus
  "exceeds what 29119 asks for".  That was asserted without reading the
  standard, which covers concepts, processes, documentation and test
  techniques; gate quantity cannot establish it.  Withdrawn.)*
- **ISO/IEC 25010** (SQuaRE) — its maintainability sub-characteristics are
  useful published vocabulary for what V3 buys; used as vocabulary, not
  adopted as a measurement programme.
- **ISO/IEC/IEEE 24765** (SEVOCAB) — to be consulted when the domain glossary
  is written, so no term is coined against an established meaning.

## 10. Permitted wording

Until [`conformance-42010.md`](conformance-42010.md) shows every applicable
requirement evidenced with no unexplained gap:

> *Choupo's architecture documentation is structured using the concepts and
> vocabulary of ISO/IEC/IEEE 42010:2022.*

Only after that:

> *Choupo's architecture description conforms to ISO/IEC/IEEE 42010:2022.*

The stronger sentence is not available today, and the assessment says by how
much.
