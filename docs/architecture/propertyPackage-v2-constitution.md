# The propertyPackage v2 CONSTITUTION — the closed declaration space (draft for the completeness forum)

**Status:** DRAFT 2026-07-04, for the one-question completeness forum.
**The question that closes it:** *"What thermophysical declaration is
impossible to express in this grammar?"*  If the answer is "none", the grammar
CLOSES; future changes are rare constitutional amendments through the forum,
never patch-by-shout.

**Founding laws** (already ratified, restated):
1. **One Gibbs surface per phase** — the legality theorem behind every axis.
2. **The cão-e-gato principle** — no ultimate model exists; every workhorse,
   fallback and improvisation is DECLARED in the dict, ANNOUNCED in the log,
   its quality stated as a WORD.  Hiding the cat is fraud.
3. **The case shows its own chemistry** — the inline manifest is the ONLY
   form; `constant/propertyDict` always carries the full package record.  The
   `package <name>;` selector into a shared `data/standards/propertyPackages/`
   catalogue was retired: a case never reaches out to a shared registry for its
   thermo; if two cases share thermo, each carries its own copy.
4. **The builder loads, verifies and announces — never estimates.**
   (Estimation is curation-time; see docs/property-architecture.md.)

---

## The complete declaration space (the axes — ALL of them, from theory)

| # | Axis | Slot | Constrained by |
|---|------|------|----------------|
| 1 | WHO | `components ( … )` | identity in `components/<name>.dat` (flat, O(1)) |
| 2 | WHICH PHASES | `phases ( vapour liquid solid … )` | today implicit — v2 makes it declarable |
| 3 | Model per PHASE | `propertyMethods { liquid …; vapour …; solid …; }` | one Gibbs surface each; the liquid slot IS the VLE world |
| 4 | Convention per GROUP | `solution {}` / method `referenceBasis` groups | renormalisations of ONE surface (Gibbs-Duhem-legal) |
| 5 | Correlation per COMPONENT | the component `.dat` + A5 `overrides` | pure-species data; Gibbs-Duhem-free |
| 6 | Parameter per PAIR | `parameters { henryPairs / kijPairs / binaryPairs / pitzerPairs {…} }` | declared FILE, verified at assembly, cited |
| 7 | Mixing per PROPERTY | `mixing` sub-slots (A4) | transport rules (Wilke, Wassiljewa…); EoS `vanDerWaals1f`; γ-models are their own |
| 8 | Chemistry | `chemistry { … }` | real equilibria with K+ΔH (electrolyte tree) |
| 9 | Package per UNIT | unit `thermo {}` | the spatial axis; model-boundary audit at seams |
| 10 | **ASSERTED values** | `asserted { … }` (NEW, below) | the martelo tier — legal anywhere a correlation is, with mandatory why |

Nothing else exists: 1-2 name the system, 3-4 the equilibrium surfaces, 5-7
the property assembly, 8 the reactions, 9 space, 10 honesty's bottom rung.

## The QUALITY LADDER (one word per resolved value, printed in the A6 table)

```
measured  >  fitted  >  correspondingStates  >  estimated  >  ASSERTED
```
Every resolved value carries exactly one of these words in the run-log table.
`n/a` prints where a property genuinely does not apply (a nonvolatile's gas
viscosity).  No numeric quality scores — false precision (rejected).

## Axis 10 — ASSERTED VALUES: the dignified home for the hammer (Vítor's law)

> *"Há uma altura em que é 'seja o que Deus quiser'. Mas não se pode esconder
> isso do utilizador — os meus alunos varrem isto para debaixo do tapete
> imensas vezes."*

The grammar gives the magic number a FIRST-CLASS, announced home:

```
asserted
{
    // property-level hammer: a pinned value where no model/data exists (yet)
    viscosityGas
    {
        CO2 { value 1.5e-5;          // Pa.s
              why  "order-of-magnitude, air-like; conveyor dP insensitive"; }
    }
    // equilibrium-adjacent hammers keep their EXISTING declared forms and are
    // hereby recognised as members of this tier:
    //   gibbsReactor temperatureApproach  (empirical, calibrated, announced)
    //   reactions dH_rxn override          (honoured only sans formation data)
    //   solver bounds                      (report aloud when they bind)
}
```

**The three mandatory elements** of every assertion:
1. the **value** (with units, dimension-checked like any scalar);
2. the quality word is forced to **asserted** in the resolved table;
3. a **`why` string — REQUIRED, refuse without it.**  The student must write
   the justification down; that single forced sentence is the anti-rug-sweep.

**Announcement (LOUD, always):**
```
[asserted] viscosityGas(CO2) = 1.5e-5 Pa.s -- "order-of-magnitude, air-like;
           conveyor dP insensitive"  (HAMMER: no source, author's assertion)
```

