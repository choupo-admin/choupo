/*---------------------------------------------------------------------------*\
  Single source of truth: which unit-op types carry a duty / shaft work that the
  flowsheet draws as an ENERGY STREAM (a docked utility stub + a dashed wire).

  Imported by BOTH toGraph.ts (which synthesizes the stub node + the energy edge)
  AND UnitNode.tsx (which renders the handle the edge docks to).  They MUST agree
  — a type in one set but not the other yields a stub with no wire, or a handle
  with nothing attached.  Keeping the sets here makes that impossible.

  Heat is a STREAM, never a node label (docs/ai/energy.md; "information follows
  the streams").
\*---------------------------------------------------------------------------*/

// Intrinsic reboiler (heating, base) + condenser (cooling, top) duties.
export const COLUMN_TYPES = new Set(["distillationColumn", "shortcutColumn"]);

// A single intrinsic heat duty (kpi "Q_kW"): one docked duty stub, like the
// column's reboiler/condenser.  isothermalFlash carries the latent-heat duty at
// constant T when it vaporises part of the feed; a crystalliser removes the
// sensible + crystallisation heat (its cooling duty).
//
// THE REACTORS AND THE PHASE CHANGER JOINED IN C52 (DEV.md 4c, 2026-10-10).
// Each publishes a generic `Q_kW` the engine's utility allocation now serves
// (`reporting::unitHeatDuties`, the engine's ONE home of "this unit has a
// duty"); before C52 the allocation dropped the reactors' duties in silence,
// so a 30 MW converter drew no stub at all.  This set is only the PRE-RUN
// guess -- a type cannot say whether THIS reactor is adiabatic -- so once a
// run exists the stub follows the engine (case/dutyUtility.ts
// `dutyStubFromRun`): hidden when no allocation row exists for it, its sign
// read off the row.  NOT here, by rule: a coolingTower (its duty is carried
// between its own water and air), a tsaTwinBed (two ports, no stub drawn).
export const HEAT_DUTY_TYPES = new Set([
  "heater", "heatExchanger", "cooler", "isothermalFlash", "flash", "crystalliser",
  "phaseChanger",
  "gibbsReactor", "cstr", "conversionReactor", "equilibriumReactor", "pfr",
]);

// Of HEAT_DUTY_TYPES, the ones whose duty is COOLING by construction (stub docks
// above, cyan ❄; a missing dict Q is read as cooling, not heating).  Shared by
// toGraph.ts (tier guess) and UnitNode.tsx (handle side) so the two agree.
export const COOLING_DUTY_TYPES = new Set(["cooler", "crystalliser"]);

// Rotating equipment that crosses the boundary as ELECTRICITY: a ⚡ power stub.
export const POWER_DRAW_TYPES = new Set(["pump", "compressor"]);

// DYNAMIC continuous holdup units (choupoCtrl).  A dynamicCSTR declares its
// feed in an `inlet{}` block and its jacket in `operation{ UA, T_jacket }`
// instead of the steady `in`/`outputs` keys -- so readFlowsheet sees no
// streams and renders it as a LONE BOX.  toGraph SYNTHESISES a feed terminal,
// a product terminal (`<unit>.out`, matching the engine's stream key) and a
// jacket utility stub from those sub-dicts, so the dynamic unit becomes a
// proper flowsheet.  No new dict syntax -- it reads blocks already on disk.
//   The synthesis is gated on a unit being in THIS set AND carrying an
// `inlet{}` block AND declaring no explicit in/inputs/outputs (so an author
// who wires the unit up by hand keeps full control -- additive, never
// overriding).
export const DYNAMIC_HOLDUP_TYPES = new Set(["dynamicCSTR"]);

// Vapour/liquid SEPARATORS.  The engine fixes their output slots as
// (liquid, vapor) -- AdiabaticFlash.cpp / IsothermalFlash.cpp push liquid
// first, vapor second -- but the PFD convention draws a flash drum with the
// VAPOUR leaving the TOP and the LIQUID the BOTTOM.  So both the unit's
// output handles (UnitNode.tsx) AND the product terminals' vertical order
// (toGraph.ts) place these outputs in REVERSE slot order (last slot = top).
// Shared here so the two files agree -- a flash whose liquid handle is high
// but whose liquid terminal sits low would cross its own wires.
export const PHASE_SPLIT_TYPES = new Set(["isothermalFlash", "flash", "adiabaticFlash"]);
