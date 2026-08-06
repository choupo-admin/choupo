# Architecture decision records — the index

> **AUTHORITY: LEVEL 1** for the INDEX (which decision is recorded where, and
> what its status is).  The records it points at keep their own levels.
> Authority map: [`README.md`](README.md).  Ratified 2026-08-05.
>
> This closes the one viewpoint
> [`architecture-description.md`](architecture-description.md) §3 listed as
> having **no view** (V8), and with it requirements R11, R14, R15 and R16 of
> the [42010 conformance assessment](conformance-42010.md), plus
> correspondence C5.

---

## 1. Why an index, when 39 records already exist

The decisions were recorded.  What did not exist was any way to ask **"has
this been decided, and where?"** — and that question is the whole reason the
constitutional layer exists.  Without it a decision is discoverable only by
someone who already knows it happened, which is precisely the reader who does
not need it.

Three concrete costs, all observed:

- The same question was reopened from outside twice this week, and the
  rebuttal had to be reconstructed from memory rather than cited.
- `project-philosophy.md` §5 lists eleven CLOSED decisions and, until this
  file, could not point at the argument for any of them (correspondence C5,
  recorded UNVERIFIABLE).
- Of 39 design records, **17 state a rejected alternative and 22 do not** —
  so for most, the reasoning that would prevent re-litigation is absent, and
  nothing said so.

## 2. How to read the table

**Kind** — what the record *is*, which is not the same as what it is called:

| kind | meaning |
|---|---|
| **ADR** | a decision, its alternatives, and why they were rejected |
| **SCOPE** | a programme's boundary: what is in, out, and named-as-deferred |
| **FORUM** | a structured deliberation; the decision is its conclusion |
| **SPIKE** | a vertical proof; the finding is the record |
| **STUDY** | evidence gathered to inform a decision, deciding nothing |

**Alt** — does the record state a rejected alternative? `yes` / **`no`**.
A `no` is not a defect in every kind (a STUDY decides nothing), but a `no` on
an ADR or a FORUM means the decision is recorded without its reasoning, and
that is the shape that gets re-litigated.

**Status** — `SHIPPED` (in the engine, with a gate), `CONTRACT` (written, not
built), `OPEN` (awaiting a decision), `HISTORICAL` (superseded or a snapshot).

---

## 3. The records

### Settled and shipped

| record | kind | alt | status |
|---|---|---|---|
| [`equilibrium-parameterisation-identity.md`](../design/equilibrium-parameterisation-identity.md) | ADR | no | SHIPPED — D2 migration closed 2026-07-26 |
| [`computational-seal-migration.md`](../design/computational-seal-migration.md) | ADR | no | SHIPPED — `sealSchema computational`, 328/0 |
| [`basis-reconciliation-spike.md`](../design/basis-reconciliation-spike.md) | SPIKE | yes | SHIPPED (spike only); **mass migration UNAUTHORISED** |
| [`reactive-second-liquid-proposal.md`](../design/reactive-second-liquid-proposal.md) | ADR | no | SHIPPED — §14 records three failed designs |
| [`pcsaft-association-proposal.md`](../design/pcsaft-association-proposal.md) | ADR | no | SHIPPED with three ratified amendments |
| [`batch-temporal-utilities-proposal.md`](../design/batch-temporal-utilities-proposal.md) | ADR | yes | SHIPPED — form B |
| [`pinch-programme-scope.md`](../design/pinch-programme-scope.md) | SCOPE | no | SHIPPED P1+P2; **P3 area-cost UNAUTHORISED** |
| [`fixed-bed-thermal-a5.md`](../design/fixed-bed-thermal-a5.md) | SCOPE | no | SHIPPED — T1, T1.5, T2 |
| [`williams-otto-reference-case.md`](../design/williams-otto-reference-case.md) | SCOPE | no | SHIPPED — all four anchors |
| [`restricted-speciation-network.md`](../design/restricted-speciation-network.md) | ADR | yes | SHIPPED |
| [`general-salt-reconstruction-proposal.md`](../design/general-salt-reconstruction-proposal.md) | ADR | yes | SHIPPED — slice 1 |
| [`aqueous-stream-basis-proposal.md`](../design/aqueous-stream-basis-proposal.md) | ADR | yes | SHIPPED |
| [`sour-water-stripper-scope.md`](../design/sour-water-stripper-scope.md) | SCOPE | no | PARTIAL — S1–S3 shipped; Table 7 needs the vapour side |
| [`curation-backlog-estimated-records.md`](../design/curation-backlog-estimated-records.md) | SCOPE | no | ONGOING |

### Contract written, not built

