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
export const HEAT_DUTY_TYPES = new Set([
  "heater", "heatExchanger", "cooler", "isothermalFlash", "flash", "crystalliser",
]);

// Of HEAT_DUTY_TYPES, the ones whose duty is COOLING by construction (stub docks
// above, cyan ❄; a missing dict Q is read as cooling, not heating).  Shared by
// toGraph.ts (tier guess) and UnitNode.tsx (handle side) so the two agree.
export const COOLING_DUTY_TYPES = new Set(["cooler", "crystalliser"]);

// Rotating equipment that crosses the boundary as ELECTRICITY: a ⚡ power stub.
export const POWER_DRAW_TYPES = new Set(["pump", "compressor"]);

// Vapour/liquid SEPARATORS.  The engine fixes their output slots as
// (liquid, vapor) -- AdiabaticFlash.cpp / IsothermalFlash.cpp push liquid
// first, vapor second -- but the PFD convention draws a flash drum with the
// VAPOUR leaving the TOP and the LIQUID the BOTTOM.  So both the unit's
// output handles (UnitNode.tsx) AND the product terminals' vertical order
// (toGraph.ts) place these outputs in REVERSE slot order (last slot = top).
// Shared here so the two files agree -- a flash whose liquid handle is high
// but whose liquid terminal sits low would cross its own wires.
export const PHASE_SPLIT_TYPES = new Set(["isothermalFlash", "flash", "adiabaticFlash"]);
