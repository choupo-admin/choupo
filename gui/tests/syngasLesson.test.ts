/*---------------------------------------------------------------------------*\
  The synthesis-gas EduTool (DEV.md 4c C109), held to the tree.

  What it holds, block by block:
    * the shelf, the kind, the dispatch, and the links both ways with the
      equilibrium-method pages it points to;
    * the benches: each host is in the bundled corpus, a file a bench adds is
      not already there (it adds, it never replaces), every edit of every
      move and every knob lands exactly once, and an absent or ambiguous edit
      refuses by name;
    * THE ENGINE, NATIVELY: every guided move of every part, built with the
      page's own functions into the exact file map the browser worker
      receives, run by this checkout's choupoSolve -- and every number the
      move's sentence quotes EQUALS the native run's readout at the digits
      the page prints, and appears in the sentence as printed;
    * the claims the lesson text makes about those runs: the module of the
      steam reformer is 3.000 on every guided move of parts 1, 2 and 4; one
      shift stage at 480 K gives the two stages' outlet; the reverse shift's
      extent is negative; the pressures it names are the ones the corpus
      cases declare;
    * the lesson text: nothing quoted, every equation parses, and every
      file:line it cites lands on the statement it claims.
\*---------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { serialiseCase } from "../src/adapters/WasmAdapter.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  BENCHES, BENCH_STAGES, KNOBS, MOVES, START, applyEdit, benchCase, benchRaw, fmtReadout,
  readout, unitSpan, type BenchId, type RunData, type SyngasMove, type SyngasPart,
} from "../src/ui/methods/syngasExercise.js";
import { SYNGAS_LIMITS, SYNGAS_STEPS } from "../src/ui/methods/syngasLesson.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tree = (rel: string): string => readFileSync(join(REPO, rel), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const PARTS = Object.keys(MOVES) as SyngasPart[];

/** Every guided move once, START included, keyed by part/id. */
const ALL: { part: SyngasPart; m: SyngasMove }[] = PARTS.flatMap((p) =>
  [START[p], ...MOVES[p]].map((m) => ({ part: p, m })));
const UNIQUE = [...new Map(ALL.map((x) => [`${x.m.bench}:${x.m.id}`, x.m])).values()];

// ---- the registry ------------------------------------------------------------------

describe("syngas: the shelf, the kind and the dispatch", () => {
  const t = METHOD_TOOLS.find((m) => m.id === "syngas");
  it("is a live notes page on the Reaction engineering shelf", () => {
    expect(t?.status).toBe("live");
    expect(t?.kind).toBe("notes");
    expect(t?.discipline).toBe("Reaction engineering");
    expect(t?.label).toBe("Synthesis gas: one gas, many products");
  });
  it("the workspace renders it", () => {
    expect(tree("gui/src/ui/MethodsWorkspace.tsx")).toContain('tool === "syngas" ? <SyngasTool />');
  });
  it("links to the method pages, and the two closest link back", () => {
    const src = tree("gui/src/ui/methods/SyngasTool.tsx");
    for (const id of ["approach-to-equilibrium", "declared-pathways", "equilibrium-landscapes",
      "element-potential", "limiting-reactant"])
      expect(src, id).toContain(`link("${id}"`);
    const lessonTools = SYNGAS_STEPS.flatMap((s) => (s.leadsTo ? [s.leadsTo.tool] : []));
    expect(lessonTools).toEqual(expect.arrayContaining(
      ["approach-to-equilibrium", "declared-pathways", "route-screening", "limiting-reactant"]));
    for (const back of ["ApproachToEquilibriumTool.tsx", "DeclaredPathwaysTool.tsx"])
      expect(tree(`gui/src/ui/methods/${back}`), back).toContain('setActiveMethodTool("syngas")');
    for (const id of lessonTools)
      expect(METHOD_TOOLS.find((m) => m.id === id)?.status, id).toBe("live");
  });
});

// ---- the benches and their edits ------------------------------------------------------

