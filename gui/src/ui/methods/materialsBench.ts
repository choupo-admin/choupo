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
  materialsBench -- the data half of the materials EduTool's bench (DEV.md
  4c C84).  The bench re-runs an EXISTING sized case in the browser with one
  vessel's `material` word changed, and shows what the ENGINE then publishes
  for that vessel: its wall thickness, its weight, its pressure and material
  factors and its bare-module cost.  Nothing on the bench is computed here.

  THE WITNESS IS ammoniaReactor03_equilibriumApproach, chosen by measurement:
  it sizes three vessels and nothing else (no compressor, no exchanger), so a
  run is short, and its three vessels span the cases a material choice has to
  answer -- a 220 bar catalyst vessel at 700 K, a 220 bar separator and a
  25 bar let-down drum.  No case was created for this page (DEV.md 4c, the
  standing rule of 2026-10-17).

  THE MATERIALS ARE READ, NOT TYPED.  The list the reader picks from is every
  record in data/standards/assets/ that declares `kind constructionMaterial`
  -- the same filter MaterialRegistry.cpp applies when the engine loads them
  -- so the day a record is added the bench offers it, and the numbers shown
  beside each material are the record's own declarations.

  WHY THE EDIT IS HERE AND NOT A methodRun OVERRIDE.  methodRun's word
  override matches `material <word>;` only at the start of a line, and this
  witness writes each vessel on one line (`{ unitName converter;  type
  vessel;  material SS316;`).  So the edit is this module's own, on the
  caseAssembly precedent: the entry is FOUND by its own `unitName <name>;`
  and the first `material` after it -- never by an occurrence index typed
  here, which would go quietly wrong the day an entry is added above it --
  and an entry with no material of its own refuses by name.
\*---------------------------------------------------------------------------*/

import { parse, toJson } from "../../dict/index.js";
import type { JsonValue } from "../../dict/json.js";
import type { EquipmentItem } from "../../adapters/SolverAdapter.js";
import { tutorialByName } from "../../cases/tutorials.js";

/** The witness, as `tutorialByName` keys it. */
export const MATERIALS_WITNESS = "plant/ammoniaReactor03_equilibriumApproach";
export const POST_DICT = "system/postDict";

/** The three vessels the witness sizes, with what its own files say about
 *  each.  The test holds `shipped` and `pressureDesign` to the postDict and
 *  the descriptions to the case's own header. */
export interface BenchVessel {
  unit: string;
  label: string;
  shipped: string;
  pressureDesign: number;   // [bar] as the postDict declares it
}
export const BENCH_VESSELS: readonly BenchVessel[] = [
  { unit: "separator", label: "high-pressure separator (220 bar design)",
    shipped: "SS316", pressureDesign: 220 },
  { unit: "converter", label: "catalyst vessel, 700 K (220 bar design)",
    shipped: "SS316", pressureDesign: 220 },
  { unit: "letdown", label: "let-down drum (25 bar design)",
    shipped: "carbonSteel", pressureDesign: 25 },
];

/** One construction-material record, as its file declares it.  A field the
 *  record does not declare is null, never a default: the engine's own
 *  defaults (MaterialRegistry.cpp) are the engine's business, and the page
 *  says "not declared" rather than printing a number nobody wrote. */
export interface MaterialRecord {
  name: string;
  density: number | null;          // kg/m3
  F_M: number | null;              // -
  sigma_y: number | null;          // MPa, used by the engine as the allowable stress
  maxT: number | null;             // K
  maxP: number | null;             // bar
  thermalConductivity: number | null;  // W/(m K)
}

const RAW = import.meta.glob("../../../../data/standards/assets/*.dat", {
  query: "?raw",
  import: "default",
  eager: true,
}) as { [path: string]: string };

const num = (v: JsonValue | undefined): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim().split(/\s+/)[0]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Every `kind constructionMaterial` record, sorted by name.  A file that
 *  does not parse is skipped here and counted by the test, which requires
 *  every asset file to parse. */
