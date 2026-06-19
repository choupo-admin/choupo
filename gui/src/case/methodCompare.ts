/*---------------------------------------------------------------------------*\
  methodCompare — multi-method comparison for the Property Explorer (step v).

  "See the spread": run the SAME scan through several models of one family
  (Antoine vs Ambrose-Walton for Psat; idealGas/SRK/PR for Z; Andrade vs Vogel
  for μ_liq; …) and overlay the curves.  Pure orchestration — zero physics: the
  caller synthesizes ONE explore case per model (each with a single family slot
  set) and runs them through the same WASM engine; this module just builds those
  per-model specs and merges/measures the resulting CSVs.
\*---------------------------------------------------------------------------*/

import type { ExploreSpec } from "./exploreSynth.js";

export type MethodFamily =
  | "vaporPressure" | "equationOfState" | "transportLiquidVisc" | "transportLiquidCond";

export interface FamilyDef { family: MethodFamily; models: string[]; }

/** The comparable model family for a scanned property (null = no comparison). */
export function familyForProperty(property: string): FamilyDef | null {
  if (property === "Psat")
    return { family: "vaporPressure", models: ["Antoine", "AmbroseWalton"] };
  if (["Z", "v_molar", "H_real", "S_real"].includes(property))
    return { family: "equationOfState", models: ["idealGas", "SRK", "PR"] };
  if (property === "viscosity_liquid")
    return { family: "transportLiquidVisc", models: ["Andrade", "Vogel"] };
  if (property === "thermal_conductivity_liquid")
    return { family: "transportLiquidCond", models: ["SatoRiedel", "Latini"] };
  return null;
}

/** A NEW spec with exactly ONE family slot set to `model` — everything else
 *  (components, axis, state) identical, so the comparison is apples-to-apples. */
export function specForModel(
  spec: ExploreSpec, family: MethodFamily, model: string, components: string[],
): ExploreSpec {
  switch (family) {
    case "equationOfState":
      return { ...spec, equationOfState: { model } };
    case "transportLiquidVisc":
      return { ...spec, transport: { ...(spec.transport ?? {}), liquidViscosity: model } };
    case "transportLiquidCond":
      return { ...spec, transport: { ...(spec.transport ?? {}), liquidConductivity: model } };
    case "vaporPressure": {
      // Antoine = the standard component's own vaporPressure block (keeps its
      // coefficients — overriding would drop them).  Any other model is a
      // case-local overlay that needs only Tc/Pc/ω (top-level, kept from the
      // standard), e.g. Ambrose-Walton corresponding states.
      if (model === "Antoine") return spec;
      const cf: Record<string, string> = { ...(spec.componentFiles ?? {}) };
      for (const c of components)
        cf[`constant/components/${c}.dat`] = `name ${c};\nvaporPressure { model ${model}; }\n`;
      return { ...spec, componentFiles: cf };
    }
  }
}

/** Merge per-model scan CSVs ("x,value") into one "x,<prop>__<m1>,…" CSV — one
 *  trace per model in the shared plot kit.  Each merged column header keeps the
 *  PROPERTY name (axis label, units, log-scale heuristic) and the MODEL name
 *  (the legend) joined by "__"; ScanLinePlot splits them apart.  Rows align by
 *  x VALUE (tolerant float match) over the union of every model's abscissa, so
 *  a model dropping a NaN row never silently shifts another model's curve; a
 *  model with no value at some x leaves a blank cell (renders as a gap). */
export function mergeMethodCsvs(results: { model: string; csv: string }[]): string {
  interface Pt { x: number; xs: string; v: string }
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const parsed = results
    .map((r) => {
      const lines = r.csv.trim().split(/\r?\n/);
      const prop = lines[0]?.split(",")[1]?.trim() || "value";
      const pts: Pt[] = [];
      for (let i = 1; i < lines.length; ++i) {
        const c = lines[i]!.split(",");
        if (c.length < 2) continue;
        const x = Number(c[0]);
        if (!Number.isFinite(x)) continue;
        pts.push({ x, xs: c[0]!.trim(), v: c[1]!.trim() });
      }
      return { model: r.model, prop, pts };
    })
    .filter((p) => p.pts.length > 0);
  if (parsed.length === 0) return "";
  const xHeader = results[0]!.csv.split(/\r?\n/)[0]?.split(",")[0]?.trim() || "x";
  const prop = parsed[0]!.prop;   // all models scan the SAME property
  // Shared abscissa = the tolerance-deduplicated union of every model's x.
  const grid: Pt[] = [];
  const allX = parsed
    .flatMap((p) => p.pts)
    .sort((a, b) => a.x - b.x);
  for (const q of allX)
    if (grid.length === 0 || !close(grid[grid.length - 1]!.x, q.x)) grid.push(q);
  const header = [xHeader, ...parsed.map((p) => `${prop}__${p.model}`)].join(",");
  const rows: string[] = [];
  for (const g of grid) {
    const cells = parsed.map((p) => p.pts.find((q) => close(q.x, g.x))?.v ?? "");
    rows.push([g.xs, ...cells].join(","));
  }
  return [header, ...rows].join("\n");
}

/** Max gap between the model curves over the shared abscissa — the "spread"
 *  the student reads (a re-presentation of plotted values, never new physics). */
export function methodSpread(merged: string): { absMax: number; relMaxPct: number } {
  const lines = merged.trim().split(/\r?\n/);
  let absMax = 0, relMax = 0;
  for (let r = 1; r < lines.length; ++r) {
    // Blank cells (a model with no value at this x) must NOT read as 0 —
    // Number("") === 0 would fake a huge spread.
    const vals = lines[r]!.split(",").slice(1)
      .map((c) => (c.trim() === "" ? NaN : Number(c)))
      .filter(Number.isFinite);
    if (vals.length < 2) continue;
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const gap = mx - mn;
    absMax = Math.max(absMax, gap);
    relMax = Math.max(relMax, (gap / Math.max(Math.abs(mn), Math.abs(mx), 1e-30)) * 100);
  }
  return { absMax, relMaxPct: relMax };
}
