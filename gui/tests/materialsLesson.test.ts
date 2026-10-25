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
  The materials EduTool (DEV.md 4c C84), held to the tree.

    * the shelf, the kind, the theory anchor and the workspace dispatch;
    * the material list the bench offers IS the set of construction-material
      records on disk, with each record's own numbers;
    * the bench's edit, applied to the REAL witness and read back entry by
      entry -- an edit that changed the wrong vessel would still run;
    * the sentences step 23 asks the reader to look for, recomputed here from
      the witness's golden sizes and the records by the engine's own
      arithmetic (VesselMechanics.cpp, Turton.cpp), after that arithmetic is
      first tied to the golden for the shipped materials -- so a sentence
      that stopped being true would fail here before a reader saw it;
    * the lesson text: nothing quoted, every equation parses, every code or
      standard it names is marked NOT READ, no trade name, every file:line
      it cites lands on the statement it claims.
\*---------------------------------------------------------------------------*/

import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { EquipmentItem } from "../src/adapters/SolverAdapter.js";
import { filesToCaseFiles } from "../src/cases/tutorials.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import {
  BENCH_VESSELS, MATERIALS_WITNESS, POST_DICT, benchFiles, constructionMaterials,
  shippedMaterial, vesselAnswer, vesselLines, withMaterial, witnessPostDict,
  type MaterialRecord,
} from "../src/ui/methods/materialsBench.js";
import {
  MATERIALS_LIMITS, MATERIALS_SOURCES, MATERIALS_STEPS, PARETO_ROWS,
} from "../src/ui/methods/materialsLesson.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const CASE = `tutorials/${MATERIALS_WITNESS}`;

const allText = [
  ...MATERIALS_STEPS.flatMap((s) => [s.title, s.body, s.note ?? "",
    ...(s.where ?? []).map((g) => g.means),
    ...(s.derivation ?? []).map((d) => d.step)]),
  ...MATERIALS_LIMITS.flatMap((l) => [l.title, l.body]),
  ...PARETO_ROWS.flatMap((r) => [r.family, r.firstFor, r.defeatedBy]),
].join(" ").replace(/\s+/g, " ");

// ---- registry --------------------------------------------------------------------

describe("materials: the registry entry", () => {
  const t = METHOD_TOOLS.find((m) => m.id === "materials");
  it("is live, notes, on the design-and-economics shelf, with a real theory anchor", () => {
    expect(t).toBeDefined();
    expect(t!.status).toBe("live");
    expect(t!.kind).toBe("notes");
    expect(t!.discipline).toBe("Process design & economics");
    expect(tree("docs/theoryGuide.tex")).toContain(`\\label{${t!.theory}}`);
  });
  it("is dispatched by the workspace", () => {
    const ws = tree("gui/src/ui/MethodsWorkspace.tsx");
    expect(ws).toMatch(/tool === "materials" \? <MaterialsTool \/>/);
    expect(ws).toMatch(/import\("\.\/methods\/MaterialsTool\.js"\)/);
  });
});

// ---- the records -----------------------------------------------------------------

/** Every `kind constructionMaterial` record on disk, by file stem. */
function recordsOnDisk(): Map<string, string> {
  const dir = new URL("../../data/standards/assets/", import.meta.url);
  const out = new Map<string, string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".dat")) continue;
    const text = readFileSync(new URL(f, dir), "utf-8");
    if (/^\s*kind\s+constructionMaterial\s*;/m.test(text)) out.set(f.replace(/\.dat$/, ""), text);
  }
  return out;
}
const declared = (text: string, key: string): number => {
  const m = new RegExp(`^\\s*${key}\\s+([-+0-9.eE]+)`, "m").exec(text);
  if (!m) throw new Error(`no ${key}`);
  return Number(m[1]);
};

describe("materials: the bench offers exactly the records", () => {
  const disk = recordsOnDisk();
  const read = constructionMaterials();
  it("one entry per construction-material record, no more", () => {
    expect(read.map((m) => m.name).sort()).toEqual([...disk.keys()].sort());
    expect(read.length).toBeGreaterThanOrEqual(4);
  });
  it("with each record's own numbers", () => {
    for (const m of read) {
      const text = disk.get(m.name)!;
      for (const k of ["density", "F_M", "sigma_y", "maxT", "maxP"] as const)
        expect(m[k], `${m.name}.${k}`).toBe(declared(text, k));
    }
  });
});

// ---- the bench's edit ---------------------------------------------------------------

