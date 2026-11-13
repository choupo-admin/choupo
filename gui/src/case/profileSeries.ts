/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * profileSeries -- how the Profile plot groups a unit's published series, and
 * which groups and traces it opens with.  A pure function of the profile the
 * engine published, so the rule has one home and a test.
 *
 * THE TASK OF THE SCREEN (a column): "how do temperature and the liquid
 * composition change from top to bottom, and where does the reaction happen?"
 * A unit's profile is a flat map name -> numbers; the engine publishes NO unit
 * and NO kind per series (the names carry them: `x_<comp>`, `y_<comp>`,
 * `gamma_<comp>`, `lnKa`, `extent_kmol_h`, ...).  The grouping below reads the
 * prefix the engine itself writes.  It is a guess made on the engine's naming,
 * stated as such; the engine should publish the kind and the unit per series
 * (then this table is replaced by a read).
 *
 * THE RULES.
 *   - A series never shares an axis with a series of another KIND: every group
 *     is its own panel on the shared x axis.
 *   - A STAGED column (a profile that carries both liquid `x_` and vapour `y_`
 *     fractions) opens on temperature, the liquid fractions and -- when the
 *     column reacts -- the reaction extent.  Vapour fractions, activity
 *     coefficients, activities, ln K_a, the rate and the rest are one chip
 *     away, never removed.  Any other profile opens with every group on.
 *   - Inside the liquid group a component that never exceeds LIQUID_SHARE_MIN
 *     anywhere in the column opens off in the legend (one click brings it
 *     back).
 */

export type ProfileGroupId =
  | "temperature" | "liquid" | "vapour" | "massFraction" | "molarFlow"
  | "conversion" | "efficiency" | "molality"
  | "activityCoefficient" | "activity" | "lnKa" | "extent" | "rate"
  | `other:${string}`;

export interface ProfileGroup {
  id: ProfileGroupId;
  /** The axis title: true for what is drawn, unit included where the NAME
   *  carries it. */
  title: string;
  /** The words on the chip (no unit). */
  chip: string;
  /** The engine's column names, in the engine's order. */
  keys: string[];
  /** bars for the reaction extent (a per-stage quantity), lines otherwise. */
  kind: "line" | "bar";
  /** Fixed y range, or none. */
  range?: [number, number];
  /** Relative height of the panel. */
  weight: number;
  defaultOn: boolean;
  /** The text of a series in the legend (the engine's name without the
   *  group's prefix); the hover keeps the engine's name. */
  label: (key: string) => string;
}

/** A liquid component below this share everywhere opens off in the legend. */
export const LIQUID_SHARE_MIN = 0.02;

const strip = (p: string) => (k: string) => (k.startsWith(p) ? k.slice(p.length) : k);
const same = (k: string) => k;

interface Rule {
  id: ProfileGroupId;
  title: string;
  chip: string;
  kind?: "line" | "bar";
  range?: [number, number];
  weight: number;
  match: (k: string) => boolean;
  label?: (k: string) => string;
}

