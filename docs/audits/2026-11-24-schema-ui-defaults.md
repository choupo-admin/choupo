# Schema defaults printed as `ui=` -- what the engine does with each (C490, 2026-11-24)

`bin/regen-llm-docs` prints a schema `default` as `ui=x` unless the key's
description says the engine defaults it (docs/ai/registry-reference.md, legend).
`ui=x` means "the GUI editor starts at x".  This audit reads, for each of the
19 `ui=` key lines, the engine's own read of the key (file:line, tree at 084a130015
plus C490) and classifies it.  Nothing in `src/` was changed.

Classes: SAME = the engine has the same default; DIFFERENT = the engine has a
different default; REQUIRED = the engine reads the key with no default (or
needs it in the declared configuration); NO READ = the engine never reads the
key.

| unit | key | schema default | engine read | class |
|---|---|---|---|---|
| convectiveDryer | drivingForce | logMean | ConvectiveDryer.cpp:220 (`drivingForce = "logMean"`), :247-248 | SAME |
| cstr | V_R | 0.005 | CSTR.cpp:206 `lookupScalar("V_R")` | REQUIRED |
| pfr | V_R | 0.005 | PFR.cpp:1978 `lookupScalar("V_R")`; absent only when `tubes.length` declared (PFR.cpp:1962-1975), both declared is refused | REQUIRED (alternative: tubes) |
| distillationColumn | nStages | 20 | DistillationColumn.cpp:1409, :2167, :2425, :5018 `lookupScalar` | REQUIRED |
| distillationColumn | feedStage | 10 | :1410, :2168, :2588 `lookupScalar` (single-feed grammar; a `feeds` list carries its own stages); refused at total reflux (:5010) | REQUIRED (single feed) |
| distillationColumn | refluxRatio | 2.0 | :1413, :2477 `lookupScalar`; in the partial-condenser pair (`bottomsRate` + `boilupRatio`) it is not read (:2461-2470) | REQUIRED (or the boilup pair) |
| distillationColumn | distillateRate | 0.5 | :1414, :2478 `lookupScalar`; absent when `distillateRecovery` is declared (declaring both is refused, :2136) | REQUIRED (or distillateRecovery) |
| distillationColumn | boilupRatio | 5.0 | :2435, :2470 -- read only with `bottomsRate` on a partial condenser | REQUIRED in that pair, otherwise unread |
| distillationColumn | distillateRecovery.fraction | 0.99 | :2144 `lookupScalar("fraction")`, refused outside (0,1) | REQUIRED (inside the block) |
| distillationColumn | distillateRecovery.tolerance | 1e-06 | :2299 `lookupScalarOrDefault("tolerance", 1.0e-6)` | SAME |
| distillationColumn | distillateRecovery.maxIter | 40 | :2301 `lookupScalarOrDefault("maxIter", 40)` | SAME |
| distillationColumn | feedQuality | 1.0 | :1086-1091 -- a CROSS-CHECK only: absent, nothing is checked; the feed's thermal state comes from the stream (comment at :1416-1420 records that the old default of 1.0 was removed on 2026-09-12) | NO DEFAULT (the schema's 1.0 is never applied; present and disagreeing with the stream it refuses) |
| heater | Tref | 298.15 | Heater.cpp:58 `lookupScalarOrDefault("Tref", 298.15)` | SAME |
| sprayDryer | wheelSpeed | 10000 | atomizer/RotaryAtomizer.cpp:42 `lookupScalarInOrDefault("wheelSpeed", 10000.0, ...)` (rotary atomiser only) | SAME |
| sprayDryer | liquidViscosity | 0.001 | NOT read from `operation`: the feed viscosity is `liquidProperty::evaluate(... viscosity ...)` (SprayDryer.cpp:137); a package with no viscosity refuses and says `operation` carries no property (:143-148) | NO READ -- schema CONTRADICTS the engine |
| sprayDryer | surfaceTension | 0.072 | NOT read from `operation`: `liquidProperty::evaluate(... surfaceTension ...)` (SprayDryer.cpp:389) | NO READ -- schema CONTRADICTS the engine |
| sprayDryer | spreadParameter | 2.2 | SprayDryer.cpp:150 `lookupScalarOrDefault("spreadParameter", 2.2)` | SAME |
| sprayDryer | flow | co | SprayDryer.cpp:153 `lookupWordOrDefault("flow", "co")` | SAME |
| vaporPressureFit | objective.method | twoStage | propertyOps/FitObjective.cpp:111 `lookupWordOrDefault("method", "twoStage")` | SAME |


## Summary

- SAME as the engine: 8 (drivingForce, tolerance, maxIter, Tref, wheelSpeed,
  spreadParameter, flow, objective.method).
- DIFFERENT default: 0.
- REQUIRED, the schema default is only the GUI's starting value: 8 (cstr.V_R,
  pfr.V_R, nStages, feedStage, refluxRatio, distillateRate, boilupRatio,
  distillateRecovery.fraction).  The schema marks cstr.V_R and fraction required (pfr.V_R is not, because tubes.length can replace it)
  and the others carry no `required`, which is right because each is required
  only in one of the column's grammars (the pairs above).
- NO DEFAULT in the engine: feedQuality (cross-check only).
- NO READ, contradiction: sprayDryer.liquidViscosity and
  sprayDryer.surfaceTension.  Their descriptions said "used in the atomisation
  correlation", which is false (the property layer prices both).  The
  DESCRIPTION text of both was corrected in this slice to say so; the keys and
  their defaults were NOT removed (removing a key is a behaviour change of the
  schema's acceptance and belongs to a slice of its own: no shipped case sets
  either key, and the right fix is to delete both keys from the schema and let
  the additionalProperties refusal tell an author the truth).

## Finding 4 -- which unit reads which sub-model registry

Registered only, not fixed.  The registries of selectable sub-models (activity
models, correlations, atomisers, friction laws, cyclone models, partition
curves, mill laws, Gibbs methods...) are each named in `registry-reference.md`,
but NOTHING states which unit selects from which: neither the registry nor the
unit's schema says "`sprayDryer` reads `Atomizer`" -- the link exists only as
`X::New(` call sites in the C++ source.  A measurement of those call sites
(`grep -E 'Class::(New|create|make)\(' src`, 2026-11-24) gives, for the
unit-owned registries: Atomizer <- SprayDryer; BedDispersionCorrelation,
BedFilmCorrelation <- FixedBedAdsorber; BedWallHeatTransfer <- PFR;
CycloneModel <- Cyclone; GibbsMethod <- GibbsReactor; HeatTransferCorrelation
<- HeatExchanger, ShellTubeHX; PhaseChangeHTC <- PhaseChanger, ShellTubeHX;
FrictionFactorCorrelation <- Pipe, PipeHeaderSize; MassTransferModel,
OsmoticModel, PressureDropModel, TransportModel <- SpiralWoundModule (and
BatchDiafilter for transport/osmotic); PartitionCurve <- Classifier,
Hydrocyclone, Screen; SelectionFunction, BreakageFunction <- Mill;
ReactionRate <- BatchReactor, CSTR, PFR, DynamicCSTR, DistillationColumn;
ODEIntegrator <- BatchReactor, BatchAdsorber, FixedBedAdsorber.  The thermo
registries (ActivityModel, EquationOfState, LiquidViscosityModel, ...) are read
by ThermoPackage, not by units.  A generated "reads registries" column in
`registry-reference.md` could be produced by the same scan; it is not built
here and is queued as its own item.  Limits of this measurement: it finds
`::New(` call sites only, not units that reach a registry through a helper.
