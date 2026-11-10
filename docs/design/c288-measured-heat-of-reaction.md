# C288 -- a measured heat of reaction corrects the duty, as a named term

*Design record, 2026-11-10.  Written before any code, by a general, for the
architect.  No engine line, case or golden was changed to write it.  Every
engine fact carries the `file:line` it was read at on commit `55540b520`;
every number marked MEASURED was printed by this worktree's own binary.*

Commission: DEV.md 4c C288 (commit `578831d8a`).  It amends the settled
contract *Heat of reaction -- ONE enthalpy base* (2026-06-27,
`docs/architecture/settled-contracts.md:196`).

---

## 0. The decision in one paragraph

A reaction may declare a MEASURED heat of reaction: a value, the temperature
and phase it was measured at, how (calorimetry or van 't Hoff), the source,
and why it is declared.  When every reacting species carries formation data,
the engine computes the formation-route heat at the SAME temperature and
phase, takes the difference `delta_j = dH_declared,j - dH_formation,j`, and
adds `C = SUM_j xi_j delta_j` to the reactor's duty.  The streams keep their
formation-datum enthalpies; `C` is published beside the duty, as KPIs, and
as its own column in the energy report, its own row at the plant boundary
and its own record in the batch and ctrl ledgers -- so the first law still
closes, and the term is the named explanation of why the streams alone do
not close it (CLAUDE.md rule 4b).  The formation route stays the default; a
declared value never changes a stream, a K or a rate.

---

## 1. Where every reactor forms its duty, and the ONE place `C` enters

### 1.1 What is true today (measured, not recalled)

The commission's premise -- "the one resolver is `reactionHeat`" -- is TRUE
FOR THE TIME-DEPENDENT REACTORS ONLY.  The steady reactors do not call it for
the duty; they form the duty as `H_out - H_in` on the published streams, and
three of them compute a heat of reaction of their own for display or for a
sign.  The table is the map the slices work from.

| reactor | duty formed at | energy equation (non-isothermal) | heat-of-reaction number(s) | reads the dict `dH_rxn`? |
|---|---|---|---|---|
| `cstr`, single reaction (isothermal only) | `CSTR.cpp:486` -> `cstrDutyKW` (`CSTR.cpp:70-88`, `H_out - H_in` priced by `flashState::priceState`) | none | none | no |
| `cstr`, multi-reaction | `CSTR.cpp:1257` (same `cstrDutyKW`) | `phi(T) = H_out(T,xi(T)) - H_in - Q_ext(T)` at `CSTR.cpp:946-958`; saturated-composition bracket `CSTR.cpp:1012-1013`; Van Heerden split `CSTR.cpp:984-990`; closure variable C174 `CSTR.cpp:1266-1300` | none ("NO dH_rxn source term", `CSTR.cpp:551`, `:929`) | no |
| `conversionReactor` (single and multi; isothermal at `T`, no thermal mode) | `reactorDuty()` `ConversionReactor.cpp:98-140`; published `:322-324` and `:515-517` (`Q_kW`, `Q_reaction_kW`, `Q_sensible_kW`) | none | its OWN `dHrxn = SUM nu_i h_pure_ig(T)` at `:278-284` (single) and `:468-474` (multi), published as `dHrxn_kJ_per_mol` (`:319`) | no |
| `pfr`, single reaction (isothermal) | `PFR.cpp:485-492` (`H_out - H_in`, priceState) | none | `reactionHeat(..., std::nullopt, ...)` at `PFR.cpp:466` -- display only, `dHrxn_kJ_per_mol` `:480` | **no** (passes `nullopt`) |
| `pfr`, multi-reaction | `PFR.cpp:1443-1449` (`H_out - H_in`) | marched enthalpy flow `y[n]`: inlet `PFR.cpp:1025`, `dy[n]` = wall heat only `PFR.cpp:927`/`:936`; T recovered by inversion `PFR.cpp:881-893`; closure variable `:1461` | none | no |
| `equilibriumReactor` / `REquil` (gas only, isothermal) | `EquilibriumReactor.cpp:930-943`, published `:1059` | none | its OWN `dHrxn[j]` on the ideal-gas/solid rung `:111`, `:130-133`, used for the temperature-approach DIRECTION only (`:724-808`, `:869`) | no |
| `gibbsReactor` | `GibbsReactor.cpp:744-754` | adiabatic outer Newton `enthalpy(e,T) - H_in - Q` `GibbsReactor.cpp:464-513` | none (no reaction list) | no |
| `batchReactor` | isothermal ledger: state difference `BatchReactor.cpp:951` (canonical) OR `E = SUM dH_j xi_j` with extents from `N xi = dn` `:957-1032` | adiabatic liquidDH: `dT/dt = -SUM r V dH_j / Cp` `:577`, `:588` (dH frozen at the charge T); adiabatic gasConstantV: `dT/dt = -SUM u_i dn_i / Cv`, NO per-reaction dH `:592-610` | `reactionHeat(..., dictDH, ...)` at `:342` | yes, `:331` |
| `dynamicCSTR` | jacket `Q` in the ODE; ctrl ledger reads `BalanceSnapshot` (`BalanceSnapshot.H:101`, `:105`) | three routes: canonical T-form with `dHr = reactionEnthalpyAtT_(rxn,T)` `DynamicCSTR.cpp:840`; mixture-H state `dH/dt = Hin - Hout + Q` `:859`; legacy Cp form with frozen `rxn.dH` | `reactionHeat(..., dictDH, ...)` at `:317` | yes, `:315` |
| `distillationColumn` (reactive) | stage energy balances on stream enthalpies | MESH | none | no (reads `stoichiometry` at `DistillationColumn.cpp:2752`, `:2830`) |

Two findings the commission did not have:

* **`EquilibriumReactor`'s `dHrxn` is NOT a second home of the duty** -- the
  duty there is `H_out - H_in` since C131 (`EquilibriumReactor.cpp:857-869`).
  It is a second home of *a heat of reaction*, on a different rung
  (`pureSolidPhase::speciesEnthalpy`), read only for its sign.  The
  conversion reactor's `h_pure_ig` sum is a third.  Neither changes a
  balance.  Slice 1 routes both through the one resolver for the NUMBER they
  publish; that changes `dHrxn_kJ_per_mol` only where the liquid rung
  differs from the ideal-gas one, so it is a golden-moving change of its own
  and is NOT folded into C288's first slice (it is listed as slice 6).
* **The cross-check branch (a) of `reactionHeat` is exercised by no shipped
  case.**  All 16 reaction files that declare a live `dH_rxn` key
  (`grep -rn '^\s*dH_rxn\s' tutorials`) are the `compA -> compB` toy, which
  carries no formation data: they take branch (b), the override.  (`grep -l
  dH_rxn` finds 44 files because the word appears in comments; the
  architect's "about 39" counted those.)

### 1.2 The one place `C` enters each

There is ONE new shared function, beside the resolver and in the same file
(`src/unitOperations/reactor/ReactionHeat.{H,cpp}`):

```cpp
struct DeclaredHeat            // parsed from the reaction dict, see section 2
{   scalar value_J_per_mol; scalar T_K; std::string phase, method, source, reason; };

struct HeatCorrection          // resolved ONCE per reaction at set-up
{   bool   active = false;         // a measured value AND full formation data
    scalar declared  = 0.0;        // J/mol, at T_K, phase
    scalar formation = 0.0;        // J/mol, reactionHeat(...) at the SAME T_K, phase
    scalar delta     = 0.0;        // declared - formation, J/mol extent
    DeclaredHeat decl; };

HeatCorrection resolveDeclaredHeat(const ThermoPackage&, comps, nu,
                                   const std::optional<DeclaredHeat>&,
                                   const std::string& context, int verbosity);
```

`formation` is computed by `reactionHeat` itself -- the same
`speciesPhaseEnthalpy(..., StandardPhase)` leg (`ReactionHeat.cpp:84`) every
ledger duty reads -- so the comparison and the duty can never price on two
surfaces.  Each reactor then adds `C(xi) = SUM_j xi_j delta_j` in exactly
one site per equation it solves:

| reactor | duty | energy equation |
|---|---|---|
| `cstr` single | `CSTR.cpp:486`: `Q_kW = cstrDutyKW(...) + C/1000` | (isothermal) |
| `cstr` multi | `CSTR.cpp:1257`: same | `phi(T) += C(xi(T))` at `:958`, and the bracket at `:1012`; `G(T)` of the Van Heerden split gains `-C` (`:989`) so `R - G` still reproduces `phi` exactly; the C174 closure compares `Q_kW - C` (the streams' share) with the jacket's `U A (T_c - T)` minus `C`, i.e. `gap = Q_kW - Q_ext` is unchanged in form |
| `conversionReactor` | `reactorDuty()` gains `Q_corr_W`; `Q_W` and `Q_rxn_W` include it, `Q_sens_W` does not (`ConversionReactor.cpp:134-136`) | (isothermal) |
| `pfr` single | `PFR.cpp:492` | (isothermal) |
| `pfr` multi | `PFR.cpp:1449` | `dy[n] -= SUM_j r_j delta_j` beside the wall heat at `PFR.cpp:927`/`:936`; a marched cumulative `C` (one more component of `y`, appended last so no existing index moves) gives the term at the outlet |
| `batchReactor` | isothermal ledger: a NAMED record of kind `declaredReactionHeat` with `E_kJ = -C_segment`, booked beside the jacket record (`BatchReactor.cpp:951` and `:1026`); the jacket record itself becomes `dH_state + C` | adiabatic liquidDH: `heatRate += (rxn.dH + delta) r V` at `:577`; gasConstantV: `dT/dt = -(SUM u_i dn_i + SUM_j r_j V delta_j) / Cv` at `:610` |
| `dynamicCSTR` | jacket `Q` unchanged (it is the real heat) | canonical: `dHr = reactionEnthalpyAtT_ + delta` at `DynamicCSTR.cpp:840`; mixture-H: `dydt[N] = Hin - Hout + Q - SUM r V delta` at `:859`; legacy Cp route: not reachable (it serves datum-less toys, where no correction exists) |
| `equilibriumReactor`, `gibbsReactor` | REFUSED by name (section 1.3) | -- |
| `distillationColumn` | ANNOUNCED as a divergence (section 1.3) | -- |

`C` is computed from the SAME extents the reactor publishes
(`xi_<r>_mol_per_s` and its kin), never re-derived elsewhere.

### 1.3 Where the correction is NOT applied, and why

* **`equilibriumReactor`: refused.**  Its composition is set by
  `K_j(T) = exp(-dG_j/RT)` from the SAME formation data
  (`EquilibriumReactor.cpp:120-122`).  A measured heat that disagrees with
  that data says the data is wrong; correcting the duty while keeping the K
  would publish an equilibrium composition from the datum the case has just
  declared untrustworthy, beside a duty from the measurement.  The van 't
  Hoff slope `d ln K / d(1/T) = -dH/R` would then contradict the declared
  heat inside one unit.  Refusal names the remedy: a `conversionReactor` or
  `cstr` with the measured conversion / kinetics, or a declared `K(T)`
  (future slice, below).
* **`gibbsReactor`: refused.**  It has no declared reactions, hence no
  extents to multiply.  The refusal says so.
* **Reversible kinetics whose `k_rev` comes from `K` by detailed balance
  from formation data** (`Reaction::refuseLiquidBasisDetailedBalance`,
  `CSTR.cpp:542`): the duty is corrected, the K is NOT, and the engine says
  so in one advisory line naming the reaction.  It is the same objection as
  the equilibrium reactor, but here the composition is kinetic and the case
  author usually declares `K(T)` from measurement (Popken's `K_a`), so a
  refusal would be too strong.
* **`distillationColumn` with reactions**: the column's stage balances price
  streams and do not read the correction.  A reaction declaring a measured
  heat that a column runs is announced on the PROBLEM DIVERGENCE channel
  (settled contract *THE PROBLEM SOLVED IS NOT ALWAYS THE PROBLEM POSED*),
  not refused: the same `constant/reactions` file is legitimately shared by a
  reactor and a column in one flowsheet.

---

## 2. The grammar, and the ONE home for a declared heat

### 2.1 The new block

In the reaction's own entry of `constant/reactions`:

```
esterification_meoac
{
    stoichiometry ( ... );
    kinetics      { ... };

    heatOfReaction
    {
        value    -5.67 kJ/mol;      // per mole of extent, AS WRITTEN (nu as declared)
        T        298.15 K;          // the temperature the value refers to
        phase    liquid;            // liquid | gas -- the rung it is compared on
        method   vantHoff;          // calorimetry | vantHoff
        source   "Popken, Gotze & Gmehling, Ind. Eng. Chem. Res. 39 (2000) 2601, Table 5 (from linear regression, Figure 1)";
        reason   "the formation route on this case's records gives -7.54 kJ/mol in the liquid at 298.15 K; the measured value is the one a jacket must remove";
    }
}
```

* **Word**: `heatOfReaction`, a sub-dict.  Not `measuredHeatOfReaction`: the
  measurement is said by `method` and `source`, and one word for "the heat of
  this reaction, as declared" is the home `dH_rxn` should have been.
* **Units**: the dimension is checked like every scalar (`J/mol`,
  `kJ/mol`, `kcal/mol`, or bracket `[1 2 -2 0 -1]`); SI is J per mole of
  extent.  The basis is the stoichiometry AS WRITTEN; a reader of the record
  must not have to guess whether "per mol of ester" or "per mol of acid".
* **`T`**: REQUIRED.  No default to 298.15 K, because a van 't Hoff value is
  a mean over an interval and a calorimetric one is at the vessel's T; the
  author must say which.
* **`phase`**: REQUIRED, `liquid` or `gas` -- the two rungs `reactionHeat`
  prices (`ReactionHeat.H:72-84`).  A third word (`solution`, `aqueous`) is
  refused by name: the comparison is on the pure STANDARD-PHASE legs
  (`ReferenceContext::StandardPhase`, `ReactionHeat.cpp:84-86`), so any heat
  of mixing in the measurement lands in `delta`.  That is said in the
  printed line, not hidden.
* **`method`**: REQUIRED, `calorimetry | vantHoff`.  A van 't Hoff value
  carries the uncertainty of a slope; the advisory names it.
* **`source`, `reason`**: REQUIRED strings, non-empty.  Without them the
  block is refused: a correction that changes a duty must be auditable, and
  "measured" without a citation is a tuning knob.

### 2.2 Reconciling `dH_rxn` -- ONE parser, ONE resolver, the key KEPT

Backwards compatibility is mandatory, and the 16 toy cases depend on the bare
key.  So:

1. **One parser**: `parseDeclaredHeat(const Dictionary& rxn)` in
   `ReactionHeat.cpp` reads BOTH forms and returns one `optional<DeclaredHeat>`.
   The two readers that parse `dH_rxn` today (`BatchReactor.cpp:331`,
   `DynamicCSTR.cpp:315`) call it instead; the steady reactors call it for
   the first time.  A reaction carrying BOTH `dH_rxn` and `heatOfReaction` is
   refused (two homes for one number).
2. **The bare key keeps exactly its meaning today, and no new one.**
   `dH_rxn X;` is read as `heatOfReaction { value X; }` with no `T`,
   `phase`, `method`, `source`, `reason`.  It therefore:
   * on branch (b) (a species lacks formation data) remains THE heat, as now
     -- the 16 toy cases are byte-identical;
   * on branch (a) (full formation data) remains the cross-check WARNING it
     is now (`ReactionHeat.cpp:109-123`) and **never triggers a
     correction**: a correction needs `source` and `reason`, which the bare
     key cannot carry.
3. **`heatOfReaction {}` on branch (b)** (no formation datum) is the heat
   itself, exactly as `dH_rxn` is; `T` and `phase` are recorded and printed,
   and there is no `delta` because there is nothing to compare with.  The
   engine says "declared heat used as the heat (no formation datum)".
4. **Not deprecated.**  The bare key is the short teaching form for a
   datum-less toy, and it is honest there.  The docs (`docs/ai/energy.md`,
   the reactions grammar in `docs/ai/case-layout.md`) describe it as the
   shorthand of `heatOfReaction {}` without provenance.

Cases that would change: **none on slices 1-4** (no shipped case declares
`heatOfReaction`; the 16 `dH_rxn` cases take branch (b) and stay
byte-identical).  Slice 6 (routing the conversion and equilibrium reactors'
display numbers through the resolver) moves `dHrxn_kJ_per_mol` rows on the
conversion-reactor cases whose species have a liquid rung different from the
ideal gas -- listed by that slice from a `--plan`, not here.

---

## 3. The energy report, the ledgers, the KPIs and the gates

### 3.1 The KPIs (per unit)

| KPI | meaning | energy item? |
|---|---|---|
| `Q_kW` | the CORRECTED duty: the heat that crosses the boundary | yes (unchanged entry, `EnergyItems.H:86`) |
| `Q_formationRoute_kW` | `H_out - H_in` on the published streams (today's `Q_kW`) | no |
| `Q_declaredHeatCorrection_kW` | `C = SUM_j xi_j delta_j` | no -- a NAMED TERM (below) |
| `dHrxnDeclared_<r>_kJ_per_mol` | the declared value | no |
| `dHrxnFormation_<r>_kJ_per_mol` | the formation route at the declared T and phase | no |
| `dHrxnCorrection_<r>_kJ_per_mol` | `delta_j` | no |

`Q_kW - Q_declaredHeatCorrection_kW == Q_formationRoute_kW` to the last bit,
by construction (the correction is added, never apportioned -- the rule of
the conversion reactor's `Q_rxn + Q_sens`).  Utilities, sizing and costing
read `Q_kW` and so size the jacket on the measured heat, which is the point.

### 3.2 A third kind beside Heat and Work

`src/result/EnergyItems.H` gains ONE predicate, in the same file that holds
the energy-item map, so the name has one home:

```cpp
//  A DATUM CORRECTION is neither heat nor work: it is enthalpy the streams'
//  formation datum does not carry (C288).  Never an energy item; read by name
//  by the energy report, which credits it as a named step.
inline bool isDatumCorrectionKpi(const std::string& k)
{ return k == "Q_declaredHeatCorrection_kW"; }
```

### 3.3 Per unit: raw / declared step / remainder

The model-boundary precedent (settled contract
*THE MODEL-BOUNDARY STEP IS ACCOUNTED, NOT CHARGED TO THE UNIT*) keeps three
quantities apart: raw imbalance, step, remainder.  C288 uses the SAME three:

* raw imbalance `dH - supplied` = `(Q_kW - C) - Q_kW` = `-C`
  (`EnergyBalanceReport.cpp:324-331` computes `dH` and `supplied` as now);
* the declared-heat step = `-C`, read from the unit's KPI;
* remainder = raw - boundary step - declared-heat step, and the VERDICT and
  the alarm (`EnergyBalanceReport.cpp:703`) are taken on the remainder.

`energyBalance_byUnit.csv` gains ONE column, appended AFTER `byConstruction`
(the last column, `EnergyBalanceReport.cpp:93-95`, so readers that index by
position are untouched): `declaredHeat_step_kW`.  `adjusted_closure_pct`
is recomputed with both steps credited.  At verbosity >= 2 the report says,
next to the model-boundary sentence (`:760-768`): `unit 'R1' -- raw
imbalance X kW EXPLAINED by a declared heat of reaction (C288): <reaction>
declared Y kJ/mol (<method>, <source>) against Z on the formation route,
remaining W kW`.

**This step is NOT an audit.**  The model-boundary step is credited only when
an independent auditor reproduces it; the declared-heat step is a case INPUT
times the published extent.  What the report checks is narrower and stated:
that `C` equals `SUM xi_j delta_j` recomputed from the published per-reaction
KPIs, within the C174 tolerance.  It does not -- cannot -- check that the
measurement is right.  The row says `credited: declared (not reproduced)`,
so nobody reads it as the stronger claim.

### 3.4 Plant boundary

`globalEnergyBoundary.csv` (`EnergyBalanceReport.cpp:1093-1124`) gains ONE
row, `declared_heat_correction`, and the residual line at `:998` becomes
`residual = Hfeeds + Qext - Hprods - Ccorr`.  The physical reading: the
products' real enthalpy is `Hprods + Ccorr`, the formation datum carries
`Hprods`.  `outputs` is written as `Hprods + Ccorr`, so `inputs - outputs =
residual` still holds on the file.  The JSON (`globalEnergyBoundary` block on
the result, `:1074-1090`) gains `declaredHeatCorrection_kW`.  Rows are added,
none renamed: the two readers that select rows BY NAME (`bin/runTests`'
energy-T2 and `check_default_reports`, per the comment at `:1101-1105`) see
no change.  A plant with no declaration writes `declared_heat_correction,
0.000000` -- byte-identical everywhere else.  (A second option -- write the
row only when nonzero -- keeps every golden byte-identical at the cost of a
row that appears and disappears; the slice chooses by what the golden format
reads, and says which.)

### 3.5 Batch campaign and ctrl ledgers

* **Batch** (`SimulationResult::EnergyRecord`, `SimulationResult.H:326-347`):
  a record of a new `kind`, `declaredReactionHeat`, with `named = true`
  (the C258 named-stream precedent, `FixedBedAdsorber.cpp:2209`) and
  `E_kJ = -C_segment`.  The kind list (`SimulationResult.H:311-325`) gains
  the word; the campaign publishes `energy_kJ_stream_declaredReactionHeat`
  through the existing `choupoBatch/main.cpp:1923` path.  The jacket record
  carries the real heat; the named record is why the vessel's stored
  formation-datum H differs from it.
* **Ctrl** (`DynamicDriver.cpp:1238-1463`): `BalanceSnapshot` gains
  `declaredHeatCorrection_kW` (rate, `SUM r V delta`); the ledger
  integrates it on the same accepted-state trapezoid as `cumQ`
  (`DynamicDriver.cpp:1406`) into `cumCorr`; the closure becomes
  `stored - (cumHin - cumHout + cumQ - cumCorr)` (`:1463`); the CSV and the
  `energy_kJ_*` KPIs (`:2044-2050`) gain `energy_kJ_declaredHeat_cum`.

### 3.6 The gates

* `check_energy_closure` reads the engine's residual and never recomputes it
  (its own header).  Because the residual is now taken AFTER the named term,
  a corrected plant passes on its own merits.  NEW ARM: a plant whose
  `declared_heat_correction` is nonzero must have every contributing unit
  print the C288 sentence and the per-reaction KPIs (a correction no reader
  can see is the "hidden in the duty" the commission forbids).  Sabotage:
  (i) drop `C` from the residual line -> the plant fails by `|C|`; (ii) add
  `C` to `Q_kW` but not publish `Q_declaredHeatCorrection_kW` -> the
  per-unit remainder is `-C`, the alarm fires; (iii) publish the KPI with a
  wrong sign -> remainder `2C`.
* `check_campaign_closure`, `check_ctrl_balance`: the named record and the
  ctrl column must be present whenever a declaration is active; the
  sabotage is to suppress each and watch the closure fail.
* `--record` refusal (rule 4b) is unaffected: it refuses a closure above
  tolerance, and the remainder is what is judged.
* NEW gate `check_declared_heat`: every `heatOfReaction {}` in the tree has
  `T`, `phase`, `method`, `source` and `reason`; no reaction carries both
  forms; the witness case's printed `delta` equals declared minus formation
  at the printed T.

---

## 4. Temperature and phase: where the declared value meets the reactor

`delta_j` is evaluated ONCE, at the declared `(T_d, phase_d)`, and applied as
a CONSTANT at every reactor temperature and phase:

    dH_eff,j(T, phase) = dH_formation,j(T, phase) + delta_j.

This IS a Kirchhoff shift of the declared value -- with the MODEL's
`dCp(T)` and the model's phase-change legs, not with a second heat-capacity
set:

    dH_eff,j(T) = dH_declared,j + [dH_formation,j(T) - dH_formation,j(T_d)]
                = dH_declared,j + INT_{T_d}^{T} dCp_j dT  (+ latent legs if phase != phase_d).

The physics that justifies it: the commonest cause of a wrong computed heat
is a wrong CONSTANT -- a formation enthalpy, or the latent heat that bridges
the ideal-gas datum to the liquid at 298 K (acetic acid's monomer/dimer
vapour, `docs/design/acetic-acid-latent-heat-closure.md`) -- and a constant
error is removed exactly by a constant `delta`.  An error in the heat
capacities is NOT removed: it grows as `(T - T_d) dCp_err`.  So:

* the printed line always shows `T_d`, the reactor's `T` and the Kirchhoff
  term separately (`dH_eff = declared + shift`), so the student sees how far
  the measurement was carried;
* an advisory fires when `|T - T_d|` exceeds a stated default (50 K, the
  order of a typical calorimetric or van 't Hoff window; written in the
  advisory, changeable by the architect) -- it says "the measurement is
  carried <dT> K by the model's heat capacities";
* a reactor whose phase differs from `phase_d` carries the measurement
  across the model's latent heats; that is announced in the same line.

There is no second option worth writing: correcting at the reactor's `T`
without a shift would require the measurement at every `T`.

---

## 5. The witness

### 5.1 What is in hand

`~/Choupo-Literature/INDEX.md` lists ONE esterification with a measured
reaction enthalpy, and it is NOT calorimetric:

* Popken, Gotze & Gmehling, Ind. Eng. Chem. Res. 39 (2000) 2601, Table 5
  (read in `popken2000-methyl-acetate-esterification-kinetics.pdf`, p. 2604,
  and in `popken2000_params.md` section 2d):
  `dh_r = -5.67 kJ/mol` "from linear regression" of the MEASURED `ln K_a`
  against `1/T` over about 293-343 K (Figure 1, Eq 3b, constant `dh_r`
  assumed), liquid phase, activity basis; `-5.42 kJ/mol` from the
  liquid-phase formation enthalpies of Table 4; `-6.51` from Song et al.'s
  correlation.  The paper itself warns that "a small error in dg_f or dh_f
  causes a relatively large error in dg_r or dh_r due to the small
  magnitude" -- the EduTool's first sentence, in a primary source.

### 5.2 What Choupo computes for the same reaction (MEASURED)

Run on 2026-11-10 with this worktree's `./choupoBatch` (built by `make -j1
all` from `55540b520`) on two scratch copies of `batch07_lhhw_methylAcetate`
(its own case-local records), isothermal, at 298.15 K and at 333.15 K; the
`[reaction heat]` line is printed by `ReactionHeat.cpp:103-107`:

| quantity | value (kJ/mol of extent) | where it comes from |
|---|---|---|
| gas-phase sum `SUM nu dHf_298` of the records | -20.54 | -411.90 - 241.826 + 432.25 + 200.94 (the four `standardThermochemistry` blocks); hand arithmetic |
| **Choupo, liquid, formation route, 298.15 K** | **-7.540** | MEASURED, `[reaction heat] ... = -7.54048 kJ/mol (T = 298.15 K, liquid basis)` |
| **Choupo, liquid, formation route, 333.15 K** | **-7.141** | MEASURED, `= -7.14148 kJ/mol (T = 333.15 K)` |
| Popken Table 4 liquid formation enthalpies | -5.42 | paper |
| Popken van 't Hoff from measured `K_a` | -5.67 | paper |
| acetic acid's latent heat bridge to the MONOMER datum at 298.15 K | 51.81, of which 22.84 is dimer dissociation | MEASURED, the engine's `[thermo] aceticAcid: liquid bridged ...` line (DEV.md 4c C201 item 1) |

So on the shipped records `delta = -5.67 - (-7.54) = +1.87 kJ/mol` at
298.15 K (about +1.64 at 318 K by linear interpolation of the two measured
points; the witness prints the real number).  Choupo already agrees with
the measurement to within 2 kJ/mol -- because of C201's dimer bridge.
Without that bridge (the apparent 24.39 kJ/mol carried to 298 K, i.e. the
bridge minus its 22.84 kJ/mol dimer term) the same route gives about
-7.54 - 22.84 = **-30.4 kJ/mol, five times the measurement** (an estimate by
subtraction, not a run).  That pair is the EduTool's numerical example: one
latent heat, read on the wrong vapour, moves a liquid heat of reaction by a
factor of five while the gas-phase sum is untouched.

### 5.3 The witness case

`tutorials/steady/reactors/cstr09_measured_heat_methylAcetate`: a copy of
`cstr07_lhhw_methylAcetate` (Popken Eq 16, isothermal 333.15 K, already
held to the paper's own `K_a = 25.50`), with
`heatOfReaction { value -5.67 kJ/mol; T 318 K; phase liquid; method vantHoff; source "...Table 5..."; reason "..."; }`.
`T 318 K` is the centre of the regression interval; Popken report the value
as `dh_r` at `T0 = 298.15 K` under a constant-`dh_r` assumption, so the
witness states that choice in its header and the advisory of section 4 does
not fire (|333 - 318| = 15 K).  cstr07 itself is NOT edited: its goldens
stay.  Held to: the printed `delta` and `C` against a hand computation in
the header; mass, element and energy closures held by the gates (rule 4b).

**What a stronger witness needs**: a CALORIMETRIC liquid-phase
esterification enthalpy (reaction calorimetry of methyl or ethyl acetate
formation, or the liquid heats of combustion of the four species from which
a measured `dH_r` follows by Hess).  None is in `~/Choupo-Literature`.
Candidates to fetch, NOT READ and therefore not cited as values: the
reaction-calorimetry literature on acetic acid + ethanol / methanol, and the
NIST-compiled liquid formation enthalpies (Domalski & Hearing 1993, which
Popken cite for methanol and methyl acetate).  Until one is read, the
witness is a van 't Hoff one and is labelled so.

---

## 6. The slices, in order, with their reach and validation (CLAUDE.md 10)

| # | slice | reaches | validation |
|---|---|---|---|
| 1 | `ReactionHeat.{H,cpp}`: `DeclaredHeat`, `parseDeclaredHeat`, `resolveDeclaredHeat`; the two existing `dH_rxn` readers (`BatchReactor.cpp:331`, `DynamicCSTR.cpp:315`) switched to the parser; refusals (both forms; missing fields; `equilibriumReactor`, `gibbsReactor`); the divergence line in `DistillationColumn` | every case that declares `dH_rxn` (16 toys, branch (b)); every reactive column (one `if` on a key no case has) | build; `--scope` the 16 `dH_rxn` cases + `batch07`, `cstr07`, `column05`, `ctrl11`: byte-identical; sabotage fixtures for each refusal |
| 2 | Steady reactors: `cstr` (single, multi, incl. `phi(T)`), `conversionReactor`, `pfr` (single, multi march); the KPIs of 3.1; `EnergyItems.H` predicate; `EnergyBalanceReport` column, step, global row | every steady reactor case and every energy report -- a path every steady case goes through (`EnergyBalanceReport.cpp`) | build; the witness `cstr09` end to end FIRST (rule 4c: the artefact first); `--fast`; then a FULL sweep, with its reason written: the energy report is a shared path and the global CSV gains a row in every case (unless 3.4's nonzero-only option is taken, which the slice must prove byte-identical with a sweep anyway) |
| 3 | Batch: liquidDH, gasConstantV, isothermal ledger + named record | batch reactor cases, campaign ledger | `--scope` every `choupoBatch` reactor case + a batch witness (batch07 copy with the declaration); `check_campaign_closure` with its sabotage |
| 4 | Dynamic: canonical and mixture-H routes, `BalanceSnapshot`, ctrl ledger | every `choupoCtrl` / `choupoSemiContinuous` case with a `dynamicCSTR` | `--scope` ctrl + unsteady families; a ctrl witness (ctrl11 copy); `check_ctrl_balance` with sabotage |
| 5 | Settled contract amended (`settled-contracts.md:196`), `docs/ai/energy.md`, theory guide section, unit-op catalogue, the reactions grammar in the AI docs and `bin/llmctx` packs | docs only | the gates that read them (`check_doc_references`, `check_doctrine`, glossary) and `make -B` of the touched guides |
| 6 | (separate, golden-moving) `conversionReactor` and `equilibriumReactor` publish their `dHrxn_kJ_per_mol` through `reactionHeat` (one number, one rung); the Joback advisory (section 7) | conversion and equilibrium cases' `dHrxn` rows | `--plan` lists moved rows; re-record with each row's reason in the commit |
| 7 | EduTool (section 7) | `gui/` only, plus the citations it makes into the engine | `--gui` |

Slices 1-4 change no shipped number.  Slice 2 is the only one that needs the
full sweep, and only because the energy report is a shared path.

---

## 7. The EduTool and the advisory -- where each piece lives

Scope as approved by the architect; this records only the homes.

* **Files**: `gui/src/ui/methods/reactionHeatLesson.ts` (steps, symbol
  glossary with `file:line` citations into `ReactionHeat.cpp`), a math
  module `reactionHeatMath.ts` (the term-by-term ideal-gas route, pure TS
  over numbers the engine publishes -- never a second thermodynamics), the
  tool `ReactionHeatTool.tsx`, the registry rows in `eduToolsIndex.ts` and
  `chapters.ts`, the references in `lessonReferences.json` (gate
  `check_lesson_references`), and the tests in
  `gui/tests/reactionHeatTool.test.ts` and `reactionHeatLesson.test.ts` (the
  pattern of `vanHeerdenLesson.ts` / `VanHeerdenTool.tsx`).
* **(1) Why a computed `dH_rxn` can fail**: the methyl-acetate numbers of
  section 5 (gas-phase sum -20.54, Choupo liquid -7.54, the same route without the acetic dimer bridge about -30.4, Popken's -5.67 and
  -5.42), with Popken's own warning quoted.
* **(2) The ideal-gas route term by term**: `dH_liq = SUM nu (dHf_ig + INT
  Cp_ig - dHvap(T))`; knobs on each species' `dHf_ig` and `dHvap` error;
  the student watches `dH_rxn` move and change sign.  The numbers it starts
  from are the engine's, read from a run of the witness (the C251 rule: a
  view over engine numbers).
* **(3) Industrial practice**: reaction calorimetry (heat-flow, adiabatic),
  van 't Hoff and its uncertainty, design on the worst case -- the adiabatic
  temperature rise `dT_ad = -dH xi / (m cp)` with the declared and the
  computed heats side by side.
* **(4) Choupo's named correction**: the energy-report row and the plant
  boundary row from the witness, showing the balance closing with `C` and
  open without it.
* **The Joback advisory** lives in `resolveDeclaredHeat`'s sibling at set-up
  (ReactionHeat.cpp, called by every reactor that reads reactions): when a
  reacting species' `dHf_298` is a group estimate, one advisory names the
  species and says its formation enthalpy may be tens of kJ/mol off,
  suggesting a measured `heatOfReaction`.  **What it reads is NOT in the
  engine today**: the Joback origin is a COMMENT tag (`[origin=predictive
  method=joback]`) in `data/groupEstimative/components/*.dat`, and
  `EstimateComponent.cpp:400-411` writes the Joback `Hf` only as a comment.
  The machine-readable home exists -- `Component::provenance()`
  (`Component.H:683-688`, `OriginInfo` with `Origin::predictive`,
  `Origin.H:56`) -- so the slice must make the estimator write
  `provenance { dHf_298 { origin predictive; method joback; } }` and the
  advisory read `provenance().at("dHf_298").origin == predictive`.  No
  record in `data/standards/components` carries such an origin today
  (measured: zero matches), so the advisory touches no shipped case.

---

## 8. Points where this record disagrees with the commission

1. **"Every reactor class" cannot include the equilibrium and Gibbs
   reactors** (section 1.3): one has no extents, the other draws its
   composition from the very datum the measurement contradicts.  Refusal,
   with a later slice that lets a case declare `K(T)` beside the heat.
2. **The steady reactors do not use the "one resolver" for the duty**; they
   price streams.  The correction therefore enters each reactor's duty site
   and energy equation, and the resolver is the home of `delta`, not of `Q`.
3. **"Kirchhoff shift or not" has one answer, and it is "yes, by
   construction"** (section 4); the decision left is only the advisory
   window.
4. **The witness is van 't Hoff, not calorimetric**, because that is what is
   in hand; the commission asked for "measured".  Said in the case.
5. **The bare `dH_rxn` must NOT become the measured declaration**, even
   though it is the obvious "one home": it carries no T, phase or source, and
   letting it correct a duty would turn every cross-check warning into a
   silent correction.  Kept, narrowed, not deprecated.
