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
| `steady/flowsheets/cavett01_recycle_train` | Rosen & Pauls **specification** verbatim, plus solver behaviour on it (Wegstein defeated, Newton 7 iterations). **SPECIFICATION-ONLY, corrected 2026-08-10:** this row used to read "products beside the published APR/FLOWTRAN tables", and the case carries no such table and nothing that compares against one — the claim lived in the case's `controlDict` description, was copied here, and went stale in both homes at once. The missing anchor is now named in the case's own header |
| `ctrl/ctrl12_williams_otto` | Williams & Otto published x\* — **CHECKED since 2026-08-10**: six `anchor` rows carry the published steady state (Schindler & Bortz arXiv:2004.07614 restating Williams & Otto 1960), band 3 % set by the citation's own two-decimal rounding on m_G = 0.22; observed agreement ≤ 1.31 % |
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
| `props/electrolyte/pitzer_gamma_hamer_wu` | Hamer & Wu, J. Phys. Chem. Ref. Data 1 (1972) — six 1-1 salts, γ± AAD 0.1–0.7 %. **Since 2026-08-10 the agreement is CHECKED, not asserted:** 15 `anchor` rows carry the paper's own γ±(1 m), γ±(3 m) and φ(1 m) for the five independent salts, so a model that drifted off the table now fails the suite instead of leaving the header's claim standing | **independent** for five salts; the Li–Cl pair was refit to this table — that arm is fit-consistency, per the case's own header, and it is deliberately given **no anchor row**: anchoring it would claim validation from the data the parameters already saw |
| `props/electrolyte/enthalpy_naoh_water` | Parker (1965) measured Φ_L, calorimetric | independent |
| `props/electrolyte/enrtl_mixed_nacl_ethanol_esteso` | Esteso — NaCl γ± in ethanol–water, predictive | independent |
| `props/electrolyte/pitzer_seawater_verify` | published seawater benchmarks (the S3 forum's own no-go gate). **DISAGREES, found 2026-08-10:** with γ± now published rather than hand-combined in a header, four of the six salts (MgCl₂, CaCl₂, Na₂SO₄, MgSO₄) sit 2–4 % **below** their quoted bands — the E_theta term was activated and only the two 1-1 salts were re-checked. Unresolved and untuned; the case header and `VALIDATION.md` carry it. The single-salt PIN A does agree, and carries the anchor row | independent |
| `props/electrolyte/farelo_nacl_nh4cl` | Farelo saturation data | independent |
| `props/electrolyte/farelo_licl_range` | Hamer & Wu range for LiCl | **fit-consistency** — the pair was refit to it |
| `props/electrolyte/pitzer_nacl_sp77_hot` | Silvester & Pitzer (1977) Table V, 25–200 °C | **fit-consistency** — the coefficients are the same paper's Table IV, verbatim |
| `props/electrolyte/pitzer01_nacl` | Parker (1965) Φ_L, NaCl series | **fit-consistency** — the op's own prose pins the AAD against "the same curated Parker series"; found by the gate's first run, then re-verified against the case rather than my first guess (which had the wrong anchor AND the wrong class) |
| `props/compare/compare_vle_etoh_water` | Carey & Lewis (1932) ethanol–water VLE at 101.3 kPa, 12 points | independent — ideal / NRTL / UNIFAC / **Wilson** (on flash03's inline pair, its first measured anchor: T_bubble AAD 0.28 K vs NRTL's 0.35 K) |
| `props/electrolyte/fpd01_nacl_freezing` | one tabulated FPD point at 1 mol/kg (interim citation, Scatchard–Prentiss candidate) + dilute-limit slope vs the derived K_f | independent but THIN — one point, said plainly; also the ice witness: the depression agrees to 0.05 % with a_w evaluated at T_f, where the 25 °C surface leaves a 1.8 % gap |
| `props/electrolyte/archer01_nacl_cold_to_hot` | Archer, J. Phys. Chem. Ref. Data 21 (1992) 793, Tables 9–10 — γ±/φ at 273/298/323/373 K (interim transcription from the owner-provided paper) | **cross-evaluation** — Archer's tables are his own fitted equation's check values, and his database overlaps SP77's corpora: two independent fits of overlapping data, stronger than fit-consistency, weaker than raw measurement. The 273 K arm measures the announced below-window extrapolation fpd01 stands on: γ± AAD 1.05 % at 0 °C vs 0.17–0.29 % inside the window |
| `props/electrolyte/pb82_calcite_open_co2` | Plummer & Busenberg, GCA 46 (1982) 1011 — measured junction-corrected pH 6.004 ± 0.005 at calcite equilibrium, 25 °C / 0.956 atm PCO₂ (their model: 6.011) | **split, stated in the case**: the K's are LINEAGE (PHREEQC's carbonate block is this paper), but the measured pH independently tests the ASSEMBLY — gas pin + chained carbonate + ion pairs + Davies + electroneutrality + SI = 0 ceiling end to end. Engine: 6.029 — 0.025 above the electrode, the size an activity-model difference (Davies vs their Truesdell–Jones) predicts at I = 0.027; reported, not tuned |

