# Professors' forum — the `role` vocabulary, and what the reference simulators actually do (2026-08-02)

**Convened by:** Vítor, on decision #2 of the DEV.md §4b queue:
*"cria um forum de um professor top notch de termodinamica do MIT e ve como
faz o DWSIM e o ASPEN e resolve, porque isso é mesmo importante."*

**Panel.** The chair is an MIT-style molecular/applied-thermodynamics
professor (the archetype used in the earlier grammar fora); beside her,
the applied phase-equilibria chair, the electrolyte chair, and — new for
this question — a **process-systems practitioner** who has built plants
in both reference simulators and is here to report what they DO, not what
they claim.

*Naming discipline.* This is a DESIGN RECORD, developer-facing, and the
brief explicitly asked for the comparison, so the two tools are named
here. They must NOT be named in any user-facing manual, tutorial header,
`description` string, catalogue row or GUI copy (CLAUDE.md §10, settled
2026-07-03). Any wording that migrates from this forum into a guide gets
the generic phrasing.

---

## 1. The defect, stated once

`role` is a closed four-word enum — `volatile | solute | nonvolatile |
radical`. Two of the words (`volatile`, `solute`) **demand** a
`vaporPressure {}` block at construction. The other two are a **silent
physical claim**: both K-value paths in `ThermoPackage.cpp` (γ-φ, line
654; electrolyte, line 707) open with

```cpp
if (role == "nonvolatile" || role == "radical")   // K = 0
```

So a substance with no vapour-pressure correlation has exactly one legal
word, and that word means *this cannot leave the liquid*. The author who
merely lacks a correlation is forced to assert physics they do not
believe.

**The corpus already knows.** Measured on the curated tier this morning:
247 components, 138 declaring `nonvolatile`, 7 `solute`. Three of the 138
are heat-transfer fluids whose own comment says the word is a modelling
choice:

```
dowthermA          role nonvolatile;  // utility heat-carrier, never appears in a flash
hitecSalt          role nonvolatile;  // molten salt, never enters VLE
propyleneGlycol30  role nonvolatile;  // brine, treated as a single-phase liquid carrier
```

`dowthermA` is biphenyl / diphenyl oxide. It is **sold as a vapour-phase
heat-transfer fluid** — boiling is its industrial purpose. Choupo's
curated catalogue declares it incapable of it, and explains the lie in a
comment the machine cannot read. That is `RECORD_SPEC.md`'s forbidden
failure mode ("zero usable science may live only in a comment") sitting
in the curated tier, not a staging accident.

---

## 2. What the reference simulators actually do

**The practitioner reports (verified against public documentation and the
open-source codebase, 2026-08-02):**

**Aspen Plus** has a component **Type** — `Conventional` / `Solid` /
`Nonconventional` — and, ORTHOGONALLY, a case-scoped **Henry Components
list** attached to a property method. The Type is a *participation
class*: nonconventional solids "do not participate in phase and chemical
equilibrium calculations" and are characterised only by enthalpy and
density models, described by proximate/ultimate analysis attributes. It
is not a volatility claim about a liquid. There is **no word meaning "this
liquid cannot evaporate."** When a user needs one, the documented
community practice is to **type `1e-10` into the vapour-pressure
parameter table by hand.**

**DWSIM** (GPL, source public) carries on `ICompoundConstantProperties` a
set of **orthogonal boolean FACTS** — `IsSolid`, `IsIon`, `IsSalt`,
`IsHydratedSalt` — alongside stored constants including `NBP` (normal
boiling point), and separately the correlation objects. There is again no
role word carrying volatility. When a vapour-pressure correlation is
missing, DWSIM **estimates it** (Lee-Kesler) and proceeds.

**The chair's reading, which the panel ratifies:**