**The natural check** — a magic number's only defence is "the answer doesn't
care": assertions integrate with the sweep/what-if drivers (an asserted value
is an obvious sensitivity axis; the GUI may offer "sweep this assertion" —
roadmap, not this PR).

**Legality:** an assertion may stand ANYWHERE a per-component correlation or
transport value may (axes 5, 7) and in the recognised equilibrium-adjacent
slots above.  It may NOT replace the phase's Gibbs surface itself (you cannot
assert "the activity model" — that is model selection, axis 3) and may not
silently override a MEASURED catalogue value without the overlay announcing
the shadowing (the existing [overlay] rule covers this).

## The A6 RESOLVED-MODELS TABLE (the constitution's enforcement organ)

Printed at every assembly: component × property, the model each value
actually took, its mixing rule, its quality word, its source or its why.
Every silent hardcode found by the table becomes a work item — the table, not
the user's anger, is the standing auditor.

## Completeness-forum charge

One question: name a thermophysical declaration this grammar cannot express.
Known candidates to test against: multi-solvent Henry (two solvents);
T-dependent kij; per-phase transport (liquid viscosity model ≠ gas); surface
tension (a new property, axis 5+7 shaped); reactive VLE; solid solutions.
If any fails, amend BEFORE closing; then close.


---

## ADDENDUM — the MIT-panel verdict under the total-case stress test (2026-07-05)

The `lithiumBrinePlant` reference case (all four worlds, all four component
routes, radicals, membranes, ED, control, batch, the full outer ring) was used
as the completeness stress test. Panel verdicts:

**(f1) Per axis:** components/phases/models-per-PHASE/conventions-per-GROUP/
correlations-per-COMPONENT/parameters-per-PAIR/chemistry — **KEEP** (all hold
under full load). mixing-per-PROPERTY — **EXTEND**: mixing is per
(property x phase), and a suspension closure (Thomas/Einstein) needs its OWN
`effective{}` slot — it is a two-phase MEDIA closure, not thermodynamic mixing
inside a Gibbs phase; in the mixing slot it masquerades as thermo.
package-per-UNIT — **KEEP but CONSTRAIN**: a unit override selects ANOTHER
WHOLE package, never a partial patch of single axes (partial patching is the
road to two surfaces in one phase). asserted — **MERGE into provenance**: {value,
why, quality word} is an attribute of ANY value (constant, polynomial, table),
not a tenth axis; its home is the quality column of the resolved table.

**(f2) THE structural gap:** the grammar is per-phase but equilibrium is
BETWEEN phases. In the SX extractor the aqueous phase lives on the
aqueous-infinite-dilution datum (Pitzer) and the organic on symmetric Raoult
(NRTL): the iso-activity of Li+ across them is UNDEFINED without a declared
common datum / transfer energy. Two legal Gibbs surfaces, each honest, and the
partition K born of an implicit convention — the one place the total case
breaks the grammar.

**(f3) The amendment before closing:** a `phaseEquilibrium{}` block in the
package — for each coexisting phase pair, declare the imposed equality and the
common datum:
```
phaseEquilibrium
{
    liquidAq-liquidOrg { link muEquality; datum aqueousInfDil; transfer "<pair-file>"; }
}
```
One surface per phase stands; the BRIDGE between surfaces becomes first-class,
declared and announced — never implicit.

Also from the panel: the burner (steady, Gibbs equilibrium) and the NOx number
(batch, radical kinetics) must never be conflated — equilibrium NO at flame T
is orders above real; both satellites share one NASA-7 datum or the seam audit
refuses.

---

## ADDENDUM 2 — the external review (answer.pdf, 2026-07-05): 7 corrections, triaged

An independent external review of the lithiumBrinePlant stress-test document.
Its own conclusion: "the architecture remains closed" — the corrections make
the EXAMPLE obey the architecture, plus two genuine engine/grammar gaps.