**How much of this table is CHECKED, stated because the difference is the
whole point of the document.**  `check_validation_subset` recounts
*membership*: a validation-op case missing from the table fails.  It does not
and cannot check the *claims* in the right-hand columns — those are prose, and
prose about a number goes stale silently, which is precisely how the cavett01
row above came to assert a comparison that does not exist in the case.  The
`anchor` row (2026-08-10) is the mechanism that converts one of these claims
into something the suite falsifies, and today exactly four cases use it:
`pitzer_gamma_hamer_wu` (15 rows), `ctrl12_williams_otto` (6),
`flash09_n2ch4_stryjek` (2) and `pitzer_seawater_verify` (1).  The
Wiebe-Henry candidate from the same queue resolved the OTHER way, and the
resolution is the record: the `H2-NH3` Henry pair is FITTED to Wiebe &
Tremearne's Table I — the only dataset — so a Wiebe anchor would claim
validation from the fit's own training data (the LiCl circularity); no row
was authored, and no document claimed otherwise (checked).  **Every other row here is still a claim in
prose** — and the very first attempt to anchor one of them found it false
(the seawater row above), which is the argument for anchoring the rest.  Anchoring the rest is worth doing
and is not a campaign to start unasked; what is recorded here is the honest
count, so nobody reads this table as machine-verified.

Synthetic datasets (`*synthetic*.dat`) are teaching surrogates and may never
appear in this section; the gate refuses them by name.  The corrected axis
reading: the subset is materially larger than the seven this section carried,
still a small minority of the corpus, and now recounted rather than
remembered.

## 3a. The architectural witness tier, and the testing ladder (ruled 2026-08-10)

The full corpus answers *"did we break any historical case?"*.  For months it
was also being used to answer a different question — *"does each simulator
class still traverse the architecture?"* — after every local edit, which
turned prudence into a trial-and-error loop (small change → full regression →
small correction → full regression).  Vítor's ruling ended that: the second
question gets its own machinery, and the full regression returns to being a
**confirmation at closure, never a discovery tool**.

**The tier**: `tutorials/WITNESSES` declares one representative case per
execution class — fifteen today — and `bin/runTests --witnesses` runs exactly
those through the same per-case checks as the full sweep (NaN/inf guard,
goldens, anchors; the full-sweep-only gate arms are skipped, as for any
explicit case selection).  Minutes, not three quarters of an hour.
Gate `check_witness_tier` keeps the declaration resolvable (existing case,
golden present, classes and cases unique); representativeness is an
architect's review call and deliberately not gated.

**The ladder**:

1. **While editing** — only the directly affected tests: the touched case,
   the relevant `check_*` contract/refusal gates.
2. **A coherent change closed** — the witness of the affected class.
3. **A bounded slice closed** — `runTests --witnesses` across all classes.
4. **Campaign closure, release, or a genuinely cross-cutting change** — the
   full regression, once; `main` advances once if green.

**Two deviations from the ruling's text, stated rather than silent.**
(a) There is no `validation/` directory and none was created: a witness is a
ROLE, not an address — the same decision the tree made when `components/`
stayed physically flat and when stream roles became topology-inferred.
Migrating fifteen cases would have broken paths, goldens, seals and
`listCases` for zero physics.  (b) A case may be a teaching tutorial AND a
witness (`column13` is both); what the ruling's separation actually forbids —
complicating a tutorial into an "everything case", or minting a duplicate
case for a role an existing one carries — is enforced by review, and the
refusal of duplication is the arity doctrine applied to cases.

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
