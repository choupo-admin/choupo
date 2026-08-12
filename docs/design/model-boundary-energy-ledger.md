# The model-boundary energy ledger — explain and classify the imbalance, never erase it

> **KIND: ADR · STATUS: SHIPPED 2026-08-09 · AUTHORITY: LEVEL 3.**
> Implements the model-boundary AUDIT ratified by forum 5/5 of 2026-06-08
> (`CLAUDE.md` §10), under Vítor's ruling of 2026-08-09.  It does **not**
> reopen that architecture: *H is the conserved truth, T is the
> model-dependent readout*, the default stays hold-T / let-H-jump, and the
> jump must stay visible.  What was missing was the **accounting**.
> Gate: `bin/curate/check_model_boundary_ledger.py`.

---

## 1. The measured problem

`tutorials/steady/thermo/basis01_two_unit_chain`,
`reports/balances/energyBalance_byUnit.csv`, before this change:

```
speciator,    -7799.1548, -7799.1548,  0.0000, 0.0000, 100.00, elements
transporter,  -7794.0783, -7757.0634, 37.0149, 40.0000,  92.54, elements
```

The `transporter` is a heater carrying a per-unit `thermo {}` override.  It
solves its outlet in **its own declared world** — a plain molecular
gamma-phi that finds this brine 1.3 % vapour at ~331 K, so 40 kW buys
17.66 K there.  The energy report prices **every** stream in the case's
world, an electrolyte gamma-phi that holds the same volatiles as ions and
finds essentially no vapour, and reads the same two streams 37.0149 kW
apart.

The 2.9851 kW difference was charged to the unit, labelled *"an UNEXPLAINED
first-law residual"*, and raised the RED conservation alarm
(`src/reporting/BalanceAlarm.H`).

**The energy is not missing.**  Verified independently by deleting the local
`thermo {}` block, which reproduces the un-overridden answer exactly.  It is
the **enthalpy step at a model boundary** — the direct consequence of the
settled rule.  A model boundary is not a physical device, so there is no real
ΔT to absorb; Choupo holds (T, P, z) and lets H step.  The step was already
architecture.  It was not yet **arithmetic anybody could check**.

## 2. What is now true

Three quantities, kept apart on every surface, never collapsed:

| | quantity | basis01 / transporter |
|---|---|---|
| **(a)** | the RAW physical imbalance, before any model-boundary accounting | **−2.9851 kW** |
| **(b)** | the enthalpy STEP attributed to the identified model transition | **−2.9851 kW** |
| **(c)** | what REMAINS unexplained after the step is accounted | **9.4e-9 kW** |

The verdict is taken on **(c)**.  The ledger row, verbatim:

```
transporter,accounted,
  formulation:electrolyteGammaPhi|aqueous:davies|vapour:idealGas,
  formulation:gammaPhi|liquid:ideal|vapour:idealGas,
  model boundary: hold (T;P;z) and let H step -- the unit computes in its
    own declared world while the report prices its streams in the case's
    world (settled 2026-06-08; H is the conserved truth and T the
    model-dependent readout),
  -,kW,2.9851,-2.9851,-2.9851,0.0000,1.695416e-10,
  absolute tolerance (normalized residual <= tolerance),
  brine=+2.91499;warmBrine=-5.90008,
```

(one line in the file; wrapped here.  Columns: `unit, status,
upstream_world, downstream_world, rule, sign, units, magnitude,
raw_imbalance_kW, boundary_step_kW, remaining_kW, norm_residual, criterion,
per_stream_step_kW, reason`.)

The per-unit table keeps its **six original columns unchanged** —
`dH_kW 37.0149`, `energy_items_kW 40.0000` and `energy_closure_pct 92.54`
are all still there and still mean what they meant — and gains
`raw_imbalance_kW`, `boundary_step_kW`, `remaining_kW`,
`adjusted_closure_pct` (the verdict column, now 100.00) and `boundary`.
The same three quantities ride the result JSON as `energyClosures`.

**The raw imbalance is never overwritten.**  A number that explains an
anomaly must be readable *apart* from the anomaly, or the next reader cannot
check the explanation.

## 3. Independence — the load-bearing constraint

> *"Do not let the reporting path share the same derivation as the model
> transition it is auditing."*

The report accepts **no** dH computed by the unit and never calls
`Flowsheet::thermoFor`.  `src/reporting/ModelBoundaryLedger.{H,cpp}`:

1. reads the unit's `thermo {}` block out of the **flowsheetDict itself**;
2. merges it onto the case's authored system and assembles the result
   through the **public `ThermoPackageBuilder`**, with the global component
   list — its own package object, built from the same declaration but by a
   different caller;
3. prices the unit's inlet and outlet streams in **both** packages at the
   **same (T, P, z)**, with the same reading convention, and takes
   `step = Σ_out (H_report − H_local) − Σ_in (H_report − H_local)`;
