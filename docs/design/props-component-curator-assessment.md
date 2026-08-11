# `choupoProps` as a component curator — architectural assessment

**Status: ASSESSMENT ONLY.  No implementation authorised, and none before the
2026-08-31 release.**  Requested 2026-08-11 with the framing that the objective
is not "add ThermoML support" but *let `choupoProps` construct an auditable
candidate component from experimental evidence without losing the distinction
between measurement, estimation, fitting, validation and curation.*

That framing is right, and it is worth saying why before answering the seven
questions: **the differentiator is not discovery, it is refusal.**  A tool that
finds data and regresses parameters is a solved problem and DWSIM's PhaseQ
solves it.  A tool that can say *"no independent evidence remains after
fitting, so I will not report a validation"* is not, and it is the same
sentence this engine already says about a missing enthalpy datum, a
convention-mixed volume sum and an iteration whose update ignores its iterate.
The proposal is therefore not a new capability so much as the existing doctrine
applied to a new input.

---

## 0. One collision with a settled decision, before anything else

The sketch ends at `data/proposed/acetophenone.dat`.

**`data/proposed/` was RETIRED on 2026-07-13, and reintroducing it is on the
do-not-relitigate list.**  It was a *versioned, public, lower-trust staging
tier*, and that is precisely the structure that created the third-party
redistribution problem — bulk imported values sitting in the public repository
under an unclear licence, which is the same defect the 2026-08-11 licence review
found still live in the UNIFAC tables.  The replacement is the two-tier rule:
data is either **curated + public** (`data/standards/`) or **yours + private**
(`data/local/`, gitignored), with no public middle tier.

This is not a naming quibble.  A curator pipeline whose natural output is
"unreviewed candidate records" will generate exactly the material a public
staging tier was retired for holding.  Two ways out, and the choice is
architectural rather than cosmetic:

* **candidates land in `data/local/`** (private, gitignored, already announced
  as `[local] UNVERIFIED` on every consumption) and only a human promotion moves
  one to `data/standards/`; or
* **candidates land nowhere as a tier** — the state lives in the record's own
  content, and a candidate is simply a `data/local/` record whose evidence block
  does not yet satisfy the promotion criteria.

The second is the arity-doctrine answer and §6 develops it.  Either way, the
pipeline's output home must be decided explicitly, because the obvious one is
forbidden.

---

## 1. Which existing abstractions already represent this pipeline?

More than expected.  Roughly the whole pipeline exists in pieces; what is
missing is the partition contract (§2).

| Pipeline stage | What already exists | Where |
|---|---|---|
| raw experimental datasets | **`constant/experiments/<dataset>`** — an established home, used by ~10 cases, each file carrying its own source/citation header and a declared `P` + `data ( x T … )` grammar | `tutorials/props/fit/`, `tutorials/props/electrolyte/`, `fitNRTL01` |
| fitting | **`fitParameters`** (choupoProps): Levenberg-Marquardt, bounded parameters by dotted `path`, `fit_history.csv`, `parity.csv` with per-point residual and `status` | `src/propertyOps/FitParameters.cpp` |
| fit quality | χ², per-parameter confidence intervals, and a **pivot-ratio identifiability estimate** that is explicitly labelled *"a cheap, honest identifiability proxy (NOT the true 2-norm condition number)"*, with a scale-invariant singularity test written because *"a wildly ill-conditioned JᵀJ — the very case this feature exists to catch — inverts to garbage yet is reported as fine"* | ibid. |
| promotion past a diagnostic | **`promotedDespite { identifiable; reason; by; date; }`** — all four fields required, and **every run that consumes such a pair repeats the warning** | parameter records + `FitParameters.cpp` |
| per-value provenance | `origin` (six typed classes: `literature` / `regressed` / `predictive` / `estimated` / `assumed` / `placeholder`), `citation`, `method`, `methodVersion`, `fitData`, `fitDate`, `chi2`, `nDataPoints`, `confidenceIntervals`, `validity { temperature { min max } }`, `author`, `notes` | `data/standards/parameters/README.md` |
| review state | **`reviewStatus interim | reviewed |` absent** — parsed, not a comment, and ANNOUNCED as `[unreviewed]` | `Component.cpp:428`, `Database.cpp:371` |
| durable caveat surface | `AdvisoryLog` → result JSON + a grouped end-of-run replay; already announces `[local]`, `[estimate]`, `[unreviewed]`, extrapolation beyond a declared window, **consumption of a `predictive` value**, and `promotedDespite` | `core/AdvisorySummary.H` |
| estimation as a visible chain | **`estimateComponent`** with its `derived {}` closure block: `groups → constants → omega(Tb,Tc,Pc) → Psat(Tc,Pc,omega) → Vliq(...)`, each closure named and selectable | `src/propertyOps/EstimateComponent.cpp` |
| authorised approximation | **`approximations { idealMolecularVLE { components ( ethanol ); } }`** — presence IS the authorisation, delimited per component, refusing anything unlisted and refusing to reclassify | `ThermoPackageBuilder.cpp:587` |
| coverage + validity reporting | the **D6 dossier** (`interim_review_dossier.py` → `generated/interimReviewDossier.md`): disjoint coverage categories, per-point validity marks, boundary and extrapolation flags, structured INTERIM metadata | `bin/curate/` |
| identity of a parameterisation | the **D2 contract**: identity is per curated parameterisation; the physical family is DERIVED from typed references plus a versioned immutable convention profile — never from name similarity | `docs/design/equilibrium-parameterisation-identity.md` |
| licence hygiene at the boundary | `check_source_licence` (encumbered-source screen), `check_species_citation`, `thirdParty/` as a gitignored user-supplied drop-point | `bin/curate/`, `thirdParty/README.md` |

