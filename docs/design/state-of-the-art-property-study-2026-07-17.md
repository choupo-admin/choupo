# State-of-the-art study — property systems (two reference simulators)

**Why this document exists.**  2026-07-16: a whole day of architecture decisions
(M1-M6, active-set, `methods/`, `kind`, `assumedIdeal`) was taken by two AIs in a
self-ratification loop, without studying the state of the art.  Vitor ordered a
stop and a study first.  This is the study.  **No decision here is final — it is
the evidence base for Vitor to judge.**

**Sources studied** (directed reading, 4 independent passes):
- A leading commercial simulator's *Physical Property System 11.1 — Physical
  Property Methods and Models* (full text extraction, ~21k lines): the
  method/route/model architecture (ch. 4), the methods and families (ch. 2),
  electrolytes (ch. 5 + App. B), Henry (1-10, 3-109), enthalpy references
  (3-118), free-water (ch. 6), parameter requirements (ch. 2 tables).  Referred
  to below as **the commercial reference**.
- An **open-source simulator** (actual source, `windows` branch):
  `PropertyPackage.vb` (13,940 lines), `Models/NRTL.vb`,
  `BaseFlashAlgorithm.vb` / `UniversalFlash.vb`, `MaterialStream.vb`,
  `ConstantProperties`, `Assets/` (embedded databases), `Databases.vb`,
  `Inspector.vb`, the configuration forms, the online satellites.  Referred to
  below as **the open-source reference**.

---

## 1. The conceptual map of the three systems

| Concept | Commercial reference | Open-source reference | Choupo (2026-07-16) |
|---|---|---|---|
| Unit of calculation | **Route** (recursive tree with a unique ID, e.g. `HLMX08`): method (universal, numbered equation) -> sub-routes -> **models** (fitted, the leaves) | method hardcoded per package class; flash as a package attribute | hardcoded per builder branch; no route concept |
| "Property method/package" | a NAMED collection of route IDs (one per major property) | one VB class per package (NRTL.vb, PengRobinson.vb...), a stateful instance per flowsheet | the inline manifest declares `<family>.<name>` per phase; the builder assembles |
| Property taxonomy | majors / subordinate (DHL, HLXS, HNRY, **XTRUE**) / intermediate (GAMMA, PL) | a bag of ~71 nullable doubles per phase | KPIs + diagnostics; no formal taxonomy |
| Method variants | suffix = the vapour EoS + Poynting (`-RK`, `-HOC`, `-NTH`, `-HF`) or dataset (`-2`) or enthalpy-route family (`WILS-LR/GLR`) | one package per model; configuration per instance | a free `vapour` slot, with no coupling to the pairs' provenance |
| Multiple datasets | **MDS** per parameter; `NRTL-2` = same model, data set 2; a route may pin the dataset on one property alone (HLXS10/set2) | edits per package instance (serialised into the simulation XML) | 1 file per pair; COSMO has named sets (the only analogue) |
| Missing pair | defaults documented inline per method (phi_v = 1, GMELCC = 0...) + PCES estimates by default; no general runtime warning | **tau = 0 SILENTLY on the hot path** (`Models/NRTL.vb`, `RET_KIJ -> 0`); UNIFAC auto-estimation (ON by default, announces when it works, **silent when it fails**); v6.5+: a loud error by default in the flash, with an escape checkbox | LOUD refusal / announcement; the ideal default is announced; the active set demands a record |
| Provenance | the source databank + per-system ranges (in the Data volume); a regression assumes a declared vapour | `OriginalDB` per compound; `nrtl.dat` cites the DECHEMA page per line; `UserIPDB.RegressionFile` | **per VALUE** (origin / citation / validity / fitDate) — unique among the three |
| Calculation transparency | **structural**: a navigable route tree before the run, unique IDs, modifications in colour; it does NOT narrate the run | **Inspector**: a post-run HTML report with MathJax equations plus a link to the source line; opt-in, off by default | a live narrative (verbosity 3, Newton visible, consumption announcements) |
| Electrolytes | apparent <-> true interconvertible; **XTRUE = a subordinate property** (HLMX = f(XTRUE) even on the apparent basis); a Chemistry block; a wizard; Born for mixed solvent; DHAQFM/CPAQ0 + a Criss-Cobble fallback | modest and honest ("alpha/testing" ALWAYS announced); ions/salts as flagged compounds; chemistry in reaction sets | Pitzer HMW speciation + eNRTL single-salt; a unified component plus a separate `chemistry/`; an aqueous rung with an announced fallback |
| Solids / streams | MIXED/CISOLID/NC substreams co-designed with the method; free-water = a second simultaneous method | 8 fixed phase slots; solids: detected and **discarded by default, with the warning commented out in the source** | the phase is a result; `solidPhases{}` on the component; a material ledger |
| Data on disk | proprietary binary databanks; precedence = list order, and user-entered wins; THRSWT/TRNSWT (submodel selection IS data on the component) | **resources embedded in the binary** (not inspectable without recompiling); the coefficients' meaning changes with `OriginalDB` at run time | text files per record, one home per type, normalisation at curation time |
| Validation | (outside the manual; internal suites) | **zero corpus in the repository**; social (274 curated flowsheets, maintained elsewhere) | a golden corpus in-repo (284 cases, a NaN guard, gates) |
| Legal (third-party data) | commercial licensing; PPDS = an explicit licence boundary | an Artistic-2.0 databank embedded (DECHEMA-derived IPD redistributed); the rest via online satellites the USER pulls; no manifest | a deliberate scrub: a clean public `standards` + a private `data/local` + `thirdParty/` |

