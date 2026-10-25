# C131 phase 2, family (b): separations, reviewed against good practice and the open reference

Status: analyst's report, 2026-10-25, branch `claude/c131-review-separations`.
A second general refutes it next, so every claim below carries its evidence.

**Scope.** The distillation column (`WangHenke`, `simultaneous`, `fullMESH`;
the condenser and reboiler, feeds and side draws, the stage-count
convention, the tray hydraulics), the FUG shortcut, the Kremser absorber and
stripper, the liquid-liquid extractor, the crystalliser (MSMPR and the
discretised PBE), and the spiral-wound membrane module at the level of its
mass and energy balances only (its transport physics was reviewed in
C138-C148). Thermodynamics was family (a), on
`origin/claude/c131-review-thermo` (`docs/design/review-c131-thermodynamics.md`).
It is not redone here: where a separation defect is really a thermodynamic
one, that report is cited.

**Method.** Each item compares Choupo's formulation, numerics, limit cases and
announcements with (1) the references that define good practice:
Seader, Henley & Roper (*Separation Process Principles*, 3rd ed.), Wankat
(*Separation Process Engineering*), King (*Separation Processes*), Kister
(*Distillation Design*), Wang & Henke (*Hydrocarbon Process.* 45 (1966) 155),
Naphtali & Sandholm (*AIChE J.* 17 (1971) 148), Kremser (1930), Sinnott
(Coulson & Richardson vol. 6, §11.13), Randolph & Larson (*Theory of
Particulate Processes*, 2nd ed., ch. 3), and (2) the open reference
simulator, DWSIM (GPL-3.0). DWSIM was read at commit
`1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766` (GitHub `DanWBR/dwsim`, a
blob-less sparse checkout of `DWSIM.UnitOperations/UnitOperations/` in a
scratch directory, deleted afterwards). Nothing from it was copied into the
tree. The engine is `origin/main` at `79d152339`. Every witness is a scratch
copy of a corpus case with one edit, run with `choupoSolve`. Those copies are
not in the tree. The edits are listed so the refuter can rebuild each one in
a minute.

Equation numbers in the textbooks are given where I am sure of them. Where I
am not, the section is named and the refuter should read the number back.

Verdicts: **SAME**, **DIFFERENT** (a legitimate choice, stated or not),
**WRONG** (a defect, with a witness) and **MISSING** (a check or announcement
good practice expects).

---

## 1. Summary table

| # | Item | Verdict | Action |
|---|------|---------|--------|
| W1 | Stripper: solvent arriving in the STRIPPING GAS (steam stripping) leaves in neither outlet | **WRONG** | **fixed** (refused by name), gate `check_kremser_inventory` K1 |
| W2 | Absorber and stripper: a non-solute arriving in the LIQUID feed leaves in neither outlet | **WRONG** | **fixed** (refused by name), K2 and K3 |
| W3 | Stripper lacks the absorber's no-solvent and no-solute refusals: on a `gammaPhi` package the whole liquid vanishes | **WRONG** | **fixed**, K4 |
| W4 | CMO columns (`WangHenke`, `simultaneous`) set q = 1 - vf, so a subcooled or superheated feed is treated as saturated in the internal flows | **WRONG** (against the CMO/McCabe-Thiele convention) | proposal (moves goldens; cases listed) |
| W5 | Full MESH: the stage energy rows priced a two-phase feed as a quality blend at z, and merged feeds at a molar-average T, while the duty block priced the split | **WRONG** | **fixed**, `check_feed_thermal_state` arm (j); corpus unmoved |
| W6 | `docs/ai/unit-ops.md` and the User Guide call `MESH` / `NaphtaliSandholm` aliases of the CMO `simultaneous`; the code runs them as `fullMESH` | **WRONG** (prose) | `docs/ai/unit-ops.md` **fixed**; User Guide is a proposal (PDF render) |
| M1 | Extractor: isothermal at the declared T with no duty published; a solvent at another T leaves a first-law hole at exit 0 | **MISSING** | proposal (the C74 mixer duty, `Q_kW = H(out) - ΣH(in)`) |
| M2 | Crystalliser (MSMPR and FVM): the supersaturation Newton's `converged` flag is never read, and its tolerance is an absolute 1e-10 kg/s | **MISSING** | proposal (a normalised stop; `newtonIters` rows may move) |
| M3 | MSMPR "CV = 1" is the NUMBER-distribution CV; the textbook MSMPR CV of ~50 % is the MASS distribution's; the basis is named nowhere | **MISSING** (prose) | proposal |
| M4 | Kremser columns: the lumped-Cp energy model leaves first-law residuals (absorber01 -27.98 kW, stripper01 +19.87 kW) | **MISSING** (known, announced, pinned) | none new; already in `check_energy_closure.KNOWN_OPEN_KW` |
| M5 | Inline `feeds` entries default `quality` to 1, silently | **MISSING** | proposal (announce; no corpus case uses one) |
| M6 | Kremser stripper: "solvent stays in the liquid" hides the solvent's own evaporation into a dry stripping gas | **MISSING** (the size is not announced) | proposal |
| M7 | Extractor stops on TOTAL mass closure only, not on each component | **MISSING** (minor) | none; measured adequate |
| M8 | Kirkbride feed stage: the engine publishes N_R as "the feed stage from the top"; the EduTool defines N_R as the stages ABOVE the feed | **MISSING** (an unstated convention, ±1 stage) | proposal (state it; check against Seader's worked example) |
| D1 | `WangHenke` is the bubble-point method without Wang & Henke's energy-balance V update (CMO) | DIFFERENT (stated in the Theory Guide's model ladder, not in its WH chapter) | wording proposal |
| D2 | Stage-count convention: nStages counts equilibrium stages; a total condenser is not one, a partial condenser is stage 1, the reboiler is the last | SAME as Seader/Wankat; DIFFERENT from DWSIM (stage 0 is always "Condenser") | none |
| D3 | McCabe-Thiele EduTool after commit `5e3c0739f` (a partial condenser takes a stage) | SAME as the engine | none |
| D4 | FUG EduTool: Fenske N_min and the engine's nStages count the same stages | SAME (measured in `fugShortcut.ts`) | none |
| D5 | Condenser duty (total and partial envelopes), reboiler duty as the plug that closes the column | SAME as DWSIM's envelopes | none |
| D6 | Feed enters the stage it is declared on, both phases on that stage | SAME (Seader; DWSIM) | none |
| D7 | MESH residual definition and scaling: balances / total feed, energy / (feed × mean latent heat), Σy - 1 dimensionless | SAME structure as Naphtali-Sandholm; DIFFERENT from DWSIM's ad-hoc factors (better) | none |
| D8 | Wang-Henke stop on stage balance, port balance, bubble points and step | DIFFERENT from Wang & Henke's ΔT test and from DWSIM's (stricter) | none |
| D9 | Non-convergence: the column returns 1 and the flowsheet refuses | SAME as DWSIM (which throws) | none |
| D10 | Side draws (liquid at x_j, vapour at y_j, the CMO staircase) | SAME | none |
| D11 | Murphree vapour efficiency (WH only; E_MV > 1 allowed and announced; MESH refuses it) | SAME formula; DIFFERENT coverage (DWSIM carries it in N-S) | none |
| D12 | Sieve-tray hydraulics (Fair flood, weep, dry plate, weir crest, downcomer backup) | SAME as Sinnott §11.13 | none |
| D13 | Kremser absorber/stripper as a stage tridiagonal at constant total L, V and K at the inlet compositions | DIFFERENT (stated; exact Kremser when isothermal) | none |
| D14 | MSMPR moments, L_d = 3Gτ, L43 = 4Gτ, M_T = ρ k_v μ3 | SAME as Randolph & Larson | none |
| D15 | Membrane module: total mass closes by construction at constant density; isothermal, no duty | SAME (mass); DIFFERENT (energy, stated by construction) | none |
| D16 | FUG: Molokanov's Gilliland fit, α at the feed bubble point | DIFFERENT from DWSIM (Eduljee fit); both published | none |

