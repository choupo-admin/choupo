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

## 3. The validation subset, named — and recounted (2026-08-08)

> **This section undercounted, in exactly the way §1 warns about.**  It named
> seven system-level cases and called the subset "small and named" while the
> props corpus carried a property-surface validation battery nobody had
> enumerated — six 1-1 salts against the Hamer & Wu NBS tables among them.
> Found on the validation loop's first iteration, whose planned first case
> turned out to already exist.  The list below is now recounted by
> `check_validation_subset` every suite run; a validation-op case missing
> from it fails the gate.

**A — system-level anchors** (a flowsheet or trajectory against an
independent published result):

| case | anchor |
|---|---|
| `steady/flowsheets/cavett01_recycle_train` | Rosen & Pauls specification verbatim; products beside the published APR/FLOWTRAN tables |
| `ctrl/ctrl12_williams_otto` | Williams & Otto published x\* to all digits |
| `ctrl/ctrl13_williams_otto_step` | the paper's Fig. 2 step response |
| `ctrl/ctrl14_williams_otto_pi` | the paper's Fig. 4 PI shape |
| `ctrl/ctrl16_williams_otto_optimal` | §5.3 optimum at 99.1 % of the published collocation value — the gap stated and measured |
| `props/steam/steam01_if97_verification` | the IAPWS IF-97 release's own verification tables |
| `plant/lithiumBrinePlant` | element closure across four thermo worlds (structural anchor) |

**B — property-surface anchors** (a model surface against measured data), with
the INDEPENDENCE each case's own header claims — fit-consistency is a real
check but it is NOT validation, and conflating them inflates exactly the
credibility claim this document exists to deflate:

| case | anchor | independence |
|---|---|---|
| `props/electrolyte/pitzer_gamma_hamer_wu` | Hamer & Wu, J. Phys. Chem. Ref. Data 1 (1972) — six 1-1 salts, γ± AAD 0.1–0.7 % | **independent** for five salts; the Li–Cl pair was refit to this table — that arm is fit-consistency, per the case's own header |
| `props/electrolyte/enthalpy_naoh_water` | Parker (1965) measured Φ_L, calorimetric | independent |
| `props/electrolyte/enrtl_mixed_nacl_ethanol_esteso` | Esteso — NaCl γ± in ethanol–water, predictive | independent |
| `props/electrolyte/pitzer_seawater_verify` | published seawater benchmarks (the S3 forum's own no-go gate) | independent |
| `props/electrolyte/farelo_nacl_nh4cl` | Farelo saturation data | independent |
| `props/electrolyte/farelo_licl_range` | Hamer & Wu range for LiCl | **fit-consistency** — the pair was refit to it |
| `props/electrolyte/pitzer_nacl_sp77_hot` | Silvester & Pitzer (1977) Table V, 25–200 °C | **fit-consistency** — the coefficients are the same paper's Table IV, verbatim |
| `props/electrolyte/pitzer01_nacl` | Parker (1965) Φ_L, NaCl series | **fit-consistency** — the op's own prose pins the AAD against "the same curated Parker series"; found by the gate's first run, then re-verified against the case rather than my first guess (which had the wrong anchor AND the wrong class) |
| `props/compare/compare_vle_etoh_water` | Carey & Lewis (1932) ethanol–water VLE at 101.3 kPa, 12 points | independent — ideal / NRTL / UNIFAC / **Wilson** (on flash03's inline pair, its first measured anchor: T_bubble AAD 0.28 K vs NRTL's 0.35 K) |
| `props/electrolyte/fpd01_nacl_freezing` | one tabulated FPD point at 1 mol/kg (interim citation, Scatchard–Prentiss candidate) + dilute-limit slope vs the derived K_f | independent but THIN — one point, said plainly; also the ice witness: the depression agrees to 0.05 % with a_w evaluated at T_f, where the 25 °C surface leaves a 1.8 % gap |

Synthetic datasets (`*synthetic*.dat`) are teaching surrogates and may never
appear in this section; the gate refuses them by name.  The corrected axis
reading: the subset is materially larger than the seven this section carried,
still a small minority of the corpus, and now recounted rather than
remembered.

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
  2026-08-08: yes.  The last open deficit — solids — closed the same day the
  rule was written: the C2 spike PASSED review and the target
  solid-equilibrium architecture was RATIFIED
  ([`solid-equilibrium-spike.md`](../design/solid-equilibrium-spike.md) §7),
  with the ruling's own words: **the Choupo architecture is consolidated** —
  what remains is implementation (flash integration, the C3 grammar, the
  authorised migration), curation and external validation.
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