**The conceptual precedent that matters most is D2.**  It already answered "how
does a curated numerical object carry an identity that survives re-derivation
and cannot be faked by a name".  An experimental dataset needs the identical
treatment, and §4 uses it.

---

## 2. What genuinely new contract is required?

Three things.  Only the first is large, and it is smaller than it looks.

### 2a. The FIT / VALIDATION partition (the real new contract)

Today `fitParameters` records `fitData` — **one path** — and χ² over the points
it fitted.  There is no notion of held-out evidence, no way to express that a
dataset was deliberately withheld, and **no way to state that validation was
impossible**.  Every residual statistic the engine can currently produce is
in-sample.

This is the whole proposal in one sentence, and it is a contract, not a
feature: *the same experimental points may not be used to fit a model and then
to claim independent validation of it, and when no evidence remains the engine
says so instead of reporting the in-sample error.*

It is also the one place the existing machinery is not merely incomplete but
**quietly misleadable** — a reader seeing `chi2` on a curated record today has
no way to know whether it is in-sample, because it always is.

### 2b. Per-PROPERTY state, without a second home

`reviewStatus` is per-RECORD: one word for a whole file.  The proposal needs
per-property state (`vaporPressure VERIFIED; liquidCp MISSING;`).  That is a
real extension — and it is exactly where the arity doctrine bites, because a
per-property status word is a *derived* fact: a property either has an evidence
block satisfying the criteria or it does not.  Writing the verdict down beside
the evidence creates two homes that drift.

**Recommendation: the state is DERIVED and REPORTED, never stored.**  What is
stored is the evidence; what is stored *additionally* is the human promotion act
(§6), which is not derivable from anything.

### 2c. Evidence identity

A dataset must be identified the way D2 identifies a parameterisation — by
typed reference, not by filename.  Minimum: primary DOI, the archive's own
dataset identifier, and the extraction version.  A filename is the same failure
mode the F2 campaign removed from species identity, and for the same reason: it
is a name that answers to nothing.

**Everything else in the proposal is composition of parts that exist.**

---

## 3. Can ThermoML remain external evidence rather than being copied in?

**Yes, and it must — for both architectural and legal reasons, and the legal
one is unresolved.**

### The architecture answer

`thirdParty/` is already exactly this pattern: a gitignored, user-supplied
drop-point for external originals, with only README/NOTICE tracked, feeding an
offline curation importer whose output is a Choupo record carrying **per-value
citation to the PRIMARY publication**.  The standing doctrine is *"cite the
PRIMARY source per value, never the aggregator's arrangement"*, and ThermoML is
an aggregator's arrangement of primary journal data.

So: ThermoML files live under a gitignored drop-point; what enters the
repository is the derived record plus dataset identity.  No bulk copy.

### The legal answer is NOT established, and must be before any importer

The 2026-08-11 review established that **NIST Standard Reference Data is the
statutory exception** to "US government works are public domain" — the Standard
Reference Data Act, 15 U.S.C. § 290e, empowers the Secretary of Commerce to
secure copyright in SRD, and the WebBook (SRD 69) carries exactly that notice.
The ThermoML Archive is a NIST/TRC product.  I could not read its terms:
`nist.gov` is blocked by this environment's egress proxy, and the search summary
I could obtain says only that the dataset is *"intended for public access and
use, with license information available on their dedicated page"* — which is
not a licence, and I will not treat it as one.

