# C131 phase 2, family (c): reactors, reviewed against good practice and the open reference

Status: analyst's report, 2026-10-25, branch `claude/c131-review-reactors`.
A second general refutes it next, so every claim below carries its evidence.

**Scope.** `conversionReactor`; the `cstr` (single-reaction `reaction <name>;`
and multi-reaction `reactions ( ... );` paths, isothermal and the energy-balance
scan); the `pfr` (single-reaction power law; multi-reaction isothermal,
adiabatic and cooled multitubular; the Ergun drop); the `gibbsReactor`
(`elementPotential`, `reactiveFlash`, `directMin`); the `equilibriumReactor`
(REquil); `batchReactor` and `dynamicCSTR`; the rate-law factory
(`Arrhenius`, `LHHW`, `expression` on `core/Formula`) and its units; Kp and
Kc; the heat of reaction (CLAUDE.md §5, ONE enthalpy base); the temperature
approach. Thermodynamics (family a) and separations (family b) are on
`origin/claude/c131-review-thermo` (`docs/design/review-c131-thermodynamics.md`)
and `origin/claude/c131-review-separations` (`docs/design/review-c131-separations.md`)
and are not redone; where a reactor defect is really theirs it is cited.

**Method.** Formulation, numerics, limit cases and announcements are compared
with (1) good practice -- Fogler, *Elements of Chemical Reaction Engineering*
(the CSTR/PFR design equations, ch. 4-5 and 12; multiple steady states, ch.
12); Levenspiel, *Chemical Reaction Engineering* (autocatalysis, ch. 6);
Froment, Bischoff & De Wilde, *Chemical Reactor Analysis and Design*;
Smith, Van Ness & Abbott, *Introduction to Chemical Engineering
Thermodynamics*, ch. 13 (the equilibrium constant, its standard states and
the real-gas condition `PROD (y_i phi_i P/P0)^nu_i = K`; liquid-phase
reactions on the pure-liquid standard state); Smith & Missen, *Chemical
Reaction Equilibrium Analysis* (stoichiometric and non-stoichiometric
formulations, the rank of the formula matrix); Ergun, *Chem. Eng. Prog.*
48 (1952) 89 -- and (2) the open reference simulator DWSIM (GPL-3.0), read at
commit `1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766` (GitHub `DanWBR/dwsim`, a
blob-less sparse checkout of `DWSIM.UnitOperations/Reactors/` in a scratch
directory, deleted afterwards). Nothing from it was copied into the tree.
The engine is `origin/main` at `f871943a9`. Every witness is a scratch case
(a corpus copy with one edit, or a three-species fixture from the standard
catalogue) run with the binary named; the edits are listed so the refuter can
rebuild each in a minute, and the gate `bin/curate/check_reactor_limits.py`
builds all of them.

Equation numbers in the textbooks are given only where I am sure of them;
otherwise the section is named and the refuter should read the number back.

Verdicts: **SAME**, **DIFFERENT** (a legitimate choice, stated or not),
**WRONG** (a defect, with a witness) and **MISSING** (a check or
announcement good practice expects).

---

## 1. Summary table