describe("materials: the bench edits the witness it names", () => {
  const text = witnessPostDict();
  it("the three vessels, their shipped materials and design pressures are the file's", () => {
    for (const v of BENCH_VESSELS) {
      expect(shippedMaterial(text, v.unit)).toBe(v.shipped);
      const entry = text.slice(text.search(new RegExp(`unitName\\s+${v.unit}\\s*;`)));
      expect(Number(/pressureDesign\s+([0-9.]+)/.exec(entry)![1])).toBe(v.pressureDesign);
    }
  });
  it("changes ONE vessel's material and nothing else", () => {
    for (const v of BENCH_VESSELS) {
      const edited = withMaterial(text, v.unit, "aluminium");
      expect(shippedMaterial(edited, v.unit)).toBe("aluminium");
      for (const o of BENCH_VESSELS.filter((w) => w.unit !== v.unit))
        expect(shippedMaterial(edited, o.unit)).toBe(o.shipped);
      expect(edited.length).toBe(text.length - v.shipped.length + "aluminium".length);
    }
  });
  it("refuses a unit with no sizing entry", () => {
    expect(() => withMaterial(text, "noSuchUnit", "SS304")).toThrow(/no sizing entry/);
  });
  it("builds a runnable case from the edited files", () => {
    const raw = benchFiles("separator", "SS304");
    expect(shippedMaterial(raw[POST_DICT]!, "separator")).toBe("SS304");
    expect(() => filesToCaseFiles(MATERIALS_WITNESS, raw)).not.toThrow();
  });
});

describe("materials: reading the engine's answer", () => {
  it("reads one vessel's row off the equipment list, and only that row", () => {
    const eq: EquipmentItem[] = [
      { unit: "a", item: "a", type: "vessel", material: "SS304",
        values: { t_wall: 0.01, weight: 100, D: 1 },
        cost: { purchased: 1, bareModule: 2, totalModule: 3, currency: "EUR",
                factors: { F_M: 2.34, F_P: 1.5 } } },
      { unit: "b", item: "b", type: "vessel", material: "carbonSteel", values: {} },
    ];
    const a = vesselAnswer(eq, "a")!;
    expect(a.t_wall_mm).toBeCloseTo(10, 12);
    expect(a.F_M).toBe(2.34);
    expect(a.F_P).toBe(1.5);
    expect(a.bareModule).toBe(2);
    expect(vesselAnswer(eq, "b")!.t_wall_mm).toBeNull();
    expect(vesselAnswer(eq, "c")).toBeNull();
  });
  it("keeps the engine's lines about that vessel, verbatim", () => {
    const log = [
      "  [rating] WARNING: vessel 'separator': design pressure 220.0 bar EXCEEDS material 'SS316' rating 100.0 bar",
      "  [rating] WARNING: vessel 'converter': design pressure 220.0 bar EXCEEDS material 'SS316' rating 100.0 bar",
      "    - vessel 'separator': design pressure 220.0 bar EXCEEDS material 'SS316' rating 100.0 bar",
    ].join("\n");
    expect(vesselLines(log, "separator")).toEqual([
      "[rating] WARNING: vessel 'separator': design pressure 220.0 bar EXCEEDS material 'SS316' rating 100.0 bar",
    ]);
  });
  it("the rating line it filters on is the one the engine prints", () => {
    expect(tree("src/postProcessing/sizing/MaterialLimits.cpp"))
      .toContain(`std::cout << "  [rating] WARNING: " << who << ": " << msg`);
    expect(tree("src/postProcessing/sizing/VesselSize.cpp"))
      .toContain(`materialLimits::pressure("vessel '" + unitName + "'", material, pressureDesign);`);
  });
});

// ---- what step 23 asks the reader to look for -------------------------------------

/** A golden `equipment <unit> <field> <value>` row of the witness. */
function golden(unit: string, field: string): number {
  const m = new RegExp(`^equipment\\s+${unit}\\s+${field.replace(/\./g, "\\.")}\\s+([-+0-9.eE]+)`, "m")
    .exec(tree(`${CASE}/expected`));
  if (!m) throw new Error(`no golden equipment ${unit}.${field}`);
  return Number(m[1]);
}
/** The engine's arithmetic, recomputed: the wall and weight
 *  (VesselMechanics.cpp:29-35, E = 1 and 3 mm, the defaults this witness
 *  takes), the vessel pressure factor (Turton.cpp:323-328, on P read as
 *  gauge since DEV.md 4c C86, Turton.cpp:667) and the bare-module cost
 *  (Turton.cpp:721). */