**This must be answered before an importer is written, not after** — the
ChemSep episode is the cost of the other order, and the shape is identical: an
import whose licence scope nobody put the question to, discovered a month later.

Two further points from the same review carry directly:

* under EU law (Directive 96/9/EC as narrowed by *BHB v William Hill*, and
  transposed in Portugal by DL 122/2000), investment in **obtaining** scattered
  literature into one compilation is the counting kind — so a bulk copy of an
  archive is not rescued by the facts inside it, even where each number is a
  fact.  This argues for derived-record-only regardless of the answer;
* whatever the answer, the pipeline must be visible to `check_source_licence`
  from day one.  ChemSep passed silently for a month because it was on the
  *permitted* list and nothing re-examined the permission.

### The honest tension this creates, named rather than papered over

If the evidence is not in the repository, **a reader cannot re-run the held-out
validation.**  The record can cite the dataset identity and the residual
statistics, but reproduction requires the reader to obtain the same data.  So
the claim is *validated*, not *validatable-here* — and the record must say which
it is.  This is the same posture as `thirdParty/` and as the sealed-case
`propertyManifest`, and it is defensible; what would not be defensible is
letting a reader assume the stronger claim.

---

## 4. How should FIT and VALIDATION roles be represented?

The sketch's shape is right.  Three refinements, each paid for by an existing
episode.

**(a) The partition is DECLARED BEFORE the fit runs, and is an anchor.**
If the split may be chosen after residuals are seen, it is tuning to the answer.
This project already has the machinery and the vocabulary: an anchor row states
a published claim and **`--record` never refreshes it**.  A validation partition
is an anchor in exactly that sense — a commitment made before the number
exists.  A pipeline that re-partitions after a poor validation must be refused,
not warned about.

**(b) The role attaches to the DATASET IDENTITY, not to a path**, per §2c.

**(c) Independence is ANNOUNCED, never adjudicated.**
Two datasets from the same paper are not independent evidence; two from the same
laboratory may not be.  The engine can *observe* that fit and validation DOIs
coincide and refuse that outright — that is a fact.  It cannot judge whether two
different DOIs from the same group constitute independent evidence, and it must
not pretend to: that is a finding for a human, announced with the shared
author/affiliation, in the same register as *"independent primaries 0.39 % apart
— a finding, not an error"*.

The refusal the proposal names is the important half and should be quoted
verbatim into the contract:

```
VALIDATION REFUSED:
No independent experimental evidence remains after fitting.
```

with the corollary that a record in that state carries its in-sample χ² clearly
labelled as in-sample, and **may not be promoted to VALIDATED**.

---

## 5. How does a partially curated component coexist with estimation rungs?

**`approximations {}` is the exact precedent, and it should be reused rather
than reinvented.**  Its properties are the ones needed here: the block's
*presence* is the authorisation; it is delimited per component; applying it to
anything unlisted refuses; and listing something the classifier did not find
eligible also refuses, so an authorisation can never reclassify.

Applied to a partially curated component:

* a property with no adequate evidence is **MISSING**, and MISSING is an honest
  absence that refuses at the point of use — never filled at curation time
  merely because a record is being created.  This is the proposal's own rule and
  it is correct;
* an estimate may be supplied **only by a case-level authorisation naming the
  component and the property**, announced on every consuming run — which the
  `AdvisoryLog` already does for `[estimate]`;
* the *absence* must go on meaning what it meant.  Two episodes make this
  concrete: `K_b` was first derived for every solvent and thereby gave a boiling
  point elevation to a case that models without one; and `K_f` derives only when
  a cited `Hfus` and a consumer both exist, keeping a declared value otherwise.