---

## 2. WRONG items

### W1. The stripper deletes solvent that arrives in its stripping gas

* **Choupo.** `Stripper.cpp` (origin) classifies each component as solute,
  solvent or inert (`:101-107`) and writes the outlets by class
  (`:205-206`): the solvent row writes only `L_in * x_in`, the liquid
  feed's solvent. The solvent carried by the stripping gas has no row.
* **Good practice.** Steam stripping is the commonest stripping operation
  there is (Seader §6, Wankat ch. 12), so live steam in the stripping gas is
  the normal case, not an edge case. Whatever a model assumes about the
  solvent, it must conserve it.
* **DWSIM.** Its absorber/stripper is the rigorous sum-rates column
  (`RigorousColumnSolvers/SumRates.vb`), where every component, the solvent
  included, has a component balance on every stage. The defect cannot occur
  there.
* **Witness.** `stripper01_NH3_water` with `0/strippingGas` changed from
  `N2 100 kmol/h` to `N2 80; water 20 kmol/h`. On `79d152339`: exit 0, the
  rich gas carries `NH3 4.905, N2 80` and the stripped liquid `NH3 0.095,
  water 95`. The 20 kmol/h of steam is in neither outlet: mass closure
  **91.807 %**, plant first-law residual **-1363.20 kW**.
* **Action. Fixed.** The stripper REFUSES a stripping gas that carries its
  solvent, naming the solvent and pointing to the rigorous column
  (`tutorials/steady/distillation/stripper01_sour_water`). Whether live steam
  condenses or passes overhead is the solvent's own VLE, which this method
  does not solve. A trace below 1e-12 of the stream is carried through in the
  gas, so round-off from upstream never kills a recycle and nothing is
  deleted. The other routing (steam held in the gas) is a modelling choice for
  Vítor, and is offered in §4 P7.

### W2. A non-solute arriving in the liquid leaves in neither outlet (both Kremser units)

* **Choupo.** The inert branch writes only `gasMol = V_in * y_in`:
  `Absorber.cpp:271` and `Stripper.cpp:206` on origin. An inert that came in
  with the solvent (absorber) or the rich liquid (stripper) vanishes. Examples
  are a gas dissolved in the wash, or a second solvent component such as an
  amine that has no Henry pair.
* **Good practice / DWSIM.** As W1: a component balance per component (SumRates).
* **Witnesses.**
  * absorber01_NH3_water with `N2 5 kmol/h` added to `0/solvent`: exit 0,
    the clean gas carries N2 90 and the rich liquid no N2. Mass closure
    **97.469 %**.
  * stripper01_NH3_water with `water 90; N2 5 kmol/h` in `0/liquidFeed`:
    exit 0, closure **96.986 %**, and the unit publishes `recovery_N2 = 1`,
    meaning "100 % stripped", for material that reached no outlet.
* **Action. Fixed.** Both units refuse by name (component, stream, the three
  remedies). A trace below 1e-12 of its stream is carried through in the
  liquid.

### W3. The stripper never learnt the absorber's refusals

* **Choupo.** On 2026-08-12 `Absorber.cpp` learnt to refuse a package with no
  solvent and a gas with no solute ("nothing to absorb", `:115-160`).
  `Stripper.cpp` has the same classification and the same molar-flow loop,
  and has neither refusal. With no solvent, every component is "inert" and
  only the gas is written.
* **Witness.** `stripper01_NH3_water` with its `thermoPhysPropDict` replaced by
  a `gammaPhi` / ideal / idealGas package (and the seal removed): exit 0,
  mass closure **60.926 %**. The absorber on the same package refuses, as it
  should.
* **Action. Fixed.** The stripper carries both refusals, worded for a
  stripper.