## 2. Verdict on the 2026-07-16 decisions, one by one

**Confirmed by the state of the art (keep):**
- **A home per type + normalisation at curation time.**  The counter-example is
  the open-source reference: `Select Case OriginalDB` inside the getters — the
  same field changes meaning at run time depending on the source database.  The
  commercial reference normalises via THRSWT on the component.  Choupo's
  position (resolve at curation, one canonical file) is the cleanest of the
  three.
- **Loud-gap / no-silent-crutch.**  The open-source reference moved TOWARDS this
  position in v6.5 (a missing pair is an error by default, "not a bug"); the
  commercial reference's documented silences ("infeasible" reactions ignored,
  per-evaluation Chao-Seader in AMINES, GMELCC = 0) and the open-source one's
  (tau = 0 on the hot path, a commented-out solids warning, empty catches, a
  mute package fallback) are the catalogue of what the credo avoids.  Doctrine
  validated both by convergent evolution and by counter-example.
- **Provenance per value.**  Neither of the two has it.  It is Choupo's real
  competitive advantage, not a whim.
- **A golden corpus in-repo.**  The open-source reference has nothing
  comparable; its validation is social and external.  Keep and reinforce.
- **Multi-package per unit.**  Both have it (the commercial reference per
  section/block; the open-source one per object).  BUT: neither has the
  model-boundary audit — the open-source reference re-interprets streams between
  packages with no warning, and its invalid-`_ppid` fallback is mute.  The
  2026-06-08 hold-T/audit decision is original and BETTER than both.
- **`assumedIdeal` as a record**: consistent with the commercial reference's
  philosophy that everything the calculation consumes is a declared parameter;
  no direct equivalent in either, but in the right direction for both.
- **Electrolyte: the role is chosen by the package, not by the substance.**
  Literally the commercial reference's architecture (the same NH3 is
  solvent / Henry / electrolyte depending on method + Chemistry).  The
  2026-07-01 ratification matches the reference.

**To revisit (the study changes the design):**
1. **The ROUTE concept is missing.**  The commercial reference's central piece:
   how HLMX is computed (ideal gas + departure vs Sum x.HL + HLXS vs a liquid-Cp
   reference) is *declarable, composable, nameable and inspectable* — not
   hardcoded.  Choupo has declarable methods, but the enthalpy/fugacity routes
   are fixed per builder branch.  A minimal glass-box version: NAMED routes per
   major property in the propertyMethod (e.g.
   `enthalpyRoute idealGasDeparture | excessGamma | liquidReference;`),
   announced at assembly, with half a dozen routes — not the reference's
   hundreds.  It also resolves the Hfus asymmetry on the way (WILS-LR/GLR is
   exactly "the liquid reference as a named route family") and gives substance
   to the requested route tracing.
