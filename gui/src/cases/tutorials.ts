/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  Bundle every tutorial under Choupo/tutorials/<category>/<name>/ at
  build time so the GUI can switch between them without a backend.
  Vite's import.meta.glob inlines the dict files as raw strings.

  Tutorial layout:
      tutorials/
        steady/   <name>/system/...   <name>/constant/...   -> choupoSolve
        batch/    <name>/...                                 -> choupoBatch
        ctrl/     <name>/...                                 -> choupoCtrl
        props/    <name>/...                                 -> choupoProps

  All four binaries are built as WASM (see make/wasm.mk) and runnable
  in the browser.
\*---------------------------------------------------------------------------*/

import { parse, toJson } from "../dict/index.js";
import type { CaseFiles } from "../case/types.js";

// Raw dict text bundled at build time.  Keys look like
//   "../../../tutorials/steady/process01_reactor_flash/system/controlDict"
//
// The `**` patterns capture nested case-local artefacts under
// `constant/<sub>/<file>` (e.g. user-defined components at
// constant/components/<name>.dat introduced ).  Files at
// the top level of system/ or constant/ also match.
// Bundle the INPUT files under each case.  Fractal cases nest
// their sectors / units in subfolders (`<sector>/system/...`,
// `<sector>/<unit>/system/...`), so we can no longer restrict the glob to
// system/ + constant/ at the case root --- we grab the whole tree.  But we
// EXCLUDE generated run output at the glob level (negative patterns), not
// just in `ingest`: an eager glob inlines every match as a raw string, so
// leaving logs / reports / per-case binaries in would bloat the bundle and
// (worse) bake stale content into it --- e.g. an old `log.*` carrying the
// project's former name and absolute paths.  Inputs only.
const CASE_FILES = import.meta.glob(
  [
    "../../../tutorials/*/*/**/*",
    "!../../../tutorials/**/reports/**",
    "!../../../tutorials/**/.build/**",
    "!../../../tutorials/**/log.*",
    "!../../../tutorials/**/trajectory.csv",
    // Golden-master KPI files (bin/runTests --record): regression fodder,
    // never a case input the solver reads -- keep them out of the bundle.
    "!../../../tutorials/**/expected",
    // Agent-teaching artefacts: an in-GUI / local console may scaffold these
    // into a case (born-taught), but they are NOT case inputs the solver reads,
    // and ai/choupo-authoring.md is ~113 KB -- inlining one per tutorial would
    // bloat the bundle by megabytes.  Exclude them outright.
    "!../../../tutorials/**/ai/**",
    "!../../../tutorials/**/.claude/**",
    "!../../../tutorials/**/AGENTS.md",
    "!../../../tutorials/**/CLAUDE.md",
    // Archived tutorials (pre-2026-05-27 reorganisation): kept as
    // regression fodder for bin/runTests, hidden from the GUI to keep
    // the menu aligned with the new comparison-first philosophy.
    "!../../../tutorials/props/old/**",
  ],
  { query: "?raw", import: "default", eager: true },
) as { [path: string]: string };

// Tutorials whose setup leans on sub-directories under constant/ that
// the current browser-side adapter does not propagate into MEMFS.
// Listed by full identifier "category/shortName".
const UNSUPPORTED_PATHS_IN_BROWSER: ReadonlySet<string> = new Set([
  // fitNRTL01 stays: its outerDict fitBinaryPair requires INLINE pairs (known
  // limitation #4) and it ships constant/experiments/ -- a genuine browser gap.
  // process04 was removed (2026-06-03): its only special file is a nested
  // constant/binaryPairs/NRTL/ethanol-water.dat, which the worker mkdir-p's into
  // MEMFS via extraFiles -- the "subdirectories not bundled" reason is stale.
  // (Key carries the sub-class folder since the 2026-06-03 reorganisation.)
  "steady/optimisation/fitNRTL01_ethanol_water",
]);

export type Category = "steady" | "batch" | "ctrl" | "props" | "plant" | "electrochem";