4. **checks that its own step reproduces the raw imbalance the report
   measured.**  If it does not, nothing is credited and the alarm stays.

`ReportContext` gained exactly four members to make this possible — the
`Database`, the authored package dict, the chemistry selection and the
solverDict — handed over as **dicts and records, never as an assembled
package**, so that the audit cannot accidentally borrow the object it is
auditing.  All four are optional; a context without them reports
`unavailable` rather than falling back.

**This duplicates work the Flowsheet already did, deliberately, and in full
knowledge of the arity doctrine.**  The doctrine forbids two homes for one
*fact*.  An audit is not a second home for a fact: it is a second,
independent derivation of a *claim*, whose entire value is that it can
disagree.  An auditor that reuses the auditee's arithmetic checks nothing —
it re-prints it.  The comment saying so sits at the assembly site.

What *is* shared, on purpose, is the **declaration grammar**
(`mergeThermoOverride`): the auditor must read the same declaration the
engine read, or it would be auditing a different case.  Grammar shared,
arithmetic separate.

## 4. When the RED alarm stays

A step is credited **only** when all five hold; every other outcome leaves
(c) = (a), fires the alarm, and names which one failed.

| condition | status when it fails |
|---|---|
| DECLARED — a `thermo {}` naming a world, where the auditor can read it | `none` |
| UNAMBIGUOUS — exactly one declaration answers to the unit's name | `ambiguous` |
| PRICEABLE — no speciation flip, no datum flip | `refused` |
| READABLE — both worlds resolved the stream | `refused` |
| REPRODUCED — (c) meets the declared criteria | `unconfirmed` |

**A boundary is never inferred from coincident numbers.**  No code path
consults the imbalance before deciding whether a boundary exists: a boundary
is a *declaration*, an imbalance is a *measurement*, and inferring the first
from the second is precisely what the ruling forbids.

### 4a. What "a phase/vf flip" means here, and why

> **RATIFIED by Vítor, 2026-08-09, in his own wording** — the interpretation
> below is confirmed, with the rule narrowed so it does not become broader
> than intended:
>
> > *Phase-fraction disagreement between two independently converged
> > equilibrium resolutions is admissible evidence of a model-boundary step.
> > A difference in declared physical constraints or in the conserved/chemical
> > problem being solved is not.*
>
> His reasoning, recorded because it is the load-bearing part: if the same
> conserved stream at the same T, P and overall composition is independently
> and successfully resolved in two declared thermo worlds, then
> `world A -> V/F = 0.23` against `world B -> V/F = 0.31` **is precisely part
> of the physical consequence of crossing that model boundary**.  Refusing the
> comparison because the phase fraction changed *"would make the ledger least
> useful exactly where model choice matters most."*
>
> HARD REFUSAL IS RETAINED wherever the comparison itself stops being
> well-defined — the five cases, verbatim:
>
> * one thermo world does not converge or cannot resolve the state;
> * the two sides use different physical **pins** rather than two free
>   equilibrium resolutions;
> * the conserved **basis** or declared **chemistry** changes across the
>   boundary;
> * a **solid phase** appears/disappears and the enthalpic comparison is not
>   yet unambiguously supported by the declared thermochemistry;
> * or the report **cannot independently reproduce** the boundary step and is
>   only inferring it from coincident numbers.
>
> And the distinction that explains `perUnitThermo01` staying red: *"merely
> finding a thermo-world difference is not enough.  The independently
> reconstructed step must actually explain the raw imbalance."*
>
> On the `flash20` finding (a 42.86 kW PC-SAFT↔NRTL step nobody had
> connected): *"especially valuable.  Discovering a 42.86 kW step in another
> case is evidence that the model-boundary ledger is capturing a general
> phenomenon rather than repairing basis01 specifically."*


The doctrine's shipped hard refusals
(`src/unitOperations/flowsheet/ModelBoundaryAudit.H`) are the **speciation**
flip (electrolyte ↔ molecular with a species that actually speciates
present) and the **datum** flip (pure-fluid ↔ formation reference).  Both are
implemented here, independently.

`CLAUDE.md` §10 words the refusal as *"any phase/vf/speciation flip"*, and
that phrase needed a precise reading, because **basis01's boundary is a
difference in resolved vapour fraction and nothing else**.  Read literally,
the refusal would fire on the only case the feature was ruled for and the
ledger could never account for anything.

The reading adopted, and the reason: the refusals exist because *across
them the two worlds share no common reference and a single dH would lie*.
A differing vapour FRACTION between two **converged** VL resolutions is not
that — it is the step itself, the very quantity the audit publishes.  What
is refused as a reading flip is a change that breaks commensurability:

* one world resolved a two-phase equilibrium and the other could not read
  the state at all (the two enthalpies then rest on different readings);
* a solid phase present in one world and absent in the other (a change in
  the composition basis).

This is a **clarification of scope, stated rather than assumed**.  If Vítor
reads the doctrine as forbidding a resolved-vf difference too, the feature
has no case to serve and the ruling would need re-opening — which is why it
is written here in full rather than buried in a predicate.

## 5. The criterion — and where it is an honest adaptation

The reproduction test uses `src/solver/Convergence.H`, the project's ONE
normalized-residual contract.  **No second tolerance and no second
normalization were invented.**  Controls come from

```
system/solverDict:  modelBoundaryClosure { tolerance 1e-6; relTol 0; }
```

and the residual system is one equation per audited unit,

```
r_k     = dH_k - items_k - step_k              ( == remaining_kW )
terms_k = { dH_k , items_k , step_k }
```

which satisfies Convergence.H §2(c): the terms combine, with the signs the
equation gives them, into exactly `r_k`.  `normInitial` is the same system
*before* any step is credited, so `relTol` reads as *"the declared step must
reduce the imbalance by this factor"*.

Three things are deviations, and the ruling asked for them to be said aloud
rather than forked silently.

**(i) Three terms, not two.**  The obvious pair `{dH, items + step}`
degenerates by Convergence.H's own §2(b) — with one equation and two terms
the spread *is* the residual — which would force the verdict onto a raw kW
residual against a tolerance whose documented default (1e-12) is meaningless
for an energy balance.  Handing over the three quantities the equation
actually balances is both closer to the equation as written and
non-degenerate.  The degenerate branch is still honoured where it genuinely
occurs and then says so.

**(ii) The closure band is not retro-judged.**  A unit with **no** declared
boundary keeps the report's pre-existing verdict exactly — the
`energyBandPct` closure band, unchanged, on a residual that is unchanged
because its step is 0.  The normalized criterion governs the NEW claim it
was ruled for (a credited step) and is not silently applied to several
hundred existing cases under a tolerance nobody chose for them.  Two claims,
two criteria, one home each, and the CSV names which decided every row.

**(iii) `maxIter` is refused, not ignored.**  It is part of the OpenFOAM
triple, but a closure is not an iteration.  Declaring it in this block
refuses by name — Convergence.H's own posture on a control a solver does not
implement.

**The default `tolerance 1e-6` is set against the criterion it GATES, not
against any measurement.**  The closure band this report already judges by
is 0.5 % (5e-3); a reproduction test that credits a step must be far tighter
than the residual that step is allowed to explain, or it could certify a
step the size of the anomaly.  1e-6 is 5000× tighter than that band.  For
scale, and explicitly *not* as the reason for the choice: basis01's step
reproduces its raw imbalance to a normalized 1.7e-10, so there are four
decades of headroom above what the reference case achieves.

## 6. What this changed in the corpus

Four cases carry a per-unit `thermo {}` in their flowsheetDict.  No golden
moved; the physics is untouched, and only the report's verdict and its new
columns changed.

| case | before | after |
|---|---|---|
| `basis01_two_unit_chain` | RED alarm, 92.54 % | `accounted`, adjusted 100.00 %, raw still printed |
| `flash20_ethanol_water_pcsaft` | RED alarm on `flashNRTL` (0.00 % closure against Q = 0) | `accounted` — a 42.86 kW PC-SAFT↔NRTL step, the same defect one field away |
| `perUnitThermo01_srk_nrtl` | RED alarm on `turbine` | RED alarm on `turbine`, now saying **why**: `unconfirmed`, a 7.5 kW step against a 536 kW imbalance, not credited |
| `crystalliser09_KHT_KCl_series` | curation gaps (no enthalpy datum) | unchanged |

`flash20` is worth naming: it was alarming for exactly the same reason as
basis01 and nobody had connected the two.  `perUnitThermo01`'s turbine is
the live witness that the audit **refuses** as readily as it credits — its
imbalance is a real modelling matter in that tutorial and the ledger does
not pretend otherwise.

## 7. Rejected alternatives

**Absorb the step into T (hold H, flex T).**  Rejected in 2026-06-08 and not
reopened; recorded here because it is the first thing anyone proposes.  It
hides energy in an invisible T-nudge that biases recycles, and eNRTL↔NRTL
has no common composition basis to nudge on.

**Price the report's streams in each unit's own world.**  This would make
the imbalance vanish with no ledger at all — and with it every trace that
two models disagree.  It also gives the plant no single enthalpy scale, so
the global boundary balance would sum numbers on different readings.  The
step must be *visible*, which means one scale plus an explicit correction.

**Let the report ask the unit (or `Flowsheet::thermoFor`) for the step.**
Cheaper, shorter, and worthless: an auditor that reuses the auditee's
arithmetic cannot disagree with it, so a wrong step would be confirmed by
its own author.  This is the rejected alternative the whole design turns on.