> Both tools separate the two things Choupo has fused. In neither is
> volatility a *declaration*; in both it is a **consequence** — of which
> correlations exist for the substance and which convention the case
> selected (Henry list, property method). What Choupo calls `role` is
> really two variables wearing one name: *what class of thing is this*
> (Aspen's Type, DWSIM's Is* flags) and *how does this case choose to
> model it* (Aspen's Henry list).

**And both fill the data hole by manufacturing a number.** Aspen's
`1e-10` is fabricated by hand; DWSIM's Lee-Kesler is fabricated
automatically. Neither refuses. **This is precisely where Choupo must not
follow them.** The project's standing doctrine — *no silent crutch*, and
the phase-3 refusal to fit Clausius-Clapeyron through a single point
because "that manufactures a correlation to satisfy a validation rule, a
crutch wearing a lab coat" — forbids both remedies.

So the comparison yields an asymmetric lesson, and the panel wants it
recorded in exactly this shape:

* **Copy the STRUCTURE.** The split (substance facts ⟂ case modelling
  choice) is not a stylistic preference; it is what two independent
  mature designs converged on, and Choupo's own corpus reinvented it in
  prose in fourteen files.
* **Refuse the REMEDY.** Where they fabricate, Choupo refuses by name.
  That refusal is the project's differentiator, not a gap in it.

---

## 3. The panel's resolution

The gap document (2026-07-24) recommended **B now, C next, A folded into
B** — add a fifth word (`volatileUndeclared` or similar), relax `solute`
to load via Henry, and schedule the ontology split for later.

**The panel overturns the ordering: go straight to C, and B becomes
unnecessary.**

*Chair:* "A fifth word is paying to entrench the very confusion the
evidence says is structural. Neither reference tool has *four* words
carrying this meaning; adding a fifth to ours does not move us toward
either. And note what B is: a word meaning 'volatile, correlation
missing.' That is not a property of the substance — it is a statement
about the state of **our** data. Substance records must not carry facts
about our curation backlog; that is what `status` and provenance are
for."

*Applied phase-equilibria chair:* "There is also a physical objection. B
asks the author to assert volatility with no number behind it. C asks for
a **cited datum** — `normalBoilingPoint` with its provenance — which is
falsifiable. One is an opinion, the other is evidence."

*Electrolyte chair:* "C also composes with what we already ratified. The
one-knob rule says the reference basis is a CONSEQUENCE of the declared
formulation, never an independent selector. Volatility should obey the
same law: a consequence of (declared facts × declared model), not a
fifth knob."

**Ratified design — the split, with the refusal:**

1. **`role` narrows to what it always was: the case's modelling class.**
   Four words, unchanged, no migration. Its meaning becomes *how this
   component participates in this case's VLE machinery* — Aspen's Type,
   not a physical assertion.

2. **A new intrinsic block states the physics, arity-1, cited:**

   ```
   volatility
   {
       class               volatile;      // volatile | nonvolatile | decomposes
       normalBoilingPoint  530.15 K;      // required when class is volatile
       provenance { citation "..."; status accepted; }
   }
   ```

3. **The engine cross-checks and ANNOUNCES, never silently obeys.** A
   case modelling `dowthermA` as `role nonvolatile` while its record
   declares `volatility.class volatile` gets, at verbosity ≥ 1:

   > *component 'dowthermA' is MODELLED nonvolatile (K = 0) although its
   > record declares it volatile with Tb = 530.15 K — a case-scoped
   > simplification, legal and announced.*

   The run continues. The simplification stays available; it stops being
   silent. **This is the whole of the fix's value** — it converts 138
   silent assertions into either a verified fact or an announced
   simplification.

4. **Where a K-value is genuinely needed and no route exists — refuse.**
   A component with `volatility.class volatile`, no vapour-pressure
   correlation and no Henry pair, reached by a flash, throws with the
   remedy named (Antoine set, corresponding-states model, or a Henry
   pair). That is B's entire benefit, obtained without B's word.

5. **`solute` loads via Henry** (option A, folded in): the `needsVP`
   check for `solute` moves from component load to package assembly,
   where the solvent and the Henry registry are visible; a `solute` with
   neither route is a loud build-time refusal. The existing `solute` →
   Raoult *fallback* is deleted — silently substituting one law for
   another is the crutch by definition.

**Absence is not a claim.** A component with no `volatility` block is
UNKNOWN, not nonvolatile. The engine announces the gap when the component
is used somewhere volatility matters, and the curation remedy is named.
Migration is therefore incremental: 247 records do not need to change on
day one, and the ones that do are exactly the ones whose word is doing
physical work.

---

## 4. What the panel explicitly rejects

* **Aspen's `1e-10`.** A fabricated vapour pressure is a wrong answer with
  a confidence interval of zero. Rejected by the no-silent-crutch
  doctrine; rejected again by the pedagogy — a student who reads
  `1e-10` learns nothing about why the number is missing.
* **DWSIM's automatic Lee-Kesler substitution** *in this role*.
  Choupo already ships Lee-Kesler estimates — under
  `data/groupEstimative/`, **flagged as estimates**, as a curation-time
  act the student reviews and promotes. The objection is not to the
  correlation; it is to applying it silently at run time to paper over a
  missing declaration. Same equation, opposite epistemics.
* **A fifth `role` word.** Superseded by C, as argued above.
* **Deriving volatility from `Tb` vs. operating T at run time.** That is
  a resolver in the hot path — rejected in the property architecture
  (2026-06-05) and rejected again here.

---

## 5. Sequencing (Pareto)

The value is concentrated in step 3, the announcement: it is what turns
138 silent claims into honest ones, and it needs only the block, the
reader and the cross-check. Steps 4 and 5 harden the refusals and can
follow. The full migration of 247 records is NOT on the critical path and
should be demand-driven — a record gains its `volatility` block when a
case makes its volatility matter.

**Gate:** `check_volatility_declaration` — the announcement fires on a
declared contradiction (dowthermA is the ready-made fixture); a
`volatility.class volatile` component with no K-route refuses when
flashed; a component with no block is announced UNKNOWN, never silently
treated as either; and the three fixtures are sabotage-verified.

---

## 6. One-line answer to Vítor's question

> Both reference simulators keep *what the substance is* separate from
> *how this case models it*, and both fill a missing correlation by
> inventing a number. Choupo should adopt the separation and refuse the
> invention — which is option **C**, now, without the fifth word.