function priced(unit: string, m: MaterialRecord, P: number) {
  const D = golden(unit, "values.D"), H = golden(unit, "values.H");
  const t = (P * 1e5 * D) / (2 * m.sigma_y! * 1e6 * 1.0 - 1.2 * P * 1e5) + 0.003;
  const weight = m.density! * Math.PI * D * H * t;
  const Pg = Math.max(P, 0);
  const tP = (D * Pg) / (2 * (m.sigma_y! * 10 - 0.6 * Pg));
  const F_P = Math.max((tP + 0.00315) / 0.0063, 1);
  const C_BM = golden(unit, "cost.purchased") * (2.25 + 1.82 * m.F_M! * F_P);
  return { t, weight, F_P, C_BM };
}

describe("materials: the bench's sentences, against the engine's arithmetic", () => {
  const mats = constructionMaterials();
  const by = (n: string) => mats.find((m) => m.name === n)!;
  it("the recomputation reproduces the golden for every shipped material", () => {
    for (const v of BENCH_VESSELS) {
      const p = priced(v.unit, by(v.shipped), v.pressureDesign);
      expect(p.t / golden(v.unit, "values.t_wall")).toBeCloseTo(1, 4);
      expect(p.weight / golden(v.unit, "values.weight")).toBeCloseTo(1, 4);
      expect(p.C_BM / golden(v.unit, "cost.bareModule")).toBeCloseTo(1, 4);
    }
  });
  it("SS304 and SS316 give the same wall; only the price differs", () => {
    expect(by("SS304").sigma_y).toBe(by("SS316").sigma_y);
    expect(by("SS304").density).toBe(by("SS316").density);
    expect(by("SS304").F_M).toBeLessThan(by("SS316").F_M!);
    expect(allText).toContain("SS304 and SS316 give the SAME wall");
  });
  it("aluminium: a thicker wall, a lighter shell, more than a quarter of a metre at 220 bar", () => {
    for (const v of BENCH_VESSELS) {
      const al = priced(v.unit, by("aluminium"), v.pressureDesign);
      const st = priced(v.unit, by("SS316"), v.pressureDesign);
      expect(al.t).toBeGreaterThan(st.t);
      expect(al.weight).toBeLessThan(st.weight);
      if (v.pressureDesign === 220) expect(al.t).toBeGreaterThan(0.25);
    }
    expect(allText).toContain("a wall more than a quarter of a metre thick");
  });
  it("at 220 bar aluminium prices below SS316, and carbon steel is cheapest on every vessel", () => {
    for (const v of BENCH_VESSELS) {
      const cost = new Map(mats.map((m) => [m.name, priced(v.unit, m, v.pressureDesign).C_BM]));
      const min = Math.min(...cost.values());
      expect(cost.get("carbonSteel")).toBe(min);
      if (v.pressureDesign === 220) expect(cost.get("aluminium")!).toBeLessThan(cost.get("SS316")!);
    }
    expect(allText).toContain("Carbon steel is the cheapest choice on every vessel");
    expect(allText).toContain("that the price comes out below SS316's");
  });
  it("every record's maxP is below 220 bar; aluminium's maxT is below the converter's 700 K", () => {
    for (const m of mats) expect(m.maxP!).toBeLessThan(220);
    expect(by("aluminium").maxT!).toBeLessThan(700);
    expect(tree(`${CASE}/system/postDict`)).toContain("at this converter's own 700 K and 200 bar");
  });
  it("a vessel is costed on its volume, so the weight moves no euro", () => {
    const t = tree("src/postProcessing/costing/Turton.cpp").split("\n");
    expect(t[275]).toContain('if (equipType == "vessel")       return vesselCoeffs;');
    expect(t[79]).toContain('"V_R"');
    expect(tree(`${CASE}/expected`)).toMatch(/^equipment\s+converter\s+values\.V_R/m);
  });
  it("maxT is loaded in one place and compared in one place, by the sizing pass", () => {
    //  Step 22's claim (DEV.md 4c C85): the loader reads maxT, ONE home
    //  compares it, and the sizing pass is its one caller.  Held by
    //  recounting every mention under src/ that is not the thermo package
    //  (whose Tmax/Tmin are a different quantity).
    const mentions = grepSrc(/\bmaxT\b/);
    expect(mentions.sort()).toEqual([
      "src/materials/Material.H", "src/materials/MaterialRegistry.cpp",
      "src/postProcessing/SizingPass.cpp",
      "src/postProcessing/sizing/MaterialLimits.H",
      "src/postProcessing/sizing/MaterialLimits.cpp"]);
    expect(grepSrc(/materialLimits::temperature\(/).sort()).toEqual([
      "src/postProcessing/SizingPass.cpp"]);
  });
});

function grepSrc(re: RegExp): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const dir = new URL(`../../${rel}/`, import.meta.url);
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) { if (r !== "src/thermo") walk(r); continue; }
      if (!/\.(cpp|H)$/.test(e.name)) continue;
      if (re.test(readFileSync(new URL(e.name, dir), "utf-8"))) out.push(r);
    }
  };
  walk("src");
  return out;
}

