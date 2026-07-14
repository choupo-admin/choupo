# The comfort loop — round 1 (2026-07-04)

**Mandate (Vítor):** "não andes a apagar fogos — loop acompanhado com o fórum,
para só quando TODOS se sentirem confortáveis."  Exit condition: a full round
with ZERO new findings from the student AND professor chairs.

## Round 1 — done this round

| Surface | Result |
|---|---|
| 85 bare tutorial thermoPackages | FIXED (4 agents, case-specific headers, spot-checks PASS) |
| 8 bare flowsheetDicts | FIXED |
| 14 bare propertyPackage/Method records | FIXED (sources cited) |
| controlDict descriptions | already clean (0) |
| henrysLaw pairs (205) | already clean (0) |
| transport hierarchy | FIXED: canonical `viscosity { model X; }` sub-block, 14 dicts migrated, engine teach-messages updated, legacy accepted |

## Round 1 — audit findings AWAITING FIXERS (session limit hit; resume after 18:00)

The storm's five auditors completed; their fixers + the forum verdict hit the
service session limit.  Findings, by surface:

1. **components/ (194)**: headers 194/194 OK; **19 without a SOURCE in the
   header** — clusters: six bare one-liner organics (ethanol, methanol,
   toluene, nHexane, ethylAcetate, nButanol + aceticAcid, water); pedagogy
   headers without citations (NaCl, KCl, MgSO4, glucose, calciumTartrate,
   potassiumBitartrate); two with body-citations not surfaced in the header
   (CaCO3, silica); three synthetic compA/B/C (no source applicable — say so).