export interface TutorialEntry {
  /** Full identifier including category, e.g. "steady/flash01_benzene_toluene". */
  name: string;
  /** Just the leaf name, e.g. "flash01_benzene_toluene". */
  shortName: string;
  /** The tutorial's category folder. */
  category: Category;
  /** Pedagogical sub-class WITHIN the category (e.g. "Membranes (NF/RO)"),
   *  derived from the leaf name -- a GUI-only grouping, NOT a folder on disk
   *  (the identifier stays `<category>/<shortName>`).  "" if the category is
   *  not sub-classed (ctrl / plant: too few to bother). */
  subclass: string;
  /** One-line description extracted from controlDict.description (may be empty). */
  description: string;
  files: CaseFiles;
  /** If set, the WASM solver cannot run this --- greys it out. */
  unsupportedReason?: string;
}

// Sub-node index (fractal): every node WITH a `.cho` below the case
// root (a sector or unit) becomes a CASE in its own right --- re-rooted, with
// thermoPackage/controlDict inherited from the nearest ancestor (the cascade).
// Keyed by full path "plant/ChemicalPlantTutorial/CONCENTRATION".  Not shown
// in the File->Open list (would clutter it); reachable via tutorialByName so a
// "?case=<sub-node>" URL (opened by clicking a sector) loads it.
const SUBNODES: { [name: string]: TutorialEntry } = {};

export const TUTORIALS: TutorialEntry[] = buildIndex();

/** Tutorials grouped by category, in the order they should appear. */
export const TUTORIALS_BY_CATEGORY: {
  category: Category;
  label: string;
  entries: TutorialEntry[];
}[] = [
  { category: "steady", label: "Steady-state  (choupoSolve)", entries: [] },
  { category: "batch",  label: "Batch         (choupoBatch)", entries: [] },
  { category: "ctrl",   label: "Control       (choupoCtrl)",  entries: [] },
  { category: "props",  label: "Properties    (choupoProps)", entries: [] },
  { category: "plant",  label: "Plant         (fractal)",      entries: [] },
  { category: "electrochem", label: "Electrochem   (choupoSolve)", entries: [] },
];
for (const t of TUTORIALS) {
  const g = TUTORIALS_BY_CATEGORY.find((x) => x.category === t.category);
  if (g) g.entries.push(t);
}

// -- Sub-classes (folders on disk + GUI grouping) ---------------------------
// The 2026-06-03 reorganisation put steady/batch/props cases into sub-class
// SUBFOLDERS on disk (e.g. tutorials/steady/membranes/membrane01_...).  The
// case identifier therefore INCLUDES the sub-class (<cat>/<subclass>/<case>)
// and the slug IS the folder name.  ctrl/ and plant/ stay flat (few cases, and
// plant is fractal).  Below: which categories are sub-classed, the menu order
// of the slugs, and a pretty label per slug for the Open-Case dialog.
function isSubclassed(cat: string): boolean {
  return cat === "steady" || cat === "batch" || cat === "props";
}
const SUBCLASS_ORDER: Partial<Record<Category, string[]>> = {
  steady: ["flash", "distillation", "absorption", "reactors", "gibbs",
           "membranes", "heat", "gas-solid", "crystallisation", "evaporation",
           "drying", "rotating", "power", "utilities", "flowsheets",
           "optimisation", "thermo", "userops"],
  batch: ["reactor", "still", "recipes"],
  props: ["compare", "estimate"],
};
const SUBCLASS_LABEL: { [slug: string]: string } = {
  flash: "Phase equilibrium & flash",
  distillation: "Distillation & shortcut",
  absorption: "Absorption, stripping & extraction",
  reactors: "Reactors (CSTR / PFR)",
  gibbs: "Gibbs reactors",
  membranes: "Membranes (NF / RO)",
  heat: "Heat transfer & integration",
  "gas-solid": "Gas–solid separation",
  crystallisation: "Crystallisation",
  evaporation: "Evaporation",
  drying: "Drying",
  rotating: "Rotating equipment",
  power: "Power cycles",
  utilities: "Utilities & heat sources",
  flowsheets: "Flowsheets & recycle",
  optimisation: "Optimisation, sensitivity & fitting",
  thermo: "Thermodynamic models",
  userops: "Custom unit ops",
  reactor: "Batch reactor",
  still: "Rayleigh still",
  recipes: "Recipes",
  compare: "Compare & overlay",
  estimate: "Estimate a component",
};