//  Order = the order of the panels from the top.
const RULES: Rule[] = [
  { id: "temperature", title: "Temperature T (K)", chip: "Temperature", weight: 0.8,
    match: (k) => k === "T" || k === "T_K" },
  { id: "liquid", title: "Liquid mole fraction x (-)", chip: "Liquid x", weight: 1.3,
    match: (k) => k.startsWith("x_"), label: strip("x_") },
  { id: "vapour", title: "Vapour mole fraction y (-)", chip: "Vapour y", weight: 1.0,
    match: (k) => k.startsWith("y_"), label: strip("y_") },
  { id: "massFraction", title: "Mass fraction (-)", chip: "Mass fraction", weight: 1.0,
    match: (k) => k.startsWith("massFrac"), label: same },
  { id: "molarFlow", title: "Molar flow (mol/s)", chip: "Molar flow", weight: 1.0,
    match: (k) => k.startsWith("F_"), label: strip("F_") },
  { id: "conversion", title: "Conversion X (-)", chip: "Conversion", weight: 0.8,
    range: [0, 1], match: (k) => k === "X" },
  { id: "efficiency", title: "Grade efficiency (-)", chip: "Grade efficiency", weight: 0.8,
    range: [0, 1], match: (k) => k === "grade_efficiency" },
  { id: "molality", title: "Molality m (mol/kg)", chip: "Molality", weight: 1.0,
    match: (k) => k.startsWith("m_"), label: strip("m_") },
  { id: "activityCoefficient", title: "Activity coefficient gamma (-)", chip: "Activity coefficients",
    weight: 1.0, match: (k) => k.startsWith("gamma_"), label: strip("gamma_") },
  { id: "activity", title: "Activity a = gamma x (-)", chip: "Activities", weight: 1.0,
    match: (k) => k.startsWith("a_"), label: strip("a_") },
  { id: "lnKa", title: "ln K_a (-)", chip: "ln K_a", weight: 0.8, match: (k) => k === "lnKa" },
  { id: "extent", title: "Reaction extent (kmol/h)", chip: "Reaction extent", kind: "bar",
    weight: 0.9, match: (k) => k === "extent_kmol_h" },
  { id: "rate", title: "Reaction rate r (mol/(g_cat s))", chip: "Reaction rate", weight: 0.8,
    match: (k) => k === "r_mol_gcat_s" },
];

/** Every series of the profile, grouped by the kind its name says it is.  The
 *  x axis column is not a series.  A name no rule knows is its own group (a
 *  series is never put on an axis with a quantity it was not declared to share
 *  one with), titled by its own name. */
export function groupProfileSeries(
  columns: { [name: string]: number[] }, xAxis: string,
): ProfileGroup[] {
  const keys = Object.keys(columns).filter((k) => k !== xAxis);
  const used = new Set<string>();
  const out: ProfileGroup[] = [];
  for (const r of RULES) {
    const ks = keys.filter((k) => r.match(k));
    if (ks.length === 0) continue;
    ks.forEach((k) => used.add(k));
    out.push({
      id: r.id, title: r.title, chip: r.chip, keys: ks, kind: r.kind ?? "line",
      ...(r.range ? { range: r.range } : {}), weight: r.weight, defaultOn: true,
      label: r.label ?? same,
    });
  }
  for (const k of keys) {
    if (used.has(k)) continue;
    out.push({
      id: `other:${k}`, title: k, chip: k, keys: [k], kind: "line", weight: 0.8,
      defaultOn: true, label: same,
    });
  }
  //  A STAGED column opens on what its reader asked for.
  const staged = out.some((g) => g.id === "liquid") && out.some((g) => g.id === "vapour");
  if (staged) {
    for (const g of out)
      g.defaultOn = g.id === "temperature" || g.id === "liquid" || g.id === "extent";
  }
  return out;
}

/** The series of a group that open drawn.  In the liquid group a component
 *  that stays under LIQUID_SHARE_MIN everywhere opens off; the others are all
 *  drawn.  Returns the set of engine column names. */
export function initiallyDrawn(
  group: ProfileGroup, columns: { [name: string]: number[] },
): Set<string> {
  if (group.id !== "liquid") return new Set(group.keys);
  const big = group.keys.filter(
    (k) => Math.max(...(columns[k] ?? [0]).map((v) => (Number.isFinite(v) ? v : 0))) > LIQUID_SHARE_MIN,
  );
  //  A column whose every component is small must still draw something.
  return new Set(big.length > 0 ? big : group.keys);
}

/** Panel domains from the top (paper coordinates, 1 = top), one per drawn
 *  group, proportional to the weights, with a gap between panels. */
export function panelDomains(weights: number[], gap = 0.05): Array<[number, number]> {
  const n = weights.length;
  if (n === 0) return [];
  const total = weights.reduce((a, b) => a + b, 0);
  const usable = 1 - gap * (n - 1);
  const out: Array<[number, number]> = [];
  let top = 1;
  for (const w of weights) {
    const h = (w / total) * usable;
    out.push([Math.max(0, top - h), top]);
    top -= h + gap;
  }
  return out;
}
