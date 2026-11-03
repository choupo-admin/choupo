# A general flash specification — (P,H), (P,S), (T,V/F), (P,V/F) from one home

> **KIND: SLICE RECORD · STATUS: BUILT 2026-11-03** (design written first, the
> build followed the same day; §7 is what was measured)
> (DEV.md 4c C214, item W1 of the week proposed by
> [`the-kernel-against-the-reference-simulator.md`](the-kernel-against-the-reference-simulator.md) §5).
> The study's finding, §3.2: Choupo answers an isothermal flash (T, P), a
> fixed-duty flash (P, Q) inside the `adiabaticFlash` unit and the
> bubble/dew points; the isentropic reference every compressor and turbine
> needs, (P, S), is computed privately inside `IsentropicCore` on a
> single-phase vapour, and a student cannot ask the props bench for any of
> these pairs.

---

## 1. What exists, read on 2026-11-03 at commit `1ab519440`

| Pair | Where it is answered today | What it assumes |
|---|---|---|
| (T, P) | `IsothermalFlash::solveCore` (`src/unitOperations/flash/IsothermalFlash.H:208`), with the Michelsen stability test inside it and the supercritical-split discard around it (`flashState::flashDiscardingSupercriticalSplit`, `StreamEquilibrium.H:230`) | the one flash home |
| (P, H) | `AdiabaticFlash::solve` (`AdiabaticFlash.cpp`): a bracketed `newton1D` in T over `flashDiscardingSupercriticalSplit`, bracket 200–700 K, 0.01 J/mol, `maxStep` 15 K, the outlet priced as `(1−β)·H(T,P,0,x) + β·H(T,P,1,y)`.  `valve` repeats the same shape on its own outlet (`Valve.cpp:136–203`), priced through `flashState::priceState` | the inlet is priced as the energy report prices it (`priceState`, since 2026-10-24 — the class comment still said "treated as a sub-cooled liquid feed", which has been false since that day and is corrected in this slice); a PURE feed whose enthalpy lies inside its latent jump has no root in T and the Newton exhausts |
| (P, S) | `rotating::solveT_for_S` (`IsentropicCore.cpp:42`): `newton1D` on `S_real(T, P, y) = s` at the FIXED overall composition | a single-phase VAPOUR.  A wet expansion or a flashing isentropic outlet is answered nowhere |
| (T, V/F), (P, V/F) | only at V/F = 0 or 1: `BubblePoint::compute` / `::pressure`, `DewPoint::compute` | `BubblePoint::compute` refuses a PURE component (every present K = 1 is a trivial root, `trivialSaturationRoot`), so a pure fluid's saturation temperature has no programmatic door |
| pure plateau | `flash/PureSaturationPlateau.H`: the saturated legs of one pure fluid on the enthalpy surface (`pureSaturationLegs`) | enthalpy only |

The ENTROPY of a liquid had no home on the surface the energy report prices.
`S_real(T, P, y)` is the vapour leg (`S_ig` + the EoS residual + the
association term), and `Exergy` / `PropertyPoint` call it at the overall
composition whatever the phase.  The liquid ENTHALPY the report prices,
`H_liquid_formation`, is per species `Component::h_formation(T, "liquid")`
(a declared liquid Cp) or the announced Watson-slope fallback
`h_pure_ig(T) − Hvap(T)`; the matching ENTROPY exists per species —
`Component::s_formation(T, "liquid")` walks the same 298.15 K bridge — but
nothing assembles it into a mixture.  So the commission's phrase "the
quality blend of the phase entropies ... on the same surface the energy
report prices (`S_real`)" is half right: `S_real` IS the vapour leg; the
liquid leg had to be written, and it is the one new thermodynamics in this
slice (§3).

## 2. The one home