2. **binaryPairs/unifac/parameters (251)**: citations 251/251 OK;
   **124 bare header boxes, ALL under parameters/** (the schema-versioned
   recordType files start bare; only crissCobble + kij/N2-CH4 have boxes).
3. **materials/membranes/utilities/phases/chemistry/species (157)**:
   **143 missing header boxes** (all 96 chemistry, all 41 species, 3 phases,
   3 materials); 11 fully uncited (aluminium, SS304/SS316 partial, NF270/
   SW30HR weak, 6 boron/Mn species); an 'Aspen-like' string in
   chemistry/salts/sodiumHydroxide.dat (manuals rule: rephrase).
4. **Engine announcements**: 11 asymmetries found (details in the workflow
   journal wf_1565d5ab-b72) — e.g. the phi-phi world announces itself but the
   gamma-phi/Henry defaults do not; legacy thermoPackage runs announce no
   package line.
5. **docs/ai**: 18 stale passages vs the 2026-07-04 conventions (clean:
   energy, extending, consistency, outer-drivers, gui-credo, patterns).
6. **tutorialHeaders quality audit**: did not run (session limit) — round 2.
7. Known-broken case surfaced: pitzer_vs_davies_ro_concentrate (speciation
   hang, pre-existing QA item) — a hung case is a discomfort; round 2.

## Round 2 plan (resume after 18:00 Europe/Lisbon)

Resume the storm with `resumeFromRunId wf_1565d5ab-b72` (audits replay from
cache; fixers + forum run).  Then re-audit everything; the loop exits only on
a zero-findings round.


## Round 2 — CLOSED (fixers landed, 224/0, 3 commits)
25 component sources . 124 parameters/ headers . 143 chemistry/species/etc .
docs/ai rewrite . announcement symmetry (ThermoAnnounce.H) . polymer headers
de-branded.

## Round 3 — the two chairs' 25 discomforts (VERDICT: not yet comfortable)

PROFESSOR (10) -- the serious ones first:
 P1  BUG: ThermoPackageBuilder::buildMolecularActivity consumes ONLY the first
     parameters.binaryPairs entry (binPairs.keys().front()) -- a ternary NRTL
     package would silently drop pairs.  FIX: loop all entries.
 P2  The [henry] announcement prints 'K = H(T)/P' but the real path is
     gamma* H Poy/(phi_V P) -- stale formula in the announcement.
 P3  kij record declares `eos SRK;` but eosLineOf never VERIFIES it matches
     the package's declared EoS -- cross-check + refuse on mismatch.
 P4  H2-NH3 Trange (240 380) overreaches the fitted isotherms (298/323 K) --
     narrow or declare the extrapolation in the header.
 P5  eNRTL.dat header overstates 'mixed-solvent' coverage; align with what
     the engine serves.
 P6  propsGuide four-worlds table: electrolyte row wording (speciation claim)
     vs what Kvec does; P7 symmetric-reference f0 lacks the Psat*phi_sat*Poy
     qualifiers at high P.  P8-P10: minor record/doc wording (see journal).
STUDENT (15) -- the experience:
 S1  flash08/09 controlDict descriptions + headers still say 'the case
     SELECTS package X' but both cases are now INLINE manifests -- stale
     text from the conversion.  Rewrite both.
 S2  flash09 header jargon ('DECHEMA step-1 catalogue kij') -- decode for a
     first-year: name the book, say what kij IS in one clause.
 S3  [shadowed]/[overlay] lines repeat on EVERY pass of every run -- noisy;
     announce once per component per run.
 S4  Three disagreeing iteration counts in one flash log (outer loop vs
     composition loop vs recorded KPI) -- label each count with WHAT it
     counts, in the printout.
 S5  [phase] feed-flash wording confuses ('gives vf=0.00' on an all-liquid
     feed reads like failure) -- rephrase.  S6-S15: per-case wording nits
     (see journal wf_1565d5ab, forum:student result).

EXIT CONDITION unchanged: re-run both chairs after round 3; loop closes only
on a zero-findings round.


## Round 4 — the chairs' second verdict (2026-07-05): 13 student + 10 professor

MATH ALL VERIFIED by the professor (Henry fits re-derived and reproduce; the
four-worlds table matches Kvec line-for-line; P1/P3 confirmed fixed).  Student
tutorial-side items (6) FIXED+COMMITTED.  REMAINING (engine/contract):

STUDENT (7): [shadowed]-vs-[overlay] contradictory adjacent lines (say who
WINS); the 'legacy inline dict' label names no successor; Eu = 8.0 printed
with no origin (it is the Lapple N_H constant -- say so); H vs H_kW sign/units
confusion in the result JSON (document the solids-formation-datum convention
AT the printout); the untraceable 'node' unit name in single-unit goldens;
banner 'Choupo 2607'; (grammar-forms note: two legal flowsheet forms never
explained side by side -- docs item).

PROFESSOR (10): Trange stored but NEVER consumed -> silent extrapolation
(add the announceOnce guard in HenrysLaw::H); N2-NH3 Trange 240-320 overstates
248-295 K data (narrow + caveat; also quote the 292 K intercept as 9.34e8 to
close the paper trail); buildElectrolyte IGNORES the vapour/transport slots
(hardcodes idealGas -- refuse on mismatch, A3); parameters.pitzerPairs is
DECORATIVE (verify the declared path exists or reword records/propsGuide);
propsGuide package example shows unread keys (solid builtin.saltEquilibrium,
chemistry.activeSaltEquilibriumData); eos/SRK+PR records: stale 'deferred
hook' comment + missing liquid rung for their advertised phi-phi role; kij
eos-field ABSENT bypasses P3 silently (announce it); NRTL provides
excessGibbsEnergy overstated (nothing serves it) + requires/provides blocks
are documentation-not-contract (say so in the records); chemistry.salts
beyond front() dropped silently (announce/refuse).

Convergence: 300+ -> 25 -> 23 (with all math now verified).  Exit condition
unchanged.

## Round 5 — pass-3 verdicts (prof 5 FIXED-pending-regression; student 22 OPEN)

PROFESSOR pass-3 (all 5 edited, building): N2-NH3 Trange (238,305) -- the
(258,305) cut made ammonia01's 250 K flash announce FALSE extrapolation while
295-305 passed silent; HenrysLaw default window says 'no Trange declared'
instead of faking a fit; calorimetricFit flag now rides the molecular-package
inline (was silently DISARMING the H^E gate vs legacy path); electrolyte path
REFUSES a declared transport slot (was silent-dropped); NRTL provides gains
excessEnthalpy (real, consumed, calorimetric-gated).

STUDENT pass-3 (22 OPEN -- deeper digs, full-log reads, hand-verified numbers):
top items: silica.dat SELF-CONTRADICTION (prose 'no dHf_solid' above its own
gibbsFormation block; the case-local vendored copy is stale AND claims
self-containment falsely -- the run uses the standard's formation block via
overlay, H_kW = -172.7 kW proves it); batch02 runaway tutorial prints NO T
column (the whole point invisible) + mashed header token + 3 disagreeing peak-T
claims across its own files + resolved dH_rxn never announced; flash08 header
'virtually all CO2 flashes off' vs actual 40% + vf prints 0.000 for 4.15e-4
'two-phase'; [henry] Trange guard fires at 260 K from an INTERNAL Txy sweep
with no attribution (my round-4 guard, confusing in diagnostics context); Txy
block pinned at a 200 K floor emitted without caveat; [shadowed] proposal-
workspace leak into tutorial logs; iteration labels inner/outer/innermost
still not aligned; expected-file units (kmol/s) vs log (kmol/h) cross-check
trap; absorber01 half-self-contained (vendors components but not the
load-bearing NH3-water Henry pair); Eu line now HEDGES ('unless the model
overrides') instead of stating what WAS used; my phase message said 'all
components supercritical' on a solids-carrying stream (FIXED: 'every FLUID
component'; solids ride their own channel).

Trend: counts 25 -> 23 -> 27 but severity falling (contracts -> wording/log
layout); the chairs are digging deeper each pass, which is the system working.
Exit condition unchanged.

## CONSOLIDATION RECORD — 2026-07-05 (Vitor: "para onde se pode consolidar")

**State at consolidation (HEAD after round 14 + the storm's first fruit):**

The saga: 14 fix-rounds, 12 reviewer passes, 300+ findings resolved, 224/0
after every round. Convergence: 300+ -> 25 -> 23 -> 27 -> 7 -> 8 -> 5 -> 3 ->
6 -> 7 -> 3 -> 3 -> 7 (the tail is per-virgin-case text findings, not
engine).

**SETTLED:** the PROFESSOR chair declared the thermophysics COMFORTABLE at
pass 6 and returned ZERO findings from pass 8 onward -- with hand-recomputed
NRTL gammas and Chung viscosity matching the engine to all printed digits.
Four real engine bugs found and killed along the way: binaryPairs
keys().front() (pairs silently dropped); runCase exit-2 on green runs;
BatchReactor verbosity_ hardcoded (dH_rxn announce unreachable); PhaseChanger
R_cool missing the r_o/r_i outside-area factor. Engine honesty generalised:
Trange consumed+announced, provenance never laundered, user overrides
announced, first-law residuals >0.5% speak, Txy sweeps self-attribute,
supercritical feeds decided silently.

**REMAINING (the resume list, in order):**
1. Corpus-sweep storm over the 219 unaudited tutorials -- script ready
   (workflows/scripts/comfort-corpus-sweep-*.js, case list embedded), 12
   agents x ~20 cases, the 12-pass checklist; ALL 12 hit the agent session
   limit (resets 16:00 Lisbon); relaunch with resumeFromRunId wf_5e645d47-d57.
2. Final reviewer pass (both chairs) -> the formal zero-zero -> closure.
3. Constitution v2 guided reading WITH Vitor (task 10) -> completeness forum
   -> CLOSE the grammar.
4. A4-A6 (task 9): mixing slots, per-component overrides, the RESOLVED-MODELS
   TABLE -- the standing auditor that retires this loop's manual passes.
5. Queue: NH3 -> package migration; SAFT/CPA; the pitzer_vs_davies hang.

WASM: rebuilt at consolidation with all engine rounds (gui/public/wasm).
Lesson bank: commit -F always; --record refresh keeps stale keys (KPI rename =
rm expected first); edit-only agents while a make/regression runs; never edit
under an active audit; each fix can leave its own tail -- re-verify.