**The fix and its test for W1-W3.** `src/unitOperations/separation/Absorber.cpp`,
`Stripper.cpp`. New gate `bin/curate/check_kremser_inventory.py`, wired into
`bin/runTests` beside `check_lumped_cp_note`, with arms K1-K6 (described in
its docstring). **Fail-first, observed:** with the two sources restored to
`79d152339` and rebuilt, the gate printed K1 91.807 %, K2 96.986 %,
K3 97.469 %, K4(stripper) 60.926 % (each "the probe RAN, exit 0") and "K5:
the trace was deleted". K4(absorber) and K6 passed, as they must. With the
fix restored and rebuilt, all arms pass. Corpus cases re-run: every
absorption case, every plant carrying an absorber, all pass their goldens. No
golden moved.

### W4. The CMO columns ignore a feed's subcooling (or superheat)

* **Choupo** (line numbers of origin `79d152339`). `DistillationColumn.cpp:784`
  (Wang-Henke) and `:1846` (`simultaneous`, `qfeed`) both set `q = 1 - vf`.
  The CMO flows follow it: `L' = L + qF` and `V' = V - (1-q)F` at `:812-813`,
  and the staircase at `:1854` and `:1864`. For a single-phase liquid vf = 0,
  so q = 1 at any temperature. The verbosity-3 header prints `q=1.0000` for a
  feed 64 K below its bubble point and says nothing more.
* **Good practice.** Under constant molal overflow the feed condition is
  q = (H_V,sat - H_F)/(H_V,sat - H_L,sat): q > 1 for a subcooled liquid,
  q < 0 for a superheated vapour (Wankat ch. 4, the feed-line derivation;
  Seader §7.2, the q-line; McCabe, Smith & Harriott). A subcooled feed
  condenses vapour on the feed stage, so `V'` rises by (q-1)F. Choupo's own
  McCabe-Thiele EduTool takes q as a knob that goes above 1, so the engine
  and the lesson disagree about what a subcooled feed does.
* **DWSIM.** Its bubble-point solver updates V_j from the stage energy
  balances every pass (`RigorousColumnSolvers/BubblePoint.vb:1558-1597`, the
  α/β/γ tridiagonal of Seader §10.3), with the feed enthalpy taken from the
  stream (`RigorousColumn.vb:2879`). A subcooled feed changes the flows.
* **Witness** (column01_benzene_toluene, `model WangHenke`, feed T changed):

  | feed | x_D (LK) | V_strip [kmol/s] | Q_reboiler [kW] |
  |---|---|---|---|
  | 364 K (liquid, near bubble) | 0.981245124 | 0.0416667 | 1305.86 |
  | 300 K (subcooled 64 K) | 0.981245126 | 0.0416667 | 1565.77 |
  | 364 K, `model fullMESH` | 0.978502631 | -- | 1306.29 |
  | 300 K, `model fullMESH` | 0.983023304 | -- | 1565.49 |

  Under CMO the profile and the traffic do not move by one digit. The extra
  260 kW of sensible heat shows up only in the reboiler plug, so the published
  `V_strip` (0.0417 kmol/s) contradicts the published `Q_reboiler`. With
  λ ≈ 31-33 MJ/kmol, 1566 kW boils about 0.049 kmol/s. The rigorous column
  moves x_D by +0.0045. By the q formula this feed has q ≈ 1.29.
