# Queue ruling — 2026-08-08, the human decision queue cleared in one pass

> **KIND: ADR (rulings received from Vítor, recorded verbatim in substance).**
> Level 2 — these are decisions, not proposals.  The queue this clears was
> assembled by re-reading `DEV.md` §4b, the decision index, the consolidation
> map, and every record marked "awaiting"; four index entries found stale
> (already decided) are corrected in the same commit as this file.
>
> **One item is NOT executed: D1 was escalated back under C1's own escalation
> clause, because its factual premise failed on first contact with the tree.
> §D1 below records both the ruling and the escalation.**

---

## C1 — DELEGATE-WITH-DEFAULT, ratified with amendments

A DELEGATE-WITH-DEFAULT item may ship **immediately** after the default is
stated and the decision recorded — no waiting period — provided it is
reversible, gate/regression-guarded, and does not cross constitutional
territory.  **Vítor's silence is not a decision mechanism**: an item that
would need days of objection-window before it is safe was misclassified and
is CONSTITUTIONAL.

**Reserved to Vítor regardless of classification:** licence, authorship,
trademarks, **new data curation**, public compatibility commitments, and
changes to the fundamental thermo/case-format architecture.  If
implementation reveals a delegated item crosses one of these boundaries,
**stop and escalate** — which is exactly what happened to D1, below.

This amends the propose-then-wait rule of `project-philosophy.md` §4 for
non-constitutional items only; the philosophy file carries the amendment.

## C2 — ONE solid-equilibrium mechanism; NOT one fusion-K for everything

Approved: **one solid-equilibrium architecture** — a solid enters the
phase-equilibrium machinery through the appropriate chemical-potential /
equilibrium condition, so precipitation and crystallisation are never two
independent subtraction paths acting on the same equilibrium.

**Explicitly NOT approved:** forcing every solid into a fusion-K
parameterisation.  The thermodynamic representation may differ by class — a
molecular crystal may use melting/fusion properties; an inorganic mineral or
salt may use consistent formation/reaction thermodynamics or an equivalent
activity-based formulation; hydrates and solid solutions may need still other
models.  The target is: ONE equilibrium architecture · MULTIPLE explicit
solid thermodynamic models where physics requires them · NO double-counting
mechanisms.

**The design spike is mandatory before migration** and must demonstrate, at
minimum, that the common architecture serves (1) a reactive
mineral/precipitation case, (2) an ordinary salt/crystallisation case,
(3) a molecular solid/ice case — without double counting and without forcing
physically different solids into an inappropriate fusion-K form.  **No
migration of the existing speciation path is authorised until that spike is
reviewed.**

> **Same-day outcome (2026-08-08):** the spike was built, returned, and
> REVIEWED THE SAME DAY — **PASSED**; the target architecture is RATIFIED and
> the migration AUTHORISED under four boundary rulings (production solver =
> active-set complementarity + simultaneous damped Newton; data defines /
> case admits / service decides; sub-zero Ksp(T) is a curation gap, not a
> blocker; the interface lives in the phase-equilibrium layer).  The
> authoritative record of the verdict and its boundaries is
> [`solid-equilibrium-spike.md`](solid-equilibrium-spike.md) §7.

## C3 — uniform `phases ( … )` direction: APPROVED, no mass migration

The uniform declaration with explicit per-phase `type` may be built and may
coexist with the current grammar.  Mass migration of existing cases is a
separate, future decision, not authorised here.

## D1 — Wilson withdrawal: RULED, then ESCALATED BACK on a failed premise

**The ruling as given:** withdraw Wilson from `registerBuiltins` while it has
zero curated parameter pairs — "a selectable model that silently degenerates
to Raoult is worse than an explicit refusal" — re-entering with its first
properly curated pair.

**The premise, and how it failed.**  The advice underlying the ruling said
Wilson is never exercised and always returns ideal.  **That was false, and
the error was the adviser's** (a check of `data/standards/parameters/` only,
generalised to the whole tree): three cases select Wilson, and
`flash03_wilson_ethanol_water` carries INLINE pairs (`A_ij 1157.95 /
A_ji 4081.65`) producing real activity coefficients behind a passing golden.
Inline-over-catalogue is first-class precedence, not a loophole.  Executing
the withdrawal would break three passing tutorials — colliding with the
constitutional backwards-compat rule — so under C1's escalation clause the
item stops here.