describe("syngas: the benches and their edits", () => {
  it("every host is bundled, and an added file is never one the host has", () => {
    for (const [id, b] of Object.entries(BENCHES)) {
      const raw = tutorialByName(b.host)?.files.rawFiles;
      expect(raw, id).toBeDefined();
      for (const rel of Object.keys(b.adds ?? {})) expect(raw![rel], `${id} ${rel}`).toBeUndefined();
    }
  });
  it("every move's edits land exactly once, and change the host", () => {
    for (const m of UNIQUE) {
      const raw = benchRaw(m.bench, m.edits);
      const host = tutorialByName(BENCHES[m.bench].host)!.files.rawFiles!;
      if (m.edits.length + BENCHES[m.bench].base.length > 0)
        expect(Object.keys(raw).some((k) => raw[k] !== host[k]), m.id).toBe(true);
    }
  });
  it("every knob's edit lands exactly once on its bench", () => {
    for (const [p, kn] of Object.entries(KNOBS))
      for (const k of kn!.knobs) {
        const shifted = k.shipped + k.step;
        expect(() => benchRaw(kn!.bench, [k.edit(shifted)]), `${p}/${k.id}`).not.toThrow();
        expect(benchRaw(kn!.bench, [k.edit(shifted)])[k.edit(shifted).file], `${p}/${k.id}`)
          .toContain(k.edit(shifted).to);
      }
  });
  it("an edit that misses, or matches twice, refuses by name", () => {
    const fs = tutorialByName(BENCHES.reformer.host)!.files.rawFiles!["system/flowsheetDict"]!;
    expect(() => applyEdit(fs, { file: "system/flowsheetDict", from: "T          999 K;", to: "x" }))
      .toThrow(/not found/);
    expect(() => applyEdit(fs, { file: "system/flowsheetDict", from: "T          1000.0 K;", to: "x" }))
      .toThrow(/more than once/);
    expect(() => unitSpan(fs, "noSuchUnit")).toThrow(/noSuchUnit/);
    const [a, b] = unitSpan(fs, "reformerLow");
    expect(fs.slice(a, b)).toMatch(/^\{\s*name\s+reformerLow;/);
    expect(fs.slice(a, b)).toContain("{ name  graphite;");
  });
});

// ---- the engine, natively ----------------------------------------------------------------

function runNative(bench: BenchId, edits: SyngasMove["edits"]): { status: number | null; err: string;
  data: RunData | null } {
  const bin = join(REPO, "choupoSolve");
  expect(existsSync(bin), `${bin} is absent -- run \`make all\` at the repository `
    + "root; this test runs the native engine and must not skip").toBe(true);
  const dir = mkdtempSync(join(tmpdir(), "choupo-c109-"));
  try {
    for (const [rel, body] of Object.entries(serialiseCase(benchCase(bench, edits)))) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    const r = spawnSync(bin, [dir], { cwd: REPO, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
    const m = /<<<Choupo:result-begin>>>\s*\n([\s\S]*?)\n<<<Choupo:result-end>>>/.exec(r.stdout ?? "");
    return { status: r.status, err: r.stderr ?? "", data: m ? JSON.parse(m[1]!) as RunData : null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const RUNS = new Map<string, RunData>();
function run(m: SyngasMove): RunData {
  const key = `${m.bench}\u0000${JSON.stringify(m.edits)}`;
  const hit = RUNS.get(key);
  if (hit) return hit;
  const r = runNative(m.bench, m.edits);
  expect(r.status, r.err).toBe(0);
  expect(r.data, "the run published no result block").not.toBeNull();
  RUNS.set(key, r.data!);
  return r.data!;
}
const stagesOf = (m: SyngasMove) =>
  (m.stages ?? BENCH_STAGES[m.bench].map((_, i) => i)).map((i) => BENCH_STAGES[m.bench][i]!);

describe("syngas: every guided move, run by the native engine", () => {
  for (const m of UNIQUE)
    it(`${m.bench} / ${m.id}: every number its sentence quotes`, () => {
      const d = run(m);
      const st = stagesOf(m);
      const text = prose(m.expect);
      expect(m.quotes.length, "a guided move quotes the engine at least once").toBeGreaterThan(0);
      for (const q of m.quotes) {
        const native = fmtReadout(q.id, readout(d, st[q.stage]!, q.id));
        const quoted = fmtReadout(q.id, q.value);
        expect(native, `${m.id}: ${q.id} of ${st[q.stage]!.label}`).toBe(quoted);
        expect(text, `${m.id}: the sentence prints ${quoted}`).toContain(quoted);
      }
    }, 60_000);
});

// ---- the claims the lesson makes about those runs ----------------------------------------

const all = prose(SYNGAS_STEPS.map((s) =>
  `${s.title} ${s.body} ${s.note ?? ""} ${s.leadsTo?.body ?? ""}`).join(" "));

describe("syngas: what the lesson says the runs show", () => {
  it("the steam reformer's module is 3.000 on every guided move of parts 1, 2 and 4", () => {
    let n = 0;
    for (const { part, m } of ALL) {
      if (!["reformer", "routes", "pressure", "shift"].includes(part)) continue;
      if (m.bench !== "shift" && !(m.bench === "reformer" && (m.stages ?? [0])[0] === 0)) continue;
      const d = run(m);
      for (const s of stagesOf(m)) { expect(fmtReadout("M", readout(d, s, "M")), `${m.id} ${s.label}`).toBe("3.000"); n++; }
    }
    expect(n).toBeGreaterThanOrEqual(10);
    expect(all).toContain("reads 3.000 on every guided move of parts 1, 2 and 4");
  }, 120_000);
  it("one shift stage at 480 K gives exactly the two stages' outlet", () => {
    const two = run(START.shift);
    const one = run(MOVES.shift.find((m) => m.id === "one-stage")!);
    const co2 = readout(two, BENCH_STAGES.shift[2]!, "CO_kmol_h");
    const co1 = readout(one, BENCH_STAGES.shift[1]!, "CO_kmol_h");
    expect(Math.abs(co1 - co2) / co2).toBeLessThan(1e-9);
    expect(all).toContain("EXACTLY the outlet of the two stages, to the last digit");
  }, 60_000);
  it("the reverse shift runs backwards: its extent is negative, and K is near one", () => {
    const d = run(START.future);
    const k = d.kpis.reformer!;
    expect(k.extent_wgs_kmol_h).toBeLessThan(0);
    expect(k.Kp_wgs).toBeGreaterThan(0.9);
    expect(k.Kp_wgs).toBeLessThan(1.1);
    expect(all).toContain("its constant is near one and the extent comes out negative");
  }, 60_000);
  it("the steam reformer's H2/CO and the reverse shift's numbers the steps quote", () => {
    expect(fmtReadout("H2_CO", readout(run(START.routes), BENCH_STAGES.reformer[0]!, "H2_CO"))).toBe("5.74");
    expect(all).toContain("reads 5.74");
    const r = run(START.future);
    expect(fmtReadout("M", readout(r, BENCH_STAGES.rwgs[0]!, "M"))).toBe("2.000");
    expect(fmtReadout("H2_CO", readout(r, BENCH_STAGES.rwgs[0]!, "H2_CO"))).toBe("2.98");
    expect(all).toContain("the module reads 2.000");
    expect(all).toContain("H2/CO is 2.98");
  }, 60_000);
  it("the module of ATR is three minus twice the oxygen per carbon, as step 11 derives", () => {
    const atr = MOVES.routes.find((m) => m.id === "atr")!;
    const d = run(atr);
    //  2 CH4, 1.2 O2: a = 1, o = 0.6 per carbon; the methane is converted.
    expect(readout(d, BENCH_STAGES.oxidation[0]!, "M")).toBeCloseTo(3 - 2 * 0.6, 3);
  }, 60_000);
  it("the pressures step 6 names are the ones the corpus cases declare", () => {
    expect(tree("tutorials/steady/reactors/screen01_methanol_routes/0/feedSyngas")).toMatch(/^P\s+50 bar;/m);
    expect(tree("tutorials/plant/ammoniaRoutes01_screening/0/feedSynthesis150")).toMatch(/^P\s+150 bar;/m);
    expect(all).toContain("0/feedSyngas (P 50 bar)");
    expect(all).toContain("0/feedSynthesis150 (P 150 bar)");
  });
  it("the oxidation bench's feed is the partial-oxidation feed, as step 4 relies on", () => {
    const f = tree("tutorials/steady/reactors/screen01_methanol_routes/0/feedMethane");
    expect(f).toMatch(/CH4\s+2\.0 kmol\/h;/);
    expect(f).toMatch(/O2\s+1\.0 kmol\/h;/);
    expect(f).toMatch(/^T\s+525 K;/m);
  });
});

// ---- the lesson text ---------------------------------------------------------------------

describe("syngas: the lesson text", () => {
  const moveText = prose(UNIQUE.map((m) => m.expect).join(" "));
  it("quotes nothing", () => {
    expect(all).not.toMatch(/["“”]/);
    expect(moveText).not.toMatch(/["“”]/);
    for (const l of SYNGAS_LIMITS) expect(`${l.title} ${l.body}`).not.toMatch(/["“”]/);
  });
  it("every equation parses", () => {
    for (const s of SYNGAS_STEPS) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq), `step ${s.n} derivation`).toBe(true);
      for (const g of s.where ?? []) expect(texParses(g.sym), `step ${s.n} ${g.sym}`).toBe(true);
    }
  });
  it("names gasification as told, not run, and the reason is the engine's own refusal", () => {
    expect(all).toContain("Gasification is told here, not run");
    expect(tree("src/unitOperations/reactor/EquilibriumReactor.cpp"))
      .toContain("a solid in the feed is not implemented");
  });
  it("every file:line it cites lands on what it claims", () => {
    const FILES: Record<string, string> = {
      "GibbsReactor.cpp": "src/unitOperations/reactor/GibbsReactor.cpp",
      "GibbsSolidPhase.cpp": "src/unitOperations/reactor/gibbsMethod/GibbsSolidPhase.cpp",
      "EquilibriumReactor.cpp": "src/unitOperations/reactor/EquilibriumReactor.cpp",
      "PSA.cpp": "src/unitOperations/separation/PSA.cpp",
    };
    const cited = new Set([...all.matchAll(/([A-Za-z]+\.cpp):(\d+)(?:-(\d+))?/g)].map((m) => m[0]));
    const CLAIMS: Record<string, string | RegExp> = {
      "GibbsReactor.cpp:180": 'const scalar P         = operDict->lookupScalar("P", Dims::pressure);',
      "GibbsReactor.cpp:181-184": /lookupWordOrDefault\("mode", "isothermal"\);[\s\S]*mode != "isothermal" && mode != "adiabatic"[\s\S]*unknown mode/,
      "GibbsReactor.cpp:225-228": /lookupWordList\("elements"\);[\s\S]*lookupDictList\("species"\);/,
      "GibbsReactor.cpp:508": "return enthalpy(e, Tt) - H_in - Q_J_s;",
      "GibbsReactor.cpp:732": 'kpis_["Q_kW"] = H_out_kW - H_in_kW;',
      "GibbsSolidPhase.cpp:102-107": /scalar lnActivity\([\s\S]*scalar a = -g_over_RT;[\s\S]*a \+= e\.pi\[k\] \* p\.A\[k\]\[s\];[\s\S]*return a;/,
      "GibbsSolidPhase.cpp:231": "if (v.lnActivityWithout > pureSolidPhase::kLnActivityAppears)",
      "EquilibriumReactor.cpp:61": 'const scalar P      = feedDict->lookupScalar("P", Dims::pressure);',
      "EquilibriumReactor.cpp:62": 'const scalar T      = operDict->lookupScalarOrDefault("T", T_feed);   // isothermal',
      "EquilibriumReactor.cpp:85-89": /if \(n0\[i\] > 0\.0\)\s*throw std::runtime_error\("equilibriumReactor: the feed carries pure"[\s\S]*a solid in the feed is not implemented/,
      "EquilibriumReactor.cpp:103": 'auto rxnList = dict->lookupDictList("reactions");',
      "EquilibriumReactor.cpp:119": "pureSolidPhase::reactionEquilibrium(thermo, nu[j], T);   // Kp from dG°(T)",
      "EquilibriumReactor.cpp:198": "g_j = Sum_i nu_ij (x_i - ln n_tot + ln P/P0) - ln Kp_j  = 0",
      "EquilibriumReactor.cpp:1058": 'if (haveDuty) kpis_["Q_kW"] = Q_W / 1000.0;',
      "PSA.cpp:196": "Dq[i] = std::max<scalar>(0.0, eta * (q_high[i] - q_low[i]));",
      "PSA.cpp:205-206": /capacity = Dq\[i\] \* w \* F_in;[\s\S]*S\[i\] = std::min\(capacity, avail\);/,
      "PSA.cpp:225": "const scalar G = gamma * F_in;",
      "PSA.cpp:248": "nR[i]  = std::max<scalar>(0.0, z_in[i] * F_in - S[i] - G * x_R[i]);",
      "PSA.cpp:314-315": /kpis_\["recovery_" \+ lightKey\] = [\s\S]*kpis_\["purity_"   \+ lightKey\] = /,
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