| # | Item | Verdict | Action |
|---|------|---------|--------|
| W1 | Suspected defect (i): detailed balance `k_rev = k_fwd/Kc` on the liquid-basis `cstr`/`pfr` with Σν ≠ 0 -- Kc is the IDEAL-GAS one in kmol/m3, the concentrations are LIQUID-basis in mol/m3 | **WRONG** (confirmed: the reverse term is 1000^Σν off -- it nearly vanishes for Σν < 0 -- and on the wrong standard state) | **fixed** (refused by name on all four paths), gate R1 |
| W2 | Suspected defect (ii): the multi-reaction `cstr` assumes one root of the extent equation at fixed T; an autocatalytic law reports the unstable washout silently, and the T-scan inherits it | **WRONG** (confirmed: X = 0 reported, stable root X = 0.8954; cubic law: 3 roots, the first reported) | **fixed** for a one-reaction set (every root announced with its stability; the single path's refusal text corrected), gate R2; several reactions: proposal |
| W3 | `gibbsReactor`: a condensate that forms when the case declares ONE outlet is dropped at exit 0 | **WRONG** (mass closure 0.254 %) | **fixed** (refused by name), gate R3; the flowsheet-level rule is a proposal (family d) |
| W4 | `gibbsReactor` `directMin`: a vanishing gas phase is returned as a non-equilibrium answer marked `Conv.: yes` | **WRONG** | proposal (a stationarity check on the answer) |
| W5 | `equilibriumReactor`: the fugacity coefficients are left out of ln Q under a cubic EoS, so it and the `gibbsReactor` part on one feed | **WRONG** (y_NH3 0.3001 vs 0.3239 at 200 bar, SRK) | **fixed** (successive substitution on Σν ln φ, as the gibbsReactor does), gate R4; ideal-gas packages untouched |
| W6 | `equilibriumReactor`: the duty is Σ ξ_j ΔH_j(T) alone -- no sensible heat when the feed is at another T, no departure function | **WRONG** (134.86 % and 102.78 % closures; the syngas EduTool quoted it as the heat that holds each shift stage) | **fixed** (H_out - H_in through `flashState::priceState`, outlet at its own equilibrium), gate R5 |
| W7 | `equilibriumReactor`: a gas-phase equilibrium that leaves a condensable supersaturated is published at vf = 1 | **WRONG** | **fixed** (refused by name, the gibbsReactor's R07 mirrored), gate R6 |
| W8 | `dynamicCSTR`: `F_out = F_in` (molar) with a mole-changing reaction drains (or swells) the holdup forever | **WRONG** (1.24 -> 0.051 kmol in 20 τ; the steady CSTR converts 56 %) | **announced** (site + caveat block; a refusal would break `check_ctrl_balance`, which runs A -> 2B on purpose to prove the ledger), gate R7; the constant-volume outflow is a proposal |
| W9 | `dynamicCSTR`: `reversible true;` (and `A_rev`/`Ea_rev`) on its own `Arrhenius` word are dropped in silence | **WRONG** | **fixed** (read by the shared RateLaw), gate R7 |
| M1 | No liquid standard state for a reversible LIQUID reaction (K_x = Kp Π (P0/Psat_i)^ν); for Σν = 0 a liquid reaction relaxes to the GAS Kp | **MISSING** | proposal (pedagogy/architecture: Vitor's) |
| M2 | `gibbsReactor` refuses on the COUNT of elements, not the RANK of the formula matrix | **MISSING** | proposal (small) |
| M3 | Multi-reaction `cstr`: an absolute 1e-14 mol/s stop on the extent Newton; a stiff near-equilibrium set "fails to converge" at 7e-14 | **MISSING** (no normalised residual) | proposal (`solver/Convergence.H`; family d) |
| M4 | `reactionHeat`: the "thermally NEUTRAL" and "dict disagrees with formation" warnings reach stdout only, never the caveat block | **MISSING** | proposal (small) |
| M5 | `cstr`/`pfr` form concentrations on a LIQUID basis for a GAS feed (cstr02/pfr02, the WGS) with no run-time word; said only in a case comment | **MISSING** (announcement) | proposal |
| M6 | A power-law `A` is in the CALLER's amount unit (mol in `cstr`/`pfr`, kmol in `batchReactor`/`dynamicCSTR`): one reactions file means two rate constants for order ≠ 1 | **MISSING** (an undeclared convention) | proposal |
| D1 | Kp = exp(-ΔG°/RT) from ideal-gas Gibbs energies at P0 = 1 bar | SAME (SVNA ch. 13) | none |
| D2 | Heat of reaction on the formation datum, Σ ν_i h_i(T); duties as H_out - H_in | SAME (SVNA ch. 4); DIFFERENT from DWSIM's conversion reactor (a 25 °C heat of reaction added to a non-formation enthalpy) | none |
| D3 | Ergun 1952, both terms, integrated in the same RK4 as the species | SAME formula as DWSIM; DIFFERENT (better) integration | none |
| D4 | Temperature approach: a magnitude, its sign from the thermicity at the answer (van 't Hoff) | DIFFERENT from DWSIM (user-signed `T + Approach`) | none |
| D5 | CSTR thermal multiplicity: a T-scan reporting every root of the energy balance | SAME (Van Heerden; Fogler ch. 12); DIFFERENT from DWSIM (pseudo-transient, one root) | none |
| D6 | REquil on ln n with the invariants of the declared set | SAME (Smith & Missen, stoichiometric formulation); now SAME as DWSIM on φ | none |
| D7 | Gibbs element-potential (RAND) with φ by successive substitution | SAME (Smith & Missen ch. 6; DWSIM's own description) | none |
| D8 | Kinetic reverse leg from detailed balance (an option) | DIFFERENT from DWSIM (explicit reverse Arrhenius only) | none (W1 bounds it) |
| D9 | `pfr`/`cstr` liquid basis: constant Q = F Σ z_i Vliq_i (Fogler's liquid v = v0) | DIFFERENT from DWSIM (local phase volumetric flow) | M5 |
| D10 | `conversionReactor`: conversions of the FEED amount, in parallel; negative outlets refused | DIFFERENT from DWSIM (sequential by rank), stated | none |
| D11 | `batchReactor`: c = n/V in kmol/m3, the basis Kc is written in | SAME | none |
| D12 | `expression` rate laws: dimension-checked, printed back as parsed | SAME as good practice; DIFFERENT (stricter) than DWSIM's unchecked expressions | none |
| D13 | Single-reaction `cstr` refuses a non-monotone law before its monotone-bracket Newton | SAME (a correct guard) | none |

---

## 2. WRONG items

### W1. Suspected defect (i): detailed balance on a liquid basis with Σν ≠ 0 -- CONFIRMED

* **Choupo.** `Reaction::equilibriumKc` (`src/thermo/reaction/Reaction.cpp:107-126`
  at f871943a9) returns Kc = Kp (c°)^Σν with c° = P0/(1000 R T), i.e. kmol/m3,
  and its comment says this "matches the reactor concentrations c = n/V or
  F/Q in kmol/m3". It matches the `batchReactor` and `dynamicCSTR` (n in kmol,
  `BatchReactor.cpp:484`, `DynamicCSTR.cpp:598`). It does not match the
  `cstr` and the `pfr`: both convert the feed to mol/s (`CSTR.cpp:230`, `:611`;
  `PFR.cpp:141`) and form c = F_i/Q on a LIQUID volumetric flow
  Q = F Σ z_i Vliq_i (`PFR.cpp:184-193`, `:222`, `:232`; the multi paths hand
  RateLaw concentrations in mol/m3, `RateLaw.cpp:148`, `:190`). So the reverse
  leg is wrong twice over: by 1000^Σν (units), and because c° = P0/RT is the
  standard concentration of an ideal gas while the concentrations are a
  liquid's.
* **Good practice.** SVNA ch. 13: K is defined on the standard state of the
  phase the reaction runs in. For an ideal liquid solution on the pure-liquid
  standard state, Π x_i^ν = K_x = Kp Π (P0/Psat_i)^ν (the ideal-gas Kp
  carried to the liquid through each species' vapour pressure, neglecting the
  Poynting factor); Kc on liquid concentrations is then K_x (c_tot)^Σν.
* **DWSIM.** Kinetic reverse rates are explicit Arrhenius (`CSTR.vb:728-762`,
  `kxr = A_Reverse exp(-E_Reverse/RT)`); no Kc is derived, so the question
  does not arise there.
* **Witness.** isobutene + methanol <-> MTBE (Σν = -1), the textbook
  liquid-phase etherification, standard-catalogue records, `gammaPhi` with an
  ideal liquid, 1 + 1 kmol/h at 343.15 K and 20 bar (`phase liquid;`),
  `reversible true;`, A = 1e-3, Ea = 0, a `pfr` with V_R = 5 m3 (2000 RK4
  steps) or a `cstr` with V_R = 50 m3. The engine printed Kp = 21.670, Kc =
  618.26 (m3/kmol).

  | | X(isobutene) at equilibrium |
  |---|---|
  | engine, `pfr` (the plateau of its profile) | **99.953 %** |
  | engine, `cstr` (V_R = 50) | **99.943 %** |
  | the same Kc in consistent units (m3/kmol vs mol/m3 corrected) | 98.53 % |
  | ideal-solution equilibrium on the SAME records: K_x = Kp Psat_IB Psat_MeOH/(P0 Psat_MTBE) = 21.670 × 9.943 × 1.251 / 1.624 = 166.0, X(2-X)/(1-X)^2 = K_x | **92.26 %** |

  (Psat from each record's own Antoine at 343.15 K: 9.943, 1.251, 1.624 bar.)
  So the answer to the brief's question is **yes**: for Σν < 0 the reverse
  term is 1000^|Σν| too SMALL and the reaction runs almost to completion past
  its equilibrium; for Σν > 0 it is 1000^Σν too LARGE. The corpus never met it:
  every `reversible true;` on a `cstr`/`pfr` is the water-gas shift
  (cstr02, pfr02, ladder01), Σν = 0, where the basis cancels.
* **Fix.** `Reaction::refuseLiquidBasisDetailedBalance` (one home,
  `Reaction.cpp`), called on the single-reaction `cstr` and `pfr` and on both
  `reactions ( ... )` paths: `reversible true;` with Σν ≠ 0 REFUSES, naming
  the two bases and the remedies (an explicit `A_rev`/`Ea_rev`, or an
  `equilibriumReactor`/`gibbsReactor`). Σν = 0 is untouched; `batchReactor`
  and `dynamicCSTR` are untouched (kmol is consistent). Why a refusal and not
  the unit conversion alone: the unit-consistent number (98.53 %) is still
  the gas's equilibrium at an effective pressure RT/v_liq, not the liquid's;
  writing the liquid standard state is M1, a decision. Gate R1 (four
  refusals, two negatives).

### W2. Suspected defect (ii): one root assumed at fixed T on the multi-reaction CSTR -- CONFIRMED

* **Choupo.** `CSTR.cpp:657-660` (f871943a9): "At fixed T the residual is
  monotone in each extent (the rate falls as its reactant is consumed), so a
  Newton from xi = 0 lands on the one root." `extentsAt` runs `newtonND` from
  ξ = 0 and nothing checks for another root. The single-reaction path refuses
  a law with an order on a product or a negative order (`CSTR.cpp:316-335`,
  correct -- D13) and its message sent the user here because "the
  multi-reaction solver makes no monotonicity claim and handles this law"
  (`:334`), which is the claim this path makes in its own comment.
* **Good practice.** Levenspiel ch. 6 and Fogler ch. 12: an isothermal CSTR
  with an autocatalytic law A + B -> 2B holds the washout state and, for
  Da = k τ C_A0 > 1, the conversion X = 1 - 1/Da; the washout is then
  unstable. The cubic law A + 2B -> 3B (Gray & Scott) holds up to three
  steady states at one T, the middle one unstable.
* **DWSIM.** The CSTR is a pseudo-transient march from the INLET composition
  (`CSTR.vb:556-563`, loop closed at `:968`): it finds one state, the one the
  feed relaxes to; for an unseeded autocatalytic law the rate is zero at the
  inlet composition, so it too stays at washout. Neither tool says so.
* **Witnesses.** `cstr04_adiabatic` with `thermalMode isothermal;`, the
  esterification's `ethylAcetate` order 0 -> 1 and A 1e8 -> 1e5 (k = 3.575e-6
  m3/(mol s) at 350 K, τ = 310.29 s, C_ethanol,0 = 8620 mol/m3, Da = 9.561):
  the engine reported ξ = 0, X = 0, `newtonResidual 0`, at exit 0, against
  the stable root X = 0.8954. With `thermalMode adiabatic;` (the T-scan) the
  same: "steady state found: 1 (350.0000 K)", `steadyStates 1`, because every
  scanned T returns the washout extent and the "complete-conversion" ceiling
  probe returns it too. Cubic: order 2 on the product, A = 11.8, 0.005 kmol/h
  of product fed (Da = τ k C_E0^2 = 9.481, ε = 0.01): the three roots of
  X = Da (1-X)(ε+X)^2 are 0.118 %, 9.56 % and 88.32 %; the engine reported
  the first (ξ = 1.645e-4 mol/s) with no word about the others.
* **Fix.** For a one-reaction set, `auditExtentRoots` scans g(ξ) = ξ - r V_R
  on the feasible interval (every flow ≥ 0) at the temperature the run
  reports, bisects each sign change, and ANNOUNCES (stdout + AdvisoryLog,
  severity warning) every root with its conversion, its stability (dg/dξ > 0)
  and which one is REPORTED. The reported root is not changed: which steady
  state a reactor holds is its start-up's, and choosing one is a modelling
  decision. Now: autocatalytic -> "2 roots ... xi = 0 (X = 0) UNSTABLE
  [REPORTED]; xi = 0.124363 (X = 0.895411) stable"; cubic -> 3 roots, the
  reported one stable. The single path's refusal text now says what the
  multi path does. NOT done: a set of several reactions (the extent space is
  R-dimensional; a proposal below). Gate R2 (the two witnesses announce; the
  monotone cstr03 and cstr04 as shipped say nothing).

### W3. The gibbsReactor drops a condensate when one outlet is declared

* **Choupo.** `GibbsReactor.cpp:655-665` (f871943a9) pushes the liquid as a
  SECOND produced stream when one forms; `Flowsheet.cpp:1160-1164` refuses a
  unit that produces FEWER streams than it declares and binds only the first
  `outputs.size()` (`:1187-1193`), so the extra one vanishes.
* **Witness.** The MTBE fixture of W1 in a `gibbsReactor` (`model directMin;`,
  elements C H -- see M2 for why not C H O), `outputs ( out );`: 99.62 % of
  the material condensed, the run exited 0, the plant mass balance closed at
  0.254 % (in 88.15 kg/h, out 0.224 kg/h) and the O balance at 0.04 %.
* **Fix.** The unit refuses by name when a liquid forms and fewer than two
  outlets are declared (the `crystalliser` reads its outlet count the same
  way, `Crystalliser.cpp:229`). Gate R3; gibbs07/08/09 (two outlets) run.
  The general rule -- the flowsheet refusing a non-empty produced stream it
  has no name for -- is family (d)'s, a proposal.

### W4. directMin returns a vanishing gas phase as a converged non-equilibrium

* **Witness.** The same MTBE fixture at 20 bar, where the ideal-solution
  bubble pressure of the equilibrium liquid is about 2.2 bar, so the answer
  is one liquid. `directMin` printed "193 objective evaluation(s) answered by
  the 1e30 infeasibility penalty -- the simplex was walled off, the answer is
  the best feasible vertex (announced)" and then `Conv.: yes`, with a gas of
  1.05e-3 mol/s at y_isobutene = 0.899 beside a liquid at x_isobutene =
  6.7e-6. Raoult would need y_IB P = x_IB Psat_IB: 17.97 bar against 7e-5 bar,
  a violation of ln 2.6e5 ≈ 12.5 in the chemical-potential equality; the
  liquid's own K_x = 0.9966/(6.7e-6 × 3.40e-3) ≈ 4.4e7 against 166. The
  reported isobutene conversion is 99.66 %; the ideal-solution answer is
  92.26 %. (With W3 fixed this case now refuses for the dropped liquid; with
  two outlets declared it runs and publishes the non-equilibrium.)
* **Good practice.** Smith & Missen (the non-stoichiometric formulation):
  a minimum must satisfy the stationarity (KKT) conditions -- equal chemical
  potentials of every species present in two phases, and a phase at zero
  amount must not lower G when introduced (the tangent-plane test).
* **DWSIM.** `Gibbs.vb:385-440` builds G from each phase's fugacity
  coefficients and minimises with IPOPT by default (`:45`); its own
  convergence is IPOPT's KKT tolerance.
* **Proposal.** After `directMin`, compute ln(y_i φ_i P) - ln(x_i γ_i Psat_i)
  for every species present in both phases and the tangent-plane distance
  of an absent phase; refuse (or announce) above a tolerance. Not done here:
  it reaches gibbs09's golden path and the method's internals.

### W5. The equilibriumReactor left the fugacity coefficients out

* **Choupo.** `EquilibriumReactor.cpp:327-336` (f871943a9):
  g_j = Σ_i ν_ij (ln n_i - ln n_tot + ln P/P0) - ln Kp_j -- the ideal-gas
  condition whatever the package. Its header says "NOT here ... any Kp beyond
  the ideal-gas rung"; nothing said so at run time.
* **Good practice.** SVNA ch. 13: Π (y_i φ̂_i P/P0)^ν_i = K. **DWSIM.**
  `Equilibrium.vb:160-224` multiplies each basis term by the fugacity
  coefficient. The `gibbsReactor` here folds φ in by successive substitution
  (`GibbsMethod.cpp:66-74`, `:338-348`).
* **Witness.** N2 + 3 H2 (1 + 3 kmol/h), 700 K, 200 bar, `fugacityModel SRK`,
  a `gibbsReactor` and an `equilibriumReactor` (`N2 + 3 H2 <-> 2 NH3`) side by
  side: y_NH3 = 0.3239 (Gibbs) vs **0.3001** (REquil), 7.3 % apart.
* **Fix.** An outer loop on Σ_i ν_ij ln φ_i at the solved composition, added
  to each ln Q_j, until it moves < 1e-10 (8 passes here); printed with
  Π φ^ν per reaction. Now y_NH3 = 0.3239 in both, Q = -14.7270 kW in both.
  On an ideal-gas package (every corpus REquil case) φ is never evaluated
  and nothing moves. Gate R4.

### W6. The equilibriumReactor's duty was the heat of reaction alone

* **Choupo.** `EquilibriumReactor.cpp:805-806` (f871943a9):
  Q = Σ_j ξ_j ΔH_j(T) on the ideal-gas rung, and the outlet stamped vf = 1
  (`:811`). The operating T may differ from the feed's (`:61`), and the
  stream is priced by the package.
* **Good practice.** The first law across the unit, Q = H_out - H_in; Hess
  makes that ξΔH(T) + the feed's sensible heat to T (+ departure terms on a
  real package). The `conversionReactor` was taken off the same shape on
  2026-09-25 (`ConversionReactor.H`).
* **Witnesses.** equil01 with the feed at 700 K into the 1100 K reformer:
  Q = 59.64 kW declared, 80.43 kW by the energy report (134.86 %). W5's SRK
  fixture: -13.51 kW declared, -13.89 kW by the report (102.78 %).
* **Fix.** The inlet on its own resolved state, the outlet at its own
  equilibrium (`reactorOutlet::outletState`, C72), each priced by
  `flashState::priceState`, the deposited solid by `priceSolids`;
  ΔH_j(T) keeps its ideal-gas rung for the approach direction, where only its
  sign is read. Now 80.43 kW and -14.73 kW, both closing. Gate R5.
* **An EduTool was quoting the defect.** The syngas lesson's two-stage shift
  (equil01's reformer at 1100 K, then equilibrium stages at 650 K and 480 K,
  `gui/src/ui/methods/syngasExercise.ts`, move `smr-shifted`) told the student
  "both stages reject heat (-5.30 and -1.72 kW)", beside the sentence "the
  heat that holding costs is the negative duty each one publishes"
  (`syngasLesson.ts`). Those were the heats of reaction alone; the heat that
  holds each stage at its temperature -- the feed arriving 450 K and 170 K
  hotter -- is -30.89 and -11.08 kW, which the engine now publishes. The
  move's quotes and its sentence were corrected (the lesson test runs the
  native engine and holds every quoted number to it).

### W7. A supersaturated gas-phase equilibrium was published as a vapour

* **Witness.** equil01 at 350 K, 1 bar (feed and reactor), 1 CH4 : 3 H2O:
  the outlet carries water at y P = 0.749 bar against Psat(350 K) = 0.422
  bar; published at vf = 1, exit 0.
* **Fix.** Refused by name, naming the species, y P and Psat, and the
  `gibbsReactor` (`directMin`) that carries a liquid -- the gibbsReactor's
  C150 R07 refusal mirrored. A component at or above its Tc is not tested.
  Gate R6; equil01 as shipped runs.

### W8. The dynamicCSTR drains under a mole-changing reaction

* **Choupo.** `DynamicCSTR.cpp:644` (f871943a9): `F_out = F_in`, molar, "the
  constant-volume assumption", with V fixed; dN/dt = Σν r V.
* **Good practice.** Fogler ch. 4/8: a constant-volume liquid CSTR holds the
  VOLUMETRIC flow, and the molar outflow follows the extent; molar
  F_out = F_in is right only when Σν = 0 at equal molar volumes.
* **Witness.** isobutene + methanol -> MTBE (Σν = -1, irreversible, A =
  2.7e-5 m3/(kmol s), Ea = 0), 1e-4 kmol/s equimolar, V = 0.1 m3 charged with
  1.24 kmol, `choupoSemiContinuous`, jacket at the feed T: after 3e5 s (about
  20 residence times) the holdup was **0.051 kmol** and still falling, the
  vessel's mass 2.25 kg in "0.1 m3", against the steady CSTR's X ≈ 56 % for
  the same law (Da = 2.92). The material ledger closed at 1e-7 -- it agrees
  with the arithmetic, not with the vessel.
* **Fix.** A reaction with Σν ≠ 0 is ANNOUNCED (stdout once per process,
  `AdvisoryLog` warning, so the end-of-run caveat block repeats it): the
  holdup DRAINS or SWELLS and no steady state exists. The first version
  REFUSED it; that broke arm `a2b` of `check_ctrl_balance`, which runs an
  A -> 2B dynamicCSTR deliberately to prove the material and element ledgers
  close when the moles change -- they do, over any horizon, and a short
  start-up transient may be what a case is about, so the run is said rather
  than stopped (the posture is the commander's to revisit). Every corpus
  `dynamicCSTR` reaction has Σν = 0 (measured over `tutorials/ctrl/*` and
  `tutorials/unsteady/*`), so nothing moves. Gate R7.
  Proposal: write the outflow for constant volume with ideal mixing,
  F_out = [F_in v_in + V Σ_r r_r Δv_r]/v_mix -- it also moves Σν = 0 cases
  whose species' Vliq differ (unsteady01's compA/compB), so it goes to Vitor
  with those rows.

### W9. The dynamicCSTR dropped a declared reverse leg

* **Choupo.** `DynamicCSTR.cpp:134-138` and `:607-614` (f871943a9): the
  vessel's own `Arrhenius` branch stores A and Ea and evaluates the forward
  product only; `reversible true;` and `A_rev`/`Ea_rev` are not read.
* **Witness.** ctrl11 with `reversible true;` added: n_ethanol at 600 s =
  1.11333560e-02 with or without the key.
* **Fix.** A reaction declaring either reverse form is read by the shared
  `RateLaw` (both legs; c = n/V in kmol/m3, the basis Kc is written in). Now
  n_ethanol 1.28653936e-02 with the key. Gate R7. No corpus `dynamicCSTR`
  declares a reverse leg.

---

## 3. MISSING items

* **M1. A liquid standard state for reversible liquid reactions.** After W1
  a liquid reaction with Σν ≠ 0 refuses detailed balance; with Σν = 0 it
  relaxes to the GAS Kp, which differs from the liquid's K_x by Π Psat_i^ν
  (esterification: by Psat_EtOAc Psat_water/(Psat_AcOH Psat_EtOH)). The
  textbook closure (SVNA ch. 13) is K_x = Kp Π (P0/Psat_i)^ν with γ from the
  package. Which standard state a student is told, and whether a `phase`
  word on the reaction selects it, is pedagogy and architecture: Vitor's.
  The Gibbs reactor's liquid rung, g°_liq = g° + RT ln(Psat/P0)
  (`gibbsMethod/ElementPotential.H`, `DirectMin.cpp:100`), is the same
  liquid standard state without φ_sat or Poynting -- the gap the
  thermodynamics review files as its W1 (`origin/claude/c131-review-thermo`,
  `docs/design/review-c131-thermodynamics.md`); it is theirs, not redone here.
* **M2. Rank, not count.** `GibbsReactor.cpp:232` refuses "need more species
  than elements" by count; the MTBE system (3 species, C H O) has rank 2 and
  one independent reaction (Smith & Missen: R = N - rank A). The workaround is
  to drop the dependent element (here O), which the user must find. Proposal:
  test N > rank(A) and announce a dependent element row.
* **M3. An absolute stop on the multi-reaction CSTR.** `CSTR.cpp:682`:
  tolerance 1e-14 × max(F_in, 1) mol/s. The MTBE `cstr` at V_R = 50 (`reactions
  ( mtbe )`, before W1's refusal) reached 7.1e-14 and "failed to converge";
  the residual is a difference of two legs each the size of the extent. The
  normalised residual of `solver/Convergence.H` (CLAUDE.md §5) is not wired
  here; family (d).
* **M4. Heat-of-reaction warnings off the caveat block.**
  `ReactionHeat.cpp:113-120` and `:143-148` print "thermally NEUTRAL" and
  "the dict value is IGNORED" to stdout only; neither reaches `AdvisoryLog`,
  so the end-of-run caveat block of a batch or dynamic run does not repeat
  them. Proposal: one `AdvisoryLog::add` at each.
* **M5. A gas on a liquid basis, unannounced.** `cstr02_reversible_wgs` and
  `pfr02_reversible_wgs` say in a comment that the reactors are liquid-basis
  and the WGS "sees a huge concentration"; the run prints Q and τ and nothing
  else. Proposal: announce when a concentration law runs on a feed whose
  resolved vf > 0.
* **M6. The rate constant's unit is the caller's.** `ReactionRate.H:70-71`:
  concentrations arrive in mol/m3 from `cstr`/`pfr` and kmol/m3 from
  `batchReactor`/`dynamicCSTR`, and a power-law `A` is read raw. The same
  `constant/reactions` entry of order 2 is therefore a rate constant 1000
  times different in the two families. Proposal: declare `A` with its
  dimensions (the `expression` grammar already does, D12) or announce the
  basis the number was read in.

---

## 4. SAME and DIFFERENT, briefly

* **D1** `Reaction::equilibrium` (`Reaction.cpp:136-150`): Kp = exp(-Σν g°/RT)
  on the ideal-gas rung at P0 = 1e5 Pa (`core/Constants.H:51`) -- SVNA ch. 13.
  DWSIM's Gibbs reactor writes ln(φ P/P0) with P0 = 101325 Pa
  (`Gibbs.vb:386`); if its ΔGf data are 1-bar values that is a 1-atm/1-bar
  mismatch of ln(1.01325) per mole of gas -- to be read back upstream, not
  asserted here.
* **D2** One enthalpy base: `reactionHeat` (`ReactionHeat.cpp:36-110`), duties
  as enthalpy differences in `conversionReactor`, `cstr`, `pfr` and now the
  `equilibriumReactor`. DWSIM's conversion reactor adds `ReactionHeat × ΔN`
  to a non-formation enthalpy (`Conversion.vb:704`, `:766`): equivalent when
  its heat of reaction is consistent with its enthalpies.
* **D3** Ergun (`PFR.cpp:1621-1638`): -dP/dz = 150 μ (1-ε)^2 u/(ε^3 dp^2)
  + 1.75 ρ (1-ε) u^2/(ε^3 dp), superficial u -- Ergun 1952; DWSIM
  `PFR.vb:1446` the same formula, applied as an explicit per-step decrement.
* **D4** `TemperatureApproach.H`: the sign from d ln K/dT = ΔH/RT^2 at the
  answer; DWSIM `Equilibrium.vb:224` evaluates K at `T + Approach` with the
  user's sign.
* **D5** The CSTR energy T-scan (`CSTR.cpp` multi path, the Van Heerden
  decomposition published) -- Fogler ch. 12. DWSIM's pseudo-transient finds
  one state.
* **D6/D7** REquil and the Gibbs methods: Smith & Missen's two formulations.
* **D8** Detailed balance as an option beside explicit reverse kinetics;
  DWSIM carries only the explicit one (`CSTR.vb:728-762`).
* **D9** Constant liquid Q in `cstr`/`pfr` (Fogler's v = v0 for liquids);
  DWSIM recomputes the reacting phase's volumetric flow at each step
  (`PFR.vb:234-252`). For a gas the engine's route is a law on p[i] or x[i]
  (the `expression` grammar), which then needs no Q at all.
* **D10** `conversionReactor` multi path: each conversion is of the FEED
  amount, applied in parallel, a negative outlet refused
  (`ConversionReactor.cpp:450-455`); DWSIM applies conversions sequentially by
  rank. Stated in `ConversionReactor.H`.
* **D11** `batchReactor` (`BatchReactor.cpp:470-495`): c = n/V kmol/m3, k_rev
  = k/Kc re-evaluated at T: consistent.
* **D12** `ExpressionRate`: symbols with units, dimension-checked, a
  definition cycle or an unknown symbol refused -- stricter than DWSIM's
  free-text expressions.
* **D13** The single-reaction `cstr` refusal of a non-monotone law
  (`CSTR.cpp:316-335`) is right; W2 is about where it sends the law.

---

## 5. Fixes with tests

Gate `bin/curate/check_reactor_limits.py` (wired in `bin/runTests`), arms
R1-R7 as in its docstring. Files: `src/thermo/reaction/Reaction.{H,cpp}`
(one home for the W1 refusal), `src/unitOperations/reactor/CSTR.cpp` (W1,
W2), `PFR.cpp` (W1), `GibbsReactor.cpp` (W3), `EquilibriumReactor.{H,cpp}`
(W5, W6, W7), `src/unitOperations/dynamic/DynamicCSTR.cpp` (W8, W9).
`check_energy_closure`'s unit arm now judges the `equilibriumReactor` too
(`UNIT_DUTY_IS_DH`, witness equil01's `reformer`). `docs/ai/unit-ops.md`
and the `EquilibriumReactor.H` header no longer say the equilibrium is
ideal-gas only, and say what the duty is and what is refused.

FAIL-FIRST, measured: with the seven source files restored to origin/main
(f871943a9) and rebuilt, the gate failed on every arm -- the four R1 probes
RAN, R2 printed no root list (twice), R3 RAN, R4 y_NH3 0.30011873919 against
0.323866847046, R5 Q = 59.6424648629 kW against 80.43 and the SRK duty did
not close, R6 RAN, R7 the mole-changing vessel ran silently and the reverse
leg left n_ethanol at 1.11333560e-02 either way. With the change restored
every arm holds.

THREE GATE FIXTURES THE FIXES CAUGHT, each a defect of the same kind in a
fixture rather than in the corpus:
* `check_reaction_subset_approach` arm (u), the Gibbs reactor at 300 K and
  50 bar (water condensing) declared ONE outlet: 14.57 % of the material
  condensed and was dropped from the stream table, while the arm read the
  liquid off the unit's KPIs and so never saw it. The 300 K points now
  declare `outputs ( outGibbs condensate )`.
* the same gate's arm (l), the hexadecane burn at 300 K and 1 bar, published
  a supersaturated gas (water at y P 0.157 bar against Psat 0.035 bar); W7
  refuses it, and the fixture now runs at 0.1 bar, where ln Kp -- the arm's
  subject -- is the same number.
* `check_ctrl_balance` arm `a2b` runs a mole-changing dynamicCSTR on purpose
  (see W8: announced, not refused).

Validation (sized by what the change reaches, CLAUDE.md §10; no full
regression): `make all`; the 86 corpus cases that contain a `cstr`, `pfr`,
`gibbsReactor`, `equilibriumReactor` or `dynamicCSTR` (`bin/runTests` on that
list): **PASS 87 / FAIL 0** -- no golden row moved (equil01's `Q_kW` is
identical to 12 figures; its feed is at the reactor's T); `bin/runTests
--scope` on `tutorials/steady/reactors`, `tutorials/steady/gibbs` and
`ammoniaRoutes01_screening`: **PASS 43 / FAIL 0** including `mass_closure`,
`energy_closure` (with the extended unit arm) and `energy_boundary_pinned`;
gates `check_reactor_limits`, `check_gibbs_condensables`,
`check_reaction_subset_approach`, `check_equilibrium_families`,
`check_rate_expression`, `check_ctrl_balance`,
`check_adiabatic_approach_direction`, `check_gibbs_solid_phase`,
`check_forward_order`, `check_caveat_surface`, `check_layering`,
`check_equilibrium_state_ref`, `check_reaction_curve`, `check_cooled_pfr`,
`check_pfr_ergun`, `check_quasi_steady`, `check_time_state_layout`,
`check_pellet_announcement`, `check_doctrine`, `check_glossary_bans`,
`check_wasm_dialect`, `check_compile_clean`: all PASS.
`check_ammonia_rate` FAILS arm (i) (`bed1Outlet` NH3 0.1060861 transcribed
vs 0.106083 run) -- PRE-EXISTING: it fails identically with the seven files
restored to origin/main and rebuilt (measured); ammonia03's golden was
re-recorded by the adiabatic-mixer commit 4c8a5097a after the bench
transcribed its states. Not this branch's to fix. The EduTool lessons cite
lines in four of the edited files: every citation was remapped by a diff of
the old and new file (the three that fell inside an edited region were read
and set by hand), the Van Heerden page's sentence that the extent solve
"ASSUMES the monotone case" now says what the engine does, and
`bin/runTests --gui`: PASS 36 / FAIL 0 (after two citation fixes the first run caught -- an ANCHORS tuple my remap had missed, and the syngas duties above).

## 6. Proposals (nothing below is done; no golden was re-recorded)

1. **W4** a stationarity check on the `directMin` answer.
2. **W2, several reactions** an extent-root audit for R > 1 (a multistart of
   the extent Newton from the vertices of the feasible polytope, announcing
   distinct roots).
3. **W8** the constant-volume outflow for the `dynamicCSTR`; it moves
   unsteady01-04 and every ctrl case whose species' Vliq differ -- the rows
   go to Vitor first.
4. **M1-M6** as written in section 3.
5. **W3, general** the flowsheet refusing a non-empty produced stream it has
   no outlet name for (family d: `Flowsheet.cpp:1160-1193`).
