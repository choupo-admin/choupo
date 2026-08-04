# Virtual forum — second session, on the rewritten dictionaries

**What this is:** a device for structured self-criticism, not real people.
Six voices with genuinely different angles attack the design.
**Every finding below was verified against the repository before it was written
here** — where it says "confirmed", there is a file and a line.

System under review: `docs/design/flashComplex/` at commit `3f0778fd` (the
rewrite into the corpus form).

---

## Session 1 — the data-structures engineer opens

**Software architect**

> I will be brief, because the finding is large and needs no ornament.
>
> You declare five masters and two solids.  I went and read the builder.  At
> `ThermoPackageBuilder.cpp:690` there is this:
>
> ```
> apparent component '<X>' carries TWO candidate marker elements (C, Ca)
>   -- the spike's collapse contract needs exactly one; generalised salt
>   reconstruction is a later, deliberate slice.
> ```
>
> `CaCO3` has Ca and C.  `NH4HCO3` has N and C.  **Both of this case's solids
> fall into that refusal**, and the message even names the missing slice.
>
> And there is a second floor: even if you declared the typed bridge on each of
> them, `markersSeen` (line 709) refuses two components sharing the marker
> element.  CO2, CaCO3 and NH4HCO3 all compete for C.
>
> This is not a bug.  It is the grammar saying, correctly and in writing, that
> it does not yet know how to represent a salt dissolving into **two** networks.
> The case has found its second mandatory slice.

**Professor of electrolyte thermodynamics**

> Seconded, and it is good that it is so — the refusal is more honest than any
> answer the code could have invented.  Dissolved CaCO3 **is** calcium and
> carbonate at the same time; there is no single-element collapse that
> represents it.  It is the (c-1)(a-1) degrees-of-freedom theorem showing up as
> an error message instead of as an equation.
>
> Now my point, and it is about the CO2 ladder you approved.
>
> You write in `DESIGN_DECISIONS.md` §3.3 that *"the aggregate behaviour is
> exact by construction"*.  **It is not.**  By giving `CO2aq` the aggregate's
> constant (6.352) and adding H2CO3 on top, the network now reproduces an
> aggregate of **6.352564**, not 6.352 — because the aggregate is now the sum of
> the two and you put the sum's value into one of the two.
>
> The deviation is 0.00056 log units, against a declared uncertainty of 0.002.
> It is **inside** the uncertainty, so it changes not one number a student would
> quote.  But the phrase "exact by construction" is wrong, and it is the kind of
> phrase somebody later cites as though it were a theorem.
>
> The correction is a subtraction: `logK(CO2aq) = 6.352 - log(1 + 10^-2.886) =
> **6.351436**`, and H2CO3 becomes 3.465436.  Then it IS exact by construction.

---

## Session 2 — the people who have to use this

**Doctoral student**

> My objection is to `chemistryDict`.  You declare
>
> ```
> solidPhases ( calcite  ammoniumBicarbonate );
> ```
>
> and the builder, at `ThermoPackageBuilder.cpp:248`, prints:
>
> ```
> [builder] chemistryDict solidPhases lists 2 phases but the single-salt
>   adapter honours ONLY 'calcite' -- the rest are IGNORED
> ```
>
> **Ignored.**  The whole case was built around two solids sharing the
> carbonate, and today's adapter takes the first and throws the second away —
> with a warning, but it throws it away.
>
> That makes the list's ORDER significant.  If I swap the two words, the case
> changes its answer.  A list where the order decides the physics, with nothing
> saying so, is worse than a refusal.
>
> *(Precision added after checking: the truncation is confined to the
> SINGLE-SALT adapter.  `formulation gammaPhi` reads the whole list via
> `aq.solidPhases`, which is why the four scaling tutorials with
> `( calcite gypsum )` work.  The finding stands — it is just narrower than I
> stated it.)*

**Undergraduate**

> I understand the NH3 file now, and I did not before.  The last two lines say
> everything and the header explains the -1 sign to me.  That is good.
>
> What I do not understand is: if `CaCO3.dat` has the dissolution reaction
> inside it (`solidPhases { calcite { dissolutionReaction ... } }`), and you
> spent the week explaining to me that **reactions do not live inside
> components**... why does this one?

**Geochemist**