| record | kind | alt | status |
|---|---|---|---|
| [`standard-state-transfer-adr.md`](../design/standard-state-transfer-adr.md) | ADR | no | CONTRACT ONLY — D3, no implementation authorised |
| [`model-declared-record-homes.md`](../design/model-declared-record-homes.md) | ADR | yes | **PROPOSAL** — debt D3; two shapes weighed, one recommended, awaiting Vítor |
| [`where-a-finding-record-lives.md`](../design/where-a-finding-record-lives.md) | ADR | yes | **DECIDED + IMPLEMENTED 2026-08-05** — debt D7; records to `core`, audit to the engine; checked against DWSIM, which supplies the pattern (`DWSIM.Interfaces`, zero deps) and the counter-example (its solver's compile path to WinForms) |
| [`reference-rung-refusal.md`](../design/reference-rung-refusal.md) | ADR | yes | **DECIDED + IMPLEMENTED 2026-08-06** — `h_pure_ig`/`s_pure_ig`/`g_pure_ig` refuse a non-gas `referenceState`; revised its own plan on the first measurement (the field was already parsed), and names the water-liquid-datum gap as NOT closed |
| [`vapour-or-gas-is-a-state.md`](../design/vapour-or-gas-is-a-state.md) | ADR | yes | **FINDING RECORDED 2026-08-06, implementation NOT started** — `noncondensable true;` stores a STATE relation (T vs Tc) as a substance flag; CO2's Tc is 31.0 °C and nine corpus cases run it at 298.15 K, six kelvin BELOW, while the engine announces "above Tc".  Ruled: announce the contradiction, as `role` vs `volatility{}` already does — never delete the flag, never silently re-route |
| [`theory-in-class-structure-study.md`](../design/theory-in-class-structure-study.md) | STUDY | no | **LEARNING STUDY, no decision** — how OpenFOAM, Cantera and DWSIM embed thermodynamic theory and size distributions in class structure; commissioned before any change to Choupo's thermo spine |

### Awaiting a decision

| record | kind | alt | what is blocked |
|---|---|---|---|
| [`open-decisions-2026-08-03.md`](../design/open-decisions-2026-08-03.md) | ADR | yes | the standing queue |
| [`role-vocabulary-forum-2026-08-02.md`](../design/role-vocabulary-forum-2026-08-02.md) | FORUM | yes | the `role` vocabulary |
| [`unread-dict-keys-proposal.md`](../design/unread-dict-keys-proposal.md) | ADR | no | a misspelt key runs silently |
| [`solverdict-consolidation-scope.md`](../design/solverdict-consolidation-scope.md) | SCOPE | no | Option A, non-blocking |
| [`seal-divergence-forum-2026-08-02.md`](../design/seal-divergence-forum-2026-08-02.md) | FORUM | no | the 435 pinned sealed cases |

### Deliberations (the decision is the conclusion)

| record | kind | alt |
|---|---|---|
| [`thermo-grammar-professors-forum-2026-07-04.md`](../design/thermo-grammar-professors-forum-2026-07-04.md) | FORUM | no |
| [`thermo-grammar-students-forum-2026-07-04.md`](../design/thermo-grammar-students-forum-2026-07-04.md) | FORUM | no |
| [`mixing-rules-forum-2026-07-04.md`](../design/mixing-rules-forum-2026-07-04.md) | FORUM | yes |
| [`flash-eos-vs-raoult-forum-2026-07-04.md`](../design/flash-eos-vs-raoult-forum-2026-07-04.md) | FORUM | yes |
| [`world-selection-forum-2026-07-04.md`](../design/world-selection-forum-2026-07-04.md) | FORUM | yes |
| [`mesh-stabilization-forum-2026-07-03.md`](../design/mesh-stabilization-forum-2026-07-03.md) | FORUM | yes |
| [`cyclone-iozia-leith-forum-2026-07-04.md`](../design/cyclone-iozia-leith-forum-2026-07-04.md) | FORUM | yes |
| [`pneumatic-conveying-forum-2026-07-03.md`](../design/pneumatic-conveying-forum-2026-07-03.md) | FORUM | yes |
| [`gibbs-map-forum-2026-07-02.md`](../design/gibbs-map-forum-2026-07-02.md) | FORUM | no |
| [`under-relaxation-forum-2026-07-03.md`](../design/under-relaxation-forum-2026-07-03.md) | FORUM | no |
| [`solution-directories-forum-2026-07-03.md`](../design/solution-directories-forum-2026-07-03.md) | FORUM | no |
| [`property-dict-review-2026-07-04.md`](../design/property-dict-review-2026-07-04.md) | FORUM | no |
| [`comfort-loop-2026-07-04.md`](../design/comfort-loop-2026-07-04.md) | FORUM | no |

### Evidence, deciding nothing

| record | kind | note |
|---|---|---|
| [`state-of-the-art-property-study-2026-07-17.md`](../design/state-of-the-art-property-study-2026-07-17.md) | STUDY | ordered after two AIs decided a day's architecture in a self-ratification loop without studying the field |
| [`audit-2026-08-05-arity.md`](audit-2026-08-05-arity.md) | STUDY | fleet audit, I1 |
| [`audit-2026-08-05-silent-fallbacks.md`](audit-2026-08-05-silent-fallbacks.md) | STUDY | fleet audit, I5 |
| [`audit-2026-08-05-provenance.md`](audit-2026-08-05-provenance.md) | STUDY | fleet audit, I3 |

### Historical

`docs/architecture/archive/`, `final-property-architecture.md` (superseded
2026-07-14), `propertyPackage-v2-constitution.md` and everything under
`docs/architecture/proposals/` (unratified drafts).

## 4. Where the CLOSED decisions were argued

Correspondence C5 requires each entry in
[`project-philosophy.md`](project-philosophy.md) §5 to point at its argument.
Six do.  **Five do not, and that is stated rather than papered over** — they
predate the design-record practice and their reasoning survives only in
`CLAUDE.md` §10 as a settled note.

| closed decision | argued in |
|---|---|
| C++17, no external libraries | **ARGUED** — `CLAUDE.md` §10 licence policy ("favours readable, local C++ over dependency expansion") and the COSMO reversal, which states what the rejection was *against*: bloat — heavy deps, quantum chemistry, bulk imports, a new architecture |
| Make, no CMake | **UNARGUED** — asserted, never reasoned, anywhere |
| Explicit factory, no auto-registration | **ARGUED** — `CLAUDE.md` §5 gives three reasons: pedagogical clarity, the static-init order fiasco, and pattern consistency |
| File-first dictionaries, never YAML/JSON | **UNARGUED** — asserted, never reasoned, anywhere |
| One binary per problem class | **PARTLY ARGUED** — the *boundary* is argued (do not split within a class; strategies coexist, selected by dict) but not the choice of one-per-class over one-binary-total |
| GPL-3.0-or-later, no CLA | `CONTRIBUTING.md`, `TRADEMARKS.md` |
| Brand casing | `CLAUDE.md` §10 |
| Flat `components/` | `CLAUDE.md` §7 |
| GUI is a runner, not an editor | [`../ai/gui-credo.md`](../ai/gui-credo.md) |
| Estimation is a curation problem | [`property-architecture.md`](property-architecture.md) |
| The repository is English (US) | `CLAUDE.md` §5, [`project-philosophy.md`](project-philosophy.md) §5 |

**This table was WRONG when first written, and the correction is the point.**
It claimed all five founding decisions had no record.  Re-reading the sources
instead of the index found that **two of the five are fully argued** and a
third is argued in part — the reasoning existed, in `CLAUDE.md` §5 and in the
licence-policy and COSMO-reversal passages of §10, which is simply not where
the index looked.

**Exactly two are genuinely unargued: Make-not-CMake, and file-first
dictionaries.**  Both are asserted and never reasoned, anywhere in the tree.

This is the same defect as the provenance audit's species list, in the
opposite direction: that one **undercounted** violations (seventeen named,
eighteen found), this one **overcounted** them (five claimed, two real).  One
cause — *a hand-compiled list is itself a hand-maintained derived fact*, and
an index that measures the corpus without re-reading it drifts from the
corpus.  A gate recounts; a list remembers what it was told once.

The two real gaps stay named.  They are the oldest decisions and the most
likely to be challenged by someone who was not there, and *"it was decided"*
is not an argument.

## 5. What this index shows that no individual record could

**22 of 39 records state no rejected alternative.**  For a FORUM or a STUDY
that is often fine.  For an ADR it means the decision is recorded without the
argument that would prevent it being reopened — and reopening settled
questions is the specific failure the constitutional layer exists to stop.

The pattern is temporal: the records with rejected alternatives cluster in
July, when forums were convened deliberately; the ones without cluster in the
August programme docs, written as scope statements after the decision was
already taken. **The practice decayed as the work sped up**, which is exactly
when the record matters most.

## 6. Actions

| id | action |
|---|---|
| **AD1** | The five founding decisions gain a record of their reasoning, or `project-philosophy.md` §5 states that their argument is unrecorded. Either is honest; silence is not. |
| **AD2** | An ADR states its rejected alternatives, or says why there were none. A gate can check the section exists; it cannot check it is true. |
| **AD3** | Every future record declares its **kind** and **status** in its own header, so this index reads them instead of a maintainer inferring them — a second home for a fact that the record itself should own. |
