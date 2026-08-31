# Entropy, traced end to end — the record before the page

**Date:** 2026-08-30.  **Status:** ALL FOUR PHASES COMPLETE (same day —
the owner lifted the pre-presentation freeze mid-arc).  (1) this trace;
(2) the "What is entropy?" EduTool page (spine ratified, external review
favourable); (3) the `explainProperty` bench op — §8; (4) the guides
addendum (theory guide ch:integrals entropy subsection rewritten, props
guide ledger completion).

**Why this record exists.** The owner asked "how exactly is an entropy
value calculated here?" and a repository search for the word *entropy*
answers almost nothing — the code speaks thermodynamic shorthand
(`s_298`, `s_pure_ig`, `s_formation`, `S_ig`, `S_residual`, `S_real`,
`dS_gen`), never the word.  This file is the one home for the answer,
written from the implementation, with file:line for every claim.

---

## 1. The ledger: from a compound's .dat to s(T, P, y)

One path, four rungs, each with a single home:

1. **The datum is measured, not conventional.**  Each component's
   `standardThermochemistry` block carries `s_298` — the absolute
   third-law entropy at 298.15 K and 1 bar (JANAF/NIST convention),
   parsed as a HARD lookup (`Component.cpp:650`; no default).  Contrast
   with enthalpy, whose `dHf_298` datum is the elements *convention*.
   Coverage: **516 of 603** component records carry the block (15 more
   name the gap in CoolProp-import banner comments; 12 are ion-derived
   salts whose thermochemistry is derivative by the 2026-06-29 ruling).

2. **`Component::s_formation(T, targetPhase)`** (`Component.cpp:1154`):
   s°(T) = s_298 + ∫Cp/T dT, closed-form per Cp model (PolynomialCp:
   a₀·ln(T/298.15) + Σₖ aₖ(Tᵏ−298.15ᵏ)/k, `PolynomialCp.cpp`; NASA7 has
   its own segment integral, `NASA7Cp.H:74`).  Phase crossings are
   explicit legs, and the vaporisation leg is done RIGHT: ΔS_vap(298) is
   **not** Hvap/T — the two standard states are not in equilibrium at
   298 K, so the Gibbs term is carried explicitly,
   ΔS = (ΔH_vap − ΔG)/298.15 with ΔG = −RT·ln(Psat/P°)
   (`Component.cpp:1181-1195`, with the reason in the comment).
   Solid→liquid mirrors h_formation's dissolved-solute default; melting
   is opt-in (solid Cp AND Hfus).  Sublimation refuses by name.

3. **`Component::s_pure_ig(T)`** (`Component.cpp:~1400`) =
   `s_formation(T, "gas")`, guarded by the SAME rung refusal as
   `h_pure_ig` (`requireIdealGasRung`, `Component.cpp:1361-1374`): a
   `pureSolid`/`pureLiquid` datum asked for gas-rung entropy refuses
   naming the sublimation/vaporisation error and the remedy.

4. **`ThermoPackage::S_ig(T, P, y)`** (`ThermoPackage.cpp:1096-1109`;
   contract `ThermoPackage.H:237-259`):

       S_ig = Σ yᵢ·s°ᵢ(T)          (pure-state line)
            − R·Σ yᵢ·ln yᵢ         (ideal mixing line)
            − R·ln(P / 1 bar)      (pressure line)

   This is the ONE place in the tree where the mixing entropy is written
   explicitly.  The pair (H_ig, S_ig) is reference-consistent (δh = T·δs
   on reversible paths), which is what makes the isentropic machinery
   below legitimate.

5. **`ThermoPackage::S_real(T, P, y)`** (`ThermoPackage.cpp:1559-1572`)
   = S_ig + `eos->S_residual(T,P,y)`, with a pure-fluid override: a
   phase effectively pure in a declared `pureFluids{}` component reads
   the fundamental-equation entropy directly (IF97 water:
   `PureFluidModel.cpp:54-57`, kJ/(kg·K)→J/(mol·K) via MW).

## 2. The residual line: which models supply it

`EquationOfState.H:86-107` declares `S_residual` (default 0 = ideal),
with the one-coherent-root contract (Z, v, H_res, S_res all from the
same vapour root).  Implemented by:

* **SRK** (`SRK.cpp:335-348`): S^R = R·ln(Z−B) + (da/dT / b)·ln((Z+B)/Z)
  — Sandler 4th ed. eq. 6.4-31, cited in-file.
* **PR** (`PR.cpp:309-321`): the generalised-cubic form.
* **PC-SAFT** (`PCSAFT.cpp:438-446`): S^res/R = −T(∂ã/∂T)_ρ − ã from the
  residual Helmholtz surface — **stated in-file to be the constant-V
  (T,ρ) residual, without the +R·ln Z conversion** to the (T,P)
  convention SRK/PR use.  See §6 (owner flag).
* **IF97** (`IF97.cpp:339, 390`): region-1/2 Gibbs-equation entropies,
  s = R(τγ_τ − γ), verified digit-for-digit against the release's
  verification tables by `IF97::verify()`.  Regions 3/5 (and therefore
  wet steam) refuse by name.

## 3. The consumers: where an entropy value actually decides something

* **Compressor / Turbine** (`rotating/`, shared core
  `IsentropicCore.cpp:103`): s_in = S_real(T_in,P_in,y); P_out is the
  UNKNOWN (the spec is W_shaft + η, the credo choice recorded at
  `IsentropicCore.H:53-54`); an outer Newton on P_out with an inner
  Newton `solveT_for_S` matching S_real(T,P_out,y) = s_in
  (`IsentropicCore.cpp:41-64`, tol 1e-4 J/(mol·K)).  Because y is held
  fixed, the S298 constants, the mixing term and R·ln P_ref cancel
  exactly in the difference — the isentropic answer hangs on ∫Cp/T,
  −R·ln(P₂/P₁) and the departures.  Both machines publish
  **`dS_gen` = s_out − s_in** as a KPI, printed as "entropy generated by
  the irreversibility".  The **Pump** deliberately computes no entropy
  (incompressible closed form; `IsentropicCore.H:50-51`).
* **rankine02_water** runs the SAME turbine on the IF97 absolute
  entropy surface (case declares `pureFluids { water { method IF97; } }`;
  its header says so).  The gas-only power tutorials run S_ig with zero
  residual.  Boiler/condenser price ENTHALPY only — no sf/sg anywhere.
* **Kp and the Gibbs reactors**: `g_pure_ig = h_pure_ig − T·s_pure_ig`
  (`Component.cpp:1413-1416`) → `Reaction::equilibrium`:
  Kp = exp(−Σν·g°/RT) (`Reaction.cpp:136-150`).  In the reactors the
  mixing entropy is IMPLICIT in the chemical-potential form: the
  `ln(yᵢ·P/P°)` of `EquilibriumReactor.cpp:141` and of `gibbsGasSolve`
  (`GibbsMethod.cpp:66-82`); `DirectMin.cpp:146` carries n·ln y inside
  the explicit total-G objective.  Real-gas equilibrium goes through
  ln φᵢ folded into g_eff (`GibbsMethod.cpp:161-175`), never through an
  explicit entropy departure.
* **The props bench already exposes the pieces**: `S_ig`, `S_R`,
  `S_real` are requestable keys (`PropertyEvaluator.cpp:212,223,225`;
  `PropertyPoint.cpp:71-80` publishes them as diagnostics).  The GUI
  displays these engine values and computes NO entropy of its own in
  TypeScript (checked).

## 4. Where entropy is implicit, and where it is absent

* **The aqueous world runs on K(T), not on S.**  Chemistry records carry
  (logK25, dH); `logK_T` is van't Hoff (`SpeciationSolver.cpp:702-707`).
  ΔS°₂₉₈ of each reaction exists only algebraically
  (ΔS° = R·ln10·logK25 + ΔH°/298.15) — no code names it.
* **`sAq` is carried but unconsumed**: 40 of 53 species records declare
  it; the only touch is a verbatim copy in `SaltFromCatalogue.H:168`.
  Every aqueous energy quantity runs on hfAq/cpAq.  Dormant data,
  honestly recorded here.