// ---- the lesson text -----------------------------------------------------------------

describe("materials: the lesson text", () => {
  it("steps are numbered 1..N without a gap", () => {
    MATERIALS_STEPS.forEach((s, i) => expect(s.n).toBe(i + 1));
    const tool = tree("gui/src/ui/methods/MaterialsTool.tsx");
    for (const s of MATERIALS_STEPS) expect(tool).toContain(`{step(${s.n})}`);
  });
  it("quotes nothing", () => {
    expect(allText).not.toMatch(/["“”]/);
    for (const s of MATERIALS_SOURCES) expect(`${s.cite} ${s.used}`).not.toMatch(/["“”]/);
  });
  it("every equation parses", () => {
    for (const s of MATERIALS_STEPS) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq), `step ${s.n}`).toBe(true);
      for (const g of s.where ?? []) expect(texParses(g.sym), `step ${s.n} ${g.sym}`).toBe(true);
    }
  });
  it("marks every code, standard and book it names as NOT READ, and says how the rest was reached", () => {
    for (const id of ["loginow-phelps", "api-941", "asme-iid", "turton", "corrosion-data",
      "api-682", "astm-a240", "callister", "iiw-ce"])
      expect(MATERIALS_SOURCES.find((s) => s.id === id)!.used, id).toContain("NOT READ");
    for (const id of ["loginow", "records", "peq-postdict"])
      expect(MATERIALS_SOURCES.find((s) => s.id === id)!.used, id).toMatch(/^read/);
    //  The Tesoro page was read; the report was not -- both said.
    const csb = MATERIALS_SOURCES.find((s) => s.id === "csb-tesoro")!.used;
    expect(csb).toContain("web page was read");
    expect(csb).toContain("report itself NOT READ");
  });
  it("calls the Pareto a teaching ordering and carries no share", () => {
    expect(allText).toContain("TEACHING ORDERING");
    expect(allText).not.toMatch(/\d+\s*(%|per cent) of (the )?(market|tonnage|plants)/i);
    for (const r of PARETO_ROWS) expect(`${r.firstFor} ${r.defeatedBy}`).not.toMatch(/\d/);
  });
  it("names alloys by UNS number and generic family, never by trade name", () => {
    const TRADE = /\b(hastelloy|inconel|incoloy|monel|teflon|viton|kalrez|grafoil|nitronic|sanicro|ferralium|zeron|chemraz|aflas|gylon|flexitallic)\b/i;
    expect(allText).not.toMatch(TRADE);
    for (const s of MATERIALS_SOURCES) expect(`${s.cite} ${s.used}`).not.toMatch(TRADE);
    for (const uns of ["S30400", "S31600", "S32205", "N10276", "N06625", "N04400", "R50400",
      "C70600", "S30403", "S31603"]) expect(allText).toContain(uns);
  });
  it("every file:line it cites lands on what it claims", () => {
    const at = (rel: string, a: number, b?: number): string =>
      tree(rel).split("\n").slice(a - 1, b ?? a).join("\n");
    const SRC = "src/postProcessing/";
    const CLAIMS: Record<string, [string, number, number | undefined, string | RegExp]> = {
      "VesselMechanics.cpp:33-34": [`${SRC}sizing/VesselMechanics.cpp`, 33, 34,
        /w\.t_wall = P_Pa \* D_m \/ \(2\.0 \* sigma_Pa \* jointEfficiency - 1\.2 \* P_Pa\)\s*\+ corrosionAllow_m;/],
      "VesselMechanics.cpp:30": [`${SRC}sizing/VesselMechanics.cpp`, 30, undefined,
        "const scalar sigma_Pa = material.sigma_y * 1.0e6;"],
      "VesselMechanics.cpp:35": [`${SRC}sizing/VesselMechanics.cpp`, 35, undefined,
        "w.weight = material.density * constant::pi * D_m * H_m * w.t_wall;"],
      "VesselMechanics.cpp:29": [`${SRC}sizing/VesselMechanics.cpp`, 29, undefined,
        "const scalar P_Pa     = pressureDesign_bar * 1.0e5;"],
      "VesselMechanics.H:58-60": [`${SRC}sizing/VesselMechanics.H`, 58, 60, /GAUGE/],
      "DesignDefaults.cpp:46": [`${SRC}sizing/DesignDefaults.cpp`, 46, undefined,
        '"corrosionAllow", 0.003, "m",'],
      "Turton.cpp:719-721": [`${SRC}costing/Turton.cpp`, 719, 721,
        /const scalar F_M\s+= \(mat\.F_M > 0\.0\) \? mat\.F_M : 1\.0;[\s\S]*C_BM\s+= Cp_target \* \(c\.B1 \+ c\.B2 \* F_M \* F_P\);/],
      "Turton.cpp:323-328": [`${SRC}costing/Turton.cpp`, 323, 328,
        /denom = 2\.0 \* \(sigma_bar - 0\.6 \* P_gauge_bar\);[\s\S]*std::max\(\(t_w \+ 0\.00315\) \/ 0\.0063, 1\.0\)/],
      "Turton.cpp:328": [`${SRC}costing/Turton.cpp`, 328, undefined,
        "return std::max((t_w + 0.00315) / 0.0063, 1.0);"],
      "Turton.cpp:667": [`${SRC}costing/Turton.cpp`, 667, undefined,
        "const scalar P_gauge    = std::max(P_des_bar, 0.0);"],
      "Turton.cpp:661-667": [`${SRC}costing/Turton.cpp`, 661, 667,
        /pressureDesign, which IS gauge[\s\S]*P_gauge\s+= std::max\(P_des_bar, 0\.0\);/],
      "Turton.cpp:80": [`${SRC}costing/Turton.cpp`, 80, undefined, '"V_R"'],
      //  C150 R06: the exchanger F_P above its sourced 140 bar g, announced.
      "Turton.cpp:706-715": [`${SRC}costing/Turton.cpp`, 706, 715,
        /if \(&c == &hxCoeffs && P_gauge > 140\.0\)[\s\S]*EXTRAPOLATED[\s\S]*std::cout << v\.str\(\);/],
      "MaterialLimits.cpp:41": [`${SRC}sizing/MaterialLimits.cpp`, 41, undefined,
        "if (!(pressureDesign_bar > material.maxP)) return;"],
      "MaterialLimits.cpp:56-57": [`${SRC}sizing/MaterialLimits.cpp`, 56, 57,
        /material\.maxT > 0\.0[\s\S]*if \(!\(T_K > material\.maxT\)\) return;/],
      "MaterialRegistry.cpp:58": ["src/materials/MaterialRegistry.cpp", 58, undefined,
        'm.maxT    = d->lookupScalarOrDefault("maxT",    0.0);'],
      "Material.H:55": ["src/materials/Material.H", 55, undefined, /sigma_y.*allowable stress/],
      "postDict:179-183": ["tutorials/plant/greenAmmoniaPEQ_baseCase/system/postDict", 179, 183,
        /MATERIAL, one rule[\s\S]*SS304 where it goes below 0 C, because austenitic stainless keeps its\s+toughness there and the generic carbon-steel record states no\s+minimum design temperature/],
      "postDict:183-187": ["tutorials/plant/greenAmmoniaPEQ_baseCase/system/postDict", 183, 187,
        /HYDROGEN\s+SERVICE INCLUDED[\s\S]*NOT checked here/],
      "postDict:179-180": ["tutorials/plant/greenAmmoniaPEQ_baseCase/system/postDict", 179, 180,
        /SS316 where the process side exceeds the carbon\s+steel record's maxT \(700 K\)/],
    };
    const cited = new Set([...allText.matchAll(
      /(VesselMechanics\.(?:cpp|H)|DesignDefaults\.cpp|Turton\.cpp|VesselSize\.cpp|MaterialLimits\.cpp|MaterialRegistry\.cpp|Material\.H|postDict):(\d+)(?:-(\d+))?/g)]
      .map((m) => m[0]));
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, [rel, a, b, want]] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const text = at(rel, a, b);
      if (typeof want === "string") expect(text, c).toContain(want);
      else expect(text, c).toMatch(want);
    }
  });
  it("says what the records say about their own provenance", () => {
    expect(tree("data/standards/assets/carbonSteel.dat"))
      .toContain("THESE SIX NUMBERS ARE UNSOURCED DESIGN ASSERTIONS (AP6,");
    expect(allText).toContain("carbonSteel's own header calls its six numbers UNSOURCED");
    for (const r of ["SS304", "SS316"])
      expect(tree(`data/standards/assets/${r}.dat`)).toMatch(/F_M 2\.34|F_M 3\.05/);
  });
});