2. **Vapour <-> pair consistency.**  The -RK/-HOC suffixes are not cosmetic: the
   pairs were REGRESSED assuming a vapour model (the manual documents "regressed
   using... ideal gas, Redlich-Kwong, and Hayden O'Connell").  Choupo leaves
   `vapour` free without checking it against the pair's provenance.  Proposal:
   the pair record gains a `regressionVapour` field (ideal | RK | HOC | ...); the
   builder WARNS when the selected vapour differs (it does not refuse — it
   announces the inconsistency, the Choupo way).
3. **Multiple datasets per pair.**  MDS / `NRTL-2` (VLE vs LLE for the SAME
   pair) has no home: the catalogue has one file per pair.  The mechanism
   already exists in COSMO (named sets) — generalise it: a pair record may carry
   `sets { vle {...} lle {...} }` and the manifest selects
   (`parameters { binaryPairs { ethanol-water "path" set lle; } }`).  Without
   this, binary01_lle and a distillation of the same pair are condemned to share
   one fit.
4. **Henry as a per-component ROLE** (Henry-Comps) rather than a separate world:
   in the commercial reference the declaration switches the convention
   symmetric -> asymmetric INSIDE the method, consistently in K and in enthalpy.
   `solution.henryDilute` as a world apart fragments what ought to be a role.
   Revisit when Henry is next touched (not urgent; the current one works and
   announces).
5. **`XTRUE` as a property.**  Speciation as a *subordinate property* (consumed
   by HLMX on the apparent basis) is the design that makes general basis
   reconciliation ([ROADMAP]) tractable: not "carry ions on every stream", but
   "the true composition is a computable property of any aqueous stream".  Save
   it for the roadmap's vertical spike.
6. **An Inspector as the shape of route tracing.**  What was agreed (structured
   JSON per route) should learn from the open-source reference: a navigable
   per-calculation report with equations plus a source link, opt-in.  The
   combination of a live narrative (which only Choupo has) + a structured report
   (which only the open-source reference has) + named routes (which only the
   commercial reference has) would be unique.

**Yesterday's errors/debts confirmed by the study:**
- `kind` in `assets/` vs `recordType` in `chemistry/` — the asymmetry grates
  less in the light of THRSWT (the commercial reference also has heterogeneous
  selectors), but the real lesson is different: the submodel selector should be
  DATA, consistent with the available parameters.  Acceptable as it stands;
  document the rule.
- The active set with a per-unit mask has no direct analogue in either (the
  commercial reference solves the problem with Henry-Comps + Chemistry scoping;
  the open-source one does not even see it).  Yesterday's implementation is
  defensible but it is OUR INVENTION, without precedent — treat it as
  experimental, and validate it against more cases before promoting it to
  doctrine.
- The advisory-in-transient guard (the departure from the agreed text): the
  commercial reference does not evaluate gamma on non-physical iterates because
  its routes are per-evaluation with no guard at all; the open-source one
  validates flash inputs but not domains.  There is no precedent to copy; the
  converged-vs-transient solution is reasonable but stands marked as our own
  design.

## 3. What NEITHER of the two has (and Choupo should keep)

Provenance per value · a golden corpus in-repo with doctrine gates · the
model-boundary audit · dimensional verification on the inputs (the open-source
reference has cal/mol with a hardcoded R; its NRTL tau blows up if anyone
supplies J/mol) · self-contained, sealable cases with a sha256 manifest · the
narrative honesty at run time.

## 4. Operational recommendations (in order; NONE executed without Vitor's word)

1. **Short**: a `regressionVapour` field on the pair records plus a consistency
   warning in the builder (small, honest, closes the -RK/-HOC hole).
2. **Short**: named sets on the pair records (generalise the COSMO mechanism;
   VLE vs LLE).
3. **Medium**: NAMED enthalpy routes in the propertyMethod (3 routes:
   idealGasDeparture, excessGamma, liquidReference) — resolves Hfus/WILS-LR and
   is the skeleton of route tracing.
4. **Medium**: route tracing = a structured record per consumed route (as
   agreed) plus a navigable Inspector-style report (learning from the
   open-source reference).
5. **Long** (the roadmap's vertical spike): XTRUE as a subordinate property —
   the path to basis reconciliation.
6. **Leave as is**: the active set (experimental, more cases before doctrine),
   Henry (revisit only when it is touched), kind/recordType (document the rule).