* **Corpus exposure** (a screen: single-phase feeds more than 2 K from their
  feed stage's T, CMO models only; outer-driver cases not screened):
  `column05_reactive_methylacetate` (293 K into a 342 K stage),
  `crystalliser09_KHT_KCl_series` (recovery column, 323 vs 353 K),
  `aceticAcid02_plant` (lightsColumn, 380 vs 404 K),
  `column13_sour_water_stage_identity` (350 vs 368 K),
  `heatlink02_condenser_feed_preheat` (346 vs 365 K),
  `process05_isomerization_recycle` and `acetonePlant` (C1/C2; mixed feeds,
  to be measured). Near-saturated, not moved materially: column02, column03,
  column04, column12, stripper01/02 (sour water), acetone06/07 (declared
  `phase liquid;` at the bubble point).
* **Action. Proposal (§4 P1).** It moves goldens. Read q from the enthalpies,
  q = (h_V,sat(z) - h_F)/(h_V,sat(z) - h_L,sat(z)) on the package's own surface
  at the feed stage's P, for single-phase feeds only. Two-phase feeds keep
  1 - vf, which equals the enthalpy q at saturation for a pure fluid and is
  what the CMO profile has always used. Announce q when it differs from
  1 - vf. Until then, `docs/ai/unit-ops.md` now says so (fixed in this
  branch).

### W5. The full MESH priced a two-phase feed one way in its rows and another in its duty

* **Choupo (origin).** The stage energy row's feed term
  (`DistillationColumn.cpp:2531-2535` of origin) was
  `hFj = q hL(z, T_f) + (1-q) hV(z, T_f)` on the MERGED per-stage scalars. For
  a two-phase feed that is a quality blend at the overall composition. The
  duty block stopped using that blend on 2026-09-12 because it is not the
  enthalpy of a two-phase state (column01: 5.509 kW, `feedEnthalpy`'s own
  comment). For two feeds sharing a stage it took a molar-average
  temperature. The duty block (`:2801`) priced the same feed at its
  equilibrium (x, y). So under `fullMESH` the profile was solved against one
  feed enthalpy and the reboiler duty closed against another. The code
  comment's claim that "Q_reboiler then equals the reboiler's own balance"
  was false by that difference.
* **Good practice / DWSIM.** The N-S energy residual uses the feed's
  enthalpy (Naphtali & Sandholm 1971). DWSIM takes it from the feed stream's
  mixture phase (`RigorousColumn.vb:2879`, `Phases(0)` = the overall
  equilibrium enthalpy), so the two-phase state is priced correctly.
* **Witness.** column01_benzene_toluene under `model fullMESH;` (its 370 K
  feed resolves to V/F = 0.697). Origin: x_D 0.938168949, Q_reboiler
  657.290 kW. With the fix: x_D 0.938924131, Q_reboiler 657.175 kW.
* **Action. Fixed.** Each feed is kept as itself (`FeedRecord`). The rows sum
  F_k h_k feed by feed on the rows' own surface, with
  (1-β) hL(x) + β hV(y) for a resolved vapour-liquid split. The duty block
  sums feed by feed on the formation surface, as before for a lone feed. The
  corpus is unmoved: column06/07/08, the three fullMESH cases, all have
  single-phase feeds, and their KPIs are identical to 12 figures before and
  after. All 15 MESH/WH column cases, the three plants that carry a column and
  crystalliser09 pass their goldens. Test: `check_feed_thermal_state`
  arm (j), a source arm. The profile publishes no V_j, L_j, so no output
  separates the two pricings when both close the column through the plug.
  Run on origin's source, the arm counts one blend site and no
  `stageFeedEnthalpy[j]` term, so it fails. Recorded honestly: it is a source
  arm, the weakest kind.

### W6. Two manuals say `MESH` and `NaphtaliSandholm` mean the CMO Newton; the code runs them as the full MESH

* **Choupo.** `DistillationColumn.cpp:2425` (origin) runs the energy-balance
  refinement for `fullMESH`, `MESH` and `NaphtaliSandholm`. The Theory Guide
  agrees (`docs/theoryGuide.tex:22415`, "`fullMESH` (= `MESH` =
  `NaphtaliSandholm`)"). But `docs/ai/unit-ops.md:775` listed `MESH`,
  `NaphtaliSandholm` **and `fullMESH`** as aliases of `simultaneous`, and
  `docs/userGuide.tex:1867-1868` lists `MESH` and `NaphtaliSandholm` as
  aliases of `simultaneous`. `docs/ai/` is what `bin/llmctx` hands an
  assistant that authors cases.
* **Action.** `docs/ai/unit-ops.md` is **fixed**: three models, with the CMO
  and its q = 1 - vf consequence stated, and a `fullMESH` entry. The User
  Guide is a proposal: editing it makes the committed PDF stale under
  `check_guide_pdf_fresh` until `make -C docs` is run.

---

## 3. MISSING and DIFFERENT, with evidence

**M1. The extractor publishes no duty.** `Extractor.cpp:508-510` runs the
whole cascade at `operation.temperature` (default: the feed's T). Both
outlets leave at that T and no `Q_kW` is published. The solvent's own T is
read and printed and never used. Witness: extract01 with `0/solvent` at
330 K instead of 298.15 K. Exit 0, the same split, and the unit's
energy-closure entry reads **-143.75 kW** unattributed. The only sign is the
"Assumptions: ... isothermal" line at verbosity ≥ 2. DWSIM's extractor is the
sum-rates column with a stage energy balance. Proposal (§4 P2): the C74
declared-T mixer rule, `Q_kW = H(extract)+H(raffinate)-H(feed)-H(solvent)`
through `flashState::priceState`. It adds a KPI and moves the
`globalEnergyBoundary` Q rows of extract01/02 by ~1e-4 kW, so it goes to Vítor
with the list.

**M2. The crystalliser's supersaturation Newton is never checked.**
`Crystalliser.cpp:489` (MSMPR) and `:801` (FVM) call `newton1D` and use
`sr.x` without reading `sr.converged`. `NewtonRaphson.cpp:65,103` judges
`|residual| < tolerance` with `nro.tolerance = 1e-10` (`:487`, `:799`). That is
kg/s, an ABSOLUTE tolerance on a dimensional residual, the shape §5 *NORMALIZED
RESIDUAL* rules out. I first wrote a refusal on `!sr.converged` and took it
out. With an absolute tolerance, that refusal would fire on a large enough
plant whose answer is right to round-off, and no corpus input reaches the
unconverged branch, so no witness could fail first. Proposal (§4 P3): stop on
|residual|/solute_in, then refuse on non-convergence. `newtonIters` is pinned
in crystalliser02/03/04/08, so those rows may move.

**M3. CV without a basis.** `Crystalliser.cpp:508` computes
CV = √(μ0μ2/μ1² - 1) = 1 for the MSMPR exponential, and the Theory Guide
(`theoryGuide.tex:17685-17699`) calls it "a coefficient of variation of
exactly 100 %". That is right for the NUMBER distribution. The MSMPR figure a
student meets in Randolph & Larson and in Mullin is the MASS distribution's,
√(μ3μ5/μ4² - 1) = √(6·120/24² - 1) = 0.5. Proposal: name the basis on the KPI
and the page, and publish the mass CV beside it.

**M4. The Kremser columns' energy model.** Lumped Cp, announced by
`LumpedCpEnergyNote.H` and gated by `check_lumped_cp_note`. Its residuals are
pinned in `check_energy_closure.KNOWN_OPEN_KW` (absorber01 -27.98,
acetone05 3.12, stripper01 19.87 kW). Nothing new. Listed because the C131
brief asks for "what is silently substituted": this one is not silent.

**M5. Inline column feeds default q = 1.** `DistillationColumn.cpp:1802`
(origin) reads `quality` with a default of 1.0 for a legacy inline `feeds`
entry and says nothing. No corpus case uses an inline feed. Proposal: announce
the default, or refuse an inline feed without `quality`. The code comment now
names this record.

**M6. The stripper's held solvent.** stripper01 strips 95 kmol/h of water at
330 K with 100 kmol/h of dry N2. At 330 K water's vapour pressure is about
17 kPa, so the gas would carry roughly 20 kmol/h of water and its latent heat
(about 0.24 MW at 42 MJ/kmol, against the ~46 kW of NH3 desorption). The unit holds it all in the
liquid by assumption. It prints the solvent's own stripping factor
(`S_water = 0.17`) with "held in the liquid by assumption, NOT by Kremser" at
verbosity ≥ 2, but not the size of what is held back. Proposal: publish the
solvent's equilibrium evaporation as a caveat with its kW.

**M7. Extractor stop.** The stop is total-mole closure < 1e-8
(`Extractor.cpp`, `columnClosure`). Measured on extract01, the component
closures are -4.4e-10 (water), -6.6e-9 (ethanol) and -1.8e-9 (benzene) of the
throughput, so the total bounds them on the corpus. No action.

**M8. The Kirkbride feed stage.** `ShortcutColumn.cpp:291` publishes
`feed_stage = N - N_S = N_R`, "counted from the top". The FUG EduTool
(`fugLesson.ts:315`) defines N_rect as "the number of stages ABOVE the feed",
which puts the feed on stage N_R + 1. Both cannot hold. The rigorous ladder
places its feed at `round(feed_stage/N · n)` (`fugShortcut.ts:354`), so a
student sees the convention through the comparison. I have not read back
Seader's worked Kirkbride example. Proposal: settle against it, then state
the convention on the KPI and the page.

**D1. "Wang-Henke" is the bubble-point method under CMO.** Wang & Henke
(1966) and Seader §10.3 iterate x by the tridiagonal, T by bubble points,
**and V_j by the stage energy balances**. DWSIM's `WangHenkeMethod` does all
three (`BubblePoint.vb:1558-1597`). Choupo's `WangHenke` fixes L and V by CMO
and never updates them (`DistillationColumn.cpp:810-813, 1010-1132`). The
Theory Guide says so in the model ladder (`theoryGuide.tex:22442`, "Both
Wang-Henke and simultaneous assume constant molal overflow"). Its
Wang-Henke chapter (`:16829-16903`) describes the algorithm without saying
the energy step is gone. Proposal: one sentence there. The same text is now
in `docs/ai/unit-ops.md`.

**D2/D3/D4. Stage count.** The engine counts equilibrium stages: stage 1 is
the top tray under a total condenser and the partial condenser under a
partial one, and the last stage is the partial reboiler
(`DistillationColumn.cpp:95-127`). The hydraulics drop the reboiler and a
partial condenser from the tray list (`:1344-1364`, `:2906-2924`). That is
Seader's and Wankat's count. DWSIM always names its stage 0 "Condenser"
(`RigorousColumn.vb:2268-2276`), so a DWSIM total-condenser column of N stages
is Choupo's N - 1. The engine header says so. The McCabe-Thiele EduTool, after
`5e3c0739f`, counts the same way: N unchanged by the condenser type, and
`trays = N - (partial cond) - (partial reboiler)` (`mccabeThiele.ts:416`).
That matches the engine's tray list. The FUG EduTool established by
measurement that nStages and Fenske's N_min count the same stages
(`fugShortcut.ts:96-103`). Consistent.

**D5. Duties.** Total condenser
`Q = -V_top [h_V(y_1, T_1) - h_L(y_1, T_bubble)]` and partial condenser
`Q = -(V_2 h_V(y_2) - L_1 h_L(x_1) - D h_V(y_1))` (`DistillationColumn.cpp:206-214`)
are DWSIM's envelopes (`BubblePoint.vb:1648, 1667`). The reboiler is the
overall plug in both (DWSIM `:1660`). The distillate is published at its own
bubble point and pinned. DWSIM has an optional total-condenser subcooling
(`RigorousColumn.vb:838`). Choupo does not; a feature, not a defect.

**D7. Residuals.** CMO MESH: component balances × (1/total feed), Σ Kx - 1
(`:2143-2183`). Full MESH: plus total mass × (1/feed) and energy ×
1/(feed · mean λ) (`:2452-2461`). DWSIM's N-S multiplies M by 1e6 and divides
H by 1000 (`NewtonRaphson.vb:559-565`). Choupo's scaling is the one
Naphtali-Sandholm-type solvers need. Tolerance 1e-9 on every row of both.

**D9. Non-convergence.** Both column paths return 1 and `Flowsheet.cpp:1136-1139`
refuses the run, so `converged/` is not written. DWSIM throws
(`BubblePoint.vb:1680-1701`, `NewtonRaphson.vb:1154`). Same.

**D12. Hydraulics.** `TrayHydraulics.cpp:49-54` (Fair via Lygeros & Magoulas),
`:235-236` (u_f = C_SB (σ/20)^0.2 √((ρL-ρV)/ρV)), `:327` (h_d = 51 (u_h/C0)²
ρV/ρL), `:331` (h_ow = 750 (Lw/(ρL lw))^{2/3}), `:332` (h_r = 12.5e3/ρL),
`:337` (h_dc = 166 (Lwd/(ρL Am))²), `:345` (u_h,min = [K2 - 0.90(25.4 - d_h)]/√ρV),
and the backup limit ½(l_t + h_w) are Sinnott's §11.13 equations term for
term. K2 is declared, never read off the chart; good.

**D13. Kremser.** The absorber and stripper solve the stage tridiagonal at
constant total L and V, with K re-evaluated at each stage's T but at the INLET
compositions (`Absorber.cpp:194`, `Stripper.cpp:143` on origin). Isothermal, this is
Kremser exactly. The EduTool (`kremserLesson.ts:56-70, 160-170`) says all of
it. DWSIM uses the rigorous sum-rates column. Different and stated.

**D14. MSMPR.** μ_j = n0 (Gτ)^{j+1} j!, μ3 = 6 B0 G³ τ⁴, M_T = ρ_c k_v μ3,
L_d = 3Gτ, L43 = 4Gτ (`Crystalliser.cpp:373-509`): Randolph & Larson ch. 3.
The residence time uses the feed's liquid volumetric flow (`:441`), a stated
clear-feed approximation. The kinetic constants are read with no dimension
check (`:428, :430`, `lookupScalar` without `Dims`), unlike every
dimensional key in the column. Minor; noted.

**D15. Membrane.** `SpiralWoundModule.cpp:1440-1500` closes total mass at the
feed density and asserts it. It publishes both outlets at T_in and no duty. The
liquid letdown's v·ΔP (about 0.1 kJ/mol across 60 bar) is not represented, by
construction. In scope only at this level.

---

## 4. Proposals (none taken; each moves goldens or is Vítor's to decide)

| # | Proposal | What moves |
|---|---|---|
| P1 | CMO q from the enthalpies for single-phase feeds (W4), announced when ≠ 1 - vf | column05, column13, crystalliser09, aceticAcid02_plant, heatlink02, and process05/acetonePlant to be measured; their x profiles, products, V_strip, Q rows |
| P2 | Extractor duty `Q_kW` by `priceState` (M1) | a new KPI; extract01/02 `globalEnergyBoundary` Q rows by ~1e-4 kW |
| P3 | Crystalliser: normalised stop (|r|/solute_in) and a refusal on non-convergence (M2) | `newtonIters` in crystalliser02/03/04/08 possibly |
| P4 | User Guide `simultaneous` aliases (W6) | the User Guide PDF render |
| P5 | Name the CV basis; publish the mass CV (M3) | a new KPI; Theory Guide prose |
| P6 | Kirkbride convention, settled against Seader's worked example (M8) | possibly `feed_stage` (+1) in the two shortcut cases and the FUG ladder's feed placement |
| P7 | Stripper: route trace-free live steam through the gas instead of refusing (W1), if Vítor prefers a "solvent not transferred" reading | stripper behaviour with steam (no corpus case) |
| P8 | Theory Guide Wang-Henke chapter: say the energy step is dropped (D1) | prose |

## 5. What was validated, and what was not

Validated on this branch: `make all` (no warnings shown). The scratch
witnesses above, before and after. `bin/runTests` on the 15 column cases that
touch the MESH or Wang-Henke paths, every case under
`tutorials/steady/absorption/` and `tutorials/steady/crystallisation/`,
`model3_enrtl_antisolvent_crystalliser`, and the plants acetonePlant,
aceticAcid02_plant, ChemicalPlantTutorial and lithiumBrinePlant: all PASS
against their goldens, none re-recorded (sugarPlantEconomicsSweep ships no
golden and passes its smoke and NaN guard).
The gates that read the touched files: `check_kremser_inventory` (new),
`check_feed_thermal_state` (+ arm j), `check_lumped_cp_note`,
`check_advisory_attribution`, `check_column_datum_downgrade`,
`check_evaporator_chest_phase`, `check_forward_order`,
`check_inlet_resolution`, `check_block_tridiagonal`,
`check_degenerate_limits`, `check_compile_clean`, `check_doc_references`,
`check_glossary_bans`, `check_retired_names`, `check_decision_index` (this
record added to the index) and `check_doctrine`. The last needed a NAMED-WORD
exemption for the prefix `docs/design/review-c131-`, which lifts the ban for
the open reference simulator's name only, in the C131 review records only, on
the commission's own terms ("cited by commit"). The thermodynamics record on
its branch needs the same exemption and is covered by the prefix. That
exemption is a policy line, and it is flagged to the commander rather than
assumed. Also run: `gate_manifest --only` for the three gates whose claim
changed (check_doctrine marks no claim line, as before), and `--check`. Not run: the full regression (it needs Vítor's
authorisation, and none of the changes is a path every case goes through),
`--fast`, `--gui` (no `gui/` file and no cited engine line was moved), and
the WASM build.

---

## Refutation

Status: the refuter's appendix, 2026-10-25, branch
`claude/c131-refute-separations` (cut from the analyst's branch). The brief
was to break each claim, not to agree with it. Both engines were built: the
analyst's branch, and `origin/main` (`f871943a9`, whose `src/` is
byte-identical to the `79d152339` the report names). Every witness below was
rebuilt from its corpus case in a scratch directory, run on both, and deleted.

Verdicts: **CONFIRMED**, **CONFIRMED WITH CORRECTION**, **REFUTED**,
**UNPROVEN**.

### WRONG items

* **W1. CONFIRMED.** stripper01_NH3_water with gas `N2 80; water 20`: main
  exits 0 at 91.807 % closure; the branch refuses by name. A 1e-11 relative
  trace (1e-9 kmol/h in 100) is also refused, as the 1e-12 threshold says.
  *Correction to the fix's framing.* "Strip with a gas that carries no
  solvent" also refuses HUMID AIR, which is the inlet of every air stripper.
  The refusal is the right minimal fix, because main deletes the water. But
  P7 should go to Vítor with that case named. The asymmetry with the absorber
  should be stated too: the absorber CONDENSES all the solvent arriving in
  its gas (solvent row `L_in x + V_in y`), while the stripper now refuses it.
* **W2. CONFIRMED.** absorber01 with 5 kmol/h N2 in the wash: main 97.469 %,
  the branch refuses. stripper01 with 5 kmol/h N2 in the liquid: main
  96.986 % with `recovery_N2 = 1`, the branch refuses.
* **W3. CONFIRMED.** stripper01 on a `gammaPhi`/ideal/idealGas package: main
  exits 0 at 60.926 %; the branch refuses. The absorber refuses on both.
* **W4. CONFIRMED, and worse than reported.**
  * *The definition.* Under CMO the feed line uses
    q = (H_V,sat - H_F)/(H_V,sat - H_L,sat), and q > 1 for a subcooled liquid
    (Wankat ch. 4, the feed-line derivation; Seader §7.2, the q-line table of
    feed conditions). The McCabe-Thiele EduTool says the same,
    `mccabeLesson.ts:184`: "q > 1 subcooled liquid".
  * *The engine.* It sets `q = 1.0 - feedState.vf` (`DistillationColumn.cpp:784`)
    and builds L' and V' from it (`:812-813`).
  * *Re-run.* column01 with `model` declared at the UNIT level. Under
    `WangHenke` and `simultaneous`, x_D is 0.98124512 at both 364 K and 300 K
    (to 9 figures) and `V_strip` is 0.0416667 at both, while Q_reboiler goes
    1305.86 -> 1565.77 kW. Under `fullMESH`, x_D goes 0.97850 -> 0.98302.
    Main and branch agree, as expected, since neither touches this. The extra
    (1566 - 1306) kW over 0.0278 kmol/s at ~32 MJ/kmol puts q near 1.29,
    which is 1 + c_p,L ΔT/λ for ΔT = 64 K.
  * *What the report missed.* The engine also REFUSES the textbook q.
    `feedQuality 1.29;` on the 300 K feed is refused as a "contradiction"
    with the stream (`refuseContradictoryFeedQuality`, `:478-520`). The
    stream-side remedy it names is `phase liquid;` ("a declared
    saturated-liquid feed"), which means q = 1. So no case can give a CMO
    column a subcooled feed, and the refusal calls the correct number a
    contradiction. P1 should change that refusal in the same slice.
* **W5. CONFIRMED WITH CORRECTION: the fix reaches further than reported.**
  * *As reported.* column01 under `fullMESH` with the 370 K feed: main gives
    x_D 0.938168949 and Q_reb 657.2897 kW; the branch gives 0.938924131 and
    657.1753 kW.
  * *Not reported.* The DUTY-BLOCK half also moves the `simultaneous` (CMO)
    model. In both models a stage holding two feeds was priced as one blend
    at the merged q, the merged z and a molar-average T.
  * *Witness.* column04_multifeed_sidedraw with both feeds on stage 8 (the
    side draw moved to stage 11, the `quality` keys removed). Under
    `simultaneous` and under `fullMESH`, main leaves **6.916 kW** of the
    column's own first law unattributed, at exit 0. The branch closes it to
    0 and 4e-6 kW. No corpus case puts two feeds on one stage, so nothing in
    the corpus moved. WangHenke has no multi-feed branch and refuses the
    fixture (exit 2) on both engines.
  * *The gate.* This is an OUTPUT witness, so the "source arm, the weakest
    kind" caveat now covers only the two-phase-feed half. It is added as
    `check_feed_thermal_state` arm **(k)** (below).
* **W6. CONFIRMED.**
  * `DistillationColumn.cpp:723-724` sends all four names to
    `solveSimultaneous`, and `:2446-2447` runs the energy refinement only for
    `fullMESH`, `MESH` and `NaphtaliSandholm`.
  * `docs/userGuide.tex:1867` still lists `MESH` and `NaphtaliSandholm` as
    aliases of `simultaneous`, so P4 stands.
  * The `docs/ai/unit-ops.md` fix is correct, but it promised the full MESH
    unconditionally, which is false for a reactive column (M9 below). The
    refuter added one sentence.

### MISSING items

* **M1. CONFIRMED.** extract01 with the solvent at 330 K exits 0. The
  extractor's energy closure is -143.7496 kW (global residual +143.7496 kW)
  and no `Q_kW` is published. At 298.15 K the closure is 1.1e-4 kW.
* **M2. CONFIRMED.** `Crystalliser.cpp:489-490` and `:801-802` take `sr.x`
  and never read `sr.converged`. `newton1D` returns the flag without
  throwing (`NewtonRaphson.cpp:103`). The tolerance is an absolute 1e-10 kg/s
  (`:487`, `:799`). There is no witness: the bracketed Newton converges on
  every corpus input.
* **M3. CONFIRMED WITH CORRECTION.** The KPI is the NUMBER CV,
  √(μ0μ2/μ1² - 1) = 1 (`Crystalliser.cpp:508`, `:831`). `theoryGuide.tex:17693`
  says the MSMPR "always produces a PSD with a coefficient of variation of
  exactly 100 %" and names no basis. The moment-based MASS CV is
  √(μ3μ5/μ4² - 1) = 0.5, as the report says. *Correction:* the figure a
  student meets in Mullin and in Randolph & Larson is usually the PERCENTILE
  form, (L84 - L16)/(2 L50) on the cumulative mass distribution, about 52 %
  for MSMPR, not the moment form's 50 %. Whichever is published, name its
  definition as well as its basis.
* **M4. CONFIRMED.** `check_energy_closure.py:584-586` pins absorber01
  -27.9838, acetone05 3.1179 and stripper01 19.8710 kW.
* **M5. CONFIRMED.** `DistillationColumn.cpp:1823-1824`: an inline feed's
  `quality` defaults to 1.0 and its `T` to the primary feed's T, both
  silently.
* **M6. CONFIRMED.** Antoine gives water 17.15 kPa at 330 K, so y = 0.169.
  100 kmol/h of dry N2 then saturates with about 20.4 kmol/h of water, about
  240 kW of latent heat, and the unit holds all of it in the liquid.
* **M7. CONFIRMED (structure only).** `Extractor.cpp:596-600`: the stop is
  total-mole closure < 1e-8. The analyst's per-component figures were not
  re-measured.
* **M8. CONFIRMED that the two homes disagree; UNPROVEN which one the source
  supports.**
  * *The engine.* `ShortcutColumn.cpp:289-290` sets `feedStage = N - N_S`,
    i.e. N_R, "counted from the top", so the feed is the LAST rectifying
    stage.
  * *The lesson.* `fugLesson.ts:315-321` defines N_rect as the stages ABOVE
    the feed and N_strip as the stages BELOW it, and says the Gilliland N is
    split by their ratio. With N = N_rect + N_strip and the feed stage
    counted in neither, that page cannot be literally true. The lesson is the
    internally inconsistent half.
  * *The ladder.* `fugShortcut.ts:354-366` uses `feed_stage/N`, which is the
    engine's reading.
  * *The source.* The refuter could not reach Seader-Henley-Roper's worked
    example or Kirkbride (1944) from this container, so it stays unproven
    which side a primary source takes. P6 stands as written.

### New findings (not in the analyst's report)

* **M9. `model fullMESH;` on a reactive column runs CMO and does not say
  so.**
  * *The code.* `DistillationColumn.cpp:2446-2447` requires `!reactive`. The
    only record of that is a code comment (`:2444`, "Reactive full-MESH is
    not wired yet").
  * *Witness.* column05_reactive_methylacetate with `model fullMESH;` runs to
    exit 0. B, D, R, T_top, T_bottom, conversion, Q_condenser and Q_reboiler
    all equal the `simultaneous` golden to 12 figures, and nothing in the
    output mentions the substitution. That is a problem divergence at exit 0
    (CLAUDE.md §6, *THE PROBLEM SOLVED IS NOT ALWAYS THE PROBLEM POSED*).
  * *Proposal.* Refuse `fullMESH`, `MESH` and `NaphtaliSandholm` with a
    `reaction {}` block, by name, pointing to `simultaneous`. No corpus case
    is affected, because column05 declares `simultaneous`.
  * *Status.* Not fixed here: the refuter's brief covers corrections to the
    analyst's fixes. `docs/ai/unit-ops.md` now states the limitation.
* **A stale NOT-CHECKED line.** `check_feed_thermal_state` still says the
  energy report drops a multi-feed column's duties as an internal
  exchanger's. CLAUDE.md §6 records that as closed on 2026-10-05, and the W5
  witness confirms it: the report's global residual follows the column's own
  closure on both engines (6.916 kW on main, ~0 here). The line belongs to
  the gate's owner, so it is flagged here rather than edited.

### The analyst's fixes, reviewed

* **Absorber.cpp and Stripper.cpp: correct and minimal.**
  * The refusals sit after the classification and before any arithmetic.
  * The trace carry writes each component in the phase it arrived in, so
    Σ out = Σ in per component in every branch.
  * The 1e-12 threshold is on the NORMALISED fraction, so it does not depend
    on scale.
  * Fail-first: with the worktree's `choupoSolve` symlink pointed at the main
    build, `check_kremser_inventory` FAILS K1 (91.807 %), K2 (96.986 %), K3
    (97.469 %), K4 stripper (60.926 %) and K5 ("the trace was deleted"). On
    the branch it passes.
  * One accepted weakness: K5 reads the rich gas with a regex that cannot
    cross nested braces. If the result JSON ever nests an object before
    `composition`, the arm would accuse the engine falsely. It fails closed,
    not open.
* **DistillationColumn.cpp, per-feed pricing: correct.**
  * The rows' `stageFeedEnthalpy` uses `thermo.Hliquid` and `Hvapour`, the
    same functions as the rows' `hL` and `hV` (`:2521-2522`), in
    kmol/s × kJ/kmol = kW.
  * A resolved single-phase feed has q ∈ {0, 1}, so its term is unchanged.
    Only a resolved VL split or a shared stage moves.
  * The duty block's per-feed loop is what closes the two-feed stage (W5
    above).
* **Arm (j) and the new arm (k).**
  * Arm (j) is a source arm, as the report says, and it fails on main's
    source by construction.
  * **Arm (k), added by the refuter**, is the output half. It moves the arm
    (i) fixture's vapour feed onto the two-phase feed's stage 5 and requires,
    under `simultaneous` and `fullMESH`, that
    `H_products - H_feeds = Q_reboiler + Q_condenser` to 1e-6 kW.
  * Run against the main engine, arm (k) FAILS on both models (gap
    2.1536 kW). On the branch it passes.
* **The `check_doctrine` exemption: as narrow as claimed.**
  * It is a path PREFIX matched by `startswith` (`check_doctrine.py:396-398`),
    so it covers only files named `docs/design/review-c131-*`.
  * It lifts the one word `dwsim`; every other banned word still fails there.
  * Arm (t) still holds. No manual, `docs/ai/` file, GUI source,
    `bin/buildSite` or `vite.config.ts` names the prefix (grepped). Nothing
    ships `docs/design/`: `buildSite` and the GUI glob name no `docs/design`
    path, and the GUI mentions it only in comments.
  * The prefix would also exempt a FUTURE file of that name. That is the
    intent (family (a)'s record needs it), and the policy line the commander
    takes to Vítor should say so.

### Corpus measurement (branch engine)

* `bin/runTests` on all 36 cases whose flowsheet declares an `absorber`,
  `stripper` or `distillationColumn`, found by grep. They include the
  optimisation, sensitivity and Pareto drivers over column01, and the plants
  aceticAcid02_plant and acetonePlant. Result: **PASS 36 / FAIL 0**, no
  golden re-recorded.
* `bin/runTests --fast`: **PASS 76 / FAIL 0 / EXPECTED-FAIL 5**.
* Raw comparison of main against the branch: each of the 36 cases run on both
  engines, with every number on every printed line compared at 1e-11
  relative.
  * Every case exits 0 on both.
  * Outside the banner's commit tag, only three kinds of line differ:
    * a column's own energy-closure residual of order 1e-13 kW printed as 0
      (column02, 06, 08, 12 and acetonePlant's C2);
    * column12's plant residual, 9.049e-11 -> 9.027e-11 kW;
    * column06's profile and full-MESH ||F||, at 1e-12 relative
      (0.00175906528887 -> ...885).
  * This is summation order, since each feed is now summed feed by feed. No
    golden row can see it (tolerances are at 1e-4 or above).
  * The corpus is unmoved, as the analyst reported.
* Gates re-run on the branch: `check_kremser_inventory`,
  `check_feed_thermal_state` (with (k)), `check_doctrine`,
  `check_doc_references`, `check_glossary_bans`, `check_retired_names`,
  `check_decision_index` and `gate_manifest --check` all pass, and
  `gate_manifest --only check_feed_thermal_state` was re-observed.
* NOT run: the full regression, `--gui` (no `gui/` file and no cited engine
  line moved), the WASM build, and the User Guide render.

### Safe to land?

Yes, with this appendix and arm (k). The four engine fixes are correct,
conserve every mole they used to delete, fail first on main (by gate and by
witness), and move no golden. Two items go to Vítor with the proposals:

* P7, now with the humid-air case named;
* M9, a one-line refusal that moves nothing.

P1 should take the `feedQuality` refusal with it.