**The refusal message is where this goes wrong, and there is a scar to point
at.**  On 2026-08-06 a refusal for a non-gas reference rung advised *"add an
`idealGasHeatCapacity` block"* — advice which, followed, creates the very defect
the refusal exists to prevent.  A MISSING property's refusal must name **the
curation act** ("no admissible evidence for `liquidCp`; curate it, or authorise
an estimation rung by name"), never a workaround that manufactures a number.

---

## 6. What promotion gates separate the four states?

First, the doctrinal correction from §2b: **three of the four states are
DERIVED from record content and should not be stored as words.**  Only the human
act is a fact in its own right.

| Transition | Criterion (observable, recomputable) | Who |
|---|---|---|
| → **DISCOVERED** | evidence located and identified: primary DOI + archive dataset id + extraction version resolve; licence status of the source is *known* (not necessarily permissive) | machine |
| DISCOVERED → **CANDIDATE** | a fit/validation partition is DECLARED; an admissible model is selected for the property; the fit converges; identifiability is reported (and `promotedDespite` recorded if a human overrode it); the fitted domain is stated | machine |
| CANDIDATE → **VALIDATED** | held-out evidence exists and was **not** consumed by the fit; fit and validation DOIs differ; validation residuals are within the reported experimental uncertainty; extrapolation domain declared.  **Fails closed:** no held-out evidence ⇒ REFUSED, not skipped | machine |
| VALIDATED → **CURATED** | a human promotion act, recorded with who / when / on what grounds, in the shape `promotedDespite` already uses | **Vítor alone** |

The last row is not a suggestion: interim promotion is already ruled to be
Vítor's primary review alone, and it is the one transition no gate may perform.
The machine's job is to make the human's decision *cheap and auditable*, not to
pre-empt it — which is what the D6 dossier already does for interim citations
and is the natural place for this to surface.

Two guards worth building in from the start, both from today's findings:

* **a gate that cannot run must not pass.**  If the evidence source is
  unreachable, the validation arm must report UNAVAILABLE, never PASS.  The
  retired `check_true_ions` was permanently green because both its inputs had
  been deleted;
* **a state must not be quotable without its tree.**  A `VALIDATED` verdict
  belongs to a specific record content; if the record changes, the verdict is
  void.  The `equilibriumState` fingerprint is the existing pattern —
  a cross-reference recomputed on every read, refusing when stale.

---

## 7. The smallest post-release slice that proves the concept

**One component, one property fitted and validated, one property REFUSED —
because a slice that only demonstrates success proves half the contract, and the
refusal is the differentiating half.**

Concretely:

1. pick a component with **at least two genuinely independent published
   datasets** for one property (vapour pressure is the natural choice: the
   correlation is well-posed, the domain is one-dimensional, and Antoine/Wagner
   are already registered);
2. declare the partition **before fitting**, one DOI to FIT, another to
   VALIDATE;
3. fit through the existing `fitParameters` engine — unchanged if possible, so
   the slice tests the *contract* and not a new solver;
4. report validation residuals against the datasets' own reported uncertainty;
5. on a **second property of the same component**, arrange that all available
   evidence is consumed by the fit, and show `VALIDATION REFUSED` firing with the
   in-sample χ² labelled as in-sample and promotion blocked;
6. emit one candidate record — to **`data/local/`**, per §0 — whose per-property
   states are *derived* from the evidence blocks and *reported*, never stored;
7. one gate, sabotage-verified on both arms: the partition is honoured, and the
   refusal fires when it should.

What that slice deliberately does **not** include: no ThermoML importer (§3's
licence question must be answered first, and the slice works from
`constant/experiments/` files which already exist), no property-discovery
search, no model selection heuristic, no GUI.  Those are the parts that look
like the product and are not the part that is hard.

**Cost of getting the order wrong:** building discovery before the partition
contract yields a tool that finds data and reports in-sample errors — which is
PhaseQ, done later and with less polish.  The partition is the differentiator
and it is also the cheapest piece.

---

## Summary

* **Q1** — most of it exists: `constant/experiments/`, `fitParameters` with
  identifiability and `promotedDespite`, the typed `origin` provenance block,
  `reviewStatus`, the advisory surface, `estimateComponent`'s visible chain, the
  D6 dossier, the D2 identity contract.
* **Q2** — one substantial new contract (the FIT/VALIDATION partition), plus
  per-property state that should be *derived* rather than stored, plus dataset
  identity on the D2 pattern.
* **Q3** — external, always; and the ThermoML licence question is **open** and
  must be settled before an importer exists, on the ChemSep lesson.
* **Q4** — partition declared before the fit and treated as an anchor; role
  attached to dataset identity; coinciding DOIs refuse, shared provenance is
  announced not adjudicated.
* **Q5** — reuse the `approximations {}` authorisation shape; MISSING refuses at
  point of use and names the curation act, never a workaround.
* **Q6** — three derived states, one human act; fails closed; verdicts
  fingerprinted to record content.
* **Q7** — one component, one validated property, one refused property, one
  gate, no importer.

**Not authorised, not started, and not to begin before the release.**