export interface SubclassGroup {
  slug: string;
  label: string;
  entries: TutorialEntry[];
}

/** The sub-class groups for a category, in menu order, each with its entries.
 *  Empty sub-classes are dropped; any slug not in the order list is appended
 *  (alphabetically) at the end.  Returns `null` when the category is NOT
 *  sub-classed -- the modal then shows a flat case list (ctrl / plant). */
export function subclassGroupsFor(category: Category): SubclassGroup[] | null {
  const order = SUBCLASS_ORDER[category];
  if (!order) return null;
  const cat = TUTORIALS_BY_CATEGORY.find((g) => g.category === category);
  const entries = cat ? cat.entries : [];
  const make = (slug: string): SubclassGroup => ({
    slug,
    label: SUBCLASS_LABEL[slug] || slug,
    entries: entries.filter((e) => e.subclass === slug),
  });
  const groups: SubclassGroup[] = [];
  const seen = new Set<string>();
  for (const slug of order) {
    seen.add(slug);
    const g = make(slug);
    if (g.entries.length) groups.push(g);
  }
  const leftovers = [...new Set(entries.map((e) => e.subclass))]
    .filter((s) => s && !seen.has(s))
    .sort();
  for (const slug of leftovers) groups.push(make(slug));
  // Alphabetical by the DISPLAYED label (Vítor's ask): the SUBCLASS_ORDER
  // above is kept only as the set of known slugs (for the leftover split) --
  // the menu itself sorts by what the student reads, not a curated sequence.
  groups.sort((a, b) => a.label.localeCompare(b.label));
  return groups;
}

function buildIndex(): TutorialEntry[] {
  type Collected = { [rel: string]: string };
  const collected: {
    [key: string]: { category: Category; shortName: string; files: Collected };
  } = {};

  const ingest = (absPath: string, body: string) => {
    // The case root is <cat>/<name> for FLAT categories (ctrl, plant) and
    // <cat>/<subclass>/<name> for SUB-CLASSED ones (steady, batch, props).
    // `rel` is ANY path under the case root --- system/, constant/, OR a
    // fractal subfolder (concentration/system/flowsheetDict,...).  The case
    // IDENTIFIER (`key`) includes the sub-class, matching the folder on disk.
    const m = /\/tutorials\/(.+)$/.exec(absPath);
    if (!m || !m[1]) return;
    const segs = m[1].split("/");
    const cat = segs[0];
    if (cat !== "steady" && cat !== "batch" && cat !== "ctrl"
        && cat !== "props" && cat !== "plant" && cat !== "electrochem")
      return;
    const rootLen = isSubclassed(cat) ? 3 : 2; // segments forming the case root
    if (segs.length <= rootLen) return;        // not a file inside a case
    const rel = segs.slice(rootLen).join("/");
    // Skip generated output (reports/, per-case build dirs).
    if (rel.startsWith("reports/") || rel.includes("/.build/")) return;
    const key = segs.slice(0, rootLen).join("/");
    const shortName = segs[rootLen - 1]!; // the case leaf folder
    if (!collected[key]) collected[key] = { category: cat as Category, shortName, files: {} };
    collected[key].files[rel] = body;
  };

  for (const [absPath, body] of Object.entries(CASE_FILES)) ingest(absPath, body);

  const out: TutorialEntry[] = [];
  for (const key of Object.keys(collected).sort()) {
    const { category, shortName, files } = collected[key]!;
    const bin = category === "batch" ? "choupoBatch"
            : category === "ctrl"  ? "choupoCtrl"
            : category === "props" ? "choupoProps"
            : "choupoSolve";

    //: all three binaries are built as WASM, so batch/ctrl
    // cases ARE runnable in the browser.  The only remaining cases
    // that cannot run in the browser are the few with nested
    // sub-directories under constant/ that the worker does not yet
    // propagate into MEMFS (fitNRTL01 needs constant/experiments/,
    // process04 needs constant/binaryPairs/).
    let unsupportedReason: string | undefined;
    if (UNSUPPORTED_PATHS_IN_BROWSER.has(key)) {
      unsupportedReason =
        "You can view this case in the GUI, but the browser solver"
        + " cannot run it (it needs subdirectories under constant/"
        + " that are not bundled for the browser yet)."
        + `  To run it from a terminal:./${bin} tutorials/${key}`;
    }
    // A data-only folder (e.g. a curated experimental dataset under
    // constant/ with no system/ yet -- a curation artefact, not a runnable
    // case) must NEVER kill the whole catalogue at module eval: warn loudly
    // and skip it.  It becomes a tutorial the day it gains its dicts.
    let cf: CaseFiles;
    try {
      cf = filesToCaseFiles(key, files);
    } catch (e) {
      console.warn(`[tutorials] skipping '${key}':`, e instanceof Error ? e.message : e);
      continue;
    }
    const rawDesc = cf.controlDict["description"];
    const description = typeof rawDesc === "string" ? rawDesc : "";
    out.push({
      name: key,
      shortName,
      category,
      // The sub-class slug is the middle path segment for sub-classed
      // categories (key = <cat>/<subclass>/<case>), "" for flat ones.
      subclass: isSubclassed(category) ? key.split("/")[1]! : "",
      description,
      files: cf,
      unsupportedReason,
    });
    for (const sn of subNodesFor(key, category, shortName, files)) SUBNODES[sn.name] = sn;
  }
  return out;
}

