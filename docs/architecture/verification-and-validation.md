# Verification and validation — what `bin/runTests` actually proves

> **AUTHORITY: LEVEL 2.**  Decided 2026-08-05, closing glossary question **G2**,
> delegated by Vítor.  Authority map: [`README.md`](README.md).

---

## 1. The claim that was being made, and why it was wrong

`bin/runTests` reports, at the end of every run:

```
PASS 421 / FAIL 0 / KNOWN-BROKEN 0 / EXPECTED-FAIL 5
```

and the architecture description called the whole thing **the validation
corpus**. That is not what it is, and the difference is not pedantry.

Almost every case compares against a **self-recorded golden** — an `expected`
file produced by Choupo, from an earlier Choupo run. Passing proves the answer
**has not moved**. It says nothing whatever about whether the answer was ever
right.

In ISO/IEC/IEEE 24765 (SEVOCAB) and in NASA-STD-7009 the two words are
distinct and load-bearing:

* **verification** — are we building the thing correctly? Does the
  implementation match the specification, and does it keep matching?
* **validation** — are we building the correct thing? Does the model agree
  with reality it was not fitted to?

421 PASS is verification. Calling it validation inflates a credibility claim in
front of exactly the reader most likely to check it — and this project has
several physical data whose correctness is explicitly unestablished (NF270's
glucose permeability, carbon steel's six unsourced design assertions, eighteen
uncited aqueous species). A green suite must not be read as covering those.

## 2. The five classes

| class | what a pass proves | most of the corpus? |
|---|---|---|
| **regression** | the answer has not moved from a self-recorded golden | **yes** |
| **verification** | the implementation matches a stated specification or a closed-form result | some |
| **architectural gate** | a structural contract holds (`check_*`) | ~15 |
| **expected refusal** | the engine refuses what the doctrine says it must | 5 named + the refusal gates |
| **validation** | agreement with an **independent published result the model was not fitted to** | **a small named subset** |

## 3. The validation subset, named

These are the cases pinned on primary published anchors that Choupo did **not**
fit. Each states its provenance in its own header.

| case | anchor |
|---|---|
| `steady/flowsheets/cavett01_recycle_train` | Rosen & Pauls specification verbatim; products shown beside the published APR/FLOWTRAN tables |
| `ctrl/ctrl12_williams_otto` | Williams & Otto published x\* to all digits |
| `ctrl/ctrl13_williams_otto_step` | the paper's Fig. 2 step response |
| `ctrl/ctrl14_williams_otto_pi` | the paper's Fig. 4 PI shape |
| `ctrl/ctrl16_williams_otto_optimal` | §5.3 optimum, reached to 99.1 % of the published collocation value — **the gap is stated and measured, which is what a validation case owes the reader** |
| `props/steam/steam01_if97_verification` | the IAPWS IF-97 release's own verification tables |
| `props/molecular/pcsaft03_association_pure` | Gross & Sadowski 2002 parameter set, with its published anchors |

Everything else in `tutorials/` is regression, verification, an architectural
gate, or a deliberate refusal.

**Three cases are explicitly NOT validation, and say so**, because the
temptation to count them would be strong:

* `props/electrolyte/edwards01_sour_water_activity` — a **structural** witness.
  No number in it is checked against measurement. The measured comparison is
  the paper's Table 7, which needs the vapour side.
* `steady/membranes/membrane02_NF_sugar` — its membrane parameters are
  `provenance fittedToCase`. A case cannot validate a parameter fitted to it.
* `props/molecular/cosmoSAC01_water_ethanol` — cross-checked bit-for-bit
  against an independent implementation of the *same equations and profiles*.
  That is verification of an implementation, not agreement with reality.

## 4. What this changes, and what it does not

Changed: the corpus is named the **verification and regression corpus**, with a
named validation subset. `architecture-description.md` §1 and its V7 viewpoint,
`CLAUDE.md` §6, and the thermoTest README no longer say the suite *validates*
what it verifies.

Not changed: no test, no golden, no case. This is a naming decision, and
renaming a claim that was too strong costs nothing but the claim.

**Deliberately not built: a per-case `class` field in `controlDict`.** It would
be a 421-case migration whose only consumer is this table, and the table is
short because the validation subset is genuinely short. If the subset grows past
what a reader can hold, revisit it — that is the condition, stated so the
absence is a decision and not an oversight.


---

## 6. The reopening rule (ruled by Vítor, 2026-08-08)

**Low external-validation coverage is not architectural incompleteness.
Architectural decisions are reopened only when an external-validation failure
demonstrates that the settled architecture cannot represent the required
physics without duplication, exception, or silent fallback.**

Two separate questions, never to be conflated:

* **ARCHITECTURE** — do we know how the pieces fit together?  As of
  2026-08-08: yes, almost completely; the remaining architectural deficit is
  primarily solids (target ruled, C2 spike pending), with the phase grammar
  as its implementation boundary.
* **VALIDATION** — have we independently demonstrated the pieces produce the
  right physical answers?  Still very incompletely (§3's named subset).

The trigger clause is deliberately stated in this project's own DETECTABLE
vocabulary: duplication is what the arity doctrine hunts, exception is what
the special-case bans hunt, silent fallback is what the no-silent-crutch
gates hunt.  A claimed architectural failure must therefore present evidence
of a kind the machinery can recognise — a disagreement with experiment, by
itself, is a MODEL or DATA finding, and reopens nothing.  This rule exists so
that low validation coverage can never become psychological evidence that the
simulator needs redesign.
