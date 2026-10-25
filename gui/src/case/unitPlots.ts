/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * unitPlots -- the Plots navigator's UNITS tree (DEV.md 4c C156): which units
 * the run carries, which sector owns each, and which plots the run published
 * FOR each unit.  A pure function of what the result says, so the rule has
 * one home and a test, and the workspace only draws it.
 *
 * WHAT A UNIT HAS, READ FROM THE RESULT AND NEVER FROM ITS TYPE:
 *   - `profile`     -- an entry of `result.profiles` whose `unit` is this
 *                      unit (the engine's `profiles` block, keyed by unit);
 *   - `convergence` -- an entry of `result.convergence` whose `label` is
 *                      this unit (the engine's `convergence` block is keyed
 *                      by the unit name, `Flowsheet.cpp` `unitResiduals`;
 *                      its GLOBAL rows -- "Mass balance (global)" -- name no
 *                      unit and are matched by nothing here).
 * A unit with neither is still listed, with an empty list: "nothing
 * published" is a fact about this run, worth showing.
 *
 * WHAT IS DELIBERATELY NOT HERE, stated so no reader infers it:
 *   - the T-x-y envelope.  `choupoSolve` computes it ONCE for the case's
 *     binary at the first stream's pressure (`main.cpp`, `binaryTxy`); the
 *     result attributes it to no unit, so filing it under a column would be a
 *     claim the engine never made.
 *   - a unit's port streams.  The result's streams carry no producer or
 *     consumer, and the Plots page has no stream view to open.
 *
 * WHICH UNITS ARE LISTED, AND WHERE:
 *   - a unit the engine STAMPED with a sector (`unitSectors`) goes under that
 *     sector's heading, in the engine's order -- grouped by the stamp, never
 *     by splitting the qualified name (the F2 name-identity ban);
 *   - a unit the engine did NOT stamp is a member of the plant itself and is
 *     listed directly, under no heading: the units of a FLAT case, and the
 *     plant-level folder units of a sectored one (measured on
 *     greenAmmonia03_basicDesign: `unitSectors` stamps the five CONVERTER
 *     units and none of the sixteen plant-level ones, FEHE's profile among
 *     them).  No invented "root" sector;
 *   - the order is the plant's DECLARED order (`units` / `sectors` of the
 *     case's flowsheetDict), a sector appearing where it is declared;
 *   - an unstamped name is listed only where the result CARRIES it: every
 *     unit the steady and dynamic drivers solve gets a `kpis` entry, empty or
 *     not (`Flowsheet.cpp` `unitKpis[uname] = unit->kpis()`), while the
 *     passes' own KPI blocks (`economics`, `pinch`, `sweep`, ...) name no
 *     declared member and so are never mistaken for a unit.
 */

export type UnitPlotKey = "profile" | "convergence";

export interface UnitPlotLeaf {
  key: UnitPlotKey;
  label: string;
}

export interface UnitNode {
  /** The unit's identity: the qualified (flattened) name the result keys by. */
  unit: string;
  /** What the row shows: the leaf name under its sector heading, the whole
   *  name for a unit of the plant itself. */
  label: string;
  /** The plots the run published for this unit, in a fixed order.  Empty =
   *  drawn greyed, "nothing published". */
  plots: UnitPlotLeaf[];
}

export interface UnitSectorGroup {
  sector: string;
  units: UnitNode[];
}

/** One row of the tree's top level: a unit of the plant itself, or a sector
 *  heading with its stamped units. */
export type UnitTreeEntry =
  | { kind: "unit"; node: UnitNode }
  | { kind: "sector"; group: UnitSectorGroup };

export interface UnitPlotInput {
  unitSectors?: { [unit: string]: string };
  kpis?: { [unit: string]: unknown };
  profiles?: ReadonlyArray<{ unit: string }>;
  convergence?: ReadonlyArray<{ label: string }>;
  /** The case's declared top-level members, in declared order. */
  declaredMembers?: ReadonlyArray<string>;
}

export const UNIT_PLOT_LABEL: Record<UnitPlotKey, string> = {
  profile: "Profile",
  convergence: "Convergence",
};

export function unitPlotTree(input: UnitPlotInput): UnitTreeEntry[] {
  const profiled = new Set((input.profiles ?? []).map((p) => p.unit));
  const traced = new Set((input.convergence ?? []).map((c) => c.label));
  const plotsOf = (unit: string): UnitPlotLeaf[] => {
    const out: UnitPlotLeaf[] = [];
    if (profiled.has(unit)) out.push({ key: "profile", label: UNIT_PLOT_LABEL.profile });
    if (traced.has(unit)) out.push({ key: "convergence", label: UNIT_PLOT_LABEL.convergence });
    return out;
  };

  const stamped = input.unitSectors ?? {};
  const bySector = new Map<string, UnitNode[]>();
  for (const [unit, sector] of Object.entries(stamped)) {
    if (!bySector.has(sector)) bySector.set(sector, []);
    //  The LABEL drops the stamped sector's own prefix because the heading
    //  already carries it; everything the row DOES uses the qualified name.
    const label = unit.startsWith(sector + ".") ? unit.slice(sector.length + 1) : unit;
    bySector.get(sector)!.push({ unit, label, plots: plotsOf(unit) });
  }

  const carried = input.kpis ?? {};
  const out: UnitTreeEntry[] = [];
  const placed = new Set<string>();
  for (const name of input.declaredMembers ?? []) {
    if (placed.has(name)) continue;
    if (bySector.has(name)) {
      placed.add(name);
      out.push({ kind: "sector", group: { sector: name, units: bySector.get(name)! } });
    } else if (Object.prototype.hasOwnProperty.call(carried, name)
               && !Object.prototype.hasOwnProperty.call(stamped, name)) {
      placed.add(name);
      out.push({ kind: "unit", node: { unit: name, label: name, plots: plotsOf(name) } });
    }
  }
  //  A stamped sector the top-level declaration does not name (a deeper
  //  nesting) still gets its heading, after the declared ones.
  for (const [sector, units] of bySector)
    if (!placed.has(sector)) out.push({ kind: "sector", group: { sector, units } });
  return out;
}

/** The declared top-level MEMBERS of a case's flowsheetDict, in order:
 *  inline unit blocks (`{ name X; type T; ... }`), folder units (a bare word
 *  in `units ( ... )`) and sectors (`sectors ( ... )`) alike. */
export function declaredMemberNames(flowsheet: Record<string, unknown> | undefined): string[] {
  const out: string[] = [];
  for (const key of ["units", "sectors"]) {
    const list = flowsheet?.[key];
    if (!Array.isArray(list)) continue;
    for (const u of list) {
      if (typeof u === "string") out.push(u);
      else if (u && typeof u === "object" && typeof (u as Record<string, unknown>)["name"] === "string")
        out.push((u as Record<string, unknown>)["name"] as string);
    }
  }
  return out;
}

/** What selecting a leaf (or a unit row) does: the plot kind to show and the
 *  unit it is focused on.  A unit row opens its FIRST published plot; a unit
 *  with nothing published selects nothing. */
export function unitSelection(
  node: UnitNode, key?: UnitPlotKey,
): { view: UnitPlotKey; unit: string } | null {
  const leaf = key ? node.plots.find((p) => p.key === key) : node.plots[0];
  return leaf ? { view: leaf.key, unit: node.unit } : null;
}