`flashState::specifiedFlash(thermo, z, spec, verbosity)` in
`src/unitOperations/flash/SpecifiedFlash.{H,cpp}` — beside
`StreamEquilibrium.H`, in the namespace that already owns "what state is
this stream in, and what does it cost".  It calls nothing but the existing
homes: `flashDiscardingSupercriticalSplit` (hence `solveCore` and its
stability test) for every trial state, `hOfState` for the enthalpy, a new
`sOfState` beside it for the entropy, and `PureSaturationPlateau.H` for the
legs of a pure fluid.  It writes no equilibrium of its own: no `Kvec` sum,
no Rachford-Rice, no stability test — the one exception is the pure
saturation curve, which is `ln K_i(T, P) = 0` on the package's own K (the
same equation `pureSaturationProximity` solves), because no flash can answer
it: on the curve a pure flash is undetermined by construction.

It returns the equilibrium STATE — T, P, the vapour fraction, the phases
(the `FlashSolution` itself), H and S on the report's surface — plus the
route it took and the `solver::ResidualReport` of its decision.

## 3. The entropy surface

`ThermoPackage::S_liquid_formation(T, x)` and
`ThermoPackage::S_stream_formation(T, P, vf, z)`, the companions of
`H_liquid_formation` / `H_stream_formation`, built leg for leg so that
`G = H − T S` on one phase is the same potential the flash equilibrates:

* a species with a declared liquid Cp: `s_formation(T, "liquid")`, the
  partner of the `h_formation(T, "liquid")` the enthalpy reads;
* the Watson-slope fallback `h = h_ig(T) − ΔHvap(T)`: its partner
  `s = s_ig(T) − R ln(Psat(T)/P°) − ΔHvap(T)/T`, which makes the entropy of
  vaporisation at saturation exactly `ΔHvap/T` and the modified-Raoult
  equilibrium `y P = γ x Psat` the equality of the two potentials;
* mixing `−R Σ x ln x`, and the excess entropy the H surface implies: the
  report's liquid carries `H^E` only when the activity pairs are
  calorimetrically fitted, so `S^E = (H^E − G^E)/T` with
  `G^E = RT Σ x ln γ` and `H^E` = 0 or the fitted value — never a second
  excess model.  The consequence, named rather than hidden: `G = H − T S`
  then reproduces exactly the `G^E` the flash equilibrates, and
  `dH = T dS` at fixed composition misses, on a liquid whose activity
  coefficients move with T, exactly the excess enthalpy the enthalpy
  surface already omits (and announces).  One omission, carried
  consistently, not a second one;
* no pressure term (the liquid enthalpy has none either: an incompressible
  liquid on this surface);
* a `pureFluids {}` fundamental equation (IF97) routes exactly as the
  enthalpy routes: `s_molar(T, Psat(T))` for the saturated liquid, the
  two-phase blend on the saturation line for 0 < vf < 1.

