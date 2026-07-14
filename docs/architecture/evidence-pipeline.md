# The evidence pipeline — DECIDED 2026-07-11, NOT IMPLEMENTED

**Status: architectural decision recorded (design forum ClaudeChat.md #101).
No code exists; nothing here is a promise of imminent implementation.  The
point of recording it NOW is to stop the first implemented slice
(`identity{}`/`groups{}` authoring) from hardening into a schema that has to
be undone when electrolytes, reactions and adsorption arrive.**

## The correction this records

The property-authoring workspace was being designed as a *component pipeline*:
raw data in, a curated `components/<name>.dat` out.  Forum #101 rejected that
frame.  Solubility products of electrolytes, kinetic mechanisms (including
radical chemistry), adsorption isotherms and their regressions are all
"properties" a user will author — and **none of them is a unary property of a
component**.  A pipeline that funnels everything into `component.dat` either
refuses them or (worse) invents component-level homes for pair- and
system-scoped facts, the exact arity sin the data doctrine
(`docs/ai/data-doctrine.md`) exists to prevent.

## The shape

The central object is a chain, every link explicit and reviewable:

```
EvidenceDataset  ->  ModelFit  ->  ParameterProposal  ->  CatalogueTarget
```

carried through with: identity of the entities involved (species, pairs,
phases, surfaces), units, conditions, uncertainty, provenance, validity
domain, residuals/covariance of the fit, and a HUMAN approval step (curation
stays Vítor's act — the pipeline prepares proposals, it never promotes).

`CatalogueTarget` is the ROUTING half: the pipeline delivers each proposal to
the home its arity and scope dictate, never to a default bin:

| evidence about…                                    | routes to…                                                      |
|----------------------------------------------------|-----------------------------------------------------------------|
| identity + intrinsic pure-species properties       | `components/<name>.dat`                                          |
| VLE/LLE/SLE pairs, Pitzer/eNRTL, Ksp + electrolyte solubility | the interaction/system catalogues, with arity and explicit species/phases |
| mechanism/reaction: stoichiometry, species (incl. radicals), rate law, catalyst, reversibility, domain, dataset | the reactions home — NEVER inside a component |
| adsorption: adsorbate–adsorbent/surface pair, isotherm + conditions | the material/surface catalogue — never the pure component |

## The honesty limits (part of the decision)

* "Discover kinetics" must never promise truth inferred from structure.  The
  pipeline may COMPARE candidate mechanisms and fit their parameters to data
  the user supplies, with identifiability and solution multiplicity declared
  — it does not conjure a mechanism.
* Structure/SMILES helps identity, group assignment and descriptors.  It does
  NOT create Ksp values, kinetic parameters or isotherms without evidence.

## Relation to what exists

* `identity{}` + `groups{}` authoring (the groups-and-fitting consensus of
  2026-07-10) is the FIRST SPECIALISATION of this pipeline — the unary case —
  and must be built with the chain above in mind, not as its own schema.
* The fit engines (`FitParameters`) and the curation checkers
  (`bin/curate/check_estimates.py`'s method/version/fingerprint contract) are
  existing fragments of `ModelFit` → `ParameterProposal` discipline; the
  pipeline generalises them, it does not replace them.
* The three-layer property architecture (`docs/property-architecture.md`:
  estimation is resolved at CURATION time) is untouched — this pipeline IS
  the curation-time machinery, seen whole.
