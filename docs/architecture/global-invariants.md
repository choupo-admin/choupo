# Global invariants — what must always be true

> **AUTHORITY: LEVEL 1.**  Authority map: [`README.md`](README.md).
> Ratified 2026-08-04.
>
> These invariants were all real and all enforced before this document existed
> — but only as prose scattered through the Constitution and as the headers of
> some eighty gates.  That made them **undiscoverable as a set**, so nobody
> could check coverage: which invariant has a refusal, which has a case that
> fires it, which is merely hoped for.  This file is the set.  It defines
> nothing new.

Each invariant carries the same three-part status the
[`consolidation-map.md`](consolidation-map.md) criterion uses:

- **W** — the contract is written somewhere authoritative;
- **R** — the engine refuses violators *by name, with a remedy*;
- **C** — a case FIRES that refusal (not a case that describes the structure).

An invariant with W and R but no C is **described, not consolidated**: a
structure test survives the fix being reverted, and a coherent corpus never
takes the refusal path.

---

## A — Truth and provenance

**I1. A derived fact has exactly one home — and a DECISION is a derived fact.**
No value is stored where it can be computed; no number is hand-copied where a
generator exists.  This includes documentation: a corpus count in prose is a
second home.  Extended 2026-08-05: a rule about what an absent input *means*
(a default, a fallback, a substitution) is a fact about the contract, and its
copies drift exactly as numbers do — the forward reaction order had five
homes, and they had already diverged from the reverse order two lines away.
· W [`project-philosophy.md`](project-philosophy.md) §3, §3a · R `records::ScanGuard`, `check_ion_pins`, `Reaction::forwardOrder` (one home for five) · C `check_registry_scan`, release-inventory staleness gate, `check_forward_order` (the refusal fires in all four reactors)

**I2. A document never describes machinery that does not exist.**
A manual naming a release it does not document, a guide referencing an absent
section, a design record describing an unbuilt feature without saying so —
each is a false claim about the system.
· W here · R `check_doc_references`, `guide_version`, `banner_version` · C 11 deliberate absences listed with their reason, each checked not to have quietly come true

**I3. Every value carries its provenance, and an estimate is never dressed as a
measurement.**
Per-value origin, citation, validity and fit date; a quality word on every
resolved number; an estimation rule announced with the value it produced.
· W [`property-architecture.md`](property-architecture.md) · R the builder announces every consumption; `[local] UNVERIFIED` transported in results · C `check_edwards_model` (one measured family, four estimation rules, each labelled)

**I4. A number outside its fitted range is announced, never silently
extrapolated and never refused.**
The professor extrapolates on purpose — but knows he did.
· W [`adsorption-contract.md`](adsorption-contract.md) §5 · R structured advisory (the Davies band, the Edwards `Trange`) · C `pitzer_calcite_brine` at I = 0.66, inside the band the message declares

## B — Honesty at run time

**I5. Silent fallbacks are forbidden.**
Where the engine cannot do what was declared it REFUSES by name with a remedy.
Where it substitutes, it announces.  A warning that lets a wrong answer through
with exit code 0 is the failure this project treats most seriously.
· W [`project-philosophy.md`](project-philosophy.md) §2a · R ~60 named refusals across the engine · C the negative-parity gate: 16 refusals verified by their MESSAGE, not their exit code

**I6. Every solver aid is declared, owned by the author, and announced when it
binds.**
· W [`project-philosophy.md`](project-philosophy.md) §2 · R `[plan]` announces tear cuts; bounds report on binding · C `recycle_autoinit_tear`, the six sequential-plan refusals

**I7. A non-converged run does not report success.**
Exit 1, and `converged/` is not written — the directory name is a contract.
· W [`CHOUPO-CONSTITUTION.md`](CHOUPO-CONSTITUTION.md) §6 · R `Flowsheet::solve` · C the 5 EXPECTED-FAIL teaching cases

**I8. A model that no case can select is not a capability.**
Registration, the declared-name table and the reachability of the parameters
are all part of shipping a model.
· W [`module-boundaries.md`](module-boundaries.md) §4 · R the props package refuses an unknown declared model from ONE table · C `check_edwards_model` (5 sabotages)

