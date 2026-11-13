/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  reportSections — WHICH REPORTS EXIST for this run, decided once.

  Reports had six stacked subjects and no map.  Adding a rail that lists them
  is easy; adding one that lists the RIGHT ones is the point, and "which
  sections exist" must have one home or the rail and the page will disagree
  the first time a gate moves.  So the workspace computes its gating facts
  ONCE, hands them here, and both the rail and the render iterate the list
  this returns.  A section that is not in the list is not drawn and not
  listed; a section that is in the list is both.

  THE UNCONDITIONAL THREE -- utilities, the global mass balance, the global
  energy balance -- are always present on a converged run.  The others are
  EARNED: a case with no `sizing {}` block earns no equipment section, and
  listing it anyway would put the apology back that ReportsWorkspace removed
  on 2026-09-04 (224 of the 233 steady tutorials opened Reports on one).

  Also here: the `design/` sheet keys as a tree wants them -- the engine's
  own paths with the view name stripped, sector / unit / item, and a map back
  to the file so a click can open the sheet.  The engine decides the
  hierarchy (it stamps the sector at the flatten seam); the GUI draws it.
\*---------------------------------------------------------------------------*/

export type ReportSectionId =
  | "equipment" | "sheets" | "utilities" | "mass" | "energy" | "liquidProperties"
  | "layout" | "trains" | "pfd" | "columns" | "exchangers" | "economics" | "sensitivity" | "batchPlan";

export interface ReportSection {
  id: ReportSectionId;
  title: string;
  subtitle: string;
}

/** The facts that gate the earned sections, computed once by the workspace. */
export interface ReportFacts {
  /** The sizing pass produced at least one costed item. */
  equipment: boolean;
  /** The run wrote at least one `design/` specification sheet. */
  sheets: boolean;
  /** The case declared a plant layout and the engine published it. */
  layout: boolean;
  /** The run wrote at least one `membraneBank` specification sheet (DEV.md 4c
   *  C199 phase B): a hall of pressure-vessel racks to draw. */
  trains: boolean;
  /** At least one tray column the sizing pass sized. */
  columns: boolean;
  /** At least one heat exchanger with a computed U. */
  exchangers: boolean;
  /** An economics postDict ran. */
  economics: boolean;
  /** The economics pass published a sensitivity (the case declared
   *  `economics { sensitivity { ... } }`) with at least one drawable row. */
  sensitivity: boolean;
  /** A `batchPlan {}` pass ran and published at least one stage (DEV.md 4c
   *  C99, C110 G2): the batch plant designed on the steady balance. */
  batchPlan: boolean;
  /** The run published streams and the case has a flowsheet: the PFD sheet
   *  (case/pfdSheet.ts) can be drawn.  OPTIONAL so a caller that predates S2
   *  keeps its section list. */
  pfd?: boolean;
  /** The run carries the engine's propertySources block with at least one
   *  row: where each unit took its liquid properties from.  OPTIONAL, so a
   *  caller that predates it keeps its section list. */
  propertySources?: boolean;
}

/** The sections, in page order.  ONE list: the rail lists it, the page
 *  renders it, and nothing else decides which reports exist. */
export function reportSections(f: ReportFacts): ReportSection[] {
  const out: ReportSection[] = [];
  //  First: the plan is declared ABOVE sizing and costing in the postDict and
  //  feeds both (`volume fromBatchPlan`, `streamFactor fromBatchPlan`).
  if (f.batchPlan)
    out.push({ id: "batchPlan", title: "Batch plan",
      subtitle: "stages, trains, cycle times and the Gantt chart of the campaigns" });
  if (f.equipment)
    out.push({ id: "equipment", title: "Equipment design",
      subtitle: "sized items by sector, with cost and share" });
  if (f.sheets)
    out.push({ id: "sheets", title: "Equipment sheets",
      subtitle: "every specification sheet the run wrote — sector, unit, item" });
  if (f.layout)
    out.push({ id: "layout", title: "Plant layout (3D)",
      subtitle: "the plot plan the case declared, as the engine checked it" });
  if (f.trains)
    out.push({ id: "trains", title: "Trains and racks",
      subtitle: "one train, the plan of the hall, a section and the elevation of a rack" });
  out.push({ id: "utilities", title: "Utilities",
    subtitle: "plant services sized by temperature level" });
  out.push({ id: "mass", title: "Global mass balance",
    subtitle: "plant boundary — feeds vs products (kg/h)" });
  out.push({ id: "energy", title: "Global energy balance",
    subtitle: "flow enthalpy at the boundary (kW)" });
  if (f.propertySources)
    out.push({ id: "liquidProperties", title: "Liquid properties used",
      subtitle: "which liquid density, viscosity and surface tension each unit took, and from where" });
  if (f.pfd)
    out.push({ id: "pfd", title: "PFD (PDF)",
      subtitle: "the process flow diagram with its stream table, tags, utilities and title block — print to PDF" });
  if (f.columns)
    out.push({ id: "columns", title: "Column datasheets",
      subtitle: "tray columns the sizing pass sized — the tower schematic + its five items" });
  if (f.exchangers)
    out.push({ id: "exchangers", title: "Equipment datasheets",
      subtitle: "rated / designed heat exchangers — the TEMA spec sheet + scheme" });
  if (f.economics)
    out.push({ id: "economics", title: "Economic appraisal (DCF, Perry/Turton)",
      subtitle: "capital, operating cost, cash flow and payback" });
  if (f.sensitivity)
    out.push({ id: "sensitivity", title: "Economic sensitivity (tornado)",
      subtitle: "NPV with each declared input moved alone to its two ends" });
  return out;
}

/** The DOM id a section renders under, so the rail can scroll to it.  One
 *  function, used by both sides, or the two spellings drift. */
export const sectionDomId = (id: ReportSectionId): string => `report-${id}`;

/** The engine's `design/` paths as a tree wants them: the view name
 *  stripped, everything else exactly as the engine wrote it.  Returns the
 *  tree files and a map from each back to its full key. */
export function designSheetTree(
  designFiles: { [relPath: string]: string } | undefined,
): { files: string[]; keyOf: Map<string, string> } {
  const files: string[] = [];
  const keyOf = new Map<string, string>();
  for (const key of Object.keys(designFiles ?? {}).sort()) {
    if (!key.startsWith("design/")) continue;
    const rel = key.slice("design/".length);
    if (!rel) continue;
    files.push(rel);
    keyOf.set(rel, key);
  }
  return { files, keyOf };
}
