# Pack: separations (columns, absorbers, strippers, extraction, drums)

budget: 2700 words (~4320 tokens)

Read after the brief (`docs/ai/brief.md`). Units here: `shortcutColumn` (FUG) · `distillationColumn` · `absorber` · `stripper` · `extractor` · `isothermalFlash` as drum or decanter.

## 1. Which unit

| You have | Use |
|---|---|
| a VL split needing stages, ideal or mildly non-ideal | `shortcutColumn` first (N, R, feed stage), then `distillationColumn` |
| azeotrope, strongly non-ideal, side draws, several feeds | `distillationColumn` `model simultaneous;` (skip FUG: no azeotrope in FUG) |
| one equilibrium split, no stages | `isothermalFlash` (VL drum) |
| two liquids from one mixture, no stages | `isothermalFlash` `phaseSet LL;` (decanter) |
| gas washed by a liquid, solute obeys Henry | `absorber`; reverse: `stripper` |
| solute moved between two immiscible liquids | `extractor` (`gammaGamma` package) |

Absorber and stripper are Kremser/Henry units, NOT rigorous VL: a solute with strong liquid-phase chemistry or a volatile solvent is wrong there. Use `distillationColumn` for those.

## 2. shortcutColumn  (alias `FUG`)  — design, not rating

Ports: `in feed;` → `outputs ( distillate bottoms );`. Runs at the FEED stream's P (no `P` key). Feed has to be a liquid (or two-phase) with a bubble point at that P.

```
operation
{
    lightKey      benzene;     // component name
    heavyKey      toluene;
    recoveryLK    0.99;        // fraction of feed LK going to the distillate, in (0,1)
    recoveryHK    0.01;        // fraction of feed HK going to the distillate, in (0,1)
    refluxFactor  1.3;         // R/Rmin   -- XOR --   refluxRatio 2.0;   (L/D)
}
```
Reflux is REQUIRED (no default). Computed (KPIs): `N_min` (Fenske), `R_min` (Underwood), `R`, `N_theoretical` (Gilliland), `feed_stage` (Kirkbride, counted from the top, fractional), `alpha_LK_HK`, `theta`, `D`, `B`, `x_D_LK`, `x_B_HK`. Non-key distribution follows Fenske. Distillate and bottoms leave as saturated liquids at the feed bubble-point T. It publishes NO duties (no `Q_condenser_kW`); get them from the rigorous column.
Every alpha is taken at the feed bubble point (constant alpha). Recorded on each run as a declared approximation.

DOF: feed + P fixed; 2 recoveries + 1 reflux = fully specified.

Refusals you will meet:
- `ShortcutColumn: no operating reflux declared` — give `refluxFactor` or `refluxRatio` (ShortcutColumn.cpp:251).
- `operating reflux R = … <= R_min` — raise it (:263).
- `Underwood's equation does not change sign …` — a non-key component has alpha between the keys; FUG cannot do it; go to `simultaneous` (:205).
- `the FEED BUBBLE POINT did not converge` — feed T is the initial guess; check phase/pressure (:117).

## 3. distillationColumn  (alias `column`)

Ports: `in feed;` → `outputs ( distillate bottoms );`. Several feeds: `inputs ( f1 f2 );` (needs `model simultaneous|fullMESH`). Each side draw adds one output after `bottoms`, in the order of `sideDraws`.

```
type  distillationColumn;
model simultaneous;            // optional; right after `type`. Words: WangHenke (default) | simultaneous | fullMESH
operation
{
    nStages         22;        // EQUILIBRIUM stages incl. the reboiler; a TOTAL condenser is NOT counted
    feedStage       11;        // 1 = top tray. WangHenke: 1..nStages-1; simultaneous/fullMESH/recovery: 2..nStages
    refluxRatio     1.7;       // L/D, required
    distillateRate  50 kmol/h; // XOR  distillateRecovery { component benzene; fraction 0.99; }
    P               1.01325 bar;   // optional single-feed (default = feed P); REQUIRED with several feeds
    condenser       { type total; }   // total (default) | partial (condenser IS stage 1, distillate leaves as vapour)
    murphreeEfficiency 0.7;    // optional; WangHenke only; nStages then counts REAL trays
}
compositionTol 1e-7;           // unit-level keys, OUTSIDE operation (WangHenke): default 1e-6
maxOuterIter   600;            //   default 200
```
Stage numbering: stage 1 = top tray, stage `nStages` = reboiler. A source that counts its total condenser as stage 1 means `nStages` one LESS here. With `partial`, stage 1 is the condenser (feedStage ≥ 2).

