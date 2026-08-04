# Conformance assessment — ISO/IEC/IEEE 42010:2022

> **STATUS: EVIDENCE, NOT AUTHORITY.**  This is an assessment, not policy.  It
> decides nothing and binds nobody; it reports, requirement by requirement,
> what evidence exists and what does not.  Authority map:
> [`README.md`](README.md).  The description it assesses is
> [`architecture-description.md`](architecture-description.md).
>
> First assessment 2026-08-04.

---

## How to read this, and why it is built to fail

A conformance table whose every row reads **conformant**, and whose rows
*could not* read otherwise, is not evidence — it is decoration.  It is the same
defect this project recorded in [`consolidation-map.md`](consolidation-map.md):
*a negative witness that cannot fail is not a witness.*

So this table is constructed to be failable, and **it fails today**: of the
applicable requirements, four are unmet or partial, and one whole viewpoint has
no view.  If a future revision shows all-green, the reviewer's first question
should be whether anything changed or whether the rows stopped being able to
say no.

Status values are exactly three:

- **MET** — evidence exists and is located below.
- **PARTIAL** — some evidence, with a named shortfall.
- **NOT MET** — no evidence.  A gap, with an owner.

There is no "N/A by judgement": a requirement judged inapplicable is recorded
in §3 with the reason, where it can be argued with.

## 1. Assessment

Requirements are grouped by the subject 42010 organises them under.  **The
clause numbers of the published standard are NOT reproduced here** — this
project holds no licensed copy, and inventing clause numbers would be a worse
error than omitting them.  Each row states the requirement in the standard's
own concepts; the mapping to clause numbers is itself an open action (§4, A3).

### 1.1 The architecture description

| # | requirement | evidence | status |
|---|---|---|---|
| R1 | Identify the entity whose architecture is described | [`architecture-description.md`](architecture-description.md) §1 | MET |
| R2 | Identify the scope, including exclusions | §1 (GUI internals, landing site, `thirdParty/` excluded) | MET |
| R3 | Identify the stakeholders | §2, seven identified | MET |
| R4 | Identify the concerns of those stakeholders | §2, per stakeholder | MET |
| R5 | Identify version / date / status of the description | this file and §1 headers carry a ratification date; **no version identifier and no change history for the description AS A WHOLE** | **PARTIAL** |
| R6 | Identify the documents constituting the description | §3, eight viewpoints mapped to views | MET |

### 1.2 Viewpoints and views

| # | requirement | evidence | status |
|---|---|---|---|
| R7 | Each view is governed by exactly one viewpoint | §3 table, one row per viewpoint | MET |
| R8 | Each viewpoint frames one or more identified concerns | §3, "frames the concerns of" column | MET |
| R9 | Every identified concern is framed by at least one viewpoint | all seven stakeholders' concerns map to V1–V7 | MET |
| R10 | Each viewpoint identifies its model kinds | §4, five model kinds | MET |
| R11 | Each view consists of models of its viewpoint's kinds | holds for V1–V7 | **PARTIAL** — V8 has no view at all |
| R12 | Viewpoints specify notations / conventions | §4, plus the dictionary-format and refusal-form conventions | MET |
| R13 | Viewpoint definitions state their source or are newly defined | **not stated**; the viewpoints are defined inline and their provenance is not declared | **NOT MET** |

### 1.3 Architecture decisions and rationale

| # | requirement | evidence | status |
|---|---|---|---|
| R14 | Record architecture decisions | three plural homes: philosophy §5 (list), `docs/design/*.md` (23), `CLAUDE.md` in-line settlements | **PARTIAL** — recorded, but with no index, no format and no identifiers; only 2 of 23 design records are ADR-shaped |
| R15 | Record the rationale for decisions, including alternatives considered and rejected | strong where it exists (e.g. the second-liquid record documents three failed designs; the boundary contract records a rejected proposal in full) | **PARTIAL** — coverage is uneven and unenumerated |
| R16 | Relate decisions to the concerns / views they affect | **absent** — no decision states which view it changes | **NOT MET** |

### 1.4 Correspondences and consistency

| # | requirement | evidence | status |
|---|---|---|---|
| R17 | Identify correspondences between architecture description elements | §6, six declared (C1–C6) | MET |
| R18 | State correspondence rules where they govern consistency | §6, "rule" column | MET |
| R19 | Record known inconsistencies | §6 marks C1 and C2 **INCONSISTENT**, C5 **UNVERIFIABLE**; removal conditions in [`module-boundaries.md`](module-boundaries.md) §8 | MET |

> R19 is the row worth noticing.  The description scores MET here **because**
> it declares the architecture inconsistent with the code.  A description that
> hid the three violated invariants would fail this requirement while looking
> better — which is precisely the property that makes 42010 useful rather than
> ceremonial.

## 2. Summary

| status | count |
|---|---:|
| MET | 13 |
| PARTIAL | 4 |
| NOT MET | 2 |

**The permitted wording is therefore the weaker sentence**
([`architecture-description.md`](architecture-description.md) §10):

> *Choupo's architecture documentation is structured using the concepts and
> vocabulary of ISO/IEC/IEEE 42010:2022.*

The stronger claim requires R5, R11, R13, R14, R15 and R16 resolved, and is not
available.

## 3. Requirements judged inapplicable

None yet.  When one is, it goes here with its reason, so the judgement can be
argued with rather than being invisible in an omitted row.

## 4. Open actions

| id | action | closes |
|---|---|---|
| **A1** | Write the ADR index: identifiers, a format, and a decision → view mapping | R11 (V8), R14, R15, R16, and correspondence C5 |
| **A2** | Give the architecture description as a whole a version identifier and a change history distinct from git | R5 |
| **A3** | Obtain a licensed copy of 42010:2022 and map each row to its clause number; correct any row this reveals as misstated | the accuracy of this entire table |
| **A4** | State the provenance of each viewpoint definition (newly defined here, or drawn from a published catalogue) | R13 |
| **A5** | Verify the NASA-STD-7009 revision and dates against the primary document | the citation in description §9 |

**A3 is the honest caveat on everything above.**  This assessment states the
requirements in the standard's *concepts*, from working knowledge, without a
licensed copy in hand.  It is a good-faith self-assessment and should be read
as one — not as an audit — until A3 is closed.  Publishing a conformance claim
on an unverified reading of the requirements would repeat, at the level of the
standard, exactly the error this project keeps finding at the level of the
code: asserting the shape of an artefact instead of reading it.