export function constructionMaterials(raw = RAW): MaterialRecord[] {
  const out: MaterialRecord[] = [];
  for (const [path, text] of Object.entries(raw)) {
    let j: { [k: string]: JsonValue };
    try { j = toJson(parse(text)) as { [k: string]: JsonValue }; }
    catch { continue; }
    if (j["kind"] !== "constructionMaterial") continue;
    const stem = path.split("/").pop()!.replace(/\.dat$/, "");
    out.push({
      name: typeof j["name"] === "string" ? j["name"] : stem,
      density: num(j["density"]), F_M: num(j["F_M"]),
      sigma_y: num(j["sigma_y"]), maxT: num(j["maxT"]), maxP: num(j["maxP"]),
      thermalConductivity: num(j["thermalConductivity"]),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The witness's postDict, as bundled. */
export function witnessPostDict(): string {
  const t = tutorialByName(MATERIALS_WITNESS)?.files.rawFiles?.[POST_DICT];
  if (t === undefined)
    throw new Error(`${MATERIALS_WITNESS}: no ${POST_DICT} in the bundle`);
  return t;
}

/** The postDict with `unit`'s material replaced by `material`.  The entry is
 *  found by its own `unitName <unit>;`; the word replaced is the first
 *  `material <word>;` after it, and it must come before the next entry's
 *  `unitName`.  Throws by name otherwise. */
export function withMaterial(text: string, unit: string, material: string): string {
  const head = new RegExp(`unitName[ \\t]+${unit}[ \\t]*;`).exec(text);
  if (!head) throw new Error(`postDict: no sizing entry for unit '${unit}'`);
  const from = head.index + head[0].length;
  const rest = text.slice(from);
  const m = /material[ \t]+([A-Za-z][A-Za-z0-9_.-]*)[ \t]*;/.exec(rest);
  const next = /unitName[ \t]+/.exec(rest);
  if (!m || (next && next.index < m.index))
    throw new Error(`postDict: the entry for '${unit}' declares no material of its own`);
  const at = from + m.index;
  return text.slice(0, at) + `material ${material};` + text.slice(at + m[0].length);
}

/** The shipped material of `unit`, read from the file. */
export function shippedMaterial(text: string, unit: string): string {
  const head = new RegExp(`unitName[ \\t]+${unit}[ \\t]*;`).exec(text);
  if (!head) throw new Error(`postDict: no sizing entry for unit '${unit}'`);
  const m = /material[ \t]+([A-Za-z][A-Za-z0-9_.-]*)[ \t]*;/
    .exec(text.slice(head.index + head[0].length));
  if (!m) throw new Error(`postDict: '${unit}' declares no material`);
  return m[1]!;
}

/** The witness's raw files with one vessel's material changed. */
export function benchFiles(unit: string, material: string): { [rel: string]: string } {
  const entry = tutorialByName(MATERIALS_WITNESS);
  if (!entry?.files.rawFiles)
    throw new Error(`${MATERIALS_WITNESS} is not in the bundled corpus`);
  const raw = { ...entry.files.rawFiles };
  raw[POST_DICT] = withMaterial(raw[POST_DICT]!, unit, material);
  return raw;
}

/** What the engine published for one vessel, read off the run's equipment
 *  list -- the numbers the bench table shows, and nothing derived from them. */
export interface VesselAnswer {
  material: string;
  t_wall_mm: number | null;
  weight_kg: number | null;
  D_m: number | null;
  F_M: number | null;
  F_P: number | null;
  purchased: number | null;
  bareModule: number | null;
  currency: string;
}

export function vesselAnswer(
  equipment: readonly EquipmentItem[] | undefined, unit: string,
): VesselAnswer | null {
  const it = equipment?.find((e) => e.unit === unit || e.item === unit);
  if (!it) return null;
  const v = (k: string): number | null =>
    Number.isFinite(it.values[k]) ? it.values[k]! : null;
  const f = (k: string): number | null => {
    const x = it.cost?.factors?.[k];
    return x !== undefined && Number.isFinite(x) ? x : null;
  };
  const t = v("t_wall");
  return {
    material: it.material,
    t_wall_mm: t === null ? null : t * 1000,
    weight_kg: v("weight"),
    D_m: v("D"),
    F_M: f("F_M"),
    F_P: f("F_P"),
    purchased: it.cost?.purchased ?? null,
    bareModule: it.cost?.bareModule ?? null,
    currency: it.cost?.currency ?? "",
  };
}

/** The lines of a run's log that the engine raised about `unit`'s sizing or
 *  costing, verbatim: its rating warning, a validity warning, a refusal. */
export function vesselLines(log: string | null, unit: string): string[] {
  if (!log) return [];
  const quoted = `'${unit}'`;
  return log.split("\n").map((l) => l.trim())
    .filter((l) => l.includes(quoted)
      && /\[(?:rating|validity|assumed|basis)\]|Vessel:|Turton costing/.test(l));
}