Multi-feed / side draws (simultaneous or fullMESH only):
```
inputs  ( feed feed2 );
outputs ( distillate bottoms cut );
operation { nStages 15; refluxRatio 3.0; distillateRate 42 kmol/h; P 1.01325 bar;
    feeds     ( { stream feed; stage 5; }  { stream feed2; stage 11; } );
    sideDraws ( { stage 8; phase liquid; rate 15 kmol/h; } );   // phase liquid|vapour, default liquid; stage 2..nStages
}
```

Models: `WangHenke` = bubble-point sweep, cheap per pass, hundreds of passes (333 on the example below), can fail near azeotropes; `simultaneous` = Newton on the whole column, ~6 iterations, stable through azeotropes (use it for any non-ideal system); both assume constant molar overflow. `fullMESH` adds stage energy balances, so the traffic follows real latent heats; use it when CMO is doubtful (very different latent heats, big heat of mixing). Murphree and reactive columns are not available with fullMESH.

DOF: feed, P, nStages, feedStage fixed; `refluxRatio` + (`distillateRate` or `distillateRecovery`) = exactly specified. Both `distillateRate` and `distillateRecovery` → refused. `distillateRecovery` (single feed only) is the fraction of that component's feed flow reaching the distillate; the engine searches the rate. Use it inside recycles, where the feed moves.

Published (KPIs, kW): `Q_condenser_kW` (negative), `Q_reboiler_kW`, `D`, `B`, `T_top`, `T_bottom`, `L_rect`, `V_rect`, `L_strip`, `V_strip`, `x_D_LK`, `x_B_HK`, `iterations`, plus `profile` (T and x,y per stage). The reboiler duty is the remainder of the column's energy balance (not an independent check) — judge the condenser duty against `(R+1)·D·λ`.

Feed state: a stream is read for what it means (subcooled liquid q>1, two-phase q = 1−vf, vapour q<0); announced as `[column] … CMO q = …`. Never also write `feedQuality`; if you do and it disagrees with the stream it is refused.

Refusals you will meet:
- `feedStage (n) must lie in 1..N-1 (strictly above the bottom stage …)` (DistillationColumn.cpp:1383); simultaneous: stage 1 refused by name.
- `multiple feeds (inputs/feeds), side draws, or reactive distillation require model simultaneous;` (:1288).
- `a reaction with Sum nu != 0 ... changes the internal molar flows, which model simultaneous; holds constant` -- declare `model fullMESH;` (C231; the reactive full MESH carries the extents, the mole change and the heat of reaction on the elements datum). Specify it with `bottomsRate` + `boilupRatio` (partial condenser) or `refluxRatio` + `distillateRate`; a mixture of the two pairs and a reacting species with no `standardThermochemistry` each refuse by name. Witness `column19_mtbe_reactive_mesh`. A RATE-limited reaction is `kinetics { model expression; catalystMass <kg>; basis catalystMass; rateOf extent; parameters {..} rate "..."; }` (C233): the extent of each reactive stage is r(T, x, gamma) x catalyst mass, the law may read `a[<component>]` (gamma x; only the column offers it), no heat term; a value-less trial is an announced infeasible trial, a floor is written in the law. Witness `column20_mtbe_kinetic_mesh`; gate `check_kinetic_mesh`.
- `distillateRate AND distillateRecovery are BOTH declared` (:1961).
- `murphreeEfficiency is not implemented for method simultaneous` (:2235).
- unknown `model` word → lists the accepted words (:1261 region). Typos are refused, never defaulted.
- `Converged: NO` in the log at exit 2 (WangHenke hit `maxOuterIter`): raise `maxOuterIter`, or switch to `model simultaneous;`.

## 4. absorber / stripper  (Kremser, Henry's law)