// Build a CASE for every sub-node (a folder below the case root carrying its
// own `.cho`): re-root the files under that folder, and inherit the
// thermoPackage / controlDict from the nearest ancestor that has them (the
// same cascade the C++ engine does with resolveUp).
// Project a plant's 0/ stream state onto a drilled sub-case.  The root stores
// streams sector-OWNED (`0/BRINE/liquor`); a drilled sector or unit is re-rooted
// at `sectors/<S>/...` and reads its OWN streams by NAME, so return the streams
// the sub-case's flowsheetDict NAMES (a composite's `connections` edge keys, a
// leaf's `inputs`+`outputs`) as a flat `0/<stream>` map pulled from the root 0/.
// Only the referenced streams -- a run's completeness check rejects extra 0/ files.
export function projectRootStreamState(
  subFsText: string,
  rootFiles: { [relPath: string]: string },
): { [relPath: string]: string } {
  const out: { [relPath: string]: string } = {};
  try {
    const j = toJson(parse(subFsText, { sourceName: "sub" })) as { [k: string]: unknown };
    const wanted = new Set<string>();
    const conns = j["connections"];
    if (conns && typeof conns === "object" && !Array.isArray(conns))
      for (const k of Object.keys(conns as object)) wanted.add(k);
    for (const key of ["inputs", "outputs"]) {
      const v = j[key];
      if (Array.isArray(v)) for (const s of v) if (typeof s === "string") wanted.add(s);
    }
    const root0: { [base: string]: string } = {};
    for (const [r, body] of Object.entries(rootFiles))
      if (r.startsWith("0/")) root0[r.slice(r.lastIndexOf("/") + 1)] = body;
    for (const nm of wanted) if (root0[nm]) out[`0/${nm}`] = root0[nm];
  } catch { /* unparseable flowsheetDict -- no projection */ }
  return out;
}