Refused by name, because the enthalpy surface has a rung there the entropy
does not: an electrolyte liquid (the ion reference and `L_phi` have no
entropy partner in the tree), a dissolved molecular solute on the
crystalline rung (`dHsoln` without `dSsoln`), a nonvolatile carried at
vf > 0 (the enthalpy moves it to the liquid leg at full weight; an entropy
would need its mixing term in a phase it is not in), and a state carrying a
precipitate (`hOfState`'s solid rung has no entropy partner here).

What it is NOT: a Gibbs-consistent liquid for an equation-of-state package
whose liquid root sets the K-values.  The enthalpy the report prices for
such a package is the same per-species rung, not the EoS liquid root, and
the entropy follows the enthalpy — the surface is one, and the gap between
it and the EoS liquid is the enthalpy's gap, already named.

## 4. The algorithm, per pair

Every trial state is ONE call to `flashDiscardingSupercriticalSplit` at
(T, P, z) with tight flash options (Rachford-Rice 1e-12, composition 1e-12,
`FlashSpecification::defaultFlashOptions`; the props op does not expose them
— a unit caller sets its own).  The search is framed (`AdvisoryFrame`), so a trial's
advisories do not bury the answer's; the final evaluation at the answer
speaks in full.

**(P, H) and (P, S).**  The property Φ(T) of the equilibrium state at fixed
P is increasing in T (Cp > 0; dS/dT = Cp/T).
1. A PURE stream (one present component, `soleComponent`) is tested on its
   saturation curve FIRST: Tsat(P) from `ln K = 0`; the legs Φ_L, Φ_V at
   Tsat (`pureSaturationLegs` and its entropy twin, the same interior-quality
   extrapolation).  A target between them is the plateau — T = Tsat, the
   vapour fraction (Φ − Φ_L)/(Φ_V − Φ_L), closed form, no search.  This is
   the wet isentropic expansion.  Outside the legs, the search below runs on
   the single-phase side only (the bracket ends at Tsat).
2. Otherwise a bracket is found by stepping from the seed (10 K, doubling)
   until Φ − Φ* changes sign; then `solver::newton1D` with a central
   difference slope and bisection fall-back inside it.
3. A target the window [Tmin, Tmax] cannot reach REFUSES naming both ends
   and their values.  A trial the package cannot answer REFUSES naming the
   trial T and the package's sentence — no high-side rule is assumed here
   (`adiabaticFlash` assumes one for the reactive path and says so; a
   general specification has no grounds to).

**(P, V/F) and (T, V/F).**  The unknown is T (or ln P).
1. A pure stream: the state is ON its curve with the vapour fraction the
   specification declares — Tsat(P) or Psat(T) from `ln K = 0`, x = y = z.
   (T, P) cannot fix a pure split; the vapour fraction does (CLAUDE.md §3,
   the pure-component exception).
2. A mixture with 0 < β < 1: V/F(T) is continuous and increasing inside the
   two-phase band (decreasing in P); a bracket where V/F − β changes sign,
   then `newton1D` on V/F − β.
3. β = 0 or 1 (a bubble or dew point): V/F − β does not change sign, so the
   boundary is located as the engine already defines it — the first state
   the flash calls a split (`vapourFractionOf` > 0), or the last it calls
   one (< 1) — by bisection on that predicate to a relative width of
   1e-12.  The flash, not a second equation, decides where the band ends.
4. No crossing inside the window (a pure fluid above its critical point, a
   mixture whose band the window misses) REFUSES by name.

**The verdict.**  `solver/Convergence.H`'s one decision, `convergedNow`.  A
one-equation residual against its target is the DEGENERATE case of §2(b) of
that header (the two-term spread is the residual itself), so the verdict is
taken on the RAW residual — J/mol, J/(mol K), the vapour-fraction error, or
the relative bracket width — and the criterion string says so.  Defaults:
1e-6 J/mol, 1e-9 J/(mol K), 1e-11, 1e-12, `maxIter` 100; declarable through
a `convergence { tolerance; relTol; maxIter; }` block and announced with
`ConvergenceControls::describe`.  An unconverged search REFUSES — a state
that does not satisfy its specification is never returned.

## 5. Callers

* **`flashSpec`, a props-bench op** (`src/propertyOps/FlashSpec.{H,cpp}`):
  `spec { pair PH|PS|TVF|PVF; ... }`, the target given as a number or taken
  from a reference state (`targetFrom { T; P; }`, priced on the same
  surface), the state published as diagnostics.  Witness
  `tutorials/props/thermo/flashSpec01_wet_steam_expansion`: steam at 80 bar
  and 500 °C expanded isentropically to 0.1 bar on IF97, ending wet — the
  answer a student checks against the steam table.
* **`adiabaticFlash`, `valve`, `compressor`, `turbine`: NOT migrated** —
  §6.

A PURE state ON its curve (the plateau, a pure (T, V/F) or (P, V/F)) is
priced on the saturated legs (`pureSaturationLegs` and its entropy twin
`pureSaturationEntropyLegs`, one shared translation
`legsFromInteriorBlend`), never at (T, P): on the curve a pure-fluid method
answers one side, chosen by the last digits of P, and the latent heat is
lost — the first build did exactly that and its own verdict refused it
(a residual of 109 J/(mol K) on a closed-form state).

## 6. What is NOT done, and why

* The four rotating/flash units keep their own searches.  Each would MOVE a
  published number if routed through this home, so none is migrated in this
  slice (CLAUDE.md §10, a golden re-record is a claim): `adiabaticFlash` and
  `valve` converge to 0.01 J/mol from a different bracket (200–700 K) and
  step limit, so a tighter, differently seeded search lands on a T that
  differs in the last printed digits, and `adiabaticFlash` carries a
  declared high-side rule for an unanswerable reactive trial this home
  refuses; the compressor and turbine solve P_out for a given shaft work
  (their unknown is the pressure, not the state at a pressure), price on
  `H_real`/`S_real` at the overall composition, and an equilibrium outlet
  would change their answer exactly where it is wrong today — a wet outlet.
  The migration is the next slice and its list of moved rows is the claim
  it must carry.  MEASURED on `adiabaticFlash01_benzene_toluene` (the same
  feed and outlet pressure asked of `flashSpec`): the unit publishes
  T_out = 368.661803634 K and V/F = 0.0518811133842; this home answers
  368.6618041 K and 0.05188117765 — 4.7e-7 K apart, consistent with the
  unit's 0.01 J/mol stop on a two-phase dH/dT, and enough to move the
  golden's V/F row by 1.2e-6 relative against its 1e-6 tolerance.  The
  corpus's one wet-capable turbine (`rankine02_water`) is dry at its outlet
  (T_out_isen 462.66 K against Tsat 446.52 K at 8.59 bar), so no corpus
  case is wrong today for want of the two-phase (P, S); the gap is for the
  first case that expands into the dome.
* (T, H), (T, S), (V, U) and the other pairs; a three-phase (VLLE)
  specification beyond what `solveCore` returns at a trial point (the
  enthalpy is priced through `hOfState`'s VLLE branch; the vapour-fraction
  specification counts the vapour only); the inside-out algorithm (the
  study's W1 note: an OPTION after this, if the nested form proves slow).
* The entropy of an electrolyte liquid, a dissolved solute, or a crystal
  (§3, refused by name).

## 7. What was measured (2026-11-03)

* The witness `flashSpec01_wet_steam_expansion` against the IAPWS-IF97
  steam table read by hand: the isentropic expansion 80 bar/500 °C → 0.1
  bar lands on the plateau at T = 318.9575 K (table 45.81 °C), vapour
  fraction 0.81032 (table 0.8102), h = 2130.17 kJ/kg (table 2129.8, the
  table's own rounding), S equal to the inlet's to the last printed digit;
  the throttle 10 bar/450 K → 1 bar flashes 0.14702 (table 0.147);
  Tsat(1 atm) = 373.1243 K; Psat(373.15 K) = 101 417.98 Pa (table 101.418
  kPa); h_g(100 °C) = 2675.57 kJ/kg (table 2675.6).
* `bin/curate/check_flash_specification.py`: the four pairs round-trip
  against the isothermal flash on flash01 (ideal), flash02 (NRTL) and
  flash09 (SRK) — seven states, three of them two-phase — to a worst
  relative error of 1.3e-11 in T or P; the bubble and dew edges are the
  flash's own to 1e-7; dH = T dS on the single-phase legs to 1.1e-7; the
  ideal mixing entropy exact; benzene's latent T·ΔS against ΔH within
  0.37 % on the generic surface (a declared liquid Cp bridged at 298 K is
  not exactly Clausius-Clapeyron, and the number says how far).
* The ROUND TRIP CANNOT SEE A WRONG ENTROPY, and a sabotage proved it: the
  liquid leg priced on the ideal-gas entropy left every round trip green
  (the search and its reference share the surface) and was caught only by
  the identity arms.  The two-phase MIXTURE entropy blend has no identity
  arm (a blend error that stays a state function is invisible to both);
  named in the gate, not hidden.
* No existing golden moves: the slice adds functions no existing unit
  calls, and the one shared edit (`pureSaturationLegs` routed through
  `legsFromInteriorBlend`) is the same floating-point expression in the same
  order.
