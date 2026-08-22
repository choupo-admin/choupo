# docs/architecture — authority index

Who wins when documents disagree (ratified as decision #143, executed
2026-07-16). Four levels; **authority words (SETTLED / FINAL / "wins" /
"single source") are legitimate only on levels 1–2.**

| level | document | scope |
|---|---|---|
| 1 | [`CHOUPO-CONSTITUTION.md`](CHOUPO-CONSTITUTION.md) | case shape, flowsheet grammar, stream state, solver honesty |
| 1 | [`architecture-description.md`](architecture-description.md) | the 42010 manifest: entity, scope, stakeholders, concerns, viewpoints, model kinds, decisions, CORRESPONDENCES (the inconsistent ones declared in its §6, which recounts them) — and the wording the project is permitted to use |
| 1 | [`development-governance.md`](development-governance.md) | how work is organised so the architecture survives: production does not parallelise, verification does; the calibration rule; the rules binding an assisted fleet |
| 1 | [`project-philosophy.md`](project-philosophy.md) | the binding principles: numerical honesty, declare -> verify -> refuse, the arity doctrine, the NEVER rules, the CLOSED decisions |
| 1 | [`decision-records.md`](decision-records.md) | the ADR INDEX: which decision is recorded where, its kind and status, and which state a rejected alternative (the index recounts the split itself — a copy here drifted once) |
| 1 | [`domain-glossary.md`](domain-glossary.md) | the VOCABULARY: canonical terms, the banned wordings and their replacements, and the contested terms drafted as explicit decision questions (G1-G7) |
| 1 | [`global-invariants.md`](global-invariants.md) | the nineteen invariants as a SET, each with its written/refused/fired status |
| 1 | [`module-boundaries.md`](module-boundaries.md) | the layering, record resolution (thermo owns it, through one seam), where shared logic lives — plus the measurement and the debts ratifying it created (§8 is the ledger; a count here drifted once) |
| 2 | [`property-architecture.md`](property-architecture.md) | THE property contract (representation + computation), subordinate only to the Constitution |
| 2 | [`class-structure.md`](class-structure.md) | how a class is SHAPED: the five rules already binding elsewhere, gathered on one page, each with the defect that paid for it — states no new policy |
| 2 | [`verification-and-validation.md`](verification-and-validation.md) | what a green `bin/runTests` proves and what it does not: the five classes, and the named validation subset (G2, 2026-08-05) |
| 3 | detail / design records | deep reference for their slice, never competing authority: [`electrolyte-data-architecture.md`](electrolyte-data-architecture.md) (data-layer design + implementation addendum), [`stream-state-architecture.md`](stream-state-architecture.md), [`adsorption-contract.md`](adsorption-contract.md) + programme docs, [`enrtl-generalized-spec.md`](enrtl-generalized-spec.md), [`evidence-pipeline.md`](evidence-pipeline.md), `../property-architecture.md` *(root; the Layer-2 model/curation contract, 2026-06-05 — note the deliberate name twin: root = estimation/resolution doctrine, here = the consolidated property authority)* |
| — | [`environment-recovery.md`](environment-recovery.md) | OPERATIONAL record, not authority: the hosted-checkout rollback — signature, recovery procedure, and the verified recovery point `b10d523d` |
| — | [`conformance-42010.md`](conformance-42010.md) | EVIDENCE, not authority: the clause-by-clause 42010 self-assessment (its own tally table is the count), built to be failable.  Decides nothing |
| — | [`consolidation-map.md`](consolidation-map.md) | a VIEW, not an authority: which contract is written, which has a refusal, which has a case that FIRES that refusal.  Carries no counts (those are generated) and decides nothing |
| 4 | user/property guides (`docs/*.tex`), `docs/ai/*`, `CLAUDE.md` | derived DESCRIPTION of the contract, never its definition |

Historical: [`final-property-architecture.md`](final-property-architecture.md)
(superseded 2026-07-14 by level 2), everything under [`archive/`](archive/),
and unratified drafts under [`proposals/`](proposals/) +
[`propertyPackage-v2-constitution.md`](propertyPackage-v2-constitution.md).

Conflict rule: an OLDER document (any level) never overrides a NEWER explicit
decision by the architect; within the same age, lower level yields. Tests can
be wrong; a parser can be wrong; the hierarchy above is how disputes resolve.
