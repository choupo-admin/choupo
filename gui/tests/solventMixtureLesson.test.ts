/*---------------------------------------------------------------------------*\
  Choosing a solvent, or a solvent mixture (DEV.md 4c C128), held to the tree.

  What it holds, block by block:
    * the shelf, the kind and the dispatch;
    * the witnesses: the four CSV names the page reads are the ones the three
      cases declare, each case runs choupoProps, the observation table is a
      case INPUT the bundle must carry;
    * the synthetic case against the hand arithmetic: pure ends at Ra 6.000
      (RED 1.5), the minimum 2.000 (RED 0.5) at exactly 50 % B, the ends
      `pure` and every blend `notVerified` (an ideal liquid cannot decide),
      the Teas fractions summing to one and the target's Teas point on every
      row;
    * the real case: hexane + acetone `homogeneous` throughout with its
      minimum inside the sphere and both pure ends outside or at its edge;
      hexane + nitromethane with at least one `twoPhase` row that carries NO
      Ra, no RED, no averaged triple and a negative tm, and a minimum taken
      over the rows that survive; the mole-basis rows carrying volume
      fractions that are NOT the declared mole fractions;
    * the screen beside the observations: thirteen rows, all `pure`, one
      observation per row, every solvent rated 6 outside the sphere, every
      solvent rated 1 within the thesis's own band of the radius;
    * the page: no arithmetic (no Math.sqrt / Math.pow / exponent on the
      tool or the reader), nothing quoted, every equation parses, every
      file:line it cites lands on the statement it claims.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { SOLVENT_LIMITS, SOLVENT_STEPS } from "../src/ui/methods/solventMixtureLesson.js";
import {
  minimumRow, readBlendCsv, readObservationsCsv,
} from "../src/ui/methods/solventMixtureRead.js";
import { witnessOutput } from "./witnessRead.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tree = (rel: string): string => readFileSync(join(REPO, rel), "utf-8");
const SYN = "tutorials/props/solvents/solvent01_synthetic_mixture";
const REAL = "tutorials/props/solvents/solvent02_polystyrene_hexane_blends";
const OBS = "tutorials/props/solvents/solvent03_polystyrene_observed";
const TOOL = "gui/src/ui/methods/SolventMixtureTool.tsx";
const READER = "gui/src/ui/methods/solventMixtureRead.ts";
const TM_TOL = -1e-3;   // StabilityTest.H's tmTol: below it, unstable

// ---- the registry -----------------------------------------------------------------------------

describe("solvent-mixture: the shelf, the kind and the dispatch", () => {
  const t = METHOD_TOOLS.find((m) => m.id === "solvent-mixture");
  it("is a live selection on the Thermodynamics shelf with its own theory anchor", () => {
    expect(t?.status).toBe("live");
    expect(t?.kind).toBe("selection");
    expect(t?.discipline).toBe("Thermodynamics");
    expect(t?.label).toBe("Choosing a solvent, or a solvent mixture");
    expect(t?.theory).toBe("ch:hansen-mixture");
    expect(tree("docs/theoryGuide.tex")).toContain("\\label{ch:hansen-mixture}");
  });
  it("the workspace renders it", () => {
    expect(tree("gui/src/ui/MethodsWorkspace.tsx"))
      .toContain('tool === "solvent-mixture" ? <SolventMixtureTool />');
  });
  it("the page runs the three witnesses with choupoProps and reads the CSVs the cases declare", () => {
    const src = tree(TOOL);
    expect(src).toContain('"choupoProps"');
    for (const [rel, files] of [
      [SYN, ["hansenMixture.csv"]],
      [REAL, ["hansen_hexane_acetone.csv", "hansen_hexane_nitromethane.csv"]],
      [OBS, ["hansen_screen.csv"]],
    ] as const) {
      expect(src).toContain(`"${rel.replace("tutorials/", "")}"`);
      expect(tree(`${rel}/system/controlDict`)).toMatch(/^application\s+choupoProps;/m);
      const props = tree(`${rel}/system/propsDict`);
      for (const f of files) {
        expect(props).toMatch(new RegExp(`^\\s*output\\s+\\{\\s*file\\s+"${f.replace(".", "\\.")}";`, "m"));
        expect(src).toContain(`"${f}"`);
      }
    }
    expect(src).toContain('"constant/experimental/hansen1967_table23_polystyrene.csv"');
  });
  it("no arithmetic on the page or in the reader beyond drawing", () => {
    for (const rel of [TOOL, READER]) {
      const code = tree(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const c of ["Math.sqrt", "Math.pow", "** 2", "4 *", "* 4"])
        expect(code, `${rel} carries ${c}`).not.toContain(c);
    }
  });
});

// ---- the synthetic witness ------------------------------------------------------------------

const syn = readBlendCsv(witnessOutput(SYN, "hansenMixture.csv"));

describe("solvent-mixture: the synthetic pair against the hand arithmetic", () => {
  it("has 21 rows from pure A to pure B on the volume basis", () => {
    expect(syn.solvents).toEqual(["solventA", "solventB"]);
    expect(syn.rows.length).toBe(21);
    expect(syn.rows[0]!.label).toBe("solventA");
    expect(syn.rows[20]!.label).toBe("solventB");
    expect(syn.rows.every((r) => r.basis === "volume")).toBe(true);
    syn.rows.forEach((r, i) => expect(r.s).toBeCloseTo(i / 20, 12));
  });
  it("the ends sit at Ra 6.000 (RED 1.5) and the minimum at 2.000 (RED 0.5), at 50 % B", () => {
    for (const r of [syn.rows[0]!, syn.rows[20]!]) {
      expect(r.Ra).toBeCloseTo(6, 9);
      expect(r.RED).toBeCloseTo(1.5, 9);
    }
    const best = minimumRow(syn)!;
    expect(best.s).toBeCloseTo(0.5, 12);
    expect(best.Ra).toBeCloseTo(2, 9);
    expect(best.RED).toBeCloseTo(0.5, 9);
    expect(best.phi.solventB).toBeCloseTo(0.5, 12);
  });
  it("the ends are `pure` and every blend is `notVerified` on an ideal liquid", () => {
    expect(syn.rows[0]!.phase).toBe("pure");
    expect(syn.rows[20]!.phase).toBe("pure");
    for (const r of syn.rows.slice(1, 20)) {
      expect(r.phase).toBe("notVerified");
      expect(Number.isNaN(r.tm)).toBe(true);
    }
  });
  it("the Teas fractions sum to one and the target's point rides every row", () => {
    for (const r of syn.rows) {
      expect(r.fd + r.fp + r.fh).toBeCloseTo(1, 9);
      expect(r.fdT + r.fpT + r.fhT).toBeCloseTo(1, 9);
      expect(r.fdT).toBeCloseTo(syn.rows[0]!.fdT, 12);
    }
  });
});

// ---- the real witness -------------------------------------------------------------------------

const acetone = readBlendCsv(witnessOutput(REAL, "hansen_hexane_acetone.csv"));
const nitro = readBlendCsv(witnessOutput(REAL, "hansen_hexane_nitromethane.csv"));

describe("solvent-mixture: polystyrene against the two hexane blends", () => {
  it("hexane + acetone is homogeneous throughout, its minimum inside the sphere, its ends not", () => {
    expect(acetone.solvents).toEqual(["nHexane", "acetone"]);
    expect(acetone.rows.length).toBe(21);
    for (const r of acetone.rows.slice(1, 20)) {
      expect(r.phase).toBe("homogeneous");
      expect(r.tm).toBeGreaterThanOrEqual(TM_TOL);
    }
    const best = minimumRow(acetone)!;
    expect(best.RED).toBeLessThan(1);
    expect(best.s).toBeGreaterThan(0);
    expect(best.s).toBeLessThan(1);
    expect(acetone.rows[0]!.RED).toBeGreaterThan(1);
    expect(acetone.rows[20]!.RED).toBeGreaterThan(best.RED);
  });
  it("hexane + nitromethane carries refused two-phase rows with no average, and the minimum skips them", () => {
    expect(nitro.solvents).toEqual(["nHexane", "nitromethane"]);
    const two = nitro.rows.filter((r) => r.phase === "twoPhase");
    expect(two.length).toBeGreaterThan(0);
    for (const r of two) {
      expect(r.tm).toBeLessThan(TM_TOL);
      for (const v of [r.Ra, r.RED, r.dD, r.dP, r.dH, r.fd]) expect(Number.isNaN(v)).toBe(true);
    }
    const best = minimumRow(nitro)!;
    expect(best.phase).not.toBe("twoPhase");
    expect(Number.isFinite(best.Ra)).toBe(true);
  });
  it("the mole basis is converted: the volume fractions are not the declared mole fractions", () => {
    expect(nitro.rows.every((r) => r.basis === "mole")).toBe(true);
    const mid = nitro.rows[10]!;
    expect(mid.s).toBeCloseTo(0.5, 12);
    //  nitromethane's molar volume is less than half hexane's, so at equal
    //  moles it holds well under half the volume.
    expect(mid.phi.nitromethane).toBeLessThan(0.35);
    expect(mid.phi.nHexane! + mid.phi.nitromethane!).toBeCloseTo(1, 12);
  });
});

// ---- the screen beside the observations -----------------------------------------------------

const screen = readBlendCsv(witnessOutput(OBS, "hansen_screen.csv"));
const observations = readObservationsCsv(
  tree(`${OBS}/constant/experimental/hansen1967_table23_polystyrene.csv`));

describe("solvent-mixture: thirteen pure solvents beside Hansen's ratings", () => {
  it("thirteen `pure` rows, one observation each, with the citation on every row", () => {
    expect(screen.rows.length).toBe(13);
    expect(screen.rows.every((r) => r.phase === "pure" && r.basis === "pure")).toBe(true);
    expect(observations.length).toBe(13);
    const byName = new Map(observations.map((o) => [o.solvent, o]));
    for (const r of screen.rows) {
      const o = byName.get(r.label);
      expect(o, r.label).toBeDefined();
      expect(o!.rating).toBeGreaterThanOrEqual(1);
      expect(o!.rating).toBeLessThanOrEqual(6);
      expect(o!.source).toContain("Hansen");
      expect(o!.source).toContain("1967");
    }
  });
  it("every solvent rated 6 lies outside the sphere; every solvent rated 1 within the thesis's band", () => {
    const band = 1 + 0.5 / 3.5;
    const byName = new Map(observations.map((o) => [o.solvent, o.rating]));
    for (const r of screen.rows) {
      const g = byName.get(r.label)!;
      if (g === 6) expect(r.RED, r.label).toBeGreaterThan(1);
      if (g === 1) expect(r.RED, r.label).toBeLessThan(band);
    }
  });
});

// ---- the lesson text --------------------------------------------------------------------------

describe("solvent-mixture: the lesson text", () => {
  const all = SOLVENT_STEPS.map((s) => [s.title, s.body, s.note ?? "",
    ...(s.derivation ?? []).map((d) => d.step)].join(" ")).join(" ");
  it("has nine steps on five pages, and the page draws every one of them", () => {
    expect(SOLVENT_STEPS.map((s) => s.n)).toEqual([...Array(9)].map((_, i) => i + 1));
    const src = tree(TOOL);
    for (const s of SOLVENT_STEPS) expect(src, `step ${s.n}`).toContain(`{step(${s.n})}`);
  });
  it("quotes nothing", () => {
    expect(all).not.toMatch(/["“”]/);
    for (const l of SOLVENT_LIMITS) expect(`${l.title} ${l.body}`).not.toMatch(/["“”]/);
  });
  it("every equation parses", () => {
    for (const s of SOLVENT_STEPS) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq), `step ${s.n} derivation`).toBe(true);
      for (const g of s.where ?? []) expect(texParses(g.sym), `step ${s.n} ${g.sym}`).toBe(true);
    }
  });
  it("every file:line it cites lands on what it claims", () => {
    const FILES: Record<string, string> = {
      "HansenMixture.cpp": "src/propertyOps/HansenMixture.cpp",
      "Component.cpp": "src/thermo/Component.cpp",
      "StabilityTest.cpp": "src/solver/StabilityTest.cpp",
    };
    const cited = new Set([...all.matchAll(/([A-Za-z]+\.(?:cpp|H)):(\d+)(?:-(\d+))?/g)].map((m) => m[0]));
    const CLAIMS: Record<string, string | RegExp> = {
      "Component.cpp:239": 'if (!h->found("Tref"))',
      "Component.cpp:255": 'if (h->found("R0"))',
      "HansenMixture.cpp:121": "return std::sqrt(4.0 * a * a + b * b + c * c);",
      "HansenMixture.cpp:279": "the Hansen parameters are held constant at their reference",
      "HansenMixture.cpp:346": 'if (checkModel == "ideal")',
      "HansenMixture.cpp:393-395":
        /p\.dD \+= phi\[i\] \* solvents\[i\]\.dD;\s*p\.dP \+= phi\[i\] \* solvents\[i\]\.dP;\s*p\.dH \+= phi\[i\] \* solvents\[i\]\.dH;/,
      "HansenMixture.cpp:407-409":
        /michelsenTPD\(thermo\.phase\(liqIdx\), T, P, z\);[\s\S]*p\.phase = st\.unstable \? "twoPhase" : "homogeneous";/,
      "HansenMixture.cpp:412": 'if (p.phase != "twoPhase")',
      "HansenMixture.cpp:431": 'const scalar n0 = basis == "mass" ? f0 / solvents[0].MW : f0;',
      "HansenMixture.cpp:501": "if (p.hasRa && (!best || p.Ra < best->Ra)) best = &p;",
      "HansenMixture.cpp:546": "Ra IS AN AFFINITY, NOT A SOLUBILITY",
      "StabilityTest.cpp:221": "best.unstable = (best.tmMin < tmTol);",
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, lines] = c.split(":") as [string, string];
      const src = tree(FILES[file]!).split("\n");
      const [a, b] = lines.split("-").map(Number);
      const text = b === undefined ? (src[a! - 1] ?? "") : src.slice(a! - 1, b).join("\n");
      if (typeof want === "string") expect(text, c).toContain(want);
      else expect(text, c).toMatch(want);
    }
  });
});