function subNodesFor(rootName: string,
  category: Category,
  shortName: string,
  files: { [rel: string]: string },
): TutorialEntry[] {
  const out: TutorialEntry[] = [];
  for (const rel of Object.keys(files)) {
    if (!rel.endsWith(".cho")) continue;
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    if (dir === "") continue; // the root.cho -- that's the case itself

    const sub: { [r: string]: string } = {};
    for (const [r, body] of Object.entries(files))
      if (r.startsWith(dir + "/")) sub[r.slice(dir.length + 1)] = body;

    // Cascade the single-file required dicts from the nearest ancestor.
    for (const need of ["constant/propertyDict", "system/controlDict"]) {
      if (sub[need]) continue;
      let p = dir;
      while (p !== "") {
        p = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
        const cand = (p ? p + "/" : "") + need;
        if (files[cand]) { sub[need] = files[cand]; break; }
      }
    }
    // Cascade EVERY constant/ asset from each ancestor folder.  Without
    // this the sub-case ships to MEMFS without files like
    // constant/components/<name>.dat or constant/binaryPairs/<pair>.dat
    // that the parent provides; the native engine walks up the real
    // filesystem to find them but the WASM build sees only what is
    // written into MEMFS, so the sector would die on the first lookup.
    // A sub-case's own file at the same relative path wins over the
    // ancestor's (already populated above by the prefix grab).
    let p = dir;
    while (p !== "") {
      p = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
      const prefix = p ? `${p}/constant/` : "constant/";
      for (const [r, body] of Object.entries(files)) {
        if (!r.startsWith(prefix)) continue;
        const local = "constant/" + r.slice(prefix.length);
        if (!sub[local]) sub[local] = body;
      }
    }

    // Flatten `inherits` in the drilled sub-case's propertyDict.  A sector's
    // propertyDict carries `inherits "../../../constant"`, but the parent
    // constant/ lives OUTSIDE this flattened sub-case, so that path no longer
    // resolves (the engine would die: "Cannot open .../constant/propertyDict").
    // Each sector's propertyDict already declares a COMPLETE world (components +
    // chemistry + property methods) and the cascade above copied its
    // propertyData/, so the effective config is fully materialised here -- drop
    // the now-dangling inherits.  This is the "standalone export" step (resolve
    // includes, materialise the effective property configuration).
    if (sub["constant/propertyDict"] && /^\s*inherits\s/m.test(sub["constant/propertyDict"]))
      sub["constant/propertyDict"] = sub["constant/propertyDict"].replace(
        /^\s*inherits\s+.*$/m,
        "// inherits flattened for the standalone drilled sub-case (effective config materialised)");

    // Project the plant's 0/ stream state into the drilled sub-case (the root
    // stores streams sector-OWNED under 0/<SECTOR>/; a re-rooted sector/unit
    // reads them by NAME -- without this the drilled tab shows no values).
    const subFsText = sub["system/flowsheetDict"];
    if (subFsText && !Object.keys(sub).some((r) => r.startsWith("0/")))
      Object.assign(sub, projectRootStreamState(subFsText, files));

    // The sub-node's identifier is the ROOT case's FULL name + the folder path,
    // so a drill lookup (`${tutorialName}/${child}`) matches.  Using shortName
    // dropped the sub-class segment (steady/CRYSTALLISATION/...), so a subclassed
    // case's units were registered under the wrong key and never drilled.
    const name = `${rootName}/${dir}`;
    try {
      const cf = filesToCaseFiles(name, sub);
      const rawDesc = cf.controlDict["description"];
      out.push({
        name,
        shortName: `${shortName}/${dir}`,
        category,
        subclass: "", // fractal sub-nodes are reached by URL, not the menu
        description: typeof rawDesc === "string" ? rawDesc : "",
        files: cf,
      });
    } catch {
      // a sub-node missing a required dict (no flowsheetDict,...) -- skip it
    }
  }
  return out;
}