## C — Reproducibility

**I9. Every simulation is reproducible from its own case directory.**
A sealed case reads its own closure and is forbidden the installation
catalogue.
· W [`CHOUPO-CONSTITUTION.md`](CHOUPO-CONSTITUTION.md) §4 · R `SealCheck` verdict reaches the RESULT · C `check_seal_verdict`, `check_sealed_corpus` (326 sealed, 2 exempt by design, 0 unsealed)

**I10. Sealing must not change the physics.**
The strongest form of I9 and the most recently paid for: a seal that drops a
record home the closure does not know produces a *different model* that still
runs and still converges.
· W [`CLAUDE.md`](../../CLAUDE.md) §5, this file · R `choupo-import` compares the staged sealed run against the case's own golden and installs nothing on disagreement · C the closure disabled → 12 named differing rows

**I11. State lives in `0/`, one format, no exceptions.**
No inline `streams{}`, no inline `initial{}` / `inlet{}`; the completeness
contract is N streams = N files.
· W [`stream-state-architecture.md`](stream-state-architecture.md) · R the reader and both dynamic binaries refuse the inline block by name · C 42 dynamic cases seed from `0/`; `streams{}` refused

**I12. The version stamp on a file is the version of the LINE it belongs to.**
`Choupo-dev` on the development line.  A `catalogueRelease` in a sealed
manifest is a historical FACT and is never rewritten.
· W `bin/curate/banner_version.py` · R `banner-version-gate` · C one banner restored to `Choupo-2607` fails by name

## D — Physics

**I13. There is ONE enthalpy datum: elements/formation.**
Every reactor, steady and dynamic, prices reaction heat from the same surface.
· W [`../ai/energy.md`](../ai/energy.md) · R the shared `reactionHeat()` resolver · C steady and batch witnesses; the `dH_rxn` override is announced and cross-checked

**I14. H is the conserved truth; T is the model-dependent readout.**
At a model boundary nothing physical happens, so there is no real ΔT to absorb.
The default holds T and lets H step, VISIBLY.
· W [`../ai/energy.md`](../ai/energy.md) · R hard refusal across any phase / vf / speciation flip · C `thermoFor`, the model-boundary audit

**I15. A claim is made only where it can be honoured.**
A balance verdict is withheld — by name, quoting the gap — rather than
estimated.  A unit that says nothing claims nothing.
· W [`CLAUDE.md`](../../CLAUDE.md) §6 · R `energyLedgerGap()`, the ctrl energy-route probe · C `check_ctrl_balance` (claim, refusal, and the T-dependent-Cp fixture)

**I16. Identity crosses from component to species only through a DECLARED
bridge.**
Never by name similarity.  A component minted at run time carries every
declared fact it will be asked for.
· W [`CLAUDE.md`](../../CLAUDE.md) §5 (F2) · R `AqueousBridge::singleMaster` · C `check_typed_identifiers` (membrane08), `check_both_bases`

## E — Structure

**I17. `core` depends on nothing above it.**
Currently VIOLATED at four sites; see
[`module-boundaries.md`](module-boundaries.md) F1.
· W [`module-boundaries.md`](module-boundaries.md) · R — · C —  ← **W only**

**I18. The subsystem graph is acyclic.**
Currently VIOLATED by three cycles; see
[`module-boundaries.md`](module-boundaries.md) F2.
· W [`module-boundaries.md`](module-boundaries.md) · R — · C —  ← **W only**

**I19. Shared logic lives in the lowest NEUTRAL layer that can own its concepts
without acquiring upward dependencies.**
· W [`module-boundaries.md`](module-boundaries.md) §4 · R — · C —  ← **W only**

---

## Coverage

Sixteen of nineteen invariants have a written contract, an engine refusal and a
case that fires it.  **Three do not: I17, I18 and I19 — the structural ones,
all three ratified today and all three currently violated by measured code.**
That is not a gap in the invariant; it is the honest state, and it is why
`module-boundaries.md` carries a debt entry with a removal condition rather
than a green tick.

An invariant listed here with no R and no C is a **statement of intent**, and
this file marks it as such rather than letting the reader assume enforcement.
