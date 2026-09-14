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
  | "equipment" | "sheets" | "utilities" | "mass" | "energy"
  | "columns" | "exchangers" | "economics";

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
  /** At least one tray column the sizing pass sized. */
  columns: boolean;
  /** At least one heat exchanger with a computed U. */
  exchangers: boolean;
  /** An economics postDict ran. */
  economics: boolean;
}

/** The sections, in page order.  ONE list: the rail lists it, the page
 *  renders it, and nothing else decides which reports exist. */
export function reportSections(f: ReportFacts): ReportSection[] {
  const out: ReportSection[] = [];
  if (f.equipment)
    out.push({ id: "equipment", title: "Equipment design",
      subtitle: "sized items by sector, with cost and share" });
  if (f.sheets)
    out.push({ id: "sheets", title: "Equipment sheets",
      subtitle: "every specification sheet the run wrote — sector, unit, item" });
  out.push({ id: "utilities", title: "Utilities",
    subtitle: "plant services sized by temperature level" });
  out.push({ id: "mass", title: "Global mass balance",
    subtitle: "plant boundary — feeds vs products (kg/h)" });
  out.push({ id: "energy", title: "Global energy balance",
    subtitle: "flow enthalpy at the boundary (kW)" });
  if (f.columns)
    out.push({ id: "columns", title: "Column datasheets",
      subtitle: "tray columns the sizing pass sized — the tower schematic + its five items" });
  if (f.exchangers)
    out.push({ id: "exchangers", title: "Equipment datasheets",
      subtitle: "rated / designed heat exchangers — the TEMA spec sheet + scheme" });
  if (f.economics)
    out.push({ id: "economics", title: "Economic appraisal (DCF, Perry/Turton)",
      subtitle: "capital, operating cost, cash flow and payback" });
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