// Exported so the workspace client (cases/workspace.ts) can turn a case's
// {relPath: rawText} map -- whether bundled here or fetched live from the
// bridge -- into a CaseFiles through the SAME contract (throws on a missing
// required dict; keeps raw text + extras).
export function filesToCaseFiles(name: string,
  files: { [rel: string]: string },
): CaseFiles {
  const required = (rel: string): string => {
    const t = files[rel];
    if (t === undefined) {
      throw new Error(
        `Tutorial '${name}' is missing required file '${rel}'`,
      );
    }
    return t;
  };
  const optional = (rel: string): string | undefined => files[rel];

  // Either flowsheetDict (solve/batch/ctrl) or propsDict (props) is
  // required; pick whichever exists.
  const fsText = optional("system/flowsheetDict");
  const psText = optional("system/propsDict");
  if (!fsText && !psText)
    throw new Error(
      `Tutorial '${name}' has neither system/flowsheetDict nor system/propsDict`,
    );

  // The thermo source is EITHER the classic constant/propertyDict OR a
  // constant/propertyDict selection (the engine reads propertyPackage
  // first -- choupoSolve/main.cpp).  Requiring only thermoPackage silently
  // hid all 17 propertyPackage tutorials from the GUI.
  // The thermo source is constant/propertyDict (preferred), else the classic
  // constant/propertyDict, else a constant/propertyDict selection -- the same
  // order the engine reads (choupoSolve/main.cpp).
  const pdictText = optional("constant/propertyDict");
  const tpText = optional("constant/propertyDict");
  const ppText = optional("constant/propertyDict");
  const thermoText = pdictText ?? tpText ?? ppText;
  if (!thermoText)
    throw new Error(
      `Tutorial '${name}' is missing required file 'constant/propertyDict' (or thermoPackage / propertyPackage)`,
    );
  const cf: CaseFiles = {
    controlDict: toJson(parse(required("system/controlDict"), { sourceName: "controlDict" })),
    // Thermo foundation for the Props view.  All three forms declare
    // `components ( ... )`; without this a propertyDict/propertyPackage plant
    // would show "Components (none)".
    thermoPackage: toJson(parse(thermoText, {
      sourceName: pdictText ? "propertyDict" : tpText ? "thermoPackage" : "propertyPackage" })),
  };
  if (fsText) cf.flowsheet = toJson(parse(fsText, { sourceName: "flowsheetDict" }));
  if (psText) cf.propsDict = toJson(parse(psText, { sourceName: "propsDict" }));
  const r = optional("constant/reactions");
  if (r !== undefined) cf.reactions = toJson(parse(r, { sourceName: "reactions" }));
  const sd = optional("system/solverDict");
  if (sd !== undefined) cf.solverDict = toJson(parse(sd, { sourceName: "solverDict" }));
  const od = optional("system/outerDict");
  if (od !== undefined) cf.outerDict = toJson(parse(od, { sourceName: "outerDict" }));
  const pd = optional("system/postDict");
  if (pd !== undefined) cf.postDict = toJson(parse(pd, { sourceName: "postDict" }));

  // Anything not recognised (e.g. case-local component files under
  // constant/components/, the.cho marker, etc.) is preserved as raw
  // passthrough.  The WASM adapter writes these verbatim into MEMFS so
  // the solver can read them from disk.
  const KNOWN = new Set<string>([
    "system/controlDict",
    "system/flowsheetDict",
    "system/propsDict",
    "system/solverDict",
    "system/outerDict",
    "system/postDict",
    "constant/propertyDict",
    "constant/reactions",
  ]);
  const extras: { [k: string]: string } = {};
  for (const [rel, body] of Object.entries(files)) {
    if (KNOWN.has(rel)) continue;
    extras[rel] = body;
  }
  if (Object.keys(extras).length > 0) cf.extraFiles = extras;

  // Keep every file's ORIGINAL raw text (with comments) for the Case
  // viewer.  The `.cho` marker is kept too (was skipped when always empty):
  // it is the GUI's home for the saved canvas layout -- FlowCanvas seeds the
  // arrangement from its JSON, "Save layout to case" writes it (see layout.ts).
  const raws: { [k: string]: string } = {};
  for (const [rel, body] of Object.entries(files)) {
    raws[rel] = body;
  }
  cf.rawFiles = raws;
  return cf;
}

export const DEFAULT_TUTORIAL = "plant/ChemicalPlantTutorial";

export function tutorialByName(name: string): TutorialEntry | undefined {
  return TUTORIALS.find((t) => t.name === name) ?? SUBNODES[name];
}

/** Resolve a (possibly drilled) view name to its registered ROOT case + the
 *  sub-path within it.  `plant/Plant/DRYING/BD` -> { root = the Plant tutorial
 *  (whole-tree files), subPath = "DRYING/BD" }.  The root's `files.rawFiles`
 *  carry every nested flowsheetDict, so the absolute stream numbering can walk
 *  the whole plant from any drilled view.  null for external:/local:/focus:
 *  views (no registry root) -> caller falls back to local numbering. */
export function rootCaseAndPath(
  name: string,
): { rootFiles: CaseFiles; subPath: string } | null {
  if (!name || name.includes(":")) return null;
  const segs = name.split("/").filter(Boolean);
  for (let i = segs.length; i >= 1; i--) {
    const cand = segs.slice(0, i).join("/");
    const t = TUTORIALS.find((e) => e.name === cand);
    if (t) return { rootFiles: t.files, subPath: segs.slice(i).join("/") };
  }
  return null;
}