**What is true:** the STANDARDS tier carries zero Wilson pairs, so a
catalogue-relying Wilson always ideal-defaults (announced, per
no-silent-crutch — not silent).  The defect is narrower than ruled on:
a curation gap plus, until today, an untested consistency claim.

**Executed instead, under C1 (reversible, test-only, no compat impact):**
the Gibbs-Duhem probe now tests Wilson WITH flash03's own inline pairs, so
the model three cases rely on is consistency-verified rather than listed
untestable.  **Escalated back to Vítor (it is new-data curation, reserved):**
whether the standards tier should gain a cited Wilson pair.  Until then the
model stays registered and the ideal-default announcement stands.

## D2 — model-declared record homes: three states, deliberately separate

**DECIDED** (2026-08-08): the direction — a model declares the records it
reads — and the proposal's recommended shape are ratified.
**BUILD AUTHORISED**: under C1, no further ruling is needed to implement.
**NOT BUILT**: no code exists against this, and none is scheduled before the
validation work.  The three states are recorded separately so nobody later
infers from "ratified" that the implementation exists (Vítor's bookkeeping
clarification, same day).

## D3 — unread keys, end state: RULED

The end state stays a loud warning (verbosity ≥ 1, with the summary); an
opt-in `strictKeys` refusal may be added when an author asks for it.
Revisit only on evidence that warnings are being ignored.

## D4 — the four stale queue entries: CLOSED, index corrected

Already decided before this ruling, the index rows merely stale:
unread-keys v1 (2026-07-31, built) · `role` vocabulary (panel option C,
2026-08-02, built) · seal divergence (counsel, 2026-08-03: no re-seal; the
report restructure is implementation) · solverDict (Vítor, 2026-08-04,
Option A).  Each corrected row links its ruling.

## N1–N5 — CLOSED AS DEFERRED, out of the active queue

Reopen one only when its stated trigger occurs:
**N1** D3 transfer term — a mixed-solvent case needs the rigor ·
**N2** basis-reconciliation mass migration — a second consumer case ·
**N3** pinch P3 area-cost — after validation work ·
**N4** `tearSelection auto` — author demand ·
**N5** `aq`-suffix removal — end-to-end typed references exist.

---

**The active human decision queue after this ruling: ONE item — the D1
escalation (curate a cited Wilson pair for the standards tier, or decline).**
Everything else is closed, delegated, or deferred-with-trigger.  Per the
ruling, the queue is not to be repopulated with ordinary implementation
choices that fall under DELEGATE-WITH-DEFAULT.


## Addendum 2, same day — the four axes, and the reopening rule

A completion table presented to Vítor mixed four registers into one
percentage column, and he corrected the frame before it could mislead:
architecture, implementation of already-ratified architecture, data
curation, and external validation are DIFFERENT AXES, and "~80% overall"
reads as ~80% of the current project target — not 80% architectural
consolidation.  His axis readings, recorded as given: constitutional /
governing architecture ~95% · core software architecture ~90–95% ·
thermodynamic architecture ~90% (electrolyte/speciation ~90–95%
architecturally, ~80% in completeness) · implementation of ratified
architecture ~80% · data curation ~60% · external validation ~15–20% ·
the whole against its current settled target ~80%.

The conclusion, rephrased as ruled: **the remaining architectural deficit is
primarily solids, with the phase grammar as the associated implementation
boundary; the dominant project-level deficit is external validation.**  On
solids the question is no longer "how should it work" — the principle is
ruled (§C2) — and **if the C2 spike succeeds across its three representative
cases, the solids architecture counts as consolidated even before every
implementation path is complete.**

The standing rule this produced lives in
[`verification-and-validation.md`](../architecture/verification-and-validation.md)
§6, with a binding pointer in philosophy §4: validation gaps are not
architectural incompleteness, and settled architecture reopens only on
demonstrated duplication, exception, or silent fallback.