```
{ name A1; type absorber;
  inputs  ( gasFeed  solvent );        // GAS first, then the lean solvent
  outputs ( cleanGas richLiquid );     // gas out first
  operation { stages 6; } }

{ name S1; type stripper;
  inputs  ( liquidFeed strippingGas ); // LIQUID first, then the gas
  outputs ( strippedLiquid richGas );
  operation { stages 6; } }
```
Only key: `stages` (theoretical stages). Recovery of each solute is a RESULT (`recovery_<comp>`, `A_<comp>`, `K_<comp>`, `T_top`, `T_bottom`); "how many stages for 95 %?" is a design-spec sweep on `stages`, not a unit mode. Pressure and gas T come from the gas (absorber) or liquid (stripper) inlet. Mass balance exact; energy: heat of absorption heats the liquid when Cp data exist (non-isothermal; recoveries fall for exothermic solutes, see `nonIsothermal` KPI).
Thermo it needs: a Henry package with a named solvent, each transferring solute carrying `role solute;` in its component record AND a Henry pair `<solute>-<solvent>`:
```
components ( NH3 N2 water );
equilibrium { formulation diluteSolution;
  liquid { solvent { component water; standardState pureLiquid; }
           solutes { components ( NH3 ); standardState infiniteDilution; solutionModel henryDilute;
                     binaryParameters { NH3-water { source "data/standards/parameters/Henry/NH3-water.dat"; } } } }
  vapour { fugacityModel idealGas; } }
```
Other gases (N2) are inert carriers that stay in the gas; the solvent never evaporates. Refused: a solute with no Henry pair, a vapour on the liquid port (or liquid on the gas port), a non-solute arriving in the liquid. Exactly two input streams.

Guidance: absorption factor `A = L/(K·V)`; want A ≈ 1.2–2 for the key solute (K = H/P). Lower T and higher P raise absorption. Stripping factor `S = K·V/L` the mirror.

## 5. extractor  (liquid-liquid, counter-current)

```
{ name X1; type extractor;
  inputs  ( feed solvent );          // feed enters stage 1, solvent stage N
  outputs ( extract raffinate );     // extract leaves stage 1, raffinate stage N
  operation { stages 5; solvent benzene; temperature 298.15 K; } }   // solvent, temperature optional
```
`solvent` (default: the dominant component of the solvent stream) tells which species defines the extract phase. `temperature` defaults to the feed T; the unit is isothermal (no energy balance), P is the feed's. Each stage is one LL Gibbs-minimisation flash. Results: `soluteRecovery`, `soluteDistribution`, `recovery_<comp>`, `distribution_<comp>`, `F_extract`, `F_raffinate`, `massClosure`. A stage that cannot split, or a cascade that does not converge, REFUSES (exit ≠ 0).
Thermo: `formulation gammaGamma;` with TWO named `liquidPhases` on one activity model (`UNIFAC` needs no pairs):
```
components ( water ethanol benzene );
equilibrium { formulation gammaGamma;
  liquidPhases ( { name raffinate; activityModel { model UNIFAC; } }
                 { name extract;   activityModel { model UNIFAC; } } ); }
```
Fewer than 2 liquid phases → refused. Choose solvent/feed ratio so the extraction factor `E = D·S/F` (D = distribution of the solute) is ≥ 1.5; the solvent must be nearly immiscible with the carrier or the two phases merge on stages.

## 6. Drums: isothermalFlash as separator or decanter

VL drum: `{ name D1; type isothermalFlash; in feed; outputs ( liquid vapour ); operation { T 330 K; P 2 bar; } }` — T and P each default to the feed's; `Q` is a RESULT (heat to hold T). Never also give a heat duty: put a `heater` before it.
Decanter (two liquids, no vapour): needs a `gammaGamma` package as in §5 (or a `liquid { activityModel … }` block plus two `liquidPhases`), then
```
{ name DEC; type isothermalFlash; in feed; outputs ( waterRich butanolRich );
  operation { T 320 K; P 1.013 bar; phaseSet LL; alphaRich water; betaRich nButanol; } }
```
`phaseSet`: `VL` (default) · `LL` · `VLLE` (outputs vapour, liquidAlpha, liquidBeta) · `auto`. `alphaRich`/`betaRich` decide which liquid goes to which port. LL uses `model gibbsMinimisation` (default for LL; `rachfordRice` with LL is refused: it collapses to K=1). If the feed does not split at (T, P) the second port carries F = 0 and the log says single phase; move T. LL and VLLE require both liquids on ONE activity model.