**Retro-apply the normalized criterion to every unit's closure.**  Tempting
(one criterion everywhere) and rejected: it would silently re-judge several
hundred cases under a tolerance nobody chose for them, in a slice whose
subject is one heater.  §5(ii).

**Refuse on any resolved-vf difference, per the literal wording of §10.**
Rejected with its reasoning stated in §4a rather than quietly reinterpreted.

## 8. Named gaps

* **No corpus case exercises the speciation, datum or reading refusals**, so
  the gate covers none of them and says so in its own OK line.  They are
  implemented and unwitnessed.
* **Folder-based units are not audited.**  A unit reached through a
  `units ( a b )` word list gets its world from an engine-injected
  `propertyContextBase` that appears in no dict on disk.  The auditor cannot
  read that declaration and does not claim to: such a unit keeps `none` and,
  if it has an imbalance, keeps the alarm.  A named gap is worth more than a
  guessed boundary.
* **A unit that declares no energy item is not reconciled at all**, so it
  gets no ledger row.  Its dH *is* its net duty by definition and there is
  nothing for a step to explain — but it also means a model boundary across
  an adiabatic unit is invisible to this ledger.  The plant-level
  model-inconsistency total in `ModelBoundaryAudit.H` remains the surface
  for that.
* **A UTILITY medium crossing the same boundary is not stepped.**  The step
  is taken over the process streams, because `dH` is, and the two must be
  the same difference or the reproduction test could never pass.  A unit
  with both a utility medium and a `thermo {}` override would have the
  medium's own step omitted — no corpus case has both, and the omission
  fails safe: an incomplete step cannot reproduce the imbalance, so it is
  reported `unconfirmed` and credited nothing.
* **The two audits are not yet one.**  `ModelBoundaryAudit.H` (stream-wise,
  at fixed vf, in the solver) and this ledger (unit-wise, over resolved
  states, in the report) answer different questions and agree where they
  overlap only by construction, not by a shared derivation.  Merging them
  would recreate exactly the dependency §3 forbids in one direction; the
  right shape is not yet obvious and is deliberately not guessed.

## The ledger's own numbers were checked by nothing (2026-08-12)

This record's central claim is that **three quantities travel apart and are
never collapsed** — the raw imbalance, the declared step, and what remains —
and that the verdict is taken on the third.  All three are emitted into a
top-level `"energyClosures"` array of the result JSON, keyed by `"unit"`.

`bin/runTests` could read `kpis`, `streams`, `operationResults[].diagnostics`
and (since the same day) the `validation` overlay table.  It could not read
this one.  So **not a single number of the ledger was pinned by any golden**,
in any case, since the slice shipped.

The gap is specific rather than theoretical.  The step is credited only when an
INDEPENDENTLY assembled package reproduces the imbalance — *an auditor that
reuses the auditee's arithmetic checks nothing*, §3 of this record.  Had that
independent path stopped reproducing it, `basis01_two_unit_chain`'s
`remaining_kW` would have climbed from 9.4e-9 kW to the full 2.99 kW and the
status fallen back to `unconfirmed`, and the suite would have stayed green.

Closed by a `closure` row kind (`closure <unit> <field>`), auto-generated by
`--record` for every unit whose status is not `none`, and by
`check_closure_ledger_pinned` requiring published ⇒ pinned and pinned ⇒
published.  Corpus effect: twelve quantities across three cases, including
`perUnitThermo01_srk_nrtl`'s turbine — the live REFUSAL path, where an
independently computed 7.5 kW does not reproduce a 536 kW imbalance, the step
is not credited and the alarm stands.  That refusal is now falsifiable too.

**The band on `remaining_kW` is chosen by an absolute floor, and the reason is
in this project's own history.**  Where the step was credited the remaining is
cancellation round-off (9.4e-9 kW against a 2.99 kW step), and a 1e-4
*relative* band on it pins round-off — it fails on a compiler flag and catches
no physics.  That is the `column13` lesson verbatim, where a golden pinning a
one-nanowatt re-flash duty at 1e-4 relative was pinning cancellation.  Any
value below a microwatt is therefore emitted at `1e0`: an order-of-magnitude
assertion, which still catches the eight-order-of-magnitude jump that a failed
audit would produce.  Above the floor the default band applies, so the
turbine's three real numbers are pinned tight.

**What is NOT covered, and it is a real difference.**  `status`, `rule`,
`criterion` and the two world strings are prose; a golden row compares
numbers.  A status downgrade is caught *indirectly* — it zeroes `step_kW` and
pushes `remaining_kW` back up to the raw, both pinned — but it is not read
directly, and the gate says so rather than implying coverage it lacks.