**Example errors (the document violated OUR OWN ratified rules — fixed):**
- (#1) Li+ was placed under constant/components/ — ions are MODEL SPECIES
  (constant/species/aqueous/Li.dat), per the 2026-07-01 clean-tree doctrine.
- (#3) the deposit-specific Li2CO3 solubility overlay sat on the COMPONENT —
  equilibria belong to chemistry/salts/ (case-local chemistry/salts/zabuyelite.dat
  overlay); the component keeps identity + dissociatesTo only.
- (#5) the carbonation reaction used Na2CO3/NaCl absent from the package
  components — AND the general rule: the REACTION BASIS (component-basis vs
  species-basis) must be DECLARED, never implicit, or the same chemistry gets
  counted once lumped and once resolved.

**Genuine grammar/engine gaps (ACCEPTED into the constitution):**
- (#4) A dissolved gas in an ELECTROLYTE brine: Henry is a per-GROUP
  convention INSIDE the one aqueous Gibbs surface (grammar already says so —
  A1), but the engine today offers henryDilute only as a whole-liquid method.
  Amendment: a gasSolutes{ CO2 solution.henryDilute; } group declaration legal
  under electrolyte.* liquids. Henry must never REPLACE the brine model.
- (#6) PARAMETER COVERAGE CONTRACT: binary pairs alone do not make a mixed
  electrolyte — full Pitzer needs like-charge theta and ternary psi terms. The
  method declares its REQUIRED interaction set; assembly closes completely or
  fails loudly: parameterCoverage { requireAll modelRequiredInteractions;
  onMissing fatal; }. If the implemented model is deliberately restricted
  (pairwise-only), the package and the log SAY SO — never full-Pitzer by
  implication.

**Vocabulary rulings needed (Vitor's call, one canonical name each):**
- (#2) `dissociatesTo` (ratified 2026-07-01) vs the reviewer's `ionization`.
- (#7) `phases/solid/` (ratified 7-homes tree) vs `solidPhases/`.

**Complementarity note:** the external review did NOT surface the MIT panel's
f2 (the inter-phase datum bridge / phaseEquilibrium{} block — two legal liquid
surfaces with different data in SX). Its #4 is the intra-phase cousin. The two
reviews TOGETHER are the complete input for the completeness forum.

**Vocabulary RULINGS (2026-07-05, Vitor delegated — "só consigo ver no final
com o tutorial"):** `dissociatesTo` STAYS (ratified, in code and 200+ data
files; renaming for a synonym is churn without physics). `phases/solid/` STAYS
(the ratified 7-homes tree). The FINAL acceptance test of the whole
constitution is the lithiumBrinePlant reference tutorial reading NATURALLY —
Vitor judges the end product, not the abstractions.

**Build sequencing (the vertical-spike doctrine applied):** the tutorial's
first spike is the BRINE sector end-to-end green with shipped tech; the SX
cross-world equilibrium ships FIRST as an honestly-declared measured
distribution coefficient (the student's K_D, quality word `fitted`, the
cão-e-gato workhorse) and is UPGRADED to phaseEquilibrium{} when the grammar
lands — the upgrade path declared in the case from day one.

---

## ADDENDUM 3 — external-review #4 (Henry-in-brine) is ALREADY SUPPORTED (verified 2026-07-05)

Investigated while building the lithiumBrinePlant CARBONATION sector.  The
external review's correction #4 -- "a dissolved gas in an electrolyte brine
must take Henry as a per-GROUP convention INSIDE the one aqueous surface, never
replacing the brine model" -- is NOT a missing mechanism.  It is already how
the engine computes:

  ThermoPackage::Kvec (src/thermo/ThermoPackage.cpp ~522) calls the activity
  model FIRST (gam = activity_->gamma(T,x) -- Pitzer, if that is the liquid
  method), then PER COMPONENT: a nonvolatile salt gets K=0, a declared Henry
  solute gets the unsymmetric Henry K, everything else the gamma-phi form.  So
  Henry LAYERS OVER the electrolyte surface; it does not replace it.

VERIFIED: a water+NaCl+CO2 package with `liquid electrolyte.pitzer; solvent
water; solutes ( CO2 );` + a Henry pair CO2-water runs a VL flash correctly --
CO2 partitions by Henry (2 mol% stays dissolved in the brine liquid at 5 bar,
the rest flashes as a CO2-rich vapour), NaCl retained in the liquid (Pitzer),
water liquid.  Mass balance closes; physics sensible.

RESOLUTION: #4 is a GRAMMAR/DOCUMENTATION matter, not an engine gap.  The wrong
form is `liquid solution.henryDilute` as the WHOLE-liquid method (that erases
the electrolyte).  The right form -- available today -- is `liquid
electrolyte.pitzer` + `solutes ( CO2 )` (or the cleaner `gasSolutes { CO2
solution.henryDilute; }` alias, which the builder can map to the same
mechanism).  The completeness forum need only ratify the alias sugar; the
physics is done.

STILL DEFERRED (a SEPARATE piece): CARBONATION's CO2 -> Li2CO3 REACTION (the
carbonate speciation + Arrhenius kinetics) -- Henry gets CO2 INTO the brine,
but the precipitation reaction is its own chemistry.  CARBONATION today models
the precipitation (retrograde Li2CO3 solubility); the dissolution is now proven
expressible; the reaction linking them is the remaining work.