## 7. Design guidance (do this by hand BEFORE writing the case)

1. Set P from the condenser: distillate bubble point at P ≥ ~320 K lets cooling water (30 → 40 °C) work; if not, raise P (cheaper than refrigeration) until the REBOILER T stays below heating-medium limits (LP steam ~ 400 K, MP ~ 450 K) and below decomposition. Vacuum only for heat-sensitive or high-boiling feeds.
2. Keys: LK and HK are the adjacent components whose split you are specifying. Recoveries 0.99/0.01 are a normal start; ask for purities only after seeing what the recovery gives.
3. Fenske by hand: `N_min = ln[(xD,LK/xD,HK)(xB,HK/xB,LK)] / ln α`, α at the feed bubble point. Real N ≈ 2·N_min for R/R_min ≈ 1.3.
4. R/R_min 1.2–1.5 (economic optimum is flat); below 1.1 stages explode, above 2 energy is wasted. Never run R below R_min.
5. Feed stage ≈ Kirkbride's, rounded; an off-optimum feed stage costs purity, not feasibility.
6. FUG → rigorous: take `nStages = ceil(N_theoretical)`, `feedStage = round(feed_stage)`, `refluxRatio = R`, `distillateRate = recoveryLK·F·z_LK + recoveryHK·F·z_HK`. The rigorous purity differs slightly (FUG is approximate); iterate on `refluxRatio` or `nStages` until the specification is met.
7. Sanity: `Q_condenser ≈ (R+1)·D·λ`; distillate T ≈ pure-LK boiling point at P; bottoms T ≈ HK's. Check `massBalance` closes (it does; the energy plug in the reboiler is not a check).
8. Real trays: ideal stages / overall efficiency (50–80 %); or declare `murphreeEfficiency` (WangHenke) and `nStages` counts real trays.
9. To predict efficiency, pressure drop and flooding from the internals of a test column (binary, total reflux): `model totalReflux;` with `efficiency { model AIChE|ChanFair|SyedaChuang; }` on trays or `packing { model RochaBravoFair|Delft; }` for a packed bed -- `docs/ai/unit-ops.md`, witnesses `trayEfficiency01_yanagi14`, `packing03_schulz_delft_0p10bar`.

## 8. Example: benzene/toluene, shortcut then rigorous

Feed 100 kmol/h, 50/50, saturated liquid at 1 atm (bubble point 365.27 K, so 365 K liquid). Spec: 99 % of benzene to the top, 99 % of toluene to the bottom. Hand estimate: α ≈ 2.5, `N_min ≈ ln(99·99)/ln 2.5 ≈ 10`, N ≈ 20–22, `R_min ≈ 1.3`, D = 50 kmol/h, `Q_cond ≈ 2.7·50·30.5 MJ/kmol/3600 ≈ 1150 kW`.

Both cases share (case folders `btA` = shortcut, `btB` = rigorous):

`system/controlDict`
```
application   choupoSolve;
description   "Benzene/toluene column, designed shortcut-then-rigorous";
verbosity     3;
```
`constant/thermoPhysPropDict`
```
recordType    thermophysicalPropertySystem;
schemaVersion 2;
components    ( benzene  toluene );
equilibrium
{
    formulation gammaPhi;
    liquid { activityModel ideal; standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
```
`0/feed`
```
componentMolarFlows
{
    benzene  50 kmol/h;
    toluene  50 kmol/h;
}
T      365 K;
P      1.01325 bar;
phase  liquid;
```
`btA/system/flowsheetDict` (shortcut)
```
units
(
    {
        name     FUG;
        type     shortcutColumn;
        in       feed;
        outputs  ( distillate  bottoms );
        operation
        {
            lightKey      benzene;
            heavyKey      toluene;
            recoveryLK    0.99;
            recoveryHK    0.01;
            refluxFactor  1.3;
        }
    }
);
```
Result: `N_min` 10.07 · `R_min` 1.294 · `R` 1.682 · `N_theoretical` 21.59 · `feed_stage` 10.79 · α 2.49 · D = B = 50 kmol/h.

