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
| R11 | Each view consists of models of its viewpoint's kinds | V1–V7 as before; V8 gained its view 2026-08-05 ([`decision-records.md`](decision-records.md)) and §4 gained the decision-index model kind it is built from | MET |
| R12 | Viewpoints specify notations / conventions | §4, plus the dictionary-format and refusal-form conventions | MET |
| R13 | Viewpoint definitions state their source or are newly defined | **not stated**; the viewpoints are defined inline and their provenance is not declared | **NOT MET** |

### 1.3 Architecture decisions and rationale

| # | requirement | evidence | status |
|---|---|---|---|
| R14 | Record architecture decisions | the three homes (philosophy §5, `docs/design/*.md`, `CLAUDE.md` settlements) are now indexed as one askable set in [`decision-records.md`](decision-records.md), each entry classified by kind and status | **PARTIAL** — indexed and classified, but records carry **no identifiers** and declare neither kind nor status in their own header, so the index infers what the record should own (AD3) |
| R15 | Record the rationale for decisions, including alternatives considered and rejected | strong where it exists (the second-liquid record documents three failed designs); coverage is now **measured**: 13 records state a rejected alternative, 21 do not, and the index reports the shortfall as temporal — the practice decayed as the work sped up | **PARTIAL** — coverage is uneven, but it is enumerated rather than unknown, and the gap has an owner (AD2) |
| R16 | Relate decisions to the concerns / views they affect | the index maps each CLOSED decision to *where it was argued* (§4); it does **not** state which view a decision changes | **NOT MET** — the mapping exists for provenance, not for impact |

### 1.4 Correspondences and consistency

| # | requirement | evidence | status |
|---|---|---|---|
| R17 | Identify correspondences between architecture description elements | §6, six declared (C1–C6) | MET |
| R18 | State correspondence rules where they govern consistency | §6, "rule" column | MET |
| R19 | Record known inconsistencies | §6 marks C1, C2 and C5 **INCONSISTENT** — C5 was UNVERIFIABLE until V8 existed, and writing the view turned an unknown into a stated defect (5 founding decisions with no recorded reasoning); removal conditions in [`module-boundaries.md`](module-boundaries.md) §8 | MET |

> R19 is the row worth noticing.  The description scores MET here **because**
> it declares the architecture inconsistent with the code.  A description that
> hid the three violated invariants would fail this requirement while looking
> better — which is precisely the property that makes 42010 useful rather than
> ceremonial.

## 2. Summary

| status | count |
|---|---:|
| MET | 14 |
| PARTIAL | 3 |
| NOT MET | 2 |

Movement since ratification (2026-08-04 → 2026-08-05): **R11 MET** (V8 gained
its view and §4 its model kind).  R14 and R15 stayed PARTIAL with narrower,
better-evidenced shortfalls — writing the index did not close them, and saying
it did would be claiming conformance because the page exists, which is the
error this file was separated out to prevent.

**The permitted wording is therefore the weaker sentence**
([`architecture-description.md`](architecture-description.md) §10):

> *Choupo's architecture documentation is structured using the concepts and
> vocabulary of ISO/IEC/IEEE 42010:2022.*

The stronger claim requires R5, R13, R14, R15 and R16 resolved, and is not
available.

## 3. Requirements judged inapplicable

None yet.  When one is, it goes here with its reason, so the judgement can be
argued with rather than being invisible in an omitted row.

## 4. Open actions

| id | action | closes |
|---|---|---|
| **A1** | ~~Write the ADR index~~ — DONE 2026-08-05, [`decision-records.md`](decision-records.md).  Closed R11 and C5.  **What it did not close, and these are now separate actions:** | R11 ✓, C5 ✓ |
| **A1a** | Give records identifiers and a declared kind/status header, so the index reads them instead of inferring them (= AD3) | R14 |
| **A1b** | The five founding decisions gain a record of their reasoning, or philosophy §5 says the argument is unrecorded (= AD1) | R15, C5 |
| **A1c** | A record states which view(s) it changes | R16 |
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