* **No stream, report or ledger carries entropy**; no second-law
  balance, no entropy of mixing for LIQUIDS (activity models supply
  γ = Gibbs-excess; ∂γ/∂T is never taken, so no excess entropy).
  This line read "no exergy" until 2026-08-31, and the `exergy` op had
  landed on 2026-08-30 — the ledger's own trace outlived the gap it
  named by one day.  PHYSICAL exergy is carried
  (`src/propertyOps/Exergy.{H,cpp}`); CHEMICAL exergy is refused by
  name, and no exergy balance runs over a flowsheet.
  `SolidPhase::fEffective`'s ΔG_fus = ΔH_fus(1 − T/T_fus) is the one
  phase-level construct with an implicit entropy (ΔS_fus = ΔH_fus/T_fus).
* **`dGf_298`** is an optional validation datum only the Joback
  estimator writes; nothing solves with it.

## 5. Why grepping "entropy" fails, in one line

The word appears in prose and banners; the physics lives in `s_298` →
`s_formation` → `s_pure_ig` → `S_ig` → `S_residual` → `S_real` →
`dS_gen`.  Seven names, one ledger.

## 6. Flag for the owner (reported separately, per the plan's own rule)

**PC-SAFT's `S_residual` convention differs from SRK/PR's.**  SRK/PR
return the (T,P) departure; PC-SAFT returns the (T,ρ) residual and says
so in its comment, WITHOUT the +R·ln Z term that converts between the
two.  `S_real = S_ig(T,P,y) + S_residual` therefore mixes conventions
when the EoS is PC-SAFT — an error of R·ln Z (≈ −0.4 J/(mol·K) at
Z ≈ 0.95, growing with density).  Today's blast radius is small: the
only S_real consumers are the rotating machines and the bench, and no
corpus case runs a compressor/turbine on PC-SAFT (checked: the power and
rotating tutorials declare idealGas or IF97).  It is a REAL
inconsistency all the same, visible the day someone prices an isentropic
machine on PC-SAFT.  Decision reserved: add the +R·ln Z conversion (a
numeric change to a published surface, needs its witness), or document
the convention divergence at the interface.  No change made in this
slice.

## 7. What the page can now claim, truthfully

Every line of the proposed LEDGER spine corresponds to a real engine
line: the measured datum (`s_298`), the temperature line (∫Cp/T with its
closed forms), the pressure line (−R ln(P/P°), `ThermoPackage.cpp:1107`),
the mixing line (−RΣy ln y, `ThermoPackage.cpp:1105` — explicit exactly
once in the whole tree, implicit as `ln y` throughout the equilibrium
machinery), the model line (S_residual per EoS), and the machine that
spends it (`dS_gen`).  The page's citations write themselves — which is
the point of doing the trace first.

## 8. Phase 3: the `explainProperty` bench op (2026-08-30)

The ledger this record traces is now an ENGINE surface, not only a page:
`explainProperty` (src/propertyOps/ExplainProperty.{H,cpp}) publishes the
derivation of S_real / S_ig / H_real / H_ig at one state — the datum row
straight off the record (`Component::S298()` / `Hf298()`), the ∫cp/T term
as a DIFFERENCE of two engine calls (`s_pure_ig(T) − s_298`, never a
private quadrature), the mixing and pressure lines, the EoS residual —
re-added and checked against the engine's assembled value, REFUSING on a
gap beyond round-off, on an unknown property, and on a `pureFluids {}`
fundamental-equation route (whose ledger is the release's own equation).
Witness: `entropy01_air_ledger` gained `explainS`/`explainH` ops (30
golden rows; H's ledger publishes NO mixing/pressure line — the asymmetry
is structural).  Gate: `check_explain_property` — the re-add is performed
INDEPENDENTLY in Python and the s_298 rows are read back against the
records; 4 sabotages, of which S2 (the op's self-check neutered AND its
gap row zeroed beside a corrupted line) is the one that proves the gate
does not lean on the auditee.  **Paid for on the way:** the op's first
`--record` came back at ONE decimal, because choupoProps' result-JSON
emitter writes values under the AMBIENT stream precision — whatever the
last op's console table left behind (de facto `fixed(4)` today).  The op
now saves/restores the stream state; the emitter defect itself is
RECORDED, not fixed — giving the emitter its own precision changes the
JSON representation corpus-wide and moves goldens recorded from truncated
values, a deliberate migration for its own slice.