`btB/system/flowsheetDict` (rigorous, from the FUG numbers: N 22, feed 11, R 1.7, D 50)
```
units
(
    {
        name     column;
        type     distillationColumn;
        in       feed;
        outputs  ( distillate  bottoms );
        operation
        {
            nStages         22;
            feedStage       11;
            refluxRatio     1.7;
            distillateRate  50 kmol/h;
            P               1.01325 bar;
            condenser       { type total; }
        }
        maxOuterIter  600;
    }
);
```
Result (WangHenke, 333 passes, converged): benzene in distillate 0.99392, toluene in bottoms 0.99392 (FUG's 0.99 met with margin), `T_top` 353.57 K, `T_bottom` 383.49 K, `Q_condenser_kW` −1173.2, `Q_reboiler_kW` 1191.6, mass balance closes 100.000 %, element balance 0.0000 %. Adding `model simultaneous;` after `type` gives the same answer in 6 iterations; `model fullMESH;` gives 0.99117 purity and Q_cond −1173.9 kW (energy balance per stage).

<!-- RUN: in a scratch dir, CHOUPO_HOME=/home/vitor/Choupo; /home/vitor/Choupo/bin/choupo-init0 btA; /home/vitor/Choupo/choupoSolve btA (exit 0); same for btB (exit 0, "Converged: yes", massBalance closure 100.000 %); btC = btB + `model simultaneous;` and `model fullMESH;` (exit 0, 6 iterations each). Run 2026-11-01. -->

<!-- SOURCES (file:line, read 2026-11-01):
 shortcut keys lightKey/heavyKey/recoveryLK/HK ... src/unitOperations/distillation/ShortcutColumn.cpp:96-98
 refluxRatio / refluxFactor XOR, no default ...... ShortcutColumn.cpp:248-263
 runs at feed P, ports distillate/bottoms ......... ShortcutColumn.cpp:73-76,276-283
 KPIs (no duties) .................................. ShortcutColumn.cpp:305-316
 Underwood / bubble-point refusals ................. ShortcutColumn.cpp:117,205
 column model word + default WangHenke ............. DistillationColumn.cpp:1299-1300,2212-2213
 model refusal (accepted words) .................... DistillationColumn.cpp:1315-1320
 multiple feeds / sideDraws need simultaneous ...... DistillationColumn.cpp:1327
 nStages / feedStage / refluxRatio / distillateRate  DistillationColumn.cpp:1354-1359
 P default = feed P ................................ DistillationColumn.cpp:1338; multi-feed P required :2248
 feedStage range WH 1..N-1 ......................... DistillationColumn.cpp:1382-1385; sim 2..N :2374; recovery :1999
 maxOuterIter 200, compositionTol 1e-6 (unit level)  DistillationColumn.cpp:1445-1446
 murphreeEfficiency default 1, simultaneous refuses  DistillationColumn.cpp:1514,2235
 condenser { type total|partial } .................. DistillationColumn.cpp:136-160
 feeds {stream; stage; quality}, sideDraws {stage; rate; phase} ..  DistillationColumn.cpp:2378-2410,2416-2432
 distillateRecovery {component; fraction}, XOR rate  DistillationColumn.cpp:2002-2014,2085-2087
 KPIs Q_condenser_kW, Q_reboiler_kW, D, B, T_top ... DistillationColumn.cpp:1855-1929
 fullMESH aliases MESH/NaphtaliSandholm ............ DistillationColumn.cpp:1306-1308
 absorber ports (gas, solvent)->(cleanGas, richLiquid), key stages ... src/unitOperations/separation/Absorber.cpp:70-100,282-289
 absorber solute rule (role solute + Henry pair) ... Absorber.cpp:111-114
 stripper ports (liquid, gas)->(strippedLiquid, richGas) ... Stripper.cpp:70-100,271-276
 extractor inputs/outputs, stages, solvent, temperature ... Extractor.cpp:466,525-549,726-731; header Extractor.H
 extractor needs >=2 liquid phases ................. Extractor.cpp:537-540
 flash phaseSet VL|LL|VLLE|auto, alphaRich/betaRich, model words ... src/unitOperations/flash/IsothermalFlash.cpp:1947-1952,2031-2034,2129-2160
 decanter grammar example .......................... tutorials/steady/flash/vlle01_waterButanol (read for grammar only)
-->