> Good question, and the answer exists — but it is not written where he looked
> for it.
>
> Calcite dissolution is not a reaction between two families: it is a property
> of **that solid phase of that component**.  The `README.md` in
> `data/standards/chemistry/` says so explicitly ("Where the salt / mineral
> solubility lives (NOT here)").  The criterion is clean: if the reaction
> belongs to a single component, it lives in it; if it couples two families, it
> lives in `chemistry/`.
>
> But the case's own `constant/chemistry/README.md` does not say this.  It says
> what IS in there and does not say what deliberately is **not**.  A student
> reading only the case draws the wrong rule.

**Professor of separations**

> I return to what I said in the previous session and acknowledge it was
> handled — the second-liquid-phase gap is now declared instead of hidden, and
> the text says the water/benzene immiscibility is the large approximation, not
> the 0.2 % of water.  Accepted.
>
> What bothers me now is something else, small but of the corroding kind:
> `NH3.dat` carries a `liquidHeatCapacity { 80.0 }` that this case never uses,
> because ammonia here is dissolved or vapour, never a pure liquid.  You
> mirrored it from the catalogue.  Fine — mirroring is the right rule.  But then
> the case carries blocks it does not use, and a student reading for what
> matters reads 80 J/mol.K as though it mattered.

---

## Findings — what survived verification

Six objections.  **Five confirm; one is editorial.**

| # | finding | status | severity |
|---|---|---|---|
| 1 | BOTH of the case's solids (CaCO3, NH4HCO3) fall into the "two marker elements" refusal; the message itself names the missing slice | **CONFIRMED** `ThermoPackageBuilder.cpp:690` | **structural** — this is the second mandatory slice |
| 2 | `chemistryDict` with two solids: the adapter honours the FIRST and ignores the rest, with a warning.  The list order decides the physics | **CONFIRMED** `ThermoPackageBuilder.cpp:248` | high |
| 3 | "the aggregate is exact by construction" is false by 0.00056 log (inside the 0.002 uncertainty, but the sentence is a false theorem) | **CONFIRMED** by calculation | medium |
| 4 | the masters declared in the corpus have only ever been `Acetate` and `NH4`; this case declares FIVE — unexercised territory | **CONFIRMED** (tutorial sweep) | medium |
| 5 | the `README.md` in `constant/chemistry/` does not say what is deliberately NOT there (mineral solubility) | **CONFIRMED** by reading | medium — pedagogical |
| 6 | mirrored blocks the case does not use (NH3's `liquidHeatCapacity`) | confirmed, but it is the **correct price** of mirroring | low |

### Finding 1 is what changes the plan

The case already had one named gap: **there is no slot for a second liquid
phase**.  Now it has a second, and it comes first: **there is no representation
for a salt dissolving into two declared families**.

The second is more fundamental than the first.  A second liquid phase is an
extension of the phase grammar.  General salt reconstruction is an extension of
the relation between the component basis and the species basis — it is exactly
the seam the basis-reconciliation `[ROADMAP]` already names, and which carries
the instruction *do a vertical end-to-end spike before any migration*.

The case, without a line of engine written, produced the correct order of the
two.

### Finding 2 is the cheapest to fix and the most dangerous to leave

A list silently truncated to its first element, with the order deciding the
result, is the classic way for a case to give a wrong answer with exit code 0.
The right refusal is: *if `chemistryDict` declares more solids than the active
adapter can honour, refuse naming both* — not warn and continue.

### Finding 6 is not for fixing

Mirroring from the catalogue is the rule that caught six invented constants in
this very rewrite.  If we now start pruning the blocks "this case does not use",
we go back to re-authoring records by hand — and that is precisely where values
drift.  The price of one block too many is far smaller than the price of one
invented value.

## What the forum did NOT overturn

- chemistry outside the components, flat, one file per reaction;
- mirroring instead of re-authoring (with the six-constants proof);
- the `authority` written twice and not fifteen times;
- the flash's two outlets;
- identity with a single home (inline ion/z);
- the NH4HCO3 refusal for want of a curated datum;
- the split of the CO2 ladder — the physics is right, only the sentence about
  it was wrong.

## Status of the FIRST forum's findings

Finding 2 of that session — pH printed with no declared scale — is **closed**.
`AqueousActivity::pHScale()` is **pure virtual**: a new model declares its
single-ion convention or it does not compile.  There is no default, because a
default would let one model silently inherit another's convention.

Both models declare themselves: Davies gives `log10 g = -A z^2 (...)`, a
function of charge alone, so `g_H = g_Na = g_Cl` — a **free** scale by
construction.  HMW regresses against mean coefficients, and the single-ion split
is the one its parameterisation implies.

The dangerous direction is the other one, and it is handled: when the case
**imposes** a pH, the output says that number is being **read** on that scale —
and that an electrode reading is NBS.  A student who writes down the pH measured
in the lab now sees that the engine is not reading it the way they measured it.

Finding 1 of that session — the Davies silence band — is **closed** (a commit in
this series).  The threshold dropped from 0.7 to 0.5, which is the value the
message itself had always declared.

Measured impact across the 24 corpus cases using Davies: **one** case changes
behaviour, `props/electrolyte/pitzer_calcite_brine` at **I = 0.66** — exactly
inside the band, exactly the case the objection predicted.  The other two that
already warned (`composition01_nacl`, `overlay01_nacl_ksp`, both at I = 2.00)
keep warning.  No golden moved: 318 PASS.

## Proposed order

1. **Finding 3** — a one-line subtraction in `H2CO3-formation.dat` and
   `CO2aq-formation.dat` (case-local), or rewrite the sentence.  Vitor's
   decision: re-base the numbers, or fix only the text?
2. **Finding 2** — turn the warning into a refusal.  One line, but it is engine.
3. **Finding 5** — the README says what is not there.  Text.
4. **Finding 1** — name the "general salt reconstruction" slice in
   `DESIGN_DECISIONS.md` §5, **before** the second liquid phase.
5. **Finding 4** — it stays named; it is only exercised when the case runs.
